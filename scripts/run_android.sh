#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/FreeLine-Android"
GRADLEW="$ANDROID_DIR/gradlew"
ANDROID_PACKAGE="com.freeline.app"
LAUNCH_ACTIVITY="$ANDROID_PACKAGE/.MainActivity"
EMULATOR_LOG="$REPO_ROOT/.build/android-emulator.log"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/run_android.sh emulator
  bash scripts/run_android.sh device

Environment:
  ANDROID_SERIAL  Use a specific device or emulator serial.
  AVD_NAME        Use a specific AVD when booting an emulator.
EOF
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

resolve_emulator() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    printf '%s\n' "$ANDROID_SERIAL"
    return 0
  fi

  local serial
  serial="$(adb devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }')"
  if [[ -n "$serial" ]]; then
    printf '%s\n' "$serial"
    return 0
  fi

  require_cmd emulator

  local avd_name="${AVD_NAME:-}"
  if [[ -z "$avd_name" ]]; then
    avd_name="$(emulator -list-avds | head -n 1)"
  fi

  if [[ -z "$avd_name" ]]; then
    echo "No Android AVDs configured. Create one in Android Studio first." >&2
    exit 1
  fi

  mkdir -p "$REPO_ROOT/.build"
  echo "Starting Android emulator: $avd_name"
  nohup emulator -avd "$avd_name" -no-snapshot-load >"$EMULATOR_LOG" 2>&1 &

  for _ in {1..90}; do
    serial="$(adb devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }')"
    if [[ -n "$serial" ]]; then
      local boot_completed
      boot_completed="$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
      if [[ "$boot_completed" == "1" ]]; then
        printf '%s\n' "$serial"
        return 0
      fi
    fi
    sleep 2
  done

  echo "Timed out waiting for the Android emulator to boot." >&2
  exit 1
}

resolve_device() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    printf '%s\n' "$ANDROID_SERIAL"
    return 0
  fi

  local serial
  serial="$(adb devices | awk '$1 !~ /^emulator-/ && $2 == "device" { print $1; exit }')"
  if [[ -z "$serial" ]]; then
    echo "No physical Android device found. Connect via USB and enable USB debugging." >&2
    exit 1
  fi

  printf '%s\n' "$serial"
}

install_and_launch() {
  local serial="$1"

  if [[ ! -x "$GRADLEW" ]]; then
    echo "Missing Gradle wrapper at $GRADLEW" >&2
    exit 1
  fi

  echo "Building and installing the Android debug APK on $serial"
  (
    cd "$ANDROID_DIR"
    ANDROID_SERIAL="$serial" ./gradlew installDebug --no-daemon
  )

  echo "Launching FreeLine on $serial"
  adb -s "$serial" shell am start -n "$LAUNCH_ACTIVITY"
}

MODE="${1:-}"
case "$MODE" in
  emulator)
    require_cmd adb
    serial="$(resolve_emulator)"
    install_and_launch "$serial"
    ;;
  device)
    require_cmd adb
    serial="$(resolve_device)"
    install_and_launch "$serial"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
