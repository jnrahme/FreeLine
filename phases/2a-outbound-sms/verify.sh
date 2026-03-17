#!/bin/bash
# Phase 2a-outbound-sms verification
# Run from repo root: bash phases/2a-outbound-sms/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3012
BACKEND_LOG="/tmp/freeline_phase2a_backend.log"
RUN_ID="$(date +%s)"
WEBHOOK_SECRET="phase2a-verify-secret"
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
    RESULTS+=("PASS: $name")
    PASS=$((PASS + 1))
  else
    RESULTS+=("FAIL: $name")
    FAIL=$((FAIL + 1))
  fi
}

start_backend() {
  API_PORT="${API_PORT}" \
  FREE_TIER_DAILY_SMS_CAP=3 \
  FREE_TIER_MONTHLY_SMS_CAP=3 \
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
echo "Phase 2a-outbound-sms Verification"
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
  -d "{\"identityToken\":\"dev:phase2a-user-${RUN_ID}:phase2a-user-${RUN_ID}@freeline.dev:PhaseTwoAUser${RUN_ID}\",\"fingerprint\":\"phase2a-device-${RUN_ID}\",\"platform\":\"ios\"}")"
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

SEND_ONE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550201","body":"First conversation"}')"
SEND_ONE_STATUS="$(extract_json_field "${SEND_ONE_RESPONSE}" 'console.log(data.message?.status ?? "");')"
SEND_ONE_PROVIDER_ID="$(extract_json_field "${SEND_ONE_RESPONSE}" 'console.log(data.message?.providerMessageId ?? "");')"
SEND_ONE_CONVERSATION_ID="$(extract_json_field "${SEND_ONE_RESPONSE}" 'console.log(data.conversation?.id ?? "");')"

if [ "${SEND_ONE_STATUS}" = "pending" ] && [ -n "${SEND_ONE_PROVIDER_ID}" ]; then
  RESULTS+=("PASS: First SMS send persists a pending message with provider id")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: First SMS send persists a pending message with provider id")
  FAIL=$((FAIL + 1))
fi

SEND_TWO_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550201","body":"Second message same thread"}')"

SEND_THREE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550202","body":"Different thread"}')"
SEND_THREE_ALLOWANCE="$(extract_json_field "${SEND_THREE_RESPONSE}" 'console.log(data.allowance?.dailyRemaining ?? -1);')"

if [ "${SEND_THREE_ALLOWANCE}" = "0" ]; then
  RESULTS+=("PASS: Allowance is returned after sends")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Allowance is returned after sends")
  FAIL=$((FAIL + 1))
fi

CONVERSATIONS_RESPONSE="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations")"
CONVERSATION_ORDER="$(extract_json_field "${CONVERSATIONS_RESPONSE}" 'console.log((data.conversations ?? []).map((item) => item.participantNumber).join(","));')"

if [ "${CONVERSATION_ORDER}" = "+14155550202,+14155550201" ]; then
  RESULTS+=("PASS: Conversations are sorted by most recent message")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Conversations are sorted by most recent message")
  FAIL=$((FAIL + 1))
fi

THREAD_PAGE_ONE="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations/${SEND_ONE_CONVERSATION_ID}/messages?limit=1&offset=0")"
THREAD_PAGE_TWO="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations/${SEND_ONE_CONVERSATION_ID}/messages?limit=1&offset=1")"
THREAD_PAGE_ONE_BODY="$(extract_json_field "${THREAD_PAGE_ONE}" 'console.log(data.messages?.[0]?.body ?? "");')"
THREAD_PAGE_TWO_BODY="$(extract_json_field "${THREAD_PAGE_TWO}" 'console.log(data.messages?.[0]?.body ?? "");')"

if [ "${THREAD_PAGE_ONE_BODY}" = "First conversation" ] && [ "${THREAD_PAGE_TWO_BODY}" = "Second message same thread" ]; then
  RESULTS+=("PASS: Thread messages paginate oldest first")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Thread messages paginate oldest first")
  FAIL=$((FAIL + 1))
fi

WEBHOOK_SENT_PAYLOAD='{"events":[{"providerMessageId":"'"${SEND_ONE_PROVIDER_ID}"'","status":"sent"}]}'
WEBHOOK_SENT_SIGNATURE="$(sign_payload "${WEBHOOK_SENT_PAYLOAD}" "${WEBHOOK_SECRET}")"
WEBHOOK_SENT_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${WEBHOOK_SENT_SIGNATURE}" \
  -d "${WEBHOOK_SENT_PAYLOAD}")"
WEBHOOK_SENT_UPDATED_COUNT="$(extract_json_field "${WEBHOOK_SENT_RESPONSE}" 'console.log(data.updatedCount ?? 0);')"
THREAD_AFTER_SENT_WEBHOOK="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations/${SEND_ONE_CONVERSATION_ID}/messages?limit=1&offset=0")"
THREAD_AFTER_SENT_STATUS="$(extract_json_field "${THREAD_AFTER_SENT_WEBHOOK}" 'console.log(data.messages?.[0]?.status ?? "");')"

WEBHOOK_DELIVERED_PAYLOAD='{"events":[{"providerMessageId":"'"${SEND_ONE_PROVIDER_ID}"'","status":"delivered"}]}'
WEBHOOK_DELIVERED_SIGNATURE="$(sign_payload "${WEBHOOK_DELIVERED_PAYLOAD}" "${WEBHOOK_SECRET}")"
WEBHOOK_DELIVERED_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: ${WEBHOOK_DELIVERED_SIGNATURE}" \
  -d "${WEBHOOK_DELIVERED_PAYLOAD}")"
WEBHOOK_DELIVERED_UPDATED_COUNT="$(extract_json_field "${WEBHOOK_DELIVERED_RESPONSE}" 'console.log(data.updatedCount ?? 0);')"
THREAD_AFTER_WEBHOOK="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/conversations/${SEND_ONE_CONVERSATION_ID}/messages?limit=1&offset=0")"
THREAD_AFTER_WEBHOOK_STATUS="$(extract_json_field "${THREAD_AFTER_WEBHOOK}" 'console.log(data.messages?.[0]?.status ?? "");')"

if [ "${WEBHOOK_SENT_UPDATED_COUNT}" = "1" ] && [ "${THREAD_AFTER_SENT_STATUS}" = "sent" ] && [ "${WEBHOOK_DELIVERED_UPDATED_COUNT}" = "1" ] && [ "${THREAD_AFTER_WEBHOOK_STATUS}" = "delivered" ]; then
  RESULTS+=("PASS: Delivery webhooks update message status from sent to delivered")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Delivery webhooks update message status from sent to delivered")
  FAIL=$((FAIL + 1))
fi

INVALID_WEBHOOK_STATUS="$(curl -s -o /tmp/freeline_phase2a_invalid_webhook.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/webhooks/telecom/messages/status" \
  -H "Content-Type: application/json" \
  -H "x-bandwidth-signature: invalid-signature" \
  -d "${WEBHOOK_DELIVERED_PAYLOAD}")"

if [ "${INVALID_WEBHOOK_STATUS}" = "401" ]; then
  RESULTS+=("PASS: Invalid webhook signatures are rejected")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Invalid webhook signatures are rejected")
  FAIL=$((FAIL + 1))
fi

BLOCKED_SEND_STATUS="$(curl -s -o /tmp/freeline_phase2a_cap.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550203","body":"Cap blocker"}')"
BLOCKED_SEND_MESSAGE="$(cat /tmp/freeline_phase2a_cap.json | node -e 'const fs = require("node:fs"); const raw = fs.readFileSync(0, "utf8"); const data = JSON.parse(raw); console.log(data.error?.message ?? "");')"

if [ "${BLOCKED_SEND_STATUS}" = "429" ] && [ "${BLOCKED_SEND_MESSAGE}" = "Free tier limit reached. Watch an ad or upgrade." ]; then
  RESULTS+=("PASS: Usage cap returns 429 with upgrade prompt")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Usage cap returns 429 with upgrade prompt")
  FAIL=$((FAIL + 1))
fi

check "iOS project regenerates cleanly" bash -lc "cd FreeLine-iOS && xcodegen generate"
check "iOS app builds successfully" xcodebuild -project FreeLine-iOS/FreeLine.xcodeproj -scheme FreeLine -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6" build
check "Android app builds successfully" bash -lc "cd FreeLine-Android && ./gradlew assembleDebug"

echo ""
echo "========================================="
echo "Results"
echo "========================================="
for r in "${RESULTS[@]}"; do
  echo "  ${r}"
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
