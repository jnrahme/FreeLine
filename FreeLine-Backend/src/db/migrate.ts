import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPostgresPool, closePostgres } from "../services/postgres.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, "migrations");

export async function runMigrations(): Promise<string[]> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const applied: string[] = [];

    for (const file of files) {
      const existing = await client.query<{ name: string }>(
        "select name from schema_migrations where name = $1",
        [file]
      );

      if (existing.rowCount) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");

      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations(name) values ($1)", [
        file
      ]);
      await client.query("commit");

      applied.push(file);
    }

    return applied;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const applied = await runMigrations();
    console.log(
      applied.length
        ? `Applied migrations: ${applied.join(", ")}`
        : "No migrations to apply."
    );
  } finally {
    await closePostgres();
  }
}
