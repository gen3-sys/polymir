/**
 * Avatar API Routes
 *
 * REST API endpoints for avatar management:
 * - CRUD operations for avatars
 * - Public gallery browsing
 * - Sharing and cloning
 * - Draft auto-save
 */

import express from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { pool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// ============================================================================
// Constants and Validation
// ============================================================================

const MAX_AVATAR_SIZE = 50000;        // Max voxel count
const MAX_FILE_SIZE = 100 * 1024;     // 100KB max compressed size
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 500;
const AVATARS_PER_PAGE = 20;
const MAX_AVATARS_PER_PLAYER = 50;

// Validation schemas
const avatarValidation = {
    name: (val) => typeof val === 'string' && val.length > 0 && val.length <= MAX_NAME_LENGTH,
    description: (val) => !val || (typeof val === 'string' && val.length <= MAX_DESCRIPTION_LENGTH),
    voxelData: (val) => val instanceof Buffer || typeof val === 'string',
    renderPreference: (val) => ['cube', 'smooth', 'auto'].includes(val)
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate avatar data size and structure
 */
function validateAvatarData(voxelData, voxelCount) {
    if (voxelCount > MAX_AVATAR_SIZE) {
        return { valid: false, error: `Voxel count exceeds maximum (${MAX_AVATAR_SIZE})` };
    }

    const dataSize = typeof voxelData === 'string'
        ? Buffer.from(voxelData, 'base64').length
        : voxelData.length;

    if (dataSize > MAX_FILE_SIZE) {
        return { valid: false, error: `File size exceeds maximum (${MAX_FILE_SIZE} bytes)` };
    }

    return { valid: true };
}

/**
 * Convert base64 to Buffer for storage
 */
function toBuffer(data) {
    if (data instanceof Buffer) return data;
    if (typeof data === 'string') return Buffer.from(data, 'base64');
    return null;
}

// ============================================================================
// Routes: Avatar CRUD
// ============================================================================

/**
 * POST /api/avatars - Create new avatar
 */
router.post('/', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const playerId = req.user.id;
        const {
            name,
            description = '',
            voxelData,
            rigConfig = {},
            paletteData = [],
            thumbnail,
            renderPreference = 'auto',
            voxelCount = 0
        } = req.body;

        // Validate required fields
        if (!avatarValidation.name(name)) {
            return res.status(400).json({ error: 'Invalid avatar name' });
        }

        if (!voxelData) {
            return res.status(400).json({ error: 'Voxel data required' });
        }

        // Validate avatar data
        const validation = validateAvatarData(voxelData, voxelCount);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Check player's avatar count
        const countResult = await client.query(
            'SELECT COUNT(*) FROM avatars WHERE owner_id = $1',
            [playerId]
        );

        if (parseInt(countResult.rows[0].count) >= MAX_AVATARS_PER_PLAYER) {
            return res.status(400).json({
                error: `Maximum avatar limit reached (${MAX_AVATARS_PER_PLAYER})`
            });
        }

        // Convert data to buffers
        const voxelBuffer = toBuffer(voxelData);
        const thumbnailBuffer = thumbnail ? toBuffer(thumbnail) : null;

        // Insert avatar
        const result = await client.query(
            `INSERT INTO avatars (
                owner_id, name, description, voxel_data, rig_config,
                palette_data, thumbnail, render_preference, voxel_count,
                file_size_bytes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, created_at`,
            [
                playerId,
                name,
                description,
                voxelBuffer,
                JSON.stringify(rigConfig),
                JSON.stringify(paletteData),
                thumbnailBuffer,
                renderPreference,
                voxelCount,
                voxelBuffer?.length || 0
            ]
        );

        const avatar = result.rows[0];

        logger.info(`Avatar created: ${avatar.id} by player ${playerId}`);

        res.status(201).json({
            id: avatar.id,
            name,
            createdAt: avatar.created_at
        });

    } catch (error) {
        logger.error('Error creating avatar:', error);
        res.status(500).json({ error: 'Failed to create avatar' });
    } finally {
        client.release();
    }
});

/**
 * GET /api/avatars/mine - List player's avatars
 */
router.get('/mine', authenticateToken, async (req, res) => {
    try {
        const playerId = req.user.id;
        const { page = 1, limit = AVATARS_PER_PAGE } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const result = await pool.query(
            `SELECT id, name, description, thumbnail, render_preference,
                    is_public, is_default, voxel_count, file_size_bytes,
                    created_at, modified_at, version
             FROM avatars
             WHERE owner_id = $1
             ORDER BY modified_at DESC
             LIMIT $2 OFFSET $3`,
            [playerId, parseInt(limit), offset]
        );

        // Get total count
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM avatars WHERE owner_id = $1',
            [playerId]
        );

        res.json({
            avatars: result.rows.map(row => ({
                ...row,
                thumbnail: row.thumbnail ? row.thumbnail.toString('base64') : null
            })),
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit)
        });

    } catch (error) {
        logger.error('Error listing avatars:', error);
        res.status(500).json({ error: 'Failed to list avatars' });
    }
});

/**
 * GET /api/avatars/:id - Get avatar by ID
 */
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user?.id;

        const result = await pool.query(
            `SELECT a.*, p.username as creator_name
             FROM avatars a
             JOIN players p ON a.owner_id = p.id
             WHERE a.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Avatar not found' });
        }

        const avatar = result.rows[0];

        // Check access permission
        if (!avatar.is_public && avatar.owner_id !== playerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Increment view count for public avatars
        if (avatar.is_public && avatar.owner_id !== playerId) {
            await pool.query(
                'UPDATE avatars SET view_count = view_count + 1 WHERE id = $1',
                [id]
            );
        }

        res.json({
            id: avatar.id,
            name: avatar.name,
            description: avatar.description,
            voxelData: avatar.voxel_data.toString('base64'),
            rigConfig: avatar.rig_config,
            paletteData: avatar.palette_data,
            thumbnail: avatar.thumbnail?.toString('base64'),
            renderPreference: avatar.render_preference,
            isPublic: avatar.is_public,
            isDefault: avatar.is_default,
            voxelCount: avatar.voxel_count,
            creatorName: avatar.creator_name,
            creatorId: avatar.owner_id,
            likeCount: avatar.like_count,
            downloadCount: avatar.download_count,
            viewCount: avatar.view_count,
            createdAt: avatar.created_at,
            modifiedAt: avatar.modified_at,
            version: avatar.version,
            isOwner: avatar.owner_id === playerId
        });

    } catch (error) {
        logger.error('Error getting avatar:', error);
        res.status(500).json({ error: 'Failed to get avatar' });
    }
});

/**
 * PUT /api/avatars/:id - Update avatar
 */
router.put('/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const playerId = req.user.id;
        const {
            name,
            description,
            voxelData,
            rigConfig,
            paletteData,
            thumbnail,
            renderPreference,
            voxelCount
        } = req.body;

        // Check ownership
        const ownerCheck = await client.query(
            'SELECT owner_id, version FROM avatars WHERE id = $1',
            [id]
        );

        if (ownerCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Avatar not found' });
        }

        if (ownerCheck.rows[0].owner_id !== playerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Build update query
        const updates = [];
        const values = [id];
        let paramIndex = 2;

        if (name !== undefined) {
            if (!avatarValidation.name(name)) {
                return res.status(400).json({ error: 'Invalid avatar name' });
            }
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }

        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            values.push(description);
        }

        if (voxelData !== undefined) {
            const validation = validateAvatarData(voxelData, voxelCount || 0);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }
            const voxelBuffer = toBuffer(voxelData);
            updates.push(`voxel_data = $${paramIndex++}`);
            values.push(voxelBuffer);
            updates.push(`file_size_bytes = $${paramIndex++}`);
            values.push(voxelBuffer?.length || 0);
        }

        if (rigConfig !== undefined) {
            updates.push(`rig_config = $${paramIndex++}`);
            values.push(JSON.stringify(rigConfig));
        }

        if (paletteData !== undefined) {
            updates.push(`palette_data = $${paramIndex++}`);
            values.push(JSON.stringify(paletteData));
        }

        if (thumbnail !== undefined) {
            updates.push(`thumbnail = $${paramIndex++}`);
            values.push(thumbnail ? toBuffer(thumbnail) : null);
        }

        if (renderPreference !== undefined) {
            if (!avatarValidation.renderPreference(renderPreference)) {
                return res.status(400).json({ error: 'Invalid render preference' });
            }
            updates.push(`render_preference = $${paramIndex++}`);
            values.push(renderPreference);
        }

        if (voxelCount !== undefined) {
            updates.push(`voxel_count = $${paramIndex++}`);
            values.push(voxelCount);
        }

        // Increment version
        updates.push(`version = version + 1`);

        if (updates.length === 1) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        await client.query(
            `UPDATE avatars SET ${updates.join(', ')} WHERE id = $1`,
            values
        );

        logger.info(`Avatar updated: ${id}`);

        res.json({ success: true, version: ownerCheck.rows[0].version + 1 });

    } catch (error) {
        logger.error('Error updating avatar:', error);
        res.status(500).json({ error: 'Failed to update avatar' });
    } finally {
        client.release();
    }
});

/**
 * DELETE /api/avatars/:id - Delete avatar
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user.id;

        const result = await pool.query(
            'DELETE FROM avatars WHERE id = $1 AND owner_id = $2 RETURNING id',
            [id, playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Avatar not found or access denied' });
        }

        logger.info(`Avatar deleted: ${id}`);

        res.json({ success: true });

    } catch (error) {
        logger.error('Error deleting avatar:', error);
        res.status(500).json({ error: 'Failed to delete avatar' });
    }
});

// ============================================================================
// Routes: Sharing and Publishing
// ============================================================================

/**
 * POST /api/avatars/:id/publish - Make avatar public
 */
router.post('/:id/publish', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user.id;

        const result = await pool.query(
            `UPDATE avatars
             SET is_public = true, published_at = NOW()
             WHERE id = $1 AND owner_id = $2
             RETURNING id`,
            [id, playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Avatar not found or access denied' });
        }

        logger.info(`Avatar published: ${id}`);

        res.json({ success: true });

    } catch (error) {
        logger.error('Error publishing avatar:', error);
        res.status(500).json({ error: 'Failed to publish avatar' });
    }
});

/**
 * POST /api/avatars/:id/unpublish - Make avatar private
 */
router.post('/:id/unpublish', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user.id;

        const result = await pool.query(
            `UPDATE avatars SET is_public = false WHERE id = $1 AND owner_id = $2 RETURNING id`,
            [id, playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Avatar not found or access denied' });
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('Error unpublishing avatar:', error);
        res.status(500).json({ error: 'Failed to unpublish avatar' });
    }
});

/**
 * POST /api/avatars/:id/clone - Clone a public avatar
 */
router.post('/:id/clone', authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const playerId = req.user.id;
        const { name } = req.body;

        // Get source avatar
        const sourceResult = await client.query(
            `SELECT * FROM avatars WHERE id = $1 AND (is_public = true OR owner_id = $2)`,
            [id, playerId]
        );

        if (sourceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Avatar not found or not clonable' });
        }

        const source = sourceResult.rows[0];

        // Check if remixing is allowed
        if (!source.allow_remix && source.owner_id !== playerId) {
            return res.status(403).json({ error: 'This avatar does not allow remixing' });
        }

        // Check player's avatar count
        const countResult = await client.query(
            'SELECT COUNT(*) FROM avatars WHERE owner_id = $1',
            [playerId]
        );

        if (parseInt(countResult.rows[0].count) >= MAX_AVATARS_PER_PLAYER) {
            return res.status(400).json({ error: 'Maximum avatar limit reached' });
        }

        // Create clone
        const cloneName = name || `${source.name} (Copy)`;
        const result = await client.query(
            `INSERT INTO avatars (
                owner_id, name, description, voxel_data, rig_config,
                palette_data, thumbnail, render_preference, voxel_count,
                file_size_bytes, parent_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, created_at`,
            [
                playerId,
                cloneName,
                source.description,
                source.voxel_data,
                source.rig_config,
                source.palette_data,
                source.thumbnail,
                source.render_preference,
                source.voxel_count,
                source.file_size_bytes,
                source.id
            ]
        );

        // Increment download count on source
        await client.query(
            'UPDATE avatars SET download_count = download_count + 1 WHERE id = $1',
            [id]
        );

        logger.info(`Avatar cloned: ${id} -> ${result.rows[0].id}`);

        res.status(201).json({
            id: result.rows[0].id,
            name: cloneName,
            createdAt: result.rows[0].created_at
        });

    } catch (error) {
        logger.error('Error cloning avatar:', error);
        res.status(500).json({ error: 'Failed to clone avatar' });
    } finally {
        client.release();
    }
});

/**
 * POST /api/avatars/:id/set-default - Set as player's default avatar
 */
router.post('/:id/set-default', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user.id;

        const result = await pool.query(
            `UPDATE avatars SET is_default = true WHERE id = $1 AND owner_id = $2 RETURNING id`,
            [id, playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Avatar not found or access denied' });
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('Error setting default avatar:', error);
        res.status(500).json({ error: 'Failed to set default avatar' });
    }
});

// ============================================================================
// Routes: Public Gallery
// ============================================================================

/**
 * GET /api/avatars/public - Browse public avatars
 */
router.get('/public', optionalAuth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = AVATARS_PER_PAGE,
            sort = 'recent',
            tag,
            search
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const values = [];
        let paramIndex = 1;

        // Build WHERE clause
        let whereClause = 'WHERE a.is_public = true';

        if (tag) {
            whereClause += ` AND EXISTS (
                SELECT 1 FROM avatar_tag_map atm
                JOIN avatar_tags t ON atm.tag_id = t.id
                WHERE atm.avatar_id = a.id AND t.name = $${paramIndex++}
            )`;
            values.push(tag);
        }

        if (search) {
            whereClause += ` AND (
                a.name ILIKE $${paramIndex++} OR
                a.description ILIKE $${paramIndex}
            )`;
            const searchPattern = `%${search}%`;
            values.push(searchPattern, searchPattern);
            paramIndex++;
        }

        // Build ORDER BY clause
        let orderClause;
        switch (sort) {
            case 'popular':
                orderClause = 'ORDER BY a.like_count DESC, a.created_at DESC';
                break;
            case 'downloads':
                orderClause = 'ORDER BY a.download_count DESC, a.created_at DESC';
                break;
            case 'recent':
            default:
                orderClause = 'ORDER BY a.published_at DESC';
        }

        values.push(parseInt(limit), offset);

        const result = await pool.query(
            `SELECT a.id, a.name, a.description, a.thumbnail, a.render_preference,
                    a.like_count, a.download_count, a.view_count, a.voxel_count,
                    a.created_at, a.published_at, p.username as creator_name, p.id as creator_id
             FROM avatars a
             JOIN players p ON a.owner_id = p.id
             ${whereClause}
             ${orderClause}
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            values
        );

        // Get total count
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM avatars a ${whereClause}`,
            values.slice(0, -2)
        );

        res.json({
            avatars: result.rows.map(row => ({
                ...row,
                thumbnail: row.thumbnail?.toString('base64')
            })),
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit)
        });

    } catch (error) {
        logger.error('Error browsing public avatars:', error);
        res.status(500).json({ error: 'Failed to browse avatars' });
    }
});

// ============================================================================
// Routes: Likes
// ============================================================================

/**
 * POST /api/avatars/:id/like - Like an avatar
 */
router.post('/:id/like', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user.id;

        await pool.query(
            `INSERT INTO avatar_likes (player_id, avatar_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [playerId, id]
        );

        res.json({ success: true });

    } catch (error) {
        logger.error('Error liking avatar:', error);
        res.status(500).json({ error: 'Failed to like avatar' });
    }
});

/**
 * DELETE /api/avatars/:id/like - Unlike an avatar
 */
router.delete('/:id/like', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const playerId = req.user.id;

        await pool.query(
            'DELETE FROM avatar_likes WHERE player_id = $1 AND avatar_id = $2',
            [playerId, id]
        );

        res.json({ success: true });

    } catch (error) {
        logger.error('Error unliking avatar:', error);
        res.status(500).json({ error: 'Failed to unlike avatar' });
    }
});

// ============================================================================
// Routes: Drafts
// ============================================================================

/**
 * POST /api/avatars/drafts - Save draft
 */
router.post('/drafts', authenticateToken, async (req, res) => {
    try {
        const playerId = req.user.id;
        const { avatarId, name, voxelData, rigConfig, paletteData, editorState } = req.body;

        const result = await pool.query(
            `INSERT INTO avatar_drafts (
                owner_id, avatar_id, name, voxel_data, rig_config, palette_data, editor_state
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (owner_id) WHERE avatar_id IS NULL
            DO UPDATE SET
                name = EXCLUDED.name,
                voxel_data = EXCLUDED.voxel_data,
                rig_config = EXCLUDED.rig_config,
                palette_data = EXCLUDED.palette_data,
                editor_state = EXCLUDED.editor_state,
                modified_at = NOW(),
                expires_at = NOW() + INTERVAL '30 days'
            RETURNING id`,
            [
                playerId,
                avatarId || null,
                name || 'Untitled Draft',
                voxelData ? toBuffer(voxelData) : null,
                JSON.stringify(rigConfig || {}),
                JSON.stringify(paletteData || []),
                JSON.stringify(editorState || {})
            ]
        );

        res.json({ id: result.rows[0].id });

    } catch (error) {
        logger.error('Error saving draft:', error);
        res.status(500).json({ error: 'Failed to save draft' });
    }
});

/**
 * GET /api/avatars/drafts - Get player's drafts
 */
router.get('/drafts', authenticateToken, async (req, res) => {
    try {
        const playerId = req.user.id;

        const result = await pool.query(
            `SELECT id, avatar_id, name, modified_at
             FROM avatar_drafts
             WHERE owner_id = $1
             ORDER BY modified_at DESC`,
            [playerId]
        );

        res.json({ drafts: result.rows });

    } catch (error) {
        logger.error('Error getting drafts:', error);
        res.status(500).json({ error: 'Failed to get drafts' });
    }
});

export default router;
