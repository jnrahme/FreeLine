#!/bin/bash
# Phase 3b-inbound-calling verification
# Run from repo root: bash phases/3b-inbound-calling/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3015
FIXTURE_PORT=3016
BACKEND_LOG="/tmp/freeline_phase3b_backend.log"
FIXTURE_LOG="/tmp/freeline_phase3b_fixture.log"
PUSH_LOG="$ROOT_DIR/.runtime/dev-mailbox/push-events.jsonl"
FIXTURE_DIR="/tmp/freeline_phase3b_recordings"
RUN_ID="$(date +%s)"
AREA_CODE="312"
WEBHOOK_SECRET="phase3b-verify-secret"
TWILIO_AUTH_TOKEN="phase3b-twilio-secret"
INBOUND_CALL_ID="phase3b-inbound-${RUN_ID}"
MISSED_CALL_ID="phase3b-missed-${RUN_ID}"
CAP_CALL_ID="phase3b-cap-${RUN_ID}"
CAP_INBOUND_CALL_ID="phase3b-cap-inbound-${RUN_ID}"
TWILIO_CALL_SID="CA${RUN_ID}01"
TWILIO_VM_CALL_SID="CA${RUN_ID}02"
GENERIC_FIXTURE_CONTENT="phase3b generic voicemail fixture"
TWILIO_FIXTURE_CONTENT="phase3b twilio voicemail fixture"
PASS=0
FAIL=0
RESULTS=()
SERVER_PID=""
FIXTURE_PID=""

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${FIXTURE_PID}" ] && kill -0 "${FIXTURE_PID}" >/dev/null 2>&1; then
    kill "${FIXTURE_PID}" >/dev/null 2>&1 || true
    wait "${FIXTURE_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

record_pass() {
  RESULTS+=("PASS: $1")
  PASS=$((PASS + 1))
}

record_fail() {
  RESULTS+=("FAIL: $1")
  FAIL=$((FAIL + 1))
}

check() {
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    record_pass "$name"
  else
    record_fail "$name"
  fi
}

check_equals() {
  local name="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    record_pass "$name"
  else
    record_fail "$name"
  fi
}

check_contains() {
  local name="$1"
  local haystack="$2"
  local needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    record_pass "$name"
  else
    record_fail "$name"
  fi
}

start_backend() {
  API_PORT="${API_PORT}" \
  PUBLIC_BASE_URL="http://127.0.0.1:${API_PORT}" \
  FREE_TIER_MONTHLY_CALL_MINUTES_CAP=3 \
  BANDWIDTH_WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
  TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN}" \
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

prepare_voicemail_fixtures() {
  rm -rf "${FIXTURE_DIR}"
  mkdir -p "${FIXTURE_DIR}"
  printf '%s' "${GENERIC_FIXTURE_CONTENT}" > "${FIXTURE_DIR}/phase3b-generic.mp3"
  printf '%s' "${TWILIO_FIXTURE_CONTENT}" > "${FIXTURE_DIR}/phase3b-twilio.mp3"
}

start_fixture_server() {
  (
    cd "${FIXTURE_DIR}"
    python3 -m http.server "${FIXTURE_PORT}" --bind 127.0.0.1
  ) >"${FIXTURE_LOG}" 2>&1 &
  FIXTURE_PID=$!

  for _ in {1..20}; do
    if curl -fsS "http://127.0.0.1:${FIXTURE_PORT}/phase3b-generic.mp3" > /dev/null 2>&1; then
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

sign_twilio_form() {
  local url="$1"
  local auth_token="$2"
  shift 2
  node - "${url}" "${auth_token}" "$@" <<'NODE'
const crypto = require("node:crypto");

const [url, authToken, ...pairs] = process.argv.slice(2);
const params = {};
for (const pair of pairs) {
  const separatorIndex = pair.indexOf("=");
  if (separatorIndex === -1) {
    continue;
  }
  const key = pair.slice(0, separatorIndex);
  const value = pair.slice(separatorIndex + 1);
  params[key] = value;
}

const payload = Object.keys(params)
  .sort()
  .reduce((value, key) => value + key + params[key], url);

process.stdout.write(
  crypto.createHmac("sha1", authToken).update(Buffer.from(payload, "utf8")).digest("base64")
);
NODE
}

read_push_metric() {
  local type="$1"
  local field="$2"
  node - "${PUSH_LOG}" "${type}" "${field}" <<'NODE'
const fs = require("node:fs");

const [filePath, type, field] = process.argv.slice(2);
if (!fs.existsSync(filePath)) {
  process.stdout.write(field === "count" ? "0" : "");
  process.exit(0);
}

const events = fs
  .readFileSync(filePath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((event) => event.type === type);

if (field === "count") {
  process.stdout.write(String(events.length));
  process.exit(0);
}

const lastEvent = events.at(-1) ?? {};
if (field === "lastTokenCount") {
  process.stdout.write(String(Array.isArray(lastEvent.tokens) ? lastEvent.tokens.length : 0));
  process.exit(0);
}

if (field === "lastAction") {
  process.stdout.write(String(lastEvent.action ?? ""));
  process.exit(0);
}

if (field === "lastCallerNumber") {
  process.stdout.write(String(lastEvent.callerNumber ?? ""));
  process.exit(0);
}

process.stdout.write(String(lastEvent[field] ?? ""));
NODE
}

echo "========================================="
echo "Phase 3b-inbound-calling Verification"
echo "========================================="
echo ""

cd "${ROOT_DIR}"
mkdir -p "$(dirname "${PUSH_LOG}")"
rm -f "${PUSH_LOG}"
prepare_voicemail_fixtures

check "Root build succeeds" npm run build
check "Root lint passes" npm run lint
check "Root typecheck passes" npm run typecheck
check "Root tests pass" npm run test
check "Docker services start" docker compose up -d postgres redis --wait
check "Database migrations run cleanly" npm run migrate --prefix FreeLine-Backend
check "Local voicemail fixture server starts" start_fixture_server
check "Backend starts locally" start_backend

AUTH_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/apple" \
  -H "Content-Type: application/json" \
  -d "{\"identityToken\":\"dev:phase3b-user-${RUN_ID}:phase3b-user-${RUN_ID}@freeline.dev:PhaseThreeBUser${RUN_ID}\",\"fingerprint\":\"phase3b-device-${RUN_ID}\",\"platform\":\"ios\"}")"
ACCESS_TOKEN="$(extract_json_field "${AUTH_RESPONSE}" 'console.log(data.tokens.accessToken ?? "");')"
check_contains "Auth response returns access token" "${ACCESS_TOKEN}" "."

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
check_equals "Claim provisions an inbound line" "${CLAIMED_NUMBER}" "${FIRST_NUMBER}"

ALERT_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/devices/call-push-token" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"alert\",\"deviceId\":\"phase3b-device-${RUN_ID}\",\"platform\":\"ios\",\"token\":\"phase3b-alert-token-${RUN_ID}\"}")"
ALERT_CHANNEL="$(extract_json_field "${ALERT_RESPONSE}" 'console.log(data.pushToken?.channel ?? "");')"

VOIP_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/devices/voip-token" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"phase3b-device-${RUN_ID}\",\"platform\":\"ios\",\"token\":\"phase3b-voip-token-${RUN_ID}\"}")"
VOIP_CHANNEL="$(extract_json_field "${VOIP_RESPONSE}" 'console.log(data.pushToken?.channel ?? "");')"

if [ "${ALERT_CHANNEL}" = "alert" ] && [ "${VOIP_CHANNEL}" = "voip" ]; then
  record_pass "Alert and VoIP push token endpoints persist channels"
else
  record_fail "Alert and VoIP push token endpoints persist channels"
fi

TWILIO_INBOUND_URL="http://127.0.0.1:${API_PORT}/v1/webhooks/twilio/voice/inbound"
TWILIO_INBOUND_SIGNATURE="$(sign_twilio_form "${TWILIO_INBOUND_URL}" "${TWILIO_AUTH_TOKEN}" \
  "CallSid=${TWILIO_CALL_SID}" \
  "Caller=+14155550777" \
  "From=+14155550777" \
  "To=${CLAIMED_NUMBER}")"
TWILIO_INBOUND_RESPONSE="$(curl -fsS -X POST "${TWILIO_INBOUND_URL}" \
  -H "x-twilio-signature: ${TWILIO_INBOUND_SIGNATURE}" \
  --data-urlencode "CallSid=${TWILIO_CALL_SID}" \
  --data-urlencode "Caller=+14155550777" \
  --data-urlencode "From=+14155550777" \
  --data-urlencode "To=${CLAIMED_NUMBER}")"
check_contains "Twilio inbound route returns client dial TwiML" "${TWILIO_INBOUND_RESPONSE}" "<Client"
check_contains "Twilio inbound route includes voicemail redirect" "${TWILIO_INBOUND_RESPONSE}" "/v1/webhooks/twilio/voice/voicemail"

INVALID_TWILIO_STATUS="$(curl -s -o /tmp/freeline_phase3b_invalid_twilio.xml -w "%{http_code}" -X POST "${TWILIO_INBOUND_URL}" \
  -H "x-twilio-signature: invalid-signature" \
  --data-urlencode "CallSid=${TWILIO_CALL_SID}" \
  --data-urlencode "Caller=+14155550777" \
  --data-urlencode "From=+14155550777" \
  --data-urlencode "To=${CLAIMED_NUMBER}")"
check_equals "Invalid Twilio signatures are rejected" "${INVALID_TWILIO_STATUS}" "401"

: > "${PUSH_LOG}"

INBOUND_PAYLOAD='{"events":[{"from":"+14155550999","providerCallId":"'"${INBOUND_CALL_ID}"'","startedAt":"2026-03-17T14:00:00.000Z","to":"'"${CLAIMED_NUMBER}"'"}]}'
INBOUND_SIGNATURE="$(sign_payload "${INBOUND_PAYLOAD}" "${WEBHOOK_SECRET}")"
INBOUND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${INBOUND_SIGNATURE}" \
  -d "${INBOUND_PAYLOAD}")"
INBOUND_ACTION="$(extract_json_field "${INBOUND_RESPONSE}" 'console.log(data.plans?.[0]?.action ?? "");')"
INBOUND_IDENTITY="$(extract_json_field "${INBOUND_RESPONSE}" 'console.log(data.plans?.[0]?.identity ?? "");')"
INBOUND_TOKEN_COUNT="$(extract_json_field "${INBOUND_RESPONSE}" 'console.log(data.plans?.[0]?.tokens?.length ?? 0);')"
if [ "${INBOUND_ACTION}" = "ring" ] && [ -n "${INBOUND_IDENTITY}" ] && [ "${INBOUND_TOKEN_COUNT}" = "2" ]; then
  record_pass "Generic inbound webhook rings the client with both token channels"
else
  record_fail "Generic inbound webhook rings the client with both token channels"
fi

CALL_INBOUND_PUSH_COUNT="$(read_push_metric "call:inbound" "count")"
CALL_INBOUND_PUSH_ACTION="$(read_push_metric "call:inbound" "lastAction")"
CALL_INBOUND_PUSH_TOKENS="$(read_push_metric "call:inbound" "lastTokenCount")"
if [ "${CALL_INBOUND_PUSH_COUNT}" = "1" ] && [ "${CALL_INBOUND_PUSH_ACTION}" = "ring" ] && [ "${CALL_INBOUND_PUSH_TOKENS}" = "2" ]; then
  record_pass "Inbound call push proof is written to the dev mailbox"
else
  record_fail "Inbound call push proof is written to the dev mailbox"
fi

MISSED_PAYLOAD='{"events":[{"endedAt":"2026-03-17T14:00:30.000Z","from":"+14155550999","providerCallId":"'"${INBOUND_CALL_ID}"'","startedAt":"2026-03-17T14:00:00.000Z","status":"missed","to":"'"${CLAIMED_NUMBER}"'"}]}'
MISSED_SIGNATURE="$(sign_payload "${MISSED_PAYLOAD}" "${WEBHOOK_SECRET}")"
MISSED_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${MISSED_SIGNATURE}" \
  -d "${MISSED_PAYLOAD}")"
MISSED_UPDATED_COUNT="$(extract_json_field "${MISSED_RESPONSE}" 'console.log(data.updatedCount ?? 0);')"
check_equals "Missed status webhook updates the inbound call" "${MISSED_UPDATED_COUNT}" "1"

MISSED_PUSH_COUNT="$(read_push_metric "call:missed" "count")"
MISSED_CALLER="$(read_push_metric "call:missed" "lastCallerNumber")"
if [ "${MISSED_PUSH_COUNT}" = "1" ] && [ "${MISSED_CALLER}" = "+14155550999" ]; then
  record_pass "Missed call alert is written to the dev mailbox"
else
  record_fail "Missed call alert is written to the dev mailbox"
fi

VOICEMAIL_PAYLOAD='{"events":[{"audioUrl":"http://127.0.0.1:'"${FIXTURE_PORT}"'/phase3b-generic.mp3","durationSeconds":42,"from":"+14155550777","providerCallId":"'"${MISSED_CALL_ID}"'","to":"'"${CLAIMED_NUMBER}"'","transcription":"Testing one two"}]}'
VOICEMAIL_SIGNATURE="$(sign_payload "${VOICEMAIL_PAYLOAD}" "${WEBHOOK_SECRET}")"
VOICEMAIL_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/voicemail" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${VOICEMAIL_SIGNATURE}" \
  -d "${VOICEMAIL_PAYLOAD}")"
VOICEMAIL_CREATED_COUNT="$(extract_json_field "${VOICEMAIL_RESPONSE}" 'console.log(data.createdCount ?? 0);')"
check_equals "Generic voicemail webhook stores recordings" "${VOICEMAIL_CREATED_COUNT}" "1"

TWILIO_VM_QUERY="from=%2B14155550666&providerCallId=${TWILIO_VM_CALL_SID}&to=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "${CLAIMED_NUMBER}")"
TWILIO_VM_URL="http://127.0.0.1:${API_PORT}/v1/webhooks/twilio/voice/voicemail?${TWILIO_VM_QUERY}"
TWILIO_VM_SIGNATURE="$(sign_twilio_form "${TWILIO_VM_URL}" "${TWILIO_AUTH_TOKEN}" \
  "CallSid=${TWILIO_VM_CALL_SID}" \
  "Caller=+14155550666" \
  "From=+14155550666" \
  "RecordingDuration=24" \
  "RecordingUrl=http://127.0.0.1:${FIXTURE_PORT}/phase3b-twilio" \
  "To=${CLAIMED_NUMBER}")"
TWILIO_VM_RESPONSE="$(curl -fsS -X POST "${TWILIO_VM_URL}" \
  -H "x-twilio-signature: ${TWILIO_VM_SIGNATURE}" \
  --data-urlencode "CallSid=${TWILIO_VM_CALL_SID}" \
  --data-urlencode "Caller=+14155550666" \
  --data-urlencode "From=+14155550666" \
  --data-urlencode "RecordingDuration=24" \
  --data-urlencode "RecordingUrl=http://127.0.0.1:${FIXTURE_PORT}/phase3b-twilio" \
  --data-urlencode "To=${CLAIMED_NUMBER}")"
check_contains "Twilio voicemail route confirms save" "${TWILIO_VM_RESPONSE}" "Your voicemail has been saved"

VOICEMAIL_PUSH_COUNT="$(read_push_metric "voicemail:new" "count")"
check_equals "Voicemail alerts are written to the dev mailbox" "${VOICEMAIL_PUSH_COUNT}" "2"

VOICEMAIL_LIST="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/voicemails")"
VOICEMAIL_COUNT="$(extract_json_field "${VOICEMAIL_LIST}" 'console.log(data.voicemails?.length ?? 0);')"
TWILIO_ARCHIVED_AUDIO_URL="$(extract_json_field "${VOICEMAIL_LIST}" 'const voicemail = (data.voicemails ?? []).find((item) => item.providerCallId === process.argv[2]); console.log(voicemail?.audioUrl ?? "");' "${TWILIO_VM_CALL_SID}")"
FIRST_VOICEMAIL_AUDIO_URL="$(extract_json_field "${VOICEMAIL_LIST}" 'console.log(data.voicemails?.[0]?.audioUrl ?? "");')"
TWILIO_AUDIO_URL_FOUND="$(extract_json_field "${VOICEMAIL_LIST}" 'const voicemail = (data.voicemails ?? []).find((item) => item.providerCallId === process.argv[2]); console.log(voicemail?.audioUrl?.startsWith(process.argv[3]) ? "yes" : "no");' "${TWILIO_VM_CALL_SID}" "http://127.0.0.1:${API_PORT}/v1/voicemails/media/")"
GENERIC_TRANSCRIPTION_FOUND="$(extract_json_field "${VOICEMAIL_LIST}" 'console.log((data.voicemails ?? []).some((item) => item.transcription === "Testing one two") ? "yes" : "no");')"
if [ "${VOICEMAIL_COUNT}" = "2" ] && [ "${TWILIO_AUDIO_URL_FOUND}" = "yes" ] && [ "${GENERIC_TRANSCRIPTION_FOUND}" = "yes" ]; then
  record_pass "Voicemail inbox exposes archived generic and Twilio recordings"
else
  record_fail "Voicemail inbox exposes archived generic and Twilio recordings"
fi

if [ -n "${FIXTURE_PID}" ] && kill -0 "${FIXTURE_PID}" >/dev/null 2>&1; then
  kill "${FIXTURE_PID}" >/dev/null 2>&1 || true
  wait "${FIXTURE_PID}" >/dev/null 2>&1 || true
  FIXTURE_PID=""
fi

if [ -n "${TWILIO_ARCHIVED_AUDIO_URL}" ]; then
  ARCHIVED_AUDIO_TYPE="$(curl -fsS -o /tmp/freeline_phase3b_archived_audio.bin -w "%{content_type}" "${TWILIO_ARCHIVED_AUDIO_URL}")"
  ARCHIVED_AUDIO_BODY="$(cat /tmp/freeline_phase3b_archived_audio.bin)"
  check_equals "Archived voicemail media stays available after the source recording disappears" "${ARCHIVED_AUDIO_BODY}" "${TWILIO_FIXTURE_CONTENT}"
  check_equals "Archived voicemail media keeps an audio content type" "${ARCHIVED_AUDIO_TYPE}" "audio/mpeg"
else
  record_fail "Archived voicemail media stays available after the source recording disappears"
  record_fail "Archived voicemail media keeps an audio content type"
fi

FIRST_VOICEMAIL_ID="$(extract_json_field "${VOICEMAIL_LIST}" 'console.log(data.voicemails?.[0]?.id ?? "");')"
READ_RESPONSE="$(curl -fsS -X PATCH -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/voicemails/${FIRST_VOICEMAIL_ID}/read")"
READ_IS_READ="$(extract_json_field "${READ_RESPONSE}" 'console.log(data.voicemail?.isRead ? "yes" : "no");')"
check_equals "Voicemail read endpoint marks a recording read" "${READ_IS_READ}" "yes"

DELETE_STATUS="$(curl -s -o /tmp/freeline_phase3b_delete_voicemail.json -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "http://127.0.0.1:${API_PORT}/v1/voicemails/${FIRST_VOICEMAIL_ID}")"
check_equals "Voicemail delete endpoint removes a recording" "${DELETE_STATUS}" "204"
if [ -n "${FIRST_VOICEMAIL_AUDIO_URL}" ]; then
  DELETED_AUDIO_STATUS="$(curl -s -o /tmp/freeline_phase3b_deleted_audio.bin -w "%{http_code}" "${FIRST_VOICEMAIL_AUDIO_URL}")"
  check_equals "Voicemail delete removes archived media" "${DELETED_AUDIO_STATUS}" "404"
else
  record_fail "Voicemail delete removes archived media"
fi

: > "${PUSH_LOG}"

USAGE_PAYLOAD='{"events":[{"durationSeconds":180,"endedAt":"2026-03-17T17:03:00.000Z","from":"'"${CLAIMED_NUMBER}"'","providerCallId":"'"${CAP_CALL_ID}"'","startedAt":"2026-03-17T17:00:00.000Z","status":"completed","to":"+14155550402"}]}'
USAGE_SIGNATURE="$(sign_payload "${USAGE_PAYLOAD}" "${WEBHOOK_SECRET}")"
USAGE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${USAGE_SIGNATURE}" \
  -d "${USAGE_PAYLOAD}")"
USAGE_UPDATED_COUNT="$(extract_json_field "${USAGE_RESPONSE}" 'console.log(data.updatedCount ?? 0);')"
check_equals "Call status webhook can exhaust the monthly allowance" "${USAGE_UPDATED_COUNT}" "1"

CAP_INBOUND_PAYLOAD='{"events":[{"from":"+14155550888","providerCallId":"'"${CAP_INBOUND_CALL_ID}"'","startedAt":"2026-03-17T17:05:00.000Z","to":"'"${CLAIMED_NUMBER}"'"}]}'
CAP_INBOUND_SIGNATURE="$(sign_payload "${CAP_INBOUND_PAYLOAD}" "${WEBHOOK_SECRET}")"
CAP_INBOUND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/calls/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${CAP_INBOUND_SIGNATURE}" \
  -d "${CAP_INBOUND_PAYLOAD}")"
CAP_ACTION="$(extract_json_field "${CAP_INBOUND_RESPONSE}" 'console.log(data.plans?.[0]?.action ?? "");')"
CAP_REASON="$(extract_json_field "${CAP_INBOUND_RESPONSE}" 'console.log(data.plans?.[0]?.reason ?? "");')"
CAP_PUSH_COUNT="$(read_push_metric "call:inbound" "count")"
if [ "${CAP_ACTION}" = "voicemail" ] && [ "${CAP_REASON}" = "cap_reached" ] && [ "${CAP_PUSH_COUNT}" = "0" ]; then
  record_pass "Inbound calls route directly to voicemail after the cap with no wake push"
else
  record_fail "Inbound calls route directly to voicemail after the cap with no wake push"
fi

HISTORY_RESPONSE="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/calls/history")"
HAS_INBOUND_MISSED="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log((data.calls ?? []).some((item) => item.direction === "inbound" && item.status === "missed") ? "yes" : "no");')"
HAS_OUTBOUND_COMPLETED="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log((data.calls ?? []).some((item) => item.direction === "outbound" && item.status === "completed" && item.durationSeconds === 180) ? "yes" : "no");')"
ALLOWANCE_USED="$(extract_json_field "${HISTORY_RESPONSE}" 'console.log(data.allowance?.monthlyUsedMinutes ?? -1);')"
if [ "${HAS_INBOUND_MISSED}" = "yes" ] && [ "${HAS_OUTBOUND_COMPLETED}" = "yes" ] && [ "${ALLOWANCE_USED}" = "3" ]; then
  record_pass "Call history exposes inbound missed and outbound completed records"
else
  record_fail "Call history exposes inbound missed and outbound completed records"
fi

check "iOS project regenerates cleanly" bash -lc "cd FreeLine-iOS && xcodegen generate"
check "iOS app builds successfully" xcodebuild -project FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6" build
check "iOS incoming call runtime uses PushKit" bash -lc "rg -F -q 'import PushKit' FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift && rg -F -q 'PKPushRegistry' FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift"
check "iOS incoming call runtime reports through CallKit" bash -lc "rg -F -q 'import CallKit' FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift && rg -F -q 'reportNewIncomingCall' FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift"
check "iOS registers alert and VoIP push tokens" bash -lc "rg -F -q 'registerCallPushToken(channel: \"alert\"' FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift && rg -F -q 'registerVoipToken(token)' FreeLine-iOS/Sources/Calls/IncomingCallRuntime.swift"
check "iOS app lifecycle wires the incoming call runtime" bash -lc "rg -F -q '@UIApplicationDelegateAdaptor(FreeLineAppDelegate.self)' FreeLine-iOS/Sources/App/FreeLineApp.swift && rg -F -q 'IncomingCallRuntime.shared.start(appModel: appModel)' FreeLine-iOS/Sources/App/FreeLineApp.swift"
check "iOS includes voicemail and remote notification background modes" bash -lc "rg -F -q 'remote-notification' FreeLine-iOS/Config/Info.plist && rg -F -q 'voip' FreeLine-iOS/Config/Info.plist"
check "iOS voicemail screen supports in-app playback" bash -lc "rg -F -q 'AVPlayer' FreeLine-iOS/Sources/Calls/VoicemailPlaybackController.swift && rg -F -q 'togglePlayback(for: voicemail)' FreeLine-iOS/Sources/Screens/VoicemailView.swift"
check "Android app builds successfully" bash -lc "cd FreeLine-Android && ./gradlew assembleDebug"
check "Android defines a phone-call foreground service" bash -lc "rg -F -q 'class IncomingCallForegroundService : Service()' FreeLine-Android/app/src/main/java/com/freeline/app/calls/IncomingCallForegroundService.kt && rg -F -q 'setFullScreenIntent' FreeLine-Android/app/src/main/java/com/freeline/app/calls/IncomingCallForegroundService.kt && rg -F -q 'startForeground(' FreeLine-Android/app/src/main/java/com/freeline/app/calls/IncomingCallForegroundService.kt"
check "Android defines a native connection service" bash -lc "rg -F -q 'class FreeLineConnectionService : ConnectionService()' FreeLine-Android/app/src/main/java/com/freeline/app/calls/FreeLineConnectionService.kt && rg -F -q 'setRinging()' FreeLine-Android/app/src/main/java/com/freeline/app/calls/FreeLineConnectionService.kt"
check "Android manifest exposes incoming call services and permissions" bash -lc "rg -F -q 'android.permission.MANAGE_OWN_CALLS' FreeLine-Android/app/src/main/AndroidManifest.xml && rg -F -q '.calls.FreeLineConnectionService' FreeLine-Android/app/src/main/AndroidManifest.xml && rg -F -q '.calls.IncomingCallForegroundService' FreeLine-Android/app/src/main/AndroidManifest.xml && rg -F -q '.calls.FreeLineFirebaseMessagingService' FreeLine-Android/app/src/main/AndroidManifest.xml && rg -F -q 'android.permission.FOREGROUND_SERVICE_PHONE_CALL' FreeLine-Android/app/src/main/AndroidManifest.xml"
check "Android includes an FCM entry service for inbound calls" bash -lc "rg -F -q 'class FreeLineFirebaseMessagingService : FirebaseMessagingService()' FreeLine-Android/app/src/main/java/com/freeline/app/calls/FreeLineFirebaseMessagingService.kt && rg -F -q 'IncomingCallForegroundService.startIncomingCall' FreeLine-Android/app/src/main/java/com/freeline/app/calls/FreeLineFirebaseMessagingService.kt"
check "Android shell exposes voicemail playback" bash -lc "rg -F -q 'VoicemailTabScreen(appState = appState)' FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineApp.kt && rg -F -q 'Play recording' FreeLine-Android/app/src/main/java/com/freeline/app/ui/VoicemailScreens.kt && rg -F -q 'MediaPlayer' FreeLine-Android/app/src/main/java/com/freeline/app/calls/VoicemailPlayer.kt"

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
