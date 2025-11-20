import { VOXEL_TYPES } from '../../data/voxel/VoxelTypes.js';

/**
 * Water Filler Post-Processor
 *
 * Fills empty voxels below water level with water blocks.
 * This is a post-processing step after terrain generation.
 *
 * Performance optimized:
 * - Only processes chunks that intersect water level
 * - Skips chunks entirely above or below water
 * - Direct map access for voxel checking
 */
export class WaterFiller {
    constructor(waterLevel, gravitationalShape) {
        this.waterLevel = waterLevel;
        this.gravity = gravitationalShape;
    }

    /**
     * Fill water in a single chunk
     * Modifies chunk in-place
     *
     * @param {Object} chunk - Chunk object with voxels Map
     * @param {number} cx - Chunk X coordinate
     * @param {number} cy - Chunk Y coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {number} chunkSize - Size of chunk (default 16)
     */
    fillChunk(chunk, cx, cy, cz, chunkSize = 16) {
        // Quick check: does this chunk intersect water level?
        if (!this.chunkIntersectsWaterLevel(cx, cy, cz, chunkSize)) {
            return; // Skip chunks entirely above water
        }

        let waterVoxelsAdded = 0;

        // Iterate through all voxel positions
        for (let x = 0; x < chunkSize; x++) {
            for (let y = 0; y < chunkSize; y++) {
                for (let z = 0; z < chunkSize; z++) {
                    const worldX = cx * chunkSize + x;
                    const worldY = cy * chunkSize + y;
                    const worldZ = cz * chunkSize + z;

                    // Calculate distance from gravitational center
                    const dist = this.gravity.getDistanceFromCenter(worldX, worldY, worldZ);

                    // Only process voxels below water level
                    if (dist >= this.waterLevel) {
                        continue; // Above water level, skip
                    }

                    // Check if voxel is empty
                    const key = (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);

                    if (!chunk.voxels.has(key)) {
                        // Empty voxel below water level -> fill with water
                        chunk.voxels.set(key, {
                            type: VOXEL_TYPES.OCEAN_WATER.id,
                            color: VOXEL_TYPES.OCEAN_WATER.color
                        });
                        waterVoxelsAdded++;
                    }
                }
            }
        }

        return waterVoxelsAdded;
    }

    /**
     * Fill water in all chunks (async version with yield points)
     * Modifies chunks in-place
     *
     * @param {Map} chunks - Map of chunk keys to chunk objects
     * @param {number} chunkSize - Size of chunks (default 16)
     * @param {number} chunksPerYield - Number of chunks to process before yielding (default 100)
     * @param {Function} progressCallback - Optional callback(processed, total)
     * @returns {Promise<number>} Total water voxels added
     */
    async fillAllChunksAsync(chunks, chunkSize = 16, chunksPerYield = 100, progressCallback = null) {
        let totalWaterAdded = 0;
        let processed = 0;
        let chunksSinceYield = 0;
        const total = chunks.size;

        for (const [key, chunk] of chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);

            const waterAdded = this.fillChunk(chunk, cx, cy, cz, chunkSize);
            totalWaterAdded += waterAdded;

            processed++;
            chunksSinceYield++;

            // Yield control periodically to prevent blocking
            if (chunksSinceYield >= chunksPerYield) {
                chunksSinceYield = 0;
                if (progressCallback) {
                    progressCallback(processed, total);
                }
                await this.yieldControl();
            }
        }

        // Final progress update
        if (progressCallback) {
            progressCallback(total, total);
        }

        return totalWaterAdded;
    }

    /**
     * Fill water in all chunks (synchronous version)
     * Modifies chunks in-place
     *
     * @param {Map} chunks - Map of chunk keys to chunk objects
     * @param {number} chunkSize - Size of chunks (default 16)
     * @param {Function} progressCallback - Optional callback(processed, total)
     * @returns {number} Total water voxels added
     */
    fillAllChunks(chunks, chunkSize = 16, progressCallback = null) {
        let totalWaterAdded = 0;
        let processed = 0;
        const total = chunks.size;

        for (const [key, chunk] of chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);

            const waterAdded = this.fillChunk(chunk, cx, cy, cz, chunkSize);
            totalWaterAdded += waterAdded;

            // Progress callback
            if (progressCallback) {
                processed++;
                if (processed % 100 === 0 || processed === total) {
                    progressCallback(processed, total);
                }
            }
        }

        return totalWaterAdded;
    }

    /**
     * Yield control to prevent blocking the main thread
     * @returns {Promise} Promise that resolves on next frame
     */
    yieldControl() {
        return new Promise(resolve => {
            if (typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(resolve);
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    /**
     * Check if a chunk intersects the water level
     * Fast pre-check to skip chunks entirely above water
     *
     * @param {number} cx - Chunk X
     * @param {number} cy - Chunk Y
     * @param {number} cz - Chunk Z
     * @param {number} chunkSize - Chunk size
     * @returns {boolean} True if chunk might contain water
     */
    chunkIntersectsWaterLevel(cx, cy, cz, chunkSize = 16) {
        // Check chunk center and corners
        const positions = [
            // Center
            [cx * chunkSize + chunkSize / 2, cy * chunkSize + chunkSize / 2, cz * chunkSize + chunkSize / 2],
            // Corners
            [cx * chunkSize, cy * chunkSize, cz * chunkSize],
            [cx * chunkSize + chunkSize, cy * chunkSize, cz * chunkSize],
            [cx * chunkSize, cy * chunkSize + chunkSize, cz * chunkSize],
            [cx * chunkSize, cy * chunkSize, cz * chunkSize + chunkSize],
            [cx * chunkSize + chunkSize, cy * chunkSize + chunkSize, cz * chunkSize],
            [cx * chunkSize + chunkSize, cy * chunkSize, cz * chunkSize + chunkSize],
            [cx * chunkSize, cy * chunkSize + chunkSize, cz * chunkSize + chunkSize],
            [cx * chunkSize + chunkSize, cy * chunkSize + chunkSize, cz * chunkSize + chunkSize]
        ];

        // If any position is below water level, chunk intersects
        for (const [x, y, z] of positions) {
            const dist = this.gravity.getDistanceFromCenter(x, y, z);
            if (dist < this.waterLevel) {
                return true;
            }
        }

        return false;
    }

    /**
     * Create a new chunk containing only water
     * Used for chunks that are entirely underwater with no terrain
     *
     * @param {number} cx - Chunk X
     * @param {number} cy - Chunk Y
     * @param {number} cz - Chunk Z
     * @param {number} chunkSize - Chunk size
     * @returns {Object} Chunk filled with water
     */
    createWaterChunk(cx, cy, cz, chunkSize = 16) {
        const chunk = { voxels: new Map() };

        for (let x = 0; x < chunkSize; x++) {
            for (let y = 0; y < chunkSize; y++) {
                for (let z = 0; z < chunkSize; z++) {
                    const worldX = cx * chunkSize + x;
                    const worldY = cy * chunkSize + y;
                    const worldZ = cz * chunkSize + z;

                    const dist = this.gravity.getDistanceFromCenter(worldX, worldY, worldZ);

                    if (dist < this.waterLevel) {
                        const key = (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);
                        chunk.voxels.set(key, {
                            type: VOXEL_TYPES.OCEAN_WATER.id,
                            color: VOXEL_TYPES.OCEAN_WATER.color
                        });
                    }
                }
            }
        }

        return chunk.voxels.size > 0 ? chunk : null;
    }
}

export default WaterFiller;
