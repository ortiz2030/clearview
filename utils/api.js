/**
 * Backend API communication helper
 * Handles batched requests, timeouts, and graceful failure
 */

/**
 * Configuration for API communication
 */
const API_CONFIG = {
  ENDPOINT: 'http://localhost:3000/classify', // Update with actual endpoint after deployment
  TIMEOUT_MS: 10000, // 10 second timeout
  RETRY_ATTEMPTS: 3,
  RETRY_BACKOFF_MS: 2000,
  BATCH_SIZE: 25,
};

/**
 * Request queue for batching
 */
let requestQueue = [];
let batchTimer = null;

/**
 * Custom timeout wrapper for fetch
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    API_CONFIG.TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${API_CONFIG.TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

/**
 * Retry logic with exponential backoff
 */
async function fetchWithRetry(url, options = {}, attempt = 1) {
  try {
    const response = await fetchWithTimeout(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (attempt < API_CONFIG.RETRY_ATTEMPTS) {
      const backoffMs = API_CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(`Retry attempt ${attempt} after ${backoffMs}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return fetchWithRetry(url, options, attempt + 1);
    }

    throw error;
  }
}

/**
 * Send batch of posts to API
 * Returns map of hash -> classification result
 */
async function sendBatch(posts) {
  if (!posts || posts.length === 0) {
    return {};
  }

  try {
    console.log(`Sending batch of ${posts.length} posts to API`);

    const payload = {
      posts: posts.map(post => ({
        hash: post.hash,
        content: post.content,
      })),
      timestamp: Date.now(),
    };

    const response = await fetchWithRetry(API_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Validate response structure
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid API response format');
    }

    // Map results by hash
    const results = new Map();

    if (Array.isArray(response.classifications)) {
      response.classifications.forEach((classification, idx) => {
        if (idx < posts.length) {
          const hash = posts[idx].hash;
          results.set(hash, {
            classification: classification.label || 'ALLOW', // Default to ALLOW
            confidence: classification.confidence || 0,
            hash: hash,
          });
        }
      });
    } else if (typeof response.results === 'object') {
      // Alternative response format: hash -> classification
      Object.entries(response.results).forEach(([hash, result]) => {
        results.set(hash, {
          classification: result.label || 'ALLOW',
          confidence: result.confidence || 0,
          hash: hash,
        });
      });
    }

    console.log(`API returned ${results.size} classifications`);
    return results;
  } catch (error) {
    console.error('API Error:', error.message);
    
    // Graceful failure: return ALLOW for all posts
    // This ensures we never block content due to API failures
    console.warn('Failing open: returning ALLOW for all posts');
    const safeResults = new Map();
    posts.forEach(post => {
      safeResults.set(post.hash, {
        classification: 'ALLOW',
        confidence: 0,
        hash: post.hash,
        failedOpen: true, // Mark as failover result
      });
    });
    return safeResults;
  }
}

/**
 * Queue a post for batch processing
 * Returns promise that resolves with classification result
 */
export function queuePost(hash, content) {
  return new Promise((resolve) => {
    requestQueue.push({
      hash,
      content,
      resolve,
    });

    // Send immediately if batch is full
    if (requestQueue.length >= API_CONFIG.BATCH_SIZE) {
      processBatch();
    } else if (!batchTimer) {
      // Set timer for next batch (max 5 seconds)
      batchTimer = setTimeout(processBatch, 5000);
    }
  });
}

/**
 * Process pending batch
 */
async function processBatch() {
  // Clear timer
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (requestQueue.length === 0) {
    return;
  }

  // Extract batch
  const batch = requestQueue.splice(0, API_CONFIG.BATCH_SIZE);
  const results = await sendBatch(batch);

  // Resolve all promises with their results
  batch.forEach(request => {
    const result = results.get(request.hash) || {
      classification: 'ALLOW',
      confidence: 0,
      hash: request.hash,
    };
    request.resolve(result);
  });

  // Process remaining queue if any
  if (requestQueue.length > 0) {
    batchTimer = setTimeout(processBatch, 100);
  }
}

/**
 * Classify a single post (queued for batching)
 */
export async function classifyPost(hash, content) {
  if (!hash || !content) {
    throw new Error('Hash and content are required');
  }

  return queuePost(hash, content);
}

/**
 * Classify multiple posts immediately
 */
export async function classifyBatch(posts) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return new Map();
  }

  const results = await sendBatch(posts);
  return results;
}

/**
 * Get current queue size
 */
export function getQueueSize() {
  return requestQueue.length;
}

/**
 * Clear pending queue
 */
export function clearQueue() {
  requestQueue.forEach(request => {
    request.resolve({
      classification: 'ALLOW',
      confidence: 0,
      hash: request.hash,
    });
  });
  requestQueue = [];
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

/**
 * Force process pending queue immediately
 */
export function flushQueue() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  return processBatch();
}

/**
 * Set custom API endpoint (for testing)
 */
export function setEndpoint(url) {
  API_CONFIG.ENDPOINT = url;
}

/**
 * Get current configuration
 */
export function getConfig() {
  return { ...API_CONFIG };
}

/**
 * Health check to verify API connectivity
 */
export async function healthCheck() {
  try {
    const response = await fetchWithTimeout(API_CONFIG.ENDPOINT, {
      method: 'HEAD',
    });
    return response.ok;
  } catch (error) {
    console.warn('Health check failed:', error.message);
    return false;
  }
}

export default {
  classifyPost,
  classifyBatch,
  queuePost,
  getQueueSize,
  clearQueue,
  flushQueue,
  setEndpoint,
  getConfig,
  healthCheck,
};
