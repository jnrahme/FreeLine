import { AppError } from "../auth/errors.js";
import type { AuthStore, DevicePlatform, UserRecord } from "../auth/types.js";
import type { CallStore, CallUsageRecord } from "../calls/types.js";
import { env } from "../config/env.js";
import type { MessageStore, UsageCountRecord } from "../messages/types.js";
import type { SubscriptionAccess } from "../subscriptions/types.js";
import type {
  AbuseStore,
  AbuseTier,
  AbuseUserState,
  CallAllowanceSnapshot,
  MessageAllowanceSnapshot,
  RateLimitDecision,
  RateLimiter,
  RewardClaimSummary,
  RewardType,
  TrustMetrics
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;
const SEVEN_DAYS_MS = 7 * DAY_MS;
const FIRST_WEEK_DAYS = 7;
const URL_REGEX = /\b(?:https?:\/\/|www\.)\S+/i;
const SPAM_PATTERNS = [
  /\bgift\s*card\b/i,
  /\btelegram\b/i,
  /\bbitcoin\b/i,
  /\bcrypto\b/i,
  /\bclick\s+here\b/i,
  /\bact\s+now\b/i,
  /\bloan\s+approval\b/i,
  /\burgent\s+response\b/i
];
const DEFAULT_UPGRADE_PROMPT =
  "Watch a rewarded ad or upgrade to Ad-Free or Premium for more usage.";

export interface AbuseServiceDependencies {
  authStore: AuthStore;
  callStore: CallStore;
  clock?: () => Date;
  messageStore: MessageStore;
  policy?: Partial<AbusePolicy>;
  rateLimiter: RateLimiter;
  store: AbuseStore;
  subscriptionAccess?: SubscriptionAccess;
}

interface AbusePolicy {
  elevatedTierDailyCallMinutesCap: number;
  elevatedTierDailySmsCap: number;
  elevatedTierDailyUniqueContactsCap: number;
  elevatedTierMonthlyCallMinutesCap: number;
  elevatedTierMonthlySmsCap: number;
  freeTierDailyCallMinutesCap: number;
  freeTierDailySmsCap: number;
  freeTierDailyUniqueContactsCap: number;
  freeTierMonthlyCallMinutesCap: number;
  freeTierMonthlySmsCap: number;
  globalSmsPerSecondCap: number;
  maxRewardedClaimsPerMonth: number;
  rewardedCallMinutesBonus: number;
  rewardedTextEventsBonus: number;
  standardTierDailyCallMinutesCap: number;
  standardTierDailySmsCap: number;
  standardTierDailyUniqueContactsCap: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(startOfUtcDay(date).getTime() + DAY_MS);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function secondsUntil(target: Date, now: Date): number {
  return Math.max(Math.ceil((target.getTime() - now.getTime()) / 1000), 1);
}

function tierFromScore(input: {
  isFirstWeek: boolean;
  status: UserRecord["status"];
  trustScore: number;
}): AbuseTier {
  if (input.status === "suspended" || input.trustScore < 20) {
    return "suspended";
  }

  if (input.isFirstWeek || input.trustScore < 40) {
    return "starter";
  }

  if (input.trustScore < 70) {
    return "standard";
  }

  return "elevated";
}

function buildRateLimitDecision(input: {
  allowance: MessageAllowanceSnapshot | CallAllowanceSnapshot;
  bucket: string;
  message: string;
  resetAt: string;
  retryAfterSeconds: number;
}): RateLimitDecision {
  return {
    allowance: input.allowance,
    bucket: input.bucket,
    message: input.message,
    resetAt: input.resetAt,
    retryAfterSeconds: input.retryAfterSeconds,
    upgradePrompt: DEFAULT_UPGRADE_PROMPT
  };
}

export class AbuseService {
  private readonly now: () => Date;
  private readonly policy: AbusePolicy;

  constructor(private readonly deps: AbuseServiceDependencies) {
    this.now = deps.clock ?? (() => new Date());
    this.policy = {
      elevatedTierDailyCallMinutesCap:
        deps.policy?.elevatedTierDailyCallMinutesCap ??
        env.ELEVATED_TIER_DAILY_CALL_MINUTES_CAP,
      elevatedTierDailySmsCap:
        deps.policy?.elevatedTierDailySmsCap ?? env.ELEVATED_TIER_DAILY_SMS_CAP,
      elevatedTierDailyUniqueContactsCap:
        deps.policy?.elevatedTierDailyUniqueContactsCap ??
        env.ELEVATED_TIER_DAILY_UNIQUE_CONTACTS_CAP,
      elevatedTierMonthlyCallMinutesCap:
        deps.policy?.elevatedTierMonthlyCallMinutesCap ??
        env.ELEVATED_TIER_MONTHLY_CALL_MINUTES_CAP,
      elevatedTierMonthlySmsCap:
        deps.policy?.elevatedTierMonthlySmsCap ?? env.ELEVATED_TIER_MONTHLY_SMS_CAP,
      freeTierDailyCallMinutesCap:
        deps.policy?.freeTierDailyCallMinutesCap ?? env.FREE_TIER_DAILY_CALL_MINUTES_CAP,
      freeTierDailySmsCap:
        deps.policy?.freeTierDailySmsCap ?? env.FREE_TIER_DAILY_SMS_CAP,
      freeTierDailyUniqueContactsCap:
        deps.policy?.freeTierDailyUniqueContactsCap ??
        env.FREE_TIER_DAILY_UNIQUE_CONTACTS_CAP,
      freeTierMonthlyCallMinutesCap:
        deps.policy?.freeTierMonthlyCallMinutesCap ??
        env.FREE_TIER_MONTHLY_CALL_MINUTES_CAP,
      freeTierMonthlySmsCap:
        deps.policy?.freeTierMonthlySmsCap ?? env.FREE_TIER_MONTHLY_SMS_CAP,
      globalSmsPerSecondCap:
        deps.policy?.globalSmsPerSecondCap ?? env.GLOBAL_SMS_PER_SECOND_CAP,
      maxRewardedClaimsPerMonth:
        deps.policy?.maxRewardedClaimsPerMonth ?? env.MAX_REWARDED_CLAIMS_PER_MONTH,
      rewardedCallMinutesBonus:
        deps.policy?.rewardedCallMinutesBonus ?? env.REWARDED_CALL_MINUTES_BONUS,
      rewardedTextEventsBonus:
        deps.policy?.rewardedTextEventsBonus ?? env.REWARDED_TEXT_EVENTS_BONUS,
      standardTierDailyCallMinutesCap:
        deps.policy?.standardTierDailyCallMinutesCap ??
        env.STANDARD_TIER_DAILY_CALL_MINUTES_CAP,
      standardTierDailySmsCap:
        deps.policy?.standardTierDailySmsCap ?? env.STANDARD_TIER_DAILY_SMS_CAP,
      standardTierDailyUniqueContactsCap:
        deps.policy?.standardTierDailyUniqueContactsCap ??
        env.STANDARD_TIER_DAILY_UNIQUE_CONTACTS_CAP
    };
  }

  async assertFingerprintAllowed(fingerprint: string): Promise<void> {
    if (await this.deps.store.hasBlockedFingerprint(fingerprint)) {
      throw new AppError(
        403,
        "device_abuse_blocked",
        "This device is blocked because a previous account was suspended for abuse."
      );
    }
  }

  async logDeviceAccount(input: {
    fingerprint: string;
    platform: DevicePlatform;
    userId: string;
  }) {
    return this.deps.store.logDeviceAccount(input);
  }

  async getRewardsStatus(userId: string): Promise<{
    calls: CallAllowanceSnapshot;
    messages: MessageAllowanceSnapshot;
    rewardClaims: RewardClaimSummary;
    tier: AbuseTier;
    trustScore: number;
  }> {
    const now = this.now();
    const [state, messageUsage, callUsage, uniqueContactsUsed, rewardClaims] =
      await Promise.all([
        this.syncUserState(userId),
        this.deps.messageStore.getOutboundUsage(userId),
        this.deps.callStore.getMonthlyUsage(userId),
        this.deps.messageStore.countDistinctOutboundParticipantsSince({
          since: startOfUtcDay(now).toISOString(),
          userId
        }),
        this.getRewardSummary(userId, now)
      ]);

    return {
      calls: this.buildCallAllowance(state, callUsage, rewardClaims),
      messages: this.buildMessageAllowance(
        state,
        messageUsage,
        uniqueContactsUsed,
        rewardClaims
      ),
      rewardClaims,
      tier: state.tier,
      trustScore: state.trustScore
    };
  }

  async claimReward(input: { rewardType: RewardType; userId: string }): Promise<{
    calls: CallAllowanceSnapshot;
    claimedReward: RewardClaimSummary;
    messages: MessageAllowanceSnapshot;
    rewardType: RewardType;
    tier: AbuseTier;
    trustScore: number;
  }> {
    const now = this.now();
    const state = await this.syncUserState(input.userId);

    if (state.tier === "suspended") {
      throw new AppError(
        403,
        "account_suspended",
        "This account is suspended pending abuse review."
      );
    }

    if (state.tier === "elevated") {
      throw new AppError(
        409,
        "reward_not_needed",
        "Elevated accounts already receive the maximum beta allowance."
      );
    }

    const currentSummary = await this.getRewardSummary(input.userId, now);
    if (currentSummary.remainingClaims <= 0) {
      throw new AppError(
        409,
        "reward_claim_limit_reached",
        "This account has already used all rewarded unlocks for the month."
      );
    }

    await this.deps.store.recordRewardClaim({
      monthKey: monthKey(now),
      rewardAmount:
        input.rewardType === "text_events"
          ? this.policy.rewardedTextEventsBonus
          : this.policy.rewardedCallMinutesBonus,
      rewardType: input.rewardType,
      userId: input.userId
    });

    const [messageUsage, callUsage, uniqueContactsUsed, rewardClaims] = await Promise.all([
      this.deps.messageStore.getOutboundUsage(input.userId),
      this.deps.callStore.getMonthlyUsage(input.userId),
      this.deps.messageStore.countDistinctOutboundParticipantsSince({
        since: startOfUtcDay(now).toISOString(),
        userId: input.userId
      }),
      this.getRewardSummary(input.userId, now)
    ]);

    return {
      calls: this.buildCallAllowance(state, callUsage, rewardClaims),
      claimedReward: rewardClaims,
      messages: this.buildMessageAllowance(
        state,
        messageUsage,
        uniqueContactsUsed,
        rewardClaims
      ),
      rewardType: input.rewardType,
      tier: state.tier,
      trustScore: state.trustScore
    };
  }

  async getMessageAllowance(userId: string): Promise<MessageAllowanceSnapshot> {
    const now = this.now();
    const [state, usage, uniqueContactsUsed, rewardClaims] = await Promise.all([
      this.syncUserState(userId),
      this.deps.messageStore.getOutboundUsage(userId),
      this.deps.messageStore.countDistinctOutboundParticipantsSince({
        since: startOfUtcDay(now).toISOString(),
        userId
      }),
      this.getRewardSummary(userId, now)
    ]);

    return this.buildMessageAllowance(state, usage, uniqueContactsUsed, rewardClaims);
  }

  async getCallAllowance(userId: string): Promise<CallAllowanceSnapshot> {
    const now = this.now();
    const [state, usage, rewardClaims] = await Promise.all([
      this.syncUserState(userId),
      this.deps.callStore.getMonthlyUsage(userId),
      this.getRewardSummary(userId, now)
    ]);

    return this.buildCallAllowance(state, usage, rewardClaims);
  }

  async assertCanSendMessage(input: {
    body: string;
    to: string;
    userId: string;
  }): Promise<MessageAllowanceSnapshot> {
    const now = this.now();
    const [state, usage, uniqueContactsUsed, rewardClaims] = await Promise.all([
      this.syncUserState(input.userId),
      this.deps.messageStore.getOutboundUsage(input.userId),
      this.deps.messageStore.countDistinctOutboundParticipantsSince({
        since: startOfUtcDay(now).toISOString(),
        userId: input.userId
      }),
      this.getRewardSummary(input.userId, now)
    ]);

    this.assertAccountActive(state);

    const allowance = this.buildMessageAllowance(state, usage, uniqueContactsUsed, rewardClaims);
    const endOfDay = endOfUtcDay(now);
    const endOfMonth = endOfUtcMonth(now);

    await this.assertGlobalSmsRate(now);

    if (usage.dailyUsed >= allowance.dailyCap) {
      throw await this.buildMessageLimitError({
        allowance,
        bucket: "sms_daily",
        resetAt: endOfDay.toISOString(),
        retryAfterSeconds: secondsUntil(endOfDay, now),
        userId: input.userId,
        usedCount: usage.dailyUsed
      });
    }

    if (usage.monthlyUsed >= allowance.monthlyCap) {
      throw await this.buildMessageLimitError({
        allowance,
        bucket: "sms_monthly",
        resetAt: endOfMonth.toISOString(),
        retryAfterSeconds: secondsUntil(endOfMonth, now),
        userId: input.userId,
        usedCount: usage.monthlyUsed
      });
    }

    const outboundMessagesToParticipant =
      await this.deps.messageStore.countOutboundMessagesToParticipant({
        participantNumber: input.to,
        userId: input.userId
      });

    if (
      outboundMessagesToParticipant === 0 &&
      uniqueContactsUsed >= allowance.uniqueContactsDailyCap
    ) {
      throw await this.buildMessageLimitError({
        allowance,
        bucket: "unique_contacts_daily",
        resetAt: endOfDay.toISOString(),
        retryAfterSeconds: secondsUntil(endOfDay, now),
        userId: input.userId,
        usedCount: uniqueContactsUsed
      });
    }

    const flags = await this.detectMessageFlags({
      body: input.body,
      isFirstMessageToRecipient: outboundMessagesToParticipant === 0,
      to: input.to,
      userId: input.userId
    });

    if (flags.length > 0) {
      await this.deps.store.createAbuseEvent({
        details: {
          flaggedNumber: input.to,
          flags,
          reviewDelaySeconds: 60
        },
        eventType: "spam_flag",
        userId: input.userId
      });

      const refreshedState = await this.syncUserState(input.userId);
      if (refreshedState.tier === "suspended") {
        throw new AppError(
          403,
          "account_suspended",
          "This account is suspended pending abuse review."
        );
      }

      throw new AppError(
        403,
        "message_flagged_for_review",
        "Message flagged for review.",
        {
          flags,
          reviewDelaySeconds: 60,
          upgradePrompt: DEFAULT_UPGRADE_PROMPT
        }
      );
    }

    await this.auditRateBucket({
      bucketKey: "sms_daily",
      bucketScope: "messages",
      limitCount: allowance.dailyCap,
      metadata: {
        dailyUsed: usage.dailyUsed,
        monthlyUsed: usage.monthlyUsed
      },
      outcome: "allowed",
      resetAt: endOfDay.toISOString(),
      usedCount: usage.dailyUsed + 1,
      userId: input.userId,
      windowKey: startOfUtcDay(now).toISOString()
    });

    await this.auditRateBucket({
      bucketKey: "sms_monthly",
      bucketScope: "messages",
      limitCount: allowance.monthlyCap,
      metadata: {
        dailyUsed: usage.dailyUsed,
        monthlyUsed: usage.monthlyUsed
      },
      outcome: "allowed",
      resetAt: endOfMonth.toISOString(),
      usedCount: usage.monthlyUsed + 1,
      userId: input.userId,
      windowKey: startOfUtcMonth(now).toISOString()
    });

    if (outboundMessagesToParticipant === 0) {
      await this.auditRateBucket({
        bucketKey: "unique_contacts_daily",
        bucketScope: "messages",
        limitCount: allowance.uniqueContactsDailyCap,
        metadata: {
          participantNumber: input.to
        },
        outcome: "allowed",
        resetAt: endOfDay.toISOString(),
        usedCount: uniqueContactsUsed + 1,
        userId: input.userId,
        windowKey: startOfUtcDay(now).toISOString()
      });
    }

    return allowance;
  }

  async assertCanIssueVoiceToken(input: { userId: string }): Promise<CallAllowanceSnapshot> {
    const now = this.now();
    const [state, usage, rewardClaims] = await Promise.all([
      this.syncUserState(input.userId),
      this.deps.callStore.getMonthlyUsage(input.userId),
      this.getRewardSummary(input.userId, now)
    ]);

    this.assertAccountActive(state);

    const allowance = this.buildCallAllowance(state, usage, rewardClaims);
    const endOfDay = endOfUtcDay(now);
    const endOfMonth = endOfUtcMonth(now);

    if (usage.dailyUsedMinutes >= allowance.dailyCapMinutes) {
      throw await this.buildCallLimitError({
        allowance,
        bucket: "call_minutes_daily",
        resetAt: endOfDay.toISOString(),
        retryAfterSeconds: secondsUntil(endOfDay, now),
        userId: input.userId,
        usedCount: usage.dailyUsedMinutes
      });
    }

    if (usage.monthlyUsedMinutes >= allowance.monthlyCapMinutes) {
      throw await this.buildCallLimitError({
        allowance,
        bucket: "call_minutes_monthly",
        resetAt: endOfMonth.toISOString(),
        retryAfterSeconds: secondsUntil(endOfMonth, now),
        userId: input.userId,
        usedCount: usage.monthlyUsedMinutes
      });
    }

    await this.auditRateBucket({
      bucketKey: "call_minutes_daily",
      bucketScope: "calls",
      limitCount: allowance.dailyCapMinutes,
      metadata: {
        dailyUsedMinutes: usage.dailyUsedMinutes,
        monthlyUsedMinutes: usage.monthlyUsedMinutes
      },
      outcome: "allowed",
      resetAt: endOfDay.toISOString(),
      usedCount: usage.dailyUsedMinutes,
      userId: input.userId,
      windowKey: startOfUtcDay(now).toISOString()
    });

    await this.auditRateBucket({
      bucketKey: "call_minutes_monthly",
      bucketScope: "calls",
      limitCount: allowance.monthlyCapMinutes,
      metadata: {
        dailyUsedMinutes: usage.dailyUsedMinutes,
        monthlyUsedMinutes: usage.monthlyUsedMinutes
      },
      outcome: "allowed",
      resetAt: endOfMonth.toISOString(),
      usedCount: usage.monthlyUsedMinutes,
      userId: input.userId,
      windowKey: startOfUtcMonth(now).toISOString()
    });

    return allowance;
  }

  async shouldRouteInboundCallToVoicemail(input: { userId: string }): Promise<boolean> {
    try {
      await this.assertCanIssueVoiceToken({
        userId: input.userId
      });
      return false;
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === "free_tier_call_limit_reached" ||
          error.code === "account_suspended")
      ) {
        return true;
      }

      throw error;
    }
  }

  async recordMessageActivity(input: {
    direction: "inbound" | "outbound";
    participantNumber: string;
    userId: string;
  }): Promise<void> {
    await this.deps.store.createAbuseEvent({
      details: {
        direction: input.direction,
        participantNumber: input.participantNumber
      },
      eventType: "activity",
      userId: input.userId
    });
    await this.syncUserState(input.userId);
  }

  async recordCallActivity(input: {
    direction: "inbound" | "outbound";
    durationSeconds: number;
    providerCallId: string;
    status: string;
    userId: string;
  }): Promise<void> {
    await this.deps.store.createAbuseEvent({
      details: {
        direction: input.direction,
        durationSeconds: input.durationSeconds,
        providerCallId: input.providerCallId,
        status: input.status
      },
      eventType: "activity",
      userId: input.userId
    });
    await this.syncUserState(input.userId);
  }

  async recordReportAgainstUser(input: {
    reason: string;
    reportedNumber: string;
    reporterUserId: string;
    targetUserId: string;
  }): Promise<void> {
    await this.deps.store.createAbuseEvent({
      details: {
        reason: input.reason,
        reportedNumber: input.reportedNumber,
        reporterUserId: input.reporterUserId
      },
      eventType: "report",
      userId: input.targetUserId
    });
    await this.syncUserState(input.targetUserId);
  }

  async recordBlockAgainstUser(input: {
    blockedNumber: string;
    blockerUserId: string;
    targetUserId: string;
  }): Promise<void> {
    await this.deps.store.createAbuseEvent({
      details: {
        blockedNumber: input.blockedNumber,
        blockerUserId: input.blockerUserId
      },
      eventType: "block",
      userId: input.targetUserId
    });
    await this.syncUserState(input.targetUserId);
  }

  async syncUserState(userId: string): Promise<AbuseUserState> {
    const user = await this.deps.authStore.findUserById(userId);
    if (!user) {
      throw new AppError(404, "user_not_found", "User not found.");
    }

    const subscriptionState = this.deps.subscriptionAccess
      ? await this.deps.subscriptionAccess.getEntitlementState(userId)
      : {
          adFree: false,
          activeProducts: [],
          adsEnabled: true,
          displayTier: "free" as const,
          numberLock: false,
          premiumCaps: false
        };

    if (user.status === "deleted") {
      return {
        isFirstWeek: false,
        numberLockEnabled: subscriptionState.numberLock,
        premiumCapsEnabled: subscriptionState.premiumCaps,
        status: "deleted",
        subscriptionTier: subscriptionState.displayTier,
        tier: "suspended",
        trustMetrics: {
          activeDaysLast30: 0,
          autoSuspendFlags24h: 0,
          blocksLast30: 0,
          negativeEventsLast7: 0,
          rateLimitHitsLast30: 0,
          reportsLast30: 0
        },
        trustScore: user.trustScore,
        user
      };
    }

    const metrics = await this.loadTrustMetrics(userId);
    const score = this.calculateTrustScore(metrics);
    const status: UserRecord["status"] =
      metrics.autoSuspendFlags24h >= 5 || score < 20 ? "suspended" : "active";
    const isFirstWeek =
      this.now().getTime() - new Date(user.createdAt).getTime() < FIRST_WEEK_DAYS * DAY_MS;
    const scoreTier = tierFromScore({
      isFirstWeek,
      status,
      trustScore: score
    });
    const tier =
      status === "active" && subscriptionState.premiumCaps ? "elevated" : scoreTier;

    const persistedUser =
      user.trustScore !== score || user.status !== status
        ? await this.deps.authStore.updateUserModeration({
            status,
            trustScore: score,
            userId
          })
        : user;

    if (status === "suspended" && user.status !== "suspended") {
      await this.deps.store.createAbuseEvent({
        details: {
          reason:
            metrics.autoSuspendFlags24h >= 5
              ? "spam_flags_24h"
              : "trust_score_below_threshold",
          trustScore: score
        },
        eventType: "suspension",
        userId
      });
      await this.deps.store.markFingerprintsBlockedForUser({
        reason: "suspended_for_abuse",
        userId
      });
      await this.deps.authStore.revokeRefreshTokensForUser(userId);
    }

    return {
      isFirstWeek,
      numberLockEnabled: subscriptionState.numberLock,
      premiumCapsEnabled: subscriptionState.premiumCaps,
      status,
      subscriptionTier: subscriptionState.displayTier,
      tier,
      trustMetrics: metrics,
      trustScore: score,
      user: persistedUser ?? {
        ...user,
        status,
        trustScore: score
      }
    };
  }

  private async loadTrustMetrics(userId: string): Promise<TrustMetrics> {
    const now = this.now();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - DAY_MS).toISOString();

    const [
      activeDaysLast30,
      reportsLast30,
      blocksLast30,
      rateLimitHitsLast30,
      negativeEventsLast7,
      autoSuspendFlags24h
    ] = await Promise.all([
      this.deps.store.countDistinctActivityDays({
        since: thirtyDaysAgo,
        userId
      }),
      this.deps.store.countAbuseEvents({
        eventTypes: ["report"],
        since: thirtyDaysAgo,
        userId
      }),
      this.deps.store.countAbuseEvents({
        eventTypes: ["block"],
        since: thirtyDaysAgo,
        userId
      }),
      this.deps.store.countAbuseEvents({
        eventTypes: ["rate_limit_hit"],
        since: thirtyDaysAgo,
        userId
      }),
      this.deps.store.countAbuseEvents({
        eventTypes: ["report", "block", "spam_flag"],
        since: sevenDaysAgo,
        userId
      }),
      this.deps.store.countAbuseEvents({
        eventTypes: ["spam_flag"],
        since: twentyFourHoursAgo,
        userId
      })
    ]);

    return {
      activeDaysLast30: clamp(activeDaysLast30, 0, 30),
      autoSuspendFlags24h,
      blocksLast30,
      negativeEventsLast7,
      rateLimitHitsLast30,
      reportsLast30
    };
  }

  private calculateTrustScore(metrics: TrustMetrics): number {
    let score = 50;
    score += 10;
    score += clamp(metrics.activeDaysLast30, 0, 30);
    if (metrics.negativeEventsLast7 === 0) {
      score += 5;
    }
    score -= metrics.reportsLast30 * 20;
    score -= metrics.blocksLast30 * 10;
    score -= metrics.rateLimitHitsLast30 * 5;

    return clamp(score, 0, 100);
  }

  private async getRewardSummary(userId: string, date: Date): Promise<RewardClaimSummary> {
    return this.deps.store.getRewardClaimSummary({
      maxClaims: this.policy.maxRewardedClaimsPerMonth,
      monthKey: monthKey(date),
      userId
    });
  }

  private buildMessageAllowance(
    state: AbuseUserState,
    usage: UsageCountRecord,
    uniqueContactsDailyUsed: number,
    rewardClaims: RewardClaimSummary
  ): MessageAllowanceSnapshot {
    const dailyCap =
      state.tier === "elevated"
        ? this.policy.elevatedTierDailySmsCap
        : state.tier === "standard"
          ? this.policy.standardTierDailySmsCap
          : this.policy.freeTierDailySmsCap;

    const uniqueContactsDailyCap =
      state.tier === "elevated"
        ? this.policy.elevatedTierDailyUniqueContactsCap
        : state.tier === "standard"
          ? this.policy.standardTierDailyUniqueContactsCap
          : this.policy.freeTierDailyUniqueContactsCap;

    const monthlyBaseCap =
      state.tier === "elevated"
        ? this.policy.elevatedTierMonthlySmsCap
        : this.policy.freeTierMonthlySmsCap;
    const monthlyCap =
      state.tier === "elevated"
        ? this.policy.elevatedTierMonthlySmsCap
        : clamp(
            monthlyBaseCap + rewardClaims.textEventsGranted,
            monthlyBaseCap,
            this.policy.elevatedTierMonthlySmsCap
          );

    return {
      dailyCap,
      dailyRemaining: Math.max(dailyCap - usage.dailyUsed, 0),
      dailyUsed: usage.dailyUsed,
      monthlyBaseCap,
      monthlyBonus:
        state.tier === "elevated"
          ? this.policy.elevatedTierMonthlySmsCap - this.policy.freeTierMonthlySmsCap
          : Math.max(monthlyCap - monthlyBaseCap, 0),
      monthlyCap,
      monthlyRemaining: Math.max(monthlyCap - usage.monthlyUsed, 0),
      monthlyUsed: usage.monthlyUsed,
      rewardClaims,
      tier: state.tier,
      trustScore: state.trustScore,
      uniqueContactsDailyCap,
      uniqueContactsDailyRemaining: Math.max(
        uniqueContactsDailyCap - uniqueContactsDailyUsed,
        0
      ),
      uniqueContactsDailyUsed
    };
  }

  private buildCallAllowance(
    state: AbuseUserState,
    usage: CallUsageRecord,
    rewardClaims: RewardClaimSummary
  ): CallAllowanceSnapshot {
    const dailyCapMinutes =
      state.tier === "elevated"
        ? this.policy.elevatedTierDailyCallMinutesCap
        : state.tier === "standard"
          ? this.policy.standardTierDailyCallMinutesCap
          : this.policy.freeTierDailyCallMinutesCap;

    const monthlyBaseCapMinutes =
      state.tier === "elevated"
        ? this.policy.elevatedTierMonthlyCallMinutesCap
        : this.policy.freeTierMonthlyCallMinutesCap;
    const monthlyCapMinutes =
      state.tier === "elevated"
        ? this.policy.elevatedTierMonthlyCallMinutesCap
        : clamp(
            monthlyBaseCapMinutes + rewardClaims.callMinutesGranted,
            monthlyBaseCapMinutes,
            this.policy.elevatedTierMonthlyCallMinutesCap
          );

    return {
      dailyCapMinutes,
      dailyRemainingMinutes: Math.max(dailyCapMinutes - usage.dailyUsedMinutes, 0),
      dailyUsedMinutes: usage.dailyUsedMinutes,
      monthlyBaseCapMinutes,
      monthlyBonusMinutes:
        state.tier === "elevated"
          ? this.policy.elevatedTierMonthlyCallMinutesCap -
            this.policy.freeTierMonthlyCallMinutesCap
          : Math.max(monthlyCapMinutes - monthlyBaseCapMinutes, 0),
      monthlyCapMinutes,
      monthlyRemainingMinutes: Math.max(
        monthlyCapMinutes - usage.monthlyUsedMinutes,
        0
      ),
      monthlyUsedMinutes: usage.monthlyUsedMinutes,
      rewardClaims,
      tier: state.tier,
      trustScore: state.trustScore
    };
  }

  private async assertGlobalSmsRate(now: Date): Promise<void> {
    const windowKey = `${now.toISOString().slice(0, 19)}Z`;
    const result = await this.deps.rateLimiter.window({
      key: `freeline:sms:global:${windowKey}`,
      limit: this.policy.globalSmsPerSecondCap,
      ttlSeconds: 2
    });

    await this.auditRateBucket({
      bucketKey: "sms_global_per_second",
      bucketScope: "messages",
      limitCount: this.policy.globalSmsPerSecondCap,
      metadata: {
        resetInSeconds: result.resetInSeconds
      },
      outcome: result.used > this.policy.globalSmsPerSecondCap ? "denied" : "allowed",
      resetAt: result.resetAt,
      usedCount: result.used,
      userId: null,
      windowKey
    });

    if (result.used > this.policy.globalSmsPerSecondCap) {
      throw new AppError(
        429,
        "telecom_rate_limit_reached",
        "Message traffic is temporarily throttled. Try again shortly.",
        {
          bucket: "sms_global_per_second",
          resetAt: result.resetAt,
          retryAfterSeconds: result.resetInSeconds,
          upgradePrompt: DEFAULT_UPGRADE_PROMPT
        }
      );
    }
  }

  private async detectMessageFlags(input: {
    body: string;
    isFirstMessageToRecipient: boolean;
    to: string;
    userId: string;
  }): Promise<string[]> {
    const flags: string[] = [];
    const normalizedBody = input.body.trim();

    if (input.isFirstMessageToRecipient && URL_REGEX.test(normalizedBody)) {
      flags.push("url_in_first_message");
    }

    if (SPAM_PATTERNS.some((pattern) => pattern.test(normalizedBody))) {
      flags.push("known_spam_pattern");
    }

    const last24Hours = new Date(this.now().getTime() - DAY_MS).toISOString();
    const recentRecipients =
      await this.deps.messageStore.countDistinctParticipantsForOutboundBodySince({
        body: normalizedBody,
        since: last24Hours,
        userId: input.userId
      });

    if (recentRecipients >= 2) {
      flags.push("identical_body_blast");
    }

    return flags;
  }

  private async buildMessageLimitError(input: {
    allowance: MessageAllowanceSnapshot;
    bucket: string;
    resetAt: string;
    retryAfterSeconds: number;
    userId: string;
    usedCount: number;
  }): Promise<AppError> {
    await this.auditRateBucket({
      bucketKey: input.bucket,
      bucketScope: "messages",
      limitCount:
        input.bucket === "unique_contacts_daily"
          ? input.allowance.uniqueContactsDailyCap
          : input.bucket === "sms_daily"
            ? input.allowance.dailyCap
            : input.allowance.monthlyCap,
      metadata: {
        allowance: input.allowance
      },
      outcome: "denied",
      resetAt: input.resetAt,
      usedCount: input.usedCount,
      userId: input.userId,
      windowKey:
        input.bucket === "sms_monthly"
          ? startOfUtcMonth(this.now()).toISOString()
          : startOfUtcDay(this.now()).toISOString()
    });

    const decision = buildRateLimitDecision({
      allowance: input.allowance,
      bucket: input.bucket,
      message: "Free tier limit reached. Watch an ad or upgrade.",
      resetAt: input.resetAt,
      retryAfterSeconds: input.retryAfterSeconds
    });

    await this.recordRateLimitHit({
      bucket: input.bucket,
      decision,
      userId: input.userId
    });

    return new AppError(
      429,
      "free_tier_limit_reached",
      decision.message,
      decision
    );
  }

  private async buildCallLimitError(input: {
    allowance: CallAllowanceSnapshot;
    bucket: string;
    resetAt: string;
    retryAfterSeconds: number;
    userId: string;
    usedCount: number;
  }): Promise<AppError> {
    await this.auditRateBucket({
      bucketKey: input.bucket,
      bucketScope: "calls",
      limitCount:
        input.bucket === "call_minutes_daily"
          ? input.allowance.dailyCapMinutes
          : input.allowance.monthlyCapMinutes,
      metadata: {
        allowance: input.allowance
      },
      outcome: "denied",
      resetAt: input.resetAt,
      usedCount: input.usedCount,
      userId: input.userId,
      windowKey:
        input.bucket === "call_minutes_monthly"
          ? startOfUtcMonth(this.now()).toISOString()
          : startOfUtcDay(this.now()).toISOString()
    });

    const decision = buildRateLimitDecision({
      allowance: input.allowance,
      bucket: input.bucket,
      message: "Free tier call limit reached. Watch an ad or upgrade.",
      resetAt: input.resetAt,
      retryAfterSeconds: input.retryAfterSeconds
    });

    await this.recordRateLimitHit({
      bucket: input.bucket,
      decision,
      userId: input.userId
    });

    return new AppError(
      429,
      "free_tier_call_limit_reached",
      decision.message,
      decision
    );
  }

  private async recordRateLimitHit(input: {
    bucket: string;
    decision: RateLimitDecision;
    userId: string | null;
  }): Promise<void> {
    if (!input.userId) {
      return;
    }

    await this.deps.store.createAbuseEvent({
      details: {
        bucket: input.bucket,
        resetAt: input.decision.resetAt,
        retryAfterSeconds: input.decision.retryAfterSeconds
      },
      eventType: "rate_limit_hit",
      userId: input.userId
    });
    await this.syncUserState(input.userId);
  }

  private async auditRateBucket(input: {
    bucketKey: string;
    bucketScope: string;
    limitCount: number;
    metadata: Record<string, unknown>;
    outcome: "allowed" | "denied";
    resetAt: string;
    usedCount: number;
    userId: string | null;
    windowKey: string;
  }): Promise<void> {
    await this.deps.store.upsertRateLimitBucket({
      bucketKey: input.bucketKey,
      bucketScope: input.bucketScope,
      limitCount: input.limitCount,
      metadata: input.metadata,
      outcome: input.outcome,
      resetAt: input.resetAt,
      usedCount: input.usedCount,
      userId: input.userId,
      windowKey: input.windowKey
    });
  }

  private assertAccountActive(state: AbuseUserState): void {
    if (state.tier === "suspended") {
      throw new AppError(
        403,
        "account_suspended",
        "This account is suspended pending abuse review."
      );
    }
  }
}
