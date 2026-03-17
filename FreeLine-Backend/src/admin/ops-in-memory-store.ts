import type { UserRecord } from "../auth/types.js";
import { InMemoryAuthStore } from "../auth/in-memory-store.js";
import { InMemoryAbuseStore } from "../abuse/in-memory-store.js";
import { InMemoryCallStore } from "../calls/in-memory-store.js";
import { InMemoryMessageStore } from "../messages/in-memory-store.js";
import type { NumberWarningType } from "../numbers/types.js";
import { InMemoryNumberStore } from "../numbers/in-memory-store.js";
import type {
  AdminAbuseQueueItem,
  AdminCostDashboardSeed,
  AdminCostTrendSeedPoint,
  AdminManagedAssignedNumberRecord,
  AdminManagedUserDetailSeed,
  AdminManagedUserDeviceRecord,
  AdminManagedUserSummary,
  AdminNumberInventoryItem,
  AdminOpsStore
} from "./ops-types.js";

function normalizePhoneQuery(query: string): string | null {
  const digits = query.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toAssignedNumberRecord(
  assignment: ReturnType<InMemoryNumberStore["debugListAssignments"]>[number] | null
): AdminManagedAssignedNumberRecord | null {
  if (!assignment || assignment.releasedAt !== null) {
    return null;
  }

  return {
    activationDeadline: assignment.activationDeadline,
    areaCode: assignment.areaCode,
    assignedAt: assignment.assignedAt,
    assignmentId: assignment.assignmentId,
    lastActivityAt: assignment.lastActivityAt,
    locality: assignment.locality,
    nationalFormat: assignment.nationalFormat,
    phoneNumber: assignment.phoneNumber,
    phoneNumberId: assignment.phoneNumberId,
    provider: assignment.provider,
    region: assignment.region,
    status: assignment.status
  };
}

export class InMemoryAdminOpsStore implements AdminOpsStore {
  private readonly abuseReviews = new Map<
    string,
    {
      action: AdminAbuseQueueItem["reviewAction"];
      adminUserId: string;
      reviewedAt: string;
    }
  >();

  constructor(
    private readonly authStore: InMemoryAuthStore,
    private readonly abuseStore: InMemoryAbuseStore,
    private readonly messageStore: InMemoryMessageStore,
    private readonly callStore: InMemoryCallStore,
    private readonly numberStore: InMemoryNumberStore
  ) {}

  async searchUsers(input: {
    limit: number;
    query: string;
  }): Promise<AdminManagedUserSummary[]> {
    const trimmedQuery = input.query.trim().toLowerCase();
    const exactPhone = normalizePhoneQuery(input.query);
    const activeNumbers = new Map(
      this.numberStore
        .debugListAssignments()
        .filter((assignment) => assignment.releasedAt === null)
        .map((assignment) => [assignment.userId, assignment])
    );

    return this.authStore
      .debugListUsers()
      .filter((user) => {
        if (!trimmedQuery) {
          return true;
        }

        return (
          user.email.includes(trimmedQuery) ||
          user.id === input.query.trim() ||
          activeNumbers.get(user.id)?.phoneNumber === exactPhone
        );
      })
      .slice(0, input.limit)
      .map((user) => {
        const activeNumber = activeNumbers.get(user.id);
        return {
          activeNumber: activeNumber?.phoneNumber ?? null,
          assignedAt: activeNumber?.assignedAt ?? null,
          createdAt: user.createdAt,
          displayName: user.displayName,
          email: user.email,
          id: user.id,
          status: user.status,
          trustScore: user.trustScore,
          updatedAt: user.updatedAt
        };
      });
  }

  async findUserDetail(userId: string): Promise<AdminManagedUserDetailSeed | null> {
    const user = await this.authStore.findUserById(userId);
    if (!user) {
      return null;
    }

    const devicesByFingerprint = new Map<string, AdminManagedUserDeviceRecord>();
    for (const device of this.authStore.debugListDevices().filter((item) => item.userId === userId)) {
      devicesByFingerprint.set(device.fingerprint, {
        adminOverrideAt: null,
        blockedAt: null,
        blockedReason: null,
        createdAt: device.createdAt,
        deviceId: device.id,
        fingerprint: device.fingerprint,
        firstSeenAt: null,
        lastSeenAt: null,
        platform: device.platform,
        pushToken: device.pushToken,
        updatedAt: device.updatedAt
      });
    }

    for (const record of this.abuseStore.listDeviceAccounts().filter((item) => item.userId === userId)) {
      const existing = devicesByFingerprint.get(record.fingerprint);
      devicesByFingerprint.set(record.fingerprint, {
        adminOverrideAt: record.adminOverrideAt,
        blockedAt: record.blockedAt,
        blockedReason: record.blockedReason,
        createdAt: existing?.createdAt ?? null,
        deviceId: existing?.deviceId ?? null,
        fingerprint: record.fingerprint,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        platform: existing?.platform ?? record.platform,
        pushToken: existing?.pushToken ?? null,
        updatedAt: existing?.updatedAt ?? null
      });
    }

    const assignments = this.numberStore.debugListAssignments();
    const activeAssignment = assignments.find(
      (assignment) => assignment.userId === userId && assignment.releasedAt === null
    ) ?? null;

    const conversations = new Map(
      this.messageStore.debugListConversations().map((conversation) => [conversation.id, conversation])
    );
    const now = new Date();
    const currentMonth = monthStart(now);
    const totalTextEventsThisMonth = this.messageStore
      .debugListMessages()
      .filter((message) => {
        const conversation = conversations.get(message.conversationId);
        return (
          conversation?.userId === userId &&
          new Date(message.createdAt).getTime() >= currentMonth.getTime()
        );
      }).length;

    const totalCallMinutesThisMonth = Math.ceil(
      this.callStore
        .debugListCalls()
        .filter((call) => {
          const usageAnchor = new Date(call.endedAt ?? call.startedAt ?? call.createdAt);
          return call.userId === userId && usageAnchor.getTime() >= currentMonth.getTime();
        })
        .reduce((total, call) => total + call.durationSeconds, 0) / 60
    );

    return {
      activeNumber: activeAssignment?.phoneNumber ?? null,
      assignedAt: activeAssignment?.assignedAt ?? null,
      abuseEvents: this.abuseStore
        .listEventsForUser(userId)
        .filter((event) => event.eventType !== "activity")
        .slice()
        .reverse()
        .map((event) => this.toAbuseQueueItem(event.id, user)),
      assignedNumber: toAssignedNumberRecord(activeAssignment),
      createdAt: user.createdAt,
      devices: Array.from(devicesByFingerprint.values()).sort((left, right) =>
        (right.lastSeenAt ?? right.updatedAt ?? right.createdAt ?? "").localeCompare(
          left.lastSeenAt ?? left.updatedAt ?? left.createdAt ?? ""
        )
      ),
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      status: user.status,
      totalCallMinutesThisMonth: Number.isFinite(totalCallMinutesThisMonth)
        ? totalCallMinutesThisMonth
        : 0,
      totalTextEventsThisMonth,
      trustScore: user.trustScore,
      updatedAt: user.updatedAt
    };
  }

  async findAbuseQueueItem(abuseEventId: string): Promise<AdminAbuseQueueItem | null> {
    for (const user of this.authStore.debugListUsers()) {
      const event = this.abuseStore
        .listEventsForUser(user.id)
        .find((candidate) => candidate.id === abuseEventId && candidate.eventType !== "activity");

      if (event) {
        return this.toAbuseQueueItem(event.id, user);
      }
    }

    return null;
  }

  async listAbuseQueue(input: {
    limit: number;
    status: "all" | "open";
  }): Promise<AdminAbuseQueueItem[]> {
    const usersById = new Map(this.authStore.debugListUsers().map((user) => [user.id, user]));
    const queue = this.authStore
      .debugListUsers()
      .flatMap((user) =>
        this.abuseStore
          .listEventsForUser(user.id)
          .filter((event) => event.eventType !== "activity")
          .map((event) => this.toAbuseQueueItem(event.id, user))
      )
      .filter((item) => (input.status === "open" ? item.reviewAction === null : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit);

    return queue.map((item) => {
      const latestUser = usersById.get(item.userId);
      return latestUser ? this.toAbuseQueueItem(item.id, latestUser) : item;
    });
  }

  async reviewAbuseEvent(input: {
    abuseEventId: string;
    action: "dismissed" | "confirmed";
    adminUserId: string;
  }): Promise<AdminAbuseQueueItem | null> {
    this.abuseReviews.set(input.abuseEventId, {
      action: input.action,
      adminUserId: input.adminUserId,
      reviewedAt: new Date().toISOString()
    });

    return this.findAbuseQueueItem(input.abuseEventId);
  }

  async listNumberInventory(input: {
    status?: "assigned" | "available" | "quarantined" | null;
  }): Promise<AdminNumberInventoryItem[]> {
    const usersById = new Map(this.authStore.debugListUsers().map((user) => [user.id, user]));
    const latestAssignmentByPhoneId = new Map(
      this.numberStore
        .debugListAssignments()
        .sort((left, right) =>
          (right.releasedAt ?? right.assignedAt).localeCompare(left.releasedAt ?? left.assignedAt)
        )
        .map((assignment) => [assignment.phoneNumberId, assignment])
    );
    const latestQuarantineByPhoneId = new Map(
      this.numberStore
        .debugListQuarantines()
        .sort((left, right) => right.reclaimedAt.localeCompare(left.reclaimedAt))
        .map((quarantine) => [quarantine.phoneNumberId, quarantine])
    );
    const warningsByAssignmentId = new Map<string, NumberWarningType[]>();
    for (const warning of this.numberStore.debugListWarnings()) {
      const list = warningsByAssignmentId.get(warning.assignmentId) ?? [];
      if (!list.includes(warning.warningType)) {
        list.push(warning.warningType);
      }
      warningsByAssignmentId.set(warning.assignmentId, list);
    }

    return this.numberStore
      .debugListPhoneNumbers()
      .filter((record) => (input.status ? record.status === input.status : true))
      .map((record) => {
        const latestAssignment = latestAssignmentByPhoneId.get(record.phoneNumberId) ?? null;
        const latestQuarantine = latestQuarantineByPhoneId.get(record.phoneNumberId) ?? null;
        const latestUser =
          latestAssignment?.userId ? usersById.get(latestAssignment.userId) ?? null : null;

        return {
          areaCode: record.areaCode,
          assignedAt: latestAssignment?.assignedAt ?? null,
          locality: record.locality,
          phoneNumber: record.phoneNumber,
          phoneNumberId: record.phoneNumberId,
          provider: record.provider,
          quarantineAvailableAt: latestQuarantine?.availableAt ?? null,
          quarantineReason: latestQuarantine?.reason ?? null,
          quarantineStatus: latestQuarantine?.status ?? null,
          quarantinedAt: latestQuarantine?.reclaimedAt ?? null,
          region: record.region,
          releaseReason: latestAssignment?.releaseReason ?? null,
          releasedAt: latestAssignment?.releasedAt ?? null,
          status: record.status,
          userEmail: latestUser?.email ?? null,
          userId: latestUser?.id ?? null,
          warningTypes: latestAssignment
            ? (warningsByAssignmentId.get(latestAssignment.assignmentId) ?? [])
            : []
        } satisfies AdminNumberInventoryItem;
      })
      .sort((left, right) => left.phoneNumber.localeCompare(right.phoneNumber));
  }

  async getCostDashboardSeed(): Promise<AdminCostDashboardSeed> {
    const now = dayStart(new Date());
    const currentMonth = monthStart(now);
    const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const activeAssignments = this.numberStore
      .debugListAssignments()
      .filter((assignment) => assignment.releasedAt === null);

    const conversationById = new Map(
      this.messageStore.debugListConversations().map((conversation) => [conversation.id, conversation])
    );
    const messages = this.messageStore.debugListMessages();
    const calls = this.callStore.debugListCalls();

    const trend: AdminCostTrendSeedPoint[] = [];
    for (let index = 0; index < 30; index += 1) {
      const day = new Date(thirtyDaysAgo.getTime() + index * 24 * 60 * 60 * 1000);
      const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      const dayLabel = day.toISOString().slice(0, 10);
      const textEvents = messages.filter((message) => {
        const createdAt = new Date(message.createdAt);
        return createdAt >= day && createdAt < nextDay;
      }).length;
      const callMinutes = Math.ceil(
        calls
          .filter((call) => {
            const usageAnchor = new Date(call.endedAt ?? call.startedAt ?? call.createdAt);
            return usageAnchor >= day && usageAnchor < nextDay;
          })
          .reduce((total, call) => total + call.durationSeconds, 0) / 60
      );
      const activeNumbers = this.numberStore
        .debugListAssignments()
        .filter((assignment) => {
          const assignedAt = new Date(assignment.assignedAt);
          const releasedAt = assignment.releasedAt ? new Date(assignment.releasedAt) : null;
          return assignedAt < nextDay && (!releasedAt || releasedAt >= day);
        }).length;

      trend.push({
        activeNumbers,
        callMinutes: Number.isFinite(callMinutes) ? callMinutes : 0,
        date: dayLabel,
        textEvents
      });
    }

    const callMinutesThisMonth = Math.ceil(
      calls
        .filter((call) => {
          const usageAnchor = new Date(call.endedAt ?? call.startedAt ?? call.createdAt);
          return usageAnchor >= currentMonth;
        })
        .reduce((total, call) => total + call.durationSeconds, 0) / 60
    );

    return {
      activeNumbers: activeAssignments.length,
      activeUsers: new Set(activeAssignments.map((assignment) => assignment.userId)).size,
      callMinutesThisMonth: Number.isFinite(callMinutesThisMonth) ? callMinutesThisMonth : 0,
      textEventsThisMonth: messages.filter((message) => {
        const conversation = conversationById.get(message.conversationId);
        return Boolean(conversation) && new Date(message.createdAt) >= currentMonth;
      }).length,
      trend
    };
  }

  private toAbuseQueueItem(eventId: string, user: UserRecord): AdminAbuseQueueItem {
    const event = this.abuseStore
      .listEventsForUser(user.id)
      .find((candidate) => candidate.id === eventId);

    if (!event) {
      throw new Error(`Abuse event ${eventId} was not found.`);
    }

    const review = this.abuseReviews.get(eventId);
    const activeNumber = this.numberStore
      .debugListAssignments()
      .find((assignment) => assignment.userId === user.id && assignment.releasedAt === null);

    return {
      activeNumber: activeNumber?.phoneNumber ?? null,
      createdAt: event.createdAt,
      details: event.details,
      eventType: event.eventType,
      id: event.id,
      reviewAction: review?.action ?? null,
      reviewedAt: review?.reviewedAt ?? null,
      reviewedByAdminId: review?.adminUserId ?? null,
      userEmail: user.email,
      userId: user.id,
      userStatus: user.status,
      userTrustScore: user.trustScore
    };
  }
}
