/**
 * ClearView AI Classification Module
 * Cost-efficient batch content classification with deterministic output
 * 
 * Design:
 * - Single batch API call (not individual requests)
 * - Minimal prompt tokens (~200 tokens per batch of 50)
 * - Deterministic ALLOW/BLOCK output (no reasoning, confidence, etc.)
 * - Fail-open design (ALLOW on any error)
 * - Handles user preference + post content
 */

const axios = require('axios');

// Configuration
const CONFIG = {
  MODEL_ENDPOINT: process.env.MODEL_ENDPOINT || 'https://api.openai.com/v1/chat/completions',
  MODEL_TIMEOUT_MS: parseInt(process.env.MODEL_TIMEOUT_MS) || 30000, // 30 seconds default
  MAX_BATCH_SIZE: 50,
  MODEL: process.env.MODEL || 'gpt-4-turbo',
  API_KEY: process.env.OPENAI_API_KEY,
};

// Enhanced logging helper
function logAI(level, message, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    module: 'AI',
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

// Validate API key on module load
if (!CONFIG.API_KEY) {
  logAI('warn', 'OPENAI_API_KEY not set in environment variables', {
    hasKey: false,
    envKeys: Object.keys(process.env).filter(k => k.includes('OPENAI') || k.includes('API')),
  });
} else {
  logAI('info', 'OpenAI API key configured', {
    hasKey: true,
    keyPrefix: CONFIG.API_KEY.substring(0, 7) + '...',
    keyLength: CONFIG.API_KEY.length,
  });
}

// Output labels
const LABELS = {
  ALLOW: 'ALLOW',
  BLOCK: 'BLOCK',
};

// Circuit breaker for consecutive failures
const CIRCUIT_BREAKER = {
  failures: 0,
  maxFailures: 3,
  isOpen: false,
  reset() {
    this.failures = 0;
    this.isOpen = false;
  },
  recordFailure() {
    this.failures++;
    if (this.failures >= this.maxFailures) {
      this.isOpen = true;
      console.warn('[Circuit Breaker] Opened after', this.failures, 'failures');
    }
  },
  recordSuccess() {
    if (this.failures > 0) {
      this.reset();
    }
  },
};


/**
 * Build minimal system prompt for classification
 * Includes user preference + instructions for deterministic output
 */
function buildSystemPrompt(preference) {
  return `You are a content classifier. Classify posts based on this preference: "${preference}"

RULES:
- Output ONLY one label per line
- Labels: ALLOW or BLOCK
- When uncertain, choose ALLOW (safe default)
- No explanations, reasoning, or metadata
- Must output exactly N lines for N posts`;
}

/**
 * Build batch classification request
 * Encodes posts compactly to minimize tokens
 */
function buildBatchPrompt(posts) {
  // Compact format: hash|content (one per line)
  // Removes redundant whitespace
  return posts
    .map(p => `${p.hash}|${p.content.replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n');
}

/**
 * Parse model response into results
 * Maps labels back to post hashes maintaining input order
 */
function parseResponse(responseText, posts) {
  const lines = responseText.trim().split('\n');
  const results = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const line = (lines[i] || '').trim().toUpperCase();

    // Validate output
    const label = (line === LABELS.BLOCK) ? LABELS.BLOCK : LABELS.ALLOW;

    results.push({
      hash: post.hash,
      label,
      model: CONFIG.MODEL,
    });
  }

  return results;
}

/**
 * Classify batch of posts using single API call
 * 
 * @param {string} preference - User preference (plain English)
 * @param {Array} posts - Array of {hash, content}
 * @returns {Promise<Array>} Array of {hash, label}
 */
async function classifyBatch(preference, posts) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  logAI('info', 'Classification request started', {
    requestId,
    postsCount: posts?.length || 0,
    preferenceLength: preference?.length || 0,
    hasApiKey: !!CONFIG.API_KEY,
  });

  // Input validation
  if (!Array.isArray(posts) || posts.length === 0) {
    logAI('warn', 'Empty or invalid posts array', { requestId });
    return [];
  }

  if (posts.length > CONFIG.MAX_BATCH_SIZE) {
    logAI('info', 'Truncating posts to max batch size', {
      requestId,
      original: posts.length,
      truncatedTo: CONFIG.MAX_BATCH_SIZE,
    });
    posts = posts.slice(0, CONFIG.MAX_BATCH_SIZE);
  }

  // Check API key
  if (!CONFIG.API_KEY) {
    logAI('error', 'OPENAI_API_KEY not configured - failing open', {
      requestId,
      postsCount: posts.length,
      envVars: Object.keys(process.env).length,
    });
    CIRCUIT_BREAKER.recordFailure();
    return posts.map(p => ({
      hash: p.hash,
      label: LABELS.ALLOW,
      failedOpen: true,
      error: 'API_KEY_MISSING',
    }));
  }

  // Fail-open if circuit breaker is open
  if (CIRCUIT_BREAKER.isOpen) {
    logAI('warn', 'Circuit breaker open - failing open', {
      requestId,
      failures: CIRCUIT_BREAKER.failures,
      postsCount: posts.length,
    });
    return posts.map(p => ({
      hash: p.hash,
      label: LABELS.ALLOW,
      failedOpen: true,
    }));
  }

  try {
    // Build request with minimal tokens
    const systemPrompt = buildSystemPrompt(preference);
    const userPrompt = buildBatchPrompt(posts);

    // Calculate max_tokens: allow for "ALLOW" or "BLOCK" plus newline per post
    // "ALLOW" = 5 tokens, "BLOCK" = 6 tokens, newline = 1 token
    // Use 10 tokens per post as safe buffer
    const maxTokens = Math.max(50, posts.length * 10);

    const requestPayload = {
      model: CONFIG.MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,  // Deterministic output
      max_tokens: maxTokens,
    };

    logAI('info', 'Calling OpenAI API', {
      requestId,
      model: CONFIG.MODEL,
      postsCount: posts.length,
      maxTokens,
      endpoint: CONFIG.MODEL_ENDPOINT,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      timeoutMs: CONFIG.MODEL_TIMEOUT_MS,
    });

    const apiStartTime = Date.now();
    const response = await axios.post(CONFIG.MODEL_ENDPOINT, requestPayload, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: CONFIG.MODEL_TIMEOUT_MS,
    });
    const apiDuration = Date.now() - apiStartTime;

    logAI('info', 'OpenAI API response received', {
      requestId,
      status: response.status,
      statusText: response.statusText,
      apiDurationMs: apiDuration,
      hasChoices: !!response.data?.choices,
      choicesCount: response.data?.choices?.length || 0,
      usage: response.data?.usage,
    });

    // Validate response structure
    if (!response.data || !response.data.choices || !Array.isArray(response.data.choices)) {
      logAI('error', 'Invalid OpenAI API response structure', {
        requestId,
        hasData: !!response.data,
        hasChoices: !!response.data?.choices,
        dataKeys: response.data ? Object.keys(response.data) : [],
      });
      throw new Error('Invalid OpenAI API response structure');
    }

    // Parse response
    const content = response.data.choices[0]?.message?.content || '';

    logAI('debug', 'OpenAI response content', {
      requestId,
      contentLength: content.length,
      contentPreview: content.substring(0, 200),
      finishReason: response.data.choices[0]?.finish_reason,
    });

    if (!content || content.trim().length === 0) {
      logAI('error', 'Empty response from OpenAI API', { requestId });
      throw new Error('Empty response from OpenAI API');
    }

    const results = parseResponse(content, posts);

    // Validate we got results for all posts
    if (results.length !== posts.length) {
      logAI('warn', 'Response count mismatch', {
        requestId,
        expected: posts.length,
        got: results.length,
      });
    }

    const totalDuration = Date.now() - startTime;
    const blockCount = results.filter(r => r.label === LABELS.BLOCK).length;

    logAI('info', 'Classification completed successfully', {
      requestId,
      totalDurationMs: totalDuration,
      postsCount: posts.length,
      resultsCount: results.length,
      blockCount,
      allowCount: results.length - blockCount,
    });

    CIRCUIT_BREAKER.recordSuccess();
    return results;

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    // Enhanced error logging with full context
    const errorDetails = {
      requestId,
      message: error.message,
      code: error.code,
      postsCount: posts.length,
      totalDurationMs: totalDuration,
      circuitBreakerFailures: CIRCUIT_BREAKER.failures,
    };

    // Log OpenAI API error response if available
    if (error.response) {
      errorDetails.type = 'API_ERROR';
      errorDetails.status = error.response.status;
      errorDetails.statusText = error.response.statusText;
      errorDetails.apiError = error.response.data?.error;
      errorDetails.apiErrorMessage = error.response.data?.error?.message;
      errorDetails.apiErrorType = error.response.data?.error?.type;
      errorDetails.apiErrorCode = error.response.data?.error?.code;

      logAI('error', 'OpenAI API returned error', errorDetails);
    } else if (error.request) {
      errorDetails.type = 'NETWORK_ERROR';
      errorDetails.requestError = 'No response received from OpenAI API';
      errorDetails.timeout = error.code === 'ECONNABORTED';

      logAI('error', 'Network error calling OpenAI API', errorDetails);
    } else {
      errorDetails.type = 'REQUEST_SETUP_ERROR';
      errorDetails.stack = error.stack;

      logAI('error', 'Error setting up OpenAI API request', errorDetails);
    }

    CIRCUIT_BREAKER.recordFailure();

    logAI('warn', 'Failing open - returning ALLOW for all posts', {
      requestId,
      postsCount: posts.length,
      circuitBreakerOpen: CIRCUIT_BREAKER.isOpen,
    });

    // Fail-open: return ALLOW for all posts on error
    return posts.map(p => ({
      hash: p.hash,
      label: LABELS.ALLOW,
      failedOpen: true,
      error: error.response?.data?.error?.message || error.message,
    }));
  }
}

/**
 * Classify single post (wrapper for backward compatibility)
 */
async function classifyOne(preference, post) {
  const results = await classifyBatch(preference, [post]);
  return results[0];
}


/**
 * Validate classification result structure
 */
function validateResult(result) {
  return (
    result &&
    typeof result === 'object' &&
    typeof result.hash === 'string' &&
    (result.label === LABELS.ALLOW || result.label === LABELS.BLOCK)
  );
}

/**
 * Health check for model endpoint
 */
async function healthCheck() {
  try {
    const response = await axios.get(`${CONFIG.MODEL_ENDPOINT.replace('/chat/completions', '')}/models`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
      },
      timeout: CONFIG.MODEL_TIMEOUT_MS,
    });
    return response.status === 200;
  } catch (error) {
    console.warn('[Model Health Check]', error.message);
    return false;
  }
}

/**
 * Reset circuit breaker (for testing or recovery)
 */
function resetCircuitBreaker() {
  CIRCUIT_BREAKER.reset();
}

module.exports = {
  classifyBatch,
  classifyOne,
  validateResult,
  healthCheck,
  resetCircuitBreaker,
  LABELS,
  CONFIG,
};
