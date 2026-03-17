# CODEXREADME

Implementation plan for `FreeLine`

Working product name: `BusinessLine`

Phone numbers should feel as free and easy to get as email addresses.

`FreeLine` is a mobile-first app that gives a user a free U.S. phone number for calling and texting over Wi-Fi or mobile data. The core idea is simple:

- download the app
- sign up with email, Apple, or Google
- choose a U.S. area code
- claim a free number
- call and text from inside the app

This document is the implementation plan for the MVP.

## Product thesis

People want a second line for side businesses, online selling, dating, privacy, creator work, customer support, and general separation from their personal number.

The market proof already exists: TextNow shows that a free-number, app-based VoIP model can work if the service is disciplined about cost control, inactivity recycling, abuse prevention, and monetization.

The key principle is:

> Free to the user does not mean free to the platform.

FreeLine must be designed as a subsidized communications product, not as a carrier plan. The MVP should behave like a modern VoIP app, not like a full mobile operator.

## What we learned

### 1. The right MVP is app-based VoIP, not a carrier plan

TextNow's public support docs describe its core service as a VoIP product that gives users a real number for calling and texting over Wi-Fi or data, and it assigns area-code-based numbers from wholesale inventory. TextNow also says numbers are recycled when they are no longer in use. That is the model to copy first. Building SIM/eSIM wireless service is a later-stage problem and should not be part of MVP.

### 2. A "free number" still has a real monthly cost

As of March 17, 2026, Twilio's public U.S. list pricing for a long-code number is `$1.15/month`, SMS is `$0.0083` per inbound or outbound segment, outbound voice is `$0.0140/min`, and inbound local voice is `$0.0085/min`, before carrier fees. This means even a light active user creates real recurring COGS.

Example light-user estimate on Twilio list pricing:

- number: `$1.15/month`
- 50 outbound SMS: `$0.415`
- 50 inbound SMS: `$0.415`
- 30 outbound voice minutes: `$0.42`
- 30 inbound voice minutes: `$0.255`
- total before carrier surcharges and infrastructure: about `$2.66/user/month`

This is the most important business constraint in the project.

### 3. U.S. messaging from an app is regulated as A2P

Twilio states that anyone sending SMS/MMS from an application over a U.S. 10DLC number must register for A2P 10DLC. That means FreeLine cannot treat outbound texting as an unregulated toy feature. Registration, campaign metadata, opt-out/help handling, and traffic policies are part of the product from day one.

### 4. Free products survive by controlling number inventory

TextNow publicly says inactive numbers may be revoked and reassigned, and that daily usage keeps a free number active. This is a core operating rule, not a nice-to-have. If FreeLine gives everyone a permanent number with no activity policy, the economics break quickly.

### 5. Verification-code support should not be part of the MVP promise

TextNow explicitly says some services do not support its VoIP numbers for verification, and it ties better verification-code support to paid or locked-number scenarios. FreeLine should assume OTP support is unreliable and should not market the product as a guaranteed two-factor-authentication number.

### 6. Emergency calling is a separate workstream

Emergency handling is not solved just because standard voice calling works. Twilio supports emergency calling for Programmable Voice, but it requires explicit emergency-address handling. For the mobile MVP, the safest first policy is to intercept `911` and open the native dialer on iOS and Android instead of treating emergency support as "done."

### 7. Detailed plans are only useful if they preserve product constraints

The comparison against alternate plans made one thing clear: execution detail helps, but only if it preserves the constraints that keep the product viable. FreeLine must stay `US-only` for MVP, must control number inventory aggressively, must gate outbound messaging behind compliance, and must build trust-and-safety into the first release instead of treating it as cleanup work.

### 8. The mobile clients need separate native project structures

The app cannot be planned like a generic cross-platform messaging client. Incoming PSTN calls, background wake, native call UI, audio routing, PushKit, and Android ConnectionService all lean heavily on platform-native behavior. For MVP, the repo should keep `FreeLine-iOS` and `FreeLine-Android` in separate folders so each platform can evolve without fighting a shared mobile wrapper.

## Recommended product decision

Build a narrow, disciplined MVP:

- `US only`
- `iOS + Android only`
- `one free number per user`
- `one free number per device by default`
- `calls and 1:1 texting only`
- `in-app calling and texting only`
- `daily/weekly inactivity policy`
- `hard anti-spam and anti-abuse controls`
- `no promise of OTP support`
- `no business marketing or bulk messaging`

This is enough to test demand.

Do not try to clone all of TextNow in version one.

## Recommended provider strategy

### Decision: Bandwidth-first

Use `Bandwidth` as the primary telecom provider. Bandwidth owns its own Tier 1 network and offers materially better pricing than Twilio:

| | Bandwidth | Twilio |
|---|---|---|
| Phone number | `$0.50/month` | `$1.15/month` |
| SMS per message | `$0.004` | `$0.0079` |
| Voice per minute | `$0.010` | `$0.014` |

At scale, this is roughly `50% cheaper` per active user. For an ad-supported free product where every fraction of a cent matters, starting on the cheaper provider is the right call.

Bandwidth provides:

- phone number search and provisioning APIs
- SMS/MMS messaging APIs
- In-App Calling (WebRTC voice)
- webhook-based event delivery
- A2P 10DLC registration support
- E911 support

### Trade-off acknowledged

Bandwidth's developer experience is less polished than Twilio's. Documentation is sparser, native mobile examples are fewer, and integration rough edges are more likely. This means Phase 0 may take slightly longer, but the ongoing cost savings justify the upfront investment.

### Provider interface

All telecom logic must be behind a `TelephonyProvider` interface from day one:

- `TelephonyProvider.searchNumbers()`
- `TelephonyProvider.assignNumber()`
- `TelephonyProvider.releaseNumber()`
- `TelephonyProvider.sendSms()`
- `TelephonyProvider.createVoiceAccessToken()`
- `TelephonyProvider.handleInboundCall()`

Create a `BandwidthProvider` as the default implementation and keep a real `TwilioProvider` fallback behind the same interface. Bandwidth remains the primary path for numbers, messaging, and voice because of cost, but Twilio should be usable as an explicitly configured fallback for staging, contingency, and voice-led fallback work without rewriting the app.

### Phase 0 voice spike

Before locking the voice path, run a short spike testing `Bandwidth In-App Calling` for:

- inbound call wake reliability on iOS (PushKit) and Android (FCM)
- CallKit / ConnectionService integration
- audio quality and latency
- native client integration effort

If Bandwidth In-App Calling works, use it. If not, use Twilio Voice SDK for calling while keeping Bandwidth as the default number and SMS path. The Twilio fallback should still be able to handle numbers and SMS end to end when explicitly configured for contingency work.

## MVP scope

### User-facing features

- sign up with email, Apple, or Google
- complete device verification and abuse checks
- choose a U.S. area code
- claim one available number
- send and receive 1:1 SMS
- receive MMS media
- make and receive voice calls in the app
- receive push notifications for calls and messages
- see conversation history and recent calls
- block a number
- report spam or abuse
- lose the number after extended inactivity unless usage resumes

### Not in v1

- SIM or eSIM service
- desktop or web clients
- international calling
- port-in / port-out
- group messaging
- call forwarding
- AI receptionist
- vanity numbers
- guaranteed verification-code support
- business blast messaging

## Product rules

These rules protect unit economics and reduce abuse.

### Number assignment

- each account gets one free number
- each device can only create a limited number of accounts
- numbers are selected by area code when inventory exists
- if preferred inventory is unavailable, show nearest alternatives

### Number retention

- free numbers expire after a configurable inactivity window
- send warnings before reclaiming a number
- reclaim and quarantine numbers before reassigning them

### Abuse controls

- require email or social login before number claim
- use CAPTCHA at signup and suspicious moments
- device fingerprint every session
- rate-limit outbound SMS and calls
- limit messages to new contacts until trust score improves
- auto-block high-risk destinations and traffic patterns
- add a basic admin console for suspensions and manual review

### Messaging policy

- personal communications only in MVP
- no bulk sends
- no affiliate, spam, lead-gen, or solicitation traffic
- respect STOP, HELP, and block/report flows

### Free-tier activation and retention

- a newly claimed number must place or receive a real call or message within `24 hours` or it is released
- after activation, a free number stays active only while the account is meaningfully used
- beta default inactivity window: `14 days`
- warning notifications at day `10` and day `13`
- reclaimed numbers enter quarantine before reuse

### Fair-use defaults for beta

- one free number per user
- one active account per device by default, with a hard ceiling of two accounts per device fingerprint
- new accounts start with conservative limits on messages, contacts, and call minutes
- launch beta allowance: `40 total text events/month` and `15 total call minutes/month`
- for beta, count both inbound and outbound activity against the free allowance so cost exposure stays bounded while the ad model is still unproven
- rewarded ad unlock: user chooses `+10 text events` or `+5 call minutes`
- maximum rewarded unlocks on free tier: `4/month`
- hard beta ceiling on free tier: `80 total text events/month` and `35 total call minutes/month`
- first-7-day outbound caps: `10 outbound texts/day`, `5 unique contacts/day`, `10 outbound call minutes/day`
- trust score increases unlock higher limits
- suspicious accounts lose outbound privileges before they lose read access

## Technical architecture

## Architecture principle

Start with a `modular monolith`, not microservices.

One backend codebase is enough for MVP if the modules are clean. Telecom startups fail faster from operational sprawl than from lack of service boundaries.

### Repo shape

Use a single repo with separate top-level app folders from day one.

```text
FreeLine/
  FreeLine-iOS/        # SwiftUI iOS app
  FreeLine-Android/    # Kotlin Android app
  FreeLine-Backend/    # TypeScript API and telecom orchestration
  FreeLine-Admin/      # future internal ops console
  phases/          # phase-by-phase execution specs and verification
  scripts/         # execution helpers like run_phase.sh
  infra/           # docker, terraform, deployment manifests
  docs/
  CODEXREADME.md
  ACTION_PLAN.md
  AGENTS.md
  PROGRESS.md
```

### Stack

- iOS app: `SwiftUI`
- Android app: `Kotlin + Jetpack Compose`
- backend API: `Fastify + TypeScript`
- database: `PostgreSQL`
- cache / rate limits / queues: `Redis`
- background jobs: `BullMQ`
- file storage for MMS and voicemail assets: `S3-compatible object storage`
- analytics: `PostHog`
- error monitoring: `Sentry`
- telecom: `Bandwidth` (numbers, SMS, voice), with `Twilio` fallback for voice if needed
- admin dashboard: `Next.js`

### Mobile VoIP decisions

These are not optional implementation details. They determine whether inbound calling works at all.

- keep `FreeLine-iOS` and `FreeLine-Android` as separate native projects
- use the provider's native mobile voice SDK when possible instead of building raw WebRTC + SIP first
- on `iOS`, use `PushKit` for VoIP wake and `CallKit` for native incoming-call UX
- on `Android`, use `FCM` high-priority data push plus `ConnectionService`
- standard push notifications alone are not sufficient for reliable incoming-call wake behavior
- keep provider-specific mobile code behind a telephony adapter so voice can be swapped later if needed

### High-level system design

```text
iOS / Android app
  -> API server
  -> Auth + session service
  -> Number service
  -> Messaging service
  -> Calling service
  -> Abuse / compliance service
  -> Notification service
  -> Admin dashboard

API server
  -> PostgreSQL
  -> Redis / BullMQ
  -> S3
  -> Bandwidth Messaging + Voice + Phone Numbers APIs (Twilio fallback available behind `TelephonyProvider`)
  -> APNs / FCM
```

### Minimum mobile screens

The first cut of the app should include only the screens needed to support the MVP.

- onboarding / welcome
- sign in / sign up
- choose area code
- pick a number
- conversations list
- message thread
- new message
- calls list
- dial pad
- active call
- incoming call
- voicemail inbox
- settings / my number

### Backend modules

#### Auth module

Responsibilities:

- email magic link or passwordless auth
- Apple and Google sign-in
- session issuance
- device registration
- CAPTCHA verification

#### Users module

Responsibilities:

- user profiles
- onboarding state
- trust score
- blocklist
- account status

#### Numbers module

Responsibilities:

- search area-code inventory
- reserve a number during checkout flow
- assign number to user
- release number
- recycle inactive number
- quarantine released numbers before reuse

#### Messaging module

Responsibilities:

- send SMS and MMS through provider
- receive webhook events
- persist messages and delivery states
- attach messages to conversations
- trigger push notifications
- implement STOP / HELP / block rules

#### Calling module

Responsibilities:

- create voice access tokens
- handle inbound call webhooks
- bridge outbound calls
- call state tracking
- call history
- voicemail handling for missed calls

#### Abuse module

Responsibilities:

- signup risk evaluation
- rate limiting
- destination velocity checks
- content heuristics
- device/account linkage
- appeal workflow

#### Admin module

Responsibilities:

- suspend account
- release or restore number
- inspect message and call audit trail
- view reports
- review abuse queue

### Initial API surface

The first implementation should expose a small, explicit API rather than growing ad hoc routes.

#### Auth

- `POST /v1/auth/email/start`
- `POST /v1/auth/email/verify`
- `POST /v1/auth/oauth/apple`
- `POST /v1/auth/oauth/google`
- `POST /v1/auth/refresh`
- `DELETE /v1/account`

#### Numbers

- `GET /v1/numbers/search?areaCode=...`
- `POST /v1/numbers/claim`
- `GET /v1/numbers/me`
- `POST /v1/numbers/release`

#### Messaging

- `GET /v1/conversations`
- `GET /v1/conversations/:id/messages`
- `POST /v1/messages`
- `POST /v1/blocks`
- `POST /v1/reports`

#### Calls

- `POST /v1/calls/token`
- `GET /v1/calls/history`
- `GET /v1/voicemails`
- `PATCH /v1/voicemails/:id/read`

#### Telecom webhooks

- `POST /v1/webhooks/telecom/messages/inbound`
- `POST /v1/webhooks/telecom/messages/status`
- `POST /v1/webhooks/telecom/calls/inbound`
- `POST /v1/webhooks/telecom/calls/status`
- `POST /v1/webhooks/telecom/voicemail`

## Core data model

We do not need the full schema yet, but these tables should exist in the first implementation.

- `users`
- `devices`
- `auth_identities`
- `phone_numbers`
- `number_assignments`
- `conversations`
- `conversation_participants`
- `messages`
- `message_media`
- `calls`
- `voicemails`
- `push_tokens`
- `blocks`
- `abuse_events`
- `reports`
- `rate_limit_buckets`

## Messaging and calling flows

### New user claims a free number

1. user signs in
2. backend runs CAPTCHA and risk checks
3. user enters preferred area code
4. backend searches provider inventory
5. backend reserves and assigns a number
6. app lands in inbox/calls home

### Outbound SMS

1. user types message
2. app sends to backend
3. backend checks policy, rate limits, and account status
4. backend sends via Twilio
5. webhook updates delivery state
6. recipient replies through PSTN
7. inbound webhook stores message and pushes notification

### Inbound voice call

1. PSTN caller dials FreeLine number
2. Twilio hits inbound webhook
3. backend resolves owning user
4. backend notifies mobile client
5. app accepts via Twilio Voice SDK
6. call events are persisted for history and abuse review

## Emergency calling policy for MVP

MVP policy:

- if the user enters `911` on iOS or Android, open the native dialer
- do not market MVP as a complete replacement for primary mobile service
- defer direct in-app emergency calling until emergency-address management, QA, and legal review are complete

This keeps the initial launch honest and reduces a major operational risk area.

## Cost model

The biggest mistake would be pretending the service is free to operate.

### Bandwidth-based cost floor

Published U.S. list pricing:

- long-code number: `$0.50/month`
- SMS per message: `$0.004`
- local outbound voice: `$0.010/min`
- local inbound voice: `$0.010/min`

Example light user (50 outbound SMS, 50 inbound SMS, 30 min voice):

- number: `$0.50`
- SMS: 100 x $0.004 = `$0.40`
- voice: 30 x $0.010 = `$0.30`
- carrier surcharges: ~`$0.30`
- total: about `$1.50/month` before infrastructure overhead

That means:

- `1,000` light active users is about `$1,500/month` before overhead
- `10,000` light active users is about `$15,000/month` before overhead

For comparison, the same user on Twilio would cost about `$2.66/month` -- nearly double.

### Business implication: ads alone do not cover Twilio costs

US messaging app ad ARPU is `$0.50-$2.00/month`. Bandwidth cost per active user is `$1.50-$2.50/month`. The gap is smaller than Twilio but still real, and must be closed through a combination of:

1. aggressive free-tier usage caps
2. ad revenue (banner + interstitial + rewarded video)
3. freemium conversion (2-4% of users paying $4.99-$9.99/month)
4. already on Bandwidth (cheapest mainstream provider)
5. number recycling to eliminate idle inventory cost

TextNow closes this gap by being an MVNO (wholesale network cost ~$0.50-$1.50/user/month) plus ads plus paid subscriptions. FreeLine starts on Bandwidth which is the cheapest mainstream API provider, putting us at ~$1.50/user/month for light users. With aggressive ads ($1.00-$2.00 ARPU) plus 3% freemium conversion, this model can break even or better.

The MVP can launch without monetization, but it should not launch without a cost dashboard.

### Volume negotiation trigger

Once active users exceed `5,000`, negotiate volume pricing with Bandwidth. Their Tier 1 network ownership means they can offer discounts at scale that resellers like Twilio cannot. The `TelephonyProvider` interface also allows adding Telnyx as a secondary provider for redundancy.

## Monetization and sustainability model

The MVP should copy the TextNow formula in the simplest honest form:

`app-based VoIP + subsidized free number + ads + paid convenience upgrades + recycled inactive inventory + strict abuse controls`

### Ad strategy

SDK: `react-native-google-mobile-ads` (Google AdMob) with AdMob mediation.

Ad placements in order of priority:

1. `persistent banner` at bottom of conversation list (low eCPM ~$0.50-$1.50, always on, minimal retention impact)
2. `native sponsored message` in inbox (medium-high eCPM ~$3-$10, TextNow's signature format, high CTR)
3. `interstitial after ending a call` (high eCPM ~$5-$20, natural transition point)
4. `rewarded video for bonus usage` (highest eCPM ~$15-$30, user-initiated: "watch ad for 10 bonus SMS" or "1 hour ad-free")
5. `native ads between conversations` in the list (medium eCPM ~$3-$10, every 5-8 items)

Do not interrupt active conversations or calls with ads. Place ads only at natural transition points. 88% of users abandon apps after bad ad experiences.

### Free tier

- one free U.S. number
- in-app calling and texting over Wi-Fi or mobile data
- ads in the inbox, settings, and low-friction surfaces
- conservative beta allowance: `40 total text events/month` and `15 total call minutes/month`
- for the first beta, both inbound and outbound usage count against the allowance
- rewarded video unlocks either `10 additional text events` or `5 additional call minutes`
- rewarded unlock limit: `4/month`
- hard free-tier ceiling: `80 total text events/month` and `35 total call minutes/month`
- first-7-day caps: `10 outbound texts/day`, `5 unique contacts/day`, `10 outbound call minutes/day`
- inactivity reclaim if the line is not used
- free line must be activated within `24 hours` of claim by a real call or text

### Paid upgrades

Launch with the smallest paid layer that improves economics without complicating the core build:

- `Ad-Free` ($4.99/month) -- remove all ads, keep the same free-tier usage limits
- `Lock My Number` ($1.99/month) -- number is never reclaimed for inactivity
- `Premium` ($9.99/month) -- ad-free + locked number + `250 total text events/month` + `120 total call minutes/month` + voicemail transcription later

Expected freemium conversion: 2-4%. At 3% converting to $9.99/month, paid subscribers subsidize ~3-4 free users each.

Second-wave paid features:

- call forwarding
- business inbox features
- improved verification-code compatibility where allowed

### Positioning

The free tier should be positioned as a `personal second line`, not as a free business messaging platform. Business and marketing traffic creates higher abuse, higher compliance burden, and worse unit economics.

## Public beta operating policy

Before broad release, run the product as a capped beta:

- invite-only onboarding
- hard cap on claimed numbers
- daily review of spend, delivery rates, and abuse signals
- reclaim inactive numbers aggressively during beta
- do not scale acquisition until cost per active user is understood

## Financial projections and burn rate

This section exists so that any agent or contributor understands the real economics. Free to the user is not free to the platform.

### Per-user economics on Bandwidth

| User Type | Planning Telecom Cost/mo | Notes |
|---|---|---|
| Claimed then churned in ≤14 days | `$0.15-$0.25` | depends on whether the number was activated before reclaim |
| Activated free user at included bundle | `~$0.74` | `40 text events` + `15 call minutes` + one number |
| Maxed free user at hard ceiling | `~$1.21` | `80 text events` + `35 call minutes` + one number |
| Paid subscriber at launch tier | `~$3.23` | `250 text events` + `120 call minutes` + one number |

Key assumptions:
- 14-day inactivity reclaim eliminates ongoing cost for churned users
- planning SMS reserve is `~$0.008/text event`
- planning blended voice reserve is `~$0.00775/minute`
- free-tier hard caps (`80 text events/month`, `35 call minutes/month`) keep worst-case telecom exposure close to `$1.21` before infra/support
- rewarded video is the only ad format that should directly unlock more usage

### Weighted blended ARPU

- target weighted telecom cost per active user: `<= $0.75/month`
- if weighted telecom cost rises above `$1.00/month` before ad and paid monetization stabilize, tighten caps or shorten reclaim windows
- treat banners and native ads as upside, not as the primary cost-recovery mechanism
- treat rewarded ads and paid upgrades as the deliberate valves for extra usage

### Monthly burn by scale

| Active Free Users | Included Bundle Telecom Cost | Hard Ceiling Telecom Cost |
|---|---|---|
| 100 | `~$74/month` | `~$121/month` |
| 500 | `~$370/month` | `~$605/month` |
| 1,000 | `~$740/month` | `~$1,210/month` |
| 5,000 | `~$3,700/month` | `~$6,050/month` |
| 10,000 | `~$7,400/month` | `~$12,100/month` |

Note: these figures are telecom-only planning reserves. They do not include infra, support, fraud loss, chargebacks, or manual ops time.

### Infrastructure cost (not included above)

| Item | Monthly Cost |
|---|---|
| AWS (small instance, RDS, Redis, S3) | $50-$150 |
| Firebase (push notifications) | free tier covers <100K MAU |
| Sentry (error monitoring) | free tier covers <5K events/mo |
| PostHog (analytics) | free tier covers <1M events/mo |
| Domain + SSL | ~$1 |
| **Total infrastructure** | **$50-$150/month** |

### Startup budget to reach validation

| Phase | Duration | Expected Cash Burn |
|---|---|---|
| Build (no users, just dev costs) | Weeks 1-8 | $100-$300 (infra + test numbers) |
| Beta (100 invite-only users) | Weeks 9-12 | $100-$200/month |
| Early growth (500-1,000 users) | Months 3-6 | $0-$200/month (approaching breakeven) |
| **Total to reach 1,000 active users** | **~6 months** | **$500-$1,500 total** |

This is manageable as a side project. The model does not require venture funding to validate.

### When the model becomes profitable

The model flips to consistent profitability when:

1. active users exceed `1,000` and ad fill rates stabilize above 80%
2. freemium conversion holds at 3% or above
3. number recycling keeps idle inventory below 10% of total provisioned
4. rewarded video engagement stays above 2 views per active user per day

At `10,000 active users`, the app should generate `$3,000-$8,000/month` in gross margin before infrastructure costs.

### What to watch on the cost dashboard

The cost dashboard (built in Phase 4) must track:

- telecom cost per active user per month (target: <$1.50)
- ad ARPU per active user per month (target: >$1.00)
- paid conversion rate (target: >3%)
- idle number percentage (target: <10% of provisioned numbers)
- rewarded video views per DAU (target: >2/day)
- blended margin per active user (target: >$0.00)

If blended margin per active user goes negative for two consecutive weeks, pause new signups and investigate.

## Delivery plan

## Phase 0: foundation

Target: `Week 1`

- create separate `FreeLine-iOS` and `FreeLine-Android` app shells
- create `FreeLine-Backend` service structure
- configure Bandwidth dev account and number search
- run Bandwidth In-App Calling voice spike against native iOS and Android flows
- set up PostgreSQL, Redis, S3, Sentry, PostHog
- create CI, staging, secrets management
- submit A2P 10DLC brand and campaign registration (takes 2-4 weeks -- start immediately)
- prepare AdMob integration points for both native clients

Exit criteria:

- backend deploys
- app boots on iOS and Android
- Bandwidth credentials work in staging
- voice path decision is locked for MVP (Bandwidth In-App Calling or Twilio Voice fallback)

## Phase 1: onboarding and number claim

Target: `Week 2`

- auth flows
- CAPTCHA
- device registration
- area-code search UI
- number claim flow
- store number assignment in database
- enforce one-number-per-user and one-number-per-device policy

Exit criteria:

- a new user can create an account and claim a number

## Phase 2: SMS MVP

Target: `Weeks 3-4`

- conversation list
- chat thread UI
- outbound SMS
- inbound SMS webhook handling
- delivery statuses
- push notifications
- basic blocking and reporting
- STOP / HELP handling
- webhook signature verification

Exit criteria:

- stable two-way texting with persistence and notifications
- A2P registration requirements are implemented for launch

## Phase 3: voice MVP

Target: `Weeks 5-6`

- Bandwidth or Twilio Voice SDK integration (based on Phase 0 spike result)
- incoming call UI
- outgoing call flow
- call history
- voicemail fallback
- missed-call notifications
- `911` native dialer handoff
- PushKit / CallKit flow on iOS
- ConnectionService flow on Android

Exit criteria:

- stable inbound and outbound calling inside the app

## Phase 4: abuse and operations hardening

Target: `Weeks 7-8`

- rate limits
- trust scoring
- device/account linkage
- admin dashboard
- number recycling worker
- number quarantine and reassignment worker
- audit logs
- staged beta rollout
- cost dashboard by active user, number inventory, and message / call volume

Exit criteria:

- small beta can run without constant manual firefighting

## Launch gates

Do not launch the public free tier until all of the following are true:

- outbound messaging compliance setup is complete
- STOP / HELP handling is working in production
- telecom webhook signatures are verified
- number reclaim and quarantine jobs are running
- admin suspension and number-restore tooling exists
- incoming-call wake has been tested on both iOS and Android
- `911` opens the native dialer correctly
- a basic cost dashboard is live

## Success metrics

The first release should be judged on utility and economics, not just installs.

- account-to-number-claim conversion
- day-1 and day-7 retention
- messages per active user
- calls per active user
- percentage of reclaimed inactive numbers
- abuse suspension rate
- gross margin per active user
- support tickets per 100 active users

## A2P 10DLC registration

Start this in `Phase 0`, not Phase 2. Campaign vetting takes `2-4 weeks` and blocks outbound SMS.

- brand registration via Twilio: `$44` one-time
- campaign vetting: `$15` one-time per campaign
- monthly campaign fee: `$1.50-$10/month`
- per-message carrier surcharges: `$0.003-$0.005/message` (on top of base SMS rate)
- approval timeline: brand registration is minutes, campaign vetting is `10-15 business days`

Register the brand and submit the campaign for vetting as soon as the Twilio account is active.

## App store policy risks

### Apple App Store

- `CallKit is mandatory` for any VoIP app. PushKit VoIP pushes must present a CallKit call screen or the app will be rejected.
- apps enabling anonymous or prank calls will be rejected
- first submission of a "free phone number" app may trigger additional privacy and fraud review -- prepare a written explanation of abuse controls, number recycling, and compliance measures
- detailed App Privacy labels are required for all data collection

### Google Play Store

- do `NOT` request native SMS or Call Log permissions -- FreeLine routes through VoIP, not the device telephony stack. Requesting these permissions without being the default handler causes immediate rejection.
- Google explicitly allows "proxy calls (VoIP calling)" as an approved use case
- a Permissions Declaration Form is required for any sensitive permissions -- review can take `several weeks`
- call/SMS data must never be used for advertising purposes

### Mitigation

- prepare an app review document explaining the product, abuse controls, and compliance before first submission
- expect first iOS submission to take longer than 48 hours
- do not request permissions you don't need

## Main risks

### 1. Abuse and spam

If spam control is weak, the product dies quickly.

### 2. Number economics

If inactive users keep numbers forever, inventory cost explodes.

### 3. Unit economics

Ad revenue ($0.50-$2.00/user/month) roughly matches Bandwidth costs ($1.50/user/month for light users) but heavy users can still blow through caps. Free tier caps and number recycling are the primary cost controls.

### 4. Compliance mistakes

If outbound messaging policy is sloppy, provider restrictions or carrier filtering will follow.

### 5. A2P 10DLC approval delay

Campaign vetting takes 2-4 weeks. If not started early, SMS launch is blocked.

### 6. App store rejection

First submission of VoIP/free-number apps faces extra scrutiny. Budget time for rejection and resubmission.

### 7. Overbuilding

If we try to ship TextNow parity before MVP validation, we waste time and money.

## Final recommendation

Build the smallest honest version of the idea:

- a free U.S. number
- in an app
- for calls and texts
- with clear limits
- with aggressive abuse controls
- with recyclable inventory

That is enough to prove whether "phone numbers should be free like email" can work for this team and this market.

## Research anchors

Official references used for this plan:

- TextNow support: About TextNow, free-number availability, number recycling, verification-code support
- Twilio docs: Voice React Native SDK, Phone Numbers API, SMS pricing, Voice pricing, A2P 10DLC, emergency calling
- Bandwidth docs: pricing, In-App Calling / Voice Interworking, 10DLC fees

As of March 17, 2026, these links were the main source material:

- `https://help.textnow.com/hc/en-us/articles/360049928434-About-TextNow`
- `https://help.textnow.com/hc/en-us/articles/360042529194-Is-TextNow-available-in-my-country`
- `https://help.textnow.com/hc/en-us/articles/360043106673-Help-My-Phone-Number-was-recycled-how-can-I-get-it-back`
- `https://help.textnow.com/hc/en-us/articles/1500002893921-Does-TextNow-Support-Verification-Codes`
- `https://www.twilio.com/docs/voice/sdks/react-native`
- `https://www.twilio.com/docs/phone-numbers`
- `https://www.twilio.com/en-us/sms/pricing/us`
- `https://www.twilio.com/en-us/voice/pricing/us`
- `https://www.twilio.com/docs/messaging/compliance/a2p-10dlc`
- `https://www.twilio.com/docs/voice/tutorials/emergency-calling-for-programmable-voice`
- `https://www.bandwidth.com/pricing/`
- `https://dev.bandwidth.com/docs/webrtc/voice-iw/`
- `https://www.bandwidth.com/support/en/articles/12823086-10dlc-fees`
