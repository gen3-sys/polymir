/**
 * POLYMIR COORDINATE SYSTEM UTILITIES
 * ====================================
 * Handles conversions between spatial hierarchies:
 * World → Megachunk → Body → Chunk → Voxel
 *
 * Coordinate ranges:
 * - Megachunk: Integer coordinates in infinite world grid
 * - Body local: 0-255 within megachunk (floating point)
 * - Chunk: Integer coordinates relative to body origin
 * - Voxel: 0-15 within chunk (integer)
 */

// =============================================
// CONSTANTS
// =============================================

export const MEGACHUNK_SIZE = 256; // 256 voxels per megachunk axis
export const CHUNK_SIZE = 16;      // 16 voxels per chunk axis
export const CHUNKS_PER_MEGACHUNK = MEGACHUNK_SIZE / CHUNK_SIZE; // 16 chunks per megachunk axis

// =============================================
// VOXEL ENCODING/DECODING (within chunk)
// =============================================

/**
 * Encode 3D voxel coordinates into single integer key
 * Uses bit-packing: xxxxx yyyyy zzzzz (5 bits each = 0-31 range)
 * @param {number} x - 0-15
 * @param {number} y - 0-15
 * @param {number} z - 0-15
 * @returns {number} Packed integer key
 */
export function encodeVoxelKey(x, y, z) {
    return x | (y << 5) | (z << 10);
}

/**
 * Decode packed voxel key into 3D coordinates
 * @param {number} key - Packed integer key
 * @returns {{x: number, y: number, z: number}}
 */
export function decodeVoxelKey(key) {
    return {
        x: key & 0x1F,           // Lower 5 bits
        y: (key >> 5) & 0x1F,    // Middle 5 bits
        z: (key >> 10) & 0x1F    // Upper 5 bits
    };
}

// =============================================
// CHUNK COORDINATES
// =============================================

/**
 * Convert world position to chunk coordinates
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @returns {{cx: number, cy: number, cz: number}}
 */
export function worldToChunk(worldX, worldY, worldZ) {
    return {
        cx: Math.floor(worldX / CHUNK_SIZE),
        cy: Math.floor(worldY / CHUNK_SIZE),
        cz: Math.floor(worldZ / CHUNK_SIZE)
    };
}

/**
 * Convert chunk coordinates to world position (chunk origin)
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @returns {{x: number, y: number, z: number}}
 */
export function chunkToWorld(cx, cy, cz) {
    return {
        x: cx * CHUNK_SIZE,
        y: cy * CHUNK_SIZE,
        z: cz * CHUNK_SIZE
    };
}

/**
 * Get voxel coordinates within chunk (0-15)
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @returns {{vx: number, vy: number, vz: number}}
 */
export function worldToVoxelInChunk(worldX, worldY, worldZ) {
    return {
        vx: ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        vy: ((worldY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        vz: ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    };
}

/**
 * Generate chunk key string for storage
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @returns {string}
 */
export function chunkKey(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
}

/**
 * Parse chunk key string
 * @param {string} key
 * @returns {{cx: number, cy: number, cz: number}}
 */
export function parseChunkKey(key) {
    const [cx, cy, cz] = key.split(',').map(Number);
    return { cx, cy, cz };
}

// =============================================
// MEGACHUNK COORDINATES
// =============================================

/**
 * Convert world position to megachunk coordinates
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @returns {{mx: number, my: number, mz: number}}
 */
export function worldToMegachunk(worldX, worldY, worldZ) {
    return {
        mx: Math.floor(worldX / MEGACHUNK_SIZE),
        my: Math.floor(worldY / MEGACHUNK_SIZE),
        mz: Math.floor(worldZ / MEGACHUNK_SIZE)
    };
}

/**
 * Convert megachunk coordinates to world position (megachunk origin)
 * @param {number} mx
 * @param {number} my
 * @param {number} mz
 * @returns {{x: number, y: number, z: number}}
 */
export function megachunkToWorld(mx, my, mz) {
    return {
        x: mx * MEGACHUNK_SIZE,
        y: my * MEGACHUNK_SIZE,
        z: mz * MEGACHUNK_SIZE
    };
}

/**
 * Get local position within megachunk (0-255)
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @returns {{localX: number, localY: number, localZ: number}}
 */
export function worldToMegachunkLocal(worldX, worldY, worldZ) {
    return {
        localX: ((worldX % MEGACHUNK_SIZE) + MEGACHUNK_SIZE) % MEGACHUNK_SIZE,
        localY: ((worldY % MEGACHUNK_SIZE) + MEGACHUNK_SIZE) % MEGACHUNK_SIZE,
        localZ: ((worldZ % MEGACHUNK_SIZE) + MEGACHUNK_SIZE) % MEGACHUNK_SIZE
    };
}

/**
 * Generate megachunk key string
 * @param {number} mx
 * @param {number} my
 * @param {number} mz
 * @returns {string}
 */
export function megachunkKey(mx, my, mz) {
    return `${mx},${my},${mz}`;
}

/**
 * Parse megachunk key string
 * @param {string} key
 * @returns {{mx: number, my: number, mz: number}}
 */
export function parseMegachunkKey(key) {
    const [mx, my, mz] = key.split(',').map(Number);
    return { mx, my, mz };
}

// =============================================
// BODY-RELATIVE COORDINATES
// =============================================

/**
 * Convert body-relative position to world position
 * @param {Object} body - Body object with position and parent megachunk
 * @param {number} localX - Position relative to body origin
 * @param {number} localY
 * @param {number} localZ
 * @param {Object} megachunk - Parent megachunk {mx, my, mz}
 * @returns {{x: number, y: number, z: number}}
 */
export function bodyLocalToWorld(body, localX, localY, localZ, megachunk) {
    const megachunkOrigin = megachunkToWorld(megachunk.mx, megachunk.my, megachunk.mz);

    return {
        x: megachunkOrigin.x + body.local_x + localX,
        y: megachunkOrigin.y + body.local_y + localY,
        z: megachunkOrigin.z + body.local_z + localZ
    };
}

/**
 * Convert world position to body-relative position
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @param {Object} body - Body object with position
 * @param {Object} megachunk - Parent megachunk {mx, my, mz}
 * @returns {{x: number, y: number, z: number}}
 */
export function worldToBodyLocal(worldX, worldY, worldZ, body, megachunk) {
    const megachunkOrigin = megachunkToWorld(megachunk.mx, megachunk.my, megachunk.mz);

    return {
        x: worldX - (megachunkOrigin.x + body.local_x),
        y: worldY - (megachunkOrigin.y + body.local_y),
        z: worldZ - (megachunkOrigin.z + body.local_z)
    };
}

// =============================================
// DISTANCE CALCULATIONS
// =============================================

/**
 * Calculate distance between two world positions
 * @param {number} x1
 * @param {number} y1
 * @param {number} z1
 * @param {number} x2
 * @param {number} y2
 * @param {number} z2
 * @returns {number}
 */
export function distance3D(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate distance squared (faster, no sqrt)
 * @param {number} x1
 * @param {number} y1
 * @param {number} z1
 * @param {number} x2
 * @param {number} y2
 * @param {number} z2
 * @returns {number}
 */
export function distanceSquared3D(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Check if position is within sphere
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @param {number} radius
 * @returns {boolean}
 */
export function isInSphere(x, y, z, centerX, centerY, centerZ, radius) {
    return distanceSquared3D(x, y, z, centerX, centerY, centerZ) <= radius * radius;
}

// =============================================
// CHUNK RANGE QUERIES
// =============================================

/**
 * Get all chunk coordinates within radius of a world position
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @param {number} radiusChunks - Radius in chunks
 * @returns {Array<{cx: number, cy: number, cz: number}>}
 */
export function getChunksInRadius(worldX, worldY, worldZ, radiusChunks) {
    const center = worldToChunk(worldX, worldY, worldZ);
    const chunks = [];

    for (let cx = center.cx - radiusChunks; cx <= center.cx + radiusChunks; cx++) {
        for (let cy = center.cy - radiusChunks; cy <= center.cy + radiusChunks; cy++) {
            for (let cz = center.cz - radiusChunks; cz <= center.cz + radiusChunks; cz++) {
                // Check if chunk is within sphere
                const chunkWorld = chunkToWorld(cx, cy, cz);
                const distSq = distanceSquared3D(
                    worldX, worldY, worldZ,
                    chunkWorld.x + CHUNK_SIZE / 2,
                    chunkWorld.y + CHUNK_SIZE / 2,
                    chunkWorld.z + CHUNK_SIZE / 2
                );

                const radiusWorld = radiusChunks * CHUNK_SIZE;
                if (distSq <= radiusWorld * radiusWorld) {
                    chunks.push({ cx, cy, cz });
                }
            }
        }
    }

    return chunks;
}

/**
 * Get all megachunks within radius of a world position
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @param {number} radiusMegachunks
 * @returns {Array<{mx: number, my: number, mz: number}>}
 */
export function getMegachunksInRadius(worldX, worldY, worldZ, radiusMegachunks) {
    const center = worldToMegachunk(worldX, worldY, worldZ);
    const megachunks = [];

    for (let mx = center.mx - radiusMegachunks; mx <= center.mx + radiusMegachunks; mx++) {
        for (let my = center.my - radiusMegachunks; my <= center.my + radiusMegachunks; my++) {
            for (let mz = center.mz - radiusMegachunks; mz <= center.mz + radiusMegachunks; mz++) {
                const megachunkWorld = megachunkToWorld(mx, my, mz);
                const distSq = distanceSquared3D(
                    worldX, worldY, worldZ,
                    megachunkWorld.x + MEGACHUNK_SIZE / 2,
                    megachunkWorld.y + MEGACHUNK_SIZE / 2,
                    megachunkWorld.z + MEGACHUNK_SIZE / 2
                );

                const radiusWorld = radiusMegachunks * MEGACHUNK_SIZE;
                if (distSq <= radiusWorld * radiusWorld) {
                    megachunks.push({ mx, my, mz });
                }
            }
        }
    }

    return megachunks;
}

// =============================================
// TOPIC GENERATION (for libp2p GossipSub)
// =============================================

/**
 * Generate topic name for megachunk updates
 * @param {number} mx
 * @param {number} my
 * @param {number} mz
 * @returns {string}
 */
export function megachunkTopic(mx, my, mz) {
    return `/game/megachunk/${mx},${my},${mz}`;
}

/**
 * Generate topic name for body updates
 * @param {string} bodyId - UUID
 * @returns {string}
 */
export function bodyTopic(bodyId) {
    return `/game/body/${bodyId}`;
}

/**
 * Generate topic name for chunk updates
 * @param {string} bodyId - UUID
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @returns {string}
 */
export function chunkTopic(bodyId, cx, cy, cz) {
    return `/game/chunk/${bodyId}:${cx},${cy},${cz}`;
}

/**
 * Generate topic name for validation requests in region
 * @param {number} mx
 * @param {number} my
 * @param {number} mz
 * @returns {string}
 */
export function validationTopic(mx, my, mz) {
    return `/game/validation/${mx},${my},${mz}`;
}

// =============================================
// BOUNDARY CHECKS
// =============================================

/**
 * Check if body has crossed megachunk boundary
 * @param {Object} body - Body with local_x, local_y, local_z
 * @returns {{crossed: boolean, newMx?: number, newMy?: number, newMz?: number, newLocal?: Object}}
 */
export function checkMegachunkBoundary(body) {
    let newMx = 0, newMy = 0, newMz = 0;
    let newLocalX = body.local_x;
    let newLocalY = body.local_y;
    let newLocalZ = body.local_z;
    let crossed = false;

    // Check X axis
    if (body.local_x < 0) {
        newMx = -1;
        newLocalX = body.local_x + MEGACHUNK_SIZE;
        crossed = true;
    } else if (body.local_x >= MEGACHUNK_SIZE) {
        newMx = 1;
        newLocalX = body.local_x - MEGACHUNK_SIZE;
        crossed = true;
    }

    // Check Y axis
    if (body.local_y < 0) {
        newMy = -1;
        newLocalY = body.local_y + MEGACHUNK_SIZE;
        crossed = true;
    } else if (body.local_y >= MEGACHUNK_SIZE) {
        newMy = 1;
        newLocalY = body.local_y - MEGACHUNK_SIZE;
        crossed = true;
    }

    // Check Z axis
    if (body.local_z < 0) {
        newMz = -1;
        newLocalZ = body.local_z + MEGACHUNK_SIZE;
        crossed = true;
    } else if (body.local_z >= MEGACHUNK_SIZE) {
        newMz = 1;
        newLocalZ = body.local_z - MEGACHUNK_SIZE;
        crossed = true;
    }

    if (!crossed) {
        return { crossed: false };
    }

    return {
        crossed: true,
        deltaMx: newMx,
        deltaMy: newMy,
        deltaMz: newMz,
        newLocal: {
            x: newLocalX,
            y: newLocalY,
            z: newLocalZ
        }
    };
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Clamp value to range
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 * @param {number} a
 * @param {number} b
 * @param {number} t - 0 to 1
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Normalize vector
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{x: number, y: number, z: number}}
 */
export function normalize(x, y, z) {
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length === 0) return { x: 0, y: 0, z: 0 };
    return {
        x: x / length,
        y: y / length,
        z: z / length
    };
}

// =============================================
// ADDITIONAL UTILITIES FOR TESTS/COMPATIBILITY
// =============================================

/**
 * Convert world position to local coordinates within megachunk
 * @param {Object} position - {x, y, z}
 * @returns {{x: number, y: number, z: number}}
 */
export function worldToLocal(position) {
    return {
        x: ((position.x % MEGACHUNK_SIZE) + MEGACHUNK_SIZE) % MEGACHUNK_SIZE,
        y: ((position.y % MEGACHUNK_SIZE) + MEGACHUNK_SIZE) % MEGACHUNK_SIZE,
        z: ((position.z % MEGACHUNK_SIZE) + MEGACHUNK_SIZE) % MEGACHUNK_SIZE
    };
}

/**
 * Convert megachunk + local coordinates to world coordinates
 * @param {Object} megachunk - {x, y, z}
 * @param {Object} local - {x, y, z}
 * @returns {{x: number, y: number, z: number}}
 */
export function localToWorld(megachunk, local) {
    return {
        x: megachunk.x * MEGACHUNK_SIZE + local.x,
        y: megachunk.y * MEGACHUNK_SIZE + local.y,
        z: megachunk.z * MEGACHUNK_SIZE + local.z
    };
}

/**
 * Get all 26 neighboring megachunks around a center megachunk
 * @param {Object} center - {x, y, z}
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function getNeighborMegachunks(center) {
    const neighbors = [];

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                // Skip center itself
                if (dx === 0 && dy === 0 && dz === 0) continue;

                neighbors.push({
                    x: center.x + dx,
                    y: center.y + dy,
                    z: center.z + dz
                });
            }
        }
    }

    return neighbors;
}
