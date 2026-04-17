// next.config.mjs
/** @type {import('next').NextConfig} */

const isDev =
  process.env.NODE_ENV === 'development' ||
  process.env.NEXT_PUBLIC_APP_ENV === 'development';

const nextConfig = {
  // Enable Turbopack for much faster dev builds (Next.js 14+)
  ...(isDev &&
    {
      // Turbopack is experimental but much faster
      // Uncomment if you want to try it (may have some compatibility issues)
      // experimental: {
      //   turbo: {},
      // },
    }),

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
      // S3 bucket used for tenant assets (avoids next/image render error in dev)
      {
        protocol: 'https',
        hostname: 'pureblue-gignology',
      },
      {
        // Covers all S3 virtual-hosted URLs: bucket.s3.region.amazonaws.com
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
    ],
  },

  productionBrowserSourceMaps: false,

  // Webpack optimizations for faster dev builds (only when not using Turbopack)
  // Turbopack has its own optimizations, so webpack config is ignored when using --turbo
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Aggressive optimizations for faster rebuilds
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
        // Disable minification in dev
        minimize: false,
      };

      // Reduce file watching overhead - more aggressive
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 500,
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          '**/.git/**',
          '**/*.swp',
          '**/*.swo',
          '**/.DS_Store',
        ],
      };

      // Cache everything possible
      config.cache = {
        type: 'filesystem',
      };
    }
    return config;
  },

  async headers() {
    const connectSrc = [
      "'self'",
      'https://*.googleapis.com', // Google Maps + Firebase (installations, FCM token, etc.)
      'https://maps.gstatic.com',
      'https://*.auth0.com',
      'https://polyfill.io',
      'https://*.pureblue.ai', // PureBlue API and services
      'https://*.firebaseio.com', // Firebase Realtime Database / FCM
    ];

    const frameSrc = [
      'https://*.auth0.com',
      // AWS S3 URLs - allow all S3 endpoints for PDF viewing
      'https://*.amazonaws.com', // Matches all AWS S3 URLs (s3.region.amazonaws.com, bucket.s3.region.amazonaws.com, etc.)
      'https://player.vimeo.com',
    ];

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://*.gstatic.com https://polyfill.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' https://fonts.gstatic.com",
              `connect-src ${connectSrc.join(' ')}`,
              `frame-src ${frameSrc.join(' ')}`,
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

  // Compiler options - only in production (Turbopack doesn't support removeConsole)
  ...(process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_APP_ENV !== 'development' && {
      compiler: {
        // Remove console logs in production builds
        removeConsole: true,
      },
    }),

  // Transpile packages that ship ESM and can't be server-externalized
  transpilePackages: ['@react-pdf/renderer', 'firebase'],

  async rewrites() {
    return [
      {
        // Serve the Firebase service worker at the expected path without
        // putting ".js" in the app directory folder name (which confuses webpack)
        source: '/firebase-messaging-sw.js',
        destination: '/api/firebase-sw',
      },
    ];
  },

  // Add experimental features for better compatibility
  experimental: {
    // Don't bundle pdfkit so it can load font files from node_modules at runtime
    serverComponentsExternalPackages: ['pdfkit'],
    // Enable SWC minifier for better performance (already default in Next.js 14)
    swcMinify: true,
    // Optimize package imports - tree-shake unused exports
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      'date-fns',
      'date-fns-tz',
      '@radix-ui/react-select',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-calendar',
      'recharts',
      'framer-motion',
    ],
    // Faster page compilation
    optimizeCss: true,
  },

  // TypeScript: skip type-check during next build to avoid memory spike on EB (t3/t4g.medium).
  // Run `yarn type-check` in CI or locally before deploy.
  typescript: {
    ignoreBuildErrors: true,
  },

  // ESLint: skip lint during next build to avoid memory spike on EB (t3/t4g.medium).
  // Run `yarn lint` in CI or locally before deploy.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
