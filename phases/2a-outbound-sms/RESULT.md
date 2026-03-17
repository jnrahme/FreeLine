# Phase 2a Result

## Status
blocked

## Summary
- backend outbound SMS now persists conversations and messages in PostgreSQL with allowance tracking, pagination, and provider delivery status updates
- authenticated users can send texts through `POST /v1/messages`, list threads through `GET /v1/conversations`, and load a thread through `GET /v1/conversations/:id/messages`
- telecom delivery-status webhooks are verified via HMAC and update messages from `pending` to `sent` to `delivered`
- both native clients now expose a real inbox, thread view, and compose flow on top of the new messaging APIs
- iOS and Android now ship deterministic proof-mode outbound message automation plus captured inbox, thread-send, compose-draft, and compose-send screenshots for local UI verification

## Commands Run
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `docker compose up -d postgres redis --wait`
- `npm run migrate --prefix FreeLine-Backend`
- `cd FreeLine-iOS && xcodegen generate`
- `xcodebuild -project FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6' build`
- `cd FreeLine-Android && ./gradlew assembleDebug`
- `bash scripts/capture_phase2a_ios_proof.sh`
- `bash scripts/capture_phase2a_android_proof.sh`
- `bash phases/2a-outbound-sms/verify.sh`

## Tests and Verification
- root build: pass
- root lint: pass
- root typecheck: pass
- root tests: pass (`66/66`)
- iOS build: pass
- Android build: pass
- iOS proof capture: pass
- Android proof capture: pass
- phase verifier: pass (`29/29`)

## Exit Criteria
- [ ] User can send an SMS from the app that arrives on a real phone
  blocked: the repo now sends through the provider abstraction, but live handset proof still needs real Bandwidth credentials and an external recipient device.
- [x] Message status updates from pending -> sent -> delivered via webhook
- [x] Conversations are listed sorted by most recent message
- [x] Messages within a conversation are paginated correctly
- [x] Usage cap returns 429 when exceeded
- [x] Bandwidth webhook signature is verified
- [x] Mobile: conversation list -> tap -> thread -> type -> send works
- [x] Mobile: new message compose -> enter number -> send works
- [x] All messaging endpoints have unit tests
- [x] Build and lint pass

## Artifacts
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/db/migrations/0003_messages.sql`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/service.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/postgres-store.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/messages.test.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/routes/messages.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageClient.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/AppModel.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/Phase5ProofScenario.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/ConversationsView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/MessageThreadView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/NewMessageView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/messaging/MessageApiClient.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineAppState.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/Phase5ProofScenario.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/MessagesScreens.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/scripts/capture_phase2a_ios_proof.sh`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/scripts/capture_phase2a_android_proof.sh`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/ios-proof/thread-flow-inbox.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/ios-proof/thread-flow-sent.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/ios-proof/compose-flow-compose.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/ios-proof/compose-flow-sent.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/android-proof/thread-flow-inbox.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/android-proof/thread-flow-sent.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/android-proof/compose-flow-compose.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2a-outbound-sms/artifacts/android-proof/compose-flow-sent.png`

## Blockers
- live carrier delivery is not proven until real Bandwidth credentials and a reachable handset are available
- provider-side delivery still needs literal Bandwidth credentials and a real recipient device before the phase can honestly move from `blocked` to `pass`

## Notes for next phase
- local `2a` proof is now complete; remaining blocked phases should only move if they still have an unclosed local automation or verification gap
