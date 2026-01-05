# Filtering Issue Diagnosis - Tools Added

## The Problem
You set filter preferences but posts are still appearing on your timeline (not being filtered/blocked).

## Root Causes (Most Common)
1. **Backend server not running** - Posts default to ALLOW (fail-open)
2. **Preferences not stored** - Filter settings not saved to chrome.storage
3. **Preferences not sent** - Filter text not included in API requests
4. **Backend not responding** - Connection failed, falling back to ALLOW all

## Solutions Added

### 1. Backend Health Check
Added a test function to verify backend is running:

**In Chrome Console:**
```javascript
await window.CLEARVIEW_TEST_BACKEND()
```

**Output:**
- ✅ `healthy: true` → Backend is working
- ❌ `healthy: false` → Backend is NOT running
- ❌ Network error → Backend at wrong URL

**If fails:** Start backend with:
```bash
cd d:\clearview\backend
npm start
```

### 2. Enhanced Logging
Added detailed error logging including:
- Error type (TypeError, NetworkError, etc.)
- Backend URL being called
- Full error context

**Check for errors:**
```javascript
window.CLEARVIEW_FILTER_LOGS('ERROR')
```

### 3. Debug Console Commands
Added 4 convenient console functions:

#### Get Statistics
```javascript
window.CLEARVIEW_GET_STATS()
// Returns: { blocked: X, allowed: Y, cached: Z, errors: E }
```

#### View Recent Logs
```javascript
window.CLEARVIEW_GET_LOGS(20)  // Last 20 logs
window.CLEARVIEW_GET_LOGS(50)  // Last 50 logs
```

#### Filter Logs by Event
```javascript
window.CLEARVIEW_FILTER_LOGS('ERROR')        // All errors
window.CLEARVIEW_FILTER_LOGS('Preferences')  // Preference-related
window.CLEARVIEW_FILTER_LOGS('Classified')   // Classification results
window.CLEARVIEW_FILTER_LOGS('Batch')        // Batch processing
```

### 4. Comprehensive Documentation
Created step-by-step debugging guides:
- `COMPLETE_FILTERING_DEBUG.md` - Full diagnosis workflow
- `FILTERING_DIAGNOSIS.md` - Quick issue identification

## Quick 5-Minute Test

1. **Open Twitter/X** and press F12 (DevTools)
2. **Go to Console tab**
3. **Run test:**
   ```javascript
   await window.CLEARVIEW_TEST_BACKEND()
   ```
4. **Check result:**
   - `healthy: true` → Backend works, check preferences
   - `healthy: false` → Start backend (see below)

5. **Get stats:**
   ```javascript
   window.CLEARVIEW_GET_STATS()
   ```
   - `blocked: 0` → Filtering not working
   - `blocked: > 0` → Filtering IS working (check visual display)

## Most Common Fix

**If backend test fails with "Failed to fetch":**

```bash
# Terminal 1: Start the backend
cd d:\clearview\backend
npm install
npm start

# Keep this terminal open - you'll see logs here

# Terminal 2: Verify it's running
netstat -an | findstr :3000
# Should show: TCP    127.0.0.1:3000     0.0.0.0:0    LISTENING
```

Then reload Twitter/X and test again.

## What Gets Logged

### Successful Filtering Flow
```
✅ Preferences loaded
✅ Posts detected
✅ Request sent with preferences
✅ Backend processes batch
✅ Classifications received (BLOCK or ALLOW)
✅ Posts blurred if BLOCK
```

### When Backend Not Running
```
❌ "Batch Processing Failed" - error: "Failed to fetch"
❌ All posts classified as ALLOW (fail-open)
❌ No "Batch Processed" success logs
```

### When Preferences Missing
```
❌ "Preferences Loaded" shows empty text
❌ "Request Queued" shows hasPreferences: false
❌ Backend doesn't know what to filter
```

## File Changes Made

| File | Change |
|------|--------|
| background.js | Added testBackendHealth() function and message handler |
| contentScript.js | Added CLEARVIEW_TEST_BACKEND, GET_STATS, GET_LOGS, FILTER_LOGS |
| contentScript.js | Enhanced error logging with error type and URL |
| background.js | Enhanced error logging with backend URL context |

## Documentation Created

| File | Purpose |
|------|---------|
| COMPLETE_FILTERING_DEBUG.md | Full debugging workflow with all console commands |
| FILTERING_DIAGNOSIS.md | Quick issue identification and fixes |

## Testing Workflow

### 1. Quick Health Check (2 min)
```javascript
// Test backend
await window.CLEARVIEW_TEST_BACKEND()

// Get stats
window.CLEARVIEW_GET_STATS()

// Check errors
window.CLEARVIEW_FILTER_LOGS('ERROR')
```

### 2. Detailed Analysis (5 min)
```javascript
// Get all logs
window.CLEARVIEW_GET_LOGS(50)

// Check preferences
window.CLEARVIEW_FILTER_LOGS('Preferences')

// Check posts detected
window.CLEARVIEW_FILTER_LOGS('Post Detected').length

// Check backend responses
window.CLEARVIEW_FILTER_LOGS('Batch Processed')
```

### 3. Full Debug (10 min)
Follow `COMPLETE_FILTERING_DEBUG.md` step-by-step

## Success Indicators

✅ `window.CLEARVIEW_TEST_BACKEND()` returns `healthy: true`
✅ `window.CLEARVIEW_GET_STATS()` shows `blocked > 0`
✅ `window.CLEARVIEW_FILTER_LOGS('ERROR')` shows no errors
✅ Posts have "Content filtered" overlay
✅ Backend terminal shows "CLASSIFY_SUCCESS" logs

## If It's Still Not Working

1. **Verify backend is actually running:**
   ```bash
   netstat -an | findstr :3000
   # Must show LISTENING
   ```

2. **Check all prerequisites are met:**
   - Backend running (npm start)
   - Preferences set in popup
   - Twitter/X page loaded
   - DevTools console open

3. **Run full diagnostic:**
   - Follow steps in `COMPLETE_FILTERING_DEBUG.md`
   - Collect output from console commands
   - Check backend terminal logs
   - Verify error messages

4. **Common issues to check:**
   - Is backend URL correct? (should be `http://localhost:3000`)
   - Are preferences actually saved? (chrome.storage.sync)
   - Is OpenAI API key valid? (check `.env` file)
   - Are preferences being sent? (check logs show `hasPreferences: true`)

## Support Info to Collect

If you need help, run:
```javascript
// System info
console.log('Backend URL:', 'http://localhost:3000');
console.log('Extension version:', chrome.runtime.getManifest().version);

// Current state
window.CLEARVIEW_GET_STATS()
window.CLEARVIEW_FILTER_LOGS('ERROR')

// Backend status
await window.CLEARVIEW_TEST_BACKEND()
```

Then share the output along with:
- Your filter preferences text
- Last 5 error logs
- Backend terminal output (if available)

---

**Status**: ✅ Enhanced with comprehensive debugging tools
