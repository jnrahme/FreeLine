export type AdminRole = "admin";
export type AdminStatus = "active" | "disabled";

export interface AdminUserRecord {
  createdAt: string;
  email: string;
  id: string;
  passwordHash: string;
  role: AdminRole;
  status: AdminStatus;
  updatedAt: string;
}

export interface InviteCodeRecord {
  code: string;
  createdAt: string;
  createdByAdminId: string | null;
  currentUses: number;
  expiresAt: string | null;
  id: string;
  maxUses: number;
  updatedAt: string;
}

export interface AdminAccessToken {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface AdminStore {
  createAdminUser(input: {
    email: string;
    passwordHash: string;
    role?: AdminRole;
  }): Promise<AdminUserRecord>;
  createInviteCode(input: {
    code: string;
    createdByAdminId?: string | null;
    expiresAt?: string | null;
    maxUses: number;
  }): Promise<InviteCodeRecord>;
  consumeInviteCodeByCode(code: string): Promise<InviteCodeRecord | null>;
  consumeInviteCodeById(inviteCodeId: string): Promise<InviteCodeRecord | null>;
  findAdminUserByEmail(email: string): Promise<AdminUserRecord | null>;
  findAdminUserById(adminUserId: string): Promise<AdminUserRecord | null>;
  findInviteCodeByCode(code: string): Promise<InviteCodeRecord | null>;
  listInviteCodes(): Promise<InviteCodeRecord[]>;
}
