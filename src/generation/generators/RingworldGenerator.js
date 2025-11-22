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
        this.surfaceDepth = config.surfaceDepth || 12;  // Depth for terrain variation

        // Terrain configuration - Minecraft-style
        this.seaLevel = config.seaLevel || 6;           // Fixed water level
        this.baseHeight = config.baseHeight || 4;       // Minimum terrain height
        this.maxHeight = config.maxHeight || 14;        // Maximum terrain height (within chunk)
        this.caveThreshold = config.caveThreshold || 0.55; // Cave carving threshold

        // Terrain parameters
        this.layers = config.layers || this.getDefaultLayers();
        this.biomeConfig = config.biomeConfig || null;

        // Initialize biome data for terrain generation
        // heightMod controls terrain drama: <0 = ocean, 0.5 = flat, 1.0 = normal, 2+ = mountains
        this.biomeData = {
            grassland: {
                blocks: { primary: 2, secondary: 3, rare: 1 },
                colorRange: [0x3DAB32, 0x8B5A3C, 0x666666],
                heightMod: 0.8   // Gentle rolling plains
            },
            forest: {
                blocks: { primary: 2, secondary: 3, rare: 4 },
                colorRange: [0x228B22, 0x8B4513, 0x2D5F2E],
                heightMod: 1.3   // Hilly forested terrain
            },
            desert: {
                blocks: { primary: 5, secondary: 5, rare: 1 },
                colorRange: [0xEDC9AF, 0xDEB887, 0x666666],
                heightMod: 0.4   // Mostly flat with dunes
            },
            mountains: {
                blocks: { primary: 1, secondary: 1, rare: 6 },
                colorRange: [0x808080, 0x696969, 0xA9A9A9],
                heightMod: 3.0   // DRAMATIC mountain peaks!
            },
            ice: {
                blocks: { primary: 6, secondary: 6, rare: 1 },
                colorRange: [0xE0FFFF, 0xAFEEEE, 0xB0E0E6],
                heightMod: 1.5   // Icy highlands with glaciers
            },
            ocean: {
                blocks: { primary: 7, secondary: 5, rare: 8 },
                colorRange: [0x1E90FF, 0x4169E1, 0x0000CD],
                heightMod: -1.0  // Deep ocean basins
            }
        };

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

        // Seed for consistent noise
        this.seed = config.seed || 12345;

        // Pre-calculate chunk counts (will be overwritten in generateAllChunks)
        const ringCircumference = 2 * Math.PI * this.ringRadius;
        const tubeCircumference = 2 * Math.PI * this.tubeRadius;
        this.numAroundRing = Math.ceil(ringCircumference / this.chunkSize);
        this.numAroundTube = Math.ceil(tubeCircumference / this.chunkSize);
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

        // Store for use in other calculations
        this.numAroundRing = numAroundRing;
        this.numAroundTube = numAroundTube;

        console.log(`Generating ringworld: ${numAroundRing} x ${numAroundTube} surface chunks`);

        // Generate surface chunks in a grid
        for (let i = 0; i < numAroundRing; i++) {
            for (let j = 0; j < numAroundTube; j++) {
                // Calculate angular positions (original approach)
                const u = (i / numAroundRing) * Math.PI * 2;  // theta (around ring)
                const v = (j / numAroundTube) * Math.PI * 2;  // phi (around tube)

                // Generate chunk using consistent world position sampling
                const chunk = this.generateSurfaceChunk(u, v, i, j);

                if (chunk) {
                    const key = `${u.toFixed(3)}_${v.toFixed(3)}_0`;
                    chunks.set(key, {
                        chunk,
                        u,        // Store angular coordinates for grid positioning
                        v,
                        i,        // Also store indices for reference
                        j,
                        layer: 0  // Surface layer
                    });
                }
            }
        }

        console.log(`Generated ${chunks.size} ringworld chunks`);

        return chunks;
    }

    /**
     * Generate a surface chunk with proper 3D terrain, caves, and water
     *
     * Uses tileable noise for seamless wrapping on torus surface.
     * Includes:
     * - Minecraft-style heightmap with biomes
     * - 3D cave carving (cheese caves + spaghetti tunnels)
     * - Fixed sea level with water filling
     * - Proper block layers per biome
     */
    generateSurfaceChunk(u, v, chunkI = 0, chunkJ = 0) {
        const chunk = new Chunk(0, 0, 0, this.chunkSize);

        // Total grid dimensions (for wrapping)
        const ringWidth = this.numAroundRing * this.chunkSize;
        const tubeWidth = this.numAroundTube * this.chunkSize;

        // Generate terrain for each column
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                // World coordinates (integer, for consistent sampling)
                const worldX = chunkI * this.chunkSize + x;
                const worldZ = chunkJ * this.chunkSize + z;

                // Angular coordinates for tileable noise
                const theta = (worldX / ringWidth) * Math.PI * 2;
                const phi = (worldZ / tubeWidth) * Math.PI * 2;

                // Get biome at this position
                const biomeName = this.getBiomeNameTorus(theta, phi);
                const biome = this.biomeData[biomeName] || this.biomeData.grassland;

                // Get terrain height (surface level)
                const surfaceHeight = this.getSurfaceHeight(theta, phi, biome);

                // Fill column from bottom to top
                for (let y = 0; y < this.chunkSize; y++) {
                    // Check for cave carving (3D noise)
                    const isCave = this.isCaveAt(theta, phi, y, surfaceHeight);

                    if (y < surfaceHeight && !isCave) {
                        // Solid terrain - determine block type by depth
                        const voxel = this.getBlockAt(y, surfaceHeight, biomeName, biome);
                        chunk.setVoxel(x, y, z, voxel);
                    } else if (y < this.seaLevel) {
                        // Below sea level and not solid = water
                        chunk.setVoxel(x, y, z, {
                            type: 7,
                            color: 0x2E7D9A  // Ocean blue
                        });
                    }
                    // else: air (no voxel)
                }
            }
        }

        return chunk;
    }

    /**
     * Get surface height using multi-layered noise
     * Returns height in voxels (0 to maxHeight)
     *
     * Creates dramatic terrain with real mountains, valleys, and varied landscapes
     */
    getSurfaceHeight(theta, phi, biome) {
        // Continental noise - massive landmass shapes
        const continental = this.torusFractalNoise(theta, phi, 4, 0.5, 2.0, 1.5, 0);

        // Erosion - creates ridges and valleys
        const erosion = this.torusFractalNoise(theta, phi, 4, 0.6, 2.0, 3, 1000);

        // Peaks/valleys - medium detail for hills
        const peaks = this.torusFractalNoise(theta, phi, 5, 0.5, 2.0, 6, 2000);

        // Fine detail - small bumps and texture
        const detail = this.torusFractalNoise(theta, phi, 3, 0.5, 2.0, 12, 3000);

        // Ridge noise - creates sharp mountain ridges
        const ridgeRaw = this.torusFractalNoise(theta, phi, 4, 0.5, 2.0, 4, 4000);
        const ridge = 1.0 - Math.abs(ridgeRaw);  // Invert for sharp peaks

        // Height range for terrain
        const heightRange = this.maxHeight - this.baseHeight;
        const heightMod = biome.heightMod || 1.0;

        // Start at base
        let height = this.baseHeight;

        // Continental contribution - broad land/sea distinction
        const continentFactor = (continental + 1) * 0.5;  // 0 to 1
        height += continentFactor * heightRange * 0.3;

        if (heightMod > 1.5) {
            // MOUNTAINS - dramatic peaks!
            height += Math.max(0, erosion) * heightRange * 0.25;
            height += ridge * ridge * heightRange * 0.35;  // Sharp ridges
            height += Math.max(0, peaks) * heightRange * 0.15;
            height += detail * 2;
        } else if (heightMod < 0) {
            // OCEAN - carve deep below sea level
            height = this.seaLevel - 3;
            height += erosion * 2;
            height -= Math.abs(continental) * 3;  // Deeper basins
        } else if (heightMod > 1.0) {
            // HILLS (forest, etc) - rolling terrain
            height += erosion * heightRange * 0.15;
            height += peaks * heightRange * 0.2 * heightMod;
            height += ridge * heightRange * 0.1;
            height += detail * 1.5;
        } else {
            // FLATLANDS (grassland, desert) - gentle variation
            height += erosion * heightRange * 0.1;
            height += peaks * heightRange * 0.1;
            height += detail * 1;
        }

        // Clamp to valid range
        return Math.round(Math.max(1, Math.min(this.maxHeight, height)));
    }

    /**
     * Check if position should be carved as a cave
     * Uses 3D noise for natural cave systems
     */
    isCaveAt(theta, phi, y, surfaceHeight) {
        // Don't carve caves too close to surface or in bottom layer
        if (y >= surfaceHeight - 2 || y < 1) return false;

        // Cheese caves - large open caverns
        const cheese = this.torusFractalNoise3D(theta, phi, y * 0.15, 2, 0.5, 2.0, 3, 5000);

        // Spaghetti caves - winding tunnels
        const spaghettiA = this.torusFractalNoise3D(theta, phi, y * 0.2, 2, 0.5, 2.0, 5, 6000);
        const spaghettiB = this.torusFractalNoise3D(theta, phi, y * 0.2, 2, 0.5, 2.0, 5, 7000);

        // Cheese caves: large threshold for big openings
        if (cheese > this.caveThreshold + 0.1) return true;

        // Spaghetti: narrow tunnels where two noise fields intersect near zero
        if (Math.abs(spaghettiA) < 0.08 && Math.abs(spaghettiB) < 0.08) return true;

        return false;
    }

    /**
     * 3D tileable noise for caves
     */
    torusFractalNoise3D(theta, phi, y, octaves, persistence, lacunarity, baseScale, offset) {
        let total = 0;
        let amplitude = 1;
        let maxValue = 0;
        let scale = baseScale;

        for (let i = 0; i < octaves; i++) {
            total += this.torusNoise3D(theta, phi, y, scale, offset + i * 1000) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            scale *= lacunarity;
        }

        return total / maxValue;
    }

    /**
     * 3D noise on torus (adds Y dimension to tileable noise)
     */
    torusNoise3D(theta, phi, y, scale, offset) {
        // Apply same squish factor as 2D noise
        const squishFactor = this.ringRadius / this.tubeRadius;
        const thetaScale = scale * squishFactor;
        const phiScale = scale;

        const nx = Math.cos(theta) * thetaScale;
        const ny = Math.sin(theta) * thetaScale;
        const nz = Math.cos(phi) * phiScale;
        const nw = Math.sin(phi) * phiScale;

        // Sample noise with Y mixed in
        const n1 = this.smoothNoise(nx + offset, ny + y * 0.5 + offset);
        const n2 = this.smoothNoise(nz + y * 0.3 + offset + 100, nw + offset + 100);
        const n3 = this.smoothNoise(nx + nz + offset + 200, ny + nw + y * 0.4 + offset + 200);

        return (n1 + n2 + n3) / 3;
    }

    /**
     * Determine block type based on depth and biome
     */
    getBlockAt(y, surfaceHeight, biomeName, biome) {
        const depthFromSurface = surfaceHeight - y;
        const isUnderwater = surfaceHeight < this.seaLevel;

        // Underwater terrain
        if (isUnderwater) {
            if (depthFromSurface <= 1) {
                return { type: 5, color: 0xC2B280 };  // Sand
            } else if (depthFromSurface <= 3) {
                return { type: 8, color: 0x808080 };  // Gravel
            } else {
                return { type: 1, color: 0x666666 };  // Stone
            }
        }

        // Biome-specific block layers
        switch (biomeName) {
            case 'desert':
                if (depthFromSurface <= 3) {
                    return { type: 5, color: 0xEDC9AF };  // Sand
                } else if (depthFromSurface <= 5) {
                    return { type: 9, color: 0xD2B48C };  // Sandstone
                }
                return { type: 1, color: 0x808080 };  // Stone

            case 'mountains':
                if (y > 11 && depthFromSurface <= 1) {
                    return { type: 6, color: 0xFFFAFA };  // Snow cap
                } else if (depthFromSurface <= 1) {
                    return { type: 1, color: 0x909090 };  // Exposed stone
                }
                return { type: 1, color: 0x707070 };  // Stone

            case 'ice':
                if (depthFromSurface <= 1) {
                    return { type: 6, color: 0xE8F4F8 };  // Snow
                } else if (depthFromSurface <= 3) {
                    return { type: 3, color: 0x8B8878 };  // Frozen dirt
                }
                return { type: 1, color: 0x666666 };  // Stone

            case 'forest':
                if (depthFromSurface <= 1) {
                    return { type: 2, color: 0x2D5A27 };  // Dark grass
                } else if (depthFromSurface <= 4) {
                    return { type: 3, color: 0x5C4033 };  // Rich dirt
                }
                return { type: 1, color: 0x666666 };  // Stone

            case 'ocean':
                // Ocean floor (underwater handled above)
                if (depthFromSurface <= 2) {
                    return { type: 5, color: 0xC2B280 };  // Sand
                }
                return { type: 1, color: 0x666666 };  // Stone

            case 'grassland':
            default:
                if (depthFromSurface <= 1) {
                    return { type: 2, color: 0x4A7C39 };  // Grass
                } else if (depthFromSurface <= 4) {
                    return { type: 3, color: 0x8B5A2B };  // Dirt
                }
                return { type: 1, color: 0x666666 };  // Stone
        }
    }

    /**
     * Get biome using temperature/humidity Whittaker diagram approach
     * (Legacy - use getBiomeAtTorus for proper wrapping)
     */
    getBiomeAt(worldX, worldZ) {
        const biomeName = this.getBiomeName(worldX, worldZ);
        return this.biomeData[biomeName] || this.biomeData.grassland;
    }

    /**
     * Get biome name using temperature and humidity
     * (Legacy - use getBiomeNameTorus for proper wrapping)
     */
    getBiomeName(worldX, worldZ) {
        // Temperature varies with position (like latitude)
        const tempNoise = this.fractalNoise(worldX * 0.002, worldZ * 0.002, 2, 0.5, 2.0);
        const temperature = (tempNoise + 1) * 0.5; // 0 to 1

        // Humidity varies independently
        const humidNoise = this.fractalNoise(worldX * 0.003 + 500, worldZ * 0.003 + 500, 2, 0.5, 2.0);
        const humidity = (humidNoise + 1) * 0.5; // 0 to 1

        // Whittaker-style biome selection
        if (temperature < 0.2) {
            return 'ice';
        } else if (temperature > 0.7 && humidity < 0.3) {
            return 'desert';
        } else if (humidity > 0.7 && temperature > 0.3) {
            return 'forest';
        } else if (temperature > 0.4 && humidity < 0.5) {
            // Check for ocean using separate noise
            const oceanNoise = this.fractalNoise(worldX * 0.005 + 1000, worldZ * 0.005 + 1000, 2, 0.5, 2.0);
            if (oceanNoise < -0.3) {
                return 'ocean';
            }
        }

        // Mountains based on erosion/continentalness noise
        const mountainNoise = this.fractalNoise(worldX * 0.004 + 2000, worldZ * 0.004 + 2000, 3, 0.5, 2.0);
        if (mountainNoise > 0.5) {
            return 'mountains';
        }

        return 'grassland';
    }

    /**
     * Minecraft-style terrain height generation
     * (Legacy - use getTerrainHeightTorus for proper wrapping)
     */
    getTerrainHeight(worldX, worldZ, biome) {
        // Base continental shape (large scale)
        const continentalness = this.fractalNoise(worldX * 0.001, worldZ * 0.001, 4, 0.5, 2.0);

        // Erosion (affects mountain/valley shapes)
        const erosion = this.fractalNoise(worldX * 0.002 + 100, worldZ * 0.002 + 100, 3, 0.5, 2.0);

        // Peaks and valleys detail
        const peaks = this.fractalNoise(worldX * 0.01 + 200, worldZ * 0.01 + 200, 4, 0.5, 2.0);

        // Combine for base height
        let height = 4; // Sea level base

        // Continental contribution (broad landmasses)
        height += continentalness * 3;

        // Erosion shapes terrain differently based on biome
        if (biome.heightMod > 1.5) {
            // Mountains - high peaks
            height += Math.max(0, erosion) * 6;
            height += Math.max(0, peaks) * 4;
        } else if (biome.heightMod < 0) {
            // Ocean - carve down
            height -= 3;
            height += erosion * 1;
        } else {
            // Normal terrain
            height += erosion * 2;
            height += peaks * 1.5;
        }

        // Small-scale detail noise
        const detail = this.fractalNoise(worldX * 0.05 + 300, worldZ * 0.05 + 300, 2, 0.5, 2.0);
        height += detail * 0.5;

        return Math.round(Math.max(1, height));
    }

    // =========================================================================
    // TILEABLE TORUS NOISE FUNCTIONS
    // =========================================================================
    // These functions sample noise that tiles seamlessly on a torus surface.
    // They map angular coordinates (theta, phi) to 4D points on two circles,
    // then sample 4D noise which naturally tiles when wrapping around.

    /**
     * Sample tileable noise on a torus surface
     * Maps (theta, phi) angles to 4D coordinates for seamless wrapping
     *
     * @param {number} theta - Angle around ring (0 to 2π)
     * @param {number} phi - Angle around tube (0 to 2π)
     * @param {number} scale - Noise scale (higher = more detail)
     * @param {number} offset - Offset for different noise layers
     */
    torusNoise(theta, phi, scale = 1, offset = 0) {
        // Squish factor: the ring is much larger than the tube, so we need to
        // scale theta differently to get non-elongated features
        // Without this, features stretch along the ring direction
        const squishFactor = this.ringRadius / this.tubeRadius;

        // Map angles to 4D coordinates on two unit circles
        // Apply squish to theta so features are proportional
        const thetaScale = scale * squishFactor;
        const phiScale = scale;

        const nx = Math.cos(theta) * thetaScale;
        const ny = Math.sin(theta) * thetaScale;
        const nz = Math.cos(phi) * phiScale;
        const nw = Math.sin(phi) * phiScale;

        // Sample 4D noise (using pairs of 2D samples for efficiency)
        const n1 = this.smoothNoise(nx + offset, ny + offset);
        const n2 = this.smoothNoise(nz + offset + 100, nw + offset + 100);
        const n3 = this.smoothNoise(nx + nz + offset + 200, ny + nw + offset + 200);

        // Combine for richer noise
        return (n1 + n2 + n3) / 3;
    }

    /**
     * Fractal tileable noise on torus
     */
    torusFractalNoise(theta, phi, octaves, persistence, lacunarity, baseScale = 1, offset = 0) {
        let total = 0;
        let amplitude = 1;
        let maxValue = 0;
        let scale = baseScale;

        for (let i = 0; i < octaves; i++) {
            total += this.torusNoise(theta, phi, scale, offset + i * 1000) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            scale *= lacunarity;
        }

        return total / maxValue;
    }

    /**
     * Get biome at torus coordinates (tileable)
     */
    getBiomeAtTorus(theta, phi) {
        const biomeName = this.getBiomeNameTorus(theta, phi);
        return this.biomeData[biomeName] || this.biomeData.grassland;
    }

    /**
     * Get biome name using tileable temperature/humidity noise
     */
    getBiomeNameTorus(theta, phi) {
        // Temperature - varies smoothly around torus
        const tempNoise = this.torusFractalNoise(theta, phi, 2, 0.5, 2.0, 2, 0);
        const temperature = (tempNoise + 1) * 0.5;

        // Humidity - different pattern
        const humidNoise = this.torusFractalNoise(theta, phi, 2, 0.5, 2.0, 3, 500);
        const humidity = (humidNoise + 1) * 0.5;

        // Whittaker-style biome selection
        if (temperature < 0.2) {
            return 'ice';
        } else if (temperature > 0.7 && humidity < 0.3) {
            return 'desert';
        } else if (humidity > 0.7 && temperature > 0.3) {
            return 'forest';
        } else if (temperature > 0.4 && humidity < 0.5) {
            const oceanNoise = this.torusFractalNoise(theta, phi, 2, 0.5, 2.0, 4, 1000);
            if (oceanNoise < -0.3) {
                return 'ocean';
            }
        }

        // Mountains
        const mountainNoise = this.torusFractalNoise(theta, phi, 3, 0.5, 2.0, 3, 2000);
        if (mountainNoise > 0.5) {
            return 'mountains';
        }

        return 'grassland';
    }

    /**
     * Get terrain height using tileable noise
     */
    getTerrainHeightTorus(theta, phi, biome) {
        // Continental shape (large scale, few features around the ring)
        const continentalness = this.torusFractalNoise(theta, phi, 4, 0.5, 2.0, 1.5, 0);

        // Erosion
        const erosion = this.torusFractalNoise(theta, phi, 3, 0.5, 2.0, 2.5, 100);

        // Detail peaks
        const peaks = this.torusFractalNoise(theta, phi, 4, 0.5, 2.0, 8, 200);

        let height = 4; // Sea level base
        height += continentalness * 3;

        if (biome.heightMod > 1.5) {
            height += Math.max(0, erosion) * 6;
            height += Math.max(0, peaks) * 4;
        } else if (biome.heightMod < 0) {
            height -= 3;
            height += erosion * 1;
        } else {
            height += erosion * 2;
            height += peaks * 1.5;
        }

        // Fine detail
        const detail = this.torusFractalNoise(theta, phi, 2, 0.5, 2.0, 16, 300);
        height += detail * 0.5;

        return Math.round(Math.max(1, height));
    }

    /**
     * Fractal Brownian Motion noise (multi-octave)
     * This creates natural-looking terrain
     */
    fractalNoise(x, z, octaves, persistence, lacunarity) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.smoothNoise(x * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / maxValue; // Normalize to -1 to 1
    }

    /**
     * Smooth interpolated noise (better than simple sin-based)
     */
    smoothNoise(x, z) {
        // Integer coordinates
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const x1 = x0 + 1;
        const z1 = z0 + 1;

        // Fractional part with smoothstep
        const sx = this.smoothstep(x - x0);
        const sz = this.smoothstep(z - z0);

        // Get corner values
        const n00 = this.hash2D(x0, z0);
        const n10 = this.hash2D(x1, z0);
        const n01 = this.hash2D(x0, z1);
        const n11 = this.hash2D(x1, z1);

        // Bilinear interpolation
        const nx0 = this.lerp(n00, n10, sx);
        const nx1 = this.lerp(n01, n11, sx);
        return this.lerp(nx0, nx1, sz);
    }

    /**
     * Hash function for deterministic pseudo-random values
     */
    hash2D(x, z) {
        let n = x * 374761393 + z * 668265263 + this.seed;
        n = (n ^ (n >> 13)) * 1274126177;
        n = n ^ (n >> 16);
        return (n & 0x7fffffff) / 0x7fffffff * 2 - 1; // -1 to 1
    }

    /**
     * Smoothstep interpolation
     */
    smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    /**
     * Linear interpolation
     */
    lerp(a, b, t) {
        return a + t * (b - a);
    }

    /**
     * Legacy noise function (kept for compatibility)
     */
    noise2D(x, z) {
        return this.smoothNoise(x, z);
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
     * Get flat grid position for a chunk at integer indices (i, j)
     * Chunks are placed at INTEGER multiples of chunkSize for seamless tiling
     * The shader will bend this grid using the "effective" radii
     */
    getChunkGridPosition(u, v, layer = 0, i = null, j = null) {
        // If we have integer indices, use them directly for seamless positioning
        // Otherwise fall back to angle-based calculation (legacy compatibility)
        if (i !== null && j !== null) {
            return {
                x: i * this.chunkSize,
                y: layer * this.chunkSize,
                z: j * this.chunkSize
            };
        }

        // Legacy: Convert angles to chunk indices
        const numAroundRing = this.numAroundRing || Math.ceil(2 * Math.PI * this.ringRadius / this.chunkSize);
        const numAroundTube = this.numAroundTube || Math.ceil(2 * Math.PI * this.tubeRadius / this.chunkSize);

        const chunkI = Math.round((u / (2 * Math.PI)) * numAroundRing);
        const chunkJ = Math.round((v / (2 * Math.PI)) * numAroundTube);

        return {
            x: chunkI * this.chunkSize,
            y: layer * this.chunkSize,
            z: chunkJ * this.chunkSize
        };
    }

    /**
     * Get shader uniforms for torus bending
     * These must match the values used in core/curved-surface-voxel.vert.glsl
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
     * Get effective major radius (for physics after shader bending)
     */
    getEffectiveMajorRadius() {
        const ringGridWidth = (this.numAroundRing || 158) * this.chunkSize;
        return ringGridWidth / (2 * Math.PI);
    }

    /**
     * Get effective minor radius (for physics after shader bending)
     */
    getEffectiveMinorRadius() {
        const tubeGridWidth = (this.numAroundTube || 32) * this.chunkSize;
        return tubeGridWidth / (2 * Math.PI);
    }

    /**
     * Calculate toroidal "up" vector at a world position
     * Points away from ring centerline
     */
    getUpVector(x, y, z) {
        const majorR = this.getEffectiveMajorRadius();
        const radialDist = Math.sqrt(x * x + z * z);

        if (radialDist < 0.0001) {
            return { x: 0, y: 1, z: 0 };  // Fallback for center
        }

        // Find closest point on ring centerline
        const centerlineX = (x / radialDist) * majorR;
        const centerlineZ = (z / radialDist) * majorR;

        // Vector from centerline to position
        const dx = x - centerlineX;
        const dy = y - 0;  // Centerline at Y=0
        const dz = z - centerlineZ;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (len < 0.0001) {
            return { x: 0, y: 1, z: 0 };
        }

        return {
            x: dx / len,
            y: dy / len,
            z: dz / len
        };
    }

    /**
     * Calculate distance from surface at world position
     * Positive = above surface, negative = below surface
     * Now accounts for terrain height variation
     */
    getDistanceFromSurface(x, y, z) {
        const radialDist = Math.sqrt(x * x + z * z);

        if (radialDist < 0.0001) {
            return -this.tubeRadius; // Inside center
        }

        // Find distance from centerline
        const centerlineX = (x / radialDist) * this.ringRadius;
        const centerlineZ = (z / radialDist) * this.ringRadius;

        const dx = x - centerlineX;
        const dy = y - 0;
        const dz = z - centerlineZ;

        const distFromCenterline = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Convert world position to surface coordinates for terrain lookup
        const theta = Math.atan2(z, x);
        const phi = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

        // Calculate world position for biome/terrain sampling
        const worldX = theta * this.ringRadius;
        const worldZ = phi * this.tubeRadius;

        // Get terrain height at this position using the new terrain system
        const biome = this.getBiomeAt(worldX, worldZ);
        const terrainHeight = this.getTerrainHeight(worldX, worldZ, biome);

        // Surface is at tubeRadius + terrain height
        const surfaceRadius = this.tubeRadius + Math.max(1, terrainHeight);

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
