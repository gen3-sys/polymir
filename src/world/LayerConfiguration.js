/**
 * LayerConfiguration - Hierarchical scale system for voxel data
 *
 * Enables nested detail levels where each layer can contain blocks or microblocks
 * at different scales relative to the parent layer.
 *
 * Layer 0: Full-size blocks (1m³ per voxel)
 * Layer 1: Microblocks (1/16th scale = 16³ microblocks per Layer 0 block)
 * Layer 2: Nano-blocks (1/256th scale = 16³ Layer 2 blocks per Layer 1 microblock)
 *
 * Each layer has:
 * - position: [x, y, z] offset from layer 0 origin (in layer 0 units)
 * - scale: scale factor relative to layer 0 (1.0, 0.0625, 0.00390625, etc.)
 * - renderMode: 'block' or 'microblock' - determines rendering size
 * - bounds: optional bounding box [minX, minY, minZ, maxX, maxY, maxZ]
 */

export class LayerConfiguration {
    constructor() {
        this.layers = [];
        this.MICROBLOCK_SCALE = 1 / 16; // 16x16x16 microblocks per block
        this.SCALE_FACTOR = 16; // Scale multiplier between layers
    }

    /**
     * Add a layer to the configuration
     * @param {Object} config - Layer configuration
     * @param {Array<number>} config.position - [x, y, z] offset in layer 0 units
     * @param {number} config.layerIndex - Layer index (0 = full scale, 1+ = nested)
     * @param {string} config.renderMode - 'block' or 'microblock'
     * @param {Array<number>} config.bounds - Optional [minX, minY, minZ, maxX, maxY, maxZ]
     * @returns {number} The layer index
     */
    addLayer({ position = [0, 0, 0], layerIndex = null, renderMode = 'block', bounds = null }) {
        if (layerIndex === null) {
            layerIndex = this.layers.length;
        }

        // Calculate absolute scale: each layer is 16x smaller than previous
        const absoluteScale = Math.pow(this.MICROBLOCK_SCALE, layerIndex);

        const layer = {
            index: layerIndex,
            position: [...position],
            absoluteScale: absoluteScale,
            renderMode: renderMode, // 'block' or 'microblock'
            bounds: bounds ? [...bounds] : null,
            voxelCount: 0
        };

        // Insert at correct index
        while (this.layers.length <= layerIndex) {
            this.layers.push(null);
        }
        this.layers[layerIndex] = layer;

        return layerIndex;
    }

    /**
     * Get layer by index
     */
    getLayer(layerIndex) {
        return this.layers[layerIndex] || null;
    }

    /**
     * Get all layers
     */
    getAllLayers() {
        return this.layers.filter(l => l !== null);
    }

    /**
     * Convert world position to layer-local coordinates
     * @param {Array<number>} worldPos - [x, y, z] in layer 0 units
     * @param {number} layerIndex - Target layer index
     * @returns {Array<number>} [x, y, z] in layer-local units
     */
    worldToLayerLocal(worldPos, layerIndex) {
        const layer = this.getLayer(layerIndex);
        if (!layer) {
            throw new Error(`Layer ${layerIndex} does not exist`);
        }

        const [wx, wy, wz] = worldPos;
        const [lx, ly, lz] = layer.position;

        // Offset from layer origin, then scale to layer units
        const scaleMultiplier = Math.pow(this.SCALE_FACTOR, layerIndex);

        return [
            Math.floor((wx - lx) * scaleMultiplier),
            Math.floor((wy - ly) * scaleMultiplier),
            Math.floor((wz - lz) * scaleMultiplier)
        ];
    }

    /**
     * Convert layer-local position to world coordinates
     * @param {Array<number>} localPos - [x, y, z] in layer-local units
     * @param {number} layerIndex - Source layer index
     * @returns {Array<number>} [x, y, z] in layer 0 units
     */
    layerLocalToWorld(localPos, layerIndex) {
        const layer = this.getLayer(layerIndex);
        if (!layer) {
            throw new Error(`Layer ${layerIndex} does not exist`);
        }

        const [lx, ly, lz] = localPos;
        const [ox, oy, oz] = layer.position;

        // Scale from layer units to layer 0, then add origin offset
        const scaleDivisor = Math.pow(this.SCALE_FACTOR, layerIndex);

        return [
            (lx / scaleDivisor) + ox,
            (ly / scaleDivisor) + oy,
            (lz / scaleDivisor) + oz
        ];
    }

    /**
     * Get render scale for a layer
     * Returns the actual size in meters for rendering
     */
    getRenderScale(layerIndex) {
        const layer = this.getLayer(layerIndex);
        if (!layer) return 1.0;

        if (layer.renderMode === 'microblock') {
            // Microblocks are always 1/16th of their layer's base scale
            return layer.absoluteScale * this.MICROBLOCK_SCALE;
        } else {
            // Blocks render at their layer's base scale
            return layer.absoluteScale;
        }
    }

    /**
     * Calculate voxels per block for a given layer
     * If renderMode is 'microblock', returns 16³ = 4096
     * If renderMode is 'block', returns 1
     */
    getVoxelsPerBlock(layerIndex) {
        const layer = this.getLayer(layerIndex);
        if (!layer) return 1;

        if (layer.renderMode === 'microblock') {
            return Math.pow(this.SCALE_FACTOR, 3); // 16³ = 4096
        }
        return 1;
    }

    /**
     * Update voxel count for a layer
     */
    updateVoxelCount(layerIndex, count) {
        const layer = this.getLayer(layerIndex);
        if (layer) {
            layer.voxelCount = count;
        }
    }

    /**
     * Serialize to JSON for .mvox header
     */
    toJSON() {
        return {
            layers: this.layers.filter(l => l !== null).map(layer => ({
                index: layer.index,
                position: layer.position,
                absoluteScale: layer.absoluteScale,
                renderMode: layer.renderMode,
                bounds: layer.bounds,
                voxelCount: layer.voxelCount
            }))
        };
    }

    /**
     * Deserialize from JSON
     */
    static fromJSON(json) {
        const config = new LayerConfiguration();

        if (json.layers) {
            for (const layerData of json.layers) {
                config.addLayer({
                    position: layerData.position,
                    layerIndex: layerData.index,
                    renderMode: layerData.renderMode || 'block',
                    bounds: layerData.bounds
                });

                if (layerData.voxelCount !== undefined) {
                    config.updateVoxelCount(layerData.index, layerData.voxelCount);
                }
            }
        }

        return config;
    }

    /**
     * Create a simple configuration for testing
     * Creates N layers with automatic positioning and scale
     */
    static createSimple(numLayers = 2, renderMode = 'block') {
        const config = new LayerConfiguration();

        for (let i = 0; i < numLayers; i++) {
            config.addLayer({
                position: [0, 0, 0],
                layerIndex: i,
                renderMode: i === 0 ? 'block' : renderMode,
                bounds: null
            });
        }

        return config;
    }

    /**
     * Get debug info string
     */
    getDebugInfo() {
        const lines = ['Layer Configuration:'];

        for (const layer of this.getAllLayers()) {
            const voxelsPerBlock = this.getVoxelsPerBlock(layer.index);
            const renderScale = this.getRenderScale(layer.index);

            lines.push(
                `  Layer ${layer.index}: ` +
                `pos=${layer.position.join(',')}, ` +
                `scale=${layer.absoluteScale.toFixed(6)}, ` +
                `render=${layer.renderMode}, ` +
                `renderSize=${renderScale.toFixed(6)}m, ` +
                `vpb=${voxelsPerBlock}, ` +
                `voxels=${layer.voxelCount}`
            );
        }

        return lines.join('\n');
    }
}

export default LayerConfiguration;
