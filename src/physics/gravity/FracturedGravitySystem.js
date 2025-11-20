import * as THREE from '../lib/three.module.js';

/**
 * FracturedGravitySystem - Handles gravity for fractured/segmented ringworlds
 *
 * When a ringworld is fractured into multiple arc segments, each piece maintains
 * its own curved gravity centerline. This system manages:
 * - Multiple arc-segment gravity sources
 * - Smooth interpolation at fracture boundaries
 * - Dynamic registration/unregistration of segments
 * - Composite gravity field calculations
 * - Rotation tracking for each independent segment
 *
 * Conceptual Model:
 * - Each fragment is an arc of the original torus centerline
 * - Gravity points toward the nearest point on that arc
 * - Segments can rotate independently (tumbling debris)
 * - Multiple segments can overlap in influence (transition zones)
 */
export class FracturedGravitySystem {
    constructor(config = {}) {
        this.segments = new Map(); 
        this.influenceRadius = config.influenceRadius || 50;
        this.blendDistance = config.blendDistance || 20; 
        this.falloffCurve = config.falloffCurve || 'cubic'; // 'linear', 'quadratic', 'cubic'

        
        this.originalRingRadius = config.ringRadius || 1000;
        this.originalTubeRadius = config.tubeRadius || 200;
        this.originalAxis = config.ringAxis ?
            new THREE.Vector3(config.ringAxis.x, config.ringAxis.y, config.ringAxis.z).normalize() :
            new THREE.Vector3(0, 1, 0);

        
        this.nearestSegmentCache = new Map();
        this.cacheExpiry = 0;
        this.cacheLifetime = 0.1; 
    }

    /**
     * Register a new gravity segment (fragment of ringworld)
     * @param {string} segmentId - Unique identifier for this segment
     * @param {Object} config - Segment configuration
     * @returns {GravitySegment} The created segment
     */
    registerSegment(segmentId, config) {
        const segment = new GravitySegment({
            id: segmentId,
            
            arcStart: config.arcStart || 0,           
            arcEnd: config.arcEnd || Math.PI / 4,     
            ringRadius: config.ringRadius || this.originalRingRadius,
            tubeRadius: config.tubeRadius || this.originalTubeRadius,

            
            center: config.center || new THREE.Vector3(0, 0, 0),
            axis: config.axis || this.originalAxis.clone(),

            
            rotation: config.rotation || 0,
            rotationSpeed: config.rotationSpeed || 0,
            angularVelocity: config.angularVelocity || new THREE.Vector3(0, 0, 0),

            
            mass: config.mass || 1000,
            voxelCount: config.voxelCount || 0,

            
            fractureTime: config.fractureTime || Date.now(),
            parentSegmentId: config.parentSegmentId || null,

            
            influenceRadius: config.influenceRadius || this.influenceRadius,
            strength: config.strength || 9.8
        });

        this.segments.set(segmentId, segment);
        this.invalidateCache();

        return segment;
    }

    /**
     * Unregister a segment (when merged, destroyed, or despawned)
     * @param {string} segmentId
     */
    unregisterSegment(segmentId) {
        this.segments.delete(segmentId);
        this.invalidateCache();
    }

    /**
     * Update all segments (rotation, physics integration)
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
     * Get composite gravity vector at a position
     * @param {THREE.Vector3} position - Query position
     * @returns {Object} Gravity information
     */
    getGravityAt(position) {
        const nearbySegments = this.findNearbySegments(position);

        if (nearbySegments.length === 0) {
            return {
                acceleration: new THREE.Vector3(0, 0, 0),
                upVector: new THREE.Vector3(0, 1, 0),
                influence: 0,
                dominantSegment: null
            };
        }

        
        if (nearbySegments.length === 1) {
            const segment = nearbySegments[0];
            const segmentGravity = this.calculateSegmentGravity(segment, position);

            return {
                acceleration: segmentGravity.direction.clone().multiplyScalar(-segmentGravity.strength),
                upVector: segmentGravity.direction,
                influence: segmentGravity.influence,
                distanceFromSurface: segmentGravity.distanceFromSurface,
                dominantSegment: segment.id,
                segments: [{ id: segment.id, influence: segmentGravity.influence }]
            };
        }

        
        return this.blendGravityFields(nearbySegments, position);
    }

    /**
     * Calculate gravity from a single segment
     * @param {GravitySegment} segment
     * @param {THREE.Vector3} position
     * @returns {Object} Gravity data for this segment
     * @private
     */
    calculateSegmentGravity(segment, position) {
        
        const localPos = position.clone().sub(segment.center);

        
        if (segment.rotation !== 0 || segment.quaternion) {
            const invQuat = segment.getInverseQuaternion();
            localPos.applyQuaternion(invQuat);
        }

        
        const arcInfo = this.findNearestPointOnArc(localPos, segment);

        
        const toCenter = arcInfo.nearestPoint.clone().sub(localPos);
        const distanceFromCenterline = toCenter.length();
        const distanceFromSurface = distanceFromCenterline - segment.tubeRadius;

        
        let influence = 0;
        if (distanceFromSurface <= segment.influenceRadius) {
            const t = Math.max(0, distanceFromSurface) / segment.influenceRadius;
            influence = this.applyFalloffCurve(1 - t);
        }

        
        const direction = toCenter.normalize();
        if (segment.rotation !== 0 || segment.quaternion) {
            direction.applyQuaternion(segment.quaternion || segment.getQuaternion());
        }

        return {
            direction: direction,              
            strength: segment.strength * influence,
            influence: influence,
            distanceFromSurface: distanceFromSurface,
            arcAngle: arcInfo.angle,          
            isOnArc: arcInfo.isOnArc          
        };
    }

    /**
     * Find nearest point on an arc segment
     * @param {THREE.Vector3} localPos - Position in segment local space
     * @param {GravitySegment} segment
     * @returns {Object} Arc projection information
     * @private
     */
    findNearestPointOnArc(localPos, segment) {
        
        const axisComponent = localPos.dot(segment.axis);
        const radialPos = localPos.clone().sub(segment.axis.clone().multiplyScalar(axisComponent));
        const radialDist = radialPos.length();

        
        let angle = Math.atan2(radialPos.z, radialPos.x);

        
        const arcStart = segment.arcStart;
        const arcEnd = segment.arcEnd;
        const arcMid = (arcStart + arcEnd) / 2;

        
        let clampedAngle = angle;
        let isOnArc = true;

        if (arcEnd > arcStart) {
            
            if (angle < arcStart || angle > arcEnd) {
                isOnArc = false;
                
                const distToStart = Math.abs(this.normalizeAngle(angle - arcStart));
                const distToEnd = Math.abs(this.normalizeAngle(angle - arcEnd));
                clampedAngle = distToStart < distToEnd ? arcStart : arcEnd;
            }
        } else {
            
            const normalizedAngle = this.normalizeAngle(angle);
            if (normalizedAngle > arcEnd && normalizedAngle < arcStart) {
                isOnArc = false;
                const distToStart = Math.abs(this.normalizeAngle(normalizedAngle - arcStart));
                const distToEnd = Math.abs(this.normalizeAngle(normalizedAngle - arcEnd));
                clampedAngle = distToStart < distToEnd ? arcStart : arcEnd;
            } else {
                clampedAngle = normalizedAngle;
            }
        }

        
        const centerlinePoint = new THREE.Vector3(
            Math.cos(clampedAngle) * segment.ringRadius,
            axisComponent,
            Math.sin(clampedAngle) * segment.ringRadius
        );

        return {
            nearestPoint: centerlinePoint,
            angle: clampedAngle,
            isOnArc: isOnArc,
            distanceAlongArc: (clampedAngle - arcStart) * segment.ringRadius
        };
    }

    /**
     * Blend gravity from multiple nearby segments
     * @param {Array<GravitySegment>} segments
     * @param {THREE.Vector3} position
     * @returns {Object} Blended gravity data
     * @private
     */
    blendGravityFields(segments, position) {
        const gravityContributions = segments.map(segment =>
            this.calculateSegmentGravity(segment, position)
        );

        
        const totalInfluence = gravityContributions.reduce((sum, g) => sum + g.influence, 0);

        if (totalInfluence < 0.001) {
            return {
                acceleration: new THREE.Vector3(0, 0, 0),
                upVector: new THREE.Vector3(0, 1, 0),
                influence: 0,
                dominantSegment: null
            };
        }

        
        const blendedAcceleration = new THREE.Vector3(0, 0, 0);

        for (let i = 0; i < segments.length; i++) {
            const gravity = gravityContributions[i];
            const weight = gravity.influence / totalInfluence;

            blendedAcceleration.add(
                gravity.direction.clone()
                    .multiplyScalar(-gravity.strength * weight)
            );
        }

        
        const upVector = blendedAcceleration.clone().negate().normalize();

        
        let dominantIdx = 0;
        let maxInfluence = gravityContributions[0].influence;
        for (let i = 1; i < gravityContributions.length; i++) {
            if (gravityContributions[i].influence > maxInfluence) {
                maxInfluence = gravityContributions[i].influence;
                dominantIdx = i;
            }
        }

        return {
            acceleration: blendedAcceleration,
            upVector: upVector,
            influence: totalInfluence / segments.length, 
            distanceFromSurface: gravityContributions[dominantIdx].distanceFromSurface,
            dominantSegment: segments[dominantIdx].id,
            segments: segments.map((seg, i) => ({
                id: seg.id,
                influence: gravityContributions[i].influence,
                weight: gravityContributions[i].influence / totalInfluence
            }))
        };
    }

    /**
     * Find segments near a position (within influence radius)
     * @param {THREE.Vector3} position
     * @returns {Array<GravitySegment>}
     * @private
     */
    findNearbySegments(position) {
        const nearby = [];

        for (const segment of this.segments.values()) {
            
            const maxDist = segment.ringRadius + segment.tubeRadius + segment.influenceRadius;
            const distToCenter = position.distanceTo(segment.center);

            if (distToCenter < maxDist) {
                nearby.push(segment);
            }
        }

        return nearby;
    }

    /**
     * Apply falloff curve to influence
     * @param {number} t - Normalized distance (0 = surface, 1 = edge of influence)
     * @returns {number} Influence multiplier
     * @private
     */
    applyFalloffCurve(t) {
        t = Math.max(0, Math.min(1, t));

        switch (this.falloffCurve) {
            case 'linear':
                return t;
            case 'quadratic':
                return t * t;
            case 'cubic':
                return t * t * t;
            case 'smooth':
                return t * t * (3 - 2 * t); 
            default:
                return t;
        }
    }

    /**
     * Normalize angle to -π to π range
     * @param {number} angle
     * @returns {number}
     * @private
     */
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }

    /**
     * Invalidate nearest-segment cache
     * @private
     */
    invalidateCache() {
        this.nearestSegmentCache.clear();
        this.cacheExpiry = this.cacheLifetime;
    }

    /**
     * Get all registered segments
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

/**
 * GravitySegment - Represents a fractured arc segment with gravity
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
     * Update segment state
     * @param {number} deltaTime
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
     * Get rotation quaternion (cached)
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
     * Get approximate volume
     * @returns {number}
     */
    getVolume() {
        const arcLength = this.getArcLength();
        const tubeArea = Math.PI * this.tubeRadius * this.tubeRadius;
        return arcLength * tubeArea;
    }

    /**
     * Check if a point is within the segment's influence
     * @param {THREE.Vector3} position
     * @returns {boolean}
     */
    isWithinInfluence(position) {
        const maxDist = this.ringRadius + this.tubeRadius + this.influenceRadius;
        return position.distanceTo(this.center) < maxDist;
    }
}
