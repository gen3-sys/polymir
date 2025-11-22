/**
 * POLYMIR CENTRAL LIBRARY DATABASE ADAPTER
 * =========================================
 * Database operations for Central Library (global schematic registry, trust, federation)
 * Handles: players, schematics, trust scores, validation consensus, server registry
 */

import logger from '../utils/logger.js';

// =============================================
// CENTRAL LIBRARY DATABASE ADAPTER
// =============================================

export class CentralLibraryDB {
    constructor(pool) {
        this.pool = pool;
        this.log = logger.child('CentralLibrary');
    }

    // =============================================
    // PLAYER OPERATIONS
    // =============================================

    /**
     * Create a new player
     * @param {string} username
     * @param {string} passwordHash - bcrypt hash
     * @returns {Promise<Object>} Created player
     */
    async createPlayer(username, passwordHash) {
        const query = `
            INSERT INTO players (username, password_hash)
            VALUES ($1, $2)
            RETURNING player_id, username, trust_score, created_at
        `;

        try {
            const result = await this.pool.query(query, [username, passwordHash]);
            this.log.info('Player created', { username, playerId: result.rows[0].player_id });
            return result.rows[0];
        } catch (error) {
            if (error.code === '23505') { // Unique violation
                throw new Error(`Username ${username} already exists`);
            }
            throw error;
        }
    }

    /**
     * Get player by ID
     * @param {string} playerId - UUID
     * @returns {Promise<Object|null>}
     */
    async getPlayerById(playerId) {
        const query = `
            SELECT player_id, username, trust_score,
                   validations_submitted, validations_correct, validations_incorrect,
                   created_at, last_active
            FROM players
            WHERE player_id = $1
        `;

        const result = await this.pool.query(query, [playerId]);
        return result.rows[0] || null;
    }

    /**
     * Get player by username
     * @param {string} username
     * @returns {Promise<Object|null>}
     */
    async getPlayerByUsername(username) {
        const query = `
            SELECT player_id, username, trust_score, password_hash,
                   validations_submitted, validations_correct, validations_incorrect,
                   created_at, last_active
            FROM players
            WHERE username = $1
        `;

        const result = await this.pool.query(query, [username]);
        return result.rows[0] || null;
    }

    /**
     * Update player trust score
     * @param {string} playerId
     * @param {number} newScore - 0.0 to 1.0
     * @param {Object} stats - Optional validation stats update
     * @returns {Promise<void>}
     */
    async updatePlayerTrustScore(playerId, newScore, stats = {}) {
        const query = `
            UPDATE players
            SET trust_score = $1,
                validations_submitted = COALESCE($2, validations_submitted),
                validations_correct = COALESCE($3, validations_correct),
                validations_incorrect = COALESCE($4, validations_incorrect)
            WHERE player_id = $5
        `;

        await this.pool.query(query, [
            newScore,
            stats.submitted,
            stats.correct,
            stats.incorrect,
            playerId
        ]);

        this.log.debug('Player trust updated', { playerId, newScore });
    }

    /**
     * Update player password/passphrase
     * @param {string} playerId
     * @param {string} passwordHash - Hashed password, or null to remove protection
     * @returns {Promise<void>}
     */
    async updatePlayerPassword(playerId, passwordHash) {
        const query = `
            UPDATE players
            SET password_hash = $1
            WHERE player_id = $2
        `;

        await this.pool.query(query, [passwordHash, playerId]);
        this.log.debug('Player password updated', { playerId });
    }

    /**
     * Get trust leaderboard
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getTrustLeaderboard(limit = 100) {
        const query = `
            SELECT * FROM trust_leaderboard
            LIMIT $1
        `;

        const result = await this.pool.query(query, [limit]);
        return result.rows;
    }

    // =============================================
    // SCHEMATIC OPERATIONS
    // =============================================

    /**
     * Create a schematic entry
     * @param {Object} schematic - Schematic data
     * @returns {Promise<Object>}
     */
    async createSchematic(schematic) {
        const query = `
            INSERT INTO schematics (
                creator_id, name, description,
                file_cid, thumbnail_cid,
                size_x, size_y, size_z, voxel_count,
                category, tags, biomes,
                gravity_vector_x, gravity_vector_y, gravity_vector_z,
                anchor_point_x, anchor_point_y, anchor_point_z,
                is_planet, spawn_frequency,
                is_composite, component_count
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING schematic_id, created_at
        `;

        // Default gravity vector: Y-down [0, -1, 0]
        const gravityVector = schematic.gravityVector || [0, -1, 0];
        // Default anchor point: center-bottom [0.5, 0, 0.5]
        const anchorPoint = schematic.anchorPoint || [0.5, 0, 0.5];

        const result = await this.pool.query(query, [
            schematic.creatorId,
            schematic.name,
            schematic.description || null,
            schematic.fileCid,
            schematic.thumbnailCid || null,
            schematic.sizeX,
            schematic.sizeY,
            schematic.sizeZ,
            schematic.voxelCount,
            schematic.category,
            schematic.tags || [],
            schematic.biomes || [],
            gravityVector[0],
            gravityVector[1],
            gravityVector[2],
            anchorPoint[0],
            anchorPoint[1],
            anchorPoint[2],
            schematic.isPlanet || false,
            schematic.spawnFrequency || 0.0,
            schematic.isComposite || false,
            schematic.componentCount || 0
        ]);

        this.log.info('Schematic created', {
            schematicId: result.rows[0].schematic_id,
            name: schematic.name
        });

        return result.rows[0];
    }

    /**
     * Get schematic by ID
     * @param {string} schematicId
     * @returns {Promise<Object|null>}
     */
    async getSchematicById(schematicId) {
        const query = `
            SELECT s.*,
                   p.username as creator_name,
                   p.trust_score as creator_trust
            FROM schematics s
            JOIN players p ON s.creator_id = p.player_id
            WHERE s.schematic_id = $1
        `;

        const result = await this.pool.query(query, [schematicId]);
        return result.rows[0] || null;
    }

    /**
     * Get schematic by IPFS CID
     * @param {string} fileCid
     * @returns {Promise<Object|null>}
     */
    async getSchematicByCid(fileCid) {
        const query = `
            SELECT s.*,
                   p.username as creator_name,
                   p.trust_score as creator_trust
            FROM schematics s
            JOIN players p ON s.creator_id = p.player_id
            WHERE s.file_cid = $1
        `;

        const result = await this.pool.query(query, [fileCid]);
        return result.rows[0] || null;
    }

    /**
     * Search schematics
     * @param {Object} filters
     * @returns {Promise<Array>}
     */
    async searchSchematics(filters = {}) {
        let query = `
            SELECT s.*,
                   p.username as creator_name,
                   p.trust_score as creator_trust
            FROM schematics s
            JOIN players p ON s.creator_id = p.player_id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (filters.category) {
            query += ` AND s.category = $${paramIndex}`;
            params.push(filters.category);
            paramIndex++;
        }

        if (filters.tags && filters.tags.length > 0) {
            query += ` AND s.tags && $${paramIndex}::text[]`;
            params.push(filters.tags);
            paramIndex++;
        }

        if (filters.creatorId) {
            query += ` AND s.creator_id = $${paramIndex}`;
            params.push(filters.creatorId);
            paramIndex++;
        }

        if (filters.isPlanet !== undefined) {
            query += ` AND s.is_planet = $${paramIndex}`;
            params.push(filters.isPlanet);
            paramIndex++;
        }

        // Sorting
        const sortBy = filters.sortBy || 'created_at';
        const sortOrder = filters.sortOrder || 'DESC';
        query += ` ORDER BY s.${sortBy} ${sortOrder}`;

        // Pagination
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await this.pool.query(query, params);
        return result.rows;
    }

    /**
     * Increment schematic download count
     * @param {string} schematicId
     * @returns {Promise<void>}
     */
    async incrementDownloadCount(schematicId) {
        const query = `
            UPDATE schematics
            SET download_count = download_count + 1
            WHERE schematic_id = $1
        `;

        await this.pool.query(query, [schematicId]);
    }

    /**
     * Mark schematic as validated
     * @param {string} schematicId
     * @param {string} validationProofCid
     * @returns {Promise<void>}
     */
    async markSchematicValidated(schematicId, validationProofCid) {
        const query = `
            UPDATE schematics
            SET is_validated = true,
                validation_proof_cid = $1
            WHERE schematic_id = $2
        `;

        await this.pool.query(query, [validationProofCid, schematicId]);
        this.log.info('Schematic validated', { schematicId });
    }

    // =============================================
    // SCHEMATIC USAGE TRACKING
    // =============================================

    /**
     * Record schematic placement
     * @param {Object} usage
     * @returns {Promise<void>}
     */
    async recordSchematicUsage(usage) {
        const query = `
            INSERT INTO schematic_usage_events (
                schematic_id, placed_by, world_server_id,
                megachunk_x, megachunk_y, megachunk_z,
                body_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        await this.pool.query(query, [
            usage.schematicId,
            usage.placedBy,
            usage.worldServerId,
            usage.megachunkX,
            usage.megachunkY,
            usage.megachunkZ,
            usage.bodyId || null
        ]);
    }

    /**
     * Get schematic usage statistics
     * @param {string} schematicId
     * @returns {Promise<Object>}
     */
    async getSchematicUsageStats(schematicId) {
        const query = `
            SELECT
                COUNT(*) as total_placements,
                COUNT(DISTINCT placed_by) as unique_users,
                COUNT(DISTINCT world_server_id) as servers_used,
                MIN(placed_at) as first_placement,
                MAX(placed_at) as last_placement
            FROM schematic_usage_events
            WHERE schematic_id = $1
        `;

        const result = await this.pool.query(query, [schematicId]);
        return result.rows[0];
    }

    // =============================================
    // SERVER REGISTRY
    // =============================================

    /**
     * Register a world server
     * @param {Object} server
     * @returns {Promise<Object>}
     */
    async registerServer(server) {
        const query = `
            INSERT INTO servers (
                server_id, server_name, libp2p_peer_id, ruleset_hash,
                position_x, position_y, position_z,
                api_url, websocket_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (server_id) DO UPDATE
            SET libp2p_peer_id = EXCLUDED.libp2p_peer_id,
                api_url = EXCLUDED.api_url,
                websocket_url = EXCLUDED.websocket_url,
                is_online = true,
                last_heartbeat = NOW()
            RETURNING server_id, created_at
        `;

        const result = await this.pool.query(query, [
            server.serverId,
            server.serverName,
            server.libp2pPeerId,
            server.rulesetHash,
            server.positionX || 0,
            server.positionY || 0,
            server.positionZ || 0,
            server.apiUrl,
            server.websocketUrl
        ]);

        this.log.info('Server registered', {
            serverId: server.serverId,
            name: server.serverName
        });

        return result.rows[0];
    }

    /**
     * Update server heartbeat
     * @param {string} serverId
     * @returns {Promise<void>}
     */
    async updateServerHeartbeat(serverId) {
        const query = `
            UPDATE servers
            SET last_heartbeat = NOW(),
                is_online = true
            WHERE server_id = $1
        `;

        await this.pool.query(query, [serverId]);
    }

    /**
     * Get online servers by ruleset
     * @param {string} rulesetHash
     * @returns {Promise<Array>}
     */
    async getOnlineServersByRuleset(rulesetHash) {
        const query = `
            SELECT *
            FROM servers
            WHERE ruleset_hash = $1
              AND is_online = true
              AND last_heartbeat > NOW() - INTERVAL '5 minutes'
            ORDER BY last_heartbeat DESC
        `;

        const result = await this.pool.query(query, [rulesetHash]);
        return result.rows;
    }

    // =============================================
    // VALIDATION CONSENSUS
    // =============================================

    /**
     * Create consensus result
     * @param {Object} consensus
     * @returns {Promise<Object>}
     */
    async createConsensusResult(consensus) {
        const query = `
            INSERT INTO consensus_results (
                event_type, event_data_cid, submitter_id,
                world_server_id, megachunk_x, megachunk_y, megachunk_z
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING consensus_id, submitted_at
        `;

        const result = await this.pool.query(query, [
            consensus.eventType,
            consensus.eventDataCid,
            consensus.submitterId,
            consensus.worldServerId || null,
            consensus.megachunkX || null,
            consensus.megachunkY || null,
            consensus.megachunkZ || null
        ]);

        return result.rows[0];
    }

    /**
     * Record validation vote
     * @param {string} consensusId
     * @param {string} validatorId
     * @param {boolean} agrees
     * @param {string} proofCid
     * @returns {Promise<void>}
     */
    async recordValidationVote(consensusId, validatorId, agrees, proofCid = null) {
        const query = `
            INSERT INTO validation_votes (
                consensus_id, validator_id, agrees, computation_proof_cid
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (consensus_id, validator_id) DO NOTHING
        `;

        await this.pool.query(query, [consensusId, validatorId, agrees, proofCid]);
    }

    /**
     * Get consensus result with votes
     * @param {string} consensusId
     * @returns {Promise<Object|null>}
     */
    async getConsensusResult(consensusId) {
        const query = `
            SELECT
                cr.*,
                json_agg(json_build_object(
                    'validator_id', vv.validator_id,
                    'agrees', vv.agrees,
                    'voted_at', vv.voted_at
                )) as votes
            FROM consensus_results cr
            LEFT JOIN validation_votes vv ON cr.consensus_id = vv.consensus_id
            WHERE cr.consensus_id = $1
            GROUP BY cr.consensus_id
        `;

        const result = await this.pool.query(query, [consensusId]);
        return result.rows[0] || null;
    }

    /**
     * Update consensus result
     * @param {string} consensusId
     * @param {boolean} isValid
     * @param {number} agreeCount
     * @param {number} disagreeCount
     * @param {string} proofCid
     * @returns {Promise<void>}
     */
    async updateConsensusResult(consensusId, isValid, agreeCount, disagreeCount, proofCid = null) {
        const query = `
            UPDATE consensus_results
            SET is_valid = $1,
                agree_count = $2,
                disagree_count = $3,
                consensus_proof_cid = $4,
                resolved_at = NOW()
            WHERE consensus_id = $5
        `;

        await this.pool.query(query, [
            isValid,
            agreeCount,
            disagreeCount,
            proofCid,
            consensusId
        ]);

        this.log.info('Consensus resolved', {
            consensusId,
            isValid,
            agreeCount,
            disagreeCount
        });
    }

    // =============================================
    // TRUST HISTORY
    // =============================================

    /**
     * Record trust score change
     * @param {string} playerId
     * @param {number} oldScore
     * @param {number} newScore
     * @param {string} reason
     * @param {string} consensusId
     * @returns {Promise<void>}
     */
    async recordTrustChange(playerId, oldScore, newScore, reason, consensusId = null) {
        const query = `
            INSERT INTO trust_history (
                player_id, old_score, new_score, delta,
                reason, related_consensus_id
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        const delta = newScore - oldScore;

        await this.pool.query(query, [
            playerId,
            oldScore,
            newScore,
            delta,
            reason,
            consensusId
        ]);
    }

    /**
     * Get player trust history
     * @param {string} playerId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getPlayerTrustHistory(playerId, limit = 50) {
        const query = `
            SELECT *
            FROM trust_history
            WHERE player_id = $1
            ORDER BY changed_at DESC
            LIMIT $2
        `;

        const result = await this.pool.query(query, [playerId, limit]);
        return result.rows;
    }

    // =============================================
    // SCHEMATIC REFERENCES (Composite Builds)
    // =============================================

    /**
     * Add a component schematic reference to a composite build
     * @param {Object} reference
     * @returns {Promise<Object>}
     */
    async addSchematicReference(reference) {
        const query = `
            INSERT INTO schematic_references (
                parent_schematic_id, child_schematic_id,
                offset_x, offset_y, offset_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                layer_id, layer_scale_ratio, sort_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING reference_id, added_at
        `;

        const result = await this.pool.query(query, [
            reference.parentSchematicId,
            reference.childSchematicId,
            reference.offsetX || 0,
            reference.offsetY || 0,
            reference.offsetZ || 0,
            reference.rotationX || 0,
            reference.rotationY || 0,
            reference.rotationZ || 0,
            reference.rotationW || 1,
            reference.layerId || 0,
            reference.layerScaleRatio || 1.0,
            reference.sortOrder || 0
        ]);

        // Update parent's composite status
        await this.updateSchematicCompositeStatus(reference.parentSchematicId);

        this.log.info('Schematic reference added', {
            parentId: reference.parentSchematicId,
            childId: reference.childSchematicId
        });

        return result.rows[0];
    }

    /**
     * Get all component schematics of a composite build
     * @param {string} parentSchematicId
     * @returns {Promise<Array>}
     */
    async getSchematicComponents(parentSchematicId) {
        const query = `
            SELECT
                sr.*,
                s.name as child_name,
                s.file_cid as child_file_cid,
                s.thumbnail_cid as child_thumbnail_cid,
                s.size_x as child_size_x,
                s.size_y as child_size_y,
                s.size_z as child_size_z,
                s.is_composite as child_is_composite
            FROM schematic_references sr
            JOIN schematics s ON sr.child_schematic_id = s.schematic_id
            WHERE sr.parent_schematic_id = $1
            ORDER BY sr.sort_order ASC, sr.added_at ASC
        `;

        const result = await this.pool.query(query, [parentSchematicId]);
        return result.rows;
    }

    /**
     * Remove a component from a composite build
     * @param {string} referenceId
     * @returns {Promise<boolean>}
     */
    async removeSchematicReference(referenceId) {
        // Get parent ID before deleting
        const getQuery = `SELECT parent_schematic_id FROM schematic_references WHERE reference_id = $1`;
        const getResult = await this.pool.query(getQuery, [referenceId]);

        if (getResult.rows.length === 0) return false;

        const parentId = getResult.rows[0].parent_schematic_id;

        const deleteQuery = `DELETE FROM schematic_references WHERE reference_id = $1`;
        await this.pool.query(deleteQuery, [referenceId]);

        // Update parent's composite status
        await this.updateSchematicCompositeStatus(parentId);

        this.log.info('Schematic reference removed', { referenceId, parentId });
        return true;
    }

    /**
     * Update a schematic's composite status and component count
     * @param {string} schematicId
     * @returns {Promise<void>}
     */
    async updateSchematicCompositeStatus(schematicId) {
        const query = `
            UPDATE schematics
            SET is_composite = (
                SELECT COUNT(*) > 0
                FROM schematic_references
                WHERE parent_schematic_id = $1
            ),
            component_count = (
                SELECT COUNT(*)
                FROM schematic_references
                WHERE parent_schematic_id = $1
            )
            WHERE schematic_id = $1
        `;

        await this.pool.query(query, [schematicId]);
    }

    /**
     * Get all builds that use a specific schematic as a component
     * @param {string} schematicId
     * @returns {Promise<Array>}
     */
    async getBuildsUsingSchematic(schematicId) {
        const query = `
            SELECT
                s.*,
                sr.offset_x, sr.offset_y, sr.offset_z,
                sr.layer_id
            FROM schematic_references sr
            JOIN schematics s ON sr.parent_schematic_id = s.schematic_id
            WHERE sr.child_schematic_id = $1
            ORDER BY s.created_at DESC
        `;

        const result = await this.pool.query(query, [schematicId]);
        return result.rows;
    }

    /**
     * Create a composite build from existing schematics
     * @param {Object} buildData - Build metadata
     * @param {Array} components - Array of component references
     * @returns {Promise<Object>}
     */
    async createCompositeBuild(buildData, components) {
        // Create the parent schematic first
        const schematic = await this.createSchematic({
            ...buildData,
            isComposite: true
        });

        // Add all component references
        for (let i = 0; i < components.length; i++) {
            const comp = components[i];
            await this.addSchematicReference({
                parentSchematicId: schematic.schematic_id,
                childSchematicId: comp.schematicId,
                offsetX: comp.offset?.[0] || 0,
                offsetY: comp.offset?.[1] || 0,
                offsetZ: comp.offset?.[2] || 0,
                rotationX: comp.rotation?.[0] || 0,
                rotationY: comp.rotation?.[1] || 0,
                rotationZ: comp.rotation?.[2] || 0,
                rotationW: comp.rotation?.[3] || 1,
                layerId: comp.layerId || 0,
                layerScaleRatio: comp.layerScaleRatio || 1.0,
                sortOrder: i
            });
        }

        this.log.info('Composite build created', {
            schematicId: schematic.schematic_id,
            name: buildData.name,
            componentCount: components.length
        });

        return schematic;
    }
}

// =============================================
// EXPORTS
// =============================================

export default CentralLibraryDB;
