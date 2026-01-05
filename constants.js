/**
 * Shared constants across extension
 * Prevents magic strings and ensures consistency
 */

export const CONFIG = Object.freeze({
  // API Configuration
  API_ENDPOINT: 'https://api.example.com/classify',
  API_TIMEOUT_MS: 10000,
  
  // Rate limiting
  RATE_LIMIT_PER_MINUTE: 60,
  RATE_LIMIT_RESET_MS: 60000,
  
  // Caching strategy
  CACHE_TTL_MS: 1000 * 60 * 60, // 1 hour
  CACHE_MAX_SIZE: 1000, // LRU limit
  
  // Batching optimization
  BATCH_SIZE: 10,
  BATCH_WAIT_MS: 5000,
  BATCH_MAX_RETRIES: 3,
  BATCH_BACKOFF_MULTIPLIER: 2,
  
  // DOM selectors (Twitter/X specific)
  POST_SELECTOR: 'article[data-testid="tweet"]',
  TEXT_SELECTORS: [
    '[data-testid="tweetText"]',
    'div[lang]',
  ],
  
  // Performance tuning
  MUTATION_DEBOUNCE_MS: 500,
  OBSERVER_THROTTLE_MS: 100,
  OBSERVER_CONFIG: {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  },
});

export const MESSAGES = Object.freeze({
  // Content script → Background
  CLASSIFY_CONTENT: 'classifyContent',
  SET_API_KEY: 'setApiKey',
  GET_QUOTA_INFO: 'getQuotaInfo',
  
  // Background → Content script
  PREFERENCES_UPDATED: 'preferencesUpdated',
  FILTERING_TOGGLED: 'filteringToggled',
  PREFERENCES_RESET: 'preferencesReset',
  QUOTA_UPDATED: 'quotaUpdated',
});

export const STORAGE_KEYS = Object.freeze({
  // API Configuration
  API_KEY: 'apiKey',
  
  // Filtering preferences
  FILTERING_ENABLED: 'filteringEnabled',
  USER_PREFERENCES: 'userPreferences',
  
  // Quota tracking
  DAILY_QUOTA: 'dailyQuota',
  QUOTA_USED: 'quotaUsed',
  QUOTA_RESET_TIME: 'quotaResetTime',
  
  // Authentication (token-based)
  AUTH_TOKEN: 'authToken',
  USER_ID: 'userId',
  TOKEN_ISSUED_AT: 'tokenIssuedAt',
});

export const CLASSIFICATION = Object.freeze({
  ALLOW: 'ALLOW',
  BLOCK: 'BLOCK',
});

export const DOM_ATTRIBUTES = Object.freeze({
  PROCESSED: 'data-processed',
  CLASSIFIED: 'data-classification',
  FILTERED: 'data-filtered',
});

export default { CONFIG, MESSAGES, STORAGE_KEYS, CLASSIFICATION, DOM_ATTRIBUTES };
