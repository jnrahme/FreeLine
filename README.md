# FreeLine

**A free U.S. phone number in your pocket.** FreeLine is a mobile-first VoIP app that gives users a real U.S. phone number for calling and texting over Wi-Fi or mobile data -- no carrier plan required.

The core thesis: phone numbers should feel as free and easy to get as email addresses.

---

## iOS

<p align="center">
  <img src="docs/screenshots/ios/messages-free.png" width="200" alt="Messages inbox with usage overview" />
  <img src="docs/screenshots/ios/conversation-thread.png" width="200" alt="SMS conversation thread" />
  <img src="docs/screenshots/ios/compose-message.png" width="200" alt="Compose new message" />
  <img src="docs/screenshots/ios/calls-dialpad.png" width="200" alt="Calls screen with dial pad" />
</p>

<p align="center">
  <img src="docs/screenshots/ios/settings.png" width="200" alt="Settings and account" />
  <img src="docs/screenshots/ios/messages-premium.png" width="200" alt="Premium messages experience" />
  <img src="docs/screenshots/ios/settings-premium.png" width="200" alt="Premium settings" />
  <img src="docs/screenshots/ios/usage-cap.png" width="200" alt="Usage cap with rewarded unlock" />
</p>

## Android

<p align="center">
  <img src="docs/screenshots/android/messages-free.png" width="200" alt="Messages with usage overview" />
  <img src="docs/screenshots/android/conversation-thread.png" width="200" alt="SMS conversation thread" />
  <img src="docs/screenshots/android/calls-dialpad.png" width="200" alt="Calls screen with dial pad" />
  <img src="docs/screenshots/android/settings.png" width="200" alt="Settings and subscription" />
</p>

---

## What It Does

I built FreeLine as a learning exercise to deeply understand the TextNow product model -- the telephony layer, the unit economics, the abuse controls, and what it takes to offer a free phone number sustainably. Users download the app, sign up, choose a U.S. area code, and claim a free phone number. From there they can send and receive SMS, make and receive voice calls, and access voicemail -- all from inside the app over any internet connection.

### User Flow

1. **Download** the app on iOS or Android
2. **Sign up** with email, Apple Sign-In, or Google Sign-In
3. **Choose** a U.S. area code
4. **Claim** a free phone number
5. **Call and text** from inside the app

### Key Features

| Feature | Details |
|---|---|
| **Free U.S. Number** | One real phone number per user, selected by area code |
| **SMS Messaging** | Send and receive 1:1 text messages with delivery status |
| **Voice Calling** | Outbound and inbound calls with native call UI (CallKit on iOS, ConnectionService on Android) |
| **Voicemail** | Missed calls go to voicemail with in-app playback |
| **Push Notifications** | Real-time alerts for incoming messages and calls, even when the app is backgrounded |
| **Usage Dashboard** | Live tracking of texts sent and call minutes used against monthly caps |
| **Rewarded Unlocks** | Watch an ad to earn bonus texts or call minutes when approaching the cap |
| **Subscription Tiers** | Free (ad-supported), Ad-Free ($4.99/mo), Premium ($9.99/mo) with higher limits |
| **Report & Block** | Per-conversation reporting and blocking for spam/abuse |

---

## How It Works

### Architecture

FreeLine is a three-tier system: native mobile clients, a backend API, and telephony providers.

```
iOS App (SwiftUI)  ──┐
                     ├──▶  Backend API (Fastify + TypeScript)
Android App (Compose)┘          │
                                ├──▶ PostgreSQL (users, messages, calls, numbers)
                                ├──▶ Redis (rate limits, caching, sessions)
                                ├──▶ Bandwidth / Twilio (telephony)
                                ├──▶ APNs / FCM (push notifications)
                                ├──▶ RevenueCat (subscriptions)
                                └──▶ AdMob (ads)
```

### Telephony Layer

All telecom operations are behind a `TelephonyProvider` interface, allowing the backend to swap between providers without changing application logic.

- **Primary provider:** Bandwidth -- owns its own Tier 1 network, ~50% cheaper than Twilio at scale
- **Fallback provider:** Twilio -- more polished developer experience, used as contingency
- **Dev provider:** Stub -- deterministic responses for safe local testing

The provider handles number search/provisioning, SMS send/receive, voice token generation, and inbound call routing.

### Voice Calling Flow

FreeLine uses VoIP, not the device's cellular radio. Inbound calls work even when the app is in the background:

- **iOS:** PushKit delivers a silent wake notification, CallKit presents the native incoming call screen
- **Android:** FCM high-priority data message wakes the app, ConnectionService presents the native call UI

Outbound calls are placed through the Twilio Voice SDK with access tokens generated server-side.

### SMS Flow

```
User sends message ──▶ Backend validates (rate limits, policy, caps)
                       ──▶ Bandwidth/Twilio sends SMS to PSTN
                       ──▶ Webhook confirms delivery status
                       ──▶ App updates with "Delivered" / "Read"

Recipient replies  ──▶ Bandwidth/Twilio webhook hits backend
                       ──▶ Backend stores message, resolves conversation
                       ──▶ Push notification sent to user's device
                       ──▶ Real-time WebSocket update to active app
```

### Monetization Model

FreeLine follows the proven TextNow formula: free tier subsidized by ads, with paid upgrades for power users.

| Tier | Price | Texts/mo | Call Minutes/mo | Ads |
|---|---|---|---|---|
| **Free** | $0 | 40 (up to 80 with rewarded ads) | 15 (up to 35 with rewarded ads) | Banner, interstitial, rewarded |
| **Ad-Free** | $4.99/mo | 40 | 15 | None |
| **Premium** | $9.99/mo | 250 | 90 | None |

Ad placements are non-intrusive: banners in the inbox, interstitials at natural transition points (after ending a call), and opt-in rewarded videos to earn bonus usage. Ads never interrupt active conversations or calls.

### Abuse Controls & Cost Management

Unit economics are the make-or-break constraint for a free telephony product. FreeLine enforces:

- **Usage caps** -- daily and monthly limits on texts and call minutes per user
- **Rate limiting** -- per-user and global rate limits on outbound traffic
- **Inactivity reclaim** -- free numbers are recycled after 14 days of inactivity (warnings at day 10 and 13)
- **Number quarantine** -- released numbers sit in quarantine for 45 days before reassignment
- **Trust scoring** -- new accounts start with conservative limits that relax over time
- **First-7-day caps** -- 10 outbound texts/day, 5 unique contacts/day, 10 call minutes/day
- **A2P 10DLC compliance** -- registered as application-to-person messaging for carrier compliance

### Number Lifecycle

```
User claims number ──▶ 24h activation window (must send/receive a real message or call)
                       ──▶ Active: number stays assigned while account is used
                       ──▶ Inactive 10 days: warning notification
                       ──▶ Inactive 13 days: final warning
                       ──▶ Inactive 14 days: number reclaimed
                       ──▶ Quarantine (45 days): number cannot be reassigned
                       ──▶ Available: number re-enters inventory
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **iOS** | SwiftUI, PushKit, CallKit, Twilio Voice SDK, AdMob SDK, RevenueCat |
| **Android** | Kotlin, Jetpack Compose, ConnectionService, FCM, Twilio Voice SDK, AdMob SDK, RevenueCat |
| **Backend** | TypeScript, Fastify, Node.js 18+ |
| **Database** | PostgreSQL |
| **Cache** | Redis |
| **Telephony** | Bandwidth (primary), Twilio (fallback) |
| **Subscriptions** | RevenueCat |
| **Ads** | Google AdMob |
| **Auth** | JWT, OAuth 2.0 (Apple, Google) |

## Repo Structure

```
FreeLine/
  FreeLine-iOS/          SwiftUI iOS app
  FreeLine-Android/      Kotlin + Jetpack Compose Android app
  FreeLine-Backend/      TypeScript API server
  phases/                Feature phase specs and verification artifacts
  docs/                  Privacy policy, terms of service, support
  scripts/               Verification and automation
```

## API Surface

```
Auth:       POST /v1/auth/email/start, /verify, /oauth/apple, /oauth/google, /refresh
Numbers:    GET  /v1/numbers/search?areaCode=..., POST /claim, GET /me, POST /release
Messaging:  GET  /v1/conversations, GET /:id/messages, POST /v1/messages
Calls:      POST /v1/calls/token, GET /history, GET /voicemails
Controls:   POST /v1/blocks, POST /v1/reports
Webhooks:   POST /v1/webhooks/telecom/messages/inbound, /status, /calls/inbound, /status
```

---

## Cost Model

FreeLine is designed as a subsidized communications product, not a carrier plan. Every architectural decision is informed by per-user unit economics.

| Metric | Target |
|---|---|
| Telecom cost per active user | < $1.50/mo (Bandwidth) |
| Ad ARPU per active user | > $1.00/mo |
| Freemium conversion rate | > 3% |
| Idle number percentage | < 10% of provisioned |

At **10,000 active users**, the app is projected to generate **$3,000 - $8,000/month** in gross margin.

---

## How the Business Actually Works

Building FreeLine forced me to internalize the business mechanics behind a free telephony product. These are the core dynamics I learned by implementing them.

### "Free" Has a Real Cost Floor

Every claimed number has a monthly cost whether the user touches it or not. On Bandwidth, a single number is $0.50/month just to hold. Add 40 texts and 15 call minutes and you're at ~$0.74/user/month. A maxed-out free user hitting the hard cap costs ~$1.21/month. This is the fundamental constraint the entire product is designed around.

| User Type | Monthly Telecom Cost |
|---|---|
| Claimed but churned within 14 days | $0.15 - $0.25 |
| Free user at included allowance (40 texts, 15 min) | ~$0.74 |
| Maxed free user at hard ceiling (80 texts, 35 min) | ~$1.21 |
| Paid subscriber (250 texts, 120 min) | ~$3.23 |

### The Revenue Side Has to Close the Gap

U.S. messaging app ad ARPU runs $0.50 - $2.00/month. That barely covers even a light free user. The business only works when you stack multiple revenue levers together:

1. **Aggressive free-tier caps** keep per-user telecom cost bounded
2. **Banner + interstitial + rewarded ads** generate baseline ARPU
3. **Freemium conversion at 3%+** produces $4.99 - $9.99/month subscribers who subsidize ~3-4 free users each
4. **Rewarded video** is the highest-value ad format ($15-$30 eCPM) and also the mechanism that lets free users earn more usage -- aligning user engagement with revenue
5. **Number recycling** eliminates the $0.50/month carrying cost on idle inventory

This is why TextNow's model works at scale -- it's not just an app with ads, it's an economic machine where every feature either generates revenue or controls cost.

### Number Recycling Is an Economic Necessity

If inactive users keep numbers forever, inventory cost grows linearly with total signups regardless of engagement. At 100,000 total signups with 20% active, you'd be paying $40,000/month to hold 80,000 idle numbers. The 14-day inactivity reclaim policy isn't punitive -- it's what makes the free tier mathematically possible.

The 45-day quarantine after release prevents the wrong person from receiving someone else's messages. The 24-hour activation window prevents number hoarding. These aren't edge-case policies -- they're load-bearing business logic.

### Abuse Prevention Is Cost Prevention

A single spam account that sends 1,000 messages costs $4-$8 in telecom fees and can get the entire sending number pool flagged by carriers. Abuse controls (rate limits, trust scoring, first-7-day caps, unique contact limits) aren't a safety feature bolted on after launch -- they're a direct cost containment mechanism. One uncontrolled weekend of spam can burn through more telecom budget than a month of legitimate users.

### Provider Choice Directly Impacts Viability

Bandwidth owns its own Tier 1 network. Twilio resells capacity. The difference is ~50% on per-user cost:

| | Bandwidth | Twilio |
|---|---|---|
| Phone number | $0.50/mo | $1.15/mo |
| SMS per message | $0.004 | $0.0079 |
| Voice per minute | $0.010 | $0.014 |
| Light user total | ~$1.50/mo | ~$2.66/mo |

On Twilio, ad revenue alone cannot cover the cost of a free user. On Bandwidth, the gap is narrow enough that ads + a small paid conversion rate can close it. Provider selection isn't a technical decision -- it's the difference between a viable business and a cash incinerator.

### A2P 10DLC Is a Launch Gate

Any app sending SMS from a U.S. 10-digit long code must register for A2P 10DLC. Campaign vetting takes 2-4 weeks. If you don't start registration on day one of development, your SMS feature is blocked at launch regardless of how polished the app is. This is one of those things that looks like a compliance checkbox but is actually a critical-path scheduling dependency.

### The Subscription Tiers Are Priced Against the Cost Floor

- **Ad-Free ($4.99/mo)** removes ads but keeps the same usage limits. Margin: ~$4.25/mo. Pure profit from users who value the experience.
- **Premium ($9.99/mo)** adds higher caps (250 texts, 90 min) and locked number. Margin: ~$6.77/mo. These users subsidize 5-9 free users each.
- **Lock My Number ($1.99/mo)** just disables the inactivity reclaim. Almost pure margin since it's a policy toggle, not a resource increase.

Every tier is priced to clear the telecom cost floor with room for infrastructure overhead. The free tier isn't a loss leader in the traditional sense -- it's a user acquisition channel where ad revenue partially offsets the subsidy.

### Scale Economics

| Active Users | Monthly Telecom (included bundle) | Monthly Telecom (all maxed) | Projected Gross Margin |
|---|---|---|---|
| 100 | ~$74 | ~$121 | Pre-revenue |
| 1,000 | ~$740 | ~$1,210 | Approaching breakeven |
| 5,000 | ~$3,700 | ~$6,050 | $1,000 - $4,000/mo |
| 10,000 | ~$7,400 | ~$12,100 | $3,000 - $8,000/mo |

The model doesn't require venture funding to validate. Total cash burn to reach 1,000 active users is estimated at $500 - $1,500 over ~6 months. It flips to consistent profitability once ad fill rates stabilize, freemium conversion holds at 3%+, and number recycling keeps idle inventory below 10%.

---

## Why I Built This

I built FreeLine to demonstrate that I understand the TextNow product from the inside out -- not just the user-facing features, but the underlying economics, infrastructure, and operational challenges that make a free telephony product work.

This project covers:

1. **Telephony provider integration** -- Bandwidth as primary, Twilio as fallback, behind a swappable `TelephonyProvider` interface
2. **Unit economics modeling** -- per-user cost tracking, usage caps, and the math behind subsidizing free numbers with ads and paid upgrades
3. **Abuse and cost controls** -- rate limiting, trust scoring, number recycling, and quarantine policies built into the foundation
4. **Native mobile development** -- separate SwiftUI (iOS) and Jetpack Compose (Android) codebases with platform-native call handling (PushKit/CallKit, FCM/ConnectionService)
5. **Monetization architecture** -- AdMob integration, RevenueCat subscriptions, and rewarded ad unlocks as the bridge between free and paid tiers

The full product -- auth, number claiming, SMS, voice, voicemail, ads, subscriptions, abuse controls, admin ops, and number lifecycle management -- is implemented across **11 execution phases**, each with automated verification and proof artifacts for both platforms.
