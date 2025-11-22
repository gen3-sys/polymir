/**
 * POLYMIR WORLD SERVER DATABASE ADAPTER
 * ======================================
 * Database operations for World Server (ephemeral world state, player positions, chunks)
 * Handles: megachunks, celestial bodies, player positions, chunk modifications, placements
 */

import logger from '../utils/logger.js';

// =============================================
// WORLD SERVER DATABASE ADAPTER
// =============================================

export class WorldServerDB {
    constructor(pool) {
        this.pool = pool;
        this.log = logger.child('WorldServer');
    }

    // =============================================
    // MEGACHUNK OPERATIONS
    // =============================================

    /**
     * Create or get megachunk
     * @param {number} mx
     * @param {number} my
     * @param {number} mz
     * @param {bigint} seed
     * @returns {Promise<Object>}
     */
    async getOrCreateMegachunk(mx, my, mz, seed) {
        const query = `
            INSERT INTO megachunks (mx, my, mz, seed)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (mx, my, mz) DO UPDATE
            SET last_accessed = NOW()
            RETURNING megachunk_id, is_generated
        `;

        const result = await this.pool.query(query, [mx, my, mz, seed]);
        return result.rows[0];
    }

    /**
     * Get megachunk by coordinates
     * @param {number} mx
     * @param {number} my
     * @param {number} mz
     * @returns {Promise<Object|null>}
     */
    async getMegachunkByCoords(mx, my, mz) {
        const query = `
            SELECT *
            FROM megachunks
            WHERE mx = $1 AND my = $2 AND mz = $3
        `;

        const result = await this.pool.query(query, [mx, my, mz]);
        return result.rows[0] || null;
    }

    /**
     * Mark megachunk as generated
     * @param {string} megachunkId
     * @returns {Promise<void>}
     */
    async markMegachunkGenerated(megachunkId) {
        const query = `
            UPDATE megachunks
            SET is_generated = true
            WHERE megachunk_id = $1
        `;

        await this.pool.query(query, [megachunkId]);
    }

    /**
     * Get active megachunks (with players)
     * @returns {Promise<Array>}
     */
    async getActiveMegachunks() {
        const query = `
            SELECT *
            FROM megachunks
            WHERE is_active = true
            ORDER BY active_player_count DESC
        `;

        const result = await this.pool.query(query);
        return result.rows;
    }

    /**
     * Update megachunk active status
     * @param {string} megachunkId
     * @param {boolean} isActive
     * @returns {Promise<void>}
     */
    async updateMegachunkActiveStatus(megachunkId, isActive) {
        const query = `
            UPDATE megachunks
            SET is_active = $1
            WHERE megachunk_id = $2
        `;

        await this.pool.query(query, [isActive, megachunkId]);
    }

    // =============================================
    // CELESTIAL BODY OPERATIONS
    // =============================================

    /**
     * Create celestial body
     * @param {Object} body
     * @returns {Promise<Object>}
     */
    async createCelestialBody(body) {
        const query = `
            INSERT INTO celestial_bodies (
                megachunk_id, local_x, local_y, local_z,
                velocity_x, velocity_y, velocity_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                angular_velocity_x, angular_velocity_y, angular_velocity_z,
                body_type, generation_seed, schematic_cid, procedural_params,
                radius, mass, gravity_multiplier,
                gravitational_center_x, gravitational_center_y, gravitational_center_z,
                parent_body_id, original_body_id,
                shatter_generation, parent_fragment_id, fracture_pattern
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
            RETURNING body_id, created_at
        `;

        const result = await this.pool.query(query, [
            body.megachunkId,
            body.localX,
            body.localY,
            body.localZ,
            body.velocityX || 0,
            body.velocityY || 0,
            body.velocityZ || 0,
            body.rotationX || 0,
            body.rotationY || 0,
            body.rotationZ || 0,
            body.rotationW || 1,
            body.angularVelocityX || 0,
            body.angularVelocityY || 0.001,
            body.angularVelocityZ || 0,
            body.bodyType,
            body.generationSeed || null,
            body.schematicCid || null,
            body.proceduralParams ? JSON.stringify(body.proceduralParams) : null,
            body.radius,
            body.mass,
            body.gravityMultiplier || 1.0,
            body.gravitationalCenterX || 0,
            body.gravitationalCenterY || 0,
            body.gravitationalCenterZ || 0,
            body.parentBodyId || null,
            body.originalBodyId || null,
            body.shatterGeneration || 0,
            body.parentFragmentId !== undefined ? body.parentFragmentId : null,
            body.fracturePattern ? JSON.stringify(body.fracturePattern) : null
        ]);

        this.log.info('Celestial body created', {
            bodyId: result.rows[0].body_id,
            type: body.bodyType
        });

        return result.rows[0];
    }

    /**
     * Get celestial body by ID
     * @param {string} bodyId
     * @returns {Promise<Object|null>}
     */
    async getCelestialBodyById(bodyId) {
        const query = `
            SELECT *
            FROM celestial_bodies
            WHERE body_id = $1
        `;

        const result = await this.pool.query(query, [bodyId]);
        return result.rows[0] || null;
    }

    /**
     * Get celestial bodies in megachunk
     * @param {string} megachunkId
     * @returns {Promise<Array>}
     */
    async getCelestialBodiesInMegachunk(megachunkId) {
        const query = `
            SELECT *
            FROM celestial_bodies
            WHERE megachunk_id = $1
            ORDER BY body_type, radius DESC
        `;

        const result = await this.pool.query(query, [megachunkId]);
        return result.rows;
    }

    /**
     * Update celestial body physics
     * @param {string} bodyId
     * @param {Object} physics
     * @returns {Promise<void>}
     */
    async updateCelestialBodyPhysics(bodyId, physics) {
        const query = `
            UPDATE celestial_bodies
            SET local_x = $1,
                local_y = $2,
                local_z = $3,
                velocity_x = $4,
                velocity_y = $5,
                velocity_z = $6,
                rotation_x = $7,
                rotation_y = $8,
                rotation_z = $9,
                rotation_w = $10
            WHERE body_id = $11
        `;

        await this.pool.query(query, [
            physics.localX,
            physics.localY,
            physics.localZ,
            physics.velocityX,
            physics.velocityY,
            physics.velocityZ,
            physics.rotationX,
            physics.rotationY,
            physics.rotationZ,
            physics.rotationW,
            bodyId
        ]);
    }

    /**
     * Mark body as fractured
     * @param {string} bodyId
     * @returns {Promise<void>}
     */
    async markBodyFractured(bodyId) {
        const query = `
            UPDATE celestial_bodies
            SET is_fractured = true
            WHERE body_id = $1
        `;

        await this.pool.query(query, [bodyId]);
        this.log.info('Body marked as fractured', { bodyId });
    }

    // =============================================
    // PLAYER POSITION OPERATIONS
    // =============================================

    /**
     * Upsert player position
     * @param {string} playerId
     * @param {Object} position
     * @returns {Promise<void>}
     */
    async upsertPlayerPosition(playerId, position) {
        const query = `
            INSERT INTO player_positions (
                player_id, megachunk_id, body_id,
                position_x, position_y, position_z,
                velocity_x, velocity_y, velocity_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                is_online, websocket_connection_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (player_id) DO UPDATE
            SET megachunk_id = EXCLUDED.megachunk_id,
                body_id = EXCLUDED.body_id,
                position_x = EXCLUDED.position_x,
                position_y = EXCLUDED.position_y,
                position_z = EXCLUDED.position_z,
                velocity_x = EXCLUDED.velocity_x,
                velocity_y = EXCLUDED.velocity_y,
                velocity_z = EXCLUDED.velocity_z,
                rotation_x = EXCLUDED.rotation_x,
                rotation_y = EXCLUDED.rotation_y,
                rotation_z = EXCLUDED.rotation_z,
                rotation_w = EXCLUDED.rotation_w,
                is_online = EXCLUDED.is_online,
                websocket_connection_id = EXCLUDED.websocket_connection_id,
                last_position_update = NOW()
        `;

        await this.pool.query(query, [
            playerId,
            position.megachunkId || null,
            position.bodyId || null,
            position.positionX,
            position.positionY,
            position.positionZ,
            position.velocityX || 0,
            position.velocityY || 0,
            position.velocityZ || 0,
            position.rotationX || 0,
            position.rotationY || 0,
            position.rotationZ || 0,
            position.rotationW || 1,
            position.isOnline !== undefined ? position.isOnline : true,
            position.websocketConnectionId || null
        ]);
    }

    /**
     * Batch upsert player positions (for tick-based persistence)
     * @param {Array} positions - Array of position records
     * @returns {Promise<void>}
     */
    async batchUpsertPlayerPositions(positions) {
        if (positions.length === 0) return;

        // Build batch insert with UNNEST for efficiency
        const playerIds = positions.map(p => p.playerId);
        const megachunkIds = positions.map(p => p.megachunkId || null);
        const bodyIds = positions.map(p => p.bodyId || null);
        const posXs = positions.map(p => p.positionX);
        const posYs = positions.map(p => p.positionY);
        const posZs = positions.map(p => p.positionZ);
        const velXs = positions.map(p => p.velocityX || 0);
        const velYs = positions.map(p => p.velocityY || 0);
        const velZs = positions.map(p => p.velocityZ || 0);
        const rotXs = positions.map(p => p.rotationX || 0);
        const rotYs = positions.map(p => p.rotationY || 0);
        const rotZs = positions.map(p => p.rotationZ || 0);
        const rotWs = positions.map(p => p.rotationW || 1);
        const isOnlines = positions.map(p => p.isOnline !== false);
        const connIds = positions.map(p => p.websocketConnectionId || null);

        const query = `
            INSERT INTO player_positions (
                player_id, megachunk_id, body_id,
                position_x, position_y, position_z,
                velocity_x, velocity_y, velocity_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                is_online, websocket_connection_id, last_position_update
            )
            SELECT * FROM UNNEST(
                $1::uuid[], $2::uuid[], $3::uuid[],
                $4::real[], $5::real[], $6::real[],
                $7::real[], $8::real[], $9::real[],
                $10::real[], $11::real[], $12::real[], $13::real[],
                $14::boolean[], $15::text[]
            ) AS t(
                player_id, megachunk_id, body_id,
                position_x, position_y, position_z,
                velocity_x, velocity_y, velocity_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                is_online, websocket_connection_id
            ), NOW() AS last_position_update
            ON CONFLICT (player_id) DO UPDATE
            SET megachunk_id = EXCLUDED.megachunk_id,
                body_id = EXCLUDED.body_id,
                position_x = EXCLUDED.position_x,
                position_y = EXCLUDED.position_y,
                position_z = EXCLUDED.position_z,
                velocity_x = EXCLUDED.velocity_x,
                velocity_y = EXCLUDED.velocity_y,
                velocity_z = EXCLUDED.velocity_z,
                rotation_x = EXCLUDED.rotation_x,
                rotation_y = EXCLUDED.rotation_y,
                rotation_z = EXCLUDED.rotation_z,
                rotation_w = EXCLUDED.rotation_w,
                is_online = EXCLUDED.is_online,
                websocket_connection_id = EXCLUDED.websocket_connection_id,
                last_position_update = NOW()
        `;

        await this.pool.query(query, [
            playerIds, megachunkIds, bodyIds,
            posXs, posYs, posZs,
            velXs, velYs, velZs,
            rotXs, rotYs, rotZs, rotWs,
            isOnlines, connIds
        ]);

        this.log.debug(`Batch upserted ${positions.length} player positions`);
    }

    /**
     * Get player position
     * @param {string} playerId
     * @returns {Promise<Object|null>}
     */
    async getPlayerPosition(playerId) {
        const query = `
            SELECT *
            FROM player_positions
            WHERE player_id = $1
        `;

        const result = await this.pool.query(query, [playerId]);
        return result.rows[0] || null;
    }

    /**
     * Get players in megachunk
     * @param {string} megachunkId
     * @returns {Promise<Array>}
     */
    async getPlayersInMegachunk(megachunkId) {
        const query = `
            SELECT *
            FROM player_positions
            WHERE megachunk_id = $1 AND is_online = true
            ORDER BY last_position_update DESC
        `;

        const result = await this.pool.query(query, [megachunkId]);
        return result.rows;
    }

    /**
     * Get players on body
     * @param {string} bodyId
     * @returns {Promise<Array>}
     */
    async getPlayersOnBody(bodyId) {
        const query = `
            SELECT *
            FROM player_positions
            WHERE body_id = $1 AND is_online = true
            ORDER BY last_position_update DESC
        `;

        const result = await this.pool.query(query, [bodyId]);
        return result.rows;
    }

    /**
     * Mark player offline
     * @param {string} playerId
     * @returns {Promise<void>}
     */
    async markPlayerOffline(playerId) {
        const query = `
            UPDATE player_positions
            SET is_online = false,
                disconnected_at = NOW()
            WHERE player_id = $1
        `;

        await this.pool.query(query, [playerId]);
    }

    /**
     * Update player subscriptions
     * @param {string} playerId
     * @param {Array} megachunkIds
     * @param {Array} bodyIds
     * @returns {Promise<void>}
     */
    async updatePlayerSubscriptions(playerId, megachunkIds = [], bodyIds = []) {
        const query = `
            UPDATE player_positions
            SET subscribed_megachunks = $1,
                subscribed_bodies = $2
            WHERE player_id = $3
        `;

        await this.pool.query(query, [megachunkIds, bodyIds, playerId]);
    }

    // =============================================
    // CHUNK MODIFICATION OPERATIONS
    // =============================================

    /**
     * Record chunk modification
     * @param {Object} modification
     * @returns {Promise<Object>}
     */
    async recordChunkModification(modification) {
        const query = `
            INSERT INTO chunk_modifications (
                body_id, chunk_x, chunk_y, chunk_z,
                chunk_data_cid, modified_by, modification_type,
                trust_score_at_modification
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (body_id, chunk_x, chunk_y, chunk_z) DO UPDATE
            SET chunk_data_cid = EXCLUDED.chunk_data_cid,
                modified_by = EXCLUDED.modified_by,
                modification_type = EXCLUDED.modification_type,
                modified_at = NOW(),
                is_validated = false,
                validated_at = NULL
            RETURNING modification_id, modified_at
        `;

        const result = await this.pool.query(query, [
            modification.bodyId,
            modification.chunkX,
            modification.chunkY,
            modification.chunkZ,
            modification.chunkDataCid,
            modification.modifiedBy,
            modification.modificationType,
            modification.trustScore || null
        ]);

        this.log.debug('Chunk modification recorded', {
            modificationId: result.rows[0].modification_id,
            bodyId: modification.bodyId
        });

        return result.rows[0];
    }

    /**
     * Get chunk modification
     * @param {string} bodyId
     * @param {number} chunkX
     * @param {number} chunkY
     * @param {number} chunkZ
     * @returns {Promise<Object|null>}
     */
    async getChunkModification(bodyId, chunkX, chunkY, chunkZ) {
        const query = `
            SELECT *
            FROM chunk_modifications
            WHERE body_id = $1
              AND chunk_x = $2
              AND chunk_y = $3
              AND chunk_z = $4
        `;

        const result = await this.pool.query(query, [bodyId, chunkX, chunkY, chunkZ]);
        return result.rows[0] || null;
    }

    /**
     * Get chunk modifications on body
     * @param {string} bodyId
     * @returns {Promise<Array>}
     */
    async getChunkModificationsOnBody(bodyId) {
        const query = `
            SELECT *
            FROM chunk_modifications
            WHERE body_id = $1
            ORDER BY modified_at DESC
        `;

        const result = await this.pool.query(query, [bodyId]);
        return result.rows;
    }

    /**
     * Mark chunk modification as validated
     * @param {string} modificationId
     * @param {string} validationProofCid
     * @returns {Promise<void>}
     */
    async markChunkModificationValidated(modificationId, validationProofCid) {
        const query = `
            UPDATE chunk_modifications
            SET is_validated = true,
                validation_proof_cid = $1,
                validated_at = NOW()
            WHERE modification_id = $2
        `;

        await this.pool.query(query, [validationProofCid, modificationId]);
    }

    // =============================================
    // SCHEMATIC PLACEMENT OPERATIONS
    // =============================================

    /**
     * Record schematic placement
     * @param {Object} placement
     * @param {string} placement.schematicId - Central Library schematic ID
     * @param {string} placement.schematicCid - IPFS CID of .mvox file
     * @param {number} placement.layerId - Layer index (0 = blocks, 1 = microblocks, etc.)
     * @param {number} placement.layerScaleRatio - Scale ratio (1.0 = blocks, 0.0625 = microblocks)
     * @param {string} placement.bodyId - Celestial body ID
     * @param {number} placement.positionX/Y/Z - Position relative to gravitational center
     * @returns {Promise<Object>}
     */
    async recordSchematicPlacement(placement) {
        const query = `
            INSERT INTO schematic_placements (
                schematic_id, schematic_cid,
                layer_id, layer_scale_ratio,
                body_id,
                position_x, position_y, position_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                placed_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING placement_id, placed_at
        `;

        const result = await this.pool.query(query, [
            placement.schematicId,
            placement.schematicCid,
            placement.layerId || 0,
            placement.layerScaleRatio || 1.0,
            placement.bodyId,
            placement.positionX,
            placement.positionY,
            placement.positionZ,
            placement.rotationX || 0,
            placement.rotationY || 0,
            placement.rotationZ || 0,
            placement.rotationW || 1,
            placement.placedBy
        ]);

        this.log.info('Schematic placed', {
            placementId: result.rows[0].placement_id,
            schematicId: placement.schematicId,
            layerId: placement.layerId || 0,
            layerScaleRatio: placement.layerScaleRatio || 1.0
        });

        return result.rows[0];
    }

    /**
     * Get schematic placements on body
     * @param {string} bodyId
     * @returns {Promise<Array>}
     */
    async getSchematicPlacementsOnBody(bodyId) {
        const query = `
            SELECT *
            FROM schematic_placements
            WHERE body_id = $1
            ORDER BY placed_at DESC
        `;

        const result = await this.pool.query(query, [bodyId]);
        return result.rows;
    }

    /**
     * Get schematic placements on body for a specific layer (sparse loading)
     * @param {string} bodyId
     * @param {number} layerId - Layer index (0 = blocks, 1 = microblocks, etc.)
     * @returns {Promise<Array>}
     */
    async getSchematicPlacementsByLayer(bodyId, layerId) {
        const query = `
            SELECT *
            FROM schematic_placements
            WHERE body_id = $1 AND layer_id = $2
            ORDER BY placed_at DESC
        `;

        const result = await this.pool.query(query, [bodyId, layerId]);
        return result.rows;
    }

    /**
     * Get all fragments of an original body (fracture lineage)
     * @param {string} originalBodyId - The root body before any shattering
     * @returns {Promise<Array>}
     */
    async getBodyFragments(originalBodyId) {
        const query = `
            SELECT *
            FROM celestial_bodies
            WHERE original_body_id = $1
            ORDER BY shatter_generation ASC, created_at ASC
        `;

        const result = await this.pool.query(query, [originalBodyId]);
        return result.rows;
    }

    /**
     * Get schematic placements by player
     * @param {string} playerId
     * @returns {Promise<Array>}
     */
    async getSchematicPlacementsByPlayer(playerId) {
        const query = `
            SELECT *
            FROM schematic_placements
            WHERE placed_by = $1
            ORDER BY placed_at DESC
        `;

        const result = await this.pool.query(query, [playerId]);
        return result.rows;
    }

    /**
     * Mark placement as validated
     * @param {string} placementId
     * @param {string} validationProofCid
     * @returns {Promise<void>}
     */
    async markPlacementValidated(placementId, validationProofCid) {
        const query = `
            UPDATE schematic_placements
            SET is_validated = true,
                validation_proof_cid = $1,
                validated_at = NOW()
            WHERE placement_id = $2
        `;

        await this.pool.query(query, [validationProofCid, placementId]);
    }

    // =============================================
    // PENDING VALIDATION OPERATIONS
    // =============================================

    /**
     * Create pending validation
     * @param {Object} validation
     * @returns {Promise<Object>}
     */
    async createPendingValidation(validation) {
        const query = `
            INSERT INTO pending_validations (
                event_type, event_data_cid, submitter_id, submitter_trust_score,
                megachunk_id, body_id, required_validators
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING validation_id, submitted_at, expires_at
        `;

        const result = await this.pool.query(query, [
            validation.eventType,
            validation.eventDataCid,
            validation.submitterId,
            validation.submitterTrustScore,
            validation.megachunkId || null,
            validation.bodyId || null,
            validation.requiredValidators
        ]);

        return result.rows[0];
    }

    /**
     * Get pending validations
     * @param {string} status
     * @returns {Promise<Array>}
     */
    async getPendingValidations(status = 'pending') {
        const query = `
            SELECT *
            FROM pending_validations
            WHERE status = $1
              AND expires_at > NOW()
            ORDER BY submitted_at ASC
        `;

        const result = await this.pool.query(query, [status]);
        return result.rows;
    }

    /**
     * Update validation status
     * @param {string} validationId
     * @param {string} status
     * @param {number} currentValidators
     * @returns {Promise<void>}
     */
    async updateValidationStatus(validationId, status, currentValidators = null) {
        const query = `
            UPDATE pending_validations
            SET status = $1,
                current_validators = COALESCE($2, current_validators),
                completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
            WHERE validation_id = $3
        `;

        await this.pool.query(query, [status, currentValidators, validationId]);
    }

    /**
     * Clean up expired validations
     * @returns {Promise<number>}
     */
    async cleanupExpiredValidations() {
        const result = await this.pool.query('SELECT cleanup_expired_validations()');
        return result.rows[0].cleanup_expired_validations;
    }

    // =============================================
    // WORLD SNAPSHOT OPERATIONS
    // =============================================

    /**
     * Create world snapshot
     * @param {Object} snapshot
     * @returns {Promise<Object>}
     */
    async createWorldSnapshot(snapshot) {
        const query = `
            INSERT INTO world_snapshots (
                snapshot_name, description, snapshot_data_cid,
                megachunk_count, body_count,
                chunk_modification_count, schematic_placement_count
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING snapshot_id, created_at
        `;

        const result = await this.pool.query(query, [
            snapshot.name,
            snapshot.description || null,
            snapshot.dataCid,
            snapshot.megachunkCount,
            snapshot.bodyCount,
            snapshot.chunkModificationCount,
            snapshot.schematicPlacementCount
        ]);

        this.log.info('World snapshot created', {
            snapshotId: result.rows[0].snapshot_id,
            name: snapshot.name
        });

        return result.rows[0];
    }

    /**
     * Get recent world snapshots
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getRecentSnapshots(limit = 10) {
        const query = `
            SELECT *
            FROM world_snapshots
            ORDER BY created_at DESC
            LIMIT $1
        `;

        const result = await this.pool.query(query, [limit]);
        return result.rows;
    }

    // =============================================
    // DAMAGE MAP OPERATIONS
    // =============================================

    /**
     * Record a voxel change in the damage map
     * @param {Object} entry - Damage map entry
     * @returns {Promise<Object>}
     */
    async recordDamageMapEntry(entry) {
        const query = `
            INSERT INTO damage_map (
                body_id, voxel_x, voxel_y, voxel_z, layer_id,
                change_type, voxel_type, voxel_color,
                player_id, trust_score_at_change,
                build_mode, attached_schematic_placement_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (body_id, voxel_x, voxel_y, voxel_z, layer_id) DO UPDATE
            SET change_type = EXCLUDED.change_type,
                voxel_type = EXCLUDED.voxel_type,
                voxel_color = EXCLUDED.voxel_color,
                player_id = EXCLUDED.player_id,
                trust_score_at_change = EXCLUDED.trust_score_at_change,
                build_mode = EXCLUDED.build_mode,
                attached_schematic_placement_id = EXCLUDED.attached_schematic_placement_id,
                created_at = NOW()
            RETURNING damage_id, created_at
        `;

        const result = await this.pool.query(query, [
            entry.bodyId,
            entry.voxelX,
            entry.voxelY,
            entry.voxelZ,
            entry.layerId || 0,
            entry.changeType, // 'add' or 'remove'
            entry.voxelType || null,
            entry.voxelColor || null,
            entry.playerId,
            entry.trustScore || null,
            entry.buildMode || 'new_schematic',
            entry.attachedSchematicPlacementId || null
        ]);

        // Also record in history for undo support
        await this.recordDamageMapHistory(entry);

        return result.rows[0];
    }

    /**
     * Record damage map change in history (for undo)
     * @param {Object} entry
     */
    async recordDamageMapHistory(entry) {
        const query = `
            INSERT INTO damage_map_history (
                body_id, voxel_x, voxel_y, voxel_z, layer_id,
                change_type, voxel_type, voxel_color,
                player_id, build_mode
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        await this.pool.query(query, [
            entry.bodyId,
            entry.voxelX,
            entry.voxelY,
            entry.voxelZ,
            entry.layerId || 0,
            entry.changeType,
            entry.voxelType || null,
            entry.voxelColor || null,
            entry.playerId,
            entry.buildMode || 'new_schematic'
        ]);
    }

    /**
     * Get all damage map entries for a body
     * @param {string} bodyId
     * @param {number} layerId - Optional layer filter
     * @returns {Promise<Array>}
     */
    async getDamageMapForBody(bodyId, layerId = null) {
        let query = `
            SELECT *
            FROM damage_map
            WHERE body_id = $1
        `;
        const params = [bodyId];

        if (layerId !== null) {
            query += ` AND layer_id = $2`;
            params.push(layerId);
        }

        query += ` ORDER BY created_at DESC`;

        const result = await this.pool.query(query, params);
        return result.rows;
    }

    /**
     * Get unconverted damage map entries (not yet made into schematics)
     * @param {string} bodyId
     * @param {string} buildMode - Filter by build mode
     * @returns {Promise<Array>}
     */
    async getUnconvertedDamageMap(bodyId, buildMode = 'new_schematic') {
        const query = `
            SELECT *
            FROM damage_map
            WHERE body_id = $1
              AND build_mode = $2
              AND converted_to_schematic_id IS NULL
              AND change_type = 'add'
            ORDER BY created_at ASC
        `;

        const result = await this.pool.query(query, [bodyId, buildMode]);
        return result.rows;
    }

    /**
     * Get damage map entries by player
     * @param {string} playerId
     * @param {string} bodyId - Optional body filter
     * @returns {Promise<Array>}
     */
    async getDamageMapByPlayer(playerId, bodyId = null) {
        let query = `
            SELECT *
            FROM damage_map
            WHERE player_id = $1
        `;
        const params = [playerId];

        if (bodyId) {
            query += ` AND body_id = $2`;
            params.push(bodyId);
        }

        query += ` ORDER BY created_at DESC`;

        const result = await this.pool.query(query, params);
        return result.rows;
    }

    /**
     * Get damage map entries attached to a schematic placement (for EXTEND_BUILD mode)
     * @param {string} placementId
     * @returns {Promise<Array>}
     */
    async getDamageMapForPlacement(placementId) {
        const query = `
            SELECT *
            FROM damage_map
            WHERE attached_schematic_placement_id = $1
            ORDER BY created_at ASC
        `;

        const result = await this.pool.query(query, [placementId]);
        return result.rows;
    }

    /**
     * Mark damage map entries as converted to a schematic
     * @param {Array<string>} damageIds - Array of damage_id UUIDs
     * @param {string} schematicId - The schematic these were converted to
     * @returns {Promise<number>} Number of entries updated
     */
    async convertDamageToSchematic(damageIds, schematicId) {
        if (!damageIds || damageIds.length === 0) return 0;

        const query = `
            UPDATE damage_map
            SET converted_to_schematic_id = $1,
                converted_at = NOW()
            WHERE damage_id = ANY($2)
        `;

        const result = await this.pool.query(query, [schematicId, damageIds]);

        this.log.info('Damage map entries converted to schematic', {
            schematicId,
            count: result.rowCount
        });

        return result.rowCount;
    }

    /**
     * Delete damage map entries (after successful schematic creation)
     * @param {Array<string>} damageIds
     * @returns {Promise<number>}
     */
    async deleteDamageMapEntries(damageIds) {
        if (!damageIds || damageIds.length === 0) return 0;

        const query = `
            DELETE FROM damage_map
            WHERE damage_id = ANY($1)
        `;

        const result = await this.pool.query(query, [damageIds]);
        return result.rowCount;
    }

    /**
     * Get damage map entry at specific position
     * @param {string} bodyId
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} layerId
     * @returns {Promise<Object|null>}
     */
    async getDamageMapAt(bodyId, x, y, z, layerId = 0) {
        const query = `
            SELECT *
            FROM damage_map
            WHERE body_id = $1
              AND voxel_x = $2
              AND voxel_y = $3
              AND voxel_z = $4
              AND layer_id = $5
        `;

        const result = await this.pool.query(query, [bodyId, x, y, z, layerId]);
        return result.rows[0] || null;
    }

    /**
     * Get recent damage history for a player (for undo)
     * @param {string} playerId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getPlayerDamageHistory(playerId, limit = 50) {
        const query = `
            SELECT *
            FROM damage_map_history
            WHERE player_id = $1
              AND undone_at IS NULL
            ORDER BY created_at DESC
            LIMIT $2
        `;

        const result = await this.pool.query(query, [playerId, limit]);
        return result.rows;
    }

    /**
     * Undo a damage map entry
     * @param {string} historyId
     * @param {string} undoneBy - Player who is undoing
     * @returns {Promise<boolean>}
     */
    async undoDamageMapEntry(historyId, undoneBy) {
        // Get the history entry
        const historyQuery = `
            SELECT * FROM damage_map_history WHERE history_id = $1
        `;
        const historyResult = await this.pool.query(historyQuery, [historyId]);
        const historyEntry = historyResult.rows[0];

        if (!historyEntry) return false;

        // Delete from damage_map
        const deleteQuery = `
            DELETE FROM damage_map
            WHERE body_id = $1
              AND voxel_x = $2
              AND voxel_y = $3
              AND voxel_z = $4
              AND layer_id = $5
        `;

        await this.pool.query(deleteQuery, [
            historyEntry.body_id,
            historyEntry.voxel_x,
            historyEntry.voxel_y,
            historyEntry.voxel_z,
            historyEntry.layer_id
        ]);

        // Mark history as undone
        const undoQuery = `
            UPDATE damage_map_history
            SET undone_at = NOW(),
                undone_by = $1
            WHERE history_id = $2
        `;

        await this.pool.query(undoQuery, [undoneBy, historyId]);

        this.log.debug('Damage map entry undone', { historyId, undoneBy });
        return true;
    }

    // =============================================
    // PLAYER BUILD MODE OPERATIONS
    // =============================================

    /**
     * Update player's build mode
     * @param {string} playerId
     * @param {string} buildMode - 'new_schematic' | 'extend_build' | 'raw_damage'
     * @param {string} extendingPlacementId - If extend_build, which placement
     * @returns {Promise<void>}
     */
    async updatePlayerBuildMode(playerId, buildMode, extendingPlacementId = null) {
        const query = `
            UPDATE player_positions
            SET current_build_mode = $1,
                extending_placement_id = $2
            WHERE player_id = $3
        `;

        await this.pool.query(query, [buildMode, extendingPlacementId, playerId]);

        this.log.debug('Player build mode updated', {
            playerId,
            buildMode,
            extendingPlacementId
        });
    }

    /**
     * Get player's current build mode
     * @param {string} playerId
     * @returns {Promise<Object>}
     */
    async getPlayerBuildMode(playerId) {
        const query = `
            SELECT current_build_mode, extending_placement_id
            FROM player_positions
            WHERE player_id = $1
        `;

        const result = await this.pool.query(query, [playerId]);
        if (result.rows.length === 0) {
            return { buildMode: 'new_schematic', extendingPlacementId: null };
        }

        return {
            buildMode: result.rows[0].current_build_mode,
            extendingPlacementId: result.rows[0].extending_placement_id
        };
    }

    // =============================================
    // SHIP OPERATIONS
    // =============================================

    /**
     * Create a ship from a schematic placement
     * @param {Object} shipData
     * @returns {Promise<Object>}
     */
    async createShip(shipData) {
        const config = shipData.config || {};

        const query = `
            INSERT INTO ships (
                schematic_placement_id, owner_id, name,
                megachunk_id, position_x, position_y, position_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                mass, total_thrust, fuel_capacity, current_fuel, gyroscope_strength,
                control_panel_position, thrusters, pilot_seat_position, passenger_seats,
                gravity_vector_x, gravity_vector_y, gravity_vector_z
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
            RETURNING *
        `;

        const result = await this.pool.query(query, [
            shipData.schematicPlacementId,
            shipData.ownerId,
            shipData.name || 'Unnamed Ship',
            shipData.megachunkId || null,
            shipData.position?.x || 0,
            shipData.position?.y || 0,
            shipData.position?.z || 0,
            shipData.rotation?.x || 0,
            shipData.rotation?.y || 0,
            shipData.rotation?.z || 0,
            shipData.rotation?.w || 1,
            config.mass || 100,
            config.totalThrust || 0,
            config.fuelCapacity || 0,
            config.currentFuel || config.fuelCapacity || 0,
            config.gyroscopeStrength || 0,
            JSON.stringify(config.controlPanelPosition || null),
            JSON.stringify(config.thrusters || []),
            JSON.stringify(config.pilotSeat || null),
            JSON.stringify(config.passengerSeats || []),
            config.gravityVector?.x || 0,
            config.gravityVector?.y || -1,
            config.gravityVector?.z || 0
        ]);

        this.log.info('Ship created', { shipId: result.rows[0].ship_id, name: shipData.name });
        return result.rows[0];
    }

    /**
     * Get ship by ID
     * @param {string} shipId
     * @returns {Promise<Object|null>}
     */
    async getShip(shipId) {
        const query = `SELECT * FROM ships WHERE ship_id = $1`;
        const result = await this.pool.query(query, [shipId]);
        return result.rows[0] || null;
    }

    /**
     * Get ship by schematic placement
     * @param {string} placementId
     * @returns {Promise<Object|null>}
     */
    async getShipByPlacement(placementId) {
        const query = `SELECT * FROM ships WHERE schematic_placement_id = $1`;
        const result = await this.pool.query(query, [placementId]);
        return result.rows[0] || null;
    }

    /**
     * Get all ships in a megachunk
     * @param {string} megachunkId
     * @returns {Promise<Array>}
     */
    async getShipsInMegachunk(megachunkId) {
        const query = `
            SELECT * FROM ships
            WHERE megachunk_id = $1 AND state != 'destroyed'
            ORDER BY created_at DESC
        `;
        const result = await this.pool.query(query, [megachunkId]);
        return result.rows;
    }

    /**
     * Update ship state
     * @param {string} shipId
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    async updateShipState(shipId, updates) {
        const allowedFields = [
            'state', 'pilot_id', 'megachunk_id',
            'position_x', 'position_y', 'position_z',
            'velocity_x', 'velocity_y', 'velocity_z',
            'rotation_x', 'rotation_y', 'rotation_z', 'rotation_w',
            'angular_velocity_x', 'angular_velocity_y', 'angular_velocity_z',
            'current_fuel', 'docked_to_body_id', 'docked_to_ship_id',
            'last_piloted_at'
        ];

        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (setClauses.length === 0) return null;

        setClauses.push(`last_updated = NOW()`);
        values.push(shipId);

        const query = `
            UPDATE ships
            SET ${setClauses.join(', ')}
            WHERE ship_id = $${paramIndex}
            RETURNING *
        `;

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Get player's current ship (if aboard any)
     * @param {string} playerId
     * @returns {Promise<Object|null>}
     */
    async getPlayerShip(playerId) {
        const query = `
            SELECT s.*
            FROM ships s
            JOIN ship_passengers sp ON s.ship_id = sp.ship_id
            WHERE sp.player_id = $1
        `;
        const result = await this.pool.query(query, [playerId]);
        return result.rows[0] || null;
    }

    /**
     * Add passenger to ship
     * @param {string} shipId
     * @param {string} playerId
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async addShipPassenger(shipId, playerId, options = {}) {
        const query = `
            INSERT INTO ship_passengers (ship_id, player_id, is_pilot, seat_index)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (player_id) DO UPDATE
            SET ship_id = EXCLUDED.ship_id,
                is_pilot = EXCLUDED.is_pilot,
                seat_index = EXCLUDED.seat_index,
                boarded_at = NOW()
            RETURNING *
        `;

        const result = await this.pool.query(query, [
            shipId,
            playerId,
            options.isPilot || false,
            options.seatIndex ?? null
        ]);

        this.log.debug('Player boarded ship', { shipId, playerId, isPilot: options.isPilot });
        return result.rows[0];
    }

    /**
     * Remove passenger from ship
     * @param {string} shipId
     * @param {string} playerId
     * @returns {Promise<boolean>}
     */
    async removeShipPassenger(shipId, playerId) {
        const query = `DELETE FROM ship_passengers WHERE ship_id = $1 AND player_id = $2`;
        const result = await this.pool.query(query, [shipId, playerId]);
        this.log.debug('Player exited ship', { shipId, playerId });
        return result.rowCount > 0;
    }

    /**
     * Get ship passenger
     * @param {string} shipId
     * @param {string} playerId
     * @returns {Promise<Object|null>}
     */
    async getShipPassenger(shipId, playerId) {
        const query = `SELECT * FROM ship_passengers WHERE ship_id = $1 AND player_id = $2`;
        const result = await this.pool.query(query, [shipId, playerId]);
        return result.rows[0] || null;
    }

    /**
     * Update ship passenger
     * @param {string} shipId
     * @param {string} playerId
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    async updateShipPassenger(shipId, playerId, updates) {
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (['is_pilot', 'seat_index', 'local_x', 'local_y', 'local_z'].includes(key)) {
                setClauses.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (setClauses.length === 0) return null;

        values.push(shipId, playerId);

        const query = `
            UPDATE ship_passengers
            SET ${setClauses.join(', ')}
            WHERE ship_id = $${paramIndex} AND player_id = $${paramIndex + 1}
            RETURNING *
        `;

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Get all passengers on a ship
     * @param {string} shipId
     * @returns {Promise<Array>}
     */
    async getShipPassengers(shipId) {
        const query = `SELECT * FROM ship_passengers WHERE ship_id = $1`;
        const result = await this.pool.query(query, [shipId]);
        return result.rows;
    }

    /**
     * Get schematic placement by ID
     * @param {string} placementId
     * @returns {Promise<Object|null>}
     */
    async getSchematicPlacement(placementId) {
        const query = `SELECT * FROM schematic_placements WHERE placement_id = $1`;
        const result = await this.pool.query(query, [placementId]);
        return result.rows[0] || null;
    }
}

// =============================================
// EXPORTS
// =============================================

export default WorldServerDB;
