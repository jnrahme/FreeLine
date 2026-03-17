import { Pool } from "pg";

import { env } from "../config/env.js";

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
      max: 5,
      idleTimeoutMillis: 5_000
    });
  }

  return pool;
}

export async function checkPostgresConnection(): Promise<boolean> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("select 1");
    return true;
  } finally {
    client.release();
  }
}

export async function closePostgres(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}
