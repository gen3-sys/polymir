/**
 * VRMBridge - Integration layer between voxel avatars and three-vrm
 *
 * Maps VRM humanoid bone structure to our voxel avatar rig.
 * Enables using VRM animations and features with voxel avatars.
 *
 * Features:
 * - VRM humanoid bone name mapping
 * - Animation clip conversion
 * - First-person mode (hide head voxels)
 * - VRM meta handling
 */

import * as THREE from 'three';
import { VRM_BONES, BONE_HIERARCHY } from '../rig/VoxelAvatarRig.js';

// Standard VRM humanoid bone names
export const VRM_HUMANOID_BONES = {
    // Core
    hips: 'hips',
    spine: 'spine',
    chest: 'chest',
    upperChest: 'upperChest',
    neck: 'neck',
    head: 'head',

    // Left arm
    leftShoulder: 'leftShoulder',
    leftUpperArm: 'leftUpperArm',
    leftLowerArm: 'leftLowerArm',
    leftHand: 'leftHand',

    // Right arm
    rightShoulder: 'rightShoulder',
    rightUpperArm: 'rightUpperArm',
    rightLowerArm: 'rightLowerArm',
    rightHand: 'rightHand',

    // Left leg
    leftUpperLeg: 'leftUpperLeg',
    leftLowerLeg: 'leftLowerLeg',
    leftFoot: 'leftFoot',
    leftToes: 'leftToes',

    // Right leg
    rightUpperLeg: 'rightUpperLeg',
    rightLowerLeg: 'rightLowerLeg',
    rightFoot: 'rightFoot',
    rightToes: 'rightToes',

    // Fingers (optional)
    leftThumbProximal: 'leftThumbProximal',
    leftThumbIntermediate: 'leftThumbIntermediate',
    leftThumbDistal: 'leftThumbDistal',
    leftIndexProximal: 'leftIndexProximal',
    leftIndexIntermediate: 'leftIndexIntermediate',
    leftIndexDistal: 'leftIndexDistal',
    // ... more fingers
};

// Map our internal bone names to VRM standard names
export const INTERNAL_TO_VRM = {
    [VRM_BONES.HIPS]: 'hips',
    [VRM_BONES.SPINE]: 'spine',
    [VRM_BONES.CHEST]: 'chest',
    [VRM_BONES.NECK]: 'neck',
    [VRM_BONES.HEAD]: 'head',
    [VRM_BONES.LEFT_SHOULDER]: 'leftShoulder',
    [VRM_BONES.LEFT_UPPER_ARM]: 'leftUpperArm',
    [VRM_BONES.LEFT_LOWER_ARM]: 'leftLowerArm',
    [VRM_BONES.LEFT_HAND]: 'leftHand',
    [VRM_BONES.RIGHT_SHOULDER]: 'rightShoulder',
    [VRM_BONES.RIGHT_UPPER_ARM]: 'rightUpperArm',
    [VRM_BONES.RIGHT_LOWER_ARM]: 'rightLowerArm',
    [VRM_BONES.RIGHT_HAND]: 'rightHand',
    [VRM_BONES.LEFT_UPPER_LEG]: 'leftUpperLeg',
    [VRM_BONES.LEFT_LOWER_LEG]: 'leftLowerLeg',
    [VRM_BONES.LEFT_FOOT]: 'leftFoot',
    [VRM_BONES.LEFT_TOES]: 'leftToes',
    [VRM_BONES.RIGHT_UPPER_LEG]: 'rightUpperLeg',
    [VRM_BONES.RIGHT_LOWER_LEG]: 'rightLowerLeg',
    [VRM_BONES.RIGHT_FOOT]: 'rightFoot',
    [VRM_BONES.RIGHT_TOES]: 'rightToes'
};

// Reverse mapping
export const VRM_TO_INTERNAL = {};
for (const [internal, vrm] of Object.entries(INTERNAL_TO_VRM)) {
    VRM_TO_INTERNAL[vrm] = internal;
}

// First-person head bones (hidden in first-person view)
export const FIRST_PERSON_BONES = [
    VRM_BONES.HEAD,
    VRM_BONES.NECK
];

export class VRMBridge {
    constructor(options = {}) {
        // Reference to avatar rig
        this.rig = null;

        // Bone mapping cache
        this.boneMap = new Map();

        // VRM model reference (if using actual VRM)
        this.vrmModel = null;

        // First-person mode
        this.firstPersonMode = false;
        this.hiddenBones = new Set();

        // Animation conversion cache
        this.convertedClips = new Map();

        // Options
        this.enableAutoMapping = options.enableAutoMapping !== false;
    }

    /**
     * Initialize with avatar rig
     * @param {VoxelAvatarRig} rig - Avatar rig instance
     */
    initialize(rig) {
        this.rig = rig;

        if (this.enableAutoMapping) {
            this.buildBoneMapping();
        }
    }

    /**
     * Build mapping between rig bones and VRM humanoid bones
     */
    buildBoneMapping() {
        this.boneMap.clear();

        if (!this.rig) return;

        for (const internalName of this.rig.getBoneNames()) {
            const vrmName = INTERNAL_TO_VRM[internalName];
            if (vrmName) {
                this.boneMap.set(vrmName, internalName);
            }
        }
    }

    /**
     * Get internal bone name from VRM bone name
     */
    getInternalBoneName(vrmBoneName) {
        return this.boneMap.get(vrmBoneName) || VRM_TO_INTERNAL[vrmBoneName] || null;
    }

    /**
     * Get VRM bone name from internal bone name
     */
    getVRMBoneName(internalBoneName) {
        return INTERNAL_TO_VRM[internalBoneName] || null;
    }

    /**
     * Apply VRM pose to avatar rig
     * @param {Object} pose - VRM pose data { boneName: { rotation: Quaternion, position?: Vector3 } }
     */
    applyVRMPose(pose) {
        if (!this.rig) return;

        for (const [vrmBoneName, boneData] of Object.entries(pose)) {
            const internalName = this.getInternalBoneName(vrmBoneName);
            if (!internalName) continue;

            const bone = this.rig.getBone(internalName);
            if (!bone) continue;

            // Apply rotation
            if (boneData.rotation) {
                if (boneData.rotation.isQuaternion) {
                    bone.rotation.copy(boneData.rotation);
                } else {
                    bone.rotation.set(
                        boneData.rotation.x,
                        boneData.rotation.y,
                        boneData.rotation.z,
                        boneData.rotation.w
                    );
                }
            }

            // Apply position offset (if provided)
            if (boneData.position) {
                // Typically only hips have position animation
                if (internalName === VRM_BONES.HIPS) {
                    bone.positionOffset = {
                        x: boneData.position.x,
                        y: boneData.position.y,
                        z: boneData.position.z
                    };
                }
            }
        }

        // Update rig transforms
        this.rig.updateWorldTransforms();
    }

    /**
     * Convert VRM animation clip to work with our rig
     * @param {THREE.AnimationClip} vrmClip - VRM animation clip
     * @returns {THREE.AnimationClip} Converted clip
     */
    convertAnimationClip(vrmClip) {
        // Check cache
        if (this.convertedClips.has(vrmClip.uuid)) {
            return this.convertedClips.get(vrmClip.uuid);
        }

        const tracks = [];

        for (const track of vrmClip.tracks) {
            // Parse track name (format: "boneName.property")
            const parts = track.name.split('.');
            if (parts.length < 2) continue;

            const vrmBoneName = parts[0];
            const property = parts.slice(1).join('.');

            // Get internal bone name
            const internalName = this.getInternalBoneName(vrmBoneName);
            if (!internalName) continue;

            // Create new track with internal bone name
            const newTrackName = `${internalName}.${property}`;

            let newTrack;
            if (track instanceof THREE.QuaternionKeyframeTrack) {
                newTrack = new THREE.QuaternionKeyframeTrack(
                    newTrackName,
                    track.times.slice(),
                    track.values.slice()
                );
            } else if (track instanceof THREE.VectorKeyframeTrack) {
                newTrack = new THREE.VectorKeyframeTrack(
                    newTrackName,
                    track.times.slice(),
                    track.values.slice()
                );
            } else if (track instanceof THREE.NumberKeyframeTrack) {
                newTrack = new THREE.NumberKeyframeTrack(
                    newTrackName,
                    track.times.slice(),
                    track.values.slice()
                );
            } else {
                // Clone other track types
                newTrack = track.clone();
                newTrack.name = newTrackName;
            }

            tracks.push(newTrack);
        }

        const convertedClip = new THREE.AnimationClip(
            vrmClip.name,
            vrmClip.duration,
            tracks
        );

        // Cache the converted clip
        this.convertedClips.set(vrmClip.uuid, convertedClip);

        return convertedClip;
    }

    /**
     * Set first-person mode (hides head and neck)
     */
    setFirstPersonMode(enabled) {
        this.firstPersonMode = enabled;
        this.hiddenBones.clear();

        if (enabled) {
            for (const boneName of FIRST_PERSON_BONES) {
                this.hiddenBones.add(boneName);
            }
        }
    }

    /**
     * Check if bone should be visible
     */
    isBoneVisible(boneName) {
        return !this.hiddenBones.has(boneName);
    }

    /**
     * Get bones that should be hidden in first-person
     */
    getHiddenBones() {
        return Array.from(this.hiddenBones);
    }

    /**
     * Create T-pose for avatar
     * Standard VRM T-pose with arms extended horizontally
     */
    createTPose() {
        const pose = {};

        // Identity rotation for most bones
        const identity = new THREE.Quaternion();

        for (const boneName of Object.keys(INTERNAL_TO_VRM)) {
            pose[INTERNAL_TO_VRM[boneName]] = {
                rotation: identity.clone()
            };
        }

        // Arms in T-pose (rotated 90 degrees outward)
        const leftArmRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, 0, -Math.PI / 2)
        );
        const rightArmRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, 0, Math.PI / 2)
        );

        pose.leftUpperArm = { rotation: leftArmRotation };
        pose.rightUpperArm = { rotation: rightArmRotation };

        return pose;
    }

    /**
     * Create A-pose for avatar
     * Arms slightly angled downward (common default pose)
     */
    createAPose() {
        const pose = this.createTPose();

        // Arms at 45 degrees
        const leftArmRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, 0, -Math.PI / 4)
        );
        const rightArmRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, 0, Math.PI / 4)
        );

        pose.leftUpperArm = { rotation: leftArmRotation };
        pose.rightUpperArm = { rotation: rightArmRotation };

        return pose;
    }

    /**
     * Export rig pose to VRM format
     */
    exportPoseToVRM() {
        if (!this.rig) return null;

        const pose = {};

        for (const [internalName, vrmName] of Object.entries(INTERNAL_TO_VRM)) {
            const bone = this.rig.getBone(internalName);
            if (!bone) continue;

            pose[vrmName] = {
                rotation: {
                    x: bone.rotation.x,
                    y: bone.rotation.y,
                    z: bone.rotation.z,
                    w: bone.rotation.w
                }
            };

            // Include position for hips
            if (internalName === VRM_BONES.HIPS && bone.positionOffset) {
                pose[vrmName].position = { ...bone.positionOffset };
            }
        }

        return pose;
    }

    /**
     * Get humanoid description for VRM compatibility
     */
    getHumanoidDescription() {
        return {
            humanBones: Object.entries(INTERNAL_TO_VRM).map(([internal, vrm]) => ({
                bone: vrm,
                node: internal,
                useDefaultValues: true
            })),
            armStretch: 0.05,
            legStretch: 0.05,
            upperArmTwist: 0.5,
            lowerArmTwist: 0.5,
            upperLegTwist: 0.5,
            lowerLegTwist: 0.5,
            feetSpacing: 0,
            hasTranslationDoF: false
        };
    }

    /**
     * Check if this bridge is compatible with a VRM model
     */
    isCompatibleWith(vrmModel) {
        if (!vrmModel || !vrmModel.humanoid) return false;

        // Check if required bones exist
        const requiredBones = ['hips', 'spine', 'head'];
        for (const bone of requiredBones) {
            if (!vrmModel.humanoid.getBoneNode(bone)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.boneMap.clear();
        this.convertedClips.clear();
        this.hiddenBones.clear();
        this.rig = null;
        this.vrmModel = null;
    }
}

export default VRMBridge;
