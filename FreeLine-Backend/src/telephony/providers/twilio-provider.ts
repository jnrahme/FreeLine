import twilio from "twilio";

import { env } from "../../config/env.js";
import { recordSmsEvent } from "../dev-telemetry.js";
import type {
  AvailableNumber,
  ProvisionedNumber,
  SmsResult,
  TelephonyProvider
} from "../telephony-provider.js";
import { verifyWebhookSignature } from "../signing.js";

export class TwilioProvider implements TelephonyProvider {
  async searchNumbers(_areaCode: string): Promise<AvailableNumber[]> {
    return [];
  }

  async provisionNumber(phoneNumber: string): Promise<ProvisionedNumber> {
    return {
      phoneNumber,
      externalId: `twilio-${phoneNumber.replace(/\D/g, "")}`,
      provider: "twilio"
    };
  }

  async releaseNumber(_phoneNumber: string): Promise<void> {
    return;
  }

  async sendSms(_from: string, _to: string, _body: string): Promise<SmsResult> {
    const result = {
      externalId: `twilio-sms-${Date.now()}`,
      status: "queued"
    } satisfies SmsResult;

    await recordSmsEvent({
      body: _body,
      externalId: result.externalId,
      from: _from,
      provider: "twilio",
      to: _to
    });

    return result;
  }

  async createVoiceToken(identity: string): Promise<string> {
    if (
      !env.TWILIO_ACCOUNT_SID ||
      !env.TWILIO_API_KEY ||
      !env.TWILIO_API_SECRET ||
      !env.TWILIO_VOICE_APP_SID
    ) {
      return `twilio-dev-token:${identity}`;
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const token = new AccessToken(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_API_KEY,
      env.TWILIO_API_SECRET,
      {
        identity,
        ttl: 3600
      }
    );

    token.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: env.TWILIO_VOICE_APP_SID,
        pushCredentialSid: env.TWILIO_VOICE_PUSH_CREDENTIAL_SID || undefined
      })
    );

    return token.toJwt();
  }

  verifySmsStatusSignature(payload: string, signature: string | undefined): boolean {
    return verifyWebhookSignature(env.TWILIO_WEBHOOK_SECRET, payload, signature);
  }
}
