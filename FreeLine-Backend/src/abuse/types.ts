import type { DevicePlatform, UserRecord, UserStatus } from "../auth/types.js";
import type { SubscriptionDisplayTier } from "../subscriptions/types.js";

export type AbuseEventType =
  | "activity"
  | "rate_limit_hit"
  | "spam_flag"
  | "report"
  | "block"
  | "suspension";

export type RewardType = "text_events" | "call_minutes";
export type AbuseTier = "starter" | "standard" | "elevated" | "suspended";

export interface AbuseEventRecord {
  createdAt: string;
  details: Record<string, unknown>;
  eventType: AbuseEventType;
  id: string;
  userId: string;
}

export interface RewardClaimRecord {
  claimedAt: string;
  id: string;
  monthKey: string;
  rewardAmount: number;
  rewardType: RewardType;
  userId: string;
}

export interface RewardClaimSummary {
  callMinutesGranted: number;
  maxClaims: number;
  remainingClaims: number;
  textEventsGranted: number;
  totalClaims: number;
}

export interface DeviceAccountRecord {
  adminOverrideAt: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  fingerprint: string;
  firstSeenAt: string;
  id: string;
  lastSeenAt: string;
  platform: DevicePlatform;
  userId: string;
}

export interface RateLimitBucketRecord {
  bucketKey: string;
  bucketScope: string;
  createdAt: string;
  id: string;
  lastOutcome: "allowed" | "denied";
  limitCount: number;
  metadata: Record<string, unknown>;
  resetAt: string;
  updatedAt: string;
  usedCount: number;
  userId: string | null;
  windowKey: string;
}

export interface TrustMetrics {
  activeDaysLast30: number;
  autoSuspendFlags24h: number;
  blocksLast30: number;
  negativeEventsLast7: number;
  rateLimitHitsLast30: number;
  reportsLast30: number;
}

export interface AbuseUserState {
  isFirstWeek: boolean;
  numberLockEnabled: boolean;
  premiumCapsEnabled: boolean;
  status: UserStatus;
  subscriptionTier: SubscriptionDisplayTier;
  tier: AbuseTier;
  trustMetrics: TrustMetrics;
  trustScore: number;
  user: UserRecord;
}

export interface MessageAllowanceSnapshot {
  dailyCap: number;
  dailyRemaining: number;
  dailyUsed: number;
  monthlyBaseCap: number;
  monthlyBonus: number;
  monthlyCap: number;
  monthlyRemaining: number;
  monthlyUsed: number;
  rewardClaims: RewardClaimSummary;
  tier: AbuseTier;
  trustScore: number;
  uniqueContactsDailyCap: number;
  uniqueContactsDailyRemaining: number;
  uniqueContactsDailyUsed: number;
}

export interface CallAllowanceSnapshot {
  dailyCapMinutes: number;
  dailyRemainingMinutes: number;
  dailyUsedMinutes: number;
  monthlyBaseCapMinutes: number;
  monthlyBonusMinutes: number;
  monthlyCapMinutes: number;
  monthlyRemainingMinutes: number;
  monthlyUsedMinutes: number;
  rewardClaims: RewardClaimSummary;
  tier: AbuseTier;
  trustScore: number;
}

export interface RateLimitDecision {
  allowance: MessageAllowanceSnapshot | CallAllowanceSnapshot;
  bucket: string;
  message: string;
  retryAfterSeconds: number;
  resetAt: string;
  upgradePrompt: string;
}

export interface RateLimitAuditInput {
  bucketKey: string;
  bucketScope: string;
  limitCount: number;
  metadata?: Record<string, unknown>;
  outcome: "allowed" | "denied";
  resetAt: string;
  usedCount: number;
  userId?: string | null;
  windowKey: string;
}

export interface AbuseStore {
  countAbuseEvents(input: {
    eventTypes: AbuseEventType[];
    since: string;
    userId: string;
  }): Promise<number>;
  countDistinctActivityDays(input: { since: string; userId: string }): Promise<number>;
  createAbuseEvent(input: {
    createdAt?: string;
    details?: Record<string, unknown>;
    eventType: AbuseEventType;
    userId: string;
  }): Promise<AbuseEventRecord>;
  getRewardClaimSummary(input: {
    maxClaims: number;
    monthKey: string;
    userId: string;
  }): Promise<RewardClaimSummary>;
  hasBlockedFingerprint(fingerprint: string): Promise<boolean>;
  logDeviceAccount(input: {
    fingerprint: string;
    platform: DevicePlatform;
    userId: string;
  }): Promise<DeviceAccountRecord>;
  markFingerprintsBlockedForUser(input: {
    blockedAt?: string;
    fingerprint?: string;
    reason: string;
    userId?: string;
  }): Promise<void>;
  setAdminOverrideForUserDevices(input: {
    adminOverrideAt?: string;
    cleared?: boolean;
    userId: string;
  }): Promise<void>;
  recordRewardClaim(input: {
    claimedAt?: string;
    monthKey: string;
    rewardAmount: number;
    rewardType: RewardType;
    userId: string;
  }): Promise<RewardClaimRecord>;
  upsertRateLimitBucket(input: RateLimitAuditInput): Promise<RateLimitBucketRecord>;
}

export interface RateLimitWindowState {
  limit: number;
  remaining: number;
  resetAt: string;
  resetInSeconds: number;
  used: number;
}

export interface RateLimiter {
  note(input: {
    key: string;
    ttlSeconds: number;
    value: string;
  }): Promise<void>;
  noteUnique(input: {
    key: string;
    ttlSeconds: number;
    value: string;
  }): Promise<{ count: number; isNewValue: boolean }>;
  window(input: {
    amount?: number;
    key: string;
    limit: number;
    ttlSeconds: number;
  }): Promise<RateLimitWindowState>;
}
