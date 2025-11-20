/**
 * ArcMath - Pure mathematical functions for arc/torus calculations
 *
 * Single Responsibility: Toroidal and arc geometry mathematics
 * Pure Functions: No side effects, deterministic outputs
 */

/**
 * Normalize angle to -π to π range
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
export function normalizeAngle(angle) {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized < -Math.PI) normalized += Math.PI * 2;
    return normalized;
}

/**
 * Find nearest point on an arc segment
 * @param {Object} localPos - Position in segment local space {x, y, z}
 * @param {Object} segment - Segment with {arcStart, arcEnd, ringRadius, tubeRadius, axis}
 * @returns {Object} Arc projection info {nearestPoint, angle, isOnArc, distanceAlongArc}
 */
export function findNearestPointOnArc(localPos, segment) {
    
    const axisComponent = localPos.x * segment.axis.x +
                         localPos.y * segment.axis.y +
                         localPos.z * segment.axis.z;

    const radialPos = {
        x: localPos.x - segment.axis.x * axisComponent,
        y: localPos.y - segment.axis.y * axisComponent,
        z: localPos.z - segment.axis.z * axisComponent
    };

    const radialDist = Math.sqrt(
        radialPos.x * radialPos.x +
        radialPos.y * radialPos.y +
        radialPos.z * radialPos.z
    );

    
    let angle = Math.atan2(radialPos.z, radialPos.x);

    
    const { clampedAngle, isOnArc } = clampAngleToArc(
        angle,
        segment.arcStart,
        segment.arcEnd
    );

    
    const centerlinePoint = {
        x: Math.cos(clampedAngle) * segment.ringRadius,
        y: axisComponent,
        z: Math.sin(clampedAngle) * segment.ringRadius
    };

    return {
        nearestPoint: centerlinePoint,
        angle: clampedAngle,
        isOnArc: isOnArc,
        distanceAlongArc: (clampedAngle - segment.arcStart) * segment.ringRadius,
        radialDistance: radialDist
    };
}

/**
 * Clamp angle to arc bounds
 * @param {number} angle - Angle to clamp
 * @param {number} arcStart - Arc start angle
 * @param {number} arcEnd - Arc end angle
 * @returns {Object} {clampedAngle, isOnArc}
 */
export function clampAngleToArc(angle, arcStart, arcEnd) {
    let clampedAngle = angle;
    let isOnArc = true;

    if (arcEnd > arcStart) {
        
        if (angle < arcStart || angle > arcEnd) {
            isOnArc = false;
            const distToStart = Math.abs(normalizeAngle(angle - arcStart));
            const distToEnd = Math.abs(normalizeAngle(angle - arcEnd));
            clampedAngle = distToStart < distToEnd ? arcStart : arcEnd;
        }
    } else {
        
        const normalizedAngle = normalizeAngle(angle);
        if (normalizedAngle > arcEnd && normalizedAngle < arcStart) {
            isOnArc = false;
            const distToStart = Math.abs(normalizeAngle(normalizedAngle - arcStart));
            const distToEnd = Math.abs(normalizeAngle(normalizedAngle - arcEnd));
            clampedAngle = distToStart < distToEnd ? arcStart : arcEnd;
        } else {
            clampedAngle = normalizedAngle;
        }
    }

    return { clampedAngle, isOnArc };
}

/**
 * Calculate distance from a point to the torus surface
 * @param {Object} position - Position {x, y, z}
 * @param {Object} centerlinePoint - Nearest point on centerline {x, y, z}
 * @param {number} tubeRadius - Radius of the torus tube
 * @returns {number} Distance from surface (positive = outside, negative = inside)
 */
export function distanceToTorusSurface(position, centerlinePoint, tubeRadius) {
    const dx = position.x - centerlinePoint.x;
    const dy = position.y - centerlinePoint.y;
    const dz = position.z - centerlinePoint.z;

    const distanceFromCenterline = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distanceFromCenterline - tubeRadius;
}

/**
 * Calculate normalized direction toward arc centerline
 * @param {Object} position - Current position {x, y, z}
 * @param {Object} centerlinePoint - Nearest centerline point {x, y, z}
 * @returns {Object} Normalized direction {x, y, z}
 */
export function directionToCenterline(position, centerlinePoint) {
    const dx = centerlinePoint.x - position.x;
    const dy = centerlinePoint.y - position.y;
    const dz = centerlinePoint.z - position.z;

    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 0.0001) {
        return { x: 0, y: 1, z: 0 }; 
    }

    return {
        x: dx / length,
        y: dy / length,
        z: dz / length
    };
}
