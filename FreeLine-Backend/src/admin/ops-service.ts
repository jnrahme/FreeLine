import { AppError } from "../auth/errors.js";
import type { AuthStore, UserRecord } from "../auth/types.js";
import { env } from "../config/env.js";
import type { NumberLifecycleService } from "../numbers/lifecycle-service.js";
import type { NumberStore } from "../numbers/types.js";
import type { AbuseService } from "../abuse/service.js";
import type { AbuseStore } from "../abuse/types.js";
import type {
  AdminCostDashboard,
  AdminManagedUserDetail,
  AdminOpsStore,
  AdminSystemStatus
} from "./ops-types.js";

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export class AdminOpsService {
  constructor(
    private readonly store: AdminOpsStore,
    private readonly authStore: AuthStore,
    private readonly abuseStore: AbuseStore,
    private readonly abuseService: AbuseService,
    private readonly numberStore: NumberStore,
    private readonly numberLifecycleService: NumberLifecycleService
  ) {}

  async searchUsers(query: string) {
    return {
      users: await this.store.searchUsers({
        limit: 25,
        query
      })
    };
  }

  async getUserDetail(userId: string): Promise<{ user: AdminManagedUserDetail }> {
    const seed = await this.store.findUserDetail(userId);
    if (!seed) {
      throw new AppError(404, "user_not_found", "User not found.");
    }

    const usage = await this.abuseService.getRewardsStatus(userId);
    return {
      user: {
        ...seed,
        usage: {
          callAllowance: usage.calls,
          messageAllowance: usage.messages
        }
      }
    };
  }

  async suspendUser(input: {
    adminUserId: string;
    reason?: string | null;
    userId: string;
  }): Promise<{ user: UserRecord }> {
    const user = await this.authStore.findUserById(input.userId);
    if (!user) {
      throw new AppError(404, "user_not_found", "User not found.");
    }

    const updatedUser = await this.authStore.updateUserModeration({
      status: "suspended",
      trustScore: user.trustScore,
      userId: input.userId
    });

    if (!updatedUser) {
      throw new AppError(404, "user_not_found", "User not found.");
    }

    await Promise.all([
      this.authStore.revokeRefreshTokensForUser(input.userId),
      this.abuseStore.markFingerprintsBlockedForUser({
        reason: input.reason?.trim() || "admin_suspended",
        userId: input.userId
      }),
      this.abuseStore.setAdminOverrideForUserDevices({
        cleared: true,
        userId: input.userId
      }),
      this.abuseStore.createAbuseEvent({
        details: {
          adminUserId: input.adminUserId,
          reason: input.reason?.trim() || "admin_suspended",
          source: "admin"
        },
        eventType: "suspension",
        userId: input.userId
      })
    ]);

    return { user: updatedUser };
  }

  async unsuspendUser(input: {
    adminUserId: string;
    userId: string;
  }): Promise<{ user: UserRecord }> {
    const user = await this.authStore.findUserById(input.userId);
    if (!user) {
      throw new AppError(404, "user_not_found", "User not found.");
    }

    const updatedUser = await this.authStore.updateUserModeration({
      status: "active",
      trustScore: Math.max(user.trustScore, 25),
      userId: input.userId
    });

    if (!updatedUser) {
      throw new AppError(404, "user_not_found", "User not found.");
    }

    await this.abuseStore.setAdminOverrideForUserDevices({
      adminOverrideAt: new Date().toISOString(),
      userId: input.userId
    });

    return { user: updatedUser };
  }

  async forceReleaseNumber(input: { userId: string }) {
    const quarantineUntil = new Date(
      Date.now() + env.NUMBER_QUARANTINE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const releasedNumber = await this.numberStore.releaseCurrentNumber({
      quarantineUntil,
      releaseReason: "user_release",
      userId: input.userId
    });

    if (!releasedNumber) {
      throw new AppError(404, "active_number_not_found", "Active number not found.");
    }

    return {
      number: releasedNumber
    };
  }

  async listAbuseQueue(input: {
    limit?: number;
    status?: "all" | "open";
  }) {
    return {
      items: await this.store.listAbuseQueue({
        limit: input.limit ?? 50,
        status: input.status ?? "open"
      })
    };
  }

  async dismissAbuseEvent(input: {
    abuseEventId: string;
    adminUserId: string;
  }) {
    const item = await this.store.reviewAbuseEvent({
      abuseEventId: input.abuseEventId,
      action: "dismissed",
      adminUserId: input.adminUserId
    });

    if (!item) {
      throw new AppError(404, "abuse_event_not_found", "Abuse event not found.");
    }

    return { item };
  }

  async confirmAbuseEvent(input: {
    abuseEventId: string;
    adminUserId: string;
  }) {
    const existingItem = await this.store.findAbuseQueueItem(input.abuseEventId);
    if (!existingItem) {
      throw new AppError(404, "abuse_event_not_found", "Abuse event not found.");
    }

    await this.suspendUser({
      adminUserId: input.adminUserId,
      reason: `confirmed_${existingItem.eventType}`,
      userId: existingItem.userId
    });

    const item = await this.store.reviewAbuseEvent({
      abuseEventId: input.abuseEventId,
      action: "confirmed",
      adminUserId: input.adminUserId
    });

    if (!item) {
      throw new AppError(404, "abuse_event_not_found", "Abuse event not found.");
    }

    return { item };
  }

  async listNumbers(input: {
    status?: "assigned" | "available" | "quarantined";
  }) {
    return {
      numbers: await this.store.listNumberInventory({
        status: input.status ?? null
      })
    };
  }

  async restoreNumber(input: {
    phoneNumber: string;
    userId: string;
  }) {
    return {
      number: await this.numberLifecycleService.restoreQuarantinedNumber({
        phoneNumber: input.phoneNumber,
        userId: input.userId
      })
    };
  }

  async getCostDashboard(): Promise<{ cost: AdminCostDashboard }> {
    const seed = await this.store.getCostDashboardSeed();
    const numberCostUsd = roundCurrency(
      seed.activeNumbers * env.ESTIMATED_NUMBER_MONTHLY_COST_USD
    );
    const smsCostUsd = roundCurrency(
      seed.textEventsThisMonth * env.ESTIMATED_TEXT_EVENT_COST_USD
    );
    const voiceCostUsd = roundCurrency(
      seed.callMinutesThisMonth * env.ESTIMATED_CALL_MINUTE_COST_USD
    );
    const totalEstimatedSpendUsd = roundCurrency(
      numberCostUsd + smsCostUsd + voiceCostUsd
    );
    const costPerActiveUserUsd = roundCurrency(
      seed.activeUsers > 0 ? totalEstimatedSpendUsd / seed.activeUsers : 0
    );

    return {
      cost: {
        activeNumbers: seed.activeNumbers,
        activeUsers: seed.activeUsers,
        alertThresholdUsd: env.COST_ALERT_THRESHOLD_USD,
        callMinutesThisMonth: seed.callMinutesThisMonth,
        costPerActiveUserUsd,
        isAlertTriggered: costPerActiveUserUsd > env.COST_ALERT_THRESHOLD_USD,
        numberCostUsd,
        smsCostUsd,
        textEventsThisMonth: seed.textEventsThisMonth,
        totalEstimatedSpendUsd,
        trend: seed.trend.map((point) => ({
          ...point,
          estimatedSpendUsd: roundCurrency(
            point.activeNumbers * (env.ESTIMATED_NUMBER_MONTHLY_COST_USD / 30) +
              point.textEvents * env.ESTIMATED_TEXT_EVENT_COST_USD +
              point.callMinutes * env.ESTIMATED_CALL_MINUTE_COST_USD
          )
        })),
        voiceCostUsd
      }
    };
  }

  getSystemStatus(): { status: AdminSystemStatus } {
    const webhookSignatureVerificationEnabled =
      env.TELEPHONY_PROVIDER === "bandwidth"
        ? Boolean(env.BANDWIDTH_WEBHOOK_SECRET)
        : env.TELEPHONY_PROVIDER === "twilio"
          ? Boolean(env.TWILIO_WEBHOOK_SECRET || env.TWILIO_AUTH_TOKEN)
          : false;

    return {
      status: {
        a2p10dlcRegistered: env.A2P_10DLC_REGISTERED,
        betaMode: env.BETA_MODE,
        stopHelpAutoreplyEnabled: true,
        telephonyProvider: env.TELEPHONY_PROVIDER,
        webhookSignatureVerificationEnabled
      }
    };
  }
}
