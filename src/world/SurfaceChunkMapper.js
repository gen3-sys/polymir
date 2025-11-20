import * as THREE from '../lib/three.module.js';

/**
 * SurfaceChunkMapper - Maps flat cubic chunks onto curved surfaces
 *
 * Chunks remain flat cubic voxel data, but are positioned and rendered
 * as if they're on a curved surface (sphere, torus, etc.)
 *
 * Key concept: Chunks use (u, v, layer) coordinates instead of (x, y, z)
 */
export class SurfaceChunkMapper {
    constructor(gravityShape, chunkSize = 16) {
        this.gravityShape = gravityShape;
        this.chunkSize = chunkSize;
        this.type = gravityShape.type;
    }

    /**
     * Convert world position to surface coordinates (u, v, depth)
     * u, v = surface parameters (like texture coordinates)
     * depth = distance from surface (for layers)
     */
    worldToSurface(worldX, worldY, worldZ) {
        switch (this.type) {
            case 'ring':
                return this.worldToRingSurface(worldX, worldY, worldZ);
            case 'point':
                return this.worldToSphereSurface(worldX, worldY, worldZ);
            case 'plane':
                return this.worldToPlaneSurface(worldX, worldY, worldZ);
            default:
                return { u: worldX, v: worldZ, depth: worldY };
        }
    }

    /**
     * Convert surface coordinates back to world position
     * This is where the magic happens - flat chunks get positioned on curved surface
     */
    surfaceToWorld(u, v, depth = 0) {
        switch (this.type) {
            case 'ring':
                return this.ringSurfaceToWorld(u, v, depth);
            case 'point':
                return this.sphereSurfaceToWorld(u, v, depth);
            case 'plane':
                return this.planeSurfaceToWorld(u, v, depth);
            default:
                return new THREE.Vector3(u, depth, v);
        }
    }

    /**
     * TORUS/RING SURFACE MAPPING
     * u = angle around major radius (0 to 2π)
     * v = angle around minor radius (0 to 2π)
     * depth = distance from surface along normal
     */
    worldToRingSurface(x, y, z) {
        const R = this.gravityShape.params.majorRadius;
        const r = this.gravityShape.params.minorRadius;

        // Get angle around Y axis (major radius)
        const u = Math.atan2(z, x);

        // Distance from Y axis
        const distFromAxis = Math.sqrt(x * x + z * z);

        // Point on ring centerline
        const ringDist = distFromAxis - R;

        // Get angle around tube (minor radius)
        const v = Math.atan2(y, ringDist);

        // Depth from surface
        const depth = Math.sqrt(ringDist * ringDist + y * y) - r;

        return { u, v, depth };
    }

    ringSurfaceToWorld(u, v, depth = 0) {
        const R = this.gravityShape.params.majorRadius;
        const r = this.gravityShape.params.minorRadius + depth;

        // Torus parametric equations
        const x = (R + r * Math.cos(v)) * Math.cos(u);
        const y = r * Math.sin(v);
        const z = (R + r * Math.cos(v)) * Math.sin(u);

        return new THREE.Vector3(x, y, z);
    }

    /**
     * SPHERE SURFACE MAPPING
     * u = longitude (0 to 2π)
     * v = latitude (-π/2 to π/2)
     * depth = distance from surface
     */
    worldToSphereSurface(x, y, z) {
        const dist = Math.sqrt(x * x + y * y + z * z);
        const radius = this.gravityShape.params.radius || 100;

        const u = Math.atan2(z, x); // Longitude
        const v = Math.asin(y / Math.max(dist, 0.001)); // Latitude

        const depth = dist - radius;

        return { u, v, depth };
    }

    sphereSurfaceToWorld(u, v, depth = 0) {
        const r = (this.gravityShape.params.radius || 100) + depth;

        const x = r * Math.cos(v) * Math.cos(u);
        const y = r * Math.sin(v);
        const z = r * Math.cos(v) * Math.sin(u);

        return new THREE.Vector3(x, y, z);
    }

    /**
     * PLANE SURFACE MAPPING (trivial - just X,Z)
     */
    worldToPlaneSurface(x, y, z) {
        return { u: x, v: z, depth: y };
    }

    planeSurfaceToWorld(u, v, depth = 0) {
        return new THREE.Vector3(u, depth, v);
    }

    /**
     * Get surface normal at (u, v) coordinates
     * Used for camera orientation and gravity direction
     */
    getSurfaceNormal(u, v) {
        switch (this.type) {
            case 'ring':
                return this.getRingNormal(u, v);
            case 'point':
                return this.getSphereNormal(u, v);
            case 'plane':
                return new THREE.Vector3(0, 1, 0);
            default:
                return new THREE.Vector3(0, 1, 0);
        }
    }

    getRingNormal(u, v) {
        const R = this.gravityShape.params.majorRadius;

        // Normal points away from tube centerline
        const nx = Math.cos(v) * Math.cos(u);
        const ny = Math.sin(v);
        const nz = Math.cos(v) * Math.sin(u);

        return new THREE.Vector3(nx, ny, nz).normalize();
    }

    getSphereNormal(u, v) {
        const nx = Math.cos(v) * Math.cos(u);
        const ny = Math.sin(v);
        const nz = Math.cos(v) * Math.sin(u);

        return new THREE.Vector3(nx, ny, nz).normalize();
    }

    /**
     * Get chunk's surface coordinates from chunk indices
     * Maps chunk grid (cx, cy, cz) to surface parameters (u, v, layer)
     */
    getChunkSurfaceCoords(cx, cy, cz) {
        // Convert chunk corner to world position
        const worldX = cx * this.chunkSize;
        const worldY = cy * this.chunkSize;
        const worldZ = cz * this.chunkSize;

        // Get surface coordinates
        return this.worldToSurface(worldX, worldY, worldZ);
    }

    /**
     * Get world position for chunk based on surface coordinates
     * This positions the chunk "on" the surface
     */
    getChunkWorldPosition(u, v, layer = 0) {
        const depth = layer * this.chunkSize;
        return this.surfaceToWorld(u, v, depth);
    }

    /**
     * Calculate bend transform matrix for a chunk based on distance from player
     *
     * distance < nearRadius: No bend (flat)
     * distance > nearRadius: Progressive bend toward surface curvature
     *
     * Returns: transformation matrix to apply to vertices
     */
    getChunkBendTransform(chunkU, chunkV, playerU, playerV, nearRadius = 3, farRadius = 10) {
        // Calculate distance in surface coordinates
        const du = this.angleDifference(chunkU, playerU);
        const dv = this.angleDifference(chunkV, playerV);
        const surfaceDist = Math.sqrt(du * du + dv * dv);

        // Convert to chunk units (approximate)
        const R = this.gravityShape.params.majorRadius || 100;
        const r = this.gravityShape.params.minorRadius || 50;
        const avgRadius = (R + r) / 2;
        const chunkDist = (surfaceDist * avgRadius) / this.chunkSize;

        // No bend if within near radius
        if (chunkDist < nearRadius) {
            return new THREE.Matrix4(); // Identity matrix
        }

        // Calculate bend factor (0 = no bend, 1 = full bend)
        const bendFactor = Math.min(1, (chunkDist - nearRadius) / (farRadius - nearRadius));

        // Create transformation matrix
        // For now, return identity - actual bend will be in shader
        const matrix = new THREE.Matrix4();
        matrix.userData = { bendFactor }; // Store for shader

        return matrix;
    }

    /**
     * Helper: Calculate angular difference (handles wrapping)
     */
    angleDifference(a1, a2) {
        let diff = a1 - a2;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return diff;
    }

    /**
     * Wrap surface coordinates (for infinite wrapping on torus)
     */
    wrapSurfaceCoords(u, v) {
        const wrappedU = ((u % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const wrappedV = ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        return { u: wrappedU, v: wrappedV };
    }

    /**
     * Get chunks to load around player in surface coordinates
     * Returns array of {u, v, layer} surface chunk coords
     */
    getChunksAroundPlayer(playerU, playerV, radius = 8, maxLayers = 2) {
        const chunks = [];
        const chunkAngleU = this.chunkSize / (this.gravityShape.params.majorRadius || 100);
        const chunkAngleV = this.chunkSize / (this.gravityShape.params.minorRadius || 50);

        // Generate in a grid around player
        for (let du = -radius; du <= radius; du++) {
            for (let dv = -radius; dv <= radius; dv++) {
                const u = playerU + du * chunkAngleU;
                const v = playerV + dv * chunkAngleV;

                // Wrap coordinates
                const wrapped = this.wrapSurfaceCoords(u, v);

                // Add surface layer and layers below
                for (let layer = 0; layer <= maxLayers; layer++) {
                    chunks.push({
                        u: wrapped.u,
                        v: wrapped.v,
                        layer: layer
                    });
                }
            }
        }

        return chunks;
    }
}

export default SurfaceChunkMapper;
