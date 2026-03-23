# FreeLine App Review Notes

Use this as the base reviewer brief for App Store and Play submission.

## App Summary

FreeLine is a U.S.-only second-number app. Users can sign up, claim one U.S. number, send 1:1 texts, make and receive calls inside the app, and manage voicemail. The free tier is controlled by usage caps, inactivity reclaim, anti-spam rules, and monetization gates.

## Reviewer Walkthrough

1. Launch the app.
2. Create an account with email or the configured test sign-in path.
3. Claim a number from the number search flow.
4. Open Messages, Calls, Voicemail, and Settings from the bottom tab bar.
5. In Calls, note that emergency dialing is not handled in-app; `911` is redirected to the device dialer.

## Test Configuration Needed Before Submission

- live telecom credentials
- live APNs and FCM credentials
- AdMob production app ID and unit IDs
- RevenueCat public and server credentials
- App Store / Play product IDs
- privacy policy URL
- terms URL
- support contact email

## Reviewer Notes to Include

- FreeLine is `US-only`.
- FreeLine is not marketed as a verification-code number.
- Outbound messaging is for personal communications only.
- Abuse controls may rate-limit or block suspicious traffic.
- Free numbers can be reclaimed after inactivity.

## Store Metadata Checklist

- category and age rating
- privacy nutrition labels / data safety form
- support URL
- privacy policy URL
- terms URL if the store listing requires it
- app screenshots using the current glass-themed shell

## Known Honest Blockers Before Final Submission

- A2P 10DLC approval
- real provider proof for outbound and inbound SMS
- real device proof for push tap-through
- real device proof for outbound and inbound calling
- live monetization mapping
