import { Db, MongoClient } from "mongodb";

export interface MongoConnection {
  client: MongoClient;
  db: Db; // Main database (stadiumpeople)
  dbTenant: Db; // Tenant database
  userDb: Db; // User master database
}
