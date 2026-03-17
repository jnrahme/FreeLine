import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import { ApiRevenueCatPurchaseVerifier } from "./revenuecat-verifier.js";
import type {
  RevenueCatPurchaseVerifier,
  SubscriptionAccess,
  SubscriptionDisplayTier,
  SubscriptionEntitlementKey,
  SubscriptionEntitlementState,
  SubscriptionProductDefinition,
  SubscriptionProvider,
  SubscriptionRecord,
  SubscriptionStore
} from "./types.js";

const PRODUCT_DEFINITIONS = new Map<string, SubscriptionProductDefinition>([
  [
    "freeline.ad_free.monthly",
    {
      description: "Removes banner, native, interstitial, and rewarded ads while keeping the standard free-tier caps.",
      displayName: "Ad-Free",
      entitlements: ["ad_free"],
      id: "freeline.ad_free.monthly",
      monthlyCallCapMinutes: env.FREE_TIER_MONTHLY_CALL_MINUTES_CAP,
      monthlySmsCap: env.FREE_TIER_MONTHLY_SMS_CAP,
      priceLabel: "$4.99/mo"
    }
  ],
  [
    "freeline.lock_number.monthly",
    {
      description: "Protects your line from inactivity reclaim while leaving the normal beta caps in place.",
      displayName: "Lock My Number",
      entitlements: ["number_lock"],
      id: "freeline.lock_number.monthly",
      monthlyCallCapMinutes: env.FREE_TIER_MONTHLY_CALL_MINUTES_CAP,
      monthlySmsCap: env.FREE_TIER_MONTHLY_SMS_CAP,
      priceLabel: "$1.99/mo"
    }
  ],
  [
    "freeline.premium.monthly",
    {
      description: "Bundles Ad-Free, Lock My Number, and the elevated beta usage caps.",
      displayName: "Premium",
      entitlements: ["ad_free", "number_lock", "premium_caps"],
      id: "freeline.premium.monthly",
      monthlyCallCapMinutes: env.ELEVATED_TIER_MONTHLY_CALL_MINUTES_CAP,
      monthlySmsCap: env.ELEVATED_TIER_MONTHLY_SMS_CAP,
      priceLabel: "$9.99/mo"
    }
  ]
]);

function deriveDisplayTier(input: {
  adFree: boolean;
  numberLock: boolean;
  premiumCaps: boolean;
}): SubscriptionDisplayTier {
  if (input.premiumCaps && input.adFree && input.numberLock) {
    return "premium";
  }

  if (input.adFree && input.numberLock) {
    return "custom";
  }

  if (input.adFree) {
    return "ad_free";
  }

  if (input.numberLock) {
    return "lock_my_number";
  }

  return "free";
}

function includesEntitlement(
  records: SubscriptionRecord[],
  entitlementKey: SubscriptionEntitlementKey
): boolean {
  return records.some((record) => record.entitlementKey === entitlementKey);
}

export class SubscriptionService implements SubscriptionAccess {
  constructor(
    private readonly store: SubscriptionStore,
    private readonly revenueCatVerifier: RevenueCatPurchaseVerifier = new ApiRevenueCatPurchaseVerifier()
  ) {}

  async getEntitlementState(
    userId: string,
    now = new Date().toISOString()
  ): Promise<SubscriptionEntitlementState> {
    const activeProducts = await this.store.getActiveSubscriptions({ now, userId });
    const adFree = includesEntitlement(activeProducts, "ad_free");
    const numberLock = includesEntitlement(activeProducts, "number_lock");
    const premiumCaps = includesEntitlement(activeProducts, "premium_caps");

    return {
      activeProducts,
      adFree,
      adsEnabled: !adFree,
      displayTier: deriveDisplayTier({
        adFree,
        numberLock,
        premiumCaps
      }),
      numberLock,
      premiumCaps
    };
  }

  async getStatus(userId: string): Promise<{
    products: SubscriptionRecord[];
    status: SubscriptionEntitlementState;
    usagePlan: {
      dailyCallCapMinutes: number;
      dailySmsCap: number;
      description: string;
      monthlyCallCapMinutes: number;
      monthlySmsCap: number;
      uniqueContactsDailyCap: number;
    };
  }> {
    const status = await this.getEntitlementState(userId);

    const usagePlan = status.premiumCaps
      ? {
          dailyCallCapMinutes: env.ELEVATED_TIER_DAILY_CALL_MINUTES_CAP,
          dailySmsCap: env.ELEVATED_TIER_DAILY_SMS_CAP,
          description: "Premium unlocks elevated beta caps and disables ads.",
          monthlyCallCapMinutes: env.ELEVATED_TIER_MONTHLY_CALL_MINUTES_CAP,
          monthlySmsCap: env.ELEVATED_TIER_MONTHLY_SMS_CAP,
          uniqueContactsDailyCap: env.ELEVATED_TIER_DAILY_UNIQUE_CONTACTS_CAP
        }
      : {
          dailyCallCapMinutes: env.FREE_TIER_DAILY_CALL_MINUTES_CAP,
          dailySmsCap: env.FREE_TIER_DAILY_SMS_CAP,
          description: status.numberLock
            ? "Lock My Number protects your line from inactivity reclaim."
            : "Free and Ad-Free share the same beta caps; rewarded ads can unlock extra usage.",
          monthlyCallCapMinutes: env.FREE_TIER_MONTHLY_CALL_MINUTES_CAP,
          monthlySmsCap: env.FREE_TIER_MONTHLY_SMS_CAP,
          uniqueContactsDailyCap: env.FREE_TIER_DAILY_UNIQUE_CONTACTS_CAP
        };

    return {
      products: status.activeProducts,
      status,
      usagePlan
    };
  }

  async verifyPurchase(input: {
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
    platform: "ios" | "android";
    productId: string;
    provider: SubscriptionProvider;
    transactionId: string;
    userId: string;
    verificationToken?: string | null;
  }): Promise<{
    product: SubscriptionProductDefinition;
    status: SubscriptionEntitlementState;
    verifiedEntitlements: SubscriptionRecord[];
  }> {
    const product = PRODUCT_DEFINITIONS.get(input.productId);
    if (!product) {
      throw new AppError(
        400,
        "unsupported_subscription_product",
        "Unsupported subscription product."
      );
    }

    const now = new Date().toISOString();
    const verifiedPurchase =
      input.provider === "revenuecat"
        ? await this.revenueCatVerifier.verifyPurchase({
            expectedEntitlements: product.entitlements,
            platform: input.platform,
            productId: input.productId,
            transactionId: input.transactionId,
            userId: input.userId,
            verificationToken: input.verificationToken
          })
        : (() => {
            const expectedToken = `dev-${input.productId}`;
            if ((input.verificationToken ?? "") !== expectedToken) {
              throw new AppError(
                400,
                "invalid_subscription_receipt",
                "The provided purchase token could not be verified."
              );
            }

            return {
              expiresAt: input.expiresAt ?? null,
              metadata: {
                ...(input.metadata ?? {}),
                platform: input.platform,
                sandbox: true,
                verificationMode: "dev"
              },
              transactionId: input.transactionId
            };
          })();
    const verifiedEntitlements: SubscriptionRecord[] = [];
    for (const entitlementKey of product.entitlements) {
      const record = await this.store.upsertVerifiedEntitlement({
        entitlementKey,
        expiresAt: verifiedPurchase.expiresAt,
        metadata: {
          ...(input.metadata ?? {}),
          ...verifiedPurchase.metadata
        },
        provider: input.provider,
        sourceProductId: input.productId,
        transactionId: `${verifiedPurchase.transactionId}:${entitlementKey}`,
        updatedAt: now,
        userId: input.userId,
        verifiedAt: now
      });
      verifiedEntitlements.push(record);
    }

    return {
      product,
      status: await this.getEntitlementState(input.userId, now),
      verifiedEntitlements
    };
  }

  static productCatalog(): SubscriptionProductDefinition[] {
    return Array.from(PRODUCT_DEFINITIONS.values());
  }
}
