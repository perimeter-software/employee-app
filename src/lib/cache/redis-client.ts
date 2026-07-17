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
      const useTls = process.env.REDIS_TLS === 'true';
      const protocol = useTls ? 'rediss' : 'redis';
      const redisUrl =
        process.env.REDIS_URL ||
        `${protocol}://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;

      this.client = createClient({
        url: redisUrl,
        socket: {
          // Fail a single connection attempt fast instead of hanging on a
          // dropped SYN (e.g. Security Group blocking the port).
          connectTimeout: 5000,
          // Give up after a handful of retries so connect() rejects instead of
          // retrying forever. Returning an Error stops reconnection and lets
          // callers (which all fail-open) proceed without Redis.
          reconnectStrategy: (retries) => {
            if (retries >= 5) {
              return new Error('Redis unreachable — giving up');
            }
            return Math.min(retries * 50, 500);
          },
          ...(useTls ? { tls: true } : {}),
        },
      });

      this.client.on("error", (err) => {
        console.error("Redis Client Error:", err);
      });

      this.client.on("connect", () => {
        console.log("Redis Client Connected");
      });

      // Hard cap the total connect time so one request can't wait through
      // several retry attempts. Whichever settles first wins; on timeout we
      // tear down the half-open client so the next call starts fresh.
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis connect timed out')), 6000)
        ),
      ]);
      this.isConnecting = false;
      return this.client;
    } catch (error) {
      this.isConnecting = false;
      // Tear down the half-open client so it doesn't keep a reconnect loop
      // alive in the background, and so the next call builds a fresh one.
      try {
        await this.client?.destroy();
      } catch {
        // ignore — client may already be unusable
      }
      this.client = null;
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

  async set(key: string, value: unknown, expiry?: number) {
    try {
      const client = await this.getClient();
      const serializedValue = JSON.stringify(value);

      if (expiry) {
        await client?.setEx(key, expiry, serializedValue);
      } else {
        await client?.set(key, serializedValue);
      }
    } catch (error) {
      console.error("Error setting data in Redis:", error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const data = await client?.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (error) {
      console.error("Error getting data from Redis:", error);
      return null;
    }
  }

  // Added del method for cache clearing
  async del(key: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client?.del(key);
    } catch (error) {
      console.error("Error deleting data from Redis:", error);
    }
  }

  /**
   * Atomic increment with auto-expire. Returns the new count,
   * or null if Redis is unreachable (caller should fail-open).
   */
  async incr(key: string, expireSeconds: number): Promise<number | null> {
    try {
      const client = await this.getClient();
      if (!client) return null;
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, expireSeconds);
      }
      return count;
    } catch (error) {
      console.error("Error incrementing key in Redis:", error);
      return null;
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
