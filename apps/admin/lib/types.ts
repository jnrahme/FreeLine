export interface AdminUserSummary {
  activeNumber: string | null;
  assignedAt: string | null;
  createdAt: string;
  displayName: string | null;
  email: string;
  id: string;
  status: "active" | "suspended" | "deleted";
  trustScore: number;
  updatedAt: string;
}

export interface AdminUserDevice {
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

export interface AdminAssignedNumber {
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
  status: "assigned" | "available" | "quarantined";
}

export interface MessageAllowance {
  dailyCap: number;
  dailyRemaining: number;
  dailyUsed: number;
  monthlyCap: number;
  monthlyRemaining: number;
  monthlyUsed: number;
  tier: string;
  trustScore: number;
}

export interface CallAllowance {
  dailyCapMinutes: number;
  dailyRemainingMinutes: number;
  dailyUsedMinutes: number;
  monthlyCapMinutes: number;
  monthlyRemainingMinutes: number;
  monthlyUsedMinutes: number;
  tier: string;
  trustScore: number;
}

export interface AdminAbuseQueueItem {
  activeNumber: string | null;
  createdAt: string;
  details: Record<string, unknown>;
  eventType: string;
  id: string;
  reviewAction: "dismissed" | "confirmed" | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  userEmail: string;
  userId: string;
  userStatus: "active" | "suspended" | "deleted";
  userTrustScore: number;
}

export interface AdminUserDetail extends AdminUserSummary {
  abuseEvents: AdminAbuseQueueItem[];
  assignedNumber: AdminAssignedNumber | null;
  devices: AdminUserDevice[];
  totalCallMinutesThisMonth: number;
  totalTextEventsThisMonth: number;
  usage: {
    callAllowance: CallAllowance;
    messageAllowance: MessageAllowance;
  };
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
  quarantineStatus: "available" | "quarantined" | "restored" | null;
  quarantinedAt: string | null;
  region: string;
  releaseReason: string | null;
  releasedAt: string | null;
  status: "assigned" | "available" | "quarantined";
  userEmail: string | null;
  userId: string | null;
  warningTypes: string[];
}

export interface AdminCostTrendPoint {
  activeNumbers: number;
  callMinutes: number;
  date: string;
  estimatedSpendUsd: number;
  textEvents: number;
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
