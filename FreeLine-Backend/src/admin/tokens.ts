import { SignJWT, jwtVerify } from "jose";

import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import type { AdminAccessToken, AdminUserRecord } from "./types.js";

const encoder = new TextEncoder();

export interface AdminTokenPayload {
  adminUserId: string;
  email: string;
  role: "admin";
  type: "admin_access";
}

function getAdminSecret(): Uint8Array {
  return encoder.encode(env.ADMIN_JWT_SECRET);
}

export async function issueAdminAccessToken(
  adminUser: AdminUserRecord
): Promise<AdminAccessToken> {
  const now = new Date();
  const accessExpiresAt = new Date(
    now.getTime() + env.ADMIN_ACCESS_TOKEN_TTL_MINUTES * 60_000
  );

  const accessToken = await new SignJWT({
    adminUserId: adminUser.id,
    email: adminUser.email,
    role: adminUser.role,
    type: "admin_access"
  } satisfies AdminTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminUser.id)
    .setIssuedAt(now)
    .setExpirationTime(accessExpiresAt)
    .sign(getAdminSecret());

  return {
    accessToken,
    accessTokenExpiresAt: accessExpiresAt.toISOString()
  };
}

export async function verifyAdminAccessToken(
  token: string
): Promise<AdminTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getAdminSecret());

    if (
      payload.type !== "admin_access" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      payload.role !== "admin" ||
      typeof payload.adminUserId !== "string"
    ) {
      throw new AppError(401, "invalid_admin_token", "Invalid admin access token.");
    }

    return {
      adminUserId: payload.adminUserId,
      email: payload.email,
      role: "admin",
      type: "admin_access"
    };
  } catch {
    throw new AppError(401, "invalid_admin_token", "Invalid or expired admin token.");
  }
}
