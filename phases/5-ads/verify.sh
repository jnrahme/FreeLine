#!/bin/bash
# Phase 5-ads verification
# Run from repo root: bash phases/5-ads/verify.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT=3022
BACKEND_LOG="/tmp/freeline_phase5_backend.log"
MAILBOX_DIR=".runtime/dev-mailbox/phase5"
IOS_DERIVED_DATA="${ROOT_DIR}/.runtime/ios-derived-phase5"
ANALYTICS_LOG="${ROOT_DIR}/${MAILBOX_DIR}/analytics-events.jsonl"
MAINTENANCE_KEY="phase5-maintenance-key"
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
  API_PORT="${API_PORT}" \
  PUBLIC_BASE_URL="http://127.0.0.1:${API_PORT}" \
  TELEPHONY_PROVIDER="bandwidth" \
  DEV_MAILBOX_DIR="${MAILBOX_DIR}" \
  MAINTENANCE_API_KEY="${MAINTENANCE_KEY}" \
  A2P_10DLC_REGISTERED="true" \
  npm run start --prefix FreeLine-Backend >"${BACKEND_LOG}" 2>&1 &
  SERVER_PID=$!

  wait_for_url "http://127.0.0.1:${API_PORT}/health"
}

restart_backend() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  SERVER_PID=""
  start_backend
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

echo "========================================="
echo "Phase 5-ads Verification"
echo "========================================="
echo ""

cd "${ROOT_DIR}"
rm -rf "${ROOT_DIR}/${MAILBOX_DIR}"
rm -rf "${IOS_DERIVED_DATA}"

check "Root build succeeds" npm run build
check "Root lint passes" npm run lint
check "Root typecheck passes" npm run typecheck
check "Root tests pass" npm run test
check "Docker services start" docker compose up -d postgres redis --wait
check "Database migrations run cleanly" npm run migrate --prefix FreeLine-Backend
check "iOS simulator build passes" bash -lc "cd '${ROOT_DIR}/FreeLine-iOS' && xcodebuild -project FreeLine.xcodeproj -scheme FreeLine -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath '${IOS_DERIVED_DATA}' build"
check "iOS build output includes an AdMob application identifier" bash -lc "plutil -extract GADApplicationIdentifier raw -o - '${IOS_DERIVED_DATA}/Build/Products/Debug-iphonesimulator/FreeLine.app/Info.plist' | rg -q 'ca-app-pub-'"
check "Android debug build passes" bash -lc "cd '${ROOT_DIR}/FreeLine-Android' && ./gradlew assembleDebug"
check "Backend starts locally" start_backend
check "iOS project declares a Google Mobile Ads SDK dependency" bash -lc "rg -q 'GoogleMobileAds|Google-Mobile-Ads-SDK' '${ROOT_DIR}/FreeLine-iOS/project.yml'"
check "iOS project declares a RevenueCat dependency" bash -lc "rg -q 'RevenueCat|Purchases' '${ROOT_DIR}/FreeLine-iOS/project.yml'"
check "Android build declares a Google Mobile Ads dependency" bash -lc "rg -q 'play-services-ads' '${ROOT_DIR}/FreeLine-Android/app/build.gradle.kts'"
check "Android build declares a RevenueCat dependency" bash -lc "rg -q 'com\\.revenuecat\\.purchases' '${ROOT_DIR}/FreeLine-Android/app/build.gradle.kts'"
check "iOS monetization views are not dev placeholder banner shells" bash -lc "! rg -q 'struct DevBannerAdView' '${ROOT_DIR}/FreeLine-iOS/Sources/Monetization/AdViews.swift'"
check "Android monetization views are not dev placeholder banner shells" bash -lc "! rg -q 'fun DevBannerAdCard' '${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/monetization/MonetizationViews.kt'"
check "iOS purchase verification is not hardcoded to provider dev" bash -lc "! rg -q '\"provider\": \"dev\"' '${ROOT_DIR}/FreeLine-iOS/Sources/Monetization/MonetizationClients.swift'"
check "Android purchase verification is not hardcoded to provider dev" bash -lc "! rg -q 'put\\(\"provider\", \"dev\"\\)' '${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/monetization/MonetizationApiClient.kt'"
check "Backend subscription verification no longer rejects RevenueCat outright" bash -lc "! rg -q 'subscription_provider_not_configured' '${ROOT_DIR}/FreeLine-Backend/src/subscriptions/service.ts'"

check "iOS messages screen wires bottom banner" rg -q "messages_bottom_banner" "${ROOT_DIR}/FreeLine-iOS/Sources/Screens/ConversationsView.swift"
check "iOS calls screen wires bottom banner" rg -q "calls_bottom_banner" "${ROOT_DIR}/FreeLine-iOS/Sources/Screens/CallsView.swift"
check "iOS settings screen wires bottom banner" rg -q "settings_bottom_banner" "${ROOT_DIR}/FreeLine-iOS/Sources/Screens/SettingsView.swift"
check "iOS inbox wires sponsored row" rg -q "messages_inbox_native" "${ROOT_DIR}/FreeLine-iOS/Sources/Screens/ConversationsView.swift"
check "iOS root wires cap-hit prompt" rg -q "cap_hit_prompt" "${ROOT_DIR}/FreeLine-iOS/Sources/App/RootTabView.swift"
check "Android messages screen wires bottom banner" rg -q "messages_bottom_banner" "${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/ui/MessagesScreens.kt"
check "Android calls screen wires bottom banner" rg -q "calls_bottom_banner" "${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/ui/CallsScreens.kt"
check "Android settings screen wires bottom banner" rg -q "settings_bottom_banner" "${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineApp.kt"
check "Android inbox wires sponsored row" rg -q "messages_inbox_native" "${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/ui/MessagesScreens.kt"
check "Android shell wires cap-hit prompt" rg -q "cap_hit_prompt" "${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineApp.kt"
check "Both native apps render usage overview" bash -lc "rg -q 'UsageOverviewCard' '${ROOT_DIR}/FreeLine-iOS/Sources/Screens/SettingsView.swift' && rg -q 'UsageOverviewCard' '${ROOT_DIR}/FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineApp.kt'"

SEARCH_RESPONSE="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/numbers/search?areaCode=${AREA_CODE}")"
SEARCH_COUNT="$(extract_json_field "${SEARCH_RESPONSE}" 'console.log(data.numbers?.length ?? 0);')"
check_equals "Search returns enough claimable dev numbers" "${SEARCH_COUNT}" "10"

FREE_AUTH="$(oauth_user "apple" "phase5-free-${RUN_ID}" "dev:phase5-free-${RUN_ID}:phase5-free-${RUN_ID}@freeline.dev:Phase5Free${RUN_ID}")"
FREE_ACCESS_TOKEN="$(extract_json_field "${FREE_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
FREE_CLAIM="$(claim_number "${FREE_ACCESS_TOKEN}" "0")"
FREE_PHONE_NUMBER="$(extract_json_field "${FREE_CLAIM}" 'console.log(data.number?.phoneNumber ?? "");')"
check_contains "Free user can claim a number" "${FREE_PHONE_NUMBER}" "+1"

FREE_STATUS="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/subscriptions/status" -H "Authorization: Bearer ${FREE_ACCESS_TOKEN}")"
FREE_ADS_ENABLED="$(extract_json_field "${FREE_STATUS}" 'console.log(data.status?.adsEnabled ?? "");')"
FREE_CATALOG_COUNT="$(extract_json_field "${FREE_STATUS}" 'console.log(data.catalog?.length ?? 0);')"
check_equals "Free tier keeps ads enabled by default" "${FREE_ADS_ENABLED}" "true"
check_equals "Subscription catalog exposes three products" "${FREE_CATALOG_COUNT}" "3"

for claim_index in 1 2 3 4; do
  REWARD_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/rewards/claim" \
    -H "Authorization: Bearer ${FREE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"rewardType":"text_events"}')"
done

REMAINING_REWARD_CLAIMS="$(extract_json_field "${REWARD_RESPONSE}" 'console.log(data.claimedReward?.remainingClaims ?? 0);')"
TOTAL_REWARD_CLAIMS="$(extract_json_field "${REWARD_RESPONSE}" 'console.log(data.claimedReward?.totalClaims ?? 0);')"
TEXT_CAP_AFTER_REWARDS="$(extract_json_field "${REWARD_RESPONSE}" 'console.log(data.messages?.monthlyCap ?? 0);')"
if [ "${REMAINING_REWARD_CLAIMS}" = "0" ] && [ "${TOTAL_REWARD_CLAIMS}" = "4" ] && [ "${TEXT_CAP_AFTER_REWARDS}" -gt 40 ]; then
  record_pass "Reward claims expand text allowance and enforce the four-claim cap"
else
  record_fail "Reward claims expand text allowance and enforce the four-claim cap"
fi

FIFTH_REWARD_BODY="$(mktemp)"
FIFTH_REWARD_STATUS="$(curl -sS -o "${FIFTH_REWARD_BODY}" -w "%{http_code}" -X POST "http://127.0.0.1:${API_PORT}/v1/rewards/claim" \
  -H "Authorization: Bearer ${FREE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rewardType":"text_events"}')"
FIFTH_REWARD_JSON="$(cat "${FIFTH_REWARD_BODY}")"
rm -f "${FIFTH_REWARD_BODY}"
check_equals "Fifth reward claim is denied" "${FIFTH_REWARD_STATUS}" "409"
check_contains "Fifth reward claim returns the correct error code" "${FIFTH_REWARD_JSON}" "reward_claim_limit_reached"

ADFREE_AUTH="$(oauth_user "apple" "phase5-adfree-${RUN_ID}" "dev:phase5-adfree-${RUN_ID}:phase5-adfree-${RUN_ID}@freeline.dev:Phase5AdFree${RUN_ID}")"
ADFREE_ACCESS_TOKEN="$(extract_json_field "${ADFREE_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
claim_number "${ADFREE_ACCESS_TOKEN}" "1" >/dev/null
ADFREE_VERIFY="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/subscriptions/verify" \
  -H "Authorization: Bearer ${ADFREE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"platform":"ios","productId":"freeline.ad_free.monthly","provider":"dev","transactionId":"phase5-adfree","verificationToken":"dev-freeline.ad_free.monthly"}')"
ADFREE_VERIFY_TIER="$(extract_json_field "${ADFREE_VERIFY}" 'console.log(data.status?.displayTier ?? "");')"
ADFREE_VERIFY_ADS="$(extract_json_field "${ADFREE_VERIFY}" 'console.log(data.status?.adsEnabled ?? "");')"
check_equals "Dev subscription verification sets the ad-free tier" "${ADFREE_VERIFY_TIER}" "ad_free"
check_equals "Dev subscription verification disables ads" "${ADFREE_VERIFY_ADS}" "false"

LOCK_AUTH="$(oauth_user "apple" "phase5-lock-${RUN_ID}" "dev:phase5-lock-${RUN_ID}:phase5-lock-${RUN_ID}@freeline.dev:Phase5Lock${RUN_ID}")"
LOCK_ACCESS_TOKEN="$(extract_json_field "${LOCK_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
LOCK_CLAIM="$(claim_number "${LOCK_ACCESS_TOKEN}" "2")"
LOCK_ASSIGNMENT_ID="$(extract_json_field "${LOCK_CLAIM}" 'console.log(data.number?.assignmentId ?? "");')"
LOCK_VERIFY="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/subscriptions/verify" \
  -H "Authorization: Bearer ${LOCK_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"platform":"ios","productId":"freeline.lock_number.monthly","provider":"dev","transactionId":"phase5-lock","verificationToken":"dev-freeline.lock_number.monthly"}')"
LOCK_TIER="$(extract_json_field "${LOCK_VERIFY}" 'console.log(data.status?.displayTier ?? "");')"
LOCK_ENABLED="$(extract_json_field "${LOCK_VERIFY}" 'console.log(data.status?.numberLock ?? "");')"
check_equals "Dev subscription verification sets the lock tier" "${LOCK_TIER}" "lock_my_number"
check_equals "Dev subscription verification enables number lock" "${LOCK_ENABLED}" "true"

OLD_ACTIVITY="$(node -e 'const date = new Date(); date.setUTCDate(date.getUTCDate() - 20); process.stdout.write(date.toISOString());')"
NOW_ISO="$(node -e 'process.stdout.write(new Date().toISOString())')"
db_exec "update number_assignments set assigned_at = \$2::timestamptz, last_activity_at = \$2::timestamptz where id = \$1" "${LOCK_ASSIGNMENT_ID}" "${OLD_ACTIVITY}"
run_lifecycle "${NOW_ISO}" >/dev/null
LOCK_RELEASED_AT="$(db_scalar "select coalesce(to_char(released_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), '') from number_assignments where id = \$1" "${LOCK_ASSIGNMENT_ID}")"
LOCK_QUARANTINE_COUNT="$(db_scalar "select count(*) from number_quarantine where assignment_id = \$1" "${LOCK_ASSIGNMENT_ID}")"
check_equals "Locked number is not released by lifecycle reclaim" "${LOCK_RELEASED_AT}" ""
check_equals "Locked number does not enter quarantine" "${LOCK_QUARANTINE_COUNT}" "0"

PREMIUM_AUTH="$(oauth_user "apple" "phase5-premium-${RUN_ID}" "dev:phase5-premium-${RUN_ID}:phase5-premium-${RUN_ID}@freeline.dev:Phase5Premium${RUN_ID}")"
PREMIUM_ACCESS_TOKEN="$(extract_json_field "${PREMIUM_AUTH}" 'console.log(data.tokens?.accessToken ?? "");')"
claim_number "${PREMIUM_ACCESS_TOKEN}" "3" >/dev/null
PREMIUM_BASE_STATUS="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/subscriptions/status" -H "Authorization: Bearer ${PREMIUM_ACCESS_TOKEN}")"
PREMIUM_BASE_SMS_CAP="$(extract_json_field "${PREMIUM_BASE_STATUS}" 'console.log(data.allowances?.messages?.monthlyCap ?? 0);')"
PREMIUM_BASE_CALL_CAP="$(extract_json_field "${PREMIUM_BASE_STATUS}" 'console.log(data.allowances?.calls?.monthlyCapMinutes ?? 0);')"
PREMIUM_VERIFY="$(curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/subscriptions/verify" \
  -H "Authorization: Bearer ${PREMIUM_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","productId":"freeline.premium.monthly","provider":"dev","transactionId":"phase5-premium","verificationToken":"dev-freeline.premium.monthly"}')"
PREMIUM_TIER="$(extract_json_field "${PREMIUM_VERIFY}" 'console.log(data.status?.displayTier ?? "");')"
PREMIUM_ADS="$(extract_json_field "${PREMIUM_VERIFY}" 'console.log(data.status?.adsEnabled ?? "");')"
PREMIUM_LOCK="$(extract_json_field "${PREMIUM_VERIFY}" 'console.log(data.status?.numberLock ?? "");')"
PREMIUM_CAPS="$(extract_json_field "${PREMIUM_VERIFY}" 'console.log(data.status?.premiumCaps ?? "");')"
PREMIUM_SMS_CAP="$(extract_json_field "${PREMIUM_VERIFY}" 'console.log(data.allowances?.messages?.monthlyCap ?? 0);')"
PREMIUM_CALL_CAP="$(extract_json_field "${PREMIUM_VERIFY}" 'console.log(data.allowances?.calls?.monthlyCapMinutes ?? 0);')"
check_equals "Dev subscription verification sets the premium tier" "${PREMIUM_TIER}" "premium"
check_equals "Dev subscription verification disables ads" "${PREMIUM_ADS}" "false"
check_equals "Dev subscription verification enables number lock" "${PREMIUM_LOCK}" "true"
check_equals "Dev subscription verification enables premium caps" "${PREMIUM_CAPS}" "true"
if [ "${PREMIUM_SMS_CAP}" -gt "${PREMIUM_BASE_SMS_CAP}" ] && [ "${PREMIUM_CALL_CAP}" -gt "${PREMIUM_BASE_CALL_CAP}" ]; then
  record_pass "Dev subscription verification elevates message and call caps"
else
  record_fail "Dev subscription verification elevates message and call caps"
fi

curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/analytics/events" \
  -H "Authorization: Bearer ${FREE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"ad_impression","properties":{"adType":"banner","placement":"messages_bottom_banner","adUnitId":"dev-banner"}}' >/dev/null
curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/analytics/events" \
  -H "Authorization: Bearer ${FREE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"ad_click","properties":{"adType":"native","placement":"messages_inbox_native"}}' >/dev/null
curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/analytics/events" \
  -H "Authorization: Bearer ${FREE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"rewarded_video_complete","properties":{"adType":"rewarded","placement":"settings_earn_more","rewardType":"text_events"}}' >/dev/null
curl -fsS -X POST "http://127.0.0.1:${API_PORT}/v1/analytics/events" \
  -H "Authorization: Bearer ${FREE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"rewarded_video_abandoned","properties":{"adType":"rewarded","placement":"cap_hit_prompt","rewardType":"call_minutes","secondsWatched":0}}' >/dev/null

sleep 1
ANALYTICS_CONTENT="$(cat "${ANALYTICS_LOG}")"
check_contains "Analytics log records ad impressions" "${ANALYTICS_CONTENT}" "\"eventType\":\"ad_impression\""
check_contains "Analytics log records ad clicks" "${ANALYTICS_CONTENT}" "\"eventType\":\"ad_click\""
check_contains "Analytics log records rewarded completion" "${ANALYTICS_CONTENT}" "\"eventType\":\"rewarded_video_complete\""
check_contains "Analytics log records rewarded abandonment" "${ANALYTICS_CONTENT}" "\"eventType\":\"rewarded_video_abandoned\""

restart_backend

ADFREE_STATUS_AFTER_RESTART="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/subscriptions/status" -H "Authorization: Bearer ${ADFREE_ACCESS_TOKEN}")"
LOCK_STATUS_AFTER_RESTART="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/subscriptions/status" -H "Authorization: Bearer ${LOCK_ACCESS_TOKEN}")"
PREMIUM_STATUS_AFTER_RESTART="$(curl -fsS "http://127.0.0.1:${API_PORT}/v1/subscriptions/status" -H "Authorization: Bearer ${PREMIUM_ACCESS_TOKEN}")"
check_equals "Ad-Free subscription persists across backend restart" "$(extract_json_field "${ADFREE_STATUS_AFTER_RESTART}" 'console.log(data.status?.displayTier ?? "");')" "ad_free"
check_equals "Lock My Number subscription persists across backend restart" "$(extract_json_field "${LOCK_STATUS_AFTER_RESTART}" 'console.log(data.status?.displayTier ?? "");')" "lock_my_number"
check_equals "Premium subscription persists across backend restart" "$(extract_json_field "${PREMIUM_STATUS_AFTER_RESTART}" 'console.log(data.status?.displayTier ?? "");')" "premium"

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
