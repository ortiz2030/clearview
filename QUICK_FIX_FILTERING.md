# Filtering Not Working? - Quick Start

## The Problem
Filter preferences set but posts still showing on timeline (not being blocked)

## The Solution
Follow these 3 steps (5 minutes):

### Step 1: Test Backend
Open Twitter/X → Press F12 → Go to Console → Paste:
```javascript
await window.CLEARVIEW_TEST_BACKEND()
```

**See `healthy: false`?** 
→ Backend not running. Fix below.

**See `healthy: true`?**
→ Go to Step 2.

### Step 2: Start Backend (if needed)
Open Terminal/Command Prompt:
```bash
cd d:\clearview\backend
npm start
```

Should see: `{"event":"SERVER_START","port":3000}`

Leave this terminal open.

### Step 3: Verify Filtering Works
Back in Chrome Console:
```javascript
window.CLEARVIEW_GET_STATS()
```

**Look at results:**
- `blocked: 0` → Filtering NOT working (see Troubleshooting)
- `blocked > 0` → Filtering IS working ✅

---

## Still Not Working?

### Check 1: Preferences Saved?
```javascript
window.CLEARVIEW_FILTER_LOGS('Preferences Loaded')
// Should show your filter text, not empty
```

If empty: Set preferences in extension popup and reload page

### Check 2: Backend Health?
```javascript
await window.CLEARVIEW_TEST_BACKEND()
// Must return healthy: true
```

If false: Make sure `npm start` is running in terminal

### Check 3: Posts Being Detected?
```javascript
window.CLEARVIEW_GET_LOGS(20)
// Should show "Post Detected" entries
```

If none: Scroll page to load posts

### Check 4: Any Errors?
```javascript
window.CLEARVIEW_FILTER_LOGS('ERROR')
// Should be empty
```

If shows errors: Check that error message in Step 2 below

---

## Full Debugging

See `COMPLETE_FILTERING_DEBUG.md` for:
- Detailed error messages and fixes
- Step-by-step verification
- All console commands reference
- Common issues and solutions

---

## Commands Reference

```javascript
// Test backend health
await window.CLEARVIEW_TEST_BACKEND()

// Get statistics
window.CLEARVIEW_GET_STATS()

// View recent logs (last 20)
window.CLEARVIEW_GET_LOGS(20)

// View recent logs (last 50)
window.CLEARVIEW_GET_LOGS(50)

// Filter logs by type
window.CLEARVIEW_FILTER_LOGS('ERROR')          // Errors
window.CLEARVIEW_FILTER_LOGS('Preferences')    // Preferences
window.CLEARVIEW_FILTER_LOGS('Classified')     // Classifications
window.CLEARVIEW_FILTER_LOGS('Post Detected')  // Posts found
```

---

## 99% Solution

Most filtering issues are caused by backend not running:

```bash
# 1. Open terminal/cmd
# 2. Run this:
cd d:\clearview\backend && npm start

# 3. Keep it open (don't close terminal)
# 4. Reload Twitter/X page
# 5. Test: await window.CLEARVIEW_TEST_BACKEND()
```

If this fixes it, filtering now works! ✅

---

## When You Need Help

Run these and provide the output:
```javascript
await window.CLEARVIEW_TEST_BACKEND()
window.CLEARVIEW_GET_STATS()
window.CLEARVIEW_FILTER_LOGS('ERROR')
```

Also check terminal running `npm start` for any error messages.

---

**This should take 5 minutes. If filtering still doesn't work after these steps, see `COMPLETE_FILTERING_DEBUG.md` for advanced troubleshooting.**
