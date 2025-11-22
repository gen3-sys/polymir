-- ============================================================================
-- POLYMIR Avatar System Database Schema
-- Migration: 003_avatars_schema.sql
-- Description: Tables for storing voxel avatars, thumbnails, and sharing
-- ============================================================================

-- Avatar storage table
CREATE TABLE IF NOT EXISTS avatars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

    -- Avatar metadata
    name VARCHAR(64) NOT NULL,
    description TEXT DEFAULT '',

    -- Voxel data (compressed binary)
    voxel_data BYTEA NOT NULL,

    -- Rig configuration (bone weights, spring bone regions, expressions)
    rig_config JSONB DEFAULT '{}',

    -- Palette data (16 colors max, stored separately for quick preview)
    palette_data JSONB DEFAULT '[]',

    -- Auto-generated preview thumbnail (256x256 PNG, base64)
    thumbnail BYTEA,

    -- Render preference
    render_preference VARCHAR(16) DEFAULT 'auto' CHECK (render_preference IN ('cube', 'smooth', 'auto')),

    -- Sharing settings
    is_public BOOLEAN DEFAULT false,
    is_template BOOLEAN DEFAULT false,  -- Can be used as starter template
    allow_remix BOOLEAN DEFAULT true,   -- Allow others to clone and modify

    -- Player's active avatar flag
    is_default BOOLEAN DEFAULT false,

    -- Statistics
    download_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,

    -- Validation status
    is_validated BOOLEAN DEFAULT false,
    validation_errors JSONB DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,

    -- Versioning
    version INTEGER DEFAULT 1,
    parent_id UUID REFERENCES avatars(id) ON DELETE SET NULL,  -- For remixes

    -- Size constraints (computed on save)
    voxel_count INTEGER DEFAULT 0,
    file_size_bytes INTEGER DEFAULT 0
);

-- Ensure only one default avatar per player
CREATE UNIQUE INDEX IF NOT EXISTS idx_avatars_default_per_player
    ON avatars(owner_id) WHERE is_default = true;

-- Index for player's avatars
CREATE INDEX IF NOT EXISTS idx_avatars_owner ON avatars(owner_id);

-- Index for public avatars (browsing)
CREATE INDEX IF NOT EXISTS idx_avatars_public ON avatars(is_public, created_at DESC)
    WHERE is_public = true;

-- Index for templates
CREATE INDEX IF NOT EXISTS idx_avatars_templates ON avatars(is_template, like_count DESC)
    WHERE is_template = true;

-- Index for search by name
CREATE INDEX IF NOT EXISTS idx_avatars_name_search ON avatars USING gin(to_tsvector('english', name));

-- ============================================================================
-- Avatar Tags (for categorization and search)
-- ============================================================================

CREATE TABLE IF NOT EXISTS avatar_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(32) UNIQUE NOT NULL,
    category VARCHAR(32) DEFAULT 'general',  -- 'style', 'species', 'theme', etc.
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for avatar-tag relationship
CREATE TABLE IF NOT EXISTS avatar_tag_map (
    avatar_id UUID REFERENCES avatars(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES avatar_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (avatar_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_avatar_tags_usage ON avatar_tags(usage_count DESC);

-- ============================================================================
-- Avatar Likes (for popularity tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS avatar_likes (
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    avatar_id UUID REFERENCES avatars(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (player_id, avatar_id)
);

CREATE INDEX IF NOT EXISTS idx_avatar_likes_avatar ON avatar_likes(avatar_id);

-- ============================================================================
-- Avatar Reports (for moderation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS avatar_reports (
    id SERIAL PRIMARY KEY,
    avatar_id UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    reason VARCHAR(64) NOT NULL,  -- 'inappropriate', 'copyright', 'offensive', etc.
    description TEXT,
    status VARCHAR(16) DEFAULT 'pending',  -- 'pending', 'reviewed', 'actioned', 'dismissed'
    reviewer_id UUID REFERENCES players(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_avatar_reports_status ON avatar_reports(status, created_at DESC);

-- ============================================================================
-- Avatar Drafts (auto-saved editor state)
-- ============================================================================

CREATE TABLE IF NOT EXISTS avatar_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,  -- NULL for new avatars

    -- Draft data
    name VARCHAR(64) DEFAULT 'Untitled Draft',
    voxel_data BYTEA,
    rig_config JSONB DEFAULT '{}',
    palette_data JSONB DEFAULT '[]',

    -- Editor state
    editor_state JSONB DEFAULT '{}',  -- Camera position, selected tool, etc.

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_at TIMESTAMPTZ DEFAULT NOW(),

    -- Expiry (drafts older than 30 days may be cleaned up)
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_avatar_drafts_owner ON avatar_drafts(owner_id, modified_at DESC);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Update modified_at timestamp
CREATE OR REPLACE FUNCTION update_avatar_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_avatar_modified_at
    BEFORE UPDATE ON avatars
    FOR EACH ROW
    EXECUTE FUNCTION update_avatar_modified_at();

-- Update tag usage count when avatar-tag mapping changes
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE avatar_tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE avatar_tags SET usage_count = usage_count - 1 WHERE id = OLD.tag_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tag_usage_count
    AFTER INSERT OR DELETE ON avatar_tag_map
    FOR EACH ROW
    EXECUTE FUNCTION update_tag_usage_count();

-- Update like count when likes change
CREATE OR REPLACE FUNCTION update_avatar_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE avatars SET like_count = like_count + 1 WHERE id = NEW.avatar_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE avatars SET like_count = like_count - 1 WHERE id = OLD.avatar_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_avatar_like_count
    AFTER INSERT OR DELETE ON avatar_likes
    FOR EACH ROW
    EXECUTE FUNCTION update_avatar_like_count();

-- Ensure only one default avatar per player
CREATE OR REPLACE FUNCTION ensure_single_default_avatar()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE avatars SET is_default = false
        WHERE owner_id = NEW.owner_id AND id != NEW.id AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_single_default_avatar
    BEFORE INSERT OR UPDATE OF is_default ON avatars
    FOR EACH ROW
    WHEN (NEW.is_default = true)
    EXECUTE FUNCTION ensure_single_default_avatar();

-- ============================================================================
-- Seed Data: Default Tags
-- ============================================================================

INSERT INTO avatar_tags (name, category) VALUES
    ('human', 'species'),
    ('robot', 'species'),
    ('animal', 'species'),
    ('fantasy', 'species'),
    ('cute', 'style'),
    ('realistic', 'style'),
    ('chibi', 'style'),
    ('pixel', 'style'),
    ('medieval', 'theme'),
    ('scifi', 'theme'),
    ('casual', 'theme'),
    ('formal', 'theme')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Views
-- ============================================================================

-- Public avatar gallery view
CREATE OR REPLACE VIEW public_avatars AS
SELECT
    a.id,
    a.name,
    a.description,
    a.thumbnail,
    a.render_preference,
    a.like_count,
    a.download_count,
    a.view_count,
    a.voxel_count,
    a.created_at,
    a.published_at,
    p.username as creator_name,
    p.id as creator_id,
    ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL) as tags
FROM avatars a
JOIN players p ON a.owner_id = p.id
LEFT JOIN avatar_tag_map atm ON a.id = atm.avatar_id
LEFT JOIN avatar_tags t ON atm.tag_id = t.id
WHERE a.is_public = true
GROUP BY a.id, p.id;

-- Player's avatar list view
CREATE OR REPLACE VIEW player_avatars AS
SELECT
    a.id,
    a.owner_id,
    a.name,
    a.description,
    a.thumbnail,
    a.render_preference,
    a.is_public,
    a.is_default,
    a.voxel_count,
    a.file_size_bytes,
    a.created_at,
    a.modified_at,
    a.version
FROM avatars a;

-- ============================================================================
-- Cleanup procedure for expired drafts
-- ============================================================================

CREATE OR REPLACE PROCEDURE cleanup_expired_drafts()
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM avatar_drafts WHERE expires_at < NOW();
END;
$$;
