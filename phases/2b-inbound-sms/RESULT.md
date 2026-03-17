# Phase 2b Result

## Status
blocked

## Summary
- Kept the backend inbound SMS, websocket, STOP/HELP, block/report, and push-token flows green while extending local proof to cover unread-badge and thread-route behavior.
- Finished the iOS message-route plumbing so inbound message payloads can queue a requested conversation, open it after launch, and reuse proof-mode scenarios for unread-badge and push-route artifacts.
- Finished the Android message-route plumbing by wiring message push-token sync, message notification tap routing, and proof-mode route handling into the app state and FCM service.
- Added repeatable iOS and Android proof capture scripts for `inbound-badge` and `push-route`, then raised the phase verifier so those artifacts are part of the local completion bar.

## Commands Run
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run build`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run lint`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run typecheck`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run test`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS && xcodegen generate`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && xcodebuild -project FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6' build`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android && ./gradlew assembleDebug`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && bash scripts/capture_phase2b_ios_proof.sh`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && bash scripts/capture_phase2b_android_proof.sh`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && bash phases/2b-inbound-sms/verify.sh`

## Tests and Verification
- Root build: pass
- Root lint: pass
- Root typecheck: pass
- Root tests: pass (`66/66`)
- iOS project regenerate: pass
- iOS simulator build: pass
- Android debug build: pass
- iOS 2b proof capture: pass
- Android 2b proof capture: pass
- Phase verifier: pass (`24/24`)

## Exit Criteria
- [ ] Reply from a real phone appears in the app via webhook
  blocked: the inbound path is still only locally proven through signed webhook delivery, persisted threads, and proof artifacts; live carrier credentials and a reachable handset are still required for honest real-phone proof.
- [ ] Push notification fires when app is backgrounded
  blocked: local token registration, Android notification runtime wiring, and proof artifacts are now in place, but real APNs/FCM credentials plus backgrounded device proof are still missing.
- [ ] Tapping push notification opens the correct conversation
  blocked: both native clients now implement local conversation routing and automated route proof, but literal push-tap proof still needs live APNs/FCM delivery on device.
- [x] WebSocket delivers inbound message when app is foregrounded
- [x] Unread badge updates on conversations list
- [x] STOP message sets conversation to opted-out; outbound returns 403
- [x] HELP message triggers auto-reply
- [x] Blocked number's inbound messages are silently dropped
- [x] Report saves for admin review
- [x] Inbound texts count against monthly allowance
- [x] All new endpoints have unit tests
- [x] Build and lint pass

## Artifacts
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/service.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/messages/messages.test.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/routes/messages.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/notifications/dev-push-notifier.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/AppModel.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/FreeLineApp.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/FreeLineAppDelegate.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/Phase5ProofScenario.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageClient.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageRoute.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Messages/MessageRouteCoordinator.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/ConversationsView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/calls/FreeLineFirebaseMessagingService.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/auth/SessionStore.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/messaging/MessageApiClient.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineApp.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineAppState.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/MessageLaunchRoute.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/Phase5ProofScenario.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/AndroidManifest.xml`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/scripts/capture_phase2b_ios_proof.sh`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/scripts/capture_phase2b_android_proof.sh`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2b-inbound-sms/artifacts/ios-proof/inbound-badge.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2b-inbound-sms/artifacts/ios-proof/push-route.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2b-inbound-sms/artifacts/android-proof/inbound-badge.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2b-inbound-sms/artifacts/android-proof/push-route.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/2b-inbound-sms/verify.sh`

## Blockers
- Real APNs/FCM credentials are still required for literal background push delivery and push-tap proof.
- Live carrier credentials and a real handset are still required for honest inbound-from-a-real-phone proof.
- The phase is locally stronger now, but it remains blocked on external device and provider inputs.

## Notes for next phase
- Keep `5-ads` blocked on live AdMob and RevenueCat credentials.
- If continuing local automation before external credentials arrive, the next honest gap is `2a-outbound-sms` native UI interaction proof.
