# Phase 4a: Abuse Controls

**Target: Week 9**
**Depends on: Phase 3b complete**

## Goal

Implement trust scoring, tiered rate limiting, device/account linkage rules, and content heuristics to prevent spam and abuse before beta launch.

## Tasks

### 1. Trust scoring (users module)
- Add trust_score field to users table (already exists, default 50)
- Score changes:
  - Email verified: +10
  - Each day active (sent/received message or call): +1/day, max +30
  - No spam reports for 7 days: +5
  - Received a spam report: -20
  - Rate limit hit: -5
  - Blocked by another user: -10
- Tiers:
  - Score < 20: account suspended, admin review required
  - Score 20-40: first-7-day caps only (10 outbound texts/day, 5 contacts/day, 10 min calls/day)
  - Score 40-70: standard beta allowance (40 text events/month, 15 min calls/month)
  - Score 70+: elevated limits (80 text events/month, 35 min calls/month -- the hard ceiling, no rewarded ads needed)
- BullMQ job: recalculate trust scores daily

### 2. Rate limiting (Redis-based)
- Per-account text events per day (based on trust tier)
- Per-account text events per month (40 base, up to 80 with rewards/trust)
- Per-account call minutes per day (based on trust tier)
- Per-account call minutes per month (15 base, up to 35 with rewards/trust)
- Per-account new unique contacts per day
- First-7-day outbound caps: 10 texts/day, 5 contacts/day, 10 min calls/day
- Global: max SMS per second across all users (protect Bandwidth rate limits)
- `rate_limit_buckets` table for audit trail
- Return 429 with remaining time and upgrade prompt when limit hit

### 3. Rewarded ad unlocks
- `POST /v1/rewards/claim` -- after watching a rewarded video ad
  - Accept reward type: "text_events" (+10) or "call_minutes" (+5)
  - Validate: user has not exceeded 4 rewarded unlocks this month
  - Credit the user's monthly allowance
  - Log reward claim for audit
- `GET /v1/rewards/status` -- return remaining unlocks this month and current allowances

### 4. Device/account linkage hardening
- `device_accounts` table tracking every account created from each fingerprint
- If a device has had any account suspended for abuse: block new account creation
- Admin can override device blocks
- Log all device-account associations

### 5. Content heuristics
- Flag outbound messages matching spam patterns:
  - URL in first message to a new contact
  - Identical message body sent to 3+ different numbers in 24 hours
  - Message body matches known spam regex patterns
- Flagged messages: save to `abuse_events`, delay send by 60 seconds for async review
- Auto-suspend account if 5+ flags in 24 hours

### 6. Abuse events table
- `abuse_events`: id, user_id, event_type (rate_limit_hit/spam_flag/report/block/suspension), details (JSON), created_at
- Log every abuse-relevant event

### 7. Unit tests
- Test trust score calculation and tier assignment
- Test rate limits enforce per tier
- Test rewarded ad unlock credits allowance
- Test device linkage blocks abusive devices
- Test content heuristics flag spam patterns
- Test auto-suspension at 5+ flags

## Exit criteria

- [ ] Trust score updates based on user behavior
- [ ] Accounts with score < 20 are automatically suspended
- [ ] Rate limits enforce per trust tier (verified in tests)
- [ ] First-7-day caps apply to new accounts
- [ ] Rewarded ad unlock adds to monthly allowance (max 4/month)
- [ ] 429 response includes remaining time and upgrade message
- [ ] Device with suspended account cannot create new accounts
- [ ] Spam heuristics flag matching outbound messages
- [ ] Auto-suspension triggers at 5+ flags in 24 hours
- [ ] All abuse events logged to abuse_events table
- [ ] All new endpoints have unit tests
- [ ] Build and lint pass
