import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import type { OAuthVerifier, VerifiedOAuthIdentity } from "./types.js";

function parseDevIdentityToken(identityToken: string): VerifiedOAuthIdentity {
  const parts = identityToken.split(":");

  if (parts.length < 4 || parts[0] !== "dev") {
    throw new AppError(401, "invalid_oauth_token", "Invalid OAuth identity token.");
  }

  return {
    providerId: parts[1] || "dev-user",
    email: parts[2] || "dev@example.com",
    displayName: parts[3] ?? null
  };
}

export class DevOAuthVerifier implements OAuthVerifier {
  async verify(identityToken: string): Promise<VerifiedOAuthIdentity> {
    if (!env.ALLOW_DEV_OAUTH) {
      throw new AppError(
        501,
        "oauth_not_configured",
        "OAuth verifier is not configured for this environment."
      );
    }

    return parseDevIdentityToken(identityToken);
  }
}
