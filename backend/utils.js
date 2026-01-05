/**
 * ClearView Utility Module
 * 
 * Reusable, dependency-free utility functions:
 * - Input validation (strings, objects, arrays)
 * - Safe JSON parsing with fallbacks
 * - Timeout handling with cancellation
 * - Error normalization and formatting
 * - Rate limiting and backoff
 * - Data transformation
 */

// ============================================================================
// Error Normalization
// ============================================================================

/**
 * Normalize error to consistent structure
 * Works with Error objects, strings, and arbitrary values
 */
function normalizeError(error) {
  // Handle Error objects
  if (error instanceof Error) {
    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An error occurred',
      name: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    };
  }

  // Handle strings
  if (typeof error === 'string') {
    return {
      code: 'ERROR',
      message: error,
    };
  }

  // Handle objects with error-like properties
  if (typeof error === 'object' && error !== null) {
    return {
      code: error.code || error.error || 'UNKNOWN_ERROR',
      message: error.message || error.msg || String(error),
      details: error.details || error.data,
    };
  }

  // Fallback for any other type
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
  };
}

/**
 * Format error response
 */
function formatError(code, message, details = null) {
  return {
    success: false,
    error: code,
    message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format success response
 */
function formatSuccess(data) {
  return {
    success: true,
    ...(data && { data }),
    timestamp: new Date().toISOString(),
  };
}


// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate string: non-empty, type check, length bounds
 */
function isValidString(value, minLength = 0, maxLength = Infinity) {
  return (
    typeof value === 'string' &&
    value.length >= minLength &&
    value.length <= maxLength
  );
}

/**
 * Validate integer: type check, range bounds
 */
function isValidInteger(value, min = -Infinity, max = Infinity) {
  return (
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Validate URL format (basic check)
 */
function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate email
 */
function validateEmail(email) {
  // Simple regex - production should use mail-check or similar
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize text: trim, normalize whitespace, remove control chars
 */
function sanitizeText(text, maxLength = 10000) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove control characters (except newlines initially)
  let sanitized = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Trim and normalize whitespace
  sanitized = sanitized
    .trim()
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ');

  // Enforce max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Validate post object structure
 */
function validatePost(post) {
  return (
    post &&
    typeof post === 'object' &&
    !Array.isArray(post) &&
    typeof post.hash === 'string' &&
    typeof post.content === 'string' &&
    post.hash.length > 0 &&
    post.content.length > 0
  );
}

/**
 * Validate array of items with predicate
 */
function validateArray(arr, predicate = null, minLength = 0, maxLength = Infinity) {
  if (!Array.isArray(arr)) return false;
  if (arr.length < minLength || arr.length > maxLength) return false;
  if (predicate && !arr.every(predicate)) return false;
  return true;
}

/**
 * Validate object has required keys
 */
function hasRequiredKeys(obj, requiredKeys) {
  if (!obj || typeof obj !== 'object') return false;
  return requiredKeys.every(key => key in obj);
}


// ============================================================================
// Timeout Handling
// ============================================================================

/**
 * Create timeout promise that rejects after specified duration
 */
function createTimeout(durationMs, message = 'Operation timeout') {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, durationMs);
  });
}

/**
 * Race a promise against timeout
 * Returns result or throws timeout error
 */
async function withTimeout(promise, durationMs, message = 'Operation timeout') {
  return Promise.race([
    promise,
    createTimeout(durationMs, message),
  ]);
}

/**
 * Create abort controller for cancellation
 */
function createAbortSignal(durationMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), durationMs);
  
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Retry function with exponential backoff
 */
async function retry(
  fn,
  maxAttempts = 3,
  baseDelayMs = 1000,
  multiplier = 2,
  maxDelayMs = 30000
) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts - 1) {
        const delayMs = Math.min(
          baseDelayMs * Math.pow(multiplier, attempt),
          maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Calculate metrics
 */
function calculateMetrics(startTime, endTime = null) {
  const end = endTime || Date.now();
  const duration = end - startTime;

  return {
    durationMs: duration,
    durationSeconds: (duration / 1000).toFixed(2),
    timestamp: new Date(startTime).toISOString(),
  };
}

/**
 * Generate unique ID
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Parse query parameters safely
 */
function parseQuery(queryString) {
  const params = new Map();
  
  if (!queryString) return params;

  try {
    const entries = new URLSearchParams(queryString).entries();
    for (const [key, value] of entries) {
      params.set(key, value);
    }
  } catch (error) {
    console.warn('[Parse Query] Invalid query string:', queryString);
  }

  return params;
}

// ============================================================================
// Safe JSON Parsing
// ============================================================================

/**
 * Safely parse JSON with fallback value
 */
function safeJsonParse(jsonString, fallback = null) {
  try {
    if (typeof jsonString !== 'string') {
      return fallback;
    }
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('[JSON Parse Error]', error.message);
    return fallback;
  }
}

/**
 * Safely stringify object with fallback
 */
function safeJsonStringify(obj, fallback = null, space = null) {
  try {
    return JSON.stringify(obj, null, space);
  } catch (error) {
    console.warn('[JSON Stringify Error]', error.message);
    return fallback;
  }
}

/**
 * Parse JSON response from fetch/axios
 * Handles text, JSON, and error bodies
 */
function parseResponseBody(data) {
  if (!data) return null;

  // Already parsed
  if (typeof data === 'object') return data;

  // Try to parse as JSON
  if (typeof data === 'string') {
    return safeJsonParse(data);
  }

  return null;
}

// ============================================================================
// Rate Limiting & Backoff
// ============================================================================

/**
 * Rate limit helper
 */
function createRateLimiter(maxRequests, windowMs) {
  const requests = new Map();

  return function(key) {
    const now = Date.now();
    const userRequests = requests.get(key) || [];

    // Remove old requests outside window
    const filtered = userRequests.filter(time => now - time < windowMs);

    if (filtered.length >= maxRequests) {
      return {
        allowed: false,
        retryAfterMs: windowMs - (now - filtered[0]),
      };
    }

    filtered.push(now);
    requests.set(key, filtered);

    return { allowed: true };
  };
}

/**
 * Exponential backoff calculator
 */
function getBackoffMs(attempt, baseMs = 1000, multiplier = 2) {
  return Math.min(
    baseMs * Math.pow(multiplier, attempt),
    30 * 1000 // Max 30 seconds
  );
}

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Hash array of values for checksum
 */
function hashArray(arr) {
  // No crypto import - use simple hash
  const combined = arr.join('|');
  return simpleHash(combined);
}

/**
 * Simple hash function (no crypto dependency)
 */
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Batch array into chunks
 */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flatten nested object keys
 */
function flattenObject(obj, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

module.exports = {
  // Error handling
  normalizeError,
  formatError,
  formatSuccess,

  // Input validation
  isValidString,
  isValidInteger,
  isValidUrl,
  validateEmail,
  sanitizeText,
  validatePost,
  validateArray,
  hasRequiredKeys,

  // Timeout handling
  createTimeout,
  withTimeout,
  createAbortSignal,
  retry,

  // Metrics
  calculateMetrics,

  // JSON parsing
  safeJsonParse,
  safeJsonStringify,
  parseResponseBody,

  // ID generation
  generateId,

  // Query parsing
  parseQuery,

  // Rate limiting
  createRateLimiter,
  getBackoffMs,

  // Data transformation
  hashArray,
  simpleHash,
  chunk,
  flattenObject,
};
