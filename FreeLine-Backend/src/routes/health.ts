import type { FastifyInstance } from "fastify";

export interface HealthDependencies {
  checkPostgres: () => Promise<boolean>;
  checkRedis: () => Promise<boolean>;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: HealthDependencies
): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const [postgres, redis] = await Promise.allSettled([
      deps.checkPostgres(),
      deps.checkRedis()
    ]);

    const postgresReady =
      postgres.status === "fulfilled" && postgres.value === true;
    const redisReady = redis.status === "fulfilled" && redis.value === true;
    const ready = postgresReady && redisReady;

    reply.status(ready ? 200 : 503);

    return {
      status: ready ? "ok" : "degraded",
      services: {
        postgres: postgresReady ? "up" : "down",
        redis: redisReady ? "up" : "down"
      }
    };
  });
}
