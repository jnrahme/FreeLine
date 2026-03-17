#!/bin/bash
# Phase 1b-number-claim verification
# Run from repo root: bash phases/1b-number-claim/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3011
BACKEND_LOG="/tmp/freeline_phase1b_backend.log"
RUN_ID="$(date +%s)"
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
  API_PORT="${API_PORT}" npm run start --prefix FreeLine-Backend >"${BACKEND_LOG}" 2>&1 &
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

echo "========================================="
echo "Phase 1b-number-claim Verification"
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
  -d "{\"identityToken\":\"dev:phase1b-user-${RUN_ID}:phase1b-user-${RUN_ID}@freeline.dev:PhaseOneBUser${RUN_ID}\",\"fingerprint\":\"phase1b-device-${RUN_ID}\",\"platform\":\"ios\"}")"
ACCESS_TOKEN="$(extract_json_field "${AUTH_RESPONSE}" 'console.log(data.tokens.accessToken ?? "");')"

if [ -n "${ACCESS_TOKEN}" ]; then
  RESULTS+=("PASS: Auth response returns access token")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Auth response returns access token")
  FAIL=$((FAIL + 1))
fi

SEARCH_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/numbers/search?areaCode=415")"
SEARCH_COUNT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(Array.isArray(data.numbers) ? data.numbers.length : 0);')"
FIRST_NUMBER="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.phoneNumber ?? "");')"
FIRST_NATIONAL_FORMAT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.nationalFormat ?? "");')"
FIRST_LOCALITY="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.locality ?? "");')"
FIRST_REGION="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[0]?.region ?? "");')"

if [ "${SEARCH_COUNT}" -gt 0 ] && [ -n "${FIRST_NUMBER}" ]; then
  RESULTS+=("PASS: Number search returns available numbers")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Number search returns available numbers")
  FAIL=$((FAIL + 1))
fi

CLAIM_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/claim" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"areaCode\":\"415\",\"locality\":\"${FIRST_LOCALITY}\",\"nationalFormat\":\"${FIRST_NATIONAL_FORMAT}\",\"phoneNumber\":\"${FIRST_NUMBER}\",\"region\":\"${FIRST_REGION}\"}")"
CLAIMED_NUMBER="$(extract_json_field "${CLAIM_RESPONSE}" 'console.log(data.number?.phoneNumber ?? "");')"

if [ -n "${CLAIMED_NUMBER}" ]; then
  RESULTS+=("PASS: Claim provisions and stores a number")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Claim provisions and stores a number")
  FAIL=$((FAIL + 1))
fi

SECOND_CLAIM_STATUS="$(curl -s -o /tmp/freeline_phase1b_second_claim.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/claim" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"areaCode":"415","locality":"San Francisco","nationalFormat":"(415) 555-0102","phoneNumber":"+14155550102","region":"CA"}')"

if [ "${SECOND_CLAIM_STATUS}" = "409" ]; then
  RESULTS+=("PASS: Second claim by same user returns 409")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Second claim by same user returns 409")
  FAIL=$((FAIL + 1))
fi

ME_RESPONSE="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "http://127.0.0.1:${API_PORT}/v1/numbers/me")"
ME_NUMBER="$(extract_json_field "${ME_RESPONSE}" 'console.log(data.number?.phoneNumber ?? "");')"

if [ "${ME_NUMBER}" = "${CLAIMED_NUMBER}" ]; then
  RESULTS+=("PASS: Current number endpoint returns assigned number")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Current number endpoint returns assigned number")
  FAIL=$((FAIL + 1))
fi

RELEASE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/release" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
RELEASE_STATUS="$(extract_json_field "${RELEASE_RESPONSE}" 'console.log(data.number?.status ?? "");')"

if [ "${RELEASE_STATUS}" = "quarantined" ]; then
  RESULTS+=("PASS: Release endpoint quarantines the number")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Release endpoint quarantines the number")
  FAIL=$((FAIL + 1))
fi

SEARCH_AFTER_RELEASE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/numbers/search?areaCode=415")"
SEARCH_AFTER_RELEASE_HAS_NUMBER="$(extract_json_field "${SEARCH_AFTER_RELEASE}" "console.log(data.numbers?.some((item) => item.phoneNumber === process.argv[2]) ? 'yes' : 'no');" "${CLAIMED_NUMBER}")"

if [ "${SEARCH_AFTER_RELEASE_HAS_NUMBER}" = "no" ]; then
  RESULTS+=("PASS: Released number is filtered from search while quarantined")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Released number is filtered from search while quarantined")
  FAIL=$((FAIL + 1))
fi

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
