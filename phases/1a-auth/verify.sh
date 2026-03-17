#!/bin/bash
# Phase 1a-auth verification
# Run from repo root: bash phases/1a-auth/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3010
BACKEND_LOG="/tmp/freeline_phase1a_backend.log"
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
  node -e "const data = JSON.parse(process.argv[1]); ${script}" "${json}"
}

echo "========================================="
echo "Phase 1a-auth Verification"
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
check "Health endpoint returns 200" curl -fsS "http://127.0.0.1:${API_PORT}/health"

EMAIL_START_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/auth/email/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"phase1a@example.com","password":"supersecure123"}')"
EMAIL_TOKEN="$(extract_json_field "${EMAIL_START_RESPONSE}" 'const url = new URL(data.previewLink); console.log(url.searchParams.get("token") ?? "");')"

if [ -n "${EMAIL_TOKEN}" ]; then
  RESULTS+=("PASS: Email start returns preview token")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Email start returns preview token")
  FAIL=$((FAIL + 1))
fi

EMAIL_VERIFY_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/auth/email/verify" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${EMAIL_TOKEN}\",\"fingerprint\":\"phase1a-email-device\",\"platform\":\"ios\"}")"
EMAIL_ACCESS_TOKEN="$(extract_json_field "${EMAIL_VERIFY_RESPONSE}" 'console.log(data.tokens.accessToken ?? "");')"

if [ -n "${EMAIL_ACCESS_TOKEN}" ]; then
  RESULTS+=("PASS: Email verification returns access token")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Email verification returns access token")
  FAIL=$((FAIL + 1))
fi

check "Protected route accepts valid bearer token" \
  curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/devices/register" \
    -H "Authorization: Bearer ${EMAIL_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"fingerprint":"phase1a-email-device","platform":"ios"}'

APPLE_OAUTH_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/apple" \
  -H "Content-Type: application/json" \
  -d '{"identityToken":"dev:phase1a-apple:phase1a-apple@freeline.dev:PhaseOneApple","fingerprint":"phase1a-apple-device","platform":"ios"}')"
APPLE_USER_EMAIL="$(extract_json_field "${APPLE_OAUTH_RESPONSE}" 'console.log(data.user.email ?? "");')"

if [ -n "${APPLE_USER_EMAIL}" ]; then
  RESULTS+=("PASS: Apple OAuth endpoint returns a user")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Apple OAuth endpoint returns a user")
  FAIL=$((FAIL + 1))
fi

GOOGLE_OAUTH_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/google" \
  -H "Content-Type: application/json" \
  -d '{"identityToken":"dev:phase1a-google:phase1a-google@freeline.dev:PhaseOneGoogle","fingerprint":"phase1a-google-device","platform":"android"}')"
GOOGLE_USER_EMAIL="$(extract_json_field "${GOOGLE_OAUTH_RESPONSE}" 'console.log(data.user.email ?? "");')"

if [ -n "${GOOGLE_USER_EMAIL}" ]; then
  RESULTS+=("PASS: Google OAuth endpoint returns a user")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Google OAuth endpoint returns a user")
  FAIL=$((FAIL + 1))
fi

DEVICE_LIMIT_ONE="$(curl -s -o /tmp/freeline_phase1a_device_limit_one.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/apple" \
  -H "Content-Type: application/json" \
  -d '{"identityToken":"dev:phase1a-limit-one:phase1a-limit-one@freeline.dev:PhaseOneLimitOne","fingerprint":"phase1a-shared-device","platform":"ios"}')"
DEVICE_LIMIT_TWO="$(curl -s -o /tmp/freeline_phase1a_device_limit_two.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/google" \
  -H "Content-Type: application/json" \
  -d '{"identityToken":"dev:phase1a-limit-two:phase1a-limit-two@freeline.dev:PhaseOneLimitTwo","fingerprint":"phase1a-shared-device","platform":"android"}')"
DEVICE_LIMIT_THREE="$(curl -s -o /tmp/freeline_phase1a_device_limit_three.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/apple" \
  -H "Content-Type: application/json" \
  -d '{"identityToken":"dev:phase1a-limit-three:phase1a-limit-three@freeline.dev:PhaseOneLimitThree","fingerprint":"phase1a-shared-device","platform":"ios"}')"

if [ "${DEVICE_LIMIT_ONE}" = "200" ] && [ "${DEVICE_LIMIT_TWO}" = "200" ] && [ "${DEVICE_LIMIT_THREE}" = "403" ]; then
  RESULTS+=("PASS: Third account from shared device is rejected")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Third account from shared device is rejected")
  FAIL=$((FAIL + 1))
fi

UNAUTH_STATUS="$(curl -s -o /tmp/freeline_phase1a_unauth.json -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/devices/register" \
  -H "Content-Type: application/json" \
  -d '{"fingerprint":"phase1a-unauth","platform":"ios"}')"

if [ "${UNAUTH_STATUS}" = "401" ]; then
  RESULTS+=("PASS: Protected route rejects missing token")
  PASS=$((PASS + 1))
else
  RESULTS+=("FAIL: Protected route rejects missing token")
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
