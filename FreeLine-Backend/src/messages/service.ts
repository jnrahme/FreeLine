import type { AbuseService } from "../abuse/service.js";
import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import type { PushNotifier, RealtimePublisher } from "../notifications/types.js";
import type { NumberStore } from "../numbers/types.js";
import type { TelephonyProvider } from "../telephony/telephony-provider.js";
import type {
  BlockRecord,
  ConversationPage,
  ListConversationsInput,
  ListMessagesInput,
  MessagePage,
  MessageStatus,
  MessageStore,
  OutboundAllowance,
  PushTokenRecord,
  ReportRecord
} from "./types.js";

const US_E164_REGEX = /^\+1\d{10}$/;
const HELP_REPLY =
  "FreeLine: Free calls & texts. Reply STOP to opt out. Support: support@freeline.dev";
const STOP_REPLY = "FreeLine: You have been opted out. Reply HELP for support.";

export interface MessageServiceOptions {
  abuseService?: AbuseService;
  dailyCap?: number;
  monthlyCap?: number;
}

export class MessageService {
  private readonly abuseService?: AbuseService;
  private readonly dailyCap: number;
  private readonly monthlyCap: number;

  constructor(
    private readonly store: MessageStore,
    private readonly numberStore: NumberStore,
    private readonly telephonyProvider: TelephonyProvider,
    private readonly pushNotifier: PushNotifier,
    private readonly realtimePublisher: RealtimePublisher,
    options: MessageServiceOptions = {}
  ) {
    this.abuseService = options.abuseService;
    this.dailyCap = options.dailyCap ?? env.FREE_TIER_DAILY_SMS_CAP;
    this.monthlyCap = options.monthlyCap ?? env.FREE_TIER_MONTHLY_SMS_CAP;
  }

  async sendMessage(input: {
    body: string;
    to: string;
    userId: string;
  }): Promise<{
    allowance: OutboundAllowance;
    conversation: ConversationPage["conversations"][number];
    message: MessagePage["messages"][number];
  }> {
    const body = input.body.trim();
    this.assertPhoneNumber(input.to);

    if (!body) {
      throw new AppError(400, "invalid_message_body", "Message body is required.");
    }

    const currentNumber = await this.numberStore.findCurrentNumberByUser(input.userId);
    if (!currentNumber) {
      throw new AppError(
        409,
        "active_number_required",
        "Claim a FreeLine number before sending messages."
      );
    }

    const existingConversation = await this.store.findConversationByParticipant({
      participantNumber: input.to,
      phoneNumberId: currentNumber.phoneNumberId,
      userId: input.userId
    });

    if (existingConversation?.isOptedOut) {
      throw new AppError(
        403,
        "conversation_opted_out",
        "This conversation has opted out of messaging."
      );
    }

    if (await this.store.isBlocked({ blockedNumber: input.to, userId: input.userId })) {
      throw new AppError(403, "blocked_number", "This number is blocked.");
    }

    let legacyUsage: { dailyUsed: number; monthlyUsed: number } | null = null;

    if (this.abuseService) {
      await this.abuseService.assertCanSendMessage({
        body,
        to: input.to,
        userId: input.userId
      });
    } else {
      legacyUsage = await this.store.getOutboundUsage(input.userId);
      this.assertUsageAvailable(legacyUsage);
    }

    const created = await this.store.createOutboundMessage({
      body,
      participantNumber: input.to,
      phoneNumberId: currentNumber.phoneNumberId,
      userId: input.userId
    });

    try {
      const sendResult = await this.telephonyProvider.sendSms(
        currentNumber.phoneNumber,
        input.to,
        body
      );
      const persistedMessage = await this.store.updateMessageAfterSend({
        messageId: created.message.id,
        providerMessageId: sendResult.externalId,
        status: sendResult.status === "sent" ? "sent" : "pending"
      });

      if (!persistedMessage) {
        throw new AppError(
          500,
          "message_not_persisted",
          "Message delivery metadata could not be saved."
        );
      }

      await this.abuseService?.recordMessageActivity({
        direction: "outbound",
        participantNumber: input.to,
        userId: input.userId
      });
      await this.numberStore.recordActivity({
        userId: input.userId
      });

      return {
        allowance: this.abuseService
          ? await this.abuseService.getMessageAllowance(input.userId)
          : this.buildAllowance({
              dailyUsed: (legacyUsage?.dailyUsed ?? 0) + 1,
              monthlyUsed: (legacyUsage?.monthlyUsed ?? 0) + 1
            }),
        conversation: created.conversation,
        message: persistedMessage
      };
    } catch (error) {
      await this.store.updateMessageStatusById({
        messageId: created.message.id,
        status: "failed"
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(502, "sms_send_failed", "Unable to send the message right now.");
    }
  }

  async listConversations(input: ListConversationsInput): Promise<{
    allowance: OutboundAllowance;
    conversations: ConversationPage["conversations"];
    limit: number;
    offset: number;
  }> {
    const [allowance, page] = await Promise.all([
      this.abuseService
        ? this.abuseService.getMessageAllowance(input.userId)
        : this.store.getOutboundUsage(input.userId).then((usage) => this.buildAllowance(usage)),
      this.store.listConversations(input)
    ]);

    return {
      allowance,
      conversations: page.conversations,
      limit: page.limit,
      offset: page.offset
    };
  }

  async listMessages(input: ListMessagesInput): Promise<{
    allowance: OutboundAllowance;
    conversation: MessagePage["conversation"];
    limit: number;
    messages: MessagePage["messages"];
    offset: number;
  }> {
    const [allowance, page] = await Promise.all([
      this.abuseService
        ? this.abuseService.getMessageAllowance(input.userId)
        : this.store.getOutboundUsage(input.userId).then((usage) => this.buildAllowance(usage)),
      this.store.listMessages(input)
    ]);

    if (!page) {
      throw new AppError(404, "conversation_not_found", "Conversation not found.");
    }

    return {
      allowance,
      conversation: page.conversation,
      limit: page.limit,
      messages: page.messages,
      offset: page.offset
    };
  }

  async handleStatusWebhook(input: {
    events: Array<{ providerMessageId: string; status: string }>;
    payload: string;
    signature: string | undefined;
  }): Promise<{ messages: MessagePage["messages"]; updatedCount: number }> {
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

  async recordStatusEvents(input: {
    events: Array<{ providerMessageId: string; status: string }>;
  }): Promise<{ messages: MessagePage["messages"]; updatedCount: number }> {
    const updatedMessages: MessagePage["messages"] = [];

    for (const event of input.events) {
      const message = await this.store.updateMessageStatusByProviderMessageId({
        providerMessageId: event.providerMessageId,
        status: this.normalizeWebhookStatus(event.status)
      });

      if (message) {
        updatedMessages.push(message);
        const conversation = await this.store.findConversationByMessageId(message.id);
        if (conversation) {
          await this.realtimePublisher.publish({
            conversation,
            message,
            type: "message:status",
            userId: conversation.userId
          });
        }
      }
    }

    return {
      messages: updatedMessages,
      updatedCount: updatedMessages.length
    };
  }

  async handleInboundWebhook(input: {
    events: Array<{ body: string; from: string; to: string }>;
    payload: string;
    signature: string | undefined;
  }): Promise<{
    createdCount: number;
    droppedCount: number;
    messages: MessagePage["messages"];
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

    return this.recordInboundEvents({
      events: input.events
    });
  }

  async recordInboundEvents(input: {
    events: Array<{ body: string; from: string; to: string }>;
  }): Promise<{
    createdCount: number;
    droppedCount: number;
    messages: MessagePage["messages"];
  }> {
    const createdMessages: MessagePage["messages"] = [];
    let droppedCount = 0;

    for (const event of input.events) {
      this.assertPhoneNumber(event.from);
      this.assertPhoneNumber(event.to);

      const assignedNumber = await this.numberStore.findCurrentNumberByPhoneNumber(event.to);
      if (!assignedNumber) {
        droppedCount += 1;
        continue;
      }

      if (
        await this.store.isBlocked({
          blockedNumber: event.from,
          userId: assignedNumber.userId
        })
      ) {
        droppedCount += 1;
        continue;
      }

      const inboundBody = event.body.trim();
      if (!inboundBody) {
        droppedCount += 1;
        continue;
      }

      const created = await this.store.createInboundMessage({
        body: inboundBody,
        participantNumber: event.from,
        phoneNumberId: assignedNumber.phoneNumberId,
        userId: assignedNumber.userId
      });

      createdMessages.push(created.message);
      await this.abuseService?.recordMessageActivity({
        direction: "inbound",
        participantNumber: event.from,
        userId: assignedNumber.userId
      });
      await this.numberStore.recordActivity({
        userId: assignedNumber.userId
      });

      const keyword = event.body.trim().toUpperCase();
      if (keyword === "STOP") {
        await this.store.setConversationOptOut({
          conversationId: created.conversation.id,
          isOptedOut: true,
          userId: assignedNumber.userId
        });
        await this.store.recordOptOutEvent({
          conversationId: created.conversation.id,
          keyword,
          participantNumber: event.from,
          userId: assignedNumber.userId
        });
        await this.telephonyProvider.sendSms(event.to, event.from, STOP_REPLY);
      } else if (keyword === "HELP") {
        await this.telephonyProvider.sendSms(event.to, event.from, HELP_REPLY);
      }

      const pushTokens = await this.store.findPushTokensByUser(assignedNumber.userId);
      await this.pushNotifier.sendInboundMessage({
        conversation: created.conversation,
        message: created.message,
        tokens: pushTokens
      });
      await this.realtimePublisher.publish({
        conversation: created.conversation,
        message: created.message,
        type: "message:inbound",
        userId: assignedNumber.userId
      });
    }

    return {
      createdCount: createdMessages.length,
      droppedCount,
      messages: createdMessages
    };
  }

  async registerPushToken(input: {
    deviceId: string;
    platform: "ios" | "android";
    token: string;
    userId: string;
  }): Promise<{ pushToken: PushTokenRecord }> {
    return {
      pushToken: await this.store.registerPushToken(input)
    };
  }

  async markConversationRead(input: {
    conversationId: string;
    userId: string;
  }): Promise<{ conversation: MessagePage["conversation"] }> {
    const conversation = await this.store.markConversationRead(input);
    if (!conversation) {
      throw new AppError(404, "conversation_not_found", "Conversation not found.");
    }

    return { conversation };
  }

  async blockNumber(input: {
    blockedNumber: string;
    userId: string;
  }): Promise<{ block: BlockRecord }> {
    this.assertPhoneNumber(input.blockedNumber);
    const block = await this.store.blockNumber(input);
    const target = await this.numberStore.findCurrentNumberByPhoneNumber(input.blockedNumber);
    if (target && target.userId !== input.userId) {
      await this.abuseService?.recordBlockAgainstUser({
        blockedNumber: input.blockedNumber,
        blockerUserId: input.userId,
        targetUserId: target.userId
      });
    }
    return { block };
  }

  async unblockNumber(input: {
    blockedNumber: string;
    userId: string;
  }): Promise<void> {
    this.assertPhoneNumber(input.blockedNumber);
    const removed = await this.store.unblockNumber(input);
    if (!removed) {
      throw new AppError(404, "block_not_found", "Blocked number not found.");
    }
  }

  async reportNumber(input: {
    reason: string;
    reportedNumber: string;
    userId: string;
  }): Promise<{ report: ReportRecord }> {
    this.assertPhoneNumber(input.reportedNumber);

    if (!input.reason.trim()) {
      throw new AppError(400, "invalid_report_reason", "Report reason is required.");
    }

    const report = await this.store.reportNumber({
      reason: input.reason.trim(),
      reportedNumber: input.reportedNumber,
      userId: input.userId
    });
    const target = await this.numberStore.findCurrentNumberByPhoneNumber(input.reportedNumber);
    if (target && target.userId !== input.userId) {
      await this.abuseService?.recordReportAgainstUser({
        reason: input.reason.trim(),
        reportedNumber: input.reportedNumber,
        reporterUserId: input.userId,
        targetUserId: target.userId
      });
    }

    return { report };
  }

  private assertPhoneNumber(phoneNumber: string): void {
    if (!US_E164_REGEX.test(phoneNumber)) {
      throw new AppError(
        400,
        "invalid_phone_number",
        "Recipient must be a U.S. E.164 number."
      );
    }
  }

  private assertUsageAvailable(usage: {
    dailyUsed: number;
    monthlyUsed: number;
  }): void {
    if (usage.dailyUsed >= this.dailyCap || usage.monthlyUsed >= this.monthlyCap) {
      throw new AppError(
        429,
        "free_tier_limit_reached",
        "Free tier limit reached. Watch an ad or upgrade."
      );
    }
  }

  private buildAllowance(usage: {
    dailyUsed: number;
    monthlyUsed: number;
  }): OutboundAllowance {
    return {
      dailyCap: this.dailyCap,
      dailyRemaining: Math.max(this.dailyCap - usage.dailyUsed, 0),
      dailyUsed: usage.dailyUsed,
      monthlyCap: this.monthlyCap,
      monthlyRemaining: Math.max(this.monthlyCap - usage.monthlyUsed, 0),
      monthlyUsed: usage.monthlyUsed
    };
  }

  private normalizeWebhookStatus(status: string): MessageStatus {
    switch (status.trim().toLowerCase()) {
      case "accepted":
      case "queued":
      case "sent":
        return "sent";
      case "delivered":
        return "delivered";
      case "delivery-failed":
      case "delivery_failed":
      case "undelivered":
        return "undelivered";
      case "failed":
      case "rejected":
        return "failed";
      default:
        return "sent";
    }
  }
}
