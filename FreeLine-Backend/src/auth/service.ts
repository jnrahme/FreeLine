import crypto from "node:crypto";

import type { AdminService } from "../admin/service.js";
import type { AbuseService } from "../abuse/service.js";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import { createVerificationLink, issueTokens, rotateRefreshToken } from "./tokens.js";
import { hashOpaqueToken } from "./crypto.js";
import { hashPassword, verifyPassword } from "./password.js";
import type {
  AuthProvider,
  AuthResponse,
  AuthStore,
  CaptchaVerifier,
  DevicePlatform,
  OAuthVerifier,
  VerificationMailer
} from "./types.js";

export interface AuthServiceDependencies {
  adminService?: AdminService;
  abuseService?: AbuseService;
  store: AuthStore;
  captchaVerifier: CaptchaVerifier;
  emailMailer: VerificationMailer;
  appleVerifier: OAuthVerifier;
  googleVerifier: OAuthVerifier;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDependencies) {}

  async startEmailAuth(input: {
    email: string;
    inviteCode?: string | null;
    password: string;
    captchaToken?: string | null;
  }): Promise<{ delivery: string; previewLink?: string }> {
    const email = input.email.trim().toLowerCase();
    await this.deps.captchaVerifier.verify(input.captchaToken);

    if (!email || !input.password || input.password.length < 8) {
      throw new AppError(400, "invalid_input", "Email and password are required.");
    }

    const existingUser = await this.deps.store.findUserByEmail(email);
    let passwordHash = await hashPassword(input.password);
    let userId: string | null = null;

    if (existingUser) {
      userId = existingUser.id;
      const emailIdentity = await this.deps.store.findIdentity("email", email);

      if (!emailIdentity?.passwordHash) {
        throw new AppError(
          409,
          "email_login_not_available",
          "This account does not support email login."
        );
      }

      const passwordMatches = await verifyPassword(
        input.password,
        emailIdentity.passwordHash
      );

      if (!passwordMatches) {
        throw new AppError(401, "invalid_credentials", "Invalid email or password.");
      }

      passwordHash = emailIdentity.passwordHash;
    }

    const inviteCode =
      !existingUser && env.BETA_MODE
        ? await this.requireAdminService().assertInviteCodeUsable(input.inviteCode)
        : null;

    const verificationToken = crypto.randomUUID().replace(/-/g, "");
    const verificationLink = createVerificationLink(verificationToken);

    await this.deps.store.createEmailVerification({
      email,
      expiresAt: new Date(
        Date.now() + env.EMAIL_VERIFICATION_TTL_MINUTES * 60_000
      ).toISOString(),
      inviteCodeId: inviteCode?.id ?? null,
      passwordHash,
      tokenHash: hashOpaqueToken(verificationToken),
      userId
    });

    const delivery = await this.deps.emailMailer.sendEmailVerification({
      email,
      verificationLink
    });

    return delivery;
  }

  async verifyEmail(input: {
    token: string;
    fingerprint?: string;
    platform?: DevicePlatform;
    pushToken?: string | null;
  }): Promise<AuthResponse> {
    const verification = await this.deps.store.consumeEmailVerification(
      hashOpaqueToken(input.token)
    );

    if (!verification) {
      throw new AppError(400, "invalid_verification", "Verification link is invalid.");
    }

    if (input.fingerprint) {
      await this.deps.abuseService?.assertFingerprintAllowed(input.fingerprint);
    }

    let user =
      (verification.userId
        ? await this.deps.store.findUserById(verification.userId)
        : null) ?? (await this.deps.store.findUserByEmail(verification.email));
    const isNewUser = !user;

    if (isNewUser && env.BETA_MODE) {
      if (!verification.inviteCodeId) {
        throw new AppError(
          403,
          "invite_code_required",
          "A valid invite code is required while beta mode is enabled."
        );
      }

      await this.requireAdminService().consumeInviteCodeById(verification.inviteCodeId);
    }

    if (!user) {
      user = await this.deps.store.createUser({
        email: verification.email
      });
    }

    const emailIdentity = await this.deps.store.findIdentity("email", user.email);
    if (!emailIdentity) {
      await this.deps.store.createIdentity({
        passwordHash: verification.passwordHash,
        provider: "email",
        providerId: user.email,
        userId: user.id
      });
    } else if (emailIdentity.passwordHash !== verification.passwordHash) {
      await this.deps.store.updateEmailPasswordHash(
        user.id,
        verification.passwordHash
      );
    }

    if (input.fingerprint && input.platform) {
      await this.registerDevice({
        fingerprint: input.fingerprint,
        platform: input.platform,
        pushToken: input.pushToken,
        userId: user.id
      });
    }

    return {
      tokens: await issueTokens(this.deps.store, user),
      user
    };
  }

  async oauthSignIn(input: {
    provider: Extract<AuthProvider, "apple" | "google">;
    inviteCode?: string | null;
    identityToken: string;
    captchaToken?: string | null;
    fingerprint?: string;
    platform?: DevicePlatform;
    pushToken?: string | null;
  }): Promise<AuthResponse> {
    await this.deps.captchaVerifier.verify(input.captchaToken);

    if (input.fingerprint) {
      await this.deps.abuseService?.assertFingerprintAllowed(input.fingerprint);
    }

    const verifier =
      input.provider === "apple"
        ? this.deps.appleVerifier
        : this.deps.googleVerifier;

    const verifiedIdentity = await verifier.verify(input.identityToken);

    let identity = await this.deps.store.findIdentity(
      input.provider,
      verifiedIdentity.providerId
    );
    let user =
      identity && identity.userId
        ? await this.deps.store.findUserById(identity.userId)
        : null;

    if (!user && verifiedIdentity.email) {
      user = await this.deps.store.findUserByEmail(verifiedIdentity.email);
    }

    if (!user) {
      if (env.BETA_MODE) {
        await this.requireAdminService().consumeInviteCodeByCode(input.inviteCode ?? "");
      }

      user = await this.deps.store.createUser({
        displayName: verifiedIdentity.displayName ?? null,
        email: verifiedIdentity.email
      });
    }

    if (!identity) {
      identity = await this.deps.store.createIdentity({
        provider: input.provider,
        providerId: verifiedIdentity.providerId,
        userId: user.id
      });
    }

    if (input.fingerprint && input.platform) {
      await this.registerDevice({
        fingerprint: input.fingerprint,
        platform: input.platform,
        pushToken: input.pushToken,
        userId: user.id
      });
    }

    return {
      tokens: await issueTokens(this.deps.store, user),
      user
    };
  }

  async refreshAuth(input: { refreshToken: string }): Promise<AuthResponse> {
    const refreshTokenRecord = await this.deps.store.findRefreshToken(
      hashOpaqueToken(input.refreshToken)
    );

    if (!refreshTokenRecord) {
      throw new AppError(401, "invalid_refresh_token", "Refresh token is invalid.");
    }

    const user = await this.deps.store.findUserById(refreshTokenRecord.userId);
    if (!user || user.status !== "active") {
      throw new AppError(401, "invalid_refresh_token", "User is not active.");
    }

    return {
      tokens: await rotateRefreshToken(this.deps.store, input.refreshToken, user),
      user
    };
  }

  async registerDevice(input: {
    userId: string;
    fingerprint: string;
    platform: DevicePlatform;
    pushToken?: string | null;
  }) {
    const hasExistingDevice = await this.deps.store.hasDeviceForUser({
      fingerprint: input.fingerprint,
      userId: input.userId
    });

    if (!hasExistingDevice) {
      await this.deps.abuseService?.assertFingerprintAllowed(input.fingerprint);
      const currentCount = await this.deps.store.countDistinctUsersForFingerprint(
        input.fingerprint
      );

      if (currentCount >= 2) {
        throw new AppError(
          403,
          "device_limit_exceeded",
          "This device fingerprint has reached its account limit."
        );
      }
    }

    const device = await this.deps.store.createOrUpdateDevice(input);
    await this.deps.abuseService?.logDeviceAccount({
      fingerprint: input.fingerprint,
      platform: input.platform,
      userId: input.userId
    });

    return device;
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.deps.store.markUserDeleted(userId);
    await this.deps.store.revokeRefreshTokensForUser(userId);
  }

  private requireAdminService(): AdminService {
    if (!this.deps.adminService) {
      throw new AppError(
        500,
        "admin_service_missing",
        "Admin service is required for this operation."
      );
    }

    return this.deps.adminService;
  }
}
