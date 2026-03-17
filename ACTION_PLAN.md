# FreeLine
## Execution Action Plan

This document is the tactical build plan.

Use [CODEXREADME.md](/Users/joeyrahme/GitHubWorkspace/FreeLine/CODEXREADME.md) as the source of truth for product constraints, architecture, and business assumptions.

## MVP in one sentence

Build a `US-only`, app-based VoIP product that lets a user sign up, claim one free local number, send and receive 1:1 texts, and make and receive calls inside the app.

## Non-negotiable constraints

- `US only`
- `iOS + Android only`
- `one free number per user`
- `one active account per device by default`
- `app-based calling and texting only`
- `personal second line`, not a free business broadcast tool
- `no OTP guarantee`
- `no SIM/eSIM`
- `no international`
- `no desktop or web client in MVP`

## Operating formula

FreeLine only works financially if we copy the real formula:

`VoIP app + wholesale phone numbers + ad-supported free tier + paid convenience upgrades + aggressive number reclaim + strict anti-abuse controls`

This means:

- we subsidize the free tier
- we do not give permanent free numbers to inactive users
- we do not allow business marketing or bulk messaging
- we build launch gates before public rollout

## Provider strategy

### Default recommendation

Start `Bandwidth-first` for cost efficiency. Bandwidth is ~50% cheaper than Twilio on numbers, SMS, and voice.

### Required spike before locking provider

Run a short voice spike testing `Bandwidth In-App Calling` on:

- inbound call wake reliability
- CallKit integration friction
- Android ConnectionService friction
- token issuance and refresh
- local developer setup

If Bandwidth In-App Calling proves too difficult on the native clients, fall back to `Twilio Voice SDK` for calling only while keeping Bandwidth for numbers and SMS. Keep all provider logic behind a `TelephonyProvider` interface.

## Repo shape

```text
FreeLine/
  FreeLine-iOS/
  FreeLine-Android/
  FreeLine-Backend/
  FreeLine-Admin/
  phases/
    0-foundation/
    1-onboarding/
    2-sms/
    3-voice/
    4-hardening/
  scripts/
  CODEXREADME.md
  ACTION_PLAN.md
  AGENTS.md
  PROGRESS.md
```

## Core execution phases

## Phase 0: Foundation

### Goal

Create separate iOS, Android, and backend shells, plus the local development stack, CI, and provider abstraction.

### Deliverables

- `FreeLine-iOS` shell
- `FreeLine-Android` shell
- `FreeLine-Backend` shell
- PostgreSQL + Redis local setup
- provider interface inside backend
- `BandwidthProvider` and `TwilioProvider` fallback behind the same telecom interface
- health endpoint
- root build, lint, test, and typecheck commands
- CI workflow

### Concrete tasks

- initialize root tooling and scripts
- create `.env.example`
- add `docker-compose.yml` for database and redis
- create `TelephonyProvider` interface in backend
- implement number search in the default provider
- add `GET /health`
- create iOS tab shell with placeholder screens
- create Android tab shell with placeholder screens
- decide Bandwidth In-App Calling vs Twilio Voice fallback after the spike

### Exit criteria

- repo builds from root
- lint and typecheck pass
- backend health endpoint returns `200`
- database and redis connect locally
- `FreeLine-iOS` scaffold exists with placeholder tabs
- `FreeLine-Android` scaffold exists with placeholder tabs
- provider abstraction exists
- provider number search works in staging/dev credentials

## Phase 1: Onboarding and Number Claim

### Goal

Let a new user create an account, pass abuse checks, search by area code, and claim one number.

### Deliverables

- email auth
- Apple and Google sign-in hooks
- device registration
- CAPTCHA verification
- number search UI
- number claim flow
- number assignment persisted in database

### Concrete tasks

- implement `users`, `auth_identities`, `devices`, `phone_numbers`, and `number_assignments`
- issue access and refresh tokens
- register device fingerprint on first launch
- enforce one-number-per-user
- enforce one-active-account-per-device by default
- `GET /v1/numbers/search`
- `POST /v1/numbers/claim`
- `GET /v1/numbers/me`
- `POST /v1/numbers/release`
- mobile flow: welcome -> sign in -> choose area code -> pick number -> confirmation

### Exit criteria

- a new user can sign up
- protected routes reject unauthenticated requests
- CAPTCHA is verified server-side
- device limit is enforced
- a user can claim one number
- a second number claim is rejected
- the onboarding flow works end-to-end on device

## Phase 2: SMS MVP

### Goal

Users can send and receive 1:1 SMS through their FreeLine number with persistence, push, and basic compliance.

### Deliverables

- threaded conversations
- outbound SMS
- inbound SMS webhook
- delivery status updates
- push notifications
- WebSocket updates when app is open
- STOP / HELP handling
- blocking and reporting

### Concrete tasks

- implement `conversations`, `messages`, `message_media`, `blocks`, and `reports`
- `GET /v1/conversations`
- `GET /v1/conversations/:id/messages`
- `POST /v1/messages`
- `POST /v1/blocks`
- `POST /v1/reports`
- `POST /v1/webhooks/telecom/messages/inbound`
- `POST /v1/webhooks/telecom/messages/status`
- verify telecom webhook signatures
- track opt-out state and block outbound to opted-out destinations
- register push tokens per device
- add messaging screens in mobile app

### Required policy for this phase

- personal communication only
- no bulk sending
- conservative daily SMS limits for new accounts
- cap unique new contacts per day

### Exit criteria

- outbound SMS reaches a real phone
- inbound SMS reaches the app
- message statuses update
- STOP opts out a conversation
- HELP produces the configured reply
- push and foreground real-time delivery both work
- webhook signature verification is enforced

## Phase 3: Voice MVP

### Goal

Users can place and receive calls in the app with native call UI and voicemail fallback.

### Deliverables

- voice access token endpoint
- inbound and outbound calling
- iOS PushKit + CallKit path
- Android FCM high-priority push + ConnectionService path
- call history
- voicemail inbox
- emergency dialer handoff

### Concrete tasks

- implement `calls` and `voicemails`
- `POST /v1/calls/token`
- `GET /v1/calls/history`
- `GET /v1/voicemails`
- `PATCH /v1/voicemails/:id/read`
- `POST /v1/webhooks/telecom/calls/inbound`
- `POST /v1/webhooks/telecom/calls/status`
- `POST /v1/webhooks/telecom/voicemail`
- configure `react-native-callkeep`
- add dial pad, active call, incoming call, history, and voicemail screens
- intercept `911` and open the native dialer instead of routing through VoIP

### Exit criteria

- outbound calls connect to a real phone
- inbound calls wake the app and show native call UI
- call audio works both directions
- voicemail is recorded and playable
- missed calls appear in history
- `911` opens the native dialer

## Phase 4: Hardening and Beta Readiness

### Goal

Make the free tier safe and financially controlled before broad rollout.

### Deliverables

- trust scoring
- Redis-backed rate limiting
- device/account linkage rules
- number reclaim worker
- number quarantine
- admin dashboard
- cost dashboard
- invite-only beta controls
- launch-gates script

### Concrete tasks

- implement `abuse_events` and `rate_limit_buckets`
- score accounts by age, verification state, reports, and behavior
- gate SMS/day, unique contacts/day, and call minutes/day by trust tier
- block new account creation on abusive devices
- reclaim numbers not activated within `24 hours`
- beta default inactivity reclaim at `14 days`
- warnings at day `10` and day `13`
- quarantine reclaimed numbers before reuse
- build internal admin flows to suspend, restore, and inspect accounts
- show active numbers, message volume, voice minutes, and estimated monthly spend
- gate signup behind invite codes for beta

### Exit criteria

- trust score changes affect rate limits
- reclaimed numbers are quarantined
- admin can suspend an account and restore a number
- cost dashboard reflects current usage
- invite-only beta mode works
- launch-gates script passes

## Monetization plan

### Free tier

- one free local number
- ads in the app
- beta launch allowance: `40 total text events/month` and `15 total call minutes/month`
- in beta, count both inbound and outbound activity against the free allowance
- rewarded ad unlock: `+10 text events` or `+5 call minutes`
- rewarded ad unlock limit: `4/month`
- hard free-tier ceiling: `80 total text events/month` and `35 total call minutes/month`
- number reclaim on inactivity

### Paid upgrades at or near MVP

- `Ad-Free` at `$4.99/month`
- `Lock My Number` at `$1.99/month`
- `Premium` at `$9.99/month`

### Paid upgrades after MVP

- voicemail transcription
- call forwarding
- business inbox tier

## Fair-use defaults

These defaults should be configurable in the backend.

- number must be activated by real usage within `24 hours`
- beta inactivity reclaim after `14 days`
- beta launch allowance: `40 total text events/month`
- beta launch allowance: `15 total call minutes/month`
- rewarded ad unlock: `+10 text events` or `+5 call minutes`
- rewarded ad unlock limit: `4/month`
- hard free-tier ceiling: `80 total text events/month`
- hard free-tier ceiling: `35 total call minutes/month`
- first-7-day outbound SMS cap: `10/day`
- first-7-day unique contacts cap: `5/day`
- first-7-day outbound call minutes cap: `10/day`
- default max accounts per device fingerprint: `2`

## Messaging compliance tasks

These items are not optional for public outbound SMS.

- document the application traffic profile
- complete A2P 10DLC registration before public rollout
- implement STOP / HELP behavior
- retain audit logs for abuse and support
- validate all telecom webhooks
- prohibit opted-out destinations from receiving outbound messages

## Launch gates

Do not launch the free public tier until all of the following are true:

- provider selection is finalized
- outbound SMS compliance setup is complete
- STOP / HELP works in production
- webhook signature verification is enabled on all telecom webhooks
- number reclaim and quarantine jobs are running
- admin can suspend and restore accounts
- incoming call wake is verified on iOS and Android
- `911` handoff is verified on iOS and Android
- cost dashboard is live

## Success metrics

- claim conversion rate
- day-1 and day-7 retention
- messages per active user
- calls per active user
- reclaim rate
- cost per active user
- abuse suspension rate
- support issues per 100 active users

## Immediate next actions

1. document the Bandwidth In-App Calling voice spike in `phases/0-foundation/RESULT.md`
2. scaffold the monorepo and local dev stack for `Phase 0`
3. wire the initial `TelephonyProvider` abstraction and default provider
4. run `bash scripts/run_phase.sh 0-foundation` once the repo skeleton exists
