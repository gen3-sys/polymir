/**
 * CubeModeRenderer - Instanced cube rendering for voxel avatars
 *
 * Renders each voxel as a small cube using GPU instancing for efficiency.
 * Provides the classic "chunky voxel" look.
 *
 * Features:
 * - GPU instanced rendering (one draw call per bone group)
 * - Per-instance color from palette
 * - Bone transform as instance attribute
 * - Optional face culling for internal voxels
 */

import * as THREE from 'three';

// Shared cube geometry (reused across all renderers)
let sharedCubeGeometry = null;

function getSharedCubeGeometry() {
    if (!sharedCubeGeometry) {
        sharedCubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    }
    return sharedCubeGeometry;
}

export class CubeModeRenderer {
    constructor(options = {}) {
        // Instanced meshes per bone group
        this.instancedMeshes = new Map(); // boneName → THREE.InstancedMesh

        // Options
        this.cullInternal = options.cullInternal !== false; // Skip internal voxels
        this.useAO = options.useAO || false; // Ambient occlusion on cube faces

        // Instance data arrays (reused for efficiency)
        this.tempMatrix = new THREE.Matrix4();
        this.tempColor = new THREE.Color();
        this.tempPosition = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.tempScale = new THREE.Vector3(1, 1, 1);
    }

    /**
     * Build instanced meshes for all bone groups
     * @param {Map<string, Array>} voxelsByBone - Voxels grouped by bone name
     * @param {Map<string, THREE.Group>} boneGroups - THREE.Group containers for each bone
     * @param {AvatarMaterialManager} materialManager - Material manager
     * @param {number} voxelScale - World scale per voxel
     */
    buildMeshes(voxelsByBone, boneGroups, materialManager, voxelScale) {
        // Clean up existing meshes
        this.dispose();

        const cubeGeometry = getSharedCubeGeometry();

        for (const [boneName, voxels] of voxelsByBone) {
            if (voxels.length === 0) continue;

            const boneGroup = boneGroups.get(boneName);
            if (!boneGroup) continue;

            // Filter internal voxels if culling enabled
            const visibleVoxels = this.cullInternal
                ? this.getVisibleVoxels(voxels, voxelsByBone)
                : voxels;

            if (visibleVoxels.length === 0) continue;

            // Create instanced mesh
            const material = materialManager.getCubeMaterial();
            const instancedMesh = new THREE.InstancedMesh(
                cubeGeometry,
                material,
                visibleVoxels.length
            );
            instancedMesh.name = `CubeInstances_${boneName}`;

            // Set instance transforms and colors
            for (let i = 0; i < visibleVoxels.length; i++) {
                const voxel = visibleVoxels[i];

                // Position: relative to bone group origin
                const bone = boneGroup.userData.restPosition || { x: 16, y: 32, z: 16 };
                this.tempPosition.set(
                    (voxel.x - bone.x) * voxelScale,
                    (voxel.y - bone.y) * voxelScale,
                    (voxel.z - bone.z) * voxelScale
                );

                // Scale: cube size
                this.tempScale.setScalar(voxelScale * 0.95); // Slight gap between voxels

                // Build matrix
                this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
                instancedMesh.setMatrixAt(i, this.tempMatrix);

                // Set color from palette
                const color = materialManager.getColor(voxel.paletteIndex);
                if (color) {
                    this.tempColor.setRGB(color[0], color[1], color[2]);
                    instancedMesh.setColorAt(i, this.tempColor);
                }
            }

            // Mark for update
            instancedMesh.instanceMatrix.needsUpdate = true;
            if (instancedMesh.instanceColor) {
                instancedMesh.instanceColor.needsUpdate = true;
            }

            // Enable frustum culling
            instancedMesh.frustumCulled = true;

            // Store reference and add to bone group
            this.instancedMeshes.set(boneName, instancedMesh);
            boneGroup.add(instancedMesh);
        }
    }

    /**
     * Filter out voxels that are completely surrounded (not visible)
     */
    getVisibleVoxels(voxels, allVoxelsByBone) {
        // Build lookup set of all occupied positions
        const occupiedSet = new Set();

        for (const [, boneVoxels] of allVoxelsByBone) {
            for (const v of boneVoxels) {
                occupiedSet.add(`${v.x},${v.y},${v.z}`);
            }
        }

        // Filter to voxels with at least one exposed face
        return voxels.filter(voxel => {
            const { x, y, z } = voxel;

            // Check all 6 neighbors
            return !occupiedSet.has(`${x + 1},${y},${z}`) ||
                   !occupiedSet.has(`${x - 1},${y},${z}`) ||
                   !occupiedSet.has(`${x},${y + 1},${z}`) ||
                   !occupiedSet.has(`${x},${y - 1},${z}`) ||
                   !occupiedSet.has(`${x},${y},${z + 1}`) ||
                   !occupiedSet.has(`${x},${y},${z - 1}`);
        });
    }

    /**
     * Update instance transforms (called when bones move)
     * @param {string} boneName - Bone to update
     * @param {THREE.Matrix4} boneTransform - New bone world transform
     */
    updateBoneTransform(boneName, boneTransform) {
        const instancedMesh = this.instancedMeshes.get(boneName);
        if (!instancedMesh) return;

        // The bone group handles the transform, so we don't need to update instances
        // This method is here for potential future per-instance adjustments
    }

    /**
     * Update a specific voxel's color
     */
    updateVoxelColor(boneName, voxelIndex, color) {
        const instancedMesh = this.instancedMeshes.get(boneName);
        if (!instancedMesh || voxelIndex >= instancedMesh.count) return;

        this.tempColor.setRGB(color[0], color[1], color[2]);
        instancedMesh.setColorAt(voxelIndex, this.tempColor);
        instancedMesh.instanceColor.needsUpdate = true;
    }

    /**
     * Set LOD level (affects detail)
     * @param {number} lodLevel - 0 = full detail, higher = less detail
     */
    setLODLevel(lodLevel) {
        // For cube mode, LOD could skip every Nth voxel
        // Not implemented yet - would require rebuild with filtered voxels
    }

    /**
     * Get total instance count across all bone groups
     */
    getInstanceCount() {
        let total = 0;
        for (const mesh of this.instancedMeshes.values()) {
            total += mesh.count;
        }
        return total;
    }

    /**
     * Get draw call count
     */
    getDrawCallCount() {
        return this.instancedMeshes.size;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        for (const [boneName, mesh] of this.instancedMeshes) {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            // Don't dispose shared geometry
            // mesh.geometry.dispose(); // Shared, don't dispose
            // Material is managed by AvatarMaterialManager
        }
        this.instancedMeshes.clear();
    }
}

/**
 * Create optimized cube geometry with only visible faces
 * Used when we know which faces are exposed
 */
export function createOptimizedCubeGeometry(visibleFaces) {
    const positions = [];
    const normals = [];
    const indices = [];

    const faces = {
        // +X face
        px: {
            positions: [0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5],
            normal: [1, 0, 0]
        },
        // -X face
        nx: {
            positions: [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5],
            normal: [-1, 0, 0]
        },
        // +Y face
        py: {
            positions: [-0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5],
            normal: [0, 1, 0]
        },
        // -Y face
        ny: {
            positions: [-0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5],
            normal: [0, -1, 0]
        },
        // +Z face
        pz: {
            positions: [-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5],
            normal: [0, 0, 1]
        },
        // -Z face
        nz: {
            positions: [0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5],
            normal: [0, 0, -1]
        }
    };

    let vertexCount = 0;

    for (const [faceName, visible] of Object.entries(visibleFaces)) {
        if (!visible) continue;

        const face = faces[faceName];
        if (!face) continue;

        // Add positions
        for (let i = 0; i < face.positions.length; i++) {
            positions.push(face.positions[i]);
        }

        // Add normals (4 vertices per face)
        for (let i = 0; i < 4; i++) {
            normals.push(...face.normal);
        }

        // Add indices (2 triangles per face)
        indices.push(
            vertexCount, vertexCount + 1, vertexCount + 2,
            vertexCount, vertexCount + 2, vertexCount + 3
        );

        vertexCount += 4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    return geometry;
}

export default CubeModeRenderer;
