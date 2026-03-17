# Phase 2b: Inbound SMS + Push + Compliance

**Target: Week 5**
**Depends on: Phase 2a complete**

## Goal

The app receives incoming text messages in real time, sends push notifications when backgrounded, and handles STOP/HELP compliance and blocking.

## Tasks

### 1. Inbound SMS webhook
- `POST /v1/webhooks/telecom/messages/inbound`
  - Verify Bandwidth webhook signature
  - Look up which user owns the "to" number
  - Check: sender is not blocked by this user
  - Create or find conversation
  - Save message with direction "inbound"
  - Increment conversation unread_count
  - Track inbound text event against user's monthly allowance
  - Trigger push notification
  - Emit WebSocket event if user is online

### 2. Push notifications
- `push_tokens` table: id, user_id, device_id, token, platform (ios/android), created_at
- `POST /v1/devices/push-token` -- register/update push token
- Set up Firebase Cloud Messaging (FCM) for Android
- Set up APNs for iOS (via FCM)
- On inbound message: send push with sender number + message preview
- Notification tapping opens the correct conversation

### 3. WebSocket for real-time
- WebSocket connection authenticated via JWT (on connect)
- Events emitted to connected clients:
  - `message:inbound` -- new message received
  - `message:status` -- delivery status changed
- Client receives messages instantly when app is foregrounded

### 4. Read receipts
- `PATCH /v1/conversations/:id/read` -- mark conversation as read, reset unread_count

### 5. STOP / HELP compliance
- If inbound message body is exactly "STOP" (case-insensitive): set conversation is_opted_out = true, auto-reply with opt-out confirmation
- If inbound message body is exactly "HELP" (case-insensitive): auto-reply with help text ("FreeLine: Free calls & texts. Reply STOP to opt out. Support: [email]")
- Prevent any outbound SMS to opted-out conversations (return 403)
- Log opt-out events for compliance audit

### 6. Blocking and reporting
- `blocks` table: id, user_id, blocked_number, created_at
- `reports` table: id, user_id, reported_number, reason, created_at
- `POST /v1/blocks` -- block a number
  - Silently drop future inbound messages from this number
  - Prevent outbound to this number
- `POST /v1/reports` -- report a number for spam/abuse
  - Save report for admin review
- `DELETE /v1/blocks/:number` -- unblock

### 7. Mobile updates
- Conversations list: show unread badge, auto-update via WebSocket
- Chat thread: new inbound messages appear in real time
- Push notification: tapping opens correct conversation
- Block/report: long-press on conversation -> block or report option

### 8. Unit tests
- Test inbound webhook saves message and triggers notification
- Test STOP sets opted-out and blocks outbound
- Test HELP sends auto-reply
- Test blocked sender messages are dropped
- Test WebSocket emits on inbound message
- Test push token registration

## Exit criteria

- [ ] Reply from a real phone appears in the app via webhook
- [ ] Push notification fires when app is backgrounded
- [ ] Tapping push notification opens the correct conversation
- [ ] WebSocket delivers inbound message when app is foregrounded
- [ ] Unread badge updates on conversations list
- [ ] STOP message sets conversation to opted-out; outbound returns 403
- [ ] HELP message triggers auto-reply
- [ ] Blocked number's inbound messages are silently dropped
- [ ] Report saves for admin review
- [ ] Inbound texts count against monthly allowance
- [ ] All new endpoints have unit tests
- [ ] Build and lint pass
