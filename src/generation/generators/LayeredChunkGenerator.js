import { Chunk } from '../../spatial/Chunk.js';

/**
 * LayeredChunkGenerator - Generates chunks based on gravitational shape layers
 *
 * Uses the layer system from GravitationalShapeConfig to determine how to generate
 * each chunk. Supports:
 * - uniform: Instant fill with single voxel type (cores)
 * - simple: Basic noise-based generation (mantle)
 * - full: Complete terrain generation (crust/surface)
 */
export class LayeredChunkGenerator {
    constructor(gravityShape, terrainGenerator = null) {
        this.gravityShape = gravityShape;
        this.terrainGenerator = terrainGenerator; // For full terrain generation
    }

    /**
     * Generate a chunk based on its position relative to the gravity shape
     */
    generateChunk(cx, cy, cz, chunkSize = 16) {
        // Calculate chunk center position
        const centerX = cx * chunkSize + chunkSize / 2;
        const centerY = cy * chunkSize + chunkSize / 2;
        const centerZ = cz * chunkSize + chunkSize / 2;

        // Get surface info for this position
        const surfaceInfo = this.gravityShape.getSurfacePoint(centerX, centerY, centerZ);
        const distance = surfaceInfo.distance;

        // Determine which layer this chunk is in
        const maxRadius = this.gravityShape.getMaxRadius();
        const normalizedDepth = Math.min(1, Math.max(0, distance / maxRadius));
        const layer = this.gravityShape.getLayerAtDepth(normalizedDepth);

        // Generate based on layer mode
        switch (layer.generationMode) {
            case 'uniform':
                return this.generateUniformChunk(cx, cy, cz, chunkSize, layer);

            case 'simple':
                return this.generateSimpleChunk(cx, cy, cz, chunkSize, layer);

            case 'full':
                return this.generateFullChunk(cx, cy, cz, chunkSize, layer);

            default:
                console.warn(`Unknown generation mode: ${layer.generationMode}`);
                return null;
        }
    }

    /**
     * Generate uniform chunk - instant fill with single voxel type
     * Used for cores and solid layers
     */
    generateUniformChunk(cx, cy, cz, chunkSize, layer) {
        const chunk = new Chunk(cx, cy, cz, chunkSize);
        const voxelType = layer.voxelType;

        // Fill entire chunk with one voxel type
        for (let x = 0; x < chunkSize; x++) {
            for (let y = 0; y < chunkSize; y++) {
                for (let z = 0; z < chunkSize; z++) {
                    chunk.setVoxel(x, y, z, voxelType);
                }
            }
        }

        return chunk;
    }

    /**
     * Generate simple chunk - basic noise with optional caves
     * Used for mantle and foundational layers
     */
    generateSimpleChunk(cx, cy, cz, chunkSize, layer) {
        const chunk = new Chunk(cx, cy, cz, chunkSize);
        const voxelType = layer.voxelType;

        for (let lx = 0; lx < chunkSize; lx++) {
            for (let ly = 0; ly < chunkSize; ly++) {
                for (let lz = 0; lz < chunkSize; lz++) {
                    const wx = cx * chunkSize + lx;
                    const wy = cy * chunkSize + ly;
                    const wz = cz * chunkSize + lz;

                    // Simple noise for variation
                    const noise = this.simpleNoise3D(wx * 0.05, wy * 0.05, wz * 0.05);

                    // Create some caves if not solid
                    if (layer.solid || noise > 0.3) {
                        chunk.setVoxel(lx, ly, lz, voxelType);
                    } else {
                        chunk.setVoxel(lx, ly, lz, 0); // Air
                    }
                }
            }
        }

        return chunk;
    }

    /**
     * Generate full chunk - complete terrain generation
     * Used for surface/crust layers with biomes
     */
    generateFullChunk(cx, cy, cz, chunkSize, layer) {
        // If we have a terrain generator, use it
        if (this.terrainGenerator) {
            return this.terrainGenerator.generateChunk(cx, cy, cz, chunkSize);
        }

        // Otherwise, generate basic terrain
        const chunk = new Chunk(cx, cy, cz, chunkSize);

        for (let lx = 0; lx < chunkSize; lx++) {
            for (let ly = 0; ly < chunkSize; ly++) {
                for (let lz = 0; lz < chunkSize; lz++) {
                    const wx = cx * chunkSize + lx;
                    const wy = cy * chunkSize + ly;
                    const wz = cz * chunkSize + lz;

                    // Get surface info for this voxel
                    const surfaceInfo = this.gravityShape.getSurfacePoint(wx, wy, wz);
                    const distanceFromSurface = surfaceInfo.distance;

                    // Simple height-based terrain
                    const noise = this.simpleNoise3D(wx * 0.02, wy * 0.02, wz * 0.02);
                    const terrainHeight = noise * 10; // ±10 blocks variation

                    if (distanceFromSurface < terrainHeight) {
                        // Determine voxel type based on depth from surface
                        let voxelType;
                        if (distanceFromSurface > terrainHeight - 1) {
                            voxelType = 2; // Grass
                        } else if (distanceFromSurface > terrainHeight - 4) {
                            voxelType = 3; // Dirt
                        } else {
                            voxelType = 1; // Stone
                        }
                        chunk.setVoxel(lx, ly, lz, voxelType);
                    } else {
                        chunk.setVoxel(lx, ly, lz, 0); // Air
                    }
                }
            }
        }

        return chunk;
    }

    /**
     * Simple 3D noise function (placeholder - can be replaced with proper noise)
     */
    simpleNoise3D(x, y, z) {
        // Simple hash-based noise
        const hash = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453;
        return hash - Math.floor(hash);
    }

    /**
     * Generate chunks in a shell around the gravity shape surface
     * Returns array of chunk coordinates to generate
     */
    getChunksInShell(minDepth, maxDepth, chunkSize = 16) {
        const chunks = [];
        const maxRadius = this.gravityShape.getMaxRadius();
        const outerRadius = maxRadius + maxDepth;
        const innerRadius = Math.max(0, maxRadius - minDepth);

        const chunkRadius = Math.ceil(outerRadius / chunkSize) + 1;

        for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
            for (let cy = -chunkRadius; cy <= chunkRadius; cy++) {
                for (let cz = -chunkRadius; cz <= chunkRadius; cz++) {
                    const centerX = cx * chunkSize + chunkSize / 2;
                    const centerY = cy * chunkSize + chunkSize / 2;
                    const centerZ = cz * chunkSize + chunkSize / 2;

                    const surfaceInfo = this.gravityShape.getSurfacePoint(centerX, centerY, centerZ);
                    const distance = Math.abs(surfaceInfo.distance);

                    // Check if chunk center is within the shell
                    if (distance >= innerRadius && distance <= outerRadius) {
                        chunks.push({ cx, cy, cz });
                    }
                }
            }
        }

        return chunks;
    }

    /**
     * Generate all chunks for the entire gravity shape
     */
    generateAllChunks(chunkSize = 16) {
        const chunks = new Map();
        const maxRadius = this.gravityShape.getMaxRadius();
        const chunkRadius = Math.ceil(maxRadius / chunkSize) + 2;

        for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
            for (let cy = -chunkRadius; cy <= chunkRadius; cy++) {
                for (let cz = -chunkRadius; cz <= chunkRadius; cz++) {
                    const chunk = this.generateChunk(cx, cy, cz, chunkSize);
                    if (chunk && chunk.hasVoxels()) {
                        chunks.set(`${cx},${cy},${cz}`, chunk);
                    }
                }
            }
        }

        return chunks;
    }
}

export default LayeredChunkGenerator;
