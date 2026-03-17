import type { UserStatus } from "../auth/types.js";
import type { AbuseEventType, CallAllowanceSnapshot, MessageAllowanceSnapshot } from "../abuse/types.js";
import type { NumberQuarantineStatus, NumberStatus, NumberWarningType } from "../numbers/types.js";

export type AdminAbuseReviewAction = "dismissed" | "confirmed";

export interface AdminManagedUserSummary {
  activeNumber: string | null;
  assignedAt: string | null;
  createdAt: string;
  displayName: string | null;
  email: string;
  id: string;
  status: UserStatus;
  trustScore: number;
  updatedAt: string;
}

export interface AdminManagedUserDeviceRecord {
  adminOverrideAt: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string | null;
  deviceId: string | null;
  fingerprint: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  platform: "ios" | "android" | null;
  pushToken: string | null;
  updatedAt: string | null;
}

export interface AdminManagedAssignedNumberRecord {
  activationDeadline: string;
  areaCode: string;
  assignedAt: string;
  assignmentId: string;
  lastActivityAt: string | null;
  locality: string;
  nationalFormat: string;
  phoneNumber: string;
  phoneNumberId: string;
  provider: "bandwidth" | "twilio" | "stub";
  region: string;
  status: NumberStatus;
}

export interface AdminAbuseQueueItem {
  activeNumber: string | null;
  createdAt: string;
  details: Record<string, unknown>;
  eventType: AbuseEventType;
  id: string;
  reviewAction: AdminAbuseReviewAction | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  userEmail: string;
  userId: string;
  userStatus: UserStatus;
  userTrustScore: number;
}

export interface AdminManagedUserDetailSeed extends AdminManagedUserSummary {
  abuseEvents: AdminAbuseQueueItem[];
  assignedNumber: AdminManagedAssignedNumberRecord | null;
  devices: AdminManagedUserDeviceRecord[];
  totalCallMinutesThisMonth: number;
  totalTextEventsThisMonth: number;
}

export interface AdminManagedUserUsage {
  callAllowance: CallAllowanceSnapshot;
  messageAllowance: MessageAllowanceSnapshot;
}

export interface AdminManagedUserDetail extends AdminManagedUserDetailSeed {
  usage: AdminManagedUserUsage;
}

export interface AdminNumberInventoryItem {
  areaCode: string;
  assignedAt: string | null;
  locality: string;
  phoneNumber: string;
  phoneNumberId: string;
  provider: "bandwidth" | "twilio" | "stub";
  quarantineAvailableAt: string | null;
  quarantineReason: string | null;
  quarantineStatus: NumberQuarantineStatus | null;
  quarantinedAt: string | null;
  region: string;
  releaseReason: string | null;
  releasedAt: string | null;
  status: NumberStatus;
  userEmail: string | null;
  userId: string | null;
  warningTypes: NumberWarningType[];
}

export interface AdminCostTrendSeedPoint {
  activeNumbers: number;
  callMinutes: number;
  date: string;
  textEvents: number;
}

export interface AdminCostDashboardSeed {
  activeNumbers: number;
  activeUsers: number;
  callMinutesThisMonth: number;
  textEventsThisMonth: number;
  trend: AdminCostTrendSeedPoint[];
}

export interface AdminCostTrendPoint extends AdminCostTrendSeedPoint {
  estimatedSpendUsd: number;
}

export interface AdminCostDashboard {
  activeNumbers: number;
  activeUsers: number;
  alertThresholdUsd: number;
  callMinutesThisMonth: number;
  costPerActiveUserUsd: number;
  isAlertTriggered: boolean;
  numberCostUsd: number;
  smsCostUsd: number;
  textEventsThisMonth: number;
  totalEstimatedSpendUsd: number;
  trend: AdminCostTrendPoint[];
  voiceCostUsd: number;
}

export interface AdminSystemStatus {
  a2p10dlcRegistered: boolean;
  betaMode: boolean;
  stopHelpAutoreplyEnabled: boolean;
  telephonyProvider: "bandwidth" | "twilio" | "stub";
  webhookSignatureVerificationEnabled: boolean;
}

export interface AdminOpsStore {
  findAbuseQueueItem(abuseEventId: string): Promise<AdminAbuseQueueItem | null>;
  findUserDetail(userId: string): Promise<AdminManagedUserDetailSeed | null>;
  getCostDashboardSeed(): Promise<AdminCostDashboardSeed>;
  listAbuseQueue(input: {
    limit: number;
    status: "all" | "open";
  }): Promise<AdminAbuseQueueItem[]>;
  listNumberInventory(input: {
    status?: NumberStatus | null;
  }): Promise<AdminNumberInventoryItem[]>;
  reviewAbuseEvent(input: {
    abuseEventId: string;
    action: AdminAbuseReviewAction;
    adminUserId: string;
  }): Promise<AdminAbuseQueueItem | null>;
  searchUsers(input: {
    limit: number;
    query: string;
  }): Promise<AdminManagedUserSummary[]>;
}
