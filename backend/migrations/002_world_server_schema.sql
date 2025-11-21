-- =============================================
-- POLYMIR WORLD SERVER DATABASE SCHEMA
-- =============================================
-- Purpose: Live game world state (ephemeral, per-server)
-- Hosted: Per world server instance
-- Separates: Session state from persistent schematics
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For spatial queries

-- =============================================
-- CUSTOM TYPES (must be defined before tables that use them)
-- =============================================

-- Build mode: player's intent when placing blocks (3-position slider)
CREATE TYPE build_mode AS ENUM ('new_schematic', 'extend_build', 'raw_damage');

-- Change type: what kind of voxel modification
CREATE TYPE change_type AS ENUM ('add', 'remove');

-- =============================================
-- MEGACHUNKS (Top-level spatial organization)
-- =============================================
-- Each megachunk = 256×256×256 voxels = 16×16×16 chunks
-- Megachunks form the top-level spatial grid

CREATE TABLE megachunks (
    megachunk_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Coordinates in world-space grid
    mx INTEGER NOT NULL,
    my INTEGER NOT NULL,
    mz INTEGER NOT NULL,

    -- Generation metadata
    seed BIGINT NOT NULL, -- Procedural generation seed
    generator_version VARCHAR(32) NOT NULL DEFAULT 'v1.0',

    -- State
    is_generated BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT false, -- Has active players
    active_player_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(mx, my, mz)
);

CREATE INDEX idx_megachunks_coords ON megachunks(mx, my, mz);
CREATE INDEX idx_megachunks_active ON megachunks(is_active, active_player_count DESC);
CREATE INDEX idx_megachunks_last_accessed ON megachunks(last_accessed DESC);

-- =============================================
-- CELESTIAL BODIES (Planets, asteroids, stations)
-- =============================================

CREATE TABLE celestial_bodies (
    body_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Parent megachunk
    megachunk_id UUID NOT NULL REFERENCES megachunks(megachunk_id) ON DELETE CASCADE,

    -- Position within megachunk (0-255 in each axis)
    local_x REAL NOT NULL CHECK (local_x >= 0 AND local_x < 256),
    local_y REAL NOT NULL CHECK (local_y >= 0 AND local_y < 256),
    local_z REAL NOT NULL CHECK (local_z >= 0 AND local_z < 256),

    -- Velocity (for orbital mechanics)
    velocity_x REAL NOT NULL DEFAULT 0,
    velocity_y REAL NOT NULL DEFAULT 0,
    velocity_z REAL NOT NULL DEFAULT 0,

    -- Rotation
    rotation_x REAL NOT NULL DEFAULT 0,
    rotation_y REAL NOT NULL DEFAULT 0,
    rotation_z REAL NOT NULL DEFAULT 0,
    rotation_w REAL NOT NULL DEFAULT 1,

    -- Angular velocity
    angular_velocity_x REAL NOT NULL DEFAULT 0,
    angular_velocity_y REAL NOT NULL DEFAULT 0.001, -- Default slow rotation
    angular_velocity_z REAL NOT NULL DEFAULT 0,

    -- Body type
    body_type VARCHAR(32) NOT NULL, -- 'planet', 'asteroid', 'station', 'debris'

    -- Generation data
    generation_seed BIGINT,
    schematic_cid TEXT, -- IPFS CID if body is from schematic
    procedural_params JSONB, -- Parameters for procedural generation

    -- Physical properties
    radius REAL NOT NULL CHECK (radius > 0),
    mass REAL NOT NULL CHECK (mass > 0),
    gravity_multiplier REAL NOT NULL DEFAULT 1.0,

    -- Gravitational center (for schematic placement positioning)
    -- Placements are relative to this point
    gravitational_center_x REAL NOT NULL DEFAULT 0,
    gravitational_center_y REAL NOT NULL DEFAULT 0,
    gravitational_center_z REAL NOT NULL DEFAULT 0,

    -- Fracture metadata (matches MVoxFile fracture tracking)
    is_fractured BOOLEAN NOT NULL DEFAULT false,
    parent_body_id UUID REFERENCES celestial_bodies(body_id) ON DELETE SET NULL,
    original_body_id UUID REFERENCES celestial_bodies(body_id) ON DELETE SET NULL, -- Root body before any shattering
    shatter_generation INTEGER NOT NULL DEFAULT 0, -- Split depth (0 = original, 1+ = fragments)
    parent_fragment_id INTEGER, -- Which Voronoi fragment of parent this came from
    fracture_pattern JSONB, -- Pre-computed Voronoi centers for deterministic shattering

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bodies_megachunk ON celestial_bodies(megachunk_id);
CREATE INDEX idx_bodies_type ON celestial_bodies(body_type);
CREATE INDEX idx_bodies_position ON celestial_bodies(local_x, local_y, local_z);
CREATE INDEX idx_bodies_parent ON celestial_bodies(parent_body_id);
CREATE INDEX idx_bodies_original ON celestial_bodies(original_body_id); -- Find all fragments from original body
CREATE INDEX idx_bodies_shatter_gen ON celestial_bodies(shatter_generation); -- Query by fracture depth

-- =============================================
-- PLAYER POSITIONS (Current world state)
-- =============================================

CREATE TABLE player_positions (
    player_id UUID PRIMARY KEY, -- References Central Library players table

    -- Current location
    megachunk_id UUID REFERENCES megachunks(megachunk_id) ON DELETE SET NULL,
    body_id UUID REFERENCES celestial_bodies(body_id) ON DELETE SET NULL,

    -- Position (body-relative if on body, megachunk-relative if in space)
    position_x REAL NOT NULL,
    position_y REAL NOT NULL,
    position_z REAL NOT NULL,

    -- Velocity
    velocity_x REAL NOT NULL DEFAULT 0,
    velocity_y REAL NOT NULL DEFAULT 0,
    velocity_z REAL NOT NULL DEFAULT 0,

    -- Rotation (quaternion)
    rotation_x REAL NOT NULL DEFAULT 0,
    rotation_y REAL NOT NULL DEFAULT 0,
    rotation_z REAL NOT NULL DEFAULT 0,
    rotation_w REAL NOT NULL DEFAULT 1,

    -- Connection state
    is_online BOOLEAN NOT NULL DEFAULT false,
    websocket_connection_id TEXT,

    -- Interest management (which regions player is subscribed to)
    subscribed_megachunks INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    subscribed_bodies UUID[] DEFAULT ARRAY[]::UUID[],

    -- Build mode (3-position slider)
    -- 'new_schematic': blocks form new schematics when clustered
    -- 'extend_build': blocks attach to nearest existing schematic placement
    -- 'raw_damage': direct damage map edits, no build detection (terrain editing)
    current_build_mode build_mode NOT NULL DEFAULT 'new_schematic',

    -- If in 'extend_build' mode, which schematic are we extending?
    extending_placement_id UUID REFERENCES schematic_placements(placement_id) ON DELETE SET NULL,

    -- Timestamps
    last_position_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ
);

CREATE INDEX idx_player_positions_megachunk ON player_positions(megachunk_id);
CREATE INDEX idx_player_positions_body ON player_positions(body_id);
CREATE INDEX idx_player_positions_online ON player_positions(is_online, last_position_update DESC);

-- =============================================
-- CHUNK MODIFICATIONS (Only modified chunks)
-- =============================================
-- Unmodified chunks are procedurally generated on-the-fly
-- Only store chunks that differ from procedural generation

CREATE TABLE chunk_modifications (
    modification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Location
    body_id UUID NOT NULL REFERENCES celestial_bodies(body_id) ON DELETE CASCADE,
    chunk_x INTEGER NOT NULL,
    chunk_y INTEGER NOT NULL,
    chunk_z INTEGER NOT NULL,

    -- IPFS data (actual chunk voxel data)
    chunk_data_cid TEXT NOT NULL, -- IPFS CID of modified chunk
    validation_proof_cid TEXT, -- IPFS CID of consensus proof

    -- Modification metadata
    modified_by UUID NOT NULL, -- Player who made modification
    modification_type VARCHAR(32) NOT NULL, -- 'player_build', 'schematic_placement', 'destruction'

    -- Trust validation
    is_validated BOOLEAN NOT NULL DEFAULT false,
    trust_score_at_modification REAL, -- Player's trust at time of modification

    -- Timestamps
    modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_at TIMESTAMPTZ,

    UNIQUE(body_id, chunk_x, chunk_y, chunk_z) -- One modification record per chunk
);

CREATE INDEX idx_chunk_modifications_body ON chunk_modifications(body_id);
CREATE INDEX idx_chunk_modifications_coords ON chunk_modifications(body_id, chunk_x, chunk_y, chunk_z);
CREATE INDEX idx_chunk_modifications_player ON chunk_modifications(modified_by);
CREATE INDEX idx_chunk_modifications_timestamp ON chunk_modifications(modified_at DESC);

-- =============================================
-- DAMAGE MAP (Individual voxel changes with attribution)
-- =============================================
-- Tracks individual block additions/removals before they become schematics
-- Used for: build detection, attribution tracking, undo history
-- Base terrain is NEVER modified - only this overlay

CREATE TABLE damage_map (
    damage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Location (voxel-level precision)
    body_id UUID NOT NULL REFERENCES celestial_bodies(body_id) ON DELETE CASCADE,
    voxel_x INTEGER NOT NULL,
    voxel_y INTEGER NOT NULL,
    voxel_z INTEGER NOT NULL,
    layer_id INTEGER NOT NULL DEFAULT 0, -- Which scale layer

    -- What changed
    change_type change_type NOT NULL, -- 'add' or 'remove'
    voxel_type INTEGER, -- Block type ID (null for removals)
    voxel_color INTEGER, -- Packed RGB (null for removals)

    -- Attribution: WHO did this
    player_id UUID NOT NULL, -- Who made this change
    trust_score_at_change REAL, -- Player's trust when change was made

    -- Build mode: player's intent when making this change
    build_mode build_mode NOT NULL DEFAULT 'new_schematic',

    -- If build_mode = 'extend_build', which schematic are we extending?
    attached_schematic_placement_id UUID REFERENCES schematic_placements(placement_id) ON DELETE SET NULL,

    -- Build detection tracking
    -- Once converted to a schematic, this links to it
    converted_to_schematic_id UUID, -- Central Library schematic ID (after extraction)
    converted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One entry per voxel position per layer
    UNIQUE(body_id, voxel_x, voxel_y, voxel_z, layer_id)
);

CREATE INDEX idx_damage_map_body ON damage_map(body_id);
CREATE INDEX idx_damage_map_coords ON damage_map(body_id, voxel_x, voxel_y, voxel_z);
CREATE INDEX idx_damage_map_player ON damage_map(player_id);
CREATE INDEX idx_damage_map_build_mode ON damage_map(build_mode) WHERE build_mode != 'raw_damage';
CREATE INDEX idx_damage_map_unconverted ON damage_map(body_id, build_mode) WHERE converted_to_schematic_id IS NULL;
CREATE INDEX idx_damage_map_attached ON damage_map(attached_schematic_placement_id) WHERE attached_schematic_placement_id IS NOT NULL;

-- =============================================
-- DAMAGE MAP HISTORY (Undo support & audit trail)
-- =============================================
-- Every change to damage_map is logged here for undo and auditing

CREATE TABLE damage_map_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Reference to the damage entry (may be deleted)
    damage_id UUID, -- Can be null if entry was deleted
    body_id UUID NOT NULL,
    voxel_x INTEGER NOT NULL,
    voxel_y INTEGER NOT NULL,
    voxel_z INTEGER NOT NULL,
    layer_id INTEGER NOT NULL DEFAULT 0,

    -- What was the change
    change_type change_type NOT NULL,
    voxel_type INTEGER,
    voxel_color INTEGER,

    -- Who and when
    player_id UUID NOT NULL,
    build_mode build_mode NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Was this undone?
    undone_at TIMESTAMPTZ,
    undone_by UUID -- Player who undid this
);

CREATE INDEX idx_damage_history_body ON damage_map_history(body_id);
CREATE INDEX idx_damage_history_player ON damage_map_history(player_id, created_at DESC);
CREATE INDEX idx_damage_history_recent ON damage_map_history(body_id, created_at DESC);

-- =============================================
-- SCHEMATIC PLACEMENTS (Instances in world)
-- =============================================

CREATE TABLE schematic_placements (
    placement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What schematic (references Central Library)
    schematic_id UUID NOT NULL, -- Foreign key to Central Library schematics table
    schematic_cid TEXT NOT NULL, -- IPFS CID (redundant but faster lookups)

    -- Layer-based sparse storage
    -- Each placement targets a specific layer (block/microblock scale)
    -- Layer 0 = full blocks (1m³), Layer 1 = microblocks (1/16 scale), etc.
    layer_id INTEGER NOT NULL DEFAULT 0 CHECK (layer_id >= 0),
    layer_scale_ratio REAL NOT NULL DEFAULT 1.0 CHECK (layer_scale_ratio > 0), -- 1.0 = blocks, 0.0625 = microblocks (1/16)

    -- Where placed
    body_id UUID NOT NULL REFERENCES celestial_bodies(body_id) ON DELETE CASCADE,
    position_x REAL NOT NULL, -- Position relative to body's gravitational center
    position_y REAL NOT NULL,
    position_z REAL NOT NULL,

    -- Rotation (quaternion)
    rotation_x REAL NOT NULL DEFAULT 0,
    rotation_y REAL NOT NULL DEFAULT 0,
    rotation_z REAL NOT NULL DEFAULT 0,
    rotation_w REAL NOT NULL DEFAULT 1,

    -- Who placed it
    placed_by UUID NOT NULL, -- Player ID

    -- Validation
    validation_proof_cid TEXT, -- IPFS CID of placement consensus proof
    is_validated BOOLEAN NOT NULL DEFAULT false,

    -- Timestamps
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_at TIMESTAMPTZ
);

CREATE INDEX idx_placements_body ON schematic_placements(body_id);
CREATE INDEX idx_placements_schematic ON schematic_placements(schematic_id);
CREATE INDEX idx_placements_player ON schematic_placements(placed_by);
CREATE INDEX idx_placements_position ON schematic_placements(body_id, position_x, position_y, position_z);
CREATE INDEX idx_placements_layer ON schematic_placements(body_id, layer_id); -- Query placements by layer for sparse loading

-- =============================================
-- SHIPS / VEHICLES (Player-controlled builds)
-- =============================================
-- Ships are schematic_placements that contain a CONTROL_PANEL block
-- They can move independently through megachunks
-- Players board ships and are anchored to the ship's planar gravity

-- Ship state enum
CREATE TYPE ship_state AS ENUM ('inactive', 'piloted', 'drifting', 'docked', 'destroyed');

CREATE TABLE ships (
    ship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- The schematic placement this ship is derived from
    schematic_placement_id UUID UNIQUE NOT NULL REFERENCES schematic_placements(placement_id) ON DELETE CASCADE,

    -- Ship ownership
    owner_id UUID NOT NULL, -- Player who built/owns the ship
    name VARCHAR(255) NOT NULL DEFAULT 'Unnamed Ship',

    -- Current state
    state ship_state NOT NULL DEFAULT 'inactive',
    pilot_id UUID, -- Player currently piloting (null if no pilot)

    -- Current location (may be different from placement if ship has moved)
    megachunk_id UUID REFERENCES megachunks(megachunk_id) ON DELETE SET NULL,
    position_x REAL NOT NULL DEFAULT 0,
    position_y REAL NOT NULL DEFAULT 0,
    position_z REAL NOT NULL DEFAULT 0,

    -- Velocity (for drifting ships)
    velocity_x REAL NOT NULL DEFAULT 0,
    velocity_y REAL NOT NULL DEFAULT 0,
    velocity_z REAL NOT NULL DEFAULT 0,

    -- Rotation (quaternion)
    rotation_x REAL NOT NULL DEFAULT 0,
    rotation_y REAL NOT NULL DEFAULT 0,
    rotation_z REAL NOT NULL DEFAULT 0,
    rotation_w REAL NOT NULL DEFAULT 1,

    -- Angular velocity
    angular_velocity_x REAL NOT NULL DEFAULT 0,
    angular_velocity_y REAL NOT NULL DEFAULT 0,
    angular_velocity_z REAL NOT NULL DEFAULT 0,

    -- Computed ship properties (from block analysis)
    mass REAL NOT NULL DEFAULT 100,
    total_thrust REAL NOT NULL DEFAULT 0,
    fuel_capacity REAL NOT NULL DEFAULT 0,
    current_fuel REAL NOT NULL DEFAULT 0,
    gyroscope_strength REAL NOT NULL DEFAULT 0,

    -- Thruster/control positions (JSONB for flexibility)
    control_panel_position JSONB, -- {x, y, z} relative to schematic origin
    thrusters JSONB DEFAULT '[]'::JSONB, -- Array of {position: {x,y,z}, power, fuelConsumption}
    pilot_seat_position JSONB, -- {x, y, z} relative to schematic origin
    passenger_seats JSONB DEFAULT '[]'::JSONB, -- Array of {position: {x,y,z}}

    -- Gravity configuration (planar gravity for deck)
    gravity_vector_x REAL NOT NULL DEFAULT 0,
    gravity_vector_y REAL NOT NULL DEFAULT -1, -- Down = -Y by default
    gravity_vector_z REAL NOT NULL DEFAULT 0,

    -- Docking
    docked_to_body_id UUID REFERENCES celestial_bodies(body_id) ON DELETE SET NULL,
    docked_to_ship_id UUID REFERENCES ships(ship_id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_piloted_at TIMESTAMPTZ
);

CREATE INDEX idx_ships_owner ON ships(owner_id);
CREATE INDEX idx_ships_pilot ON ships(pilot_id) WHERE pilot_id IS NOT NULL;
CREATE INDEX idx_ships_megachunk ON ships(megachunk_id);
CREATE INDEX idx_ships_state ON ships(state);
CREATE INDEX idx_ships_placement ON ships(schematic_placement_id);

-- =============================================
-- SHIP PASSENGERS (Players aboard ships)
-- =============================================
-- Track who is on which ship and where

CREATE TABLE ship_passengers (
    passenger_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    ship_id UUID NOT NULL REFERENCES ships(ship_id) ON DELETE CASCADE,
    player_id UUID NOT NULL, -- References player_positions

    -- Position relative to ship origin
    local_x REAL NOT NULL DEFAULT 0,
    local_y REAL NOT NULL DEFAULT 0,
    local_z REAL NOT NULL DEFAULT 0,

    -- Is this the pilot?
    is_pilot BOOLEAN NOT NULL DEFAULT false,

    -- Which seat (if seated)
    seat_index INTEGER, -- null if standing, 0 = pilot seat, 1+ = passenger seats

    -- Timestamps
    boarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(player_id) -- Player can only be on one ship at a time
);

CREATE INDEX idx_ship_passengers_ship ON ship_passengers(ship_id);
CREATE INDEX idx_ship_passengers_player ON ship_passengers(player_id);

-- =============================================
-- REGION SUBSCRIPTIONS (Interest management)
-- =============================================
-- Tracks which players are interested in which spatial regions

CREATE TABLE region_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL, -- References player_positions

    -- Subscription target
    subscription_type VARCHAR(32) NOT NULL, -- 'megachunk', 'body', 'chunk'
    target_megachunk_id UUID REFERENCES megachunks(megachunk_id) ON DELETE CASCADE,
    target_body_id UUID REFERENCES celestial_bodies(body_id) ON DELETE CASCADE,

    -- Chunk-level subscription (if subscription_type = 'chunk')
    chunk_x INTEGER,
    chunk_y INTEGER,
    chunk_z INTEGER,

    -- Timestamps
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_update_sent TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(player_id, subscription_type, target_megachunk_id, target_body_id, chunk_x, chunk_y, chunk_z)
);

CREATE INDEX idx_subscriptions_player ON region_subscriptions(player_id);
CREATE INDEX idx_subscriptions_megachunk ON region_subscriptions(target_megachunk_id);
CREATE INDEX idx_subscriptions_body ON region_subscriptions(target_body_id);

-- =============================================
-- WORLD STATE SNAPSHOTS (for backup/recovery)
-- =============================================

CREATE TABLE world_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Snapshot metadata
    snapshot_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- IPFS data (entire world state)
    snapshot_data_cid TEXT NOT NULL, -- IPFS CID of compressed world state

    -- What's included
    megachunk_count INTEGER NOT NULL,
    body_count INTEGER NOT NULL,
    chunk_modification_count INTEGER NOT NULL,
    schematic_placement_count INTEGER NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_created ON world_snapshots(created_at DESC);

-- =============================================
-- PENDING VALIDATIONS (validation queue)
-- =============================================

CREATE TABLE pending_validations (
    validation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What needs validation
    event_type VARCHAR(64) NOT NULL, -- 'block_placement', 'schematic_placement', 'chunk_modification'
    event_data_cid TEXT NOT NULL, -- IPFS CID of event data

    -- Who submitted
    submitter_id UUID NOT NULL,
    submitter_trust_score REAL NOT NULL,

    -- Location (for finding nearby validators)
    megachunk_id UUID REFERENCES megachunks(megachunk_id) ON DELETE CASCADE,
    body_id UUID REFERENCES celestial_bodies(body_id) ON DELETE CASCADE,

    -- Validation requirements
    required_validators INTEGER NOT NULL DEFAULT 3,
    current_validators INTEGER NOT NULL DEFAULT 0,

    -- Status
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'expired'

    -- Timestamps
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_pending_validations_status ON pending_validations(status, submitted_at);
CREATE INDEX idx_pending_validations_location ON pending_validations(megachunk_id, body_id);
CREATE INDEX idx_pending_validations_expires ON pending_validations(expires_at);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Update megachunk last_accessed on access
CREATE OR REPLACE FUNCTION update_megachunk_access()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_megachunk_access
BEFORE UPDATE ON megachunks
FOR EACH ROW
EXECUTE FUNCTION update_megachunk_access();

-- Update body last_updated timestamp
CREATE OR REPLACE FUNCTION update_body_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_body_timestamp
BEFORE UPDATE ON celestial_bodies
FOR EACH ROW
EXECUTE FUNCTION update_body_timestamp();

-- Update player position timestamp
CREATE OR REPLACE FUNCTION update_player_position_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_position_update = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_player_position_timestamp
BEFORE UPDATE ON player_positions
FOR EACH ROW
EXECUTE FUNCTION update_player_position_timestamp();

-- Increment megachunk active player count
CREATE OR REPLACE FUNCTION update_megachunk_player_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.is_online = true AND OLD.is_online = false) THEN
        UPDATE megachunks
        SET active_player_count = active_player_count + 1,
            is_active = true
        WHERE megachunk_id = NEW.megachunk_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.is_online = false AND OLD.is_online = true THEN
        UPDATE megachunks
        SET active_player_count = GREATEST(0, active_player_count - 1)
        WHERE megachunk_id = NEW.megachunk_id;
    ELSIF TG_OP = 'DELETE' AND OLD.is_online = true THEN
        UPDATE megachunks
        SET active_player_count = GREATEST(0, active_player_count - 1)
        WHERE megachunk_id = OLD.megachunk_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_megachunk_player_count
AFTER INSERT OR UPDATE OR DELETE ON player_positions
FOR EACH ROW
EXECUTE FUNCTION update_megachunk_player_count();

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Active players by megachunk
CREATE VIEW active_players_by_megachunk AS
SELECT
    m.megachunk_id,
    m.mx,
    m.my,
    m.mz,
    COUNT(pp.player_id) as player_count
FROM megachunks m
LEFT JOIN player_positions pp ON m.megachunk_id = pp.megachunk_id AND pp.is_online = true
GROUP BY m.megachunk_id, m.mx, m.my, m.mz;

-- Bodies with player activity
CREATE VIEW active_bodies AS
SELECT
    cb.*,
    COUNT(pp.player_id) as player_count,
    COUNT(DISTINCT cm.modification_id) as modification_count,
    COUNT(DISTINCT sp.placement_id) as placement_count
FROM celestial_bodies cb
LEFT JOIN player_positions pp ON cb.body_id = pp.body_id AND pp.is_online = true
LEFT JOIN chunk_modifications cm ON cb.body_id = cm.body_id
LEFT JOIN schematic_placements sp ON cb.body_id = sp.body_id
GROUP BY cb.body_id;

-- Recent modifications
CREATE VIEW recent_modifications AS
SELECT
    cm.*,
    cb.body_type,
    cb.radius,
    m.mx,
    m.my,
    m.mz
FROM chunk_modifications cm
JOIN celestial_bodies cb ON cm.body_id = cb.body_id
JOIN megachunks m ON cb.megachunk_id = m.megachunk_id
ORDER BY cm.modified_at DESC;

-- =============================================
-- CLEANUP FUNCTIONS (for inactive data)
-- =============================================

-- Clean up old disconnected players
CREATE OR REPLACE FUNCTION cleanup_disconnected_players(days_threshold INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM player_positions
    WHERE is_online = false
    AND disconnected_at < NOW() - (days_threshold || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up expired validations
CREATE OR REPLACE FUNCTION cleanup_expired_validations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    UPDATE pending_validations
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE megachunks IS 'Top-level spatial organization - 256³ voxel volumes';
COMMENT ON TABLE celestial_bodies IS 'Planets, asteroids, stations within megachunks';
COMMENT ON TABLE player_positions IS 'Current player positions and connection state';
COMMENT ON TABLE chunk_modifications IS 'Only chunks that differ from procedural generation';
COMMENT ON TABLE schematic_placements IS 'Instances of schematics placed in world';
COMMENT ON TABLE region_subscriptions IS 'Interest management for network updates';
COMMENT ON TABLE pending_validations IS 'Queue for trust-based validation requests';

COMMENT ON COLUMN chunk_modifications.chunk_data_cid IS 'IPFS CID - actual voxel data';
COMMENT ON COLUMN celestial_bodies.local_x IS 'Position within megachunk (0-255)';
COMMENT ON COLUMN player_positions.subscribed_megachunks IS 'Array of megachunk IDs for interest management';
