import { createId } from "./crypto.js";
import type {
  AuthIdentityRecord,
  AuthProvider,
  AuthStore,
  DevicePlatform,
  DeviceRecord,
  EmailVerificationRecord,
  RefreshTokenRecord,
  UserRecord
} from "./types.js";

export class InMemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly identities = new Map<string, AuthIdentityRecord>();
  private readonly emailVerifications = new Map<string, EmailVerificationRecord>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly devices = new Map<string, DeviceRecord>();

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const id = this.usersByEmail.get(email.toLowerCase());
    return id ? (this.users.get(id) ?? null) : null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    return this.users.get(userId) ?? null;
  }

  async createUser(input: {
    email: string;
    displayName?: string | null;
  }): Promise<UserRecord> {
    const now = new Date().toISOString();
    const user: UserRecord = {
      createdAt: now,
      displayName: input.displayName ?? null,
      email: input.email.toLowerCase(),
      id: createId(),
      status: "active",
      trustScore: 50,
      updatedAt: now
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
    return user;
  }

  async markUserDeleted(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      return;
    }

    this.users.set(userId, {
      ...user,
      status: "deleted",
      updatedAt: new Date().toISOString()
    });
  }

  async findIdentity(
    provider: AuthProvider,
    providerId: string
  ): Promise<AuthIdentityRecord | null> {
    return this.identities.get(`${provider}:${providerId}`) ?? null;
  }

  async createIdentity(input: {
    userId: string;
    provider: AuthProvider;
    providerId: string;
    passwordHash?: string | null;
  }): Promise<AuthIdentityRecord> {
    const record: AuthIdentityRecord = {
      createdAt: new Date().toISOString(),
      id: createId(),
      passwordHash: input.passwordHash ?? null,
      provider: input.provider,
      providerId: input.providerId,
      userId: input.userId
    };

    this.identities.set(`${input.provider}:${input.providerId}`, record);
    return record;
  }

  async updateEmailPasswordHash(userId: string, passwordHash: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (!user) {
      return;
    }

    const identity = await this.findIdentity("email", user.email);
    if (!identity) {
      await this.createIdentity({
        passwordHash,
        provider: "email",
        providerId: user.email,
        userId
      });
      return;
    }

    this.identities.set(`email:${user.email}`, {
      ...identity,
      passwordHash
    });
  }

  async createEmailVerification(input: {
    userId?: string | null;
    inviteCodeId?: string | null;
    email: string;
    passwordHash: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<EmailVerificationRecord> {
    const record: EmailVerificationRecord = {
      consumedAt: null,
      createdAt: new Date().toISOString(),
      email: input.email.toLowerCase(),
      expiresAt: input.expiresAt,
      id: createId(),
      inviteCodeId: input.inviteCodeId ?? null,
      passwordHash: input.passwordHash,
      tokenHash: input.tokenHash,
      userId: input.userId ?? null
    };

    this.emailVerifications.set(input.tokenHash, record);
    return record;
  }

  async consumeEmailVerification(tokenHash: string): Promise<EmailVerificationRecord | null> {
    const record = this.emailVerifications.get(tokenHash);
    if (!record || record.consumedAt || new Date(record.expiresAt) <= new Date()) {
      return null;
    }

    const nextRecord = {
      ...record,
      consumedAt: new Date().toISOString()
    };

    this.emailVerifications.set(tokenHash, nextRecord);
    return nextRecord;
  }

  async createOrUpdateDevice(input: {
    userId: string;
    fingerprint: string;
    platform: DevicePlatform;
    pushToken?: string | null;
  }): Promise<DeviceRecord> {
    const existing = Array.from(this.devices.values()).find(
      (device) =>
        device.userId === input.userId && device.fingerprint === input.fingerprint
    );

    const now = new Date().toISOString();

    if (existing) {
      const nextRecord = {
        ...existing,
        platform: input.platform,
        pushToken: input.pushToken ?? null,
        updatedAt: now
      };
      this.devices.set(existing.id, nextRecord);
      return nextRecord;
    }

    const record: DeviceRecord = {
      createdAt: now,
      fingerprint: input.fingerprint,
      id: createId(),
      platform: input.platform,
      pushToken: input.pushToken ?? null,
      updatedAt: now,
      userId: input.userId
    };

    this.devices.set(record.id, record);
    return record;
  }

  async countDistinctUsersForFingerprint(fingerprint: string): Promise<number> {
    return new Set(
      Array.from(this.devices.values())
        .filter((device) => device.fingerprint === fingerprint)
        .map((device) => device.userId)
    ).size;
  }

  async hasDeviceForUser(input: {
    userId: string;
    fingerprint: string;
  }): Promise<boolean> {
    return Array.from(this.devices.values()).some(
      (device) =>
        device.userId === input.userId && device.fingerprint === input.fingerprint
    );
  }

  async updateUserModeration(input: {
    status?: UserRecord["status"];
    trustScore: number;
    userId: string;
  }): Promise<UserRecord | null> {
    const user = this.users.get(input.userId);
    if (!user) {
      return null;
    }

    const nextUser: UserRecord = {
      ...user,
      status: input.status ?? user.status,
      trustScore: input.trustScore,
      updatedAt: new Date().toISOString()
    };
    this.users.set(user.id, nextUser);
    return nextUser;
  }

  async storeRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      id: createId(),
      revokedAt: null,
      tokenHash: input.tokenHash,
      userId: input.userId
    };

    this.refreshTokens.set(input.tokenHash, record);
    return record;
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(tokenHash) ?? null;
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    const record = this.refreshTokens.get(tokenHash);
    if (!record) {
      return;
    }

    this.refreshTokens.set(tokenHash, {
      ...record,
      revokedAt: new Date().toISOString()
    });
  }

  async revokeRefreshTokensForUser(userId: string): Promise<void> {
    for (const [tokenHash, record] of this.refreshTokens.entries()) {
      if (record.userId === userId) {
        await this.revokeRefreshToken(tokenHash);
      }
    }
  }

  debugListUsers(): UserRecord[] {
    return Array.from(this.users.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  debugListDevices(): DeviceRecord[] {
    return Array.from(this.devices.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }
}
