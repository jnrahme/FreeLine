import type { PoolClient } from "pg";

import { createId } from "../auth/crypto.js";
import { getPostgresPool } from "../services/postgres.js";
import type {
  AdminAbuseQueueItem,
  AdminCostDashboardSeed,
  AdminCostTrendSeedPoint,
  AdminManagedAssignedNumberRecord,
  AdminManagedUserDetailSeed,
  AdminManagedUserDeviceRecord,
  AdminManagedUserSummary,
  AdminNumberInventoryItem,
  AdminOpsStore
} from "./ops-types.js";

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

function normalizePhoneQuery(query: string): string | null {
  const digits = query.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

function mapUserSummary(row: Record<string, unknown>): AdminManagedUserSummary {
  return {
    activeNumber: (row.active_number as string | null) ?? null,
    assignedAt: toIsoString(row.assigned_at),
    createdAt: toIsoString(row.created_at) ?? "",
    displayName: (row.display_name as string | null) ?? null,
    email: String(row.email),
    id: String(row.id),
    status: row.status as AdminManagedUserSummary["status"],
    trustScore: Number(row.trust_score),
    updatedAt: toIsoString(row.updated_at) ?? ""
  };
}

function mapAssignedNumber(
  row: Record<string, unknown>
): AdminManagedAssignedNumberRecord | null {
  if (!row.assignment_id || !row.phone_number || !row.phone_number_id) {
    return null;
  }

  return {
    activationDeadline: toIsoString(row.activation_deadline) ?? "",
    areaCode: String(row.area_code ?? ""),
    assignedAt: toIsoString(row.assigned_at) ?? "",
    assignmentId: String(row.assignment_id),
    lastActivityAt: toIsoString(row.last_activity_at),
    locality: String(row.locality ?? ""),
    nationalFormat: String(row.national_format ?? ""),
    phoneNumber: String(row.phone_number),
    phoneNumberId: String(row.phone_number_id),
    provider: row.provider as AdminManagedAssignedNumberRecord["provider"],
    region: String(row.region ?? ""),
    status: row.number_status as AdminManagedAssignedNumberRecord["status"]
  };
}

function mapDevice(row: Record<string, unknown>): AdminManagedUserDeviceRecord {
  return {
    adminOverrideAt: toIsoString(row.admin_override_at),
    blockedAt: toIsoString(row.blocked_at),
    blockedReason: (row.blocked_reason as string | null) ?? null,
    createdAt: toIsoString(row.created_at),
    deviceId: (row.device_id as string | null) ?? null,
    fingerprint: String(row.fingerprint),
    firstSeenAt: toIsoString(row.first_seen_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    platform: (row.platform as AdminManagedUserDeviceRecord["platform"]) ?? null,
    pushToken: (row.push_token as string | null) ?? null,
    updatedAt: toIsoString(row.updated_at)
  };
}

function mapAbuseQueueItem(row: Record<string, unknown>): AdminAbuseQueueItem {
  return {
    activeNumber: (row.active_number as string | null) ?? null,
    createdAt: toIsoString(row.created_at) ?? "",
    details: (row.details as Record<string, unknown> | null) ?? {},
    eventType: row.event_type as AdminAbuseQueueItem["eventType"],
    id: String(row.id),
    reviewAction: (row.review_action as AdminAbuseQueueItem["reviewAction"]) ?? null,
    reviewedAt: toIsoString(row.reviewed_at),
    reviewedByAdminId: (row.reviewed_by_admin_id as string | null) ?? null,
    userEmail: String(row.user_email),
    userId: String(row.user_id),
    userStatus: row.user_status as AdminAbuseQueueItem["userStatus"],
    userTrustScore: Number(row.user_trust_score)
  };
}

function mapNumberInventoryItem(row: Record<string, unknown>): AdminNumberInventoryItem {
  const warningTypes = Array.isArray(row.warning_types)
    ? row.warning_types.map((warningType) => String(warningType))
    : [];

  return {
    areaCode: String(row.area_code ?? ""),
    assignedAt: toIsoString(row.assigned_at),
    locality: String(row.locality ?? ""),
    phoneNumber: String(row.phone_number),
    phoneNumberId: String(row.phone_number_id),
    provider: row.provider as AdminNumberInventoryItem["provider"],
    quarantineAvailableAt: toIsoString(row.quarantine_available_at),
    quarantineReason: (row.quarantine_reason as string | null) ?? null,
    quarantineStatus: (row.quarantine_status as AdminNumberInventoryItem["quarantineStatus"]) ?? null,
    quarantinedAt: toIsoString(row.quarantined_at),
    region: String(row.region ?? ""),
    releaseReason: (row.release_reason as string | null) ?? null,
    releasedAt: toIsoString(row.released_at),
    status: row.status as AdminNumberInventoryItem["status"],
    userEmail: (row.user_email as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
    warningTypes: warningTypes as AdminNumberInventoryItem["warningTypes"]
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

export class PostgresAdminOpsStore implements AdminOpsStore {
  async searchUsers(input: {
    limit: number;
    query: string;
  }): Promise<AdminManagedUserSummary[]> {
    return withClient(async (client) => {
      const trimmedQuery = input.query.trim();
      const exactPhone = normalizePhoneQuery(trimmedQuery);
      const result = await client.query(
        `
          select
            u.id,
            u.email,
            u.display_name,
            u.status,
            u.trust_score,
            u.created_at,
            u.updated_at,
            active_assignment.phone_number as active_number,
            active_assignment.assigned_at
          from users u
          left join lateral (
            select
              pn.phone_number,
              na.assigned_at
            from number_assignments na
            join phone_numbers pn on pn.id = na.phone_number_id
            where na.user_id = u.id
              and na.released_at is null
            order by na.assigned_at desc
            limit 1
          ) active_assignment on true
          where (
            $1 = ''
            or lower(u.email) like $2
            or u.id = $1
            or active_assignment.phone_number = $3
          )
          order by u.created_at desc
          limit $4
        `,
        [trimmedQuery, `%${trimmedQuery.toLowerCase()}%`, exactPhone, input.limit]
      );

      return result.rows.map((row) => mapUserSummary(row as Record<string, unknown>));
    });
  }

  async findUserDetail(userId: string): Promise<AdminManagedUserDetailSeed | null> {
    return withClient(async (client) => {
      const userResult = await client.query(
        `
          select
            u.id,
            u.email,
            u.display_name,
            u.status,
            u.trust_score,
            u.created_at,
            u.updated_at,
            active_assignment.assignment_id,
            active_assignment.phone_number,
            active_assignment.phone_number_id,
            active_assignment.assigned_at,
            active_assignment.activation_deadline,
            active_assignment.last_activity_at,
            active_assignment.area_code,
            active_assignment.locality,
            active_assignment.region,
            active_assignment.national_format,
            active_assignment.provider,
            active_assignment.number_status,
            coalesce(message_usage.total_text_events_this_month, 0) as total_text_events_this_month,
            coalesce(call_usage.total_call_minutes_this_month, 0) as total_call_minutes_this_month,
            active_assignment.phone_number as active_number
          from users u
          left join lateral (
            select
              na.id as assignment_id,
              na.assigned_at,
              na.activation_deadline,
              na.last_activity_at,
              pn.id as phone_number_id,
              pn.phone_number,
              pn.area_code,
              pn.locality,
              pn.region,
              pn.national_format,
              pn.provider,
              pn.status as number_status
            from number_assignments na
            join phone_numbers pn on pn.id = na.phone_number_id
            where na.user_id = u.id
              and na.released_at is null
            order by na.assigned_at desc
            limit 1
          ) active_assignment on true
          left join lateral (
            select count(*)::int as total_text_events_this_month
            from messages m
            join conversations c on c.id = m.conversation_id
            where c.user_id = u.id
              and m.created_at >= date_trunc('month', now())
          ) message_usage on true
          left join lateral (
            select ceil(coalesce(sum(c.duration_seconds), 0)::numeric / 60)::int as total_call_minutes_this_month
            from calls c
            where c.user_id = u.id
              and coalesce(c.ended_at, c.started_at, c.created_at) >= date_trunc('month', now())
          ) call_usage on true
          where u.id = $1
          limit 1
        `,
        [userId]
      );

      if (!userResult.rowCount) {
        return null;
      }

      const userRow = userResult.rows[0] as Record<string, unknown>;
      const devicesResult = await client.query(
        `
          select
            d.id as device_id,
            coalesce(d.fingerprint, da.fingerprint) as fingerprint,
            coalesce(d.platform, da.platform) as platform,
            d.push_token,
            d.created_at,
            d.updated_at,
            da.blocked_at,
            da.blocked_reason,
            da.admin_override_at,
            da.first_seen_at,
            da.last_seen_at
          from devices d
          full outer join device_accounts da
            on d.user_id = da.user_id
           and d.fingerprint = da.fingerprint
          where coalesce(d.user_id, da.user_id) = $1
          order by coalesce(da.last_seen_at, d.updated_at, d.created_at) desc nulls last
        `,
        [userId]
      );

      const abuseEventsResult = await client.query(
        `
          select
            ae.id,
            ae.user_id,
            ae.event_type,
            ae.details,
            ae.created_at,
            u.email as user_email,
            u.status as user_status,
            u.trust_score as user_trust_score,
            active_assignment.phone_number as active_number,
            aer.action as review_action,
            aer.reviewed_at,
            aer.admin_user_id as reviewed_by_admin_id
          from abuse_events ae
          join users u on u.id = ae.user_id
          left join abuse_event_reviews aer on aer.abuse_event_id = ae.id
          left join lateral (
            select pn.phone_number
            from number_assignments na
            join phone_numbers pn on pn.id = na.phone_number_id
            where na.user_id = u.id
              and na.released_at is null
            order by na.assigned_at desc
            limit 1
          ) active_assignment on true
          where ae.user_id = $1
            and ae.event_type <> 'activity'
          order by ae.created_at desc
          limit 50
        `,
        [userId]
      );

      return {
        ...mapUserSummary(userRow),
        abuseEvents: abuseEventsResult.rows.map((row) =>
          mapAbuseQueueItem(row as Record<string, unknown>)
        ),
        assignedNumber: mapAssignedNumber(userRow),
        devices: devicesResult.rows.map((row) =>
          mapDevice(row as Record<string, unknown>)
        ),
        totalCallMinutesThisMonth: Number(userRow.total_call_minutes_this_month ?? 0),
        totalTextEventsThisMonth: Number(userRow.total_text_events_this_month ?? 0)
      };
    });
  }

  async findAbuseQueueItem(abuseEventId: string): Promise<AdminAbuseQueueItem | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select
            ae.id,
            ae.user_id,
            ae.event_type,
            ae.details,
            ae.created_at,
            u.email as user_email,
            u.status as user_status,
            u.trust_score as user_trust_score,
            active_assignment.phone_number as active_number,
            aer.action as review_action,
            aer.reviewed_at,
            aer.admin_user_id as reviewed_by_admin_id
          from abuse_events ae
          join users u on u.id = ae.user_id
          left join abuse_event_reviews aer on aer.abuse_event_id = ae.id
          left join lateral (
            select pn.phone_number
            from number_assignments na
            join phone_numbers pn on pn.id = na.phone_number_id
            where na.user_id = u.id
              and na.released_at is null
            order by na.assigned_at desc
            limit 1
          ) active_assignment on true
          where ae.id = $1
            and ae.event_type <> 'activity'
          limit 1
        `,
        [abuseEventId]
      );

      return result.rowCount
        ? mapAbuseQueueItem(result.rows[0] as Record<string, unknown>)
        : null;
    });
  }

  async listAbuseQueue(input: {
    limit: number;
    status: "all" | "open";
  }): Promise<AdminAbuseQueueItem[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select
            ae.id,
            ae.user_id,
            ae.event_type,
            ae.details,
            ae.created_at,
            u.email as user_email,
            u.status as user_status,
            u.trust_score as user_trust_score,
            active_assignment.phone_number as active_number,
            aer.action as review_action,
            aer.reviewed_at,
            aer.admin_user_id as reviewed_by_admin_id
          from abuse_events ae
          join users u on u.id = ae.user_id
          left join abuse_event_reviews aer on aer.abuse_event_id = ae.id
          left join lateral (
            select pn.phone_number
            from number_assignments na
            join phone_numbers pn on pn.id = na.phone_number_id
            where na.user_id = u.id
              and na.released_at is null
            order by na.assigned_at desc
            limit 1
          ) active_assignment on true
          where ae.event_type <> 'activity'
            and ($1 = 'all' or aer.id is null)
          order by ae.created_at desc
          limit $2
        `,
        [input.status, input.limit]
      );

      return result.rows.map((row) => mapAbuseQueueItem(row as Record<string, unknown>));
    });
  }

  async reviewAbuseEvent(input: {
    abuseEventId: string;
    action: "dismissed" | "confirmed";
    adminUserId: string;
  }): Promise<AdminAbuseQueueItem | null> {
    return withClient(async (client) => {
      await client.query(
        `
          insert into abuse_event_reviews (
            id,
            abuse_event_id,
            admin_user_id,
            action
          )
          values ($1, $2, $3, $4)
          on conflict (abuse_event_id)
          do update set admin_user_id = excluded.admin_user_id,
                        action = excluded.action,
                        reviewed_at = now()
        `,
        [createId(), input.abuseEventId, input.adminUserId, input.action]
      );

      return this.findAbuseQueueItem(input.abuseEventId);
    });
  }

  async listNumberInventory(input: {
    status?: "assigned" | "available" | "quarantined" | null;
  }): Promise<AdminNumberInventoryItem[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select
            pn.phone_number,
            pn.id as phone_number_id,
            pn.status,
            pn.area_code,
            pn.locality,
            pn.region,
            pn.provider,
            latest_assignment.user_id,
            u.email as user_email,
            latest_assignment.assigned_at,
            latest_assignment.released_at,
            latest_assignment.release_reason,
            latest_quarantine.available_at as quarantine_available_at,
            latest_quarantine.reason as quarantine_reason,
            latest_quarantine.reclaimed_at as quarantined_at,
            latest_quarantine.status as quarantine_status,
            warning_summary.warning_types
          from phone_numbers pn
          left join lateral (
            select
              na.id as assignment_id,
              na.user_id,
              na.assigned_at,
              na.released_at,
              na.release_reason
            from number_assignments na
            where na.phone_number_id = pn.id
            order by coalesce(na.released_at, na.assigned_at) desc, na.assigned_at desc
            limit 1
          ) latest_assignment on true
          left join users u on u.id = latest_assignment.user_id
          left join lateral (
            select
              nq.available_at,
              nq.reason,
              nq.reclaimed_at,
              nq.status
            from number_quarantine nq
            where nq.phone_number_id = pn.id
            order by nq.reclaimed_at desc
            limit 1
          ) latest_quarantine on true
          left join lateral (
            select array_remove(array_agg(distinct nw.warning_type), null) as warning_types
            from number_warnings nw
            where nw.assignment_id = latest_assignment.assignment_id
          ) warning_summary on true
          where ($1::text is null or pn.status = $1)
          order by
            case pn.status
              when 'assigned' then 0
              when 'quarantined' then 1
              else 2
            end,
            coalesce(latest_assignment.assigned_at, latest_quarantine.reclaimed_at, pn.updated_at) desc
        `,
        [input.status ?? null]
      );

      return result.rows.map((row) =>
        mapNumberInventoryItem(row as Record<string, unknown>)
      );
    });
  }

  async getCostDashboardSeed(): Promise<AdminCostDashboardSeed> {
    return withClient(async (client) => {
      const summary = await client.query<{
        active_numbers: string;
        active_users: string;
        call_minutes_this_month: string;
        text_events_this_month: string;
      }>(
        `
          select
            (select count(*) from number_assignments where released_at is null) as active_numbers,
            (select count(distinct user_id) from number_assignments where released_at is null) as active_users,
            (
              select ceil(coalesce(sum(duration_seconds), 0)::numeric / 60)::int
              from calls
              where coalesce(ended_at, started_at, created_at) >= date_trunc('month', now())
            ) as call_minutes_this_month,
            (
              select count(*)::int
              from messages
              where created_at >= date_trunc('month', now())
            ) as text_events_this_month
        `
      );

      const trend = await client.query<{
        active_numbers: string;
        call_minutes: string;
        day: string;
        text_events: string;
      }>(
        `
          with days as (
            select generate_series(
              (current_date - interval '29 day')::date,
              current_date::date,
              interval '1 day'
            )::date as day
          ),
          text_usage as (
            select
              date_trunc('day', created_at)::date as day,
              count(*)::int as text_events
            from messages
            where created_at >= current_date - interval '29 day'
            group by 1
          ),
          call_usage as (
            select
              date_trunc('day', coalesce(ended_at, started_at, created_at))::date as day,
              ceil(coalesce(sum(duration_seconds), 0)::numeric / 60)::int as call_minutes
            from calls
            where coalesce(ended_at, started_at, created_at) >= current_date - interval '29 day'
            group by 1
          ),
          active_numbers as (
            select
              d.day,
              count(*)::int as active_numbers
            from days d
            left join number_assignments na
              on na.assigned_at < (d.day + interval '1 day')
             and coalesce(na.released_at, 'infinity'::timestamptz) >= d.day
            group by d.day
          )
          select
            d.day::text as day,
            coalesce(text_usage.text_events, 0) as text_events,
            coalesce(call_usage.call_minutes, 0) as call_minutes,
            coalesce(active_numbers.active_numbers, 0) as active_numbers
          from days d
          left join text_usage on text_usage.day = d.day
          left join call_usage on call_usage.day = d.day
          left join active_numbers on active_numbers.day = d.day
          order by d.day asc
        `
      );

      return {
        activeNumbers: Number(summary.rows[0]?.active_numbers ?? 0),
        activeUsers: Number(summary.rows[0]?.active_users ?? 0),
        callMinutesThisMonth: Number(summary.rows[0]?.call_minutes_this_month ?? 0),
        textEventsThisMonth: Number(summary.rows[0]?.text_events_this_month ?? 0),
        trend: trend.rows.map(
          (row): AdminCostTrendSeedPoint => ({
            activeNumbers: Number(row.active_numbers ?? 0),
            callMinutes: Number(row.call_minutes ?? 0),
            date: String(row.day),
            textEvents: Number(row.text_events ?? 0)
          })
        )
      };
    });
  }
}
