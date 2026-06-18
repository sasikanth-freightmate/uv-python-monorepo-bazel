-- Dev-only bootstrap: create a least-privilege LOGIN role for the application.
--
-- Why: the app must connect as a NON-OWNER, non-superuser role for Postgres RLS
-- (ADR-0011) to actually be ENFORCED. The default `freightmate` user owns the
-- tables and is a superuser, so it BYPASSES every RLS policy — fine for running
-- migrations, useless for verifying tenant isolation.
--
-- This file runs once, on first cluster initialization (empty data dir). If a
-- postgres_data volume already exists, recreate it for this to take effect:
--     docker compose -f .devcontainer/docker-compose.yml down -v

-- `flow_app` is the privilege-holding role that migrations GRANT table access to
-- (migration 0001 also creates it idempotently as NOLOGIN). Pre-create it here
-- so the login role below can be granted membership before migrations run.
DO $$ BEGIN
  CREATE ROLE flow_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The login role the services use. It owns nothing and is not a superuser, so
-- RLS policies apply to it; it inherits flow_app's table privileges.
DO $$ BEGIN
  CREATE ROLE flow LOGIN PASSWORD 'flow' INHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT flow_app TO flow;
