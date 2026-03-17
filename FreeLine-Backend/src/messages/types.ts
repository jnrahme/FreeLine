export type MessageDirection = "outbound" | "inbound";
export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "undelivered";

export interface ConversationRecord {
  createdAt: string;
  id: string;
  isOptedOut: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageStatus: MessageStatus | null;
  participantNumber: string;
  phoneNumberId: string;
  unreadCount: number;
  updatedAt: string;
  userId: string;
}

export interface MessageRecord {
  body: string;
  conversationId: string;
  createdAt: string;
  direction: MessageDirection;
  id: string;
  providerMessageId: string | null;
  status: MessageStatus;
  updatedAt: string;
}

export interface UsageCountRecord {
  dailyUsed: number;
  monthlyUsed: number;
}

export interface OutboundAllowance {
  dailyCap: number;
  dailyRemaining: number;
  dailyUsed: number;
  monthlyBaseCap?: number;
  monthlyBonus?: number;
  monthlyCap: number;
  monthlyRemaining: number;
  monthlyUsed: number;
  rewardClaims?: {
    callMinutesGranted: number;
    maxClaims: number;
    remainingClaims: number;
    textEventsGranted: number;
    totalClaims: number;
  };
  tier?: string;
  trustScore?: number;
  uniqueContactsDailyCap?: number;
  uniqueContactsDailyRemaining?: number;
  uniqueContactsDailyUsed?: number;
}

export interface PushTokenRecord {
  createdAt: string;
  deviceId: string;
  id: string;
  platform: "ios" | "android";
  token: string;
  updatedAt: string;
  userId: string;
}

export interface BlockRecord {
  blockedNumber: string;
  createdAt: string;
  id: string;
  userId: string;
}

export interface ReportRecord {
  createdAt: string;
  id: string;
  reason: string;
  reportedNumber: string;
  userId: string;
}

export interface FindConversationInput {
  participantNumber: string;
  phoneNumberId: string;
  userId: string;
}

export interface CreateOutboundMessageInput extends FindConversationInput {
  body: string;
}

export interface CreateInboundMessageInput extends FindConversationInput {
  body: string;
}

export interface UpdateMessageAfterSendInput {
  messageId: string;
  providerMessageId: string;
  status: MessageStatus;
}

export interface UpdateMessageStatusByIdInput {
  messageId: string;
  status: MessageStatus;
}

export interface UpdateMessageStatusByProviderInput {
  providerMessageId: string;
  status: MessageStatus;
}

export interface ListConversationsInput {
  limit: number;
  offset: number;
  userId: string;
}

export interface ListMessagesInput extends ListConversationsInput {
  conversationId: string;
}

export interface ConversationPage {
  conversations: ConversationRecord[];
  limit: number;
  offset: number;
}

export interface MessagePage {
  conversation: ConversationRecord;
  limit: number;
  messages: MessageRecord[];
  offset: number;
}

export interface MessageStore {
  blockNumber(input: { blockedNumber: string; userId: string }): Promise<BlockRecord>;
  countDistinctOutboundParticipantsSince(input: {
    since: string;
    userId: string;
  }): Promise<number>;
  countDistinctParticipantsForOutboundBodySince(input: {
    body: string;
    since: string;
    userId: string;
  }): Promise<number>;
  countOutboundMessagesToParticipant(input: {
    participantNumber: string;
    userId: string;
  }): Promise<number>;
  createOutboundMessage(
    input: CreateOutboundMessageInput
  ): Promise<{ conversation: ConversationRecord; message: MessageRecord }>;
  createInboundMessage(
    input: CreateInboundMessageInput
  ): Promise<{ conversation: ConversationRecord; message: MessageRecord }>;
  findConversationByParticipant(
    input: FindConversationInput
  ): Promise<ConversationRecord | null>;
  findConversationById(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationRecord | null>;
  findConversationByMessageId(messageId: string): Promise<ConversationRecord | null>;
  findPushTokensByUser(userId: string): Promise<PushTokenRecord[]>;
  getOutboundUsage(userId: string): Promise<UsageCountRecord>;
  isBlocked(input: { blockedNumber: string; userId: string }): Promise<boolean>;
  listConversations(input: ListConversationsInput): Promise<ConversationPage>;
  listMessages(input: ListMessagesInput): Promise<MessagePage | null>;
  markConversationRead(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationRecord | null>;
  recordOptOutEvent(input: {
    conversationId: string;
    keyword: string;
    participantNumber: string;
    userId: string;
  }): Promise<void>;
  registerPushToken(input: {
    deviceId: string;
    platform: PushTokenRecord["platform"];
    token: string;
    userId: string;
  }): Promise<PushTokenRecord>;
  reportNumber(input: {
    reason: string;
    reportedNumber: string;
    userId: string;
  }): Promise<ReportRecord>;
  setConversationOptOut(input: {
    conversationId: string;
    isOptedOut: boolean;
    userId: string;
  }): Promise<ConversationRecord | null>;
  unblockNumber(input: { blockedNumber: string; userId: string }): Promise<boolean>;
  updateMessageAfterSend(
    input: UpdateMessageAfterSendInput
  ): Promise<MessageRecord | null>;
  updateMessageStatusById(input: UpdateMessageStatusByIdInput): Promise<MessageRecord | null>;
  updateMessageStatusByProviderMessageId(
    input: UpdateMessageStatusByProviderInput
  ): Promise<MessageRecord | null>;
}
