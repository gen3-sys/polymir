import { BiomeSystem } from '../systems/BiomeSystem.js';
import globalBiomeEventBus, { BIOME_EVENTS } from '../systems/BiomeConfigEventBus.js';

export class BiomeConfiguration {
    constructor(config = {}) {
        this.biomeSystem = new BiomeSystem(null);
        this.eventBus = globalBiomeEventBus;

        this.noise3d = null;
        this.initNoise();

        this.distribution = config.distribution || {
            desert: 10,
            forest: 15,
            ocean: 20,
            ice: 5,
            grassland: 20,
            mountains: 10,
            lava: 2,
            crystal: 3,
            void: 2,
            toxic: 3,
            temperate: 8,
            volcanic: 2
        };

        this.globalStructureSettings = config.globalStructureSettings || {
            surfaceStructures: {
                ancientRuins: { enabled: true, frequency: 0.05 },
                villages: { enabled: true, frequency: 0.08 },
                monuments: { enabled: true, frequency: 0.03 }
            },
            undergroundStructures: {
                caves: { enabled: true, frequency: 0.15 },
                dungeons: { enabled: true, frequency: 0.05 },
                mineshafts: { enabled: true, frequency: 0.04 }
            },
            naturalFeatures: {
                lakes: { enabled: true, frequency: 0.12 },
                ravines: { enabled: true, frequency: 0.06 },
                geysers: { enabled: true, frequency: 0.03 }
            }
        };

        this.biomeSpecificSettings = config.biomeSpecificSettings || this.createDefaultBiomeSettings();

        this.seed = config.seed || Math.floor(Math.random() * 1000000);

        this.onConfigChanged = null;
    }

    async initNoise() {
        try {
            const noiseModule = await import('../math/noise/noise3d.js');
            this.noise3d = noiseModule.noise3d;
        } catch (e) {
            this.noise3d = null;
        }
    }

    createDefaultBiomeSettings() {
        const settings = {};
        const biomes = ['desert', 'forest', 'ocean', 'ice', 'grassland', 'mountains',
                       'lava', 'crystal', 'void', 'toxic', 'temperate', 'volcanic'];

        biomes.forEach(biome => {
            const biomeData = this.biomeSystem.getBiomeData(biome);
            settings[biome] = {
                enabled: true,
                vegetation: biomeData?.vegetation || 0.5,
                resources: this.getDefaultResources(biome),
                structures: this.getDefaultStructures(biome)
            };
        });

        return settings;
    }

    getDefaultResources(biome) {
        const resourceMap = {
            desert: ['sand', 'minerals', 'gems'],
            forest: ['wood', 'berries', 'mushrooms'],
            ocean: ['fish', 'coral', 'pearls'],
            ice: ['ice', 'frozen_water', 'crystals'],
            grassland: ['wheat', 'animals', 'stone'],
            mountains: ['ore', 'stone', 'crystals'],
            lava: ['obsidian', 'basalt', 'gems'],
            crystal: ['crystals', 'energy', 'minerals'],
            void: ['void_essence', 'dark_matter', 'strange_ore'],
            toxic: ['toxins', 'chemicals', 'mutated_ore'],
            temperate: ['diverse_flora', 'fauna', 'minerals'],
            volcanic: ['lava', 'volcanic_glass', 'sulfur']
        };
        return resourceMap[biome] || [];
    }

    getDefaultStructures(biome) {
        const structureMap = {
            desert: ['pyramids', 'oasis', 'temples'],
            forest: ['treehouses', 'groves', 'shrines'],
            ocean: ['reefs', 'underwater_caves', 'shipwrecks'],
            ice: ['igloos', 'ice_caves', 'frozen_temples'],
            grassland: ['villages', 'windmills', 'farms'],
            mountains: ['peaks', 'cliff_dwellings', 'mines'],
            lava: ['volcanic_vents', 'obsidian_spires'],
            crystal: ['crystal_formations', 'energy_nodes'],
            void: ['void_rifts', 'dark_monoliths'],
            toxic: ['toxic_pools', 'mutated_forests'],
            temperate: ['mixed_structures', 'towns'],
            volcanic: ['calderas', 'lava_tubes']
        };
        return structureMap[biome] || [];
    }

    setBiomeDistribution(biome, weight) {
        if (this.distribution.hasOwnProperty(biome)) {
            const oldWeight = this.distribution[biome];
            this.distribution[biome] = Math.max(0, Math.min(100, weight));

            this.eventBus.emit(BIOME_EVENTS.DISTRIBUTION_CHANGED, {
                biome,
                oldWeight,
                newWeight: this.distribution[biome],
                distribution: this.getNormalizedDistribution()
            });

            this.notifyChange();
        }
    }

    getBiomeDistribution() {
        return { ...this.distribution };
    }

    getNormalizedDistribution() {
        const total = Object.values(this.distribution).reduce((a, b) => a + b, 0);
        if (total === 0) return {};

        const normalized = {};
        for (const [biome, weight] of Object.entries(this.distribution)) {
            if (weight > 0) {
                normalized[biome] = weight / total;
            }
        }
        return normalized;
    }

    getBiomeAt(x, y, z, height = 0) {
        const dist = Math.sqrt(x * x + y * y + z * z);
        const epsilon = 0.0001;
        if (dist < epsilon) return 'grassland';

        const nx = x / dist;
        const ny = y / dist;
        const nz = z / dist;

        const noise3d = this.noise3d || ((x, y, z) => {
            const sin = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719);
            return (sin * 43758.5453) % 1;
        });

        const scale1 = 2.0;
        const scale2 = 5.0;
        const scale3 = 12.0;

        let noiseValue = 0;
        noiseValue += noise3d(nx * scale1 + this.seed * 0.001, ny * scale1, nz * scale1) * 0.6;
        noiseValue += noise3d(nx * scale2 + this.seed * 0.001, ny * scale2, nz * scale2) * 0.3;
        noiseValue += noise3d(nx * scale3 + this.seed * 0.001, ny * scale3, nz * scale3) * 0.1;

        noiseValue = (noiseValue % 1 + 1) % 1;

        const normalized = this.getNormalizedDistribution();
        let accumulated = 0;

        for (const [biome, weight] of Object.entries(normalized)) {
            accumulated += weight;
            if (noiseValue <= accumulated) {
                return biome;
            }
        }

        return Object.keys(normalized)[0] || 'grassland';
    }

    getBiomeData(biome) {
        return this.biomeSystem.getBiomeData(biome);
    }

    getColorAtDepth(biome, depth, maxDepth) {
        const biomeData = this.getBiomeData(biome);
        if (!biomeData || !biomeData.colorRange || biomeData.colorRange.length === 0) {
            return 0x808080;
        }

        const normalizedDepth = Math.max(0, Math.min(1, depth / maxDepth));
        const colorIndex = Math.floor(normalizedDepth * (biomeData.colorRange.length - 1));

        return biomeData.colorRange[colorIndex];
    }

    getVoxelTypeAtDepth(biome, depth, maxDepth, noise = 0) {
        const biomeData = this.getBiomeData(biome);
        if (!biomeData || !biomeData.blocks) {
            return 1;
        }

        const rand = Math.abs(noise) % 1;

        if (depth < maxDepth * 0.3) {
            if (rand < 0.05) return biomeData.blocks.rare;
            if (rand < 0.25) return biomeData.blocks.secondary;
            return biomeData.blocks.primary;
        } else if (depth < maxDepth * 0.7) {
            if (rand < 0.1) return biomeData.blocks.rare;
            return biomeData.blocks.secondary;
        } else {
            return biomeData.blocks.secondary;
        }
    }

    setGlobalStructureSetting(category, structure, enabled) {
        if (this.globalStructureSettings[category] &&
            this.globalStructureSettings[category][structure]) {
            this.globalStructureSettings[category][structure].enabled = enabled;

            this.eventBus.emit(BIOME_EVENTS.STRUCTURE_TOGGLED, {
                category,
                structure,
                enabled
            });

            this.notifyChange();
        }
    }

    setBiomeVegetation(biome, value) {
        if (this.biomeSpecificSettings[biome]) {
            const oldValue = this.biomeSpecificSettings[biome].vegetation;
            this.biomeSpecificSettings[biome].vegetation = Math.max(0, Math.min(1, value));

            this.eventBus.emit(BIOME_EVENTS.VEGETATION_CHANGED, {
                biome,
                oldValue,
                newValue: this.biomeSpecificSettings[biome].vegetation
            });

            this.notifyChange();
        }
    }

    serialize() {
        return {
            distribution: this.distribution,
            globalStructureSettings: this.globalStructureSettings,
            biomeSpecificSettings: this.biomeSpecificSettings,
            seed: this.seed
        };
    }

    static deserialize(data) {
        return new BiomeConfiguration(data);
    }

    saveToLocalStorage(key = 'biome_config') {
        try {
            const serialized = this.serialize();
            localStorage.setItem(key, JSON.stringify(serialized));

            this.eventBus.emit(BIOME_EVENTS.CONFIG_SAVED, {
                key,
                config: serialized
            });

            return true;
        } catch (e) {
            console.error('Failed to save biome configuration:', e);
            return false;
        }
    }

    static loadFromLocalStorage(key = 'biome_config') {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                const config = BiomeConfiguration.deserialize(JSON.parse(data));

                globalBiomeEventBus.emit(BIOME_EVENTS.CONFIG_LOADED, {
                    key,
                    config: config.serialize()
                });

                return config;
            }
        } catch (e) {
            console.error('Failed to load biome configuration:', e);
        }
        return new BiomeConfiguration();
    }

    notifyChange() {
        if (this.onConfigChanged) {
            this.onConfigChanged(this);
        }
    }

    clone() {
        return BiomeConfiguration.deserialize(this.serialize());
    }
}

export default BiomeConfiguration;
