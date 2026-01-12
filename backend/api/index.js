/**
 * ClearView Backend API - Serverless Production
 * 
 * Security:
 * - Strict input validation
 * - Anonymous token authentication
 * - Rate limiting per user
 * - CORS restricted to extensions only
 * 
 * Performance:
 * - Batch processing (up to 50 posts)
 * - Result caching by hash
 * - Low-latency responses
 * - Fail-open on AI errors
 */

const express = require('express');
const aiModule = require('../ai');
const authModule = require('../auth');
const limitsModule = require('../limits');
const cacheModule = require('../cache');
const utils = require('../utils');

const app = express();

// ============================================================================
// Constants & Configuration
// ============================================================================

const CONFIG = {
  MAX_BATCH_SIZE: 50,
  MAX_TEXT_LENGTH: 10000,
  MAX_PAYLOAD_SIZE: '100kb',
  REQUEST_TIMEOUT_MS: 8000, // Serverless timeout ~10s, leave buffer
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'chrome-extension://*').split(','),
  ENABLE_METRICS: process.env.ENABLE_METRICS !== 'false',
};

// Structured logging helper
function logAPI(level, message, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    module: 'API',
    level,
    message,
    ...data,
  };

  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

// Log environment on startup
logAPI('info', 'API module loaded', {
  nodeEnv: process.env.NODE_ENV,
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  openAIKeyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 7) + '...' : 'NOT_SET',
  allowedOrigins: CONFIG.ALLOWED_ORIGINS,
});

// ============================================================================
// Security & Validation
// ============================================================================

/**
 * Strict input validation
 */
function validatePost(post) {
  if (!post || typeof post !== 'object') return false;

  const { hash, content } = post;

  // Validate hash
  if (typeof hash !== 'string' || hash.length < 5 || hash.length > 100) {
    return false;
  }

  // Validate content
  if (typeof content !== 'string' || content.length < 1 || content.length > CONFIG.MAX_TEXT_LENGTH) {
    return false;
  }

  // Reject control characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) {
    return false;
  }

  return true;
}

/**
 * Validate classification request
 */
function validateClassifyRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { posts } = body;

  if (!Array.isArray(posts)) {
    return { valid: false, error: 'Posts must be array' };
  }

  if (posts.length === 0 || posts.length > CONFIG.MAX_BATCH_SIZE) {
    return { valid: false, error: `Batch size must be 1-${CONFIG.MAX_BATCH_SIZE}` };
  }

  // Validate each post
  for (let i = 0; i < posts.length; i++) {
    if (!validatePost(posts[i])) {
      return { valid: false, error: `Invalid post at index ${i}` };
    }
  }

  return { valid: true };
}

// ============================================================================
// Middleware
// ============================================================================

// CORS - Restrict to Chrome extensions only
app.use((req, res, next) => {
  const origin = req.headers.origin || '';

  // Check if origin matches allowed pattern
  const isAllowed = CONFIG.ALLOWED_ORIGINS.some(pattern => {
    if (pattern === '*') return true;
    // Match chrome-extension://* pattern
    if (pattern === 'chrome-extension://*' || pattern.includes('chrome-extension://')) {
      return origin.startsWith('chrome-extension://');
    }
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      return regex.test(origin);
    }
    return origin === pattern;
  });

  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Max-Age', '86400');
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(isAllowed ? 200 : 403);
  }

  next();
});

// Security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.header('Content-Type', 'application/json');
  next();
});

// Body parser
app.use(express.json({ limit: CONFIG.MAX_PAYLOAD_SIZE }));

// Request logging & timeout
app.use((req, res, next) => {
  const start = Date.now();

  // Set timeout
  req.setTimeout(CONFIG.REQUEST_TIMEOUT_MS);

  // Log on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (CONFIG.ENABLE_METRICS) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
        userId: req.user?.userId || 'anonymous',
      }));
    }
  });

  next();
});

// ============================================================================
// Routes
// ============================================================================

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Anonymous authentication endpoint
 * POST /auth
 * 
 * Issues a unique anonymous token for first-time users
 * No personal data collection - device fingerprint for abuse detection only
 * 
 * Response:
 * {
 *   "success": true,
 *   "userId": "...",
 *   "token": "Bearer ...",
 *   "expiresAt": "2026-12-30T..."
 * }
 */
app.post('/auth', (req, res) => {
  try {
    // Generate device fingerprint for abuse detection
    const result = authModule.createAnonymousToken(req);

    if (!result.success) {
      return res.status(429).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }

    // Issue token
    res.status(201).json({
      success: true,
      userId: result.userId,
      token: result.token,
      expiresAt: result.expiresAt,
    });

    console.log('[Auth] New anonymous user:', result.userId);
  } catch (error) {
    console.error('[Auth Error]', error.message);
    res.status(500).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Failed to issue token',
    });
  }
});

/**
 * Classification endpoint
 * POST /classify
 * 
 * Request:
 * {
 *   "posts": [
 *     { "hash": "abc123", "content": "tweet text" }
 *   ]
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "classifications": [
 *     { "hash": "abc123", "label": "ALLOW", "cached": false }
 *   ]
 * }
 */
app.post('/classify', async (req, res) => {
  const startTime = Date.now();
  const requestId = `classify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logAPI('info', 'Classification request received', {
    requestId,
    origin: req.headers.origin,
    contentLength: req.headers['content-length'],
    hasAuth: !!req.headers.authorization,
  });

  try {
    // Authenticate
    const authResult = authModule.validateRequest(req);

    logAPI('info', 'Authentication result', {
      requestId,
      valid: authResult.valid,
      userId: authResult.userId,
      error: authResult.error,
    });

    if (!authResult.valid) {
      logAPI('warn', 'Authentication failed', {
        requestId,
        error: authResult.error,
        authHeader: req.headers.authorization ? 'present' : 'missing',
      });
      return res.status(401).json({
        success: false,
        error: 'INVALID_AUTH',
        message: authResult.error,
      });
    }

    const userId = authResult.userId;
    req.user = { userId };

    // Validate request body
    const validation = validateClassifyRequest(req.body);

    logAPI('info', 'Request validation', {
      requestId,
      valid: validation.valid,
      postsCount: req.body?.posts?.length,
      hasPreference: !!req.body?.preference,
      preferenceLength: req.body?.preference?.length,
    });

    if (!validation.valid) {
      logAPI('warn', 'Request validation failed', {
        requestId,
        error: validation.error,
      });
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: validation.error,
      });
    }

    const { posts } = req.body;
    const userTier = req.body.tier || 'free';

    // Check rate limit
    const limitCheck = limitsModule.checkLimit(userId, userTier, posts.length);

    logAPI('info', 'Rate limit check', {
      requestId,
      userId,
      tier: userTier,
      postsCount: posts.length,
      allowed: limitCheck.allowed,
      reason: limitCheck.reason,
    });

    if (!limitCheck.allowed) {
      if (limitCheck.reason === 'QUOTA_EXCEEDED') {
        const downgraded = limitsModule.downgradeRequest(userId, posts.length, userTier);

        logAPI('info', 'Attempting request downgrade', {
          requestId,
          originalCount: posts.length,
          downgradedTo: downgraded,
        });

        if (downgraded === null) {
          logAPI('warn', 'No quota remaining', {
            requestId,
            userId,
            retryAfterMs: limitCheck.retryAfterMs,
          });
          return res.status(429).json({
            success: false,
            error: limitCheck.reason,
            message: 'No quota remaining',
            retryAfterMs: limitCheck.retryAfterMs,
            resetAt: limitCheck.resetAt,
          });
        }

        req.body.posts = posts.slice(0, downgraded);
      } else {
        logAPI('warn', 'Rate limit exceeded', {
          requestId,
          userId,
          reason: limitCheck.reason,
        });
        return res.status(429).json({
          success: false,
          error: limitCheck.reason,
          message: 'Rate limit exceeded',
          retryAfterMs: limitCheck.retryAfterMs,
        });
      }
    }

    // Get user preference from request
    const preference = req.body.preference || 'Filter harmful, explicit, and abusive content';

    logAPI('info', 'Starting classification', {
      requestId,
      postsCount: posts.length,
      preference: preference.substring(0, 100),
    });

    // Separate cached and uncached posts
    const classifications = [];
    const uncachedPosts = [];
    const cacheHits = [];

    for (const post of posts) {
      const cacheKey = cacheModule.generateKey(post.hash, preference);
      const cached = cacheModule.get(cacheKey);
      if (cached) {
        classifications.push({
          hash: post.hash,
          label: cached.label,
          cached: true,
        });
        cacheHits.push(post.hash);
      } else {
        const inflight = cacheModule.getInflight(cacheKey);
        if (inflight) {
          uncachedPosts.push({ ...post, cacheKey, inflight });
        } else {
          uncachedPosts.push({ ...post, cacheKey });
        }
      }
    }

    logAPI('info', 'Cache lookup complete', {
      requestId,
      totalPosts: posts.length,
      cacheHits: cacheHits.length,
      uncachedCount: uncachedPosts.length,
    });

    // Classify uncached posts with user preference
    if (uncachedPosts.length > 0) {
      logAPI('info', 'Calling AI module for classification', {
        requestId,
        uncachedCount: uncachedPosts.length,
        newPosts: uncachedPosts.filter(p => !p.inflight).length,
        inflightPosts: uncachedPosts.filter(p => p.inflight).length,
      });

      try {
        const newPosts = uncachedPosts.filter(p => !p.inflight);
        const inflightPosts = uncachedPosts.filter(p => p.inflight);

        const inflightResults = await Promise.all(
          inflightPosts.map(p =>
            p.inflight
              .then(result => ({ hash: p.hash, label: result.label, cached: true }))
              .catch(() => ({ hash: p.hash, label: aiModule.LABELS.ALLOW, cached: false, failedOpen: true }))
          )
        );

        classifications.push(...inflightResults);

        if (newPosts.length > 0) {
          logAPI('info', 'Sending posts to AI classifier', {
            requestId,
            newPostsCount: newPosts.length,
          });

          const classifyPromise = aiModule.classifyBatch(preference, newPosts);

          if (newPosts.length > 0) {
            cacheModule.registerInflight(newPosts[0].cacheKey, classifyPromise);
          }

          const aiResults = await classifyPromise;

          logAPI('info', 'AI classification results received', {
            requestId,
            resultsCount: aiResults.length,
            failedOpen: aiResults.filter(r => r.failedOpen).length,
            blocked: aiResults.filter(r => r.label === 'BLOCK').length,
          });

          for (const result of aiResults) {
            const post = newPosts.find(p => p.hash === result.hash);
            if (!post) continue;

            if (!aiModule.validateResult(result)) {
              result.label = aiModule.LABELS.ALLOW;
            }

            cacheModule.set(post.cacheKey, { label: result.label });

            classifications.push({
              hash: result.hash,
              label: result.label,
              cached: false,
            });
          }
        }
      } catch (aiError) {
        logAPI('error', 'AI classification error', {
          requestId,
          error: aiError.message,
          uncachedCount: uncachedPosts.length,
        });

        for (const post of uncachedPosts) {
          classifications.push({
            hash: post.hash,
            label: aiModule.LABELS.ALLOW,
            cached: false,
            failedOpen: true,
          });
        }
      }
    }

    // Update quota
    const quotaAfter = limitsModule.incrementUsage(userId, userTier, req.body.posts.length);

    // Sort results to match input order
    const resultMap = new Map();
    classifications.forEach(c => resultMap.set(c.hash, c));
    const sorted = req.body.posts.map(p => resultMap.get(p.hash));

    const duration = Date.now() - startTime;

    const blockedCount = sorted.filter(c => c?.label === 'BLOCK').length;
    const failedOpenCount = sorted.filter(c => c?.failedOpen).length;

    logAPI('info', 'Classification request completed', {
      requestId,
      durationMs: duration,
      totalPosts: req.body.posts.length,
      cached: cacheHits.length,
      classified: uncachedPosts.length,
      blocked: blockedCount,
      allowed: sorted.length - blockedCount,
      failedOpen: failedOpenCount,
      quotaRemaining: quotaAfter?.remaining,
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      classifications: sorted,
      quota: quotaAfter,
      stats: {
        total: req.body.posts.length,
        cached: cacheHits.length,
        classified: uncachedPosts.length,
        durationMs: duration,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    logAPI('error', 'Classification request failed', {
      requestId,
      durationMs: duration,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Classification failed',
    });
  }
});

/**
 * Quota info endpoint
 * GET /quota?tier=free
 * 
 * Returns user's quota status and tier info
 */
app.get('/quota', (req, res) => {
  try {
    const authResult = authModule.validateRequest(req);
    if (!authResult.valid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_AUTH',
      });
    }

    const tier = req.query.tier || 'free';
    const quota = limitsModule.getQuota(authResult.userId, tier);
    const tierDetails = limitsModule.getTierDetails(tier);

    res.json({
      success: true,
      quota,
      tier: tierDetails,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
    });
  }
});

/**
 * Cache stats endpoint (internal use)
 * GET /stats
 */
app.get('/stats', (req, res) => {
  const stats = cacheModule.getStats();
  res.json({
    success: true,
    cache: stats,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Error Handling & Cleanup
// ============================================================================

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.path} not found`,
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('[Error]', {
    message: err.message,
    code: err.code,
    stack: err.stack,
  });

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: `Payload exceeds ${CONFIG.MAX_PAYLOAD_SIZE}`,
    });
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'Request body is not valid JSON',
    });
  }

  // Generic error
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An internal error occurred',
  });
});

// ============================================================================
// Serverless Exports
// ============================================================================

// For Vercel: Export the Express app directly
// Vercel automatically handles Express apps when exported from serverless functions
// The app will be invoked by Vercel's runtime with proper req/res objects
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'SERVER_START',
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
    }));
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'SIGTERM_RECEIVED',
    }));

    server.close(() => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'SERVER_CLOSED',
      }));
      process.exit(0);
    });
  });
}
