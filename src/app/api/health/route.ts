import { NextResponse } from 'next/server';
import { checkMongoConnection } from '@/lib/db';
import redisService from '@/lib/cache/redis-client';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    auth: {
      status: 'healthy' | 'unhealthy';
      configured: boolean;
    };
  };
  environment: string;
}

export async function GET() {
  // Initialize health status
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: { status: 'unhealthy' },
      redis: { status: 'unhealthy' },
      auth: { status: 'unhealthy', configured: false },
    },
    environment: process.env.NODE_ENV || 'development',
  };

  // Check database connection
  try {
    const dbStart = Date.now();
    const isConnected = await checkMongoConnection();
    const dbTime = Date.now() - dbStart;

    if (isConnected) {
      health.services.database = {
        status: 'healthy',
        responseTime: dbTime,
      };
    } else {
      health.services.database = {
        status: 'unhealthy',
        error: 'Database connection failed',
      };
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
    health.status = 'degraded';
  }

  // Check Redis connection
  try {
    const redisStart = Date.now();
    // Use a simple set/get operation to test Redis connectivity
    const testKey = 'health-check';
    const testValue = Date.now().toString();
    await redisService.set(testKey, testValue, 10); // 10 second expiry
    const retrieved = await redisService.get(testKey);

    if (retrieved === testValue) {
      const redisTime = Date.now() - redisStart;
      health.services.redis = {
        status: 'healthy',
        responseTime: redisTime,
      };
    } else {
      health.services.redis = {
        status: 'unhealthy',
        error: 'Redis test operation failed',
      };
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.redis = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
    health.status = 'degraded';
  }

  // Check Auth0 configuration
  const authConfigured = !!(
    process.env.AUTH0_SECRET &&
    process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET
  );

  health.services.auth = {
    status: authConfigured ? 'healthy' : 'unhealthy',
    configured: authConfigured,
  };

  if (!authConfigured) {
    health.status = 'degraded';
  }

  // Overall status determination
  const unhealthyServices = Object.values(health.services).filter(
    (service) => service.status === 'unhealthy'
  ).length;

  if (unhealthyServices > 1) {
    health.status = 'unhealthy';
  } else if (unhealthyServices === 1) {
    health.status = 'degraded';
  }

  // Return appropriate HTTP status code
  const httpStatus =
    health.status === 'healthy'
      ? 200
      : health.status === 'degraded'
        ? 200
        : 503;

  return NextResponse.json(health, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

// Also support HEAD requests for simple ping checks
export async function HEAD() {
  try {
    // Quick health check - just verify the app is running
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
