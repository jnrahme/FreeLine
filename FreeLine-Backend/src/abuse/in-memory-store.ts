import { createId } from "../auth/crypto.js";
import type {
  AbuseEventRecord,
  AbuseStore,
  DeviceAccountRecord,
  RateLimitAuditInput,
  RateLimitBucketRecord,
  RewardClaimRecord,
  RewardClaimSummary
} from "./types.js";

export class InMemoryAbuseStore implements AbuseStore {
  private readonly events = new Map<string, AbuseEventRecord>();
  private readonly rewardClaims = new Map<string, RewardClaimRecord>();
  private readonly deviceAccounts = new Map<string, DeviceAccountRecord>();
  private readonly rateLimitBuckets = new Map<string, RateLimitBucketRecord>();

  async countAbuseEvents(input: {
    eventTypes: AbuseEventRecord["eventType"][];
    since: string;
    userId: string;
  }): Promise<number> {
    const threshold = new Date(input.since).getTime();

    return Array.from(this.events.values()).filter((event) => {
      return (
        event.userId === input.userId &&
        input.eventTypes.includes(event.eventType) &&
        new Date(event.createdAt).getTime() >= threshold
      );
    }).length;
  }

  async countDistinctActivityDays(input: {
    since: string;
    userId: string;
  }): Promise<number> {
    const threshold = new Date(input.since).getTime();
    const days = new Set<string>();

    for (const event of this.events.values()) {
      if (
        event.userId === input.userId &&
        event.eventType === "activity" &&
        new Date(event.createdAt).getTime() >= threshold
      ) {
        days.add(event.createdAt.slice(0, 10));
      }
    }

    return days.size;
  }

  async createAbuseEvent(input: {
    createdAt?: string;
    details?: Record<string, unknown>;
    eventType: AbuseEventRecord["eventType"];
    userId: string;
  }): Promise<AbuseEventRecord> {
    const event: AbuseEventRecord = {
      createdAt: input.createdAt ?? new Date().toISOString(),
      details: input.details ?? {},
      eventType: input.eventType,
      id: createId(),
      userId: input.userId
    };
    this.events.set(event.id, event);
    return event;
  }

  async getRewardClaimSummary(input: {
    maxClaims: number;
    monthKey: string;
    userId: string;
  }): Promise<RewardClaimSummary> {
    const claims = Array.from(this.rewardClaims.values()).filter(
      (claim) => claim.userId === input.userId && claim.monthKey === input.monthKey
    );

    return {
      callMinutesGranted: claims
        .filter((claim) => claim.rewardType === "call_minutes")
        .reduce((total, claim) => total + claim.rewardAmount, 0),
      maxClaims: input.maxClaims,
      remainingClaims: Math.max(input.maxClaims - claims.length, 0),
      textEventsGranted: claims
        .filter((claim) => claim.rewardType === "text_events")
        .reduce((total, claim) => total + claim.rewardAmount, 0),
      totalClaims: claims.length
    };
  }

  async hasBlockedFingerprint(fingerprint: string): Promise<boolean> {
    return Array.from(this.deviceAccounts.values()).some(
      (record) =>
        record.fingerprint === fingerprint &&
        record.blockedAt !== null &&
        record.adminOverrideAt === null
    );
  }

  async logDeviceAccount(input: {
    fingerprint: string;
    platform: DeviceAccountRecord["platform"];
    userId: string;
  }): Promise<DeviceAccountRecord> {
    const key = `${input.fingerprint}:${input.userId}`;
    const now = new Date().toISOString();
    const existing = this.deviceAccounts.get(key);

    if (existing) {
      const nextRecord: DeviceAccountRecord = {
        ...existing,
        lastSeenAt: now,
        platform: input.platform
      };
      this.deviceAccounts.set(key, nextRecord);
      return nextRecord;
    }

    const record: DeviceAccountRecord = {
      adminOverrideAt: null,
      blockedAt: null,
      blockedReason: null,
      fingerprint: input.fingerprint,
      firstSeenAt: now,
      id: createId(),
      lastSeenAt: now,
      platform: input.platform,
      userId: input.userId
    };
    this.deviceAccounts.set(key, record);
    return record;
  }

  async markFingerprintsBlockedForUser(input: {
    blockedAt?: string;
    fingerprint?: string;
    reason: string;
    userId?: string;
  }): Promise<void> {
    const blockedAt = input.blockedAt ?? new Date().toISOString();

    for (const [key, record] of this.deviceAccounts.entries()) {
      if (input.userId && record.userId !== input.userId) {
        continue;
      }
      if (input.fingerprint && record.fingerprint !== input.fingerprint) {
        continue;
      }

      this.deviceAccounts.set(key, {
        ...record,
        blockedAt,
        blockedReason: input.reason
      });
    }
  }

  async setAdminOverrideForUserDevices(input: {
    adminOverrideAt?: string;
    cleared?: boolean;
    userId: string;
  }): Promise<void> {
    const overrideAt =
      input.cleared === true ? null : input.adminOverrideAt ?? new Date().toISOString();

    for (const [key, record] of this.deviceAccounts.entries()) {
      if (record.userId !== input.userId) {
        continue;
      }

      this.deviceAccounts.set(key, {
        ...record,
        adminOverrideAt: overrideAt
      });
    }
  }

  async recordRewardClaim(input: {
    claimedAt?: string;
    monthKey: string;
    rewardAmount: number;
    rewardType: RewardClaimRecord["rewardType"];
    userId: string;
  }): Promise<RewardClaimRecord> {
    const claim: RewardClaimRecord = {
      claimedAt: input.claimedAt ?? new Date().toISOString(),
      id: createId(),
      monthKey: input.monthKey,
      rewardAmount: input.rewardAmount,
      rewardType: input.rewardType,
      userId: input.userId
    };
    this.rewardClaims.set(claim.id, claim);
    return claim;
  }

  async upsertRateLimitBucket(input: RateLimitAuditInput): Promise<RateLimitBucketRecord> {
    const key = `${input.bucketKey}:${input.windowKey}`;
    const now = new Date().toISOString();
    const existing = this.rateLimitBuckets.get(key);

    const record: RateLimitBucketRecord = existing
      ? {
          ...existing,
          lastOutcome: input.outcome,
          limitCount: input.limitCount,
          metadata: input.metadata ?? {},
          resetAt: input.resetAt,
          updatedAt: now,
          usedCount: input.usedCount,
          userId: input.userId ?? null
        }
      : {
          bucketKey: input.bucketKey,
          bucketScope: input.bucketScope,
          createdAt: now,
          id: createId(),
          lastOutcome: input.outcome,
          limitCount: input.limitCount,
          metadata: input.metadata ?? {},
          resetAt: input.resetAt,
          updatedAt: now,
          usedCount: input.usedCount,
          userId: input.userId ?? null,
          windowKey: input.windowKey
        };

    this.rateLimitBuckets.set(key, record);
    return record;
  }

  listEventsForUser(userId: string): AbuseEventRecord[] {
    return Array.from(this.events.values())
      .filter((event) => event.userId === userId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  listDeviceAccounts(): DeviceAccountRecord[] {
    return Array.from(this.deviceAccounts.values()).sort((left, right) =>
      left.fingerprint.localeCompare(right.fingerprint)
    );
  }

  listRateLimitBuckets(): RateLimitBucketRecord[] {
    return Array.from(this.rateLimitBuckets.values()).sort((left, right) =>
      left.bucketKey.localeCompare(right.bucketKey)
    );
  }

  listRewardClaims(userId: string): RewardClaimRecord[] {
    return Array.from(this.rewardClaims.values())
      .filter((claim) => claim.userId === userId)
      .sort((left, right) => left.claimedAt.localeCompare(right.claimedAt));
  }
}
