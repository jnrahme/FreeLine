import fs from "node:fs/promises";
import path from "node:path";

import { AppError } from "../auth/errors.js";
import { env, repoRoot } from "../config/env.js";

export interface ArchivedVoicemailMedia {
  body: Buffer;
  contentType: string;
}

export interface VoicemailArchive {
  archiveRecording(input: {
    sourceUrl: string;
    voicemailId: string;
  }): Promise<void>;
  buildPlaybackUrl(input: { voicemailId: string }): string;
  deleteRecording(input: { voicemailId: string }): Promise<void>;
  readRecording(input: {
    voicemailId: string;
  }): Promise<ArchivedVoicemailMedia | null>;
}

function resolveArchiveDir(archiveDir: string): string {
  return path.isAbsolute(archiveDir) ? archiveDir : path.join(repoRoot, archiveDir);
}

function guessContentTypeFromUrl(sourceUrl: string): string {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const extension = path.extname(pathname);

    switch (extension) {
      case ".aac":
        return "audio/aac";
      case ".m4a":
        return "audio/mp4";
      case ".mp3":
        return "audio/mpeg";
      case ".ogg":
        return "audio/ogg";
      case ".wav":
        return "audio/wav";
      default:
        return "application/octet-stream";
    }
  } catch {
    return "application/octet-stream";
  }
}

export class LocalVoicemailArchive implements VoicemailArchive {
  private readonly archiveDir: string;

  constructor(archiveDir = env.VOICEMAIL_ARCHIVE_DIR) {
    this.archiveDir = resolveArchiveDir(archiveDir);
  }

  buildPlaybackUrl(input: { voicemailId: string }): string {
    return new URL(`/v1/voicemails/media/${input.voicemailId}`, env.PUBLIC_BASE_URL).toString();
  }

  async archiveRecording(input: {
    sourceUrl: string;
    voicemailId: string;
  }): Promise<void> {
    let response: Response;

    try {
      response = await fetch(input.sourceUrl);
    } catch (error) {
      throw new AppError(
        502,
        "voicemail_archive_failed",
        "Unable to download the voicemail recording from the provider.",
        {
          reason: error instanceof Error ? error.message : String(error),
          sourceUrl: input.sourceUrl
        }
      );
    }

    if (!response.ok) {
      throw new AppError(
        502,
        "voicemail_archive_failed",
        "Unable to download the voicemail recording from the provider.",
        {
          sourceUrl: input.sourceUrl,
          statusCode: response.status
        }
      );
    }

    const body = Buffer.from(await response.arrayBuffer());
    const contentTypeHeader = response.headers.get("content-type")?.split(";")[0]?.trim();
    const contentType =
      contentTypeHeader && contentTypeHeader.length > 0
        ? contentTypeHeader
        : guessContentTypeFromUrl(input.sourceUrl);

    await fs.mkdir(this.archiveDir, { recursive: true });
    await Promise.all([
      fs.writeFile(this.recordingPath(input.voicemailId), body),
      fs.writeFile(
        this.metadataPath(input.voicemailId),
        JSON.stringify({
          contentType,
          sourceUrl: input.sourceUrl,
          storedAt: new Date().toISOString()
        })
      )
    ]);
  }

  async deleteRecording(input: { voicemailId: string }): Promise<void> {
    await Promise.all([
      fs.rm(this.recordingPath(input.voicemailId), { force: true }),
      fs.rm(this.metadataPath(input.voicemailId), { force: true })
    ]);
  }

  async readRecording(input: {
    voicemailId: string;
  }): Promise<ArchivedVoicemailMedia | null> {
    try {
      const [body, metadataJson] = await Promise.all([
        fs.readFile(this.recordingPath(input.voicemailId)),
        fs.readFile(this.metadataPath(input.voicemailId), "utf8")
      ]);
      const metadata = JSON.parse(metadataJson) as {
        contentType?: string;
      };

      return {
        body,
        contentType: metadata.contentType ?? "application/octet-stream"
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }
  }

  private metadataPath(voicemailId: string): string {
    return path.join(this.archiveDir, `${voicemailId}.json`);
  }

  private recordingPath(voicemailId: string): string {
    return path.join(this.archiveDir, `${voicemailId}.bin`);
  }
}
