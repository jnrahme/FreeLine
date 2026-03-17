# Phase 2b Result

## Status
blocked

## Summary
- backend inbound SMS now verifies signed telecom webhooks, persists inbound messages, increments unread counts, tracks allowance consumption, and exposes read, block, report, and push-token APIs
- backend realtime delivery now fans out through an authenticated websocket channel as well as the dev JSONL proof sink
- STOP and HELP compliance flows are active: STOP marks the conversation opted out and blocks future outbound sends, while HELP emits the support auto-reply
- dev proof artifacts now include push events, realtime events, and telecom send logs, which makes local verification of inbound flows and compliance replies reproducible
- both native clients now maintain session-scoped realtime sockets, merge live inbound/status events into conversation state, surface unread badges, and keep block/report actions available in the thread UI

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
- `bash phases/2b-inbound-sms/verify.sh`

## Tests and Verification
- root build: pass
- root lint: pass
- root typecheck: pass
- backend tests: pass (`65/65`)
- iOS build: pass
- Android build: pass
- phase verifier: pass (`22/22`)

## Exit Criteria
- [ ] Reply from a real phone appears in the app via webhook
  blocked: the inbound path is locally proven through signed webhook delivery and persisted threads, but real external handset proof still needs live carrier credentials and a reachable phone outside the dev harness.
- [ ] Push notification fires when app is backgrounded
  blocked: backend push-token registration and dev push-event logging are verified, but real APNs/FCM credentials and a backgrounded device proof are not wired yet.
- [ ] Tapping push notification opens the correct conversation
  blocked: the thread-opening state exists in both clients, but no native push payload handling or device-level tap-through proof exists yet.
- [x] WebSocket delivers inbound message when app is foregrounded
- [ ] Unread badge updates on conversations list
  blocked: unread badges are now fed by the live websocket path in both native clients, but there is still no automated simulator/device UI proof showing the badge update on screen.
- [x] STOP message sets conversation to opted-out; outbound returns 403
- [x] HELP message triggers auto-reply
- [x] Blocked number's inbound messages are silently dropped
- [x] Report saves for admin review
- [x] Inbound texts count against monthly allowance
- [x] All new endpoints have unit tests
- [x] Build and lint pass

## Artifacts
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/db/migrations/0004_inbound_sms.sql`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/service.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/postgres-store.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/in-memory-store.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/messages.test.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/routes/messages.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/notifications/fanout-realtime-publisher.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/notifications/dev-push-notifier.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/notifications/dev-realtime-publisher.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/notifications/realtime-gateway.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/telephony/dev-telemetry.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/AppModel.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageClient.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageRealtimeClient.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageModels.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/ConversationsView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/MessageThreadView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/messaging/MessageApiClient.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/messaging/MessageRealtimeClient.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineAppState.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/MessagesScreens.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2b-inbound-sms/verify.sh`

## Blockers
- real APNs/FCM credentials and a device-level push proof are still missing
- native push payload routing and tap-through proof are still missing
- native message flows are build-verified, but there is still no automated simulator/device UI walkthrough proving unread badge updates and push navigation end-to-end

## Notes for next phase
- the websocket blocker is closed locally; the remaining 2b gaps are all push/device proof
- next local implementation gap in phase order is voicemail object-storage archival for `3b-inbound-calling`
