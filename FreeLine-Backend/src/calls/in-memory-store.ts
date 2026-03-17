import { createId } from "../auth/crypto.js";
import type {
  CallHistoryPage,
  CallPushTokenRecord,
  CallStore,
  CallUsageRecord,
  ListCallsInput,
  ListVoicemailsInput,
  RegisterCallPushTokenInput,
  UpsertCallFromWebhookInput,
  UpsertVoicemailInput,
  VoicemailPage,
  VoicemailRecord
} from "./types.js";

export class InMemoryCallStore implements CallStore {
  private readonly callPushTokens = new Map<string, CallPushTokenRecord>();
  private readonly calls = new Map<string, ReturnType<typeof this.mapCall>>();
  private readonly callsByProviderId = new Map<string, string>();
  private readonly voicemails = new Map<string, VoicemailRecord>();
  private readonly voicemailsByProviderId = new Map<string, string>();

  async deleteVoicemail(input: {
    voicemailId: string;
    userId: string;
  }): Promise<VoicemailRecord | null> {
    const voicemail = this.voicemails.get(input.voicemailId);
    if (!voicemail || voicemail.userId !== input.userId) {
      return null;
    }

    this.voicemails.delete(input.voicemailId);
    this.voicemailsByProviderId.delete(voicemail.providerCallId);
    return voicemail;
  }

  async findCallByProviderCallId(providerCallId: string) {
    const callId = this.callsByProviderId.get(providerCallId);
    if (!callId) {
      return null;
    }

    return this.calls.get(callId) ?? null;
  }

  async findCallPushTokensByUser(input: {
    channel?: CallPushTokenRecord["channel"];
    userId: string;
  }): Promise<CallPushTokenRecord[]> {
    return Array.from(this.callPushTokens.values())
      .filter((token) => {
        if (token.userId !== input.userId) {
          return false;
        }

        return input.channel ? token.channel === input.channel : true;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async findVoicemailByProviderCallId(
    providerCallId: string
  ): Promise<VoicemailRecord | null> {
    const voicemailId = this.voicemailsByProviderId.get(providerCallId);
    if (!voicemailId) {
      return null;
    }

    return this.voicemails.get(voicemailId) ?? null;
  }

  async getMonthlyUsage(userId: string): Promise<CallUsageRecord> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let dailySeconds = 0;
    let totalSeconds = 0;

    for (const call of this.calls.values()) {
      if (call.userId !== userId || call.durationSeconds <= 0) {
        continue;
      }

      const usageAnchor = new Date(call.endedAt ?? call.startedAt ?? call.createdAt);
      if (usageAnchor >= startOfDay) {
        dailySeconds += call.durationSeconds;
      }
      if (usageAnchor >= startOfMonth) {
        totalSeconds += call.durationSeconds;
      }
    }

    return {
      dailyUsedMinutes: Math.ceil(dailySeconds / 60),
      monthlyUsedMinutes: Math.ceil(totalSeconds / 60)
    };
  }

  async listCallHistory(input: ListCallsInput): Promise<CallHistoryPage> {
    const calls = Array.from(this.calls.values())
      .filter((call) => call.userId === input.userId)
      .sort((left, right) => {
        const leftAnchor = left.endedAt ?? left.startedAt ?? left.createdAt;
        const rightAnchor = right.endedAt ?? right.startedAt ?? right.createdAt;
        return rightAnchor.localeCompare(leftAnchor);
      })
      .slice(input.offset, input.offset + input.limit);

    return {
      calls,
      limit: input.limit,
      offset: input.offset
    };
  }

  async listVoicemails(input: ListVoicemailsInput): Promise<VoicemailPage> {
    const voicemails = Array.from(this.voicemails.values())
      .filter((voicemail) => voicemail.userId === input.userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(input.offset, input.offset + input.limit);

    return {
      limit: input.limit,
      offset: input.offset,
      voicemails
    };
  }

  async markVoicemailRead(input: {
    userId: string;
    voicemailId: string;
  }): Promise<VoicemailRecord | null> {
    const voicemail = this.voicemails.get(input.voicemailId);
    if (!voicemail || voicemail.userId !== input.userId) {
      return null;
    }

    const nextVoicemail: VoicemailRecord = {
      ...voicemail,
      isRead: true,
      updatedAt: new Date().toISOString()
    };
    this.voicemails.set(voicemail.id, nextVoicemail);
    return nextVoicemail;
  }

  async registerCallPushToken(
    input: RegisterCallPushTokenInput
  ): Promise<CallPushTokenRecord> {
    const now = new Date().toISOString();
    const existing = Array.from(this.callPushTokens.values()).find(
      (token) =>
        token.userId === input.userId &&
        token.deviceId === input.deviceId &&
        token.platform === input.platform &&
        token.channel === input.channel
    );

    if (existing) {
      const nextToken: CallPushTokenRecord = {
        ...existing,
        token: input.token,
        updatedAt: now
      };
      this.callPushTokens.set(existing.id, nextToken);
      return nextToken;
    }

    const record: CallPushTokenRecord = {
      channel: input.channel,
      createdAt: now,
      deviceId: input.deviceId,
      id: createId(),
      platform: input.platform,
      token: input.token,
      updatedAt: now,
      userId: input.userId
    };
    this.callPushTokens.set(record.id, record);
    return record;
  }

  async upsertCallFromWebhook(input: UpsertCallFromWebhookInput) {
    const existing = await this.findCallByProviderCallId(input.providerCallId);
    const now = new Date().toISOString();

    if (existing) {
      const nextCall = {
        ...existing,
        durationSeconds: input.durationSeconds ?? existing.durationSeconds,
        endedAt: input.endedAt ?? existing.endedAt,
        startedAt: input.startedAt ?? existing.startedAt,
        status: input.status,
        updatedAt: now
      };
      this.calls.set(existing.id, nextCall);
      return nextCall;
    }

    const call = this.mapCall({
      createdAt: now,
      direction: input.direction,
      durationSeconds: input.durationSeconds ?? 0,
      endedAt: input.endedAt,
      id: createId(),
      phoneNumberId: input.phoneNumberId,
      providerCallId: input.providerCallId,
      remoteNumber: input.remoteNumber,
      startedAt: input.startedAt,
      status: input.status,
      updatedAt: now,
      userId: input.userId
    });

    this.calls.set(call.id, call);
    this.callsByProviderId.set(call.providerCallId, call.id);
    return call;
  }

  async upsertVoicemail(input: UpsertVoicemailInput): Promise<VoicemailRecord> {
    const voicemailId = this.voicemailsByProviderId.get(input.providerCallId);
    const now = new Date().toISOString();

    if (voicemailId) {
      const existing = this.voicemails.get(voicemailId);
      if (existing) {
        const nextVoicemail: VoicemailRecord = {
          ...existing,
          audioUrl: input.audioUrl,
          callerNumber: input.callerNumber,
          durationSeconds: input.durationSeconds,
          transcription: input.transcription,
          updatedAt: now
        };
        this.voicemails.set(existing.id, nextVoicemail);
        return nextVoicemail;
      }
    }

    const voicemail: VoicemailRecord = {
      audioUrl: input.audioUrl,
      callerNumber: input.callerNumber,
      createdAt: now,
      durationSeconds: input.durationSeconds,
      id: input.id,
      isRead: false,
      phoneNumberId: input.phoneNumberId,
      providerCallId: input.providerCallId,
      transcription: input.transcription,
      updatedAt: now,
      userId: input.userId
    };

    this.voicemails.set(voicemail.id, voicemail);
    this.voicemailsByProviderId.set(voicemail.providerCallId, voicemail.id);
    return voicemail;
  }

  private mapCall(input: {
    createdAt: string;
    direction: UpsertCallFromWebhookInput["direction"];
    durationSeconds: number;
    endedAt: string | null;
    id: string;
    phoneNumberId: string;
    providerCallId: string;
    remoteNumber: string;
    startedAt: string | null;
    status: UpsertCallFromWebhookInput["status"];
    updatedAt: string;
    userId: string;
  }) {
    return {
      ...input
    };
  }

  debugListCalls() {
    return Array.from(this.calls.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  debugListVoicemails(): VoicemailRecord[] {
    return Array.from(this.voicemails.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }
}
