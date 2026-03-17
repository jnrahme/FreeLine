# Phase 4c: Admin Dashboard & Ops

**Target: Week 11**
**Depends on: Phase 4b complete**

## Goal

Build the internal admin dashboard and cost dashboard so the team can manage users, review abuse, monitor costs, and control the beta rollout.

## Tasks

### 1. Admin app scaffold (apps/admin)
- Initialize Next.js project with TypeScript
- Admin auth: separate admin credentials (email + password, NOT user accounts)
- Admin JWT with admin role
- Protected routes: all admin pages require admin auth
- Simple sidebar navigation: Users, Abuse Queue, Numbers, Cost, Settings

### 2. User management pages
- User search: by email, phone number, or user ID
- User detail page:
  - Profile: email, trust score, account age, status
  - Assigned number and assignment date
  - Device history (all devices linked to this account)
  - Usage this month: text events used/remaining, call minutes used/remaining
  - Abuse events for this user
- Actions: Suspend account, Unsuspend account, Force release number

### 3. Abuse queue page
- List of flagged abuse events (spam flags, reports, auto-suspensions)
- Each item: user, event type, details, timestamp
- Actions: Dismiss flag, Confirm (suspend account), View user detail
- Bulk actions: select multiple, dismiss all or suspend all

### 4. Number management page
- View all provisioned numbers: assigned, released, quarantined
- Filter by status
- Quarantine list: number, reclaimed date, available date
- Action: Restore quarantined number to a user

### 5. Cost dashboard page
- Current month totals:
  - Total active numbers and monthly number cost
  - Total text events (inbound + outbound) and estimated SMS cost
  - Total call minutes and estimated voice cost
  - Total estimated monthly telecom spend
  - Cost per active user
- Trend chart: daily telecom spend for last 30 days
- Alert: highlight in red if cost-per-user exceeds $1.50/month
- Data source: query Bandwidth usage API + internal metrics

### 6. Invite-only beta controls
- `invite_codes` table: id, code (unique), max_uses, current_uses, created_at, expires_at
- Admin page: create invite codes, set max uses, view usage
- Signup flow: require valid invite code during account creation (Phase 1a auth endpoint)
- Environment variable: `BETA_MODE=true` to enable invite requirement
- When beta mode off, invite code is optional

### 7. Launch gates script
- Update `phases/4c-admin-ops/launch-gates.sh` to check real conditions:
  - A2P 10DLC registration status
  - STOP/HELP handling functional (test endpoint)
  - Webhook signature verification enabled
  - Number recycling job last ran < 25 hours ago
  - Admin can access dashboard
  - Cost dashboard showing current data
  - Invite-only mode is active

### 8. Unit tests
- Test admin auth and role enforcement
- Test user search returns correct results
- Test suspend/unsuspend updates user status
- Test invite code validation
- Test cost calculations match expected values

## Exit criteria

- [ ] Admin dashboard deploys and loads
- [ ] Admin auth works (separate from user auth)
- [ ] User search finds users by email, phone, or ID
- [ ] Admin can suspend and unsuspend an account
- [ ] Admin can force release a number
- [ ] Admin can restore a quarantined number
- [ ] Abuse queue displays flagged events with action buttons
- [ ] Cost dashboard shows current month telecom spend and cost-per-user
- [ ] Cost alert highlights when cost-per-user > $1.50
- [ ] Invite codes can be created and are enforced at signup
- [ ] Beta mode toggle works via environment variable
- [ ] Launch gates script runs and reports status
- [ ] Admin app builds successfully
- [ ] All admin endpoints have unit tests
- [ ] Build and lint pass
