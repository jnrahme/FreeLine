import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { env, repoRoot } from "../config/env.js";

export type AnalyticsEventType =
  | "ad_impression"
  | "ad_click"
  | "rewarded_video_complete"
  | "rewarded_video_abandoned";

export class AnalyticsService {
  constructor(private readonly outputFile?: string) {}

  async trackEvent(input: {
    eventType: AnalyticsEventType;
    properties: Record<string, unknown>;
    userId: string;
  }): Promise<{ accepted: boolean; eventType: AnalyticsEventType }> {
    const outputFile =
      this.outputFile ??
      path.join(
        repoRoot,
        env.DEV_MAILBOX_DIR.replace(/^\.runtime/, ".runtime"),
        "analytics-events.jsonl"
      );
    await mkdir(path.dirname(outputFile), { recursive: true });
    await appendFile(
      outputFile,
      `${JSON.stringify({
        eventType: input.eventType,
        properties: input.properties,
        recordedAt: new Date().toISOString(),
        userId: input.userId
      })}\n`,
      "utf8"
    );

    return {
      accepted: true,
      eventType: input.eventType
    };
  }
}
