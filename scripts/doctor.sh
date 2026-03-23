#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

required_failures=0
optional_failures=0

check_file() {
  local path="$1"
  if [[ -e "$REPO_ROOT/$path" ]]; then
    printf '[ok]   %s\n' "$path"
  else
    printf '[fail] %s\n' "$path"
    required_failures=$((required_failures + 1))
  fi
}

command_version() {
  local name="$1"
  case "$name" in
    bash)
      bash --version | head -n 1
      ;;
    git)
      git --version
      ;;
    make)
      make --version | head -n 1
      ;;
    node)
      node --version
      ;;
    npm)
      npm --version
      ;;
    java)
      java -version 2>&1 | head -n 1
      ;;
    adb)
      adb version | head -n 1
      ;;
    emulator)
      emulator -version | head -n 1
      ;;
    xcodebuild)
      xcodebuild -version | paste -sd ' ' -
      ;;
    xcrun)
      printf 'xcrun available\n'
      ;;
    ios-deploy)
      ios-deploy --version 2>/dev/null | head -n 1 || printf 'ios-deploy available\n'
      ;;
    *)
      printf 'available\n'
      ;;
  esac
}

check_required_cmd() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf '[ok]   %-12s %s\n' "$name" "$(command_version "$name")"
  else
    printf '[fail] %-12s missing\n' "$name"
    required_failures=$((required_failures + 1))
  fi
}

check_optional_cmd() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf '[ok]   %-12s %s\n' "$name" "$(command_version "$name")"
  else
    printf '[warn] %-12s missing\n' "$name"
    optional_failures=$((optional_failures + 1))
  fi
}

echo 'FreeLine CLI doctor'
echo
echo 'Repo files'
check_file "Makefile"
check_file "package.json"
check_file "PROGRESS.md"
check_file "scripts/next_phase.sh"
check_file "FreeLine-Android/gradlew"
check_file "FreeLine-iOS/FreeLine.xcodeproj/project.pbxproj"

echo
echo 'Core commands'
check_required_cmd bash
check_required_cmd git
check_required_cmd make
check_required_cmd node
check_required_cmd npm

echo
echo 'Android commands'
check_optional_cmd java
check_optional_cmd adb
check_optional_cmd emulator

echo
echo 'iOS commands'
check_optional_cmd xcodebuild
check_optional_cmd xcrun
check_optional_cmd ios-deploy

echo
printf 'Required failures: %d\n' "$required_failures"
printf 'Optional warnings: %d\n' "$optional_failures"

if [[ "$required_failures" -gt 0 ]]; then
  exit 1
fi
