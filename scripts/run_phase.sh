#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PHASE="${1:-}"
if [[ -z "$PHASE" ]]; then
  PHASE="$(bash "$SCRIPT_DIR/next_phase.sh")"
fi

if [[ -z "$PHASE" ]]; then
  echo "No unresolved phase found."
  echo "Everything in PROGRESS.md is already marked pass or complete."
  exit 0
fi

PHASE_DIR="$REPO_ROOT/phases/$PHASE"
SPEC_FILE="$PHASE_DIR/SPEC.md"
VERIFY_FILE="$PHASE_DIR/verify.sh"
RESULT_FILE="$PHASE_DIR/RESULT.md"

if [[ ! -d "$PHASE_DIR" ]]; then
  echo "Phase directory not found: $PHASE_DIR"
  exit 1
fi

if [[ ! -f "$SPEC_FILE" ]]; then
  echo "Missing spec file: $SPEC_FILE"
  exit 1
fi

if [[ ! -f "$VERIFY_FILE" ]]; then
  echo "Missing verify script: $VERIFY_FILE"
  exit 1
fi

if [[ ! -f "$RESULT_FILE" ]]; then
  echo "Missing result file: $RESULT_FILE"
  exit 1
fi

echo "========================================="
echo "FreeLine Phase Runner"
echo "========================================="
echo "Phase: $PHASE"
echo "Spec: ${SPEC_FILE#$REPO_ROOT/}"
echo "Verify: ${VERIFY_FILE#$REPO_ROOT/}"
echo "Result: ${RESULT_FILE#$REPO_ROOT/}"
echo ""
echo "Read the spec, write tests, implement the phase, then run verification."
echo ""

cd "$REPO_ROOT"
bash "$VERIFY_FILE"

echo ""
echo "Verification passed for $PHASE."
NEXT_PHASE="$(bash "$SCRIPT_DIR/next_phase.sh" --after "$PHASE" || true)"
if [[ -n "$NEXT_PHASE" ]]; then
  echo "Next unresolved phase in PROGRESS.md: $NEXT_PHASE"
else
  echo "No later unresolved phase was found in PROGRESS.md."
fi
echo "Next required actions:"
echo "  1. Update ${RESULT_FILE#$REPO_ROOT/} with proof."
echo "  2. Update PROGRESS.md."
echo "  3. If there is no blocker, continue immediately with the next target phase."
