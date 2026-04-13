import Redis from "ioredis";

let redisClient: Redis | null = null;

export async function connectRedis(): Promise<boolean> {
  try {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    await redisClient.connect();
    console.log("Redis connected");
    return true;
  } catch (e) {
    console.warn("Redis not available — running without cache:", (e as Error).message);
    redisClient = null;
    return false;
  }
}

// Safe redis wrapper — never throws, returns null on failure
export const redis = {
  async get(key: string): Promise<string | null> {
    try { return await redisClient?.get(key) ?? null; }
    catch { return null; }
  },
  async set(key: string, value: string): Promise<void> {
    try { await redisClient?.set(key, value); }
    catch { /* silent */ }
  },
  async setex(key: string, ttl: number, value: string): Promise<void> {
    try { await redisClient?.setex(key, ttl, value); }
    catch { /* silent */ }
  },
  async incr(key: string): Promise<number> {
    try { return await redisClient?.incr(key) ?? 1; }
    catch { return 1; }
  },
  async expire(key: string, ttl: number): Promise<void> {
    try { await redisClient?.expire(key, ttl); }
    catch { /* silent */ }
  },
  async ttl(key: string): Promise<number> {
    try { return await redisClient?.ttl(key) ?? 0; }
    catch { return 0; }
  },
  async del(key: string): Promise<void> {
    try { await redisClient?.del(key); }
    catch { /* silent */ }
  },
};

export default redis;
