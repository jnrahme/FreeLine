import type { PoolClient } from "pg";

import { createId } from "../auth/crypto.js";
import { getPostgresPool } from "../services/postgres.js";
import type {
  CallHistoryPage,
  CallPushTokenRecord,
  CallStore,
  CallUsageRecord,
  ListCallsInput,
  ListVoicemailsInput,
  RegisterCallPushTokenInput,
  UpsertCallFromWebhookInput,
  UpsertVoicemailInput,
  VoicemailPage,
  VoicemailRecord
} from "./types.js";

function mapCall(row: Record<string, unknown>) {
  return {
    createdAt: String(row.created_at),
    direction: row.direction as "outbound" | "inbound",
    durationSeconds: Number(row.duration_seconds ?? 0),
    endedAt: (row.ended_at as string | null) ?? null,
    id: String(row.id),
    phoneNumberId: String(row.phone_number_id),
    providerCallId: String(row.provider_call_id),
    remoteNumber: String(row.remote_number),
    startedAt: (row.started_at as string | null) ?? null,
    status: row.status as
      | "initiated"
      | "ringing"
      | "answered"
      | "completed"
      | "missed"
      | "failed",
    updatedAt: String(row.updated_at),
    userId: String(row.user_id)
  };
}

function mapCallPushToken(row: Record<string, unknown>): CallPushTokenRecord {
  return {
    channel: row.channel as CallPushTokenRecord["channel"],
    createdAt: String(row.created_at),
    deviceId: String(row.device_id),
    id: String(row.id),
    platform: row.platform as CallPushTokenRecord["platform"],
    token: String(row.token),
    updatedAt: String(row.updated_at),
    userId: String(row.user_id)
  };
}

function mapVoicemail(row: Record<string, unknown>): VoicemailRecord {
  return {
    audioUrl: String(row.audio_url),
    callerNumber: String(row.caller_number),
    createdAt: String(row.created_at),
    durationSeconds: Number(row.duration_seconds ?? 0),
    id: String(row.id),
    isRead: Boolean(row.is_read),
    phoneNumberId: String(row.phone_number_id),
    providerCallId: String(row.provider_call_id),
    transcription: (row.transcription as string | null) ?? null,
    updatedAt: String(row.updated_at),
    userId: String(row.user_id)
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

export class PostgresCallStore implements CallStore {
  async deleteVoicemail(input: {
    voicemailId: string;
    userId: string;
  }): Promise<VoicemailRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          delete from voicemails
          where id = $1
            and user_id = $2
          returning *
        `,
        [input.voicemailId, input.userId]
      );

      return result.rowCount ? mapVoicemail(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async findCallByProviderCallId(providerCallId: string) {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select *
          from calls
          where provider_call_id = $1
          limit 1
        `,
        [providerCallId]
      );

      return result.rowCount ? mapCall(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async findCallPushTokensByUser(input: {
    channel?: CallPushTokenRecord["channel"];
    userId: string;
  }): Promise<CallPushTokenRecord[]> {
    return withClient(async (client) => {
      const result = input.channel
        ? await client.query(
            `
              select *
              from call_push_tokens
              where user_id = $1
                and channel = $2
              order by updated_at desc, created_at desc
            `,
            [input.userId, input.channel]
          )
        : await client.query(
            `
              select *
              from call_push_tokens
              where user_id = $1
              order by updated_at desc, created_at desc
            `,
            [input.userId]
          );

      return result.rows.map((row) => mapCallPushToken(row as Record<string, unknown>));
    });
  }

  async findVoicemailByProviderCallId(
    providerCallId: string
  ): Promise<VoicemailRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select *
          from voicemails
          where provider_call_id = $1
          limit 1
        `,
        [providerCallId]
      );

      return result.rowCount ? mapVoicemail(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async getMonthlyUsage(userId: string): Promise<CallUsageRecord> {
    return withClient(async (client) => {
      const result = await client.query<{
        daily_total_seconds: string;
        monthly_total_seconds: string;
      }>(
        `
          select
            coalesce(sum(duration_seconds) filter (
              where coalesce(ended_at, started_at, created_at) >= date_trunc('day', now())
            ), 0) as daily_total_seconds,
            coalesce(sum(duration_seconds), 0) as monthly_total_seconds
          from calls
          where user_id = $1
            and duration_seconds > 0
            and coalesce(ended_at, started_at, created_at) >= date_trunc('month', now())
        `,
        [userId]
      );

      return {
        dailyUsedMinutes: Math.ceil(Number(result.rows[0]?.daily_total_seconds ?? 0) / 60),
        monthlyUsedMinutes: Math.ceil(
          Number(result.rows[0]?.monthly_total_seconds ?? 0) / 60
        )
      };
    });
  }

  async listCallHistory(input: ListCallsInput): Promise<CallHistoryPage> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select *
          from calls
          where user_id = $1
          order by coalesce(ended_at, started_at, created_at) desc, created_at desc
          limit $2
          offset $3
        `,
        [input.userId, input.limit, input.offset]
      );

      return {
        calls: result.rows.map((row) => mapCall(row as Record<string, unknown>)),
        limit: input.limit,
        offset: input.offset
      };
    });
  }

  async listVoicemails(input: ListVoicemailsInput): Promise<VoicemailPage> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select *
          from voicemails
          where user_id = $1
          order by created_at desc
          limit $2
          offset $3
        `,
        [input.userId, input.limit, input.offset]
      );

      return {
        limit: input.limit,
        offset: input.offset,
        voicemails: result.rows.map((row) => mapVoicemail(row as Record<string, unknown>))
      };
    });
  }

  async markVoicemailRead(input: {
    userId: string;
    voicemailId: string;
  }): Promise<VoicemailRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          update voicemails
          set is_read = true,
              updated_at = now()
          where id = $1
            and user_id = $2
          returning *
        `,
        [input.voicemailId, input.userId]
      );

      return result.rowCount ? mapVoicemail(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async registerCallPushToken(
    input: RegisterCallPushTokenInput
  ): Promise<CallPushTokenRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into call_push_tokens (
            id,
            user_id,
            device_id,
            platform,
            channel,
            token
          )
          values ($1, $2, $3, $4, $5, $6)
          on conflict (user_id, device_id, platform, channel)
          do update set token = excluded.token,
                        updated_at = now()
          returning *
        `,
        [
          createId(),
          input.userId,
          input.deviceId,
          input.platform,
          input.channel,
          input.token
        ]
      );

      return mapCallPushToken(result.rows[0] as Record<string, unknown>);
    });
  }

  async upsertCallFromWebhook(input: UpsertCallFromWebhookInput) {
    return withClient(async (client) => {
      const existing = await client.query(
        `
          select *
          from calls
          where provider_call_id = $1
          limit 1
        `,
        [input.providerCallId]
      );

      if (existing.rowCount) {
        const result = await client.query(
          `
            update calls
            set status = $2,
                duration_seconds = case
                  when $3::int is null then duration_seconds
                  else $3
                end,
                started_at = coalesce(started_at, $4::timestamptz),
                ended_at = coalesce($5::timestamptz, ended_at),
                updated_at = now()
            where provider_call_id = $1
            returning *
          `,
          [
            input.providerCallId,
            input.status,
            input.durationSeconds,
            input.startedAt,
            input.endedAt
          ]
        );

        return mapCall(result.rows[0] as Record<string, unknown>);
      }

      const result = await client.query(
        `
          insert into calls (
            id,
            provider_call_id,
            user_id,
            phone_number_id,
            remote_number,
            direction,
            status,
            duration_seconds,
            started_at,
            ended_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 0), $9, $10)
          returning *
        `,
        [
          createId(),
          input.providerCallId,
          input.userId,
          input.phoneNumberId,
          input.remoteNumber,
          input.direction,
          input.status,
          input.durationSeconds,
          input.startedAt,
          input.endedAt
        ]
      );

      return mapCall(result.rows[0] as Record<string, unknown>);
    });
  }

  async upsertVoicemail(input: UpsertVoicemailInput): Promise<VoicemailRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into voicemails (
            id,
            provider_call_id,
            user_id,
            phone_number_id,
            caller_number,
            audio_url,
            duration_seconds,
            transcription
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          on conflict (provider_call_id)
          do update set audio_url = excluded.audio_url,
                        caller_number = excluded.caller_number,
                        duration_seconds = excluded.duration_seconds,
                        transcription = excluded.transcription,
                        updated_at = now()
          returning *
        `,
        [
          input.id,
          input.providerCallId,
          input.userId,
          input.phoneNumberId,
          input.callerNumber,
          input.audioUrl,
          input.durationSeconds,
          input.transcription
        ]
      );

      return mapVoicemail(result.rows[0] as Record<string, unknown>);
    });
  }
}
