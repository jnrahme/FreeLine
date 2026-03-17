import { Redis } from "ioredis";

import { env } from "../config/env.js";

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
  }

  return redis;
}

export async function checkRedisConnection(): Promise<boolean> {
  const client = getRedisClient();

  if (client.status === "wait") {
    await client.connect();
  }

  const result = await client.ping();
  return result === "PONG";
}

export async function closeRedis(): Promise<void> {
  if (!redis) {
    return;
  }

  if (redis.status === "wait") {
    redis.disconnect();
  } else {
    await redis.quit();
  }

  redis = null;
}
