#!/bin/bash
# Phase 4c-admin-ops verification
# Run from repo root: bash phases/4c-admin-ops/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3021
ADMIN_PORT=3401
BACKEND_LOG="/tmp/freeline_phase4c_backend.log"
ADMIN_LOG="/tmp/freeline_phase4c_admin.log"
MAILBOX_DIR=".runtime/dev-mailbox/phase4c"
SMS_LOG="${ROOT_DIR}/${MAILBOX_DIR}/telephony-sms.jsonl"
MAINTENANCE_KEY="phase4c-maintenance-key"
PASS=0
FAIL=0
RESULTS=()
SERVER_PID=""
ADMIN_PID=""
RUN_ID="$(date +%s)"

cleanup() {
  if [ -n "${ADMIN_PID}" ] && kill -0 "${ADMIN_PID}" >/dev/null 2>&1; then
    kill "${ADMIN_PID}" >/dev/null 2>&1 || true
    wait "${ADMIN_PID}" >/dev/null 2>&1 || true
  fi

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

db_exec() {
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

wait_for_url() {
  local url="$1"
  for _ in {1..30}; do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

start_backend() {
  rm -rf "${ROOT_DIR}/${MAILBOX_DIR}"
  API_PORT="${API_PORT}" \
  PUBLIC_BASE_URL="http://127.0.0.1:${API_PORT}" \
  TELEPHONY_PROVIDER="bandwidth" \
  DEV_MAILBOX_DIR="${MAILBOX_DIR}" \
  BETA_MODE="true" \
  A2P_10DLC_REGISTERED="true" \
  MAINTENANCE_API_KEY="${MAINTENANCE_KEY}" \
  npm run start --prefix FreeLine-Backend >"${BACKEND_LOG}" 2>&1 &
  SERVER_PID=$!

  wait_for_url "http://127.0.0.1:${API_PORT}/health"
}

start_admin() {
  NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:${API_PORT}" \
  PORT="${ADMIN_PORT}" \
  npm run start --prefix apps/admin >"${ADMIN_LOG}" 2>&1 &
  ADMIN_PID=$!

  wait_for_url "http://127.0.0.1:${ADMIN_PORT}/login"
}

seed_admin_ops_data() {
  (
    cd "${ROOT_DIR}" &&
      node - "${RUN_ID}" <<'NODE'
const crypto = require("node:crypto");
const { Pool } = require("./FreeLine-Backend/node_modules/pg");

const [runId] = process.argv.slice(2);

function id(label) {
  return `phase4c-${label}-${runId}`;
}

(async () => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const thirteenDaysAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const ids = {
    aliceUserId: id("alice-user"),
    bobUserId: id("bob-user"),
    charlieUserId: id("charlie-user"),
    alicePhoneId: id("alice-phone"),
    bobPhoneId: id("bob-phone"),
    aliceAssignmentId: id("alice-assignment"),
    bobAssignmentId: id("bob-assignment"),
    aliceQuarantineId: id("alice-quarantine"),
    aliceWarningId: id("alice-warning"),
    bobConversationId: crypto.randomUUID(),
    aliceReportId: id("alice-report"),
    bobSpamFlagId: id("bob-spam-flag"),
    bobCallId: id("bob-call"),
    bobDeviceId: id("bob-device"),
    bobDeviceAccountId: id("bob-device-account")
  };

  const values = {
    alicePhoneNumber: "+14155550171",
    bobPhoneNumber: "+14155550172",
    activeRemoteNumber: "+14155550999"
  };

  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || "freeline",
    password: process.env.POSTGRES_PASSWORD || "freeline",
    database: process.env.POSTGRES_DB || "freeline"
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from abuse_event_reviews");
      await client.query("delete from invite_codes");
      await client.query("delete from admin_users");
      await client.query("delete from number_warnings");
      await client.query("delete from number_quarantine");
      await client.query("delete from rate_limit_buckets");
      await client.query("delete from reward_claims");
      await client.query("delete from abuse_events");
      await client.query("delete from call_push_tokens");
      await client.query("delete from voicemails");
      await client.query("delete from calls");
      await client.query("delete from opt_out_events");
      await client.query("delete from reports");
      await client.query("delete from blocks");
      await client.query("delete from message_media");
      await client.query("delete from messages");
      await client.query("delete from conversations");
      await client.query("delete from push_tokens");
      await client.query("delete from devices");
      await client.query("delete from device_accounts");
      await client.query("delete from refresh_tokens");
      await client.query("delete from email_verifications");
      await client.query("delete from auth_identities");
      await client.query("delete from number_assignments");
      await client.query("delete from phone_numbers");
      await client.query("delete from users");

      await client.query(
        `
          insert into users (id, email, display_name, status, trust_score, created_at, updated_at)
          values
            ($1, 'alice@example.com', 'Alice', 'active', 50, now(), now()),
            ($2, 'bob@example.com', 'Bob', 'active', 50, now(), now()),
            ($3, 'charlie@example.com', 'Charlie', 'active', 50, now(), now())
        `,
        [ids.aliceUserId, ids.bobUserId, ids.charlieUserId]
      );

      await client.query(
        `
          insert into devices (id, user_id, fingerprint, platform, push_token, created_at, updated_at)
          values ($1, $2, 'device-bob', 'android', 'push-bob', now(), now())
        `,
        [ids.bobDeviceId, ids.bobUserId]
      );

      await client.query(
        `
          insert into device_accounts (
            id,
            fingerprint,
            user_id,
            platform,
            first_seen_at,
            last_seen_at
          )
          values ($1, 'device-bob', $2, 'android', now(), now())
        `,
        [ids.bobDeviceAccountId, ids.bobUserId]
      );

      await client.query(
        `
          insert into phone_numbers (
            id,
            phone_number,
            external_id,
            provider,
            area_code,
            locality,
            region,
            national_format,
            status,
            quarantine_until,
            created_at,
            updated_at
          )
          values
            ($1, $2, 'bandwidth-171', 'bandwidth', '415', 'San Francisco', 'CA', '(415) 555-0171', 'quarantined', $3, now(), now()),
            ($4, $5, 'bandwidth-172', 'bandwidth', '415', 'San Francisco', 'CA', '(415) 555-0172', 'assigned', null, now(), now())
        `,
        [
          ids.alicePhoneId,
          values.alicePhoneNumber,
          sevenDaysFromNow.toISOString(),
          ids.bobPhoneId,
          values.bobPhoneNumber
        ]
      );

      await client.query(
        `
          insert into number_assignments (
            id,
            user_id,
            phone_number_id,
            assigned_at,
            released_at,
            activation_deadline,
            last_activity_at,
            release_reason
          )
          values
            ($1, $2, $3, $4, $5, $6, $7, 'user_release'),
            ($8, $9, $10, now(), null, now() + interval '1 day', now(), null)
        `,
        [
          ids.aliceAssignmentId,
          ids.aliceUserId,
          ids.alicePhoneId,
          monthStart.toISOString(),
          hourAgo.toISOString(),
          monthStart.toISOString(),
          thirteenDaysAgo.toISOString(),
          ids.bobAssignmentId,
          ids.bobUserId,
          ids.bobPhoneId
        ]
      );

      await client.query(
        `
          insert into number_quarantine (
            id,
            assignment_id,
            phone_number_id,
            phone_number,
            reason,
            reclaimed_at,
            available_at,
            status
          )
          values ($1, $2, $3, $4, 'user_release', $5, $6, 'quarantined')
        `,
        [
          ids.aliceQuarantineId,
          ids.aliceAssignmentId,
          ids.alicePhoneId,
          values.alicePhoneNumber,
          hourAgo.toISOString(),
          sevenDaysFromNow.toISOString()
        ]
      );

      await client.query(
        `
          insert into number_warnings (
            id,
            assignment_id,
            warning_type,
            activity_anchor_at,
            warned_at
          )
          values ($1, $2, 'day_13', $3, now())
        `,
        [ids.aliceWarningId, ids.aliceAssignmentId, thirteenDaysAgo.toISOString()]
      );

      await client.query(
        `
          insert into conversations (
            id,
            user_id,
            phone_number_id,
            participant_number,
            last_message_at,
            unread_count,
            is_opted_out,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, now(), 0, false, now(), now())
        `,
        [
          ids.bobConversationId,
          ids.bobUserId,
          ids.bobPhoneId,
          values.activeRemoteNumber
        ]
      );

      for (let index = 0; index < 160; index += 1) {
        await client.query(
          `
            insert into messages (
              id,
              conversation_id,
              direction,
              body,
              status,
              created_at,
              updated_at
            )
            values ($1, $2, 'outbound', $3, 'sent', now(), now())
          `,
          [crypto.randomUUID(), ids.bobConversationId, `Bob seeded message ${index}`]
        );
      }

      await client.query(
        `
          insert into calls (
            id,
            provider_call_id,
            user_id,
            phone_number_id,
            remote_number,
            direction,
            status,
            duration_seconds,
            started_at,
            ended_at,
            created_at,
            updated_at
          )
          values (
            $1,
            $2,
            $3,
            $4,
            '+14155558888',
            'outbound',
            'completed',
            600,
            now(),
            now(),
            now(),
            now()
          )
        `,
        [ids.bobCallId, `call-${runId}`, ids.bobUserId, ids.bobPhoneId]
      );

      await client.query(
        `
          insert into abuse_events (id, user_id, event_type, details, created_at)
          values
            ($1, $2, 'report', '{"reason":"seed_report"}'::jsonb, now()),
            ($3, $4, 'spam_flag', '{"heuristic":"url_first_message"}'::jsonb, now())
        `,
        [ids.aliceReportId, ids.aliceUserId, ids.bobSpamFlagId, ids.bobUserId]
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    process.stdout.write(
      JSON.stringify({
        ...ids,
        ...values
      })
    );
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

login_admin() {
  curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/admin/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@freeline.dev\",\"password\":\"ChangeMeAdmin123!\"}"
}

http_status() {
  local output_file
  output_file="$(mktemp)"
  local status
  status="$(curl -sS -o "${output_file}" -w "%{http_code}" "$@")"
  cat "${output_file}" >"${output_file}.body"
  rm -f "${output_file}"
  printf '%s\n' "${status}"
  cat "${output_file}.body"
  rm -f "${output_file}.body"
}

echo "========================================="
echo "Phase 4c-admin-ops Verification"
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

SEED_JSON="$(seed_admin_ops_data)"
ALICE_USER_ID="$(extract_json_field "${SEED_JSON}" 'console.log(data.aliceUserId);')"
ALICE_PHONE_NUMBER="$(extract_json_field "${SEED_JSON}" 'console.log(data.alicePhoneNumber);')"
ALICE_REPORT_ID="$(extract_json_field "${SEED_JSON}" 'console.log(data.aliceReportId);')"
BOB_USER_ID="$(extract_json_field "${SEED_JSON}" 'console.log(data.bobUserId);')"
BOB_PHONE_NUMBER="$(extract_json_field "${SEED_JSON}" 'console.log(data.bobPhoneNumber);')"
BOB_SPAM_FLAG_ID="$(extract_json_field "${SEED_JSON}" 'console.log(data.bobSpamFlagId);')"
CHARLIE_USER_ID="$(extract_json_field "${SEED_JSON}" 'console.log(data.charlieUserId);')"
ACTIVE_REMOTE_NUMBER="$(extract_json_field "${SEED_JSON}" 'console.log(data.activeRemoteNumber);')"

ADMIN_LOGIN_RESPONSE="$(login_admin)"
ADMIN_ACCESS_TOKEN="$(extract_json_field "${ADMIN_LOGIN_RESPONSE}" 'console.log(data.tokens?.accessToken ?? "");')"
check_contains "Admin login returns an access token" "${ADMIN_ACCESS_TOKEN}" "."

ADMIN_ME_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/admin/me" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
ADMIN_EMAIL="$(extract_json_field "${ADMIN_ME_RESPONSE}" 'console.log(data.admin?.email ?? "");')"
check_equals "Admin /me returns the bootstrap admin" "${ADMIN_EMAIL}" "admin@freeline.dev"

SEARCH_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/admin/users?q=${BOB_PHONE_NUMBER}" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
SEARCH_COUNT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.users?.length ?? 0);')"
SEARCH_USER_ID="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.users?.[0]?.id ?? "");')"
check_equals "User search can find a user by active phone number" "${SEARCH_COUNT}" "1"
check_equals "Search returns the seeded Bob user" "${SEARCH_USER_ID}" "${BOB_USER_ID}"

DETAIL_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/admin/users/${BOB_USER_ID}" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
DETAIL_MESSAGE_TOTAL="$(extract_json_field "${DETAIL_RESPONSE}" 'console.log(data.user?.totalTextEventsThisMonth ?? 0);')"
DETAIL_CALL_TOTAL="$(extract_json_field "${DETAIL_RESPONSE}" 'console.log(data.user?.totalCallMinutesThisMonth ?? 0);')"
DETAIL_DEVICE_COUNT="$(extract_json_field "${DETAIL_RESPONSE}" 'console.log(data.user?.devices?.length ?? 0);')"
check_equals "User detail reports seeded monthly text volume" "${DETAIL_MESSAGE_TOTAL}" "160"
check_equals "User detail reports seeded monthly call minutes" "${DETAIL_CALL_TOTAL}" "10"
check_equals "User detail includes linked devices" "${DETAIL_DEVICE_COUNT}" "1"

SUSPEND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/admin/users/${CHARLIE_USER_ID}/suspend" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" -H "Content-Type: application/json" -d '{"reason":"phase4c_verify"}')"
SUSPENDED_STATUS="$(db_scalar "select status from users where id = \$1" "${CHARLIE_USER_ID}")"
check_equals "Suspend action updates user status" "${SUSPENDED_STATUS}" "suspended"
check_contains "Suspend route returns the user payload" "${SUSPEND_RESPONSE}" "\"user\""

UNSUSPEND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/admin/users/${CHARLIE_USER_ID}/unsuspend" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
UNSUSPENDED_STATUS="$(db_scalar "select status from users where id = \$1" "${CHARLIE_USER_ID}")"
check_equals "Unsuspend action restores active status" "${UNSUSPENDED_STATUS}" "active"
check_contains "Unsuspend route returns the user payload" "${UNSUSPEND_RESPONSE}" "\"user\""

ABUSE_QUEUE_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/admin/abuse-queue?status=open" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
ABUSE_QUEUE_IDS="$(extract_json_field "${ABUSE_QUEUE_RESPONSE}" 'console.log((data.items ?? []).map((item) => item.id).join(","));')"
check_contains "Abuse queue includes the seeded Alice report" "${ABUSE_QUEUE_IDS}" "${ALICE_REPORT_ID}"
check_contains "Abuse queue includes the seeded Bob spam flag" "${ABUSE_QUEUE_IDS}" "${BOB_SPAM_FLAG_ID}"

DISMISS_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/admin/abuse-queue/${ALICE_REPORT_ID}/dismiss" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
DISMISS_ACTION="$(extract_json_field "${DISMISS_RESPONSE}" 'console.log(data.item?.reviewAction ?? "");')"
check_equals "Dismiss action stores review state" "${DISMISS_ACTION}" "dismissed"

CONFIRM_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/admin/abuse-queue/${BOB_SPAM_FLAG_ID}/confirm" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
CONFIRM_ACTION="$(extract_json_field "${CONFIRM_RESPONSE}" 'console.log(data.item?.reviewAction ?? "");')"
BOB_STATUS_AFTER_CONFIRM="$(db_scalar "select status from users where id = \$1" "${BOB_USER_ID}")"
check_equals "Confirm action stores review state" "${CONFIRM_ACTION}" "confirmed"
check_equals "Confirm action suspends the flagged user" "${BOB_STATUS_AFTER_CONFIRM}" "suspended"

QUARANTINED_BEFORE_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/admin/numbers?status=quarantined" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
QUARANTINED_BEFORE_COUNT="$(extract_json_field "${QUARANTINED_BEFORE_RESPONSE}" 'console.log(data.numbers?.length ?? 0);')"
check_equals "Number inventory lists the seeded quarantined number" "${QUARANTINED_BEFORE_COUNT}" "1"

FORCE_RELEASE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/admin/users/${BOB_USER_ID}/force-release-number" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
FORCE_RELEASE_STATUS="$(extract_json_field "${FORCE_RELEASE_RESPONSE}" 'console.log(data.number?.status ?? "");')"
check_equals "Force release moves the active number to quarantine" "${FORCE_RELEASE_STATUS}" "quarantined"

RESTORE_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/admin/numbers/restore" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" -H "Content-Type: application/json" -d "{\"phoneNumber\":\"${ALICE_PHONE_NUMBER}\",\"userId\":\"${CHARLIE_USER_ID}\"}")"
RESTORED_USER_ID="$(extract_json_field "${RESTORE_RESPONSE}" 'console.log(data.number?.userId ?? "");')"
ASSIGNED_AFTER_RESTORE="$(db_scalar "select count(*) from number_assignments where user_id = \$1 and released_at is null" "${CHARLIE_USER_ID}")"
check_equals "Restore action reassigns the quarantined number to the requested user" "${RESTORED_USER_ID}" "${CHARLIE_USER_ID}"
check_equals "Restore action leaves the target user with one active assignment" "${ASSIGNED_AFTER_RESTORE}" "1"

COST_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/admin/cost" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}")"
COST_ACTIVE_NUMBERS="$(extract_json_field "${COST_RESPONSE}" 'console.log(data.cost?.activeNumbers ?? 0);')"
COST_TEXT_EVENTS="$(extract_json_field "${COST_RESPONSE}" 'console.log(data.cost?.textEventsThisMonth ?? 0);')"
COST_ALERT="$(extract_json_field "${COST_RESPONSE}" 'console.log(String(data.cost?.isAlertTriggered ?? false));')"
check_equals "Cost dashboard reports the active number count" "${COST_ACTIVE_NUMBERS}" "1"
check_equals "Cost dashboard reports the seeded message volume" "${COST_TEXT_EVENTS}" "160"
check_equals "Cost dashboard raises the cost-per-user alert" "${COST_ALERT}" "true"

check "Admin app starts locally" start_admin
LOGIN_PAGE="$(curl -fsS "http://127.0.0.1:${ADMIN_PORT}/login")"
USERS_PAGE_STATUS_BODY="$(http_status "http://127.0.0.1:${ADMIN_PORT}/users")"
check_contains "Admin login page loads with branded content" "${LOGIN_PAGE}" "FreeLine Internal Ops"
check_contains "Admin users route responds successfully" "${USERS_PAGE_STATUS_BODY}" "200"

export API_BASE_URL="http://127.0.0.1:${API_PORT}"
export ADMIN_EMAIL="admin@freeline.dev"
export ADMIN_PASSWORD="ChangeMeAdmin123!"
export MAINTENANCE_KEY="${MAINTENANCE_KEY}"
export ACTIVE_LINE_PHONE_NUMBER="${ALICE_PHONE_NUMBER}"
export ACTIVE_LINE_USER_ID="${CHARLIE_USER_ID}"
export ACTIVE_REMOTE_NUMBER="${ACTIVE_REMOTE_NUMBER}"
export DEV_SMS_LOG="${SMS_LOG}"
check "Launch gates report green" bash phases/4c-admin-ops/launch-gates.sh

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
