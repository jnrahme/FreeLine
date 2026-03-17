#!/bin/bash
# Phase 4b-number-lifecycle verification
# Run from repo root: bash phases/4b-number-lifecycle/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3017
BACKEND_LOG="/tmp/freeline_phase4b_backend.log"
PUSH_LOG="${ROOT_DIR}/.runtime/dev-mailbox/push-events.jsonl"
MAINTENANCE_KEY="phase4b-maintenance-key"
RUN_ID="$(date +%s)"
AREA_CODE="$(printf '%03d' $((300 + RUN_ID % 600)))"
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
  if "$@" >/dev/null 2>&1; then
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

db_exec() {
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
    await pool.query(sql, params);
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

shift_iso() {
  local base="$1"
  local days="${2:-0}"
  local hours="${3:-0}"
  local minutes="${4:-0}"
  node -e '
    const [base, days, hours, minutes] = process.argv.slice(1);
    const date = new Date(base);
    date.setTime(
      date.getTime() +
        Number(days) * 24 * 60 * 60 * 1000 +
        Number(hours) * 60 * 60 * 1000 +
        Number(minutes) * 60 * 1000
    );
    process.stdout.write(date.toISOString());
  ' "${base}" "${days}" "${hours}" "${minutes}"
}

start_backend() {
  rm -f "${PUSH_LOG}"
  API_PORT="${API_PORT}" \
  PUBLIC_BASE_URL="http://127.0.0.1:${API_PORT}" \
  TELEPHONY_PROVIDER="bandwidth" \
  MAINTENANCE_API_KEY="${MAINTENANCE_KEY}" \
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

run_lifecycle() {
  local now="$1"
  curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/internal/numbers/lifecycle/run" \
    -H "x-maintenance-key: ${MAINTENANCE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"now\":\"${now}\"}"
}

restore_number() {
  local phone_number="$1"
  local user_id="$2"
  local now="$3"
  curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/internal/numbers/restore" \
    -H "x-maintenance-key: ${MAINTENANCE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"phoneNumber\":\"${phone_number}\",\"userId\":\"${user_id}\",\"now\":\"${now}\"}"
}

echo "========================================="
echo "Phase 4b-number-lifecycle Verification"
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
QUARANTINE_LOCALITY="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[3]?.locality ?? "");')"
QUARANTINE_NATIONAL_FORMAT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[3]?.nationalFormat ?? "");')"
QUARANTINE_REGION="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.[3]?.region ?? "");')"

BASE_NOW="$(node -e 'process.stdout.write(new Date().toISOString())')"
BASE_MINUS_TEN="$(shift_iso "${BASE_NOW}" -10)"
BASE_MINUS_THIRTEEN="$(shift_iso "${BASE_NOW}" -13)"
BASE_MINUS_FOURTEEN="$(shift_iso "${BASE_NOW}" -14)"
BASE_MINUS_ONE_DAY="$(shift_iso "${BASE_NOW}" -1)"
BASE_PLUS_ONE_DAY="$(shift_iso "${BASE_NOW}" 1)"
BASE_PLUS_ONE_DAY_ONE_HOUR="$(shift_iso "${BASE_PLUS_ONE_DAY}" 0 1)"
BASE_PLUS_FORTY_FIVE_DAYS="$(shift_iso "${BASE_NOW}" 45)"

ACTIVATION_AUTH="$(oauth_user "apple" "phase4b-activation-${RUN_ID}" "dev:phase4b-activation-${RUN_ID}:phase4b-activation-${RUN_ID}@freeline.dev:Phase4BActivation${RUN_ID}")"
ACTIVATION_ACCESS_TOKEN="$(extract_json_field "${ACTIVATION_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
ACTIVATION_USER_ID="$(extract_json_field "${ACTIVATION_AUTH}" 'console.log(data.user?.id ?? "");')"
ACTIVATION_CLAIM="$(claim_number "${ACTIVATION_ACCESS_TOKEN}" "0")"
ACTIVATION_ASSIGNMENT_ID="$(extract_json_field "${ACTIVATION_CLAIM}" 'console.log(data.number?.assignmentId ?? "");')"
ACTIVATION_PHONE_NUMBER="$(extract_json_field "${ACTIVATION_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"

RESET_AUTH="$(oauth_user "apple" "phase4b-reset-${RUN_ID}" "dev:phase4b-reset-${RUN_ID}:phase4b-reset-${RUN_ID}@freeline.dev:Phase4BReset${RUN_ID}")"
RESET_ACCESS_TOKEN="$(extract_json_field "${RESET_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
RESET_USER_ID="$(extract_json_field "${RESET_AUTH}" 'console.log(data.user?.id ?? "");')"
RESET_CLAIM="$(claim_number "${RESET_ACCESS_TOKEN}" "1")"
RESET_ASSIGNMENT_ID="$(extract_json_field "${RESET_CLAIM}" 'console.log(data.number?.assignmentId ?? "");')"
RESET_PHONE_NUMBER="$(extract_json_field "${RESET_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"

RECLAIM_AUTH="$(oauth_user "apple" "phase4b-reclaim-${RUN_ID}" "dev:phase4b-reclaim-${RUN_ID}:phase4b-reclaim-${RUN_ID}@freeline.dev:Phase4BReclaim${RUN_ID}")"
RECLAIM_ACCESS_TOKEN="$(extract_json_field "${RECLAIM_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
RECLAIM_USER_ID="$(extract_json_field "${RECLAIM_AUTH}" 'console.log(data.user?.id ?? "");')"
RECLAIM_CLAIM="$(claim_number "${RECLAIM_ACCESS_TOKEN}" "2")"
RECLAIM_ASSIGNMENT_ID="$(extract_json_field "${RECLAIM_CLAIM}" 'console.log(data.number?.assignmentId ?? "");')"
RECLAIM_PHONE_NUMBER="$(extract_json_field "${RECLAIM_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"

QUARANTINE_AUTH="$(oauth_user "apple" "phase4b-quarantine-${RUN_ID}" "dev:phase4b-quarantine-${RUN_ID}:phase4b-quarantine-${RUN_ID}@freeline.dev:Phase4BQuarantine${RUN_ID}")"
QUARANTINE_ACCESS_TOKEN="$(extract_json_field "${QUARANTINE_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
QUARANTINE_USER_ID="$(extract_json_field "${QUARANTINE_AUTH}" 'console.log(data.user?.id ?? "");')"
QUARANTINE_CLAIM="$(claim_number "${QUARANTINE_ACCESS_TOKEN}" "3")"
QUARANTINE_ASSIGNMENT_ID="$(extract_json_field "${QUARANTINE_CLAIM}" 'console.log(data.number?.assignmentId ?? "");')"
QUARANTINE_PHONE_NUMBER="$(extract_json_field "${QUARANTINE_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"

CLAIMER_AUTH="$(oauth_user "apple" "phase4b-claimer-${RUN_ID}" "dev:phase4b-claimer-${RUN_ID}:phase4b-claimer-${RUN_ID}@freeline.dev:Phase4BClaimer${RUN_ID}")"
CLAIMER_ACCESS_TOKEN="$(extract_json_field "${CLAIMER_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
CLAIMER_USER_ID="$(extract_json_field "${CLAIMER_AUTH}" 'console.log(data.user?.id ?? "");')"

db_exec "update number_assignments set activation_deadline = \$2::timestamptz, assigned_at = \$3::timestamptz, last_activity_at = null where id = \$1" "${ACTIVATION_ASSIGNMENT_ID}" "${BASE_MINUS_ONE_DAY}" "${BASE_MINUS_ONE_DAY}"
db_exec "update number_assignments set assigned_at = \$2::timestamptz, last_activity_at = \$3::timestamptz where id = \$1" "${RESET_ASSIGNMENT_ID}" "${BASE_MINUS_TEN}" "${BASE_MINUS_TEN}"
db_exec "update number_assignments set assigned_at = \$2::timestamptz, last_activity_at = \$3::timestamptz where id = \$1" "${RECLAIM_ASSIGNMENT_ID}" "${BASE_MINUS_THIRTEEN}" "${BASE_MINUS_THIRTEEN}"
db_exec "update number_assignments set assigned_at = \$2::timestamptz, last_activity_at = \$3::timestamptz where id = \$1" "${QUARANTINE_ASSIGNMENT_ID}" "${BASE_MINUS_FOURTEEN}" "${BASE_MINUS_FOURTEEN}"

INITIAL_RUN="$(run_lifecycle "${BASE_NOW}")"
INITIAL_ACTIVATION_RELEASED="$(extract_json_field "${INITIAL_RUN}" 'console.log(data.activationSweep?.releasedCount ?? 0);')"
INITIAL_ACTIVATION_PHONES="$(extract_json_field "${INITIAL_RUN}" 'console.log((data.activationSweep?.released ?? []).map((row) => row.phoneNumber).join(","));')"
INITIAL_WARNING_COUNT="$(extract_json_field "${INITIAL_RUN}" 'console.log(data.inactivitySweep?.warningCount ?? 0);')"
INITIAL_RECLAIM_COUNT="$(extract_json_field "${INITIAL_RUN}" 'console.log(data.inactivitySweep?.reclaimedCount ?? 0);')"
if [ "${INITIAL_ACTIVATION_RELEASED}" -ge 1 ] && [[ "${INITIAL_ACTIVATION_PHONES}" == *"${ACTIVATION_PHONE_NUMBER}"* ]]; then
  record_pass "Activation sweep releases the target unactivated number"
else
  record_fail "Activation sweep releases the target unactivated number"
fi
if [ "${INITIAL_WARNING_COUNT}" -ge 2 ]; then
  record_pass "Initial inactivity sweep issues warning notifications"
else
  record_fail "Initial inactivity sweep issues warning notifications"
fi
if [ "${INITIAL_RECLAIM_COUNT}" -ge 1 ]; then
  record_pass "Initial inactivity sweep reclaims at least one day-14 number"
else
  record_fail "Initial inactivity sweep reclaims at least one day-14 number"
fi

ACTIVATION_RELEASE_REASON="$(db_scalar "select release_reason from number_assignments where id = \$1" "${ACTIVATION_ASSIGNMENT_ID}")"
ACTIVATION_STATUS="$(db_scalar "select status from phone_numbers where phone_number = \$1" "${ACTIVATION_PHONE_NUMBER}")"
check_equals "Unactivated assignments persist the not_activated release reason" "${ACTIVATION_RELEASE_REASON}" "not_activated"
check_equals "Unactivated release returns the number to available inventory" "${ACTIVATION_STATUS}" "available"

RESET_DAY10_WARNING_COUNT="$(db_scalar "select count(*) from number_warnings where assignment_id = \$1 and warning_type = 'day_10'" "${RESET_ASSIGNMENT_ID}")"
RECLAIM_DAY13_WARNING_COUNT="$(db_scalar "select count(*) from number_warnings where assignment_id = \$1 and warning_type = 'day_13'" "${RECLAIM_ASSIGNMENT_ID}")"
QUARANTINE_STATUS="$(db_scalar "select status from number_quarantine where assignment_id = \$1" "${QUARANTINE_ASSIGNMENT_ID}")"
check_equals "Day-10 warnings are audited in number_warnings" "${RESET_DAY10_WARNING_COUNT}" "1"
check_equals "Day-13 warnings are audited in number_warnings" "${RECLAIM_DAY13_WARNING_COUNT}" "1"
check_equals "Day-14 reclaim creates a quarantined number record" "${QUARANTINE_STATUS}" "quarantined"

FAILED_CLAIM_BODY="$(mktemp)"
FAILED_CLAIM_STATUS="$(curl -sS -o "${FAILED_CLAIM_BODY}" -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/claim" \
  -H "Authorization: Bearer ${CLAIMER_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"areaCode\":\"${AREA_CODE}\",\"locality\":\"${QUARANTINE_LOCALITY}\",\"nationalFormat\":\"${QUARANTINE_NATIONAL_FORMAT}\",\"phoneNumber\":\"${QUARANTINE_PHONE_NUMBER}\",\"region\":\"${QUARANTINE_REGION}\"}")"
FAILED_CLAIM_JSON="$(cat "${FAILED_CLAIM_BODY}")"
rm -f "${FAILED_CLAIM_BODY}"
check_equals "Quarantined numbers cannot be claimed by another user" "${FAILED_CLAIM_STATUS}" "409"
check_contains "Quarantined claim failure uses number_not_available" "${FAILED_CLAIM_JSON}" "number_not_available"

RECLAIM_RUN="$(run_lifecycle "${BASE_PLUS_ONE_DAY}")"
RECLAIM_DAY14_COUNT="$(extract_json_field "${RECLAIM_RUN}" 'console.log(data.inactivitySweep?.reclaimedCount ?? 0);')"
if [ "${RECLAIM_DAY14_COUNT}" -ge 1 ]; then
  record_pass "Day-14 inactivity run reclaims warned numbers"
else
  record_fail "Day-14 inactivity run reclaims warned numbers"
fi

RESTORE_RESPONSE="$(restore_number "${RECLAIM_PHONE_NUMBER}" "${RECLAIM_USER_ID}" "${BASE_PLUS_ONE_DAY_ONE_HOUR}")"
RESTORE_STATUS="$(extract_json_field "${RESTORE_RESPONSE}" 'console.log(data.number?.status ?? "");')"
RESTORE_USER_ID="$(extract_json_field "${RESTORE_RESPONSE}" 'console.log(data.number?.userId ?? "");')"
RESTORE_QUARANTINE_STATUS="$(db_scalar "select status from number_quarantine where phone_number = \$1 order by reclaimed_at desc limit 1" "${RECLAIM_PHONE_NUMBER}")"
check_equals "Admin restore reassigns the reclaimed number" "${RESTORE_STATUS}" "assigned"
check_equals "Admin restore returns the number to the requested user" "${RESTORE_USER_ID}" "${RECLAIM_USER_ID}"
check_equals "Restore marks the quarantine record as restored" "${RESTORE_QUARANTINE_STATUS}" "restored"

MESSAGE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/messages" \
  -H "Authorization: Bearer ${RESET_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"body":"Keeping this number active","to":"+14155550991"}')"
MESSAGE_STATUS="$(extract_json_field "${MESSAGE_RESPONSE}" 'console.log(data.message?.status ?? "");')"
check_contains "A real outbound message records new activity after warning" "${MESSAGE_STATUS}" "pending"

RESET_ANCHOR="$(db_scalar "select to_char(last_activity_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from number_assignments where user_id = \$1 and released_at is null" "${RESET_USER_ID}")"
RESET_PLUS_NINE_DAYS="$(shift_iso "${RESET_ANCHOR}" 9)"
RESET_PLUS_TEN_DAYS="$(shift_iso "${RESET_ANCHOR}" 10 0 1)"

NO_WARNING_AFTER_RESET="$(run_lifecycle "${RESET_PLUS_NINE_DAYS}")"
RESET_WARNING_TOTAL_AFTER_NINE_DAYS="$(db_scalar "select count(*) from number_warnings where assignment_id = \$1 and warning_type = 'day_10'" "${RESET_ASSIGNMENT_ID}")"
RESET_RELEASED_AFTER_NINE_DAYS="$(db_scalar "select count(*) from number_assignments where id = \$1 and released_at is not null" "${RESET_ASSIGNMENT_ID}")"
check_equals "Activity after warning resets the inactivity timer before the next warning threshold" "${RESET_WARNING_TOTAL_AFTER_NINE_DAYS}" "1"
check_equals "Activity reset also avoids premature reclaim" "${RESET_RELEASED_AFTER_NINE_DAYS}" "0"

SECOND_WARNING_RUN="$(run_lifecycle "${RESET_PLUS_TEN_DAYS}")"
SECOND_WARNING_COUNT="$(extract_json_field "${SECOND_WARNING_RUN}" 'console.log(data.inactivitySweep?.warningCount ?? 0);')"
RESET_WARNING_TOTAL="$(db_scalar "select count(*) from number_warnings where assignment_id = \$1 and warning_type = 'day_10'" "${RESET_ASSIGNMENT_ID}")"
if [ "${SECOND_WARNING_COUNT}" -ge 1 ]; then
  record_pass "A new day-10 warning can be sent after fresh activity"
else
  record_fail "A new day-10 warning can be sent after fresh activity"
fi
check_equals "Warning history keeps both day-10 warnings with distinct anchors" "${RESET_WARNING_TOTAL}" "2"

db_exec "update number_assignments set last_activity_at = \$2::timestamptz where user_id in (\$1, \$3) and released_at is null" "${RESET_USER_ID}" "${BASE_PLUS_FORTY_FIVE_DAYS}" "${RECLAIM_USER_ID}"
QUARANTINE_RELEASE_RUN="$(run_lifecycle "${BASE_PLUS_FORTY_FIVE_DAYS}")"
QUARANTINE_AVAILABLE_COUNT="$(extract_json_field "${QUARANTINE_RELEASE_RUN}" 'console.log(data.quarantineSweep?.availableCount ?? 0);')"
QUARANTINE_PHONE_STATUS="$(db_scalar "select status from phone_numbers where phone_number = \$1" "${QUARANTINE_PHONE_NUMBER}")"
if [ "${QUARANTINE_AVAILABLE_COUNT}" -ge 1 ]; then
  record_pass "Post-quarantine sweep returns numbers to available inventory"
else
  record_fail "Post-quarantine sweep returns numbers to available inventory"
fi
check_equals "Quarantine completion marks the phone number row available" "${QUARANTINE_PHONE_STATUS}" "available"

POST_QUARANTINE_CLAIM="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/numbers/claim" \
  -H "Authorization: Bearer ${CLAIMER_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"areaCode\":\"${AREA_CODE}\",\"locality\":\"${QUARANTINE_LOCALITY}\",\"nationalFormat\":\"${QUARANTINE_NATIONAL_FORMAT}\",\"phoneNumber\":\"${QUARANTINE_PHONE_NUMBER}\",\"region\":\"${QUARANTINE_REGION}\"}")"
POST_QUARANTINE_STATUS="$(extract_json_field "${POST_QUARANTINE_CLAIM}" 'console.log(data.number?.status ?? "");')"
POST_QUARANTINE_USER_ID="$(extract_json_field "${POST_QUARANTINE_CLAIM}" 'console.log(data.number?.userId ?? "");')"
check_equals "Returned inventory can be claimed again after quarantine" "${POST_QUARANTINE_STATUS}" "assigned"
check_equals "Returned inventory is reassigned to the new claimant" "${POST_QUARANTINE_USER_ID}" "${CLAIMER_USER_ID}"

PUSH_EVENTS="$(cat "${PUSH_LOG}")"
check_contains "Push log includes the activation-release notification" "${PUSH_EVENTS}" "\"type\":\"number:activation_released\""
check_contains "Push log includes the day-10 warning notification" "${PUSH_EVENTS}" "\"type\":\"number:warning_day_10\""
check_contains "Push log includes the day-13 warning notification" "${PUSH_EVENTS}" "\"type\":\"number:warning_day_13\""
check_contains "Push log includes the reclaim notification" "${PUSH_EVENTS}" "\"type\":\"number:reclaimed\""
check_contains "Push log includes the restore notification" "${PUSH_EVENTS}" "\"type\":\"number:restored\""

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
fi

echo "STATUS: PASS"
