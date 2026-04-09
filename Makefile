.DEFAULT_GOAL := help

# ─── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help: ## Show available commands
	@echo ""
	@echo "Scenario Planning App"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Setup ────────────────────────────────────────────────────────────────────
.PHONY: setup
setup: ## First-time setup: configure .env, start services, create admin account
	@./setup.sh

# ─── Services ─────────────────────────────────────────────────────────────────
.PHONY: up
up: ## Start all services in the background
	docker compose up -d

.PHONY: down
down: ## Stop all services
	docker compose down

.PHONY: build
build: ## Rebuild images and restart services
	docker compose up -d --build

.PHONY: logs
logs: ## Tail logs for all services (Ctrl-C to stop)
	docker compose logs -f

.PHONY: logs-backend
logs-backend: ## Tail backend logs only
	docker compose logs -f backend

.PHONY: logs-frontend
logs-frontend: ## Tail frontend logs only
	docker compose logs -f frontend

# ─── Status ───────────────────────────────────────────────────────────────────
.PHONY: status
status: ## Check health of all services
	@echo ""
	@docker compose ps
	@echo ""
	@printf "Backend health: " && \
		curl -sf http://localhost:5000/api/health \
			&& echo " OK" \
			|| echo " NOT READY (run 'make logs-backend' to investigate)"
	@echo ""

# ─── Database ─────────────────────────────────────────────────────────────────
.PHONY: seed
seed: ## Re-run scenario seed data against the running database
	@PGUSER=$$(grep '^POSTGRES_USER=' .env | cut -d= -f2) && \
	PGDB=$$(grep '^POSTGRES_DB=' .env | cut -d= -f2) && \
	docker compose exec -T db psql -U "$$PGUSER" -d "$$PGDB" -f /docker-entrypoint-initdb.d/02_seed.sql && \
	echo "Seed complete."

.PHONY: psql
psql: ## Open a psql shell in the database container
	@PGUSER=$$(grep '^POSTGRES_USER=' .env | cut -d= -f2) && \
	PGDB=$$(grep '^POSTGRES_DB=' .env | cut -d= -f2) && \
	docker compose exec db psql -U "$$PGUSER" -d "$$PGDB"

# ─── Testing ──────────────────────────────────────────────────────────────────
.PHONY: test
test: ## Run backend tests
	cd backend && npm test

# ─── Reset ────────────────────────────────────────────────────────────────────
.PHONY: reset
reset: ## Destroy all volumes and restart fresh (WARNING: deletes all data)
	@echo "WARNING: This will delete all database data and volumes."
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 0
	docker compose down -v
	docker compose up -d --build
	@echo ""
	@echo "Services restarted with a fresh database."
	@echo "Schema and seed data will be applied automatically."
	@echo "Create a new admin account: make create-admin"

.PHONY: create-admin
create-admin: ## Create a new facilitator account (prompts for username/password)
	@read -p "Username [admin]: " user && user=$${user:-admin} && \
	read -sp "Password: " pass && echo "" && \
	curl -s -X POST http://localhost:5000/api/auth/register \
		-H 'Content-Type: application/json' \
		-d "{\"username\":\"$$user\",\"password\":\"$$pass\",\"role\":\"facilitator\"}" \
		| grep -q '"id"' \
		&& echo "Account '$$user' created." \
		|| echo "Failed to create account (user may already exist)."
