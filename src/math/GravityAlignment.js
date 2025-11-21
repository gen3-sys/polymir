/**
 * GravityAlignment - Compute rotation to align schematic gravity to surface normal
 *
 * When placing a schematic on a planet surface:
 * 1. Schematic has a gravity_vector (which way is "down" for the build)
 * 2. Surface has a normal (points away from gravitational center)
 * 3. We need rotation that aligns gravity_vector to -surface_normal
 *
 * This allows buildings, trees, etc. to automatically orient correctly
 * on any surface of a spherical planet.
 */

export class GravityAlignment {
    /**
     * Compute quaternion that rotates schematic's gravity vector to align with surface
     *
     * @param {Array<number>} gravityVector - Schematic's "down" direction [x, y, z] (normalized)
     * @param {Array<number>} surfaceNormal - Surface normal pointing away from gravity center [x, y, z] (normalized)
     * @returns {Array<number>} Quaternion [x, y, z, w] to apply to schematic
     */
    static computeAlignmentQuaternion(gravityVector, surfaceNormal) {
        // We want to rotate gravityVector to point toward -surfaceNormal
        // (gravity points toward center, surface normal points away)
        const targetDirection = [
            -surfaceNormal[0],
            -surfaceNormal[1],
            -surfaceNormal[2]
        ];

        return this.quaternionFromToRotation(gravityVector, targetDirection);
    }

    /**
     * Compute quaternion that rotates vector 'from' to vector 'to'
     *
     * @param {Array<number>} from - Source direction [x, y, z] (normalized)
     * @param {Array<number>} to - Target direction [x, y, z] (normalized)
     * @returns {Array<number>} Quaternion [x, y, z, w]
     */
    static quaternionFromToRotation(from, to) {
        // Handle parallel vectors (no rotation needed)
        const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];

        if (dot > 0.999999) {
            // Vectors are parallel, return identity quaternion
            return [0, 0, 0, 1];
        }

        if (dot < -0.999999) {
            // Vectors are opposite, rotate 180 degrees around any perpendicular axis
            let axis = this.cross([1, 0, 0], from);
            if (this.lengthSquared(axis) < 0.000001) {
                axis = this.cross([0, 1, 0], from);
            }
            axis = this.normalize(axis);
            // 180-degree rotation: quaternion is [axis.x, axis.y, axis.z, 0]
            return [axis[0], axis[1], axis[2], 0];
        }

        // General case: rotation axis = cross(from, to), angle from dot product
        const axis = this.cross(from, to);
        const s = Math.sqrt((1 + dot) * 2);
        const invS = 1 / s;

        return [
            axis[0] * invS,
            axis[1] * invS,
            axis[2] * invS,
            s * 0.5
        ];
    }

    /**
     * Compute surface normal at a point on a spherical body
     *
     * @param {Array<number>} position - Point position [x, y, z]
     * @param {Array<number>} gravitationalCenter - Center of gravity [x, y, z]
     * @returns {Array<number>} Normalized surface normal [x, y, z]
     */
    static computeSurfaceNormal(position, gravitationalCenter) {
        const direction = [
            position[0] - gravitationalCenter[0],
            position[1] - gravitationalCenter[1],
            position[2] - gravitationalCenter[2]
        ];
        return this.normalize(direction);
    }

    /**
     * Apply quaternion rotation to a point
     *
     * @param {Array<number>} point - Point [x, y, z]
     * @param {Array<number>} quaternion - Quaternion [x, y, z, w]
     * @returns {Array<number>} Rotated point [x, y, z]
     */
    static rotatePoint(point, quaternion) {
        const [qx, qy, qz, qw] = quaternion;
        const [px, py, pz] = point;

        // Quaternion rotation: q * p * q^-1
        // Using optimized formula
        const ix = qw * px + qy * pz - qz * py;
        const iy = qw * py + qz * px - qx * pz;
        const iz = qw * pz + qx * py - qy * px;
        const iw = -qx * px - qy * py - qz * pz;

        return [
            ix * qw + iw * -qx + iy * -qz - iz * -qy,
            iy * qw + iw * -qy + iz * -qx - ix * -qz,
            iz * qw + iw * -qz + ix * -qy - iy * -qx
        ];
    }

    /**
     * Compute final world position for a schematic voxel
     *
     * @param {Array<number>} localVoxelPos - Voxel position within schematic [x, y, z]
     * @param {Array<number>} schematicBounds - Schematic dimensions [sizeX, sizeY, sizeZ]
     * @param {Array<number>} anchorPoint - Anchor point normalized [0-1, 0-1, 0-1]
     * @param {Array<number>} placementPosition - World position of placement [x, y, z]
     * @param {Array<number>} alignmentQuaternion - Rotation quaternion [x, y, z, w]
     * @returns {Array<number>} World position [x, y, z]
     */
    static computeWorldPosition(localVoxelPos, schematicBounds, anchorPoint, placementPosition, alignmentQuaternion) {
        // 1. Offset voxel position by anchor point (so anchor is at origin)
        const anchorOffset = [
            anchorPoint[0] * schematicBounds[0],
            anchorPoint[1] * schematicBounds[1],
            anchorPoint[2] * schematicBounds[2]
        ];

        const centered = [
            localVoxelPos[0] - anchorOffset[0],
            localVoxelPos[1] - anchorOffset[1],
            localVoxelPos[2] - anchorOffset[2]
        ];

        // 2. Apply rotation
        const rotated = this.rotatePoint(centered, alignmentQuaternion);

        // 3. Translate to world position
        return [
            rotated[0] + placementPosition[0],
            rotated[1] + placementPosition[1],
            rotated[2] + placementPosition[2]
        ];
    }

    /**
     * Full placement computation: given schematic metadata and placement location,
     * compute the alignment quaternion
     *
     * @param {Object} schematic - Schematic with gravityVector property
     * @param {Array<number>} placementPosition - Where to place [x, y, z]
     * @param {Array<number>} gravitationalCenter - Planet center [x, y, z]
     * @returns {Array<number>} Quaternion [x, y, z, w]
     */
    static computePlacementRotation(schematic, placementPosition, gravitationalCenter) {
        const gravityVector = schematic.gravityVector || schematic.metadata?.gravityVector || [0, -1, 0];
        const surfaceNormal = this.computeSurfaceNormal(placementPosition, gravitationalCenter);
        return this.computeAlignmentQuaternion(gravityVector, surfaceNormal);
    }

    // =============================================
    // Vector utilities
    // =============================================

    static cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    static dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    static lengthSquared(v) {
        return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    }

    static length(v) {
        return Math.sqrt(this.lengthSquared(v));
    }

    static normalize(v) {
        const len = this.length(v);
        if (len < 0.000001) return [0, 0, 0];
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    /**
     * Multiply two quaternions
     */
    static multiplyQuaternions(a, b) {
        const [ax, ay, az, aw] = a;
        const [bx, by, bz, bw] = b;

        return [
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz
        ];
    }

    /**
     * Create quaternion from axis-angle
     */
    static quaternionFromAxisAngle(axis, angle) {
        const halfAngle = angle * 0.5;
        const s = Math.sin(halfAngle);
        return [
            axis[0] * s,
            axis[1] * s,
            axis[2] * s,
            Math.cos(halfAngle)
        ];
    }
}

export default GravityAlignment;
