# Vercel Deployment Checklist

## Pre-Deployment (Verify Everything Works)

- [ ] Backend runs locally: `npm start` shows SERVER_START
- [ ] Verification passes: `node verify-deployment.js` shows all ✅
- [ ] API key present: `OPENAI_API_KEY` in `.env`
- [ ] No .env committed: `.env` in `.gitignore`
- [ ] All modules load: `require('./ai')`, `require('./auth')` work
- [ ] Git initialized: `git status` shows no errors

## GitHub Setup

- [ ] GitHub account created
- [ ] New repository created (`clearview`)
- [ ] Git configured locally:
  ```bash
  git config user.email "your.email@example.com"
  git config user.name "Your Name"
  ```
- [ ] Files added: `git add .`
- [ ] Initial commit: `git commit -m "Initial commit"`
- [ ] Remote added: `git remote add origin https://github.com/YOUR_USERNAME/clearview.git`
- [ ] Pushed to GitHub: `git push -u origin main`

## Vercel Deployment

- [ ] Vercel account created (vercel.com)
- [ ] Went to vercel.com/new
- [ ] Imported GitHub repository
- [ ] Selected `backend` as root directory
- [ ] Deployment completed successfully
- [ ] Got production URL (e.g., https://clearview-backend.vercel.app)

## Environment Variables in Vercel

After deployment, in Vercel dashboard Settings → Environment Variables:

- [ ] `NODE_ENV` = `production`
- [ ] `OPENAI_API_KEY` = `sk-proj-...` (your key)
- [ ] `ALLOWED_ORIGINS` = `chrome-extension://*`
- [ ] `PORT` = `3000`
- [ ] Redeployed after adding variables

## Extension Update

- [ ] Opened `d:\clearview\background.js`
- [ ] Found: `const BACKEND_URL = 'http://localhost:3000'`
- [ ] Replaced with: `const BACKEND_URL = 'https://YOUR_VERCEL_URL'`
- [ ] Saved file
- [ ] Reloaded extension at chrome://extensions (↻ button)

## Post-Deployment Verification

- [ ] Backend health test passes:
  ```javascript
  await window.CLEARVIEW_TEST_BACKEND()
  // Returns: healthy: true ✅
  ```

- [ ] Posts being detected:
  ```javascript
  window.CLEARVIEW_FILTER_LOGS('Post Detected').length > 0
  ```

- [ ] Filtering working:
  ```javascript
  window.CLEARVIEW_GET_STATS()
  // Shows: blocked > 0
  ```

- [ ] No errors:
  ```javascript
  window.CLEARVIEW_FILTER_LOGS('ERROR').length === 0
  ```

- [ ] Backend responds correctly:
  ```bash
  curl https://YOUR_VERCEL_URL/auth -X POST \
    -H "Content-Type: application/json" \
    -d '{"deviceId":"test"}'
  # Returns token JSON ✅
  ```

## Ongoing Maintenance

- [ ] Monitored Vercel logs for first 24 hours
- [ ] Set up email notifications (optional)
- [ ] Verified auto-deployment on `git push`
- [ ] Checked OpenAI API usage dashboard
- [ ] Monitored Vercel bandwidth usage

## Rollback Plan (if needed)

If something breaks:

```bash
# View previous deployments
vercel list

# Rollback to previous version
vercel rollback
```

- [ ] Know how to rollback if needed

## Documentation

- [ ] Updated team with Vercel URL
- [ ] Documented Vercel URL in notes
- [ ] Shared deployment guide with team
- [ ] Created backup of .env (saved separately, never in Git)

## Security Verification

- [ ] `.env` NOT pushed to GitHub: `git log --all --full-history -- .env` shows nothing
- [ ] Vercel environment variables set (not .env files)
- [ ] API key rotated/renewed if it was publicly exposed
- [ ] ALLOWED_ORIGINS restricted to extension only
- [ ] Rate limiting configured in code

## Performance Check

- [ ] First API call latency acceptable (<2 seconds)
- [ ] Batch processing working (multiple posts classified)
- [ ] Caching functional (same posts faster)
- [ ] No memory leaks over time
- [ ] OpenAI API cost reasonable

## Final Sign-Off

- [ ] All checks passed ✅
- [ ] Backend deployed to Vercel ✅
- [ ] Extension using Vercel URL ✅
- [ ] Filtering working end-to-end ✅
- [ ] Ready for production use ✅

---

## Deployment Timeline

| Step | Time | Status |
|------|------|--------|
| Pre-deployment verification | 1 min | ⏳ |
| Git setup & commit | 2 min | ⏳ |
| Push to GitHub | 1 min | ⏳ |
| Vercel deployment | 3 min | ⏳ |
| Environment variables | 2 min | ⏳ |
| Update extension | 1 min | ⏳ |
| Verification tests | 2 min | ⏳ |
| **Total** | **~12 min** | ⏳ |

## Contact & Support

- **Vercel Status**: https://www.vercelstatus.com
- **Vercel Docs**: https://vercel.com/docs
- **OpenAI API Status**: https://status.openai.com
- **Extension Debug**: Press F12 → Console on Twitter/X

---

**Print this checklist and check off items as you go through deployment!**
