#!/bin/bash
# Phase 2b-inbound-sms verification
# Run from repo root: bash phases/2b-inbound-sms/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3013
BACKEND_LOG="/tmp/freeline_phase2b_backend.log"
RUN_ID="$(date +%s)"
WEBHOOK_SECRET="phase2b-verify-secret"
PUSH_LOG="${ROOT_DIR}/.runtime/dev-mailbox/push-events.jsonl"
REALTIME_LOG="${ROOT_DIR}/.runtime/dev-mailbox/realtime-events.jsonl"
SMS_LOG="${ROOT_DIR}/.runtime/dev-mailbox/telephony-sms.jsonl"
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
  rm -f "${PUSH_LOG}" "${REALTIME_LOG}" "${SMS_LOG}"

  API_PORT="${API_PORT}" \
  FREE_TIER_DAILY_SMS_CAP=8 \
  FREE_TIER_MONTHLY_SMS_CAP=8 \
  BANDWIDTH_WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
  npm run start --prefix FreeLine-Backend >"${BACKEND_LOG}" 2>&1 &
  SERVER_PID=$!

  for _ in {1..30}; do
    if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
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

jsonl_field() {
  local file_path="$1"
  local script="$2"
  shift 2
  node -e '
    const fs = require("node:fs");
    const filePath = process.argv[1];
    const lines = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : [];
    '"${script}" \
    "${file_path}" "$@"
}

sign_payload() {
  local payload="$1"
  local secret="$2"
  node -e 'const crypto = require("node:crypto"); console.log(crypto.createHmac("sha256", process.argv[2]).update(process.argv[1]).digest("hex"));' "${payload}" "${secret}"
}

run_websocket_probe() {
  local access_token="$1"
  local phone_number="$2"
  local secret="$3"

  node - "${API_PORT}" "${access_token}" "${phone_number}" "${secret}" <<'NODE'
const [apiPort, accessToken, phoneNumber, secret] = process.argv.slice(2);
const crypto = require("node:crypto");
const WebSocket = require("./FreeLine-Backend/node_modules/ws");

const socket = new WebSocket(
  `ws://127.0.0.1:${apiPort}/v1/realtime/messages?accessToken=${encodeURIComponent(accessToken)}`
);
const inboundPayload = JSON.stringify({
  events: [
    {
      body: "Websocket probe",
      from: "+14155550315",
      to: phoneNumber
    }
  ]
});
let finished = false;
let inboundTriggered = false;

function finish(result) {
  if (finished) {
    return;
  }

  finished = true;
  clearTimeout(timeout);
  try {
    socket.close();
  } catch {
    // ignore close races during verification
  }
  console.log(JSON.stringify(result));
}

async function triggerInboundWebhook() {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(inboundPayload)
    .digest("hex");
  const response = await fetch(
    `http://127.0.0.1:${apiPort}/v1/webhooks/telecom/messages/inbound`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bandwidth-signature": signature
      },
      body: inboundPayload
    }
  );

  if (!response.ok) {
    finish({
      ok: false,
      reason: `webhook_failed_${response.status}`
    });
  }
}

const timeout = setTimeout(() => {
  finish({
    ok: false,
    reason: "timeout"
  });
}, 10_000);

socket.on("message", async (rawData) => {
  const payload = JSON.parse(rawData.toString());

  if (payload.type === "realtime:ready") {
    if (!inboundTriggered) {
      inboundTriggered = true;
      await triggerInboundWebhook();
    }
    return;
  }

  if (payload.type === "message:inbound" && payload.message?.body === "Websocket probe") {
    finish({
      body: payload.message?.body ?? "",
      ok: true,
      participantNumber: payload.conversation?.participantNumber ?? "",
      type: payload.type
    });
  }
});

socket.on("error", (error) => {
  finish({
    ok: false,
    reason: error instanceof Error ? error.message : "socket_error"
  });
});

socket.on("close", (code, reason) => {
  if (!finished) {
    finish({
      ok: false,
      reason: `closed_${code}_${reason.toString()}`
    });
  }
});
NODE
}

echo "========================================="
echo "Phase 2b-inbound-sms Verification"
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
  -d "{\"identityToken\":\"dev:phase2b-user-${RUN_ID}:phase2b-user-${RUN_ID}@freeline.dev:PhaseTwoBUser${RUN_ID}\",\"fingerprint\":\"phase2b-device-${RUN_ID}\",\"platform\":\"ios\"}")"
ACCESS_TOKEN="$(extract_json_field "${AUTH_RESPONSE}" 'console.log(data.tokens.accessToken ?? "");')"

if [ -n "${ACCESS_TOKEN}" ]; then
  RESULTS+=("PASS: Auth response returns access token")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Auth response returns access token")
  FAIL=$((FAIL + 1))
fi

SEARCH_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/numbers/search?areaCode=415")"
FIRST_NUMBER="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.phoneNumber ?? "");')"
FIRST_NATIONAL_FORMAT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.nationalFormat ?? "");')"
FIRST_LOCALITY="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.locality ?? "");')"
FIRST_REGION="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.region ?? "");')"

CLAIM_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/claim" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"areaCode\":\"415\",\"locality\":\"${FIRST_LOCALITY}\",\"nationalFormat\":\"${FIRST_NATIONAL_FORMAT}\",\"phoneNumber\":\"${FIRST_NUMBER}\",\"region\":\"${FIRST_REGION}\"}")"
CLAIMED_NUMBER="$(extract_json_field "${CLAIM_RESPONSE}" 'console.log(data.number?.phoneNumber ?? "");')"

if [ -n "${CLAIMED_NUMBER}" ]; then
  RESULTS+=("PASS: Claim provisions a sender number")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Claim provisions a sender number")
  FAIL=$((FAIL + 1))
fi

PUSH_TOKEN="phase2b-push-token-${RUN_ID}"
PUSH_REGISTER_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/devices/push-token" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"phase2b-device-${RUN_ID}\",\"platform\":\"ios\",\"token\":\"${PUSH_TOKEN}\"}")"
REGISTERED_PUSH_TOKEN="$(extract_json_field "${PUSH_REGISTER_RESPONSE}" 'console.log(data.pushToken?.token ?? "");')"

if [ "${REGISTERED_PUSH_TOKEN}" = "${PUSH_TOKEN}" ]; then
  RESULTS+=("PASS: Push token registration succeeds")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Push token registration succeeds")
  FAIL=$((FAIL + 1))
fi

OUTBOUND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550350","body":"Outbound status probe"}')"
OUTBOUND_PROVIDER_ID="$(extract_json_field "${OUTBOUND_RESPONSE}" 'console.log(data.message?.providerMessageId ?? "");')"
OUTBOUND_MESSAGE_ID="$(extract_json_field "${OUTBOUND_RESPONSE}" 'console.log(data.message?.id ?? "");')"

STATUS_PAYLOAD='{"events":[{"providerMessageId":"'"${OUTBOUND_PROVIDER_ID}"'","status":"delivered"}]}'
STATUS_SIGNATURE="$(sign_payload "${STATUS_PAYLOAD}" "${WEBHOOK_SECRET}")"
STATUS_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${STATUS_SIGNATURE}" \
  -d "${STATUS_PAYLOAD}")"
STATUS_UPDATED_COUNT="$(extract_json_field "${STATUS_RESPONSE}" 'console.log(data.updatedCount ?? 0);')"
STATUS_REALTIME_FOUND="$(jsonl_field "${REALTIME_LOG}" 'const messageId = process.argv[2]; console.log(lines.some((item) => item.messageId === messageId && item.type === "message:status") ? "yes" : "no");' "${OUTBOUND_MESSAGE_ID}")"

if [ "${STATUS_UPDATED_COUNT}" = "1" ] && [ "${STATUS_REALTIME_FOUND}" = "yes" ]; then
  RESULTS+=("PASS: Status webhook updates the message and emits realtime status")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Status webhook updates the message and emits realtime status")
  FAIL=$((FAIL + 1))
fi

INBOUND_PAYLOAD='{"events":[{"body":"Inbound hello","from":"+14155550311","to":"'"${CLAIMED_NUMBER}"'"}]}'
INBOUND_SIGNATURE="$(sign_payload "${INBOUND_PAYLOAD}" "${WEBHOOK_SECRET}")"
INBOUND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${INBOUND_SIGNATURE}" \
  -d "${INBOUND_PAYLOAD}")"
INBOUND_CREATED_COUNT="$(extract_json_field "${INBOUND_RESPONSE}" 'console.log(data.createdCount ?? 0);')"
INBOUND_DROPPED_COUNT="$(extract_json_field "${INBOUND_RESPONSE}" 'console.log(data.droppedCount ?? 0);')"
INBOUND_MESSAGE_ID="$(extract_json_field "${INBOUND_RESPONSE}" 'console.log(data.messages?.[0]?.id ?? "");')"

CONVERSATIONS_RESPONSE="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations")"
INBOUND_CONVERSATION_ID="$(extract_json_field "${CONVERSATIONS_RESPONSE}" 'console.log((data.conversations ?? []).find((item) => item.participantNumber === "+14155550311")?.id ?? "");')"
INBOUND_UNREAD_COUNT="$(extract_json_field "${CONVERSATIONS_RESPONSE}" 'console.log((data.conversations ?? []).find((item) => item.participantNumber === "+14155550311")?.unreadCount ?? -1);')"
INBOUND_ALLOWANCE_DAILY="$(extract_json_field "${CONVERSATIONS_RESPONSE}" 'console.log(data.allowance?.dailyUsed ?? -1);')"
INBOUND_ALLOWANCE_MONTHLY="$(extract_json_field "${CONVERSATIONS_RESPONSE}" 'console.log(data.allowance?.monthlyUsed ?? -1);')"
PUSH_EVENT_FOUND="$(jsonl_field "${PUSH_LOG}" 'const token = process.argv[2]; console.log(lines.some((item) => (item.tokens ?? []).some((entry) => entry.token === token) && item.participantNumber === "+14155550311") ? "yes" : "no");' "${PUSH_TOKEN}")"
INBOUND_REALTIME_FOUND="$(jsonl_field "${REALTIME_LOG}" 'const messageId = process.argv[2]; console.log(lines.some((item) => item.messageId === messageId && item.type === "message:inbound") ? "yes" : "no");' "${INBOUND_MESSAGE_ID}")"

if [ "${INBOUND_CREATED_COUNT}" = "1" ] && [ "${INBOUND_DROPPED_COUNT}" = "0" ] && [ "${INBOUND_UNREAD_COUNT}" = "1" ] && [ "${INBOUND_ALLOWANCE_DAILY}" = "2" ] && [ "${INBOUND_ALLOWANCE_MONTHLY}" = "2" ] && [ "${PUSH_EVENT_FOUND}" = "yes" ] && [ "${INBOUND_REALTIME_FOUND}" = "yes" ]; then
  RESULTS+=("PASS: Inbound webhook persists the message, increments unread, counts allowance, and emits notifications")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Inbound webhook persists the message, increments unread, counts allowance, and emits notifications")
  FAIL=$((FAIL + 1))
fi

THREAD_RESPONSE="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations/${INBOUND_CONVERSATION_ID}/messages")"
INBOUND_DIRECTION="$(extract_json_field "${THREAD_RESPONSE}" 'console.log(data.messages?.[0]?.direction ?? "");')"
INBOUND_BODY="$(extract_json_field "${THREAD_RESPONSE}" 'console.log(data.messages?.[0]?.body ?? "");')"

if [ "${INBOUND_DIRECTION}" = "inbound" ] && [ "${INBOUND_BODY}" = "Inbound hello" ]; then
  RESULTS+=("PASS: Inbound thread history is readable from the API")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Inbound thread history is readable from the API")
  FAIL=$((FAIL + 1))
fi

READ_RESPONSE="$(curl -fsS -X PATCH "http://127.0.0.1:${API_PORT}/v1/conversations/${INBOUND_CONVERSATION_ID}/read" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
READ_UNREAD_COUNT="$(extract_json_field "${READ_RESPONSE}" 'console.log(data.conversation?.unreadCount ?? -1);')"
POST_READ_CONVERSATIONS="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations")"
POST_READ_UNREAD_COUNT="$(extract_json_field "${POST_READ_CONVERSATIONS}" 'console.log((data.conversations ?? []).find((item) => item.participantNumber === "+14155550311")?.unreadCount ?? -1);')"

if [ "${READ_UNREAD_COUNT}" = "0" ] && [ "${POST_READ_UNREAD_COUNT}" = "0" ]; then
  RESULTS+=("PASS: Read endpoint resets unread count")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Read endpoint resets unread count")
  FAIL=$((FAIL + 1))
fi

STOP_PAYLOAD='{"events":[{"body":"STOP","from":"+14155550312","to":"'"${CLAIMED_NUMBER}"'"}]}'
STOP_SIGNATURE="$(sign_payload "${STOP_PAYLOAD}" "${WEBHOOK_SECRET}")"
STOP_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${STOP_SIGNATURE}" \
  -d "${STOP_PAYLOAD}")"
STOP_CREATED_COUNT="$(extract_json_field "${STOP_RESPONSE}" 'console.log(data.createdCount ?? 0);')"
STOP_CONVERSATIONS="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations")"
STOP_OPTED_OUT="$(extract_json_field "${STOP_CONVERSATIONS}" 'console.log((data.conversations ?? []).find((item) => item.participantNumber === "+14155550312")?.isOptedOut ?? false);')"
STOP_REPLY_FOUND="$(jsonl_field "${SMS_LOG}" 'console.log(lines.some((item) => item.to === "+14155550312" && item.body === "FreeLine: You have been opted out. Reply HELP for support.") ? "yes" : "no");')"
STOP_OUTBOUND_STATUS="$(curl -s -o /tmp/freeline_phase2b_stop_block.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550312","body":"Blocked after stop"}')"

if [ "${STOP_CREATED_COUNT}" = "1" ] && [ "${STOP_OPTED_OUT}" = "true" ] && [ "${STOP_REPLY_FOUND}" = "yes" ] && [ "${STOP_OUTBOUND_STATUS}" = "403" ]; then
  RESULTS+=("PASS: STOP opt-outs the conversation, emits the compliance reply, and blocks outbound messaging")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: STOP opt-outs the conversation, emits the compliance reply, and blocks outbound messaging")
  FAIL=$((FAIL + 1))
fi

HELP_PAYLOAD='{"events":[{"body":"help","from":"+14155550313","to":"'"${CLAIMED_NUMBER}"'"}]}'
HELP_SIGNATURE="$(sign_payload "${HELP_PAYLOAD}" "${WEBHOOK_SECRET}")"
HELP_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${HELP_SIGNATURE}" \
  -d "${HELP_PAYLOAD}")"
HELP_CREATED_COUNT="$(extract_json_field "${HELP_RESPONSE}" 'console.log(data.createdCount ?? 0);')"
HELP_REPLY_FOUND="$(jsonl_field "${SMS_LOG}" 'console.log(lines.some((item) => item.to === "+14155550313" && item.body === "FreeLine: Free calls & texts. Reply STOP to opt out. Support: support@freeline.dev") ? "yes" : "no");')"

if [ "${HELP_CREATED_COUNT}" = "1" ] && [ "${HELP_REPLY_FOUND}" = "yes" ]; then
  RESULTS+=("PASS: HELP emits the support auto-reply")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: HELP emits the support auto-reply")
  FAIL=$((FAIL + 1))
fi

BLOCK_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/blocks" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"blockedNumber":"+14155550314"}')"
BLOCKED_NUMBER="$(extract_json_field "${BLOCK_RESPONSE}" 'console.log(data.block?.blockedNumber ?? "");')"
BLOCKED_INBOUND_PAYLOAD='{"events":[{"body":"Blocked inbound","from":"+14155550314","to":"'"${CLAIMED_NUMBER}"'"}]}'
BLOCKED_INBOUND_SIGNATURE="$(sign_payload "${BLOCKED_INBOUND_PAYLOAD}" "${WEBHOOK_SECRET}")"
BLOCKED_INBOUND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${BLOCKED_INBOUND_SIGNATURE}" \
  -d "${BLOCKED_INBOUND_PAYLOAD}")"
BLOCKED_INBOUND_CREATED="$(extract_json_field "${BLOCKED_INBOUND_RESPONSE}" 'console.log(data.createdCount ?? 0);')"
BLOCKED_INBOUND_DROPPED="$(extract_json_field "${BLOCKED_INBOUND_RESPONSE}" 'console.log(data.droppedCount ?? 0);')"
REPORT_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/reports" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"reportedNumber":"+14155550314","reason":"spam"}')"
REPORT_REASON="$(extract_json_field "${REPORT_RESPONSE}" 'console.log(data.report?.reason ?? "");')"
UNBLOCK_STATUS="$(curl -s -o /tmp/freeline_phase2b_unblock.json -w "%{http_code}" -X DELETE "http://127.0.0.1:${API_PORT}/v1/blocks/%2B14155550314" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
UNBLOCKED_INBOUND_PAYLOAD='{"events":[{"body":"Allowed again","from":"+14155550314","to":"'"${CLAIMED_NUMBER}"'"}]}'
UNBLOCKED_INBOUND_SIGNATURE="$(sign_payload "${UNBLOCKED_INBOUND_PAYLOAD}" "${WEBHOOK_SECRET}")"
UNBLOCKED_INBOUND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${UNBLOCKED_INBOUND_SIGNATURE}" \
  -d "${UNBLOCKED_INBOUND_PAYLOAD}")"
UNBLOCKED_INBOUND_CREATED="$(extract_json_field "${UNBLOCKED_INBOUND_RESPONSE}" 'console.log(data.createdCount ?? 0);')"

if [ "${BLOCKED_NUMBER}" = "+14155550314" ] && [ "${BLOCKED_INBOUND_CREATED}" = "0" ] && [ "${BLOCKED_INBOUND_DROPPED}" = "1" ] && [ "${REPORT_REASON}" = "spam" ] && [ "${UNBLOCK_STATUS}" = "204" ] && [ "${UNBLOCKED_INBOUND_CREATED}" = "1" ]; then
  RESULTS+=("PASS: Block, report, and unblock flows behave correctly")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Block, report, and unblock flows behave correctly")
  FAIL=$((FAIL + 1))
fi

INVALID_INBOUND_STATUS="$(curl -s -o /tmp/freeline_phase2b_invalid_inbound.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/inbound" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: invalid-signature" \
  -d "${INBOUND_PAYLOAD}")"

if [ "${INVALID_INBOUND_STATUS}" = "401" ]; then
  RESULTS+=("PASS: Invalid inbound webhook signatures are rejected")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Invalid inbound webhook signatures are rejected")
  FAIL=$((FAIL + 1))
fi

WEBSOCKET_PROBE_RESULT="$(run_websocket_probe "${ACCESS_TOKEN}" "${CLAIMED_NUMBER}" "${WEBHOOK_SECRET}")"
WEBSOCKET_PROBE_OK="$(extract_json_field "${WEBSOCKET_PROBE_RESULT}" 'console.log(data.ok ? "yes" : "no");')"
WEBSOCKET_PROBE_TYPE="$(extract_json_field "${WEBSOCKET_PROBE_RESULT}" 'console.log(data.type ?? "");')"
WEBSOCKET_PROBE_BODY="$(extract_json_field "${WEBSOCKET_PROBE_RESULT}" 'console.log(data.body ?? "");')"
WEBSOCKET_PROBE_NUMBER="$(extract_json_field "${WEBSOCKET_PROBE_RESULT}" 'console.log(data.participantNumber ?? "");')"

if [ "${WEBSOCKET_PROBE_OK}" = "yes" ] && [ "${WEBSOCKET_PROBE_TYPE}" = "message:inbound" ] && [ "${WEBSOCKET_PROBE_BODY}" = "Websocket probe" ] && [ "${WEBSOCKET_PROBE_NUMBER}" = "+14155550315" ]; then
  RESULTS+=("PASS: Authenticated websocket delivers foreground inbound messages")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Authenticated websocket delivers foreground inbound messages")
  FAIL=$((FAIL + 1))
fi

check "iOS project regenerates cleanly" bash -lc "cd FreeLine-iOS && xcodegen generate"
check "iOS app builds successfully" xcodebuild -project FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6" build
check "Android app builds successfully" bash -lc "cd FreeLine-Android && ./gradlew assembleDebug"

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
