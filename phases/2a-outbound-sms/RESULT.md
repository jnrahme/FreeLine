# Phase 2a Result

## Status
blocked

## Summary
- backend outbound SMS now persists conversations and messages in PostgreSQL with allowance tracking, pagination, and provider delivery status updates
- authenticated users can send texts through `POST /v1/messages`, list threads through `GET /v1/conversations`, and load a thread through `GET /v1/conversations/:id/messages`
- telecom delivery-status webhooks are verified via HMAC and update messages from `pending` to `sent` to `delivered`
- both native clients now expose a real inbox, thread view, and compose flow on top of the new messaging APIs

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
- `bash phases/2a-outbound-sms/verify.sh`

## Tests and Verification
- backend build: pass
- backend lint: pass
- backend typecheck: pass
- backend tests: pass (`14/14`)
- iOS build: pass
- Android build: pass
- phase verifier: pass (`19/19`)

## Exit Criteria
- [ ] User can send an SMS from the app that arrives on a real phone
  blocked: the repo now sends through the provider abstraction, but live handset proof still needs real Bandwidth credentials and an external recipient device.
- [x] Message status updates from pending -> sent -> delivered via webhook
- [x] Conversations are listed sorted by most recent message
- [x] Messages within a conversation are paginated correctly
- [x] Usage cap returns 429 when exceeded
- [x] Bandwidth webhook signature is verified
- [ ] Mobile: conversation list -> tap -> thread -> type -> send works
  blocked: the flow is implemented and both native apps build, but this repo still lacks an automated device/simulator UI walkthrough proving the interaction end-to-end.
- [ ] Mobile: new message compose -> enter number -> send works
  blocked: the compose flow is implemented and build-verified, but no automated device/simulator interaction proof exists yet.
- [x] All messaging endpoints have unit tests
- [x] Build and lint pass

## Artifacts
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/db/migrations/0003_messages.sql`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/service.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/postgres-store.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/messages.test.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/routes/messages.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageClient.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/ConversationsView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/MessageThreadView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/NewMessageView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/messaging/MessageApiClient.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/MessagesScreens.kt`

## Blockers
- live carrier delivery is not proven until real Bandwidth credentials and a reachable handset are available
- native message flows are build-verified but not yet proven by automated UI tests or manual simulator recordings

## Notes for next phase
- next target is `2b-inbound-sms`, which can proceed on local code work without hiding the live-delivery blocker from `2a`
