#!/bin/bash
# Phase 0: Foundation verification script
# Run from repo root: bash phases/0-foundation/verify.sh

set -e

PASS=0
FAIL=0
RESULTS=()

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

echo "========================================="
echo "Phase 0: Foundation Verification"
echo "========================================="

# 1. Repo structure
check "FreeLine-Backend directory exists" test -d FreeLine-Backend
check "FreeLine-iOS directory exists" test -d FreeLine-iOS
check "FreeLine-Android directory exists" test -d FreeLine-Android
check "root package.json exists" test -f package.json

# 2. Build checks
check "npm run build succeeds" npm run build
check "npm run lint succeeds" npm run lint

# 3. TypeScript
check "npm run typecheck succeeds" npm run typecheck

# 4. Backend health
check "docker compose up starts" docker compose up -d postgres redis --wait
check "database migrations run cleanly" npm run migrate --prefix FreeLine-Backend
SERVER_PID=""
if npm run start --prefix FreeLine-Backend > /tmp/freeline_backend.log 2>&1 &
then
  SERVER_PID=$!
  sleep 3
  check "backend health endpoint returns 200" curl -sf http://localhost:3000/health
else
  RESULTS+=("FAIL: backend failed to start")
  FAIL=$((FAIL + 1))
fi

# 5. Key files exist
check ".env.example exists" test -f .env.example
check "TelephonyProvider interface exists" grep -r "TelephonyProvider" FreeLine-Backend/src/
check "BandwidthProvider implementation exists" grep -r "BandwidthProvider" FreeLine-Backend/src/
check "Number search endpoint returns seeded results" bash -lc 'curl -sf "http://localhost:3000/v1/numbers/search?areaCode=415" | node -e '"'"'const fs = require("node:fs"); const data = JSON.parse(fs.readFileSync(0, "utf8")); const numbers = Array.isArray(data.numbers) ? data.numbers : []; process.exit(numbers.some((entry) => typeof entry.phoneNumber === "string" && /^\+1415\d{7}$/.test(entry.phoneNumber)) ? 0 : 1);'"'"''
check "docker-compose.yml exists" test -f docker-compose.yml

# 6. Mobile scaffolds
check "iOS app root exists" test -f FreeLine-iOS/Sources/App/FreeLineApp.swift
check "Android app root exists" test -f FreeLine-Android/app/src/main/java/com/freeline/app/MainActivity.kt
check "iOS ad config placeholder exists" test -f FreeLine-iOS/Config/AdConfiguration.swift
check "Android ad config placeholder exists" test -f FreeLine-Android/app/src/main/java/com/freeline/app/config/AdConfiguration.kt

# 7. CI
check "GitHub Actions workflow exists" test -f .github/workflows/ci.yml

# Cleanup
if [ -n "$SERVER_PID" ]; then
  kill "$SERVER_PID" > /dev/null 2>&1 || true
fi
docker compose down > /dev/null 2>&1 || true

echo ""
echo "========================================="
echo "Results"
echo "========================================="
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "PASSED: $PASS / $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
  echo "STATUS: FAIL"
  exit 1
else
  echo "STATUS: PASS"
  exit 0
fi
