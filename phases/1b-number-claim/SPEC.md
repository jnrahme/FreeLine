# Phase 1b: Number Claim

**Target: Week 3**
**Depends on: Phase 1a complete**

## Goal

An authenticated user can search available numbers by area code, claim one, and see it displayed in the app. The number is provisioned through the active telephony provider, stored in the database, and shown in both native clients before the main messaging/calling shell becomes available.

## Tasks

### 1. Database tables
- `phone_numbers`: id, phone_number (E.164, unique), provider_id, area_code, status (available/assigned/released/quarantined), created_at
- `number_assignments`: id, user_id, phone_number_id, assigned_at, released_at, activation_deadline (24h from assignment)
- Add indexes on: phone_number (unique), user_id, status

### 2. Numbers endpoints (FreeLine-Backend)
- `GET /v1/numbers/search?areaCode=XXX` -- search available numbers via the active provider and filter out assigned/quarantined inventory
  - Return up to 10 available numbers
  - If no numbers for requested area code, suggest nearby area codes
- `POST /v1/numbers/claim` -- provision and assign a number
  - Check: user doesn't already have an active number (return 409)
  - Call the provider `provisionNumber()` method
  - Save to phone_numbers + number_assignments
  - Set activation_deadline to 24 hours from now
  - Return the assigned number
- `GET /v1/numbers/me` -- return user's current number and status
- `POST /v1/numbers/release` -- release number voluntarily
  - Call the provider `releaseNumber()` method
  - Mark number_assignment as released
  - Start quarantine period on the number

### 3. Provider implementation
- Keep the provider abstraction in `FreeLine-Backend/src/telephony`
- Use the current provider to search, provision, and release numbers
- For local development, the provider may return seeded numbers while still exercising the claim/release persistence layer

### 4. Native number selection screens
- `FreeLine-iOS`
  - authenticated users without a number land on a number claim screen
  - area code search loads available numbers
  - claim button provisions the selected number
  - once assigned, the main tab shell becomes available
  - settings shows the current number and can release it
- `FreeLine-Android`
  - same authenticated number-claim gate as iOS
  - settings shows the current number and can release it

### 5. Unit tests
- Test number search returns results
- Test claim succeeds and saves to database
- Test second claim returns 409
- Test release marks number correctly
- Test provider-backed search filters out unavailable numbers

## Exit criteria

- [ ] `GET /v1/numbers/search?areaCode=212` returns available numbers
- [ ] `POST /v1/numbers/claim` provisions a number and saves assignment
- [ ] Second claim by same user returns 409
- [ ] `GET /v1/numbers/me` returns the user's assigned number
- [ ] `POST /v1/numbers/release` releases the number
- [ ] search no longer returns a quarantined number after release
- [ ] iOS: area code search -> pick number -> main app
- [ ] Android: area code search -> pick number -> main app
- [ ] Settings screens display the user's number
- [ ] All number endpoints have unit tests
- [ ] Root build/lint/typecheck/test pass
- [ ] iOS app builds successfully
- [ ] Android app builds successfully
