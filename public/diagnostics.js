// Diagnostic script for debugging device compatibility issues
(function () {
  'use strict';

  // Only run diagnostics in development or when explicitly requested
  const shouldRunDiagnostics =
    window.location.search.includes('debug=1') ||
    window.location.hostname === 'localhost' ||
    window.localStorage.getItem('debug-diagnostics') === 'true';

  if (!shouldRunDiagnostics) return;

  function runDiagnostics() {
    console.group('🔍 Device Compatibility Diagnostics');

    // Basic device info
    console.log('User Agent:', navigator.userAgent);
    console.log('Platform:', navigator.platform);
    console.log('Language:', navigator.language);
    console.log('Screen:', window.screen.width + 'x' + window.screen.height);
    console.log('Viewport:', window.innerWidth + 'x' + window.innerHeight);

    // Browser features
    const features = {
      Promise: typeof Promise !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      IntersectionObserver: typeof IntersectionObserver !== 'undefined',
      ResizeObserver: typeof ResizeObserver !== 'undefined',
      MutationObserver: typeof MutationObserver !== 'undefined',
      requestAnimationFrame: typeof requestAnimationFrame !== 'undefined',
      localStorage: typeof Storage !== 'undefined',
      sessionStorage: typeof Storage !== 'undefined',
      WebSocket: typeof WebSocket !== 'undefined',
      ServiceWorker: 'serviceWorker' in navigator,
      WebGL: !!window.WebGLRenderingContext,
      WebGL2: !!window.WebGL2RenderingContext,
      Geolocation: 'geolocation' in navigator,
      Touch: 'ontouchstart' in window,
    };

    console.log('Browser Features:', features);

    // CSS features
    const cssFeatures = {
      Flexbox: CSS.supports('display', 'flex'),
      Grid: CSS.supports('display', 'grid'),
      CustomProperties: CSS.supports('color', 'var(--primary)'),
      BackdropFilter: CSS.supports('backdrop-filter', 'blur(1px)'),
      Sticky: CSS.supports('position', 'sticky'),
      Transform: CSS.supports('transform', 'translateX(0)'),
      Transition: CSS.supports('transition', 'all 0.3s'),
      BorderRadius: CSS.supports('border-radius', '10px'),
      BoxShadow: CSS.supports('box-shadow', '0 0 10px rgba(0,0,0,0.1)'),
    };

    console.log('CSS Features:', cssFeatures);

    // Memory info (if available)
    if ('memory' in performance) {
      console.log('Memory Info:', {
        used:
          Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
        total:
          Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
        limit:
          Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB',
      });
    }

    // Connection info (if available)
    if ('connection' in navigator) {
      const connection = navigator.connection;
      console.log('Connection Info:', {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
      });
    }

    // Check for common issues
    const issues = [];

    if (!features.Promise)
      issues.push('No Promise support - app will not work');
    if (!features.fetch) issues.push('No fetch support - API calls may fail');
    if (!cssFeatures.Flexbox)
      issues.push('No Flexbox support - layout may be broken');
    if (!features.localStorage)
      issues.push('No localStorage support - settings may not persist');

    const androidMatch = navigator.userAgent.match(/Android (\d+)/);
    if (androidMatch && parseInt(androidMatch[1]) <= 8) {
      issues.push('Android 8 or older - compatibility issues expected');
    }

    const chromeMatch = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (chromeMatch && parseInt(chromeMatch[1]) <= 80) {
      issues.push('Chrome 80 or older - modern features may not work');
    }

    if (issues.length > 0) {
      console.warn('⚠️ Potential Issues:');
      issues.forEach((issue) => console.warn('  -', issue));
    } else {
      console.log('✅ No major compatibility issues detected');
    }

    // Performance timing
    if ('timing' in performance) {
      const timing = performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;

      console.log('Performance:', {
        totalLoadTime: loadTime + 'ms',
        domReady: domReady + 'ms',
      });
    }

    console.groupEnd();

    // Add diagnostic info to window for manual inspection
    window._diagnostics = {
      userAgent: navigator.userAgent,
      features,
      cssFeatures,
      issues,
      timestamp: new Date().toISOString(),
    };

    console.log('💡 Diagnostics saved to window._diagnostics');
    console.log('💡 Add ?debug=1 to URL to enable diagnostics on any page');
  }

  // Run diagnostics when page is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDiagnostics);
  } else {
    setTimeout(runDiagnostics, 100);
  }

  // Add keyboard shortcut to toggle diagnostics
  document.addEventListener('keydown', function (event) {
    // Ctrl+Shift+D to toggle diagnostics
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
      const currentState = localStorage.getItem('debug-diagnostics') === 'true';
      localStorage.setItem('debug-diagnostics', !currentState);
      console.log(
        'Diagnostics',
        !currentState ? 'enabled' : 'disabled',
        '- reload page to see changes'
      );
    }
  });
})();
