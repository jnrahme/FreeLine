# Session Checkpoint

## Status
- State: blocked
- Last updated: 2026-03-18
- Workspace: clean
- Saved implementation checkpoint: `6b8aa94`
- Remote backup target: `jnrahme/FreeLine`
- Push/account note: use `jnrahme` for remote backup pushes to `origin`, then restore the active GitHub account to `joey-rahme_boats`

## Current phase
- Phase: 5-ads
- Phase status: blocked

## Next target
- Phase: 5-ads

## Verified local state
- 0-foundation (local proof green, including a real Twilio fallback for number search/provision/release and signed SMS webhook handling when configured; A2P submission still blocked externally)
- 1a-auth
- 1b-number-claim
- 2a-outbound-sms (local proof now covers inbox, thread-send, compose-draft, and compose-send on both native clients; external product proof still blocked)
- 2b-inbound-sms (local websocket delivery, native payload routing, unread-badge proof, and push-route proof are now automated and verified; live push/device proof still blocked)
- 3a-outbound-calling (local proof complete, live outbound handset/audio proof still blocked)
- 3b-inbound-calling (local proof complete, including backend-owned voicemail archival and media cleanup; external incoming-call proof and production bucket credentials still blocked)
- 4a-abuse-controls
- 4b-number-lifecycle
- 4c-admin-ops
- 5-ads (local verifier now passes `55/55`, the iOS launch regression caused by a missing AdMob app ID is fixed, and both iOS and Android proof artifacts now capture free and paid messages, calls, settings, cap-hit, interstitial, and rewarded states without manual tapping)
- iOS shell refresh (the signed-out flow plus the signed-in messages, calls, voicemail, settings, thread, and composer surfaces now share a reusable Apple-native glass design system and refreshed proof artifacts)
- US-only telephony guardrails (backend now rejects non-US `+1` destinations and inventory, so Canada and the rest of NANP no longer slip through the SMS/calling/number-claim paths)

## Active blockers
- 0-foundation still needs the A2P 10DLC brand registration submitted to satisfy the phase spec honestly
- 2a-outbound-sms still needs live telecom credentials and a real recipient handset for literal carrier delivery proof; Bandwidth remains the default path, and Twilio is now a verified fallback if that is the easier credential path
- 2b-inbound-sms still needs real APNs/FCM credentials plus literal device push delivery/tap-through proof; the local unread-badge and route-into-thread gaps are now closed
- 3a-outbound-calling still needs live provider credentials and a real handset call to prove two-way audio, DTMF, and speaker routing end to end
- 3b-inbound-calling still needs live APNs/FCM plus handset proof for background wake, native incoming-call answer/decline routing, and two-way audio, and still needs production S3/object-storage credentials for literal bucket-backed archival proof
- 5-ads still needs live AdMob app and unit IDs, and RevenueCat public/server credentials plus store catalog mapping

## Exact next action
- No remaining honest local-only blocker is identified after the Twilio fallback hardening pass; the next work requires external A2P submission, live telecom credentials plus handset proof, APNs/FCM credentials plus device proof, production object-storage credentials, and live AdMob/RevenueCat/store configuration.

## Recent commits
- `6b8aa94 feat: enforce strict us-only telephony policy`
- `75b7985 fix: preserve quarantine on manual number release`
- `5896295 docs: save disconnect checkpoint`
- `abb0eab docs: checkpoint session after twilio fallback`
- `9636c68 feat: harden twilio telephony fallback`
- `b0766a3 feat: automate outbound sms ui proof`
- `ed810bf docs: checkpoint session after 2b automation`
- `cf5e874 feat: automate inbound message route proof`
- `7d07c0f feat: redesign ios app shell`
- `bbaa9fd fix: restore ios launch for monetization build`

## Restart prompt
- Continue FreeLine in autonomous completion mode. Read `AGENTS.md`, `PROGRESS.md`, and `SESSION.md`, keep phase `5` marked blocked on external monetization credentials, preserve the new iOS design system from `7d07c0f`, and do not invent further local completion work unless a real repo-local gap is discovered.
