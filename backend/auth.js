/**
 * ClearView Authentication Module
 * 
 * Design:
 * - Anonymous user authentication (no personal data required)
 * - Device fingerprinting for abuse prevention
 * - Stateless token validation (JWT-compatible)
 * - Privacy-first: minimal metadata storage
 * - Extensionless: generated per extension installation
 */

const crypto = require('crypto');

// Configuration
const CONFIG = {
  HEADER_NAME: 'Authorization',
  PREFIX: 'Bearer ',
  ALGORITHM: 'sha256',
  TOKEN_LENGTH: 32,         // 256 bits
  FINGERPRINT_THRESHOLD: 5, // Max accounts per fingerprint
  FINGERPRINT_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
};

// In-memory stores (use Redis/database in production)
const users = new Map();           // userId -> {token, fingerprint, createdAt, lastUsedAt}
const tokenIndex = new Map();      // token -> userId
const fingerprintIndex = new Map(); // fingerprint -> [userIds]


/**
 * Generate cryptographically secure random ID
 */
function generateId() {
  return crypto.randomBytes(CONFIG.TOKEN_LENGTH).toString('hex');
}

/**
 * Generate device fingerprint from request metadata
 * Lightweight fingerprinting to detect abuse without tracking identity
 * 
 * Uses: User-Agent + Accept-Language + TLS version
 * Does NOT use: IP address, cookies, or persistent identifiers
 */
function generateFingerprint(req) {
  const components = [
    req.headers['user-agent'] || 'unknown',
    req.headers['accept-language'] || 'en',
    req.headers['accept-encoding'] || 'gzip',
  ];

  const input = components.join('|');
  return crypto
    .createHash(CONFIG.ALGORITHM)
    .update(input)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Check if fingerprint has too many active accounts (abuse detection)
 */
function isFingerprintAbused(fingerprint) {
  const userIds = fingerprintIndex.get(fingerprint) || [];
  
  // Count users active in last 24 hours
  const activeUsers = userIds.filter(userId => {
    const user = users.get(userId);
    if (!user) return false;
    const age = Date.now() - user.lastUsedAt;
    return age < CONFIG.FINGERPRINT_TTL_MS;
  });

  return activeUsers.length >= CONFIG.FINGERPRINT_THRESHOLD;
}

/**
 * Create new anonymous user token
 */
function createAnonymousToken(req) {
  const fingerprint = generateFingerprint(req);

  // Check abuse pattern
  if (isFingerprintAbused(fingerprint)) {
    return {
      success: false,
      error: 'FINGERPRINT_LIMIT_EXCEEDED',
      message: 'Too many accounts from this device',
    };
  }

  const userId = generateId();
  const token = generateId();

  // Store user metadata (minimal)
  users.set(userId, {
    userId,
    token,
    fingerprint,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });

  // Index token for fast lookup
  tokenIndex.set(token, userId);

  // Track fingerprint
  if (!fingerprintIndex.has(fingerprint)) {
    fingerprintIndex.set(fingerprint, []);
  }
  fingerprintIndex.get(fingerprint).push(userId);

  return {
    success: true,
    userId,
    token: `${CONFIG.PREFIX}${token}`,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
  };
}

/**
 * Validate bearer token
 */
function validateToken(token) {
  if (!token) return null;

  // Extract token (remove Bearer prefix if present)
  let tokenValue = token;
  if (token.startsWith(CONFIG.PREFIX)) {
    tokenValue = token.slice(CONFIG.PREFIX.length).trim();
  }

  const userId = tokenIndex.get(tokenValue);
  if (!userId) return null;

  const user = users.get(userId);
  if (!user) return null;

  // Update last used timestamp
  user.lastUsedAt = Date.now();

  return {
    userId,
    isAnonymous: true,
  };
}


/**
 * Validate request authorization header
 */
function validateRequest(req) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader) {
      return {
        valid: false,
        error: 'MISSING_AUTH',
        userId: null,
      };
    }

    // Extract token from "Bearer <token>"
    if (!authHeader.startsWith(CONFIG.PREFIX)) {
      return {
        valid: false,
        error: 'INVALID_FORMAT',
        userId: null,
      };
    }

    const token = authHeader.slice(CONFIG.PREFIX.length).trim();

    // Validate token
    const user = validateToken(token);
    if (!user) {
      return {
        valid: false,
        error: 'INVALID_TOKEN',
        userId: null,
      };
    }

    return {
      valid: true,
      userId: user.userId,
      isAnonymous: user.isAnonymous,
    };
  } catch (error) {
    console.error('[Auth Validation Error]', error.message);
    return {
      valid: false,
      error: 'VALIDATION_FAILED',
      userId: null,
    };
  }
}


/**
 * Revoke user token
 */
function revokeToken(userId) {
  const user = users.get(userId);
  if (!user) return false;

  // Remove from token index
  tokenIndex.delete(user.token);

  // Remove from fingerprint index
  const fingerprint = user.fingerprint;
  const userIds = fingerprintIndex.get(fingerprint) || [];
  const idx = userIds.indexOf(userId);
  if (idx > -1) {
    userIds.splice(idx, 1);
  }

  // Remove user
  users.delete(userId);

  return true;
}

/**
 * Get user info (metadata-free)
 */
function getUserInfo(userId) {
  const user = users.get(userId);
  if (!user) return null;

  return {
    userId,
    isAnonymous: true,
    createdAt: new Date(user.createdAt).toISOString(),
    lastUsedAt: new Date(user.lastUsedAt).toISOString(),
  };
}

/**
 * Get authentication statistics (admin only)
 */
function getStats() {
  const now = Date.now();
  let activeUsers = 0;
  let totalUsers = users.size;

  users.forEach(user => {
    if (now - user.lastUsedAt < CONFIG.FINGERPRINT_TTL_MS) {
      activeUsers++;
    }
  });

  return {
    totalUsers,
    activeUsers,
    activeFingerprints: fingerprintIndex.size,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Clean expired sessions (periodic maintenance)
 */
function cleanup(maxAgeMsMs = 30 * 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;

  // Remove old user sessions
  for (const [userId, user] of users.entries()) {
    if (now - user.createdAt > maxAgeMsMs) {
      revokeToken(userId);
      removed++;
    }
  }

  if (removed > 0) {
    console.log('[Auth Cleanup] Removed', removed, 'expired sessions');
  }

  return removed;
}

/**
 * Start periodic cleanup
 */
function startCleanup() {
  // Run cleanup every 6 hours
  return setInterval(() => {
    cleanup();
  }, 6 * 60 * 60 * 1000);
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
  console.log('[Auth] Stopped cleanup interval');
});


module.exports = {
  generateId,
  generateFingerprint,
  createAnonymousToken,
  validateToken,
  validateRequest,
  revokeToken,
  getUserInfo,
  getStats,
  cleanup,
  startCleanup,
  stopCleanup,
  CONFIG,
};
