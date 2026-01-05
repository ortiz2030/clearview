/**
 * Content Script for Twitter/X (Refactored)
 * Performance optimizations:
 * - Lazy initialization (waits for feed visibility)
 * - Efficient DOM queries with compound selectors
 * - Throttled mutation observation
 * - Memory-safe event handling
 */

// ============================================================================
// Logger (Inline to avoid module issues)
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
    const style = `color: ${{'INFO':'#0ea5e9','DEBUG':'#6b7280','WARN':'#f59e0b','ERROR':'#ef4444','SUCCESS':'#10b981'}[level]}; font-weight: bold`;
    console.log(`%c[${level}]`, style, event, data);
  },
  
  getStats() {
    const stats = { total: this.logs.length, blocked: 0, allowed: 0, cached: 0, errors: 0 };
    this.logs.forEach(log => {
      if (log.data.classification === 'BLOCK') stats.blocked++;
      if (log.data.classification === 'ALLOW') stats.allowed++;
      if (log.event.includes('Cache')) stats.cached++;
      if (log.level === 'ERROR') stats.errors++;
    });
    return stats;
  },
};

// Make logger accessible in console for debugging
window.CLEARVIEW_LOGS = LOGGER;

// ============================================================================
// Constants (inlined to avoid module issues in MV3)
// ============================================================================

const CONFIG = Object.freeze({
  // API Configuration
  API_ENDPOINT: 'https://api.example.com/classify',
  API_TIMEOUT_MS: 10000,
  
  // Rate limiting
  RATE_LIMIT_PER_MINUTE: 60,
  RATE_LIMIT_RESET_MS: 60000,
  
  // Caching strategy
  CACHE_TTL_MS: 1000 * 60 * 60, // 1 hour
  CACHE_MAX_SIZE: 1000, // LRU limit
  
  // Batching optimization
  BATCH_SIZE: 10,
  BATCH_WAIT_MS: 5000,
  BATCH_MAX_RETRIES: 3,
  BATCH_BACKOFF_MULTIPLIER: 2,
  
  // DOM selectors (Twitter/X specific)
  POST_SELECTOR: 'article[data-testid="tweet"]',
  TEXT_SELECTORS: [
    '[data-testid="tweetText"]',
    'div[lang]',
  ],
  
  // Performance tuning
  MUTATION_DEBOUNCE_MS: 250, // Reduced from 500 for faster response to scrolling
  OBSERVER_THROTTLE_MS: 100,
  OBSERVER_CONFIG: {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  },
});

const MESSAGES = Object.freeze({
  // Content script → Background
  CLASSIFY_CONTENT: 'classifyContent',
  SET_API_KEY: 'setApiKey',
  GET_QUOTA_INFO: 'getQuotaInfo',
  
  // Background → Content script
  PREFERENCES_UPDATED: 'preferencesUpdated',
  FILTERING_TOGGLED: 'filteringToggled',
  PREFERENCES_RESET: 'preferencesReset',
  QUOTA_UPDATED: 'quotaUpdated',
});

const DOM_ATTRIBUTES = Object.freeze({
  PROCESSED: 'data-processed',
  CLASSIFIED: 'data-classification',
  FILTERED: 'data-filtered',
});

const CLASSIFICATION = Object.freeze({
  ALLOW: 'ALLOW',
  BLOCK: 'BLOCK',
});

// ============================================================================
// State & Performance Tracking
// ============================================================================

const state = {
  initialized: false,
  filteringEnabled: true,
  userPreferences: '', // User's filter preferences
  processedHashes: new Set(),
  observer: null,
  mutationTimeout: null,
  periodicScanInterval: null, // Fallback periodic scan
  contextInvalidated: false, // Track if extension context is invalidated
};

// ============================================================================
// Extension Context Validation
// ============================================================================

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid() {
  // If we already know it's invalidated, return false immediately
  if (state.contextInvalidated) {
    return false;
  }
  
  try {
    const isValid = chrome.runtime && chrome.runtime.id !== undefined;
    if (!isValid && !state.contextInvalidated) {
      state.contextInvalidated = true;
    }
    return isValid;
  } catch (error) {
    if (!state.contextInvalidated) {
      state.contextInvalidated = true;
    }
    return false;
  }
}

// ============================================================================
// Preferences Management
// ============================================================================

/**
 * Load user preferences from storage
 */
async function loadPreferences() {
  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      LOGGER.log('WARN', 'Preferences Load Failed', { reason: 'Extension context invalidated' });
      return;
    }
    
    const result = await chrome.storage.sync.get(['userPreferences', 'filteringEnabled']);
    state.userPreferences = result.userPreferences || '';
    state.filteringEnabled = result.filteringEnabled !== false;
    LOGGER.log('INFO', 'Preferences Loaded', { 
      enabled: state.filteringEnabled,
      preferencesPreview: state.userPreferences.substring(0, 80) + (state.userPreferences.length > 80 ? '...' : '')
    });
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      LOGGER.log('WARN', 'Preferences Load Failed', { reason: 'Extension context invalidated' });
      return;
    }
    LOGGER.log('ERROR', 'Preferences Load Failed', { error: error.message });
  }
}

// ============================================================================
// Hashing (Fast, deterministic)
// ============================================================================

/**
 * FNV-1a 32-bit hash (fast, good distribution)
 */
function hashContent(content) {
  let hash = 0x811c9dc5;
  const fnvPrime = 0x01000193;
  
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = (hash * fnvPrime) >>> 0;
  }
  
  return hash.toString(16).padStart(8, '0');
}

// ============================================================================
// DOM Utilities (Optimized selectors)
// ============================================================================

/**
 * Extract post text efficiently
 */
function extractPostText(postElement) {
  for (const selector of CONFIG.TEXT_SELECTORS) {
    const textEl = postElement.querySelector(selector);
    if (textEl?.textContent) {
      const text = textEl.textContent.trim().replace(/\s+/g, ' ');
      return text.length >= 5 ? text : null;
    }
  }
  return null;
}

/**
 * Get unique post ID from tweet link
 */
function getPostId(postElement) {
  const link = postElement.querySelector('a[href*="/status/"]');
  if (link?.href) {
    const match = link.href.match(/\/status\/(\d+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Check if post is promoted/ad content
 */
function isPromotedContent(postElement) {
  return postElement.querySelector('[data-testid="promotedBadge"]') !== null ||
         postElement.textContent.toLowerCase().includes('promoted');
}

// ============================================================================
// Filtering (Blur overlay)
// ============================================================================

/**
 * Apply blur filter to post
 */
function blurPost(postElement) {
  if (!isNodeValid(postElement)) {
    return;
  }
  
  try {
    postElement.setAttribute(DOM_ATTRIBUTES.FILTERED, 'true');
    postElement.style.position = 'relative';
    
    // Check if overlay already exists
    const existingOverlay = postElement.querySelector('.cv-filter-overlay');
    if (existingOverlay) {
      return; // Already blurred
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'cv-filter-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-label', 'Content filtered');
    overlay.textContent = 'Content filtered';
    
    overlay.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    
    postElement.appendChild(overlay);
  } catch (error) {
    if (!error.message.includes('deferred') && !error.message.includes('resolved')) {
      console.warn('[BlurPost] Failed to apply blur:', error.message);
    }
  }
}

/**
 * Remove blur filter
 */
function unblurPost(postElement) {
  if (!isNodeValid(postElement)) {
    return;
  }
  
  try {
    postElement.setAttribute(DOM_ATTRIBUTES.FILTERED, 'false');
    const overlay = postElement.querySelector('.cv-filter-overlay');
    if (overlay && isNodeValid(overlay)) {
      overlay.remove();
    }
  } catch (error) {
    if (!error.message.includes('deferred') && !error.message.includes('resolved')) {
      console.warn('[UnblurPost] Failed to remove blur:', error.message);
    }
  }
}

// ============================================================================
// Classification & Communication
// ============================================================================

/**
 * Safely send message to background script with error handling
 */
function sendMessageSafely(message, callback) {
  // Early return if context is already known to be invalidated
  if (state.contextInvalidated) {
    return;
  }
  
  try {
    // Check if runtime is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      if (!state.contextInvalidated) {
        state.contextInvalidated = true;
        console.warn('[ClearView] Extension was reloaded. Please refresh the page to continue using ClearView.');
      }
      return;
    }
    
    chrome.runtime.sendMessage(message, (response) => {
      // Check for runtime errors (extension context invalidated, etc.)
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message;
        if (error.includes('Extension context invalidated') || 
            error.includes('message port closed') ||
            error.includes('Receiving end does not exist')) {
          if (!state.contextInvalidated) {
            state.contextInvalidated = true;
            console.warn('[ClearView] Extension was reloaded. Please refresh the page to continue using ClearView.');
          }
          return;
        }
        console.error('[Message Error]', error);
        return;
      }
      
      // Call callback if provided
      if (callback && typeof callback === 'function') {
        callback(response);
      }
    });
  } catch (error) {
    // Handle synchronous errors
    if (error.message.includes('Extension context invalidated')) {
      if (!state.contextInvalidated) {
        state.contextInvalidated = true;
        console.warn('[ClearView] Extension was reloaded. Please refresh the page to continue using ClearView.');
      }
      return;
    }
    console.error('[Message]', error.message);
  }
}

/**
 * Check if a DOM node is still valid and connected to the document
 */
function isNodeValid(node) {
  if (!node) return false;
  // Check if node is still in the DOM tree
  return node.isConnected !== false && document.contains(node);
}

/**
 * Find post element by hash or post ID
 */
function findPostElement(hash, postId) {
  // Try to find by data attribute first
  const posts = document.querySelectorAll(CONFIG.POST_SELECTOR);
  for (const post of posts) {
    const currentPostId = getPostId(post);
    if (currentPostId === postId) {
      const currentText = extractPostText(post);
      if (currentText) {
        const currentHash = hashContent(currentPostId + currentText);
        if (currentHash === hash) {
          return post;
        }
      }
    }
  }
  return null;
}

/**
 * Classify post and apply filter
 */
async function classifyPost(postElement) {
  // Skip if context is invalidated
  if (state.contextInvalidated) {
    return;
  }
  
  // Validate node before processing
  if (!isNodeValid(postElement)) {
    return;
  }
  
  try {
    const postId = getPostId(postElement);
    const text = extractPostText(postElement);
    
    if (!postId || !text) return;
    
    const hash = hashContent(postId + text);
    
    // Skip if already processed
    if (state.processedHashes.has(hash)) return;
    state.processedHashes.add(hash);
    
    // Log post detection
    LOGGER.log('DEBUG', 'Post Detected', { 
      postId, 
      textLength: text.length,
      textPreview: text.substring(0, 80) + (text.length > 80 ? '...' : '')
    });
    
    // Request classification with safe message sending
    sendMessageSafely(
      {
        action: MESSAGES.CLASSIFY_CONTENT,
        content: text,
        hash,
        preferences: state.userPreferences, // Include user preferences
      },
      (response) => {
        if (!response?.success) return;
        
        // Backend returns { label: 'ALLOW' | 'BLOCK' }
        const classification = response.result?.label || response.result?.classification || CLASSIFICATION.ALLOW;
        
        // Log classification result
        LOGGER.log('INFO', 'Post Classified', { 
          classification,
          hash: hash.substring(0, 8),
          hasPreferences: !!state.userPreferences
        });
        
        // Re-find the element in case it was removed and re-added
        let element = postElement;
        if (!isNodeValid(element)) {
          // Try to find the element again by hash/postId
          element = findPostElement(hash, postId);
          if (!element) {
            // Element no longer exists, skip
            LOGGER.log('DEBUG', 'Post Element Removed from DOM', { hash: hash.substring(0, 8) });
            return;
          }
        }
        
        // Apply classification
        try {
          if (classification === CLASSIFICATION.BLOCK && state.filteringEnabled) {
            blurPost(element);
            LOGGER.log('SUCCESS', 'Post Blurred', { hash: hash.substring(0, 8) });
          } else {
            unblurPost(element);
            LOGGER.log('SUCCESS', 'Post Allowed', { hash: hash.substring(0, 8) });
          }
          
          element.setAttribute(DOM_ATTRIBUTES.CLASSIFIED, classification);
        } catch (domError) {
          // Handle DOM errors gracefully
          if (!domError.message.includes('deferred') && !domError.message.includes('resolved')) {
            LOGGER.log('ERROR', 'DOM Operation Failed', { error: domError.message });
          }
        }
      }
    );
  } catch (error) {
    // Only log if it's not a context invalidated error
    if (!error.message.includes('Extension context invalidated') && 
        !error.message.includes('deferred') &&
        !error.message.includes('resolved')) {
      LOGGER.log('ERROR', 'Classification Error', { error: error.message });
    }
  }
}

// ============================================================================
// DOM Observer (Throttled)
// ============================================================================

/**
 * Process all unprocessed posts
 */
function processPosts() {
  try {
    const posts = document.querySelectorAll(CONFIG.POST_SELECTOR);
    let unprocessedCount = 0;
    
    posts.forEach(post => {
      // Validate node before processing
      if (!isNodeValid(post)) {
        return;
      }
      
      if (post.getAttribute(DOM_ATTRIBUTES.PROCESSED) === 'true') return;
      if (isPromotedContent(post)) {
        post.setAttribute(DOM_ATTRIBUTES.PROCESSED, 'true');
        return;
      }
      
      unprocessedCount++;
      post.setAttribute(DOM_ATTRIBUTES.PROCESSED, 'true');
      classifyPost(post);
    });
    
    if (unprocessedCount > 0) {
      LOGGER.log('DEBUG', 'Posts Processing Scan', { 
        totalInDOM: posts.length,
        newPosts: unprocessedCount
      });
    }
  } catch (error) {
    if (!error.message.includes('deferred') && !error.message.includes('resolved')) {
      LOGGER.log('ERROR', 'Post Processing Error', { error: error.message });
    }
  }
}

/**
 * Debounced mutation handler
 */
function onMutation() {
  if (state.mutationTimeout) clearTimeout(state.mutationTimeout);
  state.mutationTimeout = setTimeout(() => {
    LOGGER.log('DEBUG', 'Mutation Detected', { timestamp: new Date().toISOString() });
    processPosts();
  }, CONFIG.MUTATION_DEBOUNCE_MS);
}

/**
 * Initialize MutationObserver
 */
function initObserver() {
  try {
    // Observe feed container (more efficient than body)
    // Twitter/X has multiple possible selectors for the feed
    let feedTarget = document.querySelector('[aria-label="Home timeline"]') || 
                     document.querySelector('[aria-label="Timeline"]') ||
                     document.querySelector('div[role="main"]') ||
                     document.body;
    
    state.observer = new MutationObserver(onMutation);
    state.observer.observe(feedTarget, CONFIG.OBSERVER_CONFIG);
    
    LOGGER.log('INFO', 'Observer Initialized', { 
      target: feedTarget.className || feedTarget.tagName,
      ariaLabel: feedTarget.getAttribute('aria-label') || 'none'
    });
    
    // Also set up a periodic scan as fallback (every 3 seconds)
    // This catches posts that might be added outside of mutations
    if (!state.periodicScanInterval) {
      state.periodicScanInterval = setInterval(() => {
        processPosts();
      }, 3000); // Scan every 3 seconds
      LOGGER.log('DEBUG', 'Periodic Post Scanner Started', { intervalMs: 3000 });
    }
  } catch (error) {
    LOGGER.log('ERROR', 'Observer Initialization Failed', { error: error.message });
  }
}

// ============================================================================
// Styling (Injected)
// ============================================================================

/**
 * Inject CSS styles
 */
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Content filter overlay */
    .cv-filter-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.8);
      border-radius: 16px;
      cursor: pointer;
      z-index: 1000;
      user-select: none;
    }
    
    .cv-filter-overlay:hover {
      background: rgba(0, 0, 0, 0.3);
    }
    
    /* ClearView status badge */
    #clearview-status-badge {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: none;
    }
    
    .clearview-badge-content {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      color: rgb(59, 130, 246);
      backdrop-filter: blur(10px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .clearview-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: rgb(34, 197, 94);
      border-radius: 50%;
      animation: clearview-pulse 2s infinite;
    }
    
    @keyframes clearview-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .clearview-text {
      letter-spacing: 0.3px;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// Lifecycle & Messaging
// ============================================================================

/**
 * Listen for preference changes from popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    // Check if runtime is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      console.warn('[Message Listener] Extension context invalidated');
      return false;
    }
    
    switch (request.action) {
      case MESSAGES.PREFERENCES_UPDATED:
      case MESSAGES.FILTERING_TOGGLED:
      case MESSAGES.PREFERENCES_RESET:
        state.filteringEnabled = request.enabled !== false;
        state.userPreferences = request.preferences || '';
        LOGGER.log('INFO', 'Preferences Updated', { 
          enabled: state.filteringEnabled,
          preferencesPreview: state.userPreferences.substring(0, 60) + (state.userPreferences.length > 60 ? '...' : '')
        });
        processPosts(); // Reprocess with new settings
        sendResponse({ success: true });
        break;
    }
    
    return true; // Keep channel open for async response
  } catch (error) {
    if (!error.message.includes('Extension context invalidated')) {
      LOGGER.log('ERROR', 'Message Handler Error', { error: error.message });
    }
    return false;
  }
});

/**
 * Inject status badge in top-right corner
 */
function injectStatusBadge() {
  // Avoid duplicate badges
  if (document.getElementById('clearview-status-badge')) return;
  
  const badge = document.createElement('div');
  badge.id = 'clearview-status-badge';
  badge.innerHTML = `
    <div class="clearview-badge-content">
      <span class="clearview-dot"></span>
      <span class="clearview-text">ClearView</span>
    </div>
  `;
  
  // Insert at the very end (after other page elements)
  document.body.appendChild(badge);
}

/**
 * Initialize content script
 */
async function init() {
  try {
    if (state.initialized) return;
    
    // Check if extension context is valid before initializing
    if (!isExtensionContextValid()) {
      console.warn('[Init] Extension context invalidated, skipping initialization');
      return;
    }
    
    state.initialized = true;
    
    // Load preferences before processing
    await loadPreferences();
    
    injectStyles();
    injectStatusBadge();
    processPosts();
    initObserver();
    
    // Add scroll listener to catch posts dynamically loaded during scrolling
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      // Debounce scroll events to avoid excessive processing
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        processPosts();
      }, 300);
    }, { passive: true });
    
    LOGGER.log('INFO', 'Content Script Initialized', { 
      filteringEnabled: state.filteringEnabled,
      preferencesSet: !!state.userPreferences
    });
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      LOGGER.log('WARN', 'Initialization Failed', { reason: 'Extension context invalidated' });
      state.initialized = false; // Allow retry
      return;
    }
    LOGGER.log('ERROR', 'Initialization Failed', { error: error.message });
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


// Cleanup on unload
window.addEventListener('unload', () => {
  state.observer?.disconnect();
  clearTimeout(state.mutationTimeout);
});

// ============================================================================
// Debug/Test Functions (exposed to console)
// ============================================================================

/**
 * Test backend connectivity from content script
 */
window.CLEARVIEW_TEST_BACKEND = async function() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'TEST_BACKEND' },
      (response) => {
        if (response?.success) {
          LOGGER.log('INFO', 'Backend Test Result', response.result);
          resolve(response.result);
        } else {
          LOGGER.log('ERROR', 'Backend Test Failed', { error: response?.error });
          resolve({ healthy: false, error: response?.error });
        }
      }
    );
  });
};

/**
 * Get current filtering stats
 */
window.CLEARVIEW_GET_STATS = function() {
  const stats = LOGGER.getStats();
  console.table(stats);
  return stats;
};

/**
 * Get all recent logs
 */
window.CLEARVIEW_GET_LOGS = function(count = 20) {
  const logs = LOGGER.logs.slice(-count);
  console.table(logs.map(log => ({
    time: log.timestamp.split('T')[1],
    level: log.level,
    event: log.event,
    details: JSON.stringify(log.data)
  })));
  return logs;
};

/**
 * Filter logs by event
 */
window.CLEARVIEW_FILTER_LOGS = function(eventName) {
  const filtered = LOGGER.logs.filter(log => log.event.includes(eventName));
  console.table(filtered.map(log => ({
    time: log.timestamp.split('T')[1],
    level: log.level,
    event: log.event,
    details: JSON.stringify(log.data)
  })));
  return filtered;
};

// ============================================================================
