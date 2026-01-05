# Quick Start Guide - Testing Logging System

## 1. Load Extension

1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select the `d:\clearview` folder
4. The ClearView extension should now appear in your extensions list

## 2. Set Filter Preferences

1. Click the ClearView extension icon (top right of Chrome)
2. In the popup, enter filter preferences:
   - Example: "Filter hateful content, misinformation, and spam"
3. Click outside or wait 2 seconds - preference saves automatically
4. You should see a green checkmark appear briefly

## 3. Open Twitter/X

1. Go to https://twitter.com or https://x.com
2. Look for the **ClearView** badge in the top-right corner with a pulsing green dot
3. This confirms the extension is active and running

## 4. View Logs in Console

1. Press `F12` to open Developer Tools
2. Click the **Console** tab
3. Immediately start seeing color-coded logs as posts load:
   ```
   [INFO] Preferences Loaded { enabled: true, preferencesPreview: "..." }
   [DEBUG] Post Detected { postId: "...", textLength: 145, textPreview: "..." }
   [DEBUG] Request Queued { hash: "...", contentLength: 145, hasPreferences: true }
   ```

## 5. Try Quick Commands

```javascript
// View all logs as an array
window.CLEARVIEW_LOGS.logs

// Get formatted text output
window.CLEARVIEW_LOGS.getLogsAsText()

// Get current statistics
window.CLEARVIEW_LOGS.getStats()
// Output: { total: 42, blocked: 2, allowed: 40, cached: 5, errors: 0 }

// View only ERROR logs
window.CLEARVIEW_LOGS.logs.filter(log => log.level === 'ERROR')

// View only classification events
window.CLEARVIEW_LOGS.logs.filter(log => log.event.includes('Classified'))

// View last 5 logs
window.CLEARVIEW_LOGS.logs.slice(-5)
```

## 6. What to Look For

### Successful Operation
```
✓ "Preferences Loaded" shows your filter text
✓ "Post Detected" logs appear as you scroll
✓ "Post Classified" shows ALLOW or BLOCK
✓ "Post Blurred" or "Post Allowed" shows result was applied
✓ Stats show increasing allowed/blocked counts
```

### Preferences Working
```
✓ "Request Queued" shows hasPreferences: true
✓ "Classification Result" includes your preferences
✓ Posts matching your filter criteria are blocked
```

### Cache Working
```
✓ "Cache Hit" appears for duplicate posts
✓ Cache size shown in logs
✓ Fewer "Request Queued" logs for cached content
```

## 7. Test Scenarios

### Test Preference Filtering
1. Set preferences to something specific (e.g., "Filter political content")
2. Scroll through feed
3. Look at "Post Classified" logs - check `hasPreferences: true`
4. Verify posts are blocked/allowed based on preference

### Test Cache
1. Scroll down and see posts get classified
2. Scroll back up - same posts shouldn't trigger new API calls
3. Check logs for "Cache Hit" events
4. This proves cache is working - much faster!

### Test Rate Limiting
1. Rapidly refresh page or scroll aggressively
2. If you see "Rate Limit Exceeded" logs, you've hit the 60 req/min limit
3. Wait a minute and try again
4. After reset, logs should show requests succeeding again

## 8. Troubleshooting

### No Logs Appearing?
- Make sure extension is loaded (check extension icon)
- Refresh page (F5) and wait 2 seconds
- Check console is set to "All levels" (not filtering)
- Try scrolling to trigger post detection

### Logs But No Classifications?
- Check "Batch Processing Failed" error logs
- Make sure backend is running on `http://localhost:3000`
- If backend is offline, posts should fail-open (allowed)
- Check "Batch Processing Started" logs confirm batch is being sent

### Preferences Not Working?
- Check "Preferences Loaded" logs show your text
- Verify "Post Classified" shows `hasPreferences: true`
- If hasPreferences is false, check popup saved preferences correctly
- Try resetting preferences in popup and try again

### Performance Slow?
- Check log count - over 500? It auto-clears oldest
- Cache size indicator in logs - large cache is normal
- Batch processing duration shown - should be <5s typically

## 9. Next Steps

After confirming logging works:

1. **Deploy Backend** - Move from localhost:3000 to actual server
2. **Test End-to-End** - Verify preferences actually filter posts correctly
3. **Monitor Stats** - Watch `getStats()` to see real-world usage patterns
4. **Optimize Settings** - Adjust BATCH_SIZE (10) and BATCH_WAIT_MS (5000) based on logs

## 10. Tips for Developers

**Copy All Logs:**
```javascript
copy(window.CLEARVIEW_LOGS.logs)
// Paste into JSON editor for analysis
```

**Find Specific Posts:**
```javascript
// Find all logs for posts with "politics" in them
window.CLEARVIEW_LOGS.logs.filter(log => 
  log.data.textPreview?.includes('politics') || 
  log.data.preferencesPreview?.includes('politics')
)
```

**Calculate Cache Hit Rate:**
```javascript
const stats = window.CLEARVIEW_LOGS.getStats();
const hitRate = (stats.cached / (stats.classified || 1) * 100).toFixed(1);
console.log(`Cache hit rate: ${hitRate}%`);
```

**Monitor Real-Time:**
```javascript
// Watch logs every second
setInterval(() => {
  const stats = window.CLEARVIEW_LOGS.getStats();
  console.clear();
  console.log('Stats:', stats);
  console.log('Recent:', window.CLEARVIEW_LOGS.logs.slice(-3));
}, 1000);
```

---

**Happy Testing!** 🚀

All logs are local to your browser and never sent to any server. Logs are cleared when you reload the page.
