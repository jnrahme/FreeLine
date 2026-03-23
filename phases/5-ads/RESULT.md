# Phase 5 Result

## Status
blocked

## Summary
- Added a debug-only `Quick demo` entry point on both native welcome screens so local iOS and Android builds can jump straight into the seeded authenticated shell for manual UI review without completing login.
- Made the proof path deterministic again by fixing the root abuse test clocking and hardening the phase `5` verifier to reset persisted postgres state before proof, avoid flaky non-U.S. area-code inventory, and keep repeat local runs honest.
- Added backend RevenueCat verification support, subscription persistence, and ad analytics routes for ad-free, lock-my-number, premium, and reward telemetry flows.
- Replaced the iOS and Android dev monetization shells with Google Mobile Ads and RevenueCat-backed runtime paths, including banner/native/interstitial/rewarded hosts and real purchase token forwarding.
- Raised the verifier bar so phase `5` only passes locally when both native apps declare AdMob and RevenueCat dependencies, stop hardcoding `provider: "dev"`, and the backend accepts RevenueCat verification.
- Added an iOS proof-mode harness plus a simulator screenshot script so phase `5` can capture repeatable local artifacts for messages, calls, settings, cap-hit, interstitial, and rewarded flows without manual tapping.
- Added the same proof-mode harness and screenshot automation on Android, so both native clients now emit repeatable runtime artifacts for the core monetization surfaces.
- Expanded both proof harnesses with paid messages and paid calls scenarios so ad suppression is artifacted on the primary ad-bearing screens instead of only in settings.
- Fixed an iOS launch regression by shipping an explicit app `Info.plist`, guarding AdMob startup when the application ID is missing, and regenerating the iOS proof artifacts from a launch-safe build.
- Extended the glass-style redesign across the full iOS shell, including auth, number claim, voicemail, settings, calls, thread, and composer surfaces, so the proof artifacts now reflect a more intentional Apple-native shell instead of mostly stock SwiftUI forms and lists.
- Added a matching Android glass design system and refreshed the welcome, auth, number claim, messages, calls, voicemail, settings, tab chrome, and monetization surfaces so both native apps now share the same lighter, grouped visual language.
- Refreshed the README screenshot gallery and phase `5` proof artifacts from the latest simulator and emulator captures, including updated inbox, thread, compose, calls, settings, paid-tier, and cap-hit states.

## Commands Run
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run build`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run lint`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run typecheck`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && npm run test`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && colima start`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && docker compose up -d postgres redis --wait`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS && xcodegen generate`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS && xcodebuild -project FreeLine.xcodeproj -scheme FreeLine -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && xcodebuild -project FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -configuration Debug -destination 'platform=iOS Simulator,id=964F89BC-AF92-48E2-80A9-7555329A980C' -derivedDataPath .build/ios-derived build`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && xcrun simctl install booted .build/ios-derived/Build/Products/Debug-iphonesimulator/FreeLine.app`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && xcrun simctl launch booted com.freeline.ios`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android && ./gradlew assembleDebug`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && bash scripts/capture_phase5_ios_proof.sh`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && bash scripts/capture_phase5_android_proof.sh`
- `cd /Users/joeyrahme/GitHubWorkspace/FreeLine && bash phases/5-ads/verify.sh`

## Tests and Verification
- Root build: pass
- Root lint: pass
- Root typecheck: pass
- Root tests: pass (`71/71`)
- iOS simulator build: pass
- iOS simulator launch smoke: pass
- iOS built `Info.plist` contains `GADApplicationIdentifier`: pass
- Android debug build: pass
- iOS proof capture script: pass
- Android proof capture script: pass
- Phase verifier: pass (`58/58`)

## Exit Criteria
- [ ] Banner ads display on conversations list, call history, and settings
  fail: both native clients now have repeatable local runtime artifacts for these placements, but live production AdMob app and unit IDs plus inventory proof are still missing.
- [ ] Native sponsored message appears in conversations list (every 5-8 items)
  fail: both native clients now have repeatable local runtime artifacts for the sponsored row, but live production AdMob unit proof is still missing.
- [ ] Interstitial shows after ending a call (max 1 per 30 min)
  fail: both native clients now have repeatable local interstitial artifacts, but a literal end-to-end post-call trigger and frequency proof on live inventory are still missing.
- [ ] Rewarded video plays and credits bonus usage on completion
  fail: both native clients now have repeatable local rewarded artifacts and backend crediting is wired, but a literal end-to-end rewarded completion proof on live inventory is still missing.
- [x] Rewarded unlock limit enforced (max 4/month)
- [x] Usage indicator shows current usage and remaining allowance
- [x] Cap-hit prompt shows "Watch Ad" and "Upgrade" options
- [ ] Ad-Free purchase removes all ads
  fail: local paid-tier suppression is now artifacted on messages, calls, and settings, but the live store and RevenueCat catalog still need credentials and marketplace-backed proof.
- [ ] Lock My Number purchase prevents inactivity reclaim
  fail: the entitlement effect is proven through backend verification and persistence tests, but there is still no live marketplace proof of the purchase path.
- [ ] Premium purchase grants elevated caps + ad-free + lock
  fail: the entitlement effect is proven through backend verification and persistence tests, but there is still no live marketplace proof of the purchase path.
- [x] Subscription status persists across app restarts
- [x] All ads hidden for paid subscribers
- [x] Ad analytics events fire correctly
- [x] Build and lint pass

## Artifacts
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/.env.example`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/config/env.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/routes/subscriptions.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/routes/analytics.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/subscriptions/service.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/subscriptions/revenuecat-verifier.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/subscriptions/subscriptions.test.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/auth/in-memory-store.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Backend/src/abuse/abuse.test.ts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/project.yml`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Config/Info.plist`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Config/AdConfiguration.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Config/SubscriptionConfiguration.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/Phase5ProofScenario.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Monetization/MonetizationClients.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Monetization/SubscriptionPurchaseManager.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Monetization/AdViews.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/AppModel.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/FreeLineAppDelegate.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/App/RootTabView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Design/FreeLineDesign.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/WelcomeView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/EmailAuthView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/EmailVerificationView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/NumberClaimView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/ConversationsView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/MessageThreadView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/NewMessageView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/CallsView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/VoicemailView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/SettingsView.swift`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/build.gradle.kts`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/AndroidManifest.xml`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/FreeLineApplication.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/config/AdConfiguration.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/monetization/MonetizationApiClient.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/monetization/RevenueCatSubscriptionPurchaseManager.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/monetization/MonetizationModels.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/monetization/MonetizationViews.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineAppState.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineApp.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineDesign.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/MessagesScreens.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/VoicemailScreens.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/Phase5ProofScenario.kt`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/README.md`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/docs/screenshots/ios/conversation-thread.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/docs/screenshots/ios/compose-message.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/docs/screenshots/android/messages-free.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/docs/screenshots/android/conversation-thread.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/docs/screenshots/android/calls-dialpad.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/docs/screenshots/android/settings.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/scripts/capture_phase5_ios_proof.sh`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/scripts/capture_phase5_android_proof.sh`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/messages.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/thread-send.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/compose-send.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/messages-paid.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/calls.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/calls-paid.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/settings-free.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/settings-paid.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/cap-hit.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/interstitial.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/ios-proof/rewarded.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/messages.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/thread-send.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/compose-send.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/messages-paid.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/calls.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/calls-paid.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/settings-free.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/settings-paid.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/cap-hit.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/interstitial.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/artifacts/android-proof/rewarded.png`
- `/Users/joeyrahme/GitHubWorkspace/FreeLine/phases/5-ads/verify.sh`

## Blockers
- RevenueCat still needs live public and server credentials plus catalog/product mapping in the dashboard for honest store-backed purchase proof.
- AdMob still needs live app and unit IDs plus inventory proof for banner, native, interstitial, and rewarded placements.
- Local proof is now automated on both platforms across free and paid states, the welcome flow now has a debug-only quick demo jump for faster manual review, the README gallery reflects the refreshed iOS and Android shells, and the phase verifier is green locally at `58/58`; the remaining honest completion blockers are live monetization credentials and live inventory or marketplace proof.

## Notes for next phase
- Capture live AdMob and RevenueCat configuration, then run banner/native/interstitial/rewarded and subscription flows on device or simulator with artifacts.
- If additional UI work is requested before credentials arrive, preserve the new `FreeLineDesign` language and extend it instead of mixing stock lists or forms back into the iOS shell.
- After phase `5` has external proof, return to the earlier blocked phases and reduce remaining human intervention with mobile UI automation where possible.
