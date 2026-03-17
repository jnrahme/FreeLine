# Phase 0: Foundation

**Target: Week 1**

## Goal

Set up separate iOS, Android, and backend shells plus the telecom provider so that all future phases have a working base to build on.

## Tasks

### 1. Repo setup
- Configure root scripts, TypeScript, ESLint, and shared verification helpers
- Create `FreeLine-iOS/`, `FreeLine-Android/`, and `FreeLine-Backend/` directories
- Set up root `package.json` for repo-level commands

### 2. Backend shell (FreeLine-Backend)
- Initialize TypeScript backend service
- Set up PostgreSQL connection (TypeORM or Prisma)
- Set up Redis connection
- Create placeholder modules: auth, users, numbers, messaging, calling, abuse, admin
- Add health check endpoint `GET /health`
- Add basic request logging middleware
- Set up environment config (.env.example with all required vars)
- Add Docker Compose for local PostgreSQL + Redis

### 3. iOS app shell (FreeLine-iOS)
- Create SwiftUI starter structure
- Add placeholder screens: Welcome, SignIn, SignUp, Conversations, Calls, Settings
- Add tab-based root shell
- Add environment config placeholder for API base URL

### 4. Android app shell (FreeLine-Android)
- Create Kotlin starter structure
- Add placeholder screens: Welcome, SignIn, SignUp, Conversations, Calls, Settings
- Add tab-based root shell
- Add environment config placeholder for API base URL

### 5. Telecom provider setup
- Create Bandwidth account and get API credentials
- Run a short voice spike testing Bandwidth In-App Calling for native iOS and Android flows
- If Bandwidth voice is too difficult, fall back to Twilio Voice SDK for calling only
- Store credentials in `.env`
- Create `TelephonyProvider` interface in `FreeLine-Backend`:
  ```typescript
  interface TelephonyProvider {
    searchNumbers(areaCode: string): Promise<AvailableNumber[]>
    provisionNumber(phoneNumber: string): Promise<ProvisionedNumber>
    releaseNumber(phoneNumber: string): Promise<void>
    sendSms(from: string, to: string, body: string): Promise<SmsResult>
    createVoiceToken(identity: string): Promise<string>
  }
  ```
- Create `BandwidthProvider` class implementing the interface
- Add a placeholder `TwilioProvider` stub as voice fallback
- Verify number search works against Bandwidth API in dev

### 6. A2P 10DLC registration (start immediately -- takes 2-4 weeks)
- Submit brand registration via telecom provider ($4-44 one-time)
- Submit campaign vetting ($15 one-time)
- Document campaign type: personal P2P messaging, not marketing
- Do not wait for approval to continue building -- this runs in parallel

### 7. Ad SDK setup
- Document AdMob integration points for iOS and Android
- Create placeholder ad unit ID config entries
- Do not block Phase 0 on shipping real ad SDK wiring yet

### 8. CI pipeline
- GitHub Actions workflow: lint, typecheck, test, build
- Run on every push and PR

### 9. Docker Compose for local dev
- PostgreSQL 15+
- Redis 7+
- Backend API (hot reload)

## Exit criteria

All of the following must be true:

- [ ] `npm run build` succeeds from repo root for both api and mobile
- [ ] `npm run build` succeeds from repo root
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run typecheck` passes
- [ ] Backend starts and `GET /health` returns 200
- [ ] PostgreSQL and Redis connect successfully on backend start
- [ ] `FreeLine-iOS` scaffold exists with placeholder tabs and screens
- [ ] `FreeLine-Android` scaffold exists with placeholder tabs and screens
- [ ] `TelephonyProvider` interface exists with provider implementation
- [ ] provider decision is documented for MVP
- [ ] default provider number search returns results
- [ ] Docker Compose brings up PostgreSQL + Redis
- [ ] CI pipeline runs and passes
- [ ] `.env.example` documents all required environment variables
- [ ] A2P 10DLC brand registration submitted (approval is async)
- [ ] Ad integration placeholders exist for both native clients
