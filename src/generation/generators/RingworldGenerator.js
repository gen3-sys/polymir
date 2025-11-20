import { Chunk } from '../../spatial/Chunk.js';
import { GravitationalShapes } from '../../config/GravitationalShapeConfig.js';
import { LayeredChunkGenerator } from './LayeredChunkGenerator.js';
import { CoreLayerGenerator } from './CoreLayerGenerator.js';

/**
 * RingworldGenerator - Generates toroidal (ringworld) voxel terrain
 *
 * Generates chunks in a flat XZ grid that are bent into a torus shape by the shader.
 * This approach allows seamless continuous surface without gaps.
 *
 * COORDINATE SYSTEM:
 * - Chunks positioned in flat grid initially
 * - X coordinate = arc length around ring (major circumference)
 * - Z coordinate = arc length around tube (minor circumference)
 * - Y coordinate = depth/height from base (0 = base, increases outward)
 * - Shader converts arc lengths → angles (θ, φ) → torus parametric equations
 *
 * TORUS PARAMETRIC EQUATIONS:
 * P(θ, φ) = ((R + r*cos(φ))*cos(θ), r*sin(φ), (R + r*cos(φ))*sin(θ))
 * Where:
 *   θ (theta) = angle around ring (0 to 2π)
 *   φ (phi) = angle around tube (0 to 2π)
 *   R = major radius (ring size)
 *   r = minor radius (tube thickness)
 *
 * LAYER STRUCTURE:
 * - Structural core (innermost)
 * - Foundation layers
 * - Surface terrain (outermost - walkable)
 */
export class RingworldGenerator {
    constructor(config = {}) {
        // Ring dimensions
        this.ringRadius = config.ringRadius || 400;  // Major radius (R)
        this.tubeRadius = config.tubeRadius || 80;   // Minor radius (r)

        // Chunk parameters
        this.chunkSize = config.chunkSize || 16;
        this.surfaceDepth = config.surfaceDepth || 3;  // Voxels of walkable surface

        // Terrain parameters
        this.layers = config.layers || this.getDefaultLayers();
        this.biomeConfig = config.biomeConfig || null;

        // Create gravitational shape for distance calculations
        this.gravityShape = GravitationalShapes.ringworld(
            { x: 0, y: 0, z: 0 },
            this.ringRadius,
            this.tubeRadius
        );

        // Initialize generators for different layer types
        this.coreGenerator = new CoreLayerGenerator(
            this.getCoreLayersConfig(),
            this.gravityShape
        );

        this.layeredGenerator = new LayeredChunkGenerator(
            this.gravityShape,
            null  // terrain generator (can be added later for full biome support)
        );
    }

    /**
     * Default layer configuration for ringworld
     * Layers from inside to outside (normalized depth: 0 = centerline, 1 = surface)
     */
    getDefaultLayers() {
        return [
            {
                name: 'structural_core',
                depthRange: [0, 0.5],          // Inner 50% of tube radius
                voxelType: 7,                   // Dense structural material
                color: 0x444444,
                generationMode: 'uniform',
                solid: true
            },
            {
                name: 'foundation',
                depthRange: [0.5, 0.85],        // Middle layers
                voxelType: 1,                   // Stone
                color: 0x666666,
                generationMode: 'simple',
                solid: true
            },
            {
                name: 'substrate',
                depthRange: [0.85, 0.95],       // Just below surface
                voxelType: 3,                   // Dirt
                color: 0x996633,
                generationMode: 'simple',
                solid: false
            },
            {
                name: 'surface',
                depthRange: [0.95, 1.0],        // Walkable surface
                voxelType: 2,                   // Grass
                color: 0x3d8b3d,
                generationMode: 'simple',
                solid: false
            }
        ];
    }

    /**
     * Convert layer config to CoreLayerGenerator format
     */
    getCoreLayersConfig() {
        return this.layers.map(layer => ({
            minRadius: layer.depthRange[0] * this.tubeRadius,
            maxRadius: layer.depthRange[1] * this.tubeRadius,
            voxelType: layer.voxelType,
            color: layer.color
        }));
    }

    /**
     * Generate all chunks covering the entire torus surface
     * Returns Map of chunk keys to chunk data
     */
    generateAllChunks() {
        const chunks = new Map();

        // Calculate number of chunks needed to tile the entire torus surface
        const ringCircumference = 2 * Math.PI * this.ringRadius;
        const tubeCircumference = 2 * Math.PI * this.tubeRadius;

        const numAroundRing = Math.ceil(ringCircumference / this.chunkSize);
        const numAroundTube = Math.ceil(tubeCircumference / this.chunkSize);

        console.log(`Generating ringworld: ${numAroundRing} x ${numAroundTube} surface chunks`);

        // Generate surface chunks in a grid
        for (let i = 0; i < numAroundRing; i++) {
            for (let j = 0; j < numAroundTube; j++) {
                // Calculate angular positions
                const u = (i / numAroundRing) * Math.PI * 2;  // theta (around ring)
                const v = (j / numAroundTube) * Math.PI * 2;  // phi (around tube)

                // Generate chunk for this surface position
                const chunk = this.generateSurfaceChunk(u, v);

                if (chunk) {
                    const key = `${u.toFixed(3)}_${v.toFixed(3)}_0`;
                    chunks.set(key, {
                        chunk,
                        u,        // Store angular coordinates
                        v,
                        layer: 0  // Surface layer
                    });
                }
            }
        }

        console.log(`Generated ${chunks.size} ringworld chunks`);

        return chunks;
    }

    /**
     * Generate a single surface chunk at angular position (u, v)
     * u = theta (angle around ring, 0 to 2π)
     * v = phi (angle around tube, 0 to 2π)
     */
    generateSurfaceChunk(u, v) {
        const chunk = new Chunk(0, 0, 0, this.chunkSize);

        // Simple layered terrain generation
        // Y=0,1 = dirt substrate
        // Y=2 = grass surface (walkable after shader bending)
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                for (let y = 0; y < this.surfaceDepth; y++) {
                    // Get appropriate layer based on depth
                    const normalizedDepth = (y + 1) / this.surfaceDepth;
                    const layer = this.getLayerAtDepth(normalizedDepth);

                    chunk.setVoxel(x, y, z, {
                        type: layer.voxelType,
                        color: layer.color
                    });
                }
            }
        }

        return chunk;
    }

    /**
     * Generate a volumetric chunk at specific 3D coordinates
     * Used for generating internal structure (core, foundation layers)
     *
     * @param {number} cx - Chunk X coordinate
     * @param {number} cy - Chunk Y coordinate (depth into tube)
     * @param {number} cz - Chunk Z coordinate
     */
    generateVolumetricChunk(cx, cy, cz) {
        // Convert flat grid position to world position
        const worldX = cx * this.chunkSize + this.chunkSize / 2;
        const worldY = cy * this.chunkSize + this.chunkSize / 2;
        const worldZ = cz * this.chunkSize + this.chunkSize / 2;

        // Calculate distance from ring centerline
        const distance = this.gravityShape.getDistanceFromCenter(worldX, worldY, worldZ);

        // Only generate if within tube radius
        if (distance > this.tubeRadius) {
            return null;
        }

        // Use LayeredChunkGenerator for proper layer-based generation
        return this.layeredGenerator.generateChunk(cx, cy, cz, this.chunkSize);
    }

    /**
     * Get layer information at normalized depth (0 to 1)
     */
    getLayerAtDepth(normalizedDepth) {
        for (const layer of this.layers) {
            if (normalizedDepth >= layer.depthRange[0] && normalizedDepth <= layer.depthRange[1]) {
                return layer;
            }
        }
        // Default to surface layer
        return this.layers[this.layers.length - 1];
    }

    /**
     * Get flat grid position for a chunk at angular coordinates (u, v)
     * This is where the chunk should be positioned before shader bending
     */
    getChunkGridPosition(u, v, layer = 0) {
        // Convert angles to arc lengths
        const ringArcLength = u * this.ringRadius;
        const tubeArcLength = v * this.tubeRadius;

        return {
            x: ringArcLength,
            y: layer * this.chunkSize,  // Stack layers vertically
            z: tubeArcLength
        };
    }

    /**
     * Get shader uniforms for torus bending
     * These must match the values used in curved-surface-voxel.vert.glsl
     */
    getShaderUniforms(playerPos = null) {
        return {
            uPlayerPos: { value: playerPos || { x: 0, y: 0, z: 0 } },
            uNearRadius: { value: 0 },              // Always bend (no LOD transition yet)
            uFarRadius: { value: 1 },               // Fully bent everywhere
            uSurfaceType: { value: 2 },             // 2 = Torus surface type
            uMajorRadius: { value: this.ringRadius },
            uMinorRadius: { value: this.tubeRadius },
            uSphereRadius: { value: 0 },            // Unused for torus
            uSunDirection: { value: { x: 0.57735, y: 0.57735, z: 0.57735 } }
        };
    }

    /**
     * Calculate toroidal "up" vector at a world position
     * Points away from ring centerline
     */
    getUpVector(x, y, z) {
        const radialDist = Math.sqrt(x * x + z * z);

        if (radialDist < 0.0001) {
            return { x: 0, y: 1, z: 0 };  // Fallback for center
        }

        // Find closest point on ring centerline
        const centerlineX = (x / radialDist) * this.ringRadius;
        const centerlineZ = (z / radialDist) * this.ringRadius;

        // Vector from centerline to position
        const dx = x - centerlineX;
        const dy = y - 0;  // Centerline at Y=0
        const dz = z - centerlineZ;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return {
            x: dx / len,
            y: dy / len,
            z: dz / len
        };
    }

    /**
     * Calculate distance from surface at world position
     * Positive = above surface, negative = below surface
     */
    getDistanceFromSurface(x, y, z) {
        const radialDist = Math.sqrt(x * x + z * z);

        // Find distance from centerline
        const centerlineX = (x / radialDist) * this.ringRadius;
        const centerlineZ = (z / radialDist) * this.ringRadius;

        const dx = x - centerlineX;
        const dy = y - 0;
        const dz = z - centerlineZ;

        const distFromCenterline = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Surface is at tubeRadius + surfaceDepth
        const surfaceRadius = this.tubeRadius + this.surfaceDepth;

        return distFromCenterline - surfaceRadius;
    }

    /**
     * Convert world position to toroidal surface coordinates
     * Returns { u: theta, v: phi, depth: distance from centerline }
     */
    worldToToroidalCoords(x, y, z) {
        const radialDist = Math.sqrt(x * x + z * z);

        // Theta: angle around ring (0 to 2π)
        const u = Math.atan2(z, x);

        // Find point on centerline
        const centerlineX = (x / radialDist) * this.ringRadius;
        const centerlineZ = (z / radialDist) * this.ringRadius;

        // Vector from centerline
        const dx = x - centerlineX;
        const dy = y - 0;
        const dz = z - centerlineZ;

        const distFromCenterline = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Phi: angle around tube (0 to 2π)
        // Calculate angle in plane perpendicular to ring
        const v = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz) - this.ringRadius);

        return {
            u: u < 0 ? u + Math.PI * 2 : u,  // Normalize to [0, 2π]
            v: v < 0 ? v + Math.PI * 2 : v,
            depth: distFromCenterline
        };
    }

    /**
     * Serialize configuration for saving
     */
    serialize() {
        return {
            type: 'ringworld',
            ringRadius: this.ringRadius,
            tubeRadius: this.tubeRadius,
            chunkSize: this.chunkSize,
            surfaceDepth: this.surfaceDepth,
            layers: this.layers
        };
    }

    /**
     * Deserialize from saved configuration
     */
    static deserialize(data) {
        return new RingworldGenerator({
            ringRadius: data.ringRadius,
            tubeRadius: data.tubeRadius,
            chunkSize: data.chunkSize,
            surfaceDepth: data.surfaceDepth,
            layers: data.layers
        });
    }
}

export default RingworldGenerator;
