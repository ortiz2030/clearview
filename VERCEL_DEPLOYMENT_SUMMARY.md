# Vercel Deployment - Complete Summary

## Files Created for Deployment

| File | Purpose |
|------|---------|
| `backend/vercel.json` | Vercel configuration (serverless setup) |
| `backend/.vercelignore` | Files to ignore during deployment |
| `backend/verify-deployment.js` | Pre-deployment verification script |
| `QUICK_DEPLOY_VERCEL.md` | **START HERE** - 10 minute deployment guide |
| `VERCEL_DEPLOYMENT_GUIDE.md` | Detailed deployment walkthrough |
| `DEPLOYMENT_CHECKLIST.md` | Checklist to track deployment progress |
| `VERCEL_TROUBLESHOOTING.md` | Common issues and solutions |

## What Happens During Deployment

```
Your Code (Git)
    ↓
GitHub Repository
    ↓
Vercel (Import & Build)
    ↓
Environment Variables
    ↓
Express App Deployed
    ↓
Live at https://YOUR_PROJECT.vercel.app
    ↓
Extension Connects & Classifies Posts
```

## Quick Summary

1. **Prepare** (5 min)
   - Run `node verify-deployment.js`
   - Ensure backend runs locally

2. **GitHub** (3 min)
   - Create GitHub account
   - Create `clearview` repository
   - Push code with `git push`

3. **Vercel** (5 min)
   - Go to vercel.com/new
   - Import from GitHub
   - Set environment variables
   - Deploy

4. **Update Extension** (1 min)
   - Update backend URL in `background.js`
   - Reload extension

5. **Test** (2 min)
   - Run `await window.CLEARVIEW_TEST_BACKEND()`
   - Verify filtering works

## Key Configuration Files

### vercel.json
Tells Vercel how to run your Express app:
```json
{
  "version": 2,
  "functions": {
    "index.js": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "routes": [{ "src": "/(.*)", "dest": "index.js" }]
}
```

### Environment Variables to Set

In Vercel Dashboard → Settings → Environment Variables:

```
NODE_ENV=production
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
ALLOWED_ORIGINS=chrome-extension://*
PORT=3000
```

## Cost Breakdown

| Component | Free Tier | Cost |
|-----------|-----------|------|
| Vercel Hosting | ✅ Included | $0 |
| Bandwidth | 100GB/month | Included |
| Compute | 6000 hours/month | Included |
| OpenAI API | Pay-as-you-go | ~$0.01 per 100 classifications |
| **Total Monthly** | **Free +** | **~$1-5 typical** |

## Vercel Features Included

✅ Auto-scaling (handles traffic spikes)
✅ HTTPS by default (secure)
✅ Global CDN (fast worldwide)
✅ Auto-deploy on git push (CI/CD)
✅ Environment variables (secrets safe)
✅ Runtime logs (debugging)
✅ Rollback capability (instant recovery)
✅ Custom domains (if needed)

## Before You Deploy

Checklist:
- [ ] Backend runs locally (`npm start`)
- [ ] Verification passes (`node verify-deployment.js`)
- [ ] OpenAI API key valid
- [ ] GitHub account created
- [ ] Vercel account created

## Deployment Steps (TL;DR)

1. **Verify**
   ```bash
   cd d:\clearview\backend
   node verify-deployment.js
   ```

2. **Git Setup**
   ```bash
   cd d:\clearview
   git init
   git config user.email "your@email.com"
   git config user.name "Your Name"
   git add .
   git commit -m "Initial commit"
   ```

3. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/clearview.git
   git branch -M main
   git push -u origin main
   ```

4. **Deploy to Vercel**
   - Go to https://vercel.com/new
   - Import GitHub repo
   - Select `backend` folder
   - Click Deploy
   - Add environment variables
   - Redeploy

5. **Update Extension**
   - Edit `background.js`
   - Change: `const BACKEND_URL = 'https://YOUR_VERCEL_URL'`
   - Reload extension

6. **Test**
   ```javascript
   await window.CLEARVIEW_TEST_BACKEND()
   // Should return: healthy: true
   ```

## Expected Results

### After Successful Deployment

✅ Vercel shows "Ready" status
✅ Production URL available (https://yourproject.vercel.app)
✅ Extension backend test returns healthy: true
✅ Posts are detected and classified
✅ Filtering works based on preferences

### Backend Logs Show

```
Classification request received
OpenAI API called
Classification returned (BLOCK or ALLOW)
Response sent to extension
```

## Monitoring Deployment

### First 24 Hours
- [ ] Monitor Vercel dashboard for errors
- [ ] Check extension logs for issues
- [ ] Verify classifications working
- [ ] Monitor OpenAI API usage

### Ongoing Maintenance
- [ ] Check API costs monthly
- [ ] Monitor error rates
- [ ] Update code as needed (auto-deploys on push)
- [ ] Rotate API keys periodically

## When to Use Local vs Vercel

| Scenario | Use |
|----------|-----|
| Testing locally | `npm start` on localhost:3000 |
| Production use | Vercel deployment |
| Development | Local with hot reload |
| Team sharing | Vercel (public URL) |
| Performance testing | Local (no latency) |

## Debugging Live

When deployed to Vercel:

1. **View runtime logs**
   - Vercel Dashboard → Deployments → Runtime logs

2. **Check extension logs**
   - Chrome Console (F12)
   - `window.CLEARVIEW_FILTER_LOGS('ERROR')`

3. **Test connectivity**
   ```javascript
   await window.CLEARVIEW_TEST_BACKEND()
   ```

4. **Check stats**
   ```javascript
   window.CLEARVIEW_GET_STATS()
   ```

## File Structure After Deployment

```
clearview/
├── backend/
│   ├── index.js           # Express app
│   ├── ai.js              # OpenAI integration
│   ├── auth.js            # Token auth
│   ├── package.json       # Dependencies
│   ├── vercel.json        # Vercel config (NEW)
│   ├── .vercelignore      # Ignore files (NEW)
│   └── verify-deployment.js (NEW)
│
├── contentScript.js        # Extension content script
├── background.js           # Extension background (UPDATE URL)
├── popup.js                # Extension popup
├── manifest.json           # Extension manifest
│
└── docs/
    ├── QUICK_DEPLOY_VERCEL.md
    ├── VERCEL_DEPLOYMENT_GUIDE.md
    ├── DEPLOYMENT_CHECKLIST.md
    └── VERCEL_TROUBLESHOOTING.md
```

## Security Reminders

🔒 **Never commit .env to Git**
- Use `.gitignore` to exclude it
- Vercel uses environment variables instead

🔒 **Rotate API keys after exposure**
- If API key ever seen publicly
- Generate new key at platform.openai.com

🔒 **Use HTTPS only**
- Vercel provides HTTPS by default
- Extension only connects to HTTPS

🔒 **Monitor API usage**
- https://platform.openai.com/account/usage
- Set spending limits to prevent surprises

## Next Steps After Deployment

1. **Share with others**
   - Send Vercel URL to team
   - Extension works automatically

2. **Monitor performance**
   - Check Vercel logs regularly
   - Monitor OpenAI API costs

3. **Plan improvements**
   - User feedback
   - Add features
   - Optimize performance

4. **Keep secure**
   - Update dependencies
   - Rotate API keys
   - Monitor access logs

## Getting Help

### Resources
- `QUICK_DEPLOY_VERCEL.md` - Quick start (5 min)
- `VERCEL_DEPLOYMENT_GUIDE.md` - Detailed guide (15 min)
- `VERCEL_TROUBLESHOOTING.md` - Problem solving
- `DEPLOYMENT_CHECKLIST.md` - Step-by-step checklist

### Support
- Vercel Docs: https://vercel.com/docs
- Express.js: https://expressjs.com
- OpenAI: https://platform.openai.com/docs

---

## You're Ready!

Everything is set up and documented. The deployment process is straightforward:

1. **Verify** → **Git** → **GitHub** → **Vercel** → **Update Extension** → **Test**

**Estimated time: 12 minutes**

**Start with: `QUICK_DEPLOY_VERCEL.md`**

Good luck! 🚀
