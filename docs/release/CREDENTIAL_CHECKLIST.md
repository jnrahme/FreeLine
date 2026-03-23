# FreeLine Credential Checklist

Use this checklist when moving from local proof to live device proof and store-ready builds.

## 1. Root `.env` / `.env.local`

Fill these values in the repo root:

### Core backend secrets

- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `MAINTENANCE_API_KEY`

### Bandwidth path

- `BANDWIDTH_ACCOUNT_ID`
- `BANDWIDTH_API_TOKEN`
- `BANDWIDTH_API_SECRET`
- `BANDWIDTH_MESSAGING_APPLICATION_ID`
- `BANDWIDTH_WEBHOOK_SECRET`

### Twilio path

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- `TWILIO_VOICE_APP_SID`
- `TWILIO_VOICE_PUSH_CREDENTIAL_SID`
- `TWILIO_WEBHOOK_SECRET`

### RevenueCat backend

- `REVENUECAT_SECRET_KEY`
- `REVENUECAT_API_BASE_URL`

### Cost / compliance flags

- `A2P_10DLC_REGISTERED=true` only after the campaign is actually approved
- `COST_ALERT_THRESHOLD_USD`
- `ESTIMATED_NUMBER_MONTHLY_COST_USD`
- `ESTIMATED_TEXT_EVENT_COST_USD`
- `ESTIMATED_CALL_MINUTE_COST_USD`

## 2. Android build-time values

These are not loaded from `.env` yet.

Edit [build.gradle.kts](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/build.gradle.kts):

- `REVENUECAT_PUBLIC_API_KEY`
- `admob_application_id`

Edit [APIConfiguration.kt](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/config/APIConfiguration.kt):

- backend base URL for the active environment

Edit [AdConfiguration.kt](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/config/AdConfiguration.kt):

- banner unit ID
- interstitial unit ID
- native unit ID
- rewarded unit ID

Add Firebase config:

- `google-services.json`
- FCM project / service credentials

## 3. iOS build-time values

These are configured in source and plist files, not the root `.env`.

Edit [APIConfiguration.swift](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Config/APIConfiguration.swift):

- backend base URL for the active environment

Edit [AdConfiguration.swift](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Config/AdConfiguration.swift):

- banner unit ID
- interstitial unit ID
- native unit ID
- rewarded unit ID

Edit [SubscriptionConfiguration.swift](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Config/SubscriptionConfiguration.swift):

- RevenueCat public SDK key

Edit [Info.plist](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Config/Info.plist):

- `GADApplicationIdentifier`
- `RevenueCatPublicAPIKey`

Apple push / calling assets:

- APNs auth key `.p8`
- Apple `TEAM_ID`
- Apple `KEY_ID`

## 4. External dashboards and human-only setup

- A2P 10DLC brand and campaign submission
- at least one live U.S. number on the chosen provider
- AdMob app registration and production unit IDs
- RevenueCat entitlements and product mapping
- App Store Connect and Google Play product IDs
- production object storage bucket for voicemail archival proof
- support email
- privacy policy URL
- terms URL

## 5. Real-device proof inputs

- two real phones
- one safe U.S. destination number for SMS and calls
- one signed-in iPhone test device
- one signed-in Android test device

## 6. Current release blockers that still require humans

- A2P 10DLC approval
- live telecom credentials
- APNs and FCM credentials
- live AdMob and RevenueCat configuration
- store product mapping
- real handset SMS, push, and voice proof
