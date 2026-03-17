import { SignJWT, jwtVerify } from "jose";

import { env } from "../config/env.js";
import { createOpaqueToken, hashOpaqueToken } from "./crypto.js";
import type { AuthStore, AuthTokens, UserRecord } from "./types.js";
import { AppError } from "./errors.js";

const encoder = new TextEncoder();

export interface AccessTokenPayload {
  userId: string;
  email: string;
  type: "access";
}

function getJwtSecret(): Uint8Array {
  return encoder.encode(env.JWT_SECRET);
}

export async function issueTokens(
  store: AuthStore,
  user: UserRecord
): Promise<AuthTokens> {
  const now = new Date();
  const accessExpiresAt = new Date(
    now.getTime() + env.ACCESS_TOKEN_TTL_MINUTES * 60_000
  );
  const refreshExpiresAt = new Date(
    now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000
  );
  const refreshToken = createOpaqueToken();

  await store.storeRefreshToken({
    userId: user.id,
    tokenHash: hashOpaqueToken(refreshToken),
    expiresAt: refreshExpiresAt.toISOString()
  });

  const accessToken = await new SignJWT({
    email: user.email,
    type: "access",
    userId: user.id
  } satisfies AccessTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(accessExpiresAt)
    .sign(getJwtSecret());

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessExpiresAt.toISOString(),
    refreshTokenExpiresAt: refreshExpiresAt.toISOString()
  };
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());

    if (
      payload.type !== "access" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.userId !== "string"
    ) {
      throw new AppError(401, "invalid_token", "Invalid access token.");
    }

    return {
      email: payload.email,
      type: "access",
      userId: payload.userId
    };
  } catch {
    throw new AppError(401, "invalid_token", "Invalid or expired access token.");
  }
}

export async function rotateRefreshToken(
  store: AuthStore,
  refreshToken: string,
  user: UserRecord
): Promise<AuthTokens> {
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const existing = await store.findRefreshToken(refreshTokenHash);

  if (!existing || existing.revokedAt || new Date(existing.expiresAt) <= new Date()) {
    throw new AppError(401, "invalid_refresh_token", "Refresh token is invalid.");
  }

  await store.revokeRefreshToken(refreshTokenHash);
  return issueTokens(store, user);
}

export function createVerificationLink(token: string): string {
  const previewToken = encodeURIComponent(token);
  return `freeline://verify-email?token=${previewToken}`;
}
