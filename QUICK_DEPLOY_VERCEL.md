# Quick Vercel Deployment - 10 Minute Setup

## What You'll Get
- **Free backend hosting** on Vercel
- **Auto-scaling** - handles thousands of users
- **HTTPS by default** - secure connections
- **Global CDN** - fast responses worldwide

## Prerequisites (1 min)
- [ ] Vercel account (free signup at vercel.com)
- [ ] GitHub account (free signup at github.com)
- [ ] Backend code ready (already done)

## Step-by-Step Deployment (10 min)

### Step 1: Verify Backend is Ready (1 min)
```bash
cd d:\clearview\backend
node verify-deployment.js
```
Should show: ✅ All checks passed

### Step 2: Set Up Git Repository (2 min)

**First time setup only:**
```bash
cd d:\clearview

# Initialize git if not done
git init

# Configure git
git config user.email "your.email@example.com"
git config user.name "Your Name"

# Add all files
git add .

# Commit
git commit -m "Initial commit - ClearView backend"
```

### Step 3: Create GitHub Repository (2 min)

1. Go to https://github.com/new
2. Repository name: `clearview`
3. Description: "ClearView - AI content filtering for Twitter/X"
4. Leave as **Public** (free tier)
5. Click "Create repository"

### Step 4: Push to GitHub (2 min)

GitHub will show you commands. Copy and run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/clearview.git
git branch -M main
git push -u origin main
```

### Step 5: Deploy to Vercel (3 min)

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Paste: `https://github.com/YOUR_USERNAME/clearview.git`
4. Select `backend` folder as root directory
5. Click "Deploy" button

Wait 2-3 minutes for deployment to complete.

### Step 6: Add Environment Variables (2 min)

After deployment succeeds:

1. Vercel dashboard shows your project
2. Click "Settings" button
3. Click "Environment Variables" left sidebar
4. Add these variables:

```
Name: NODE_ENV
Value: production

Name: OPENAI_API_KEY  
Value: sk-proj-VkOi3L2Gc5... (from your .env)

Name: ALLOWED_ORIGINS
Value: chrome-extension://*

Name: PORT
Value: 3000
```

5. Click "Save"
6. Click "Deployments" and redeploy (button appears)

### Step 7: Get Your URL (1 min)

On Vercel dashboard:
- Look for "Production" URL (looks like: `https://clearview-backend.vercel.app`)
- Copy this URL

### Step 8: Update Extension (1 min)

Edit `d:\clearview\background.js`:

Find this line:
```javascript
const BACKEND_URL = 'http://localhost:3000';
```

Replace with:
```javascript
const BACKEND_URL = 'https://clearview-backend.vercel.app';
```

(Use YOUR Vercel URL)

### Step 9: Reload Extension (1 min)

1. Go to `chrome://extensions`
2. Find "ClearView"
3. Click the refresh icon ↻

### Step 10: Test (2 min)

1. Go to Twitter/X
2. Press F12 (DevTools)
3. Go to Console
4. Paste:
   ```javascript
   await window.CLEARVIEW_TEST_BACKEND()
   ```
5. Should show: `healthy: true` ✅

**Done!** Your backend is now on Vercel! 🎉

## Verify It's Working

### Test Backend Health
```bash
# In any terminal:
curl https://YOUR_VERCEL_URL/auth \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test"}'

# Should return token JSON
```

### Check Extension Logs
In Chrome Console:
```javascript
window.CLEARVIEW_GET_STATS()
// Should show blocked > 0
```

## Troubleshooting

### Vercel Deployment Failed
1. Check "Build logs" in Vercel dashboard
2. Common issues:
   - Missing dependencies (npm install)
   - Node version mismatch (use Node 18+)
   - Missing files

### Backend Test Returns `healthy: false`
1. Verify URL is correct in `background.js`
2. Check Vercel "Runtime logs"
3. Make sure environment variables are set
4. Reload extension (Ctrl+Shift+R)

### Posts Still Not Filtered
1. Verify backend is healthy: `await window.CLEARVIEW_TEST_BACKEND()`
2. Check error logs: `window.CLEARVIEW_FILTER_LOGS('ERROR')`
3. Make sure preferences are set in popup
4. Check `window.CLEARVIEW_GET_STATS()` shows blocked > 0

## What's Happening Behind Scenes

```
Twitter/X Page
      ↓
Content Script detects posts
      ↓
Sends to Background Script with preferences
      ↓
Background batches & sends to Vercel backend
      ↓
Vercel (Express API)
      ↓
OpenAI GPT-4 classifies based on preferences
      ↓
Returns ALLOW/BLOCK
      ↓
Content Script applies blur if BLOCK
```

## Ongoing Updates

After initial deployment, any changes deploy automatically:

```bash
# Make code changes
# ...edit your code...

# Push to GitHub
git add .
git commit -m "Updated classification logic"
git push

# Vercel auto-deploys within seconds
```

## Cost Analysis

- **Vercel**: Free tier (generous limits)
- **OpenAI**: ~$0.01 per 1000 classifications
- **Total monthly**: Likely $1-5 for normal usage

## Support

If deployment fails:
1. Check Vercel build logs
2. See `VERCEL_DEPLOYMENT_GUIDE.md` for detailed guide
3. Common issues section above

## Success Checklist

- [ ] Backend verified with `verify-deployment.js`
- [ ] Repository pushed to GitHub
- [ ] Deployed to Vercel successfully
- [ ] Environment variables set in Vercel
- [ ] Extension updated with Vercel URL
- [ ] Extension reloaded
- [ ] Backend health check returns `healthy: true`
- [ ] Filter test shows `blocked > 0`

---

**You're done!** Your ClearView backend is now live on Vercel! 🚀
