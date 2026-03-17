import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { env, repoRoot } from "../config/env.js";
import type { RealtimeEvent, RealtimePublisher } from "./types.js";

export class DevRealtimePublisher implements RealtimePublisher {
  async publish(event: RealtimeEvent): Promise<void> {
    const outputDir = path.join(repoRoot, env.DEV_MAILBOX_DIR.replace(/^\.runtime/, ".runtime"));
    const outputFile = path.join(outputDir, "realtime-events.jsonl");
    await mkdir(path.dirname(outputFile), { recursive: true });
    await appendFile(
      outputFile,
      `${JSON.stringify({
        conversationId: event.conversation.id,
        messageId: event.message.id,
        participantNumber: event.conversation.participantNumber,
        status: event.message.status,
        type: event.type,
        userId: event.userId
      })}\n`,
      "utf8"
    );
  }
}
