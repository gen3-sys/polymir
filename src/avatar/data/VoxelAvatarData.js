/**
 * VoxelAvatarData - Core data structure for voxel-based avatars
 *
 * Stores avatar voxels in a sparse map for memory efficiency.
 * Typical avatars use 2,000-8,000 voxels out of 65,536 possible.
 *
 * Grid dimensions: 32 x 64 x 32 (width x height x depth)
 * Origin: Left-back-bottom at feet level
 * Coordinate system: X = right, Y = up, Z = forward
 */

import { AvatarPalette } from './AvatarPalette.js';

// Grid dimensions
export const AVATAR_WIDTH = 32;
export const AVATAR_HEIGHT = 64;
export const AVATAR_DEPTH = 32;
export const MAX_VOXELS = AVATAR_WIDTH * AVATAR_HEIGHT * AVATAR_DEPTH;

// Voxel types (stored in palette)
export const VOXEL_TYPE = {
    SOLID: 0,
    EMISSIVE: 1,
    TRANSPARENT: 2
};

export class VoxelAvatarData {
    constructor(options = {}) {
        // Sparse voxel storage: encoded position → palette index
        this.voxels = new Map();

        // Color palette (16 colors max)
        this.palette = options.palette || new AvatarPalette();

        // Metadata
        this.metadata = {
            id: options.id || this.generateId(),
            name: options.name || 'Unnamed Avatar',
            creatorId: options.creatorId || null,
            created: options.created || Date.now(),
            modified: options.modified || Date.now(),
            version: options.version || 1
        };

        // Render preference
        this.renderMode = options.renderMode || 'auto'; // 'cube', 'smooth', 'auto'

        // Expression data (face voxel deltas)
        this.expressions = new Map(); // expressionName → Map(encodedPos → paletteIndex)

        // Spring bone regions
        this.springBoneRegions = []; // Array of { name, voxels: Set, params }

        // Cached bounds (updated on modification)
        this._boundsCache = null;
        this._voxelCountCache = null;
    }

    /**
     * Generate unique avatar ID
     */
    generateId() {
        return 'avatar_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    // =========================================================================
    // Position Encoding
    // =========================================================================

    /**
     * Encode 3D position to single integer key
     * @param {number} x - X coordinate (0-31)
     * @param {number} y - Y coordinate (0-63)
     * @param {number} z - Z coordinate (0-31)
     * @returns {number} Encoded position key
     */
    encodePosition(x, y, z) {
        return x + (y * AVATAR_WIDTH) + (z * AVATAR_WIDTH * AVATAR_HEIGHT);
    }

    /**
     * Decode integer key to 3D position
     * @param {number} key - Encoded position key
     * @returns {{x: number, y: number, z: number}}
     */
    decodePosition(key) {
        const x = key % AVATAR_WIDTH;
        const y = Math.floor(key / AVATAR_WIDTH) % AVATAR_HEIGHT;
        const z = Math.floor(key / (AVATAR_WIDTH * AVATAR_HEIGHT));
        return { x, y, z };
    }

    /**
     * Check if position is within avatar bounds
     */
    isValidPosition(x, y, z) {
        return x >= 0 && x < AVATAR_WIDTH &&
               y >= 0 && y < AVATAR_HEIGHT &&
               z >= 0 && z < AVATAR_DEPTH;
    }

    // =========================================================================
    // Voxel Operations
    // =========================================================================

    /**
     * Set a voxel at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @param {number} paletteIndex - Index into color palette (0-15)
     * @returns {boolean} Success
     */
    setVoxel(x, y, z, paletteIndex) {
        if (!this.isValidPosition(x, y, z)) {
            console.warn(`[VoxelAvatarData] Invalid position: ${x}, ${y}, ${z}`);
            return false;
        }

        if (paletteIndex < 0 || paletteIndex >= this.palette.size()) {
            console.warn(`[VoxelAvatarData] Invalid palette index: ${paletteIndex}`);
            return false;
        }

        const key = this.encodePosition(x, y, z);
        this.voxels.set(key, paletteIndex);

        // Invalidate caches
        this._boundsCache = null;
        this._voxelCountCache = null;
        this.metadata.modified = Date.now();

        return true;
    }

    /**
     * Get voxel at position
     * @returns {number|null} Palette index or null if empty
     */
    getVoxel(x, y, z) {
        if (!this.isValidPosition(x, y, z)) return null;
        const key = this.encodePosition(x, y, z);
        return this.voxels.has(key) ? this.voxels.get(key) : null;
    }

    /**
     * Remove voxel at position
     * @returns {boolean} True if voxel existed and was removed
     */
    removeVoxel(x, y, z) {
        if (!this.isValidPosition(x, y, z)) return false;
        const key = this.encodePosition(x, y, z);
        const existed = this.voxels.delete(key);

        if (existed) {
            this._boundsCache = null;
            this._voxelCountCache = null;
            this.metadata.modified = Date.now();
        }

        return existed;
    }

    /**
     * Check if voxel exists at position
     */
    hasVoxel(x, y, z) {
        if (!this.isValidPosition(x, y, z)) return false;
        return this.voxels.has(this.encodePosition(x, y, z));
    }

    /**
     * Get total voxel count
     */
    getVoxelCount() {
        if (this._voxelCountCache === null) {
            this._voxelCountCache = this.voxels.size;
        }
        return this._voxelCountCache;
    }

    /**
     * Clear all voxels
     */
    clear() {
        this.voxels.clear();
        this._boundsCache = null;
        this._voxelCountCache = null;
        this.metadata.modified = Date.now();
    }

    // =========================================================================
    // Iteration
    // =========================================================================

    /**
     * Iterate over all voxels
     * @param {Function} callback - Called with (x, y, z, paletteIndex)
     */
    forEach(callback) {
        for (const [key, paletteIndex] of this.voxels) {
            const { x, y, z } = this.decodePosition(key);
            callback(x, y, z, paletteIndex);
        }
    }

    /**
     * Get all voxels as array
     * @returns {Array<{x, y, z, paletteIndex}>}
     */
    toArray() {
        const result = [];
        this.forEach((x, y, z, paletteIndex) => {
            result.push({ x, y, z, paletteIndex });
        });
        return result;
    }

    /**
     * Get voxels sorted by position (Y, X, Z order for optimal RLE)
     */
    getSortedVoxels() {
        const voxels = this.toArray();
        voxels.sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            if (a.x !== b.x) return a.x - b.x;
            return a.z - b.z;
        });
        return voxels;
    }

    /**
     * Get voxels in a region
     * @param {Object} min - {x, y, z} minimum corner
     * @param {Object} max - {x, y, z} maximum corner
     */
    getVoxelsInRegion(min, max) {
        const result = [];
        this.forEach((x, y, z, paletteIndex) => {
            if (x >= min.x && x <= max.x &&
                y >= min.y && y <= max.y &&
                z >= min.z && z <= max.z) {
                result.push({ x, y, z, paletteIndex });
            }
        });
        return result;
    }

    // =========================================================================
    // Bounds
    // =========================================================================

    /**
     * Get bounding box of all voxels
     * @returns {{min: {x,y,z}, max: {x,y,z}}} or null if empty
     */
    getBounds() {
        if (this._boundsCache !== null) {
            return this._boundsCache;
        }

        if (this.voxels.size === 0) {
            return null;
        }

        let minX = AVATAR_WIDTH, minY = AVATAR_HEIGHT, minZ = AVATAR_DEPTH;
        let maxX = 0, maxY = 0, maxZ = 0;

        this.forEach((x, y, z) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        });

        this._boundsCache = {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ }
        };

        return this._boundsCache;
    }

    /**
     * Get center of avatar (based on bounds)
     */
    getCenter() {
        const bounds = this.getBounds();
        if (!bounds) return { x: 16, y: 32, z: 16 }; // Default center

        return {
            x: (bounds.min.x + bounds.max.x) / 2,
            y: (bounds.min.y + bounds.max.y) / 2,
            z: (bounds.min.z + bounds.max.z) / 2
        };
    }

    // =========================================================================
    // Expressions
    // =========================================================================

    /**
     * Store an expression as delta from current face voxels
     * @param {string} name - Expression name (e.g., 'happy', 'sad')
     * @param {Map} deltaVoxels - Map of encoded positions to palette indices
     */
    setExpression(name, deltaVoxels) {
        this.expressions.set(name, new Map(deltaVoxels));
        this.metadata.modified = Date.now();
    }

    /**
     * Get expression delta
     * @returns {Map|null}
     */
    getExpression(name) {
        return this.expressions.get(name) || null;
    }

    /**
     * Get all expression names
     */
    getExpressionNames() {
        return Array.from(this.expressions.keys());
    }

    /**
     * Remove an expression
     */
    removeExpression(name) {
        return this.expressions.delete(name);
    }

    // =========================================================================
    // Spring Bone Regions
    // =========================================================================

    /**
     * Add a spring bone region
     * @param {Object} region - { name, voxelKeys: Set<encodedPos>, params: { stiffness, damping, gravity } }
     */
    addSpringBoneRegion(region) {
        this.springBoneRegions.push({
            name: region.name,
            voxelKeys: new Set(region.voxelKeys || []),
            params: {
                stiffness: region.params?.stiffness ?? 0.5,
                damping: region.params?.damping ?? 0.5,
                gravityFactor: region.params?.gravityFactor ?? 1.0
            }
        });
        this.metadata.modified = Date.now();
    }

    /**
     * Get spring bone region by name
     */
    getSpringBoneRegion(name) {
        return this.springBoneRegions.find(r => r.name === name) || null;
    }

    /**
     * Check if voxel is in any spring bone region
     * @returns {string|null} Region name or null
     */
    getSpringBoneRegionForVoxel(x, y, z) {
        const key = this.encodePosition(x, y, z);
        for (const region of this.springBoneRegions) {
            if (region.voxelKeys.has(key)) {
                return region.name;
            }
        }
        return null;
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    /**
     * Create a deep copy of this avatar data
     */
    clone() {
        const cloned = new VoxelAvatarData({
            palette: this.palette.clone(),
            name: this.metadata.name + ' (Copy)',
            creatorId: this.metadata.creatorId,
            renderMode: this.renderMode
        });

        // Copy voxels
        for (const [key, value] of this.voxels) {
            cloned.voxels.set(key, value);
        }

        // Copy expressions
        for (const [name, deltaMap] of this.expressions) {
            cloned.expressions.set(name, new Map(deltaMap));
        }

        // Copy spring bone regions
        for (const region of this.springBoneRegions) {
            cloned.springBoneRegions.push({
                name: region.name,
                voxelKeys: new Set(region.voxelKeys),
                params: { ...region.params }
            });
        }

        return cloned;
    }

    /**
     * Mirror avatar along X axis (for symmetry operations)
     */
    mirrorX() {
        const newVoxels = new Map();

        for (const [key, paletteIndex] of this.voxels) {
            const { x, y, z } = this.decodePosition(key);
            const mirroredX = AVATAR_WIDTH - 1 - x;
            const newKey = this.encodePosition(mirroredX, y, z);
            newVoxels.set(newKey, paletteIndex);
        }

        this.voxels = newVoxels;
        this._boundsCache = null;
        this.metadata.modified = Date.now();
    }

    /**
     * Apply symmetry - copy left side to right side (or vice versa)
     * @param {string} direction - 'leftToRight' or 'rightToLeft'
     */
    applySymmetry(direction = 'leftToRight') {
        const centerX = AVATAR_WIDTH / 2; // 16

        if (direction === 'leftToRight') {
            // Copy X >= 16 to X < 16
            const toAdd = [];
            this.forEach((x, y, z, paletteIndex) => {
                if (x >= centerX) {
                    const mirroredX = AVATAR_WIDTH - 1 - x;
                    toAdd.push({ x: mirroredX, y, z, paletteIndex });
                }
            });
            // Remove existing left side first
            const toRemove = [];
            this.forEach((x, y, z) => {
                if (x < centerX) {
                    toRemove.push({ x, y, z });
                }
            });
            toRemove.forEach(v => this.removeVoxel(v.x, v.y, v.z));
            toAdd.forEach(v => this.setVoxel(v.x, v.y, v.z, v.paletteIndex));
        } else {
            // Copy X < 16 to X >= 16
            const toAdd = [];
            this.forEach((x, y, z, paletteIndex) => {
                if (x < centerX) {
                    const mirroredX = AVATAR_WIDTH - 1 - x;
                    toAdd.push({ x: mirroredX, y, z, paletteIndex });
                }
            });
            const toRemove = [];
            this.forEach((x, y, z) => {
                if (x >= centerX) {
                    toRemove.push({ x, y, z });
                }
            });
            toRemove.forEach(v => this.removeVoxel(v.x, v.y, v.z));
            toAdd.forEach(v => this.setVoxel(v.x, v.y, v.z, v.paletteIndex));
        }
    }

    /**
     * Validate avatar data integrity
     * @returns {{valid: boolean, errors: string[]}}
     */
    validate() {
        const errors = [];

        // Check voxel count
        if (this.voxels.size > MAX_VOXELS) {
            errors.push(`Too many voxels: ${this.voxels.size} > ${MAX_VOXELS}`);
        }

        // Check palette indices
        const maxPaletteIndex = this.palette.size() - 1;
        for (const [key, paletteIndex] of this.voxels) {
            if (paletteIndex < 0 || paletteIndex > maxPaletteIndex) {
                const { x, y, z } = this.decodePosition(key);
                errors.push(`Invalid palette index ${paletteIndex} at (${x}, ${y}, ${z})`);
            }
        }

        // Check palette size
        if (this.palette.size() > 16) {
            errors.push(`Palette too large: ${this.palette.size()} > 16`);
        }

        // Check metadata
        if (!this.metadata.name || this.metadata.name.length === 0) {
            errors.push('Avatar name is required');
        }

        if (this.metadata.name.length > 64) {
            errors.push('Avatar name too long (max 64 characters)');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get statistics about this avatar
     */
    getStats() {
        const bounds = this.getBounds();
        const dimensions = bounds ? {
            width: bounds.max.x - bounds.min.x + 1,
            height: bounds.max.y - bounds.min.y + 1,
            depth: bounds.max.z - bounds.min.z + 1
        } : { width: 0, height: 0, depth: 0 };

        // Count voxels per palette color
        const colorCounts = new Map();
        this.forEach((x, y, z, paletteIndex) => {
            colorCounts.set(paletteIndex, (colorCounts.get(paletteIndex) || 0) + 1);
        });

        return {
            voxelCount: this.getVoxelCount(),
            paletteSize: this.palette.size(),
            dimensions,
            bounds,
            expressionCount: this.expressions.size,
            springBoneRegionCount: this.springBoneRegions.length,
            colorDistribution: Object.fromEntries(colorCounts)
        };
    }
}

export default VoxelAvatarData;
