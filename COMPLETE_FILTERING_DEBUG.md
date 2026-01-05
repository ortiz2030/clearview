# Complete Filtering Debugging Guide

## Symptoms
You set filter preferences but still see filtered content on your timeline.

## Quick Diagnosis (5 minutes)

### Step 1: Open Browser Console
1. Go to Twitter/X
2. Press `F12` to open DevTools
3. Click **Console** tab

### Step 2: Test Backend Connection
Copy and paste this in console:
```javascript
await window.CLEARVIEW_TEST_BACKEND()
```

**Expected Output:**
- ✅ `healthy: true` → Backend is running and working
- ❌ `healthy: false` → Backend is NOT running

### Step 3: Get Current Stats
```javascript
window.CLEARVIEW_GET_STATS()
```

**Expected Output:**
```
{
  total: 45,          // Total log entries
  blocked: 3,         // Should be > 0 if filtering works
  allowed: 42,        // Should be > 0
  cached: 5,          // Cache hits
  errors: 0           // Should be 0 if healthy
}
```

**If blocked is 0**: Filtering is not working

### Step 4: Check Recent Activity
```javascript
window.CLEARVIEW_GET_LOGS(10)
```

**Look for:**
- "Preferences Loaded" with your filter text
- "Post Detected" logs
- "Batch Processed" with blocked > 0
- "Post Blurred" logs

**If you see ERROR logs**: Something failed

### Step 5: Get Detailed Error Info
```javascript
window.CLEARVIEW_FILTER_LOGS('ERROR')
```

This shows only error logs. Common errors:
- "Failed to fetch" → Backend not running
- "Extension context invalidated" → Reload page
- "Rate limit exceeded" → Too many requests

---

## Full Debugging Workflow

### Problem 1: Backend Not Responding
**Symptoms:** All ERROR logs show "Failed to fetch" or "Network error"

**Solution:**
1. **Check if backend is running:**
   ```bash
   # Windows
   netstat -an | findstr :3000
   # If empty output, backend is NOT running
   ```

2. **Start backend:**
   ```bash
   cd d:\clearview\backend
   npm install
   npm start
   ```

3. **Verify it started:**
   - Terminal should show: `{"event":"SERVER_START","port":3000}`
   - Leave this terminal open

4. **Reload Twitter/X page** and test again:
   ```javascript
   await window.CLEARVIEW_TEST_BACKEND()
   // Should now return healthy: true
   ```

### Problem 2: Preferences Not Being Applied
**Symptoms:** Posts classified as ALLOW even though they should be BLOCK

**Solution:**
1. **Check preferences are loaded:**
   ```javascript
   window.CLEARVIEW_FILTER_LOGS('Preferences Loaded')
   ```
   Should show your filter text in `preferencesPreview`

2. **Check preferences are sent with requests:**
   ```javascript
   window.CLEARVIEW_FILTER_LOGS('Request Queued')
   ```
   Should show `hasPreferences: true`

3. **Check preferences reach backend:**
   Look at **backend terminal** output
   Should show your preference text, not generic default

4. **If preferences not loading:**
   - Open popup.js extension popup
   - Enter filter text
   - Scroll down to see "Preferences saved" confirmation
   - Reload page
   - Try again

### Problem 3: Posts Not Being Detected
**Symptoms:** Almost no "Post Detected" logs

**Solution:**
1. **Check posts are being detected:**
   ```javascript
   window.CLEARVIEW_FILTER_LOGS('Post Detected').length
   // Should be > 0
   ```

2. **If 0 posts detected:**
   - Scroll the page - should trigger detection
   - Check browser console for errors
   - Try reloading extension: chrome://extensions → Reload ClearView

3. **Check periodic scanner is running:**
   ```javascript
   window.CLEARVIEW_FILTER_LOGS('Posts Processing Scan').length
   // Should have many entries
   ```

4. **If no processing scans:**
   - Periodic scanner not working
   - Reload extension and page
   - Check for JavaScript errors in console

### Problem 4: Backend Running but Wrong Classifications
**Symptoms:** Backend responds but posts not correctly filtered

**Solution:**
1. **Check what preference is being used:**
   ```javascript
   // Look at backend logs in terminal
   // Should show your preference text
   ```

2. **Test with specific word:**
   - Change preference to: "block posts with word 'test123'"
   - Find a post with that word
   - Should be blocked

3. **Check OpenAI API key:**
   ```bash
   # View .env file
   type d:\clearview\backend\.env | findstr OPENAI
   # Should show your API key
   ```

4. **If API key wrong:**
   - Get new key from https://platform.openai.com/api-keys
   - Update `d:\clearview\backend\.env`
   - Restart backend: Stop (Ctrl+C) and `npm start` again

---

## Console Commands Reference

### Statistics & Monitoring
```javascript
// Get stats
window.CLEARVIEW_GET_STATS()

// Get last 20 logs
window.CLEARVIEW_GET_LOGS(20)

// Get last 50 logs
window.CLEARVIEW_GET_LOGS(50)
```

### Filtering Logs
```javascript
// All preference-related logs
window.CLEARVIEW_FILTER_LOGS('Preferences')

// All error logs
window.CLEARVIEW_FILTER_LOGS('ERROR')

// All classification logs
window.CLEARVIEW_FILTER_LOGS('Classified')

// All post detection logs
window.CLEARVIEW_FILTER_LOGS('Post Detected')

// All batch processing logs
window.CLEARVIEW_FILTER_LOGS('Batch')

// All cache-related logs
window.CLEARVIEW_FILTER_LOGS('Cache')
```

### Backend & Connectivity
```javascript
// Test backend health
await window.CLEARVIEW_TEST_BACKEND()

// Result will be:
// {
//   healthy: true/false,
//   status: 200 (if connected),
//   data: { token: "...", userId: "..." }
// }
```

### Raw Data Access
```javascript
// All logs as array
window.CLEARVIEW_LOGS.logs

// Filter by level
window.CLEARVIEW_LOGS.logs.filter(log => log.level === 'ERROR')

// Filter by event
window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Post Classified')

// Get formatted text
window.CLEARVIEW_LOGS.getLogsAsText()
```

---

## Detailed Log Analysis

### What Should Appear When Healthy

**On Page Load:**
```
[INFO] Preferences Loaded { preferencesPreview: "block hate speech..." }
[INFO] Content Script Initialized { filteringEnabled: true, preferencesSet: true }
[INFO] Observer Initialized { target: "section", ariaLabel: "Home timeline" }
[DEBUG] Periodic Post Scanner Started { intervalMs: 3000 }
```

**When Posts Appear (on scroll):**
```
[DEBUG] Mutation Detected { timestamp: "..." }
[DEBUG] Post Detected { postId: "abc...", textLength: 145, textPreview: "..." }
[DEBUG] Request Queued { hash: "def...", contentLength: 145, hasPreferences: true }
```

**Backend Processing:**
```
[INFO] Batch Processing Started { count: 1, totalQueued: 0 }
[DEBUG] Batch Config { count: 1, preference: "block hate..." }
[SUCCESS] Batch Processed { count: 1, blocked: 1, allowed: 0, durationMs: 234 }
[INFO] Classification Result { classification: "BLOCK", hasPreferences: true }
[SUCCESS] Post Blurred { hash: "def..." }
```

### What Indicates Problems

**Backend Not Running:**
```
[ERROR] Batch Processing Failed { 
  error: "Failed to fetch",
  errorType: "TypeError",
  backendUrl: "http://localhost:3000"
}
```
→ Start backend with `npm start`

**Preferences Not Sent:**
```
[INFO] Request Queued { hasPreferences: false }
```
→ Set preferences in popup and reload page

**Rate Limited:**
```
[WARN] Rate Limit Exceeded { hash: "abc..." }
```
→ Too many requests, wait 1 minute

**Extension Context Lost:**
```
[WARN] Preferences Load Failed { reason: "Extension context invalidated" }
```
→ Reload page or reload extension at chrome://extensions

---

## Step-by-Step Verification

### Scenario: "I set preferences but posts aren't blocked"

**Check 1: Preferences stored correctly**
```javascript
chrome.storage.sync.get(['userPreferences', 'filteringEnabled'], result => {
  console.log('Stored preferences:', result);
});
```
Should show your filter text

**Check 2: Backend running**
```javascript
await window.CLEARVIEW_TEST_BACKEND()
```
Should return `healthy: true`

**Check 3: Posts detected**
```javascript
window.CLEARVIEW_GET_STATS()
```
`total` should be > 0

**Check 4: Preferences in requests**
```javascript
window.CLEARVIEW_FILTER_LOGS('Request Queued')
```
Should show `hasPreferences: true`

**Check 5: Blocking happening**
```javascript
window.CLEARVIEW_GET_STATS()
```
`blocked` count should be > 0

**Check 6: Visual filtering applied**
Look at page - blocked posts should have "Content filtered" overlay

---

## Common Solutions

| Problem | Solution | Command |
|---------|----------|---------|
| Backend not responding | Start backend | `cd d:\clearview\backend && npm start` |
| Preferences not saved | Set in popup | Click popup, enter text, wait 2s |
| Posts not detected | Reload page | F5 or Ctrl+R |
| Extension stopped | Reload extension | chrome://extensions → Reload |
| Wrong classification | Check API key | `type d:\clearview\backend\.env` |
| Too many errors | Clear logs | Reload page (logs clear on reload) |

---

## When to Check Backend Logs

Keep backend terminal visible and look for patterns:

**Good Request:**
```
{"event":"CLASSIFY_REQUEST","batchSize":1,"userId":"xyz","preference":"block hate speech"}
{"event":"CLASSIFY_SUCCESS","batchSize":1,"blocked":1,"allowed":0}
```

**Failed Request:**
```
{"event":"AUTH_FAILED","error":"Invalid token"}
{"event":"AI_ERROR","error":"OpenAI API failed"}
```

If you see errors, report them with the full log line.

---

## Escalation Checklist

If filtering still doesn't work after all above steps:

- [ ] Backend running (netstat shows :3000)
- [ ] Backend health check passes (CLEARVIEW_TEST_BACKEND returns healthy: true)
- [ ] Preferences saved (chrome.storage.sync shows text)
- [ ] Posts detected (GET_STATS shows total > 0)
- [ ] Preferences sent (Request Queued shows hasPreferences: true)
- [ ] No ERROR logs (FILTER_LOGS('ERROR') is empty)
- [ ] Classifications returned (Batch Processed shows blocked count)
- [ ] Posts blurred visually (See "Content filtered" overlay)

If any step fails:
1. Run the diagnostic commands
2. Copy the output
3. Check the detailed section above for that symptom
4. Follow the solution
5. Reload page and test again

---

## Quick Reset

If everything is broken:

```bash
# Stop backend
Ctrl+C in backend terminal

# Clear extension data
# In chrome://extensions → Details → Storage → Clear data

# Reload extension
# chrome://extensions → Reload ClearView

# Restart backend
cd d:\clearview\backend
npm start

# Reload Twitter/X page
F5

# Test again
# Open console and run: await window.CLEARVIEW_TEST_BACKEND()
```

---

**The filtering system requires:**
1. ✅ Backend running (localhost:3000)
2. ✅ Preferences set in popup
3. ✅ Posts detected (scroll page)
4. ✅ Classifications returned (no errors)
5. ✅ Posts blurred (visual confirmation)

If any step fails, filtering won't work.
