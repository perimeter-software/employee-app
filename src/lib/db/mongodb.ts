import { MongoClient, Db } from "mongodb";
import { MongoConnection } from "./types";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let cachedDbTenant: Db | null = null;
let cachedUserDb: Db | null = null;

// Check if we're running on the server side
const isServer = typeof window === "undefined";

// Your existing mongoConn function - keeping it exactly the same
export const mongoConn = async (
  dbName = "stadiumpeople",
  retries = 3
): Promise<MongoConnection> => {
  if (!isServer) {
    throw new Error(
      "MongoDB operations can only be performed on the server side"
    );
  }

  // Use cached connections in development to prevent connection issues
  if (cachedClient && cachedDb && cachedDbTenant && cachedUserDb) {
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
  }

  try {
    const connectionString = process.env.MONGODB_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error("MONGODB_CONNECTION_STRING is not defined");
    }

    // Connect using the same pattern as your SvelteKit code
    const client = await MongoClient.connect(connectionString);

    // Use the exact same database names as your SvelteKit setup
    const db = client.db(dbName); // Default: "stadiumpeople"
    const dbTenant = client.db("tenant"); // Tenant database
    const userDb = client.db("usermaster"); // User master database

    // Cache the connections
    cachedClient = client;
    cachedDb = db;
    cachedDbTenant = dbTenant;
    cachedUserDb = userDb;

    console.log("🔌 Connected to MongoDB databases:", {
      main: db.databaseName, // stadiumpeople
      tenant: dbTenant.databaseName, // tenant
      user: userDb.databaseName, // usermaster
    });

    return { client, db, dbTenant, userDb };
  } catch (error) {
    if (retries > 0) {
      console.log(
        `MongoDB connection failed, retrying... (${retries} attempts left)`
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      return mongoConn(dbName, retries - 1);
    } else {
      console.error("❌ Failed to connect to MongoDB after multiple attempts");
      throw error;
    }
  }
};

// Convenience functions for domain usage
export async function getDatabase(): Promise<Db> {
  if (!isServer) {
    throw new Error(
      "MongoDB operations can only be performed on the server side"
    );
  }
  const { db } = await mongoConn();
  return db;
}

export async function getTenantDatabase(): Promise<Db> {
  if (!isServer) {
    throw new Error(
      "MongoDB operations can only be performed on the server side"
    );
  }
  const { dbTenant } = await mongoConn();
  return dbTenant;
}

export async function getUserMasterDatabase(): Promise<Db> {
  if (!isServer) {
    throw new Error(
      "MongoDB operations can only be performed on the server side"
    );
  }
  const { userDb } = await mongoConn();
  return userDb;
}

export async function getAllDatabases(): Promise<MongoConnection> {
  if (!isServer) {
    throw new Error(
      "MongoDB operations can only be performed on the server side"
    );
  }
  return mongoConn();
}

// Helper function to close connections (useful for cleanup)
export async function closeMongoConnection() {
  if (!isServer) {
    throw new Error(
      "MongoDB operations can only be performed on the server side"
    );
  }
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    cachedDbTenant = null;
    cachedUserDb = null;
    console.log("MongoDB connection closed");
  }
}

// Health check function
export async function checkMongoConnection(): Promise<boolean> {
  if (!isServer) {
    throw new Error(
      "MongoDB operations can only be performed on the server side"
    );
  }
  try {
    if (!cachedClient) {
      await mongoConn();
    }

    await cachedClient!.db("admin").command({ ping: 1 });
    return true;
  } catch (error) {
    console.error("MongoDB health check failed:", error);
    return false;
  }
}
