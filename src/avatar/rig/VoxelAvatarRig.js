/**
 * VoxelAvatarRig - VRM-compatible bone hierarchy for voxel avatars
 *
 * Defines a 21-bone humanoid skeleton that maps to VRM humanoid specification.
 * Each bone has a rest position, rotation, and parent reference.
 *
 * Bone positions are defined relative to the avatar voxel grid (32x64x32).
 * Y=0 is feet level, Y=64 is top of head.
 */

import { BoneRegionMapper } from './BoneRegionMapper.js';
import { WeightCalculator } from './WeightCalculator.js';
import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';

// VRM Humanoid bone names (subset for voxel avatars)
export const VRM_BONES = {
    // Core
    HIPS: 'hips',
    SPINE: 'spine',
    CHEST: 'chest',
    NECK: 'neck',
    HEAD: 'head',

    // Left arm
    LEFT_SHOULDER: 'leftShoulder',
    LEFT_UPPER_ARM: 'leftUpperArm',
    LEFT_LOWER_ARM: 'leftLowerArm',
    LEFT_HAND: 'leftHand',

    // Right arm
    RIGHT_SHOULDER: 'rightShoulder',
    RIGHT_UPPER_ARM: 'rightUpperArm',
    RIGHT_LOWER_ARM: 'rightLowerArm',
    RIGHT_HAND: 'rightHand',

    // Left leg
    LEFT_UPPER_LEG: 'leftUpperLeg',
    LEFT_LOWER_LEG: 'leftLowerLeg',
    LEFT_FOOT: 'leftFoot',
    LEFT_TOES: 'leftToes',

    // Right leg
    RIGHT_UPPER_LEG: 'rightUpperLeg',
    RIGHT_LOWER_LEG: 'rightLowerLeg',
    RIGHT_FOOT: 'rightFoot',
    RIGHT_TOES: 'rightToes'
};

// Bone hierarchy definition
export const BONE_HIERARCHY = {
    [VRM_BONES.HIPS]: {
        parent: null,
        children: [VRM_BONES.SPINE, VRM_BONES.LEFT_UPPER_LEG, VRM_BONES.RIGHT_UPPER_LEG]
    },
    [VRM_BONES.SPINE]: {
        parent: VRM_BONES.HIPS,
        children: [VRM_BONES.CHEST]
    },
    [VRM_BONES.CHEST]: {
        parent: VRM_BONES.SPINE,
        children: [VRM_BONES.NECK, VRM_BONES.LEFT_SHOULDER, VRM_BONES.RIGHT_SHOULDER]
    },
    [VRM_BONES.NECK]: {
        parent: VRM_BONES.CHEST,
        children: [VRM_BONES.HEAD]
    },
    [VRM_BONES.HEAD]: {
        parent: VRM_BONES.NECK,
        children: []
    },

    // Left arm chain
    [VRM_BONES.LEFT_SHOULDER]: {
        parent: VRM_BONES.CHEST,
        children: [VRM_BONES.LEFT_UPPER_ARM]
    },
    [VRM_BONES.LEFT_UPPER_ARM]: {
        parent: VRM_BONES.LEFT_SHOULDER,
        children: [VRM_BONES.LEFT_LOWER_ARM]
    },
    [VRM_BONES.LEFT_LOWER_ARM]: {
        parent: VRM_BONES.LEFT_UPPER_ARM,
        children: [VRM_BONES.LEFT_HAND]
    },
    [VRM_BONES.LEFT_HAND]: {
        parent: VRM_BONES.LEFT_LOWER_ARM,
        children: []
    },

    // Right arm chain
    [VRM_BONES.RIGHT_SHOULDER]: {
        parent: VRM_BONES.CHEST,
        children: [VRM_BONES.RIGHT_UPPER_ARM]
    },
    [VRM_BONES.RIGHT_UPPER_ARM]: {
        parent: VRM_BONES.RIGHT_SHOULDER,
        children: [VRM_BONES.RIGHT_LOWER_ARM]
    },
    [VRM_BONES.RIGHT_LOWER_ARM]: {
        parent: VRM_BONES.RIGHT_UPPER_ARM,
        children: [VRM_BONES.RIGHT_HAND]
    },
    [VRM_BONES.RIGHT_HAND]: {
        parent: VRM_BONES.RIGHT_LOWER_ARM,
        children: []
    },

    // Left leg chain
    [VRM_BONES.LEFT_UPPER_LEG]: {
        parent: VRM_BONES.HIPS,
        children: [VRM_BONES.LEFT_LOWER_LEG]
    },
    [VRM_BONES.LEFT_LOWER_LEG]: {
        parent: VRM_BONES.LEFT_UPPER_LEG,
        children: [VRM_BONES.LEFT_FOOT]
    },
    [VRM_BONES.LEFT_FOOT]: {
        parent: VRM_BONES.LEFT_LOWER_LEG,
        children: [VRM_BONES.LEFT_TOES]
    },
    [VRM_BONES.LEFT_TOES]: {
        parent: VRM_BONES.LEFT_FOOT,
        children: []
    },

    // Right leg chain
    [VRM_BONES.RIGHT_UPPER_LEG]: {
        parent: VRM_BONES.HIPS,
        children: [VRM_BONES.RIGHT_LOWER_LEG]
    },
    [VRM_BONES.RIGHT_LOWER_LEG]: {
        parent: VRM_BONES.RIGHT_UPPER_LEG,
        children: [VRM_BONES.RIGHT_FOOT]
    },
    [VRM_BONES.RIGHT_FOOT]: {
        parent: VRM_BONES.RIGHT_LOWER_LEG,
        children: [VRM_BONES.RIGHT_TOES]
    },
    [VRM_BONES.RIGHT_TOES]: {
        parent: VRM_BONES.RIGHT_FOOT,
        children: []
    }
};

/**
 * Default rest pose positions (in voxel grid coordinates)
 * These define where each bone joint is located in T-pose
 */
export const DEFAULT_REST_POSITIONS = {
    [VRM_BONES.HIPS]: { x: 16, y: 34, z: 16 },
    [VRM_BONES.SPINE]: { x: 16, y: 40, z: 16 },
    [VRM_BONES.CHEST]: { x: 16, y: 48, z: 16 },
    [VRM_BONES.NECK]: { x: 16, y: 54, z: 16 },
    [VRM_BONES.HEAD]: { x: 16, y: 58, z: 16 },

    [VRM_BONES.LEFT_SHOULDER]: { x: 22, y: 52, z: 16 },
    [VRM_BONES.LEFT_UPPER_ARM]: { x: 26, y: 52, z: 16 },
    [VRM_BONES.LEFT_LOWER_ARM]: { x: 30, y: 52, z: 16 },
    [VRM_BONES.LEFT_HAND]: { x: 32, y: 52, z: 16 },

    [VRM_BONES.RIGHT_SHOULDER]: { x: 10, y: 52, z: 16 },
    [VRM_BONES.RIGHT_UPPER_ARM]: { x: 6, y: 52, z: 16 },
    [VRM_BONES.RIGHT_LOWER_ARM]: { x: 2, y: 52, z: 16 },
    [VRM_BONES.RIGHT_HAND]: { x: 0, y: 52, z: 16 },

    [VRM_BONES.LEFT_UPPER_LEG]: { x: 20, y: 32, z: 16 },
    [VRM_BONES.LEFT_LOWER_LEG]: { x: 20, y: 18, z: 16 },
    [VRM_BONES.LEFT_FOOT]: { x: 20, y: 4, z: 16 },
    [VRM_BONES.LEFT_TOES]: { x: 20, y: 0, z: 20 },

    [VRM_BONES.RIGHT_UPPER_LEG]: { x: 12, y: 32, z: 16 },
    [VRM_BONES.RIGHT_LOWER_LEG]: { x: 12, y: 18, z: 16 },
    [VRM_BONES.RIGHT_FOOT]: { x: 12, y: 4, z: 16 },
    [VRM_BONES.RIGHT_TOES]: { x: 12, y: 0, z: 20 }
};

export class VoxelAvatarRig {
    constructor(avatarData = null) {
        this.avatarData = avatarData;

        // Bone data storage
        this.bones = new Map();

        // Region mapper for voxel-to-bone assignment
        this.regionMapper = new BoneRegionMapper();

        // Weight calculator for smooth deformation
        this.weightCalculator = new WeightCalculator();

        // Voxel-to-bone assignments (computed)
        this.voxelBoneAssignments = new Map(); // encodedPos → { bone, weight } or [{ bone, weight }, ...]

        // Initialize bones
        this.initializeBones();

        // If avatar data provided, compute assignments
        if (avatarData) {
            this.computeBoneAssignments();
        }
    }

    /**
     * Initialize bone hierarchy with rest pose
     */
    initializeBones() {
        for (const [boneName, hierarchy] of Object.entries(BONE_HIERARCHY)) {
            const restPosition = DEFAULT_REST_POSITIONS[boneName] || { x: 16, y: 32, z: 16 };

            this.bones.set(boneName, {
                name: boneName,
                parent: hierarchy.parent,
                children: [...hierarchy.children],

                // Rest pose (T-pose)
                restPosition: { ...restPosition },
                restRotation: { x: 0, y: 0, z: 0, w: 1 }, // Quaternion (identity)

                // Current pose (animated)
                position: { ...restPosition },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 },

                // World transform (computed)
                worldPosition: { ...restPosition },
                worldRotation: { x: 0, y: 0, z: 0, w: 1 },

                // Bone length (distance to first child, computed)
                length: 0
            });
        }

        // Compute bone lengths
        this.computeBoneLengths();
    }

    /**
     * Compute bone lengths based on distance to child bones
     */
    computeBoneLengths() {
        for (const [boneName, bone] of this.bones) {
            if (bone.children.length > 0) {
                // Use first child to determine length
                const childBone = this.bones.get(bone.children[0]);
                if (childBone) {
                    bone.length = this.distance(bone.restPosition, childBone.restPosition);
                }
            } else {
                // Leaf bones get a default length
                bone.length = 4; // 4 voxels
            }
        }
    }

    /**
     * Euclidean distance between two points
     */
    distance(a, b) {
        return Math.sqrt(
            Math.pow(b.x - a.x, 2) +
            Math.pow(b.y - a.y, 2) +
            Math.pow(b.z - a.z, 2)
        );
    }

    // =========================================================================
    // Bone Access
    // =========================================================================

    /**
     * Get bone by name
     */
    getBone(name) {
        return this.bones.get(name) || null;
    }

    /**
     * Get all bone names
     */
    getBoneNames() {
        return Array.from(this.bones.keys());
    }

    /**
     * Get root bone (hips)
     */
    getRootBone() {
        return this.bones.get(VRM_BONES.HIPS);
    }

    /**
     * Get children of a bone
     */
    getChildren(boneName) {
        const bone = this.bones.get(boneName);
        if (!bone) return [];
        return bone.children.map(name => this.bones.get(name)).filter(b => b);
    }

    /**
     * Get parent of a bone
     */
    getParent(boneName) {
        const bone = this.bones.get(boneName);
        if (!bone || !bone.parent) return null;
        return this.bones.get(bone.parent);
    }

    // =========================================================================
    // Pose Management
    // =========================================================================

    /**
     * Set bone rotation (local)
     * @param {string} boneName
     * @param {Object} rotation - { x, y, z, w } quaternion
     */
    setBoneRotation(boneName, rotation) {
        const bone = this.bones.get(boneName);
        if (!bone) return false;

        bone.rotation = { ...rotation };
        this.updateWorldTransforms();
        return true;
    }

    /**
     * Set bone position (local offset from rest)
     */
    setBonePosition(boneName, position) {
        const bone = this.bones.get(boneName);
        if (!bone) return false;

        bone.position = { ...position };
        this.updateWorldTransforms();
        return true;
    }

    /**
     * Reset to T-pose
     */
    resetToTPose() {
        for (const [boneName, bone] of this.bones) {
            bone.position = { ...bone.restPosition };
            bone.rotation = { x: 0, y: 0, z: 0, w: 1 };
            bone.scale = { x: 1, y: 1, z: 1 };
        }
        this.updateWorldTransforms();
    }

    /**
     * Apply a pose from animation data
     * @param {Object} poseData - Map of boneName → { rotation, position?, scale? }
     */
    applyPose(poseData) {
        for (const [boneName, transform] of Object.entries(poseData)) {
            const bone = this.bones.get(boneName);
            if (!bone) continue;

            if (transform.rotation) {
                bone.rotation = { ...transform.rotation };
            }
            if (transform.position) {
                bone.position = { ...transform.position };
            }
            if (transform.scale) {
                bone.scale = { ...transform.scale };
            }
        }
        this.updateWorldTransforms();
    }

    /**
     * Get current pose as exportable data
     */
    getPose() {
        const pose = {};
        for (const [boneName, bone] of this.bones) {
            pose[boneName] = {
                rotation: { ...bone.rotation },
                position: { ...bone.position },
                scale: { ...bone.scale }
            };
        }
        return pose;
    }

    // =========================================================================
    // Transform Computation
    // =========================================================================

    /**
     * Update world transforms for all bones (call after pose changes)
     */
    updateWorldTransforms() {
        // Start from root and traverse hierarchy
        this.updateBoneWorldTransform(VRM_BONES.HIPS, null);
    }

    /**
     * Recursively update world transform for a bone and its children
     */
    updateBoneWorldTransform(boneName, parentWorldTransform) {
        const bone = this.bones.get(boneName);
        if (!bone) return;

        if (!parentWorldTransform) {
            // Root bone - world transform equals local transform
            bone.worldPosition = { ...bone.position };
            bone.worldRotation = { ...bone.rotation };
        } else {
            // Child bone - combine with parent transform
            // Simplified: just add positions and multiply rotations
            // In a full implementation, this would use proper matrix math

            // Rotate local position by parent rotation
            const rotatedPos = this.rotatePoint(
                {
                    x: bone.position.x - bone.restPosition.x,
                    y: bone.position.y - bone.restPosition.y,
                    z: bone.position.z - bone.restPosition.z
                },
                parentWorldTransform.rotation
            );

            bone.worldPosition = {
                x: parentWorldTransform.position.x + bone.restPosition.x - parentWorldTransform.restPosition.x + rotatedPos.x,
                y: parentWorldTransform.position.y + bone.restPosition.y - parentWorldTransform.restPosition.y + rotatedPos.y,
                z: parentWorldTransform.position.z + bone.restPosition.z - parentWorldTransform.restPosition.z + rotatedPos.z
            };

            // Multiply rotations
            bone.worldRotation = this.multiplyQuaternions(parentWorldTransform.rotation, bone.rotation);
        }

        // Update children
        for (const childName of bone.children) {
            this.updateBoneWorldTransform(childName, bone);
        }
    }

    /**
     * Rotate a point by a quaternion
     */
    rotatePoint(point, quaternion) {
        const { x: qx, y: qy, z: qz, w: qw } = quaternion;
        const { x: px, y: py, z: pz } = point;

        // Quaternion rotation formula
        const ix = qw * px + qy * pz - qz * py;
        const iy = qw * py + qz * px - qx * pz;
        const iz = qw * pz + qx * py - qy * px;
        const iw = -qx * px - qy * py - qz * pz;

        return {
            x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
            y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
            z: iz * qw + iw * -qz + ix * -qy - iy * -qx
        };
    }

    /**
     * Multiply two quaternions
     */
    multiplyQuaternions(a, b) {
        return {
            x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
            w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
        };
    }

    // =========================================================================
    // Voxel-to-Bone Assignment
    // =========================================================================

    /**
     * Compute bone assignments for all voxels in avatar
     */
    computeBoneAssignments() {
        if (!this.avatarData) return;

        this.voxelBoneAssignments.clear();

        this.avatarData.forEach((x, y, z, paletteIndex) => {
            const key = this.avatarData.encodePosition(x, y, z);

            // Get primary bone from region mapper
            const primaryBone = this.regionMapper.getBoneForVoxel(x, y, z);

            // Calculate weights for smooth blending at joints
            const weights = this.weightCalculator.calculateWeights(x, y, z, primaryBone, this);

            if (weights.length === 1) {
                // Single bone, full weight
                this.voxelBoneAssignments.set(key, {
                    bone: weights[0].bone,
                    weight: 1.0
                });
            } else {
                // Multiple bones with weights
                this.voxelBoneAssignments.set(key, weights);
            }
        });
    }

    /**
     * Get bone assignment for a voxel
     * @returns {Object|Array} Single { bone, weight } or array of { bone, weight }
     */
    getBoneAssignment(x, y, z) {
        if (!this.avatarData) return null;
        const key = this.avatarData.encodePosition(x, y, z);
        return this.voxelBoneAssignments.get(key) || null;
    }

    /**
     * Get all voxels assigned to a specific bone
     */
    getVoxelsForBone(boneName) {
        const voxels = [];

        for (const [key, assignment] of this.voxelBoneAssignments) {
            const isAssigned = Array.isArray(assignment)
                ? assignment.some(a => a.bone === boneName)
                : assignment.bone === boneName;

            if (isAssigned) {
                const pos = this.avatarData.decodePosition(key);
                voxels.push(pos);
            }
        }

        return voxels;
    }

    // =========================================================================
    // Transform Voxels
    // =========================================================================

    /**
     * Get transformed position for a voxel based on current pose
     * @returns {{ x, y, z }} World position after bone transforms
     */
    getTransformedVoxelPosition(x, y, z) {
        const assignment = this.getBoneAssignment(x, y, z);
        if (!assignment) {
            return { x, y, z }; // No assignment, return original
        }

        if (Array.isArray(assignment)) {
            // Weighted blend of multiple bones
            let resultX = 0, resultY = 0, resultZ = 0;
            let totalWeight = 0;

            for (const { bone: boneName, weight } of assignment) {
                const bone = this.bones.get(boneName);
                if (!bone) continue;

                const transformed = this.transformPointByBone(x, y, z, bone);
                resultX += transformed.x * weight;
                resultY += transformed.y * weight;
                resultZ += transformed.z * weight;
                totalWeight += weight;
            }

            if (totalWeight > 0) {
                return {
                    x: resultX / totalWeight,
                    y: resultY / totalWeight,
                    z: resultZ / totalWeight
                };
            }
        } else {
            // Single bone
            const bone = this.bones.get(assignment.bone);
            if (bone) {
                return this.transformPointByBone(x, y, z, bone);
            }
        }

        return { x, y, z };
    }

    /**
     * Transform a point by a bone's current world transform
     */
    transformPointByBone(x, y, z, bone) {
        // Get offset from bone rest position
        const offsetX = x - bone.restPosition.x;
        const offsetY = y - bone.restPosition.y;
        const offsetZ = z - bone.restPosition.z;

        // Rotate offset by bone world rotation
        const rotated = this.rotatePoint(
            { x: offsetX, y: offsetY, z: offsetZ },
            bone.worldRotation
        );

        // Add to bone world position
        return {
            x: bone.worldPosition.x + rotated.x,
            y: bone.worldPosition.y + rotated.y,
            z: bone.worldPosition.z + rotated.z
        };
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    /**
     * Serialize rig configuration
     */
    serialize() {
        return {
            restPositions: Object.fromEntries(
                Array.from(this.bones.entries()).map(([name, bone]) => [
                    name,
                    { ...bone.restPosition }
                ])
            ),
            currentPose: this.getPose()
        };
    }

    /**
     * Deserialize rig configuration
     */
    static deserialize(data, avatarData = null) {
        const rig = new VoxelAvatarRig(avatarData);

        // Apply custom rest positions if provided
        if (data.restPositions) {
            for (const [boneName, position] of Object.entries(data.restPositions)) {
                const bone = rig.bones.get(boneName);
                if (bone) {
                    bone.restPosition = { ...position };
                }
            }
            rig.computeBoneLengths();
        }

        // Apply pose if provided
        if (data.currentPose) {
            rig.applyPose(data.currentPose);
        }

        return rig;
    }
}

export default VoxelAvatarRig;
