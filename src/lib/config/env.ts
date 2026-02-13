// lib/config/env.ts
export const env = {
  // Auth0 Configuration (Next.js standard)
  auth0: {
    secret: process.env.AUTH0_SECRET!,
    baseUrl: process.env.AUTH0_BASE_URL!,
    issuerBaseUrl: process.env.AUTH0_ISSUER_BASE_URL!,
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET!,
    audience: process.env.AUTH0_AUDIENCE!,
  },

  // Legacy Auth0 (for existing functions that haven't been migrated yet)
  legacyAuth0: {
    clientId: process.env.SECRET_AUTH0_CLIENT_ID!,
    clientSecret: process.env.SECRET_AUTH0_CLIENT_SECRET!,
    domain: process.env.SECRET_AUTH0_DOMAIN!,
    audience: process.env.SECRET_AUTH0_AUDIENCE!,
    serverSecret: process.env.SECRET_AUTH0_SERVER_SECRET!,
  },

  // Database Configuration
  database: {
    mongodb: {
      connectionString: process.env.MONGODB_CONNECTION_STRING!,
    },
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    url:
      process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${
        process.env.REDIS_PORT || '6379'
      }`,
  },

  // Google Maps API Keys
  googleMaps: {
    apiKeyOne: process.env.GOOGLE_MAPS_API_KEY_ONE!,
    apiKeyTwo: process.env.GOOGLE_MAPS_API_KEY_TWO!,
  },

  // AI API Keys
  ai: {
    openai: process.env.OPENAI_API_KEY!,
    anthropic: process.env.ANTHROPIC_API_KEY!,
  },

  // AWS SES Configuration (for email service)
  ses: {
    region:
      process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-2',
    fromEmail: process.env.SES_FROM_EMAIL || 'jobs@stadiumpeople.com',
    sendInDev: process.env.SES_SEND_IN_DEV === 'true',
  },

  // Environment Detection
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

// Type-safe environment variable checker
export function validateEnv() {
  const requiredVars = [
    'AUTH0_SECRET',
    'AUTH0_BASE_URL',
    'AUTH0_ISSUER_BASE_URL',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'MONGODB_CONNECTION_STRING',
  ];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
}

// Helper to get environment-specific values
export function getEnvironmentConfig() {
  const baseUrl = process.env.AUTH0_BASE_URL!;

  if (baseUrl.includes('localhost')) {
    return {
      environment: 'development',
      isLocal: true,
    };
  } else if (baseUrl.includes('stage') || baseUrl.includes('staging')) {
    return {
      environment: 'staging',
      isLocal: false,
    };
  } else {
    return {
      environment: 'production',
      isLocal: false,
    };
  }
}
