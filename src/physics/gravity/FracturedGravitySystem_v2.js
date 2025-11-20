import * as THREE from '../lib/three.module.js';
import { GravitySegment } from '../data/GravitySegment.js';
import { findNearestPointOnArc, distanceToTorusSurface, directionToCenterline } from '../math/ArcMath.js';
import { calculateInfluence } from '../utils/GravityFalloff.js';

/**
 * FracturedGravitySystem - Manages gravity for fractured ringworld segments
 *
 * Single Responsibility: Coordinate gravity calculations across multiple arc segments
 *
 * This system:
 * - Registers/unregisters gravity segments
 * - Queries composite gravity at positions
 * - Blends multiple segment influences
 * - Updates segment states
 *
 * Does NOT:
 * - Perform arc mathematics (delegated to ArcMath)
 * - Calculate falloff curves (delegated to GravityFalloff)
 * - Manage segment state (delegated to GravitySegment)
 */
export class FracturedGravitySystem {
    constructor(config = {}) {
        this.segments = new Map();

        
        this.influenceRadius = config.influenceRadius || 50;
        this.falloffCurve = config.falloffCurve || 'smooth';

        
        this.nearestSegmentCache = new Map();
        this.cacheExpiry = 0;
        this.cacheLifetime = 0.1; 
    }

    /**
     * Register a new gravity segment
     * @param {string} segmentId - Unique identifier
     * @param {Object} config - Segment configuration
     * @returns {GravitySegment}
     */
    registerSegment(segmentId, config) {
        const segment = new GravitySegment({
            id: segmentId,
            arcStart: config.arcStart,
            arcEnd: config.arcEnd,
            ringRadius: config.ringRadius,
            tubeRadius: config.tubeRadius,
            center: config.center,
            axis: config.axis,
            rotation: config.rotation || 0,
            rotationSpeed: config.rotationSpeed || 0,
            angularVelocity: config.angularVelocity || new THREE.Vector3(0, 0, 0),
            mass: config.mass || 1000,
            voxelCount: config.voxelCount || 0,
            influenceRadius: config.influenceRadius || this.influenceRadius,
            strength: config.strength || 9.8,
            fractureTime: config.fractureTime || Date.now(),
            parentSegmentId: config.parentSegmentId || null
        });

        this.segments.set(segmentId, segment);
        this.invalidateCache();

        return segment;
    }

    /**
     * Unregister a segment
     * @param {string} segmentId
     */
    unregisterSegment(segmentId) {
        this.segments.delete(segmentId);
        this.invalidateCache();
    }

    /**
     * Update all segments
     * @param {number} deltaTime - Time step in seconds
     */
    update(deltaTime) {
        for (const segment of this.segments.values()) {
            segment.update(deltaTime);
        }

        
        this.cacheExpiry -= deltaTime;
        if (this.cacheExpiry <= 0) {
            this.invalidateCache();
        }
    }

    /**
     * Get composite gravity at a position
     * @param {THREE.Vector3} position
     * @returns {Object} Gravity data
     */
    getGravityAt(position) {
        const nearbySegments = this.findNearbySegments(position);

        if (nearbySegments.length === 0) {
            return this.createNullGravity();
        }

        if (nearbySegments.length === 1) {
            return this.getSingleSegmentGravity(nearbySegments[0], position);
        }

        return this.getBlendedGravity(nearbySegments, position);
    }

    /**
     * Calculate gravity from single segment
     * @param {GravitySegment} segment
     * @param {THREE.Vector3} position
     * @returns {Object}
     * @private
     */
    getSingleSegmentGravity(segment, position) {
        const gravityData = this.calculateSegmentGravity(segment, position);

        return {
            acceleration: gravityData.direction.clone().multiplyScalar(-gravityData.strength),
            upVector: gravityData.direction,
            influence: gravityData.influence,
            distanceFromSurface: gravityData.distanceFromSurface,
            dominantSegment: segment.id,
            segments: [{ id: segment.id, influence: gravityData.influence, weight: 1.0 }]
        };
    }

    /**
     * Calculate blended gravity from multiple segments
     * @param {Array<GravitySegment>} segments
     * @param {THREE.Vector3} position
     * @returns {Object}
     * @private
     */
    getBlendedGravity(segments, position) {
        const contributions = segments.map(seg =>
            this.calculateSegmentGravity(seg, position)
        );

        const totalInfluence = contributions.reduce((sum, g) => sum + g.influence, 0);

        if (totalInfluence < 0.001) {
            return this.createNullGravity();
        }

        
        const blendedAcceleration = new THREE.Vector3(0, 0, 0);

        for (let i = 0; i < segments.length; i++) {
            const gravity = contributions[i];
            const weight = gravity.influence / totalInfluence;

            blendedAcceleration.add(
                gravity.direction.clone().multiplyScalar(-gravity.strength * weight)
            );
        }

        const upVector = blendedAcceleration.clone().negate().normalize();

        
        let dominantIdx = 0;
        let maxInfluence = contributions[0].influence;
        for (let i = 1; i < contributions.length; i++) {
            if (contributions[i].influence > maxInfluence) {
                maxInfluence = contributions[i].influence;
                dominantIdx = i;
            }
        }

        return {
            acceleration: blendedAcceleration,
            upVector: upVector,
            influence: totalInfluence / segments.length,
            distanceFromSurface: contributions[dominantIdx].distanceFromSurface,
            dominantSegment: segments[dominantIdx].id,
            segments: segments.map((seg, i) => ({
                id: seg.id,
                influence: contributions[i].influence,
                weight: contributions[i].influence / totalInfluence
            }))
        };
    }

    /**
     * Calculate gravity contribution from a single segment
     * @param {GravitySegment} segment
     * @param {THREE.Vector3} position
     * @returns {Object}
     * @private
     */
    calculateSegmentGravity(segment, position) {
        
        const localPos = position.clone().sub(segment.center);

        if (segment.rotation !== 0 || segment.quaternion) {
            const invQuat = segment.getInverseQuaternion();
            localPos.applyQuaternion(invQuat);
        }

        
        const arcInfo = findNearestPointOnArc(localPos, {
            arcStart: segment.arcStart,
            arcEnd: segment.arcEnd,
            ringRadius: segment.ringRadius,
            tubeRadius: segment.tubeRadius,
            axis: segment.axis
        });

        
        const distanceFromSurface = distanceToTorusSurface(
            localPos,
            arcInfo.nearestPoint,
            segment.tubeRadius
        );

        
        const direction = directionToCenterline(localPos, arcInfo.nearestPoint);

        
        const worldDirection = new THREE.Vector3(direction.x, direction.y, direction.z);
        if (segment.rotation !== 0 || segment.quaternion) {
            worldDirection.applyQuaternion(segment.getQuaternion());
        }

        
        const influence = calculateInfluence(
            distanceFromSurface,
            segment.influenceRadius,
            this.falloffCurve
        );

        return {
            direction: worldDirection,
            strength: segment.strength * influence,
            influence: influence,
            distanceFromSurface: distanceFromSurface,
            arcAngle: arcInfo.angle,
            isOnArc: arcInfo.isOnArc
        };
    }

    /**
     * Find segments near a position (spatial culling)
     * @param {THREE.Vector3} position
     * @returns {Array<GravitySegment>}
     * @private
     */
    findNearbySegments(position) {
        const nearby = [];

        for (const segment of this.segments.values()) {
            if (segment.isWithinInfluence(position)) {
                nearby.push(segment);
            }
        }

        return nearby;
    }

    /**
     * Create null gravity result
     * @returns {Object}
     * @private
     */
    createNullGravity() {
        return {
            acceleration: new THREE.Vector3(0, 0, 0),
            upVector: new THREE.Vector3(0, 1, 0),
            influence: 0,
            dominantSegment: null,
            segments: []
        };
    }

    /**
     * Invalidate spatial cache
     * @private
     */
    invalidateCache() {
        this.nearestSegmentCache.clear();
        this.cacheExpiry = this.cacheLifetime;
    }

    /**
     * Get all segments
     * @returns {Map<string, GravitySegment>}
     */
    getSegments() {
        return this.segments;
    }

    /**
     * Get segment by ID
     * @param {string} segmentId
     * @returns {GravitySegment|null}
     */
    getSegment(segmentId) {
        return this.segments.get(segmentId) || null;
    }
}
