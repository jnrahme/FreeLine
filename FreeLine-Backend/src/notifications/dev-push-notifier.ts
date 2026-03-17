import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { env, repoRoot } from "../config/env.js";
import type { PushNotifier } from "./types.js";

export class DevPushNotifier implements PushNotifier {
  async sendInboundCall(input: {
    plan: {
      action: "ring" | "voicemail";
      callerNumber: string;
      providerCallId: string;
      ringSeconds: number;
      tokens: Array<{
        channel: string;
        deviceId: string;
        platform: string;
        token: string;
      }>;
    };
    tokens: Array<{
      channel: string;
      deviceId: string;
      platform: string;
      token: string;
    }>;
  }): Promise<void> {
    await this.appendEvent({
      action: input.plan.action,
      callerNumber: input.plan.callerNumber,
      providerCallId: input.plan.providerCallId,
      ringSeconds: input.plan.ringSeconds,
      tokens: input.tokens,
      type: "call:inbound"
    });
  }

  async sendInboundMessage(input: {
    conversation: {
      id: string;
      participantNumber: string;
      userId: string;
    };
    message: {
      body: string;
      id: string;
    };
    tokens: Array<{
      deviceId: string;
      platform: string;
      token: string;
    }>;
  }): Promise<void> {
    await this.appendEvent({
      conversationId: input.conversation.id,
      messageId: input.message.id,
      participantNumber: input.conversation.participantNumber,
      preview: input.message.body.slice(0, 120),
      tokens: input.tokens,
      type: "message:inbound"
    });
  }

  async sendNumberLifecycle(input: {
    message: string;
    phoneNumber: string;
    type:
      | "number:activation_released"
      | "number:warning_day_10"
      | "number:warning_day_13"
      | "number:reclaimed"
      | "number:restored";
    userId: string;
  }): Promise<void> {
    await this.appendEvent({
      message: input.message,
      phoneNumber: input.phoneNumber,
      type: input.type,
      userId: input.userId
    });
  }

  async sendMissedCall(input: {
    call: {
      id: string;
      providerCallId: string;
      remoteNumber: string;
      userId: string;
    };
    tokens: Array<{
      channel: string;
      deviceId: string;
      platform: string;
      token: string;
    }>;
  }): Promise<void> {
    await this.appendEvent({
      callId: input.call.id,
      callerNumber: input.call.remoteNumber,
      providerCallId: input.call.providerCallId,
      tokens: input.tokens,
      type: "call:missed"
    });
  }

  async sendVoicemail(input: {
    tokens: Array<{
      channel: string;
      deviceId: string;
      platform: string;
      token: string;
    }>;
    voicemail: {
      callerNumber: string;
      durationSeconds: number;
      id: string;
      providerCallId: string;
    };
  }): Promise<void> {
    await this.appendEvent({
      callerNumber: input.voicemail.callerNumber,
      durationSeconds: input.voicemail.durationSeconds,
      providerCallId: input.voicemail.providerCallId,
      tokens: input.tokens,
      voicemailId: input.voicemail.id,
      type: "voicemail:new"
    });
  }

  private async appendEvent(payload: Record<string, unknown>): Promise<void> {
    const outputDir = path.join(repoRoot, env.DEV_MAILBOX_DIR.replace(/^\.runtime/, ".runtime"));
    const outputFile = path.join(outputDir, "push-events.jsonl");
    await mkdir(path.dirname(outputFile), { recursive: true });
    await appendFile(outputFile, `${JSON.stringify(payload)}\n`, "utf8");
  }
}
