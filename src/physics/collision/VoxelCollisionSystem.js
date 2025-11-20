import * as THREE from '../lib/three.module.js';
import { CollisionMeshRegistry } from './CollisionMeshRegistry.js';

/**
 * VoxelCollisionSystem - Handles collision with voxel surfaces
 *
 * Architecture (Single Source of Truth):
 * - Uses rendered mesh geometry directly for collision
 * - No duplicate voxel cache - meshes ARE collision surfaces
 * - Integrates with CollisionMeshRegistry for spatial queries
 * - Server-verifiable (same mesh data for rendering and collision)
 *
 * Performance:
 * - O(1) spatial lookup via CollisionMeshRegistry
 * - AABB pre-filtering before raycasting
 * - Reusable raycaster instance (zero GC pressure)
 * - Only queries nearby chunks (typically 1-27)
 */
export class VoxelCollisionSystem {
    constructor(planetRadius, chunkSize = 16, collisionRegistry = null) {
        this.planetRadius = planetRadius;
        this.chunkSize = chunkSize;
        this.gravityRadius = 50;

        // Collision registry - single source of truth for collision meshes
        this.collisionRegistry = collisionRegistry || new CollisionMeshRegistry(chunkSize);

        // Raycast configuration
        this.maxRaycastDistance = 20; // Maximum ground check distance
        this.searchRadius = 3; // Chunk radius to search for collision

        // Performance tracking
        this.stats = {
            totalQueries: 0,
            successfulHits: 0,
            averageQueryTime: 0
        };
    }

    /**
     * Check if player position is within planet gravity radius
     */
    isWithinGravityRadius(playerPos, planetCenter) {
        const distFromCenter = playerPos.distanceTo(planetCenter);
        const distFromSurface = distFromCenter - this.planetRadius;
        return distFromSurface <= this.gravityRadius;
    }

    /**
     * Get ground height at player position using rendered mesh collision
     *
     * Uses CollisionMeshRegistry to raycast against actual rendered geometry
     * This is the SAME geometry that's visible - single source of truth
     *
     * @param {THREE.Vector3} playerPos - Player position in world space
     * @param {THREE.Vector3} planetCenter - Planet center position
     * @returns {THREE.Vector3|null} Ground position or null if no ground found
     */
    getGroundHeight(playerPos, planetCenter) {
        const startTime = performance.now();
        this.stats.totalQueries++;

        // Only check collision within gravity radius
        if (!this.isWithinGravityRadius(playerPos, planetCenter)) {
            return null;
        }

        // Calculate ray from player toward planet center
        const toPlanetCenter = planetCenter.clone().sub(playerPos);
        const rayDirection = toPlanetCenter.normalize();

        // Start raycast slightly above player position
        const rayOrigin = playerPos.clone();

        // Raycast against rendered meshes
        const hit = this.collisionRegistry.raycast(
            rayOrigin,
            rayDirection,
            this.maxRaycastDistance,
            this.searchRadius
        );

        if (hit) {
            this.stats.successfulHits++;

            // Update average query time
            const queryTime = performance.now() - startTime;
            this.stats.averageQueryTime =
                (this.stats.averageQueryTime * (this.stats.totalQueries - 1) + queryTime) /
                this.stats.totalQueries;

            return hit.point;
        }

        return null;
    }

    /**
     * Register a collision mesh (called when chunk is loaded)
     * This makes rendered geometry available for collision
     */
    registerCollisionMesh(chunkX, chunkY, chunkZ, mesh) {
        this.collisionRegistry.registerMesh(chunkX, chunkY, chunkZ, mesh);
    }

    /**
     * Unregister a collision mesh (called when chunk is unloaded)
     */
    unregisterCollisionMesh(chunkX, chunkY, chunkZ) {
        this.collisionRegistry.unregisterMesh(chunkX, chunkY, chunkZ);
    }

    /**
     * Raycast in arbitrary direction (advanced collision queries)
     *
     * @param {THREE.Vector3} origin - Ray origin
     * @param {THREE.Vector3} direction - Ray direction (will be normalized)
     * @param {number} maxDistance - Maximum raycast distance
     * @returns {Object|null} Hit result with point, normal, distance, mesh
     */
    raycast(origin, direction, maxDistance = 10) {
        return this.collisionRegistry.raycast(
            origin,
            direction.clone().normalize(),
            maxDistance,
            this.searchRadius
        );
    }

    /**
     * Check if a sphere overlaps any collision surface
     * Useful for entity collision detection
     *
     * @param {THREE.Vector3} center - Sphere center in world space
     * @param {number} radius - Sphere radius
     * @returns {boolean} True if overlap detected
     */
    checkSphereCollision(center, radius) {
        return this.collisionRegistry.sphereOverlap(center, radius);
    }

    /**
     * Check if player should be grounded based on distance to surface
     */
    checkGrounded(playerPos, groundHeight, threshold = 0.1) {
        if (!groundHeight) return false;

        const distToGround = playerPos.distanceTo(groundHeight);
        return distToGround <= threshold;
    }

    /**
     * Get collision normal at ground position
     * Uses actual surface normal from mesh if available, otherwise radial
     *
     * @param {THREE.Vector3} groundPos - Ground hit position
     * @param {THREE.Vector3} planetCenter - Planet center
     * @returns {THREE.Vector3} Surface normal vector
     */
    getGroundNormal(groundPos, planetCenter) {
        // Try to get actual surface normal from last raycast
        const rayDir = planetCenter.clone().sub(groundPos).normalize();
        const hit = this.collisionRegistry.raycast(groundPos, rayDir, 0.1, 1);

        if (hit && hit.normal) {
            return hit.normal;
        }

        // Fallback: radial normal from planet center
        return groundPos.clone()
            .sub(planetCenter)
            .normalize();
    }

    /**
     * Get performance statistics
     */
    getStats() {
        const registryStats = this.collisionRegistry.getStats();

        return {
            collision: {
                ...this.stats,
                hitRate: this.stats.totalQueries > 0
                    ? ((this.stats.successfulHits / this.stats.totalQueries) * 100).toFixed(1) + '%'
                    : '0%'
            },
            registry: registryStats
        };
    }

    /**
     * Clear all collision meshes
     */
    clear() {
        this.collisionRegistry.clear();
        this.stats = {
            totalQueries: 0,
            successfulHits: 0,
            averageQueryTime: 0
        };
    }

    /**
     * Get reference to collision registry (for advanced usage)
     */
    getRegistry() {
        return this.collisionRegistry;
    }
}
