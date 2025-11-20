/**
 * POLYMIR WORLD SERVER DATABASE ADAPTER
 * ======================================
 * Database operations for World Server (ephemeral world state, player positions, chunks)
 * Handles: megachunks, celestial bodies, player positions, chunk modifications, placements
 */

import { logger } from '../utils/logger.js';

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
                parent_body_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
            body.parentBodyId || null
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
     * @returns {Promise<Object>}
     */
    async recordSchematicPlacement(placement) {
        const query = `
            INSERT INTO schematic_placements (
                schematic_id, schematic_cid, body_id,
                position_x, position_y, position_z,
                rotation_x, rotation_y, rotation_z, rotation_w,
                placed_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING placement_id, placed_at
        `;

        const result = await this.pool.query(query, [
            placement.schematicId,
            placement.schematicCid,
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
            schematicId: placement.schematicId
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
}

// =============================================
// EXPORTS
// =============================================

export default WorldServerDB;
