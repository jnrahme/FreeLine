#!/bin/bash
# Phase 3a-outbound-calling verification
# Run from repo root: bash phases/3a-outbound-calling/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3014
BACKEND_LOG="/tmp/freeline_phase3a_backend.log"
RUN_ID="$(date +%s)"
AREA_CODE="$(printf '%03d' $((200 + RUN_ID % 700)))"
WEBHOOK_SECRET="phase3a-verify-secret"
FIRST_CALL_ID="phase3a-call-1-${RUN_ID}"
SECOND_CALL_ID="phase3a-call-2-${RUN_ID}"
PASS=0
FAIL=0
RESULTS=()
SERVER_PID=""

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

check() {
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    RESULTS+=("PASS: ${name}")
    PASS=$((PASS + 1))
  else
    RESULTS+=("FAIL: ${name}")
    FAIL=$((FAIL + 1))
  fi
}

start_backend() {
  API_PORT="${API_PORT}" \
  FREE_TIER_MONTHLY_CALL_MINUTES_CAP=3 \
  BANDWIDTH_WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
  npm run start --prefix FreeLine-Backend >"${BACKEND_LOG}" 2>&1 &
  SERVER_PID=$!

  for _ in {1..30}; do
    if curl -fsS "http://127.0.0.1:${API_PORT}/health" > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

extract_json_field() {
  local json="$1"
  local script="$2"
  shift 2
  node -e "const data = JSON.parse(process.argv[1]); ${script}" "${json}" "$@"
}

sign_payload() {
  local payload="$1"
  local secret="$2"
  node -e 'const crypto = require("node:crypto"); console.log(crypto.createHmac("sha256", process.argv[2]).update(process.argv[1]).digest("hex"));' "${payload}" "${secret}"
}

echo "========================================="
echo "Phase 3a-outbound-calling Verification"
echo "========================================="
echo ""

cd "${ROOT_DIR}"

check "Root build succeeds" npm run build
check "Root lint passes" npm run lint
check "Root typecheck passes" npm run typecheck
check "Root tests pass" npm run test
check "Docker services start" docker compose up -d postgres redis --wait
check "Database migrations run cleanly" npm run migrate --prefix FreeLine-Backend
check "Backend starts locally" start_backend

AUTH_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/apple" \
  -H "Content-Type: application/json" \
  -d "{\"identityToken\":\"dev:phase3a-user-${RUN_ID}:phase3a-user-${RUN_ID}@freeline.dev:PhaseThreeAUser${RUN_ID}\",\"fingerprint\":\"phase3a-device-${RUN_ID}\",\"platform\":\"ios\"}")"
ACCESS_TOKEN="$(extract_json_field "${AUTH_RESPONSE}" 'console.log(data.tokens.accessToken ?? "");')"

if [ -n "${ACCESS_TOKEN}" ]; then
  RESULTS+=("PASS: Auth response returns access token")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Auth response returns access token")
  FAIL=$((FAIL + 1))
fi

SEARCH_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/numbers/search?areaCode=${AREA_CODE}")"
FIRST_NUMBER="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.phoneNumber ?? "");')"
FIRST_NATIONAL_FORMAT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.nationalFormat ?? "");')"
FIRST_LOCALITY="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.locality ?? "");')"
FIRST_REGION="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.region ?? "");')"

CLAIM_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/claim" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"areaCode\":\"${AREA_CODE}\",\"locality\":\"${FIRST_LOCALITY}\",\"nationalFormat\":\"${FIRST_NATIONAL_FORMAT}\",\"phoneNumber\":\"${FIRST_NUMBER}\",\"region\":\"${FIRST_REGION}\"}")"
CLAIMED_NUMBER="$(extract_json_field "${CLAIM_RESPONSE}" 'console.log(data.number?.phoneNumber ?? "");')"

if [ -n "${CLAIMED_NUMBER}" ]; then
  RESULTS+=("PASS: Claim provisions a caller number")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Claim provisions a caller number")
  FAIL=$((FAIL + 1))
fi

TOKEN_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/calls/token" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
VOICE_TOKEN="$(extract_json_field "${TOKEN_RESPONSE}" 'console.log(data.token ?? "");')"
VOICE_ALLOWANCE_REMAINING="$(extract_json_field "${TOKEN_RESPONSE}" 'console.log(data.allowance?.monthlyRemainingMinutes ?? -1);')"

if [ -n "${VOICE_TOKEN}" ] && [ "${VOICE_ALLOWANCE_REMAINING}" = "3" ]; then
  RESULTS+=("PASS: Voice token issuance returns token and allowance")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Voice token issuance returns token and allowance")
  FAIL=$((FAIL + 1))
fi

FIRST_CALL_PAYLOAD='{"events":[{"from":"'"${CLAIMED_NUMBER}"'","providerCallId":"'"${FIRST_CALL_ID}"'","startedAt":"2026-03-17T12:00:00.000Z","status":"initiated","to":"+14155550500"},{"from":"'"${CLAIMED_NUMBER}"'","providerCallId":"'"${FIRST_CALL_ID}"'","startedAt":"2026-03-17T12:00:00.000Z","status":"ringing","to":"+14155550500"},{"from":"'"${CLAIMED_NUMBER}"'","providerCallId":"'"${FIRST_CALL_ID}"'","startedAt":"2026-03-17T12:00:00.000Z","status":"answered","to":"+14155550500"},{"durationSeconds":125,"endedAt":"2026-03-17T12:02:05.000Z","from":"'"${CLAIMED_NUMBER}"'","providerCallId":"'"${FIRST_CALL_ID}"'","startedAt":"2026-03-17T12:00:00.000Z","status":"completed","to":"+14155550500"}]}'
FIRST_CALL_SIGNATURE="$(sign_payload "${FIRST_CALL_PAYLOAD}" "${WEBHOOK_SECRET}")"
FIRST_CALL_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${FIRST_CALL_SIGNATURE}" \
  -d "${FIRST_CALL_PAYLOAD}")"
FIRST_CALL_UPDATED_COUNT="$(extract_json_field "${FIRST_CALL_RESPONSE}" 'console.log(data.updatedCount ?? 0);')"

SECOND_CALL_PAYLOAD='{"events":[{"durationSeconds":45,"endedAt":"2026-03-17T13:00:45.000Z","from":"'"${CLAIMED_NUMBER}"'","providerCallId":"'"${SECOND_CALL_ID}"'","startedAt":"2026-03-17T13:00:00.000Z","status":"completed","to":"+14155550501"}]}'
SECOND_CALL_SIGNATURE="$(sign_payload "${SECOND_CALL_PAYLOAD}" "${WEBHOOK_SECRET}")"
SECOND_CALL_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${SECOND_CALL_SIGNATURE}" \
  -d "${SECOND_CALL_PAYLOAD}")"
SECOND_CALL_UPDATED_COUNT="$(extract_json_field "${SECOND_CALL_RESPONSE}" 'console.log(data.updatedCount ?? 0);')"

if [ "${FIRST_CALL_UPDATED_COUNT}" = "4" ] && [ "${SECOND_CALL_UPDATED_COUNT}" = "1" ]; then
  RESULTS+=("PASS: Signed call status webhooks create and update call records")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Signed call status webhooks create and update call records")
  FAIL=$((FAIL + 1))
fi

HISTORY_RESPONSE="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/calls/history")"
CALL_ORDER="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log((data.calls ?? []).map((item) => item.remoteNumber).join(","));')"
FIRST_HISTORY_STATUS="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log(data.calls?.[0]?.status ?? "");')"
SECOND_HISTORY_DURATION="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log(data.calls?.[1]?.durationSeconds ?? -1);')"
USED_MINUTES="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log(data.allowance?.monthlyUsedMinutes ?? -1);')"
REMAINING_MINUTES="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log(data.allowance?.monthlyRemainingMinutes ?? -1);')"

if [ "${CALL_ORDER}" = "+14155550501,+14155550500" ] && [ "${FIRST_HISTORY_STATUS}" = "completed" ] && [ "${SECOND_HISTORY_DURATION}" = "125" ] && [ "${USED_MINUTES}" = "3" ] && [ "${REMAINING_MINUTES}" = "0" ]; then
  RESULTS+=("PASS: Call history sorts correctly and deducts monthly minutes")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Call history sorts correctly and deducts monthly minutes")
  FAIL=$((FAIL + 1))
fi

BLOCKED_TOKEN_STATUS="$(curl -s -o /tmp/freeline_phase3a_token_limit.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/calls/token" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
BLOCKED_TOKEN_MESSAGE="$(node -e 'const fs = require("node:fs"); const data = JSON.parse(fs.readFileSync("/tmp/freeline_phase3a_token_limit.json", "utf8")); console.log(data.error?.message ?? "");')"

if [ "${BLOCKED_TOKEN_STATUS}" = "429" ] && [ "${BLOCKED_TOKEN_MESSAGE}" = "Free tier call limit reached. Watch an ad or upgrade." ]; then
  RESULTS+=("PASS: Call minute cap refuses token issuance")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Call minute cap refuses token issuance")
  FAIL=$((FAIL + 1))
fi

INVALID_WEBHOOK_STATUS="$(curl -s -o /tmp/freeline_phase3a_invalid_webhook.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: invalid-signature" \
  -d "${FIRST_CALL_PAYLOAD}")"

if [ "${INVALID_WEBHOOK_STATUS}" = "401" ]; then
  RESULTS+=("PASS: Invalid call webhook signatures are rejected")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Invalid call webhook signatures are rejected")
  FAIL=$((FAIL + 1))
fi

check "iOS project regenerates cleanly" bash -lc "cd FreeLine-iOS && xcodegen generate"
check "iOS app builds successfully" xcodebuild -project FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6" build
check "iOS uses native dialer for 911" rg -F -q 'URL(string: "tel://911")' FreeLine-iOS/Sources/Screens/CallsView.swift
check "iOS active call screen exposes mute, speaker, keypad, and timer" bash -lc "rg -F -q 'toggleMuteActiveCall()' FreeLine-iOS/Sources/Screens/CallsView.swift && rg -F -q 'toggleSpeakerActiveCall()' FreeLine-iOS/Sources/Screens/CallsView.swift && rg -F -q 'sendDigitsToActiveCall(digit)' FreeLine-iOS/Sources/Screens/CallsView.swift && rg -F -q 'durationString(now:' FreeLine-iOS/Sources/Screens/CallsView.swift"
check "iOS voice transport consumes Twilio SDK token" bash -lc "rg -F -q 'TwilioVoiceSDK.connect' FreeLine-iOS/Sources/Calls/TwilioVoiceTransport.swift && rg -F -q 'builder.params = [\"to\": remoteNumber]' FreeLine-iOS/Sources/Calls/TwilioVoiceTransport.swift"
check "Android app builds successfully" bash -lc "cd FreeLine-Android && ./gradlew assembleDebug"
check "Android uses native dialer for 911" rg -F -q 'Intent(Intent.ACTION_DIAL, Uri.parse("tel:911"))' FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt
check "Android active call screen exposes mute, speaker, keypad, and timer" bash -lc "rg -F -q 'toggleMuteActiveCall()' FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt && rg -F -q 'toggleSpeakerActiveCall()' FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt && rg -F -q 'sendDigitsToActiveCall(it)' FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt && rg -F -q 'timerAnchorEpochMillis' FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt"
check "Android voice transport consumes Twilio SDK token" bash -lc "rg -F -q 'Voice.connect' FreeLine-Android/app/src/main/java/com/freeline/app/calls/TwilioVoiceTransport.kt && rg -F -q 'ConnectOptions.Builder(token)' FreeLine-Android/app/src/main/java/com/freeline/app/calls/TwilioVoiceTransport.kt"

echo ""
echo "========================================="
echo "Results"
echo "========================================="
for result in "${RESULTS[@]}"; do
  echo "  ${result}"
done
echo ""
echo "PASSED: ${PASS} / $((PASS + FAIL))"

if [ "${FAIL}" -gt 0 ]; then
  echo "STATUS: FAIL"
  exit 1
else
  echo "STATUS: PASS"
  exit 0
fi
