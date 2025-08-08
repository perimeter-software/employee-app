// next.config.mjs
/** @type {import('next').NextConfig} */

const nextConfig = {
  images: {
    // Disable image optimization in production to avoid permission issues
    unoptimized: process.env.NODE_ENV === 'production',
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.stadiumpeople.com',
      },
      {
        protocol: 'https',
        hostname: 'images.dev.stadiumpeople.com',
      },
      {
        protocol: 'https',
        hostname: 'images.stage.stadiumpeople.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 's.gravatar.com',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com https://polyfill.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://*.auth0.com https://polyfill.io",
              'frame-src https://*.auth0.com',
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
    ];
  },

  compiler: {
    // Add compatibility for older browsers
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Add experimental features for better compatibility
  experimental: {
    // Enable SWC minifier for better performance
    swcMinify: true,
    // Optimize for older devices
    optimizePackageImports: ['lucide-react', '@tanstack/react-query'],
  },
};

export default nextConfig;
