# FreeLine Aura: AI Receptionist Concept

## Status
Concept

## Goal
Create a front-end feature that feels visibly futuristic and immediately useful: an AI receptionist that screens unknown callers in real time, explains why they are calling, estimates risk, and lets the user take over with a single tap.

This should feel like a premium demo moment for FreeLine, not a generic chatbot bolted onto calling.

## Product Positioning
`Aura` is the name of the experience. It is not a general assistant. It is a focused call-screening layer for incoming unknown numbers.

Core promise:
- protect users from spam and awkward unknown calls
- give users context before they answer
- make FreeLine feel like an intelligent phone number, not just a cheaper one

Primary use case:
- unknown inbound call arrives
- Aura answers first for a short screening window
- the app shows a live glass-style console with transcript, reason for call, and trust signals
- the user decides whether to take over, send a text reply, ask Aura to clarify, or send the caller to voicemail

Non-goals:
- replacing the main dialer
- becoming a full conversational AI companion
- auto-answering known contacts, emergency numbers, or pinned high-priority callers

## Hero Moment
The wow moment is not a summary after the fact. The wow moment is the live handoff.

The screen should make the user feel like they are watching an intelligent filter work on their behalf:
- a glowing central orb pulses while Aura listens and speaks
- a live transcript appears in short, card-like fragments instead of one long wall of text
- a trust meter shifts color in real time as the call becomes safer or more suspicious
- action chips adapt to the actual conversation, such as `Take over`, `Ask what this is about`, `Reply by text`, or `Send to voicemail`

That is the moment users will demo to other people.

## Core Flow
1. Unknown call arrives.
2. Incoming call UI includes a prominent `Screen with Aura` action or, if enabled, starts Aura automatically after a short delay.
3. Aura greets the caller with a short line such as: “Hi, this line uses call screening. Please say your name and why you’re calling.”
4. The user sees the live screening console update in real time.
5. Aura extracts structured context:
   - caller name
   - reason for call
   - urgency
   - scam/spam confidence
   - recommended action
6. The user chooses:
   - `Take over now`
   - `Ask one more question`
   - `Reply by text`
   - `Send to voicemail`
   - `Block and report`
7. After the call, FreeLine stores a recap card with summary, transcript, and suggested follow-up actions.

## Screen Concepts

### 1. Aura Incoming Sheet
This is the bridge between the normal incoming-call UI and the AI experience.

Visual treatment:
- compact glass sheet over the existing incoming-call surface
- large caller label: `Unknown caller`
- secondary line: `Aura can screen this call before you answer`
- one primary action: `Screen with Aura`
- one secondary action: `Answer directly`

This screen should feel calm, not alarmist. The point is control.

### 2. Live Screening Console
This is the hero screen.

Layout:
- top status rail with caller label, elapsed screening time, and a tiny privacy badge
- central `AuraOrb` with layered blur, waveform pulse, and subtle color shifts
- live transcript stack below the orb using short glass cards
- dynamic summary card pinned near the bottom:
  - `Name: possible “Mike from FedEx”`
  - `Reason: delivery / access issue`
  - `Risk: low`
  - `Urgency: medium`
- action row with large glass chips:
  - `Take over`
  - `Ask why now`
  - `Text instead`
  - `Voicemail`

Behavior:
- transcript cards should appear with staggered motion, 30-50ms apart
- the orb should react to audio energy, but remain elegant and restrained
- the trust state should not jump wildly; it should transition with confidence

### 3. Decision Sheet
Once Aura has enough information, the interface should collapse into a bottom sheet with a cleaner decision view.

Contents:
- caller summary in one sentence
- trust badge: `Likely legitimate`, `Unclear`, or `Likely spam`
- recommended action
- transcript preview
- generated quick replies:
  - `I can talk now`
  - `Text me the details`
  - `Leave a voicemail`
  - `Not interested`

This view should feel more actionable than analytical.

### 4. Post-Call Recap
After Aura finishes, FreeLine creates a recap card inside the Calls tab and optionally the Messages flow if a text reply was sent.

The recap card includes:
- summary
- transcript
- action taken
- one-tap follow-ups
- scam/report controls

This gives the feature ongoing value beyond the first live interaction.

## Visual Direction
Aura should use the current FreeLine glass system instead of inventing a new style family.

Use the existing tokens:
- iOS: `FreeLineTheme.accent`, `accentDeep`, `mint`, `coral`, `warning`
- Android: `FreeLinePalette.Accent`, `AccentDeep`, `Mint`, `Coral`, `Warning`

Suggested semantic mapping:
- blue: Aura is listening or thinking
- mint: caller appears legitimate
- warning: uncertain / needs more context
- coral: likely spam or aggressive tone

Key visual ideas:
- one large central orb, not many tiny widgets
- transcript fragments that feel like floating panes
- trust and urgency shown as meaningful state, not decorative gradients
- bottom action chips large enough to hit quickly under stress

This feature should look like “liquid intelligence,” not a dashboard.

## Motion and Sound Language
Motion matters more here than on most screens because the feature is about live inference.

Motion rules:
- orb breathes slowly when idle
- orb pulses faster when the caller is speaking
- transcript cards rise from below with slight blur-to-focus
- trust color should wash softly through the orb halo, not flash
- when the user takes over, the orb contracts and the native in-call controls expand forward

Optional future polish:
- subtle haptic when Aura changes recommendation from uncertain to trustworthy or suspicious
- short non-verbal earcon when the summary card becomes actionable

## Front-End Component Inventory
These are the reusable pieces the eventual prototype should introduce.

Shared concept components:
- `AuraOrb`
- `AuraTranscriptCard`
- `AuraTrustBadge`
- `AuraSummaryCard`
- `AuraActionChip`
- `AuraRecapCard`

Likely implementation homes:
- iOS: [FreeLineDesign.swift](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Design/FreeLineDesign.swift) and [CallsView.swift](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-iOS/Sources/Screens/CallsView.swift)
- Android: [FreeLineDesign.kt](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineDesign.kt) and [CallsScreens.kt](/Users/joeyrahme/GitHubWorkspace/FreeLine/FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt)

## AI Output Contract
The UI should not render raw model text directly. It should render a structured payload.

Suggested shape:

```json
{
  "callerName": "Mike",
  "callerOrganization": "FedEx",
  "reasonSummary": "Delivery driver needs building access",
  "urgency": "medium",
  "trustLevel": "low_risk",
  "spamConfidence": 0.14,
  "sentiment": "neutral",
  "recommendedAction": "take_over",
  "suggestedQuestions": [
    "Can you confirm the address?",
    "Are you at the building now?"
  ],
  "suggestedReplies": [
    "I can come down now.",
    "Please leave it with the front desk."
  ],
  "liveTranscript": [
    {
      "speaker": "aura",
      "text": "Hi, this line uses call screening. Please say your name and why you're calling."
    },
    {
      "speaker": "caller",
      "text": "Hey, this is Mike from FedEx. I have a package and need building access."
    }
  ]
}
```

The UI should gracefully handle uncertainty. If Aura is unsure, it should say so clearly.

## Demo Story
For a first front-end prototype, the strongest demo scenario is:
- unknown number calls
- Aura screens
- caller says they are a delivery driver
- transcript appears live
- summary card resolves quickly
- user taps `Reply by text`
- the app drafts: `I’m on my way down now`

That path shows:
- real-time AI
- voice-to-UI translation
- context-aware actions
- cross-call and messaging integration

## Rollout Recommendation
Recommended path:

### Phase 1: Debug-only concept prototype
- seeded fake incoming call
- scripted transcript states
- orb, trust, summary, and action chips
- no live model or telephony dependency

### Phase 2: Live transcript integration
- stream transcript text from backend
- animate partial updates
- keep recommendation logic server-owned

### Phase 3: Smart actions
- text replies
- voicemail routing
- spam block/report shortcuts

### Phase 4: Premium packaging
- make Aura a headline premium feature or premium add-on

## Why This Is the Right AI Feature
This concept is stronger than a generic “AI message assistant” because it is:
- more visibly magical in a demo
- directly tied to FreeLine’s phone-number product value
- useful even for users who do not want an always-on assistant
- a natural premium differentiator

If FreeLine is going to ship one front-end AI moment that people remember, this should be it.
