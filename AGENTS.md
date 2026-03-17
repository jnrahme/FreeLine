# FreeLine
## Agent Execution Protocol

This file tells any coding agent how to execute work in this repository.

## Source of truth

- read `CODEXREADME.md` for product constraints, architecture, and operating rules
- read `ACTION_PLAN.md` for tactical delivery structure
- read `PROGRESS.md` to determine the active phase

If these documents disagree:

1. `CODEXREADME.md` wins on product scope and constraints
2. `ACTION_PLAN.md` wins on tactical sequencing
3. phase `SPEC.md` wins on the current phase's concrete deliverables

## Canonical loop

For every phase, follow this exact loop:

```text
READ -> PLAN -> WRITE TESTS -> IMPLEMENT -> BUILD -> VERIFY -> PROVE -> UPDATE -> NEXT
```

### 1. READ

- open `phases/<phase>/SPEC.md`
- restate the phase goal and exit criteria before changing code

### 2. PLAN

- identify the files that will be touched
- identify the tests or checks that will prove the phase is done
- do not start coding until the target proof is clear

### 3. WRITE TESTS

- add or update unit, integration, or e2e tests first when practical
- if a phase is mostly scaffolding, create the verification hooks before implementation

### 4. IMPLEMENT

- make the smallest changes that satisfy the current phase
- keep telecom logic behind `TelephonyProvider`
- preserve all product constraints from `CODEXREADME.md`

### 5. BUILD

- run repo build, lint, and typecheck commands
- fix failures before moving to verification

### 6. VERIFY

- run `bash phases/<phase>/verify.sh`
- every check must pass
- do not treat "most checks passed" as done

### 7. PROVE

- write `phases/<phase>/RESULT.md`
- include the commands run
- include pass/fail status for every exit criterion
- include artifacts or file paths that prove the work exists
- include screenshots, curl examples, or notes where human verification was required

### 8. UPDATE

- update `PROGRESS.md`
- mark the current phase status accurately: `not_started`, `in_progress`, `blocked`, or `pass`
- if blocked, write the exact blocker and the next action needed

### 9. NEXT

- only move to the next phase if:
  - build/lint/typecheck passed
  - `verify.sh` passed
  - `RESULT.md` contains proof
  - all exit criteria are checked off as passed
- resolve the next target with `bash scripts/next_phase.sh`
- if a next target exists and there is no real blocker, start it immediately without waiting for another user nudge

## Autonomous completion mode

If the user asks for nonstop execution, automatic phase advancement, or an extended autonomous run, treat that as permission to keep moving through the phase plan.

- after a phase reaches `pass`, immediately update `RESULT.md` and `PROGRESS.md`
- resolve the next target phase with `bash scripts/next_phase.sh`
- start the next target phase in the same session without asking for confirmation
- stop only when:
  - every phase is `pass`
  - a real external blocker prevents honest progress
  - the user explicitly redirects or stops the run

Before ending an autonomous session:

- write a short checkpoint to `SESSION.md` if work is still in progress
- record the current phase, status, blockers, and exact next action

## Long-run execution policy

When running for an extended session, keep moving unless there is a real blocker.

- checkpoint meaningful progress in `RESULT.md`, `PROGRESS.md`, or `SESSION.md`
- prefer the highest-value unblocked task that reduces risk for the next phase
- fix verification scripts when they are wrong; do not work around broken proof
- if a blocker is external to the repo, finish all unblocked local work before pausing

### External blocker rule

If the current phase is blocked only by an external dependency such as:

- provider credentials
- A2P approval
- app store review
- hardware or simulator availability
- missing system software that can be installed separately

then the agent must:

1. complete and verify all local code work for the blocked phase
2. record the exact blocker in `RESULT.md` and `PROGRESS.md`
3. keep the blocked phase marked `blocked`
4. continue to the next code phase only if doing so does not invalidate product constraints or hide the blocker

This rule exists so work can continue honestly without pretending the blocked phase is complete.

## Hard rules

- do not skip phases
- do not expand scope beyond the current phase
- do not change product constraints without updating `CODEXREADME.md`
- do not promise OTP support
- do not add business/bulk messaging support to the free tier
- do not switch to managed Expo
- do not remove abuse controls or number reclaim rules for convenience
- do not mark a phase complete without proof
- do not hide external blockers by silently weakening exit criteria

## Required file structure

```text
FreeLine/
  CODEXREADME.md
  ACTION_PLAN.md
  AGENTS.md
  PROGRESS.md
  SESSION.md
  FreeLine-iOS/
  FreeLine-Android/
  FreeLine-Backend/
  scripts/
    next_phase.sh
    run_phase.sh
  phases/
    0-foundation/
      SPEC.md
      verify.sh
      RESULT.md
    1a-auth/
      SPEC.md
      verify.sh
      RESULT.md
    1b-number-claim/
      SPEC.md
      verify.sh
      RESULT.md
    2a-outbound-sms/
      SPEC.md
      verify.sh
      RESULT.md
    2b-inbound-sms/
      SPEC.md
      verify.sh
      RESULT.md
    3a-outbound-calling/
      SPEC.md
      verify.sh
      RESULT.md
    3b-inbound-calling/
      SPEC.md
      verify.sh
      RESULT.md
    4a-abuse-controls/
      SPEC.md
      verify.sh
      RESULT.md
    4b-number-lifecycle/
      SPEC.md
      verify.sh
      RESULT.md
    4c-admin-ops/
      SPEC.md
      verify.sh
      RESULT.md
    5-ads/
      SPEC.md
      verify.sh
      RESULT.md
```

## RESULT.md contract

Every phase result file must use this structure:

```markdown
# Phase <N> Result

## Status
pass | fail | blocked

## Summary
- short list of what was implemented

## Commands Run
- exact command
- exact command

## Tests and Verification
- test/check name: pass | fail

## Exit Criteria
- [ ] criterion: pass | fail

## Artifacts
- file paths
- screenshots
- curl examples

## Blockers
- none, or exact blocker

## Notes for next phase
- carryover details
```

## PROGRESS.md contract

`PROGRESS.md` must always show:

- current phase
- overall status
- per-phase status
- blockers, if any
- completion date for passed phases

## Verification policy

- the checks in `verify.sh` should mirror the phase exit criteria as closely as possible
- if a check cannot be automated, `RESULT.md` must include human-verification proof
- CI should eventually run the same build/test commands that local verification runs

## Recommended execution command

Use:

```bash
bash scripts/run_phase.sh
```

Example:

```bash
bash scripts/next_phase.sh
bash scripts/run_phase.sh 2a-outbound-sms
```

`bash scripts/run_phase.sh` without an argument will resolve the current target phase from `PROGRESS.md`.

These commands are helpers. They do not replace engineering judgment or proof writing.
