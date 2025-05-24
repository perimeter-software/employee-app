// lib/server/dbConn.ts
import { MongoConnection } from "@/types/database/mongo";
import { MongoClient, Db } from "mongodb";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let cachedDbTenant: Db | null = null;
let cachedUserDb: Db | null = null;

// Replicate your SvelteKit mongoConn function
export const mongoConn = async (
  dbName = "stadiumpeople",
  retries = 3
): Promise<MongoConnection> => {
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

// Helper function to close connections (useful for cleanup)
export async function closeMongoConnection() {
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
