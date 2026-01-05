/**
 * ClearView Extension Popup Script
 * Manages user preferences, storage, and content script communication
 */

// DOM Elements
const filterToggle = document.getElementById('filterToggle');
const statusText = document.getElementById('statusText');
const preferencesTextarea = document.getElementById('preferencesTextarea');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const quotaCount = document.getElementById('quotaCount');
const saveMessage = document.getElementById('saveMessage');
const settingsBtn = document.getElementById('settingsBtn');
const feedbackBtn = document.getElementById('feedbackBtn');

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES = {
  enabled: true,
  preferences: 'Filter hateful content, misinformation, and spam',
  dailyQuota: 100,
  quotaUsed: 55,
};

/**
 * Load preferences from chrome.storage.sync
 */
async function loadPreferences() {
  try {
    const result = await chrome.storage.sync.get([
      'filteringEnabled',
      'userPreferences',
      'dailyQuota',
      'quotaUsed',
    ]);

    const filteringEnabled = result.filteringEnabled !== false; // Default true
    const userPreferences = result.userPreferences || DEFAULT_PREFERENCES.preferences;
    const dailyQuota = result.dailyQuota || DEFAULT_PREFERENCES.dailyQuota;
    const quotaUsed = result.quotaUsed || DEFAULT_PREFERENCES.quotaUsed;

    // Update UI
    filterToggle.checked = filteringEnabled;
    preferencesTextarea.value = userPreferences;
    updateStatusText(filteringEnabled);
    updateQuotaDisplay(quotaUsed, dailyQuota);

    console.log('Preferences loaded successfully');
  } catch (error) {
    console.error('Error loading preferences:', error);
    showError('Failed to load preferences');
  }
}

/**
 * Save preferences to chrome.storage.sync
 */
async function savePreferences() {
  try {
    const preferences = preferencesTextarea.value.trim();

    if (!preferences || preferences.length < 5) {
      showError('Preferences must be at least 5 characters long');
      return;
    }

    await chrome.storage.sync.set({
      userPreferences: preferences,
      filteringEnabled: filterToggle.checked,
    });

    // Notify content scripts of change
    notifyContentScripts({
      action: 'preferencesUpdated',
      preferences: preferences,
      enabled: filterToggle.checked,
    });

    showSuccess('Preferences saved successfully!');
    console.log('Preferences saved');
  } catch (error) {
    console.error('Error saving preferences:', error);
    showError('Failed to save preferences');
  }
}

/**
 * Reset preferences to default
 */
async function resetPreferences() {
  try {
    preferencesTextarea.value = DEFAULT_PREFERENCES.preferences;
    filterToggle.checked = DEFAULT_PREFERENCES.enabled;
    updateStatusText(DEFAULT_PREFERENCES.enabled);

    await chrome.storage.sync.set({
      userPreferences: DEFAULT_PREFERENCES.preferences,
      filteringEnabled: DEFAULT_PREFERENCES.enabled,
    });

    notifyContentScripts({
      action: 'preferencesReset',
      preferences: DEFAULT_PREFERENCES.preferences,
      enabled: DEFAULT_PREFERENCES.enabled,
    });

    showSuccess('Preferences reset to default');
    console.log('Preferences reset');
  } catch (error) {
    console.error('Error resetting preferences:', error);
    showError('Failed to reset preferences');
  }
}

/**
 * Handle toggle switch change
 */
async function handleToggleChange() {
  try {
    const enabled = filterToggle.checked;
    updateStatusText(enabled);

    await chrome.storage.sync.set({
      filteringEnabled: enabled,
    });

    // Notify content scripts immediately
    notifyContentScripts({
      action: 'filteringToggled',
      enabled: enabled,
    });

    const message = enabled ? 'Filtering enabled' : 'Filtering disabled';
    showSuccess(message);
  } catch (error) {
    console.error('Error toggling filter:', error);
    showError('Failed to update filter status');
  }
}

/**
 * Update status text based on enabled state
 */
function updateStatusText(enabled) {
  statusText.textContent = enabled ? 'Active' : 'Inactive';
  statusText.className = `status-indicator ${enabled ? 'active' : ''}`;
}

/**
 * Update quota display
 */
function updateQuotaDisplay(used, total) {
  const remaining = Math.max(0, total - used);
  quotaCount.textContent = remaining;
}

/**
 * Notify all content scripts of changes
 */
function notifyContentScripts(message) {
  try {
    // Get all tabs and send message to Twitter/X tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (
          tab.url &&
          (tab.url.includes('twitter.com') || tab.url.includes('x.com'))
        ) {
          chrome.tabs.sendMessage(tab.id, message).catch((error) => {
            // Content script might not be ready, ignore
            console.debug('Failed to notify tab:', error.message);
          });
        }
      });
    });
  } catch (error) {
    console.error('Error notifying content scripts:', error);
  }
}

/**
 * Show success message
 */
function showSuccess(message) {
  saveMessage.textContent = message;
  saveMessage.classList.add('show');
  setTimeout(() => {
    saveMessage.classList.remove('show');
  }, 2500);
}

/**
 * Show error message
 */
function showError(message) {
  saveMessage.textContent = `❌ ${message}`;
  saveMessage.style.color = '#ef4444';
  saveMessage.classList.add('show');
  setTimeout(() => {
    saveMessage.classList.remove('show');
    saveMessage.style.color = '#10b981'; // Reset to success color
  }, 3000);
}

/**
 * Update quota from background script
 */
function updateQuotaFromBackground() {
  chrome.runtime.sendMessage(
    { action: 'getQuotaInfo' },
    (response) => {
      if (response && response.quotaUsed !== undefined) {
        updateQuotaDisplay(response.quotaUsed, response.dailyQuota);
      }
    }
  );
}

/**
 * Handle settings button click
 */
function handleSettingsClick() {
  // Future: open full settings page
  // For now, settings are available in this popup
  // Scroll to preferences section to highlight settings
  const preferencesCard = document.querySelector('.preferences-card');
  if (preferencesCard) {
    preferencesCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    preferencesCard.style.outline = '2px solid #3b82f6';
    setTimeout(() => {
      preferencesCard.style.outline = '';
    }, 2000);
  }
  showSuccess('Settings are available below');
}

/**
 * Handle feedback button click
 */
function handleFeedbackClick() {
  // Open feedback form or email
  chrome.tabs.create({
    url: 'https://forms.example.com/feedback',
  });
}

/**
 * Initialize popup on open
 */
function initPopup() {
  try {
    // Load preferences
    loadPreferences();

    // Update quota
    updateQuotaFromBackground();

    // Set up event listeners
    filterToggle.addEventListener('change', handleToggleChange);
    saveBtn.addEventListener('click', savePreferences);
    resetBtn.addEventListener('click', resetPreferences);
    settingsBtn.addEventListener('click', handleSettingsClick);
    feedbackBtn.addEventListener('click', handleFeedbackClick);

    // Auto-save preferences on textarea change (debounced)
    let saveTimeout;
    preferencesTextarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        // Optional: auto-save after user stops typing
        // Disabled by default - user must click Save
      }, 2000);
    });

    console.log('Popup initialized');
  } catch (error) {
    console.error('Error initializing popup:', error);
    showError('Failed to initialize popup');
  }
}

/**
 * Listen for storage changes from other windows/tabs
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    if (changes.filteringEnabled) {
      filterToggle.checked = changes.filteringEnabled.newValue;
      updateStatusText(changes.filteringEnabled.newValue);
    }
    if (changes.userPreferences) {
      preferencesTextarea.value = changes.userPreferences.newValue;
    }
    if (changes.quotaUsed) {
      const quota = changes.quotaUsed.newValue;
      const dailyQuota = 100; // Get from storage or background
      updateQuotaDisplay(quota, dailyQuota);
    }
  }
});

/**
 * Listen for messages from content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'quotaUpdated') {
    updateQuotaDisplay(request.quotaUsed, request.dailyQuota);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
