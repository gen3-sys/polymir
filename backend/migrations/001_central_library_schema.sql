-- =============================================
-- POLYMIR CENTRAL LIBRARY DATABASE SCHEMA
-- =============================================
-- Purpose: Global schematic registry, trust scores, server federation
-- Hosted: Main server (persistent, authoritative)
-- Separates: Metadata from actual .mvox files (stored on IPFS)
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- PLAYERS & TRUST SYSTEM
-- =============================================

CREATE TABLE players (
    player_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(32) UNIQUE NOT NULL,
    trust_score REAL NOT NULL DEFAULT 0.5 CHECK (trust_score >= 0.0 AND trust_score <= 1.0),

    -- Trust metadata
    validations_submitted INTEGER NOT NULL DEFAULT 0,
    validations_correct INTEGER NOT NULL DEFAULT 0,
    validations_incorrect INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Auth (basic for now)
    password_hash TEXT, -- bcrypt hash

    CONSTRAINT trust_score_valid CHECK (validations_submitted >= validations_correct + validations_incorrect)
);

CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_trust_score ON players(trust_score DESC);
CREATE INDEX idx_players_last_active ON players(last_active DESC);

-- =============================================
-- SCHEMATICS (Metadata + IPFS CIDs)
-- =============================================

CREATE TABLE schematics (
    schematic_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Attribution
    creator_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- IPFS content addressing (NOT the actual file!)
    file_cid TEXT NOT NULL UNIQUE, -- IPFS CID of .mvox file
    thumbnail_cid TEXT, -- IPFS CID of preview image

    -- Dimensions
    size_x INTEGER NOT NULL CHECK (size_x > 0 AND size_x <= 256),
    size_y INTEGER NOT NULL CHECK (size_y > 0 AND size_y <= 256),
    size_z INTEGER NOT NULL CHECK (size_z > 0 AND size_z <= 256),
    voxel_count INTEGER NOT NULL CHECK (voxel_count > 0),

    -- Classification
    category VARCHAR(64) NOT NULL,
    tags TEXT[], -- Array of tags
    biomes TEXT[], -- Which biomes this can spawn in

    -- Metadata
    is_planet BOOLEAN NOT NULL DEFAULT false, -- Planet vs structure
    spawn_frequency REAL DEFAULT 0.0 CHECK (spawn_frequency >= 0.0 AND spawn_frequency <= 1.0),

    -- Statistics
    download_count INTEGER NOT NULL DEFAULT 0,
    placement_count INTEGER NOT NULL DEFAULT 0,

    -- Validation
    is_validated BOOLEAN NOT NULL DEFAULT false,
    validation_proof_cid TEXT, -- IPFS CID of consensus proof

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schematics_creator ON schematics(creator_id);
CREATE INDEX idx_schematics_category ON schematics(category);
CREATE INDEX idx_schematics_tags ON schematics USING GIN(tags);
CREATE INDEX idx_schematics_created_at ON schematics(created_at DESC);
CREATE INDEX idx_schematics_download_count ON schematics(download_count DESC);
CREATE INDEX idx_schematics_file_cid ON schematics(file_cid);

-- =============================================
-- SCHEMATIC USAGE TRACKING (for creator rewards)
-- =============================================

CREATE TABLE schematic_usage_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schematic_id UUID NOT NULL REFERENCES schematics(schematic_id) ON DELETE CASCADE,

    -- Who placed it and where
    placed_by UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    world_server_id UUID NOT NULL, -- Which world server (foreign key added later)

    -- Location (megachunk coordinates)
    megachunk_x INTEGER NOT NULL,
    megachunk_y INTEGER NOT NULL,
    megachunk_z INTEGER NOT NULL,
    body_id UUID, -- If placed on a celestial body

    -- Timestamp
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_schematic ON schematic_usage_events(schematic_id);
CREATE INDEX idx_usage_creator ON schematic_usage_events(placed_by);
CREATE INDEX idx_usage_timestamp ON schematic_usage_events(placed_at DESC);

-- =============================================
-- SERVER REGISTRY (Supercluster Federation)
-- =============================================

CREATE TABLE servers (
    server_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Server identity
    server_name VARCHAR(255) NOT NULL UNIQUE,
    libp2p_peer_id TEXT NOT NULL UNIQUE, -- libp2p multiaddr

    -- Federation metadata
    ruleset_hash TEXT NOT NULL, -- Servers with same hash can link

    -- Spatial position in meta-server grid
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    position_z INTEGER NOT NULL DEFAULT 0,

    -- Connectivity
    is_online BOOLEAN NOT NULL DEFAULT true,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- API endpoints
    api_url TEXT NOT NULL,
    websocket_url TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_servers_online ON servers(is_online, last_heartbeat DESC);
CREATE INDEX idx_servers_position ON servers(position_x, position_y, position_z);
CREATE INDEX idx_servers_ruleset ON servers(ruleset_hash);

-- Add foreign key to usage events
ALTER TABLE schematic_usage_events
    ADD CONSTRAINT fk_usage_server
    FOREIGN KEY (world_server_id) REFERENCES servers(server_id) ON DELETE CASCADE;

-- =============================================
-- VALIDATION CONSENSUS RESULTS
-- =============================================

CREATE TABLE consensus_results (
    consensus_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What was validated
    event_type VARCHAR(64) NOT NULL, -- 'block_placement', 'schematic_placement', 'chunk_modification'
    event_data_cid TEXT NOT NULL, -- IPFS CID of event data

    -- Who submitted
    submitter_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,

    -- Validation results
    total_validators INTEGER NOT NULL DEFAULT 0,
    agree_count INTEGER NOT NULL DEFAULT 0,
    disagree_count INTEGER NOT NULL DEFAULT 0,

    -- Consensus outcome
    is_valid BOOLEAN, -- NULL = pending, TRUE = passed, FALSE = rejected
    consensus_proof_cid TEXT, -- IPFS CID of signed validation results

    -- Location context
    world_server_id UUID REFERENCES servers(server_id) ON DELETE SET NULL,
    megachunk_x INTEGER,
    megachunk_y INTEGER,
    megachunk_z INTEGER,

    -- Timestamps
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_consensus_submitter ON consensus_results(submitter_id);
CREATE INDEX idx_consensus_status ON consensus_results(is_valid, resolved_at DESC);
CREATE INDEX idx_consensus_event_cid ON consensus_results(event_data_cid);

-- =============================================
-- VALIDATION VOTES (individual validator responses)
-- =============================================

CREATE TABLE validation_votes (
    vote_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consensus_id UUID NOT NULL REFERENCES consensus_results(consensus_id) ON DELETE CASCADE,

    -- Validator
    validator_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,

    -- Vote
    agrees BOOLEAN NOT NULL, -- TRUE = valid, FALSE = invalid
    computation_proof_cid TEXT, -- IPFS CID of validator's calculation proof

    -- Timestamp
    voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(consensus_id, validator_id) -- One vote per validator per consensus
);

CREATE INDEX idx_votes_consensus ON validation_votes(consensus_id);
CREATE INDEX idx_votes_validator ON validation_votes(validator_id);

-- =============================================
-- TRUST HISTORY (audit trail of trust changes)
-- =============================================

CREATE TABLE trust_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,

    -- Trust change
    old_score REAL NOT NULL,
    new_score REAL NOT NULL,
    delta REAL NOT NULL,

    -- Reason
    reason VARCHAR(64) NOT NULL, -- 'validation_correct', 'validation_incorrect', 'consensus_failed'
    related_consensus_id UUID REFERENCES consensus_results(consensus_id) ON DELETE SET NULL,

    -- Timestamp
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trust_history_player ON trust_history(player_id, changed_at DESC);
CREATE INDEX idx_trust_history_timestamp ON trust_history(changed_at DESC);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Update schematic updated_at timestamp
CREATE OR REPLACE FUNCTION update_schematic_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_schematic_timestamp
BEFORE UPDATE ON schematics
FOR EACH ROW
EXECUTE FUNCTION update_schematic_timestamp();

-- Update player last_active timestamp
CREATE OR REPLACE FUNCTION update_player_last_active()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_active = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_player_last_active
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION update_player_last_active();

-- Increment schematic placement count
CREATE OR REPLACE FUNCTION increment_schematic_placement()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE schematics
    SET placement_count = placement_count + 1
    WHERE schematic_id = NEW.schematic_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_placement_count
AFTER INSERT ON schematic_usage_events
FOR EACH ROW
EXECUTE FUNCTION increment_schematic_placement();

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Top creators by schematic count
CREATE VIEW top_creators AS
SELECT
    p.player_id,
    p.username,
    p.trust_score,
    COUNT(s.schematic_id) as schematic_count,
    SUM(s.download_count) as total_downloads,
    SUM(s.placement_count) as total_placements
FROM players p
LEFT JOIN schematics s ON p.player_id = s.creator_id
GROUP BY p.player_id, p.username, p.trust_score
ORDER BY schematic_count DESC;

-- Popular schematics
CREATE VIEW popular_schematics AS
SELECT
    s.*,
    p.username as creator_name,
    p.trust_score as creator_trust
FROM schematics s
JOIN players p ON s.creator_id = p.player_id
ORDER BY s.download_count DESC, s.placement_count DESC;

-- Trust leaderboard
CREATE VIEW trust_leaderboard AS
SELECT
    player_id,
    username,
    trust_score,
    validations_submitted,
    validations_correct,
    CASE
        WHEN validations_submitted > 0
        THEN ROUND((validations_correct::NUMERIC / validations_submitted::NUMERIC) * 100, 2)
        ELSE 0
    END as accuracy_percentage
FROM players
WHERE validations_submitted > 10 -- Must have at least 10 validations
ORDER BY trust_score DESC, accuracy_percentage DESC;

-- =============================================
-- SEED DATA (optional - for testing)
-- =============================================

-- Create system player for procedural content
INSERT INTO players (player_id, username, trust_score, password_hash)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'SYSTEM',
    1.0,
    NULL
) ON CONFLICT (player_id) DO NOTHING;

-- Create initial server entry
INSERT INTO servers (
    server_id,
    server_name,
    libp2p_peer_id,
    ruleset_hash,
    api_url,
    websocket_url
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'polymir-main',
    'PLACEHOLDER_PEER_ID',
    'DEFAULT_RULESET_V1',
    'http://localhost:3000',
    'ws://localhost:3001'
) ON CONFLICT (server_id) DO NOTHING;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE players IS 'Global player registry with trust scores';
COMMENT ON TABLE schematics IS 'Schematic metadata - actual .mvox files on IPFS';
COMMENT ON TABLE schematic_usage_events IS 'Tracks where schematics are placed for creator rewards';
COMMENT ON TABLE servers IS 'Supercluster server federation registry';
COMMENT ON TABLE consensus_results IS 'Aggregated validation outcomes';
COMMENT ON TABLE validation_votes IS 'Individual validator votes for consensus';
COMMENT ON TABLE trust_history IS 'Audit trail of trust score changes';

COMMENT ON COLUMN schematics.file_cid IS 'IPFS CID - NOT the actual file data';
COMMENT ON COLUMN players.trust_score IS 'Range 0.0-1.0. High trust = fast-tracked actions';
COMMENT ON COLUMN servers.ruleset_hash IS 'Servers with matching hash can spatially link';
