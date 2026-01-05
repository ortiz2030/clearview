# Deploying Backend to Vercel

## Prerequisites
- Vercel account (free at vercel.com)
- Git installed
- OpenAI API key (already in .env)

## Step 1: Create Git Repository

If you haven't already, initialize a git repository:

```bash
cd d:\clearview
git init
git add .
git commit -m "Initial commit - ClearView extension with backend"
```

## Step 2: Push to GitHub

1. Go to https://github.com/new
2. Create a new repository called `clearview`
3. Follow GitHub's instructions to push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/clearview.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: Quick Deploy (Recommended)

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Paste: `https://github.com/YOUR_USERNAME/clearview.git`
4. Select `backend` as root directory
5. Click "Deploy"

### Option B: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to backend
cd d:\clearview\backend

# Deploy
vercel
```

## Step 4: Set Environment Variables

1. After deployment, go to your Vercel project dashboard
2. Go to "Settings" → "Environment Variables"
3. Add these variables:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `PORT` | `3000` |
| `ALLOWED_ORIGINS` | `chrome-extension://*` |

⚠️ **IMPORTANT**: Don't commit your .env file to Git. Vercel sets these as secrets.

## Step 5: Get Your Deployment URL

After deployment, Vercel will show you:
- Production URL: `https://yourproject.vercel.app`
- Git integration: Auto-deploys on push to main

## Step 6: Update Extension to Use Vercel URL

Edit `d:\clearview\background.js` and change:

```javascript
// OLD (local):
const BACKEND_URL = 'http://localhost:3000';

// NEW (Vercel):
const BACKEND_URL = 'https://yourproject.vercel.app';
```

## Step 7: Reload Extension and Test

1. Go to `chrome://extensions`
2. Reload the ClearView extension
3. Go to Twitter/X
4. Open DevTools → Console
5. Test:
   ```javascript
   await window.CLEARVIEW_TEST_BACKEND()
   // Should return healthy: true
   ```

## Troubleshooting

### Deployment Failed
Check Vercel logs:
1. Go to your Vercel dashboard
2. Click the failed deployment
3. Look at "Build logs" tab
4. Check "Runtime logs" for errors

### 502 Bad Gateway
- Backend crashed on Vercel
- Check Runtime logs in Vercel dashboard
- Verify OpenAI API key is valid
- Check for runtime errors

### CORS Errors
Verify `ALLOWED_ORIGINS` environment variable:
```
chrome-extension://*
```

### Backend Test Fails
1. Verify URL is correct (check Vercel dashboard)
2. Make sure you updated `background.js` with correct URL
3. Check `OPENAI_API_KEY` environment variable is set
4. Reload extension

## Monitoring Deployment

### View Logs
```bash
vercel logs --help
vercel logs <deployment-url>
```

### Check Health
```bash
curl https://yourproject.vercel.app/auth \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test"}'

# Should return token JSON
```

## Ongoing Development

### Making Changes

After you modify the backend code:

```bash
# 1. Commit changes
git add .
git commit -m "Updated classification logic"

# 2. Push to GitHub
git push

# 3. Vercel auto-deploys (watch dashboard)
# OR manually:
vercel deploy
```

### Setting Up CI/CD

Vercel auto-deploys on:
- Push to main branch
- Automatic on every commit
- No manual deployment needed after initial setup

## Cost Considerations

**Vercel Free Tier:**
- 100 GB bandwidth per month
- 6,000 hours of execution time per month
- Perfect for this project

**Estimated Usage:**
- Each classification: ~0.5 seconds
- Each user classifying 100 posts/day: ~50 seconds
- Supports thousands of concurrent users on free tier

## Security Best Practices

✅ Never commit `.env` to Git
✅ Use Vercel environment variables (not .env files)
✅ Rotate API keys regularly
✅ Monitor API usage in OpenAI dashboard
✅ Set rate limits per user

## Rollback

If something breaks after deployment:

```bash
# See previous deployments
vercel list

# Rollback to previous version
vercel rollback
```

## Next Steps

1. Deploy backend to Vercel
2. Update extension with Vercel URL
3. Test end-to-end on Twitter/X
4. Monitor logs in Vercel dashboard
5. Set up monitoring/alerts (optional)

## References

- Vercel Docs: https://vercel.com/docs
- Express + Vercel: https://vercel.com/docs/concepts/frameworks/express
- Environment Variables: https://vercel.com/docs/concepts/projects/environment-variables
