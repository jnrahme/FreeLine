export type SubscriptionProvider = "dev" | "revenuecat";
export type SubscriptionEntitlementKey = "ad_free" | "number_lock" | "premium_caps";
export type SubscriptionRecordStatus = "active" | "expired" | "revoked";
export type SubscriptionDisplayTier =
  | "free"
  | "ad_free"
  | "lock_my_number"
  | "premium"
  | "custom";

export interface SubscriptionRecord {
  createdAt: string;
  entitlementKey: SubscriptionEntitlementKey;
  expiresAt: string | null;
  id: string;
  metadata: Record<string, unknown>;
  provider: SubscriptionProvider;
  sourceProductId: string;
  status: SubscriptionRecordStatus;
  transactionId: string;
  updatedAt: string;
  userId: string;
  verifiedAt: string;
}

export interface SubscriptionEntitlementState {
  activeProducts: SubscriptionRecord[];
  adFree: boolean;
  adsEnabled: boolean;
  displayTier: SubscriptionDisplayTier;
  numberLock: boolean;
  premiumCaps: boolean;
}

export interface SubscriptionProductDefinition {
  description: string;
  displayName: string;
  entitlements: SubscriptionEntitlementKey[];
  id: string;
  monthlyCallCapMinutes: number;
  monthlySmsCap: number;
  priceLabel: string;
}

export interface SubscriptionStore {
  getActiveSubscriptions(input: {
    now?: string;
    userId: string;
  }): Promise<SubscriptionRecord[]>;
  upsertVerifiedEntitlement(input: {
    entitlementKey: SubscriptionEntitlementKey;
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
    provider: SubscriptionProvider;
    sourceProductId: string;
    status?: SubscriptionRecordStatus;
    transactionId: string;
    updatedAt?: string;
    userId: string;
    verifiedAt?: string;
  }): Promise<SubscriptionRecord>;
}

export interface SubscriptionAccess {
  getEntitlementState(
    userId: string,
    now?: string
  ): Promise<SubscriptionEntitlementState>;
}
