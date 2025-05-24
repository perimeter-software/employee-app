// lib/server/redisClient.ts
import { createClient } from "redis";

class RedisService {
  private client: ReturnType<typeof createClient> | null = null;
  private isConnecting = false;

  private async getClient() {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait for connection to complete
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return this.client;
    }

    this.isConnecting = true;

    try {
      const redisUrl =
        process.env.REDIS_URL ||
        `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;

      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        },
      });

      this.client.on("error", (err) => {
        console.error("Redis Client Error:", err);
      });

      this.client.on("connect", () => {
        console.log("Redis Client Connected");
      });

      await this.client.connect();
      this.isConnecting = false;
      return this.client;
    } catch (error) {
      this.isConnecting = false;
      console.error("Failed to connect to Redis:", error);
      throw error;
    }
  }

  async setTenantData(email: string, data: unknown, expiry: number) {
    try {
      const client = await this.getClient();
      const key = `tenant:${email}`;
      await client?.setEx(key, expiry, JSON.stringify(data));
    } catch (error) {
      console.error("Error setting tenant data in Redis:", error);
    }
  }

  async getTenantData(email: string) {
    try {
      const client = await this.getClient();
      const key = `tenant:${email}`;
      const data = await client?.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Error getting tenant data from Redis:", error);
      return null;
    }
  }

  async deleteTenantData(email: string) {
    try {
      const client = await this.getClient();
      const key = `tenant:${email}`;
      await client?.del(key);
    } catch (error) {
      console.error("Error deleting tenant data from Redis:", error);
    }
  }

  async disconnect() {
    try {
      await this.client?.disconnect();
      this.client = null;
    } catch (error) {
      console.error("Error disconnecting from Redis:", error);
    }
  }
}

const redisService = new RedisService();
export default redisService;
