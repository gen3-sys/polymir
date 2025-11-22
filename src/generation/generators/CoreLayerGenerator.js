/**
 * Core Layer Generator
 *
 * Fast, simple generation for planet core chunks.
 * Fills chunks with uniform voxel types based on distance from gravitational center.
 *
 * Performance optimized:
 * - No noise calculations
 * - No biome lookups
 * - Simple radius-based layer selection
 * - Early exit with break
 */
export class CoreLayerGenerator {
    /**
     * @param {Array|GravitationalShapeConfig} coreLayersOrGravity - Either layers array or gravity shape
     * @param {GravitationalShapeConfig} [gravitationalShape] - Gravity shape (if first arg is layers)
     */
    constructor(coreLayersOrGravity, gravitationalShape) {
        // Handle flexible constructor arguments
        if (gravitationalShape) {
            // Old API: (coreLayers, gravityShape)
            this.coreLayers = coreLayersOrGravity;
            this.gravity = gravitationalShape;
        } else if (coreLayersOrGravity && coreLayersOrGravity.layers) {
            // New API: just (gravityShape) - extract layers from it
            this.gravity = coreLayersOrGravity;
            this.coreLayers = this.convertGravityLayers(coreLayersOrGravity.layers);
        } else if (Array.isArray(coreLayersOrGravity)) {
            // Just layers, no gravity shape
            this.coreLayers = coreLayersOrGravity;
            this.gravity = null;
        } else {
            this.coreLayers = [];
            this.gravity = coreLayersOrGravity || null;
        }

        // Pre-sort layers by minRadius for faster lookup
        this.sortedLayers = this.coreLayers.length > 0
            ? [...this.coreLayers].sort((a, b) => (a.minRadius || 0) - (b.minRadius || 0))
            : [];
    }

    /**
     * Convert GravitationalShapeConfig layers format to CoreLayerGenerator format
     */
    convertGravityLayers(gravityLayers) {
        if (!gravityLayers || !Array.isArray(gravityLayers)) return [];

        const maxRadius = this.gravity?.getMaxRadius?.() || 100;

        return gravityLayers.map(layer => ({
            name: layer.name,
            minRadius: layer.depthRange[0] * maxRadius,
            maxRadius: layer.depthRange[1] * maxRadius,
            voxelType: typeof layer.voxelType === 'number' ? layer.voxelType : 1,
            solid: layer.solid !== false
        }));
    }

    /**
     * Generate a single core chunk
     * Returns null if chunk is entirely empty or outside core region
     *
     * @param {number} cx - Chunk X coordinate
     * @param {number} cy - Chunk Y coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {number} chunkSize - Size of chunk (default 16)
     * @returns {Object|null} Chunk object with voxels Map
     */
    generateChunk(cx, cy, cz, chunkSize = 16) {
        const chunk = { voxels: new Map() };
        let voxelCount = 0;

        // Iterate through all voxel positions in chunk
        for (let x = 0; x < chunkSize; x++) {
            for (let y = 0; y < chunkSize; y++) {
                for (let z = 0; z < chunkSize; z++) {
                    const worldX = cx * chunkSize + x;
                    const worldY = cy * chunkSize + y;
                    const worldZ = cz * chunkSize + z;

                    // Calculate distance from gravitational center
                    const dist = this.gravity.getDistanceFromCenter(worldX, worldY, worldZ);

                    // Find matching layer (use break to avoid checking all layers)
                    for (const layer of this.sortedLayers) {
                        if (dist >= layer.minRadius && dist < layer.maxRadius) {
                            // Encode voxel position as packed key
                            const key = (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);

                            chunk.voxels.set(key, {
                                type: layer.voxelType,
                                color: layer.color
                            });

                            voxelCount++;
                            break; // CRITICAL: Stop after first match to prevent overlap
                        }
                    }
                }
            }
        }

        // Return null for empty chunks (optimization: don't store empty chunks)
        return voxelCount > 0 ? chunk : null;
    }

    /**
     * Generate all core chunks for a planet
     * Returns Map of chunk keys to chunk data
     *
     * @param {number} chunkSize - Size of chunks (default 16)
     * @param {Function} progressCallback - Optional callback(generated, total)
     * @returns {Map} Map of chunk keys to chunk objects
     */
    generateAllCoreChunks(chunkSize = 16, progressCallback = null) {
        const chunks = new Map();

        // Calculate the maximum radius of the core
        const maxCoreRadius = Math.max(...this.coreLayers.map(l => l.maxRadius));
        const chunkRadius = Math.ceil(maxCoreRadius / chunkSize);

        // Estimate total chunks for progress tracking
        const totalEstimate = Math.pow(chunkRadius * 2 + 1, 3);
        let generated = 0;

        // Iterate through all potential chunk positions
        for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
            for (let cy = -chunkRadius; cy <= chunkRadius; cy++) {
                for (let cz = -chunkRadius; cz <= chunkRadius; cz++) {
                    // Quick rejection: skip chunks obviously outside core
                    const chunkCenterX = cx * chunkSize + chunkSize / 2;
                    const chunkCenterY = cy * chunkSize + chunkSize / 2;
                    const chunkCenterZ = cz * chunkSize + chunkSize / 2;

                    const chunkDist = this.gravity.getDistanceFromCenter(
                        chunkCenterX,
                        chunkCenterY,
                        chunkCenterZ
                    );

                    // Skip chunks clearly outside max core radius
                    if (chunkDist > maxCoreRadius + chunkSize * 1.5) {
                        continue;
                    }

                    // Generate chunk
                    const chunk = this.generateChunk(cx, cy, cz, chunkSize);

                    if (chunk) {
                        const key = `${cx},${cy},${cz}`;
                        chunks.set(key, chunk);
                    }

                    // Progress callback
                    if (progressCallback) {
                        generated++;
                        if (generated % 100 === 0) {
                            progressCallback(generated, totalEstimate);
                        }
                    }
                }
            }
        }

        // Final progress update
        if (progressCallback) {
            progressCallback(generated, generated);
        }

        return chunks;
    }

    /**
     * Check if a chunk position intersects any core layer
     * Fast pre-check before generating
     *
     * @param {number} cx - Chunk X
     * @param {number} cy - Chunk Y
     * @param {number} cz - Chunk Z
     * @param {number} chunkSize - Chunk size
     * @returns {boolean} True if chunk might contain core voxels
     */
    chunkIntersectsCore(cx, cy, cz, chunkSize = 16) {
        const maxCoreRadius = Math.max(...this.coreLayers.map(l => l.maxRadius));

        // Check chunk center distance
        const chunkCenterX = cx * chunkSize + chunkSize / 2;
        const chunkCenterY = cy * chunkSize + chunkSize / 2;
        const chunkCenterZ = cz * chunkSize + chunkSize / 2;

        const chunkDist = this.gravity.getDistanceFromCenter(
            chunkCenterX,
            chunkCenterY,
            chunkCenterZ
        );

        // Chunk intersects if center is within max radius + chunk diagonal
        const chunkDiagonal = chunkSize * Math.sqrt(3);
        return chunkDist < maxCoreRadius + chunkDiagonal;
    }

    /**
     * Get layer information at a specific distance
     *
     * @param {number} radius - Distance from gravitational center
     * @returns {Object|null} Layer object or null if outside core
     */
    getLayerAtRadius(radius) {
        for (const layer of this.sortedLayers) {
            if (radius >= layer.minRadius && radius < layer.maxRadius) {
                return layer;
            }
        }
        return null;
    }
}

export default CoreLayerGenerator;
