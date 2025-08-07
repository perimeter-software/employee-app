'use client';

import { Button } from '@/components/ui/Button';
import { AlertTriangle, Smartphone, Chrome, RefreshCw } from 'lucide-react';

export default function CompatibilityMode() {
  const userAgent =
    typeof window !== 'undefined' ? window.navigator.userAgent : '';

  const androidMatch = userAgent.match(/Android (\d+)/);
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/);

  const androidVersion = androidMatch ? parseInt(androidMatch[1]) : null;
  const chromeVersion = chromeMatch ? parseInt(chromeMatch[1]) : null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          {/* Warning Icon */}
          <div className="mx-auto w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-yellow-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Device Compatibility Notice
          </h1>

          {/* Description */}
          <div className="text-gray-600 mb-8 space-y-4">
            <p className="text-lg">
              Your device may not fully support all features of this
              application.
            </p>

            <div className="bg-gray-50 p-4 rounded-lg text-left space-y-3">
              <h3 className="font-semibold text-gray-900 mb-2">
                Current Device Information:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-gray-500" />
                  <span>
                    Android:{' '}
                    {androidVersion ? `${androidVersion}.x` : 'Unknown'}
                    {androidVersion && androidVersion <= 8 && (
                      <span className="text-red-500 ml-2">⚠️ Outdated</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Chrome className="w-4 h-4 text-gray-500" />
                  <span>
                    Chrome: {chromeVersion ? `${chromeVersion}.x` : 'Unknown'}
                    {chromeVersion && chromeVersion <= 80 && (
                      <span className="text-red-500 ml-2">⚠️ Outdated</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-blue-50 p-6 rounded-lg mb-8 text-left">
            <h3 className="font-semibold text-blue-900 mb-4">
              Recommended Solutions:
            </h3>
            <div className="space-y-3 text-sm text-blue-800">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold">1</span>
                </div>
                <div>
                  <strong>Update Chrome Browser:</strong>
                  <p className="text-blue-700">
                    Go to Chrome → Settings → About Chrome to update to the
                    latest version.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold">2</span>
                </div>
                <div>
                  <strong>Clear Browser Data:</strong>
                  <p className="text-blue-700">
                    Clear cache, cookies, and site data for this application.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold">3</span>
                </div>
                <div>
                  <strong>Use a Newer Device:</strong>
                  <p className="text-blue-700">
                    For the best experience, use a device running Android 9+
                    with Chrome 90+.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <Button
              onClick={() => {
                // Try to clear everything and return to main app
                if (typeof window !== 'undefined') {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                    if ('caches' in window) {
                      caches.keys().then((names) => {
                        names.forEach((name) => {
                          caches.delete(name);
                        });
                      });
                    }
                  } catch (e) {
                    console.warn('Failed to clear caches:', e);
                  }

                  // Force reload with cache bypass
                  window.location.href = '/?v=' + Date.now();
                }
              }}
              className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Main App Anyway
            </Button>

            <div className="text-xs text-gray-500">
              <p>The app may work with limited functionality on your device.</p>
              <p>Contact IT support if you continue experiencing issues.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
