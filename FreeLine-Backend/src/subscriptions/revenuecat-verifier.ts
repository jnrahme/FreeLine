import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import type {
  RevenueCatPurchaseVerificationInput,
  RevenueCatPurchaseVerificationResult,
  RevenueCatPurchaseVerifier
} from "./types.js";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseOptionalIsoDate(value: unknown): string | null {
  const rawValue = readOptionalString(value);
  if (!rawValue) {
    return null;
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function getRecordField(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];
  if (!isRecord(value)) {
    throw new AppError(
      400,
      "invalid_subscription_receipt",
      "RevenueCat did not return the expected subscriber payload."
    );
  }

  return value;
}

function getSubscriptionEntitlement(
  entitlements: Record<string, unknown>,
  entitlementKey: string
): Record<string, unknown> {
  const entitlement = entitlements[entitlementKey];
  if (!isRecord(entitlement)) {
    throw new AppError(
      400,
      "invalid_subscription_receipt",
      `RevenueCat does not show an active ${entitlementKey} entitlement for this purchase.`
    );
  }

  return entitlement;
}

function ensureFutureExpiration(
  expiresAt: string | null,
  entitlementKey: string,
  now: string
): void {
  if (expiresAt !== null && expiresAt <= now) {
    throw new AppError(
      400,
      "invalid_subscription_receipt",
      `The RevenueCat ${entitlementKey} entitlement is expired.`
    );
  }
}

export class ApiRevenueCatPurchaseVerifier implements RevenueCatPurchaseVerifier {
  async verifyPurchase(
    input: RevenueCatPurchaseVerificationInput
  ): Promise<RevenueCatPurchaseVerificationResult> {
    if (!env.REVENUECAT_SECRET_KEY) {
      throw new AppError(
        503,
        "subscription_verification_unavailable",
        "RevenueCat verification is not configured on the backend."
      );
    }

    const appUserId = readOptionalString(input.verificationToken);
    if (!appUserId) {
      throw new AppError(
        400,
        "invalid_subscription_receipt",
        "RevenueCat verification requires an app user identifier."
      );
    }

    const response = await fetch(
      `${normalizeBaseUrl(env.REVENUECAT_API_BASE_URL)}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`
        }
      }
    );

    if (!response.ok) {
      if (response.status >= 500) {
        throw new AppError(
          503,
          "subscription_verification_unavailable",
          "RevenueCat verification is temporarily unavailable."
        );
      }

      throw new AppError(
        400,
        "invalid_subscription_receipt",
        "RevenueCat could not verify the provided purchase."
      );
    }

    const body = (await response.json()) as unknown;
    if (!isRecord(body) || !isRecord(body.subscriber)) {
      throw new AppError(
        400,
        "invalid_subscription_receipt",
        "RevenueCat returned an invalid subscriber payload."
      );
    }

    const subscriber = body.subscriber;
    const entitlements = getRecordField(subscriber, "entitlements");
    const subscriptions = isRecord(subscriber.subscriptions)
      ? subscriber.subscriptions
      : {};
    const subscriptionCandidate = subscriptions[input.productId];
    const productSubscription = isRecord(subscriptionCandidate)
      ? subscriptionCandidate
      : undefined;
    const now = new Date().toISOString();
    const entitlementExpirations: string[] = [];
    const stores = new Set<string>();
    const ownershipTypes = new Set<string>();
    let isSandbox: boolean | null = readOptionalBoolean(productSubscription?.is_sandbox);

    for (const entitlementKey of input.expectedEntitlements) {
      const entitlement = getSubscriptionEntitlement(entitlements, entitlementKey);
      const sourceProductId = readOptionalString(entitlement.product_identifier);
      if (sourceProductId && sourceProductId !== input.productId) {
        throw new AppError(
          400,
          "invalid_subscription_receipt",
          `RevenueCat mapped ${entitlementKey} to ${sourceProductId}, not ${input.productId}.`
        );
      }

      const expiresAt = parseOptionalIsoDate(
        entitlement.expires_date ?? entitlement.grace_period_expires_date ?? null
      );
      ensureFutureExpiration(expiresAt, entitlementKey, now);
      if (expiresAt) {
        entitlementExpirations.push(expiresAt);
      }

      const store =
        readOptionalString(entitlement.store) ?? readOptionalString(productSubscription?.store);
      if (store) {
        stores.add(store);
      }

      const ownershipType = readOptionalString(entitlement.ownership_type);
      if (ownershipType) {
        ownershipTypes.add(ownershipType);
      }

      if (isSandbox === null) {
        isSandbox = readOptionalBoolean(entitlement.is_sandbox);
      }
    }

    const expiresAt =
      entitlementExpirations.length > 0
        ? entitlementExpirations.sort((left, right) => left.localeCompare(right))[0]
        : null;

    return {
      appUserId,
      expiresAt,
      metadata: {
        expectedEntitlements: input.expectedEntitlements,
        ownershipTypes: Array.from(ownershipTypes),
        platform: input.platform,
        revenueCatAppUserId: appUserId,
        revenueCatFirstSeen: readOptionalString(subscriber.first_seen),
        revenueCatManagementUrl: readOptionalString(subscriber.management_url),
        revenueCatOriginalAppUserId:
          readOptionalString(subscriber.original_app_user_id) ?? appUserId,
        revenueCatStores: Array.from(stores),
        sandbox: isSandbox ?? false,
        verificationMode: "revenuecat"
      },
      transactionId: input.transactionId
    };
  }
}
