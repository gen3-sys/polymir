/**
 * WeightCalculator - Calculates bone weights for smooth deformation at joints
 *
 * Voxels near bone boundaries receive weights from multiple bones,
 * allowing smooth deformation during animation.
 *
 * Weight calculation uses linear interpolation based on distance
 * from region boundaries.
 */

import { VRM_BONES, BONE_HIERARCHY, DEFAULT_REST_POSITIONS } from './VoxelAvatarRig.js';

// Default blend distance (voxels)
const DEFAULT_BLEND_DISTANCE = 3;

// Bones that should blend at their boundaries
const BLENDABLE_JOINTS = [
    // Spine chain
    { from: VRM_BONES.HIPS, to: VRM_BONES.SPINE },
    { from: VRM_BONES.SPINE, to: VRM_BONES.CHEST },
    { from: VRM_BONES.CHEST, to: VRM_BONES.NECK },
    { from: VRM_BONES.NECK, to: VRM_BONES.HEAD },

    // Left arm chain
    { from: VRM_BONES.CHEST, to: VRM_BONES.LEFT_SHOULDER },
    { from: VRM_BONES.LEFT_SHOULDER, to: VRM_BONES.LEFT_UPPER_ARM },
    { from: VRM_BONES.LEFT_UPPER_ARM, to: VRM_BONES.LEFT_LOWER_ARM },
    { from: VRM_BONES.LEFT_LOWER_ARM, to: VRM_BONES.LEFT_HAND },

    // Right arm chain
    { from: VRM_BONES.CHEST, to: VRM_BONES.RIGHT_SHOULDER },
    { from: VRM_BONES.RIGHT_SHOULDER, to: VRM_BONES.RIGHT_UPPER_ARM },
    { from: VRM_BONES.RIGHT_UPPER_ARM, to: VRM_BONES.RIGHT_LOWER_ARM },
    { from: VRM_BONES.RIGHT_LOWER_ARM, to: VRM_BONES.RIGHT_HAND },

    // Left leg chain
    { from: VRM_BONES.HIPS, to: VRM_BONES.LEFT_UPPER_LEG },
    { from: VRM_BONES.LEFT_UPPER_LEG, to: VRM_BONES.LEFT_LOWER_LEG },
    { from: VRM_BONES.LEFT_LOWER_LEG, to: VRM_BONES.LEFT_FOOT },
    { from: VRM_BONES.LEFT_FOOT, to: VRM_BONES.LEFT_TOES },

    // Right leg chain
    { from: VRM_BONES.HIPS, to: VRM_BONES.RIGHT_UPPER_LEG },
    { from: VRM_BONES.RIGHT_UPPER_LEG, to: VRM_BONES.RIGHT_LOWER_LEG },
    { from: VRM_BONES.RIGHT_LOWER_LEG, to: VRM_BONES.RIGHT_FOOT },
    { from: VRM_BONES.RIGHT_FOOT, to: VRM_BONES.RIGHT_TOES }
];

export class WeightCalculator {
    constructor(config = {}) {
        this.blendDistance = config.blendDistance || DEFAULT_BLEND_DISTANCE;
        this.minWeight = config.minWeight || 0.01; // Weights below this are ignored
        this.maxBones = config.maxBones || 4; // Maximum bones per voxel

        // Build joint lookup for quick access
        this.jointLookup = this.buildJointLookup();
    }

    /**
     * Build a lookup map for joints between bones
     */
    buildJointLookup() {
        const lookup = new Map();

        for (const joint of BLENDABLE_JOINTS) {
            // Add both directions
            if (!lookup.has(joint.from)) {
                lookup.set(joint.from, new Set());
            }
            lookup.get(joint.from).add(joint.to);

            if (!lookup.has(joint.to)) {
                lookup.set(joint.to, new Set());
            }
            lookup.get(joint.to).add(joint.from);
        }

        return lookup;
    }

    /**
     * Calculate bone weights for a voxel
     * @param {number} x - Voxel X coordinate
     * @param {number} y - Voxel Y coordinate
     * @param {number} z - Voxel Z coordinate
     * @param {string} primaryBone - Primary bone from region mapper
     * @param {VoxelAvatarRig} rig - The avatar rig
     * @returns {Array<{bone: string, weight: number}>} Array of bone weights
     */
    calculateWeights(x, y, z, primaryBone, rig) {
        const weights = [];
        const position = { x, y, z };

        // Get adjacent bones that can blend with primary
        const adjacentBones = this.jointLookup.get(primaryBone) || new Set();

        // Calculate distance to primary bone's rest position
        const primaryBoneData = rig.getBone(primaryBone);
        if (!primaryBoneData) {
            return [{ bone: primaryBone, weight: 1.0 }];
        }

        // Check distance to each adjacent bone's joint
        const boneWeights = new Map();
        boneWeights.set(primaryBone, 1.0);

        for (const adjacentBone of adjacentBones) {
            const adjacentBoneData = rig.getBone(adjacentBone);
            if (!adjacentBoneData) continue;

            // Calculate distance to the joint between bones
            const jointDistance = this.calculateJointDistance(
                position,
                primaryBoneData,
                adjacentBoneData
            );

            if (jointDistance < this.blendDistance) {
                // Within blend zone - calculate blend weight
                const blendFactor = 1.0 - (jointDistance / this.blendDistance);
                const weight = this.smoothstep(blendFactor);

                if (weight > this.minWeight) {
                    boneWeights.set(adjacentBone, weight);
                    // Reduce primary bone weight
                    boneWeights.set(primaryBone, boneWeights.get(primaryBone) - weight * 0.5);
                }
            }
        }

        // Normalize weights
        let totalWeight = 0;
        for (const weight of boneWeights.values()) {
            totalWeight += Math.max(0, weight);
        }

        if (totalWeight <= 0) {
            return [{ bone: primaryBone, weight: 1.0 }];
        }

        // Convert to array and normalize
        for (const [bone, weight] of boneWeights) {
            const normalizedWeight = Math.max(0, weight) / totalWeight;
            if (normalizedWeight > this.minWeight) {
                weights.push({ bone, weight: normalizedWeight });
            }
        }

        // Sort by weight (highest first)
        weights.sort((a, b) => b.weight - a.weight);

        // Limit to max bones
        if (weights.length > this.maxBones) {
            weights.length = this.maxBones;
            // Renormalize
            const newTotal = weights.reduce((sum, w) => sum + w.weight, 0);
            for (const w of weights) {
                w.weight /= newTotal;
            }
        }

        // If only primary bone with weight 1.0, return simple result
        if (weights.length === 1) {
            return [{ bone: primaryBone, weight: 1.0 }];
        }

        return weights;
    }

    /**
     * Calculate distance from voxel to the joint between two bones
     */
    calculateJointDistance(position, bone1, bone2) {
        // Joint is approximately at the child bone's rest position
        // (where the parent ends and child begins)
        const jointPos = bone2.restPosition;

        return Math.sqrt(
            Math.pow(position.x - jointPos.x, 2) +
            Math.pow(position.y - jointPos.y, 2) +
            Math.pow(position.z - jointPos.z, 2)
        );
    }

    /**
     * Smoothstep interpolation for smoother weight transitions
     */
    smoothstep(t) {
        t = Math.max(0, Math.min(1, t));
        return t * t * (3 - 2 * t);
    }

    /**
     * Calculate weights using distance-based falloff
     * Alternative method that uses distance from bone axis
     */
    calculateWeightsAxisBased(x, y, z, primaryBone, rig) {
        const weights = [];
        const position = { x, y, z };

        // Get all potentially influencing bones
        const influencingBones = this.getInfluencingBones(primaryBone);

        for (const boneName of influencingBones) {
            const bone = rig.getBone(boneName);
            if (!bone) continue;

            // Calculate distance from bone axis
            const distance = this.distanceToLineSegment(
                position,
                bone.restPosition,
                this.getBoneEndPosition(bone, rig)
            );

            // Calculate weight based on distance
            if (distance < this.blendDistance * 2) {
                const weight = Math.max(0, 1.0 - (distance / (this.blendDistance * 2)));
                if (weight > this.minWeight) {
                    weights.push({ bone: boneName, weight });
                }
            }
        }

        // Normalize weights
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        if (totalWeight > 0) {
            for (const w of weights) {
                w.weight /= totalWeight;
            }
        }

        // Sort and limit
        weights.sort((a, b) => b.weight - a.weight);
        if (weights.length > this.maxBones) {
            weights.length = this.maxBones;
            // Renormalize
            const newTotal = weights.reduce((sum, w) => sum + w.weight, 0);
            for (const w of weights) {
                w.weight /= newTotal;
            }
        }

        return weights.length > 0 ? weights : [{ bone: primaryBone, weight: 1.0 }];
    }

    /**
     * Get the end position of a bone (start of first child)
     */
    getBoneEndPosition(bone, rig) {
        if (bone.children.length > 0) {
            const childBone = rig.getBone(bone.children[0]);
            if (childBone) {
                return childBone.restPosition;
            }
        }

        // Estimate end position based on bone direction
        // For now, just offset in the local Y direction
        return {
            x: bone.restPosition.x,
            y: bone.restPosition.y + bone.length,
            z: bone.restPosition.z
        };
    }

    /**
     * Get all bones that could influence a voxel near a given primary bone
     */
    getInfluencingBones(primaryBone) {
        const bones = new Set([primaryBone]);

        // Add parent
        const hierarchy = BONE_HIERARCHY[primaryBone];
        if (hierarchy && hierarchy.parent) {
            bones.add(hierarchy.parent);
        }

        // Add children
        if (hierarchy && hierarchy.children) {
            for (const child of hierarchy.children) {
                bones.add(child);
            }
        }

        // Add adjacent bones from joint lookup
        const adjacent = this.jointLookup.get(primaryBone);
        if (adjacent) {
            for (const bone of adjacent) {
                bones.add(bone);
            }
        }

        return Array.from(bones);
    }

    /**
     * Calculate distance from point to line segment
     */
    distanceToLineSegment(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const dz = lineEnd.z - lineStart.z;

        const lengthSquared = dx * dx + dy * dy + dz * dz;

        if (lengthSquared === 0) {
            // Line segment is a point
            return Math.sqrt(
                Math.pow(point.x - lineStart.x, 2) +
                Math.pow(point.y - lineStart.y, 2) +
                Math.pow(point.z - lineStart.z, 2)
            );
        }

        // Calculate projection parameter
        let t = (
            (point.x - lineStart.x) * dx +
            (point.y - lineStart.y) * dy +
            (point.z - lineStart.z) * dz
        ) / lengthSquared;

        // Clamp to segment
        t = Math.max(0, Math.min(1, t));

        // Calculate closest point on segment
        const closestX = lineStart.x + t * dx;
        const closestY = lineStart.y + t * dy;
        const closestZ = lineStart.z + t * dz;

        // Return distance
        return Math.sqrt(
            Math.pow(point.x - closestX, 2) +
            Math.pow(point.y - closestY, 2) +
            Math.pow(point.z - closestZ, 2)
        );
    }

    /**
     * Pre-calculate weights for all voxels in an avatar (for performance)
     * @param {VoxelAvatarData} avatarData
     * @param {VoxelAvatarRig} rig
     * @returns {Map} encodedPosition → weights array
     */
    preCalculateAllWeights(avatarData, rig) {
        const allWeights = new Map();

        avatarData.forEach((x, y, z, paletteIndex) => {
            const key = avatarData.encodePosition(x, y, z);
            const primaryBone = rig.regionMapper.getBoneForVoxel(x, y, z);
            const weights = this.calculateWeights(x, y, z, primaryBone, rig);
            allWeights.set(key, weights);
        });

        return allWeights;
    }

    /**
     * Serialize configuration
     */
    serialize() {
        return {
            blendDistance: this.blendDistance,
            minWeight: this.minWeight,
            maxBones: this.maxBones
        };
    }

    /**
     * Deserialize configuration
     */
    static deserialize(data) {
        return new WeightCalculator(data);
    }
}

export default WeightCalculator;
