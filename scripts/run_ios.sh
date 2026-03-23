#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_PROJECT="$REPO_ROOT/FreeLine-iOS/FreeLine.xcodeproj"
IOS_SCHEME="FreeLine"
IOS_BUNDLE_ID="com.freeline.ios"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/run_ios.sh sim
  bash scripts/run_ios.sh device
  bash scripts/run_ios.sh verify

Environment:
  IOS_SIM_ID  Use a specific simulator identifier.
EOF
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

resolve_simulator_id() {
  if [[ -n "${IOS_SIM_ID:-}" ]]; then
    printf '%s\n' "$IOS_SIM_ID"
    return 0
  fi

  local sim_id
  sim_id="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone/ && $0 !~ /unavailable/ { print $2; exit }')"
  if [[ -z "$sim_id" ]]; then
    echo "No available iPhone simulator found." >&2
    exit 1
  fi

  printf '%s\n' "$sim_id"
}

resolve_simulator_name() {
  local sim_id="$1"
  xcrun simctl list devices available | awk -v target="$sim_id" -F '[()]' '
    $2 == target {
      line = $1
      sub(/^.*] /, "", line)
      gsub(/[[:space:]]+$/, "", line)
      print line
      exit
    }
  '
}

resolve_device_id() {
  xcodebuild -project "$IOS_PROJECT" -scheme "$IOS_SCHEME" -showdestinations 2>&1 | \
    grep "platform:iOS," | grep -v Simulator | grep -v placeholder | \
    head -1 | sed 's/.*id:\([^,}]*\).*/\1/'
}

resolve_device_name() {
  xcodebuild -project "$IOS_PROJECT" -scheme "$IOS_SCHEME" -showdestinations 2>&1 | \
    grep "platform:iOS," | grep -v Simulator | grep -v placeholder | \
    head -1 | sed 's/.*name:\([^}]*\).*/\1/' | xargs
}

build_for_simulator() {
  local sim_id="$1"
  local derived_data="$REPO_ROOT/.build/ios-sim"

  mkdir -p "$REPO_ROOT/.build"

  echo "Booting iOS simulator: $(resolve_simulator_name "$sim_id") ($sim_id)"
  xcrun simctl boot "$sim_id" 2>/dev/null || true
  open -a Simulator >/dev/null 2>&1 || true

  echo "Building FreeLine for the simulator"
  xcodebuild \
    -project "$IOS_PROJECT" \
    -scheme "$IOS_SCHEME" \
    -configuration Debug \
    -destination "id=$sim_id" \
    -derivedDataPath "$derived_data" \
    CODE_SIGNING_ALLOWED=NO \
    build
}

launch_on_simulator() {
  local sim_id="$1"
  local app_path="$REPO_ROOT/.build/ios-sim/Build/Products/Debug-iphonesimulator/FreeLine.app"

  if [[ ! -d "$app_path" ]]; then
    echo "Expected simulator app bundle not found at $app_path" >&2
    exit 1
  fi

  echo "Installing and launching FreeLine on the simulator"
  xcrun simctl install "$sim_id" "$app_path"
  xcrun simctl launch "$sim_id" "$IOS_BUNDLE_ID"
}

build_for_device() {
  local device_id="$1"
  local derived_data="$REPO_ROOT/.build/ios-device"

  mkdir -p "$REPO_ROOT/.build"

  echo "Building FreeLine for the connected iPhone ($device_id)"
  xcodebuild \
    -project "$IOS_PROJECT" \
    -scheme "$IOS_SCHEME" \
    -configuration Debug \
    -destination "id=$device_id" \
    -derivedDataPath "$derived_data" \
    build
}

launch_on_device() {
  local device_id="$1"
  local device_name="$2"
  local app_path="$REPO_ROOT/.build/ios-device/Build/Products/Debug-iphoneos/FreeLine.app"

  if [[ ! -d "$app_path" ]]; then
    echo "Expected device app bundle not found at $app_path" >&2
    exit 1
  fi

  echo "Installing FreeLine on $device_name"
  ios-deploy --bundle "$app_path" --no-wifi --nostart

  echo "Launching FreeLine on $device_name"
  xcrun devicectl device process launch --device "$device_id" "$IOS_BUNDLE_ID"
}

MODE="${1:-}"
case "$MODE" in
  sim)
    require_cmd xcodebuild
    require_cmd xcrun
    require_cmd open
    sim_id="$(resolve_simulator_id)"
    build_for_simulator "$sim_id"
    launch_on_simulator "$sim_id"
    ;;
  device)
    require_cmd xcodebuild
    require_cmd xcrun
    require_cmd ios-deploy
    device_id="$(resolve_device_id)"
    if [[ -z "$device_id" ]]; then
      echo "No physical iPhone found. Connect via USB and trust this Mac." >&2
      exit 1
    fi
    device_name="$(resolve_device_name)"
    build_for_device "$device_id"
    launch_on_device "$device_id" "$device_name"
    ;;
  verify)
    require_cmd xcodebuild
    require_cmd xcrun
    sim_id="$(resolve_simulator_id)"
    build_for_simulator "$sim_id"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
