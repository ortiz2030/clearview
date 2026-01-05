# Vercel Deployment - Common Issues & Solutions

## Issue 1: Deployment Failed - Build Error

### Symptom
Vercel dashboard shows red "Failed" status on deployment

### Solution
1. Click on failed deployment
2. Click "Build logs" tab
3. Look for error message

**Common causes:**
- Missing dependencies in `package.json`
- Node version incompatibility
- Missing files

**Fix:**
```bash
# Make sure all dependencies are installed
cd d:\clearview\backend
npm install

# Commit and push
git add package-lock.json
git commit -m "Update dependencies"
git push
```

---

## Issue 2: 502 Bad Gateway Error

### Symptom
Backend responds with "502 Bad Gateway"

### Cause
Application crashed on Vercel

### Solution
1. Go to Vercel dashboard
2. Click "Deployments" tab
3. Click current deployment
4. Click "Runtime logs" tab
5. Look for error messages

**Common fixes:**
```bash
# Check backend runs locally first
cd d:\clearview\backend
npm start
# Should show: {"event":"SERVER_START","port":3000}

# If it crashes, check:
# - OPENAI_API_KEY is valid
# - All modules import correctly
# - No infinite loops
```

---

## Issue 3: CORS Error in Console

### Symptom
Chrome Console shows: `No 'Access-Control-Allow-Origin' header`

### Cause
Backend not allowing requests from extension

### Solution
1. Vercel Dashboard → Settings → Environment Variables
2. Add: `ALLOWED_ORIGINS=chrome-extension://*`
3. Redeploy (there should be a "Redeploy" button)

---

## Issue 4: Backend Test Returns `healthy: false`

### Symptom
```javascript
await window.CLEARVIEW_TEST_BACKEND()
// Returns: { healthy: false, error: "Failed to fetch" }
```

### Causes & Solutions

**Cause 1: Wrong URL in extension**
```javascript
// Check what URL is being used
// Look at background.js line ~48
const BACKEND_URL = '???'  // Should be your Vercel URL
```

**Fix:**
1. Edit `d:\clearview\background.js`
2. Change `const BACKEND_URL = 'http://localhost:3000'`
3. To: `const BACKEND_URL = 'https://YOUR_VERCEL_PROJECT.vercel.app'`
4. Save file
5. Reload extension at chrome://extensions

**Cause 2: Backend crashed**
1. Go to Vercel dashboard
2. Check "Runtime logs"
3. Look for error message
4. If red "500 errors", backend is crashing

**Fix:**
1. Check OPENAI_API_KEY environment variable
2. Verify API key is valid at platform.openai.com
3. Check for typos in .env
4. Redeploy

**Cause 3: Vercel still building**
1. Wait 2-3 minutes for deployment to complete
2. Refresh browser
3. Try again

---

## Issue 5: Extension Logs Show Errors

### Symptom
```javascript
window.CLEARVIEW_FILTER_LOGS('ERROR')
// Shows: "Batch Processing Failed", "Failed to fetch"
```

### Solution
**Step 1:** Check backend health
```javascript
await window.CLEARVIEW_TEST_BACKEND()
```

**Step 2:** If unhealthy, check Vercel logs
- Vercel Dashboard → Deployments → Runtime logs

**Step 3:** Common error sources
- **"Failed to fetch"** → Network/URL issue
- **"Timeout"** → Backend too slow (check Runtime logs)
- **"401 Unauthorized"** → Token issue (check auth.js)
- **"500 Internal Error"** → Backend crash (check Runtime logs)

---

## Issue 6: Posts Not Being Filtered

### Symptom
Backend is healthy but posts not being blocked

### Solution

**Step 1:** Verify preferences are set
```javascript
window.CLEARVIEW_FILTER_LOGS('Preferences Loaded')
// Should show your preference text, not empty
```

If empty:
- Go to extension popup
- Enter filter preferences
- Reload page

**Step 2:** Verify posts are being detected
```javascript
window.CLEARVIEW_FILTER_LOGS('Post Detected').length
// Should be > 0 after scrolling
```

If 0:
- Scroll the Twitter/X feed
- New posts should trigger detection

**Step 3:** Check backend is classifying
```javascript
window.CLEARVIEW_FILTER_LOGS('Batch Processed')
// Should show backend classifications
```

If empty:
- Backend not responding
- Go back to Issue 4

---

## Issue 7: Slow Performance

### Symptom
Classifications taking > 5 seconds

### Causes

**Cause 1: OpenAI API slow**
- Happens during peak usage
- Not much you can do
- Try again later

**Cause 2: Vercel cold start**
- First request to Vercel after idle → slow (3-5s)
- Subsequent requests fast (0.5-1s)
- Normal for free tier

**Cause 3: Too many posts in batch**
- Increase `BATCH_WAIT_MS` in contentScript.js
- Change from 5000ms to 10000ms (wait longer before batching)

---

## Issue 8: OpenAI API Errors

### Symptom
Vercel Runtime logs show OpenAI errors

### Common Errors

**"Invalid API Key"**
```
Check OPENAI_API_KEY in Vercel environment variables
Make sure it starts with: sk-proj-
```

**"Insufficient quota"**
```
Your OpenAI account is out of credits
Go to https://platform.openai.com/account/billing
Add payment method or credit
```

**"Rate limited"**
```
Sending too many requests to OpenAI
This extension has built-in rate limiting
Check if you're running multiple instances
```

---

## Issue 9: Can't Push to GitHub

### Symptom
```
fatal: 'origin' does not appear to be a git repository
```

### Solution
```bash
# Add remote repository
git remote add origin https://github.com/YOUR_USERNAME/clearview.git

# Set branch
git branch -M main

# Push
git push -u origin main
```

---

## Issue 10: Environment Variables Not Taking Effect

### Symptom
Changed environment variable but backend still uses old value

### Solution
1. After changing environment variables in Vercel
2. Must **redeploy** the application
3. Vercel should show "Redeploy" button after saving env vars
4. Click it and wait for redeploy
5. Old env vars only reload with redeploy

---

## Quick Diagnostic Commands

Run these in order to diagnose issues:

```javascript
// 1. Test backend connectivity
await window.CLEARVIEW_TEST_BACKEND()

// 2. Check statistics
window.CLEARVIEW_GET_STATS()

// 3. View recent logs
window.CLEARVIEW_GET_LOGS(20)

// 4. Check errors
window.CLEARVIEW_FILTER_LOGS('ERROR')

// 5. Check preferences loaded
window.CLEARVIEW_FILTER_LOGS('Preferences')

// 6. Check posts detected
window.CLEARVIEW_FILTER_LOGS('Post Detected')

// 7. Check batch processing
window.CLEARVIEW_FILTER_LOGS('Batch')
```

---

## Getting Help

### Check These First
1. Vercel dashboard → Runtime logs
2. Chrome DevTools Console (F12)
3. Backend terminal (if running locally)
4. OpenAI status page: https://status.openai.com

### Useful URLs
- Vercel Status: https://www.vercelstatus.com
- OpenAI Status: https://status.openai.com
- Vercel Docs: https://vercel.com/docs
- GitHub Status: https://www.githubstatus.com

---

## Prevention Checklist

- [ ] Test locally before deploying (`npm start`)
- [ ] Run verification script (`node verify-deployment.js`)
- [ ] Check Vercel logs after deployment
- [ ] Monitor OpenAI API usage
- [ ] Keep .env file out of Git
- [ ] Set environment variables in Vercel (not .env files)
- [ ] Test with `window.CLEARVIEW_TEST_BACKEND()` after deployment

---

**If you're still stuck, collect the output from the diagnostic commands above and check the Vercel runtime logs for the exact error message.**
