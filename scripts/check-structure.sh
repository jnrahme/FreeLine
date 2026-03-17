#!/usr/bin/env bash

set -euo pipefail

required_files=(
  "AGENTS.md"
  "PROGRESS.md"
  "SESSION.md"
  "FreeLine-Backend/package.json"
  "FreeLine-Backend/src/index.ts"
  "FreeLine-Backend/src/server.ts"
  "FreeLine-iOS/Sources/App/FreeLineApp.swift"
  "FreeLine-iOS/Sources/App/RootTabView.swift"
  "FreeLine-iOS/Config/AdConfiguration.swift"
  "FreeLine-Android/app/src/main/java/com/freeline/app/MainActivity.kt"
  "FreeLine-Android/app/src/main/java/com/freeline/app/ui/FreeLineApp.kt"
  "FreeLine-Android/app/src/main/java/com/freeline/app/config/AdConfiguration.kt"
  "scripts/next_phase.sh"
  "scripts/run_phase.sh"
  ".github/workflows/ci.yml"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required scaffold file: $file"
    exit 1
  fi
done

echo "Structure check passed."
