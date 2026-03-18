import { normalizeUsPhoneNumber } from "../telephony/us-phone-policy.js";

const EMERGENCY_DESTINATIONS = new Set(["911", "112", "999"]);

export interface TwilioClientIdentity {
  phoneNumberId: string;
  raw: string;
  userId: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildTwilioDialTwiml(input: {
  callerId: string;
  statusCallbackUrl?: string | null;
  to: string;
}): string {
  const callbackAttributes = input.statusCallbackUrl
    ? ` statusCallback="${escapeXml(
        input.statusCallbackUrl
      )}" statusCallbackEvent="initiated ringing answered completed"`
    : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Dial callerId="${escapeXml(input.callerId)}">`,
    `    <Number${callbackAttributes}>${escapeXml(input.to)}</Number>`,
    "  </Dial>",
    "</Response>"
  ].join("");
}

export function buildTwilioClientDialTwiml(input: {
  callerNumber: string;
  identity: string;
  ringSeconds: number;
  statusCallbackUrl?: string | null;
  voicemailWebhookUrl: string;
}): string {
  const callbackAttributes = input.statusCallbackUrl
    ? ` statusCallback="${escapeXml(
        input.statusCallbackUrl
      )}" statusCallbackEvent="initiated ringing answered completed"`
    : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Dial answerOnBridge="true" callerId="${escapeXml(
      input.callerNumber
    )}" timeout="${Math.max(input.ringSeconds, 1)}">`,
    `    <Client${callbackAttributes}>${escapeXml(input.identity)}</Client>`,
    "  </Dial>",
    `  <Redirect method="POST">${escapeXml(input.voicemailWebhookUrl)}</Redirect>`,
    "</Response>"
  ].join("");
}

export function buildTwilioRecordVoicemailTwiml(input: {
  greeting?: string | null;
  voicemailWebhookUrl: string;
}): string {
  const greeting =
    input.greeting?.trim() ||
    "The person you called is unavailable. Please leave a voicemail after the tone.";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Say>${escapeXml(greeting)}</Say>`,
    `  <Record action="${escapeXml(
      input.voicemailWebhookUrl
    )}" maxLength="120" method="POST" playBeep="true" timeout="5" />`,
    "</Response>"
  ].join("");
}

export function buildTwilioSayTwiml(message: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Say>${escapeXml(message)}</Say>`,
    "</Response>"
  ].join("");
}

export function normalizeUsDialTarget(value: string | undefined): string | null {
  return normalizeUsPhoneNumber(value);
}

export function isEmergencyDestination(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return EMERGENCY_DESTINATIONS.has(value.replace(/\D/g, ""));
}

export function parseTwilioClientIdentity(
  value: string | undefined
): TwilioClientIdentity | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const raw = trimmed.startsWith("client:") ? trimmed.slice("client:".length) : trimmed;
  const [userId, phoneNumberId] = raw.split(":");

  if (!userId || !phoneNumberId || raw.split(":").length !== 2) {
    return null;
  }

  return {
    phoneNumberId,
    raw,
    userId
  };
}

export function requireUsE164Number(
  value: string | undefined
): string | null {
  return normalizeUsPhoneNumber(value);
}
