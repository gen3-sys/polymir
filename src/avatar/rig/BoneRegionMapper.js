/**
 * BoneRegionMapper - Maps voxel positions to bones based on region definitions
 *
 * The 32x64x32 voxel grid is divided into regions that correspond to body parts.
 * Each region maps to a specific VRM bone.
 *
 * Region assignment uses a priority system:
 * 1. Arms (checked first, highest priority for X outliers)
 * 2. Head (highest Y values)
 * 3. Torso (chest, spine)
 * 4. Hips
 * 5. Legs (lowest Y values)
 */

import { VRM_BONES } from './VoxelAvatarRig.js';
import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';

// Region boundary definitions (Y coordinates)
const Y_REGIONS = {
    TOES: { min: 0, max: 3 },
    FEET: { min: 3, max: 6 },
    LOWER_LEG: { min: 6, max: 20 },
    UPPER_LEG: { min: 20, max: 34 },
    HIPS: { min: 34, max: 38 },
    SPINE: { min: 38, max: 44 },
    CHEST: { min: 44, max: 52 },
    NECK: { min: 52, max: 56 },
    HEAD: { min: 56, max: 64 }
};

// X boundaries for left/right and arms
const X_REGIONS = {
    RIGHT_ARM: { min: 0, max: 6 },      // Far right
    RIGHT_BODY: { min: 6, max: 16 },    // Right side of torso
    LEFT_BODY: { min: 16, max: 26 },    // Left side of torso
    LEFT_ARM: { min: 26, max: 32 }      // Far left
};

// Arm Y range (arms only extend from shoulder to below chest)
const ARM_Y_RANGE = { min: 44, max: 56 };

// Hand/Lower arm split (within arm X regions)
const ARM_SEGMENTS = {
    HAND: { xOffset: 0, width: 2 },        // Outermost 2 voxels
    LOWER_ARM: { xOffset: 2, width: 2 },   // Next 2 voxels
    UPPER_ARM: { xOffset: 4, width: 2 }    // Inner 2 voxels (shoulder attachment)
};

export class BoneRegionMapper {
    constructor(config = {}) {
        // Allow custom region overrides
        this.yRegions = config.yRegions || { ...Y_REGIONS };
        this.xRegions = config.xRegions || { ...X_REGIONS };
        this.armYRange = config.armYRange || { ...ARM_Y_RANGE };

        // Cache for region lookups
        this.regionCache = new Map();
    }

    /**
     * Get the primary bone for a voxel position
     * @param {number} x - X coordinate (0-31)
     * @param {number} y - Y coordinate (0-63)
     * @param {number} z - Z coordinate (0-31)
     * @returns {string} VRM bone name
     */
    getBoneForVoxel(x, y, z) {
        // Check cache first
        const cacheKey = `${x},${y},${z}`;
        if (this.regionCache.has(cacheKey)) {
            return this.regionCache.get(cacheKey);
        }

        const bone = this.computeBoneForVoxel(x, y, z);
        this.regionCache.set(cacheKey, bone);
        return bone;
    }

    /**
     * Compute bone assignment (uncached)
     */
    computeBoneForVoxel(x, y, z) {
        // Priority 1: Check if in arm region
        const armBone = this.getArmBone(x, y, z);
        if (armBone) return armBone;

        // Priority 2: Check body regions by Y
        return this.getBodyBone(x, y, z);
    }

    /**
     * Check if voxel is in arm region and return appropriate bone
     */
    getArmBone(x, y, z) {
        // Arms only exist in specific Y range
        if (y < this.armYRange.min || y >= this.armYRange.max) {
            return null;
        }

        // Check right arm (low X values)
        if (x < this.xRegions.RIGHT_ARM.max) {
            return this.getRightArmSegment(x, y);
        }

        // Check left arm (high X values)
        if (x >= this.xRegions.LEFT_ARM.min) {
            return this.getLeftArmSegment(x, y);
        }

        return null;
    }

    /**
     * Get right arm bone segment based on X position
     */
    getRightArmSegment(x, y) {
        // Shoulder region (closest to body)
        if (x >= 4) {
            return y >= 50 ? VRM_BONES.RIGHT_SHOULDER : VRM_BONES.RIGHT_UPPER_ARM;
        }

        // Upper arm
        if (x >= 2) {
            return VRM_BONES.RIGHT_UPPER_ARM;
        }

        // Lower arm / hand (x < 2)
        return x >= 1 ? VRM_BONES.RIGHT_LOWER_ARM : VRM_BONES.RIGHT_HAND;
    }

    /**
     * Get left arm bone segment based on X position
     */
    getLeftArmSegment(x, y) {
        // Shoulder region (closest to body)
        if (x < 28) {
            return y >= 50 ? VRM_BONES.LEFT_SHOULDER : VRM_BONES.LEFT_UPPER_ARM;
        }

        // Upper arm
        if (x < 30) {
            return VRM_BONES.LEFT_UPPER_ARM;
        }

        // Lower arm / hand (x >= 30)
        return x < 31 ? VRM_BONES.LEFT_LOWER_ARM : VRM_BONES.LEFT_HAND;
    }

    /**
     * Get body/leg bone based on Y position
     */
    getBodyBone(x, y, z) {
        const isLeftSide = x >= 16;

        // Head
        if (y >= this.yRegions.HEAD.min) {
            return VRM_BONES.HEAD;
        }

        // Neck
        if (y >= this.yRegions.NECK.min) {
            return VRM_BONES.NECK;
        }

        // Chest
        if (y >= this.yRegions.CHEST.min) {
            return VRM_BONES.CHEST;
        }

        // Spine
        if (y >= this.yRegions.SPINE.min) {
            return VRM_BONES.SPINE;
        }

        // Hips
        if (y >= this.yRegions.HIPS.min) {
            return VRM_BONES.HIPS;
        }

        // Upper leg
        if (y >= this.yRegions.UPPER_LEG.min) {
            return isLeftSide ? VRM_BONES.LEFT_UPPER_LEG : VRM_BONES.RIGHT_UPPER_LEG;
        }

        // Lower leg
        if (y >= this.yRegions.LOWER_LEG.min) {
            return isLeftSide ? VRM_BONES.LEFT_LOWER_LEG : VRM_BONES.RIGHT_LOWER_LEG;
        }

        // Feet
        if (y >= this.yRegions.FEET.min) {
            return isLeftSide ? VRM_BONES.LEFT_FOOT : VRM_BONES.RIGHT_FOOT;
        }

        // Toes
        return isLeftSide ? VRM_BONES.LEFT_TOES : VRM_BONES.RIGHT_TOES;
    }

    /**
     * Get the region name for a Y coordinate
     */
    getYRegionName(y) {
        for (const [name, range] of Object.entries(this.yRegions)) {
            if (y >= range.min && y < range.max) {
                return name;
            }
        }
        return 'UNKNOWN';
    }

    /**
     * Get boundaries for a specific bone (for visualization)
     * @returns {{ min: {x,y,z}, max: {x,y,z} }} or null
     */
    getBoneBoundaries(boneName) {
        switch (boneName) {
            case VRM_BONES.HEAD:
                return {
                    min: { x: 8, y: this.yRegions.HEAD.min, z: 8 },
                    max: { x: 24, y: this.yRegions.HEAD.max, z: 24 }
                };

            case VRM_BONES.NECK:
                return {
                    min: { x: 12, y: this.yRegions.NECK.min, z: 12 },
                    max: { x: 20, y: this.yRegions.NECK.max, z: 20 }
                };

            case VRM_BONES.CHEST:
                return {
                    min: { x: 6, y: this.yRegions.CHEST.min, z: 10 },
                    max: { x: 26, y: this.yRegions.CHEST.max, z: 22 }
                };

            case VRM_BONES.SPINE:
                return {
                    min: { x: 8, y: this.yRegions.SPINE.min, z: 10 },
                    max: { x: 24, y: this.yRegions.SPINE.max, z: 22 }
                };

            case VRM_BONES.HIPS:
                return {
                    min: { x: 8, y: this.yRegions.HIPS.min, z: 10 },
                    max: { x: 24, y: this.yRegions.HIPS.max, z: 22 }
                };

            case VRM_BONES.LEFT_UPPER_LEG:
                return {
                    min: { x: 16, y: this.yRegions.UPPER_LEG.min, z: 12 },
                    max: { x: 24, y: this.yRegions.UPPER_LEG.max, z: 20 }
                };

            case VRM_BONES.RIGHT_UPPER_LEG:
                return {
                    min: { x: 8, y: this.yRegions.UPPER_LEG.min, z: 12 },
                    max: { x: 16, y: this.yRegions.UPPER_LEG.max, z: 20 }
                };

            case VRM_BONES.LEFT_LOWER_LEG:
                return {
                    min: { x: 17, y: this.yRegions.LOWER_LEG.min, z: 13 },
                    max: { x: 23, y: this.yRegions.LOWER_LEG.max, z: 19 }
                };

            case VRM_BONES.RIGHT_LOWER_LEG:
                return {
                    min: { x: 9, y: this.yRegions.LOWER_LEG.min, z: 13 },
                    max: { x: 15, y: this.yRegions.LOWER_LEG.max, z: 19 }
                };

            case VRM_BONES.LEFT_FOOT:
                return {
                    min: { x: 17, y: this.yRegions.FEET.min, z: 12 },
                    max: { x: 23, y: this.yRegions.FEET.max, z: 22 }
                };

            case VRM_BONES.RIGHT_FOOT:
                return {
                    min: { x: 9, y: this.yRegions.FEET.min, z: 12 },
                    max: { x: 15, y: this.yRegions.FEET.max, z: 22 }
                };

            case VRM_BONES.LEFT_UPPER_ARM:
                return {
                    min: { x: 26, y: this.armYRange.min, z: 14 },
                    max: { x: 30, y: this.armYRange.max - 4, z: 18 }
                };

            case VRM_BONES.RIGHT_UPPER_ARM:
                return {
                    min: { x: 2, y: this.armYRange.min, z: 14 },
                    max: { x: 6, y: this.armYRange.max - 4, z: 18 }
                };

            default:
                return null;
        }
    }

    /**
     * Check if a position is near a region boundary (for weight blending)
     * @returns {{ isBoundary: boolean, distance: number, adjacentBone: string|null }}
     */
    checkBoundaryProximity(x, y, z, blendDistance = 3) {
        const currentBone = this.getBoneForVoxel(x, y, z);

        // Check adjacent voxels in Y direction
        const aboveBone = y < AVATAR_HEIGHT - 1 ? this.getBoneForVoxel(x, y + blendDistance, z) : currentBone;
        const belowBone = y > 0 ? this.getBoneForVoxel(x, y - blendDistance, z) : currentBone;

        // Check adjacent voxels in X direction (for arms)
        const leftBone = x < AVATAR_WIDTH - 1 ? this.getBoneForVoxel(x + blendDistance, y, z) : currentBone;
        const rightBone = x > 0 ? this.getBoneForVoxel(x - blendDistance, y, z) : currentBone;

        // Find closest different bone
        const adjacentBones = [
            { bone: aboveBone, direction: 'above' },
            { bone: belowBone, direction: 'below' },
            { bone: leftBone, direction: 'left' },
            { bone: rightBone, direction: 'right' }
        ].filter(b => b.bone !== currentBone);

        if (adjacentBones.length === 0) {
            return { isBoundary: false, distance: blendDistance, adjacentBone: null };
        }

        // Calculate distance to nearest boundary
        let minDistance = blendDistance;
        let closestAdjacentBone = null;

        for (let d = 1; d < blendDistance; d++) {
            // Check Y boundaries
            if (y + d < AVATAR_HEIGHT && this.getBoneForVoxel(x, y + d, z) !== currentBone) {
                if (d < minDistance) {
                    minDistance = d;
                    closestAdjacentBone = this.getBoneForVoxel(x, y + d, z);
                }
            }
            if (y - d >= 0 && this.getBoneForVoxel(x, y - d, z) !== currentBone) {
                if (d < minDistance) {
                    minDistance = d;
                    closestAdjacentBone = this.getBoneForVoxel(x, y - d, z);
                }
            }

            // Check X boundaries (for arms)
            if (x + d < AVATAR_WIDTH && this.getBoneForVoxel(x + d, y, z) !== currentBone) {
                if (d < minDistance) {
                    minDistance = d;
                    closestAdjacentBone = this.getBoneForVoxel(x + d, y, z);
                }
            }
            if (x - d >= 0 && this.getBoneForVoxel(x - d, y, z) !== currentBone) {
                if (d < minDistance) {
                    minDistance = d;
                    closestAdjacentBone = this.getBoneForVoxel(x - d, y, z);
                }
            }
        }

        return {
            isBoundary: minDistance < blendDistance,
            distance: minDistance,
            adjacentBone: closestAdjacentBone
        };
    }

    /**
     * Get all bones that a voxel might blend between
     */
    getPotentialBones(x, y, z, blendDistance = 3) {
        const bones = new Set();

        // Check a small region around the voxel
        for (let dx = -blendDistance; dx <= blendDistance; dx++) {
            for (let dy = -blendDistance; dy <= blendDistance; dy++) {
                for (let dz = -blendDistance; dz <= blendDistance; dz++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    const nz = z + dz;

                    if (nx >= 0 && nx < AVATAR_WIDTH &&
                        ny >= 0 && ny < AVATAR_HEIGHT &&
                        nz >= 0 && nz < AVATAR_DEPTH) {
                        bones.add(this.getBoneForVoxel(nx, ny, nz));
                    }
                }
            }
        }

        return Array.from(bones);
    }

    /**
     * Clear the region cache (call if region config changes)
     */
    clearCache() {
        this.regionCache.clear();
    }

    /**
     * Serialize configuration
     */
    serialize() {
        return {
            yRegions: { ...this.yRegions },
            xRegions: { ...this.xRegions },
            armYRange: { ...this.armYRange }
        };
    }

    /**
     * Deserialize configuration
     */
    static deserialize(data) {
        return new BoneRegionMapper(data);
    }
}

export default BoneRegionMapper;
