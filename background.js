/**
 * Chrome MV3 Background Service Worker (Refactored)
 * Performance optimizations:
 * - LRU cache with max size limits
 * - Efficient batch processing with backpressure
 * - Rate limiting with sliding window
 * - Memory management to prevent leaks
 * - Anonymous token initialization and refresh
 */

import { CONFIG, MESSAGES, STORAGE_KEYS, CLASSIFICATION } from './constants.js';

// ============================================================================
// Logger
// ============================================================================

const LOGGER = {
  logs: [],
  MAX_LOGS: 500,

  log(level, event, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      data,
    };
    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) this.logs.shift();
  },

  getStats() {
    const stats = { total: this.logs.length, classified: 0, cached: 0, errors: 0, batches: 0 };
    this.logs.forEach(log => {
      if (log.data.count) stats.batches++;
      if (log.event === 'Cache Hit') stats.cached++;
      if (log.level === 'ERROR') stats.errors++;
      if (log.event === 'Post Classified') stats.classified++;
    });
    return stats;
  },
};

// ============================================================================

// Production backend URL (Vercel deployment)
const BACKEND_URL = 'https://clearview-xi.vercel.app';

// ============================================================================
// State Management
// ============================================================================

const state = {
  // Auth token and user ID
  token: null,
  userId: null,
  tokenInitialized: false,
  tokenRefreshInProgress: false,

  // Rate limiting with sliding window
  rateLimitBucket: { count: 0, resetTime: Date.now() + CONFIG.RATE_LIMIT_RESET_MS },

  // LRU cache for efficient memory usage
  cache: new Map(),
  cacheAccessOrder: [],

  // Batch queue management
  batch: { queue: [], timeout: null },

  // Request inflight tracking (prevents duplicates)
  inflightRequests: new Map(),
};

// ============================================================================
// Authentication - Token Management
// ============================================================================

/**
 * Initialize authentication token on first run
 */
async function initializeToken() {
  if (state.tokenInitialized) return;

  // Try to load existing token from storage
  const stored = await chrome.storage.sync.get([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER_ID]);

  if (stored[STORAGE_KEYS.AUTH_TOKEN]) {
    state.token = stored[STORAGE_KEYS.AUTH_TOKEN];
    state.userId = stored[STORAGE_KEYS.USER_ID];
    state.tokenInitialized = true;
    console.debug('[Auth] Token loaded from storage');
    return;
  }

  // Request new token from backend
  try {
    await requestNewToken();
  } catch (error) {
    console.error('[Auth] Failed to get token:', error.message);
    // Allow offline mode: use local classification
  }

  state.tokenInitialized = true;
}

/**
 * Request new anonymous token from backend
 */
async function requestNewToken() {
  console.debug('[Auth] Requesting new token from backend');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

  try {
    const response = await fetch(`${BACKEND_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.token || !data.userId) {
      throw new Error('Invalid auth response: missing token or userId');
    }

    // Store token
    state.token = data.token;
    state.userId = data.userId;

    await chrome.storage.sync.set({
      [STORAGE_KEYS.AUTH_TOKEN]: data.token,
      [STORAGE_KEYS.USER_ID]: data.userId,
      [STORAGE_KEYS.TOKEN_ISSUED_AT]: Date.now(),
    });

    console.debug('[Auth] Token issued:', data.userId);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Get valid auth token, requesting new one if needed
 */
async function getAuthToken() {
  if (!state.token) {
    await initializeToken();
  }

  if (!state.token) {
    throw new Error('No authentication token available');
  }

  return state.token;
}

// ============================================================================
// Cache Management (LRU)
// ============================================================================

/**
 * Get cached result with LRU tracking
 */
function getCached(hash) {
  const entry = state.cache.get(hash);
  if (!entry) return null;

  // Check expiration
  if (Date.now() - entry.timestamp > CONFIG.CACHE_TTL_MS) {
    state.cache.delete(hash);
    return null;
  }

  // Update LRU order
  const idx = state.cacheAccessOrder.indexOf(hash);
  if (idx > -1) state.cacheAccessOrder.splice(idx, 1);
  state.cacheAccessOrder.push(hash);

  LOGGER.log('DEBUG', 'Cache Hit', {
    hash: hash.substring(0, 8),
    cacheSize: state.cache.size
  });

  return entry.result;
}

/**
 * Set cache with LRU eviction
 */
function setCached(hash, result) {
  // Evict oldest if at capacity
  if (state.cache.size >= CONFIG.CACHE_MAX_SIZE) {
    const oldestHash = state.cacheAccessOrder.shift();
    state.cache.delete(oldestHash);
    LOGGER.log('DEBUG', 'Cache Evicted LRU Entry', { hash: oldestHash.substring(0, 8) });
  }

  state.cache.set(hash, { result, timestamp: Date.now() });
  state.cacheAccessOrder.push(hash);
}

// ============================================================================
// Rate Limiting (Sliding Window)
// ============================================================================

/**
 * Check and enforce rate limit
 */
function checkRateLimit() {
  const now = Date.now();

  if (now >= state.rateLimitBucket.resetTime) {
    state.rateLimitBucket = { count: 0, resetTime: now + CONFIG.RATE_LIMIT_RESET_MS };
  }

  const isLimited = state.rateLimitBucket.count >= CONFIG.RATE_LIMIT_PER_MINUTE;
  if (!isLimited) state.rateLimitBucket.count++;

  return isLimited;
}

// ============================================================================
// Network Layer (Fetch with Timeout)
// ============================================================================

/**
 * Fetch with timeout and retry logic
 */
async function fetchWithTimeout(url, options, attempt = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    // Retry with exponential backoff
    if (attempt < CONFIG.BATCH_MAX_RETRIES) {
      const backoff = Math.pow(CONFIG.BATCH_BACKOFF_MULTIPLIER, attempt) * 1000;
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithTimeout(url, options, attempt + 1);
    }

    throw error;
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process accumulated batch efficiently
 */
async function processBatch() {
  if (state.batch.queue.length === 0) return;

  const batch = state.batch.queue.splice(0, CONFIG.BATCH_SIZE);
  const startTime = Date.now();

  LOGGER.log('INFO', 'Batch Processing Started', {
    count: batch.length,
    totalQueued: state.batch.queue.length
  });

  try {
    // Get auth token (initialize if needed)
    const token = await getAuthToken();

    // Get preference from first request (all posts in batch use same preference)
    const preference = batch[0]?.preferences || 'Filter harmful, explicit, and abusive content';

    LOGGER.log('DEBUG', 'Batch Config', {
      count: batch.length,
      preference: preference.substring(0, 60) + (preference.length > 60 ? '...' : '')
    });

    // Send batch request with user preferences
    const payload = {
      posts: batch.map(req => ({
        hash: req.hash,
        content: req.content,
      })),
      preference: preference, // Send preference at top level (backend expects this)
      timestamp: Date.now(),
    };

    const result = await fetchWithTimeout(`${BACKEND_URL}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    // Process results
    if (!Array.isArray(result.classifications)) {
      throw new Error('Invalid API response');
    }

    const duration = Date.now() - startTime;
    let blockCount = 0;
    let allowCount = 0;

    batch.forEach((req, idx) => {
      const classification = result.classifications[idx] || { label: CLASSIFICATION.ALLOW };
      setCached(req.hash, classification);
      state.inflightRequests.delete(req.hash);
      req.resolve({ success: true, result: classification });

      if (classification.label === 'BLOCK') blockCount++;
      if (classification.label === 'ALLOW') allowCount++;
    });

    LOGGER.log('SUCCESS', 'Batch Processed', {
      count: batch.length,
      blocked: blockCount,
      allowed: allowCount,
      durationMs: duration
    });
  } catch (error) {
    LOGGER.log('ERROR', 'Batch Processing Failed', {
      error: error.message,
      errorType: error.constructor.name,
      count: batch.length,
      durationMs: Date.now() - startTime,
      backendUrl: BACKEND_URL
    });

    // Graceful failure: allow all on error
    batch.forEach(req => {
      state.inflightRequests.delete(req.hash);
      req.resolve({
        success: false,
        result: { label: CLASSIFICATION.ALLOW, failedOpen: true },
      });
    });
  }

  // Process remaining queue if any
  if (state.batch.queue.length > 0) {
    state.batch.timeout = setTimeout(processBatch, CONFIG.OBSERVER_THROTTLE_MS);
  }
}

/**
 * Queue request for batch processing
 */
function queueRequest(hash, content, preferences = '') {
  // Prevent duplicate inflight requests
  if (state.inflightRequests.has(hash)) {
    LOGGER.log('DEBUG', 'Duplicate Request Skipped', { hash: hash.substring(0, 8) });
    return state.inflightRequests.get(hash);
  }

  LOGGER.log('DEBUG', 'Request Queued', {
    hash: hash.substring(0, 8),
    contentLength: content.length,
    hasPreferences: !!preferences
  });

  return new Promise((resolve) => {
    state.batch.queue.push({ hash, content, preferences, resolve });

    // Clear existing timeout
    if (state.batch.timeout) clearTimeout(state.batch.timeout);

    // Trigger batch if full
    if (state.batch.queue.length >= CONFIG.BATCH_SIZE) {
      processBatch();
    } else {
      state.batch.timeout = setTimeout(processBatch, CONFIG.BATCH_WAIT_MS);
    }
  });
}

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Verify sender is from our extension (security)
  if (sender.url && !sender.url.startsWith('chrome-extension://')) {
    console.warn('[Security] Message from untrusted origin');
    return false;
  }

  const { action, content, hash, apiKey } = request;

  switch (action) {
    case MESSAGES.CLASSIFY_CONTENT: {
      // Async handler: initialize token before processing
      (async () => {
        try {
          // Ensure token is initialized
          await getAuthToken();

          const { content, hash, preferences } = request;

          if (checkRateLimit()) {
            LOGGER.log('WARN', 'Rate Limit Exceeded', { hash: hash.substring(0, 8) });
            sendResponse({
              success: false,
              error: 'Rate limited',
              retryAfterMs: CONFIG.RATE_LIMIT_RESET_MS,
            });
            return;
          }

          // Check cache first
          const cached = getCached(hash);
          if (cached) {
            LOGGER.log('DEBUG', 'Cache Hit', { hash: hash.substring(0, 8), result: cached.label });
            sendResponse({ success: true, result: cached });
            return;
          }

          // Queue for batch processing with preferences
          const result = await queueRequest(hash, content, preferences);
          LOGGER.log('INFO', 'Classification Result', {
            hash: hash.substring(0, 8),
            classification: result.result?.label,
            hasPreferences: !!preferences
          });
          sendResponse({ success: true, result });
        } catch (error) {
          LOGGER.log('ERROR', 'Classification Error', { error: error.message });
          sendResponse({
            success: false,
            error: error.message,
            failedOpen: true, // Allow client to fail-open if offline
          });
        }
      })();

      return true; // Indicate async response
    }

    case MESSAGES.SET_API_KEY: {
      chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: apiKey });
      sendResponse({ success: true });
      return true;
    }

    case MESSAGES.GET_QUOTA_INFO: {
      chrome.storage.sync.get([STORAGE_KEYS.QUOTA_USED, STORAGE_KEYS.DAILY_QUOTA], result => {
        sendResponse({
          quotaUsed: result[STORAGE_KEYS.QUOTA_USED] || 0,
          dailyQuota: result[STORAGE_KEYS.DAILY_QUOTA] || 100,
        });
      });
      return true;
    }

    default:
      return false;
  }
});

// ============================================================================
// Service Worker Lifecycle Management
// ============================================================================

/**
 * Keep service worker alive with periodic activity
 * Chrome terminates service workers after ~30s of inactivity
 */
function keepAlive() {
  // Periodic activity to prevent termination
  // Using chrome.storage API which is lightweight
  chrome.storage.local.get(['keepAlive'], () => {
    // This keeps the service worker active
  });

  // Schedule next keep-alive (every 20 seconds to stay under 30s limit)
  setTimeout(keepAlive, 20 * 1000);
}

/**
 * Restore state from storage on service worker wake-up
 */
async function restoreState() {
  try {
    // Restore token from storage
    const stored = await chrome.storage.sync.get([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.USER_ID,
    ]);

    if (stored[STORAGE_KEYS.AUTH_TOKEN]) {
      state.token = stored[STORAGE_KEYS.AUTH_TOKEN];
      state.userId = stored[STORAGE_KEYS.USER_ID];
      state.tokenInitialized = true;
      console.debug('[Lifecycle] State restored from storage');
    }
  } catch (error) {
    console.error('[Lifecycle] Failed to restore state:', error.message);
  }
}

/**
 * Save critical state before service worker termination
 */
function saveState() {
  // State is already persisted in chrome.storage during operations
  // This is just a hook for any additional cleanup if needed
  console.debug('[Lifecycle] Service worker preparing for termination');
}

// ============================================================================
// Lifecycle Event Handlers
// ============================================================================

// Handle service worker installation/activation
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Lifecycle] Extension installed/updated');
  await restoreState();
  await initializeToken();
});

// Handle service worker startup (wake-up)
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Lifecycle] Service worker started');
  await restoreState();
});

// ============================================================================
// Lifecycle
// ============================================================================

// Initialize on service worker load
(async () => {
  console.log('[Init] ClearView background service worker ready');

  // Restore state from storage
  await restoreState();

  // Initialize token if needed
  await initializeToken();

  // Start keep-alive mechanism
  keepAlive();
})();

// ============================================================================
// Debug/Test Functions (exposed via chrome.runtime)
// ============================================================================

/**
 * Test backend connectivity - call from service worker scope
 */
async function testBackendHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'health-check-' + Date.now() }),
    });

    const data = await response.json();
    LOGGER.log('INFO', 'Backend Health Check', {
      status: response.status,
      hasToken: !!data.token,
      hasUserId: !!data.userId,
      backendUrl: BACKEND_URL
    });
    return { healthy: response.ok, status: response.status, data };
  } catch (error) {
    LOGGER.log('ERROR', 'Backend Health Check Failed', {
      error: error.message,
      backendUrl: BACKEND_URL
    });
    return { healthy: false, error: error.message };
  }
}

// Handle test requests from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TEST_BACKEND') {
    testBackendHealth().then(result => {
      sendResponse({ success: true, result });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
});
