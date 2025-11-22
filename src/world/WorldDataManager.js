/**
 * WorldDataManager - Manages persistence and retrieval of generated world data
 *
 * Handles:
 * - Checking if world data exists (locally or on server)
 * - Retrieving existing world data
 * - Generating and storing new world data
 * - Caching for performance
 * - Synchronization between local storage and server
 */

import { ServerConfigPanel } from '../ui/components/ServerConfigPanel.js';
import { GravitationalShapeConfig } from '../config/GravitationalShapeConfig.js';
import { BiomeConfiguration } from '../config/BiomeConfiguration.js';

export class WorldDataManager {
    constructor(options = {}) {
        // Storage adapters
        this.localStorage = options.localStorage || null;  // IndexedDBAdapter
        this.networkAdapter = options.networkAdapter || null;  // HTTPAdapter

        // Server config for generation
        this.serverConfig = options.serverConfig || new ServerConfigPanel();

        // In-memory cache
        this.cache = {
            galaxies: new Map(),
            systems: new Map(),
            bodies: new Map(),
            chunks: new Map()
        };

        // Cache settings
        this.cacheConfig = {
            maxGalaxies: 10,
            maxSystems: 100,
            maxBodies: 500,
            maxChunks: 1000,
            ttlMs: 300000  // 5 minutes TTL
        };

        // Database keys
        this.DB_KEYS = {
            CONFIG: 'polymir_world_config',
            GALAXY_PREFIX: 'polymir_galaxy_',
            SYSTEM_PREFIX: 'polymir_system_',
            BODY_PREFIX: 'polymir_body_',
            CHUNK_PREFIX: 'polymir_chunk_'
        };

        // Event callbacks
        this.onDataLoaded = options.onDataLoaded || null;
        this.onDataGenerated = options.onDataGenerated || null;
        this.onDataSaved = options.onDataSaved || null;

        // Statistics
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            localLoads: 0,
            networkLoads: 0,
            generations: 0
        };
    }

    /**
     * Initialize storage adapters
     */
    async initialize() {
        // Initialize IndexedDB if available
        if (!this.localStorage && typeof indexedDB !== 'undefined') {
            try {
                const { IndexedDBAdapter } = await import('../io/storage/IndexedDBAdapter.js');
                this.localStorage = new IndexedDBAdapter({
                    dbName: 'polymir_worlds',
                    storeName: 'world_data'
                });
                await this.localStorage.initialize();
                console.log('[WorldDataManager] IndexedDB initialized');
            } catch (err) {
                console.warn('[WorldDataManager] IndexedDB not available:', err.message);
            }
        }

        return this;
    }

    // =========================================================================
    // GALAXY OPERATIONS
    // =========================================================================

    /**
     * Get or generate galaxy data
     * @param {number} galaxyIndex - Galaxy index
     * @returns {Promise<Object>} Galaxy data
     */
    async getGalaxy(galaxyIndex) {
        const key = `galaxy_${galaxyIndex}`;

        // Check cache first
        const cached = this.getFromCache('galaxies', key);
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }
        this.stats.cacheMisses++;

        // Check local storage
        const stored = await this.loadFromStorage(this.DB_KEYS.GALAXY_PREFIX + galaxyIndex);
        if (stored) {
            this.stats.localLoads++;
            this.addToCache('galaxies', key, stored);
            return stored;
        }

        // Check network (if available)
        if (this.networkAdapter) {
            try {
                const remote = await this.loadFromNetwork('galaxy', galaxyIndex);
                if (remote) {
                    this.stats.networkLoads++;
                    await this.saveToStorage(this.DB_KEYS.GALAXY_PREFIX + galaxyIndex, remote);
                    this.addToCache('galaxies', key, remote);
                    return remote;
                }
            } catch (err) {
                console.warn('[WorldDataManager] Network load failed:', err.message);
            }
        }

        // Generate new galaxy data
        const generated = this.generateGalaxyData(galaxyIndex);
        this.stats.generations++;

        // Save to storage
        await this.saveToStorage(this.DB_KEYS.GALAXY_PREFIX + galaxyIndex, generated);
        this.addToCache('galaxies', key, generated);

        if (this.onDataGenerated) {
            this.onDataGenerated({ type: 'galaxy', index: galaxyIndex, data: generated });
        }

        return generated;
    }

    /**
     * Check if galaxy data exists
     */
    async galaxyExists(galaxyIndex) {
        const key = `galaxy_${galaxyIndex}`;

        // Check cache
        if (this.cache.galaxies.has(key)) return true;

        // Check storage
        const stored = await this.loadFromStorage(this.DB_KEYS.GALAXY_PREFIX + galaxyIndex);
        return stored !== null;
    }

    /**
     * Generate galaxy data from config
     */
    generateGalaxyData(galaxyIndex) {
        const seed = this.serverConfig.getGalaxySeed(galaxyIndex);
        const rng = this.serverConfig.seededRandom(seed);

        // Determine number of systems in this galaxy
        const cfg = this.serverConfig.superclusterConfig;
        const systemCount = Math.floor(
            cfg.systemsPerGalaxy.min +
            rng() * (cfg.systemsPerGalaxy.max - cfg.systemsPerGalaxy.min)
        );

        return {
            index: galaxyIndex,
            seed: seed,
            name: this.generateGalaxyName(galaxyIndex, seed),
            systemCount: systemCount,
            position: {
                x: (rng() - 0.5) * cfg.superclusterRadius,
                y: (rng() - 0.5) * cfg.superclusterRadius * 0.1,
                z: (rng() - 0.5) * cfg.superclusterRadius
            },
            created: Date.now(),
            version: 1
        };
    }

    /**
     * Generate deterministic galaxy name
     */
    generateGalaxyName(index, seed) {
        const prefixes = ['NGC', 'UGC', 'ESO', 'MCG', 'IC', 'PGC'];
        const prefix = prefixes[seed % prefixes.length];
        const number = 100 + (seed % 9000);
        return `${prefix} ${number}`;
    }

    // =========================================================================
    // SYSTEM OPERATIONS
    // =========================================================================

    /**
     * Get or generate system data
     */
    async getSystem(galaxyIndex, systemIndex) {
        const key = `system_${galaxyIndex}_${systemIndex}`;

        // Check cache
        const cached = this.getFromCache('systems', key);
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }
        this.stats.cacheMisses++;

        // Check local storage
        const storageKey = `${this.DB_KEYS.SYSTEM_PREFIX}${galaxyIndex}_${systemIndex}`;
        const stored = await this.loadFromStorage(storageKey);
        if (stored) {
            this.stats.localLoads++;
            this.addToCache('systems', key, stored);
            return stored;
        }

        // Check network
        if (this.networkAdapter) {
            try {
                const remote = await this.loadFromNetwork('system', { galaxyIndex, systemIndex });
                if (remote) {
                    this.stats.networkLoads++;
                    await this.saveToStorage(storageKey, remote);
                    this.addToCache('systems', key, remote);
                    return remote;
                }
            } catch (err) {
                console.warn('[WorldDataManager] Network load failed:', err.message);
            }
        }

        // Generate new system data
        const generated = this.serverConfig.generateSystemConfig(galaxyIndex, systemIndex);
        generated.created = Date.now();
        generated.version = 1;
        this.stats.generations++;

        // Save to storage
        await this.saveToStorage(storageKey, generated);
        this.addToCache('systems', key, generated);

        if (this.onDataGenerated) {
            this.onDataGenerated({ type: 'system', galaxyIndex, systemIndex, data: generated });
        }

        return generated;
    }

    /**
     * Check if system data exists
     */
    async systemExists(galaxyIndex, systemIndex) {
        const key = `system_${galaxyIndex}_${systemIndex}`;

        if (this.cache.systems.has(key)) return true;

        const storageKey = `${this.DB_KEYS.SYSTEM_PREFIX}${galaxyIndex}_${systemIndex}`;
        const stored = await this.loadFromStorage(storageKey);
        return stored !== null;
    }

    // =========================================================================
    // BODY OPERATIONS
    // =========================================================================

    /**
     * Get or generate body data
     */
    async getBody(galaxyIndex, systemIndex, bodyIndex) {
        const key = `body_${galaxyIndex}_${systemIndex}_${bodyIndex}`;

        // Check cache
        const cached = this.getFromCache('bodies', key);
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }
        this.stats.cacheMisses++;

        // Check local storage
        const storageKey = `${this.DB_KEYS.BODY_PREFIX}${galaxyIndex}_${systemIndex}_${bodyIndex}`;
        const stored = await this.loadFromStorage(storageKey);
        if (stored) {
            this.stats.localLoads++;
            this.addToCache('bodies', key, stored);
            return stored;
        }

        // Check network
        if (this.networkAdapter) {
            try {
                const remote = await this.loadFromNetwork('body', { galaxyIndex, systemIndex, bodyIndex });
                if (remote) {
                    this.stats.networkLoads++;
                    await this.saveToStorage(storageKey, remote);
                    this.addToCache('bodies', key, remote);
                    return remote;
                }
            } catch (err) {
                console.warn('[WorldDataManager] Network load failed:', err.message);
            }
        }

        // Generate new body data
        const generated = this.serverConfig.generateBodyParams(galaxyIndex, systemIndex, bodyIndex);
        generated.created = Date.now();
        generated.version = 1;
        this.stats.generations++;

        // Save to storage
        await this.saveToStorage(storageKey, generated);
        this.addToCache('bodies', key, generated);

        if (this.onDataGenerated) {
            this.onDataGenerated({ type: 'body', galaxyIndex, systemIndex, bodyIndex, data: generated });
        }

        return generated;
    }

    /**
     * Check if body data exists
     */
    async bodyExists(galaxyIndex, systemIndex, bodyIndex) {
        const key = `body_${galaxyIndex}_${systemIndex}_${bodyIndex}`;

        if (this.cache.bodies.has(key)) return true;

        const storageKey = `${this.DB_KEYS.BODY_PREFIX}${galaxyIndex}_${systemIndex}_${bodyIndex}`;
        const stored = await this.loadFromStorage(storageKey);
        return stored !== null;
    }

    /**
     * Update body data (e.g., after chunk generation)
     */
    async updateBody(galaxyIndex, systemIndex, bodyIndex, updates) {
        const body = await this.getBody(galaxyIndex, systemIndex, bodyIndex);

        // Apply updates
        Object.assign(body, updates);
        body.modified = Date.now();
        body.version++;

        // Save updated data
        const key = `body_${galaxyIndex}_${systemIndex}_${bodyIndex}`;
        const storageKey = `${this.DB_KEYS.BODY_PREFIX}${galaxyIndex}_${systemIndex}_${bodyIndex}`;

        await this.saveToStorage(storageKey, body);
        this.addToCache('bodies', key, body);

        if (this.onDataSaved) {
            this.onDataSaved({ type: 'body', galaxyIndex, systemIndex, bodyIndex, data: body });
        }

        return body;
    }

    // =========================================================================
    // CHUNK OPERATIONS (for generated terrain)
    // =========================================================================

    /**
     * Get chunk data if it exists (don't generate - that's the generator's job)
     */
    async getChunk(bodyKey, cx, cy, cz) {
        const key = `chunk_${bodyKey}_${cx}_${cy}_${cz}`;

        // Check cache
        const cached = this.getFromCache('chunks', key);
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }

        // Check local storage
        const storageKey = `${this.DB_KEYS.CHUNK_PREFIX}${bodyKey}_${cx}_${cy}_${cz}`;
        const stored = await this.loadFromStorage(storageKey);
        if (stored) {
            this.stats.localLoads++;
            this.addToCache('chunks', key, stored);
            return stored;
        }

        // Chunk doesn't exist - return null (caller should generate)
        return null;
    }

    /**
     * Check if chunk exists
     */
    async chunkExists(bodyKey, cx, cy, cz) {
        const key = `chunk_${bodyKey}_${cx}_${cy}_${cz}`;

        if (this.cache.chunks.has(key)) return true;

        const storageKey = `${this.DB_KEYS.CHUNK_PREFIX}${bodyKey}_${cx}_${cy}_${cz}`;
        const stored = await this.loadFromStorage(storageKey);
        return stored !== null;
    }

    /**
     * Save generated chunk data
     */
    async saveChunk(bodyKey, cx, cy, cz, chunkData) {
        const key = `chunk_${bodyKey}_${cx}_${cy}_${cz}`;
        const storageKey = `${this.DB_KEYS.CHUNK_PREFIX}${bodyKey}_${cx}_${cy}_${cz}`;

        const data = {
            bodyKey,
            position: { cx, cy, cz },
            data: chunkData,
            created: Date.now()
        };

        await this.saveToStorage(storageKey, data);
        this.addToCache('chunks', key, data);

        return data;
    }

    // =========================================================================
    // BATCH OPERATIONS
    // =========================================================================

    /**
     * Get multiple bodies in a system at once
     */
    async getSystemBodies(galaxyIndex, systemIndex) {
        const system = await this.getSystem(galaxyIndex, systemIndex);

        const bodies = [];
        for (let i = 0; i < system.bodies.length; i++) {
            const body = await this.getBody(galaxyIndex, systemIndex, i);
            bodies.push(body);
        }

        return bodies;
    }

    /**
     * Preload data for a region (call when player is approaching)
     */
    async preloadRegion(galaxyIndex, systemIndex, options = {}) {
        const { preloadBodies = true, preloadAdjacent = false } = options;

        console.log(`[WorldDataManager] Preloading region: Galaxy ${galaxyIndex}, System ${systemIndex}`);

        // Load system
        const system = await this.getSystem(galaxyIndex, systemIndex);

        // Preload all bodies in the system
        if (preloadBodies) {
            for (let i = 0; i < system.bodies.length; i++) {
                await this.getBody(galaxyIndex, systemIndex, i);
            }
        }

        // Preload adjacent systems
        if (preloadAdjacent) {
            const adjacentOffsets = [-1, 1];
            for (const offset of adjacentOffsets) {
                const adjSystemIndex = systemIndex + offset;
                if (adjSystemIndex >= 0) {
                    await this.getSystem(galaxyIndex, adjSystemIndex);
                }
            }
        }

        return system;
    }

    // =========================================================================
    // STORAGE OPERATIONS
    // =========================================================================

    /**
     * Load data from local storage
     */
    async loadFromStorage(key) {
        if (!this.localStorage) {
            // Fallback to localStorage API
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
            } catch (err) {
                return null;
            }
        }

        try {
            return await this.localStorage.get(key);
        } catch (err) {
            console.warn(`[WorldDataManager] Storage load failed for ${key}:`, err.message);
            return null;
        }
    }

    /**
     * Save data to local storage
     */
    async saveToStorage(key, data) {
        if (!this.localStorage) {
            // Fallback to localStorage API
            try {
                localStorage.setItem(key, JSON.stringify(data));
                return true;
            } catch (err) {
                console.warn('[WorldDataManager] localStorage save failed:', err.message);
                return false;
            }
        }

        try {
            await this.localStorage.set(key, data);
            return true;
        } catch (err) {
            console.warn(`[WorldDataManager] Storage save failed for ${key}:`, err.message);
            return false;
        }
    }

    /**
     * Load data from network
     */
    async loadFromNetwork(type, identifier) {
        if (!this.networkAdapter) return null;

        try {
            // Build endpoint based on type
            let endpoint;
            switch (type) {
                case 'galaxy':
                    endpoint = `/api/worlds/galaxy/${identifier}`;
                    break;
                case 'system':
                    endpoint = `/api/worlds/system/${identifier.galaxyIndex}/${identifier.systemIndex}`;
                    break;
                case 'body':
                    endpoint = `/api/worlds/body/${identifier.galaxyIndex}/${identifier.systemIndex}/${identifier.bodyIndex}`;
                    break;
                default:
                    return null;
            }

            const response = await this.networkAdapter.get(endpoint);
            return response.data;
        } catch (err) {
            // Network errors are expected when offline
            return null;
        }
    }

    // =========================================================================
    // CACHE OPERATIONS
    // =========================================================================

    /**
     * Get from cache with TTL check
     */
    getFromCache(cacheType, key) {
        const cache = this.cache[cacheType];
        const entry = cache.get(key);

        if (!entry) return null;

        // Check TTL
        if (Date.now() - entry.timestamp > this.cacheConfig.ttlMs) {
            cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Add to cache with LRU eviction
     */
    addToCache(cacheType, key, data) {
        const cache = this.cache[cacheType];
        const maxSize = this.cacheConfig[`max${cacheType.charAt(0).toUpperCase() + cacheType.slice(1)}`];

        // Evict oldest entries if at capacity
        while (cache.size >= maxSize) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }

        cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.cache.galaxies.clear();
        this.cache.systems.clear();
        this.cache.bodies.clear();
        this.cache.chunks.clear();
    }

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: {
                galaxies: this.cache.galaxies.size,
                systems: this.cache.systems.size,
                bodies: this.cache.bodies.size,
                chunks: this.cache.chunks.size
            },
            hitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            localLoads: 0,
            networkLoads: 0,
            generations: 0
        };
    }

    /**
     * Export all world data (for backup/transfer)
     */
    async exportAllData() {
        const data = {
            config: this.serverConfig.serialize(),
            galaxies: {},
            systems: {},
            bodies: {},
            exportDate: Date.now()
        };

        // Export cached data
        for (const [key, entry] of this.cache.galaxies) {
            data.galaxies[key] = entry.data;
        }

        for (const [key, entry] of this.cache.systems) {
            data.systems[key] = entry.data;
        }

        for (const [key, entry] of this.cache.bodies) {
            data.bodies[key] = entry.data;
        }

        return data;
    }

    /**
     * Import world data
     */
    async importData(data) {
        // Import config
        if (data.config) {
            this.serverConfig = ServerConfigPanel.deserialize(data.config);
        }

        // Import galaxies
        for (const [key, galaxyData] of Object.entries(data.galaxies || {})) {
            await this.saveToStorage(this.DB_KEYS.GALAXY_PREFIX + galaxyData.index, galaxyData);
            this.addToCache('galaxies', key, galaxyData);
        }

        // Import systems
        for (const [key, systemData] of Object.entries(data.systems || {})) {
            const storageKey = `${this.DB_KEYS.SYSTEM_PREFIX}${systemData.galaxyIndex}_${systemData.systemIndex}`;
            await this.saveToStorage(storageKey, systemData);
            this.addToCache('systems', key, systemData);
        }

        // Import bodies
        for (const [key, bodyData] of Object.entries(data.bodies || {})) {
            const storageKey = `${this.DB_KEYS.BODY_PREFIX}${bodyData.galaxyIndex}_${bodyData.systemIndex}_${bodyData.bodyIndex}`;
            await this.saveToStorage(storageKey, bodyData);
            this.addToCache('bodies', key, bodyData);
        }

        console.log('[WorldDataManager] Data imported successfully');
    }

    /**
     * Delete all stored world data
     */
    async clearAllData() {
        this.clearCache();

        // Clear localStorage fallback
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('polymir_')) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            localStorage.removeItem(key);
        }

        // Clear IndexedDB if available
        if (this.localStorage && this.localStorage.clear) {
            await this.localStorage.clear();
        }

        console.log('[WorldDataManager] All world data cleared');
    }
}

export default WorldDataManager;
