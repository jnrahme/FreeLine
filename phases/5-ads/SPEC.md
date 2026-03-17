# Phase 5: Ad Integration

**Target: Week 12**
**Depends on: Phase 4c complete**

## Goal

Integrate ads into the app so the free tier generates revenue. Implement rewarded video flow (already wired in Phase 4a backend), banner ads, native ads, and interstitials. Add the ad-free purchase option.

## Tasks

### 1. AdMob configuration
- Verify `react-native-google-mobile-ads` installed (Phase 0)
- Create production AdMob ad units:
  - Banner ad unit (conversations list)
  - Interstitial ad unit (after call ends)
  - Rewarded video ad unit (unlock bonus usage)
  - Native ad unit (sponsored message in inbox)
- Configure mediation (optional: add AppLovin MAX if needed for fill rate)

### 2. Banner ad placement
- Persistent banner at bottom of conversations list screen
- Banner at bottom of call history screen
- Banner at bottom of settings screen
- Use AdMob `BannerAd` component with adaptive sizing
- Hide banner for paid subscribers (check user's subscription status)

### 3. Native "sponsored message" ad
- In conversations list, insert a native ad every 5-8 items
- Styled to look like a conversation row but clearly labeled "Sponsored"
- Use AdMob native ad template or custom rendering
- Tapping opens the advertiser's destination

### 4. Interstitial ad
- Show interstitial after ending a call (natural pause point)
- Max frequency: 1 interstitial per 30 minutes (don't spam)
- Preload interstitial on app launch so it's ready when needed
- Do NOT show interstitial during or before a call
- Do NOT show interstitial when navigating between screens

### 5. Rewarded video ad (connected to Phase 4a backend)
- "Watch Ad for Bonus" button visible when user approaches usage cap
- Show in two places:
  - Banner/prompt when sending a message returns 429 (cap reached)
  - Dedicated "Earn More" section in settings
- Flow:
  1. User taps "Watch Ad"
  2. Show rewarded video (full screen, 15-30 seconds)
  3. On completion callback from AdMob, call `POST /v1/rewards/claim`
  4. Backend credits +10 text events or +5 call minutes
  5. Show confirmation: "You earned 10 bonus texts!"
- If ad fails to load, show fallback: "No ads available right now. Try again later."

### 6. Ad-free purchase (in-app subscription)
- Integrate RevenueCat (`react-native-purchases`) for subscription management
- Product tiers:
  - Ad-Free: $4.99/month -- remove all ads, same usage limits
  - Lock My Number: $1.99/month -- prevent inactivity reclaim
  - Premium: $9.99/month -- ad-free + locked number + elevated caps
- On purchase: update user's subscription status in backend
- Backend endpoint: `POST /v1/subscriptions/verify` -- verify receipt with RevenueCat
- `GET /v1/subscriptions/status` -- return current subscription tier
- Ad components check subscription status and hide if ad-free

### 7. Ad analytics
- Track ad impressions and clicks via PostHog events:
  - `ad_impression`: ad_type, placement, ad_unit_id
  - `ad_click`: ad_type, placement
  - `rewarded_video_complete`: reward_type
  - `rewarded_video_abandoned`: seconds_watched
- Track estimated ad revenue per user (from AdMob reporting)

### 8. Mobile UI updates
- Usage indicator on main screen: "12 of 40 texts used | 8 of 15 min used"
- When approaching cap (>80% used): show yellow warning
- When cap hit: show prompt with "Watch Ad" and "Upgrade" buttons
- Settings: "Manage Subscription" link to upgrade/downgrade
- Settings: "Earn More" section showing rewarded ad option and remaining unlocks

### 9. Unit tests
- Test ad components render for free users
- Test ad components hidden for paid subscribers
- Test rewarded video completion triggers reward claim
- Test subscription verification endpoint
- Test usage indicator displays correct values

## Exit criteria

- [ ] Banner ads display on conversations list, call history, and settings
- [ ] Native sponsored message appears in conversations list (every 5-8 items)
- [ ] Interstitial shows after ending a call (max 1 per 30 min)
- [ ] Rewarded video plays and credits bonus usage on completion
- [ ] Rewarded unlock limit enforced (max 4/month)
- [ ] Usage indicator shows current usage and remaining allowance
- [ ] Cap-hit prompt shows "Watch Ad" and "Upgrade" options
- [ ] Ad-Free purchase removes all ads
- [ ] Lock My Number purchase prevents inactivity reclaim
- [ ] Premium purchase grants elevated caps + ad-free + lock
- [ ] Subscription status persists across app restarts
- [ ] All ads hidden for paid subscribers
- [ ] Ad analytics events fire correctly
- [ ] Build and lint pass
