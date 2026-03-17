export type CallDirection = "outbound" | "inbound";
export type CallStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "completed"
  | "missed"
  | "failed";

export type CallPushTokenPlatform = "ios" | "android";
export type CallPushTokenChannel = "alert" | "voip";

export interface CallRecord {
  createdAt: string;
  direction: CallDirection;
  durationSeconds: number;
  endedAt: string | null;
  id: string;
  phoneNumberId: string;
  providerCallId: string;
  remoteNumber: string;
  startedAt: string | null;
  status: CallStatus;
  updatedAt: string;
  userId: string;
}

export interface CallPushTokenRecord {
  channel: CallPushTokenChannel;
  createdAt: string;
  deviceId: string;
  id: string;
  platform: CallPushTokenPlatform;
  token: string;
  updatedAt: string;
  userId: string;
}

export interface VoicemailRecord {
  audioUrl: string;
  callerNumber: string;
  createdAt: string;
  durationSeconds: number;
  id: string;
  isRead: boolean;
  phoneNumberId: string;
  providerCallId: string;
  transcription: string | null;
  updatedAt: string;
  userId: string;
}

export interface CallAllowance {
  dailyCapMinutes: number;
  dailyRemainingMinutes: number;
  dailyUsedMinutes: number;
  monthlyCapMinutes: number;
  monthlyRemainingMinutes: number;
  monthlyUsedMinutes: number;
  monthlyBonusMinutes?: number;
  monthlyBaseCapMinutes?: number;
  rewardClaims?: {
    callMinutesGranted: number;
    maxClaims: number;
    remainingClaims: number;
    textEventsGranted: number;
    totalClaims: number;
  };
  tier?: string;
  trustScore?: number;
}

export interface CallUsageRecord {
  dailyUsedMinutes: number;
  monthlyUsedMinutes: number;
}

export interface ListCallsInput {
  limit: number;
  offset: number;
  userId: string;
}

export interface ListVoicemailsInput {
  limit: number;
  offset: number;
  userId: string;
}

export interface CallHistoryPage {
  calls: CallRecord[];
  limit: number;
  offset: number;
}

export interface VoicemailPage {
  limit: number;
  offset: number;
  voicemails: VoicemailRecord[];
}

export interface UpsertCallFromWebhookInput {
  direction: CallDirection;
  durationSeconds: number | null;
  endedAt: string | null;
  phoneNumberId: string;
  providerCallId: string;
  remoteNumber: string;
  startedAt: string | null;
  status: CallStatus;
  userId: string;
}

export interface RegisterCallPushTokenInput {
  channel: CallPushTokenChannel;
  deviceId: string;
  platform: CallPushTokenPlatform;
  token: string;
  userId: string;
}

export interface UpsertVoicemailInput {
  audioUrl: string;
  callerNumber: string;
  durationSeconds: number;
  phoneNumberId: string;
  providerCallId: string;
  transcription: string | null;
  userId: string;
}

export interface IncomingCallPlan {
  action: "ring" | "voicemail";
  call: CallRecord;
  calledNumber: string;
  callerNumber: string;
  identity: string | null;
  providerCallId: string;
  reason: "cap_reached" | "unknown_destination" | null;
  ringSeconds: number;
  tokens: CallPushTokenRecord[];
}

export interface CallStore {
  deleteVoicemail(input: { voicemailId: string; userId: string }): Promise<boolean>;
  findCallByProviderCallId(providerCallId: string): Promise<CallRecord | null>;
  findCallPushTokensByUser(input: {
    channel?: CallPushTokenChannel;
    userId: string;
  }): Promise<CallPushTokenRecord[]>;
  getMonthlyUsage(userId: string): Promise<CallUsageRecord>;
  listCallHistory(input: ListCallsInput): Promise<CallHistoryPage>;
  listVoicemails(input: ListVoicemailsInput): Promise<VoicemailPage>;
  markVoicemailRead(input: {
    userId: string;
    voicemailId: string;
  }): Promise<VoicemailRecord | null>;
  registerCallPushToken(
    input: RegisterCallPushTokenInput
  ): Promise<CallPushTokenRecord>;
  upsertCallFromWebhook(input: UpsertCallFromWebhookInput): Promise<CallRecord>;
  upsertVoicemail(input: UpsertVoicemailInput): Promise<VoicemailRecord>;
}
