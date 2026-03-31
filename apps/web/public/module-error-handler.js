/**
 * Module Load Error Handler
 * Catches errors when main bundle fails to load (stale hash after deployment).
 * Must be loaded BEFORE module scripts to catch their load failures.
 *
 * This is a FALLBACK for when the main app bundle fails to load entirely.
 * Once the app loads, the stale-assets-detector.ts handles errors instead.
 *
 * @see https://github.com/vitejs/vite/discussions/15598
 */

/**
 * iOS Debug Screen
 * Shows errors visually when console is not available (e.g., testing on iOS devices).
 * Captures unhandled errors and promise rejections.
 */
(function() {
  var DEBUG_KEY = 'neurodual_ios_debug';
  var BOOT_LOG_KEY = 'neurodual_boot_log_v1';
  var POWERSYNC_RUNTIME_KEY = 'neurodual_powersync_runtime_v1';
  var MAX_BOOT_LOG_ENTRIES = 200;
  var errors = [];
  var debugEnabled = false;
  var showBootLogOnly = false;

  function stringifyValue(value) {
    if (value instanceof Error) {
      return value.message + (value.stack ? '\n' + value.stack.split('\n').slice(0, 5).join('\n') : '');
    }
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readBootLog() {
    try {
      var raw = localStorage.getItem(BOOT_LOG_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeBootLog(entries) {
    try {
      localStorage.setItem(BOOT_LOG_KEY, JSON.stringify(entries.slice(-MAX_BOOT_LOG_ENTRIES)));
    } catch (e) {
      // Ignore storage failures (private mode/quota).
    }
  }

  function addBootLog(level, phase, detail) {
    var entries = readBootLog();
    entries.push({
      at: new Date().toISOString(),
      level: level,
      phase: phase,
      detail: stringifyValue(detail),
      href: window.location.href,
    });
    if (entries.length > MAX_BOOT_LOG_ENTRIES) entries = entries.slice(-MAX_BOOT_LOG_ENTRIES);
    writeBootLog(entries);
  }

  function readPowerSyncRuntime() {
    try {
      var raw = localStorage.getItem(POWERSYNC_RUNTIME_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // Enable debug mode via URL param: ?ios_debug=1
  try {
    var params = new URLSearchParams(window.location.search);
    var quickDebugEnabled = params.get('d') === '1';
    showBootLogOnly = quickDebugEnabled || params.get('show_bootlog') === '1';
    debugEnabled =
      quickDebugEnabled ||
      params.get('ios_debug') === '1' ||
      localStorage.getItem(DEBUG_KEY) === '1';
    if (quickDebugEnabled) {
      localStorage.setItem(DEBUG_KEY, '1');
    }
    if (params.get('ios_debug') === '1') {
      localStorage.setItem(DEBUG_KEY, '1');
    }
    if (params.get('ios_debug') === '0') {
      localStorage.removeItem(DEBUG_KEY);
      debugEnabled = false;
    }
  } catch(e) {}

  function formatError(error, context) {
    var msg = '';
    if (context) msg += '[' + context + '] ';
    if (error instanceof Error) {
      msg += error.message;
      if (error.stack) msg += '\n' + error.stack.split('\n').slice(0, 5).join('\n');
    } else if (typeof error === 'string') {
      msg += error;
    } else {
      try { msg += JSON.stringify(error); } catch(e) { msg += String(error); }
    }
    return msg;
  }

  function showDebugScreen() {
    var shouldShow = (debugEnabled && errors.length > 0) || showBootLogOnly;
    if (!shouldShow) return;
    if (!document.body) return;

    // Remove any existing debug screen
    var existing = document.getElementById('ios-debug-screen');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.id = 'ios-debug-screen';
    div.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1c1917;color:#fafaf9;padding:20px;overflow:auto;font-family:monospace;font-size:12px;';

    var html = '<h2 style="margin:0 0 10px;color:#ef4444;">iOS Debug - ' + errors.length + ' error(s)</h2>';
    if (showBootLogOnly && errors.length === 0) {
      html = '<h2 style="margin:0 0 10px;color:#fbbf24;">iOS Boot Log</h2>';
    }
    html += '<p style="margin:0 0 10px;color:#a8a29e;">User Agent: ' + navigator.userAgent.substring(0, 100) + '</p>';
    html += '<p style="margin:0 0 20px;color:#a8a29e;">Platform: ' + (navigator.platform || 'unknown') + '</p>';

    // Platform detection info
    html += '<h3 style="margin:10px 0;color:#fbbf24;">Platform Detection:</h3>';
    html += '<pre style="background:#292524;padding:10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;">';
    try {
      var info = {
        hasOPFS: typeof navigator.storage !== 'undefined' && typeof navigator.storage.getDirectory === 'function',
        hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'undefined',
        hasFileSystemFileHandle: typeof FileSystemFileHandle !== 'undefined',
        hasIndexedDB: typeof indexedDB !== 'undefined',
        isSecureContext: typeof isSecureContext !== 'undefined' ? isSecureContext : 'undefined',
      };
      html += JSON.stringify(info, null, 2);
    } catch(e) {
      html += 'Failed to detect: ' + e.message;
    }
    html += '</pre>';

    var runtime = readPowerSyncRuntime();
    if (runtime) {
      html += '<h3 style="margin:20px 0 10px;color:#60a5fa;">PowerSync Runtime:</h3>';
      html += '<pre style="background:#292524;padding:10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;border-left:3px solid #60a5fa;">' + escapeHtml(JSON.stringify(runtime, null, 2)) + '</pre>';
    }

    if (errors.length > 0) {
      html += '<h3 style="margin:20px 0 10px;color:#ef4444;">Errors:</h3>';
      for (var i = 0; i < errors.length; i++) {
        html += '<pre style="background:#292524;padding:10px;border-radius:4px;margin-bottom:10px;overflow-x:auto;white-space:pre-wrap;border-left:3px solid #ef4444;">' + escapeHtml(errors[i]) + '</pre>';
      }
    }

    var bootLog = readBootLog();
    html += '<h3 style="margin:20px 0 10px;color:#22c55e;">Boot Log (' + bootLog.length + '):</h3>';
    if (bootLog.length === 0) {
      html += '<pre style="background:#292524;padding:10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;">No boot logs recorded.</pre>';
    } else {
      for (var j = 0; j < bootLog.length; j++) {
        var item = bootLog[j];
        var line = (item.at || '?') + ' [' + (item.level || 'info') + '] [' + (item.phase || 'unknown') + '] ' + (item.detail || '');
        html += '<pre style="background:#292524;padding:10px;border-radius:4px;margin-bottom:10px;overflow-x:auto;white-space:pre-wrap;border-left:3px solid #22c55e;">' + escapeHtml(line) + '</pre>';
      }
    }

    // IMPORTANT: Do not use inline onclick handlers.
    // CSP blocks inline event handlers (script-src has no 'unsafe-inline').
    html += '<button id="ios-debug-copy" type="button" style="margin-top:20px;padding:10px 20px;background:#10b981;color:#052e16;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Copy Report</button>';
    html += ' <button id="ios-debug-disable" type="button" style="margin-top:20px;padding:10px 20px;background:#fafaf9;color:#1c1917;border:none;border-radius:8px;font-weight:500;cursor:pointer;">Disable Debug & Reload</button>';
    html += ' <button id="ios-debug-reload" type="button" style="margin-top:20px;padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:500;cursor:pointer;">Reload</button>';
    html += ' <button id="ios-debug-clear" type="button" style="margin-top:20px;padding:10px 20px;background:#f59e0b;color:#1c1917;border:none;border-radius:8px;font-weight:500;cursor:pointer;">Clear Boot Logs</button>';

    div.innerHTML = html;
    document.body.appendChild(div);

    // Wire button actions (CSP-safe).
    try {
      var copyBtn = document.getElementById('ios-debug-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          if (window.__iosDebug && typeof window.__iosDebug.copyReport === 'function') {
            window.__iosDebug.copyReport();
          }
        });
      }

      var disableBtn = document.getElementById('ios-debug-disable');
      if (disableBtn) {
        disableBtn.addEventListener('click', function() {
          try { localStorage.removeItem(DEBUG_KEY); } catch (e) {}
          location.reload();
        });
      }

      var reloadBtn = document.getElementById('ios-debug-reload');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', function() {
          location.reload();
        });
      }

      var clearBtn = document.getElementById('ios-debug-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          try { localStorage.removeItem(BOOT_LOG_KEY); } catch (e) {}
          try { localStorage.removeItem(POWERSYNC_RUNTIME_KEY); } catch (e) {}
          location.reload();
        });
      }
    } catch (e) {
      // ignore
    }
  }

  function captureError(error, context) {
    var formatted = formatError(error, context);
    errors.push(new Date().toISOString().split('T')[1].split('.')[0] + ' ' + formatted);
    if (errors.length > 20) errors.shift(); // Keep last 20
    addBootLog('error', context || 'error', formatted);

    // Show debug screen after a small delay to let DOM settle
    setTimeout(showDebugScreen, 100);
  }

  // Global error handler
  window.addEventListener('error', function(event) {
    addBootLog('error', 'window.error', event.error || event.message || 'Unknown window.error');
    captureError(event.error || event.message, 'error');
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    addBootLog('error', 'window.unhandledrejection', event.reason || 'Unknown rejection');
    captureError(event.reason, 'unhandledrejection');
  });

  addBootLog('info', 'module-handler-init', 'module-error-handler.js loaded');

  function buildDebugReport() {
    var report = {
      at: new Date().toISOString(),
      href: window.location.href,
      userAgent: navigator.userAgent,
      platform: navigator.platform || 'unknown',
      errors: errors,
      powersyncRuntime: readPowerSyncRuntime(),
      bootLog: readBootLog(),
    };
    return JSON.stringify(report, null, 2);
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) {
          reject(new Error('execCommand copy failed'));
          return;
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Expose for app runtime milestones
  window.__neurodualBootLog = {
    add: addBootLog,
    get: readBootLog,
    clear: function() { localStorage.removeItem(BOOT_LOG_KEY); },
    show: showDebugScreen,
  };

  // Expose for manual logging
  window.__iosDebug = {
    log: function(msg, context) {
      addBootLog('info', context || 'manual', msg);
      captureError(msg, context || 'manual');
    },
    show: showDebugScreen,
    enable: function() {
      addBootLog('info', 'ios-debug', 'enabled');
      localStorage.setItem(DEBUG_KEY, '1');
      location.reload();
    },
    disable: function() {
      addBootLog('info', 'ios-debug', 'disabled');
      localStorage.removeItem(DEBUG_KEY);
      location.reload();
    },
    copyReport: function() {
      var report = buildDebugReport();
      copyText(report)
        .then(function() {
          addBootLog('info', 'ios-debug', 'report-copied');
          alert('Diagnostic copied to clipboard.');
        })
        .catch(function(err) {
          addBootLog('error', 'ios-debug', 'report-copy-failed: ' + stringifyValue(err));
          alert('Copy failed. Open console and run window.__iosDebug.getReport()');
        });
    },
    getReport: buildDebugReport,
    isEnabled: function() { return debugEnabled; }
  };

  // Log startup
  if (debugEnabled || showBootLogOnly) {
    console.log('[iOS Debug] Debug mode enabled. Errors will be shown on screen.');
    addBootLog('info', 'startup', 'Debug/Bootlog mode started');
    setTimeout(showDebugScreen, 0);
  }

  if (debugEnabled) {
    captureError('Debug mode started - waiting for errors...', 'startup');
  }
})();

(function() {
  var RELOAD_KEY = 'neurodual_module_reload_v2';
  var DEBUG_KEY = 'neurodual_ios_debug';
  // Reduced from 30s to 10s - matches reload-recovery.ts
  var RELOAD_COOLDOWN = 10000;
  // Max 2 attempts to prevent infinite loops
  var MAX_ATTEMPTS = 2;
  var ATTEMPT_COUNT_KEY = 'neurodual_module_reload_count';

  function addBootLog(level, phase, detail) {
    try {
      var bootLog = window.__neurodualBootLog;
      if (bootLog && typeof bootLog.add === 'function') {
        bootLog.add(level, phase, detail);
      }
    } catch (e) {
      // ignore logging failures
    }
  }

  function getAttemptCount() {
    try {
      return parseInt(sessionStorage.getItem(ATTEMPT_COUNT_KEY) || '0', 10);
    } catch { return 0; }
  }

  function isAutoReloadDebugDisabled() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('ios_debug') === '1' || params.get('no_autoreload') === '1') {
        return true;
      }
      if (params.get('ios_debug') === '0') {
        return false;
      }
      return localStorage.getItem(DEBUG_KEY) === '1';
    } catch {
      return false;
    }
  }

  function canReload() {
    if (isAutoReloadDebugDisabled()) {
      return false;
    }
    try {
      var last = sessionStorage.getItem(RELOAD_KEY);
      var attempts = getAttemptCount();

      // Check if we're in cooldown
      if (last && Date.now() - parseInt(last, 10) < RELOAD_COOLDOWN) {
        // In cooldown window - check attempt count
        return attempts < MAX_ATTEMPTS;
      }

      // Outside cooldown window - reset and allow
      return true;
    } catch { return false; }
  }

  function handleModuleError(e) {
    // Only handle script/module errors
    if (e.target && e.target.tagName === 'SCRIPT') {
      var src = e.target.src || '';

      // Ignore third-party scripts (ads, analytics, etc.) — only handle same-origin assets
      if (src && !src.startsWith(window.location.origin)) {
        return;
      }

      console.error('[ModuleErrorHandler] Script failed to load:', src);
      addBootLog('error', 'module-script-error', src || 'unknown script');

      // Check if main app reload-recovery is available (app loaded but chunk failed)
      // If so, let it handle the error instead
      if (window.__neurodualReloadRecoveryActive) {
        console.log('[ModuleErrorHandler] Deferring to app reload-recovery');
        addBootLog('info', 'module-script-error', 'deferred-to-reload-recovery');
        return;
      }

      if (canReload()) {
        try {
          var last = sessionStorage.getItem(RELOAD_KEY);
          var attempts = getAttemptCount();

          // Reset counter if outside cooldown window
          if (!last || Date.now() - parseInt(last, 10) >= RELOAD_COOLDOWN) {
            attempts = 0;
          }

          sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
          sessionStorage.setItem(ATTEMPT_COUNT_KEY, (attempts + 1).toString());
        } catch { /* ignore storage errors */ }

        // Clear ALL caches and unregister SW before reload
        // This MUST complete before reload, otherwise the old SW serves stale files
        console.log('[ModuleErrorHandler] Clearing caches and unregistering SW...');
        addBootLog('warn', 'module-reload', 'clear-caches-and-sw-before-reload');

        Promise.all([
          // 1. Clear all caches
          window.caches ? caches.keys().then(function(names) {
            return Promise.all(names.map(function(name) { return caches.delete(name); }));
          }) : Promise.resolve(),
          // 2. Unregister Service Worker (critical - old SW intercepts reloads)
          navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(function(regs) {
            return Promise.all(regs.map(function(reg) { return reg.unregister(); }));
          }) : Promise.resolve()
        ]).then(function() {
          console.log('[ModuleErrorHandler] Caches cleared, SW unregistered. Reloading...');
          addBootLog('warn', 'module-reload', 'reloading-with-cache-bust');
          // Force bypass all caches with cache-busting query param
          var url = new URL(window.location.href);
          url.searchParams.set('_cb', Date.now().toString());
          window.location.replace(url.toString());
        }).catch(function() {
          // Fallback: reload anyway
          addBootLog('warn', 'module-reload', 'fallback-window-reload');
          window.location.reload();
        });
      } else {
        console.warn('[ModuleErrorHandler] Reload blocked (max attempts reached)');
        addBootLog('warn', 'module-reload-blocked', 'max-attempts-or-debug-disabled');
      }
    }
  }

  // Capture errors in the capture phase to catch script load errors
  window.addEventListener('error', handleModuleError, true);
})();

/**
 * PWA Install Prompt Capture
 * Captures beforeinstallprompt event BEFORE React mounts.
 * The event often fires before components are ready, so we store it globally.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
 */
(function() {
  // Store for React component to access
  window.__pwaInstallPrompt = null;
  window.__pwaInstallPromptHandled = false;

  window.addEventListener('beforeinstallprompt', function(e) {
    // Prevent browser's default install prompt
    e.preventDefault();
    // Store the event for later use
    window.__pwaInstallPrompt = e;
    // Dispatch custom event so React can react if already mounted
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });

  // Track when app is installed
  window.addEventListener('appinstalled', function() {
    window.__pwaInstallPrompt = null;
    window.__pwaInstallPromptHandled = true;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
})();
