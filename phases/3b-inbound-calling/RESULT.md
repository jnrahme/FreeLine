# Phase 3b Result

## Status
blocked

## Summary
- completed the backend inbound-calling surface with signed telecom and Twilio webhook handling, call-push token persistence, voicemail CRUD, missed-call notifications, and monthly-cap voicemail fallback
- replaced provider-hosted voicemail URLs with a backend-managed archive path that downloads recordings into local object storage, serves them through backend-owned media URLs, and removes archived media on delete
- added native incoming-call entry scaffolding on both clients: iOS now boots PushKit, APNs alert-token registration, and CallKit reporting from the app lifecycle; Android now has a foreground incoming-call service, ConnectionService shell, and an FCM messaging service that can register alert tokens and wake the incoming-call UI path
- added in-app voicemail playback on iOS and Android, then expanded the 3b verifier into a 44-check proof script that covers backend flows, archived voicemail media persistence, Twilio wrappers, voicemail inbox behavior, and both native client builds

## Commands Run
- `npm run build --prefix FreeLine-Backend`
- `npm run test --prefix FreeLine-Backend`
- `bash phases/3b-inbound-calling/verify.sh`

## Tests and Verification
- backend tests: pass (`65/65`)
- backend build: pass
- root build: pass
- root lint: pass
- root typecheck: pass
- root tests: pass
- local voicemail fixture server: pass
- database migrations: pass
- iOS project generation: pass
- iOS simulator build: pass
- Android debug build: pass
- phase verifier: pass (`44/44`)

## Exit Criteria
- [ ] Inbound call to FreeLine number wakes the app from background: blocked, local PushKit and FCM entry paths exist but real background wake still needs live provider pushes and handset proof
- [ ] iOS: CallKit shows native incoming call screen (including lock screen): blocked, CallKit reporting code is present and compiles but no real APNs/Twilio incoming call has been exercised on a device
- [ ] Android: full-screen notification shows with answer/decline: blocked, the foreground-service path exists and builds but no live FCM wake proof has been captured
- [ ] Answering connects WebRTC call with audio both directions: blocked, inbound invite acceptance and two-way media are not proven end to end yet
- [ ] Declining routes caller to voicemail: blocked, the decline path has not been verified against a live inbound provider call
- [x] Unanswered call (30s timeout) routes to voicemail: pass locally, the Twilio inbound route now emits a timed client dial plus voicemail redirect and the telecom path falls back to voicemail when caps are exceeded
- [ ] Voicemail recording saved to S3 and appears in voicemail inbox: blocked, voicemail records now appear with backend-owned archived media URLs and survive after the provider recording disappears, but literal S3/bucket-backed proof still needs production object-storage credentials
- [x] Voicemail playback works in the app: pass, both native clients now stream voicemail audio from backend-owned archived media URLs
- [x] Missed call notification sent and logged in history: pass, verifier proves missed-call push artifacts and history persistence
- [ ] Inbound call minutes counted against monthly allowance: blocked, the backend usage model supports it but a live answered inbound call still needs to be exercised to prove the allowance path honestly
- [x] Calls route directly to voicemail when cap is exceeded: pass, verifier proves cap exhaustion suppresses wake push and returns voicemail routing
- [x] Call history shows outbound, inbound, and missed calls: pass locally, verifier confirms inbound missed and outbound completed records persist in history
- [x] All new endpoints have unit tests: pass, backend suite now covers generic inbound/voicemail routes plus the Twilio inbound and voicemail wrappers
- [x] Build and lint pass: pass

## Artifacts
- backend inbound-call service logic: `FreeLine-Backend/src/calls/service.ts`
- backend voicemail archive driver: `FreeLine-Backend/src/calls/voicemail-archive.ts`
- backend call routes and TwiML wrappers: `FreeLine-Backend/src/routes/calls.ts`
- backend call tests: `FreeLine-Backend/src/calls/calls.test.ts`
- iOS incoming-call lifecycle: `FreeLine-iOS/Sources/App/FreeLineApp.swift`
- iOS app delegate for APNs alert token registration: `FreeLine-iOS/Sources/App/FreeLineAppDelegate.swift`
- iOS PushKit and CallKit runtime: `FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift`
- iOS voicemail playback: `FreeLine-iOS/Sources/Calls/VoicemailPlaybackController.swift`
- Android FCM entry service: `FreeLine-Android/app/src/main/java/com/freeline/app/calls/FreeLineFirebaseMessagingService.kt`
- Android incoming-call foreground service: `FreeLine-Android/app/src/main/java/com/freeline/app/calls/IncomingCallForegroundService.kt`
- Android connection service: `FreeLine-Android/app/src/main/java/com/freeline/app/calls/FreeLineConnectionService.kt`
- Android voicemail playback: `FreeLine-Android/app/src/main/java/com/freeline/app/calls/VoicemailPlayer.kt`
- repeatable 3b verifier: `phases/3b-inbound-calling/verify.sh`

## Blockers
- live APNs/FCM credentials plus real handset testing are still required to prove background wake, lock-screen/full-screen incoming UI, answer/decline routing, and two-way audio for inbound calls
- literal S3 or production object-storage credentials are still needed if phase 3b is going to claim bucket-backed voicemail archival exactly as written in the phase spec

## Notes for next phase
- 3b no longer has a local provider-URL archival gap; the next highest-value local work is either phase 5 monetization truth or simulator/device UI automation for blocked telecom phases
