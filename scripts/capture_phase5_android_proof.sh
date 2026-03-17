#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/FreeLine-Android"
ARTIFACT_DIR="${ROOT_DIR}/phases/5-ads/artifacts/android-proof"
PACKAGE_NAME="com.freeline.app"
ACTIVITY_NAME="com.freeline.app/.MainActivity"
APK_PATH="${ANDROID_DIR}/app/build/outputs/apk/debug/app-debug.apk"
AVD_NAME="${ANDROID_PROOF_AVD:-Pixel_6a}"
EMULATOR_LOG="/tmp/freeline_phase5_android_emulator.log"
EMULATOR_STARTED=0
EMULATOR_PID=""

SCENARIOS=(
  messages
  calls
  settings-free
  settings-paid
  cap-hit
  interstitial
  rewarded
)

scenario_wait_seconds() {
  case "$1" in
    messages) echo 10 ;;
    calls) echo 8 ;;
    settings-free) echo 8 ;;
    settings-paid) echo 8 ;;
    cap-hit) echo 4 ;;
    interstitial) echo 12 ;;
    rewarded) echo 12 ;;
    *) echo 8 ;;
  esac
}

pick_device_serial() {
  adb devices | awk '/^emulator-[0-9]+[[:space:]]+device$/{print $1; exit}'
}

wait_for_boot() {
  local serial="$1"

  adb -s "${serial}" wait-for-device >/dev/null

  until [[ "$(adb -s "${serial}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done

  until [[ "$(adb -s "${serial}" shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r')" == "stopped" ]]; do
    sleep 2
  done

  adb -s "${serial}" shell input keyevent 82 >/dev/null 2>&1 || true
  adb -s "${serial}" shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
  adb -s "${serial}" shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
  adb -s "${serial}" shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true
}

start_emulator() {
  "${ANDROID_HOME:-$HOME/Library/Android/sdk}/emulator/emulator" \
    -avd "${AVD_NAME}" \
    -no-boot-anim \
    -no-snapshot \
    -netdelay none \
    -netspeed full \
    >"${EMULATOR_LOG}" 2>&1 &
  EMULATOR_PID=$!
  EMULATOR_STARTED=1
}

cleanup() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    adb -s "${ANDROID_SERIAL}" shell am force-stop "${PACKAGE_NAME}" >/dev/null 2>&1 || true
    if [[ "${EMULATOR_STARTED}" -eq 1 ]]; then
      adb -s "${ANDROID_SERIAL}" emu kill >/dev/null 2>&1 || true
    fi
  fi

  if [[ -n "${EMULATOR_PID}" ]]; then
    wait "${EMULATOR_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

mkdir -p "${ARTIFACT_DIR}"
rm -f "${ARTIFACT_DIR}"/*.png

ANDROID_SERIAL="${ANDROID_PROOF_SERIAL:-$(pick_device_serial)}"
if [[ -z "${ANDROID_SERIAL}" ]]; then
  start_emulator

  for _ in {1..120}; do
    ANDROID_SERIAL="$(pick_device_serial)"
    if [[ -n "${ANDROID_SERIAL}" ]]; then
      break
    fi
    sleep 2
  done
fi

if [[ -z "${ANDROID_SERIAL}" ]]; then
  echo "Unable to find or start an Android emulator." >&2
  exit 1
fi

wait_for_boot "${ANDROID_SERIAL}"

(
  cd "${ANDROID_DIR}"
  ./gradlew assembleDebug
)

if [[ ! -f "${APK_PATH}" ]]; then
  echo "Built APK not found at ${APK_PATH}" >&2
  exit 1
fi

adb -s "${ANDROID_SERIAL}" install -r "${APK_PATH}" >/dev/null

for scenario in "${SCENARIOS[@]}"; do
  adb -s "${ANDROID_SERIAL}" shell am force-stop "${PACKAGE_NAME}" >/dev/null
  adb -s "${ANDROID_SERIAL}" shell am start \
    -n "${ACTIVITY_NAME}" \
    --es proofScenario "${scenario}" >/dev/null
  sleep "$(scenario_wait_seconds "${scenario}")"
  adb -s "${ANDROID_SERIAL}" exec-out screencap -p >"${ARTIFACT_DIR}/${scenario}.png"
done

printf 'Saved phase 5 Android proof artifacts to %s\n' "${ARTIFACT_DIR}"
ls -1 "${ARTIFACT_DIR}"/*.png
