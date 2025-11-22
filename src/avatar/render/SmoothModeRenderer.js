/**
 * SmoothModeRenderer - Greedy-meshed polygon rendering for voxel avatars
 *
 * Generates optimized polygon meshes from voxel data using greedy meshing.
 * Produces a cleaner, more "modern" look compared to individual cubes.
 *
 * Features:
 * - Greedy meshing algorithm for face merging
 * - Per-bone mesh generation
 * - Mesh caching (only regenerate on data change)
 * - Optional smooth normals at edges
 */

import * as THREE from 'three';
import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';

// Face directions for mesh generation
const DIRECTIONS = [
    { axis: 0, dir: 1, name: 'px', normal: [1, 0, 0] },   // +X
    { axis: 0, dir: -1, name: 'nx', normal: [-1, 0, 0] }, // -X
    { axis: 1, dir: 1, name: 'py', normal: [0, 1, 0] },   // +Y
    { axis: 1, dir: -1, name: 'ny', normal: [0, -1, 0] }, // -Y
    { axis: 2, dir: 1, name: 'pz', normal: [0, 0, 1] },   // +Z
    { axis: 2, dir: -1, name: 'nz', normal: [0, 0, -1] }  // -Z
];

export class SmoothModeRenderer {
    constructor(options = {}) {
        // Generated meshes per bone group
        this.meshes = new Map(); // boneName → THREE.Mesh

        // Mesh cache (for reuse when data hasn't changed)
        this.geometryCache = new Map(); // hash → THREE.BufferGeometry

        // Options
        this.enableGreedyMeshing = options.enableGreedyMeshing !== false;
        this.smoothNormals = options.smoothNormals || false;
    }

    /**
     * Build meshes for all bone groups
     * @param {Map<string, Array>} voxelsByBone - Voxels grouped by bone name
     * @param {Map<string, THREE.Group>} boneGroups - THREE.Group containers for each bone
     * @param {AvatarMaterialManager} materialManager - Material manager
     * @param {number} voxelScale - World scale per voxel
     */
    buildMeshes(voxelsByBone, boneGroups, materialManager, voxelScale) {
        // Clean up existing meshes
        this.dispose();

        for (const [boneName, voxels] of voxelsByBone) {
            if (voxels.length === 0) continue;

            const boneGroup = boneGroups.get(boneName);
            if (!boneGroup) continue;

            // Generate geometry
            const geometry = this.enableGreedyMeshing
                ? this.generateGreedyMesh(voxels, voxelScale)
                : this.generateSimpleMesh(voxels, voxelScale);

            if (!geometry || geometry.attributes.position.count === 0) continue;

            // Create mesh with material
            const material = materialManager.getSmoothMaterial();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `SmoothMesh_${boneName}`;

            // Store rest position for transform calculations
            const bone = boneGroup.userData.restPosition || { x: 16, y: 32, z: 16 };
            mesh.userData.boneRestPosition = bone;

            // Enable frustum culling
            mesh.frustumCulled = true;

            // Store and add to scene
            this.meshes.set(boneName, mesh);
            boneGroup.add(mesh);
        }
    }

    /**
     * Generate mesh using greedy meshing algorithm
     * Merges adjacent faces of the same color into larger quads
     */
    generateGreedyMesh(voxels, voxelScale) {
        // Build 3D lookup for voxels
        const voxelMap = new Map();
        for (const v of voxels) {
            voxelMap.set(`${v.x},${v.y},${v.z}`, v);
        }

        // Calculate bounds
        let minX = AVATAR_WIDTH, minY = AVATAR_HEIGHT, minZ = AVATAR_DEPTH;
        let maxX = 0, maxY = 0, maxZ = 0;
        for (const v of voxels) {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            minZ = Math.min(minZ, v.z);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
            maxZ = Math.max(maxZ, v.z);
        }

        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];
        let vertexIndex = 0;

        // Process each face direction
        for (const direction of DIRECTIONS) {
            const { axis, dir, normal } = direction;

            // Get perpendicular axes
            const u = (axis + 1) % 3;
            const v = (axis + 2) % 3;

            // Slice dimensions
            const sliceMin = [minX, minY, minZ];
            const sliceMax = [maxX + 1, maxY + 1, maxZ + 1];

            // Process each slice along the axis
            for (let d = sliceMin[axis]; d < sliceMax[axis]; d++) {
                // Build mask for this slice
                const mask = [];
                const maskPalette = [];

                for (let j = sliceMin[v]; j < sliceMax[v]; j++) {
                    for (let i = sliceMin[u]; i < sliceMax[u]; i++) {
                        // Build position based on axis
                        const pos = [0, 0, 0];
                        pos[axis] = d;
                        pos[u] = i;
                        pos[v] = j;

                        const key = `${pos[0]},${pos[1]},${pos[2]}`;
                        const voxel = voxelMap.get(key);

                        // Check neighbor in direction
                        const neighborPos = [...pos];
                        neighborPos[axis] += dir;
                        const neighborKey = `${neighborPos[0]},${neighborPos[1]},${neighborPos[2]}`;
                        const neighbor = voxelMap.get(neighborKey);

                        // Face is visible if voxel exists and neighbor doesn't
                        if (voxel && !neighbor) {
                            mask.push(true);
                            maskPalette.push(voxel.paletteIndex);
                        } else {
                            mask.push(false);
                            maskPalette.push(-1);
                        }
                    }
                }

                // Greedy mesh the mask
                const width = sliceMax[u] - sliceMin[u];
                const height = sliceMax[v] - sliceMin[v];
                const visited = new Array(mask.length).fill(false);

                for (let j = 0; j < height; j++) {
                    for (let i = 0; i < width; i++) {
                        const idx = j * width + i;
                        if (!mask[idx] || visited[idx]) continue;

                        const paletteIdx = maskPalette[idx];

                        // Find width of quad (same palette)
                        let w = 1;
                        while (i + w < width) {
                            const nextIdx = j * width + (i + w);
                            if (!mask[nextIdx] || visited[nextIdx] || maskPalette[nextIdx] !== paletteIdx) break;
                            w++;
                        }

                        // Find height of quad (all rows must have same width)
                        let h = 1;
                        outer: while (j + h < height) {
                            for (let k = 0; k < w; k++) {
                                const checkIdx = (j + h) * width + (i + k);
                                if (!mask[checkIdx] || visited[checkIdx] || maskPalette[checkIdx] !== paletteIdx) {
                                    break outer;
                                }
                            }
                            h++;
                        }

                        // Mark visited
                        for (let dj = 0; dj < h; dj++) {
                            for (let di = 0; di < w; di++) {
                                visited[(j + dj) * width + (i + di)] = true;
                            }
                        }

                        // Create quad vertices
                        const quadVerts = this.createQuadVertices(
                            axis, dir,
                            sliceMin[u] + i,
                            sliceMin[v] + j,
                            d + (dir > 0 ? 1 : 0),
                            w, h,
                            voxelScale
                        );

                        // Add to geometry
                        for (const vert of quadVerts) {
                            positions.push(vert.x, vert.y, vert.z);
                            normals.push(normal[0], normal[1], normal[2]);
                            // Color will be set from palette
                            colors.push(paletteIdx / 16, 0, 0); // Encode palette index in R channel
                        }

                        // Add indices (2 triangles per quad)
                        indices.push(
                            vertexIndex, vertexIndex + 1, vertexIndex + 2,
                            vertexIndex, vertexIndex + 2, vertexIndex + 3
                        );
                        vertexIndex += 4;
                    }
                }
            }
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);

        // Compute bounding box/sphere
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }

    /**
     * Create quad vertices for a face
     */
    createQuadVertices(axis, dir, u, v, d, width, height, scale) {
        const vertices = [];

        // Build 4 corners based on axis orientation
        for (let corner = 0; corner < 4; corner++) {
            const pos = [0, 0, 0];
            pos[axis] = d * scale;

            // Corner offsets
            const du = (corner === 1 || corner === 2) ? width : 0;
            const dv = (corner === 2 || corner === 3) ? height : 0;

            const uAxis = (axis + 1) % 3;
            const vAxis = (axis + 2) % 3;
            pos[uAxis] = (u + du) * scale;
            pos[vAxis] = (v + dv) * scale;

            // Center offset (avatar is centered at X/Z)
            pos[0] -= (AVATAR_WIDTH / 2) * scale;
            pos[2] -= (AVATAR_DEPTH / 2) * scale;

            vertices.push({ x: pos[0], y: pos[1], z: pos[2] });
        }

        // Flip winding for negative direction faces
        if (dir < 0) {
            return [vertices[0], vertices[3], vertices[2], vertices[1]];
        }

        return vertices;
    }

    /**
     * Generate simple mesh (one quad per visible face, no merging)
     * Used as fallback or for debugging
     */
    generateSimpleMesh(voxels, voxelScale) {
        const voxelMap = new Map();
        for (const v of voxels) {
            voxelMap.set(`${v.x},${v.y},${v.z}`, v);
        }

        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];
        let vertexIndex = 0;

        for (const voxel of voxels) {
            const { x, y, z, paletteIndex } = voxel;

            for (const direction of DIRECTIONS) {
                const { axis, dir, normal } = direction;

                // Check if face is visible
                const neighborPos = [x, y, z];
                neighborPos[axis] += dir;
                const neighborKey = `${neighborPos[0]},${neighborPos[1]},${neighborPos[2]}`;

                if (voxelMap.has(neighborKey)) continue; // Face hidden

                // Create quad for this face
                const quadVerts = this.createSingleVoxelFace(x, y, z, axis, dir, voxelScale);

                for (const vert of quadVerts) {
                    positions.push(vert.x, vert.y, vert.z);
                    normals.push(normal[0], normal[1], normal[2]);
                    colors.push(paletteIndex / 16, 0, 0);
                }

                indices.push(
                    vertexIndex, vertexIndex + 1, vertexIndex + 2,
                    vertexIndex, vertexIndex + 2, vertexIndex + 3
                );
                vertexIndex += 4;
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }

    /**
     * Create face vertices for a single voxel
     */
    createSingleVoxelFace(x, y, z, axis, dir, scale) {
        return this.createQuadVertices(axis, dir, x, y, z, 1, 1, scale);
    }

    /**
     * Update mesh for a single bone (incremental update)
     */
    updateBoneMesh(boneName, voxels, materialManager, voxelScale) {
        const existingMesh = this.meshes.get(boneName);

        const geometry = this.enableGreedyMeshing
            ? this.generateGreedyMesh(voxels, voxelScale)
            : this.generateSimpleMesh(voxels, voxelScale);

        if (existingMesh) {
            // Update existing mesh geometry
            existingMesh.geometry.dispose();
            existingMesh.geometry = geometry;
        }
    }

    /**
     * Get total vertex count
     */
    getVertexCount() {
        let total = 0;
        for (const mesh of this.meshes.values()) {
            if (mesh.geometry && mesh.geometry.attributes.position) {
                total += mesh.geometry.attributes.position.count;
            }
        }
        return total;
    }

    /**
     * Get total triangle count
     */
    getTriangleCount() {
        let total = 0;
        for (const mesh of this.meshes.values()) {
            if (mesh.geometry && mesh.geometry.index) {
                total += mesh.geometry.index.count / 3;
            }
        }
        return total;
    }

    /**
     * Get draw call count
     */
    getDrawCallCount() {
        return this.meshes.size;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        for (const [boneName, mesh] of this.meshes) {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }
            // Material is managed by AvatarMaterialManager
        }
        this.meshes.clear();

        // Clear geometry cache
        for (const geometry of this.geometryCache.values()) {
            geometry.dispose();
        }
        this.geometryCache.clear();
    }
}

export default SmoothModeRenderer;
