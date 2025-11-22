import { voxelTypeRegistry, VOXEL_TYPES } from '../../data/voxel/VoxelTypes.js';

export class BiomeSystem {
    constructor(worldSystem) {
        this.world = worldSystem;

        this.biomes = {
            desert: {
                blocks: {
                    primary: VOXEL_TYPES.SAND.id,
                    secondary: VOXEL_TYPES.STONE.id,
                    rare: VOXEL_TYPES.GOLD_ORE.id
                },
                temperature: 35,
                humidity: 10,
                vegetation: 0.1,
                colorRange: [0xEDC9AF, 0xDEB887, 0xF4A460]
            },
            forest: {
                blocks: {
                    primary: VOXEL_TYPES.GRASS.id,
                    secondary: VOXEL_TYPES.WOOD_OAK.id,
                    rare: VOXEL_TYPES.LEAVES.id
                },
                temperature: 18,
                humidity: 70,
                vegetation: 0.9,
                colorRange: [0x228B22, 0x3DAB32, 0x2D5F2E]
            },
            ocean: {
                blocks: {
                    primary: VOXEL_TYPES.OCEAN_WATER.id,
                    secondary: VOXEL_TYPES.SAND.id,
                    rare: VOXEL_TYPES.GRAVEL.id
                },
                temperature: 15,
                humidity: 100,
                vegetation: 0.3,
                colorRange: [0x1E3A8A, 0x3F76E4, 0x4169E1]
            },
            ice: {
                blocks: {
                    primary: VOXEL_TYPES.SNOW.id,
                    secondary: VOXEL_TYPES.ICE.id,
                    rare: VOXEL_TYPES.STONE.id
                },
                temperature: -20,
                humidity: 40,
                vegetation: 0.05,
                colorRange: [0xFFFFFF, 0xA5F2F3, 0xE0FFFF]
            },
            grassland: {
                blocks: {
                    primary: VOXEL_TYPES.GRASS.id,
                    secondary: VOXEL_TYPES.DIRT.id,
                    rare: VOXEL_TYPES.STONE.id
                },
                temperature: 20,
                humidity: 50,
                vegetation: 0.6,
                colorRange: [0x90EE90, 0x3DAB32, 0x8B5A3C]
            },
            mountains: {
                blocks: {
                    primary: VOXEL_TYPES.STONE.id,
                    secondary: VOXEL_TYPES.SNOW.id,
                    rare: VOXEL_TYPES.IRON_ORE.id
                },
                temperature: 5,
                humidity: 40,
                vegetation: 0.2,
                colorRange: [0x808080, 0x8B7355, 0xFFFFFF]
            },
            lava: {
                blocks: {
                    primary: VOXEL_TYPES.LAVA.id,
                    secondary: VOXEL_TYPES.BASALT.id,
                    rare: VOXEL_TYPES.OBSIDIAN.id
                },
                temperature: 1200,
                humidity: 0,
                vegetation: 0,
                colorRange: [0xFF4500, 0x3C3C3C, 0x0F0820]
            },
            crystal: {
                blocks: {
                    primary: VOXEL_TYPES.CRYSTAL_BLUE.id,
                    secondary: VOXEL_TYPES.CRYSTAL_PURPLE.id,
                    rare: VOXEL_TYPES.CRYSTAL_GREEN.id
                },
                temperature: 10,
                humidity: 20,
                vegetation: 0.15,
                colorRange: [0x4DD0E1, 0x9C27B0, 0x66BB6A]
            },
            void: {
                blocks: {
                    primary: VOXEL_TYPES.VOID_STONE.id,
                    secondary: VOXEL_TYPES.STONE.id,
                    rare: VOXEL_TYPES.OBSIDIAN.id
                },
                temperature: -100,
                humidity: 0,
                vegetation: 0,
                colorRange: [0x1A0033, 0x4B0082, 0x0F0820]
            },
            toxic: {
                blocks: {
                    primary: VOXEL_TYPES.TOXIC_STONE.id,
                    secondary: VOXEL_TYPES.TOXIC_SLUDGE.id,
                    rare: VOXEL_TYPES.STONE.id
                },
                temperature: 25,
                humidity: 60,
                vegetation: 0,
                colorRange: [0x4CAF50, 0x00FF00, 0x808080]
            },
            temperate: {
                blocks: {
                    primary: VOXEL_TYPES.GRASS.id,
                    secondary: VOXEL_TYPES.DIRT.id,
                    rare: VOXEL_TYPES.STONE.id
                },
                temperature: 20,
                humidity: 60,
                vegetation: 0.7,
                colorRange: [0x3DAB32, 0x8B5A3C, 0x808080]
            },
            volcanic: {
                blocks: {
                    primary: VOXEL_TYPES.BASALT.id,
                    secondary: VOXEL_TYPES.LAVA.id,
                    rare: VOXEL_TYPES.OBSIDIAN.id
                },
                temperature: 800,
                humidity: 5,
                vegetation: 0,
                colorRange: [0x3C3C3C, 0xFF4500, 0x0F0820]
            }
        };
    }

    async init() {
        return this;
    }

    async apply(world, distribution) {
        const total = Object.values(distribution).reduce((a, b) => a + b, 0);
        const normalized = {};

        for (const [biome, weight] of Object.entries(distribution)) {
            normalized[biome] = weight / total;
        }

        if (world.data && world.data.voxels) {
            this.applyToVoxels(world.data.voxels, normalized);
        }

        world.biomeMap = this.generateBiomeMap(world, normalized);

        return world;
    }

    applyToVoxels(voxels, distribution) {
        for (const [key, blockType] of voxels) {
            const [x, y, z] = key.split(',').map(Number);

            const biome = this.getBiomeAt(x, y, z, distribution);
            const biomeData = this.biomes[biome];

            if (biomeData) {
                const rand = Math.random();
                if (rand < 0.7) {
                    voxels.set(key, biomeData.blocks.primary);
                } else if (rand < 0.95) {
                    voxels.set(key, biomeData.blocks.secondary);
                } else {
                    voxels.set(key, biomeData.blocks.rare);
                }
            }
        }
    }

    generateBiomeMap(world, distribution) {
        const biomeMap = new Map();
        const chunkSize = this.world.config.chunkSize;

        const regions = this.generateRegions(distribution);

        for (const chunk of world.chunks.values()) {
            const biome = this.getRegionBiome(
                chunk.x * chunkSize,
                chunk.z * chunkSize,
                regions
            );
            biomeMap.set(`${chunk.x},${chunk.z}`, biome);
        }

        return biomeMap;
    }

    generateRegions(distribution) {
        const regions = [];
        let currentAngle = 0;

        for (const [biome, weight] of Object.entries(distribution)) {
            const angleSize = weight * Math.PI * 2;
            regions.push({
                biome,
                startAngle: currentAngle,
                endAngle: currentAngle + angleSize,
                weight
            });
            currentAngle += angleSize;
        }

        return regions;
    }

    getBiomeAt(x, y, z, distribution) {
        // Use provided distribution or fall back to instance distribution
        const dist = distribution || this.distribution || { plains: 1 };

        const angle = Math.atan2(z, x);
        const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);

        let accumulated = 0;
        for (const [biome, weight] of Object.entries(dist)) {
            accumulated += weight;
            if (normalizedAngle <= accumulated) {
                return biome;
            }
        }

        return 'plains';
    }

    getRegionBiome(x, z, regions) {
        const angle = Math.atan2(z, x);
        const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;

        for (const region of regions) {
            if (normalizedAngle >= region.startAngle &&
                normalizedAngle < region.endAngle) {
                return region.biome;
            }
        }

        return 'plains';
    }

    getBiomeData(biomeName) {
        return this.biomes[biomeName] || this.biomes.plains;
    }

    generateVegetation(biome, x, y, z) {
        const biomeData = this.getBiomeData(biome);

        if (Math.random() > biomeData.vegetation) {
            return null;
        }

        const vegetation = {
            type: 'vegetation',
            biome,
            position: { x, y, z }
        };

        switch (biome) {
            case 'forest':
            case 'jungle':
                vegetation.model = 'tree';
                vegetation.height = 5 + Math.random() * 10;
                break;
            case 'plains':
                vegetation.model = 'grass';
                vegetation.height = 0.5 + Math.random();
                break;
            case 'desert':
                vegetation.model = 'cactus';
                vegetation.height = 2 + Math.random() * 3;
                break;
            default:
                vegetation.model = 'shrub';
                vegetation.height = 1;
        }

        return vegetation;
    }

    getResources(biome) {
        const resources = {
            ocean: ['fish', 'coral', 'pearls'],
            plains: ['wheat', 'animals', 'stone'],
            forest: ['wood', 'berries', 'mushrooms'],
            desert: ['sand', 'oil', 'gems'],
            mountains: ['ore', 'stone', 'crystals'],
            tundra: ['ice', 'fur', 'fish'],
            jungle: ['fruit', 'wood', 'medicine'],
            swamp: ['peat', 'herbs', 'gas']
        };

        return resources[biome] || [];
    }

    update(deltaTime) {
    }

    dispose() {
    }
}

export default BiomeSystem;
