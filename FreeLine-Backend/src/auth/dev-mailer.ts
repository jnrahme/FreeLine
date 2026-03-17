import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env, repoRoot } from "../config/env.js";
import type { SentVerification, VerificationMailer } from "./types.js";

function sanitizeEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class DevMailboxMailer implements VerificationMailer {
  async sendEmailVerification(input: {
    email: string;
    verificationLink: string;
  }): Promise<SentVerification> {
    const mailboxDir = path.resolve(repoRoot, env.DEV_MAILBOX_DIR);
    await mkdir(mailboxDir, { recursive: true });

    const filePath = path.join(
      mailboxDir,
      `${sanitizeEmail(input.email)}.json`
    );

    await writeFile(
      filePath,
      JSON.stringify(
        {
          email: input.email,
          sentAt: new Date().toISOString(),
          verificationLink: input.verificationLink
        },
        null,
        2
      )
    );

    return {
      delivery: "dev_mailbox",
      previewLink: input.verificationLink
    };
  }
}
