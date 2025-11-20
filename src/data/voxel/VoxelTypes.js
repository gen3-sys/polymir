import { SEMANTIC, SEMANTIC_PRESETS } from '../Semantics.js';
import { Voxel } from './Voxel.js';

export const VOXEL_TYPES = {
    AIR: {
        id: 0,
        name: 'Air',
        color: 0x000000,
        semantics: 0,
        description: 'Empty space',
        hardness: 0
    },

    CORE_BRIGHT: {
        id: 1,
        name: 'Bright Core',
        color: 0xFFFF00,
        semantics: SEMANTIC.SOLID | SEMANTIC.EMISSIVE,
        description: 'Planet inner core (bright emissive)',
        hardness: 255,
        luminance: 15,
        soundType: 'metal'
    },

    CORE_MEDIUM: {
        id: 2,
        name: 'Medium Core',
        color: 0xFF6600,
        semantics: SEMANTIC.SOLID | SEMANTIC.EMISSIVE,
        description: 'Planet outer core (medium emissive)',
        hardness: 255,
        luminance: 10,
        soundType: 'metal'
    },

    GRASS: {
        id: 10,
        name: 'Grass',
        color: 0x3DAB32,
        semantics: SEMANTIC_PRESETS.GRASS_BLOCK,
        description: 'Grass-covered dirt block',
        hardness: 20,
        soundType: 'grass'
    },

    DIRT: {
        id: 11,
        name: 'Dirt',
        color: 0x8B5A3C,
        semantics: SEMANTIC_PRESETS.DIRT_BLOCK,
        description: 'Basic dirt block',
        hardness: 20,
        soundType: 'dirt'
    },

    STONE: {
        id: 12,
        name: 'Stone',
        color: 0x808080,
        semantics: SEMANTIC_PRESETS.STONE_BLOCK,
        description: 'Common stone',
        hardness: 50,
        soundType: 'stone'
    },

    BEDROCK: {
        id: 13,
        name: 'Bedrock',
        color: 0x404040,
        semantics: SEMANTIC_PRESETS.BEDROCK_BLOCK,
        description: 'Unbreakable bedrock',
        hardness: 255,
        soundType: 'stone'
    },

    SAND: {
        id: 14,
        name: 'Sand',
        color: 0xEDC9AF,
        semantics: SEMANTIC_PRESETS.SAND_BLOCK,
        description: 'Loose sand (affected by gravity)',
        hardness: 15,
        soundType: 'sand'
    },

    GRAVEL: {
        id: 15,
        name: 'Gravel',
        color: 0x888888,
        semantics: SEMANTIC_PRESETS.GRAVEL_BLOCK,
        description: 'Loose gravel (affected by gravity)',
        hardness: 20,
        soundType: 'gravel'
    },

    CLAY: {
        id: 16,
        name: 'Clay',
        color: 0xA0A0A0,
        semantics: SEMANTIC.SOLID | SEMANTIC.DIRT | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Malleable clay',
        hardness: 25,
        soundType: 'clay'
    },

    SNOW: {
        id: 17,
        name: 'Snow',
        color: 0xFFFFFF,
        semantics: SEMANTIC.SOLID | SEMANTIC.FROZEN | SEMANTIC.BREAKABLE,
        description: 'Packed snow',
        hardness: 10,
        soundType: 'snow'
    },

    ICE: {
        id: 18,
        name: 'Ice',
        color: 0xA5F2F3,
        semantics: SEMANTIC.SOLID | SEMANTIC.FROZEN | SEMANTIC.TRANSPARENT | SEMANTIC.BREAKABLE,
        description: 'Solid ice',
        hardness: 25,
        soundType: 'glass'
    },

    COAL_ORE: {
        id: 50,
        name: 'Coal Ore',
        color: 0x343434,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Coal ore deposit',
        hardness: 60,
        soundType: 'stone'
    },

    IRON_ORE: {
        id: 51,
        name: 'Iron Ore',
        color: 0xD8AF93,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.METAL | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Iron ore deposit',
        hardness: 70,
        soundType: 'stone'
    },

    GOLD_ORE: {
        id: 52,
        name: 'Gold Ore',
        color: 0xFFD700,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.METAL | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Gold ore deposit',
        hardness: 70,
        soundType: 'stone'
    },

    DIAMOND_ORE: {
        id: 53,
        name: 'Diamond Ore',
        color: 0x5DADE2,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Diamond ore deposit',
        hardness: 80,
        soundType: 'stone'
    },

    WATER: {
        id: 80,
        name: 'Water',
        color: 0x3F76E4,
        semantics: SEMANTIC_PRESETS.WATER_BLOCK,
        description: 'Still water',
        hardness: 0,
        soundType: 'water'
    },

    FLOWING_WATER: {
        id: 81,
        name: 'Flowing Water',
        color: 0x3F76E4,
        semantics: SEMANTIC_PRESETS.FLOWING_WATER,
        description: 'Flowing water',
        hardness: 0,
        soundType: 'water'
    },

    OCEAN_WATER: {
        id: 82,
        name: 'Ocean Water',
        color: 0x1E3A8A,
        semantics: SEMANTIC_PRESETS.OCEAN_WATER,
        description: 'Deep ocean water',
        hardness: 0,
        soundType: 'water'
    },

    LAVA: {
        id: 83,
        name: 'Lava',
        color: 0xFF4500,
        semantics: SEMANTIC_PRESETS.LAVA_BLOCK,
        description: 'Molten lava',
        hardness: 0,
        luminance: 15,
        soundType: 'lava'
    },

    WOOD_OAK: {
        id: 100,
        name: 'Oak Wood',
        color: 0x9C6D3E,
        semantics: SEMANTIC_PRESETS.WOOD_BLOCK,
        description: 'Oak wood',
        hardness: 30,
        soundType: 'wood'
    },

    WOOD_BIRCH: {
        id: 101,
        name: 'Birch Wood',
        color: 0xD7D3C7,
        semantics: SEMANTIC_PRESETS.WOOD_BLOCK,
        description: 'Birch wood',
        hardness: 30,
        soundType: 'wood'
    },

    WOOD_PINE: {
        id: 102,
        name: 'Pine Wood',
        color: 0x6A4E3D,
        semantics: SEMANTIC_PRESETS.WOOD_BLOCK,
        description: 'Pine wood',
        hardness: 30,
        soundType: 'wood'
    },

    LEAVES: {
        id: 103,
        name: 'Leaves',
        color: 0x2D5F2E,
        semantics: SEMANTIC.SOLID | SEMANTIC.TRANSPARENT | SEMANTIC.FLAMMABLE | SEMANTIC.BREAKABLE,
        description: 'Tree leaves',
        hardness: 5,
        soundType: 'grass'
    },

    PLANKS_OAK: {
        id: 130,
        name: 'Oak Planks',
        color: 0xB8945F,
        semantics: SEMANTIC_PRESETS.WOOD_BLOCK,
        description: 'Oak wood planks',
        hardness: 25,
        soundType: 'wood'
    },

    BRICKS: {
        id: 131,
        name: 'Bricks',
        color: 0xA0522D,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Clay bricks',
        hardness: 40,
        soundType: 'stone'
    },

    CONCRETE: {
        id: 132,
        name: 'Concrete',
        color: 0xC0C0C0,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Reinforced concrete',
        hardness: 60,
        soundType: 'stone'
    },

    IRON_BLOCK: {
        id: 160,
        name: 'Iron Block',
        color: 0xD8D8D8,
        semantics: SEMANTIC_PRESETS.METAL_BLOCK,
        description: 'Solid iron block',
        hardness: 100,
        soundType: 'metal'
    },

    GOLD_BLOCK: {
        id: 161,
        name: 'Gold Block',
        color: 0xFFD700,
        semantics: SEMANTIC_PRESETS.METAL_BLOCK,
        description: 'Solid gold block',
        hardness: 80,
        soundType: 'metal'
    },

    STEEL_BLOCK: {
        id: 162,
        name: 'Steel Block',
        color: 0x707070,
        semantics: SEMANTIC_PRESETS.METAL_BLOCK,
        description: 'Hardened steel',
        hardness: 120,
        soundType: 'metal'
    },

    GLASS: {
        id: 180,
        name: 'Glass',
        color: 0xE0F0FF,
        semantics: SEMANTIC_PRESETS.GLASS_BLOCK,
        description: 'Clear glass',
        hardness: 15,
        soundType: 'glass'
    },

    GLASS_RED: {
        id: 181,
        name: 'Red Glass',
        color: 0xFF5555,
        semantics: SEMANTIC_PRESETS.GLASS_BLOCK,
        description: 'Red stained glass',
        hardness: 15,
        soundType: 'glass'
    },

    GLASS_GREEN: {
        id: 182,
        name: 'Green Glass',
        color: 0x55FF55,
        semantics: SEMANTIC_PRESETS.GLASS_BLOCK,
        description: 'Green stained glass',
        hardness: 15,
        soundType: 'glass'
    },

    GLASS_BLUE: {
        id: 183,
        name: 'Blue Glass',
        color: 0x5555FF,
        semantics: SEMANTIC_PRESETS.GLASS_BLOCK,
        description: 'Blue stained glass',
        hardness: 15,
        soundType: 'glass'
    },

    TORCH: {
        id: 200,
        name: 'Torch',
        color: 0xFFAA00,
        semantics: SEMANTIC_PRESETS.TORCH_BLOCK,
        description: 'Light-emitting torch',
        hardness: 0,
        luminance: 14,
        soundType: 'wood'
    },

    LANTERN: {
        id: 201,
        name: 'Lantern',
        color: 0xFFDD88,
        semantics: SEMANTIC.SOLID | SEMANTIC.EMISSIVE | SEMANTIC.BREAKABLE,
        description: 'Hanging lantern',
        hardness: 10,
        luminance: 15,
        soundType: 'metal'
    },

    GLOWSTONE: {
        id: 202,
        name: 'Glowstone',
        color: 0xFFFF88,
        semantics: SEMANTIC.SOLID | SEMANTIC.EMISSIVE | SEMANTIC.BREAKABLE,
        description: 'Luminescent glowstone',
        hardness: 20,
        luminance: 15,
        soundType: 'glass'
    },

    PORTAL: {
        id: 220,
        name: 'Portal',
        color: 0x8B00FF,
        semantics: SEMANTIC.TRANSPARENT | SEMANTIC.EMISSIVE,
        description: 'Dimensional portal',
        hardness: 0,
        luminance: 11,
        soundType: 'portal'
    },

    SPAWNER: {
        id: 221,
        name: 'Spawner',
        color: 0x333366,
        semantics: SEMANTIC.SOLID | SEMANTIC.EMISSIVE,
        description: 'Entity spawner',
        hardness: 100,
        luminance: 3,
        soundType: 'metal'
    },

    OBSIDIAN: {
        id: 230,
        name: 'Obsidian',
        color: 0x0F0820,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Volcanic glass',
        hardness: 100,
        soundType: 'stone'
    },

    BASALT: {
        id: 231,
        name: 'Basalt',
        color: 0x3C3C3C,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
        description: 'Volcanic rock',
        hardness: 60,
        soundType: 'stone'
    },

    CRYSTAL_BLUE: {
        id: 240,
        name: 'Blue Crystal',
        color: 0x4DD0E1,
        semantics: SEMANTIC.SOLID | SEMANTIC.TRANSPARENT | SEMANTIC.EMISSIVE | SEMANTIC.BREAKABLE,
        description: 'Energy crystal',
        hardness: 40,
        luminance: 8,
        soundType: 'glass'
    },

    CRYSTAL_PURPLE: {
        id: 241,
        name: 'Purple Crystal',
        color: 0x9C27B0,
        semantics: SEMANTIC.SOLID | SEMANTIC.TRANSPARENT | SEMANTIC.EMISSIVE | SEMANTIC.BREAKABLE,
        description: 'Energy crystal',
        hardness: 40,
        luminance: 8,
        soundType: 'glass'
    },

    CRYSTAL_GREEN: {
        id: 242,
        name: 'Green Crystal',
        color: 0x66BB6A,
        semantics: SEMANTIC.SOLID | SEMANTIC.TRANSPARENT | SEMANTIC.EMISSIVE | SEMANTIC.BREAKABLE,
        description: 'Energy crystal',
        hardness: 40,
        luminance: 8,
        soundType: 'glass'
    },

    VOID_STONE: {
        id: 250,
        name: 'Void Stone',
        color: 0x1A0033,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.EMISSIVE,
        description: 'Dark matter-infused stone',
        hardness: 120,
        luminance: 2,
        soundType: 'stone'
    },

    TOXIC_SLUDGE: {
        id: 260,
        name: 'Toxic Sludge',
        color: 0x00FF00,
        semantics: SEMANTIC.LIQUID | SEMANTIC.EMISSIVE | SEMANTIC.DANGEROUS,
        description: 'Toxic waste',
        hardness: 0,
        luminance: 5,
        soundType: 'water'
    },

    TOXIC_STONE: {
        id: 261,
        name: 'Toxic Stone',
        color: 0x4CAF50,
        semantics: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.DANGEROUS | SEMANTIC.BREAKABLE,
        description: 'Contaminated stone',
        hardness: 50,
        soundType: 'stone'
    },

    PORTAL_BLOCK: {
        id: 300,
        name: 'Portal Block',
        color: 0x00FFFF,
        semantics: SEMANTIC.SOLID | SEMANTIC.EMISSIVE | SEMANTIC.INTERACTIVE,
        description: 'Portal frame block',
        hardness: 100,
        luminance: 12,
        soundType: 'glass'
    },

    PORTAL_ACTIVE: {
        id: 301,
        name: 'Active Portal',
        color: 0x8800FF,
        semantics: SEMANTIC.EMISSIVE | SEMANTIC.TRANSPARENT | SEMANTIC.INTERACTIVE,
        description: 'Active portal surface',
        hardness: 0,
        luminance: 15,
        soundType: 'portal'
    }
};

export class VoxelTypeRegistry {
    constructor() {
        this.types = new Map();
        this.nameMap = new Map();
        this.registerDefaultTypes();
    }

    registerDefaultTypes() {
        for (const [key, type] of Object.entries(VOXEL_TYPES)) {
            this.register(type);
        }
    }

    register(type) {
        if (!type.id && type.id !== 0) {
            throw new Error('Voxel type must have an id');
        }
        if (!type.name) {
            throw new Error('Voxel type must have a name');
        }
        if (type.color === undefined) {
            throw new Error('Voxel type must have a color');
        }
        if (type.semantics === undefined) {
            throw new Error('Voxel type must have semantics');
        }

        this.types.set(type.id, type);
        this.nameMap.set(type.name.toLowerCase(), type);
    }

    getTypeById(id) {
        return this.types.get(id) || null;
    }

    getTypeByName(name) {
        return this.nameMap.get(name.toLowerCase()) || null;
    }

    createVoxelById(id) {
        const type = this.getTypeById(id);
        if (!type) return null;

        const voxel = new Voxel(type.color, type.semantics);

        if (type.luminance !== undefined) {
            voxel.light = type.luminance;
        }

        return voxel;
    }

    createVoxelByName(name) {
        const type = this.getTypeByName(name);
        if (!type) return null;

        return this.createVoxelById(type.id);
    }

    getAllTypeIds() {
        return Array.from(this.types.keys()).sort((a, b) => a - b);
    }

    getAllTypeNames() {
        return Array.from(this.nameMap.keys()).sort();
    }

    hasType(id) {
        return this.types.has(id);
    }

    getTypeCount() {
        return this.types.size;
    }

    findTypesBySemantics(flags) {
        const matches = [];
        for (const type of this.types.values()) {
            if ((type.semantics & flags) === flags) {
                matches.push(type);
            }
        }
        return matches;
    }

    findTypesByAnySemantics(flags) {
        const matches = [];
        for (const type of this.types.values()) {
            if ((type.semantics & flags) !== 0) {
                matches.push(type);
            }
        }
        return matches;
    }

    getTypesByCategory(category) {
        const ranges = {
            'terrain': [10, 49],
            'ores': [50, 79],
            'liquids': [80, 99],
            'wood': [100, 129],
            'processed': [130, 159],
            'metals': [160, 179],
            'glass': [180, 199],
            'lights': [200, 219],
            'special': [220, 255]
        };

        const range = ranges[category.toLowerCase()];
        if (!range) return [];

        const [min, max] = range;
        return Array.from(this.types.values())
            .filter(type => type.id >= min && type.id <= max);
    }
}

export const voxelTypeRegistry = new VoxelTypeRegistry();

export function getVoxelType(id) {
    return voxelTypeRegistry.getTypeById(id);
}

export function createVoxel(id) {
    return voxelTypeRegistry.createVoxelById(id);
}

export function createVoxelByName(name) {
    return voxelTypeRegistry.createVoxelByName(name);
}

export default voxelTypeRegistry;
