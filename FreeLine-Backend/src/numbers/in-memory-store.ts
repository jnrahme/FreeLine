import { AppError } from "../auth/errors.js";
import { createId } from "../auth/crypto.js";
import { env } from "../config/env.js";
import type {
  AssignedNumberRecord,
  AssignNumberInput,
  NumberQuarantineRecord,
  NumberStatus,
  NumberStore,
  NumberWarningRecord,
  ReleaseNumberInput
} from "./types.js";

interface InMemoryPhoneNumberRecord {
  areaCode: string;
  externalId: string;
  locality: string;
  nationalFormat: string;
  phoneNumber: string;
  phoneNumberId: string;
  provider: AssignedNumberRecord["provider"];
  quarantineUntil: string | null;
  region: string;
  status: NumberStatus;
}

interface InMemoryAssignmentRecord {
  activationDeadline: string;
  assignedAt: string;
  assignmentId: string;
  lastActivityAt: string | null;
  phoneNumberId: string;
  releaseReason: AssignedNumberRecord["releaseReason"];
  releasedAt: string | null;
  userId: string;
}

export class InMemoryNumberStore implements NumberStore {
  private readonly activationWindowMs =
    env.NUMBER_ACTIVATION_WINDOW_HOURS * 60 * 60_000;
  private readonly assignments = new Map<string, InMemoryAssignmentRecord>();
  private readonly phoneNumbersById = new Map<string, InMemoryPhoneNumberRecord>();
  private readonly phoneNumbersByPhone = new Map<string, InMemoryPhoneNumberRecord>();
  private readonly quarantines = new Map<string, NumberQuarantineRecord>();
  private readonly warnings = new Map<string, NumberWarningRecord>();

  async assignNumber(input: AssignNumberInput): Promise<AssignedNumberRecord> {
    const existingUserNumber = this.findActiveAssignmentByUser(input.userId);
    if (existingUserNumber) {
      throw new AppError(
        409,
        "number_already_assigned",
        "This user already has an active number."
      );
    }

    const existingPhone = this.phoneNumbersByPhone.get(input.phoneNumber);
    if (existingPhone && (existingPhone.status === "assigned" || existingPhone.status === "quarantined")) {
      throw new AppError(
        409,
        "number_not_available",
        "That number is no longer available."
      );
    }

    const phoneNumberRecord: InMemoryPhoneNumberRecord = existingPhone
      ? {
          ...existingPhone,
          areaCode: input.areaCode,
          externalId: input.provisionedNumber.externalId,
          locality: input.locality,
          nationalFormat: input.nationalFormat,
          provider: input.provisionedNumber.provider,
          quarantineUntil: null,
          region: input.region,
          status: "assigned"
        }
      : {
          areaCode: input.areaCode,
          externalId: input.provisionedNumber.externalId,
          locality: input.locality,
          nationalFormat: input.nationalFormat,
          phoneNumber: input.phoneNumber,
          phoneNumberId: createId(),
          provider: input.provisionedNumber.provider,
          quarantineUntil: null,
          region: input.region,
          status: "assigned"
        };

    const assignment: InMemoryAssignmentRecord = {
      activationDeadline: new Date(Date.now() + this.activationWindowMs).toISOString(),
      assignedAt: new Date().toISOString(),
      assignmentId: createId(),
      lastActivityAt: null,
      phoneNumberId: phoneNumberRecord.phoneNumberId,
      releaseReason: null,
      releasedAt: null,
      userId: input.userId
    };

    this.phoneNumbersById.set(phoneNumberRecord.phoneNumberId, phoneNumberRecord);
    this.phoneNumbersByPhone.set(phoneNumberRecord.phoneNumber, phoneNumberRecord);
    this.assignments.set(assignment.assignmentId, assignment);

    return this.mapAssignment(assignment, phoneNumberRecord);
  }

  async findCurrentNumberByUser(userId: string): Promise<AssignedNumberRecord | null> {
    const activeAssignment = this.findActiveAssignmentByUser(userId);
    if (!activeAssignment) {
      return null;
    }

    const phoneNumber = this.phoneNumbersById.get(activeAssignment.phoneNumberId);
    return phoneNumber ? this.mapAssignment(activeAssignment, phoneNumber) : null;
  }

  async findCurrentNumberByPhoneNumber(
    phoneNumber: string
  ): Promise<AssignedNumberRecord | null> {
    const phone = this.phoneNumbersByPhone.get(phoneNumber);
    if (!phone || phone.status !== "assigned") {
      return null;
    }

    const activeAssignment = this.findActiveAssignmentByPhoneNumberId(phone.phoneNumberId);
    return activeAssignment ? this.mapAssignment(activeAssignment, phone) : null;
  }

  async findQuarantineByPhoneNumber(
    phoneNumber: string
  ): Promise<NumberQuarantineRecord | null> {
    const activeQuarantine = Array.from(this.quarantines.values())
      .filter((record) => record.phoneNumber === phoneNumber)
      .sort((left, right) => right.reclaimedAt.localeCompare(left.reclaimedAt))[0];

    return activeQuarantine ?? null;
  }

  async findUnavailablePhoneNumbers(phoneNumbers: string[]): Promise<string[]> {
    const requested = new Set(phoneNumbers);
    return Array.from(this.phoneNumbersByPhone.values())
      .filter(
        (phoneNumber) =>
          requested.has(phoneNumber.phoneNumber) &&
          (phoneNumber.status === "assigned" || phoneNumber.status === "quarantined")
      )
      .map((phoneNumber) => phoneNumber.phoneNumber);
  }

  async listActiveAssignments(): Promise<AssignedNumberRecord[]> {
    return Array.from(this.assignments.values())
      .filter((assignment) => assignment.releasedAt === null)
      .map((assignment) => {
        const phoneNumber = this.phoneNumbersById.get(assignment.phoneNumberId);
        return phoneNumber ? this.mapAssignment(assignment, phoneNumber) : null;
      })
      .filter((assignment): assignment is AssignedNumberRecord => assignment !== null)
      .sort((left, right) => left.assignedAt.localeCompare(right.assignedAt));
  }

  async listQuarantinesReadyForAvailability(
    now: string
  ): Promise<NumberQuarantineRecord[]> {
    return Array.from(this.quarantines.values())
      .filter(
        (record) => record.status === "quarantined" && record.availableAt <= now
      )
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt));
  }

  async listWarningsForAssignment(input: {
    activityAnchorAt: string;
    assignmentId: string;
  }): Promise<NumberWarningRecord[]> {
    return Array.from(this.warnings.values())
      .filter(
        (warning) =>
          warning.assignmentId === input.assignmentId &&
          warning.activityAnchorAt === input.activityAnchorAt
      )
      .sort((left, right) => left.warnedAt.localeCompare(right.warnedAt));
  }

  async makeQuarantinedNumberAvailable(input: {
    phoneNumberId: string;
    releasedToInventoryAt: string;
  }): Promise<NumberQuarantineRecord | null> {
    const quarantine = Array.from(this.quarantines.values())
      .filter(
        (record) =>
          record.phoneNumberId === input.phoneNumberId && record.status === "quarantined"
      )
      .sort((left, right) => right.reclaimedAt.localeCompare(left.reclaimedAt))[0];

    if (!quarantine) {
      return null;
    }

    const phoneNumber = this.phoneNumbersById.get(input.phoneNumberId);
    if (phoneNumber) {
      const nextPhone = {
        ...phoneNumber,
        quarantineUntil: null,
        status: "available" as const
      };
      this.phoneNumbersById.set(nextPhone.phoneNumberId, nextPhone);
      this.phoneNumbersByPhone.set(nextPhone.phoneNumber, nextPhone);
    }

    const nextQuarantine: NumberQuarantineRecord = {
      ...quarantine,
      releasedToInventoryAt: input.releasedToInventoryAt,
      status: "available"
    };
    this.quarantines.set(nextQuarantine.id, nextQuarantine);
    return nextQuarantine;
  }

  async recordActivity(input: { occurredAt?: string; userId: string }): Promise<void> {
    const activeAssignment = this.findActiveAssignmentByUser(input.userId);
    if (!activeAssignment) {
      return;
    }

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const nextAssignment: InMemoryAssignmentRecord = {
      ...activeAssignment,
      lastActivityAt:
        activeAssignment.lastActivityAt && activeAssignment.lastActivityAt > occurredAt
          ? activeAssignment.lastActivityAt
          : occurredAt
    };
    this.assignments.set(nextAssignment.assignmentId, nextAssignment);
  }

  async recordWarning(input: {
    activityAnchorAt: string;
    assignmentId: string;
    warnedAt: string;
    warningType: "day_10" | "day_13";
  }): Promise<NumberWarningRecord> {
    const record: NumberWarningRecord = {
      activityAnchorAt: input.activityAnchorAt,
      assignmentId: input.assignmentId,
      id: createId(),
      warnedAt: input.warnedAt,
      warningType: input.warningType
    };

    this.warnings.set(record.id, record);
    return record;
  }

  async releaseCurrentNumber(
    input: ReleaseNumberInput
  ): Promise<AssignedNumberRecord | null> {
    const current = this.findActiveAssignmentByUser(input.userId);
    if (!current) {
      return null;
    }

    return this.moveAssignmentToQuarantine({
      assignmentId: current.assignmentId,
      quarantineUntil: input.quarantineUntil,
      releaseReason: input.releaseReason,
      releasedAt: new Date().toISOString()
    });
  }

  async releaseInactiveNumber(input: {
    assignmentId: string;
    quarantineUntil: string;
    releaseReason: "inactivity";
    releasedAt: string;
  }): Promise<AssignedNumberRecord | null> {
    return this.moveAssignmentToQuarantine(input);
  }

  async releaseUnactivatedNumber(input: {
    assignmentId: string;
    releaseReason: "not_activated";
    releasedAt: string;
  }): Promise<AssignedNumberRecord | null> {
    const assignment = this.assignments.get(input.assignmentId);
    if (!assignment || assignment.releasedAt !== null) {
      return null;
    }

    const phoneNumber = this.phoneNumbersById.get(assignment.phoneNumberId);
    if (!phoneNumber) {
      return null;
    }

    const nextAssignment: InMemoryAssignmentRecord = {
      ...assignment,
      releaseReason: input.releaseReason,
      releasedAt: input.releasedAt
    };
    const nextPhoneNumber: InMemoryPhoneNumberRecord = {
      ...phoneNumber,
      quarantineUntil: null,
      status: "available"
    };

    this.assignments.set(nextAssignment.assignmentId, nextAssignment);
    this.phoneNumbersById.set(nextPhoneNumber.phoneNumberId, nextPhoneNumber);
    this.phoneNumbersByPhone.set(nextPhoneNumber.phoneNumber, nextPhoneNumber);

    return this.mapAssignment(nextAssignment, nextPhoneNumber);
  }

  async restoreQuarantinedNumber(input: {
    phoneNumber: string;
    restoredAt: string;
    userId: string;
  }): Promise<AssignedNumberRecord | null> {
    if (this.findActiveAssignmentByUser(input.userId)) {
      throw new AppError(
        409,
        "number_already_assigned",
        "This user already has an active number."
      );
    }

    const phoneNumber = this.phoneNumbersByPhone.get(input.phoneNumber);
    if (!phoneNumber || phoneNumber.status !== "quarantined") {
      return null;
    }

    const quarantine = Array.from(this.quarantines.values())
      .filter(
        (record) =>
          record.phoneNumber === input.phoneNumber && record.status === "quarantined"
      )
      .sort((left, right) => right.reclaimedAt.localeCompare(left.reclaimedAt))[0];

    if (!quarantine) {
      return null;
    }

    const nextPhoneNumber: InMemoryPhoneNumberRecord = {
      ...phoneNumber,
      quarantineUntil: null,
      status: "assigned"
    };
    const nextQuarantine: NumberQuarantineRecord = {
      ...quarantine,
      restoredAt: input.restoredAt,
      restoredToUserId: input.userId,
      status: "restored"
    };
    const restoredAssignment: InMemoryAssignmentRecord = {
      activationDeadline: new Date(
        new Date(input.restoredAt).getTime() + this.activationWindowMs
      ).toISOString(),
      assignedAt: input.restoredAt,
      assignmentId: createId(),
      lastActivityAt: input.restoredAt,
      phoneNumberId: phoneNumber.phoneNumberId,
      releaseReason: null,
      releasedAt: null,
      userId: input.userId
    };

    this.phoneNumbersById.set(nextPhoneNumber.phoneNumberId, nextPhoneNumber);
    this.phoneNumbersByPhone.set(nextPhoneNumber.phoneNumber, nextPhoneNumber);
    this.quarantines.set(nextQuarantine.id, nextQuarantine);
    this.assignments.set(restoredAssignment.assignmentId, restoredAssignment);

    return this.mapAssignment(restoredAssignment, nextPhoneNumber);
  }

  debugListAssignments(): AssignedNumberRecord[] {
    return Array.from(this.assignments.values())
      .map((assignment) => {
        const phoneNumber = this.phoneNumbersById.get(assignment.phoneNumberId);
        return phoneNumber ? this.mapAssignment(assignment, phoneNumber) : null;
      })
      .filter((assignment): assignment is AssignedNumberRecord => assignment !== null)
      .sort((left, right) => left.assignedAt.localeCompare(right.assignedAt));
  }

  debugListQuarantines(): NumberQuarantineRecord[] {
    return Array.from(this.quarantines.values()).sort((left, right) =>
      left.reclaimedAt.localeCompare(right.reclaimedAt)
    );
  }

  debugListWarnings(): NumberWarningRecord[] {
    return Array.from(this.warnings.values()).sort((left, right) =>
      left.warnedAt.localeCompare(right.warnedAt)
    );
  }

  debugListPhoneNumbers(): AssignedNumberRecord[] {
    return Array.from(this.phoneNumbersById.values())
      .map((phoneNumber) => {
        const assignment = this.findActiveAssignmentByPhoneNumberId(phoneNumber.phoneNumberId);
        if (assignment) {
          return this.mapAssignment(assignment, phoneNumber);
        }

        return {
          activationDeadline: "",
          assignedAt: "",
          assignmentId: "",
          areaCode: phoneNumber.areaCode,
          externalId: phoneNumber.externalId,
          lastActivityAt: null,
          locality: phoneNumber.locality,
          nationalFormat: phoneNumber.nationalFormat,
          phoneNumber: phoneNumber.phoneNumber,
          phoneNumberId: phoneNumber.phoneNumberId,
          provider: phoneNumber.provider,
          quarantineUntil: phoneNumber.quarantineUntil,
          region: phoneNumber.region,
          releaseReason: null,
          releasedAt: null,
          status: phoneNumber.status,
          userId: ""
        } satisfies AssignedNumberRecord;
      })
      .sort((left, right) => left.phoneNumber.localeCompare(right.phoneNumber));
  }

  debugUpdateAssignment(input: {
    assignmentId: string;
    patch: Partial<
      Pick<
        AssignedNumberRecord,
        "activationDeadline" | "assignedAt" | "lastActivityAt" | "quarantineUntil"
      >
    >;
  }): AssignedNumberRecord | null {
    const assignment = this.assignments.get(input.assignmentId);
    if (!assignment) {
      return null;
    }

    const phoneNumber = this.phoneNumbersById.get(assignment.phoneNumberId);
    if (!phoneNumber) {
      return null;
    }

    const nextAssignment: InMemoryAssignmentRecord = {
      ...assignment,
      activationDeadline:
        input.patch.activationDeadline ?? assignment.activationDeadline,
      assignedAt: input.patch.assignedAt ?? assignment.assignedAt,
      lastActivityAt:
        input.patch.lastActivityAt === undefined
          ? assignment.lastActivityAt
          : input.patch.lastActivityAt
    };
    const nextPhoneNumber: InMemoryPhoneNumberRecord = {
      ...phoneNumber,
      quarantineUntil:
        input.patch.quarantineUntil === undefined
          ? phoneNumber.quarantineUntil
          : input.patch.quarantineUntil
    };

    this.assignments.set(nextAssignment.assignmentId, nextAssignment);
    this.phoneNumbersById.set(nextPhoneNumber.phoneNumberId, nextPhoneNumber);
    this.phoneNumbersByPhone.set(nextPhoneNumber.phoneNumber, nextPhoneNumber);

    return this.mapAssignment(nextAssignment, nextPhoneNumber);
  }

  private moveAssignmentToQuarantine(input: {
    assignmentId: string;
    quarantineUntil: string;
    releaseReason: "inactivity" | "user_release";
    releasedAt: string;
  }): AssignedNumberRecord | null {
    const assignment = this.assignments.get(input.assignmentId);
    if (!assignment || assignment.releasedAt !== null) {
      return null;
    }

    const phoneNumber = this.phoneNumbersById.get(assignment.phoneNumberId);
    if (!phoneNumber) {
      return null;
    }

    const nextAssignment: InMemoryAssignmentRecord = {
      ...assignment,
      releaseReason: input.releaseReason,
      releasedAt: input.releasedAt
    };
    const nextPhoneNumber: InMemoryPhoneNumberRecord = {
      ...phoneNumber,
      quarantineUntil: input.quarantineUntil,
      status: "quarantined"
    };
    const quarantine: NumberQuarantineRecord = {
      assignmentId: assignment.assignmentId,
      availableAt: input.quarantineUntil,
      id: createId(),
      phoneNumber: phoneNumber.phoneNumber,
      phoneNumberId: phoneNumber.phoneNumberId,
      reason: input.releaseReason,
      reclaimedAt: input.releasedAt,
      releasedToInventoryAt: null,
      restoredAt: null,
      restoredToUserId: null,
      status: "quarantined"
    };

    this.assignments.set(nextAssignment.assignmentId, nextAssignment);
    this.phoneNumbersById.set(nextPhoneNumber.phoneNumberId, nextPhoneNumber);
    this.phoneNumbersByPhone.set(nextPhoneNumber.phoneNumber, nextPhoneNumber);
    this.quarantines.set(quarantine.id, quarantine);

    return this.mapAssignment(nextAssignment, nextPhoneNumber);
  }

  private findActiveAssignmentByPhoneNumberId(
    phoneNumberId: string
  ): InMemoryAssignmentRecord | null {
    return (
      Array.from(this.assignments.values()).find(
        (assignment) =>
          assignment.phoneNumberId === phoneNumberId && assignment.releasedAt === null
      ) ?? null
    );
  }

  private findActiveAssignmentByUser(userId: string): InMemoryAssignmentRecord | null {
    return (
      Array.from(this.assignments.values()).find(
        (assignment) => assignment.userId === userId && assignment.releasedAt === null
      ) ?? null
    );
  }

  private mapAssignment(
    assignment: InMemoryAssignmentRecord,
    phoneNumber: InMemoryPhoneNumberRecord
  ): AssignedNumberRecord {
    return {
      activationDeadline: assignment.activationDeadline,
      assignedAt: assignment.assignedAt,
      assignmentId: assignment.assignmentId,
      areaCode: phoneNumber.areaCode,
      externalId: phoneNumber.externalId,
      lastActivityAt: assignment.lastActivityAt,
      locality: phoneNumber.locality,
      nationalFormat: phoneNumber.nationalFormat,
      phoneNumber: phoneNumber.phoneNumber,
      phoneNumberId: phoneNumber.phoneNumberId,
      provider: phoneNumber.provider,
      quarantineUntil: phoneNumber.quarantineUntil,
      region: phoneNumber.region,
      releaseReason: assignment.releaseReason,
      releasedAt: assignment.releasedAt,
      status: phoneNumber.status,
      userId: assignment.userId
    };
  }
}
