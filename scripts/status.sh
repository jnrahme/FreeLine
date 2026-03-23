#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROGRESS_FILE="$REPO_ROOT/PROGRESS.md"

cd "$REPO_ROOT"

branch="$(git rev-parse --abbrev-ref HEAD)"
head_sha="$(git rev-parse --short HEAD)"
current_phase="$(bash "$SCRIPT_DIR/next_phase.sh" --current 2>/dev/null || true)"
next_target="$(bash "$SCRIPT_DIR/next_phase.sh" 2>/dev/null || true)"
overall_status="$(sed -n 's/^## Status: //p' "$PROGRESS_FILE" | head -n 1)"
last_updated="$(sed -n 's/^## Last updated: //p' "$PROGRESS_FILE" | head -n 1)"

porcelain="$(git status --porcelain)"
modified_count="$(printf '%s\n' "$porcelain" | awk 'NF && $1 != "??" { count++ } END { print count + 0 }')"
untracked_count="$(printf '%s\n' "$porcelain" | awk '$1 == "??" { count++ } END { print count + 0 }')"

blocker='none'
if [[ -n "$current_phase" ]]; then
  resolved_blocker="$(awk -v phase="$current_phase" '
    $0 ~ ("^- Verify: `phases/" phase "/verify.sh`") { in_phase = 1; next }
    /^### Phase / { in_phase = 0 }
    in_phase && /^- Blockers: / {
      sub(/^- Blockers: /, "", $0)
      print
      exit
    }
  ' "$PROGRESS_FILE")"
  if [[ -n "$resolved_blocker" ]]; then
    blocker="$resolved_blocker"
  fi
fi

echo 'FreeLine CLI status'
printf 'Branch: %s\n' "$branch"
printf 'HEAD: %s\n' "$head_sha"
printf 'Worktree: %s modified, %s untracked\n' "$modified_count" "$untracked_count"
printf 'Current phase: %s\n' "${current_phase:-unknown}"
printf 'Overall status: %s\n' "${overall_status:-unknown}"
printf 'Next target: %s\n' "${next_target:-none}"
printf 'Progress updated: %s\n' "${last_updated:-unknown}"
printf 'Blocker: %s\n' "$blocker"
