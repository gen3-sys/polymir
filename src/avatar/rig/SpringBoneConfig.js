/**
 * SpringBoneConfig - Physics configuration for dynamic avatar parts
 *
 * Spring bones are used for secondary motion like hair, capes, tails,
 * and other accessories that should move dynamically.
 *
 * Each spring bone region is a chain of "virtual bones" that are
 * affected by physics simulation.
 */

import { VRM_BONES } from './VoxelAvatarRig.js';
import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';

// Preset configurations for common spring bone types
export const SPRING_BONE_PRESETS = {
    hair: {
        stiffness: 0.3,
        damping: 0.4,
        gravityFactor: 0.8,
        dragForce: 0.05,
        windInfluence: 0.7
    },
    longHair: {
        stiffness: 0.2,
        damping: 0.3,
        gravityFactor: 1.0,
        dragForce: 0.03,
        windInfluence: 0.8
    },
    cape: {
        stiffness: 0.15,
        damping: 0.5,
        gravityFactor: 1.2,
        dragForce: 0.08,
        windInfluence: 1.0
    },
    tail: {
        stiffness: 0.4,
        damping: 0.35,
        gravityFactor: 0.6,
        dragForce: 0.04,
        windInfluence: 0.5
    },
    ears: {
        stiffness: 0.6,
        damping: 0.5,
        gravityFactor: 0.3,
        dragForce: 0.02,
        windInfluence: 0.4
    },
    ribbon: {
        stiffness: 0.1,
        damping: 0.2,
        gravityFactor: 0.5,
        dragForce: 0.02,
        windInfluence: 0.9
    },
    skirt: {
        stiffness: 0.25,
        damping: 0.45,
        gravityFactor: 1.0,
        dragForce: 0.06,
        windInfluence: 0.6
    }
};

// Default attachment points for common spring bone types
export const DEFAULT_ATTACHMENT_POINTS = {
    hair: { bone: VRM_BONES.HEAD, offsetY: 4 },
    backHair: { bone: VRM_BONES.HEAD, offsetY: 0, offsetZ: -4 },
    tail: { bone: VRM_BONES.HIPS, offsetY: -2, offsetZ: -4 },
    cape: { bone: VRM_BONES.CHEST, offsetY: 4, offsetZ: -4 },
    leftEar: { bone: VRM_BONES.HEAD, offsetX: -6, offsetY: 4 },
    rightEar: { bone: VRM_BONES.HEAD, offsetX: 6, offsetY: 4 }
};

export class SpringBoneConfig {
    constructor() {
        // Collection of spring bone regions
        this.regions = [];

        // Global physics settings
        this.globalSettings = {
            gravity: { x: 0, y: -9.8, z: 0 },
            wind: { x: 0, y: 0, z: 0 },
            timeStep: 1 / 60,
            iterations: 3
        };
    }

    /**
     * Create a spring bone region from marked voxels
     * @param {string} name - Region name
     * @param {Set<number>} voxelKeys - Set of encoded voxel positions
     * @param {Object} params - Physics parameters
     * @param {string} attachmentBone - Bone this region attaches to
     */
    createRegion(name, voxelKeys, params = {}, attachmentBone = VRM_BONES.HEAD) {
        const preset = params.preset ? SPRING_BONE_PRESETS[params.preset] : {};

        const region = {
            name,
            voxelKeys: new Set(voxelKeys),
            attachmentBone,
            params: {
                stiffness: params.stiffness ?? preset.stiffness ?? 0.3,
                damping: params.damping ?? preset.damping ?? 0.4,
                gravityFactor: params.gravityFactor ?? preset.gravityFactor ?? 1.0,
                dragForce: params.dragForce ?? preset.dragForce ?? 0.05,
                windInfluence: params.windInfluence ?? preset.windInfluence ?? 0.5
            },
            // Runtime state (computed)
            chain: null,
            bounds: null
        };

        // Compute chain and bounds
        region.chain = this.buildChain(region, null);
        region.bounds = this.computeBounds(voxelKeys);

        this.regions.push(region);
        return region;
    }

    /**
     * Create a spring bone region from a preset type
     */
    createFromPreset(name, presetType, voxelKeys, attachmentBone = null) {
        const preset = SPRING_BONE_PRESETS[presetType];
        if (!preset) {
            console.warn(`[SpringBoneConfig] Unknown preset: ${presetType}`);
            return null;
        }

        const attachment = attachmentBone || DEFAULT_ATTACHMENT_POINTS[presetType]?.bone || VRM_BONES.HEAD;

        return this.createRegion(name, voxelKeys, preset, attachment);
    }

    /**
     * Build a spring bone chain from voxel positions
     * Chain goes from attachment point outward
     */
    buildChain(region, avatarData) {
        const voxels = Array.from(region.voxelKeys);
        if (voxels.length === 0) return [];

        // Decode positions
        const positions = voxels.map(key => {
            // Decode using standard formula
            const x = key % AVATAR_WIDTH;
            const y = Math.floor(key / AVATAR_WIDTH) % AVATAR_HEIGHT;
            const z = Math.floor(key / (AVATAR_WIDTH * AVATAR_HEIGHT));
            return { x, y, z, key };
        });

        // Sort by distance from attachment point (head top for hair, etc.)
        // For simplicity, sort by Y descending (top to bottom for hair)
        positions.sort((a, b) => b.y - a.y);

        // Group into chain segments
        // Each segment is a row of voxels at similar Y level
        const chain = [];
        let currentSegment = [];
        let lastY = positions[0]?.y ?? 0;

        for (const pos of positions) {
            if (Math.abs(pos.y - lastY) > 2) {
                // New segment
                if (currentSegment.length > 0) {
                    chain.push(this.createChainNode(currentSegment));
                }
                currentSegment = [pos];
                lastY = pos.y;
            } else {
                currentSegment.push(pos);
            }
        }

        // Don't forget last segment
        if (currentSegment.length > 0) {
            chain.push(this.createChainNode(currentSegment));
        }

        return chain;
    }

    /**
     * Create a chain node from a group of voxels
     */
    createChainNode(voxels) {
        // Calculate centroid
        let sumX = 0, sumY = 0, sumZ = 0;
        for (const v of voxels) {
            sumX += v.x;
            sumY += v.y;
            sumZ += v.z;
        }

        const centroid = {
            x: sumX / voxels.length,
            y: sumY / voxels.length,
            z: sumZ / voxels.length
        };

        return {
            position: centroid,
            voxelKeys: voxels.map(v => v.key),
            // Runtime physics state
            velocity: { x: 0, y: 0, z: 0 },
            prevPosition: { ...centroid },
            restPosition: { ...centroid }
        };
    }

    /**
     * Compute bounding box for a set of voxel keys
     */
    computeBounds(voxelKeys) {
        let minX = AVATAR_WIDTH, minY = AVATAR_HEIGHT, minZ = AVATAR_DEPTH;
        let maxX = 0, maxY = 0, maxZ = 0;

        for (const key of voxelKeys) {
            const x = key % AVATAR_WIDTH;
            const y = Math.floor(key / AVATAR_WIDTH) % AVATAR_HEIGHT;
            const z = Math.floor(key / (AVATAR_WIDTH * AVATAR_HEIGHT));

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        }

        return {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ }
        };
    }

    /**
     * Get region by name
     */
    getRegion(name) {
        return this.regions.find(r => r.name === name) || null;
    }

    /**
     * Remove a region
     */
    removeRegion(name) {
        const index = this.regions.findIndex(r => r.name === name);
        if (index >= 0) {
            this.regions.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Check if a voxel is in any spring bone region
     */
    isVoxelInSpringRegion(x, y, z) {
        const key = x + (y * AVATAR_WIDTH) + (z * AVATAR_WIDTH * AVATAR_HEIGHT);

        for (const region of this.regions) {
            if (region.voxelKeys.has(key)) {
                return region.name;
            }
        }

        return null;
    }

    /**
     * Update spring bone physics (called each frame)
     * @param {number} deltaTime - Time since last update
     * @param {Object} parentTransforms - Current bone world transforms
     */
    update(deltaTime, parentTransforms = {}) {
        const dt = Math.min(deltaTime, this.globalSettings.timeStep * 3); // Cap delta time

        for (const region of this.regions) {
            this.updateRegion(region, dt, parentTransforms);
        }
    }

    /**
     * Update a single spring bone region
     */
    updateRegion(region, deltaTime, parentTransforms) {
        if (!region.chain || region.chain.length === 0) return;

        const params = region.params;
        const gravity = this.globalSettings.gravity;
        const wind = this.globalSettings.wind;

        // Get parent bone transform
        const parentBone = parentTransforms[region.attachmentBone];
        const parentPos = parentBone?.worldPosition || { x: 16, y: 58, z: 16 };

        // Update each chain node
        for (let i = 0; i < region.chain.length; i++) {
            const node = region.chain[i];
            const isRoot = i === 0;

            if (isRoot) {
                // Root follows parent bone
                const offsetX = node.restPosition.x - 16; // Offset from center
                const offsetY = node.restPosition.y - 58; // Offset from head
                const offsetZ = node.restPosition.z - 16;

                node.position = {
                    x: parentPos.x + offsetX,
                    y: parentPos.y + offsetY,
                    z: parentPos.z + offsetZ
                };
            } else {
                // Physics-driven nodes
                const prevNode = region.chain[i - 1];

                // Verlet integration
                const velX = (node.position.x - node.prevPosition.x) * (1 - params.damping);
                const velY = (node.position.y - node.prevPosition.y) * (1 - params.damping);
                const velZ = (node.position.z - node.prevPosition.z) * (1 - params.damping);

                node.prevPosition = { ...node.position };

                // Apply forces
                const forceX = gravity.x * params.gravityFactor + wind.x * params.windInfluence;
                const forceY = gravity.y * params.gravityFactor + wind.y * params.windInfluence;
                const forceZ = gravity.z * params.gravityFactor + wind.z * params.windInfluence;

                node.position.x += velX + forceX * deltaTime * deltaTime;
                node.position.y += velY + forceY * deltaTime * deltaTime;
                node.position.z += velZ + forceZ * deltaTime * deltaTime;

                // Constraint: maintain distance to parent node
                const targetDistance = this.distanceBetween(node.restPosition, prevNode.restPosition);
                const currentDistance = this.distanceBetween(node.position, prevNode.position);

                if (currentDistance > 0.001) {
                    const correction = (currentDistance - targetDistance) / currentDistance;
                    const stiffnessCorrection = correction * params.stiffness;

                    node.position.x -= (node.position.x - prevNode.position.x) * stiffnessCorrection;
                    node.position.y -= (node.position.y - prevNode.position.y) * stiffnessCorrection;
                    node.position.z -= (node.position.z - prevNode.position.z) * stiffnessCorrection;
                }
            }
        }
    }

    /**
     * Calculate distance between two points
     */
    distanceBetween(a, b) {
        return Math.sqrt(
            Math.pow(b.x - a.x, 2) +
            Math.pow(b.y - a.y, 2) +
            Math.pow(b.z - a.z, 2)
        );
    }

    /**
     * Reset all spring bones to rest position
     */
    reset() {
        for (const region of this.regions) {
            if (!region.chain) continue;

            for (const node of region.chain) {
                node.position = { ...node.restPosition };
                node.prevPosition = { ...node.restPosition };
                node.velocity = { x: 0, y: 0, z: 0 };
            }
        }
    }

    /**
     * Set wind force
     */
    setWind(x, y, z) {
        this.globalSettings.wind = { x, y, z };
    }

    /**
     * Get transformed position for a voxel in a spring bone region
     * @returns {{ x, y, z } | null} Transformed position or null if not in spring region
     */
    getTransformedPosition(voxelKey, originalPosition) {
        for (const region of this.regions) {
            if (!region.voxelKeys.has(voxelKey)) continue;
            if (!region.chain || region.chain.length === 0) continue;

            // Find which chain node this voxel belongs to
            for (const node of region.chain) {
                if (node.voxelKeys.includes(voxelKey)) {
                    // Calculate offset from node rest position
                    const offsetX = originalPosition.x - node.restPosition.x;
                    const offsetY = originalPosition.y - node.restPosition.y;
                    const offsetZ = originalPosition.z - node.restPosition.z;

                    // Apply to current node position
                    return {
                        x: node.position.x + offsetX,
                        y: node.position.y + offsetY,
                        z: node.position.z + offsetZ
                    };
                }
            }
        }

        return null;
    }

    /**
     * Serialize configuration
     */
    serialize() {
        return {
            globalSettings: { ...this.globalSettings },
            regions: this.regions.map(region => ({
                name: region.name,
                voxelKeys: Array.from(region.voxelKeys),
                attachmentBone: region.attachmentBone,
                params: { ...region.params }
            }))
        };
    }

    /**
     * Deserialize configuration
     */
    static deserialize(data) {
        const config = new SpringBoneConfig();

        if (data.globalSettings) {
            config.globalSettings = { ...config.globalSettings, ...data.globalSettings };
        }

        for (const regionData of (data.regions || [])) {
            config.createRegion(
                regionData.name,
                new Set(regionData.voxelKeys),
                regionData.params,
                regionData.attachmentBone
            );
        }

        return config;
    }
}

export default SpringBoneConfig;
