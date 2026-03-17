import { getRedisClient } from "../services/redis.js";
import type { RateLimiter, RateLimitWindowState } from "./types.js";

function buildWindowState(input: {
  limit: number;
  resetAt: string;
  resetInSeconds: number;
  used: number;
}): RateLimitWindowState {
  return {
    limit: input.limit,
    remaining: Math.max(input.limit - input.used, 0),
    resetAt: input.resetAt,
    resetInSeconds: input.resetInSeconds,
    used: input.used
  };
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, { expiresAt: number; used: number }>();
  private readonly sets = new Map<string, { expiresAt: number; values: Set<string> }>();

  async note(input: {
    key: string;
    ttlSeconds: number;
    value: string;
  }): Promise<void> {
    const entry = this.ensureSet(input.key, input.ttlSeconds);
    entry.values.add(input.value);
  }

  async noteUnique(input: {
    key: string;
    ttlSeconds: number;
    value: string;
  }): Promise<{ count: number; isNewValue: boolean }> {
    const entry = this.ensureSet(input.key, input.ttlSeconds);
    const initialSize = entry.values.size;
    entry.values.add(input.value);
    return {
      count: entry.values.size,
      isNewValue: entry.values.size !== initialSize
    };
  }

  async window(input: {
    amount?: number;
    key: string;
    limit: number;
    ttlSeconds: number;
  }): Promise<RateLimitWindowState> {
    const amount = input.amount ?? 1;
    const now = Date.now();
    const entry = this.ensureCounter(input.key, input.ttlSeconds);
    entry.used += amount;
    const resetInSeconds = Math.max(Math.ceil((entry.expiresAt - now) / 1000), 1);
    return buildWindowState({
      limit: input.limit,
      resetAt: new Date(entry.expiresAt).toISOString(),
      resetInSeconds,
      used: entry.used
    });
  }

  private ensureCounter(key: string, ttlSeconds: number) {
    const now = Date.now();
    const existing = this.counters.get(key);

    if (existing && existing.expiresAt > now) {
      return existing;
    }

    const next = {
      expiresAt: now + ttlSeconds * 1000,
      used: 0
    };
    this.counters.set(key, next);
    return next;
  }

  private ensureSet(key: string, ttlSeconds: number) {
    const now = Date.now();
    const existing = this.sets.get(key);

    if (existing && existing.expiresAt > now) {
      return existing;
    }

    const next = {
      expiresAt: now + ttlSeconds * 1000,
      values: new Set<string>()
    };
    this.sets.set(key, next);
    return next;
  }
}

export class RedisRateLimiter implements RateLimiter {
  async note(input: {
    key: string;
    ttlSeconds: number;
    value: string;
  }): Promise<void> {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }

    await client.set(input.key, input.value, "EX", input.ttlSeconds);
  }

  async noteUnique(input: {
    key: string;
    ttlSeconds: number;
    value: string;
  }): Promise<{ count: number; isNewValue: boolean }> {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }

    const added = await client.sadd(input.key, input.value);
    await client.expire(input.key, input.ttlSeconds);
    const count = await client.scard(input.key);

    return {
      count,
      isNewValue: added > 0
    };
  }

  async window(input: {
    amount?: number;
    key: string;
    limit: number;
    ttlSeconds: number;
  }): Promise<RateLimitWindowState> {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }

    const amount = input.amount ?? 1;
    const used = await client.incrby(input.key, amount);
    const ttl = await client.ttl(input.key);

    if (ttl < 0) {
      await client.expire(input.key, input.ttlSeconds);
    }

    const effectiveTtl = ttl > 0 ? ttl : input.ttlSeconds;
    const resetAt = new Date(Date.now() + effectiveTtl * 1000).toISOString();

    return buildWindowState({
      limit: input.limit,
      resetAt,
      resetInSeconds: effectiveTtl,
      used
    });
  }
}
