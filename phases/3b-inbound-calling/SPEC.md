# Phase 3b: Inbound Calling + Voicemail

**Target: Weeks 7-8**
**Depends on: Phase 3a complete**

This is the hardest phase in the project. Budget extra time.

## Goal

When someone calls the user's FreeLine number, the app wakes up (even from background/killed state), displays a native incoming call UI, and connects the call. Unanswered calls go to voicemail.

## Tasks

### 1. Inbound call webhook
- `POST /v1/webhooks/telecom/calls/inbound`
  - Verify webhook signature
  - Look up which user owns the called number
  - Send push notification to wake the app (see below)
  - Return call instructions: ring the client for 30 seconds, then route to voicemail

### 2. iOS: PushKit + CallKit
- Create VoIP push certificate in Apple Developer portal
- Configure PushKit in the mobile app
- Register for VoIP pushes on app launch
- `POST /v1/devices/voip-token` -- send VoIP push token to backend
- Backend stores VoIP token separately from regular push token
- On inbound call: backend sends VoIP push via APNs
- App receives VoIP push -> present CallKit incoming call screen
- CallKit shows native call UI (works from lock screen, works when app is killed)
- Answer -> establish WebRTC session with provider
- Decline -> notify backend -> route to voicemail

### 3. Android: FCM high-priority + ConnectionService
- Configure FCM high-priority data messages (not notification messages)
- On inbound call: backend sends high-priority FCM data message
- App receives FCM message -> start foreground service
- Display full-screen incoming call notification (answer/decline buttons)
- Configure ConnectionService for native call integration
- Answer -> establish WebRTC session with provider
- Decline -> notify backend -> route to voicemail

### 4. react-native-callkeep integration
- Install and configure `react-native-callkeep`
- Wraps CallKit (iOS) and ConnectionService (Android)
- Handle events: display incoming call, answer, end, hold, mute, DTMF
- Ensure audio routing works correctly (speaker, earpiece, bluetooth)

### 5. Voicemail
- Database: `voicemails` table: id, user_id, phone_number_id, caller_number, audio_url, duration_seconds, transcription (null for now), is_read, created_at
- Configure voicemail on the provider: after 30s no-answer, play greeting and record
- `POST /v1/webhooks/telecom/voicemail` -- recording complete webhook
  - Save recording to S3
  - Create voicemail record
  - Send push notification: "New voicemail from +1 XXX-XXX-XXXX"
- `GET /v1/voicemails` -- list voicemails (paginated)
- `PATCH /v1/voicemails/:id/read` -- mark as read
- `DELETE /v1/voicemails/:id` -- delete voicemail

### 6. Inbound call usage tracking
- Track inbound call minutes against monthly allowance
- If user has exceeded cap, route directly to voicemail instead of ringing

### 7. Missed call notifications
- If call goes unanswered (no voicemail left): send push notification "Missed call from +1 XXX-XXX-XXXX"
- Log missed call in call history with status "missed"

### 8. Mobile screens
- Incoming call screen (handled by CallKit/ConnectionService via callkeep)
  - Caller number displayed
  - Answer (green) / Decline (red) buttons
  - Works from lock screen
- Voicemail inbox screen
  - List: caller number, duration, timestamp, read/unread indicator
  - Tap to play audio (use `expo-av` or `react-native-audio-api`)
  - Swipe to delete
- Update call history to show inbound + missed calls

### 9. Unit tests
- Test inbound webhook sends push and returns call instructions
- Test voicemail webhook saves recording
- Test voicemail list and read/delete
- Test missed call notification fires
- Test inbound minutes tracked against allowance

## Exit criteria

- [ ] Inbound call to FreeLine number wakes the app from background
- [ ] iOS: CallKit shows native incoming call screen (including lock screen)
- [ ] Android: full-screen notification shows with answer/decline
- [ ] Answering connects WebRTC call with audio both directions
- [ ] Declining routes caller to voicemail
- [ ] Unanswered call (30s timeout) routes to voicemail
- [ ] Voicemail recording saved to S3 and appears in voicemail inbox
- [ ] Voicemail playback works in the app
- [ ] Missed call notification sent and logged in history
- [ ] Inbound call minutes counted against monthly allowance
- [ ] Calls route directly to voicemail when cap is exceeded
- [ ] Call history shows outbound, inbound, and missed calls
- [ ] All new endpoints have unit tests
- [ ] Build and lint pass
