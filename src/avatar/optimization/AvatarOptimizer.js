/**
 * AvatarOptimizer - Performance optimization manager for avatar system
 *
 * Manages all performance optimizations for rendering 50+ avatars at 60fps.
 * Coordinates LOD, culling, batching, and resource management.
 *
 * Features:
 * - Frustum culling with spatial hashing
 * - Distance-based update rates with hysteresis
 * - Animation LOD (fewer bone updates at distance)
 * - O(1) memory pooling via free lists
 * - Performance profiling and metrics
 */

import * as THREE from 'three';

// Performance configuration
const CONFIG = {
    // Distance thresholds
    FULL_UPDATE_DISTANCE: 20,
    MEDIUM_UPDATE_DISTANCE: 50,
    LOW_UPDATE_DISTANCE: 100,
    CULL_DISTANCE: 200,

    // Hysteresis to prevent flickering (units)
    LOD_HYSTERESIS: 3,

    // Update rates (per second)
    FULL_UPDATE_RATE: 60,
    MEDIUM_UPDATE_RATE: 30,
    LOW_UPDATE_RATE: 15,
    IMPOSTOR_UPDATE_RATE: 5,

    // Spatial hashing
    CELL_SIZE: 32,

    // Pool sizes
    MESH_POOL_SIZE: 100,
    MATERIAL_POOL_SIZE: 50,
    GEOMETRY_POOL_SIZE: 100,

    // Cleanup
    POOL_CLEANUP_INTERVAL: 60000,  // 60 seconds
    POOL_MAX_AGE: 120000           // 2 minutes unused
};

/**
 * O(1) Object Pool using a free list
 */
class ObjectPool {
    constructor(factory, reset, initialSize = 0) {
        this.factory = factory;     // () => new object
        this.reset = reset;         // (obj) => reset object for reuse
        this.pool = [];             // Array of pooled objects
        this.freeList = [];         // Stack of free indices (O(1) push/pop)
        this.inUseCount = 0;
        this.stats = {
            created: 0,
            acquired: 0,
            released: 0,
            hits: 0,
            misses: 0
        };

        // Pre-allocate
        for (let i = 0; i < initialSize; i++) {
            this.pool.push({
                object: factory(),
                inUse: false,
                lastUsed: 0,
                index: i
            });
            this.freeList.push(i);
            this.stats.created++;
        }
    }

    /**
     * Acquire object from pool - O(1)
     * @returns {Object} Pool entry with { object, index }
     */
    acquire() {
        this.stats.acquired++;

        if (this.freeList.length > 0) {
            // Get from free list - O(1)
            const index = this.freeList.pop();
            const entry = this.pool[index];
            entry.inUse = true;
            entry.lastUsed = performance.now();
            this.inUseCount++;
            this.stats.hits++;
            return entry;
        }

        // Expand pool - amortized O(1)
        const index = this.pool.length;
        const entry = {
            object: this.factory(),
            inUse: true,
            lastUsed: performance.now(),
            index
        };
        this.pool.push(entry);
        this.inUseCount++;
        this.stats.misses++;
        this.stats.created++;
        return entry;
    }

    /**
     * Release object back to pool - O(1)
     * @param {number} index - Pool index
     */
    release(index) {
        if (index < 0 || index >= this.pool.length) return;

        const entry = this.pool[index];
        if (!entry.inUse) return; // Already released

        entry.inUse = false;
        entry.lastUsed = performance.now();

        if (this.reset) {
            this.reset(entry.object);
        }

        this.freeList.push(index);
        this.inUseCount--;
        this.stats.released++;
    }

    /**
     * Get entry by index
     */
    get(index) {
        return this.pool[index];
    }

    /**
     * Cleanup unused entries older than maxAge
     * Uses batch mark-and-compact for O(n) total instead of O(n²)
     * @param {number} maxAge - Max age in ms
     * @returns {number} Number of entries cleaned up
     */
    cleanup(maxAge = CONFIG.POOL_MAX_AGE) {
        const now = performance.now();

        // Only cleanup if we have excess capacity
        const targetSize = Math.max(this.inUseCount * 2, CONFIG.MESH_POOL_SIZE);
        if (this.pool.length <= targetSize) return 0;

        // Mark entries for removal (don't mutate during iteration)
        let cleaned = 0;
        for (let i = targetSize; i < this.pool.length; i++) {
            const entry = this.pool[i];
            if (!entry.inUse && now - entry.lastUsed > maxAge) {
                // Dispose object
                if (entry.object && typeof entry.object.dispose === 'function') {
                    entry.object.dispose();
                }
                this.pool[i] = null; // Mark for removal
                cleaned++;
            }
        }

        if (cleaned === 0) return 0;

        // Compact: filter nulls in single pass - O(n)
        this.pool = this.pool.filter(entry => entry !== null);

        // Single reindex - O(n), but only once after all removals
        this.reindex();

        return cleaned;
    }

    /**
     * Reindex pool after cleanup - O(n) but only called after bulk cleanup
     * @private
     */
    reindex() {
        this.freeList = [];
        for (let i = 0; i < this.pool.length; i++) {
            this.pool[i].index = i;
            if (!this.pool[i].inUse) {
                this.freeList.push(i);
            }
        }
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            total: this.pool.length,
            inUse: this.inUseCount,
            free: this.freeList.length,
            hitRate: this.stats.acquired > 0
                ? ((this.stats.hits / this.stats.acquired) * 100).toFixed(1) + '%'
                : '0%',
            ...this.stats
        };
    }

    /**
     * Dispose all resources
     */
    dispose() {
        for (const entry of this.pool) {
            if (entry.object && typeof entry.object.dispose === 'function') {
                entry.object.dispose();
            }
        }
        this.pool = [];
        this.freeList = [];
        this.inUseCount = 0;
    }
}

export class AvatarOptimizer {
    constructor(options = {}) {
        this.config = { ...CONFIG, ...options };

        // Active avatars being managed
        this.avatars = new Map();

        // Spatial hash for efficient culling
        this.spatialHash = new Map();

        // Resource pools with O(1) acquire/release
        this.meshPool = new ObjectPool(
            () => null, // Meshes created on demand
            (mesh) => { if (mesh) mesh.visible = false; },
            this.config.MESH_POOL_SIZE
        );

        this.geometryPool = new ObjectPool(
            () => new THREE.BufferGeometry(),
            (geom) => {
                // Clear attributes for reuse
                const attrs = Object.keys(geom.attributes);
                for (const attr of attrs) {
                    geom.deleteAttribute(attr);
                }
                geom.setIndex(null);
            },
            this.config.GEOMETRY_POOL_SIZE
        );

        // Update scheduling
        this.updateQueues = {
            full: new Set(),
            medium: new Set(),
            low: new Set(),
            impostor: new Set()
        };

        // Frame timing with accumulators
        this.updateAccumulators = {
            full: 0,
            medium: 0,
            low: 0,
            impostor: 0
        };

        // Cached metrics (avoid recalculating every frame)
        this.metrics = {
            totalAvatars: 0,
            visibleAvatars: 0,
            culledAvatars: 0,
            impostorAvatars: 0,
            fullDetailAvatars: 0,
            frameTime: 0,
            updateTime: 0,
            cullTime: 0
        };
        this.metricsUpdateTime = 0;
        this.metricsUpdateInterval = 100; // Update metrics every 100ms

        // Frustum culling
        this.frustum = new THREE.Frustum();
        this.frustumMatrix = new THREE.Matrix4();

        // Camera reference
        this.camera = null;

        // Callbacks
        this.onMetricsUpdate = null;

        // Cleanup timer
        this.lastCleanup = 0;

        // Reusable vectors (avoid allocation in hot path)
        this._tempVec = new THREE.Vector3();
        this._tempSphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
    }

    /**
     * Register an avatar for optimization management
     * @param {string} avatarId - Unique avatar identifier
     * @param {Object} avatarInstance - Avatar renderer instance
     */
    registerAvatar(avatarId, avatarInstance) {
        if (this.avatars.has(avatarId)) {
            this.unregisterAvatar(avatarId);
        }

        const avatarData = {
            id: avatarId,
            instance: avatarInstance,
            position: new THREE.Vector3(),
            lastPosition: new THREE.Vector3(),
            distance: 0,
            lodLevel: 0,
            previousLodLevel: 0, // For hysteresis
            updateQueue: 'full',
            visible: true,
            lastUpdate: 0,
            boundingRadius: 1.5,
            spatialKey: null
        };

        this.avatars.set(avatarId, avatarData);
        this.updateQueues.full.add(avatarId);
        this.metrics.totalAvatars = this.avatars.size;

        // Add to spatial hash
        this.updateSpatialHash(avatarData);
    }

    /**
     * Unregister an avatar
     * @param {string} avatarId - Avatar to remove
     */
    unregisterAvatar(avatarId) {
        const avatarData = this.avatars.get(avatarId);
        if (!avatarData) return;

        // Remove from spatial hash
        this.removeSpatialHash(avatarData);

        // Remove from all update queues
        for (const queue of Object.values(this.updateQueues)) {
            queue.delete(avatarId);
        }

        this.avatars.delete(avatarId);
        this.metrics.totalAvatars = this.avatars.size;
    }

    /**
     * Update avatar position
     * @param {string} avatarId - Avatar identifier
     * @param {THREE.Vector3} position - New position
     */
    updateAvatarPosition(avatarId, position) {
        const avatarData = this.avatars.get(avatarId);
        if (!avatarData) return;

        avatarData.lastPosition.copy(avatarData.position);
        avatarData.position.copy(position);

        // Update spatial hash if moved to new cell
        const newKey = this.getSpatialKey(position);
        if (newKey !== avatarData.spatialKey) {
            this.removeSpatialHash(avatarData);
            avatarData.spatialKey = newKey;
            this.addToSpatialHash(avatarData);
        }
    }

    /**
     * Get spatial hash key for position - O(1)
     */
    getSpatialKey(position) {
        const cellSize = this.config.CELL_SIZE;
        const cx = Math.floor(position.x / cellSize);
        const cy = Math.floor(position.y / cellSize);
        const cz = Math.floor(position.z / cellSize);
        return `${cx},${cy},${cz}`;
    }

    /**
     * Update avatar's spatial hash entry
     */
    updateSpatialHash(avatarData) {
        const key = this.getSpatialKey(avatarData.position);
        avatarData.spatialKey = key;
        this.addToSpatialHash(avatarData);
    }

    /**
     * Add avatar to spatial hash
     */
    addToSpatialHash(avatarData) {
        const key = avatarData.spatialKey;
        if (!key) return;

        let cell = this.spatialHash.get(key);
        if (!cell) {
            cell = new Set();
            this.spatialHash.set(key, cell);
        }
        cell.add(avatarData.id);
    }

    /**
     * Remove avatar from spatial hash
     */
    removeSpatialHash(avatarData) {
        if (!avatarData.spatialKey) return;

        const cell = this.spatialHash.get(avatarData.spatialKey);
        if (cell) {
            cell.delete(avatarData.id);
            if (cell.size === 0) {
                this.spatialHash.delete(avatarData.spatialKey);
            }
        }
    }

    /**
     * Set camera for culling calculations
     * @param {THREE.Camera} camera - Scene camera
     */
    setCamera(camera) {
        this.camera = camera;
    }

    /**
     * Main update loop - call every frame
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        const frameStart = performance.now();

        if (!this.camera) return;

        // Update frustum matrix
        this.camera.updateMatrixWorld();
        this.frustumMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.frustumMatrix);

        // Perform culling
        const cullStart = performance.now();
        this.performCulling();
        const cullTime = performance.now() - cullStart;

        // Update accumulators
        this.updateAccumulators.full += deltaTime;
        this.updateAccumulators.medium += deltaTime;
        this.updateAccumulators.low += deltaTime;
        this.updateAccumulators.impostor += deltaTime;

        // Process update queues
        const updateStart = performance.now();
        this.processUpdateQueues(deltaTime);
        const updateTime = performance.now() - updateStart;

        // Periodic pool cleanup
        if (frameStart - this.lastCleanup > this.config.POOL_CLEANUP_INTERVAL) {
            this.cleanupPools();
            this.lastCleanup = frameStart;
        }

        // Update metrics (throttled)
        if (frameStart - this.metricsUpdateTime > this.metricsUpdateInterval) {
            this.metrics.frameTime = performance.now() - frameStart;
            this.metrics.cullTime = cullTime;
            this.metrics.updateTime = updateTime;
            this.metricsUpdateTime = frameStart;

            if (this.onMetricsUpdate) {
                this.onMetricsUpdate(this.getMetrics());
            }
        }
    }

    /**
     * Perform frustum and distance culling
     */
    performCulling() {
        let visibleCount = 0;
        let culledCount = 0;
        let fullDetailCount = 0;
        let impostorCount = 0;

        const cameraPosition = this.camera.position;

        for (const [avatarId, avatarData] of this.avatars) {
            // Calculate distance (reuse temp vector)
            this._tempVec.copy(avatarData.position);
            avatarData.distance = this._tempVec.distanceTo(cameraPosition);

            // Distance culling (check first - cheapest)
            if (avatarData.distance > this.config.CULL_DISTANCE) {
                this.setAvatarVisible(avatarData, false);
                culledCount++;
                continue;
            }

            // Frustum culling (setup temp sphere)
            this._tempSphere.center.copy(avatarData.position);
            this._tempSphere.radius = avatarData.boundingRadius;

            if (!this.frustum.intersectsSphere(this._tempSphere)) {
                this.setAvatarVisible(avatarData, false);
                culledCount++;
                continue;
            }

            // Avatar is visible
            this.setAvatarVisible(avatarData, true);
            visibleCount++;

            // Determine LOD level with hysteresis
            const lodLevel = this.calculateLODLevel(avatarData);
            this.updateAvatarLOD(avatarData, lodLevel);

            if (lodLevel === 0) fullDetailCount++;
            else if (lodLevel >= 2) impostorCount++;
        }

        // Batch update metrics
        this.metrics.visibleAvatars = visibleCount;
        this.metrics.culledAvatars = culledCount;
        this.metrics.fullDetailAvatars = fullDetailCount;
        this.metrics.impostorAvatars = impostorCount;
    }

    /**
     * Calculate LOD level with hysteresis to prevent flickering
     */
    calculateLODLevel(avatarData) {
        const distance = avatarData.distance;
        const hysteresis = this.config.LOD_HYSTERESIS;
        const currentLOD = avatarData.lodLevel;

        // Check each threshold with hysteresis
        const thresholds = [
            { level: 0, distance: this.config.FULL_UPDATE_DISTANCE },
            { level: 1, distance: this.config.MEDIUM_UPDATE_DISTANCE },
            { level: 2, distance: this.config.LOW_UPDATE_DISTANCE },
            { level: 3, distance: this.config.CULL_DISTANCE }
        ];

        for (let i = 0; i < thresholds.length; i++) {
            const threshold = thresholds[i];
            const adjustedThreshold = currentLOD <= threshold.level
                ? threshold.distance + hysteresis
                : threshold.distance - hysteresis;

            if (distance < adjustedThreshold) {
                return threshold.level;
            }
        }

        return 3; // Impostor
    }

    /**
     * Set avatar visibility
     */
    setAvatarVisible(avatarData, visible) {
        if (avatarData.visible === visible) return;

        avatarData.visible = visible;

        if (avatarData.instance?.setVisible) {
            avatarData.instance.setVisible(visible);
        }
    }

    /**
     * Update avatar LOD level
     */
    updateAvatarLOD(avatarData, newLOD) {
        if (avatarData.lodLevel === newLOD) return;

        const queueNames = ['full', 'medium', 'low', 'impostor'];
        const oldQueue = queueNames[Math.min(avatarData.lodLevel, 3)];
        const newQueue = queueNames[Math.min(newLOD, 3)];

        // Move between queues
        this.updateQueues[oldQueue].delete(avatarData.id);
        this.updateQueues[newQueue].add(avatarData.id);

        avatarData.previousLodLevel = avatarData.lodLevel;
        avatarData.lodLevel = newLOD;

        if (avatarData.instance?.setLODLevel) {
            avatarData.instance.setLODLevel(newLOD);
        }
    }

    /**
     * Process update queues based on timing
     */
    processUpdateQueues(deltaTime) {
        const frameIntervals = {
            full: 1 / this.config.FULL_UPDATE_RATE,
            medium: 1 / this.config.MEDIUM_UPDATE_RATE,
            low: 1 / this.config.LOW_UPDATE_RATE,
            impostor: 1 / this.config.IMPOSTOR_UPDATE_RATE
        };

        for (const [queueName, queue] of Object.entries(this.updateQueues)) {
            const interval = frameIntervals[queueName];

            if (this.updateAccumulators[queueName] >= interval) {
                this.updateAccumulators[queueName] %= interval; // Keep remainder

                for (const avatarId of queue) {
                    const avatarData = this.avatars.get(avatarId);
                    if (avatarData?.visible) {
                        this.updateAvatar(avatarData, deltaTime, queueName);
                    }
                }
            }
        }
    }

    /**
     * Update a single avatar
     */
    updateAvatar(avatarData, deltaTime, queueName) {
        if (!avatarData.instance?.update) return;

        avatarData.lastUpdate = performance.now();

        // Get bone update config based on queue (not LOD)
        const boneConfig = this.getBoneUpdateConfig(queueName);

        try {
            avatarData.instance.update(deltaTime, boneConfig);
        } catch (error) {
            console.error(`[AvatarOptimizer] Update error for ${avatarData.id}:`, error);
        }
    }

    /**
     * Get bone update configuration for queue type
     */
    getBoneUpdateConfig(queueName) {
        switch (queueName) {
            case 'full':
                return {
                    updateAllBones: true,
                    updateExpressions: true,
                    updateSpringBones: true,
                    updateIK: true
                };
            case 'medium':
                return {
                    updateAllBones: false,
                    skipBones: ['leftEye', 'rightEye', 'leftIndexFinger', 'rightIndexFinger',
                                'leftMiddleFinger', 'rightMiddleFinger', 'leftRingFinger', 'rightRingFinger'],
                    updateExpressions: true,
                    updateSpringBones: true,
                    updateIK: false
                };
            case 'low':
                return {
                    updateAllBones: false,
                    onlyBones: ['hips', 'spine', 'chest', 'head', 'leftUpperArm', 'rightUpperArm',
                               'leftUpperLeg', 'rightUpperLeg'],
                    updateExpressions: false,
                    updateSpringBones: false,
                    updateIK: false
                };
            case 'impostor':
                return {
                    updateAllBones: false,
                    onlyBones: ['hips'],
                    updateExpressions: false,
                    updateSpringBones: false,
                    updateIK: false
                };
            default:
                return { updateAllBones: true };
        }
    }

    /**
     * Acquire mesh from pool - O(1)
     */
    acquireMesh() {
        return this.meshPool.acquire();
    }

    /**
     * Release mesh back to pool - O(1)
     */
    releaseMesh(index) {
        this.meshPool.release(index);
    }

    /**
     * Acquire geometry from pool - O(1)
     */
    acquireGeometry() {
        return this.geometryPool.acquire();
    }

    /**
     * Release geometry back to pool - O(1)
     */
    releaseGeometry(index) {
        this.geometryPool.release(index);
    }

    /**
     * Get avatars in nearby spatial cells
     * @param {THREE.Vector3} position - Center position
     * @param {number} radius - Search radius
     * @returns {Array} Array of { id, data, distance }
     */
    getNearbyAvatars(position, radius) {
        const nearby = [];
        const cellRadius = Math.ceil(radius / this.config.CELL_SIZE);
        const cellSize = this.config.CELL_SIZE;

        const cx = Math.floor(position.x / cellSize);
        const cy = Math.floor(position.y / cellSize);
        const cz = Math.floor(position.z / cellSize);

        // Check cells in radius
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dy = -cellRadius; dy <= cellRadius; dy++) {
                for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const cell = this.spatialHash.get(key);

                    if (cell) {
                        for (const avatarId of cell) {
                            const avatarData = this.avatars.get(avatarId);
                            if (avatarData) {
                                const dist = avatarData.position.distanceTo(position);
                                if (dist <= radius) {
                                    nearby.push({
                                        id: avatarId,
                                        data: avatarData,
                                        distance: dist
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Sort by distance
        nearby.sort((a, b) => a.distance - b.distance);
        return nearby;
    }

    /**
     * Cleanup unused pool entries
     */
    cleanupPools() {
        const meshCleaned = this.meshPool.cleanup();
        const geomCleaned = this.geometryPool.cleanup();

        if (meshCleaned > 0 || geomCleaned > 0) {
            console.log(`[AvatarOptimizer] Cleaned up ${meshCleaned} meshes, ${geomCleaned} geometries`);
        }
    }

    /**
     * Get current performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            pools: {
                mesh: this.meshPool.getStats(),
                geometry: this.geometryPool.getStats()
            },
            queues: {
                full: this.updateQueues.full.size,
                medium: this.updateQueues.medium.size,
                low: this.updateQueues.low.size,
                impostor: this.updateQueues.impostor.size
            },
            spatialCells: this.spatialHash.size
        };
    }

    /**
     * Get debug visualization data for spatial hash
     */
    getDebugVisualization() {
        const boxes = [];

        for (const [key, avatars] of this.spatialHash) {
            if (avatars.size === 0) continue;

            const [cx, cy, cz] = key.split(',').map(Number);
            const cellSize = this.config.CELL_SIZE;

            boxes.push({
                position: new THREE.Vector3(
                    (cx + 0.5) * cellSize,
                    (cy + 0.5) * cellSize,
                    (cz + 0.5) * cellSize
                ),
                size: cellSize,
                avatarCount: avatars.size
            });
        }

        return boxes;
    }

    /**
     * Force update all avatars (for testing)
     */
    forceUpdateAll() {
        for (const avatarData of this.avatars.values()) {
            if (avatarData.instance?.update) {
                avatarData.instance.update(0.016, { updateAllBones: true });
            }
        }
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.meshPool.dispose();
        this.geometryPool.dispose();
        this.avatars.clear();
        this.spatialHash.clear();

        for (const queue of Object.values(this.updateQueues)) {
            queue.clear();
        }
    }
}

export default AvatarOptimizer;
