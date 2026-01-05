# Continuous Post Scanning - Diagnostic Guide

## What Was Fixed

The extension now uses **three redundant mechanisms** to ensure continuous post scanning:

### 1. **Mutation Observer** (Primary)
- Watches for DOM changes when new posts are added
- Triggers immediately when Twitter/X adds posts to the feed
- Debounced to 250ms for performance

### 2. **Periodic Scanner** (Fallback)
- Runs every 3 seconds automatically
- Catches posts that might be added outside of mutation events
- Ensures no posts are missed even if mutations aren't detected

### 3. **Scroll Listener** (Additional)
- Triggers post scanning when user scrolls
- Debounced to 300ms to avoid excessive processing
- Catches posts dynamically loaded during scrolling

## Testing Continuous Scanning

### Step 1: Load the Extension
1. Go to `chrome://extensions/`
2. Reload the ClearView extension (click the refresh icon)
3. Go to Twitter/X and open DevTools (`F12`)
4. Go to the **Console** tab

### Step 2: Watch for Initialization Logs
You should see:
```
[INFO] Content Script Initialized { filteringEnabled: true, preferencesSet: true }
[INFO] Preferences Loaded { enabled: true, preferencesPreview: "..." }
[INFO] Observer Initialized { target: "...", ariaLabel: "Home timeline" }
[DEBUG] Periodic Post Scanner Started { intervalMs: 3000 }
```

### Step 3: Check Initial Post Detection
Scroll through the first few posts. You should see logs like:
```
[DEBUG] Posts Processing Scan { totalInDOM: 4, newPosts: 4 }
[DEBUG] Post Detected { postId: "abc...", textLength: 145, textPreview: "..." }
[INFO] Post Classified { classification: "ALLOW", hash: "def...", hasPreferences: true }
[SUCCESS] Post Allowed { hash: "def..." }
```

### Step 4: Test Continuous Scrolling
1. **Scroll down slowly** - watch the console
2. As new posts appear, you should see continuous logs:
   - "Posts Processing Scan" with increasing newPosts count
   - "Post Detected" for each new post
   - "Post Classified" for each classification
3. **The logs should never stop** as you continue scrolling

### Step 5: Verify All Three Mechanisms

**Check Mutation Observer is working:**
```javascript
// In console, run:
window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Mutation Detected').length
// Should be > 0 after scrolling
```

**Check Periodic Scanner is working:**
```javascript
// Should see "Posts Processing Scan" logs every ~3 seconds
// Even if you don't scroll
```

**Check Scroll Listener is working:**
```javascript
// Scroll the page, should immediately see post processing logs
// Even if mutations aren't firing
```

## Monitoring Real-Time

### Command 1: Watch post detection rate
```javascript
// Shows new posts being detected per scan
window.CLEARVIEW_LOGS.logs
  .filter(log => log.event === 'Posts Processing Scan')
  .map(log => ({ time: log.timestamp, newPosts: log.data.newPosts }))
  .slice(-10)
```

### Command 2: Monitor classification pipeline
```javascript
// Show last 5 classifications
window.CLEARVIEW_LOGS.logs
  .filter(log => log.event === 'Post Classified')
  .slice(-5)
  .map(log => ({ time: log.timestamp, classification: log.data.classification }))
```

### Command 3: Check for gaps in scanning
```javascript
// Identify if there are long gaps between scans
const scans = window.CLEARVIEW_LOGS.logs
  .filter(log => log.event === 'Posts Processing Scan');

for (let i = 1; i < scans.length; i++) {
  const prev = new Date(scans[i-1].timestamp);
  const curr = new Date(scans[i].timestamp);
  const gap = curr - prev;
  if (gap > 4000) {
    console.log(`Gap of ${gap}ms detected at ${i}`);
  }
}
```

### Command 4: Get scanning statistics
```javascript
const stats = {
  totalScans: window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Posts Processing Scan').length,
  totalDetected: window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Post Detected').length,
  totalClassified: window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Post Classified').length,
  mutations: window.CLEARVIEW_LOGS.logs.filter(log => log.event === 'Mutation Detected').length,
};
console.table(stats);
```

## Expected Behavior

### When Page Loads
1. Initial scan detects 3-5 posts on screen
2. Periodic scanner starts running every 3 seconds
3. Mutation observer watches for new posts

### When You Scroll Down
1. New posts appear in DOM
2. Mutation observer fires → triggers processPosts()
3. Scroll listener also fires → triggers processPosts()
4. Periodic scanner continues (fallback)
5. **All new posts should be detected and classified**

### When You Scroll Back Up
1. Already-processed posts are recognized (PROCESSED attribute)
2. No duplicate classifications sent to backend
3. Cache is used if available (shows "Cache Hit" logs)

## Troubleshooting

### Problem: Logs stop after 4 posts
**Solution:** Check the periodic scanner is running
```javascript
// Should be many logs with event: 'Posts Processing Scan'
window.CLEARVIEW_LOGS.logs
  .filter(log => log.event === 'Posts Processing Scan')
  .length
```

### Problem: Scroll doesn't trigger new posts
**Solution:** Verify scroll listener is registered
```javascript
// Should see "Posts Processing Scan" when you scroll
// Check timestamps in logs to see if scrolls are being detected
```

### Problem: Only seeing first batch
**Solution:** Check if observer target is correct
```javascript
// In console:
const target = document.querySelector('[aria-label="Home timeline"]');
console.log('Observer target:', target ? 'Found' : 'Not found');
```

### Problem: Periodic scanner not running
**Solution:** Check extension is still active
```javascript
// If periodic scanner isn't running, extension context might be invalidated
chrome.runtime.id // Should return a string, not undefined
```

## Performance Impact

- **Mutation Observer**: Minimal CPU, only fires when DOM changes
- **Periodic Scanner**: ~5ms every 3 seconds (~0.17% CPU)
- **Scroll Listener**: Only fires during scrolling, debounced to 300ms
- **Total**: Negligible impact on page performance

## Key Changes Made

1. **Reduced debounce time**: 500ms → 250ms (faster response)
2. **Added periodic scanner**: 3-second fallback scan
3. **Added scroll listener**: Triggers on scroll events
4. **Added detailed logging**: Track each scanning mechanism
5. **Multiple redundancy**: Posts caught by any of 3 mechanisms

## Success Indicators

✅ "Mutation Detected" logs appear when scrolling
✅ "Periodic Post Scanner" starts at initialization  
✅ "Posts Processing Scan" logs continue indefinitely
✅ New posts are detected each time you scroll
✅ Classification logs show continuous activity
✅ No gaps > 4 seconds in post processing

## Next Steps

If continuous scanning is still not working:

1. **Check browser compatibility**: Ensure you're on Chrome/Chromium
2. **Verify observer target**: Make sure feed container is found
3. **Check permissions**: Extension needs contentScript access
4. **Review error logs**: Look for any ERROR level logs
5. **Try force refresh**: Full browser refresh (Ctrl+Shift+R)

---

The extension should now continuously scan and classify **all posts** as you scroll, without stopping after the first few.
