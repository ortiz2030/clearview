# ClearView Extension - Activity Logging Guide

## Overview

The ClearView extension now includes comprehensive activity logging across both the content script and background service worker. All activities are tracked in real-time with automatic console output and in-memory buffer storage.

## Accessing Logs

### In Browser Console (Twitter/X Page)

1. **Open Developer Tools** on any Twitter/X page where the extension is active
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Option+I` (Mac)
   - Go to the **Console** tab

2. **View Live Logs**
   ```javascript
   // Display all logs collected so far
   window.CLEARVIEW_LOGS.logs
   
   // Get formatted text output
   window.CLEARVIEW_LOGS.getLogsAsText()
   
   // Get statistics
   window.CLEARVIEW_LOGS.getStats()
   ```

3. **Live Console Output**
   - Logs are color-coded by level:
     - 🔵 **INFO** (Blue) - Normal operations
     - ⚪ **DEBUG** (Gray) - Detailed technical info
     - 🟡 **WARN** (Orange) - Non-critical issues
     - 🔴 **ERROR** (Red) - Critical failures
     - 🟢 **SUCCESS** (Green) - Successful operations

## What Gets Logged

### Content Script (contentScript.js)

| Event | Data Logged | When It Fires |
|-------|------------|-------|
| **Preferences Loaded** | Enabled status, preferences preview | Extension initializes |
| **Post Detected** | Post ID, text length, text preview | New post appears in feed |
| **Post Classified** | Classification result (ALLOW/BLOCK), hash, has preferences | Backend returns classification |
| **Post Blurred** | Hash, type (blur/unblur) | Classification applied to DOM |
| **Preferences Updated** | Enabled status, new preferences | User updates filter preferences in popup |
| **Message Handler Error** | Error message | Unexpected error in message listener |

### Background Script (background.js)

| Event | Data Logged | When It Fires |
|-------|------------|-------|
| **Request Queued** | Hash, content length, has preferences | Content script sends classify request |
| **Duplicate Request Skipped** | Hash | Same post is already being processed |
| **Batch Processing Started** | Batch size, queued items remaining | Batch ready to send (full or timeout) |
| **Batch Config** | Count, preference preview | Before sending to API |
| **Cache Hit** | Hash, cache size | Previously classified post found in cache |
| **Cache Evicted LRU Entry** | Hash of evicted entry | Cache reached max size (1000 items) |
| **Batch Processed** | Count, blocked/allowed split, duration | API returns classifications successfully |
| **Batch Processing Failed** | Error, count, duration | API error or network issue |
| **Rate Limit Exceeded** | Hash | Too many requests per minute |
| **Classification Result** | Hash, result label, has preferences | Final result sent back to content script |
| **Classification Error** | Error message | Unexpected error during classification |

## Usage Examples

### View Last 10 Logs
```javascript
window.CLEARVIEW_LOGS.logs.slice(-10)
```

### Filter Logs by Level
```javascript
// See only errors
window.CLEARVIEW_LOGS.logs.filter(log => log.level === 'ERROR')

// See only successful operations
window.CLEARVIEW_LOGS.logs.filter(log => log.level === 'SUCCESS')
```

### Filter Logs by Event
```javascript
// See all classification events
window.CLEARVIEW_LOGS.logs.filter(log => log.event.includes('Classified'))

// See all cache activity
window.CLEARVIEW_LOGS.logs.filter(log => log.event.includes('Cache'))
```

### Get Formatted Stats
```javascript
window.CLEARVIEW_LOGS.getStats()
// Returns: {
//   total: 45,        // Total log entries
//   blocked: 3,       // Posts blocked by filter
//   allowed: 42,      // Posts allowed
//   cached: 8,        // Cache hits
//   errors: 0         // Errors occurred
// }
```

### Watch Logs in Real-Time
```javascript
// Watch console output as events happen
// Logs appear with [INFO], [DEBUG], [WARN], [ERROR], [SUCCESS] prefixes
// Each log shows: timestamp, level, event, data
```

## Debugging Common Issues

### Preferences Not Working
1. Open Console and check: `window.CLEARVIEW_LOGS.logs.filter(log => log.event.includes('Preferences'))`
2. Verify "Preferences Loaded" shows the correct preference text
3. Check "Post Classified" logs include `hasPreferences: true`
4. If preferences show empty, check popup.js has actually saved them

### Posts Not Being Filtered
1. Check "Post Detected" logs are appearing as you scroll
2. Verify "Post Classified" logs show correct classification (ALLOW/BLOCK)
3. Look for "Batch Processing" logs - is the API responding?
4. Check for ERROR logs in "Batch Processing Failed" or "Classification Error"

### Cache Issues
1. View cache hits: `window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Cache Hit')`
2. Cache size in logs shows current size (max 1000)
3. If cache is full, LRU entries are evicted automatically

### Rate Limiting
1. Check for "Rate Limit Exceeded" logs
2. Rate limit is 60 requests per minute
3. If you hit the limit, requests will wait and retry after reset period

## Exporting Logs

While the UI doesn't have an export button yet, you can copy logs:

```javascript
// Copy all logs as text
copy(window.CLEARVIEW_LOGS.getLogsAsText())

// Then paste into a file for analysis
```

## Performance Impact

- **Memory**: Circular buffer limited to 500 entries (auto-removes oldest)
- **CPU**: Logging adds < 1ms per event
- **Network**: No impact (all logging is local)
- **Storage**: No persistent storage (logs cleared on page reload)

## Log Levels Explained

- **INFO** (Blue): Important operations completed successfully
- **DEBUG** (Gray): Detailed technical information for debugging
- **WARN** (Orange): Non-critical issues that might need attention
- **ERROR** (Red): Critical failures that prevented operation
- **SUCCESS** (Green): Explicitly successful operations worth celebrating

## Privacy Note

All logs stay **locally in your browser** - they are never sent to any server. Logs are cleared when you reload the page.

## Next Steps

Logs can be integrated with:
1. A popup panel showing live logs
2. DevTools integration for persistent viewing
3. Local storage to persist logs across page reloads
4. Export to CSV/JSON for analysis
