#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IOS_DIR="${ROOT_DIR}/FreeLine-iOS"
ARTIFACT_DIR="${ROOT_DIR}/phases/2b-inbound-sms/artifacts/ios-proof"
DERIVED_DATA="${ROOT_DIR}/.runtime/ios-phase2b-proof"
BUNDLE_ID="com.freeline.ios"

pick_device_udid() {
  xcrun simctl list devices available -j | node -e '
const fs = require("node:fs");

const data = JSON.parse(fs.readFileSync(0, "utf8"));
const devices = Object.values(data.devices)
  .flat()
  .filter((device) => device.isAvailable);

const booted = devices.find((device) => device.state === "Booted" && device.name.includes("iPhone"));
const preferredNames = ["iPhone 16 Pro", "iPhone 16", "iPhone 17 Pro", "iPhone 16 Pro Max"];
let selected = booted;

if (!selected) {
  for (const name of preferredNames) {
    selected = devices.find((device) => device.name === name);
    if (selected) {
      break;
    }
  }
}

if (!selected) {
  selected = devices.find((device) => device.name.includes("iPhone"));
}

if (!selected) {
  process.exit(1);
}

process.stdout.write(selected.udid);
'
}

DEVICE_UDID="${IOS_PROOF_DEVICE_UDID:-$(pick_device_udid)}"

cleanup() {
  xcrun simctl terminate "${DEVICE_UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  xcrun simctl status_bar "${DEVICE_UDID}" clear >/dev/null 2>&1 || true
}

trap cleanup EXIT

mkdir -p "${ARTIFACT_DIR}" "${DERIVED_DATA}"
rm -f "${ARTIFACT_DIR}"/*.png

open -a Simulator --args -CurrentDeviceUDID "${DEVICE_UDID}" >/dev/null 2>&1 || true
xcrun simctl boot "${DEVICE_UDID}" >/dev/null 2>&1 || true
xcrun simctl bootstatus "${DEVICE_UDID}" -b
xcrun simctl status_bar "${DEVICE_UDID}" override \
  --time "9:41" \
  --dataNetwork wifi \
  --wifiMode active \
  --wifiBars 3 \
  --batteryState charged \
  --batteryLevel 100 >/dev/null 2>&1 || true

(
  cd "${IOS_DIR}"
  xcodegen generate >/dev/null
  xcodebuild \
    -quiet \
    -project FreeLine.xcodeproj \
    -scheme FreeLine \
    -destination "id=${DEVICE_UDID}" \
    -derivedDataPath "${DERIVED_DATA}" \
    build
)

APP_PATH="${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/FreeLine.app"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Built app not found at ${APP_PATH}" >&2
  exit 1
fi

xcrun simctl install "${DEVICE_UDID}" "${APP_PATH}"

xcrun simctl terminate "${DEVICE_UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl launch "${DEVICE_UDID}" "${BUNDLE_ID}" -proofScenario inbound-badge >/dev/null
sleep 4
xcrun simctl io "${DEVICE_UDID}" screenshot "${ARTIFACT_DIR}/inbound-badge.png" >/dev/null

xcrun simctl terminate "${DEVICE_UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl launch "${DEVICE_UDID}" "${BUNDLE_ID}" -proofScenario push-route >/dev/null
sleep 2
xcrun simctl openurl "${DEVICE_UDID}" "freeline://messages/proof-conversation-1" >/dev/null
sleep 3
xcrun simctl io "${DEVICE_UDID}" screenshot "${ARTIFACT_DIR}/push-route.png" >/dev/null

printf 'Saved phase 2b iOS proof artifacts to %s\n' "${ARTIFACT_DIR}"
ls -1 "${ARTIFACT_DIR}"/*.png
