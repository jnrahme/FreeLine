#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROGRESS_FILE="$REPO_ROOT/PROGRESS.md"

MODE="target"
REFERENCE_PHASE=""

usage() {
  echo "Usage:"
  echo "  bash scripts/next_phase.sh                # print the current target phase"
  echo "  bash scripts/next_phase.sh --current      # print the current phase from PROGRESS.md"
  echo "  bash scripts/next_phase.sh --after <dir>  # print the next unresolved phase after <dir>"
}

done_status() {
  local status="${1:-}"
  [[ "$status" == "pass" || "$status" == "complete" ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --current)
      MODE="current"
      shift
      ;;
    --after)
      MODE="after"
      REFERENCE_PHASE="${2:-}"
      if [[ -z "$REFERENCE_PHASE" ]]; then
        echo "Missing phase name for --after" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$PROGRESS_FILE" ]]; then
  echo "Missing progress file: $PROGRESS_FILE" >&2
  exit 1
fi

CURRENT_PHASE="$(sed -n 's/^## Current phase: //p' "$PROGRESS_FILE" | head -n 1)"
CURRENT_STATUS="$(sed -n 's/^## Status: //p' "$PROGRESS_FILE" | head -n 1)"

if [[ -z "$CURRENT_PHASE" ]]; then
  echo "Could not determine current phase from $PROGRESS_FILE" >&2
  exit 1
fi

if [[ "$MODE" == "current" ]]; then
  printf '%s\n' "$CURRENT_PHASE"
  exit 0
fi

PHASES=()
STATUSES=()
while IFS= read -r row; do
  PHASES+=("${row%%|*}")
  STATUSES+=("${row#*|}")
done < <(
  awk '
    /^### Phase / { status = "" }
    /^- Status: / { status = substr($0, 11) }
    /^- Verify: `phases\// {
      phase = $0
      sub(/.*`phases\//, "", phase)
      sub(/\/verify\.sh`.*/, "", phase)
      print phase "|" status
    }
  ' "$PROGRESS_FILE"
)

if [[ ${#PHASES[@]} -eq 0 ]]; then
  echo "Could not determine phase order from $PROGRESS_FILE" >&2
  exit 1
fi

find_phase_index() {
  local target="$1"
  local index=0
  for phase in "${PHASES[@]}"; do
    if [[ "$phase" == "$target" ]]; then
      printf '%s\n' "$index"
      return 0
    fi
    index=$((index + 1))
  done
  return 1
}

print_first_unresolved_after_index() {
  local start_index="$1"
  local index="$start_index"
  while [[ "$index" -lt "${#PHASES[@]}" ]]; do
    if ! done_status "${STATUSES[$index]}"; then
      printf '%s\n' "${PHASES[$index]}"
      return 0
    fi
    index=$((index + 1))
  done
  return 1
}

case "$MODE" in
  target)
    if ! done_status "$CURRENT_STATUS"; then
      printf '%s\n' "$CURRENT_PHASE"
      exit 0
    fi

    CURRENT_INDEX="$(find_phase_index "$CURRENT_PHASE" || true)"
    if [[ -z "$CURRENT_INDEX" ]]; then
      echo "Current phase '$CURRENT_PHASE' was not found in $PROGRESS_FILE" >&2
      exit 1
    fi

    print_first_unresolved_after_index "$((CURRENT_INDEX + 1))" || exit 0
    ;;
  after)
    REFERENCE_INDEX="$(find_phase_index "$REFERENCE_PHASE" || true)"
    if [[ -z "$REFERENCE_INDEX" ]]; then
      echo "Reference phase '$REFERENCE_PHASE' was not found in $PROGRESS_FILE" >&2
      exit 1
    fi

    print_first_unresolved_after_index "$((REFERENCE_INDEX + 1))" || exit 0
    ;;
esac
