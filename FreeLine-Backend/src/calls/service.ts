import { createId } from "../auth/crypto.js";
import type { AbuseService } from "../abuse/service.js";
import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import type { PushNotifier } from "../notifications/types.js";
import type { NumberStore } from "../numbers/types.js";
import type { TelephonyProvider } from "../telephony/telephony-provider.js";
import type {
  CallAllowance,
  CallHistoryPage,
  CallPushTokenRecord,
  CallRecord,
  CallStatus,
  CallStore,
  IncomingCallPlan,
  VoicemailPage,
  VoicemailRecord
} from "./types.js";
import type { VoicemailArchive } from "./voicemail-archive.js";

const US_E164_REGEX = /^\+1\d{10}$/;

export interface CallServiceOptions {
  abuseService?: AbuseService;
  inboundRingSeconds?: number;
  monthlyCapMinutes?: number;
  voicemailArchive: VoicemailArchive;
}

export class CallService {
  private readonly abuseService?: AbuseService;
  private readonly inboundRingSeconds: number;
  private readonly monthlyCapMinutes: number;
  private readonly voicemailArchive: VoicemailArchive;

  constructor(
    private readonly store: CallStore,
    private readonly numberStore: NumberStore,
    private readonly telephonyProvider: TelephonyProvider,
    private readonly pushNotifier: PushNotifier,
    options: CallServiceOptions
  ) {
    this.abuseService = options.abuseService;
    this.inboundRingSeconds = options.inboundRingSeconds ?? 30;
    this.monthlyCapMinutes =
      options.monthlyCapMinutes ?? env.FREE_TIER_MONTHLY_CALL_MINUTES_CAP;
    this.voicemailArchive = options.voicemailArchive;
  }

  async deleteVoicemail(input: {
    userId: string;
    voicemailId: string;
  }): Promise<void> {
    const deleted = await this.store.deleteVoicemail(input);
    if (!deleted) {
      throw new AppError(404, "voicemail_not_found", "Voicemail not found.");
    }

    await this.voicemailArchive.deleteRecording({
      voicemailId: deleted.id
    });
  }

  async issueVoiceToken(input: {
    userId: string;
  }): Promise<{
    allowance: CallAllowance;
    expiresInSeconds: number;
    fromNumber: string;
    identity: string;
    token: string;
  }> {
    const currentNumber = await this.numberStore.findCurrentNumberByUser(input.userId);
    if (!currentNumber) {
      throw new AppError(
        409,
        "active_number_required",
        "Claim a FreeLine number before making calls."
      );
    }

    let legacyUsage: { dailyUsedMinutes: number; monthlyUsedMinutes: number } | null = null;
    let abuseAllowance: CallAllowance | null = null;

    if (this.abuseService) {
      abuseAllowance = await this.abuseService.assertCanIssueVoiceToken({
        userId: input.userId
      });
    } else {
      legacyUsage = await this.store.getMonthlyUsage(input.userId);
      this.assertUsageAvailable(legacyUsage.monthlyUsedMinutes);
    }

    const identity = `${input.userId}:${currentNumber.phoneNumberId}`;
    const token = await this.telephonyProvider.createVoiceToken(identity);

    return {
      allowance: this.abuseService
        ? (abuseAllowance as CallAllowance)
        : this.buildAllowance(
            legacyUsage?.dailyUsedMinutes ?? 0,
            legacyUsage?.monthlyUsedMinutes ?? 0
          ),
      expiresInSeconds: 3600,
      fromNumber: currentNumber.phoneNumber,
      identity,
      token
    };
  }

  async listCallHistory(input: {
    limit: number;
    offset: number;
    userId: string;
  }): Promise<{
    allowance: CallAllowance;
    calls: CallHistoryPage["calls"];
    limit: number;
    offset: number;
  }> {
    const [allowance, page] = await Promise.all([
      this.abuseService
        ? this.abuseService.getCallAllowance(input.userId)
        : this.store
            .getMonthlyUsage(input.userId)
            .then((usage) =>
              this.buildAllowance(usage.dailyUsedMinutes, usage.monthlyUsedMinutes)
            ),
      this.store.listCallHistory(input)
    ]);

    return {
      allowance,
      calls: page.calls,
      limit: page.limit,
      offset: page.offset
    };
  }

  async listVoicemails(input: {
    limit: number;
    offset: number;
    userId: string;
  }): Promise<{
    limit: number;
    offset: number;
    voicemails: VoicemailPage["voicemails"];
  }> {
    return this.store.listVoicemails(input);
  }

  async markVoicemailRead(input: {
    userId: string;
    voicemailId: string;
  }): Promise<{ voicemail: VoicemailRecord }> {
    const voicemail = await this.store.markVoicemailRead(input);
    if (!voicemail) {
      throw new AppError(404, "voicemail_not_found", "Voicemail not found.");
    }

    return { voicemail };
  }

  async registerCallPushToken(input: {
    channel: CallPushTokenRecord["channel"];
    deviceId: string;
    platform: CallPushTokenRecord["platform"];
    token: string;
    userId: string;
  }): Promise<{ pushToken: CallPushTokenRecord }> {
    return {
      pushToken: await this.store.registerCallPushToken(input)
    };
  }

  async handleInboundWebhook(input: {
    events: Array<{
      from: string;
      providerCallId: string;
      startedAt?: string | null;
      to: string;
    }>;
    payload: string;
    signature: string | undefined;
  }): Promise<{
    createdCount: number;
    droppedCount: number;
    plans: IncomingCallPlan[];
  }> {
    if (
      !this.telephonyProvider.verifySmsStatusSignature(input.payload, input.signature)
    ) {
      throw new AppError(
        401,
        "invalid_webhook_signature",
        "The telecom webhook signature could not be verified."
      );
    }

    return this.planInboundCalls({
      events: input.events
    });
  }

  async planInboundCalls(input: {
    events: Array<{
      from: string;
      providerCallId: string;
      startedAt?: string | null;
      to: string;
    }>;
  }): Promise<{
    createdCount: number;
    droppedCount: number;
    plans: IncomingCallPlan[];
  }> {
    const plans: IncomingCallPlan[] = [];
    let droppedCount = 0;

    for (const event of input.events) {
      this.assertPhoneNumber(event.from);
      this.assertPhoneNumber(event.to);

      const assignedNumber = await this.numberStore.findCurrentNumberByPhoneNumber(event.to);
      if (!assignedNumber) {
        droppedCount += 1;
        continue;
      }

      let action: "ring" | "voicemail" = "ring";
      if (this.abuseService) {
        action = (await this.abuseService.shouldRouteInboundCallToVoicemail({
          userId: assignedNumber.userId
        }))
          ? "voicemail"
          : "ring";
      } else {
        const usage = await this.store.getMonthlyUsage(assignedNumber.userId);
        action = usage.monthlyUsedMinutes >= this.monthlyCapMinutes ? "voicemail" : "ring";
      }
      const call = await this.store.upsertCallFromWebhook({
        direction: "inbound",
        durationSeconds: null,
        endedAt: null,
        phoneNumberId: assignedNumber.phoneNumberId,
        providerCallId: event.providerCallId,
        remoteNumber: event.from,
        startedAt: event.startedAt ?? null,
        status: action === "ring" ? "ringing" : "initiated",
        userId: assignedNumber.userId
      });

      const tokens =
        action === "ring"
          ? await this.store.findCallPushTokensByUser({
              userId: assignedNumber.userId
            })
          : [];

      const plan: IncomingCallPlan = {
        action,
        call,
        calledNumber: event.to,
        callerNumber: event.from,
        identity: action === "ring" ? `${assignedNumber.userId}:${assignedNumber.phoneNumberId}` : null,
        providerCallId: event.providerCallId,
        reason: action === "ring" ? null : "cap_reached",
        ringSeconds: this.inboundRingSeconds,
        tokens
      };

      if (action === "ring" && tokens.length > 0) {
        await this.pushNotifier.sendInboundCall({
          plan,
          tokens
        });
      }

      plans.push(plan);
    }

    return {
      createdCount: plans.length,
      droppedCount,
      plans
    };
  }

  async handleStatusWebhook(input: {
    events: Array<{
      durationSeconds?: number | null;
      endedAt?: string | null;
      from: string;
      providerCallId: string;
      startedAt?: string | null;
      status: string;
      to: string;
    }>;
    payload: string;
    signature: string | undefined;
  }): Promise<{ calls: CallRecord[]; updatedCount: number }> {
    if (
      !this.telephonyProvider.verifySmsStatusSignature(input.payload, input.signature)
    ) {
      throw new AppError(
        401,
        "invalid_webhook_signature",
        "The telecom webhook signature could not be verified."
      );
    }

    return this.recordStatusEvents({
      events: input.events
    });
  }

  async handleVoicemailWebhook(input: {
    events: Array<{
      audioUrl: string;
      durationSeconds?: number | null;
      from: string;
      providerCallId: string;
      transcription?: string | null;
      to: string;
    }>;
    payload: string;
    signature: string | undefined;
  }): Promise<{
    createdCount: number;
    droppedCount: number;
    voicemails: VoicemailRecord[];
  }> {
    if (
      !this.telephonyProvider.verifySmsStatusSignature(input.payload, input.signature)
    ) {
      throw new AppError(
        401,
        "invalid_webhook_signature",
        "The telecom webhook signature could not be verified."
      );
    }

    return this.recordVoicemails({
      events: input.events
    });
  }

  async recordStatusEvents(input: {
    events: Array<{
      durationSeconds?: number | null;
      endedAt?: string | null;
      from: string;
      providerCallId: string;
      startedAt?: string | null;
      status: string;
      to: string;
    }>;
  }): Promise<{ calls: CallRecord[]; updatedCount: number }> {
    const updatedCalls: CallRecord[] = [];

    for (const event of input.events) {
      this.assertPhoneNumber(event.from);
      this.assertPhoneNumber(event.to);

      const normalizedStatus = this.normalizeWebhookStatus(event.status);
      const existing = await this.store.findCallByProviderCallId(event.providerCallId);

      let nextCall: CallRecord | null = null;

      if (existing) {
        nextCall = await this.store.upsertCallFromWebhook({
          direction: existing.direction,
          durationSeconds: event.durationSeconds ?? null,
          endedAt: event.endedAt ?? null,
          phoneNumberId: existing.phoneNumberId,
          providerCallId: event.providerCallId,
          remoteNumber: existing.remoteNumber,
          startedAt: event.startedAt ?? null,
          status: normalizedStatus,
          userId: existing.userId
        });
      } else {
        const fromNumber = await this.numberStore.findCurrentNumberByPhoneNumber(event.from);
        if (fromNumber) {
          nextCall = await this.store.upsertCallFromWebhook({
            direction: "outbound",
            durationSeconds: event.durationSeconds ?? null,
            endedAt: event.endedAt ?? null,
            phoneNumberId: fromNumber.phoneNumberId,
            providerCallId: event.providerCallId,
            remoteNumber: event.to,
            startedAt: event.startedAt ?? null,
            status: normalizedStatus,
            userId: fromNumber.userId
          });
        } else {
          const toNumber = await this.numberStore.findCurrentNumberByPhoneNumber(event.to);
          if (toNumber) {
            nextCall = await this.store.upsertCallFromWebhook({
              direction: "inbound",
              durationSeconds: event.durationSeconds ?? null,
              endedAt: event.endedAt ?? null,
              phoneNumberId: toNumber.phoneNumberId,
              providerCallId: event.providerCallId,
              remoteNumber: event.from,
              startedAt: event.startedAt ?? null,
              status: normalizedStatus,
              userId: toNumber.userId
            });
          }
        }
      }

      if (!nextCall) {
        continue;
      }

      updatedCalls.push(nextCall);

      if (
        (nextCall.durationSeconds > 0 || normalizedStatus === "missed") &&
        (normalizedStatus === "completed" ||
          normalizedStatus === "answered" ||
          normalizedStatus === "missed")
      ) {
        await this.abuseService?.recordCallActivity({
          direction: nextCall.direction,
          durationSeconds: nextCall.durationSeconds,
          providerCallId: nextCall.providerCallId,
          status: normalizedStatus,
          userId: nextCall.userId
        });
        await this.numberStore.recordActivity({
          occurredAt:
            nextCall.endedAt ??
            nextCall.startedAt ??
            new Date().toISOString(),
          userId: nextCall.userId
        });
      }

      if (
        nextCall.direction === "inbound" &&
        (normalizedStatus === "missed" || normalizedStatus === "failed")
      ) {
        const tokens = await this.store.findCallPushTokensByUser({
          channel: "alert",
          userId: nextCall.userId
        });

        if (tokens.length > 0) {
          await this.pushNotifier.sendMissedCall({
            call: nextCall,
            tokens
          });
        }
      }
    }

    return {
      calls: updatedCalls,
      updatedCount: updatedCalls.length
    };
  }

  async recordVoicemails(input: {
    events: Array<{
      audioUrl: string;
      durationSeconds?: number | null;
      from: string;
      providerCallId: string;
      transcription?: string | null;
      to: string;
    }>;
  }): Promise<{
    createdCount: number;
    droppedCount: number;
    voicemails: VoicemailRecord[];
  }> {
    const voicemails: VoicemailRecord[] = [];
    let droppedCount = 0;

    for (const event of input.events) {
      this.assertPhoneNumber(event.from);
      this.assertPhoneNumber(event.to);

      const assignedNumber = await this.numberStore.findCurrentNumberByPhoneNumber(event.to);
      if (!assignedNumber || !event.audioUrl.trim()) {
        droppedCount += 1;
        continue;
      }

      const existingVoicemail = await this.store.findVoicemailByProviderCallId(
        event.providerCallId
      );
      const voicemailId = existingVoicemail?.id ?? createId();
      await this.voicemailArchive.archiveRecording({
        sourceUrl: event.audioUrl.trim(),
        voicemailId
      });

      const voicemail = await this.store.upsertVoicemail({
        audioUrl: this.voicemailArchive.buildPlaybackUrl({
          voicemailId
        }),
        callerNumber: event.from,
        durationSeconds: event.durationSeconds ?? 0,
        id: voicemailId,
        phoneNumberId: assignedNumber.phoneNumberId,
        providerCallId: event.providerCallId,
        transcription: event.transcription?.trim() || null,
        userId: assignedNumber.userId
      });

      const tokens = await this.store.findCallPushTokensByUser({
        channel: "alert",
        userId: assignedNumber.userId
      });

      if (tokens.length > 0) {
        await this.pushNotifier.sendVoicemail({
          tokens,
          voicemail
        });
      }

      voicemails.push(voicemail);
    }

    return {
      createdCount: voicemails.length,
      droppedCount,
      voicemails
    };
  }

  private assertPhoneNumber(phoneNumber: string): void {
    if (!US_E164_REGEX.test(phoneNumber)) {
      throw new AppError(
        400,
        "invalid_phone_number",
        "Phone number must be a U.S. E.164 number."
      );
    }
  }

  private assertUsageAvailable(monthlyUsedMinutes: number): void {
    if (monthlyUsedMinutes >= this.monthlyCapMinutes) {
      throw new AppError(
        429,
        "free_tier_call_limit_reached",
        "Free tier call limit reached. Watch an ad or upgrade."
      );
    }
  }

  private buildAllowance(
    dailyUsedMinutes: number,
    monthlyUsedMinutes: number
  ): CallAllowance {
    return {
      dailyCapMinutes: env.FREE_TIER_DAILY_CALL_MINUTES_CAP,
      dailyRemainingMinutes: Math.max(
        env.FREE_TIER_DAILY_CALL_MINUTES_CAP - dailyUsedMinutes,
        0
      ),
      dailyUsedMinutes,
      monthlyCapMinutes: this.monthlyCapMinutes,
      monthlyRemainingMinutes: Math.max(
        this.monthlyCapMinutes - monthlyUsedMinutes,
        0
      ),
      monthlyUsedMinutes
    };
  }

  private normalizeWebhookStatus(status: string): CallStatus {
    switch (status.trim().toLowerCase()) {
      case "initiated":
      case "created":
        return "initiated";
      case "ringing":
      case "alerting":
        return "ringing";
      case "answered":
      case "connected":
      case "in-progress":
      case "in_progress":
        return "answered";
      case "completed":
      case "ended":
        return "completed";
      case "no-answer":
      case "no_answer":
      case "missed":
        return "missed";
      case "failed":
      case "busy":
      case "rejected":
        return "failed";
      default:
        return "initiated";
    }
  }
}
