# Phase 2a: Outbound SMS

**Target: Week 4**
**Depends on: Phase 1b complete**

## Goal

A user can compose and send a text message from the app. Messages are saved in conversations, displayed in a chat UI, and delivery status is tracked.

## Tasks

### 1. Database tables
- `conversations`: id, user_id, phone_number_id, participant_number, last_message_at, unread_count, is_opted_out (default false)
- `messages`: id, conversation_id, direction (outbound/inbound), body, status (pending/sent/delivered/failed/undelivered), provider_message_id, created_at
- `message_media`: id, message_id, media_url, content_type (placeholder for future MMS)
- Add indexes on: conversation user_id + last_message_at, message conversation_id + created_at

### 2. Outbound SMS endpoint
- `POST /v1/messages` -- send an SMS
  - Validate: user has an active number
  - Validate: recipient is a valid US phone number (E.164)
  - Validate: user has not exceeded daily/monthly text event cap
  - Check: conversation is not opted-out
  - Create or find conversation for this user + recipient
  - Save message with status "pending"
  - Call BandwidthProvider.sendSms(from, to, body)
  - Update message with provider_message_id
  - Return message object

### 3. Delivery status webhook
- `POST /v1/webhooks/telecom/messages/status`
  - Verify Bandwidth webhook signature
  - Look up message by provider_message_id
  - Update status (sent -> delivered -> failed etc.)

### 4. Conversations API
- `GET /v1/conversations` -- list conversations, sorted by last_message_at desc, paginated
- `GET /v1/conversations/:id/messages` -- get messages in thread, paginated (oldest first)

### 5. Usage tracking
- Track total text events (outbound) this month for the user
- Return remaining allowance in API responses
- Return 429 with clear message when cap hit: "Free tier limit reached. Watch an ad or upgrade."

### 6. Mobile screens
- Conversations list screen
  - Show all conversations sorted by most recent
  - Each row: phone number, last message preview, timestamp, unread badge
  - Pull-to-refresh
  - Tap to open thread
  - Floating "new message" button
- Chat thread screen
  - Bubble layout (sent = right/blue, received = left/gray)
  - Text input with send button
  - Show delivery status per message (sending, sent, delivered, failed)
  - Auto-scroll to newest
- New message screen
  - Phone number input field (US format validation)
  - Compose and send

### 7. Unit tests
- Test outbound SMS saves message and calls provider
- Test delivery webhook updates message status
- Test conversations list returns correct order
- Test usage cap enforcement returns 429

## Exit criteria

- [ ] User can send an SMS from the app that arrives on a real phone
- [ ] Message status updates from pending -> sent -> delivered via webhook
- [ ] Conversations are listed sorted by most recent message
- [ ] Messages within a conversation are paginated correctly
- [ ] Usage cap returns 429 when exceeded
- [ ] Bandwidth webhook signature is verified
- [ ] Mobile: conversation list -> tap -> thread -> type -> send works
- [ ] Mobile: new message compose -> enter number -> send works
- [ ] All messaging endpoints have unit tests
- [ ] Build and lint pass
