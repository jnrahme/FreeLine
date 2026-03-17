import { createId } from "../auth/crypto.js";
import type {
  BlockRecord,
  ConversationPage,
  ConversationRecord,
  CreateInboundMessageInput,
  CreateOutboundMessageInput,
  FindConversationInput,
  ListConversationsInput,
  ListMessagesInput,
  MessagePage,
  MessageRecord,
  MessageStatus,
  MessageStore,
  PushTokenRecord,
  ReportRecord,
  UsageCountRecord
} from "./types.js";

interface ConversationState {
  createdAt: string;
  id: string;
  isOptedOut: boolean;
  lastMessageAt: string | null;
  participantNumber: string;
  phoneNumberId: string;
  unreadCount: number;
  updatedAt: string;
  userId: string;
}

export class InMemoryMessageStore implements MessageStore {
  private readonly conversations = new Map<string, ConversationState>();
  private readonly messages = new Map<string, MessageRecord>();
  private readonly blocks = new Map<string, BlockRecord>();
  private readonly pushTokens = new Map<string, PushTokenRecord>();
  private readonly reports = new Map<string, ReportRecord>();

  async countDistinctOutboundParticipantsSince(input: {
    since: string;
    userId: string;
  }): Promise<number> {
    const threshold = new Date(input.since).getTime();
    const participants = new Set<string>();

    for (const message of this.messages.values()) {
      if (message.direction !== "outbound") {
        continue;
      }

      const conversation = this.conversations.get(message.conversationId);
      if (!conversation || conversation.userId !== input.userId) {
        continue;
      }

      if (new Date(message.createdAt).getTime() >= threshold) {
        participants.add(conversation.participantNumber);
      }
    }

    return participants.size;
  }

  async countDistinctParticipantsForOutboundBodySince(input: {
    body: string;
    since: string;
    userId: string;
  }): Promise<number> {
    const normalizedBody = input.body.trim();
    const threshold = new Date(input.since).getTime();
    const participants = new Set<string>();

    for (const message of this.messages.values()) {
      if (message.direction !== "outbound" || message.body.trim() !== normalizedBody) {
        continue;
      }

      const conversation = this.conversations.get(message.conversationId);
      if (!conversation || conversation.userId !== input.userId) {
        continue;
      }

      if (new Date(message.createdAt).getTime() >= threshold) {
        participants.add(conversation.participantNumber);
      }
    }

    return participants.size;
  }

  async countOutboundMessagesToParticipant(input: {
    participantNumber: string;
    userId: string;
  }): Promise<number> {
    let count = 0;

    for (const message of this.messages.values()) {
      if (message.direction !== "outbound") {
        continue;
      }

      const conversation = this.conversations.get(message.conversationId);
      if (
        conversation &&
        conversation.userId === input.userId &&
        conversation.participantNumber === input.participantNumber
      ) {
        count += 1;
      }
    }

    return count;
  }

  async createOutboundMessage(
    input: CreateOutboundMessageInput
  ): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    return this.createMessageRecord({
      body: input.body,
      direction: "outbound",
      participantNumber: input.participantNumber,
      phoneNumberId: input.phoneNumberId,
      status: "pending",
      unreadDelta: 0,
      userId: input.userId
    });
  }

  async createInboundMessage(
    input: CreateInboundMessageInput
  ): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    return this.createMessageRecord({
      body: input.body,
      direction: "inbound",
      participantNumber: input.participantNumber,
      phoneNumberId: input.phoneNumberId,
      status: "delivered",
      unreadDelta: 1,
      userId: input.userId
    });
  }

  async findConversationByParticipant(
    input: FindConversationInput
  ): Promise<ConversationRecord | null> {
    const conversation = Array.from(this.conversations.values()).find(
      (item) =>
        item.userId === input.userId &&
        item.phoneNumberId === input.phoneNumberId &&
        item.participantNumber === input.participantNumber
    );

    return conversation ? this.toConversationRecord(conversation.id) : null;
  }

  async findConversationById(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationRecord | null> {
    const conversation = this.conversations.get(input.conversationId);
    if (!conversation || conversation.userId != input.userId) {
      return null;
    }

    return this.toConversationRecord(conversation.id);
  }

  async findConversationByMessageId(messageId: string): Promise<ConversationRecord | null> {
    const message = this.messages.get(messageId);
    if (!message) {
      return null;
    }

    return this.toConversationRecord(message.conversationId);
  }

  async getOutboundUsage(userId: string): Promise<UsageCountRecord> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let dailyUsed = 0;
    let monthlyUsed = 0;

    for (const message of this.messages.values()) {
      const conversation = this.conversations.get(message.conversationId);
      if (!conversation || conversation.userId !== userId) {
        continue;
      }

      const createdAt = new Date(message.createdAt);
      if (createdAt >= startOfDay) {
        dailyUsed += 1;
      }
      if (createdAt >= startOfMonth) {
        monthlyUsed += 1;
      }
    }

    return { dailyUsed, monthlyUsed };
  }

  async listConversations(input: ListConversationsInput): Promise<ConversationPage> {
    const conversations = Array.from(this.conversations.values())
      .filter((conversation) => conversation.userId === input.userId)
      .sort((left, right) => {
        const leftTime = left.lastMessageAt ?? left.createdAt;
        const rightTime = right.lastMessageAt ?? right.createdAt;
        return rightTime.localeCompare(leftTime);
      })
      .slice(input.offset, input.offset + input.limit)
      .map((conversation) => this.toConversationRecord(conversation.id));

    return {
      conversations,
      limit: input.limit,
      offset: input.offset
    };
  }

  async listMessages(input: ListMessagesInput): Promise<MessagePage | null> {
    const conversation = this.conversations.get(input.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      return null;
    }

    const messages = Array.from(this.messages.values())
      .filter((message) => message.conversationId === conversation.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(input.offset, input.offset + input.limit);

      return {
        conversation: this.toConversationRecord(conversation.id),
        limit: input.limit,
        messages,
        offset: input.offset
      };
  }

  async markConversationRead(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationRecord | null> {
    const conversation = this.conversations.get(input.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      return null;
    }

    this.conversations.set(conversation.id, {
      ...conversation,
      unreadCount: 0,
      updatedAt: new Date().toISOString()
    });

    return this.toConversationRecord(conversation.id);
  }

  async setConversationOptOut(input: {
    conversationId: string;
    isOptedOut: boolean;
    userId: string;
  }): Promise<ConversationRecord | null> {
    const conversation = this.conversations.get(input.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      return null;
    }

    this.conversations.set(conversation.id, {
      ...conversation,
      isOptedOut: input.isOptedOut,
      updatedAt: new Date().toISOString()
    });

    return this.toConversationRecord(conversation.id);
  }

  async blockNumber(input: { blockedNumber: string; userId: string }): Promise<BlockRecord> {
    const key = `${input.userId}:${input.blockedNumber}`;
    const existing = this.blocks.get(key);
    if (existing) {
      return existing;
    }

    const block: BlockRecord = {
      blockedNumber: input.blockedNumber,
      createdAt: new Date().toISOString(),
      id: createId(),
      userId: input.userId
    };
    this.blocks.set(key, block);
    return block;
  }

  async unblockNumber(input: {
    blockedNumber: string;
    userId: string;
  }): Promise<boolean> {
    return this.blocks.delete(`${input.userId}:${input.blockedNumber}`);
  }

  async isBlocked(input: { blockedNumber: string; userId: string }): Promise<boolean> {
    return this.blocks.has(`${input.userId}:${input.blockedNumber}`);
  }

  async reportNumber(input: {
    reason: string;
    reportedNumber: string;
    userId: string;
  }): Promise<ReportRecord> {
    const report: ReportRecord = {
      createdAt: new Date().toISOString(),
      id: createId(),
      reason: input.reason,
      reportedNumber: input.reportedNumber,
      userId: input.userId
    };
    this.reports.set(report.id, report);
    return report;
  }

  async registerPushToken(input: {
    deviceId: string;
    platform: PushTokenRecord["platform"];
    token: string;
    userId: string;
  }): Promise<PushTokenRecord> {
    const key = `${input.userId}:${input.deviceId}:${input.platform}`;
    const existing = this.pushTokens.get(key);
    const now = new Date().toISOString();

    const record: PushTokenRecord = existing ?? {
      createdAt: now,
      deviceId: input.deviceId,
      id: createId(),
      platform: input.platform,
      token: input.token,
      updatedAt: now,
      userId: input.userId
    };

    const nextRecord = {
      ...record,
      token: input.token,
      updatedAt: now
    };
    this.pushTokens.set(key, nextRecord);
    return nextRecord;
  }

  async findPushTokensByUser(userId: string): Promise<PushTokenRecord[]> {
    return Array.from(this.pushTokens.values()).filter((token) => token.userId === userId);
  }

  async recordOptOutEvent(_input: {
    conversationId: string;
    keyword: string;
    participantNumber: string;
    userId: string;
  }): Promise<void> {
    return;
  }

  async updateMessageAfterSend(input: {
    messageId: string;
    providerMessageId: string;
    status: MessageStatus;
  }): Promise<MessageRecord | null> {
    const message = this.messages.get(input.messageId);
    if (!message) {
      return null;
    }

    const updated: MessageRecord = {
      ...message,
      providerMessageId: input.providerMessageId,
      status: input.status,
      updatedAt: new Date().toISOString()
    };
    this.messages.set(message.id, updated);
    return updated;
  }

  async updateMessageStatusById(input: {
    messageId: string;
    status: MessageStatus;
  }): Promise<MessageRecord | null> {
    const message = this.messages.get(input.messageId);
    if (!message) {
      return null;
    }

    const updated: MessageRecord = {
      ...message,
      status: input.status,
      updatedAt: new Date().toISOString()
    };
    this.messages.set(message.id, updated);
    return updated;
  }

  async updateMessageStatusByProviderMessageId(input: {
    providerMessageId: string;
    status: MessageStatus;
  }): Promise<MessageRecord | null> {
    const message = Array.from(this.messages.values()).find(
      (item) => item.providerMessageId === input.providerMessageId
    );

    if (!message) {
      return null;
    }

    return this.updateMessageStatusById({
      messageId: message.id,
      status: input.status
    });
  }

  private toConversationRecord(conversationId: string): ConversationRecord {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} was not found.`);
    }

    const lastMessage = Array.from(this.messages.values())
      .filter((message) => message.conversationId === conversationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    return {
      createdAt: conversation.createdAt,
      id: conversation.id,
      isOptedOut: conversation.isOptedOut,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: lastMessage?.body ?? null,
      lastMessageStatus: lastMessage?.status ?? null,
      participantNumber: conversation.participantNumber,
      phoneNumberId: conversation.phoneNumberId,
      unreadCount: conversation.unreadCount,
      updatedAt: conversation.updatedAt,
      userId: conversation.userId
    };
  }

  private async createMessageRecord(input: {
    body: string;
    direction: MessageRecord["direction"];
    participantNumber: string;
    phoneNumberId: string;
    status: MessageStatus;
    unreadDelta: number;
    userId: string;
  }): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    const now = new Date().toISOString();
    const existingConversation = Array.from(this.conversations.values()).find(
      (conversation) =>
        conversation.userId === input.userId &&
        conversation.phoneNumberId === input.phoneNumberId &&
        conversation.participantNumber === input.participantNumber
    );

    const conversationState = existingConversation ?? {
      createdAt: now,
      id: createId(),
      isOptedOut: false,
      lastMessageAt: null,
      participantNumber: input.participantNumber,
      phoneNumberId: input.phoneNumberId,
      unreadCount: 0,
      updatedAt: now,
      userId: input.userId
    };

    const message: MessageRecord = {
      body: input.body,
      conversationId: conversationState.id,
      createdAt: now,
      direction: input.direction,
      id: createId(),
      providerMessageId: null,
      status: input.status,
      updatedAt: now
    };

    this.messages.set(message.id, message);
    this.conversations.set(conversationState.id, {
      ...conversationState,
      lastMessageAt: message.createdAt,
      unreadCount: conversationState.unreadCount + input.unreadDelta,
      updatedAt: now
    });

    return {
      conversation: this.toConversationRecord(conversationState.id),
      message
    };
  }

  debugListConversations(): ConversationRecord[] {
    return Array.from(this.conversations.values())
      .map((conversation) => this.toConversationRecord(conversation.id))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  debugListMessages(): MessageRecord[] {
    return Array.from(this.messages.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  debugListReports(): ReportRecord[] {
    return Array.from(this.reports.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  debugListBlocks(): BlockRecord[] {
    return Array.from(this.blocks.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }
}
