-- Optional manual bootstrap script for local development.
-- Run from an existing postgres database (for example, `postgres`) using:
--   psql -d postgres -f database/bootstrap.sql

CREATE DATABASE scenario_planning;

\connect scenario_planning;

\i database/schema.sql
