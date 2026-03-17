export interface AvailableNumber {
  phoneNumber: string;
  nationalFormat: string;
  locality: string;
  region: string;
  provider: "bandwidth" | "twilio" | "stub";
}

export interface ProvisionedNumber {
  phoneNumber: string;
  externalId: string;
  provider: "bandwidth" | "twilio" | "stub";
}

export interface SmsResult {
  externalId: string;
  status: "queued" | "sent";
}

export interface TelephonyProvider {
  searchNumbers(areaCode: string): Promise<AvailableNumber[]>;
  provisionNumber(phoneNumber: string): Promise<ProvisionedNumber>;
  releaseNumber(phoneNumber: string): Promise<void>;
  sendSms(from: string, to: string, body: string): Promise<SmsResult>;
  createVoiceToken(identity: string): Promise<string>;
  verifySmsStatusSignature(payload: string, signature: string | undefined): boolean;
}
