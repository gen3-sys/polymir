/**
 * VoxelAvatarRenderer - Main render orchestrator for voxel avatars
 *
 * Manages rendering mode selection, bone transform application,
 * frustum culling, and coordinates between cube/smooth renderers.
 *
 * Supports three render modes:
 * - 'cube': Chunky voxel look using instanced cubes
 * - 'smooth': Greedy-meshed polygonal rendering
 * - 'auto': Automatically selects based on distance/LOD
 */

import * as THREE from 'three';
import { VoxelAvatarData, AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';
import { CubeModeRenderer } from './CubeModeRenderer.js';
import { SmoothModeRenderer } from './SmoothModeRenderer.js';
import { AvatarLODController } from './AvatarLODController.js';
import { AvatarMaterialManager } from './AvatarMaterialManager.js';

// Render modes
export const RENDER_MODE = {
    CUBE: 'cube',
    SMOOTH: 'smooth',
    AUTO: 'auto'
};

// Voxel scale in world units
export const VOXEL_SCALE = 0.03; // 3cm per voxel

export class VoxelAvatarRenderer {
    constructor(options = {}) {
        // Core components
        this.cubeRenderer = new CubeModeRenderer();
        this.smoothRenderer = new SmoothModeRenderer();
        this.lodController = new AvatarLODController(options.lodConfig);
        this.materialManager = new AvatarMaterialManager();

        // Container for all avatar meshes
        this.rootGroup = new THREE.Group();
        this.rootGroup.name = 'AvatarRoot';

        // Avatar data reference
        this.avatarData = null;
        this.rig = null;

        // Current render state
        this.renderMode = options.renderMode || RENDER_MODE.AUTO;
        this.currentLOD = 0;
        this.isVisible = true;

        // Bone groups (meshes organized by bone)
        this.boneGroups = new Map(); // boneName → THREE.Group

        // Frustum culling
        this.boundingSphere = new THREE.Sphere();
        this.frustumCulled = true;

        // Performance tracking
        this.stats = {
            drawCalls: 0,
            triangles: 0,
            lastUpdateTime: 0
        };

        // Options
        this.voxelScale = options.voxelScale || VOXEL_SCALE;
        this.enableShadows = options.enableShadows !== false;
        this.enableOutline = options.enableOutline || false;
    }

    /**
     * Initialize renderer with avatar data and rig
     * @param {VoxelAvatarData} avatarData - Voxel avatar data
     * @param {VoxelAvatarRig} rig - Avatar rig with bone transforms
     */
    initialize(avatarData, rig) {
        this.avatarData = avatarData;
        this.rig = rig;

        // Clear existing content
        this.dispose();
        this.rootGroup = new THREE.Group();
        this.rootGroup.name = 'AvatarRoot';

        // Initialize material manager with avatar palette
        this.materialManager.initializePalette(avatarData.palette);

        // Build bone groups
        this.buildBoneGroups();

        // Generate initial meshes
        this.rebuildMeshes();

        // Calculate bounding sphere
        this.updateBoundingSphere();

        return this.rootGroup;
    }

    /**
     * Build THREE.Group containers for each bone
     */
    buildBoneGroups() {
        this.boneGroups.clear();

        if (!this.rig) return;

        // Create a group for each bone
        for (const boneName of this.rig.getBoneNames()) {
            const group = new THREE.Group();
            group.name = `BoneGroup_${boneName}`;

            // Get rest position from rig
            const bone = this.rig.getBone(boneName);
            if (bone && bone.restPosition) {
                // Convert voxel coordinates to world coordinates
                group.position.set(
                    (bone.restPosition.x - AVATAR_WIDTH / 2) * this.voxelScale,
                    bone.restPosition.y * this.voxelScale,
                    (bone.restPosition.z - AVATAR_DEPTH / 2) * this.voxelScale
                );
            }

            this.boneGroups.set(boneName, group);
            this.rootGroup.add(group);
        }
    }

    /**
     * Rebuild all meshes from voxel data
     * Called when avatar data changes significantly
     */
    rebuildMeshes() {
        if (!this.avatarData || !this.rig) return;

        const startTime = performance.now();

        // Group voxels by bone
        const voxelsByBone = this.groupVoxelsByBone();

        // Build meshes based on current mode
        const effectiveMode = this.getEffectiveRenderMode();

        if (effectiveMode === RENDER_MODE.CUBE) {
            this.cubeRenderer.buildMeshes(voxelsByBone, this.boneGroups, this.materialManager, this.voxelScale);
        } else {
            this.smoothRenderer.buildMeshes(voxelsByBone, this.boneGroups, this.materialManager, this.voxelScale);
        }

        // Configure shadows
        this.configureShadows();

        this.stats.lastUpdateTime = performance.now() - startTime;
    }

    /**
     * Group voxels by their assigned bone
     * @returns {Map<string, Array<{x, y, z, paletteIndex}>>}
     */
    groupVoxelsByBone() {
        const voxelsByBone = new Map();

        // Initialize empty arrays for each bone
        for (const boneName of this.rig.getBoneNames()) {
            voxelsByBone.set(boneName, []);
        }

        // Assign each voxel to its bone
        this.avatarData.forEach((x, y, z, paletteIndex) => {
            const boneName = this.rig.regionMapper.getBoneForVoxel(x, y, z);
            const boneVoxels = voxelsByBone.get(boneName);
            if (boneVoxels) {
                boneVoxels.push({ x, y, z, paletteIndex });
            }
        });

        return voxelsByBone;
    }

    /**
     * Get effective render mode (resolves 'auto')
     */
    getEffectiveRenderMode() {
        if (this.renderMode === RENDER_MODE.AUTO) {
            // Use LOD to determine mode
            return this.currentLOD <= 1 ? RENDER_MODE.SMOOTH : RENDER_MODE.CUBE;
        }
        return this.renderMode;
    }

    /**
     * Update avatar render state
     * @param {THREE.Camera} camera - Camera for LOD/culling calculations
     * @param {number} deltaTime - Time since last update
     */
    update(camera, deltaTime) {
        if (!this.isVisible || !this.avatarData) return;

        // Update LOD based on camera distance
        const distance = this.calculateCameraDistance(camera);
        const newLOD = this.lodController.calculateLOD(distance);

        // Check if we need to switch render mode
        if (newLOD !== this.currentLOD && this.renderMode === RENDER_MODE.AUTO) {
            const oldMode = this.getEffectiveRenderMode();
            this.currentLOD = newLOD;
            const newMode = this.getEffectiveRenderMode();

            if (oldMode !== newMode) {
                this.rebuildMeshes();
            }
        }

        this.currentLOD = newLOD;

        // Apply bone transforms from rig
        this.applyBoneTransforms();

        // Update spring bone physics
        if (this.rig && this.rig.springBoneConfig) {
            this.rig.springBoneConfig.update(deltaTime, this.rig.getWorldTransforms());
        }

        // Update stats
        this.updateStats();
    }

    /**
     * Apply bone transforms to mesh groups
     */
    applyBoneTransforms() {
        if (!this.rig) return;

        for (const [boneName, group] of this.boneGroups) {
            const bone = this.rig.getBone(boneName);
            if (!bone) continue;

            // Get world transform from rig
            const worldTransform = bone.worldTransform || {};

            // Apply position
            if (worldTransform.position) {
                group.position.set(
                    worldTransform.position.x * this.voxelScale,
                    worldTransform.position.y * this.voxelScale,
                    worldTransform.position.z * this.voxelScale
                );
            }

            // Apply rotation (quaternion)
            if (worldTransform.rotation) {
                group.quaternion.set(
                    worldTransform.rotation.x,
                    worldTransform.rotation.y,
                    worldTransform.rotation.z,
                    worldTransform.rotation.w
                );
            }
        }
    }

    /**
     * Calculate distance from camera to avatar
     */
    calculateCameraDistance(camera) {
        if (!camera) return 0;

        const avatarPosition = new THREE.Vector3();
        this.rootGroup.getWorldPosition(avatarPosition);

        return camera.position.distanceTo(avatarPosition);
    }

    /**
     * Configure shadow casting/receiving
     */
    configureShadows() {
        this.rootGroup.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.castShadow = this.enableShadows;
                object.receiveShadow = this.enableShadows;
            }
        });
    }

    /**
     * Update bounding sphere for frustum culling
     */
    updateBoundingSphere() {
        if (!this.avatarData) {
            this.boundingSphere.set(new THREE.Vector3(), 1);
            return;
        }

        const bounds = this.avatarData.getBounds();
        if (!bounds) {
            this.boundingSphere.set(new THREE.Vector3(), 1);
            return;
        }

        // Calculate center and radius
        const center = new THREE.Vector3(
            ((bounds.min.x + bounds.max.x) / 2 - AVATAR_WIDTH / 2) * this.voxelScale,
            ((bounds.min.y + bounds.max.y) / 2) * this.voxelScale,
            ((bounds.min.z + bounds.max.z) / 2 - AVATAR_DEPTH / 2) * this.voxelScale
        );

        const radius = Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y,
            bounds.max.z - bounds.min.z
        ) * this.voxelScale / 2;

        this.boundingSphere.set(center, radius * 1.5); // 1.5x for safety margin
    }

    /**
     * Check if avatar is visible in camera frustum
     */
    isInFrustum(camera) {
        if (!this.frustumCulled) return true;

        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);

        // Transform bounding sphere to world space
        const worldCenter = this.boundingSphere.center.clone();
        this.rootGroup.localToWorld(worldCenter);
        const worldSphere = new THREE.Sphere(worldCenter, this.boundingSphere.radius);

        return frustum.intersectsSphere(worldSphere);
    }

    /**
     * Set render mode
     */
    setRenderMode(mode) {
        if (this.renderMode !== mode) {
            this.renderMode = mode;
            this.rebuildMeshes();
        }
    }

    /**
     * Set avatar world position
     */
    setPosition(x, y, z) {
        this.rootGroup.position.set(x, y, z);
    }

    /**
     * Set avatar rotation
     */
    setRotation(x, y, z) {
        this.rootGroup.rotation.set(x, y, z);
    }

    /**
     * Set avatar scale
     */
    setScale(scale) {
        this.rootGroup.scale.setScalar(scale);
    }

    /**
     * Show/hide avatar
     */
    setVisible(visible) {
        this.isVisible = visible;
        this.rootGroup.visible = visible;
    }

    /**
     * Update a single voxel (for editor use)
     */
    updateVoxel(x, y, z, paletteIndex) {
        // For now, trigger full rebuild
        // TODO: Implement incremental update for better editor performance
        this.rebuildMeshes();
    }

    /**
     * Update palette color (triggers material update)
     */
    updatePaletteColor(index, color) {
        this.materialManager.updateColor(index, color);
    }

    /**
     * Get current render stats
     */
    updateStats() {
        this.stats.drawCalls = 0;
        this.stats.triangles = 0;

        this.rootGroup.traverse((object) => {
            if (object instanceof THREE.Mesh && object.visible) {
                this.stats.drawCalls++;
                if (object.geometry) {
                    const index = object.geometry.index;
                    if (index) {
                        this.stats.triangles += index.count / 3;
                    } else if (object.geometry.attributes.position) {
                        this.stats.triangles += object.geometry.attributes.position.count / 3;
                    }
                }
            }
        });

        return this.stats;
    }

    /**
     * Get the Three.js object for adding to scene
     */
    getObject3D() {
        return this.rootGroup;
    }

    /**
     * Get current LOD level
     */
    getCurrentLOD() {
        return this.currentLOD;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Dispose cube renderer resources
        this.cubeRenderer.dispose();

        // Dispose smooth renderer resources
        this.smoothRenderer.dispose();

        // Dispose materials
        this.materialManager.dispose();

        // Clear bone groups
        for (const group of this.boneGroups.values()) {
            group.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
            });
        }
        this.boneGroups.clear();

        // Clear root group
        while (this.rootGroup.children.length > 0) {
            this.rootGroup.remove(this.rootGroup.children[0]);
        }
    }
}

export default VoxelAvatarRenderer;
