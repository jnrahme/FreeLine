import test from "node:test";
import assert from "node:assert/strict";

import type { PushNotifier } from "../notifications/types.js";
import type { TelephonyProvider } from "../telephony/telephony-provider.js";
import { InMemoryNumberStore } from "./in-memory-store.js";
import { NumberLifecycleService } from "./lifecycle-service.js";

class FakeTelephonyProvider implements TelephonyProvider {
  readonly releasedNumbers: string[] = [];

  async createVoiceToken(): Promise<string> {
    return "token";
  }

  async provisionNumber(phoneNumber: string) {
    return {
      externalId: `ext-${phoneNumber}`,
      phoneNumber,
      provider: "bandwidth" as const
    };
  }

  async releaseNumber(phoneNumber: string): Promise<void> {
    this.releasedNumbers.push(phoneNumber);
  }

  async searchNumbers(): Promise<
    Array<{
      locality: string;
      nationalFormat: string;
      phoneNumber: string;
      provider: "bandwidth";
      region: string;
    }>
  > {
    return [];
  }

  async sendSms() {
    return {
      externalId: "sms-id",
      status: "queued" as const
    };
  }

  verifySmsStatusSignature(): boolean {
    return true;
  }
}

class FakePushNotifier implements PushNotifier {
  readonly lifecycleEvents: Array<{
    message: string;
    phoneNumber: string;
    type:
      | "number:activation_released"
      | "number:warning_day_10"
      | "number:warning_day_13"
      | "number:reclaimed"
      | "number:restored";
    userId: string;
  }> = [];

  async sendInboundCall(): Promise<void> {
    return;
  }

  async sendInboundMessage(): Promise<void> {
    return;
  }

  async sendMissedCall(): Promise<void> {
    return;
  }

  async sendNumberLifecycle(input: {
    message: string;
    phoneNumber: string;
    type:
      | "number:activation_released"
      | "number:warning_day_10"
      | "number:warning_day_13"
      | "number:reclaimed"
      | "number:restored";
    userId: string;
  }): Promise<void> {
    this.lifecycleEvents.push(input);
  }

  async sendVoicemail(): Promise<void> {
    return;
  }
}

async function assignNumber(
  store: InMemoryNumberStore,
  input: {
    areaCode?: string;
    locality?: string;
    nationalFormat?: string;
    phoneNumber: string;
    region?: string;
    userId: string;
  }
) {
  return store.assignNumber({
    areaCode: input.areaCode ?? input.phoneNumber.slice(2, 5),
    locality: input.locality ?? "San Francisco",
    nationalFormat: input.nationalFormat ?? "(415) 555-0100",
    phoneNumber: input.phoneNumber,
    provisionedNumber: {
      externalId: `ext-${input.phoneNumber}`,
      phoneNumber: input.phoneNumber,
      provider: "bandwidth"
    },
    region: input.region ?? "CA",
    userId: input.userId
  });
}

test("activation expiry releases unactivated numbers back to available inventory", async () => {
  const store = new InMemoryNumberStore();
  const provider = new FakeTelephonyProvider();
  const notifier = new FakePushNotifier();
  const service = new NumberLifecycleService(store, provider, notifier);
  const assigned = await assignNumber(store, {
    phoneNumber: "+14155550101",
    userId: "user-activation"
  });
  const now = "2026-03-17T12:00:00.000Z";

  store.debugUpdateAssignment({
    assignmentId: assigned.assignmentId,
    patch: {
      activationDeadline: "2026-03-16T11:00:00.000Z",
      assignedAt: "2026-03-16T11:00:00.000Z"
    }
  });

  const result = await service.runActivationExpirySweep({ now });

  assert.equal(result.released.length, 1);
  assert.equal(result.released[0]?.phoneNumber, assigned.phoneNumber);
  assert.equal(result.released[0]?.status, "available");
  assert.equal(result.released[0]?.releaseReason, "not_activated");
  assert.deepEqual(provider.releasedNumbers, [assigned.phoneNumber]);
  assert.equal(notifier.lifecycleEvents[0]?.type, "number:activation_released");
  assert.equal(await store.findCurrentNumberByUser("user-activation"), null);
  assert.deepEqual(
    await store.findUnavailablePhoneNumbers([assigned.phoneNumber]),
    []
  );
});

test("activity after a warning resets inactivity timing and allows future warnings on a new anchor", async () => {
  const store = new InMemoryNumberStore();
  const provider = new FakeTelephonyProvider();
  const notifier = new FakePushNotifier();
  const service = new NumberLifecycleService(store, provider, notifier);
  const assigned = await assignNumber(store, {
    phoneNumber: "+14155550102",
    userId: "user-warning-reset"
  });
  const firstAnchor = "2026-03-01T12:00:00.000Z";
  const resetAt = "2026-03-11T12:05:00.000Z";

  store.debugUpdateAssignment({
    assignmentId: assigned.assignmentId,
    patch: {
      assignedAt: firstAnchor,
      lastActivityAt: firstAnchor
    }
  });

  const firstWarningSweep = await service.runInactivitySweep({
    now: "2026-03-11T12:00:00.000Z"
  });
  assert.equal(firstWarningSweep.warnings.length, 1);
  assert.equal(firstWarningSweep.warnings[0]?.warningType, "day_10");

  await service.recordActivity({
    occurredAt: resetAt,
    userId: "user-warning-reset"
  });

  const noWarningSweep = await service.runInactivitySweep({
    now: "2026-03-20T12:00:00.000Z"
  });
  assert.equal(noWarningSweep.warnings.length, 0);
  assert.equal(noWarningSweep.reclaimed.length, 0);

  const secondWarningSweep = await service.runInactivitySweep({
    now: "2026-03-21T12:05:00.000Z"
  });
  assert.equal(secondWarningSweep.warnings.length, 1);
  assert.equal(secondWarningSweep.warnings[0]?.warningType, "day_10");

  const warnings = store
    .debugListWarnings()
    .filter((warning) => warning.assignmentId === assigned.assignmentId);
  assert.equal(warnings.length, 2);
  assert.notEqual(warnings[0]?.activityAnchorAt, warnings[1]?.activityAnchorAt);
});

test("day-13 warning, day-14 reclaim, and admin restore keep quarantined numbers out of inventory", async () => {
  const store = new InMemoryNumberStore();
  const provider = new FakeTelephonyProvider();
  const notifier = new FakePushNotifier();
  const service = new NumberLifecycleService(store, provider, notifier);
  const assigned = await assignNumber(store, {
    phoneNumber: "+14155550103",
    userId: "user-reclaim"
  });

  store.debugUpdateAssignment({
    assignmentId: assigned.assignmentId,
    patch: {
      assignedAt: "2026-03-01T12:00:00.000Z",
      lastActivityAt: "2026-03-01T12:00:00.000Z"
    }
  });

  const day13 = await service.runInactivitySweep({
    now: "2026-03-14T12:00:00.000Z"
  });
  assert.equal(day13.warnings.length, 1);
  assert.equal(day13.warnings[0]?.warningType, "day_13");

  const day14 = await service.runInactivitySweep({
    now: "2026-03-15T12:00:00.000Z"
  });
  assert.equal(day14.reclaimed.length, 1);
  assert.equal(day14.reclaimed[0]?.status, "quarantined");
  assert.equal(day14.reclaimed[0]?.releaseReason, "inactivity");

  await assert.rejects(
    () =>
      assignNumber(store, {
        phoneNumber: assigned.phoneNumber,
        userId: "user-reclaim-other"
      }),
    /no longer available/
  );

  const quarantine = await store.findQuarantineByPhoneNumber(assigned.phoneNumber);
  assert.equal(quarantine?.status, "quarantined");
  assert.equal(quarantine?.reason, "inactivity");

  const restored = await service.restoreQuarantinedNumber({
    now: "2026-03-15T13:00:00.000Z",
    phoneNumber: assigned.phoneNumber,
    userId: "user-reclaim"
  });
  assert.equal(restored.phoneNumber, assigned.phoneNumber);
  assert.equal(restored.status, "assigned");

  const restoredQuarantine = await store.findQuarantineByPhoneNumber(assigned.phoneNumber);
  assert.equal(restoredQuarantine?.status, "restored");
  assert.equal(restoredQuarantine?.restoredToUserId, "user-reclaim");
  assert.equal(
    notifier.lifecycleEvents.at(-1)?.type,
    "number:restored"
  );
});

test("post-quarantine numbers return to available inventory and become claimable again", async () => {
  const store = new InMemoryNumberStore();
  const provider = new FakeTelephonyProvider();
  const notifier = new FakePushNotifier();
  const service = new NumberLifecycleService(store, provider, notifier);
  const assigned = await assignNumber(store, {
    phoneNumber: "+14155550104",
    userId: "user-quarantine"
  });

  store.debugUpdateAssignment({
    assignmentId: assigned.assignmentId,
    patch: {
      assignedAt: "2026-03-01T12:00:00.000Z",
      lastActivityAt: "2026-03-01T12:00:00.000Z"
    }
  });

  const reclaim = await service.runInactivitySweep({
    now: "2026-03-15T12:00:00.000Z"
  });
  assert.equal(reclaim.reclaimed.length, 1);

  const earlySweep = await service.runQuarantineAvailabilitySweep({
    now: "2026-04-20T11:59:00.000Z"
  });
  assert.equal(earlySweep.available.length, 0);

  const releaseSweep = await service.runQuarantineAvailabilitySweep({
    now: "2026-04-29T12:00:00.000Z"
  });
  assert.equal(releaseSweep.available.length, 1);
  assert.equal(releaseSweep.available[0]?.status, "available");
  assert.deepEqual(
    await store.findUnavailablePhoneNumbers([assigned.phoneNumber]),
    []
  );

  const reassigned = await assignNumber(store, {
    phoneNumber: assigned.phoneNumber,
    userId: "user-quarantine-new"
  });
  assert.equal(reassigned.phoneNumber, assigned.phoneNumber);
  assert.equal(reassigned.status, "assigned");
});
