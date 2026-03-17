import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import type { CaptchaVerifier } from "./types.js";

export class ConfigurableCaptchaVerifier implements CaptchaVerifier {
  async verify(token: string | null | undefined): Promise<void> {
    if (!env.CAPTCHA_ENABLED) {
      return;
    }

    if (!token) {
      throw new AppError(400, "captcha_required", "CAPTCHA token is required.");
    }

    throw new AppError(
      501,
      "captcha_not_configured",
      "CAPTCHA verification provider is not configured yet."
    );
  }
}
