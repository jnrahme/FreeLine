import type { PoolClient } from "pg";

import { createId } from "../auth/crypto.js";
import { getPostgresPool } from "../services/postgres.js";
import type {
  SubscriptionRecord,
  SubscriptionStore
} from "./types.js";

function mapSubscription(row: Record<string, unknown>): SubscriptionRecord {
  return {
    createdAt: String(row.created_at),
    entitlementKey: row.entitlement_key as SubscriptionRecord["entitlementKey"],
    expiresAt: (row.expires_at as string | null) ?? null,
    id: String(row.id),
    metadata: ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >,
    provider: row.provider as SubscriptionRecord["provider"],
    sourceProductId: String(row.source_product_id),
    status: row.status as SubscriptionRecord["status"],
    transactionId: String(row.transaction_id),
    updatedAt: String(row.updated_at),
    userId: String(row.user_id),
    verifiedAt: String(row.verified_at)
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

export class PostgresSubscriptionStore implements SubscriptionStore {
  async getActiveSubscriptions(input: {
    now?: string;
    userId: string;
  }): Promise<SubscriptionRecord[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `select *
         from subscription_entitlements
         where user_id = $1
           and status = 'active'
           and (expires_at is null or expires_at > $2)
         order by verified_at asc`,
        [input.userId, input.now ?? new Date().toISOString()]
      );

      return result.rows.map((row) => mapSubscription(row as Record<string, unknown>));
    });
  }

  async upsertVerifiedEntitlement(input: {
    entitlementKey: SubscriptionRecord["entitlementKey"];
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
    provider: SubscriptionRecord["provider"];
    sourceProductId: string;
    status?: SubscriptionRecord["status"];
    transactionId: string;
    updatedAt?: string;
    userId: string;
    verifiedAt?: string;
  }): Promise<SubscriptionRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `insert into subscription_entitlements (
           id,
           user_id,
           entitlement_key,
           provider,
           source_product_id,
           transaction_id,
           status,
           expires_at,
           verified_at,
           metadata,
           updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         on conflict (user_id, entitlement_key)
         do update set
           provider = excluded.provider,
           source_product_id = excluded.source_product_id,
           transaction_id = excluded.transaction_id,
           status = excluded.status,
           expires_at = excluded.expires_at,
           verified_at = excluded.verified_at,
           metadata = excluded.metadata,
           updated_at = excluded.updated_at
         returning *`,
        [
          createId(),
          input.userId,
          input.entitlementKey,
          input.provider,
          input.sourceProductId,
          input.transactionId,
          input.status ?? "active",
          input.expiresAt ?? null,
          input.verifiedAt ?? input.updatedAt ?? new Date().toISOString(),
          JSON.stringify(input.metadata ?? {}),
          input.updatedAt ?? new Date().toISOString()
        ]
      );

      return mapSubscription(result.rows[0] as Record<string, unknown>);
    });
  }
}
