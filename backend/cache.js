/**
 * ClearView Caching Module
 * 
 * Design:
 * - Hash key: FNV-1a(postHash + preference) for preference-aware caching
 * - TTL-based eviction (1 hour default)
 * - Inflight deduplication: prevent duplicate AI calls during concurrent requests
 * - LRU when at capacity
 * - Read-optimized: O(1) get, minimal cleanup overhead
 * - Serverless-safe: no persistent state required, auto-cleanup
 */

const crypto = require('crypto');

// Cache storage
const cache = new Map();
const inflight = new Map(); // Track pending AI requests
const accessOrder = []; // LRU tracking

// Configuration
const CONFIG = {
  MAX_SIZE: 10000,         // Max cache entries (memory-bounded for serverless)
  TTL_MS: 1000 * 60 * 60,  // 1 hour TTL
  CLEANUP_INTERVAL_MS: 60 * 1000,  // Cleanup every minute
  INFLIGHT_TIMEOUT_MS: 30 * 1000,  // Inflight request timeout
};


/**
 * Generate cache key from post hash + preference
 * Uses FNV-1a hash for deterministic output
 */
function generateKey(postHash, preference = '') {
  // FNV-1a for 32-bit hash
  let hash = 2166136261;
  const input = `${postHash}:${preference}`;
  
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // Keep 32-bit
  }
  
  return `cv_${hash.toString(16)}`;
}

/**
 * Get from cache (read-optimized)
 * O(1) operation with minimal LRU overhead
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  // Check expiration
  const age = Date.now() - entry.timestamp;
  if (age > CONFIG.TTL_MS) {
    cache.delete(key);
    accessOrder.splice(accessOrder.indexOf(key), 1);
    return null;
  }

  // Lazy LRU update: only update if entry is old (avoid lock contention)
  if (age > CONFIG.TTL_MS * 0.5) {
    const idx = accessOrder.indexOf(key);
    if (idx > -1) {
      accessOrder.splice(idx, 1);
      accessOrder.push(key);
    }
  }

  return entry.value;
}

/**
 * Set in cache with LRU eviction
 */
function set(key, value) {
  // Evict oldest if at capacity
  if (cache.size >= CONFIG.MAX_SIZE && !cache.has(key)) {
    const oldestKey = accessOrder.shift();
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, {
    value,
    timestamp: Date.now(),
  });

  // Update access order
  const idx = accessOrder.indexOf(key);
  if (idx > -1) accessOrder.splice(idx, 1);
  accessOrder.push(key);
}

/**
 * Register inflight AI request
 * Prevents duplicate calls for same key during concurrent requests
 * Returns promise that resolves when result is cached
 */
function registerInflight(key, promise) {
  inflight.set(key, {
    promise,
    startTime: Date.now(),
  });

  // Auto-cleanup on timeout
  const timeoutId = setTimeout(() => {
    inflight.delete(key);
  }, CONFIG.INFLIGHT_TIMEOUT_MS);

  // Clear timeout if promise settles
  promise
    .then(() => clearTimeout(timeoutId))
    .catch(() => clearTimeout(timeoutId));
}

/**
 * Get inflight promise if exists
 * Used to deduplicate concurrent requests for same key
 */
function getInflight(key) {
  const entry = inflight.get(key);
  if (!entry) return null;

  // Check timeout
  if (Date.now() - entry.startTime > CONFIG.INFLIGHT_TIMEOUT_MS) {
    inflight.delete(key);
    return null;
  }

  return entry.promise;
}

/**
 * Check if key exists
 */
function has(key) {
  return cache.has(key);
}

/**
 * Delete from cache
 */
function del(key) {
  cache.delete(key);
  const idx = accessOrder.indexOf(key);
  if (idx > -1) accessOrder.splice(idx, 1);
}

/**
 * Clear entire cache
 */
function clear() {
  cache.clear();
  accessOrder.length = 0;
}


/**
 * Get cache statistics
 */
function getStats() {
  return {
    size: cache.size,
    maxSize: CONFIG.MAX_SIZE,
    percentUsed: ((cache.size / CONFIG.MAX_SIZE) * 100).toFixed(2),
    inflight: inflight.size,
    ttlMs: CONFIG.TTL_MS,
    ttlMinutes: (CONFIG.TTL_MS / (1000 * 60)).toFixed(1),
  };
}

/**
 * Clean expired entries
 */
function cleanup() {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CONFIG.TTL_MS) {
      cache.delete(key);
      const idx = accessOrder.indexOf(key);
      if (idx > -1) accessOrder.splice(idx, 1);
      removed++;
    }
  }

  // Also cleanup expired inflight requests
  for (const [key, entry] of inflight.entries()) {
    if (now - entry.startTime > CONFIG.INFLIGHT_TIMEOUT_MS) {
      inflight.delete(key);
    }
  }

  if (removed > 0) {
    console.log('[Cache Cleanup]', removed, 'expired entries removed');
  }

  return removed;
}

/**
 * Start periodic cleanup
 */
function startCleanup() {
  return setInterval(cleanup, CONFIG.CLEANUP_INTERVAL_MS);
}

/**
 * Stop periodic cleanup
 */
function stopCleanup(intervalId) {
  clearInterval(intervalId);
}

// Start cleanup on module load
const cleanupInterval = startCleanup();

// Handle graceful shutdown
process.on('exit', () => {
  stopCleanup(cleanupInterval);
  console.log('[Cache] Stopped cleanup interval');
});

module.exports = {
  get,
  set,
  has,
  del,
  clear,
  generateKey,
  registerInflight,
  getInflight,
  getStats,
  cleanup,
  startCleanup,
  stopCleanup,
  CONFIG,
};
