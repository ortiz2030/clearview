# Update Extension After Vercel Deployment

## One Simple Change

After your backend is deployed to Vercel, you only need to update **ONE LINE** in the extension.

## Location

File: `d:\clearview\background.js`
Line: ~48

## Current Code (Local)
```javascript
const BACKEND_URL = 'http://localhost:3000';
```

## After Deployment (Vercel)
```javascript
const BACKEND_URL = 'https://yourproject.vercel.app';
```

Replace `yourproject` with your actual Vercel project name.

## How to Find Your Vercel URL

1. Go to https://vercel.com
2. Sign in with your account
3. Click on your project
4. Look at the top - you'll see the URL like:
   ```
   Production
   https://clearview-backend.vercel.app
   Visit
   ```
5. Copy this URL (the https://... part)

## Update Steps

1. **Open the file**
   - Open `d:\clearview\background.js` in your editor
   - Use Ctrl+F to find: `BACKEND_URL`

2. **Replace the URL**
   ```javascript
   // BEFORE:
   const BACKEND_URL = 'http://localhost:3000';
   
   // AFTER:
   const BACKEND_URL = 'https://clearview-backend.vercel.app';
   ```

3. **Save the file**
   - Ctrl+S

4. **Reload extension**
   - Go to `chrome://extensions`
   - Find "ClearView"
   - Click the refresh button (↻)

## Verify It Works

In Chrome Console (F12):

```javascript
// This should now connect to Vercel
await window.CLEARVIEW_TEST_BACKEND()
// Result: { healthy: true }
```

If `healthy: true` → **You're done!** ✅

If `healthy: false` → Check troubleshooting below

## Troubleshooting

### URL is incorrect

Make sure:
- You copied the full URL (starts with `https://`)
- You removed the port number (`:3000`)
- You have `backend` or `vercel.app` in the name

**Example correct URLs:**
```
https://clearview-backend.vercel.app
https://my-backend.vercel.app
https://custom-domain.vercel.app
```

**Example WRONG URLs:**
```
http://localhost:3000          ❌ Still local
clearview-backend.vercel.app   ❌ Missing https://
https://clearview-backend.vercel.app:3000  ❌ Has port number
```

### After updating, still shows `healthy: false`

1. Make sure you reloaded the extension
   - Go to chrome://extensions
   - Click refresh on ClearView

2. Make sure you copied the right URL
   - Go to Vercel dashboard
   - Copy the exact URL shown

3. Wait a moment
   - Sometimes takes 10-15 seconds to connect

4. Check backend is deployed
   - Go to Vercel dashboard
   - Should show "Ready" status (not "Building")

## Multi-URL Setup (Advanced)

If you want to support both local and Vercel:

```javascript
// Detect environment
const isDevelopment = process.env.NODE_ENV === 'development';

const BACKEND_URL = isDevelopment 
  ? 'http://localhost:3000'
  : 'https://yourproject.vercel.app';
```

But for production, just use the Vercel URL.

## That's It!

Just one line changed. The rest of the extension works exactly the same:

- ✅ Content script detects posts
- ✅ Background script batches requests
- ✅ Sends to Vercel instead of localhost
- ✅ OpenAI classifies content
- ✅ Posts are filtered

The only difference is your backend is now **live and scalable**! 🚀

## After Update

Your setup is now complete:

```
Twitter/X Feed
    ↓
Extension detects posts
    ↓
Sends to Vercel (production)
    ↓
OpenAI classifies
    ↓
Posts filtered based on preferences
```

## Quick Checklist

- [ ] Found your Vercel URL in dashboard
- [ ] Updated `const BACKEND_URL` in `background.js`
- [ ] Saved the file
- [ ] Reloaded extension (chrome://extensions refresh button)
- [ ] Tested with `await window.CLEARVIEW_TEST_BACKEND()`
- [ ] Got `healthy: true` response

**Done!** Your extension is now using the live Vercel backend! 🎉
