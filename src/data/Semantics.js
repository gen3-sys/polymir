export const SEMANTIC = {
    SOLID: 0x0001,
    LIQUID: 0x0002,
    GAS: 0x0004,
    PLASMA: 0x0008,
    GRAVITY: 0x0010,
    FLOATING: 0x0020,
    STICKY: 0x0040,
    BOUNCY: 0x0080,
    GRASS: 0x0100,
    DIRT: 0x0200,
    STONE: 0x0400,
    BEDROCK: 0x0800,
    SAND: 0x1000,
    GRAVEL: 0x2000,
    WOOD: 0x4000,
    METAL: 0x8000,
    FLOWING: 0x10000,
    STILL: 0x20000,
    OCEAN: 0x40000,
    LAVA: 0x80000,
    FLAMMABLE: 0x100000,
    BURNING: 0x200000,
    TRANSPARENT: 0x400000,
    EMISSIVE: 0x800000,
    MINEABLE: 0x1000000,
    PLACEABLE: 0x2000000,
    BREAKABLE: 0x4000000,
    CLIMBABLE: 0x8000000,
    WET: 0x10000000,
    FROZEN: 0x20000000,
    MELTING: 0x40000000,
    EVAPORATING: 0x80000000
};

export function hasFlag(voxel, flag) {
    if (!voxel || voxel.semantics === undefined) {
        return false;
    }
    return (voxel.semantics & flag) !== 0;
}

export function setFlag(voxel, flag) {
    if (!voxel) return;
    voxel.semantics = (voxel.semantics || 0) | flag;
}

export function clearFlag(voxel, flag) {
    if (!voxel) return;
    voxel.semantics = (voxel.semantics || 0) & ~flag;
}

export function toggleFlag(voxel, flag) {
    if (!voxel) return;
    voxel.semantics = (voxel.semantics || 0) ^ flag;
}

export function hasAnyFlag(voxel, flags) {
    if (!voxel || voxel.semantics === undefined) {
        return false;
    }
    return (voxel.semantics & flags) !== 0;
}

export function hasAllFlags(voxel, flags) {
    if (!voxel || voxel.semantics === undefined) {
        return false;
    }
    return (voxel.semantics & flags) === flags;
}

export function setFlags(voxel, flags) {
    if (!voxel) return;
    voxel.semantics = (voxel.semantics || 0) | flags;
}

export function clearFlags(voxel, flags) {
    if (!voxel) return;
    voxel.semantics = (voxel.semantics || 0) & ~flags;
}

export const SEMANTIC_PRESETS = {
    GRASS_BLOCK: SEMANTIC.SOLID | SEMANTIC.GRASS | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
    DIRT_BLOCK: SEMANTIC.SOLID | SEMANTIC.DIRT | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
    STONE_BLOCK: SEMANTIC.SOLID | SEMANTIC.STONE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
    BEDROCK_BLOCK: SEMANTIC.SOLID | SEMANTIC.BEDROCK,
    SAND_BLOCK: SEMANTIC.SOLID | SEMANTIC.SAND | SEMANTIC.GRAVITY | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
    GRAVEL_BLOCK: SEMANTIC.SOLID | SEMANTIC.GRAVEL | SEMANTIC.GRAVITY | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
    WATER_BLOCK: SEMANTIC.LIQUID | SEMANTIC.GRAVITY | SEMANTIC.TRANSPARENT | SEMANTIC.STILL,
    FLOWING_WATER: SEMANTIC.LIQUID | SEMANTIC.GRAVITY | SEMANTIC.TRANSPARENT | SEMANTIC.FLOWING,
    OCEAN_WATER: SEMANTIC.LIQUID | SEMANTIC.GRAVITY | SEMANTIC.TRANSPARENT | SEMANTIC.OCEAN,
    LAVA_BLOCK: SEMANTIC.LIQUID | SEMANTIC.GRAVITY | SEMANTIC.LAVA | SEMANTIC.EMISSIVE,
    WOOD_BLOCK: SEMANTIC.SOLID | SEMANTIC.WOOD | SEMANTIC.FLAMMABLE | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
    METAL_BLOCK: SEMANTIC.SOLID | SEMANTIC.METAL | SEMANTIC.MINEABLE | SEMANTIC.BREAKABLE,
    GLASS_BLOCK: SEMANTIC.SOLID | SEMANTIC.TRANSPARENT | SEMANTIC.BREAKABLE,
    TORCH_BLOCK: SEMANTIC.SOLID | SEMANTIC.EMISSIVE | SEMANTIC.FLAMMABLE | SEMANTIC.BREAKABLE
};

export function isSolid(voxel) {
    return hasFlag(voxel, SEMANTIC.SOLID);
}

export function isLiquid(voxel) {
    return hasFlag(voxel, SEMANTIC.LIQUID);
}

export function hasGravity(voxel) {
    return hasFlag(voxel, SEMANTIC.GRAVITY);
}

export function isTransparent(voxel) {
    return hasFlag(voxel, SEMANTIC.TRANSPARENT);
}

export function isEmissive(voxel) {
    return hasFlag(voxel, SEMANTIC.EMISSIVE);
}

export function isFlammable(voxel) {
    return hasFlag(voxel, SEMANTIC.FLAMMABLE);
}

export function isBurning(voxel) {
    return hasFlag(voxel, SEMANTIC.BURNING);
}

export function isMineable(voxel) {
    return hasFlag(voxel, SEMANTIC.MINEABLE);
}

export function blocksLineOfSight(voxel) {
    return isSolid(voxel) && !isTransparent(voxel);
}

export function needsPhysics(voxel) {
    return hasAnyFlag(voxel,
        SEMANTIC.GRAVITY |
        SEMANTIC.FLOATING |
        SEMANTIC.LIQUID |
        SEMANTIC.FLOWING
    );
}

export function getSemanticFlags(voxel) {
    if (!voxel || voxel.semantics === undefined) {
        return [];
    }

    const flags = [];
    for (const [name, value] of Object.entries(SEMANTIC)) {
        if (hasFlag(voxel, value)) {
            flags.push(name);
        }
    }
    return flags;
}

export function semanticsToString(voxel) {
    if (!voxel || voxel.semantics === undefined) {
        return 'NO_SEMANTICS';
    }
    const flags = getSemanticFlags(voxel);
    return flags.length > 0 ? flags.join(' | ') : 'NONE';
}

export function semanticsToHex(voxel) {
    if (!voxel || voxel.semantics === undefined) {
        return '0x00000000';
    }
    return '0x' + (voxel.semantics >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export default {
    SEMANTIC,
    SEMANTIC_PRESETS,
    hasFlag,
    setFlag,
    clearFlag,
    toggleFlag,
    hasAnyFlag,
    hasAllFlags,
    setFlags,
    clearFlags,
    isSolid,
    isLiquid,
    hasGravity,
    isTransparent,
    isEmissive,
    isFlammable,
    isBurning,
    isMineable,
    blocksLineOfSight,
    needsPhysics,
    getSemanticFlags,
    semanticsToString,
    semanticsToHex
};
