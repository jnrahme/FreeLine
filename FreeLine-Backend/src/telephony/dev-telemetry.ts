import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { env, repoRoot } from "../config/env.js";

export async function recordSmsEvent(input: {
  body: string;
  externalId: string;
  from: string;
  provider: "bandwidth" | "twilio";
  to: string;
}): Promise<void> {
  const outputDir = path.join(repoRoot, env.DEV_MAILBOX_DIR.replace(/^\.runtime/, ".runtime"));
  const outputFile = path.join(outputDir, "telephony-sms.jsonl");
  await mkdir(path.dirname(outputFile), { recursive: true });
  await appendFile(
    outputFile,
    `${JSON.stringify({
      body: input.body,
      externalId: input.externalId,
      from: input.from,
      provider: input.provider,
      to: input.to
    })}\n`,
    "utf8"
  );
}
