import type { PoolClient } from "pg";

import { getPostgresPool } from "../services/postgres.js";
import { createId } from "./crypto.js";
import type {
  AuthIdentityRecord,
  AuthProvider,
  AuthStore,
  DevicePlatform,
  DeviceRecord,
  EmailVerificationRecord,
  RefreshTokenRecord,
  UserRecord
} from "./types.js";

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    createdAt: String(row.created_at),
    displayName: (row.display_name as string | null) ?? null,
    email: String(row.email),
    id: String(row.id),
    status: row.status as UserRecord["status"],
    trustScore: Number(row.trust_score),
    updatedAt: String(row.updated_at)
  };
}

function mapIdentity(row: Record<string, unknown>): AuthIdentityRecord {
  return {
    createdAt: String(row.created_at),
    id: String(row.id),
    passwordHash: (row.password_hash as string | null) ?? null,
    provider: row.provider as AuthProvider,
    providerId: String(row.provider_id),
    userId: String(row.user_id)
  };
}

function mapDevice(row: Record<string, unknown>): DeviceRecord {
  return {
    createdAt: String(row.created_at),
    fingerprint: String(row.fingerprint),
    id: String(row.id),
    platform: row.platform as DevicePlatform,
    pushToken: (row.push_token as string | null) ?? null,
    updatedAt: String(row.updated_at),
    userId: String(row.user_id)
  };
}

function mapEmailVerification(
  row: Record<string, unknown>
): EmailVerificationRecord {
  return {
    consumedAt: (row.consumed_at as string | null) ?? null,
    createdAt: String(row.created_at),
    email: String(row.email),
    expiresAt: String(row.expires_at),
    id: String(row.id),
    inviteCodeId: (row.invite_code_id as string | null) ?? null,
    passwordHash: String(row.password_hash),
    tokenHash: String(row.token_hash),
    userId: (row.user_id as string | null) ?? null
  };
}

function mapRefreshToken(row: Record<string, unknown>): RefreshTokenRecord {
  return {
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    id: String(row.id),
    revokedAt: (row.revoked_at as string | null) ?? null,
    tokenHash: String(row.token_hash),
    userId: String(row.user_id)
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

export class PostgresAuthStore implements AuthStore {
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        "select * from users where email = $1 limit 1",
        [email.toLowerCase()]
      );
      return result.rowCount ? mapUser(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    return withClient(async (client) => {
      const result = await client.query("select * from users where id = $1 limit 1", [
        userId
      ]);
      return result.rowCount ? mapUser(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async createUser(input: {
    email: string;
    displayName?: string | null;
  }): Promise<UserRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `insert into users (id, email, display_name)
         values ($1, $2, $3)
         returning *`,
        [createId(), input.email.toLowerCase(), input.displayName ?? null]
      );

      return mapUser(result.rows[0] as Record<string, unknown>);
    });
  }

  async markUserDeleted(userId: string): Promise<void> {
    await withClient(async (client) => {
      await client.query(
        `update users
         set status = 'deleted', updated_at = now()
         where id = $1`,
        [userId]
      );
    });
  }

  async findIdentity(
    provider: AuthProvider,
    providerId: string
  ): Promise<AuthIdentityRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `select * from auth_identities
         where provider = $1 and provider_id = $2
         limit 1`,
        [provider, providerId]
      );
      return result.rowCount
        ? mapIdentity(result.rows[0] as Record<string, unknown>)
        : null;
    });
  }

  async createIdentity(input: {
    userId: string;
    provider: AuthProvider;
    providerId: string;
    passwordHash?: string | null;
  }): Promise<AuthIdentityRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `insert into auth_identities (id, user_id, provider, provider_id, password_hash)
         values ($1, $2, $3, $4, $5)
         on conflict (provider, provider_id)
         do update set password_hash = coalesce(excluded.password_hash, auth_identities.password_hash)
         returning *`,
        [
          createId(),
          input.userId,
          input.provider,
          input.providerId,
          input.passwordHash ?? null
        ]
      );

      return mapIdentity(result.rows[0] as Record<string, unknown>);
    });
  }

  async updateEmailPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await withClient(async (client) => {
      const user = await client.query(
        "select email from users where id = $1 limit 1",
        [userId]
      );

      if (!user.rowCount) {
        return;
      }

      const email = String(user.rows[0]?.email);
      await client.query(
        `insert into auth_identities (id, user_id, provider, provider_id, password_hash)
         values ($1, $2, 'email', $3, $4)
         on conflict (provider, provider_id)
         do update set password_hash = excluded.password_hash`,
        [createId(), userId, email, passwordHash]
      );
    });
  }

  async createEmailVerification(input: {
    userId?: string | null;
    inviteCodeId?: string | null;
    email: string;
    passwordHash: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<EmailVerificationRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `insert into email_verifications (
           id,
           user_id,
           invite_code_id,
           email,
           password_hash,
           token_hash,
           expires_at
         )
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          createId(),
          input.userId ?? null,
          input.inviteCodeId ?? null,
          input.email.toLowerCase(),
          input.passwordHash,
          input.tokenHash,
          input.expiresAt
        ]
      );

      return mapEmailVerification(result.rows[0] as Record<string, unknown>);
    });
  }

  async consumeEmailVerification(tokenHash: string): Promise<EmailVerificationRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `update email_verifications
         set consumed_at = now()
         where token_hash = $1
           and consumed_at is null
           and expires_at > now()
         returning *`,
        [tokenHash]
      );

      return result.rowCount
        ? mapEmailVerification(result.rows[0] as Record<string, unknown>)
        : null;
    });
  }

  async createOrUpdateDevice(input: {
    userId: string;
    fingerprint: string;
    platform: DevicePlatform;
    pushToken?: string | null;
  }): Promise<DeviceRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `insert into devices (id, user_id, fingerprint, platform, push_token)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, fingerprint)
         do update set platform = excluded.platform, push_token = excluded.push_token, updated_at = now()
         returning *`,
        [
          createId(),
          input.userId,
          input.fingerprint,
          input.platform,
          input.pushToken ?? null
        ]
      );

      return mapDevice(result.rows[0] as Record<string, unknown>);
    });
  }

  async countDistinctUsersForFingerprint(fingerprint: string): Promise<number> {
    return withClient(async (client) => {
      const result = await client.query(
        `select count(distinct user_id) as count
         from devices
         where fingerprint = $1`,
        [fingerprint]
      );
      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async hasDeviceForUser(input: {
    userId: string;
    fingerprint: string;
  }): Promise<boolean> {
    return withClient(async (client) => {
      const result = await client.query(
        `select 1 from devices where user_id = $1 and fingerprint = $2 limit 1`,
        [input.userId, input.fingerprint]
      );
      return Boolean(result.rowCount);
    });
  }

  async updateUserModeration(input: {
    status?: UserRecord["status"];
    trustScore: number;
    userId: string;
  }): Promise<UserRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          update users
          set trust_score = $2,
              status = coalesce($3, status),
              updated_at = now()
          where id = $1
          returning *
        `,
        [input.userId, input.trustScore, input.status ?? null]
      );

      return result.rowCount ? mapUser(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async storeRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<RefreshTokenRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `insert into refresh_tokens (id, user_id, token_hash, expires_at)
         values ($1, $2, $3, $4)
         returning *`,
        [createId(), input.userId, input.tokenHash, input.expiresAt]
      );
      return mapRefreshToken(result.rows[0] as Record<string, unknown>);
    });
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `select * from refresh_tokens where token_hash = $1 limit 1`,
        [tokenHash]
      );
      return result.rowCount
        ? mapRefreshToken(result.rows[0] as Record<string, unknown>)
        : null;
    });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await withClient(async (client) => {
      await client.query(
        `update refresh_tokens
         set revoked_at = now()
         where token_hash = $1 and revoked_at is null`,
        [tokenHash]
      );
    });
  }

  async revokeRefreshTokensForUser(userId: string): Promise<void> {
    await withClient(async (client) => {
      await client.query(
        `update refresh_tokens
         set revoked_at = now()
         where user_id = $1 and revoked_at is null`,
        [userId]
      );
    });
  }
}
