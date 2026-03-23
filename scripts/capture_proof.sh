#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/capture_proof.sh <phase> <ios|android>
  bash scripts/capture_proof.sh "" <ios|android>

Examples:
  bash scripts/capture_proof.sh 5-ads ios
  bash scripts/capture_proof.sh 2a-outbound-sms android
  bash scripts/capture_proof.sh "" ios

When phase is omitted, the current unresolved target from PROGRESS.md is used.
EOF
}

phase="${1:-}"
platform="${2:-}"

if [[ "$platform" != "ios" && "$platform" != "android" ]]; then
  usage >&2
  exit 1
fi

if [[ -z "$phase" ]]; then
  phase="$(bash "$SCRIPT_DIR/next_phase.sh" || true)"
fi

case "$phase" in
  2a-outbound-sms|2a|phase2a)
    prefix="phase2a"
    ;;
  2b-inbound-sms|2b|phase2b)
    prefix="phase2b"
    ;;
  5-ads|5|phase5)
    prefix="phase5"
    ;;
  *)
    echo "No proof capture script is registered for phase '$phase'." >&2
    echo "Supported phases: 2a-outbound-sms, 2b-inbound-sms, 5-ads." >&2
    exit 1
    ;;
esac

script_path="$SCRIPT_DIR/capture_${prefix}_${platform}_proof.sh"
if [[ ! -f "$script_path" ]]; then
  echo "Missing proof script: $script_path" >&2
  exit 1
fi

exec bash "$script_path"
