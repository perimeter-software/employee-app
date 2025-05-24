import type { MongoClient, Db } from "mongodb";

export interface MongoConnection {
  client: MongoClient;
  db: Db;
  dbTenant: Db;
  userDb: Db;
}
