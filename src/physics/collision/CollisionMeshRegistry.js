import { ChunkCoordinate } from '../spatial/ChunkCoordinate.js';
import * as THREE from '../lib/three.module.js';

/**
 * CollisionMeshRegistry - Centralized tracking of collision-enabled meshes
 *
 * Architecture:
 * - Single source of truth: rendered meshes ARE collision meshes
 * - Spatial grid for O(1) chunk coordinate lookup
 * - Automatic sync with rendering pipeline
 * - Server-verifiable (same mesh data used for both visual and collision)
 *
 * Performance:
 * - O(1) mesh registration/lookup by chunk coordinate
 * - O(k) spatial queries where k = nearby chunks (typically 1-27)
 * - Zero duplication of geometry data
 * - Reusable raycaster instance
 */
export class CollisionMeshRegistry {
    constructor(chunkSize = 16) {
        this.chunkSize = chunkSize;

        // Primary storage: chunk key → THREE.Mesh
        this.meshes = new Map();

        // Spatial grid: chunk coordinate → chunk key for O(1) spatial lookup
        this.spatialGrid = new Map();

        // Reusable raycaster (avoid GC pressure)
        this.raycaster = new THREE.Raycaster();

        // Performance tracking
        this.stats = {
            totalMeshes: 0,
            totalRaycasts: 0,
            cacheHits: 0
        };
    }

    /**
     * Register a mesh for collision detection
     * Call this when a chunk mesh is added to the scene
     */
    registerMesh(chunkX, chunkY, chunkZ, mesh) {
        const key = ChunkCoordinate.toKey(chunkX, chunkY, chunkZ);

        // Store mesh by chunk key
        this.meshes.set(key, mesh);

        // Add to spatial grid for fast coordinate-based lookup
        const gridKey = this.getGridKey(chunkX, chunkY, chunkZ);
        this.spatialGrid.set(gridKey, key);

        // Tag mesh with chunk coordinates for reverse lookup
        mesh.userData.chunkCoord = { x: chunkX, y: chunkY, z: chunkZ };
        mesh.userData.collisionEnabled = true;

        this.stats.totalMeshes++;
    }

    /**
     * Unregister a mesh from collision detection
     * Call this when a chunk mesh is removed from the scene
     */
    unregisterMesh(chunkX, chunkY, chunkZ) {
        const key = ChunkCoordinate.toKey(chunkX, chunkY, chunkZ);
        const mesh = this.meshes.get(key);

        if (mesh) {
            // Clean up userData
            if (mesh.userData) {
                mesh.userData.collisionEnabled = false;
                delete mesh.userData.chunkCoord;
            }

            // Remove from storage
            this.meshes.delete(key);

            // Remove from spatial grid
            const gridKey = this.getGridKey(chunkX, chunkY, chunkZ);
            this.spatialGrid.delete(gridKey);

            this.stats.totalMeshes--;
            return true;
        }

        return false;
    }

    /**
     * Get mesh at specific chunk coordinate
     * O(1) lookup
     */
    getMeshAt(chunkX, chunkY, chunkZ) {
        const key = ChunkCoordinate.toKey(chunkX, chunkY, chunkZ);
        return this.meshes.get(key);
    }

    /**
     * Get all meshes within a radius of a world position
     * Returns array of meshes sorted by distance
     */
    getMeshesNear(worldPos, radiusInChunks = 3) {
        const centerChunkX = Math.floor(worldPos.x / this.chunkSize);
        const centerChunkY = Math.floor(worldPos.y / this.chunkSize);
        const centerChunkZ = Math.floor(worldPos.z / this.chunkSize);

        const nearbyMeshes = [];

        // Query spatial grid in radius
        for (let dx = -radiusInChunks; dx <= radiusInChunks; dx++) {
            for (let dy = -radiusInChunks; dy <= radiusInChunks; dy++) {
                for (let dz = -radiusInChunks; dz <= radiusInChunks; dz++) {
                    const cx = centerChunkX + dx;
                    const cy = centerChunkY + dy;
                    const cz = centerChunkZ + dz;

                    const mesh = this.getMeshAt(cx, cy, cz);
                    if (mesh) {
                        nearbyMeshes.push({
                            mesh,
                            distance: Math.sqrt(dx * dx + dy * dy + dz * dz)
                        });
                    }
                }
            }
        }

        // Sort by distance for optimal raycast order
        nearbyMeshes.sort((a, b) => a.distance - b.distance);

        return nearbyMeshes.map(entry => entry.mesh);
    }

    /**
     * Raycast against registered collision meshes
     * Returns closest intersection or null
     *
     * @param {THREE.Vector3} origin - Ray origin in world space
     * @param {THREE.Vector3} direction - Ray direction (normalized)
     * @param {number} maxDistance - Maximum raycast distance
     * @param {number} searchRadius - Chunk radius to search (default: 3)
     * @returns {Object|null} Intersection data: { point, normal, distance, mesh, face }
     */
    raycast(origin, direction, maxDistance = 10, searchRadius = 3) {
        this.stats.totalRaycasts++;

        // Get nearby meshes using spatial query
        const nearbyMeshes = this.getMeshesNear(origin, searchRadius);

        if (nearbyMeshes.length === 0) {
            return null;
        }

        // Configure raycaster
        this.raycaster.set(origin, direction);
        this.raycaster.far = maxDistance;

        // Raycast against nearby meshes
        const intersections = this.raycaster.intersectObjects(nearbyMeshes, false);

        if (intersections.length > 0) {
            this.stats.cacheHits++;
            const hit = intersections[0];

            return {
                point: hit.point.clone(),
                normal: hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0),
                distance: hit.distance,
                mesh: hit.object,
                face: hit.face,
                chunkCoord: hit.object.userData.chunkCoord
            };
        }

        return null;
    }

    /**
     * Check if a sphere overlaps any collision mesh
     * Useful for proximity checks and collision detection
     */
    sphereOverlap(center, radius) {
        const searchRadius = Math.ceil(radius / this.chunkSize) + 1;
        const nearbyMeshes = this.getMeshesNear(center, searchRadius);

        for (const mesh of nearbyMeshes) {
            // Fast AABB check first
            if (!mesh.geometry.boundingBox) {
                mesh.geometry.computeBoundingBox();
            }

            const bbox = mesh.geometry.boundingBox.clone();
            bbox.applyMatrix4(mesh.matrixWorld);

            // Check if sphere overlaps bounding box
            const closestPoint = bbox.clampPoint(center, new THREE.Vector3());
            const distance = closestPoint.distanceTo(center);

            if (distance <= radius) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get spatial grid key for chunk coordinate
     * @private
     */
    getGridKey(chunkX, chunkY, chunkZ) {
        // Use ChunkCoordinate for consistency
        return ChunkCoordinate.toKey(chunkX, chunkY, chunkZ);
    }

    /**
     * Check if a chunk has collision mesh registered
     */
    hasCollisionAt(chunkX, chunkY, chunkZ) {
        const key = ChunkCoordinate.toKey(chunkX, chunkY, chunkZ);
        return this.meshes.has(key);
    }

    /**
     * Get all registered mesh keys
     */
    getAllKeys() {
        return Array.from(this.meshes.keys());
    }

    /**
     * Clear all registered meshes
     */
    clear() {
        // Clean up userData for all meshes
        for (const mesh of this.meshes.values()) {
            if (mesh.userData) {
                mesh.userData.collisionEnabled = false;
                delete mesh.userData.chunkCoord;
            }
        }

        this.meshes.clear();
        this.spatialGrid.clear();
        this.stats.totalMeshes = 0;
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.totalRaycasts > 0
                ? (this.stats.cacheHits / this.stats.totalRaycasts * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Debug: Visualize collision mesh bounding boxes
     */
    createDebugHelpers(scene) {
        const helpers = [];

        for (const mesh of this.meshes.values()) {
            if (!mesh.geometry.boundingBox) {
                mesh.geometry.computeBoundingBox();
            }

            const bbox = mesh.geometry.boundingBox.clone();
            bbox.applyMatrix4(mesh.matrixWorld);

            const helper = new THREE.Box3Helper(bbox, 0x00ff00);
            scene.add(helper);
            helpers.push(helper);
        }

        return helpers;
    }
}
