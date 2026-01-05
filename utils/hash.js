/**
 * Fast, deterministic hash functions for short strings
 * Optimized for tweet content and post IDs
 */

/**
 * FNV-1a 32-bit hash - Fast and deterministic
 * Good distribution for short strings
 * @param {string} str - Input string
 * @returns {string} - Hex hash string
 */
export function fnv1aHash(str) {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  const fnvPrime = 0x01000193;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * fnvPrime) >>> 0; // Keep 32-bit unsigned
  }

  return hash.toString(16).padStart(8, '0');
}

/**
 * MurmurHash3-like 32-bit hash - Even distribution
 * Slightly slower than FNV but better avalanche properties
 * @param {string} str - Input string
 * @returns {string} - Hex hash string
 */
export function murmurHash(str) {
  let hash = 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  for (let i = 0; i < str.length; i++) {
    let k = str.charCodeAt(i);

    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);

    hash ^= k;
    hash = (hash << 13) | (hash >>> 19);
    hash = (Math.imul(hash, 5) + 0xe6546b64) >>> 0;
  }

  hash ^= str.length;
  
  // Final mix
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Simple fast hash - Fastest, suitable for content filtering
 * Uses bit rotation and XOR mixing
 * @param {string} str - Input string
 * @returns {string} - Hex hash string
 */
export function simpleHash(str) {
  let hash = 5381;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char; // hash * 33 ^ char
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Combined hash - Concatenate two hashes for better collision resistance
 * Uses both FNV-1a and MurmurHash for robustness
 * @param {string} str - Input string
 * @returns {string} - 16-character hex hash
 */
export function combinedHash(str) {
  return fnv1aHash(str) + murmurHash(str);
}

/**
 * Post-specific hash - Optimized for tweet format
 * Combines post ID with content hash
 * @param {string} postId - Post ID (numeric)
 * @param {string} content - Post content
 * @returns {string} - Prefixed hash for tracking
 */
export function postHash(postId, content) {
  const combined = postId + '|' + content;
  return 'post_' + combinedHash(combined);
}

/**
 * Content-only hash - For deduplication by text alone
 * @param {string} content - Post content
 * @returns {string} - Prefixed hash
 */
export function contentHash(content) {
  // Normalize content: lowercase, trim whitespace
  const normalized = content.toLowerCase().trim();
  return 'hash_' + fnv1aHash(normalized);
}

/**
 * Benchmark function for testing
 * @param {string} hashFn - Hash function name
 * @param {string} input - Test string
 * @param {number} iterations - Number of iterations
 * @returns {object} - Timing results
 */
export function benchmarkHash(hashFn, input = 'test tweet content here', iterations = 100000) {
  const fn = {
    fnv1a: fnv1aHash,
    murmur: murmurHash,
    simple: simpleHash,
    combined: combinedHash,
  }[hashFn];

  if (!fn) {
    throw new Error(`Unknown hash function: ${hashFn}`);
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn(input);
  }
  const end = performance.now();

  return {
    function: hashFn,
    iterations,
    totalMs: end - start,
    avgMicroseconds: ((end - start) * 1000) / iterations,
  };
}

// Default export - use FNV-1a as it's fast and reliable
export default fnv1aHash;
