// next.config.mjs
/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  // Enable Turbopack for much faster dev builds (Next.js 14+)
  ...(isDev && {
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
    ],
  },

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
        poll: 2000, // Check less frequently
        aggregateTimeout: 500, // Wait longer before rebuilding
        ignored: [
          /node_modules/,
          /\.next/,
          /\.git/,
          /\.swp/,
          /\.swo/,
          /\.DS_Store/,
        ],
      };
      
      // Cache everything possible
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };
    }
    return config;
  },

  async headers() {
    const connectSrc = [
      "'self'",
      'https://maps.googleapis.com',
      'https://maps.gstatic.com',
      'https://*.auth0.com',
      'https://polyfill.io',
      'https://*.pureblue.ai', // PureBlue API and services
    ];

    const frameSrc = [
      'https://*.auth0.com',
      'https://*.pureblue.info', // PureBlue chatbot iframes
      // AWS S3 URLs - allow all S3 endpoints for PDF viewing
      'https://*.amazonaws.com', // Matches all AWS S3 URLs (s3.region.amazonaws.com, bucket.s3.region.amazonaws.com, etc.)
    ];

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
  ...(process.env.NODE_ENV === 'production' && {
    compiler: {
      // Remove console logs in production builds
      removeConsole: true,
    },
  }),

  // Add experimental features for better compatibility
  experimental: {
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

  // TypeScript optimizations
  typescript: {
    // Don't type-check during build in dev (faster, but less safe)
    // You can still run `tsc --noEmit` separately
    ignoreBuildErrors: isDev,
  },

  // ESLint optimizations
  eslint: {
    // Don't run ESLint during builds in dev (faster)
    // You can still run `npm run lint` separately
    ignoreDuringBuilds: isDev,
  },
};

export default nextConfig;
