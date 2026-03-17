import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import type { PushNotifier } from "../notifications/types.js";
import type { SubscriptionAccess } from "../subscriptions/types.js";
import type { TelephonyProvider } from "../telephony/telephony-provider.js";
import type {
  AssignedNumberRecord,
  NumberQuarantineRecord,
  NumberStore,
  NumberWarningRecord,
  NumberWarningType
} from "./types.js";

const DAY_MS = 24 * 60 * 60_000;

export interface NumberLifecycleServiceOptions {
  inactivityReclaimDays?: number;
  quarantineDays?: number;
  subscriptionAccess?: SubscriptionAccess;
  warningDay10?: number;
  warningDay13?: number;
}

export class NumberLifecycleService {
  private readonly inactivityReclaimDays: number;
  private readonly quarantineDays: number;
  private readonly subscriptionAccess?: SubscriptionAccess;
  private readonly warningDay10: number;
  private readonly warningDay13: number;

  constructor(
    private readonly store: NumberStore,
    private readonly telephonyProvider: TelephonyProvider,
    private readonly pushNotifier: PushNotifier,
    options: NumberLifecycleServiceOptions = {}
  ) {
    this.inactivityReclaimDays =
      options.inactivityReclaimDays ?? env.NUMBER_INACTIVITY_RECLAIM_DAYS;
    this.quarantineDays = options.quarantineDays ?? env.NUMBER_QUARANTINE_DAYS;
    this.subscriptionAccess = options.subscriptionAccess;
    this.warningDay10 = options.warningDay10 ?? env.NUMBER_INACTIVITY_WARNING_DAY_10;
    this.warningDay13 = options.warningDay13 ?? env.NUMBER_INACTIVITY_WARNING_DAY_13;
  }

  async recordActivity(input: { occurredAt?: string; userId: string }): Promise<void> {
    await this.store.recordActivity(input);
  }

  async restoreQuarantinedNumber(input: {
    now?: string;
    phoneNumber: string;
    userId: string;
  }): Promise<AssignedNumberRecord> {
    const restored = await this.store.restoreQuarantinedNumber({
      phoneNumber: input.phoneNumber,
      restoredAt: input.now ?? new Date().toISOString(),
      userId: input.userId
    });

    if (!restored) {
      throw new AppError(
        404,
        "quarantined_number_not_found",
        "No quarantined number was found for restore."
      );
    }

    await this.pushNotifier.sendNumberLifecycle({
      message: `Your FreeLine number ${restored.phoneNumber} has been restored.`,
      phoneNumber: restored.phoneNumber,
      type: "number:restored",
      userId: restored.userId
    });

    return restored;
  }

  async runActivationExpirySweep(input: {
    now?: string;
  } = {}): Promise<{
    released: AssignedNumberRecord[];
  }> {
    const now = input.now ?? new Date().toISOString();
    const assignments = await this.store.listActiveAssignments();
    const expiredUnactivated = assignments.filter(
      (assignment) =>
        assignment.lastActivityAt === null && assignment.activationDeadline <= now
    );
    const released: AssignedNumberRecord[] = [];

    for (const assignment of expiredUnactivated) {
      const next = await this.store.releaseUnactivatedNumber({
        assignmentId: assignment.assignmentId,
        releaseReason: "not_activated",
        releasedAt: now
      });

      if (!next) {
        continue;
      }

      await this.telephonyProvider.releaseNumber(next.phoneNumber);
      await this.pushNotifier.sendNumberLifecycle({
        message:
          "Your number was released because it was not used within 24 hours. Claim a new one anytime.",
        phoneNumber: next.phoneNumber,
        type: "number:activation_released",
        userId: next.userId
      });
      released.push(next);
    }

    return { released };
  }

  async runInactivitySweep(input: {
    now?: string;
  } = {}): Promise<{
    reclaimed: AssignedNumberRecord[];
    warnings: NumberWarningRecord[];
  }> {
    const now = input.now ?? new Date().toISOString();
    const assignments = await this.store.listActiveAssignments();
    const warnings: NumberWarningRecord[] = [];
    const reclaimed: AssignedNumberRecord[] = [];

    for (const assignment of assignments) {
      const entitlementState = this.subscriptionAccess
        ? await this.subscriptionAccess.getEntitlementState(assignment.userId, now)
        : null;
      const activityAnchorAt = assignment.lastActivityAt ?? assignment.assignedAt;
      const daysInactive = this.calculateDaysInactive(activityAnchorAt, now);

      if (assignment.lastActivityAt === null && assignment.activationDeadline > now) {
        continue;
      }

      if (entitlementState?.numberLock) {
        continue;
      }

      if (daysInactive >= this.inactivityReclaimDays) {
        const quarantineUntil = new Date(
          new Date(now).getTime() + this.quarantineDays * DAY_MS
        ).toISOString();
        const next = await this.store.releaseInactiveNumber({
          assignmentId: assignment.assignmentId,
          quarantineUntil,
          releaseReason: "inactivity",
          releasedAt: now
        });

        if (!next) {
          continue;
        }

        await this.pushNotifier.sendNumberLifecycle({
          message: `Your number ${next.phoneNumber} has been recycled due to inactivity.`,
          phoneNumber: next.phoneNumber,
          type: "number:reclaimed",
          userId: next.userId
        });
        reclaimed.push(next);
        continue;
      }

      const existingWarnings = await this.store.listWarningsForAssignment({
        activityAnchorAt,
        assignmentId: assignment.assignmentId
      });

      if (
        daysInactive >= this.warningDay13 &&
        !this.hasWarning(existingWarnings, "day_13")
      ) {
        const warning = await this.store.recordWarning({
          activityAnchorAt,
          assignmentId: assignment.assignmentId,
          warnedAt: now,
          warningType: "day_13"
        });
        await this.pushNotifier.sendNumberLifecycle({
          message:
            "Your number will be recycled tomorrow. Use it now to keep it.",
          phoneNumber: assignment.phoneNumber,
          type: "number:warning_day_13",
          userId: assignment.userId
        });
        warnings.push(warning);
        continue;
      }

      if (
        daysInactive >= this.warningDay10 &&
        !this.hasWarning(existingWarnings, "day_10")
      ) {
        const warning = await this.store.recordWarning({
          activityAnchorAt,
          assignmentId: assignment.assignmentId,
          warnedAt: now,
          warningType: "day_10"
        });
        await this.pushNotifier.sendNumberLifecycle({
          message:
            "Your number will be recycled in 4 days. Send a text or make a call to keep it.",
          phoneNumber: assignment.phoneNumber,
          type: "number:warning_day_10",
          userId: assignment.userId
        });
        warnings.push(warning);
      }
    }

    return {
      reclaimed,
      warnings
    };
  }

  async runQuarantineAvailabilitySweep(input: {
    now?: string;
  } = {}): Promise<{
    available: NumberQuarantineRecord[];
  }> {
    const now = input.now ?? new Date().toISOString();
    const ready = await this.store.listQuarantinesReadyForAvailability(now);
    const available: NumberQuarantineRecord[] = [];

    for (const quarantine of ready) {
      const next = await this.store.makeQuarantinedNumberAvailable({
        phoneNumberId: quarantine.phoneNumberId,
        releasedToInventoryAt: now
      });

      if (next) {
        available.push(next);
      }
    }

    return { available };
  }

  private calculateDaysInactive(activityAnchorAt: string, now: string): number {
    const elapsedMs = new Date(now).getTime() - new Date(activityAnchorAt).getTime();
    return Math.max(Math.floor(elapsedMs / DAY_MS), 0);
  }

  private hasWarning(
    warnings: NumberWarningRecord[],
    warningType: NumberWarningType
  ): boolean {
    return warnings.some((warning) => warning.warningType === warningType);
  }
}
