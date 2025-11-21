/**
 * POLYMIR MEGACHUNK TRANSFER SYSTEM
 * ==================================
 * Handles celestial body transfers between megachunks
 * Detects boundary crossings and updates spatial database
 */

import logger from '../utils/logger.js';
import { worldToMegachunk, worldToMegachunkLocal } from '../utils/coordinates.js';

const log = logger.child('MegachunkTransfer');

// =============================================
// CONSTANTS
// =============================================

// Megachunk dimensions (each megachunk is 256x256x256 units)
const MEGACHUNK_SIZE = 256;

// Local position bounds within megachunk (0-255.999...)
const LOCAL_MIN = 0;
const LOCAL_MAX = 256;

// =============================================
// BOUNDARY DETECTION
// =============================================

/**
 * Check if position is outside megachunk bounds
 * @param {number} localX
 * @param {number} localY
 * @param {number} localZ
 * @returns {boolean}
 */
export function isOutOfBounds(localX, localY, localZ) {
    return localX < LOCAL_MIN || localX >= LOCAL_MAX ||
           localY < LOCAL_MIN || localY >= LOCAL_MAX ||
           localZ < LOCAL_MIN || localZ >= LOCAL_MAX;
}

/**
 * Calculate which boundary was crossed
 * @param {number} localX
 * @param {number} localY
 * @param {number} localZ
 * @returns {Object} Boundary crossing info
 */
export function detectBoundaryCrossing(localX, localY, localZ) {
    const crossings = {
        x: 0,  // -1 = crossed negative, +1 = crossed positive, 0 = no crossing
        y: 0,
        z: 0,
        crossed: false
    };

    if (localX < LOCAL_MIN) {
        crossings.x = -1;
        crossings.crossed = true;
    } else if (localX >= LOCAL_MAX) {
        crossings.x = 1;
        crossings.crossed = true;
    }

    if (localY < LOCAL_MIN) {
        crossings.y = -1;
        crossings.crossed = true;
    } else if (localY >= LOCAL_MAX) {
        crossings.y = 1;
        crossings.crossed = true;
    }

    if (localZ < LOCAL_MIN) {
        crossings.z = -1;
        crossings.crossed = true;
    } else if (localZ >= LOCAL_MAX) {
        crossings.z = 1;
        crossings.crossed = true;
    }

    return crossings;
}

/**
 * Wrap position to valid local coordinates
 * @param {number} value
 * @returns {number} Wrapped value (0-255.999...)
 */
export function wrapLocalPosition(value) {
    // Handle negative wrapping
    if (value < LOCAL_MIN) {
        return LOCAL_MAX + (value % MEGACHUNK_SIZE);
    }

    // Handle positive wrapping
    if (value >= LOCAL_MAX) {
        return value % MEGACHUNK_SIZE;
    }

    return value;
}

/**
 * Calculate new megachunk coordinates after crossing
 * @param {number} mx - Current megachunk X
 * @param {number} my - Current megachunk Y
 * @param {number} mz - Current megachunk Z
 * @param {Object} crossing - Boundary crossing info
 * @returns {Object} New megachunk coordinates
 */
export function calculateNewMegachunk(mx, my, mz, crossing) {
    return {
        mx: mx + crossing.x,
        my: my + crossing.y,
        mz: mz + crossing.z
    };
}

// =============================================
// MEGACHUNK TRANSFER SYSTEM
// =============================================

export class MegachunkTransferSystem {
    constructor(worldServerDB) {
        this.worldServerDB = worldServerDB;
        this.transferQueue = [];
        this.isProcessing = false;
    }

    /**
     * Check body position and handle megachunk transfer if needed
     * @param {Object} body - Celestial body object
     * @returns {Promise<Object>} Transfer result
     */
    async checkAndTransfer(body) {
        const { body_id, local_x, local_y, local_z } = body;

        // Check if out of bounds
        if (!isOutOfBounds(local_x, local_y, local_z)) {
            return {
                transferred: false,
                bodyId: body_id
            };
        }

        // Detect crossing
        const crossing = detectBoundaryCrossing(local_x, local_y, local_z);

        if (!crossing.crossed) {
            return {
                transferred: false,
                bodyId: body_id
            };
        }

        log.info('Megachunk boundary crossed', {
            bodyId: body_id,
            bodyType: body.body_type,
            position: [local_x, local_y, local_z],
            crossing: [crossing.x, crossing.y, crossing.z]
        });

        // Get current megachunk
        const currentMegachunk = await this.worldServerDB.pool.query(
            'SELECT mx, my, mz FROM megachunks WHERE megachunk_id = $1',
            [body.megachunk_id]
        );

        if (currentMegachunk.rows.length === 0) {
            log.error('Current megachunk not found', {
                bodyId: body_id,
                megachunkId: body.megachunk_id
            });
            return { transferred: false, error: 'Megachunk not found' };
        }

        const { mx, my, mz } = currentMegachunk.rows[0];

        // Calculate new megachunk coordinates
        const newCoords = calculateNewMegachunk(mx, my, mz, crossing);

        // Wrap local positions
        const newLocalX = wrapLocalPosition(local_x);
        const newLocalY = wrapLocalPosition(local_y);
        const newLocalZ = wrapLocalPosition(local_z);

        // Get or create target megachunk
        const targetMegachunk = await this.worldServerDB.getOrCreateMegachunk(
            newCoords.mx,
            newCoords.my,
            newCoords.mz,
            body.generation_seed || BigInt(Date.now())
        );

        // Transfer body to new megachunk
        const result = await this.transferBody(
            body,
            targetMegachunk.megachunk_id,
            newLocalX,
            newLocalY,
            newLocalZ
        );

        log.info('Body transferred to new megachunk', {
            bodyId: body_id,
            fromMegachunk: { mx, my, mz },
            toMegachunk: newCoords,
            newLocalPosition: [newLocalX, newLocalY, newLocalZ]
        });

        return result;
    }

    /**
     * Transfer body to new megachunk
     * @param {Object} body
     * @param {string} newMegachunkId
     * @param {number} newLocalX
     * @param {number} newLocalY
     * @param {number} newLocalZ
     * @returns {Promise<Object>}
     */
    async transferBody(body, newMegachunkId, newLocalX, newLocalY, newLocalZ) {
        try {
            // Update body's megachunk and local position
            await this.worldServerDB.pool.query(`
                UPDATE celestial_bodies
                SET megachunk_id = $1,
                    local_x = $2,
                    local_y = $3,
                    local_z = $4
                WHERE body_id = $5
            `, [newMegachunkId, newLocalX, newLocalY, newLocalZ, body.body_id]);

            // Update player positions for players on this body
            await this.worldServerDB.pool.query(`
                UPDATE player_positions
                SET megachunk_id = $1
                WHERE body_id = $2 AND is_online = true
            `, [newMegachunkId, body.body_id]);

            log.debug('Body and associated players transferred', {
                bodyId: body.body_id,
                newMegachunkId
            });

            return {
                transferred: true,
                bodyId: body.body_id,
                oldMegachunkId: body.megachunk_id,
                newMegachunkId,
                newLocalPosition: {
                    x: newLocalX,
                    y: newLocalY,
                    z: newLocalZ
                }
            };

        } catch (error) {
            log.error('Body transfer failed', {
                bodyId: body.body_id,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Process multiple body transfers in batch
     * @param {Array} bodies
     * @returns {Promise<Array>}
     */
    async processBatch(bodies) {
        const results = [];

        for (const body of bodies) {
            try {
                const result = await this.checkAndTransfer(body);
                results.push(result);
            } catch (error) {
                log.error('Batch transfer failed for body', {
                    bodyId: body.body_id,
                    error: error.message
                });

                results.push({
                    transferred: false,
                    bodyId: body.body_id,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Get bodies near megachunk boundaries
     * Bodies within threshold distance of boundary
     * @param {number} threshold - Distance from boundary (default 10 units)
     * @returns {Promise<Array>}
     */
    async getBodiesNearBoundaries(threshold = 10) {
        const query = `
            SELECT cb.*
            FROM celestial_bodies cb
            WHERE cb.local_x < $1 OR cb.local_x > $2
               OR cb.local_y < $1 OR cb.local_y > $2
               OR cb.local_z < $1 OR cb.local_z > $2
        `;

        const nearMin = threshold;
        const nearMax = MEGACHUNK_SIZE - threshold;

        const result = await this.worldServerDB.pool.query(query, [nearMin, nearMax]);

        return result.rows;
    }

    /**
     * Calculate estimated time until boundary crossing
     * @param {Object} body
     * @returns {number} Time in seconds (Infinity if not approaching boundary)
     */
    calculateTimeUntilBoundaryCrossing(body) {
        const { local_x, local_y, local_z, velocity_x, velocity_y, velocity_z } = body;

        // Calculate time to each boundary
        const times = [];

        // X axis
        if (velocity_x > 0) {
            times.push((LOCAL_MAX - local_x) / velocity_x);
        } else if (velocity_x < 0) {
            times.push((local_x - LOCAL_MIN) / Math.abs(velocity_x));
        }

        // Y axis
        if (velocity_y > 0) {
            times.push((LOCAL_MAX - local_y) / velocity_y);
        } else if (velocity_y < 0) {
            times.push((local_y - LOCAL_MIN) / Math.abs(velocity_y));
        }

        // Z axis
        if (velocity_z > 0) {
            times.push((LOCAL_MAX - local_z) / velocity_z);
        } else if (velocity_z < 0) {
            times.push((local_z - LOCAL_MIN) / Math.abs(velocity_z));
        }

        // Return minimum time (first boundary to be crossed)
        return times.length > 0 ? Math.min(...times) : Infinity;
    }

    /**
     * Predict which bodies will cross boundaries in next N seconds
     * @param {number} timeWindow - Time window in seconds
     * @returns {Promise<Array>}
     */
    async predictBoundaryCrossings(timeWindow = 60) {
        // Get all active bodies
        const activeBodies = await this.worldServerDB.pool.query(`
            SELECT cb.*
            FROM celestial_bodies cb
            JOIN megachunks m ON cb.megachunk_id = m.megachunk_id
            WHERE m.is_active = true
        `);

        const predictions = [];

        for (const body of activeBodies.rows) {
            const timeUntilCrossing = this.calculateTimeUntilBoundaryCrossing(body);

            if (timeUntilCrossing <= timeWindow) {
                predictions.push({
                    bodyId: body.body_id,
                    bodyType: body.body_type,
                    timeUntilCrossing,
                    currentPosition: {
                        x: body.local_x,
                        y: body.local_y,
                        z: body.local_z
                    },
                    velocity: {
                        x: body.velocity_x,
                        y: body.velocity_y,
                        z: body.velocity_z
                    }
                });
            }
        }

        // Sort by time (soonest first)
        predictions.sort((a, b) => a.timeUntilCrossing - b.timeUntilCrossing);

        return predictions;
    }
}

// =============================================
// EXPORTS
// =============================================

export default {
    MegachunkTransferSystem,
    isOutOfBounds,
    detectBoundaryCrossing,
    wrapLocalPosition,
    calculateNewMegachunk,
    MEGACHUNK_SIZE,
    LOCAL_MIN,
    LOCAL_MAX
};
