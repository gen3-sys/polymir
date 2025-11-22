/**
 * SpringBoneEditor - Physics region marking and configuration
 *
 * Allows users to mark voxels as physics-enabled (hair, cape, tail, etc.)
 * and configure spring bone parameters for each region.
 *
 * Features:
 * - Paint mode for physics regions
 * - Chain visualization
 * - Parameter sliders per region
 * - Real-time physics preview
 * - Presets (hair, cape, tail, ears)
 */

import * as THREE from 'three';
import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';
import { SPRING_BONE_PRESETS, SpringBoneConfig } from '../rig/SpringBoneConfig.js';

// Physics region types
export const PHYSICS_REGION_TYPE = {
    HAIR: 'hair',
    LONG_HAIR: 'longHair',
    CAPE: 'cape',
    TAIL: 'tail',
    EARS: 'ears',
    RIBBON: 'ribbon',
    SKIRT: 'skirt',
    CUSTOM: 'custom'
};

// Region colors for visualization
const REGION_COLORS = {
    [PHYSICS_REGION_TYPE.HAIR]: 0xff6b6b,
    [PHYSICS_REGION_TYPE.LONG_HAIR]: 0xff4757,
    [PHYSICS_REGION_TYPE.CAPE]: 0x5f27cd,
    [PHYSICS_REGION_TYPE.TAIL]: 0x1dd1a1,
    [PHYSICS_REGION_TYPE.EARS]: 0xfeca57,
    [PHYSICS_REGION_TYPE.RIBBON]: 0xff9ff3,
    [PHYSICS_REGION_TYPE.SKIRT]: 0x54a0ff,
    [PHYSICS_REGION_TYPE.CUSTOM]: 0x576574
};

export class SpringBoneEditor {
    constructor(options = {}) {
        // References
        this.avatarData = null;
        this.springBoneConfig = null;

        // Current editing state
        this.currentRegion = null;
        this.isEditing = false;
        this.paintMode = 'add'; // 'add' or 'remove'

        // Regions being edited
        this.regions = new Map(); // regionId → { name, type, voxelKeys, params }

        // Visualization
        this.scene = null;
        this.regionMeshes = new Map(); // regionId → THREE.Mesh
        this.chainVisualization = null;

        // UI state
        this.selectedVoxels = new Set();
        this.highlightedChain = null;

        // Options
        this.showChains = options.showChains !== false;
        this.showRegionOverlay = options.showRegionOverlay !== false;
        this.overlayOpacity = options.overlayOpacity || 0.5;

        // Callbacks
        this.onRegionChange = options.onRegionChange || null;
    }

    /**
     * Initialize with avatar data
     */
    initialize(avatarData, scene = null) {
        this.avatarData = avatarData;
        this.scene = scene;

        // Load existing spring bone regions
        this.loadRegions();

        // Create spring bone config
        this.springBoneConfig = new SpringBoneConfig();
    }

    /**
     * Load existing regions from avatar data
     */
    loadRegions() {
        this.regions.clear();

        if (!this.avatarData) return;

        for (const region of this.avatarData.springBoneRegions) {
            this.regions.set(region.name, {
                name: region.name,
                type: this.inferRegionType(region.name),
                voxelKeys: new Set(region.voxelKeys),
                params: { ...region.params }
            });
        }

        this.updateVisualization();
    }

    /**
     * Infer region type from name
     */
    inferRegionType(name) {
        const lowerName = name.toLowerCase();
        for (const type of Object.values(PHYSICS_REGION_TYPE)) {
            if (lowerName.includes(type.toLowerCase())) {
                return type;
            }
        }
        return PHYSICS_REGION_TYPE.CUSTOM;
    }

    /**
     * Create new physics region
     */
    createRegion(name, type = PHYSICS_REGION_TYPE.CUSTOM) {
        if (this.regions.has(name)) {
            console.warn(`[SpringBoneEditor] Region already exists: ${name}`);
            return false;
        }

        // Get default params from preset
        const preset = SPRING_BONE_PRESETS[type] || SPRING_BONE_PRESETS.custom;

        this.regions.set(name, {
            name,
            type,
            voxelKeys: new Set(),
            params: {
                stiffness: preset.stiffness,
                damping: preset.damping,
                gravityFactor: preset.gravityFactor
            }
        });

        this.selectRegion(name);
        return true;
    }

    /**
     * Delete a region
     */
    deleteRegion(name) {
        if (!this.regions.has(name)) return false;

        // Remove visualization
        this.removeRegionVisualization(name);

        this.regions.delete(name);

        if (this.currentRegion === name) {
            this.currentRegion = null;
        }

        this.saveRegions();
        return true;
    }

    /**
     * Select region for editing
     */
    selectRegion(name) {
        this.currentRegion = name;
        this.updateVisualization();
    }

    /**
     * Start editing mode
     */
    startEditing() {
        if (!this.currentRegion) {
            console.warn('[SpringBoneEditor] No region selected');
            return false;
        }

        this.isEditing = true;
        return true;
    }

    /**
     * Stop editing mode
     */
    stopEditing() {
        this.isEditing = false;
        this.saveRegions();
    }

    /**
     * Set paint mode
     */
    setPaintMode(mode) {
        this.paintMode = mode === 'remove' ? 'remove' : 'add';
    }

    /**
     * Add voxel to current region
     */
    addVoxelToRegion(x, y, z) {
        if (!this.isEditing || !this.currentRegion) return false;

        const region = this.regions.get(this.currentRegion);
        if (!region) return false;

        const key = this.avatarData.encodePosition(x, y, z);

        // Check if voxel exists in avatar
        if (!this.avatarData.hasVoxel(x, y, z)) {
            return false;
        }

        // Remove from other regions (a voxel can only be in one physics region)
        for (const [otherName, otherRegion] of this.regions) {
            if (otherName !== this.currentRegion) {
                otherRegion.voxelKeys.delete(key);
            }
        }

        region.voxelKeys.add(key);
        this.updateVisualization();

        return true;
    }

    /**
     * Remove voxel from current region
     */
    removeVoxelFromRegion(x, y, z) {
        if (!this.isEditing || !this.currentRegion) return false;

        const region = this.regions.get(this.currentRegion);
        if (!region) return false;

        const key = this.avatarData.encodePosition(x, y, z);
        const removed = region.voxelKeys.delete(key);

        if (removed) {
            this.updateVisualization();
        }

        return removed;
    }

    /**
     * Paint voxel based on current mode
     */
    paintVoxel(x, y, z) {
        if (this.paintMode === 'add') {
            return this.addVoxelToRegion(x, y, z);
        } else {
            return this.removeVoxelFromRegion(x, y, z);
        }
    }

    /**
     * Set region parameters
     */
    setRegionParams(regionName, params) {
        const region = this.regions.get(regionName);
        if (!region) return false;

        region.params = {
            ...region.params,
            stiffness: params.stiffness ?? region.params.stiffness,
            damping: params.damping ?? region.params.damping,
            gravityFactor: params.gravityFactor ?? region.params.gravityFactor
        };

        // Clamp values
        region.params.stiffness = Math.max(0, Math.min(1, region.params.stiffness));
        region.params.damping = Math.max(0, Math.min(1, region.params.damping));
        region.params.gravityFactor = Math.max(0, Math.min(2, region.params.gravityFactor));

        if (this.onRegionChange) {
            this.onRegionChange(regionName, region);
        }

        return true;
    }

    /**
     * Apply preset to region
     */
    applyPreset(regionName, presetType) {
        const preset = SPRING_BONE_PRESETS[presetType];
        if (!preset) return false;

        return this.setRegionParams(regionName, {
            stiffness: preset.stiffness,
            damping: preset.damping,
            gravityFactor: preset.gravityFactor
        });
    }

    /**
     * Auto-detect physics regions based on voxel positions
     */
    autoDetectRegions() {
        // Clear existing regions
        this.regions.clear();

        if (!this.avatarData) return;

        // Detect hair (top of head, Y > 60)
        const hairVoxels = new Set();
        this.avatarData.forEach((x, y, z, paletteIndex) => {
            if (y > 60 && x >= 8 && x <= 24) {
                hairVoxels.add(this.avatarData.encodePosition(x, y, z));
            }
        });

        if (hairVoxels.size > 0) {
            this.regions.set('hair', {
                name: 'hair',
                type: PHYSICS_REGION_TYPE.HAIR,
                voxelKeys: hairVoxels,
                params: { ...SPRING_BONE_PRESETS.hair }
            });
        }

        // Detect tail (behind hips, Z < 12, Y 30-40)
        const tailVoxels = new Set();
        this.avatarData.forEach((x, y, z, paletteIndex) => {
            if (z < 12 && y >= 30 && y <= 45 && x >= 12 && x <= 20) {
                tailVoxels.add(this.avatarData.encodePosition(x, y, z));
            }
        });

        if (tailVoxels.size > 0) {
            this.regions.set('tail', {
                name: 'tail',
                type: PHYSICS_REGION_TYPE.TAIL,
                voxelKeys: tailVoxels,
                params: { ...SPRING_BONE_PRESETS.tail }
            });
        }

        // Detect ears (side of head, Y > 58, X < 10 or X > 22)
        const earVoxels = new Set();
        this.avatarData.forEach((x, y, z, paletteIndex) => {
            if (y > 58 && (x < 10 || x > 22)) {
                earVoxels.add(this.avatarData.encodePosition(x, y, z));
            }
        });

        if (earVoxels.size > 0) {
            this.regions.set('ears', {
                name: 'ears',
                type: PHYSICS_REGION_TYPE.EARS,
                voxelKeys: earVoxels,
                params: { ...SPRING_BONE_PRESETS.ears }
            });
        }

        this.updateVisualization();
        this.saveRegions();
    }

    /**
     * Build physics chains from region voxels
     */
    buildChains(regionName) {
        const region = this.regions.get(regionName);
        if (!region) return [];

        const chains = [];
        const visited = new Set();

        // Find chain roots (voxels connected to non-physics voxels)
        for (const key of region.voxelKeys) {
            if (visited.has(key)) continue;

            const pos = this.avatarData.decodePosition(key);

            // Check if this could be a root (has non-physics neighbor)
            const isRoot = this.hasNonPhysicsNeighbor(pos, region.voxelKeys);

            if (isRoot) {
                // Build chain from this root
                const chain = this.traceChain(key, region.voxelKeys, visited);
                if (chain.length > 0) {
                    chains.push(chain);
                }
            }
        }

        return chains;
    }

    /**
     * Check if position has a neighbor not in physics region
     */
    hasNonPhysicsNeighbor(pos, regionKeys) {
        const neighbors = [
            { x: pos.x + 1, y: pos.y, z: pos.z },
            { x: pos.x - 1, y: pos.y, z: pos.z },
            { x: pos.x, y: pos.y + 1, z: pos.z },
            { x: pos.x, y: pos.y - 1, z: pos.z },
            { x: pos.x, y: pos.y, z: pos.z + 1 },
            { x: pos.x, y: pos.y, z: pos.z - 1 }
        ];

        for (const n of neighbors) {
            if (this.avatarData.hasVoxel(n.x, n.y, n.z)) {
                const nKey = this.avatarData.encodePosition(n.x, n.y, n.z);
                if (!regionKeys.has(nKey)) {
                    return true; // Has non-physics neighbor
                }
            }
        }

        return false;
    }

    /**
     * Trace a physics chain from root
     */
    traceChain(startKey, regionKeys, visited) {
        const chain = [];
        let currentKey = startKey;

        while (currentKey && !visited.has(currentKey)) {
            visited.add(currentKey);
            chain.push(currentKey);

            const pos = this.avatarData.decodePosition(currentKey);

            // Find next voxel in chain (prefer downward/outward)
            const neighbors = [
                { x: pos.x, y: pos.y - 1, z: pos.z },     // Down
                { x: pos.x, y: pos.y, z: pos.z - 1 },     // Back
                { x: pos.x - 1, y: pos.y, z: pos.z },     // Left
                { x: pos.x + 1, y: pos.y, z: pos.z },     // Right
                { x: pos.x, y: pos.y, z: pos.z + 1 },     // Forward
                { x: pos.x, y: pos.y + 1, z: pos.z }      // Up (least priority)
            ];

            currentKey = null;
            for (const n of neighbors) {
                const nKey = this.avatarData.encodePosition(n.x, n.y, n.z);
                if (regionKeys.has(nKey) && !visited.has(nKey)) {
                    currentKey = nKey;
                    break;
                }
            }
        }

        return chain;
    }

    /**
     * Update visualization meshes
     */
    updateVisualization() {
        if (!this.scene || !this.showRegionOverlay) return;

        // Clear existing visualizations
        for (const mesh of this.regionMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.regionMeshes.clear();

        // Create visualization for each region
        for (const [name, region] of this.regions) {
            const mesh = this.createRegionMesh(region);
            if (mesh) {
                this.scene.add(mesh);
                this.regionMeshes.set(name, mesh);
            }
        }

        // Update chain visualization
        if (this.showChains && this.currentRegion) {
            this.updateChainVisualization();
        }
    }

    /**
     * Create mesh for region visualization
     */
    createRegionMesh(region) {
        if (region.voxelKeys.size === 0) return null;

        const positions = [];
        const voxelScale = 0.031; // Slightly larger than avatar voxels

        for (const key of region.voxelKeys) {
            const pos = this.avatarData.decodePosition(key);
            const x = (pos.x - AVATAR_WIDTH / 2) * 0.03;
            const y = pos.y * 0.03;
            const z = (pos.z - AVATAR_DEPTH / 2) * 0.03;

            // Add cube vertices
            this.addCubePositions(positions, x, y, z, voxelScale);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const color = REGION_COLORS[region.type] || REGION_COLORS[PHYSICS_REGION_TYPE.CUSTOM];
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: this.overlayOpacity,
            depthWrite: false
        });

        return new THREE.Mesh(geometry, material);
    }

    /**
     * Add cube positions to array
     */
    addCubePositions(positions, x, y, z, size) {
        const s = size * 0.5;
        const vertices = [
            // Front
            x - s, y - s, z + s, x + s, y - s, z + s, x + s, y + s, z + s,
            x - s, y - s, z + s, x + s, y + s, z + s, x - s, y + s, z + s,
            // Back
            x + s, y - s, z - s, x - s, y - s, z - s, x - s, y + s, z - s,
            x + s, y - s, z - s, x - s, y + s, z - s, x + s, y + s, z - s,
            // Top
            x - s, y + s, z - s, x - s, y + s, z + s, x + s, y + s, z + s,
            x - s, y + s, z - s, x + s, y + s, z + s, x + s, y + s, z - s,
            // Bottom
            x - s, y - s, z + s, x - s, y - s, z - s, x + s, y - s, z - s,
            x - s, y - s, z + s, x + s, y - s, z - s, x + s, y - s, z + s,
            // Right
            x + s, y - s, z + s, x + s, y - s, z - s, x + s, y + s, z - s,
            x + s, y - s, z + s, x + s, y + s, z - s, x + s, y + s, z + s,
            // Left
            x - s, y - s, z - s, x - s, y - s, z + s, x - s, y + s, z + s,
            x - s, y - s, z - s, x - s, y + s, z + s, x - s, y + s, z - s
        ];
        positions.push(...vertices);
    }

    /**
     * Update chain visualization
     */
    updateChainVisualization() {
        // Remove existing
        if (this.chainVisualization) {
            this.scene.remove(this.chainVisualization);
            this.chainVisualization.geometry.dispose();
            this.chainVisualization.material.dispose();
        }

        if (!this.currentRegion) return;

        const chains = this.buildChains(this.currentRegion);
        const points = [];

        for (const chain of chains) {
            for (let i = 0; i < chain.length - 1; i++) {
                const pos1 = this.avatarData.decodePosition(chain[i]);
                const pos2 = this.avatarData.decodePosition(chain[i + 1]);

                points.push(
                    new THREE.Vector3(
                        (pos1.x - AVATAR_WIDTH / 2) * 0.03,
                        pos1.y * 0.03,
                        (pos1.z - AVATAR_DEPTH / 2) * 0.03
                    ),
                    new THREE.Vector3(
                        (pos2.x - AVATAR_WIDTH / 2) * 0.03,
                        pos2.y * 0.03,
                        (pos2.z - AVATAR_DEPTH / 2) * 0.03
                    )
                );
            }
        }

        if (points.length > 0) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
            this.chainVisualization = new THREE.LineSegments(geometry, material);
            this.scene.add(this.chainVisualization);
        }
    }

    /**
     * Remove visualization for specific region
     */
    removeRegionVisualization(name) {
        const mesh = this.regionMeshes.get(name);
        if (mesh) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.regionMeshes.delete(name);
        }
    }

    /**
     * Save regions to avatar data
     */
    saveRegions() {
        if (!this.avatarData) return;

        // Clear existing
        this.avatarData.springBoneRegions = [];

        // Add current regions
        for (const [name, region] of this.regions) {
            this.avatarData.addSpringBoneRegion({
                name: region.name,
                voxelKeys: region.voxelKeys,
                params: region.params
            });
        }
    }

    /**
     * Get all regions
     */
    getRegions() {
        return Array.from(this.regions.values());
    }

    /**
     * Get region by name
     */
    getRegion(name) {
        return this.regions.get(name);
    }

    /**
     * Get available presets
     */
    getPresets() {
        return Object.keys(SPRING_BONE_PRESETS);
    }

    /**
     * Get statistics
     */
    getStats() {
        let totalVoxels = 0;
        for (const region of this.regions.values()) {
            totalVoxels += region.voxelKeys.size;
        }

        return {
            regionCount: this.regions.size,
            totalPhysicsVoxels: totalVoxels,
            currentRegion: this.currentRegion,
            isEditing: this.isEditing,
            paintMode: this.paintMode
        };
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.stopEditing();

        for (const mesh of this.regionMeshes.values()) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.regionMeshes.clear();

        if (this.chainVisualization) {
            this.chainVisualization.geometry.dispose();
            this.chainVisualization.material.dispose();
        }

        this.regions.clear();
    }
}

export default SpringBoneEditor;
