import { createHmac, timingSafeEqual } from "node:crypto";

export function computeWebhookSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string | undefined
): boolean {
  if (!signature) {
    return false;
  }

  const expected = computeWebhookSignature(secret, payload);
  const provided = signature.trim();

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
