# Phase 3a Result

## Status
blocked

## Summary
- added native outbound voice transport on iOS and Android that consumes backend-issued voice tokens through Twilio SDKs
- upgraded both mobile dialers with active-call status, duration timers, mute, speaker, keypad/DTMF, and native 911 interception
- expanded the 3a verifier to cover backend voice issuance/history plus native client build and source-of-truth checks for the outbound call UI path

## Commands Run
- `npm install --prefix FreeLine-Backend twilio @fastify/formbody`
- `npm run build --prefix FreeLine-Backend`
- `npm run lint --prefix FreeLine-Backend`
- `npm run test --prefix FreeLine-Backend`
- `cd FreeLine-iOS && xcodegen generate`
- `xcodebuild -project /Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6' build`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android && ./gradlew assembleDebug`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `bash phases/3a-outbound-calling/verify.sh`

## Tests and Verification
- backend build: pass
- backend lint: pass
- backend tests: pass (`30/30`)
- iOS project generation: pass
- iOS simulator build: pass
- Android debug build: pass
- root build: pass
- root lint: pass
- root typecheck: pass
- root tests: pass
- phase verifier: pass (`23/23`)

## Exit Criteria
- [ ] User can make an outbound call from the app to a real phone number: fail, live provider credentials plus a real handset call are still required for honest end-to-end proof
- [ ] Call audio works both directions (caller hears callee, callee hears caller): fail, no live device-to-PSTN call has been completed yet
- [x] Call duration timer displays correctly: pass, both native clients render active-call timers from the connected call anchor and compile cleanly
- [ ] Mute, speaker, DTMF keypad work during call: fail, controls are wired in code and verified statically but still need a live call to prove audio behavior
- [x] Call record saved with correct status and duration: pass, signed webhook verification covers create/update flows and duration persistence
- [x] Call minutes deducted from monthly allowance: pass, verifier confirms allowance depletion and remaining-minute math
- [x] Token refused (429) when monthly cap hit: pass, verifier confirms the upgrade prompt response after allowance exhaustion
- [x] Call history shows all outbound calls: pass, verifier confirms ordering and persisted status/duration
- [x] 911 opens native dialer, not VoIP: pass, both native dialers explicitly route emergency input to the platform dialer instead of the voice SDK path
- [x] All calling endpoints have unit tests: pass, backend test suite covers token issuance, status webhook updates, limits, and signatures
- [x] Build and lint pass: pass, repo, iOS, and Android builds succeeded after the transport integration

## Artifacts
- backend Twilio voice helpers: `FreeLine-Backend/src/calls/twilio-voice.ts`
- backend helper tests: `FreeLine-Backend/src/calls/twilio-voice.test.ts`
- Twilio voice token generation: `FreeLine-Backend/src/telephony/providers/twilio-provider.ts`
- Twilio voice routes: `FreeLine-Backend/src/routes/calls.ts`
- iOS native transport: `FreeLine-iOS/Sources/Calls/TwilioVoiceTransport.swift`
- iOS active call UI: `FreeLine-iOS/Sources/Screens/CallsView.swift`
- Android native transport: `FreeLine-Android/app/src/main/java/com/freeline/app/calls/TwilioVoiceTransport.kt`
- Android active call UI: `FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt`
- repeatable 3a verifier: `phases/3a-outbound-calling/verify.sh`

## Blockers
- live telecom credentials and a real handset are still required to prove a full outbound PSTN call with two-way audio
- mute, speaker routing, and DTMF need device-level proof during a real connected call before 3a can be marked `pass`

## Notes for next phase
- proceed to inbound calling and voicemail while keeping 3a marked `blocked` until live outbound call proof is captured
