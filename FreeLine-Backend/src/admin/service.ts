import crypto from "node:crypto";

import { hashPassword, verifyPassword } from "../auth/password.js";
import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import { issueAdminAccessToken } from "./tokens.js";
import type { AdminStore, AdminUserRecord, InviteCodeRecord } from "./types.js";

export class AdminService {
  constructor(private readonly store: AdminStore) {}

  async ensureBootstrapAdmin(): Promise<AdminUserRecord> {
    const email = env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase();
    const existing = await this.store.findAdminUserByEmail(email);
    if (existing) {
      return existing;
    }

    return this.store.createAdminUser({
      email,
      passwordHash: await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD),
      role: "admin"
    });
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{
    admin: Pick<AdminUserRecord, "email" | "id" | "role" | "status">;
    tokens: Awaited<ReturnType<typeof issueAdminAccessToken>>;
  }> {
    await this.ensureBootstrapAdmin();

    const email = input.email.trim().toLowerCase();
    const adminUser = await this.store.findAdminUserByEmail(email);

    if (!adminUser || adminUser.status !== "active") {
      throw new AppError(401, "invalid_admin_credentials", "Invalid admin credentials.");
    }

    const passwordMatches = await verifyPassword(input.password, adminUser.passwordHash);
    if (!passwordMatches) {
      throw new AppError(401, "invalid_admin_credentials", "Invalid admin credentials.");
    }

    return {
      admin: {
        email: adminUser.email,
        id: adminUser.id,
        role: adminUser.role,
        status: adminUser.status
      },
      tokens: await issueAdminAccessToken(adminUser)
    };
  }

  async getAdminUser(adminUserId: string): Promise<AdminUserRecord> {
    const adminUser = await this.store.findAdminUserById(adminUserId);
    if (!adminUser) {
      throw new AppError(404, "admin_user_not_found", "Admin user not found.");
    }

    return adminUser;
  }

  async listInviteCodes(): Promise<InviteCodeRecord[]> {
    return this.store.listInviteCodes();
  }

  async createInviteCode(input: {
    adminUserId: string;
    code?: string | null;
    expiresAt?: string | null;
    maxUses: number;
  }): Promise<InviteCodeRecord> {
    if (input.maxUses < 1) {
      throw new AppError(
        400,
        "invalid_invite_code",
        "Invite codes must allow at least one use."
      );
    }

    const inviteCode = (input.code?.trim() || crypto.randomUUID().slice(0, 8)).toUpperCase();
    const existing = await this.store.findInviteCodeByCode(inviteCode);
    if (existing) {
      throw new AppError(
        409,
        "invite_code_exists",
        "That invite code already exists."
      );
    }

    if (input.expiresAt && Number.isNaN(new Date(input.expiresAt).getTime())) {
      throw new AppError(400, "invalid_invite_code", "Invite code expiry is invalid.");
    }

    return this.store.createInviteCode({
      code: inviteCode,
      createdByAdminId: input.adminUserId,
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses
    });
  }

  async assertInviteCodeUsable(code: string | null | undefined): Promise<InviteCodeRecord> {
    if (!env.BETA_MODE) {
      throw new AppError(
        500,
        "invite_code_not_required",
        "Invite validation should not run when beta mode is disabled."
      );
    }

    const normalized = code?.trim().toUpperCase();
    if (!normalized) {
      throw new AppError(
        403,
        "invite_code_required",
        "A valid invite code is required while beta mode is enabled."
      );
    }

    const inviteCode = await this.store.findInviteCodeByCode(normalized);
    if (!inviteCode) {
      throw new AppError(403, "invite_code_invalid", "Invite code is invalid.");
    }

    if (inviteCode.expiresAt && new Date(inviteCode.expiresAt) <= new Date()) {
      throw new AppError(403, "invite_code_expired", "Invite code has expired.");
    }

    if (inviteCode.currentUses >= inviteCode.maxUses) {
      throw new AppError(403, "invite_code_exhausted", "Invite code has no uses left.");
    }

    return inviteCode;
  }

  async consumeInviteCodeByCode(code: string): Promise<InviteCodeRecord> {
    const inviteCode = await this.store.consumeInviteCodeByCode(code.trim().toUpperCase());
    if (!inviteCode) {
      throw new AppError(403, "invite_code_invalid", "Invite code is invalid.");
    }

    return inviteCode;
  }

  async consumeInviteCodeById(inviteCodeId: string): Promise<InviteCodeRecord> {
    const inviteCode = await this.store.consumeInviteCodeById(inviteCodeId);
    if (!inviteCode) {
      throw new AppError(403, "invite_code_invalid", "Invite code is invalid.");
    }

    return inviteCode;
  }
}
