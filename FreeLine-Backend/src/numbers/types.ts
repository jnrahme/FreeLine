import type { AvailableNumber, ProvisionedNumber } from "../telephony/telephony-provider.js";

export type NumberStatus = "assigned" | "available" | "quarantined";
export type NumberReleaseReason = "inactivity" | "not_activated" | "user_release";
export type NumberWarningType = "day_10" | "day_13";
export type NumberQuarantineStatus = "available" | "quarantined" | "restored";

export interface AssignedNumberRecord {
  assignmentId: string;
  assignedAt: string;
  activationDeadline: string;
  lastActivityAt: string | null;
  areaCode: string;
  externalId: string;
  locality: string;
  nationalFormat: string;
  phoneNumber: string;
  phoneNumberId: string;
  provider: AvailableNumber["provider"];
  quarantineUntil: string | null;
  releaseReason: NumberReleaseReason | null;
  region: string;
  releasedAt: string | null;
  status: NumberStatus;
  userId: string;
}

export interface AssignNumberInput {
  areaCode: string;
  locality: string;
  nationalFormat: string;
  phoneNumber: string;
  provisionedNumber: ProvisionedNumber;
  region: string;
  userId: string;
}

export interface ReleaseNumberInput {
  quarantineUntil: string;
  releaseReason: Extract<NumberReleaseReason, "inactivity" | "user_release">;
  userId: string;
}

export interface NumberWarningRecord {
  activityAnchorAt: string;
  assignmentId: string;
  id: string;
  warnedAt: string;
  warningType: NumberWarningType;
}

export interface NumberQuarantineRecord {
  assignmentId: string;
  availableAt: string;
  id: string;
  phoneNumber: string;
  phoneNumberId: string;
  reason: NumberReleaseReason;
  reclaimedAt: string;
  releasedToInventoryAt: string | null;
  restoredAt: string | null;
  restoredToUserId: string | null;
  status: NumberQuarantineStatus;
}

export interface NumberStore {
  assignNumber(input: AssignNumberInput): Promise<AssignedNumberRecord>;
  findCurrentNumberByUser(userId: string): Promise<AssignedNumberRecord | null>;
  findCurrentNumberByPhoneNumber(phoneNumber: string): Promise<AssignedNumberRecord | null>;
  findQuarantineByPhoneNumber(phoneNumber: string): Promise<NumberQuarantineRecord | null>;
  findUnavailablePhoneNumbers(phoneNumbers: string[]): Promise<string[]>;
  listActiveAssignments(): Promise<AssignedNumberRecord[]>;
  listQuarantinesReadyForAvailability(now: string): Promise<NumberQuarantineRecord[]>;
  listWarningsForAssignment(input: {
    activityAnchorAt: string;
    assignmentId: string;
  }): Promise<NumberWarningRecord[]>;
  makeQuarantinedNumberAvailable(input: {
    phoneNumberId: string;
    releasedToInventoryAt: string;
  }): Promise<NumberQuarantineRecord | null>;
  recordActivity(input: { occurredAt?: string; userId: string }): Promise<void>;
  recordWarning(input: {
    activityAnchorAt: string;
    assignmentId: string;
    warnedAt: string;
    warningType: NumberWarningType;
  }): Promise<NumberWarningRecord>;
  releaseCurrentNumber(input: ReleaseNumberInput): Promise<AssignedNumberRecord | null>;
  releaseInactiveNumber(input: {
    assignmentId: string;
    quarantineUntil: string;
    releaseReason: Extract<NumberReleaseReason, "inactivity">;
    releasedAt: string;
  }): Promise<AssignedNumberRecord | null>;
  releaseUnactivatedNumber(input: {
    assignmentId: string;
    releaseReason: Extract<NumberReleaseReason, "not_activated">;
    releasedAt: string;
  }): Promise<AssignedNumberRecord | null>;
  restoreQuarantinedNumber(input: {
    phoneNumber: string;
    restoredAt: string;
    userId: string;
  }): Promise<AssignedNumberRecord | null>;
}
