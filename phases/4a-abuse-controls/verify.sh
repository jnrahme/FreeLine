#!/bin/bash
# Phase 4a-abuse-controls verification
# Run from repo root: bash phases/4a-abuse-controls/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3016
BACKEND_LOG="/tmp/freeline_phase4a_backend.log"
RUN_ID="$(date +%s)"
AREA_CODE="$(printf '%03d' $((300 + RUN_ID % 600)))"
MAIN_FINGERPRINT="phase4a-main-device-${RUN_ID}"
CALL_FINGERPRINT="phase4a-call-device-${RUN_ID}"
TARGET_FINGERPRINT="phase4a-target-device-${RUN_ID}"
REPORTER_FINGERPRINT="phase4a-reporter-device-${RUN_ID}"
SPAM_FINGERPRINT="phase4a-spam-device-${RUN_ID}"
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
  if [ "${actual}" = "${expected}" ]; then
    record_pass "${name}"
  else
    record_fail "${name}"
  fi
}

check_contains() {
  local name="$1"
  local haystack="$2"
  local needle="$3"
  if [[ "${haystack}" == *"${needle}"* ]]; then
    record_pass "${name}"
  else
    record_fail "${name}"
  fi
}

extract_json_field() {
  local json="$1"
  local script="$2"
  shift 2
  node -e "const data = JSON.parse(process.argv[1]); ${script}" "${json}" "$@"
}

db_scalar() {
  local sql="$1"
  shift
  (cd "${ROOT_DIR}" && node - "${sql}" "$@" <<'NODE'
const { Pool } = require("./FreeLine-Backend/node_modules/pg");

const [sql, ...params] = process.argv.slice(2);

(async () => {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || "freeline",
    password: process.env.POSTGRES_PASSWORD || "freeline",
    database: process.env.POSTGRES_DB || "freeline"
  });

  try {
    const result = await pool.query(sql, params);
    if (!result.rows.length) {
      process.stdout.write("");
      return;
    }

    const row = result.rows[0];
    const firstKey = Object.keys(row)[0];
    process.stdout.write(String(row[firstKey] ?? ""));
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
)
}

start_backend() {
  API_PORT="${API_PORT}" \
  PUBLIC_BASE_URL="http://127.0.0.1:${API_PORT}" \
  TELEPHONY_PROVIDER="bandwidth" \
  FREE_TIER_MONTHLY_SMS_CAP=1 \
  FREE_TIER_MONTHLY_CALL_MINUTES_CAP=1 \
  FREE_TIER_DAILY_SMS_CAP=10 \
  FREE_TIER_DAILY_CALL_MINUTES_CAP=10 \
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

oauth_user() {
  local provider="$1"
  local fingerprint="$2"
  local identity_token="$3"
  curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/${provider}" \
    -H "Content-Type: application/json" \
    -d "{\"fingerprint\":\"${fingerprint}\",\"identityToken\":\"${identity_token}\",\"platform\":\"ios\"}"
}

claim_number() {
  local access_token="$1"
  local number_index="$2"
  local phone_number locality national_format region
  phone_number="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[Number(process.argv[2])]?.phoneNumber ?? "");' "${number_index}")"
  locality="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[Number(process.argv[2])]?.locality ?? "");' "${number_index}")"
  national_format="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[Number(process.argv[2])]?.nationalFormat ?? "");' "${number_index}")"
  region="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[Number(process.argv[2])]?.region ?? "");' "${number_index}")"

  curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/claim" \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d "{\"areaCode\":\"${AREA_CODE}\",\"locality\":\"${locality}\",\"nationalFormat\":\"${national_format}\",\"phoneNumber\":\"${phone_number}\",\"region\":\"${region}\"}"
}

echo "========================================="
echo "Phase 4a-abuse-controls Verification"
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

SEARCH_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/numbers/search?areaCode=${AREA_CODE}")"
SEARCH_COUNT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.length ?? 0);')"
check_equals "Search returns enough claimable dev numbers" "${SEARCH_COUNT}" "10"

MAIN_AUTH="$(oauth_user "apple" "${MAIN_FINGERPRINT}" "dev:phase4a-main-${RUN_ID}:phase4a-main-${RUN_ID}@freeline.dev:Phase4AMain${RUN_ID}")"
MAIN_ACCESS_TOKEN="$(extract_json_field "${MAIN_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
MAIN_USER_ID="$(extract_json_field "${MAIN_AUTH}" 'console.log(data.user?.id ?? "");')"
MAIN_CLAIM="$(claim_number "${MAIN_ACCESS_TOKEN}" "0")"
MAIN_NUMBER="$(extract_json_field "${MAIN_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"
check_contains "Main user auth returns an access token" "${MAIN_ACCESS_TOKEN}" "."
check_contains "Main user can claim a number" "${MAIN_NUMBER}" "+1"

REWARD_STATUS_INITIAL="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/rewards/status" \
  -H "Authorization: Bearer ${MAIN_ACCESS_TOKEN}")"
INITIAL_SMS_CAP="$(extract_json_field "${REWARD_STATUS_INITIAL}" 'console.log(data.messages?.monthlyCap ?? 0);')"
check_equals "Initial reward status reflects low-cap beta allowance" "${INITIAL_SMS_CAP}" "1"

for claim_index in 1 2 3 4; do
  CLAIM_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/rewards/claim" \
    -H "Authorization: Bearer ${MAIN_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"rewardType":"text_events"}')"
done

FINAL_TEXT_CAP="$(extract_json_field "${CLAIM_RESPONSE}" 'console.log(data.messages?.monthlyCap ?? 0);')"
FINAL_TEXT_REMAINING_CLAIMS="$(extract_json_field "${CLAIM_RESPONSE}" 'console.log(data.claimedReward?.remainingClaims ?? 0);')"
FINAL_TEXT_TOTAL_CLAIMS="$(extract_json_field "${CLAIM_RESPONSE}" 'console.log(data.claimedReward?.totalClaims ?? 0);')"
if [ "${FINAL_TEXT_CAP}" -gt "${INITIAL_SMS_CAP}" ] && [ "${FINAL_TEXT_REMAINING_CLAIMS}" = "0" ] && [ "${FINAL_TEXT_TOTAL_CLAIMS}" = "4" ]; then
  record_pass "Four rewarded text claims expand allowance and exhaust monthly unlocks"
else
  record_fail "Four rewarded text claims expand allowance and exhaust monthly unlocks"
fi

TEXT_CLAIM_FIFTH_BODY="$(mktemp)"
TEXT_CLAIM_FIFTH_STATUS="$(curl -sS -o "${TEXT_CLAIM_FIFTH_BODY}" -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/rewards/claim" \
  -H "Authorization: Bearer ${MAIN_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rewardType":"text_events"}')"
TEXT_CLAIM_FIFTH_JSON="$(cat "${TEXT_CLAIM_FIFTH_BODY}")"
rm -f "${TEXT_CLAIM_FIFTH_BODY}"
check_equals "Fifth rewarded text claim is denied" "${TEXT_CLAIM_FIFTH_STATUS}" "409"
check_contains "Fifth rewarded text claim returns the correct error code" "${TEXT_CLAIM_FIFTH_JSON}" "reward_claim_limit_reached"

CALL_AUTH="$(oauth_user "apple" "${CALL_FINGERPRINT}" "dev:phase4a-call-${RUN_ID}:phase4a-call-${RUN_ID}@freeline.dev:Phase4ACall${RUN_ID}")"
CALL_ACCESS_TOKEN="$(extract_json_field "${CALL_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
CALL_CLAIM="$(claim_number "${CALL_ACCESS_TOKEN}" "1")"
CALL_NUMBER="$(extract_json_field "${CALL_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"
check_contains "Call reward user can claim a number" "${CALL_NUMBER}" "+1"

CALL_REWARD_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/rewards/claim" \
  -H "Authorization: Bearer ${CALL_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rewardType":"call_minutes"}')"
CALL_CAP_AFTER_REWARD="$(extract_json_field "${CALL_REWARD_RESPONSE}" 'console.log(data.calls?.monthlyCapMinutes ?? 0);')"
CALL_REWARD_GRANTED="$(extract_json_field "${CALL_REWARD_RESPONSE}" 'console.log(data.claimedReward?.callMinutesGranted ?? 0);')"
if [ "${CALL_CAP_AFTER_REWARD}" -gt "1" ] && [ "${CALL_REWARD_GRANTED}" = "5" ]; then
  record_pass "Call-minute rewards expand the outbound calling allowance"
else
  record_fail "Call-minute rewards expand the outbound calling allowance"
fi

CALL_TOKEN_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/calls/token" \
  -H "Authorization: Bearer ${CALL_ACCESS_TOKEN}")"
CALL_TOKEN_VALUE="$(extract_json_field "${CALL_TOKEN_RESPONSE}" 'console.log(data.token ?? "");')"
check_contains "Call reward user can still issue a voice token after the unlock" "${CALL_TOKEN_VALUE}" "token"

FIRST_MESSAGE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${CALL_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"body":"Allowed message","to":"+14155550991"}')"
FIRST_MESSAGE_STATUS="$(extract_json_field "${FIRST_MESSAGE_RESPONSE}" 'console.log(data.message?.status ?? "");')"
check_contains "First outbound message succeeds before the monthly cap is hit" "${FIRST_MESSAGE_STATUS}" "pending"

LIMIT_BODY_FILE="$(mktemp)"
LIMIT_STATUS="$(curl -sS -o "${LIMIT_BODY_FILE}" -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${CALL_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"body":"Blocked message","to":"+14155550992"}')"
LIMIT_JSON="$(cat "${LIMIT_BODY_FILE}")"
rm -f "${LIMIT_BODY_FILE}"
LIMIT_BUCKET="$(extract_json_field "${LIMIT_JSON}" 'console.log(data.error?.details?.bucket ?? "");')"
LIMIT_RETRY_AFTER="$(extract_json_field "${LIMIT_JSON}" 'console.log(data.error?.details?.retryAfterSeconds ?? 0);')"
LIMIT_UPGRADE_PROMPT="$(extract_json_field "${LIMIT_JSON}" 'console.log(data.error?.details?.upgradePrompt ?? "");')"
check_equals "Second outbound message is rate limited" "${LIMIT_STATUS}" "429"
check_equals "429 response reports the monthly SMS bucket" "${LIMIT_BUCKET}" "sms_monthly"
if [ "${LIMIT_RETRY_AFTER}" -gt "0" ]; then
  record_pass "429 response includes a positive retry interval"
else
  record_fail "429 response includes a positive retry interval"
fi
check_contains "429 response includes the upgrade prompt" "${LIMIT_UPGRADE_PROMPT}" "Watch a rewarded ad"

TARGET_AUTH="$(oauth_user "apple" "${TARGET_FINGERPRINT}" "dev:phase4a-target-${RUN_ID}:phase4a-target-${RUN_ID}@freeline.dev:Phase4ATarget${RUN_ID}")"
TARGET_ACCESS_TOKEN="$(extract_json_field "${TARGET_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
TARGET_USER_ID="$(extract_json_field "${TARGET_AUTH}" 'console.log(data.user?.id ?? "");')"
TARGET_CLAIM="$(claim_number "${TARGET_ACCESS_TOKEN}" "2")"
TARGET_NUMBER="$(extract_json_field "${TARGET_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"

REPORTER_AUTH="$(oauth_user "apple" "${REPORTER_FINGERPRINT}" "dev:phase4a-reporter-${RUN_ID}:phase4a-reporter-${RUN_ID}@freeline.dev:Phase4AReporter${RUN_ID}")"
REPORTER_ACCESS_TOKEN="$(extract_json_field "${REPORTER_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
REPORTER_CLAIM="$(claim_number "${REPORTER_ACCESS_TOKEN}" "3")"
REPORTER_NUMBER="$(extract_json_field "${REPORTER_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"
check_contains "Reporter can claim a second line" "${REPORTER_NUMBER}" "+1"

for report_index in 1 2; do
  REPORT_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/reports" \
    -H "Authorization: Bearer ${REPORTER_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"reason\":\"spam-${report_index}\",\"reportedNumber\":\"${TARGET_NUMBER}\"}")"
  REPORT_REASON="$(extract_json_field "${REPORT_RESPONSE}" 'console.log(data.report?.reason ?? "");')"
  check_contains "Spam report ${report_index} is accepted" "${REPORT_REASON}" "spam-"
done

BLOCK_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/blocks" \
  -H "Authorization: Bearer ${REPORTER_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"blockedNumber\":\"${TARGET_NUMBER}\"}")"
BLOCKED_NUMBER="$(extract_json_field "${BLOCK_RESPONSE}" 'console.log(data.block?.blockedNumber ?? "");')"
check_equals "Reporter can block the target FreeLine number" "${BLOCKED_NUMBER}" "${TARGET_NUMBER}"

TARGET_TRUST_SCORE="$(db_scalar "select trust_score from users where id = \$1" "${TARGET_USER_ID}")"
TARGET_STATUS="$(db_scalar "select status from users where id = \$1" "${TARGET_USER_ID}")"
TARGET_REPORT_EVENTS="$(db_scalar "select count(*) from abuse_events where user_id = \$1 and event_type = 'report'" "${TARGET_USER_ID}")"
TARGET_BLOCK_EVENTS="$(db_scalar "select count(*) from abuse_events where user_id = \$1 and event_type = 'block'" "${TARGET_USER_ID}")"
TARGET_SUSPENSIONS="$(db_scalar "select count(*) from abuse_events where user_id = \$1 and event_type = 'suspension'" "${TARGET_USER_ID}")"
TARGET_DEVICE_BLOCKED="$(db_scalar "select count(*) from device_accounts where user_id = \$1 and blocked_at is not null" "${TARGET_USER_ID}")"
check_equals "Report events are logged for the target account" "${TARGET_REPORT_EVENTS}" "2"
check_equals "Block events are logged for the target account" "${TARGET_BLOCK_EVENTS}" "1"
check_equals "Target trust score falls below suspension threshold" "${TARGET_TRUST_SCORE}" "10"
check_equals "Target account is suspended once trust score drops below 20" "${TARGET_STATUS}" "suspended"
if [ "${TARGET_SUSPENSIONS}" -ge "1" ] && [ "${TARGET_DEVICE_BLOCKED}" -ge "1" ]; then
  record_pass "Target suspension logs abuse events and blocks its device fingerprint"
else
  record_fail "Target suspension logs abuse events and blocks its device fingerprint"
fi

BLOCKED_DEVICE_BODY="$(mktemp)"
BLOCKED_DEVICE_STATUS="$(curl -sS -o "${BLOCKED_DEVICE_BODY}" -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/auth/oauth/google" \
  -H "Content-Type: application/json" \
  -d "{\"fingerprint\":\"${TARGET_FINGERPRINT}\",\"identityToken\":\"dev:phase4a-blocked-${RUN_ID}:phase4a-blocked-${RUN_ID}@freeline.dev:Phase4ABlocked${RUN_ID}\",\"platform\":\"ios\"}")"
BLOCKED_DEVICE_JSON="$(cat "${BLOCKED_DEVICE_BODY}")"
rm -f "${BLOCKED_DEVICE_BODY}"
check_equals "A suspended device fingerprint cannot create a new account" "${BLOCKED_DEVICE_STATUS}" "403"
check_contains "Blocked-device auth uses the structured app error" "${BLOCKED_DEVICE_JSON}" "device_abuse_blocked"

SPAM_AUTH="$(oauth_user "apple" "${SPAM_FINGERPRINT}" "dev:phase4a-spam-${RUN_ID}:phase4a-spam-${RUN_ID}@freeline.dev:Phase4ASpam${RUN_ID}")"
SPAM_ACCESS_TOKEN="$(extract_json_field "${SPAM_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
SPAM_USER_ID="$(extract_json_field "${SPAM_AUTH}" 'console.log(data.user?.id ?? "");')"
SPAM_CLAIM="$(claim_number "${SPAM_ACCESS_TOKEN}" "4")"
SPAM_NUMBER="$(extract_json_field "${SPAM_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"
check_contains "Spam test user can claim a line" "${SPAM_NUMBER}" "+1"

for spam_index in 1 2 3 4; do
  SPAM_BODY_FILE="$(mktemp)"
  SPAM_STATUS="$(curl -sS -o "${SPAM_BODY_FILE}" -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
    -H "Authorization: Bearer ${SPAM_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"body\":\"Visit https://spam.example/${spam_index}\",\"to\":\"+14155550$(printf '%03d' $((700 + spam_index)))\"}")"
  SPAM_JSON="$(cat "${SPAM_BODY_FILE}")"
  rm -f "${SPAM_BODY_FILE}"
  check_equals "Spam flag ${spam_index} returns a 403" "${SPAM_STATUS}" "403"
  check_contains "Spam flag ${spam_index} includes heuristic details" "${SPAM_JSON}" "message_flagged_for_review"
done

SPAM_FINAL_BODY="$(mktemp)"
SPAM_FINAL_STATUS="$(curl -sS -o "${SPAM_FINAL_BODY}" -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${SPAM_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"body":"Visit https://spam.example/final","to":"+14155550799"}')"
SPAM_FINAL_JSON="$(cat "${SPAM_FINAL_BODY}")"
rm -f "${SPAM_FINAL_BODY}"
SPAM_FLAG_COUNT="$(db_scalar "select count(*) from abuse_events where user_id = \$1 and event_type = 'spam_flag'" "${SPAM_USER_ID}")"
SPAM_SUSPENSIONS="$(db_scalar "select count(*) from abuse_events where user_id = \$1 and event_type = 'suspension'" "${SPAM_USER_ID}")"
SPAM_STATUS_DB="$(db_scalar "select status from users where id = \$1" "${SPAM_USER_ID}")"
check_equals "Fifth spam flag suspends the user instead of returning another review error" "${SPAM_FINAL_STATUS}" "403"
check_contains "Fifth spam flag surfaces the suspension error" "${SPAM_FINAL_JSON}" "account_suspended"
check_equals "Five spam flags are logged in abuse_events" "${SPAM_FLAG_COUNT}" "5"
check_equals "Spam heuristic suspension is persisted to the users table" "${SPAM_STATUS_DB}" "suspended"
if [ "${SPAM_SUSPENSIONS}" -ge "1" ]; then
  record_pass "Spam auto-suspension logs a suspension abuse event"
else
  record_fail "Spam auto-suspension logs a suspension abuse event"
fi

REWARD_CLAIMS_COUNT="$(db_scalar "select count(*) from reward_claims where user_id in (\$1, \$2)" "${MAIN_USER_ID}" "$(extract_json_field "${CALL_AUTH}" 'console.log(data.user?.id ?? "");')")"
RATE_LIMIT_BUCKETS_COUNT="$(db_scalar "select count(*) from rate_limit_buckets where bucket_key in ('sms_monthly', 'call_minutes_monthly', 'sms_global_per_second')" )"
if [ "${REWARD_CLAIMS_COUNT}" -ge "5" ] && [ "${RATE_LIMIT_BUCKETS_COUNT}" -ge "3" ]; then
  record_pass "Reward claims and rate-limit bucket audits are persisted in Postgres"
else
  record_fail "Reward claims and rate-limit bucket audits are persisted in Postgres"
fi

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
