// src/lib/db/mongodb.ts - Updated version
import { MongoClient, Db } from 'mongodb';
import os from 'node:os';
import { MongoConnection } from './types';
import { env } from '@/lib/config';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let cachedDbTenant: Db | null = null;
let cachedUserDb: Db | null = null;

// Check if we're running on the server side
const isServer = typeof window === 'undefined';

// Check if we're running in Edge Runtime
const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge';

// Default database name from environment variable, fallback to 'stadiumpeople' for backward compatibility
const DEFAULT_DB_NAME = process.env.DEFAULT_TENANT_DB_NAME || 'stadiumpeople';
const TENANT_DB_NAME = process.env.TENANT_DB_NAME || 'tenant';
const USER_MASTER_DB_NAME = process.env.USER_MASTER_DB_NAME || 'usermaster';

// Scale connection pool per worker so total connections stay roughly constant.
// Must match server.mjs: requested workers are capped at 2× vCPU (misconfig safety).
const TOTAL_MAX_POOL = 50;
const TOTAL_MIN_POOL = 5;
const rawWorkers = parseInt(process.env.CLUSTER_WORKERS || '0', 10);
const clusterEnabled = process.env.CLUSTER_ENABLED === 'true';
const cpuCount = os.cpus().length;
const effectiveClusterProcessCount = clusterEnabled
  ? (() => {
      const requested =
        Number.isFinite(rawWorkers) && rawWorkers > 0 ? rawWorkers : cpuCount;
      const maxWorkers = Math.max(1, cpuCount * 2);
      return Math.min(Math.max(1, requested), maxWorkers);
    })()
  : 1;
const effectiveMaxPool = Math.max(
  10,
  Math.floor(TOTAL_MAX_POOL / effectiveClusterProcessCount)
);
const effectiveMinPool = Math.max(
  2,
  Math.floor(TOTAL_MIN_POOL / effectiveClusterProcessCount)
);

export const mongoConn = async (
  dbName = DEFAULT_DB_NAME,
  retries = 3
): Promise<MongoConnection> => {
  // Early return for client-side or edge runtime
  if (!isServer) {
    throw new Error(
      'MongoDB operations can only be performed on the server side'
    );
  }

  if (isEdgeRuntime) {
    throw new Error('MongoDB operations are not supported in Edge Runtime');
  }

  // Use cached connections in development to prevent connection issues
  if (cachedClient && cachedDb && cachedDbTenant && cachedUserDb) {
    try {
      // Test the connection
      await cachedClient.db('admin').command({ ping: 1 });

      // If a specific dbName is requested and it's different from cached, create new connection
      if (dbName && cachedDb.databaseName !== dbName) {
        const db = cachedClient.db(dbName);
        return {
          client: cachedClient,
          db,
          dbTenant: cachedDbTenant,
          userDb: cachedUserDb,
        };
      }

      return {
        client: cachedClient,
        db: cachedDb,
        dbTenant: cachedDbTenant,
        userDb: cachedUserDb,
      };
    } catch (error) {
      console.warn('Cached connection invalid, reconnecting...', error);
      // Clear cached connections if they're invalid
      cachedClient = null;
      cachedDb = null;
      cachedDbTenant = null;
      cachedUserDb = null;
    }
  }

  try {
    const connectionString = process.env.MONGODB_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('MONGODB_CONNECTION_STRING is not defined');
    }

    // Only log in development
    if (env.isDevelopment) {
      console.log('🔄 Connecting to MongoDB...');
    }

    // Connect with specific options to avoid client-side encryption issues
    const client = await MongoClient.connect(connectionString, {
      // Disable client-side field level encryption
      autoEncryption: undefined,
      // Pool scaled by CLUSTER_WORKERS so total connections stay ~50 across all workers
      maxPoolSize: effectiveMaxPool,
      minPoolSize: effectiveMinPool,
      maxIdleTimeMS: 30000, // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Connection pool monitoring
      monitorCommands: false, // Disable command monitoring in dev for performance
    });

    // Use database names from environment variables with fallbacks
    const db = client.db(dbName);
    const dbTenant = client.db(TENANT_DB_NAME);
    const userDb = client.db(USER_MASTER_DB_NAME);

    // Test the connections
    await Promise.all([
      db.command({ ping: 1 }),
      dbTenant.command({ ping: 1 }),
      userDb.command({ ping: 1 }),
    ]);

    // Cache the connections
    cachedClient = client;
    cachedDb = db;
    cachedDbTenant = dbTenant;
    cachedUserDb = userDb;

    // Only log in development
    if (env.isDevelopment) {
      console.log('✅ Connected to MongoDB databases:', {
        main: db.databaseName,
        tenant: dbTenant.databaseName,
        user: userDb.databaseName,
      });
    }

    return { client, db, dbTenant, userDb };
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);

    if (retries > 0) {
      console.log(`🔄 Retrying connection... (${retries} attempts left)`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return mongoConn(dbName, retries - 1);
    } else {
      console.error('❌ Failed to connect to MongoDB after multiple attempts');
      throw new Error(
        `MongoDB connection failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
};

// Rest of your functions remain the same...
export async function getDatabase(): Promise<Db> {
  if (!isServer) {
    throw new Error(
      'MongoDB operations can only be performed on the server side'
    );
  }
  if (isEdgeRuntime) {
    throw new Error('MongoDB operations are not supported in Edge Runtime');
  }
  const { db } = await mongoConn();
  return db;
}

export async function getTenantDatabase(): Promise<Db> {
  if (!isServer) {
    throw new Error(
      'MongoDB operations can only be performed on the server side'
    );
  }
  if (isEdgeRuntime) {
    throw new Error('MongoDB operations are not supported in Edge Runtime');
  }
  const { dbTenant } = await mongoConn();
  return dbTenant;
}

export async function getUserMasterDatabase(): Promise<Db> {
  if (!isServer) {
    throw new Error(
      'MongoDB operations can only be performed on the server side'
    );
  }
  if (isEdgeRuntime) {
    throw new Error('MongoDB operations are not supported in Edge Runtime');
  }
  const { userDb } = await mongoConn();
  return userDb;
}

export async function getAllDatabases(): Promise<MongoConnection> {
  if (!isServer) {
    throw new Error(
      'MongoDB operations can only be performed on the server side'
    );
  }
  if (isEdgeRuntime) {
    throw new Error('MongoDB operations are not supported in Edge Runtime');
  }
  return mongoConn();
}

export async function closeMongoConnection() {
  if (!isServer) {
    throw new Error(
      'MongoDB operations can only be performed on the server side'
    );
  }
  if (isEdgeRuntime) {
    throw new Error('MongoDB operations are not supported in Edge Runtime');
  }
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    cachedDbTenant = null;
    cachedUserDb = null;
    console.log('MongoDB connection closed');
  }
}

export async function checkMongoConnection(): Promise<boolean> {
  if (!isServer) {
    return false;
  }
  if (isEdgeRuntime) {
    return false;
  }
  try {
    if (!cachedClient) {
      await mongoConn();
    }

    await cachedClient!.db('admin').command({ ping: 1 });
    return true;
  } catch (error) {
    console.error('MongoDB health check failed:', error);
    return false;
  }
}
