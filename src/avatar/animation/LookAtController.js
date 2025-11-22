/**
 * LookAtController - Eye and head tracking for voxel avatars
 *
 * Controls where the avatar looks by rotating the head and offsetting
 * eye voxels. Supports smooth interpolation and angle limits.
 *
 * Features:
 * - Target position tracking
 * - Head rotation with limits
 * - Eye voxel offset (if eyes are separate)
 * - Smooth interpolation
 * - Auto-look (random idle looking)
 */

import * as THREE from 'three';
import { VRM_BONES } from '../rig/VoxelAvatarRig.js';

// Look-at configuration defaults
const DEFAULT_CONFIG = {
    // Head rotation limits (radians)
    headYawLimit: Math.PI / 3,      // 60 degrees left/right
    headPitchLimit: Math.PI / 4,    // 45 degrees up/down
    headRollLimit: Math.PI / 8,     // 22.5 degrees tilt

    // Eye rotation limits (smaller than head)
    eyeYawLimit: Math.PI / 6,       // 30 degrees
    eyePitchLimit: Math.PI / 8,     // 22.5 degrees

    // Interpolation speed
    headSpeed: 4.0,                 // Radians per second
    eyeSpeed: 8.0,                  // Faster eye movement

    // Auto-look settings
    autoLookEnabled: true,
    autoLookInterval: 3.0,          // Seconds between random looks
    autoLookDuration: 1.5,          // How long to look at random point
    autoLookRadius: 2.0             // How far to look (world units)
};

export class LookAtController {
    constructor(options = {}) {
        // References
        this.rig = null;
        this.renderer = null;

        // Configuration
        this.config = { ...DEFAULT_CONFIG, ...options };

        // Current state
        this.targetPosition = new THREE.Vector3(0, 1.6, 1); // Default: forward at head height
        this.currentHeadRotation = new THREE.Euler();
        this.targetHeadRotation = new THREE.Euler();
        this.currentEyeOffset = { x: 0, y: 0 };
        this.targetEyeOffset = { x: 0, y: 0 };

        // Reference point (where avatar's eyes are in world space)
        this.eyeWorldPosition = new THREE.Vector3();

        // Auto-look state
        this.autoLookEnabled = this.config.autoLookEnabled;
        this.autoLookTimer = 0;
        this.autoLookTarget = new THREE.Vector3();
        this.isAutoLooking = false;

        // Manual target override
        this.hasManualTarget = false;
        this.manualTargetTimeout = 0;

        // Helper objects
        this.tempVector = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();

        // Eye voxel tracking (for direct eye movement)
        this.eyeVoxels = {
            left: [],  // Array of { x, y, z } base positions
            right: []
        };
    }

    /**
     * Initialize with avatar rig
     * @param {VoxelAvatarRig} rig - Avatar rig instance
     */
    initialize(rig) {
        this.rig = rig;

        // Calculate initial eye world position
        this.updateEyeWorldPosition();
    }

    /**
     * Set eye voxel positions (for direct eye movement)
     * @param {Array} leftEye - Array of { x, y, z } positions for left eye
     * @param {Array} rightEye - Array of { x, y, z } positions for right eye
     */
    setEyeVoxels(leftEye, rightEye) {
        this.eyeVoxels.left = leftEye || [];
        this.eyeVoxels.right = rightEye || [];
    }

    /**
     * Set look-at target position
     * @param {THREE.Vector3|Object} position - Target position { x, y, z }
     * @param {number} duration - How long to look (0 = indefinite)
     */
    lookAt(position, duration = 0) {
        this.targetPosition.set(
            position.x || 0,
            position.y || 0,
            position.z || 0
        );

        this.hasManualTarget = true;
        this.manualTargetTimeout = duration > 0 ? duration : Infinity;
        this.isAutoLooking = false;
    }

    /**
     * Look at another avatar or entity
     * @param {Object} entity - Entity with position property
     */
    lookAtEntity(entity, duration = 0) {
        if (!entity) return;

        const position = entity.position || entity;
        // Offset to eye level
        const eyeLevel = position.y ? position.y + 1.6 : 1.6;

        this.lookAt({
            x: position.x || 0,
            y: eyeLevel,
            z: position.z || 0
        }, duration);
    }

    /**
     * Clear manual target and return to auto-look
     */
    clearTarget() {
        this.hasManualTarget = false;
        this.manualTargetTimeout = 0;
    }

    /**
     * Update controller state
     * @param {number} deltaTime - Time since last update
     */
    update(deltaTime) {
        // Update eye world position
        this.updateEyeWorldPosition();

        // Handle manual target timeout
        if (this.hasManualTarget && this.manualTargetTimeout !== Infinity) {
            this.manualTargetTimeout -= deltaTime;
            if (this.manualTargetTimeout <= 0) {
                this.clearTarget();
            }
        }

        // Auto-look when no manual target
        if (!this.hasManualTarget && this.autoLookEnabled) {
            this.updateAutoLook(deltaTime);
        }

        // Calculate target rotations
        this.calculateTargetRotations();

        // Interpolate head rotation
        this.interpolateHeadRotation(deltaTime);

        // Interpolate eye offset
        this.interpolateEyeOffset(deltaTime);

        // Apply to rig
        this.applyToRig();
    }

    /**
     * Update eye world position from rig
     */
    updateEyeWorldPosition() {
        if (!this.rig) {
            this.eyeWorldPosition.set(0, 1.6, 0);
            return;
        }

        // Get head bone world position
        const head = this.rig.getBone(VRM_BONES.HEAD);
        if (head && head.worldTransform) {
            this.eyeWorldPosition.set(
                head.worldTransform.position?.x || 0,
                (head.worldTransform.position?.y || 58) * 0.03, // Convert voxels to world units
                head.worldTransform.position?.z || 0
            );
        } else {
            // Default head position
            this.eyeWorldPosition.set(0, 1.7, 0);
        }
    }

    /**
     * Update auto-look behavior
     */
    updateAutoLook(deltaTime) {
        this.autoLookTimer += deltaTime;

        if (!this.isAutoLooking) {
            // Check if it's time for a new auto-look
            if (this.autoLookTimer >= this.config.autoLookInterval) {
                this.startAutoLook();
            }
        } else {
            // Check if auto-look duration has elapsed
            if (this.autoLookTimer >= this.config.autoLookDuration) {
                this.endAutoLook();
            }
        }
    }

    /**
     * Start a random auto-look
     */
    startAutoLook() {
        this.isAutoLooking = true;
        this.autoLookTimer = 0;

        // Generate random look target
        const radius = this.config.autoLookRadius;
        const angle = Math.random() * Math.PI * 2;
        const elevation = (Math.random() - 0.5) * 0.5; // Slight up/down variation

        this.autoLookTarget.set(
            this.eyeWorldPosition.x + Math.cos(angle) * radius,
            this.eyeWorldPosition.y + elevation,
            this.eyeWorldPosition.z + Math.sin(angle) * radius
        );

        this.targetPosition.copy(this.autoLookTarget);
    }

    /**
     * End auto-look and return to forward
     */
    endAutoLook() {
        this.isAutoLooking = false;
        this.autoLookTimer = 0;

        // Look forward
        this.targetPosition.set(
            this.eyeWorldPosition.x,
            this.eyeWorldPosition.y,
            this.eyeWorldPosition.z + 2 // Forward
        );
    }

    /**
     * Calculate target head and eye rotations based on look target
     */
    calculateTargetRotations() {
        // Direction to target
        this.tempVector.copy(this.targetPosition).sub(this.eyeWorldPosition);

        // Calculate yaw (horizontal rotation)
        const yaw = Math.atan2(this.tempVector.x, this.tempVector.z);

        // Calculate pitch (vertical rotation)
        const horizontalDist = Math.sqrt(
            this.tempVector.x * this.tempVector.x +
            this.tempVector.z * this.tempVector.z
        );
        const pitch = -Math.atan2(this.tempVector.y, horizontalDist);

        // Apply limits to head rotation
        const clampedYaw = this.clamp(yaw, -this.config.headYawLimit, this.config.headYawLimit);
        const clampedPitch = this.clamp(pitch, -this.config.headPitchLimit, this.config.headPitchLimit);

        this.targetHeadRotation.set(clampedPitch, clampedYaw, 0);

        // Calculate remaining rotation for eyes
        const remainingYaw = yaw - clampedYaw;
        const remainingPitch = pitch - clampedPitch;

        // Apply limits to eye offset
        const eyeYaw = this.clamp(remainingYaw, -this.config.eyeYawLimit, this.config.eyeYawLimit);
        const eyePitch = this.clamp(remainingPitch, -this.config.eyePitchLimit, this.config.eyePitchLimit);

        // Convert to voxel offset (approximate)
        this.targetEyeOffset.x = eyeYaw * 2; // Scale for voxel movement
        this.targetEyeOffset.y = eyePitch * 2;
    }

    /**
     * Interpolate head rotation toward target
     */
    interpolateHeadRotation(deltaTime) {
        const speed = this.config.headSpeed * deltaTime;

        this.currentHeadRotation.x = this.lerp(
            this.currentHeadRotation.x,
            this.targetHeadRotation.x,
            Math.min(1, speed)
        );
        this.currentHeadRotation.y = this.lerp(
            this.currentHeadRotation.y,
            this.targetHeadRotation.y,
            Math.min(1, speed)
        );
        this.currentHeadRotation.z = this.lerp(
            this.currentHeadRotation.z,
            this.targetHeadRotation.z,
            Math.min(1, speed)
        );
    }

    /**
     * Interpolate eye offset toward target
     */
    interpolateEyeOffset(deltaTime) {
        const speed = this.config.eyeSpeed * deltaTime;

        this.currentEyeOffset.x = this.lerp(
            this.currentEyeOffset.x,
            this.targetEyeOffset.x,
            Math.min(1, speed)
        );
        this.currentEyeOffset.y = this.lerp(
            this.currentEyeOffset.y,
            this.targetEyeOffset.y,
            Math.min(1, speed)
        );
    }

    /**
     * Apply look-at to rig
     */
    applyToRig() {
        if (!this.rig) return;

        // Apply head rotation
        const head = this.rig.getBone(VRM_BONES.HEAD);
        if (head) {
            this.tempQuaternion.setFromEuler(this.currentHeadRotation);
            head.rotation = {
                x: this.tempQuaternion.x,
                y: this.tempQuaternion.y,
                z: this.tempQuaternion.z,
                w: this.tempQuaternion.w
            };
        }

        // Apply slight neck rotation (follow head at reduced amount)
        const neck = this.rig.getBone(VRM_BONES.NECK);
        if (neck) {
            const neckRotation = new THREE.Euler(
                this.currentHeadRotation.x * 0.3,
                this.currentHeadRotation.y * 0.3,
                this.currentHeadRotation.z * 0.3
            );
            this.tempQuaternion.setFromEuler(neckRotation);
            neck.rotation = {
                x: this.tempQuaternion.x,
                y: this.tempQuaternion.y,
                z: this.tempQuaternion.z,
                w: this.tempQuaternion.w
            };
        }

        // Update world transforms
        this.rig.updateWorldTransforms();
    }

    /**
     * Get eye voxel offsets for rendering
     * Used by renderer to shift eye voxel positions
     */
    getEyeVoxelOffsets() {
        return {
            left: {
                x: Math.round(this.currentEyeOffset.x),
                y: Math.round(this.currentEyeOffset.y)
            },
            right: {
                x: Math.round(this.currentEyeOffset.x),
                y: Math.round(this.currentEyeOffset.y)
            }
        };
    }

    /**
     * Get current head rotation
     */
    getHeadRotation() {
        return {
            pitch: this.currentHeadRotation.x,
            yaw: this.currentHeadRotation.y,
            roll: this.currentHeadRotation.z
        };
    }

    /**
     * Set rotation limits
     */
    setLimits(headYaw, headPitch, eyeYaw, eyePitch) {
        if (headYaw !== undefined) this.config.headYawLimit = headYaw;
        if (headPitch !== undefined) this.config.headPitchLimit = headPitch;
        if (eyeYaw !== undefined) this.config.eyeYawLimit = eyeYaw;
        if (eyePitch !== undefined) this.config.eyePitchLimit = eyePitch;
    }

    /**
     * Enable/disable auto-look
     */
    setAutoLookEnabled(enabled) {
        this.autoLookEnabled = enabled;
        if (!enabled) {
            this.isAutoLooking = false;
        }
    }

    /**
     * Set interpolation speeds
     */
    setSpeeds(headSpeed, eyeSpeed) {
        if (headSpeed !== undefined) this.config.headSpeed = headSpeed;
        if (eyeSpeed !== undefined) this.config.eyeSpeed = eyeSpeed;
    }

    /**
     * Linear interpolation helper
     */
    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Clamp value helper
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Get debug info
     */
    getDebugInfo() {
        return {
            targetPosition: {
                x: this.targetPosition.x.toFixed(2),
                y: this.targetPosition.y.toFixed(2),
                z: this.targetPosition.z.toFixed(2)
            },
            headRotation: {
                pitch: (this.currentHeadRotation.x * 180 / Math.PI).toFixed(1) + '°',
                yaw: (this.currentHeadRotation.y * 180 / Math.PI).toFixed(1) + '°'
            },
            eyeOffset: {
                x: this.currentEyeOffset.x.toFixed(2),
                y: this.currentEyeOffset.y.toFixed(2)
            },
            hasManualTarget: this.hasManualTarget,
            isAutoLooking: this.isAutoLooking,
            autoLookTimer: this.autoLookTimer.toFixed(1)
        };
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.rig = null;
        this.renderer = null;
        this.eyeVoxels = { left: [], right: [] };
    }
}

export default LookAtController;
