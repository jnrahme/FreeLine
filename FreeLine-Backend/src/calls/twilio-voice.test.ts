import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTwilioClientDialTwiml,
  buildTwilioDialTwiml,
  buildTwilioRecordVoicemailTwiml,
  buildTwilioSayTwiml,
  isEmergencyDestination,
  normalizeUsDialTarget,
  parseTwilioClientIdentity,
  requireUsE164Number
} from "./twilio-voice.js";

test("parseTwilioClientIdentity extracts user and phone number ids", () => {
  assert.deepEqual(parseTwilioClientIdentity("client:user-123:number-456"), {
    phoneNumberId: "number-456",
    raw: "user-123:number-456",
    userId: "user-123"
  });
  assert.equal(parseTwilioClientIdentity("bad-identity"), null);
});

test("normalizeUsDialTarget normalizes common U.S. number formats", () => {
  assert.equal(normalizeUsDialTarget("(415) 555-0101"), "+14155550101");
  assert.equal(normalizeUsDialTarget("+1 (415) 555-0101"), "+14155550101");
  assert.equal(normalizeUsDialTarget("4165550101"), null);
  assert.equal(normalizeUsDialTarget("+17875550101"), null);
  assert.equal(normalizeUsDialTarget("555"), null);
});

test("emergency detection uses digits only", () => {
  assert.equal(isEmergencyDestination("911"), true);
  assert.equal(isEmergencyDestination("(112)"), true);
  assert.equal(isEmergencyDestination("+1 415 555 0101"), false);
});

test("requireUsE164Number only accepts normalized U.S. E.164 values", () => {
  assert.equal(requireUsE164Number("+14155550101"), "+14155550101");
  assert.equal(requireUsE164Number("4155550101"), "+14155550101");
  assert.equal(requireUsE164Number("+14165550101"), null);
  assert.equal(requireUsE164Number("+17875550101"), null);
  assert.equal(requireUsE164Number("+442071838750"), null);
});

test("buildTwilioDialTwiml includes escaped values and status callback", () => {
  const xml = buildTwilioDialTwiml({
    callerId: "+14155550101",
    statusCallbackUrl: "https://api.freeline.test/v1/webhooks/twilio/voice/status?mode=prod&v=1",
    to: "+14155550102"
  });

  assert.match(xml, /<Dial callerId="\+14155550101">/);
  assert.match(
    xml,
    /statusCallback="https:\/\/api\.freeline\.test\/v1\/webhooks\/twilio\/voice\/status\?mode=prod&amp;v=1"/
  );
  assert.match(xml, /statusCallbackEvent="initiated ringing answered completed"/);
  assert.match(xml, /<Number[^>]*>\+14155550102<\/Number>/);
});

test("buildTwilioSayTwiml escapes message content", () => {
  const xml = buildTwilioSayTwiml("Call <blocked> & needs review");
  assert.equal(
    xml,
    '<?xml version="1.0" encoding="UTF-8"?><Response>  <Say>Call &lt;blocked&gt; &amp; needs review</Say></Response>'
  );
});

test("buildTwilioClientDialTwiml routes inbound calls to a client identity then voicemail", () => {
  const xml = buildTwilioClientDialTwiml({
    callerNumber: "+14155550199",
    identity: "user-123:number-456",
    ringSeconds: 30,
    statusCallbackUrl: "https://api.freeline.test/v1/webhooks/twilio/voice/status?mode=prod&v=1",
    voicemailWebhookUrl: "https://api.freeline.test/v1/webhooks/twilio/voice/voicemail?call=1"
  });

  assert.match(xml, /<Dial answerOnBridge="true" callerId="\+14155550199" timeout="30">/);
  assert.match(xml, /<Client[^>]*>user-123:number-456<\/Client>/);
  assert.match(
    xml,
    /statusCallback="https:\/\/api\.freeline\.test\/v1\/webhooks\/twilio\/voice\/status\?mode=prod&amp;v=1"/
  );
  assert.match(
    xml,
    /<Redirect method="POST">https:\/\/api\.freeline\.test\/v1\/webhooks\/twilio\/voice\/voicemail\?call=1<\/Redirect>/
  );
});

test("buildTwilioRecordVoicemailTwiml includes greeting and record callback", () => {
  const xml = buildTwilioRecordVoicemailTwiml({
    greeting: "Leave <your> message",
    voicemailWebhookUrl: "https://api.freeline.test/v1/webhooks/twilio/voice/voicemail?call=2"
  });

  assert.match(xml, /<Say>Leave &lt;your&gt; message<\/Say>/);
  assert.match(
    xml,
    /<Record action="https:\/\/api\.freeline\.test\/v1\/webhooks\/twilio\/voice\/voicemail\?call=2" maxLength="120" method="POST" playBeep="true" timeout="5" \/>/
  );
});
