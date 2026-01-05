/**
 * Enhanced Backend Module with Production Scaling Features
 * Demonstrates graceful degradation, observability, and security hardening
 * 
 * Key improvements:
 * - Circuit breaker for AI model failures
 * - Request-level rate limiting
 * - Structured logging with correlation IDs
 * - Distributed cache/quota support
 * - Graceful fallbacks
 */

// ============================================================================
// Observability & Logging
// ============================================================================

class Logger {
  constructor(service) {
    this.service = service;
  }

  log(event, data = {}) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: this.service,
      ...event,
      ...data,
    }));
  }

  error(message, error, correlationId) {
    this.log({
      level: 'error',
      message,
      errorCode: error?.code || 'UNKNOWN',
      errorMessage: error?.message,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      correlationId,
    });
  }
}

const logger = new Logger('backend');

// ============================================================================
// Circuit Breaker (Resilience Pattern)
// ============================================================================

class CircuitBreaker {
  constructor(maxFailures = 10, resetTimeMs = 60000) {
    this.maxFailures = maxFailures;
    this.resetTimeMs = resetTimeMs;
    this.failures = 0;
    this.isOpen = false;
    this.lastOpenTime = null;
  }

  async call(fn, fallback) {
    // Auto-reset if enough time passed
    if (this.isOpen) {
      const age = Date.now() - this.lastOpenTime;
      if (age > this.resetTimeMs) {
        this.isOpen = false;
        this.failures = 0;
        logger.log({ event: 'CIRCUIT_BREAKER_RESET' });
      } else {
        logger.log({
          event: 'CIRCUIT_BREAKER_OPEN',
          retryAfterMs: this.resetTimeMs - age,
        });
        return fallback?.();
      }
    }

    try {
      const result = await fn();
      if (this.failures > 0) {
        this.failures = 0;
        logger.log({ event: 'CIRCUIT_BREAKER_HEALTHY' });
      }
      return result;
    } catch (error) {
      this.failures++;
      logger.error('Circuit breaker failure', error);

      if (this.failures >= this.maxFailures) {
        this.isOpen = true;
        this.lastOpenTime = Date.now();
        logger.log({
          event: 'CIRCUIT_BREAKER_OPENED',
          failures: this.failures,
        });
      }

      throw error;
    }
  }
}

// ============================================================================
// Request-Level Rate Limiting
// ============================================================================

class RequestRateLimiter {
  constructor(maxPerWindow = 1000, windowMs = 60000) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.buckets = new Map();
  }

  checkLimit(identifier) {
    const now = Date.now();
    let bucket = this.buckets.get(identifier);

    // Create or reset bucket
    if (!bucket || now > bucket.resetTime) {
      bucket = {
        count: 0,
        resetTime: now + this.windowMs,
      };
      this.buckets.set(identifier, bucket);
    }

    const allowed = bucket.count < this.maxPerWindow;
    const remaining = this.maxPerWindow - bucket.count;

    return {
      allowed,
      remaining,
      resetAt: new Date(bucket.resetTime).toISOString(),
    };
  }

  increment(identifier) {
    const bucket = this.buckets.get(identifier);
    if (bucket) {
      bucket.count++;
    }
  }

  // Periodic cleanup of old buckets
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [id, bucket] of this.buckets.entries()) {
      if (now > bucket.resetTime + 60000) {
        this.buckets.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.log({
        event: 'RATE_LIMITER_CLEANUP',
        removedBuckets: removed,
      });
    }
  }
}

// ============================================================================
// Distributed Cache with Fallback
// ============================================================================

class DistributedCache {
  constructor(localCache, redisClient = null) {
    this.local = localCache;
    this.redis = redisClient;
  }

  async get(key) {
    // Try Redis first
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        if (value) {
          return JSON.parse(value);
        }
      } catch (error) {
        logger.error('Redis get failed', error);
        // Fall through to local
      }
    }

    // Fall back to local
    return this.local.get(key);
  }

  async set(key, value, ttlSeconds = 3600) {
    // Always write local
    this.local.set(key, value);

    // Write to Redis if available
    if (this.redis) {
      try {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      } catch (error) {
        logger.error('Redis set failed', error);
        // Local cache is sufficient fallback
      }
    }
  }

  async getMulti(keys) {
    const results = new Map();

    // Batch get from Redis if available
    if (this.redis) {
      try {
        const values = await this.redis.mget(keys);
        for (let i = 0; i < keys.length; i++) {
          if (values[i]) {
            results.set(keys[i], JSON.parse(values[i]));
          }
        }
      } catch (error) {
        logger.error('Redis mget failed', error);
      }
    }

    // Fill gaps from local cache
    for (const key of keys) {
      if (!results.has(key)) {
        const value = this.local.get(key);
        if (value) {
          results.set(key, value);
        }
      }
    }

    return results;
  }
}

// ============================================================================
// Distributed Quota Manager with Fallback
// ============================================================================

class DistributedQuota {
  constructor(localQuota, redisClient = null) {
    this.local = localQuota;
    this.redis = redisClient;
  }

  async checkAndIncrement(userId, tier, count) {
    // Try distributed quota first
    if (this.redis) {
      try {
        const key = `quota:${userId}`;
        const remaining = await this.redis.decrby(key, count);

        // Set expiry on first check
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          const resetTime = getNextResetTime(); // Implement per your limits.js
          const ttlSeconds = Math.ceil((resetTime - Date.now()) / 1000);
          await this.redis.expire(key, ttlSeconds);
        }

        if (remaining < 0) {
          // Restore to allow retry logic
          await this.redis.incrby(key, count);
          return {
            allowed: false,
            reason: 'QUOTA_EXCEEDED',
            retryAfterMs: ttl * 1000,
          };
        }

        return {
          allowed: true,
          used: await this.redis.get(key),
          remaining: Math.max(0, remaining),
        };
      } catch (error) {
        logger.error('Redis quota failed', error);
        // Fall back to local
      }
    }

    // Fall back to local quota
    return this.local.checkAndIncrement(userId, tier, count);
  }
}

// ============================================================================
// Health Check & Metrics
// ============================================================================

class HealthMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      rateLimited: 0,
      cacheHits: 0,
      cacheMisses: 0,
      quotaExceeded: 0,
      aiTimeout: 0,
      circuitBreakerTrips: 0,
    };
    this.startTime = Date.now();
  }

  recordRequest() {
    this.metrics.requests++;
  }

  recordError() {
    this.metrics.errors++;
  }

  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const errorRate = this.metrics.errors / this.metrics.requests || 0;
    const cacheHitRate =
      this.metrics.cacheHits /
      (this.metrics.cacheHits + this.metrics.cacheMisses || 1);

    return {
      uptime: `${Math.floor(uptime / 1000)}s`,
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: (errorRate * 100).toFixed(2) + '%',
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      cacheHitRate: (cacheHitRate * 100).toFixed(2) + '%',
      quotaExceeded: this.metrics.quotaExceeded,
      aiTimeouts: this.metrics.aiTimeout,
      circuitBreakerTrips: this.metrics.circuitBreakerTrips,
    };
  }

  health() {
    const stats = this.getStats();
    const errorRateNum = parseFloat(stats.errorRate);
    const cacheHitRateNum = parseFloat(stats.cacheHitRate);

    if (errorRateNum > 10 || cacheHitRateNum < 70) {
      return { status: 'degraded', stats };
    }

    if (errorRateNum > 5) {
      return { status: 'unhealthy', stats };
    }

    return { status: 'healthy', stats };
  }
}

// ============================================================================
// Request Context & Correlation
// ============================================================================

class RequestContext {
  constructor(correlationId) {
    this.correlationId = correlationId;
    this.startTime = Date.now();
    this.events = [];
  }

  addEvent(event, data = {}) {
    this.events.push({
      timestamp: Date.now(),
      event,
      ...data,
    });
  }

  log(message, level = 'info') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      durationMs: Date.now() - this.startTime,
      message,
      level,
    }));
  }

  logError(error) {
    this.log(error.message, 'error');
  }
}

// ============================================================================
// Usage Example in Express Middleware
// ============================================================================

function setupProductionMiddleware(app, redis = null) {
  const requestLimiter = new RequestRateLimiter(1000, 60000);
  const healthMonitor = new HealthMonitor();
  const aiBreaker = new CircuitBreaker(10, 60000);

  // Cleanup rate limiter buckets every 5 minutes
  setInterval(() => requestLimiter.cleanup(), 5 * 60 * 1000);

  // Request correlation ID middleware
  app.use((req, res, next) => {
    req.correlationId =
      req.headers['x-correlation-id'] ||
      crypto.randomBytes(8).toString('hex');
    req.context = new RequestContext(req.correlationId);
    res.set('X-Correlation-ID', req.correlationId);

    res.on('finish', () => {
      healthMonitor.recordRequest();
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - req.context.startTime,
        })
      );
    });

    next();
  });

  // Request-level rate limiting
  app.use((req, res, next) => {
    const ip = req.ip;
    const limit = requestLimiter.checkLimit(ip);

    res.set('RateLimit-Remaining', limit.remaining);
    res.set('RateLimit-Reset', limit.resetAt);

    if (!limit.allowed) {
      healthMonitor.metrics.rateLimited++;
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfterMs: 60000,
        retryAfter: limit.resetAt,
      });
    }

    requestLimiter.increment(ip);
    next();
  });

  // Health endpoint
  app.get('/health', (req, res) => {
    const health = healthMonitor.health();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // Metrics endpoint
  app.get('/metrics', (req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      stats: healthMonitor.getStats(),
    });
  });

  return {
    requestLimiter,
    healthMonitor,
    aiBreaker,
  };
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  Logger,
  CircuitBreaker,
  RequestRateLimiter,
  DistributedCache,
  DistributedQuota,
  HealthMonitor,
  RequestContext,
  setupProductionMiddleware,
};
