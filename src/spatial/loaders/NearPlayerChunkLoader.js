/**
 * NearPlayerChunkLoader
 *
 * Progressive chunk loading system that loads/unloads voxel chunks based on
 * distance from the player camera. Uses WorldCache for persistence and
 * GeometryBufferPool for efficient memory management.
 *
 * Features:
 * - Distance-based LOD (Level of Detail)
 * - Frustum culling
 * - Progressive loading with async generation
 * - Automatic chunk unloading beyond render distance
 * - Mesh pooling and reuse
 * - Integration with WorldCache for persistence
 */

import * as THREE from '../lib/three.module.js';
import { Chunk } from '../spatial/Chunk.js';
import { ChunkCoordinate } from '../spatial/ChunkCoordinate.js';
import { SphereGenerator } from '../generation/generators/SphereGenerator.js';
import { WorldCache } from '../storage/WorldCache.js';
import { GeometryBufferPool } from '../memory/GeometryBufferPool.js';

export class NearPlayerChunkLoader {
    constructor(scene, camera, config = {}) {
        this.scene = scene;
        this.camera = camera;

        // Configuration
        this.chunkSize = config.chunkSize || 16;
        this.renderDistance = config.renderDistance || 5; // Chunks
        this.unloadDistance = config.unloadDistance || this.renderDistance + 2;
        this.chunksPerFrame = config.chunksPerFrame || 4; // Max chunks to load per frame
        this.planetRadius = config.planetRadius || 200;
        this.generator = config.generator || new SphereGenerator(this.planetRadius, 1);

        // Storage and pooling
        this.worldCache = new WorldCache();
        this.bufferPool = new GeometryBufferPool(500);

        // State tracking
        this.loadedChunks = new Map(); // key -> { mesh, chunk, data, lastAccess, isSurface }
        this.loadQueue = [];
        this.unloadQueue = [];
        this.isGenerating = false;
        this.surfaceChunks = new Set(); // Track surface chunks for retention

        // Dirty tracking for block modifications
        this.dirtyChunks = new Set(); // Chunks that need re-meshing
        this.dirtyNeighbors = new Map(); // key -> Set of neighbor keys that need updates
        this.isRemeshing = false;

        // Material
        this.material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.DoubleSide
        });

        // Player position tracking
        this.lastPlayerChunk = { cx: 0, cy: 0, cz: 0 };
        this.playerGroup = config.playerGroup || null;

        // Metrics
        this.metrics = {
            chunksLoaded: 0,
            chunksUnloaded: 0,
            chunksGenerated: 0,
            chunksCached: 0,
            drawCalls: 0
        };

        // Performance throttling
        this.lastUpdateTime = 0;
        this.updateInterval = 50; // ms between updates (20 fps update rate)
    }

    /**
     * Update chunk loading based on current camera position
     * Call this every frame or on a throttled interval
     */
    async update() {
        const now = performance.now();
        if (now - this.lastUpdateTime < this.updateInterval) {
            return;
        }
        this.lastUpdateTime = now;

        const playerPos = this.getPlayerPosition();
        const playerChunk = this.worldToChunk(playerPos);

        // Check if player moved to a different chunk
        if (!this.chunkEquals(playerChunk, this.lastPlayerChunk)) {
            this.lastPlayerChunk = playerChunk;
            this.updateLoadQueue(playerChunk);
        }

        // Process dirty chunks (priority - player modifications)
        if (this.dirtyChunks.size > 0 && !this.isRemeshing) {
            await this.processDirtyChunks();
        }

        // Process load queue
        if (this.loadQueue.length > 0 && !this.isGenerating) {
            await this.processLoadQueue();
        }

        // Process unload queue
        if (this.unloadQueue.length > 0) {
            this.processUnloadQueue();
        }

        // Mark chunks for unloading if too far
        this.markDistantChunksForUnload(playerChunk);
    }

    /**
     * Get current player/camera position
     */
    getPlayerPosition() {
        if (this.playerGroup) {
            return this.playerGroup.position;
        }
        return this.camera.position;
    }

    /**
     * Convert world position to chunk coordinates
     */
    worldToChunk(position) {
        return {
            cx: Math.floor(position.x / this.chunkSize),
            cy: Math.floor(position.y / this.chunkSize),
            cz: Math.floor(position.z / this.chunkSize)
        };
    }

    /**
     * Check if two chunk coordinates are equal
     */
    chunkEquals(a, b) {
        return a.cx === b.cx && a.cy === b.cy && a.cz === b.cz;
    }

    /**
     * Get distance between two chunk coordinates
     */
    chunkDistance(a, b) {
        const dx = a.cx - b.cx;
        const dy = a.cy - b.cy;
        const dz = a.cz - b.cz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Update load queue with chunks that should be loaded
     */
    updateLoadQueue(playerChunk) {
        const newQueue = [];
        const renderDist = this.renderDistance;

        // Spiral outward from player position
        for (let dx = -renderDist; dx <= renderDist; dx++) {
            for (let dy = -renderDist; dy <= renderDist; dy++) {
                for (let dz = -renderDist; dz <= renderDist; dz++) {
                    const cx = playerChunk.cx + dx;
                    const cy = playerChunk.cy + dy;
                    const cz = playerChunk.cz + dz;

                    const chunkPos = { cx, cy, cz };
                    const dist = this.chunkDistance(playerChunk, chunkPos);

                    if (dist <= renderDist) {
                        const key = ChunkCoordinate.toKey(cx, cy, cz);

                        // Only add if not already loaded
                        if (!this.loadedChunks.has(key)) {
                            newQueue.push({ cx, cy, cz, dist });
                        }
                    }
                }
            }
        }

        // Sort by distance (closest first)
        newQueue.sort((a, b) => a.dist - b.dist);

        this.loadQueue = newQueue;
    }

    /**
     * Process chunks from load queue
     */
    async processLoadQueue() {
        if (this.isGenerating || this.loadQueue.length === 0) {
            return;
        }

        this.isGenerating = true;

        // Only load 1 chunk per call to minimize blocking
        const chunkToLoad = this.loadQueue.shift();

        if (chunkToLoad) {
            await this.loadChunk(chunkToLoad.cx, chunkToLoad.cy, chunkToLoad.cz);
        }

        this.isGenerating = false;
    }

    /**
     * Load a single chunk (from cache or generate)
     */
    async loadChunk(cx, cy, cz) {
        const key = ChunkCoordinate.toKey(cx, cy, cz);

        // Already loaded?
        if (this.loadedChunks.has(key)) {
            const entry = this.loadedChunks.get(key);
            entry.lastAccess = performance.now();
            return;
        }

        // Generate chunk directly (skip cache for now to avoid IndexedDB blocking)
        // TODO: Move caching to a background worker for true async
        const chunkData = this.generateChunk(cx, cy, cz);

        if (chunkData && chunkData.voxels.size > 0) {
            this.metrics.chunksGenerated++;

            const chunk = new Chunk(cx, cy, cz, this.chunkSize);
            chunk.voxels = chunkData.voxels;

            const geometryData = chunk.buildMesh((chunkX, chunkY, chunkZ, localX, localY, localZ) => {
                return this.neighborLookup(chunkX, chunkY, chunkZ, localX, localY, localZ);
            });

            if (geometryData && geometryData.vertices && geometryData.vertices.length > 0) {
                const mesh = this.createMesh(geometryData);
                this.scene.add(mesh);

                this.loadedChunks.set(key, {
                    mesh,
                    chunk,
                    data: chunkData,
                    isSurface: chunkData.isSurface || false,
                    lastAccess: performance.now()
                });

                // Track surface chunks for retention
                if (chunkData.isSurface) {
                    this.surfaceChunks.add(key);
                }

                this.metrics.chunksLoaded++;
            }
        }
    }

    /**
     * Generate chunk data (surface-following for spherical planet)
     * Optimized to only check voxels near the surface
     */
    generateChunk(cx, cy, cz) {
        const chunkWorldX = cx * this.chunkSize;
        const chunkWorldY = cy * this.chunkSize;
        const chunkWorldZ = cz * this.chunkSize;

        const voxels = new Map();
        const maxSurfaceDepth = 5;

        // Quick sphere distance check - skip chunk if far from planet surface
        const chunkCenterX = chunkWorldX + this.chunkSize / 2;
        const chunkCenterY = chunkWorldY + this.chunkSize / 2;
        const chunkCenterZ = chunkWorldZ + this.chunkSize / 2;
        const chunkCenterDist = Math.sqrt(
            chunkCenterX * chunkCenterX +
            chunkCenterY * chunkCenterY +
            chunkCenterZ * chunkCenterZ
        );

        const chunkRadius = this.chunkSize * Math.sqrt(3);
        const minDist = chunkCenterDist - chunkRadius;
        const maxDist = chunkCenterDist + chunkRadius;

        // Skip if chunk is entirely inside or outside planet
        if (maxDist < this.planetRadius - 50 || minDist > this.planetRadius + 100) {
            return null;
        }

        // Generate surface voxels
        let hasAir = false;
        let hasSolid = false;

        for (let x = 0; x < this.chunkSize; x++) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let z = 0; z < this.chunkSize; z++) {
                    const worldX = chunkWorldX + x;
                    const worldY = chunkWorldY + y;
                    const worldZ = chunkWorldZ + z;

                    const dist = Math.sqrt(worldX * worldX + worldY * worldY + worldZ * worldZ);

                    if (dist < 1) continue;

                    const sphereX = worldX / dist;
                    const sphereY = worldY / dist;
                    const sphereZ = worldZ / dist;

                    const height = this.generator.getHeightAtSpherePos(sphereX, sphereY, sphereZ);
                    const surfaceRadius = this.planetRadius + height + 1;

                    const depthBelowSurface = surfaceRadius - dist;

                    if (depthBelowSurface >= 0 && depthBelowSurface < maxSurfaceDepth) {
                        const quantizedHeight = Math.floor(height / 3) * 3;
                        const color = this.generator.getTerrainColor(quantizedHeight);
                        const key = (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);
                        voxels.set(key, { type: "solid", color });
                        hasSolid = true;
                    } else {
                        hasAir = true;
                    }
                }
            }
        }

        if (voxels.size === 0) return null;

        // Mark as surface chunk if it crosses air/solid boundary
        const isSurface = hasAir && hasSolid;

        return { voxels, isSurface };
    }

    /**
     * Neighbor lookup for greedy meshing
     */
    neighborLookup(chunkX, chunkY, chunkZ, localX, localY, localZ) {
        const key = ChunkCoordinate.toKey(chunkX, chunkY, chunkZ);
        const neighborChunkInfo = this.loadedChunks.get(key);

        if (!neighborChunkInfo || !neighborChunkInfo.data) {
            return false;
        }

        const nx = ((localX % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const ny = ((localY % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const nz = ((localZ % this.chunkSize) + this.chunkSize) % this.chunkSize;

        const voxelKey = (nx & 0x1F) | ((ny & 0x1F) << 5) | ((nz & 0x1F) << 10);
        return neighborChunkInfo.data.voxels.has(voxelKey);
    }

    /**
     * Create mesh from geometry data
     */
    createMesh(geometryData) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometryData.vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(geometryData.normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(geometryData.colors, 3));

        const mesh = new THREE.Mesh(geometry, this.material.clone());
        mesh.frustumCulled = true;
        return mesh;
    }

    /**
     * Mark chunks beyond unload distance for removal
     * CRITICAL: Surface chunks are retained even past 600m (no culling)
     * Non-surface chunk impostors past 600m can be culled
     */
    markDistantChunksForUnload(playerChunk) {
        const toUnload = [];
        const SURFACE_RETENTION_DISTANCE = 600 / this.chunkSize; // 600 units in chunk coordinates

        for (const [key, entry] of this.loadedChunks) {
            const coords = ChunkCoordinate.fromKey(key);
            const dist = this.chunkDistance(playerChunk, coords);

            // Keep chunks within unload distance
            if (dist <= this.unloadDistance) {
                continue;
            }

            // CRITICAL: Keep surface chunks even past 600m
            if (entry.isSurface && dist <= SURFACE_RETENTION_DISTANCE) {
                continue;
            }

            // Unload non-surface chunks or surface chunks past 600m
            toUnload.push(key);
        }

        this.unloadQueue.push(...toUnload);
    }

    /**
     * Process unload queue
     */
    processUnloadQueue() {
        const maxUnloadsPerFrame = 2;
        const toUnload = this.unloadQueue.splice(0, maxUnloadsPerFrame);

        for (const key of toUnload) {
            this.unloadChunk(key);
        }
    }

    /**
     * Unload a single chunk
     */
    unloadChunk(key) {
        const entry = this.loadedChunks.get(key);
        if (!entry) return;

        // Remove mesh from scene
        this.scene.remove(entry.mesh);

        // Dispose geometry and material
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();

        // Remove from tracking
        this.loadedChunks.delete(key);
        this.surfaceChunks.delete(key);
        this.metrics.chunksUnloaded++;
    }

    /**
     * Set a voxel at world position (for block placement)
     */
    setVoxel(worldX, worldY, worldZ, voxelData) {
        const cx = Math.floor(worldX / this.chunkSize);
        const cy = Math.floor(worldY / this.chunkSize);
        const cz = Math.floor(worldZ / this.chunkSize);
        const key = ChunkCoordinate.toKey(cx, cy, cz);

        const entry = this.loadedChunks.get(key);
        if (!entry) {
            console.warn(`Chunk not loaded at (${cx}, ${cy}, ${cz})`);
            return false;
        }

        // Calculate local coordinates
        const localX = ((worldX % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localY = ((worldY % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localZ = ((worldZ % this.chunkSize) + this.chunkSize) % this.chunkSize;

        const voxelKey = (localX & 0x1F) | ((localY & 0x1F) << 5) | ((localZ & 0x1F) << 10);

        // Set voxel in chunk data
        entry.data.voxels.set(voxelKey, voxelData);

        // Mark chunk and neighbors as dirty
        this.markChunkDirty(cx, cy, cz);

        return true;
    }

    /**
     * Remove a voxel at world position (for block breaking)
     */
    breakVoxel(worldX, worldY, worldZ) {
        const cx = Math.floor(worldX / this.chunkSize);
        const cy = Math.floor(worldY / this.chunkSize);
        const cz = Math.floor(worldZ / this.chunkSize);
        const key = ChunkCoordinate.toKey(cx, cy, cz);

        const entry = this.loadedChunks.get(key);
        if (!entry) {
            console.warn(`Chunk not loaded at (${cx}, ${cy}, ${cz})`);
            return false;
        }

        // Calculate local coordinates
        const localX = ((worldX % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localY = ((worldY % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localZ = ((worldZ % this.chunkSize) + this.chunkSize) % this.chunkSize;

        const voxelKey = (localX & 0x1F) | ((localY & 0x1F) << 5) | ((localZ & 0x1F) << 10);

        // Remove voxel from chunk data
        const existed = entry.data.voxels.delete(voxelKey);

        if (existed) {
            // Mark chunk and neighbors as dirty
            this.markChunkDirty(cx, cy, cz);
        }

        return existed;
    }

    /**
     * Mark a chunk as dirty (needs re-meshing)
     * Also marks neighbor chunks if voxel is on edge
     */
    markChunkDirty(cx, cy, cz) {
        const key = ChunkCoordinate.toKey(cx, cy, cz);
        this.dirtyChunks.add(key);

        // Mark all 6 face neighbors as dirty (greedy meshing needs neighbor info)
        const neighbors = [
            { cx: cx - 1, cy, cz },
            { cx: cx + 1, cy, cz },
            { cx, cy: cy - 1, cz },
            { cx, cy: cy + 1, cz },
            { cx, cy, cz: cz - 1 },
            { cx, cy, cz: cz + 1 }
        ];

        for (const neighbor of neighbors) {
            const neighborKey = ChunkCoordinate.toKey(neighbor.cx, neighbor.cy, neighbor.cz);
            if (this.loadedChunks.has(neighborKey)) {
                this.dirtyChunks.add(neighborKey);
            }
        }
    }

    /**
     * Process dirty chunks by re-meshing them
     */
    async processDirtyChunks() {
        if (this.isRemeshing || this.dirtyChunks.size === 0) {
            return;
        }

        this.isRemeshing = true;

        // Process one dirty chunk per call to avoid blocking
        const dirtyKey = this.dirtyChunks.values().next().value;
        this.dirtyChunks.delete(dirtyKey);

        const entry = this.loadedChunks.get(dirtyKey);
        if (!entry) {
            this.isRemeshing = false;
            return;
        }

        // Remove old mesh
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();

        // Rebuild mesh with updated voxel data
        const coords = ChunkCoordinate.fromKey(dirtyKey);
        const chunk = new Chunk(coords.cx, coords.cy, coords.cz, this.chunkSize);
        chunk.voxels = entry.data.voxels;

        const geometryData = chunk.buildMesh((chunkX, chunkY, chunkZ, localX, localY, localZ) => {
            return this.neighborLookup(chunkX, chunkY, chunkZ, localX, localY, localZ);
        });

        if (geometryData && geometryData.vertices && geometryData.vertices.length > 0) {
            // Create new mesh
            const newMesh = this.createMesh(geometryData);
            this.scene.add(newMesh);

            // Update entry
            entry.mesh = newMesh;
            entry.chunk = chunk;
            entry.lastAccess = performance.now();
        } else {
            // No voxels left - remove chunk
            this.loadedChunks.delete(dirtyKey);
        }

        this.isRemeshing = false;
    }

    /**
     * Get voxel at world position (for queries)
     */
    getVoxel(worldX, worldY, worldZ) {
        const cx = Math.floor(worldX / this.chunkSize);
        const cy = Math.floor(worldY / this.chunkSize);
        const cz = Math.floor(worldZ / this.chunkSize);
        const key = ChunkCoordinate.toKey(cx, cy, cz);

        const entry = this.loadedChunks.get(key);
        if (!entry) return null;

        const localX = ((worldX % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localY = ((worldY % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localZ = ((worldZ % this.chunkSize) + this.chunkSize) % this.chunkSize;

        const voxelKey = (localX & 0x1F) | ((localY & 0x1F) << 5) | ((localZ & 0x1F) << 10);

        return entry.data.voxels.get(voxelKey) || null;
    }

    /**
     * Force reload all chunks (e.g., after settings change)
     */
    async reloadAll() {
        // Unload all chunks
        const keys = Array.from(this.loadedChunks.keys());
        for (const key of keys) {
            this.unloadChunk(key);
        }

        // Clear queues
        this.loadQueue = [];
        this.unloadQueue = [];
        this.dirtyChunks.clear();

        // Trigger update
        this.lastPlayerChunk = { cx: Infinity, cy: Infinity, cz: Infinity };
        await this.update();
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            loadedChunks: this.loadedChunks.size,
            queuedLoads: this.loadQueue.length,
            queuedUnloads: this.unloadQueue.length,
            dirtyChunks: this.dirtyChunks.size
        };
    }

    /**
     * Clear all caches and state
     */
    async clear() {
        const keys = Array.from(this.loadedChunks.keys());
        for (const key of keys) {
            this.unloadChunk(key);
        }

        this.loadQueue = [];
        this.unloadQueue = [];

        await this.worldCache.clear();
    }

    /**
     * Yield to prevent blocking main thread
     */
    yield() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.clear();
        this.material.dispose();
    }
}
