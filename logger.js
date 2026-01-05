/**
 * ClearView Activity Logger
 * Records all filtering activities for debugging and analytics
 */

const LOGGER = {
  // In-memory log buffer (max 500 entries)
  logs: [],
  MAX_LOGS: 500,
  
  /**
   * Log an activity
   */
  log(level, event, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level, // 'INFO', 'DEBUG', 'WARN', 'ERROR'
      event,
      data,
      url: typeof window !== 'undefined' ? window.location.href : 'N/A',
    };
    
    this.logs.push(entry);
    
    // Keep only recent logs
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }
    
    // Also log to console for real-time debugging
    const style = `color: ${this.getColor(level)}; font-weight: bold`;
    console.log(`%c[${level}]`, style, event, data);
  },
  
  /**
   * Get color for log level
   */
  getColor(level) {
    const colors = {
      'INFO': '#0ea5e9',    // blue
      'DEBUG': '#6b7280',   // gray
      'WARN': '#f59e0b',    // amber
      'ERROR': '#ef4444',   // red
      'SUCCESS': '#10b981', // green
    };
    return colors[level] || '#000';
  },
  
  /**
   * Get all logs as formatted text
   */
  getLogsAsText() {
    return this.logs
      .map(log => {
        const dataStr = Object.keys(log.data).length > 0 
          ? JSON.stringify(log.data) 
          : '';
        return `[${log.timestamp}] [${log.level}] ${log.event} ${dataStr}`;
      })
      .join('\n');
  },
  
  /**
   * Export logs to file (download)
   */
  exportLogs() {
    const text = this.getLogsAsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clearview-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },
  
  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
    console.log('%c[LOGGER]', 'color: #0ea5e9; font-weight: bold', 'Logs cleared');
  },
  
  /**
   * Get stats from logs
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {},
      byEvent: {},
      blockedCount: 0,
      allowedCount: 0,
      cacheHits: 0,
      errors: 0,
    };
    
    this.logs.forEach(log => {
      // Count by level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      // Count by event
      stats.byEvent[log.event] = (stats.byEvent[log.event] || 0) + 1;
      
      // Count classifications
      if (log.data.classification === 'BLOCK') stats.blockedCount++;
      if (log.data.classification === 'ALLOW') stats.allowedCount++;
      
      // Count cache hits
      if (log.event.includes('Cache Hit')) stats.cacheHits++;
      
      // Count errors
      if (log.level === 'ERROR') stats.errors++;
    });
    
    return stats;
  },
};

// Export for use in background and content scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LOGGER;
} else if (typeof window !== 'undefined') {
  window.LOGGER = LOGGER;
}
