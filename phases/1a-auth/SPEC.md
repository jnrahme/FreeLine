# Phase 1a: Authentication

**Target: Week 2**
**Depends on: Phase 0 complete**

## Goal

A user can create an account, verify their email, use the backend Apple or Google OAuth endpoints, and receive JWT tokens. Device fingerprinting and CAPTCHA are enforced. The native clients ship a real onboarding and auth shell with secure token storage. Number provisioning is still out of scope.

## Tasks

### 1. Database tables
- `users`: id, email, display_name, trust_score (default 50), status (active/suspended), created_at, updated_at
- `auth_identities`: id, user_id, provider (email/apple/google), provider_id, created_at
- `devices`: id, user_id, fingerprint, platform (ios/android), push_token, created_at
- Add indexes on: email (unique), provider+provider_id (unique), fingerprint

### 2. Auth endpoints (FreeLine-Backend)
- `POST /v1/auth/email/start` -- accept email + password, send verification link (or magic link)
- `POST /v1/auth/email/verify` -- verify email token, create user if new, issue JWT
- `POST /v1/auth/oauth/apple` -- accept Apple identity token, create/find user, issue JWT
- `POST /v1/auth/oauth/google` -- accept Google identity token, create/find user, issue JWT
- `POST /v1/auth/refresh` -- accept refresh token, issue new access + refresh token pair
- `DELETE /v1/account` -- delete account (number release is handled in 1b)

### 3. JWT implementation
- Access token: short-lived (15 minutes)
- Refresh token: long-lived (30 days), stored in database, revocable
- Auth guard middleware that validates JWT on protected `/v1/` routes
- Return 401 for missing/invalid/expired tokens

### 4. CAPTCHA
- Integrate hCaptcha or reCAPTCHA v3
- Verify CAPTCHA token server-side on `email/start` and `oauth/*` endpoints
- Environment variable to disable in development/testing

### 5. Device registration
- `POST /v1/devices/register` -- accept device fingerprint + platform
- Link device to authenticated user
- Enforce: max 2 accounts per device fingerprint
- Return 403 if device limit exceeded

### 6. Native auth shell
- `FreeLine-iOS`: welcome screen, email sign-up screen, verification screen, authenticated tab shell
- `FreeLine-Android`: welcome screen, email sign-up screen, verification screen, authenticated tab shell
- Store JWT tokens securely in Keychain (iOS) and encrypted local storage backed by Android Keystore
- Persist a stable device fingerprint per install
- Until native Apple and Google SDKs are integrated, both apps expose explicit `Dev` OAuth buttons that call the real backend OAuth endpoints with dev-mode identity tokens

### 7. Unit tests
- Test JWT issuance and validation
- Test auth guard rejects invalid tokens
- Test device fingerprint limit enforcement
- Test CAPTCHA verification (mock in tests)
- Test email/Apple/Google flows with mocked providers
- Test invalid auth payloads return controlled 400 errors instead of 500s

## Exit criteria

- [ ] User can sign up with email and receive verification link
- [ ] User can verify email and receive JWT access + refresh tokens
- [ ] Backend Apple OAuth endpoint returns tokens
- [ ] Backend Google OAuth endpoint returns tokens
- [ ] `POST /v1/auth/refresh` issues new token pair
- [ ] Protected routes return 401 without valid JWT
- [ ] CAPTCHA is enforced when enabled and bypassed in development/tests
- [ ] Device fingerprint is stored on registration
- [ ] Third account from same device fingerprint returns 403
- [ ] iOS: onboarding -> signup -> verify -> lands on empty main screen
- [ ] Android: onboarding -> signup -> verify -> lands on empty main screen
- [ ] Tokens stored securely in Keychain/Keystore
- [ ] All auth endpoints have unit tests
- [ ] Database migrations run cleanly
- [ ] Root build/lint/typecheck/test pass
- [ ] iOS app builds successfully
- [ ] Android app builds successfully

## Deferred from this phase

- Native Apple Sign In SDK integration
- Native Google Sign In SDK integration
- Deep link verification flow on Android
