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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com",
              "script-src-elem 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Added *.google.com and *.googleusercontent.com for broader coverage
              "img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com https://*.google.com https://*.googleusercontent.com",
              "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
              "frame-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
