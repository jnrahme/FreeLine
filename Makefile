SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

PHASE ?=
IOS_SCRIPT := scripts/run_ios.sh
ANDROID_SCRIPT := scripts/run_android.sh
DOCTOR_SCRIPT := scripts/doctor.sh
STATUS_SCRIPT := scripts/status.sh
PROOF_SCRIPT := scripts/capture_proof.sh

.PHONY: help install backend-install admin-install backend-dev admin-dev start build lint typecheck test
.PHONY: verify verify-root verify-backend verify-admin verify-ios verify-android verify-native verify-full
.PHONY: run-android-device run-android-emulator run-ios-device run-ios-sim
.PHONY: current-phase next-phase run-phase verify-phase proof-ios proof-android doctor status

help: ## Show the available top-level CLI commands
	@awk 'BEGIN {FS = ": ## "}; /^[a-zA-Z0-9_.-]+: ## / { printf "  %-22s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install backend and admin dependencies
	@npm install --prefix FreeLine-Backend
	@npm install --prefix apps/admin

backend-install: ## Install backend dependencies only
	@npm install --prefix FreeLine-Backend

admin-install: ## Install admin dependencies only
	@npm install --prefix apps/admin

backend-dev: ## Run the backend API in watch mode
	@npm run dev --prefix FreeLine-Backend

admin-dev: ## Run the admin app in development mode
	@npm run dev --prefix apps/admin

start: ## Run the backend API once
	@npm run start --prefix FreeLine-Backend

build: ## Run the root build command
	@npm run build

lint: ## Run the root lint command
	@npm run lint

typecheck: ## Run the root typecheck command
	@npm run typecheck

test: ## Run the root test command
	@npm run test

verify: ## Run the canonical repo verification gate
	@npm run build
	@npm run lint
	@npm run typecheck
	@npm run test

verify-root: ## Alias for the canonical repo verification gate
	@$(MAKE) verify

verify-backend: ## Build, lint, typecheck, and test the backend
	@npm run build --prefix FreeLine-Backend
	@npm run lint --prefix FreeLine-Backend
	@npm run typecheck --prefix FreeLine-Backend
	@npm run test --prefix FreeLine-Backend

verify-admin: ## Build, lint, and typecheck the admin app
	@npm run build --prefix apps/admin
	@npm run lint --prefix apps/admin
	@npm run typecheck --prefix apps/admin

verify-ios: ## Build the iOS app for the first available simulator
	@bash $(IOS_SCRIPT) verify

verify-android: ## Run Android unit tests, lint, and a debug build
	@cd FreeLine-Android && ./gradlew testDebugUnitTest lint assembleDebug --no-daemon

verify-native: ## Run both native platform verification commands
	@$(MAKE) verify-android
	@$(MAKE) verify-ios

verify-full: ## Run repo verification plus native verification
	@$(MAKE) verify
	@$(MAKE) verify-native

run-android-device: ## Build, install, and launch on the first connected Android device
	@bash $(ANDROID_SCRIPT) device

run-android-emulator: ## Boot the first AVD if needed, then install and launch on Android
	@bash $(ANDROID_SCRIPT) emulator

run-ios-device: ## Build, install, and launch on the first connected iPhone
	@bash $(IOS_SCRIPT) device

run-ios-sim: ## Build, install, and launch on the first available iPhone simulator
	@bash $(IOS_SCRIPT) sim

current-phase: ## Print the current phase from PROGRESS.md
	@bash scripts/next_phase.sh --current

next-phase: ## Print the current unresolved target phase
	@bash scripts/next_phase.sh

run-phase: ## Run the canonical phase helper (use PHASE=<dir> to override)
	@bash scripts/run_phase.sh $(PHASE)

verify-phase: ## Run phases/<phase>/verify.sh for PHASE=<dir> or the current target
	@phase="$(PHASE)"; \
	if [[ -z "$$phase" ]]; then \
		phase="$$(bash scripts/next_phase.sh)"; \
	fi; \
	if [[ -z "$$phase" ]]; then \
		echo "No unresolved phase found."; \
		exit 0; \
	fi; \
	bash "phases/$$phase/verify.sh"

proof-ios: ## Capture iOS proof for PHASE=<dir> or the current supported target
	@bash $(PROOF_SCRIPT) "$(PHASE)" ios

proof-android: ## Capture Android proof for PHASE=<dir> or the current supported target
	@bash $(PROOF_SCRIPT) "$(PHASE)" android

doctor: ## Check CLI prerequisites and print version diagnostics
	@bash $(DOCTOR_SCRIPT)

status: ## Show branch, worktree, current phase, next target, and blocker summary
	@bash $(STATUS_SCRIPT)
