import type { PoolClient } from "pg";

import { createId } from "../auth/crypto.js";
import { getPostgresPool } from "../services/postgres.js";
import type { AdminStore, AdminUserRecord, InviteCodeRecord } from "./types.js";

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function mapAdminUser(row: Record<string, unknown>): AdminUserRecord {
  return {
    createdAt: toIsoString(row.created_at) ?? "",
    email: String(row.email),
    id: String(row.id),
    passwordHash: String(row.password_hash),
    role: row.role as AdminUserRecord["role"],
    status: row.status as AdminUserRecord["status"],
    updatedAt: toIsoString(row.updated_at) ?? ""
  };
}

function mapInviteCode(row: Record<string, unknown>): InviteCodeRecord {
  return {
    code: String(row.code),
    createdAt: toIsoString(row.created_at) ?? "",
    createdByAdminId: (row.created_by_admin_id as string | null) ?? null,
    currentUses: Number(row.current_uses),
    expiresAt: toIsoString(row.expires_at),
    id: String(row.id),
    maxUses: Number(row.max_uses),
    updatedAt: toIsoString(row.updated_at) ?? ""
  };
}

async function withClient<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export class PostgresAdminStore implements AdminStore {
  async createAdminUser(input: {
    email: string;
    passwordHash: string;
    role?: "admin";
  }): Promise<AdminUserRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into admin_users (
            id,
            email,
            password_hash,
            role
          )
          values ($1, $2, $3, $4)
          on conflict (email)
          do update set password_hash = excluded.password_hash,
                        updated_at = now()
          returning *
        `,
        [createId(), input.email.toLowerCase(), input.passwordHash, input.role ?? "admin"]
      );

      return mapAdminUser(result.rows[0] as Record<string, unknown>);
    });
  }

  async createInviteCode(input: {
    code: string;
    createdByAdminId?: string | null;
    expiresAt?: string | null;
    maxUses: number;
  }): Promise<InviteCodeRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into invite_codes (
            id,
            code,
            max_uses,
            expires_at,
            created_by_admin_id
          )
          values ($1, $2, $3, $4, $5)
          returning *
        `,
        [
          createId(),
          input.code,
          input.maxUses,
          input.expiresAt ?? null,
          input.createdByAdminId ?? null
        ]
      );

      return mapInviteCode(result.rows[0] as Record<string, unknown>);
    });
  }

  async consumeInviteCodeByCode(code: string): Promise<InviteCodeRecord | null> {
    return withClient(async (client) => {
      try {
        await client.query("begin");

        const invite = await client.query(
          `
            select *
            from invite_codes
            where code = $1
            for update
          `,
          [code]
        );

        if (!invite.rowCount) {
          await client.query("rollback");
          return null;
        }

        const record = mapInviteCode(invite.rows[0] as Record<string, unknown>);
        if (
          (record.expiresAt && new Date(record.expiresAt) <= new Date()) ||
          record.currentUses >= record.maxUses
        ) {
          await client.query("rollback");
          return null;
        }

        const updated = await client.query(
          `
            update invite_codes
            set current_uses = current_uses + 1,
                updated_at = now()
            where id = $1
            returning *
          `,
          [record.id]
        );

        await client.query("commit");
        return updated.rowCount
          ? mapInviteCode(updated.rows[0] as Record<string, unknown>)
          : null;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  async consumeInviteCodeById(inviteCodeId: string): Promise<InviteCodeRecord | null> {
    return withClient(async (client) => {
      try {
        await client.query("begin");

        const invite = await client.query(
          `
            select *
            from invite_codes
            where id = $1
            for update
          `,
          [inviteCodeId]
        );

        if (!invite.rowCount) {
          await client.query("rollback");
          return null;
        }

        const record = mapInviteCode(invite.rows[0] as Record<string, unknown>);
        if (
          (record.expiresAt && new Date(record.expiresAt) <= new Date()) ||
          record.currentUses >= record.maxUses
        ) {
          await client.query("rollback");
          return null;
        }

        const updated = await client.query(
          `
            update invite_codes
            set current_uses = current_uses + 1,
                updated_at = now()
            where id = $1
            returning *
          `,
          [record.id]
        );

        await client.query("commit");
        return updated.rowCount
          ? mapInviteCode(updated.rows[0] as Record<string, unknown>)
          : null;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  async findAdminUserByEmail(email: string): Promise<AdminUserRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `select * from admin_users where email = $1 limit 1`,
        [email.toLowerCase()]
      );

      return result.rowCount
        ? mapAdminUser(result.rows[0] as Record<string, unknown>)
        : null;
    });
  }

  async findAdminUserById(adminUserId: string): Promise<AdminUserRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `select * from admin_users where id = $1 limit 1`,
        [adminUserId]
      );

      return result.rowCount
        ? mapAdminUser(result.rows[0] as Record<string, unknown>)
        : null;
    });
  }

  async findInviteCodeByCode(code: string): Promise<InviteCodeRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `select * from invite_codes where code = $1 limit 1`,
        [code]
      );

      return result.rowCount
        ? mapInviteCode(result.rows[0] as Record<string, unknown>)
        : null;
    });
  }

  async listInviteCodes(): Promise<InviteCodeRecord[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `select * from invite_codes order by created_at desc`
      );

      return result.rows.map((row) => mapInviteCode(row as Record<string, unknown>));
    });
  }
}
