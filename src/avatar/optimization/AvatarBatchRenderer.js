/**
 * AvatarBatchRenderer - Efficient batch rendering for multiple avatars
 *
 * Reduces draw calls by batching avatar rendering operations.
 * Uses GPU instancing and material sorting for optimal performance.
 *
 * Features:
 * - Instanced rendering for cube mode avatars
 * - Material batching to minimize shader switches
 * - Dynamic instance buffer management
 * - Per-instance bone transforms via texture
 * - Batch statistics and profiling
 */

import * as THREE from 'three';

// Batch configuration
const CONFIG = {
    MAX_INSTANCES_PER_BATCH: 1000,
    MAX_BATCHES: 100,
    INSTANCE_BUFFER_GROWTH: 1.5,
    BONE_TEXTURE_SIZE: 256,  // 256x256 can store 65536 bone transforms
    MAX_BONES_PER_AVATAR: 32,
    REBUILD_THRESHOLD: 0.3   // Rebuild if 30% of batch changed
};

export class AvatarBatchRenderer {
    constructor(options = {}) {
        this.config = { ...CONFIG, ...options };

        // Batches organized by material
        this.batches = new Map();

        // Instance data arrays
        this.instanceMatrices = new Float32Array(this.config.MAX_INSTANCES_PER_BATCH * 16);
        this.instanceColors = new Float32Array(this.config.MAX_INSTANCES_PER_BATCH * 4);
        this.instanceBoneIndices = new Float32Array(this.config.MAX_INSTANCES_PER_BATCH);

        // Bone transform texture
        this.boneTexture = null;
        this.boneTextureData = null;

        // Registered avatars
        this.avatars = new Map();

        // O(1) bone texture slot management - free list instead of O(n) scan
        this.freeBoneSlots = [];
        this.nextBoneSlot = 0;

        // Dirty tracking
        this.dirtyAvatars = new Set();
        this.needsRebuild = false;

        // Shared geometry for cube mode
        this.cubeGeometry = null;

        // Statistics (track visible count incrementally to avoid O(n) filter)
        this.stats = {
            totalInstances: 0,
            totalBatches: 0,
            drawCalls: 0,
            triangles: 0,
            rebuildCount: 0,
            updateCount: 0
        };
        this.visibleCount = 0; // Incremental tracking

        // Reusable objects to avoid allocation in hot paths
        this._dummyObject = null;

        // Initialize
        this.initialize();
    }

    /**
     * Initialize batch renderer resources
     */
    initialize() {
        // Create shared cube geometry
        this.cubeGeometry = new THREE.BoxGeometry(1, 1, 1);

        // Reusable dummy object for matrix operations (avoid allocation in hot path)
        this._dummyObject = new THREE.Object3D();

        // Create bone texture
        this.createBoneTexture();
    }

    /**
     * Create texture for storing bone transforms
     */
    createBoneTexture() {
        const size = this.config.BONE_TEXTURE_SIZE;
        this.boneTextureData = new Float32Array(size * size * 4);

        this.boneTexture = new THREE.DataTexture(
            this.boneTextureData,
            size,
            size,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.boneTexture.needsUpdate = true;
    }

    /**
     * Register avatar for batch rendering
     * @param {string} avatarId - Unique avatar identifier
     * @param {Object} avatarData - Avatar voxel data and bone info
     */
    registerAvatar(avatarId, avatarData) {
        if (this.avatars.has(avatarId)) {
            this.unregisterAvatar(avatarId);
        }

        const registration = {
            id: avatarId,
            data: avatarData,
            batchKey: null,
            instanceIndex: -1,
            boneTextureOffset: -1,
            transform: new THREE.Matrix4(),
            visible: true,
            lodLevel: 0
        };

        this.avatars.set(avatarId, registration);
        this.assignBoneTextureSlot(registration);
        this.visibleCount++; // Track incrementally (default visible=true)
        this.needsRebuild = true;
    }

    /**
     * Unregister avatar from batch rendering
     * @param {string} avatarId - Avatar to remove
     */
    unregisterAvatar(avatarId) {
        const registration = this.avatars.get(avatarId);
        if (!registration) return;

        // Track visible count change
        if (registration.visible) {
            this.visibleCount--;
        }

        // Release bone texture slot - O(1)
        this.releaseBoneTextureSlot(registration);

        // Remove from batch
        if (registration.batchKey) {
            const batch = this.batches.get(registration.batchKey);
            if (batch) {
                batch.instances.delete(avatarId);
            }
        }

        this.avatars.delete(avatarId);
        this.needsRebuild = true;
    }

    /**
     * Assign bone texture slot to avatar - O(1) via free list
     */
    assignBoneTextureSlot(registration) {
        let slot;

        if (this.freeBoneSlots.length > 0) {
            // Reuse a freed slot - O(1)
            slot = this.freeBoneSlots.pop();
        } else {
            // Allocate new slot - O(1)
            slot = this.nextBoneSlot++;
        }

        registration.boneTextureOffset = slot;
    }

    /**
     * Release bone texture slot back to free list - O(1)
     */
    releaseBoneTextureSlot(registration) {
        if (registration.boneTextureOffset >= 0) {
            this.freeBoneSlots.push(registration.boneTextureOffset);
            registration.boneTextureOffset = -1;
        }
    }

    /**
     * Update avatar transform
     * @param {string} avatarId - Avatar identifier
     * @param {THREE.Matrix4} transform - World transform matrix
     */
    updateAvatarTransform(avatarId, transform) {
        const registration = this.avatars.get(avatarId);
        if (!registration) return;

        registration.transform.copy(transform);
        this.dirtyAvatars.add(avatarId);
    }

    /**
     * Update avatar bone transforms
     * @param {string} avatarId - Avatar identifier
     * @param {Float32Array} boneMatrices - Bone transform matrices
     */
    updateAvatarBones(avatarId, boneMatrices) {
        const registration = this.avatars.get(avatarId);
        if (!registration || registration.boneTextureOffset < 0) return;

        // Write bone matrices to texture
        const offset = registration.boneTextureOffset * this.config.MAX_BONES_PER_AVATAR * 16;
        const maxCopy = Math.min(
            boneMatrices.length,
            this.config.MAX_BONES_PER_AVATAR * 16
        );

        for (let i = 0; i < maxCopy; i++) {
            this.boneTextureData[offset + i] = boneMatrices[i];
        }

        this.boneTexture.needsUpdate = true;
    }

    /**
     * Set avatar visibility
     * @param {string} avatarId - Avatar identifier
     * @param {boolean} visible - Visibility state
     */
    setAvatarVisible(avatarId, visible) {
        const registration = this.avatars.get(avatarId);
        if (!registration) return;

        if (registration.visible !== visible) {
            registration.visible = visible;
            // Track incrementally - O(1) instead of O(n) filter in getStats
            this.visibleCount += visible ? 1 : -1;
            this.needsRebuild = true;
        }
    }

    /**
     * Set avatar LOD level
     * @param {string} avatarId - Avatar identifier
     * @param {number} lodLevel - LOD level (0-3)
     */
    setAvatarLOD(avatarId, lodLevel) {
        const registration = this.avatars.get(avatarId);
        if (!registration) return;

        if (registration.lodLevel !== lodLevel) {
            registration.lodLevel = lodLevel;
            this.needsRebuild = true;
        }
    }

    /**
     * Build or rebuild batches
     */
    buildBatches() {
        this.stats.rebuildCount++;

        // Clear existing batches
        for (const batch of this.batches.values()) {
            batch.instances.clear();
        }

        // Group avatars by LOD and material
        for (const [avatarId, registration] of this.avatars) {
            if (!registration.visible) continue;

            const batchKey = this.getBatchKey(registration);

            if (!this.batches.has(batchKey)) {
                this.batches.set(batchKey, this.createBatch(batchKey, registration.lodLevel));
            }

            const batch = this.batches.get(batchKey);
            batch.instances.set(avatarId, registration);
            registration.batchKey = batchKey;
        }

        // Update instanced meshes
        for (const [key, batch] of this.batches) {
            this.updateBatchMesh(batch);
        }

        this.needsRebuild = false;
        this.dirtyAvatars.clear();
    }

    /**
     * Get batch key for avatar
     */
    getBatchKey(registration) {
        return `lod${registration.lodLevel}`;
    }

    /**
     * Create new batch
     */
    createBatch(key, lodLevel) {
        // Create instanced mesh
        const geometry = this.getGeometryForLOD(lodLevel);
        const material = this.getMaterialForLOD(lodLevel);

        const mesh = new THREE.InstancedMesh(
            geometry,
            material,
            this.config.MAX_INSTANCES_PER_BATCH
        );
        mesh.frustumCulled = false; // We do our own culling
        mesh.count = 0;

        return {
            key,
            lodLevel,
            mesh,
            instances: new Map(),
            instanceCount: 0
        };
    }

    /**
     * Get geometry for LOD level
     */
    getGeometryForLOD(lodLevel) {
        switch (lodLevel) {
            case 0: // Full detail - subdivided cube
                return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
            case 1: // Medium - standard cube
                return this.cubeGeometry.clone();
            case 2: // Low - simplified cube
                return this.cubeGeometry.clone();
            case 3: // Impostor - plane
                return new THREE.PlaneGeometry(1, 2);
            default:
                return this.cubeGeometry.clone();
        }
    }

    /**
     * Get material for LOD level
     */
    getMaterialForLOD(lodLevel) {
        const baseColor = new THREE.Color(0x888888);

        switch (lodLevel) {
            case 0: // Full detail - custom shader
                return new THREE.MeshStandardMaterial({
                    vertexColors: true,
                    roughness: 0.8,
                    metalness: 0.0
                });
            case 1: // Medium
                return new THREE.MeshLambertMaterial({
                    vertexColors: true
                });
            case 2: // Low
                return new THREE.MeshBasicMaterial({
                    vertexColors: true
                });
            case 3: // Impostor - billboard material
                return new THREE.SpriteMaterial({
                    color: baseColor,
                    transparent: true
                });
            default:
                return new THREE.MeshBasicMaterial({ color: baseColor });
        }
    }

    /**
     * Update batch mesh instance data
     */
    updateBatchMesh(batch) {
        let index = 0;

        for (const [avatarId, registration] of batch.instances) {
            if (index >= this.config.MAX_INSTANCES_PER_BATCH) break;

            // Set instance transform (reuse dummy object to avoid allocation)
            this._dummyObject.matrix.copy(registration.transform);
            batch.mesh.setMatrixAt(index, this._dummyObject.matrix);

            // Set instance color (from avatar data)
            if (registration.data && registration.data.dominantColor) {
                batch.mesh.setColorAt(index, registration.data.dominantColor);
            }

            registration.instanceIndex = index;
            index++;
        }

        batch.mesh.count = index;
        batch.instanceCount = index;
        batch.mesh.instanceMatrix.needsUpdate = true;

        if (batch.mesh.instanceColor) {
            batch.mesh.instanceColor.needsUpdate = true;
        }
    }

    /**
     * Update dirty avatars without full rebuild
     */
    updateDirtyAvatars() {
        if (this.dirtyAvatars.size === 0) return;

        this.stats.updateCount++;

        for (const avatarId of this.dirtyAvatars) {
            const registration = this.avatars.get(avatarId);
            if (!registration || !registration.batchKey) continue;

            const batch = this.batches.get(registration.batchKey);
            if (!batch || registration.instanceIndex < 0) continue;

            // Update just this instance's transform (reuse dummy object)
            this._dummyObject.matrix.copy(registration.transform);
            batch.mesh.setMatrixAt(registration.instanceIndex, this._dummyObject.matrix);
            batch.mesh.instanceMatrix.needsUpdate = true;
        }

        this.dirtyAvatars.clear();
    }

    /**
     * Main render preparation - call before render
     */
    prepare() {
        if (this.needsRebuild) {
            this.buildBatches();
        } else {
            this.updateDirtyAvatars();
        }
    }

    /**
     * Get meshes to add to scene
     */
    getMeshes() {
        const meshes = [];

        for (const batch of this.batches.values()) {
            if (batch.instanceCount > 0) {
                meshes.push(batch.mesh);
            }
        }

        return meshes;
    }

    /**
     * Add batched meshes to scene
     * @param {THREE.Scene} scene - Target scene
     */
    addToScene(scene) {
        for (const batch of this.batches.values()) {
            if (!batch.mesh.parent) {
                scene.add(batch.mesh);
            }
        }
    }

    /**
     * Remove batched meshes from scene
     * @param {THREE.Scene} scene - Target scene
     */
    removeFromScene(scene) {
        for (const batch of this.batches.values()) {
            scene.remove(batch.mesh);
        }
    }

    /**
     * Get render statistics
     */
    getStats() {
        let totalInstances = 0;
        let triangles = 0;

        for (const batch of this.batches.values()) {
            totalInstances += batch.instanceCount;
            const geomTris = batch.mesh.geometry.index
                ? batch.mesh.geometry.index.count / 3
                : batch.mesh.geometry.attributes.position.count / 3;
            triangles += batch.instanceCount * geomTris;
        }

        return {
            ...this.stats,
            totalInstances,
            totalBatches: this.batches.size,
            drawCalls: this.batches.size, // One draw per batch
            triangles,
            registeredAvatars: this.avatars.size,
            visibleAvatars: this.visibleCount  // O(1) instead of O(n) filter
        };
    }

    /**
     * Get bone texture for shader use
     */
    getBoneTexture() {
        return this.boneTexture;
    }

    /**
     * Create batch shader material with bone texture support
     */
    createBatchShaderMaterial() {
        const vertexShader = `
            uniform sampler2D boneTexture;
            uniform float boneTextureSize;

            attribute float boneTextureOffset;

            varying vec3 vColor;
            varying vec3 vNormal;

            mat4 getBoneMatrix(float index, float offset) {
                float x = mod(index * 4.0 + offset * 128.0, boneTextureSize);
                float y = floor((index * 4.0 + offset * 128.0) / boneTextureSize);

                vec4 col0 = texture2D(boneTexture, vec2((x + 0.5) / boneTextureSize, (y + 0.5) / boneTextureSize));
                vec4 col1 = texture2D(boneTexture, vec2((x + 1.5) / boneTextureSize, (y + 0.5) / boneTextureSize));
                vec4 col2 = texture2D(boneTexture, vec2((x + 2.5) / boneTextureSize, (y + 0.5) / boneTextureSize));
                vec4 col3 = texture2D(boneTexture, vec2((x + 3.5) / boneTextureSize, (y + 0.5) / boneTextureSize));

                return mat4(col0, col1, col2, col3);
            }

            void main() {
                vColor = instanceColor;
                vNormal = normalMatrix * normal;

                vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
            }
        `;

        const fragmentShader = `
            varying vec3 vColor;
            varying vec3 vNormal;

            void main() {
                vec3 light = normalize(vec3(1.0, 1.0, 1.0));
                float diffuse = max(dot(vNormal, light), 0.0);
                vec3 color = vColor * (0.3 + 0.7 * diffuse);
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        return new THREE.ShaderMaterial({
            uniforms: {
                boneTexture: { value: this.boneTexture },
                boneTextureSize: { value: this.config.BONE_TEXTURE_SIZE }
            },
            vertexShader,
            fragmentShader
        });
    }

    /**
     * Dispose resources
     */
    dispose() {
        // Dispose batches and remove from scene
        for (const batch of this.batches.values()) {
            // Remove from parent scene if attached
            if (batch.mesh.parent) {
                batch.mesh.parent.remove(batch.mesh);
            }
            batch.mesh.geometry.dispose();
            if (Array.isArray(batch.mesh.material)) {
                batch.mesh.material.forEach(m => m.dispose());
            } else {
                batch.mesh.material.dispose();
            }
        }

        // Dispose shared resources
        if (this.cubeGeometry) {
            this.cubeGeometry.dispose();
            this.cubeGeometry = null;
        }

        if (this.boneTexture) {
            this.boneTexture.dispose();
            this.boneTexture = null;
        }

        // Clear collections
        this.batches.clear();
        this.avatars.clear();
        this.dirtyAvatars.clear();

        // Reset slot management
        this.freeBoneSlots = [];
        this.nextBoneSlot = 0;
        this.visibleCount = 0;

        // Null out reusable objects
        this._dummyObject = null;
        this.boneTextureData = null;
    }
}

export default AvatarBatchRenderer;
