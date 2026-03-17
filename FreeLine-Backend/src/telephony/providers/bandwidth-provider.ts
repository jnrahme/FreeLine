import { env } from "../../config/env.js";
import { recordSmsEvent } from "../dev-telemetry.js";
import type {
  AvailableNumber,
  ProvisionedNumber,
  SmsResult,
  TelephonyProvider
} from "../telephony-provider.js";
import { verifyWebhookSignature } from "../signing.js";

const DEFAULT_LOCALITY = "San Francisco";
const DEFAULT_REGION = "CA";

function buildDevNumbers(areaCode: string): AvailableNumber[] {
  const safeAreaCode = /^\d{3}$/.test(areaCode) ? areaCode : "415";

  return Array.from({ length: 10 }, (_, index) => {
    const suffix = String(101 + index).padStart(4, "0");

    return {
      phoneNumber: `+1${safeAreaCode}555${suffix}`,
      nationalFormat: `(${safeAreaCode}) 555-${suffix}`,
      locality: DEFAULT_LOCALITY,
      region: DEFAULT_REGION,
      provider: "bandwidth" as const
    };
  });
}

export class BandwidthProvider implements TelephonyProvider {
  async searchNumbers(areaCode: string): Promise<AvailableNumber[]> {
    return buildDevNumbers(areaCode);
  }

  async provisionNumber(phoneNumber: string): Promise<ProvisionedNumber> {
    return {
      phoneNumber,
      externalId: `bandwidth-${phoneNumber.replace(/\D/g, "")}`,
      provider: "bandwidth"
    };
  }

  async releaseNumber(_phoneNumber: string): Promise<void> {
    return;
  }

  async sendSms(_from: string, _to: string, _body: string): Promise<SmsResult> {
    const result = {
      externalId: `bandwidth-sms-${Date.now()}`,
      status: "queued"
    } satisfies SmsResult;

    await recordSmsEvent({
      body: _body,
      externalId: result.externalId,
      from: _from,
      provider: "bandwidth",
      to: _to
    });

    return result;
  }

  async createVoiceToken(identity: string): Promise<string> {
    return `bandwidth-dev-token:${identity}`;
  }

  verifySmsStatusSignature(payload: string, signature: string | undefined): boolean {
    return verifyWebhookSignature(env.BANDWIDTH_WEBHOOK_SECRET, payload, signature);
  }
}
