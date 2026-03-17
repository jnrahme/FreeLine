import type { WebSocket } from "ws";

import type {
  CallPushTokenRecord,
  IncomingCallPlan,
  VoicemailRecord
} from "../calls/types.js";
import type {
  ConversationRecord,
  MessageRecord,
  PushTokenRecord
} from "../messages/types.js";

export type RealtimeEventType = "message:inbound" | "message:status";

export interface RealtimeEvent {
  conversation: ConversationRecord;
  message: MessageRecord;
  type: RealtimeEventType;
  userId: string;
}

export interface PushNotifier {
  sendInboundCall(input: {
    plan: IncomingCallPlan;
    tokens: CallPushTokenRecord[];
  }): Promise<void>;
  sendInboundMessage(input: {
    conversation: ConversationRecord;
    message: MessageRecord;
    tokens: PushTokenRecord[];
  }): Promise<void>;
  sendNumberLifecycle(input: {
    message: string;
    phoneNumber: string;
    type:
      | "number:activation_released"
      | "number:warning_day_10"
      | "number:warning_day_13"
      | "number:reclaimed"
      | "number:restored";
    userId: string;
  }): Promise<void>;
  sendMissedCall(input: {
    call: {
      id: string;
      providerCallId: string;
      remoteNumber: string;
      userId: string;
    };
    tokens: CallPushTokenRecord[];
  }): Promise<void>;
  sendVoicemail(input: {
    tokens: CallPushTokenRecord[];
    voicemail: VoicemailRecord;
  }): Promise<void>;
}

export interface RealtimePublisher {
  publish(event: RealtimeEvent): Promise<void>;
}

export interface RealtimeGateway extends RealtimePublisher {
  attachConnection(input: { socket: WebSocket; userId: string }): void;
}
