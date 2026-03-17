import type { PoolClient } from "pg";

import { createId } from "../auth/crypto.js";
import { getPostgresPool } from "../services/postgres.js";
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

function mapConversation(row: Record<string, unknown>): ConversationRecord {
  return {
    createdAt: String(row.created_at),
    id: String(row.id),
    isOptedOut: Boolean(row.is_opted_out),
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    lastMessagePreview: (row.last_message_preview as string | null) ?? null,
    lastMessageStatus: (row.last_message_status as ConversationRecord["lastMessageStatus"]) ?? null,
    participantNumber: String(row.participant_number),
    phoneNumberId: String(row.phone_number_id),
    unreadCount: Number(row.unread_count),
    updatedAt: String(row.updated_at),
    userId: String(row.user_id)
  };
}

function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    body: String(row.body),
    conversationId: String(row.conversation_id),
    createdAt: String(row.created_at),
    direction: row.direction as MessageRecord["direction"],
    id: String(row.id),
    providerMessageId: (row.provider_message_id as string | null) ?? null,
    status: row.status as MessageRecord["status"],
    updatedAt: String(row.updated_at)
  };
}

function mapPushToken(row: Record<string, unknown>): PushTokenRecord {
  return {
    createdAt: String(row.created_at),
    deviceId: String(row.device_id),
    id: String(row.id),
    platform: row.platform as PushTokenRecord["platform"],
    token: String(row.token),
    updatedAt: String(row.updated_at),
    userId: String(row.user_id)
  };
}

function mapBlock(row: Record<string, unknown>): BlockRecord {
  return {
    blockedNumber: String(row.blocked_number),
    createdAt: String(row.created_at),
    id: String(row.id),
    userId: String(row.user_id)
  };
}

function mapReport(row: Record<string, unknown>): ReportRecord {
  return {
    createdAt: String(row.created_at),
    id: String(row.id),
    reason: String(row.reason),
    reportedNumber: String(row.reported_number),
    userId: String(row.user_id)
  };
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function findConversation(
  client: PoolClient,
  clause: string,
  values: unknown[]
): Promise<ConversationRecord | null> {
  const result = await client.query(
    `
      select
        c.id,
        c.user_id,
        c.phone_number_id,
        c.participant_number,
        c.last_message_at,
        c.unread_count,
        c.is_opted_out,
        c.created_at,
        c.updated_at,
        lm.body as last_message_preview,
        lm.status as last_message_status
      from conversations c
      left join lateral (
        select m.body, m.status
        from messages m
        where m.conversation_id = c.id
        order by m.created_at desc
        limit 1
      ) lm on true
      where ${clause}
      limit 1
    `,
    values
  );

  return result.rowCount ? mapConversation(result.rows[0] as Record<string, unknown>) : null;
}

export class PostgresMessageStore implements MessageStore {
  async countDistinctOutboundParticipantsSince(input: {
    since: string;
    userId: string;
  }): Promise<number> {
    return withClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `
          select count(distinct c.participant_number) as count
          from messages m
          join conversations c on c.id = m.conversation_id
          where c.user_id = $1
            and m.direction = 'outbound'
            and m.created_at >= $2
        `,
        [input.userId, input.since]
      );

      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async countDistinctParticipantsForOutboundBodySince(input: {
    body: string;
    since: string;
    userId: string;
  }): Promise<number> {
    return withClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `
          select count(distinct c.participant_number) as count
          from messages m
          join conversations c on c.id = m.conversation_id
          where c.user_id = $1
            and m.direction = 'outbound'
            and m.created_at >= $2
            and m.body = $3
        `,
        [input.userId, input.since, input.body.trim()]
      );

      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async countOutboundMessagesToParticipant(input: {
    participantNumber: string;
    userId: string;
  }): Promise<number> {
    return withClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `
          select count(*) as count
          from messages m
          join conversations c on c.id = m.conversation_id
          where c.user_id = $1
            and c.participant_number = $2
            and m.direction = 'outbound'
        `,
        [input.userId, input.participantNumber]
      );

      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async createOutboundMessage(
    input: CreateOutboundMessageInput
  ): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    return this.createMessage({
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
    return this.createMessage({
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
    return withClient((client) =>
      findConversation(
        client,
        "c.user_id = $1 and c.phone_number_id = $2 and c.participant_number = $3",
        [input.userId, input.phoneNumberId, input.participantNumber]
      )
    );
  }

  async findConversationById(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationRecord | null> {
    return withClient((client) =>
      findConversation(client, "c.id = $1 and c.user_id = $2", [
        input.conversationId,
        input.userId
      ])
    );
  }

  async findConversationByMessageId(messageId: string): Promise<ConversationRecord | null> {
    return withClient((client) =>
      findConversation(
        client,
        `c.id = (
          select m.conversation_id
          from messages m
          where m.id = $1
          limit 1
        )`,
        [messageId]
      )
    );
  }

  async getOutboundUsage(userId: string): Promise<UsageCountRecord> {
    return withClient(async (client) => {
      const result = await client.query<{
        daily_used: string;
        monthly_used: string;
      }>(
        `
          select
            count(*) filter (where m.created_at >= date_trunc('day', now())) as daily_used,
            count(*) filter (where m.created_at >= date_trunc('month', now())) as monthly_used
          from messages m
          join conversations c on c.id = m.conversation_id
          where c.user_id = $1
        `,
        [userId]
      );

      return {
        dailyUsed: Number(result.rows[0]?.daily_used ?? 0),
        monthlyUsed: Number(result.rows[0]?.monthly_used ?? 0)
      };
    });
  }

  async listConversations(input: ListConversationsInput): Promise<ConversationPage> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select
            c.id,
            c.user_id,
            c.phone_number_id,
            c.participant_number,
            c.last_message_at,
            c.unread_count,
            c.is_opted_out,
            c.created_at,
            c.updated_at,
            lm.body as last_message_preview,
            lm.status as last_message_status
          from conversations c
          left join lateral (
            select m.body, m.status
            from messages m
            where m.conversation_id = c.id
            order by m.created_at desc
            limit 1
          ) lm on true
          where c.user_id = $1
          order by c.last_message_at desc nulls last, c.created_at desc
          limit $2
          offset $3
        `,
        [input.userId, input.limit, input.offset]
      );

      return {
        conversations: result.rows.map((row) =>
          mapConversation(row as Record<string, unknown>)
        ),
        limit: input.limit,
        offset: input.offset
      };
    });
  }

  async listMessages(input: ListMessagesInput): Promise<MessagePage | null> {
    return withClient(async (client) => {
      const conversation = await findConversation(
        client,
        "c.id = $1 and c.user_id = $2",
        [input.conversationId, input.userId]
      );

      if (!conversation) {
        return null;
      }

      const result = await client.query(
        `
          select
            id,
            conversation_id,
            direction,
            body,
            status,
            provider_message_id,
            created_at,
            updated_at
          from messages
          where conversation_id = $1
          order by created_at asc
          limit $2
          offset $3
        `,
        [input.conversationId, input.limit, input.offset]
      );

      return {
        conversation,
        limit: input.limit,
        messages: result.rows.map((row) => mapMessage(row as Record<string, unknown>)),
        offset: input.offset
      };
    });
  }

  async markConversationRead(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          update conversations
          set unread_count = 0,
              updated_at = now()
          where id = $1
            and user_id = $2
          returning id
        `,
        [input.conversationId, input.userId]
      );

      if (!result.rowCount) {
        return null;
      }

      return findConversation(client, "c.id = $1", [input.conversationId]);
    });
  }

  async setConversationOptOut(input: {
    conversationId: string;
    isOptedOut: boolean;
    userId: string;
  }): Promise<ConversationRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          update conversations
          set is_opted_out = $3,
              updated_at = now()
          where id = $1
            and user_id = $2
          returning id
        `,
        [input.conversationId, input.userId, input.isOptedOut]
      );

      if (!result.rowCount) {
        return null;
      }

      return findConversation(client, "c.id = $1", [input.conversationId]);
    });
  }

  async blockNumber(input: { blockedNumber: string; userId: string }): Promise<BlockRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into blocks (
            id,
            user_id,
            blocked_number
          )
          values ($1, $2, $3)
          on conflict (user_id, blocked_number)
          do update set blocked_number = excluded.blocked_number
          returning *
        `,
        [createId(), input.userId, input.blockedNumber]
      );

      return mapBlock(result.rows[0] as Record<string, unknown>);
    });
  }

  async unblockNumber(input: {
    blockedNumber: string;
    userId: string;
  }): Promise<boolean> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          delete from blocks
          where user_id = $1
            and blocked_number = $2
        `,
        [input.userId, input.blockedNumber]
      );

      return (result.rowCount ?? 0) > 0;
    });
  }

  async isBlocked(input: { blockedNumber: string; userId: string }): Promise<boolean> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select 1
          from blocks
          where user_id = $1
            and blocked_number = $2
          limit 1
        `,
        [input.userId, input.blockedNumber]
      );

      return (result.rowCount ?? 0) > 0;
    });
  }

  async reportNumber(input: {
    reason: string;
    reportedNumber: string;
    userId: string;
  }): Promise<ReportRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into reports (
            id,
            user_id,
            reported_number,
            reason
          )
          values ($1, $2, $3, $4)
          returning *
        `,
        [createId(), input.userId, input.reportedNumber, input.reason]
      );

      return mapReport(result.rows[0] as Record<string, unknown>);
    });
  }

  async registerPushToken(input: {
    deviceId: string;
    platform: PushTokenRecord["platform"];
    token: string;
    userId: string;
  }): Promise<PushTokenRecord> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          insert into push_tokens (
            id,
            user_id,
            device_id,
            token,
            platform
          )
          values ($1, $2, $3, $4, $5)
          on conflict (user_id, device_id, platform)
          do update set token = excluded.token,
                        updated_at = now()
          returning *
        `,
        [createId(), input.userId, input.deviceId, input.token, input.platform]
      );

      return mapPushToken(result.rows[0] as Record<string, unknown>);
    });
  }

  async findPushTokensByUser(userId: string): Promise<PushTokenRecord[]> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          select *
          from push_tokens
          where user_id = $1
          order by created_at asc
        `,
        [userId]
      );

      return result.rows.map((row) => mapPushToken(row as Record<string, unknown>));
    });
  }

  async recordOptOutEvent(input: {
    conversationId: string;
    keyword: string;
    participantNumber: string;
    userId: string;
  }): Promise<void> {
    return withClient(async (client) => {
      await client.query(
        `
          insert into opt_out_events (
            id,
            conversation_id,
            user_id,
            participant_number,
            keyword
          )
          values ($1, $2, $3, $4, $5)
        `,
        [
          createId(),
          input.conversationId,
          input.userId,
          input.participantNumber,
          input.keyword
        ]
      );
    });
  }

  async updateMessageAfterSend(input: {
    messageId: string;
    providerMessageId: string;
    status: MessageStatus;
  }): Promise<MessageRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          update messages
          set provider_message_id = $2,
              status = $3,
              updated_at = now()
          where id = $1
          returning *
        `,
        [input.messageId, input.providerMessageId, input.status]
      );

      return result.rowCount ? mapMessage(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async updateMessageStatusById(input: {
    messageId: string;
    status: MessageStatus;
  }): Promise<MessageRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          update messages
          set status = $2,
              updated_at = now()
          where id = $1
          returning *
        `,
        [input.messageId, input.status]
      );

      return result.rowCount ? mapMessage(result.rows[0] as Record<string, unknown>) : null;
    });
  }

  async updateMessageStatusByProviderMessageId(input: {
    providerMessageId: string;
    status: MessageStatus;
  }): Promise<MessageRecord | null> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          update messages
          set status = $2,
              updated_at = now()
          where provider_message_id = $1
          returning *
        `,
        [input.providerMessageId, input.status]
      );

      return result.rowCount ? mapMessage(result.rows[0] as Record<string, unknown>) : null;
    });
  }
  private async createMessage(input: {
    body: string;
    direction: MessageRecord["direction"];
    participantNumber: string;
    phoneNumberId: string;
    status: MessageStatus;
    unreadDelta: number;
    userId: string;
  }): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
    return withClient(async (client) => {
      await client.query("begin");

      try {
        const conversationId = createId();
        const messageId = createId();
        const now = new Date().toISOString();

        const conversationResult = await client.query(
          `
            insert into conversations (
              id,
              user_id,
              phone_number_id,
              participant_number
            )
            values ($1, $2, $3, $4)
            on conflict (user_id, phone_number_id, participant_number)
            do update set updated_at = now()
            returning id
          `,
          [conversationId, input.userId, input.phoneNumberId, input.participantNumber]
        );

        const persistedConversationId = String(conversationResult.rows[0]?.id);

        const messageResult = await client.query(
          `
            insert into messages (
              id,
              conversation_id,
              direction,
              body,
              status
            )
            values ($1, $2, $3, $4, $5)
            returning *
          `,
          [messageId, persistedConversationId, input.direction, input.body, input.status]
        );

        await client.query(
          `
            update conversations
            set last_message_at = $2,
                unread_count = unread_count + $3,
                updated_at = now()
            where id = $1
          `,
          [persistedConversationId, now, input.unreadDelta]
        );

        const conversation = await findConversation(client, "c.id = $1", [
          persistedConversationId
        ]);
        await client.query("commit");

        if (!conversation) {
          throw new Error("Conversation was not persisted.");
        }

        return {
          conversation,
          message: mapMessage(messageResult.rows[0] as Record<string, unknown>)
        };
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  }
}
