import * as THREE from '../lib/three.module.js';

/**
 * GravitySegment - Data structure representing a fractured arc segment
 *
 * Pure data structure with minimal logic. Represents a fragment of a ringworld
 * that maintains its own curved gravity centerline.
 *
 * Single Responsibility: Store and manage segment state
 */
export class GravitySegment {
    constructor(config) {
        
        this.id = config.id;

        
        this.arcStart = config.arcStart;
        this.arcEnd = config.arcEnd;
        this.ringRadius = config.ringRadius;
        this.tubeRadius = config.tubeRadius;

        
        this.center = config.center.clone();
        this.axis = config.axis.clone().normalize();
        this.rotation = config.rotation || 0;
        this.rotationSpeed = config.rotationSpeed || 0;
        this.angularVelocity = config.angularVelocity.clone();

        
        this.quaternion = null;
        this.quaternionDirty = true;

        
        this.mass = config.mass;
        this.voxelCount = config.voxelCount;

        
        this.influenceRadius = config.influenceRadius;
        this.strength = config.strength;

        
        this.fractureTime = config.fractureTime;
        this.parentSegmentId = config.parentSegmentId;
        this.isActive = true;
    }

    /**
     * Update segment rotation state
     * @param {number} deltaTime - Time step in seconds
     */
    update(deltaTime) {
        
        if (this.rotationSpeed !== 0) {
            this.rotation += this.rotationSpeed * deltaTime;
            this.rotation = this.rotation % (Math.PI * 2);
            this.quaternionDirty = true;
        }

        
        if (this.angularVelocity.lengthSq() > 0.0001) {
            const angularDelta = this.angularVelocity.clone().multiplyScalar(deltaTime);
            const rotationQuat = new THREE.Quaternion().setFromAxisAngle(
                angularDelta.clone().normalize(),
                angularDelta.length()
            );

            const currentQuat = this.getQuaternion();
            this.quaternion = currentQuat.multiply(rotationQuat);
            this.quaternionDirty = false;
        }
    }

    /**
     * Get rotation quaternion (lazy cached)
     * @returns {THREE.Quaternion}
     */
    getQuaternion() {
        if (this.quaternionDirty || !this.quaternion) {
            this.quaternion = new THREE.Quaternion().setFromAxisAngle(
                this.axis,
                this.rotation
            );
            this.quaternionDirty = false;
        }
        return this.quaternion.clone();
    }

    /**
     * Get inverse rotation quaternion
     * @returns {THREE.Quaternion}
     */
    getInverseQuaternion() {
        return this.getQuaternion().invert();
    }

    /**
     * Get arc length
     * @returns {number}
     */
    getArcLength() {
        const angleSpan = Math.abs(this.arcEnd - this.arcStart);
        return angleSpan * this.ringRadius;
    }

    /**
     * Get approximate volume (arc × tube cross-section)
     * @returns {number}
     */
    getVolume() {
        const arcLength = this.getArcLength();
        const tubeArea = Math.PI * this.tubeRadius * this.tubeRadius;
        return arcLength * tubeArea;
    }

    /**
     * Quick check if position might be within influence
     * @param {THREE.Vector3} position
     * @returns {boolean}
     */
    isWithinInfluence(position) {
        const maxDist = this.ringRadius + this.tubeRadius + this.influenceRadius;
        return position.distanceTo(this.center) < maxDist;
    }
}
