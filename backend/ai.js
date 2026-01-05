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

// Validate API key on module load
if (!CONFIG.API_KEY) {
  console.warn('[AI] WARNING: OPENAI_API_KEY not set in environment variables');
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
  // Input validation
  if (!Array.isArray(posts) || posts.length === 0) {
    return [];
  }

  if (posts.length > CONFIG.MAX_BATCH_SIZE) {
    posts = posts.slice(0, CONFIG.MAX_BATCH_SIZE);
  }

  // Check API key
  if (!CONFIG.API_KEY) {
    console.error('[AI] OPENAI_API_KEY not configured');
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
    console.warn('[AI] Circuit breaker open, returning ALLOW for all');
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

    console.debug('[AI] Calling OpenAI API', {
      model: CONFIG.MODEL,
      posts: posts.length,
      maxTokens,
      endpoint: CONFIG.MODEL_ENDPOINT,
    });

    const response = await axios.post(CONFIG.MODEL_ENDPOINT, requestPayload, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: CONFIG.MODEL_TIMEOUT_MS,
    });

    // Validate response structure
    if (!response.data || !response.data.choices || !Array.isArray(response.data.choices)) {
      throw new Error('Invalid OpenAI API response structure');
    }

    // Parse response
    const content = response.data.choices[0]?.message?.content || '';
    
    if (!content || content.trim().length === 0) {
      throw new Error('Empty response from OpenAI API');
    }

    const results = parseResponse(content, posts);

    // Validate we got results for all posts
    if (results.length !== posts.length) {
      console.warn(`[AI] Response count mismatch: expected ${posts.length}, got ${results.length}`);
    }

    CIRCUIT_BREAKER.recordSuccess();
    return results;

  } catch (error) {
    // Enhanced error logging
    const errorDetails = {
      message: error.message,
      code: error.code,
      posts: posts.length,
    };

    // Log OpenAI API error response if available
    if (error.response) {
      errorDetails.status = error.response.status;
      errorDetails.statusText = error.response.statusText;
      errorDetails.data = error.response.data;
      console.error('[AI Classification Error] OpenAI API Error:', errorDetails);
    } else if (error.request) {
      errorDetails.requestError = 'No response received from OpenAI API';
      console.error('[AI Classification Error] Network Error:', errorDetails);
    } else {
      console.error('[AI Classification Error]', errorDetails);
    }

    CIRCUIT_BREAKER.recordFailure();

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
