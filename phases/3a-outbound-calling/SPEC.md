# Phase 3a: Outbound Calling

**Target: Week 6**
**Depends on: Phase 2b complete**

## Goal

A user can make an outbound voice call from the app to a real phone number. The call connects via WebRTC through the telecom provider. Call history is tracked.

## Tasks

### 1. Database tables
- `calls`: id, user_id, phone_number_id, remote_number, direction (outbound/inbound), status (initiated/ringing/answered/completed/missed/failed), duration_seconds, started_at, ended_at, created_at

### 2. Voice access token endpoint
- `POST /v1/calls/token` -- generate short-lived voice access token
  - Use Bandwidth In-App Calling token (or Twilio Voice token if using fallback)
  - Token scoped to user's identity
  - Token allows outbound calls
  - Expires after 1 hour
  - Validate: user has active number
  - Validate: user has remaining call minutes this month

### 3. Outbound call flow
- Mobile app requests token from backend
- App uses provider voice SDK to initiate WebRTC call
- Backend receives call webhook, provides instructions to bridge to PSTN
- Call connects: user hears ringing then answer
- Call events (initiated, ringing, answered, completed) logged via status webhook

### 4. Call status webhook
- `POST /v1/webhooks/telecom/calls/status`
  - Verify webhook signature
  - Create/update call record with status and duration
  - Deduct call minutes from user's monthly allowance

### 5. Call history
- `GET /v1/calls/history` -- paginated call log
  - Each entry: remote number, direction, status, duration, timestamp
  - Sorted by most recent first

### 6. Usage tracking
- Track total call minutes (outbound) this month
- Return remaining allowance in token response
- Refuse to issue token if monthly cap hit (return 429)

### 7. Mobile screens
- Dial pad screen
  - Standard phone keypad (0-9, *, #)
  - Number display at top
  - Green call button
  - Backspace/clear
  - Show remaining minutes: "12 of 15 min remaining"
- Active call screen
  - Remote number displayed
  - Call duration timer
  - Buttons: Mute, Speaker, Keypad (DTMF), End Call
  - Proper audio session configuration (speaker/earpiece toggle)
- Call history screen
  - List: outbound arrow, number, duration or "no answer", timestamp
  - Tap to call again

### 8. 911 intercept (outbound only for now)
- If user enters 911 (or 112, 999) on the dial pad
- Do NOT place VoIP call
- Open device native dialer via `Linking.openURL('tel:911')`
- Show brief explanation: "Emergency calls use your phone's built-in dialer"

### 9. Unit tests
- Test voice token issuance
- Test call status webhook creates/updates call record
- Test call history returns correct order
- Test usage cap refuses token at limit
- Test 911 is not routed through VoIP

## Exit criteria

- [ ] User can make an outbound call from the app to a real phone number
- [ ] Call audio works both directions (caller hears callee, callee hears caller)
- [ ] Call duration timer displays correctly
- [ ] Mute, speaker, DTMF keypad work during call
- [ ] Call record saved with correct status and duration
- [ ] Call minutes deducted from monthly allowance
- [ ] Token refused (429) when monthly cap hit
- [ ] Call history shows all outbound calls
- [ ] 911 opens native dialer, not VoIP
- [ ] All calling endpoints have unit tests
- [ ] Build and lint pass
