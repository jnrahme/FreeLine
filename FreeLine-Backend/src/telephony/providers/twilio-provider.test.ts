import assert from "node:assert/strict";
import test from "node:test";

import { TwilioProvider, type TwilioRestClient } from "./twilio-provider.js";

function createClientDouble() {
  const state = {
    availablePhoneNumberCalls: [] as Array<{ areaCode: number; limit: number }>,
    createCalls: [] as Array<{
      phoneNumber: string;
      smsMethod: "POST";
      smsUrl: string;
      voiceMethod: "POST";
      voiceUrl: string;
    }>,
    listCalls: [] as Array<{ limit: number; phoneNumber: string }>,
    messageCalls: [] as Array<{
      body: string;
      from: string;
      statusCallback: string;
      to: string;
    }>,
    removed: [] as string[]
  };

  const client: TwilioRestClient = {
    availablePhoneNumbers: (_countryCode: string) => ({
      local: {
        list: async (options) => {
          state.availablePhoneNumberCalls.push(options);
          return [
            {
              friendlyName: "(415) 200-0001",
              locality: "San Francisco",
              phoneNumber: "+14152000001",
              region: "CA"
            }
          ];
        }
      }
    }),
    incomingPhoneNumbers: {
      create: async (options) => {
        state.createCalls.push(options);
        return {
          phoneNumber: options.phoneNumber,
          remove: async () => true,
          sid: "PN123"
        };
      },
      list: async (options) => {
        state.listCalls.push(options);
        return [
          {
            phoneNumber: options.phoneNumber,
            remove: async () => {
              state.removed.push(options.phoneNumber);
              return true;
            },
            sid: "PN123"
          }
        ];
      }
    },
    messages: {
      create: async (options) => {
        state.messageCalls.push(options);
        return {
          sid: "SM123",
          status: "queued"
        };
      }
    }
  };

  return {
    client,
    state
  };
}

test("twilio provider returns deterministic dev numbers when live rest is disabled", async () => {
  const provider = new TwilioProvider({
    enableLiveRest: false
  });

  const numbers = await provider.searchNumbers("212");

  assert.equal(numbers.length, 10);
  assert.equal(numbers[0]?.provider, "twilio");
  assert.equal(numbers[0]?.phoneNumber, "+12125550101");
});

test("twilio provider maps available number search results when live rest is enabled", async () => {
  const { client, state } = createClientDouble();
  const provider = new TwilioProvider({
    client,
    enableLiveRest: true
  });

  const numbers = await provider.searchNumbers("415");

  assert.deepEqual(state.availablePhoneNumberCalls, [{ areaCode: 415, limit: 10 }]);
  assert.deepEqual(numbers, [
    {
      locality: "San Francisco",
      nationalFormat: "(415) 200-0001",
      phoneNumber: "+14152000001",
      provider: "twilio",
      region: "CA"
    }
  ]);
});

test("twilio provider provisions incoming numbers with inbound message and voice webhooks", async () => {
  const { client, state } = createClientDouble();
  const provider = new TwilioProvider({
    client,
    enableLiveRest: true
  });

  const provisioned = await provider.provisionNumber("+14152000001");

  assert.equal(provisioned.externalId, "PN123");
  assert.deepEqual(state.createCalls, [
    {
      phoneNumber: "+14152000001",
      smsMethod: "POST",
      smsUrl: "http://127.0.0.1:3000/v1/webhooks/twilio/messages/inbound",
      voiceMethod: "POST",
      voiceUrl: "http://127.0.0.1:3000/v1/webhooks/twilio/voice/inbound"
    }
  ]);
});

test("twilio provider releases owned incoming numbers when live rest is enabled", async () => {
  const { client, state } = createClientDouble();
  const provider = new TwilioProvider({
    client,
    enableLiveRest: true
  });

  await provider.releaseNumber("+14152000001");

  assert.deepEqual(state.listCalls, [{ limit: 1, phoneNumber: "+14152000001" }]);
  assert.deepEqual(state.removed, ["+14152000001"]);
});

test("twilio provider sends sms with a status callback when live rest is enabled", async () => {
  const { client, state } = createClientDouble();
  const provider = new TwilioProvider({
    client,
    enableLiveRest: true
  });

  const result = await provider.sendSms("+14152000001", "+14155550199", "Hello from Twilio");

  assert.deepEqual(state.messageCalls, [
    {
      body: "Hello from Twilio",
      from: "+14152000001",
      statusCallback: "http://127.0.0.1:3000/v1/webhooks/twilio/messages/status",
      to: "+14155550199"
    }
  ]);
  assert.deepEqual(result, {
    externalId: "SM123",
    status: "queued"
  });
});
