// Polyfills for older Android devices
(function () {
  'use strict';

  // Feature detection and polyfills
  function addPolyfills() {
    // Console polyfill for very old devices
    if (!window.console) {
      window.console = {
        log: function () {},
        error: function () {},
        warn: function () {},
        info: function () {},
      };
    }

    // Promise polyfill check
    if (!window.Promise) {
      console.warn('Promise not supported - app may not work correctly');
    }

    // Fetch polyfill check
    if (!window.fetch) {
      console.warn('Fetch API not supported - app may not work correctly');
    }

    // IntersectionObserver polyfill check
    if (!window.IntersectionObserver) {
      console.warn(
        'IntersectionObserver not supported - some features may not work'
      );
    }

    // CSS.supports polyfill
    if (!window.CSS || !window.CSS.supports) {
      window.CSS = window.CSS || {};
      window.CSS.supports = function () {
        return false; // Fallback for old browsers
      };
    }

    // Object.assign polyfill
    if (!Object.assign) {
      Object.assign = function (target) {
        if (target == null) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);
        for (var index = 1; index < arguments.length; index++) {
          var nextSource = arguments[index];
          if (nextSource != null) {
            for (var nextKey in nextSource) {
              if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                to[nextKey] = nextSource[nextKey];
              }
            }
          }
        }
        return to;
      };
    }

    // Array.includes polyfill
    if (!Array.prototype.includes) {
      Array.prototype.includes = function (searchElement, fromIndex) {
        return this.indexOf(searchElement, fromIndex) !== -1;
      };
    }

    // String.includes polyfill
    if (!String.prototype.includes) {
      String.prototype.includes = function (search, start) {
        if (typeof start !== 'number') {
          start = 0;
        }
        if (start + search.length > this.length) {
          return false;
        }
        return this.indexOf(search, start) !== -1;
      };
    }

    // String.startsWith polyfill
    if (!String.prototype.startsWith) {
      String.prototype.startsWith = function (searchString, position) {
        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
      };
    }

    // String.endsWith polyfill
    if (!String.prototype.endsWith) {
      String.prototype.endsWith = function (searchString, length) {
        if (length === undefined || length > this.length) {
          length = this.length;
        }
        return (
          this.substring(length - searchString.length, length) === searchString
        );
      };
    }
  }

  // Device detection
  function detectDevice() {
    var userAgent = navigator.userAgent;
    var isOldAndroid = /Android [1-8]\./.test(userAgent);
    var isOldChrome = /Chrome\/([0-7]\d|80)\./.test(userAgent);
    var isOldDevice = isOldAndroid || isOldChrome;

    // Add class to body for CSS targeting
    if (isOldDevice) {
      document.documentElement.className += ' old-device';
    }

    return {
      isOldAndroid: isOldAndroid,
      isOldChrome: isOldChrome,
      isOldDevice: isOldDevice,
      userAgent: userAgent,
    };
  }

  // Error handling for old devices
  function setupErrorHandling() {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', function (event) {
      console.error('Unhandled promise rejection:', event.reason);
      // Don't prevent default to allow other handlers to run
    });

    // Catch JavaScript errors
    window.addEventListener('error', function (event) {
      console.error('JavaScript error:', event.error);

      // For very critical errors on old devices, show a fallback
      var deviceInfo = detectDevice();
      if (deviceInfo.isOldDevice && event.error) {
        setTimeout(function () {
          // Check if the page is still responsive
          if (
            document.readyState === 'complete' &&
            !document.body.innerHTML.trim()
          ) {
            // Page failed to load properly, show basic fallback
            document.body.innerHTML = `
              <div style="padding: 20px; font-family: Arial, sans-serif; text-align: center; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px;">
                  <h2 style="color: #d32f2f; margin-bottom: 20px;">App Loading Failed</h2>
                  <p style="margin-bottom: 20px; color: #666;">Your device appears to be incompatible with this application.</p>
                  <button onclick="window.location.reload();" style="background: #1976d2; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
                    Try Again
                  </button>
                  <p style="margin-top: 20px; font-size: 12px; color: #999;">
                    Please update your browser or contact IT support if this issue persists.
                  </p>
                </div>
              </div>
            `;
          }
        }, 5000); // Wait 5 seconds to see if app loads
      }
    });
  }

  // Initialize polyfills and error handling
  function init() {
    addPolyfills();
    setupErrorHandling();

    var deviceInfo = detectDevice();
    if (deviceInfo.isOldDevice) {
      console.warn('Old device detected:', deviceInfo.userAgent);
      console.warn('Some features may not work properly');
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
