/**
 * LayeredVoxelData - Manages voxel storage across multiple scale layers
 *
 * Stores voxels in separate Maps per layer, each with their own coordinate space.
 * Each voxel stores: {color, semantics, scale, layerIndex}
 *
 * Example usage:
 * ```
 * const data = new LayeredVoxelData();
 * data.setVoxel(0, [10, 5, 3], {color: 0xFF0000, semantics: 1}); // Layer 0 block
 * data.setVoxel(1, [160, 80, 48], {color: 0x00FF00, semantics: 1}); // Layer 1 microblock
 * ```
 */

import { LayerConfiguration } from './LayerConfiguration.js';

export class LayeredVoxelData {
    constructor(layerConfig = null) {
        this.layerConfig = layerConfig || new LayerConfiguration();
        this.layerData = new Map(); // layerIndex -> Map<encodedKey, voxelData>
    }

    /**
     * Encode 3D coordinates to a key
     * Uses 32-bit encoding: 11 bits per axis (supports -1024 to 1023)
     */
    encodeKey(x, y, z) {
        const MAX_COORD = 1024;
        const MASK = 0x7FF; // 11 bits

        const nx = (x + MAX_COORD) & MASK;
        const ny = (y + MAX_COORD) & MASK;
        const nz = (z + MAX_COORD) & MASK;

        return (nx) | (ny << 11) | (nz << 22);
    }

    /**
     * Decode key back to 3D coordinates
     */
    decodeKey(key) {
        const MAX_COORD = 1024;
        const MASK = 0x7FF;

        const x = (key & MASK) - MAX_COORD;
        const y = ((key >> 11) & MASK) - MAX_COORD;
        const z = ((key >> 22) & MASK) - MAX_COORD;

        return [x, y, z];
    }

    /**
     * Get the voxel map for a specific layer
     */
    getLayerMap(layerIndex) {
        if (!this.layerData.has(layerIndex)) {
            this.layerData.set(layerIndex, new Map());
        }
        return this.layerData.get(layerIndex);
    }

    /**
     * Set a voxel in a specific layer
     * @param {number} layerIndex - Layer index
     * @param {Array<number>} position - [x, y, z] in layer-local coordinates
     * @param {Object} voxelData - {color, semantics, ...}
     */
    setVoxel(layerIndex, position, voxelData) {
        const [x, y, z] = position;
        const key = this.encodeKey(x, y, z);
        const layerMap = this.getLayerMap(layerIndex);

        layerMap.set(key, {
            ...voxelData,
            layerIndex: layerIndex,
            scale: this.layerConfig.getRenderScale(layerIndex)
        });

        // Update voxel count in layer config
        this.layerConfig.updateVoxelCount(layerIndex, layerMap.size);
    }

    /**
     * Get a voxel from a specific layer
     */
    getVoxel(layerIndex, position) {
        const [x, y, z] = position;
        const key = this.encodeKey(x, y, z);
        const layerMap = this.getLayerMap(layerIndex);

        return layerMap.get(key) || null;
    }

    /**
     * Remove a voxel from a specific layer
     */
    removeVoxel(layerIndex, position) {
        const [x, y, z] = position;
        const key = this.encodeKey(x, y, z);
        const layerMap = this.getLayerMap(layerIndex);

        const result = layerMap.delete(key);

        // Update voxel count
        this.layerConfig.updateVoxelCount(layerIndex, layerMap.size);

        return result;
    }

    /**
     * Get all voxels for a specific layer
     * Returns array of {x, y, z, color, semantics, ...}
     */
    getLayerVoxels(layerIndex) {
        const layerMap = this.getLayerMap(layerIndex);
        const voxels = [];

        for (const [key, voxelData] of layerMap) {
            const [x, y, z] = this.decodeKey(key);
            voxels.push({
                x, y, z,
                ...voxelData
            });
        }

        return voxels;
    }

    /**
     * Get all voxels from all layers (for rendering)
     * Returns array with world-space coordinates
     */
    getAllVoxelsWorldSpace() {
        const allVoxels = [];

        for (const layerIndex of this.layerData.keys()) {
            const layerMap = this.layerData.get(layerIndex);
            const renderScale = this.layerConfig.getRenderScale(layerIndex);

            for (const [key, voxelData] of layerMap) {
                const [lx, ly, lz] = this.decodeKey(key);
                const [wx, wy, wz] = this.layerConfig.layerLocalToWorld([lx, ly, lz], layerIndex);

                allVoxels.push({
                    x: wx,
                    y: wy,
                    z: wz,
                    ...voxelData,
                    renderScale: renderScale,
                    layerIndex: layerIndex
                });
            }
        }

        return allVoxels;
    }

    /**
     * Clear all voxels from a specific layer
     */
    clearLayer(layerIndex) {
        if (this.layerData.has(layerIndex)) {
            this.layerData.get(layerIndex).clear();
            this.layerConfig.updateVoxelCount(layerIndex, 0);
        }
    }

    /**
     * Clear all voxels from all layers
     */
    clearAll() {
        for (const layerIndex of this.layerData.keys()) {
            this.clearLayer(layerIndex);
        }
    }

    /**
     * Get total voxel count across all layers
     */
    getTotalVoxelCount() {
        let total = 0;
        for (const layerMap of this.layerData.values()) {
            total += layerMap.size;
        }
        return total;
    }

    /**
     * Get number of layers with voxel data
     */
    getLayerCount() {
        return this.layerData.size;
    }

    /**
     * Get statistics
     */
    getStats() {
        const stats = {
            totalVoxels: this.getTotalVoxelCount(),
            layerCount: this.getLayerCount(),
            layers: []
        };

        for (const [layerIndex, layerMap] of this.layerData) {
            const layer = this.layerConfig.getLayer(layerIndex);
            stats.layers.push({
                index: layerIndex,
                voxelCount: layerMap.size,
                renderScale: this.layerConfig.getRenderScale(layerIndex),
                renderMode: layer ? layer.renderMode : 'unknown'
            });
        }

        return stats;
    }

    /**
     * Convert to flat Map format for NBT encoding (legacy compatibility)
     * Returns Map<encodedKey, voxelData> with layer info embedded
     */
    toFlatMap() {
        const flatMap = new Map();
        let keyOffset = 0;

        for (const [layerIndex, layerMap] of this.layerData) {
            for (const [key, voxelData] of layerMap) {
                const [x, y, z] = this.decodeKey(key);

                // Encode with layer index embedded in high bits
                const layerKey = key | (layerIndex << 30);

                flatMap.set(layerKey, {
                    ...voxelData,
                    x, y, z,
                    layerIndex: layerIndex
                });
            }
        }

        return flatMap;
    }

    /**
     * Create from flat Map format (legacy compatibility)
     */
    static fromFlatMap(flatMap, layerConfig) {
        const layered = new LayeredVoxelData(layerConfig);

        for (const [key, voxelData] of flatMap) {
            const layerIndex = voxelData.layerIndex || 0;
            const x = voxelData.x;
            const y = voxelData.y;
            const z = voxelData.z;

            if (x !== undefined && y !== undefined && z !== undefined) {
                layered.setVoxel(layerIndex, [x, y, z], voxelData);
            }
        }

        return layered;
    }

    /**
     * Clone this LayeredVoxelData
     */
    clone() {
        const cloned = new LayeredVoxelData(this.layerConfig);

        for (const [layerIndex, layerMap] of this.layerData) {
            const clonedMap = new Map();
            for (const [key, voxelData] of layerMap) {
                clonedMap.set(key, { ...voxelData });
            }
            cloned.layerData.set(layerIndex, clonedMap);
        }

        return cloned;
    }

    /**
     * Get debug info string
     */
    getDebugInfo() {
        const stats = this.getStats();
        const lines = [
            `LayeredVoxelData: ${stats.totalVoxels} voxels across ${stats.layerCount} layers`
        ];

        for (const layer of stats.layers) {
            lines.push(
                `  Layer ${layer.index}: ${layer.voxelCount} voxels, ` +
                `scale=${layer.renderScale.toFixed(6)}, ` +
                `mode=${layer.renderMode}`
            );
        }

        return lines.join('\n');
    }
}

export default LayeredVoxelData;
