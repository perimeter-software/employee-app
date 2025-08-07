'use client';

import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  userAgent?: string;
  isOldDevice?: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Detect if this might be a compatibility issue
    const userAgent =
      typeof window !== 'undefined' ? window.navigator.userAgent : '';
    const isOldDevice = GlobalErrorBoundary.detectOldDevice(userAgent);

    return {
      hasError: true,
      error,
      userAgent,
      isOldDevice,
    };
  }

  static detectOldDevice(userAgent: string): boolean {
    // Detect older Android devices that might have compatibility issues
    const androidMatch = userAgent.match(/Android (\d+)/);
    if (androidMatch) {
      const androidVersion = parseInt(androidMatch[1]);
      // Android 8 and below might have issues
      if (androidVersion <= 8) return true;
    }

    // Detect older Chrome versions
    const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
    if (chromeMatch) {
      const chromeVersion = parseInt(chromeMatch[1]);
      // Chrome 80 and below might have issues with modern features
      if (chromeVersion <= 80) return true;
    }

    // Detect specific problematic devices
    const problematicDevices = [
      'Pixel 3',
      'Pixel 2',
      'Pixel XL',
      'SM-G9', // Samsung Galaxy S9 series
      'SM-G8', // Samsung Galaxy S8 series
    ];

    return problematicDevices.some((device) => userAgent.includes(device));
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('GlobalErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      errorInfo,
    });

    // Log to console for debugging
    console.group('🚨 Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('User Agent:', this.state.userAgent);
    console.error('Is Old Device:', this.state.isOldDevice);
    console.groupEnd();

    // Send error to monitoring service if available
    if (typeof window !== 'undefined' && 'gtag' in window) {
      const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
      if (typeof gtag === 'function') {
        gtag('event', 'exception', {
          description: error.message,
          fatal: true,
          user_agent: this.state.userAgent,
          is_old_device: this.state.isOldDevice,
        });
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const isOldDevice = this.state.isOldDevice;
      const errorMessage =
        this.state.error?.message || 'An unexpected error occurred';

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white shadow-lg rounded-lg p-6">
            <div className="text-center">
              {/* Error Icon */}
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.866-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>

              {/* Title */}
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                {isOldDevice
                  ? 'Compatibility Issue Detected'
                  : 'Application Error'}
              </h1>

              {/* Description */}
              <div className="text-gray-600 mb-6 space-y-2">
                {isOldDevice ? (
                  <>
                    <p className="text-sm">
                      Your device appears to be running an older version of
                      Android or Chrome that may not be fully compatible with
                      this application.
                    </p>
                    <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                      Device Info: {this.state.userAgent?.substring(0, 100)}...
                    </p>
                  </>
                ) : (
                  <p className="text-sm">{errorMessage}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  onClick={() => {
                    // Clear all caches and storage
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
                      window.location.reload();
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Clear Cache & Reload
                </Button>

                {isOldDevice && (
                  <Button
                    onClick={() => {
                      // Redirect to a simplified version or suggest browser update
                      window.location.href = '/compatibility-mode';
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Try Compatibility Mode
                  </Button>
                )}

                <Button
                  onClick={() => {
                    this.setState({ hasError: false, error: undefined });
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Try Again
                </Button>
              </div>

              {/* Help text */}
              <div className="text-center mt-6 text-xs text-gray-500 space-y-1">
                {isOldDevice ? (
                  <>
                    <p>
                      For the best experience, please update your Chrome browser
                      or use a newer device.
                    </p>
                    <p>If this issue persists, contact IT support.</p>
                  </>
                ) : (
                  <p>
                    If this issue persists, please contact technical support.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
