export type AuthProvider = "email" | "apple" | "google";
export type DevicePlatform = "ios" | "android";
export type UserStatus = "active" | "suspended" | "deleted";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string | null;
  trustScore: number;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthIdentityRecord {
  id: string;
  userId: string;
  provider: AuthProvider;
  providerId: string;
  passwordHash: string | null;
  createdAt: string;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  fingerprint: string;
  platform: DevicePlatform;
  pushToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailVerificationRecord {
  id: string;
  userId: string | null;
  inviteCodeId: string | null;
  email: string;
  passwordHash: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResponse {
  user: UserRecord;
  tokens: AuthTokens;
}

export interface VerifiedOAuthIdentity {
  providerId: string;
  email: string;
  displayName?: string | null;
}

export interface SentVerification {
  delivery: "dev_mailbox";
  previewLink?: string;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(userId: string): Promise<UserRecord | null>;
  createUser(input: {
    email: string;
    displayName?: string | null;
  }): Promise<UserRecord>;
  markUserDeleted(userId: string): Promise<void>;
  findIdentity(
    provider: AuthProvider,
    providerId: string
  ): Promise<AuthIdentityRecord | null>;
  createIdentity(input: {
    userId: string;
    provider: AuthProvider;
    providerId: string;
    passwordHash?: string | null;
  }): Promise<AuthIdentityRecord>;
  updateEmailPasswordHash(userId: string, passwordHash: string): Promise<void>;
  createEmailVerification(input: {
    userId?: string | null;
    inviteCodeId?: string | null;
    email: string;
    passwordHash: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<EmailVerificationRecord>;
  consumeEmailVerification(tokenHash: string): Promise<EmailVerificationRecord | null>;
  createOrUpdateDevice(input: {
    userId: string;
    fingerprint: string;
    platform: DevicePlatform;
    pushToken?: string | null;
  }): Promise<DeviceRecord>;
  countDistinctUsersForFingerprint(fingerprint: string): Promise<number>;
  hasDeviceForUser(input: { userId: string; fingerprint: string }): Promise<boolean>;
  updateUserModeration(input: {
    status?: UserStatus;
    trustScore: number;
    userId: string;
  }): Promise<UserRecord | null>;
  storeRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<RefreshTokenRecord>;
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  revokeRefreshTokensForUser(userId: string): Promise<void>;
}

export interface CaptchaVerifier {
  verify(token: string | null | undefined): Promise<void>;
}

export interface OAuthVerifier {
  verify(identityToken: string): Promise<VerifiedOAuthIdentity>;
}

export interface VerificationMailer {
  sendEmailVerification(input: {
    email: string;
    verificationLink: string;
  }): Promise<SentVerification>;
}
