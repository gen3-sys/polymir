/**
 * LayeredMesher - Multi-scale voxel meshing for hierarchical layer systems
 *
 * Meshes voxels across multiple layers, each with their own scale and coordinate space.
 * Uses UnifiedVoxelMesher for each layer with appropriate scale parameters.
 *
 * Example:
 * Layer 0: Full-size blocks (voxelSize = 1.0)
 * Layer 1: Microblocks (voxelSize = 0.0625)
 * Layer 2: Nano-blocks (voxelSize = 0.00390625)
 */

import { UnifiedVoxelMesher } from './UnifiedVoxelMesher.js';
import { LayeredVoxelData } from '../../world/LayeredVoxelData.js';

export class LayeredMesher {
    /**
     * Mesh layered voxel data
     * @param {LayeredVoxelData} layeredData - Layered voxel data structure
     * @param {Object} options - Meshing options
     * @param {Array<number>} options.layersToMesh - Specific layers to mesh (default: all)
     * @param {boolean} options.mergeGeometry - Merge all layers into single geometry (default: false)
     * @param {Object} options.meshOptions - Options to pass to UnifiedVoxelMesher
     * @returns {Object} { layerGeometries: Map<layerIndex, geometry>, mergedGeometry: geometry|null }
     */
    static mesh(layeredData, options = {}) {
        const {
            layersToMesh = null,
            mergeGeometry = false,
            meshOptions = {}
        } = options;

        const layerGeometries = new Map();
        const layerConfig = layeredData.layerConfig;

        // Determine which layers to mesh
        const layerIndices = layersToMesh || Array.from(layeredData.layerData.keys());

        // Mesh each layer separately
        for (const layerIndex of layerIndices) {
            const layerMap = layeredData.getLayerMap(layerIndex);
            if (layerMap.size === 0) continue;

            const layer = layerConfig.getLayer(layerIndex);
            if (!layer) continue;

            // Get render scale for this layer
            const voxelSize = layerConfig.getRenderScale(layerIndex);

            // Mesh this layer
            const geometry = UnifiedVoxelMesher.mesh(layerMap, {
                voxelSize: voxelSize,
                ...meshOptions
            });

            if (geometry) {
                // Store layer metadata with geometry
                geometry.layerIndex = layerIndex;
                geometry.renderScale = voxelSize;
                geometry.layerPosition = layer.position;
                geometry.renderMode = layer.renderMode;

                layerGeometries.set(layerIndex, geometry);
            }
        }

        // Optionally merge all geometries into one
        let merged = null;
        if (mergeGeometry && layerGeometries.size > 0) {
            merged = this.mergeLayerGeometries(layerGeometries, layerConfig);
        }

        return {
            layerGeometries: layerGeometries,
            mergedGeometry: merged,
            totalLayers: layerGeometries.size
        };
    }

    /**
     * Merge multiple layer geometries into a single geometry
     * Transforms each layer's vertices to world space
     */
    static mergeLayerGeometries(layerGeometries, layerConfig) {
        const merged = {
            vertices: [],
            normals: [],
            colors: [],
            indices: [],
            layerInfo: [] // Track which layer each vertex belongs to
        };

        let vertexOffset = 0;

        for (const [layerIndex, geometry] of layerGeometries) {
            const layer = layerConfig.getLayer(layerIndex);
            if (!layer) continue;

            const [ox, oy, oz] = layer.position;

            // Transform vertices to world space
            for (let i = 0; i < geometry.vertices.length; i += 3) {
                const lx = geometry.vertices[i];
                const ly = geometry.vertices[i + 1];
                const lz = geometry.vertices[i + 2];

                // Scale from layer-local to world space and add origin offset
                merged.vertices.push(lx + ox);
                merged.vertices.push(ly + oy);
                merged.vertices.push(lz + oz);

                // Track layer index for each vertex
                merged.layerInfo.push(layerIndex);
            }

            // Copy normals directly
            merged.normals.push(...geometry.normals);

            // Copy colors directly
            merged.colors.push(...geometry.colors);

            // Adjust indices by vertex offset
            for (const index of geometry.indices) {
                merged.indices.push(index + vertexOffset);
            }

            vertexOffset += geometry.vertices.length / 3;
        }

        return merged;
    }

    /**
     * Mesh a single layer by index
     */
    static meshLayer(layeredData, layerIndex, options = {}) {
        const layerMap = layeredData.getLayerMap(layerIndex);
        if (layerMap.size === 0) return null;

        const layer = layeredData.layerConfig.getLayer(layerIndex);
        if (!layer) return null;

        const voxelSize = layeredData.layerConfig.getRenderScale(layerIndex);

        const geometry = UnifiedVoxelMesher.mesh(layerMap, {
            voxelSize: voxelSize,
            ...options
        });

        if (geometry) {
            geometry.layerIndex = layerIndex;
            geometry.renderScale = voxelSize;
            geometry.layerPosition = layer.position;
            geometry.renderMode = layer.renderMode;
        }

        return geometry;
    }

    /**
     * Get mesh statistics for layered data
     */
    static getStats(layeredData) {
        const stats = {
            totalVoxels: 0,
            layerStats: []
        };

        for (const [layerIndex, layerMap] of layeredData.layerData) {
            const layer = layeredData.layerConfig.getLayer(layerIndex);
            if (!layer) continue;

            const voxelCount = layerMap.size;
            const renderScale = layeredData.layerConfig.getRenderScale(layerIndex);

            stats.totalVoxels += voxelCount;
            stats.layerStats.push({
                layerIndex,
                voxelCount,
                renderScale,
                renderMode: layer.renderMode,
                estimatedFaces: voxelCount * 6 // Upper bound before culling
            });
        }

        return stats;
    }

    /**
     * Convert world position to voxel coordinates for picking/raycasting
     * Returns {layerIndex, localPos: [x,y,z]} or null
     */
    static worldToVoxel(layeredData, worldPos, preferredLayer = null) {
        const [wx, wy, wz] = worldPos;

        // Try preferred layer first
        if (preferredLayer !== null) {
            const layer = layeredData.layerConfig.getLayer(preferredLayer);
            if (layer) {
                const localPos = layeredData.layerConfig.worldToLayerLocal(worldPos, preferredLayer);
                const voxel = layeredData.getVoxel(preferredLayer, localPos);
                if (voxel) {
                    return { layerIndex: preferredLayer, localPos, voxel };
                }
            }
        }

        // Search all layers (starting from highest detail)
        const layerIndices = Array.from(layeredData.layerData.keys()).sort((a, b) => b - a);

        for (const layerIndex of layerIndices) {
            const localPos = layeredData.layerConfig.worldToLayerLocal(worldPos, layerIndex);
            const voxel = layeredData.getVoxel(layerIndex, localPos);

            if (voxel) {
                return { layerIndex, localPos, voxel };
            }
        }

        return null;
    }

    /**
     * Generate level-of-detail (LOD) meshes for a layer
     * Creates simplified meshes at different detail levels
     */
    static generateLOD(layeredData, layerIndex, lodLevels = [1, 2, 4, 8]) {
        const lodMeshes = [];

        for (const lodScale of lodLevels) {
            const geometry = this.meshLayer(layeredData, layerIndex, {
                voxelSize: layeredData.layerConfig.getRenderScale(layerIndex) * lodScale,
                useTextureID: lodScale > 2 // Use texture grouping for distant LODs
            });

            if (geometry) {
                geometry.lodScale = lodScale;
                lodMeshes.push(geometry);
            }
        }

        return lodMeshes;
    }

    /**
     * Debug: visualize layer boundaries
     * Creates wireframe boxes showing each layer's extent
     */
    static generateLayerBoundaryVisualization(layeredData) {
        const boundaries = [];

        for (const [layerIndex, layerMap] of layeredData.layerData) {
            if (layerMap.size === 0) continue;

            // Calculate bounding box in layer-local space
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

            for (const [key] of layerMap) {
                const [x, y, z] = layeredData.decodeKey(key);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                minZ = Math.min(minZ, z);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                maxZ = Math.max(maxZ, z);
            }

            // Convert to world space
            const minWorld = layeredData.layerConfig.layerLocalToWorld([minX, minY, minZ], layerIndex);
            const maxWorld = layeredData.layerConfig.layerLocalToWorld([maxX + 1, maxY + 1, maxZ + 1], layerIndex);

            boundaries.push({
                layerIndex,
                min: minWorld,
                max: maxWorld,
                voxelCount: layerMap.size
            });
        }

        return boundaries;
    }
}

export default LayeredMesher;
