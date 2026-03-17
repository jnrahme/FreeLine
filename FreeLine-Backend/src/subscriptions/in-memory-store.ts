import { createId } from "../auth/crypto.js";
import type {
  SubscriptionRecord,
  SubscriptionStore
} from "./types.js";

export class InMemorySubscriptionStore implements SubscriptionStore {
  private readonly records = new Map<string, SubscriptionRecord>();
  private readonly recordsByKey = new Map<string, string>();

  async getActiveSubscriptions(input: {
    now?: string;
    userId: string;
  }): Promise<SubscriptionRecord[]> {
    const now = input.now ?? new Date().toISOString();

    return Array.from(this.records.values())
      .filter((record) => {
        if (record.userId !== input.userId || record.status !== "active") {
          return false;
        }

        return record.expiresAt === null || record.expiresAt > now;
      })
      .sort((left, right) => left.verifiedAt.localeCompare(right.verifiedAt));
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
    const key = `${input.userId}:${input.entitlementKey}`;
    const now = input.updatedAt ?? new Date().toISOString();
    const existingId = this.recordsByKey.get(key);
    const nextRecord: SubscriptionRecord = existingId
      ? {
          ...(this.records.get(existingId) as SubscriptionRecord),
          entitlementKey: input.entitlementKey,
          expiresAt: input.expiresAt ?? null,
          metadata: input.metadata ?? {},
          provider: input.provider,
          sourceProductId: input.sourceProductId,
          status: input.status ?? "active",
          transactionId: input.transactionId,
          updatedAt: now,
          verifiedAt: input.verifiedAt ?? now
        }
      : {
          createdAt: now,
          entitlementKey: input.entitlementKey,
          expiresAt: input.expiresAt ?? null,
          id: createId(),
          metadata: input.metadata ?? {},
          provider: input.provider,
          sourceProductId: input.sourceProductId,
          status: input.status ?? "active",
          transactionId: input.transactionId,
          updatedAt: now,
          userId: input.userId,
          verifiedAt: input.verifiedAt ?? now
        };

    this.records.set(nextRecord.id, nextRecord);
    this.recordsByKey.set(key, nextRecord.id);
    return nextRecord;
  }

  debugListSubscriptions(): SubscriptionRecord[] {
    return Array.from(this.records.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }
}
