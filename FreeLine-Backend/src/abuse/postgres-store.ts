import type { PoolClient } from "pg";

import { createId } from "../auth/crypto.js";
import { getPostgresPool } from "../services/postgres.js";
import type {
  AbuseEventRecord,
  AbuseStore,
  DeviceAccountRecord,
  RateLimitAuditInput,
  RateLimitBucketRecord,
  RewardClaimRecord,
  RewardClaimSummary
} from "./types.js";

function mapAbuseEvent(row: Record<string, unknown>): AbuseEventRecord {
  return {
    createdAt: String(row.created_at),
    details: (row.details as Record<string, unknown> | null) ?? {},
    eventType: row.event_type as AbuseEventRecord["eventType"],
    id: String(row.id),
    userId: String(row.user_id)
  };
}

function mapDeviceAccount(row: Record<string, unknown>): DeviceAccountRecord {
  return {
    adminOverrideAt: (row.admin_override_at as string | null) ?? null,
    blockedAt: (row.blocked_at as string | null) ?? null,
    blockedReason: (row.blocked_reason as string | null) ?? null,
    fingerprint: String(row.fingerprint),
    firstSeenAt: String(row.first_seen_at),
    id: String(row.id),
    lastSeenAt: String(row.last_seen_at),
    platform: row.platform as DeviceAccountRecord["platform"],
    userId: String(row.user_id)
  };
}

function mapRewardClaim(row: Record<string, unknown>): RewardClaimRecord {
  return {
    claimedAt: String(row.claimed_at),
    id: String(row.id),
    monthKey: String(row.month_key),
    rewardAmount: Number(row.reward_amount),
    rewardType: row.reward_type as RewardClaimRecord["rewardType"],
    userId: String(row.user_id)
  };
}

function mapRateLimitBucket(row: Record<string, unknown>): RateLimitBucketRecord {
  return {
    bucketKey: String(row.bucket_key),
    bucketScope: String(row.bucket_scope),
    createdAt: String(row.created_at),
    id: String(row.id),
    lastOutcome: row.last_outcome as RateLimitBucketRecord["lastOutcome"],
    limitCount: Number(row.limit_count),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    resetAt: String(row.reset_at),
    updatedAt: String(row.updated_at),
    usedCount: Number(row.used_count),
    userId: (row.user_id as string | null) ?? null,
    windowKey: String(row.window_key)
  };
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export class PostgresAbuseStore implements AbuseStore {
  async countAbuseEvents(input: {
    eventTypes: AbuseEventRecord["eventType"][];
    since: string;
    userId: string;
  }): Promise<number> {
    return withClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `
          select count(*) as count
          from abuse_events
          where user_id = $1
            and created_at >= $2
            and event_type = any($3::text[])
        `,
        [input.userId, input.since, input.eventTypes]
      );

      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async countDistinctActivityDays(input: {
    since: string;
    userId: string;
  }): Promise<number> {
    return withClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `
          select count(distinct date_trunc('day', created_at)) as count
          from abuse_events
          where user_id = $1
            and created_at >= $2
            and event_type = 'activity'
        `,
        [input.userId, input.since]
      );

      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async createAbuseEvent(input: {
    createdAt?: string;
    details?: Record<string, unknown>;
    eventType: AbuseEventRecord["eventType"];
    userId: string;
  }): Promise<AbuseEventRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into abuse_events (id, user_id, event_type, details, created_at)
          values ($1, $2, $3, $4::jsonb, coalesce($5::timestamptz, now()))
          returning *
        `,
        [
          createId(),
          input.userId,
          input.eventType,
          JSON.stringify(input.details ?? {}),
          input.createdAt ?? null
        ]
      );

      return mapAbuseEvent(result.rows[0] as Record<string, unknown>);
    });
  }

  async getRewardClaimSummary(input: {
    maxClaims: number;
    monthKey: string;
    userId: string;
  }): Promise<RewardClaimSummary> {
    return withClient(async (client) => {
      const result = await client.query<{
        call_minutes_granted: string;
        text_events_granted: string;
        total_claims: string;
      }>(
        `
          select
            count(*) as total_claims,
            coalesce(sum(case when reward_type = 'text_events' then reward_amount else 0 end), 0) as text_events_granted,
            coalesce(sum(case when reward_type = 'call_minutes' then reward_amount else 0 end), 0) as call_minutes_granted
          from reward_claims
          where user_id = $1
            and month_key = $2
        `,
        [input.userId, input.monthKey]
      );

      const totalClaims = Number(result.rows[0]?.total_claims ?? 0);

      return {
        callMinutesGranted: Number(result.rows[0]?.call_minutes_granted ?? 0),
        maxClaims: input.maxClaims,
        remainingClaims: Math.max(input.maxClaims - totalClaims, 0),
        textEventsGranted: Number(result.rows[0]?.text_events_granted ?? 0),
        totalClaims
      };
    });
  }

  async hasBlockedFingerprint(fingerprint: string): Promise<boolean> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select 1
          from device_accounts
          where fingerprint = $1
            and blocked_at is not null
            and admin_override_at is null
          limit 1
        `,
        [fingerprint]
      );

      return (result.rowCount ?? 0) > 0;
    });
  }

  async logDeviceAccount(input: {
    fingerprint: string;
    platform: DeviceAccountRecord["platform"];
    userId: string;
  }): Promise<DeviceAccountRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into device_accounts (
            id,
            fingerprint,
            user_id,
            platform
          )
          values ($1, $2, $3, $4)
          on conflict (fingerprint, user_id)
          do update set platform = excluded.platform,
                        last_seen_at = now()
          returning *
        `,
        [createId(), input.fingerprint, input.userId, input.platform]
      );

      return mapDeviceAccount(result.rows[0] as Record<string, unknown>);
    });
  }

  async markFingerprintsBlockedForUser(input: {
    blockedAt?: string;
    fingerprint?: string;
    reason: string;
    userId?: string;
  }): Promise<void> {
    await withClient(async (client) => {
      if (input.userId) {
        await client.query(
          `
            update device_accounts
            set blocked_at = coalesce($2::timestamptz, now()),
                blocked_reason = $3,
                last_seen_at = last_seen_at
            where user_id = $1
          `,
          [input.userId, input.blockedAt ?? null, input.reason]
        );
      }

      if (input.fingerprint) {
        await client.query(
          `
            update device_accounts
            set blocked_at = coalesce($2::timestamptz, now()),
                blocked_reason = $3
            where fingerprint = $1
          `,
          [input.fingerprint, input.blockedAt ?? null, input.reason]
        );
      }
    });
  }

  async setAdminOverrideForUserDevices(input: {
    adminOverrideAt?: string;
    cleared?: boolean;
    userId: string;
  }): Promise<void> {
    await withClient(async (client) => {
      await client.query(
        `
          update device_accounts
          set admin_override_at = case
                when $2::boolean then null
                else coalesce($3::timestamptz, now())
              end
          where user_id = $1
        `,
        [input.userId, input.cleared ?? false, input.adminOverrideAt ?? null]
      );
    });
  }

  async recordRewardClaim(input: {
    claimedAt?: string;
    monthKey: string;
    rewardAmount: number;
    rewardType: RewardClaimRecord["rewardType"];
    userId: string;
  }): Promise<RewardClaimRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into reward_claims (
            id,
            user_id,
            reward_type,
            reward_amount,
            month_key,
            claimed_at
          )
          values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))
          returning *
        `,
        [
          createId(),
          input.userId,
          input.rewardType,
          input.rewardAmount,
          input.monthKey,
          input.claimedAt ?? null
        ]
      );

      return mapRewardClaim(result.rows[0] as Record<string, unknown>);
    });
  }

  async upsertRateLimitBucket(input: RateLimitAuditInput): Promise<RateLimitBucketRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into rate_limit_buckets (
            id,
            user_id,
            bucket_key,
            bucket_scope,
            window_key,
            used_count,
            limit_count,
            reset_at,
            last_outcome,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
          on conflict (bucket_key, window_key)
          do update set user_id = excluded.user_id,
                        used_count = excluded.used_count,
                        limit_count = excluded.limit_count,
                        reset_at = excluded.reset_at,
                        last_outcome = excluded.last_outcome,
                        metadata = excluded.metadata,
                        updated_at = now()
          returning *
        `,
        [
          createId(),
          input.userId ?? null,
          input.bucketKey,
          input.bucketScope,
          input.windowKey,
          input.usedCount,
          input.limitCount,
          input.resetAt,
          input.outcome,
          JSON.stringify(input.metadata ?? {})
        ]
      );

      return mapRateLimitBucket(result.rows[0] as Record<string, unknown>);
    });
  }
}
