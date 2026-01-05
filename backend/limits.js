/**
 * ClearView Rate Limiting & Quota Module
 * 
 * Design:
 * - Per-user daily quota tracking
 * - Automatic 24-hour reset
 * - Burst protection (1-minute sliding window)
 * - Configurable free tier + paid tiers
 * - Persistent fallback (localStorage cache for offline)
 * - Graceful degradation when at limits
 */

// In-memory storage
const userLimits = new Map();

// Persistent fallback (simulated - in production use Redis)
const PERSISTENCE_KEY = 'clearview_limits_cache';
let persistenceBackend = null; // Can be set to custom storage

// Configuration with tier support
const CONFIG = {
  // Free tier (default)
  TIERS: {
    free: {
      dailyQuota: 1000,    // 1K posts/day
      burstLimit: 50,      // 50 posts/min
      description: 'Free tier',
    },
    pro: {
      dailyQuota: 50000,   // 50K posts/day
      burstLimit: 500,     // 500 posts/min
      description: 'Pro tier',
    },
    enterprise: {
      dailyQuota: 500000,  // 500K posts/day
      burstLimit: 5000,    // 5K posts/min
      description: 'Enterprise tier',
    },
  },

  DEFAULT_TIER: 'free',
  QUOTA_RESET_HOUR: 0,              // UTC hour to reset
  BURST_WINDOW_MS: 60 * 1000,       // 1 minute
  CLEANUP_INTERVAL_MS: 6 * 60 * 60 * 1000, // Clean old entries every 6 hours
};


/**
 * Get tier configuration
 */
function getTierConfig(tier) {
  return CONFIG.TIERS[tier] || CONFIG.TIERS[CONFIG.DEFAULT_TIER];
}

/**
 * Get next quota reset time (next day at QUOTA_RESET_HOUR UTC)
 */
function getNextResetTime() {
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setUTCHours(CONFIG.QUOTA_RESET_HOUR, 0, 0, 0);
  
  if (nextReset <= now) {
    nextReset.setDate(nextReset.getDate() + 1);
  }
  
  return nextReset.getTime();
}

/**
 * Get or create user limit entry
 * Tries to restore from persistent storage on miss
 */
function getUserLimit(userId, tier = CONFIG.DEFAULT_TIER) {
  // Check in-memory first
  if (userLimits.has(userId)) {
    const limit = userLimits.get(userId);
    // Refresh tier config in case it changed
    limit.tierConfig = getTierConfig(tier);
    return limit;
  }

  // Try to restore from persistent storage
  let limit = loadFromPersistence(userId);
  
  if (!limit) {
    // Create new entry
    limit = createNewLimitEntry(userId, tier);
  }

  userLimits.set(userId, limit);
  return limit;
}

/**
 * Create new limit entry
 */
function createNewLimitEntry(userId, tier = CONFIG.DEFAULT_TIER) {
  return {
    userId,
    tier,
    tierConfig: getTierConfig(tier),
    quotaUsed: 0,
    quotaResetTime: getNextResetTime(),
    burstCount: 0,
    burstResetTime: Date.now() + CONFIG.BURST_WINDOW_MS,
    createdAt: Date.now(),
    lastAccessAt: Date.now(),
  };
}

/**
 * Load limit data from persistent storage
 * Returns null if not found or expired
 */
function loadFromPersistence(userId) {
  if (!persistenceBackend) return null;
  
  try {
    const data = persistenceBackend.get(userId);
    if (!data) return null;
    
    const limit = JSON.parse(data);
    
    // Validate not expired (older than 24 hours + buffer)
    if (Date.now() - limit.lastAccessAt > 48 * 60 * 60 * 1000) {
      persistenceBackend.delete(userId);
      return null;
    }
    
    return limit;
  } catch (error) {
    console.warn('[Persistence Load Error]', userId, error.message);
    return null;
  }
}

/**
 * Save limit data to persistent storage
 */
function saveToPersistence(limit) {
  if (!persistenceBackend) return;
  
  try {
    limit.lastAccessAt = Date.now();
    persistenceBackend.set(limit.userId, JSON.stringify(limit));
  } catch (error) {
    console.warn('[Persistence Save Error]', limit.userId, error.message);
  }
}

/**
 * Set persistence backend (e.g., Redis client or file store)
 */
function setPersistenceBackend(backend) {
  persistenceBackend = backend;
}


/**
 * Check if user is within limits
 * Returns allowed status + metadata
 */
function checkLimit(userId, tier = CONFIG.DEFAULT_TIER, count = 1) {
  const userLimit = getUserLimit(userId, tier);
  const tierConfig = userLimit.tierConfig;
  const now = Date.now();

  // Auto-reset quota if needed
  if (now >= userLimit.quotaResetTime) {
    userLimit.quotaUsed = 0;
    userLimit.quotaResetTime = getNextResetTime();
  }

  // Auto-reset burst if needed
  if (now >= userLimit.burstResetTime) {
    userLimit.burstCount = 0;
    userLimit.burstResetTime = now + CONFIG.BURST_WINDOW_MS;
  }

  // Check daily quota
  if (userLimit.quotaUsed + count > tierConfig.dailyQuota) {
    return {
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      quotaRemaining: Math.max(0, tierConfig.dailyQuota - userLimit.quotaUsed),
      retryAfterMs: userLimit.quotaResetTime - now,
      resetAt: new Date(userLimit.quotaResetTime).toISOString(),
    };
  }

  // Check burst limit
  if (userLimit.burstCount + count > tierConfig.burstLimit) {
    return {
      allowed: false,
      reason: 'BURST_LIMIT_EXCEEDED',
      burstRemaining: Math.max(0, tierConfig.burstLimit - userLimit.burstCount),
      retryAfterMs: userLimit.burstResetTime - now,
    };
  }

  return {
    allowed: true,
    quotaRemaining: tierConfig.dailyQuota - userLimit.quotaUsed - count,
    burstRemaining: tierConfig.burstLimit - userLimit.burstCount - count,
  };
}

/**
 * Increment user's request count
 * Returns updated quota info
 */
function incrementUsage(userId, tier = CONFIG.DEFAULT_TIER, count = 1) {
  const userLimit = getUserLimit(userId, tier);
  const tierConfig = userLimit.tierConfig;
  const now = Date.now();

  // Auto-reset if needed
  if (now >= userLimit.quotaResetTime) {
    userLimit.quotaUsed = 0;
    userLimit.quotaResetTime = getNextResetTime();
  }

  if (now >= userLimit.burstResetTime) {
    userLimit.burstCount = 0;
    userLimit.burstResetTime = now + CONFIG.BURST_WINDOW_MS;
  }

  // Increment counters
  userLimit.quotaUsed += count;
  userLimit.burstCount += count;

  // Persist
  saveToPersistence(userLimit);

  return {
    quotaUsed: userLimit.quotaUsed,
    quotaLimit: tierConfig.dailyQuota,
    quotaRemaining: Math.max(0, tierConfig.dailyQuota - userLimit.quotaUsed),
    resetAt: new Date(userLimit.quotaResetTime).toISOString(),
  };
}


/**
 * Get user's quota info
 */
function getQuota(userId, tier = CONFIG.DEFAULT_TIER) {
  const userLimit = getUserLimit(userId, tier);
  const tierConfig = userLimit.tierConfig;
  const now = Date.now();

  // Reset if needed
  if (now >= userLimit.quotaResetTime) {
    userLimit.quotaUsed = 0;
    userLimit.quotaResetTime = getNextResetTime();
  }

  if (now >= userLimit.burstResetTime) {
    userLimit.burstCount = 0;
    userLimit.burstResetTime = now + CONFIG.BURST_WINDOW_MS;
  }

  return {
    tier: userLimit.tier,
    daily: {
      limit: tierConfig.dailyQuota,
      used: userLimit.quotaUsed,
      remaining: Math.max(0, tierConfig.dailyQuota - userLimit.quotaUsed),
      percentUsed: (userLimit.quotaUsed / tierConfig.dailyQuota * 100).toFixed(1),
      resetAt: new Date(userLimit.quotaResetTime).toISOString(),
      resetInMs: Math.max(0, userLimit.quotaResetTime - now),
    },
    burst: {
      limit: tierConfig.burstLimit,
      used: userLimit.burstCount,
      remaining: Math.max(0, tierConfig.burstLimit - userLimit.burstCount),
      resetAt: new Date(userLimit.burstResetTime).toISOString(),
      resetInMs: Math.max(0, userLimit.burstResetTime - now),
    },
  };
}

/**
 * Get tier details
 */
function getTierDetails(tier = CONFIG.DEFAULT_TIER) {
  const tierConfig = getTierConfig(tier);
  return {
    tier,
    ...tierConfig,
    BURST_WINDOW_MS: CONFIG.BURST_WINDOW_MS,
  };
}

/**
 * Downgrade request gracefully (e.g., if quota exceeded)
 * Returns downgraded batch count or null if impossible
 */
function downgradeRequest(userId, requestedCount, tier = CONFIG.DEFAULT_TIER) {
  const userLimit = getUserLimit(userId, tier);
  const tierConfig = userLimit.tierConfig;
  const now = Date.now();

  // Auto-reset if needed
  if (now >= userLimit.quotaResetTime) {
    userLimit.quotaUsed = 0;
    userLimit.quotaResetTime = getNextResetTime();
  }

  if (now >= userLimit.burstResetTime) {
    userLimit.burstCount = 0;
    userLimit.burstResetTime = now + CONFIG.BURST_WINDOW_MS;
  }

  // Calculate available quota
  const dailyAvailable = Math.max(0, tierConfig.dailyQuota - userLimit.quotaUsed);
  const burstAvailable = Math.max(0, tierConfig.burstLimit - userLimit.burstCount);
  const available = Math.min(dailyAvailable, burstAvailable);

  if (available <= 0) {
    return null; // Cannot downgrade further
  }

  // Return min(requested, available), at least 1
  return Math.min(requestedCount, Math.max(1, available));
}


/**
 * Get all users' stats (admin only)
 */
function getStats() {
  const stats = {
    totalUsers: userLimits.size,
    users: [],
    timestamp: new Date().toISOString(),
  };

  userLimits.forEach((limit, userId) => {
    const tierConfig = limit.tierConfig;
    stats.users.push({
      userId,
      tier: limit.tier,
      quotaUsed: limit.quotaUsed,
      quotaLimit: tierConfig.dailyQuota,
      percentUsed: (limit.quotaUsed / tierConfig.dailyQuota * 100).toFixed(1),
      createdAt: new Date(limit.createdAt).toISOString(),
      lastAccessAt: new Date(limit.lastAccessAt).toISOString(),
    });
  });

  return stats;
}

/**
 * Reset user quota (admin only)
 */
function resetUserQuota(userId) {
  const userLimit = userLimits.get(userId);
  if (userLimit) {
    userLimit.quotaUsed = 0;
    userLimit.quotaResetTime = getNextResetTime();
    saveToPersistence(userLimit);
  }
}

/**
 * Change user tier (admin only)
 */
function setUserTier(userId, tier) {
  if (!CONFIG.TIERS[tier]) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  
  const userLimit = getUserLimit(userId);
  userLimit.tier = tier;
  userLimit.tierConfig = getTierConfig(tier);
  saveToPersistence(userLimit);
  
  return userLimit;
}

/**
 * Clean old entries from memory (periodic cleanup)
 * Removes entries not accessed in 7 days
 */
function cleanupOldEntries(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;

  for (const [userId, limit] of userLimits.entries()) {
    if (now - limit.lastAccessAt > maxAgeMs) {
      userLimits.delete(userId);
      removed++;
    }
  }

  if (removed > 0) {
    console.log('[Limits Cleanup]', removed, 'old entries removed');
  }

  return removed;
}

/**
 * Clear all limits (admin only - careful!)
 */
function clearAllLimits() {
  userLimits.clear();
}

// Periodic cleanup
setInterval(() => {
  cleanupOldEntries();
}, CONFIG.CLEANUP_INTERVAL_MS);


module.exports = {
  checkLimit,
  incrementUsage,
  getQuota,
  getTierDetails,
  downgradeRequest,
  getStats,
  resetUserQuota,
  setUserTier,
  cleanupOldEntries,
  clearAllLimits,
  setPersistenceBackend,
  CONFIG,
};
