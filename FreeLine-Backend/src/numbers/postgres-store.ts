import type { PoolClient } from "pg";

import { AppError } from "../auth/errors.js";
import { createId } from "../auth/crypto.js";
import { env } from "../config/env.js";
import { getPostgresPool } from "../services/postgres.js";
import type {
  AssignedNumberRecord,
  AssignNumberInput,
  NumberQuarantineRecord,
  NumberStore,
  NumberWarningRecord,
  ReleaseNumberInput
} from "./types.js";

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

function mapAssignedNumber(row: Record<string, unknown>): AssignedNumberRecord {
  return {
    activationDeadline: toIsoString(row.activation_deadline) ?? "",
    assignedAt: toIsoString(row.assigned_at) ?? "",
    assignmentId: String(row.assignment_id),
    areaCode: String(row.area_code),
    externalId: String(row.external_id),
    lastActivityAt: toIsoString(row.last_activity_at),
    locality: String(row.locality),
    nationalFormat: String(row.national_format),
    phoneNumber: String(row.phone_number),
    phoneNumberId: String(row.phone_number_id),
    provider: row.provider as AssignedNumberRecord["provider"],
    quarantineUntil: toIsoString(row.quarantine_until),
    region: String(row.region),
    releaseReason: (row.release_reason as AssignedNumberRecord["releaseReason"]) ?? null,
    releasedAt: toIsoString(row.released_at),
    status: row.status as AssignedNumberRecord["status"],
    userId: String(row.user_id)
  };
}

function mapWarning(row: Record<string, unknown>): NumberWarningRecord {
  return {
    activityAnchorAt: toIsoString(row.activity_anchor_at) ?? "",
    assignmentId: String(row.assignment_id),
    id: String(row.id),
    warnedAt: toIsoString(row.warned_at) ?? "",
    warningType: row.warning_type as NumberWarningRecord["warningType"]
  };
}

function mapQuarantine(row: Record<string, unknown>): NumberQuarantineRecord {
  return {
    assignmentId: String(row.assignment_id),
    availableAt: toIsoString(row.available_at) ?? "",
    id: String(row.id),
    phoneNumber: String(row.phone_number),
    phoneNumberId: String(row.phone_number_id),
    reason: row.reason as NumberQuarantineRecord["reason"],
    reclaimedAt: toIsoString(row.reclaimed_at) ?? "",
    releasedToInventoryAt: toIsoString(row.released_to_inventory_at),
    restoredAt: toIsoString(row.restored_at),
    restoredToUserId: (row.restored_to_user_id as string | null) ?? null,
    status: row.status as NumberQuarantineRecord["status"]
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

async function findAssignment(
  client: PoolClient,
  clause: string,
  values: unknown[]
): Promise<AssignedNumberRecord | null> {
  const result = await client.query(
    `
      select
        na.id as assignment_id,
        na.user_id,
        na.assigned_at,
        na.released_at,
        na.release_reason,
        na.activation_deadline,
        na.last_activity_at,
        pn.id as phone_number_id,
        pn.phone_number,
        pn.external_id,
        pn.provider,
        pn.area_code,
        pn.locality,
        pn.region,
        pn.national_format,
        pn.status,
        pn.quarantine_until
      from number_assignments na
      join phone_numbers pn on pn.id = na.phone_number_id
      where ${clause}
      order by na.assigned_at desc
      limit 1
    `,
    values
  );

  return result.rowCount ? mapAssignedNumber(result.rows[0] as Record<string, unknown>) : null;
}

async function findQuarantine(
  client: PoolClient,
  clause: string,
  values: unknown[]
): Promise<NumberQuarantineRecord | null> {
  const result = await client.query(
    `
      select
        nq.id,
        nq.assignment_id,
        nq.phone_number_id,
        nq.phone_number,
        nq.reason,
        nq.reclaimed_at,
        nq.available_at,
        nq.status,
        nq.restored_at,
        nq.restored_to_user_id,
        nq.released_to_inventory_at
      from number_quarantine nq
      where ${clause}
      order by nq.reclaimed_at desc
      limit 1
    `,
    values
  );

  return result.rowCount ? mapQuarantine(result.rows[0] as Record<string, unknown>) : null;
}

export class PostgresNumberStore implements NumberStore {
  private readonly activationWindowMs =
    env.NUMBER_ACTIVATION_WINDOW_HOURS * 60 * 60_000;

  async assignNumber(input: AssignNumberInput): Promise<AssignedNumberRecord> {
    return withClient(async (client) => {
      try {
        await client.query("begin");

        const existingUserAssignment = await findAssignment(
          client,
          "na.user_id = $1 and na.released_at is null",
          [input.userId]
        );

        if (existingUserAssignment) {
          throw new AppError(
            409,
            "number_already_assigned",
            "This user already has an active number."
          );
        }

        const existingPhoneResult = await client.query(
          `
            select id, status
            from phone_numbers
            where phone_number = $1
            for update
          `,
          [input.phoneNumber]
        );

        let phoneNumberId = createId();

        if (!existingPhoneResult.rowCount) {
          await client.query(
            `
              insert into phone_numbers (
                id,
                phone_number,
                external_id,
                provider,
                area_code,
                locality,
                region,
                national_format,
                status
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, 'assigned')
            `,
            [
              phoneNumberId,
              input.phoneNumber,
              input.provisionedNumber.externalId,
              input.provisionedNumber.provider,
              input.areaCode,
              input.locality,
              input.region,
              input.nationalFormat
            ]
          );
        } else {
          phoneNumberId = String(existingPhoneResult.rows[0]?.id);
          const status = String(existingPhoneResult.rows[0]?.status);

          if (status === "assigned" || status === "quarantined") {
            throw new AppError(
              409,
              "number_not_available",
              "That number is no longer available."
            );
          }

          await client.query(
            `
              update phone_numbers
              set external_id = $2,
                  provider = $3,
                  area_code = $4,
                  locality = $5,
                  region = $6,
                  national_format = $7,
                  status = 'assigned',
                  quarantine_until = null,
                  updated_at = now()
              where id = $1
            `,
            [
              phoneNumberId,
              input.provisionedNumber.externalId,
              input.provisionedNumber.provider,
              input.areaCode,
              input.locality,
              input.region,
              input.nationalFormat
            ]
          );
        }

        const assignmentId = createId();
        const activationDeadline = new Date(
          Date.now() + this.activationWindowMs
        ).toISOString();

        await client.query(
          `
            insert into number_assignments (
              id,
              user_id,
              phone_number_id,
              activation_deadline
            )
            values ($1, $2, $3, $4)
          `,
          [assignmentId, input.userId, phoneNumberId, activationDeadline]
        );

        const assigned = await findAssignment(client, "na.id = $1", [assignmentId]);
        await client.query("commit");

        if (!assigned) {
          throw new AppError(
            500,
            "assignment_not_persisted",
            "Number assignment could not be loaded."
          );
        }

        return assigned;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);

        if ((error as { code?: string }).code === "23505") {
          throw new AppError(
            409,
            "number_not_available",
            "That number is no longer available."
          );
        }

        throw error;
      }
    });
  }

  async findCurrentNumberByUser(userId: string): Promise<AssignedNumberRecord | null> {
    return withClient(async (client) =>
      findAssignment(client, "na.user_id = $1 and na.released_at is null", [userId])
    );
  }

  async findCurrentNumberByPhoneNumber(
    phoneNumber: string
  ): Promise<AssignedNumberRecord | null> {
    return withClient(async (client) =>
      findAssignment(
        client,
        "pn.phone_number = $1 and na.released_at is null",
        [phoneNumber]
      )
    );
  }

  async findQuarantineByPhoneNumber(
    phoneNumber: string
  ): Promise<NumberQuarantineRecord | null> {
    return withClient(async (client) =>
      findQuarantine(client, "nq.phone_number = $1", [phoneNumber])
    );
  }

  async findUnavailablePhoneNumbers(phoneNumbers: string[]): Promise<string[]> {
    if (phoneNumbers.length === 0) {
      return [];
    }

    return withClient(async (client) => {
      const result = await client.query<{ phone_number: string }>(
        `
          select phone_number
          from phone_numbers
          where phone_number = any($1::text[])
            and status in ('assigned', 'quarantined')
        `,
        [phoneNumbers]
      );

      return result.rows.map((row) => row.phone_number);
    });
  }

  async listActiveAssignments(): Promise<AssignedNumberRecord[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select
            na.id as assignment_id,
            na.user_id,
            na.assigned_at,
            na.released_at,
            na.release_reason,
            na.activation_deadline,
            na.last_activity_at,
            pn.id as phone_number_id,
            pn.phone_number,
            pn.external_id,
            pn.provider,
            pn.area_code,
            pn.locality,
            pn.region,
            pn.national_format,
            pn.status,
            pn.quarantine_until
          from number_assignments na
          join phone_numbers pn on pn.id = na.phone_number_id
          where na.released_at is null
          order by na.assigned_at asc
        `
      );

      return result.rows.map((row) => mapAssignedNumber(row as Record<string, unknown>));
    });
  }

  async listQuarantinesReadyForAvailability(
    now: string
  ): Promise<NumberQuarantineRecord[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select
            nq.id,
            nq.assignment_id,
            nq.phone_number_id,
            nq.phone_number,
            nq.reason,
            nq.reclaimed_at,
            nq.available_at,
            nq.status,
            nq.restored_at,
            nq.restored_to_user_id,
            nq.released_to_inventory_at
          from number_quarantine nq
          where nq.status = 'quarantined'
            and nq.available_at <= $1
          order by nq.available_at asc
        `,
        [now]
      );

      return result.rows.map((row) => mapQuarantine(row as Record<string, unknown>));
    });
  }

  async listWarningsForAssignment(input: {
    activityAnchorAt: string;
    assignmentId: string;
  }): Promise<NumberWarningRecord[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select id, assignment_id, warning_type, activity_anchor_at, warned_at
          from number_warnings
          where assignment_id = $1
            and activity_anchor_at = $2
          order by warned_at asc
        `,
        [input.assignmentId, input.activityAnchorAt]
      );

      return result.rows.map((row) => mapWarning(row as Record<string, unknown>));
    });
  }

  async makeQuarantinedNumberAvailable(input: {
    phoneNumberId: string;
    releasedToInventoryAt: string;
  }): Promise<NumberQuarantineRecord | null> {
    return withClient(async (client) => {
      try {
        await client.query("begin");

        const quarantine = await findQuarantine(
          client,
          "nq.phone_number_id = $1 and nq.status = 'quarantined'",
          [input.phoneNumberId]
        );

        if (!quarantine) {
          await client.query("rollback");
          return null;
        }

        await client.query(
          `
            update number_quarantine
            set status = 'available',
                released_to_inventory_at = $2
            where id = $1
          `,
          [quarantine.id, input.releasedToInventoryAt]
        );

        await client.query(
          `
            update phone_numbers
            set status = 'available',
                quarantine_until = null,
                updated_at = now()
            where id = $1
          `,
          [input.phoneNumberId]
        );

        const nextQuarantine = await findQuarantine(client, "nq.id = $1", [quarantine.id]);
        await client.query("commit");
        return nextQuarantine;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  async recordActivity(input: { occurredAt?: string; userId: string }): Promise<void> {
    await withClient(async (client) => {
      await client.query(
        `
          update number_assignments
          set last_activity_at = greatest(
            coalesce(last_activity_at, '-infinity'::timestamptz),
            $2::timestamptz
          )
          where user_id = $1
            and released_at is null
        `,
        [input.userId, input.occurredAt ?? new Date().toISOString()]
      );
    });
  }

  async recordWarning(input: {
    activityAnchorAt: string;
    assignmentId: string;
    warnedAt: string;
    warningType: "day_10" | "day_13";
  }): Promise<NumberWarningRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into number_warnings (
            id,
            assignment_id,
            warning_type,
            activity_anchor_at,
            warned_at
          )
          values ($1, $2, $3, $4, $5)
          on conflict (assignment_id, warning_type, activity_anchor_at) do update
            set warned_at = excluded.warned_at
          returning id, assignment_id, warning_type, activity_anchor_at, warned_at
        `,
        [
          createId(),
          input.assignmentId,
          input.warningType,
          input.activityAnchorAt,
          input.warnedAt
        ]
      );

      return mapWarning(result.rows[0] as Record<string, unknown>);
    });
  }

  async releaseCurrentNumber(
    input: ReleaseNumberInput
  ): Promise<AssignedNumberRecord | null> {
    return withClient(async (client) =>
      this.moveAssignmentToQuarantine(client, {
        assignmentClause: "na.user_id = $1 and na.released_at is null",
        assignmentValues: [input.userId],
        quarantineUntil: input.quarantineUntil,
        releaseReason: input.releaseReason,
        releasedAt: new Date().toISOString()
      })
    );
  }

  async releaseInactiveNumber(input: {
    assignmentId: string;
    quarantineUntil: string;
    releaseReason: "inactivity";
    releasedAt: string;
  }): Promise<AssignedNumberRecord | null> {
    return withClient(async (client) =>
      this.moveAssignmentToQuarantine(client, {
        assignmentClause: "na.id = $1 and na.released_at is null",
        assignmentValues: [input.assignmentId],
        quarantineUntil: input.quarantineUntil,
        releaseReason: input.releaseReason,
        releasedAt: input.releasedAt
      })
    );
  }

  async releaseUnactivatedNumber(input: {
    assignmentId: string;
    releaseReason: "not_activated";
    releasedAt: string;
  }): Promise<AssignedNumberRecord | null> {
    return withClient(async (client) => {
      try {
        await client.query("begin");

        const current = await findAssignment(
          client,
          "na.id = $1 and na.released_at is null",
          [input.assignmentId]
        );

        if (!current) {
          await client.query("rollback");
          return null;
        }

        await client.query(
          `
            update number_assignments
            set released_at = $2,
                release_reason = $3
            where id = $1
          `,
          [current.assignmentId, input.releasedAt, input.releaseReason]
        );

        await client.query(
          `
            update phone_numbers
            set status = 'available',
                quarantine_until = null,
                updated_at = now()
            where id = $1
          `,
          [current.phoneNumberId]
        );

        const released = await findAssignment(client, "na.id = $1", [current.assignmentId]);
        await client.query("commit");
        return released;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  async restoreQuarantinedNumber(input: {
    phoneNumber: string;
    restoredAt: string;
    userId: string;
  }): Promise<AssignedNumberRecord | null> {
    return withClient(async (client) => {
      try {
        await client.query("begin");

        const existingUserNumber = await findAssignment(
          client,
          "na.user_id = $1 and na.released_at is null",
          [input.userId]
        );

        if (existingUserNumber) {
          throw new AppError(
            409,
            "number_already_assigned",
            "This user already has an active number."
          );
        }

        const quarantine = await findQuarantine(
          client,
          "nq.phone_number = $1 and nq.status = 'quarantined'",
          [input.phoneNumber]
        );

        if (!quarantine) {
          await client.query("rollback");
          return null;
        }

        await client.query(
          `
            update number_quarantine
            set status = 'restored',
                restored_at = $2,
                restored_to_user_id = $3
            where id = $1
          `,
          [quarantine.id, input.restoredAt, input.userId]
        );

        await client.query(
          `
            update phone_numbers
            set status = 'assigned',
                quarantine_until = null,
                updated_at = now()
            where id = $1
          `,
          [quarantine.phoneNumberId]
        );

        const assignmentId = createId();
        const activationDeadline = new Date(
          new Date(input.restoredAt).getTime() + this.activationWindowMs
        ).toISOString();

        await client.query(
          `
            insert into number_assignments (
              id,
              user_id,
              phone_number_id,
              activation_deadline,
              last_activity_at
            )
            values ($1, $2, $3, $4, $5)
          `,
          [
            assignmentId,
            input.userId,
            quarantine.phoneNumberId,
            activationDeadline,
            input.restoredAt
          ]
        );

        const restored = await findAssignment(client, "na.id = $1", [assignmentId]);
        await client.query("commit");
        return restored;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  private async moveAssignmentToQuarantine(
    client: PoolClient,
    input: {
      assignmentClause: string;
      assignmentValues: unknown[];
      quarantineUntil: string;
      releaseReason: "inactivity" | "user_release";
      releasedAt: string;
    }
  ): Promise<AssignedNumberRecord | null> {
    try {
      await client.query("begin");

      const current = await findAssignment(
        client,
        input.assignmentClause,
        input.assignmentValues
      );

      if (!current) {
        await client.query("rollback");
        return null;
      }

      await client.query(
        `
          update number_assignments
          set released_at = $2,
              release_reason = $3
          where id = $1
        `,
        [current.assignmentId, input.releasedAt, input.releaseReason]
      );

      await client.query(
        `
          update phone_numbers
          set status = 'quarantined',
              quarantine_until = $2,
              updated_at = now()
          where id = $1
        `,
        [current.phoneNumberId, input.quarantineUntil]
      );

      await client.query(
        `
          insert into number_quarantine (
            id,
            assignment_id,
            phone_number_id,
            phone_number,
            reason,
            reclaimed_at,
            available_at,
            status
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'quarantined')
        `,
        [
          createId(),
          current.assignmentId,
          current.phoneNumberId,
          current.phoneNumber,
          input.releaseReason,
          input.releasedAt,
          input.quarantineUntil
        ]
      );

      const released = await findAssignment(client, "na.id = $1", [current.assignmentId]);
      await client.query("commit");
      return released;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  }
}
