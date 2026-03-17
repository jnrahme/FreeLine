#!/bin/bash
# Phase 4c admin launch gates
# Requires a running backend plus seeded admin data.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3021}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@freeline.dev}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMeAdmin123!}"
MAINTENANCE_KEY="${MAINTENANCE_KEY:-dev-maintenance-key}"
ACTIVE_LINE_PHONE_NUMBER="${ACTIVE_LINE_PHONE_NUMBER:-}"
ACTIVE_LINE_USER_ID="${ACTIVE_LINE_USER_ID:-}"
ACTIVE_REMOTE_NUMBER="${ACTIVE_REMOTE_NUMBER:-+14155550999}"
DEV_SMS_LOG="${DEV_SMS_LOG:-${ROOT_DIR}/.runtime/dev-mailbox/telephony-sms.jsonl}"
BANDWIDTH_WEBHOOK_SECRET="${BANDWIDTH_WEBHOOK_SECRET:-dev-bandwidth-webhook-secret}"
PASS=0
FAIL=0
RESULTS=()

record_pass() {
  RESULTS+=("PASS: $1")
  PASS=$((PASS + 1))
}

record_fail() {
  RESULTS+=("FAIL: $1")
  FAIL=$((FAIL + 1))
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
  (
    cd "${ROOT_DIR}" &&
      node - "${sql}" "$@" <<'NODE'
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

compute_signature() {
  local payload="$1"
  node -e '
    const crypto = require("node:crypto");
    const [secret, payload] = process.argv.slice(1);
    process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
  ' "${BANDWIDTH_WEBHOOK_SECRET}" "${payload}"
}

request_with_status() {
  local output_file
  output_file="$(mktemp)"
  local status
  status="$(curl -sS -o "${output_file}" -w "%{http_code}" "$@")"
  local body
  body="$(cat "${output_file}")"
  rm -f "${output_file}"
  printf '%s\n%s' "${status}" "${body}"
}

LOGIN_RESPONSE="$(curl -fsS -X POST "${API_BASE_URL}/v1/admin/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")"
ADMIN_ACCESS_TOKEN="$(extract_json_field "${LOGIN_RESPONSE}" 'console.log(data.tokens?.accessToken ?? "");')"

SYSTEM_STATUS="$(curl -fsS "${API_BASE_URL}/v1/admin/system-status" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
check_equals "A2P 10DLC registration is marked complete" "$(extract_json_field "${SYSTEM_STATUS}" 'console.log(String(data.status?.a2p10dlcRegistered ?? false));')" "true"
check_equals "Invite-only beta mode is active" "$(extract_json_field "${SYSTEM_STATUS}" 'console.log(String(data.status?.betaMode ?? false));')" "true"
check_equals "Webhook signature enforcement is enabled" "$(extract_json_field "${SYSTEM_STATUS}" 'console.log(String(data.status?.webhookSignatureVerificationEnabled ?? false));')" "true"
check_equals "STOP and HELP auto-replies are enabled" "$(extract_json_field "${SYSTEM_STATUS}" 'console.log(String(data.status?.stopHelpAutoreplyEnabled ?? false));')" "true"

INVALID_STOP_PAYLOAD="{\"events\":[{\"body\":\"STOP\",\"from\":\"${ACTIVE_REMOTE_NUMBER}\",\"to\":\"${ACTIVE_LINE_PHONE_NUMBER}\"}]}"
INVALID_RESPONSE="$(request_with_status -X POST "${API_BASE_URL}/v1/webhooks/telecom/messages/inbound" -H "Content-Type: application/json" -H "x-bandwidth-signature: invalid-signature" -d "${INVALID_STOP_PAYLOAD}")"
INVALID_STATUS="$(printf '%s' "${INVALID_RESPONSE}" | head -n 1)"
INVALID_BODY="$(printf '%s' "${INVALID_RESPONSE}" | tail -n +2)"
check_equals "Inbound SMS webhook rejects an invalid signature" "${INVALID_STATUS}" "401"
check_contains "Invalid signature response returns the expected error code" "${INVALID_BODY}" "invalid_webhook_signature"

VALID_STOP_SIGNATURE="$(compute_signature "${INVALID_STOP_PAYLOAD}")"
STOP_RESPONSE="$(curl -fsS -X POST "${API_BASE_URL}/v1/webhooks/telecom/messages/inbound" -H "Content-Type: application/json" -H "x-bandwidth-signature: ${VALID_STOP_SIGNATURE}" -d "${INVALID_STOP_PAYLOAD}")"
STOP_CREATED_COUNT="$(extract_json_field "${STOP_RESPONSE}" 'console.log(data.createdCount ?? 0);')"
check_equals "STOP inbound webhook is accepted with a valid signature" "${STOP_CREATED_COUNT}" "1"

OPT_OUT_STATE="$(db_scalar "select is_opted_out from conversations where user_id = \$1 and participant_number = \$2 order by updated_at desc limit 1" "${ACTIVE_LINE_USER_ID}" "${ACTIVE_REMOTE_NUMBER}")"
check_equals "STOP marks the conversation as opted out" "${OPT_OUT_STATE}" "true"

VALID_HELP_PAYLOAD="{\"events\":[{\"body\":\"HELP\",\"from\":\"${ACTIVE_REMOTE_NUMBER}\",\"to\":\"${ACTIVE_LINE_PHONE_NUMBER}\"}]}"
VALID_HELP_SIGNATURE="$(compute_signature "${VALID_HELP_PAYLOAD}")"
HELP_RESPONSE="$(curl -fsS -X POST "${API_BASE_URL}/v1/webhooks/telecom/messages/inbound" -H "Content-Type: application/json" -H "x-bandwidth-signature: ${VALID_HELP_SIGNATURE}" -d "${VALID_HELP_PAYLOAD}")"
HELP_CREATED_COUNT="$(extract_json_field "${HELP_RESPONSE}" 'console.log(data.createdCount ?? 0);')"
check_equals "HELP inbound webhook is accepted with a valid signature" "${HELP_CREATED_COUNT}" "1"

SMS_LOG_CONTENT="$(cat "${DEV_SMS_LOG}")"
check_contains "STOP auto-reply is written to dev telecom telemetry" "${SMS_LOG_CONTENT}" "Reply HELP for support"
check_contains "HELP auto-reply is written to dev telecom telemetry" "${SMS_LOG_CONTENT}" "Free calls & texts. Reply STOP to opt out"

LIFECYCLE_RESPONSE="$(curl -fsS -X POST "${API_BASE_URL}/v1/internal/numbers/lifecycle/run" -H "x-maintenance-key: ${MAINTENANCE_KEY}" -H "Content-Type: application/json" -d '{"now":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}')"
check_contains "Number lifecycle maintenance can run successfully" "${LIFECYCLE_RESPONSE}" "\"activationSweep\""

ADMIN_ME="$(curl -fsS "${API_BASE_URL}/v1/admin/me" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
check_contains "Admin can access the dashboard session endpoint" "${ADMIN_ME}" "\"admin\""

COST_RESPONSE="$(curl -fsS "${API_BASE_URL}/v1/admin/cost" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
check_equals "Cost dashboard reports current data" "$(extract_json_field "${COST_RESPONSE}" 'console.log(Number((data.cost?.trend ?? []).length) > 0 ? "true" : "false");')" "true"

echo "========================================="
echo "4c Launch Gates"
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
