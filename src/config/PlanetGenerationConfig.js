import { VOXEL_TYPES } from '../data/voxel/VoxelTypes.js';

/**
 * Planet Generation Configuration
 *
 * Defines core layer structure, terrain bounds, and water level for planet generation.
 * Core layers are defined as distance from gravitational center (works for sphere, torus, plane).
 */
export class PlanetGenerationConfig {
    constructor(options = {}) {
        this.gravitationalRadius = options.gravitationalRadius || 100;

        // Core layers (0-100% of gravitational radius)
        this.coreLayers = options.coreLayers || this.getDefaultCoreLayers(this.gravitationalRadius);

        // Terrain generation bounds (relative to gravitational radius)
        this.terrainMinHeight = options.terrainMinHeight !== undefined ? options.terrainMinHeight : -15;
        this.terrainMaxHeight = options.terrainMaxHeight !== undefined ? options.terrainMaxHeight : 50;

        // Water level (absolute radius from center)
        this.waterLevel = options.waterLevel !== undefined ? options.waterLevel : this.gravitationalRadius;

        // Biome configuration
        this.biomeConfig = options.biomeConfig || null;

        // Fracture pattern settings
        this.fractureSettings = {
            numFragments: options.numFragments || 5,
            seed: options.fractureSeed || Math.floor(Math.random() * 1000000),
            ...options.fractureSettings
        };

        // Validate configuration
        this.validate();
    }

    /**
     * Generate default core layers based on gravitational radius
     * Layers: 0-20%, 20-50%, 50-100%
     */
    getDefaultCoreLayers(gravitationalRadius) {
        return [
            {
                name: 'bright_core',
                minRadius: 0,
                maxRadius: gravitationalRadius * 0.2,
                voxelType: VOXEL_TYPES.CORE_BRIGHT.id,
                color: VOXEL_TYPES.CORE_BRIGHT.color,
                emissive: true
            },
            {
                name: 'medium_core',
                minRadius: gravitationalRadius * 0.2,
                maxRadius: gravitationalRadius * 0.5,
                voxelType: VOXEL_TYPES.CORE_MEDIUM.id,
                color: VOXEL_TYPES.CORE_MEDIUM.color,
                emissive: true
            },
            {
                name: 'stone_mantle',
                minRadius: gravitationalRadius * 0.5,
                maxRadius: gravitationalRadius,
                voxelType: VOXEL_TYPES.STONE.id,
                color: VOXEL_TYPES.STONE.color,
                emissive: false
            }
        ];
    }

    /**
     * Validate core layer configuration
     * Ensures no gaps or overlaps
     */
    validate() {
        const sorted = [...this.coreLayers].sort((a, b) => a.minRadius - b.minRadius);

        // First layer must start at 0
        if (sorted[0].minRadius !== 0) {
            throw new Error('First core layer must start at radius 0');
        }

        // Check for gaps/overlaps
        for (let i = 0; i < sorted.length - 1; i++) {
            const current = sorted[i];
            const next = sorted[i + 1];

            if (current.maxRadius !== next.minRadius) {
                throw new Error(
                    `Core layer gap/overlap at index ${i}: ` +
                    `${current.maxRadius} !== ${next.minRadius}`
                );
            }
        }

        // Last layer should end at or before gravitational radius
        const lastLayer = sorted[sorted.length - 1];
        if (lastLayer.maxRadius > this.gravitationalRadius) {
            console.warn(
                `Last core layer extends beyond gravitational radius: ` +
                `${lastLayer.maxRadius} > ${this.gravitationalRadius}`
            );
        }

        return true;
    }

    /**
     * Get the layer for a given distance from center
     */
    getLayerAtRadius(radius) {
        for (const layer of this.coreLayers) {
            if (radius >= layer.minRadius && radius < layer.maxRadius) {
                return layer;
            }
        }
        return null;
    }

    /**
     * Check if a radius is in the core (below gravitational radius + terrainMinHeight)
     */
    isInCore(radius) {
        return radius < this.gravitationalRadius + this.terrainMinHeight;
    }

    /**
     * Check if a radius is in the surface/terrain region
     */
    isInTerrain(radius) {
        return radius >= this.gravitationalRadius + this.terrainMinHeight &&
               radius <= this.gravitationalRadius + this.terrainMaxHeight;
    }

    /**
     * Serialize to plain object for .mvox storage
     */
    serialize() {
        return {
            gravitationalRadius: this.gravitationalRadius,
            coreLayers: this.coreLayers,
            terrainMinHeight: this.terrainMinHeight,
            terrainMaxHeight: this.terrainMaxHeight,
            waterLevel: this.waterLevel,
            fractureSettings: this.fractureSettings
        };
    }

    /**
     * Deserialize from plain object
     */
    static deserialize(data) {
        return new PlanetGenerationConfig(data);
    }

    /**
     * Create a copy of this configuration
     */
    clone() {
        return PlanetGenerationConfig.deserialize(this.serialize());
    }
}

/**
 * Preset configurations for different planet types
 */
export const PLANET_PRESETS = {
    SMALL_MOON: {
        gravitationalRadius: 50,
        terrainMinHeight: -5,
        terrainMaxHeight: 15
    },

    EARTH_LIKE: {
        gravitationalRadius: 150,
        terrainMinHeight: -15,
        terrainMaxHeight: 50
    },

    LARGE_PLANET: {
        gravitationalRadius: 300,
        terrainMinHeight: -30,
        terrainMaxHeight: 100
    },

    GAS_GIANT: {
        gravitationalRadius: 500,
        // No core layers or terrain for gas giants
        objectType: 'gas_giant'
    }
};

export default PlanetGenerationConfig;
