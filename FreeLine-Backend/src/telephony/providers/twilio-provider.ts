import twilio from "twilio";

import { env } from "../../config/env.js";
import { buildDevNumbers, formatUsNationalNumber } from "../dev-numbers.js";
import { recordSmsEvent } from "../dev-telemetry.js";
import type {
  AvailableNumber,
  ProvisionedNumber,
  SmsResult,
  TelephonyProvider
} from "../telephony-provider.js";
import { verifyWebhookSignature } from "../signing.js";

type TwilioIncomingPhoneNumberRecord = {
  phoneNumber?: string | null;
  remove(): Promise<boolean>;
  sid?: string | null;
};

type TwilioMessageRecord = {
  sid?: string | null;
  status?: string | null;
};

type TwilioPhoneNumberCandidate = {
  friendlyName?: string | null;
  locality?: string | null;
  phoneNumber?: string | null;
  region?: string | null;
};

export interface TwilioRestClient {
  availablePhoneNumbers(countryCode: string): {
    local: {
      list(options: { areaCode: number; limit: number }): Promise<TwilioPhoneNumberCandidate[]>;
    };
  };
  incomingPhoneNumbers: {
    create(options: {
      phoneNumber: string;
      smsMethod: "POST";
      smsUrl: string;
      voiceMethod: "POST";
      voiceUrl: string;
    }): Promise<TwilioIncomingPhoneNumberRecord>;
    list(options: { limit: number; phoneNumber: string }): Promise<TwilioIncomingPhoneNumberRecord[]>;
  };
  messages: {
    create(options: {
      body: string;
      from: string;
      statusCallback: string;
      to: string;
    }): Promise<TwilioMessageRecord>;
  };
}

function createRestClientFromEnv(): TwilioRestClient | null {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return null;
  }

  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN) as TwilioRestClient;
}

function normalizeSmsResultStatus(status: string | null | undefined): SmsResult["status"] {
  switch (status?.trim().toLowerCase()) {
    case "delivered":
    case "sent":
      return "sent";
    default:
      return "queued";
  }
}

function mapAvailableNumber(candidate: TwilioPhoneNumberCandidate): AvailableNumber | null {
  const phoneNumber = candidate.phoneNumber?.trim();

  if (!phoneNumber) {
    return null;
  }

  return {
    locality: candidate.locality?.trim() || "Unknown",
    nationalFormat:
      candidate.friendlyName?.trim() || formatUsNationalNumber(phoneNumber),
    phoneNumber,
    provider: "twilio",
    region: candidate.region?.trim() || "US"
  };
}

function buildUrl(pathname: string): string {
  return new URL(pathname, env.PUBLIC_BASE_URL).toString();
}

export interface TwilioProviderOptions {
  client?: TwilioRestClient | null;
  enableLiveRest?: boolean;
}

export class TwilioProvider implements TelephonyProvider {
  private readonly client: TwilioRestClient | null;
  private readonly enableLiveRest: boolean;

  constructor(options: TwilioProviderOptions = {}) {
    this.client = options.client ?? createRestClientFromEnv();
    this.enableLiveRest = options.enableLiveRest ?? Boolean(this.client);
  }

  async searchNumbers(areaCode: string): Promise<AvailableNumber[]> {
    if (!this.enableLiveRest || !this.client) {
      return buildDevNumbers(areaCode, "twilio");
    }

    const candidates = await this.client
      .availablePhoneNumbers("US")
      .local.list({ areaCode: Number(areaCode), limit: 10 });

    return candidates
      .map((candidate) => mapAvailableNumber(candidate))
      .filter((candidate): candidate is AvailableNumber => candidate !== null);
  }

  async provisionNumber(phoneNumber: string): Promise<ProvisionedNumber> {
    if (!this.enableLiveRest || !this.client) {
      return {
        phoneNumber,
        externalId: `twilio-${phoneNumber.replace(/\D/g, "")}`,
        provider: "twilio"
      };
    }

    const provisioned = await this.client.incomingPhoneNumbers.create({
      phoneNumber,
      smsMethod: "POST",
      smsUrl: buildUrl("/v1/webhooks/twilio/messages/inbound"),
      voiceMethod: "POST",
      voiceUrl: buildUrl("/v1/webhooks/twilio/voice/inbound")
    });

    return {
      phoneNumber,
      externalId: provisioned.sid?.trim() || `twilio-${phoneNumber.replace(/\D/g, "")}`,
      provider: "twilio"
    };
  }

  async releaseNumber(phoneNumber: string): Promise<void> {
    if (!this.enableLiveRest || !this.client) {
      return;
    }

    const ownedNumbers = await this.client.incomingPhoneNumbers.list({
      limit: 1,
      phoneNumber
    });
    const number = ownedNumbers[0];

    if (!number) {
      return;
    }

    await number.remove();
    return;
  }

  async sendSms(from: string, to: string, body: string): Promise<SmsResult> {
    if (this.enableLiveRest && this.client) {
      const message = await this.client.messages.create({
        body,
        from,
        statusCallback: buildUrl("/v1/webhooks/twilio/messages/status"),
        to
      });

      return {
        externalId: message.sid?.trim() || `twilio-sms-${Date.now()}`,
        status: normalizeSmsResultStatus(message.status)
      };
    }

    const result = {
      externalId: `twilio-sms-${Date.now()}`,
      status: "queued"
    } satisfies SmsResult;

    await recordSmsEvent({
      body,
      externalId: result.externalId,
      from,
      provider: "twilio",
      to
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
