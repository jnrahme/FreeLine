import { createId } from "../auth/crypto.js";
import type { AdminStore, AdminUserRecord, InviteCodeRecord } from "./types.js";

export class InMemoryAdminStore implements AdminStore {
  private readonly adminUsers = new Map<string, AdminUserRecord>();
  private readonly adminUsersByEmail = new Map<string, string>();
  private readonly inviteCodes = new Map<string, InviteCodeRecord>();
  private readonly inviteCodesByCode = new Map<string, string>();

  async createAdminUser(input: {
    email: string;
    passwordHash: string;
    role?: "admin";
  }): Promise<AdminUserRecord> {
    const now = new Date().toISOString();
    const adminUser: AdminUserRecord = {
      createdAt: now,
      email: input.email.toLowerCase(),
      id: createId(),
      passwordHash: input.passwordHash,
      role: input.role ?? "admin",
      status: "active",
      updatedAt: now
    };

    this.adminUsers.set(adminUser.id, adminUser);
    this.adminUsersByEmail.set(adminUser.email, adminUser.id);
    return adminUser;
  }

  async createInviteCode(input: {
    code: string;
    createdByAdminId?: string | null;
    expiresAt?: string | null;
    maxUses: number;
  }): Promise<InviteCodeRecord> {
    const now = new Date().toISOString();
    const record: InviteCodeRecord = {
      code: input.code,
      createdAt: now,
      createdByAdminId: input.createdByAdminId ?? null,
      currentUses: 0,
      expiresAt: input.expiresAt ?? null,
      id: createId(),
      maxUses: input.maxUses,
      updatedAt: now
    };

    this.inviteCodes.set(record.id, record);
    this.inviteCodesByCode.set(record.code, record.id);
    return record;
  }

  async consumeInviteCodeByCode(code: string): Promise<InviteCodeRecord | null> {
    const invite = await this.findInviteCodeByCode(code);
    if (!invite) {
      return null;
    }

    return this.consumeInviteCodeById(invite.id);
  }

  async consumeInviteCodeById(inviteCodeId: string): Promise<InviteCodeRecord | null> {
    const invite = this.inviteCodes.get(inviteCodeId);
    if (!invite) {
      return null;
    }

    if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) {
      return null;
    }

    if (invite.currentUses >= invite.maxUses) {
      return null;
    }

    const nextInvite: InviteCodeRecord = {
      ...invite,
      currentUses: invite.currentUses + 1,
      updatedAt: new Date().toISOString()
    };

    this.inviteCodes.set(nextInvite.id, nextInvite);
    return nextInvite;
  }

  async findAdminUserByEmail(email: string): Promise<AdminUserRecord | null> {
    const adminUserId = this.adminUsersByEmail.get(email.toLowerCase());
    return adminUserId ? (this.adminUsers.get(adminUserId) ?? null) : null;
  }

  async findAdminUserById(adminUserId: string): Promise<AdminUserRecord | null> {
    return this.adminUsers.get(adminUserId) ?? null;
  }

  async findInviteCodeByCode(code: string): Promise<InviteCodeRecord | null> {
    const inviteCodeId = this.inviteCodesByCode.get(code);
    return inviteCodeId ? (this.inviteCodes.get(inviteCodeId) ?? null) : null;
  }

  async listInviteCodes(): Promise<InviteCodeRecord[]> {
    return Array.from(this.inviteCodes.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }
}
