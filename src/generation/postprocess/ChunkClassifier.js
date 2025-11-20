/**
 * Chunk Classifier
 *
 * Classifies chunks for load prioritization:
 * - isSurface: Contains both air and solid (surface chunks)
 * - isCore: Entirely within core layers
 * - isBoundary: Near fracture boundaries (for collision preloading)
 *
 * Performance optimized:
 * - Quick classification based on voxel sampling
 * - Minimal iteration (early exit when classification determined)
 */
export class ChunkClassifier {
    constructor(planetConfig, gravitationalShape) {
        this.config = planetConfig;
        this.gravity = gravitationalShape;
    }

    /**
     * Classify a single chunk
     * Adds metadata properties to chunk object in-place
     *
     * @param {Object} chunk - Chunk object with voxels Map
     * @param {number} cx - Chunk X coordinate
     * @param {number} cy - Chunk Y coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {number} chunkSize - Size of chunk (default 16)
     */
    classifyChunk(chunk, cx, cy, cz, chunkSize = 16) {
        // Initialize metadata
        if (!chunk.metadata) {
            chunk.metadata = {};
        }

        // Calculate chunk center distance
        const chunkCenterX = cx * chunkSize + chunkSize / 2;
        const chunkCenterY = cy * chunkSize + chunkSize / 2;
        const chunkCenterZ = cz * chunkSize + chunkSize / 2;

        const centerDist = this.gravity.getDistanceFromCenter(
            chunkCenterX,
            chunkCenterY,
            chunkCenterZ
        );

        // Classify as core if center is within core region
        chunk.metadata.isCore = this.config.isInCore(centerDist);

        // Classify as surface by checking voxel density
        const { hasAir, hasSolid } = this.checkVoxelDensity(chunk, chunkSize);

        // Surface chunks have BOTH air and solid
        chunk.metadata.isSurface = hasAir && hasSolid;

        // Near-surface classification
        const surfaceRadius = this.config.gravitationalRadius;
        const distToSurface = Math.abs(centerDist - surfaceRadius);
        chunk.metadata.isNearSurface = distToSurface < chunkSize * 2;

        // Store chunk position for later use
        chunk.metadata.position = { cx, cy, cz };
        chunk.metadata.centerDistance = centerDist;

        return chunk.metadata;
    }

    /**
     * Check voxel density in chunk
     * Samples voxels to determine if chunk has air and/or solid
     *
     * @param {Object} chunk - Chunk with voxels Map
     * @param {number} chunkSize - Chunk size
     * @returns {Object} {hasAir, hasSolid}
     */
    checkVoxelDensity(chunk, chunkSize = 16) {
        const totalVoxels = chunkSize * chunkSize * chunkSize;
        const solidCount = chunk.voxels.size;
        const airCount = totalVoxels - solidCount;

        return {
            hasAir: airCount > 0,
            hasSolid: solidCount > 0
        };
    }

    /**
     * Classify all chunks in a collection (async version with yield points)
     * Modifies chunks in-place
     *
     * @param {Map} chunks - Map of chunk keys to chunk objects
     * @param {number} chunkSize - Size of chunks (default 16)
     * @param {number} chunksPerYield - Number of chunks to process before yielding (default 100)
     * @param {Function} progressCallback - Optional callback(processed, total)
     * @returns {Promise<Object>} Statistics {surfaceCount, coreCount, totalCount}
     */
    async classifyAllChunksAsync(chunks, chunkSize = 16, chunksPerYield = 100, progressCallback = null) {
        const stats = {
            surfaceCount: 0,
            coreCount: 0,
            nearSurfaceCount: 0,
            totalCount: 0
        };

        let processed = 0;
        let chunksSinceYield = 0;
        const total = chunks.size;

        for (const [key, chunk] of chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);

            this.classifyChunk(chunk, cx, cy, cz, chunkSize);

            // Update statistics
            if (chunk.metadata.isSurface) stats.surfaceCount++;
            if (chunk.metadata.isCore) stats.coreCount++;
            if (chunk.metadata.isNearSurface) stats.nearSurfaceCount++;
            stats.totalCount++;

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

        return stats;
    }

    /**
     * Classify all chunks in a collection (synchronous version)
     * Modifies chunks in-place
     *
     * @param {Map} chunks - Map of chunk keys to chunk objects
     * @param {number} chunkSize - Size of chunks (default 16)
     * @param {Function} progressCallback - Optional callback(processed, total)
     * @returns {Object} Statistics {surfaceCount, coreCount, totalCount}
     */
    classifyAllChunks(chunks, chunkSize = 16, progressCallback = null) {
        const stats = {
            surfaceCount: 0,
            coreCount: 0,
            nearSurfaceCount: 0,
            totalCount: 0
        };

        let processed = 0;
        const total = chunks.size;

        for (const [key, chunk] of chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);

            this.classifyChunk(chunk, cx, cy, cz, chunkSize);

            // Update statistics
            if (chunk.metadata.isSurface) stats.surfaceCount++;
            if (chunk.metadata.isCore) stats.coreCount++;
            if (chunk.metadata.isNearSurface) stats.nearSurfaceCount++;
            stats.totalCount++;

            // Progress callback
            if (progressCallback) {
                processed++;
                if (processed % 100 === 0 || processed === total) {
                    progressCallback(processed, total);
                }
            }
        }

        return stats;
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
     * Mark chunks near fracture boundaries
     * Requires fracture pattern to be provided
     *
     * @param {Map} chunks - Chunks to classify
     * @param {Object} fracturePattern - Fracture pattern with getFragmentID method
     * @param {number} chunkSize - Chunk size
     * @param {number} boundaryThreshold - Distance to consider as boundary (default: chunkSize)
     */
    markBoundaryChunks(chunks, fracturePattern, chunkSize = 16, boundaryThreshold = null) {
        if (!fracturePattern) return;

        const threshold = boundaryThreshold || chunkSize;
        let boundaryCount = 0;

        for (const [key, chunk] of chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);

            // Get chunk center
            const chunkCenterX = cx * chunkSize + chunkSize / 2;
            const chunkCenterY = cy * chunkSize + chunkSize / 2;
            const chunkCenterZ = cz * chunkSize + chunkSize / 2;

            // Get fragment ID for chunk center
            const fragmentID = fracturePattern.getFragmentID(
                chunkCenterX,
                chunkCenterY,
                chunkCenterZ
            );

            // Check neighbors for different fragment IDs
            const isBoundary = fracturePattern.isNearBoundary(
                chunkCenterX,
                chunkCenterY,
                chunkCenterZ,
                fragmentID,
                threshold
            );

            if (!chunk.metadata) {
                chunk.metadata = {};
            }

            chunk.metadata.isBoundary = isBoundary;
            chunk.metadata.fragmentID = fragmentID;

            if (isBoundary) {
                boundaryCount++;
            }
        }

        return boundaryCount;
    }

    /**
     * Get all surface chunks sorted by distance from a point
     * Useful for load prioritization
     *
     * @param {Map} chunks - All chunks
     * @param {Object} targetPos - Target position {x, y, z}
     * @param {number} chunkSize - Chunk size
     * @returns {Array} Sorted array of {key, chunk, distance}
     */
    getSurfaceChunksSorted(chunks, targetPos, chunkSize = 16) {
        const surfaceChunks = [];

        for (const [key, chunk] of chunks) {
            if (chunk.metadata && chunk.metadata.isSurface) {
                const [cx, cy, cz] = key.split(',').map(Number);

                const chunkCenterX = cx * chunkSize + chunkSize / 2;
                const chunkCenterY = cy * chunkSize + chunkSize / 2;
                const chunkCenterZ = cz * chunkSize + chunkSize / 2;

                const dx = chunkCenterX - targetPos.x;
                const dy = chunkCenterY - targetPos.y;
                const dz = chunkCenterZ - targetPos.z;

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                surfaceChunks.push({ key, chunk, distance });
            }
        }

        // Sort by distance (closest first)
        surfaceChunks.sort((a, b) => a.distance - b.distance);

        return surfaceChunks;
    }

    /**
     * Get load order for chunks based on priority
     * Returns array of chunk keys in load order
     *
     * @param {Map} chunks - All chunks
     * @param {Object} playerPos - Player position {x, y, z}
     * @param {number} aggressiveRadius - Aggressive load radius
     * @param {number} chunkSize - Chunk size
     * @returns {Array} Array of chunk keys in priority order
     */
    getLoadOrder(chunks, playerPos, aggressiveRadius = 100, chunkSize = 16) {
        const loadOrder = [];

        // Priority 1: Surface chunks near player
        const surfaceSorted = this.getSurfaceChunksSorted(chunks, playerPos, chunkSize);
        for (const item of surfaceSorted) {
            if (item.distance < aggressiveRadius) {
                loadOrder.push({ key: item.key, priority: 3, distance: item.distance });
            }
        }

        // Priority 2: All other surface chunks
        for (const item of surfaceSorted) {
            if (item.distance >= aggressiveRadius) {
                loadOrder.push({ key: item.key, priority: 2, distance: item.distance });
            }
        }

        // Priority 3: Everything else (core, underground)
        for (const [key, chunk] of chunks) {
            const alreadyAdded = loadOrder.some(item => item.key === key);
            if (!alreadyAdded) {
                const [cx, cy, cz] = key.split(',').map(Number);
                const chunkCenterX = cx * chunkSize + chunkSize / 2;
                const chunkCenterY = cy * chunkSize + chunkSize / 2;
                const chunkCenterZ = cz * chunkSize + chunkSize / 2;

                const dx = chunkCenterX - playerPos.x;
                const dy = chunkCenterY - playerPos.y;
                const dz = chunkCenterZ - playerPos.z;

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                loadOrder.push({ key, priority: 1, distance });
            }
        }

        // Sort by priority (high to low), then distance (near to far)
        loadOrder.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return a.distance - b.distance;
        });

        return loadOrder;
    }
}

export default ChunkClassifier;
