/**
 * BuildConfig.js
 * Configuration constants for the build detection and extraction system
 */

export const BuildConfig = {
    // =============================================
    // BUILD DETECTION THRESHOLDS
    // =============================================

    // Minimum number of connected voxels to be considered a "build"
    // Below this threshold, voxels stay in damage map
    BUILD_DETECTION_THRESHOLD: 5,

    // Maximum cluster size to auto-detect (larger builds require manual save)
    MAX_AUTO_DETECT_SIZE: 10000,

    // Include diagonal connections when detecting builds?
    // true = 26-connectivity (face + edge + corner adjacent)
    // false = 6-connectivity (face adjacent only)
    INCLUDE_DIAGONAL_CONNECTIONS: false,

    // =============================================
    // COMPOSITE BUILD DETECTION
    // =============================================

    // Maximum distance between placements to consider them "touching"
    // for automatic composite build detection
    COMPOSITE_TOUCH_DISTANCE: 2,

    // Minimum number of touching placements to suggest composite build
    MIN_COMPOSITE_COMPONENTS: 2,

    // =============================================
    // DAMAGE MAP SETTINGS
    // =============================================

    // How often to sync damage map changes to server (ms)
    DAMAGE_SYNC_INTERVAL: 1000,

    // Maximum batch size for damage map sync
    MAX_DAMAGE_BATCH_SIZE: 100,

    // How many undo history entries to keep per player
    UNDO_HISTORY_LIMIT: 50,

    // =============================================
    // BUILD MODE DEFAULTS
    // =============================================

    // Default build mode for new players
    DEFAULT_BUILD_MODE: 'new_schematic',

    // Build mode descriptions for UI
    BUILD_MODE_INFO: {
        new_schematic: {
            name: 'New Build',
            description: 'Blocks automatically form new schematics when connected',
            icon: 'build'
        },
        extend_build: {
            name: 'Extend Build',
            description: 'Blocks attach to an existing schematic placement',
            icon: 'extension'
        },
        raw_damage: {
            name: 'Terrain Edit',
            description: 'Direct terrain modifications, no build detection',
            icon: 'terrain'
        }
    },

    // =============================================
    // EXTRACTION SETTINGS
    // =============================================

    // Default category for extracted player builds
    DEFAULT_BUILD_CATEGORY: 'player_build',

    // Auto-generate names for builds?
    AUTO_GENERATE_BUILD_NAMES: true,

    // Size classifications for auto-naming
    SIZE_CLASSES: {
        SMALL: { maxVoxels: 20, name: 'Small' },
        MEDIUM: { maxVoxels: 100, name: 'Medium' },
        LARGE: { maxVoxels: 500, name: 'Large' },
        MASSIVE: { maxVoxels: Infinity, name: 'Massive' }
    },

    // Shape classifications for auto-naming
    SHAPE_CLASSES: {
        TOWER: 'Tower',      // Tall and narrow
        PLATFORM: 'Platform', // Wide and flat
        DOME: 'Dome',        // Roughly spherical
        STRUCTURE: 'Structure' // Default
    },

    // =============================================
    // GRAVITY ALIGNMENT
    // =============================================

    // Default gravity vector for schematics without one
    DEFAULT_GRAVITY_VECTOR: [0, -1, 0], // Y-down

    // Default anchor point (normalized 0-1)
    DEFAULT_ANCHOR_POINT: [0.5, 0, 0.5], // Center of bottom face

    // =============================================
    // LAYER SCALE RATIOS
    // =============================================

    // Standard layer scale ratios
    LAYER_SCALES: {
        BLOCKS: 1.0,           // Layer 0: Full blocks (1m³)
        MICROBLOCKS: 0.0625,   // Layer 1: 1/16 scale (16³ per block)
        NANOBLOCKS: 0.00390625 // Layer 2: 1/256 scale (16³ per microblock)
    },

    // =============================================
    // VALIDATION
    // =============================================

    // Minimum trust score required to place blocks
    MIN_TRUST_TO_BUILD: 0.1,

    // Minimum trust score to create schematics
    MIN_TRUST_TO_CREATE_SCHEMATIC: 0.3,

    // Minimum trust score to create composite builds
    MIN_TRUST_TO_CREATE_COMPOSITE: 0.3,

    // =============================================
    // PERFORMANCE
    // =============================================

    // Maximum voxels to process in single detection pass
    MAX_DETECTION_BATCH: 5000,

    // Debounce time for build detection after placement (ms)
    DETECTION_DEBOUNCE: 500
};

// Freeze to prevent accidental modification
Object.freeze(BuildConfig);
Object.freeze(BuildConfig.BUILD_MODE_INFO);
Object.freeze(BuildConfig.SIZE_CLASSES);
Object.freeze(BuildConfig.LAYER_SCALES);

export default BuildConfig;
