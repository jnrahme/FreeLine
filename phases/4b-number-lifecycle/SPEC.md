# Phase 4b: Number Lifecycle

**Target: Week 10**
**Depends on: Phase 4a complete**

## Goal

Implement number recycling for inactive users, 24-hour activation enforcement, quarantine for released numbers, and warning notifications. This is the core economic protection for the free tier.

## Tasks

### 1. 24-hour activation check (BullMQ scheduled job)
- When a number is claimed (Phase 1b), activation_deadline is set to 24 hours
- Job runs every hour: find numbers past activation_deadline with no calls or messages
- Release unactivated numbers:
  - Call BandwidthProvider.releaseNumber()
  - Mark number_assignment as released, reason: "not_activated"
  - Send push notification: "Your number was released because it wasn't used within 24 hours. Claim a new one anytime."

### 2. Inactivity detection (BullMQ daily job)
- "Active" = sent/received a message OR made/received a call
- Configurable inactivity window: default 14 days for beta
- Daily scan: find all assigned numbers where last activity > N days ago
- Track last_activity_at on number_assignments (updated on every message/call)

### 3. Warning flow
- Day 10 of inactivity: push notification + in-app banner "Your number will be recycled in 4 days. Send a text or make a call to keep it."
- Day 13: push notification "Your number will be recycled tomorrow. Use it now to keep it."
- Warnings stored in a `number_warnings` table for audit
- If user is active after warning, reset inactivity timer

### 4. Number reclaim
- Day 14: reclaim the number
  - Release from user's account
  - Call BandwidthProvider.releaseNumber() (or move to quarantine pool)
  - Mark number_assignment as released, reason: "inactivity"
  - Send push notification: "Your number +1 XXX-XXX-XXXX has been recycled due to inactivity."
  - Move number to quarantine

### 5. Quarantine
- `number_quarantine` table: id, phone_number, reclaimed_at, available_at (reclaimed_at + 45 days), reason
- Quarantined numbers cannot be claimed by new users
- After 45 days: number is either returned to available inventory or released back to Bandwidth
- BullMQ job: daily check for numbers past quarantine period

### 6. Admin number restore
- Admin can restore a quarantined number to a user (if within quarantine period)
- Useful for support cases where user lost number by accident

### 7. Unit tests
- Test 24-hour activation releases unclaimed numbers
- Test inactivity detection finds correct numbers
- Test warning notifications sent at day 10 and 13
- Test reclaim happens at day 14
- Test quarantine prevents reassignment for 45 days
- Test post-quarantine number becomes available

## Exit criteria

- [ ] Numbers not activated within 24 hours are automatically released
- [ ] Daily inactivity scan identifies inactive numbers
- [ ] Warning notification sent at day 10
- [ ] Warning notification sent at day 13
- [ ] Number reclaimed at day 14 of inactivity
- [ ] Reclaimed numbers enter quarantine for 45 days
- [ ] Quarantined numbers cannot be claimed
- [ ] Post-quarantine numbers return to available inventory
- [ ] Activity after warning resets the inactivity timer
- [ ] All lifecycle jobs have unit tests
- [ ] Build and lint pass
