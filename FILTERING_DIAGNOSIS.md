# Backend & Filtering Diagnosis

## Quick Test: Is Your Backend Running?

### Step 1: Check if Backend is Running
Open a terminal and run:
```bash
# Check if port 3000 is listening
netstat -an | findstr :3000
# If nothing appears, backend is NOT running

# OR check running processes
tasklist | findstr node
# If you don't see node.exe, backend is not running
```

### Step 2: Start the Backend (if not running)
```bash
# Navigate to backend directory
cd d:\clearview\backend

# Install dependencies (if not done)
npm install

# Start the server
npm start
# You should see: {"event":"SERVER_START","port":3000}
```

### Step 3: Verify Backend Responds
Open a new terminal:
```bash
# Test the /auth endpoint
curl -X POST http://localhost:3000/auth -H "Content-Type: application/json" -d '{"deviceId":"test123"}'

# You should get a response with a token, like:
# {"success":true,"token":"...","userId":"..."}
```

### Step 4: Monitor Backend Logs
Keep the backend terminal open to see real-time logs:
```
Every classification request shows:
{"event":"CLASSIFY_REQUEST","batchSize":X,"preference":"...","userId":"..."}

If you DON'T see these, requests aren't reaching the backend
```

### Step 5: Check Extension Logs for Errors
In Chrome DevTools (Content Script Console):

```javascript
// Check if there are any ERROR logs
window.CLEARVIEW_LOGS.logs.filter(log => log.level === 'ERROR')

// Should show errors like:
// "error": "Failed to fetch" or "TypeError: Network error"
```

## Common Issues & Fixes

### Issue 1: Backend Not Running
**Symptom**: All posts allowed (never blocked), ERROR logs show network issues

**Fix**:
1. Open terminal
2. `cd d:\clearview\backend`
3. `npm install`
4. `npm start`
5. Wait for "SERVER_START" message
6. Reload Twitter/X page

### Issue 2: Backend Running but Not Responding
**Symptom**: ERROR logs show "Failed to fetch" or timeout

**Fix**:
1. Check if port 3000 is actually listening: `netstat -an | findstr :3000`
2. Check backend logs for errors
3. Verify `BACKEND_URL = 'http://localhost:3000'` in background.js
4. Make sure backend is on the correct port

### Issue 3: Preferences Not Being Sent
**Symptom**: Posts classified but not matching your preferences

**Fix**:
1. Open popup.js and set filter preferences
2. Check logs: `window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Preferences Loaded')`
3. Verify `preferencesPreview` shows your text
4. Check "Classification Result" logs show `hasPreferences: true`
5. If hasPreferences is false, preferences weren't loaded from storage

### Issue 4: Backend Responds but Classifications are Wrong
**Symptom**: Posts are being blocked/allowed, but not correctly based on preferences

**Fix**:
1. Check backend logs show correct preference text
2. Verify your preference text is clear and specific
3. Test with a specific phrase like "test123" to see if it blocks those posts
4. Check OpenAI API key is valid: `cat d:\clearview\backend\.env | grep OPENAI`

## Detailed Diagnostic Workflow

### Test 1: Verify Backend Connectivity
```bash
# Terminal 1: Start backend
cd d:\clearview\backend
npm start
# Keep this open

# Terminal 2: Test connectivity
curl http://localhost:3000/auth -X POST -H "Content-Type: application/json" -d '{"deviceId":"test"}'
# Should return token JSON
```

### Test 2: Verify Extension Sees Backend
In Chrome Console:
```javascript
// Check backend URL
fetch('http://localhost:3000/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ deviceId: 'test' })
})
.then(r => r.json())
.then(data => console.log('Backend works:', data))
.catch(err => console.log('Backend failed:', err.message))
```

### Test 3: Verify Preferences are Sent
In Content Script Console:
```javascript
// Check preferences loaded
const prefs = window.CLEARVIEW_LOGS.logs
  .filter(log => log.event === 'Preferences Loaded')
  .slice(-1)[0];
console.log('Preferences:', prefs.data.preferencesPreview);

// Check if sent in classify requests
const classifyLogs = window.CLEARVIEW_LOGS.logs
  .filter(log => log.event === 'Classification Result');
console.log('Has preferences:', classifyLogs.map(log => log.data.hasPreferences));
```

### Test 4: Verify Filtering Applied
In Content Script Console:
```javascript
// Check how many posts were blocked
const blocked = window.CLEARVIEW_LOGS.logs
  .filter(log => log.data.classification === 'BLOCK')
  .length;
const allowed = window.CLEARVIEW_LOGS.logs
  .filter(log => log.data.classification === 'ALLOW')
  .length;
console.log(`Blocked: ${blocked}, Allowed: ${allowed}`);
```

## What Should Happen

### When Everything Works Correctly
1. **Backend Running**: Terminal shows "SERVER_START"
2. **Extension Detects Posts**: Logs show "Post Detected" for each post
3. **Backend Classifies**: Logs show "Batch Processing Started" and "Batch Processed"
4. **Preferences Applied**: Some posts show `classification: "BLOCK"`
5. **Posts Blurred**: Posts with BLOCK are visually blurred on page

### What You'll See in Console
```
[INFO] Preferences Loaded { preferencesPreview: "filter X, Y, Z..." }
[DEBUG] Post Detected { textLength: 145, textPreview: "..." }
[DEBUG] Request Queued { contentLength: 145, hasPreferences: true }
[INFO] Batch Processing Started { count: 1, totalQueued: 0 }
[SUCCESS] Batch Processed { count: 1, blocked: 1, allowed: 0, durationMs: 234 }
[INFO] Classification Result { classification: "BLOCK", hasPreferences: true }
[SUCCESS] Post Blurred { hash: "abc..." }
```

## Step-by-Step Debugging

1. **Verify backend is running**
   - Open terminal, check for node.exe process
   - Or run: `netstat -an | findstr :3000`

2. **Check extension sees preferences**
   - Set preferences in popup
   - Open Console
   - Run: `window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Preferences Loaded')`

3. **Check posts are detected**
   - Scroll feed
   - Run: `window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Post Detected').length`
   - Should be > 0

4. **Check backend gets requests**
   - Look at backend terminal
   - Should see "CLASSIFY_REQUEST" logs

5. **Check preferences are in request**
   - Look at backend logs
   - Should show your preference text, not generic default

6. **Check responses return correctly**
   - Run: `window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Batch Processed')`
   - Should show `blocked` and `allowed` counts

## Key URLs & Ports

| Component | URL | Port | Status Check |
|-----------|-----|------|--------------|
| Backend | localhost:3000 | 3000 | `curl http://localhost:3000/auth` |
| Extension | N/A | N/A | Check chrome://extensions |
| Twitter/X | twitter.com | 443 | Open in browser |

## Files to Check

1. **Backend configuration**
   - `d:\clearview\backend\.env` - Check OPENAI_API_KEY is set
   - `d:\clearview\backend\index.js` - Verify port 3000 is used

2. **Extension configuration**
   - `d:\clearview\background.js` - Check BACKEND_URL = 'http://localhost:3000'
   - `d:\clearview\contentScript.js` - Check preferences load correctly

3. **Logs to monitor**
   - Browser console - Extension logs (LOGGER.logs)
   - Backend terminal - Server logs
   - Windows Task Manager - node.exe process

## Success Criteria

✅ Backend running (terminal shows SERVER_START)
✅ Posts detected (Post Detected logs appear)
✅ Backend requests received (Server logs show CLASSIFY_REQUEST)
✅ Classifications returned (Batch Processed logs show blocked/allowed counts)
✅ Preferences included (Backend logs show your preference text)
✅ Posts blurred (Visual blur overlay appears on blocked posts)

---

**If you still see filtered posts on your timeline after following this guide, please:**
1. Provide the last 5 ERROR logs from `window.CLEARVIEW_LOGS.logs`
2. Provide backend terminal output after making a classification request
3. Provide your filter preferences text
