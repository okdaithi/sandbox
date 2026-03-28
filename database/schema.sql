-- Create database
CREATE DATABASE scenario_planning;

-- Use the database
\c scenario_planning;

-- Create tables
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('facilitator', 'team_member')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  initial_state JSONB,
  rules_definition JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES scenarios(id),
  facilitator_id UUID REFERENCES users(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'active', 'completed', 'paused')),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  current_state JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  name VARCHAR(255) NOT NULL,
  members JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  team_id UUID REFERENCES teams(id),
  decision_data JSONB NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for foreign key lookups and common filters
CREATE INDEX idx_sessions_scenario_id ON sessions(scenario_id);
CREATE INDEX idx_sessions_facilitator_id ON sessions(facilitator_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_teams_session_id ON teams(session_id);
CREATE INDEX idx_decisions_session_id ON decisions(session_id);
CREATE INDEX idx_decisions_session_timestamp ON decisions(session_id, timestamp);
CREATE INDEX idx_decisions_unprocessed ON decisions(processed) WHERE processed = false;
CREATE INDEX idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX idx_sessions_current_state ON sessions USING GIN(current_state);

-- Insert sample data
INSERT INTO scenarios (name, description, initial_state, rules_definition) VALUES
('Sample Scenario', 'A basic scenario for testing', '{"phase": "initial"}', '{"rules": []}');

INSERT INTO users (username, password_hash, role) VALUES
('facilitator1', '$2a$10$example.hash', 'facilitator'),
('team1', '$2a$10$example.hash', 'team_member');