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
const aiModule = require('./ai');
const authModule = require('./auth');
const limitsModule = require('./limits');
const cacheModule = require('./cache');
const utils = require('./utils');

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
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      return regex.test(origin);
    }
    return origin === pattern;
  });

  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Max-Age', '86400');
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

// Strip /api prefix for Vercel serverless function routing
// When deployed on Vercel, requests are rewritten to /api/* and routed to api/index.js
// This middleware strips the /api prefix so Express routes match correctly
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    // Strip /api prefix, handling both /api/classify and /api cases
    const newPath = req.path.replace(/^\/api\/?/, '') || '/';
    req.url = req.url.replace(/^\/api\/?/, '') || '/';
    req.path = newPath;
  }
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
  
  try {
    // Authenticate
    const authResult = authModule.validateRequest(req);
    if (!authResult.valid) {
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
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: validation.error,
      });
    }

    const { posts } = req.body;
    const userTier = req.body.tier || 'free'; // Allow client to specify tier

    // Check rate limit
    const limitCheck = limitsModule.checkLimit(userId, userTier, posts.length);
    if (!limitCheck.allowed) {
      // Try to downgrade request gracefully
      if (limitCheck.reason === 'QUOTA_EXCEEDED') {
        const downgraded = limitsModule.downgradeRequest(userId, posts.length, userTier);
        
        if (downgraded === null) {
          return res.status(429).json({
            success: false,
            error: limitCheck.reason,
            message: 'No quota remaining',
            retryAfterMs: limitCheck.retryAfterMs,
            resetAt: limitCheck.resetAt,
          });
        }

        // Downgrade to available quota
        req.body.posts = posts.slice(0, downgraded);
      } else {
        return res.status(429).json({
          success: false,
          error: limitCheck.reason,
          message: 'Rate limit exceeded',
          retryAfterMs: limitCheck.retryAfterMs,
        });
      }
    }

    // Get user preference from request (optional, default to generic)
    const preference = req.body.preference || 'Filter harmful, explicit, and abusive content';

    // Separate cached and uncached posts
    const classifications = [];
    const uncachedPosts = [];
    const cacheHits = [];

    for (const post of posts) {
      // Generate cache key: FNV-1a(postHash + preference)
      const cacheKey = cacheModule.generateKey(post.hash, preference);
      
      // Check for cached result
      const cached = cacheModule.get(cacheKey);
      if (cached) {
        classifications.push({
          hash: post.hash,
          label: cached.label,
          cached: true,
        });
        cacheHits.push(post.hash);
      } else {
        // Check for inflight request (concurrent deduplication)
        const inflight = cacheModule.getInflight(cacheKey);
        if (inflight) {
          // Wait for concurrent request to finish
          uncachedPosts.push({
            ...post,
            cacheKey,
            inflight,
          });
        } else {
          uncachedPosts.push({
            ...post,
            cacheKey,
          });
        }
      }
    }

    // Classify uncached posts with user preference
    if (uncachedPosts.length > 0) {
      try {
        // Separate posts with inflight vs new requests
        const newPosts = uncachedPosts.filter(p => !p.inflight);
        const inflightPosts = uncachedPosts.filter(p => p.inflight);

        // Wait for inflight requests to complete
        const inflightResults = await Promise.all(
          inflightPosts.map(p =>
            p.inflight
              .then(result => ({
                hash: p.hash,
                label: result.label,
                cached: true,
              }))
              .catch(() => ({
                hash: p.hash,
                label: aiModule.LABELS.ALLOW,
                cached: false,
                failedOpen: true,
              }))
          )
        );
        
        classifications.push(...inflightResults);

        // Classify new posts
        if (newPosts.length > 0) {
          // Create promise for inflight tracking
          const classifyPromise = aiModule.classifyBatch(preference, newPosts);
          
          // Register inflight for first request (register key from first post)
          if (newPosts.length > 0) {
            cacheModule.registerInflight(newPosts[0].cacheKey, classifyPromise);
          }

          const aiResults = await classifyPromise;
          
          for (const result of aiResults) {
            // Find original post by hash
            const post = newPosts.find(p => p.hash === result.hash);
            if (!post) continue;

            // Validate result structure
            if (!aiModule.validateResult(result)) {
              result.label = aiModule.LABELS.ALLOW; // Fail-open
            }

            // Cache result with preference-aware key
            cacheModule.set(post.cacheKey, {
              label: result.label,
            });
            
            classifications.push({
              hash: result.hash,
              label: result.label,
              cached: false,
            });
          }
        }
      } catch (aiError) {
        console.error('[AI Error]', aiError.message);
        
        // Fail-open: allow all uncached posts
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
    console.error('[Classify Error]', error.message);
    
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

// For AWS Lambda, Azure Functions, Google Cloud Functions
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
