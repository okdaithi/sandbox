-- Schema initialization (auto-run by PostgreSQL on fresh volume)
-- Uses IF NOT EXISTS so it is safe to re-run against an existing database.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('facilitator', 'team_member')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  initial_state JSONB,
  rules_definition JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES scenarios(id),
  facilitator_id UUID REFERENCES users(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'active', 'completed', 'paused')),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  current_state JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  name VARCHAR(255) NOT NULL,
  members JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  team_id UUID REFERENCES teams(id),
  decision_data JSONB NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for foreign key lookups and common filters
CREATE INDEX IF NOT EXISTS idx_sessions_scenario_id ON sessions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sessions_facilitator_id ON sessions(facilitator_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_teams_session_id ON teams(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session_id ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session_timestamp ON decisions(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_decisions_unprocessed ON decisions(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_current_state ON sessions USING GIN(current_state);
