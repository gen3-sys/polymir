import { voxelTypeRegistry } from '../data/voxel/VoxelTypes.js';
import { BiomeSystem } from './BiomeSystem.js';

export class MaterialPalette {
    constructor(config = {}) {
        this.config = {
            enablePalettes: config.enablePalettes !== false,
            enableTemperatureMapping: config.enableTemperatureMapping !== false,
            defaultTemperature: config.defaultTemperature || 5778,
            temperatureRange: config.temperatureRange || { min: 1000, max: 50000 },
            enableCaching: config.enableCaching !== false,
            maxCacheSize: config.maxCacheSize || 50,
            ...config
        };

        this.biomeSystem = new BiomeSystem(null);

        this.currentPalette = 'standard';
        this.currentTemperature = this.config.defaultTemperature;
        this.palettes = new Map();
        this.materialLUT = new Map();

        this.temperaturePalettes = new Map();
        this.temperatureCache = new Map();

        this.performanceMetrics = {
            palettesGenerated: 0,
            materialsCreated: 0,
            temperatureMappings: 0,
            lastUpdate: 0,
            frameTime: 0
        };

        this.onPaletteChanged = null;
        this.onTemperatureChanged = null;
        this.onMaterialCreated = null;

        this.initialize();
    }

    initialize() {
        this.buildDefaultPalettes();

        if (this.config.enableTemperatureMapping) {
            this.setupTemperatureMapping();
        }

        this.setPalette(this.currentPalette);
    }

    buildDefaultPalettes() {
        const allTypes = voxelTypeRegistry.types;

        const standardMaterials = [];
        for (const [id, type] of allTypes) {
            standardMaterials.push({
                id: type.id,
                name: type.name,
                color: this.rgbToHex(type.color),
                semantics: type.semantics
            });
        }

        this.registerPalette('standard', {
            name: 'Standard',
            description: 'Default material palette',
            materials: standardMaterials
        });

        this.registerPalette('hot_star', {
            name: 'Hot Star',
            description: 'Blue-white star lighting',
            materials: standardMaterials.map(m => ({
                ...m,
                color: this.shiftColorTemperature(m.color, 1.2, 1.1, 0.8)
            }))
        });

        this.registerPalette('cool_star', {
            name: 'Cool Star',
            description: 'Red-orange star lighting',
            materials: standardMaterials.map(m => ({
                ...m,
                color: this.shiftColorTemperature(m.color, 0.8, 0.9, 1.2)
            }))
        });

        this.registerPalette('retro', {
            name: 'Retro',
            description: 'Retro aesthetic palette',
            materials: standardMaterials.map(m => ({
                ...m,
                color: this.applyRetroPalette(m.color)
            }))
        });

        this.buildBiomePalettes();
    }

    buildBiomePalettes() {
        const biomes = Object.keys(this.biomeSystem.biomes);

        for (const biomeName of biomes) {
            const biomeData = this.biomeSystem.getBiomeData(biomeName);
            if (!biomeData || !biomeData.colorRange) continue;

            const allTypes = voxelTypeRegistry.types;
            const biomeMaterials = [];

            for (const [id, type] of allTypes) {
                let color = this.rgbToHex(type.color);

                if (biomeData.blocks.primary === id) {
                    color = this.rgbToHex(biomeData.colorRange[0]);
                } else if (biomeData.blocks.secondary === id) {
                    const midIndex = Math.floor(biomeData.colorRange.length / 2);
                    color = this.rgbToHex(biomeData.colorRange[midIndex]);
                } else if (biomeData.blocks.rare === id) {
                    color = this.rgbToHex(biomeData.colorRange[biomeData.colorRange.length - 1]);
                } else {
                    const tempShift = this.getTemperatureShift(biomeData.temperature);
                    color = this.shiftColorTemperature(color, tempShift.r, tempShift.g, tempShift.b);
                }

                biomeMaterials.push({
                    id: type.id,
                    name: type.name,
                    color: color,
                    semantics: type.semantics
                });
            }

            this.registerPalette(`biome_${biomeName}`, {
                name: `${biomeName.charAt(0).toUpperCase() + biomeName.slice(1)} Biome`,
                description: `Palette for ${biomeName} biome`,
                materials: biomeMaterials,
                biomeData: biomeData
            });
        }
    }

    getTemperatureShift(temperature) {
        if (temperature > 100) {
            return { r: 1.3, g: 0.9, b: 0.7 };
        } else if (temperature > 30) {
            return { r: 1.1, g: 1.0, b: 0.9 };
        } else if (temperature < -20) {
            return { r: 0.8, g: 0.9, b: 1.2 };
        } else if (temperature < 10) {
            return { r: 0.9, g: 0.95, b: 1.1 };
        }
        return { r: 1.0, g: 1.0, b: 1.0 };
    }

    setBiomePalette(biomeName) {
        const paletteName = `biome_${biomeName}`;
        if (this.palettes.has(paletteName)) {
            this.setPalette(paletteName);
            return true;
        }
        return false;
    }

    rgbToHex(colorValue) {
        return '#' + colorValue.toString(16).padStart(6, '0');
    }

    shiftColorTemperature(hexColor, rShift, gShift, bShift) {
        const color = this.parseColor(hexColor);
        return '#' + [
            Math.min(255, Math.floor(color.r * rShift)),
            Math.min(255, Math.floor(color.g * gShift)),
            Math.min(255, Math.floor(color.b * bShift))
        ].map(c => c.toString(16).padStart(2, '0')).join('');
    }

    applyRetroPalette(hexColor) {
        const color = this.parseColor(hexColor);
        const quantize = (value) => Math.floor(value / 64) * 64;
        return '#' + [
            quantize(color.r),
            quantize(color.g),
            quantize(color.b)
        ].map(c => c.toString(16).padStart(2, '0')).join('');
    }

    setupTemperatureMapping() {
        this.temperaturePalettes.set('hot', {
            range: { min: 3000, max: 50000 },
            palette: 'hot_star',
            weight: 1.0
        });

        this.temperaturePalettes.set('warm', {
            range: { min: 4000, max: 7000 },
            palette: 'standard',
            weight: 1.0
        });

        this.temperaturePalettes.set('cool', {
            range: { min: 1000, max: 4000 },
            palette: 'cool_star',
            weight: 1.0
        });

        this.temperaturePalettes.set('retro', {
            range: { min: 0, max: 100000 },
            palette: 'retro',
            weight: 0.3
        });
    }

    registerPalette(name, palette) {
        this.palettes.set(name, {
            ...palette,
            id: name,
            materials: new Map(palette.materials.map(m => [m.id, m]))
        });

        this.performanceMetrics.palettesGenerated++;
        this.generateMaterialLUT(name);
    }

    generateMaterialLUT(paletteName) {
        const palette = this.palettes.get(paletteName);
        if (!palette) return;

        const lut = new Map();

        for (const [id, material] of palette.materials) {
            const color = this.parseColor(material.color);

            lut.set(id, {
                id: material.id,
                name: material.name,
                color: color,
                rgba: [
                    color.r / 255,
                    color.g / 255,
                    color.b / 255,
                    1.0
                ],
                semantics: material.semantics
            });
        }

        this.materialLUT.set(paletteName, lut);
        this.performanceMetrics.materialsCreated += lut.size;
    }

    parseColor(colorString) {
        if (colorString.startsWith('#')) {
            const hex = colorString.substring(1);
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return { r, g, b };
        }

        if (colorString.startsWith('rgb(')) {
            const values = colorString.match(/\d+/g);
            return {
                r: parseInt(values[0]),
                g: parseInt(values[1]),
                b: parseInt(values[2])
            };
        }

        return { r: 0, g: 0, b: 0 };
    }

    setPalette(paletteName) {
        if (!this.palettes.has(paletteName)) {
            paletteName = 'standard';
        }

        this.currentPalette = paletteName;

        if (this.onPaletteChanged) {
            this.onPaletteChanged({
                palette: paletteName,
                paletteData: this.palettes.get(paletteName)
            });
        }
    }

    setTemperature(temperature) {
        this.currentTemperature = Math.max(
            this.config.temperatureRange.min,
            Math.min(this.config.temperatureRange.max, temperature)
        );

        if (this.config.enableTemperatureMapping) {
            const paletteName = this.getTemperaturePalette(temperature);
            this.setPalette(paletteName);
        }

        if (this.onTemperatureChanged) {
            this.onTemperatureChanged({
                temperature: this.currentTemperature,
                palette: this.currentPalette
            });
        }
    }

    getTemperaturePalette(temperature) {
        const cacheKey = Math.floor(temperature / 100) * 100;
        if (this.temperatureCache.has(cacheKey)) {
            return this.temperatureCache.get(cacheKey);
        }

        const weights = new Map();

        for (const [name, config] of this.temperaturePalettes) {
            if (temperature >= config.range.min && temperature <= config.range.max) {
                weights.set(config.palette, (weights.get(config.palette) || 0) + config.weight);
            }
        }

        let selectedPalette = 'standard';
        let maxWeight = 0;

        for (const [palette, weight] of weights) {
            if (weight > maxWeight) {
                maxWeight = weight;
                selectedPalette = palette;
            }
        }

        this.temperatureCache.set(cacheKey, selectedPalette);
        this.performanceMetrics.temperatureMappings++;

        return selectedPalette;
    }

    getMaterial(materialId) {
        const lut = this.materialLUT.get(this.currentPalette);
        if (!lut) return null;

        const material = lut.get(materialId);
        if (!material) return null;

        return material;
    }

    getMaterialSemantics(materialId) {
        const type = voxelTypeRegistry.getTypeById(materialId);
        return type ? type.semantics : 0;
    }

    getMaterialColor(materialId) {
        const material = this.getMaterial(materialId);
        return material ? material.color : null;
    }

    getMaterialRGBA(materialId) {
        const material = this.getMaterial(materialId);
        return material ? material.rgba : null;
    }

    getCurrentPalette() {
        return this.palettes.get(this.currentPalette);
    }

    getCurrentLUT() {
        return this.materialLUT.get(this.currentPalette);
    }

    getPaletteNames() {
        return Array.from(this.palettes.keys());
    }

    getPalette(paletteName) {
        return this.palettes.get(paletteName) || null;
    }

    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            currentPalette: this.currentPalette,
            currentTemperature: this.currentTemperature,
            totalPalettes: this.palettes.size,
            totalMaterials: this.materialLUT.size,
            temperatureCacheSize: this.temperatureCache.size
        };
    }

    update(deltaTime) {
        this.performanceMetrics.lastUpdate = Date.now();
    }
}

export default MaterialPalette;
