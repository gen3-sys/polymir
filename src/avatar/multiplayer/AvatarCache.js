/**
 * AvatarCache - Client-side caching for avatar data
 *
 * True O(1) LRU cache using a doubly-linked list + Map for loaded avatar data.
 * Includes IndexedDB persistence for offline support.
 *
 * Features:
 * - O(1) get/set/evict operations via doubly-linked list
 * - IndexedDB persistence with automatic cleanup
 * - Cache invalidation on avatar version change
 * - Preload nearby players' avatars with priority queue
 * - Proper error handling throughout
 */

// Cache configuration
const DEFAULT_CACHE_SIZE = 100;
const IDB_STORE_NAME = 'avatar_cache';
const IDB_DB_NAME = 'polymir_avatars';
const CACHE_VERSION = 1;
const CACHE_EXPIRY_DAYS = 7;
const MAX_IDB_SIZE_MB = 50;

/**
 * Doubly-linked list node for O(1) LRU operations
 */
class LRUNode {
    constructor(key, value) {
        this.key = key;
        this.value = value;
        this.prev = null;
        this.next = null;
    }
}

/**
 * O(1) LRU Cache implementation using doubly-linked list + Map
 */
class LRUCache {
    constructor(maxSize) {
        if (!Number.isFinite(maxSize) || maxSize < 1) {
            throw new Error('LRUCache maxSize must be a positive integer');
        }
        this.maxSize = Math.floor(maxSize);
        this.map = new Map();          // key → LRUNode
        this.head = new LRUNode(null, null); // Dummy head (most recent)
        this.tail = new LRUNode(null, null); // Dummy tail (least recent)
        this.head.next = this.tail;
        this.tail.prev = this.head;
        this.size = 0;
    }

    /**
     * Move node to front (most recently used)
     * O(1) operation
     */
    moveToFront(node) {
        // Short-circuit if already at front (common case for hot cache entries)
        if (this.head.next === node) return;

        // Remove from current position
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;

        // Insert after head
        node.prev = this.head;
        node.next = this.head.next;
        this.head.next.prev = node;
        this.head.next = node;
    }

    /**
     * Remove node from list
     * O(1) operation
     */
    removeNode(node) {
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
        node.prev = null;
        node.next = null;
    }

    /**
     * Get value and promote to front
     * O(1) operation
     */
    get(key) {
        const node = this.map.get(key);
        if (!node) return undefined;

        this.moveToFront(node);
        return node.value;
    }

    /**
     * Check if key exists without promoting
     * O(1) operation
     */
    has(key) {
        return this.map.has(key);
    }

    /**
     * Set value and promote/add to front
     * O(1) operation
     */
    set(key, value) {
        let node = this.map.get(key);

        if (node) {
            // Update existing
            node.value = value;
            this.moveToFront(node);
        } else {
            // Add new node
            node = new LRUNode(key, value);
            this.map.set(key, node);
            this.moveToFront(node);
            this.size++;

            // Evict if over capacity
            if (this.size > this.maxSize) {
                this.evictLRU();
            }
        }
    }

    /**
     * Delete key
     * O(1) operation
     */
    delete(key) {
        const node = this.map.get(key);
        if (!node) return false;

        this.removeNode(node);
        this.map.delete(key);
        this.size--;
        return true;
    }

    /**
     * Evict least recently used entry
     * O(1) operation
     */
    evictLRU() {
        const lruNode = this.tail.prev;
        if (lruNode === this.head) return null; // Empty list

        const evictedKey = lruNode.key;
        this.removeNode(lruNode);
        this.map.delete(evictedKey);
        this.size--;
        return evictedKey;
    }

    /**
     * Clear all entries
     */
    clear() {
        this.map.clear();
        this.head.next = this.tail;
        this.tail.prev = this.head;
        this.size = 0;
    }

    /**
     * Iterate over entries (most recent first)
     */
    *entries() {
        let node = this.head.next;
        while (node !== this.tail) {
            yield [node.key, node.value];
            node = node.next;
        }
    }

    /**
     * Get all keys
     */
    keys() {
        return Array.from(this.map.keys());
    }
}

export class AvatarCache {
    constructor(options = {}) {
        // In-memory O(1) LRU cache
        this.memoryCache = new LRUCache(options.maxSize || DEFAULT_CACHE_SIZE);

        // IndexedDB reference
        this.db = null;
        this.dbReady = false;
        this.dbInitPromise = null;

        // Pending loads (prevent duplicate requests)
        this.pendingLoads = new Map(); // avatarId → Promise

        // Cache statistics
        this.stats = {
            memoryHits: 0,
            diskHits: 0,
            misses: 0,
            evictions: 0,
            errors: 0
        };

        // Options
        this.enablePersistence = options.enablePersistence !== false;
        this.expiryDays = options.expiryDays || CACHE_EXPIRY_DAYS;
        this.maxIDBSizeMB = options.maxIDBSizeMB || MAX_IDB_SIZE_MB;

        // Initialize IndexedDB
        if (this.enablePersistence) {
            this.dbInitPromise = this.initializeIndexedDB();
        }
    }

    /**
     * Initialize IndexedDB for persistent storage
     * @returns {Promise<boolean>} Success status
     */
    async initializeIndexedDB() {
        try {
            return await new Promise((resolve, reject) => {
                if (typeof indexedDB === 'undefined') {
                    console.warn('[AvatarCache] IndexedDB not available');
                    resolve(false);
                    return;
                }

                const request = indexedDB.open(IDB_DB_NAME, CACHE_VERSION);

                request.onerror = (event) => {
                    console.error('[AvatarCache] IndexedDB open error:', event.target.error);
                    this.stats.errors++;
                    resolve(false);
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.dbReady = true;

                    // Handle database errors
                    this.db.onerror = (e) => {
                        console.error('[AvatarCache] IndexedDB error:', e.target.error);
                        this.stats.errors++;
                    };

                    // Cleanup expired entries in background
                    this.cleanupExpired().catch(err => {
                        console.warn('[AvatarCache] Cleanup error:', err);
                    });

                    resolve(true);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    // Create object store if needed
                    if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
                        const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });
                        store.createIndex('accessedAt', 'accessedAt', { unique: false });
                        store.createIndex('version', 'version', { unique: false });
                        store.createIndex('size', 'size', { unique: false });
                    }
                };

                request.onblocked = () => {
                    console.warn('[AvatarCache] IndexedDB blocked - close other tabs');
                    resolve(false);
                };
            });
        } catch (error) {
            console.error('[AvatarCache] Failed to initialize IndexedDB:', error);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Wait for DB initialization
     */
    async waitForDB() {
        if (this.dbInitPromise) {
            await this.dbInitPromise;
        }
    }

    /**
     * Get avatar from cache
     * @param {string} avatarId - Avatar ID
     * @returns {Promise<Object|null>} Avatar data or null
     */
    async get(avatarId) {
        if (!avatarId) return null;

        // Check memory cache first (O(1))
        const memoryData = this.memoryCache.get(avatarId);
        if (memoryData !== undefined) {
            this.stats.memoryHits++;
            return memoryData;
        }

        // Check IndexedDB
        if (this.enablePersistence) {
            await this.waitForDB();

            if (this.dbReady) {
                try {
                    const diskData = await this.getFromDisk(avatarId);
                    if (diskData) {
                        this.stats.diskHits++;
                        // Promote to memory cache
                        this.memoryCache.set(avatarId, diskData);
                        return diskData;
                    }
                } catch (error) {
                    console.error('[AvatarCache] Disk read error:', error);
                    this.stats.errors++;
                }
            }
        }

        this.stats.misses++;
        return null;
    }

    /**
     * Get from IndexedDB
     * @private
     */
    async getFromDisk(avatarId) {
        if (!this.db) return null;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([IDB_STORE_NAME], 'readonly');
                const store = transaction.objectStore(IDB_STORE_NAME);
                const request = store.get(avatarId);

                request.onsuccess = (event) => {
                    const result = event.target.result;
                    if (result && !this.isExpired(result)) {
                        // Update access time in background (don't wait)
                        this.updateDiskAccessTime(avatarId).catch(() => {});
                        resolve(result.data);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = (event) => {
                    console.error('[AvatarCache] Get error:', event.target.error);
                    resolve(null);
                };

                transaction.onerror = (event) => {
                    console.error('[AvatarCache] Transaction error:', event.target.error);
                    resolve(null);
                };
            } catch (error) {
                console.error('[AvatarCache] getFromDisk error:', error);
                resolve(null);
            }
        });
    }

    /**
     * Store avatar in cache
     * @param {string} avatarId - Avatar ID
     * @param {Object} data - Avatar data
     * @param {number} version - Avatar version
     */
    async set(avatarId, data, version = 1) {
        if (!avatarId || !data) return;

        // Store in memory (O(1))
        this.memoryCache.set(avatarId, data);

        // Store in IndexedDB (async)
        if (this.enablePersistence) {
            await this.waitForDB();

            if (this.dbReady) {
                try {
                    await this.setDisk(avatarId, data, version);
                } catch (error) {
                    console.error('[AvatarCache] Disk write error:', error);
                    this.stats.errors++;
                }
            }
        }
    }

    /**
     * Store in IndexedDB
     * @private
     */
    async setDisk(avatarId, data, version) {
        if (!this.db) return false;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(IDB_STORE_NAME);

                // Estimate size for quota management
                let estimatedSize = 0;
                try {
                    estimatedSize = JSON.stringify(data).length;
                } catch {
                    estimatedSize = 10000;
                }

                const record = {
                    id: avatarId,
                    data,
                    version,
                    size: estimatedSize,
                    accessedAt: Date.now(),
                    createdAt: Date.now()
                };

                const request = store.put(record);

                request.onsuccess = () => resolve(true);
                request.onerror = (event) => {
                    console.error('[AvatarCache] Put error:', event.target.error);
                    resolve(false);
                };

                transaction.onerror = (event) => {
                    console.error('[AvatarCache] Transaction error:', event.target.error);
                    resolve(false);
                };
            } catch (error) {
                console.error('[AvatarCache] setDisk error:', error);
                resolve(false);
            }
        });
    }

    /**
     * Update access time in IndexedDB
     * @private
     */
    async updateDiskAccessTime(avatarId) {
        if (!this.db) return;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(IDB_STORE_NAME);
                const request = store.get(avatarId);

                request.onsuccess = (event) => {
                    const record = event.target.result;
                    if (record) {
                        record.accessedAt = Date.now();
                        store.put(record);
                    }
                    resolve();
                };

                request.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }

    /**
     * Check if cached entry is expired
     * @private
     */
    isExpired(record) {
        const expiryMs = this.expiryDays * 24 * 60 * 60 * 1000;
        return Date.now() - record.createdAt > expiryMs;
    }

    /**
     * Invalidate cached avatar (on update)
     * @param {string} avatarId - Avatar ID to invalidate
     */
    async invalidate(avatarId) {
        if (!avatarId) return;

        // Remove from memory (O(1))
        this.memoryCache.delete(avatarId);

        // Remove from IndexedDB
        if (this.enablePersistence && this.dbReady) {
            try {
                await new Promise((resolve) => {
                    const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(IDB_STORE_NAME);
                    const request = store.delete(avatarId);
                    request.onsuccess = () => resolve(true);
                    request.onerror = () => resolve(false);
                });
            } catch (error) {
                console.error('[AvatarCache] Invalidate error:', error);
                this.stats.errors++;
            }
        }
    }

    /**
     * Check if avatar version is current
     * @param {string} avatarId - Avatar ID
     * @param {number} currentVersion - Expected version
     */
    async isVersionCurrent(avatarId, currentVersion) {
        if (!this.dbReady) return false;

        try {
            return await new Promise((resolve) => {
                const transaction = this.db.transaction([IDB_STORE_NAME], 'readonly');
                const store = transaction.objectStore(IDB_STORE_NAME);
                const request = store.get(avatarId);

                request.onsuccess = (event) => {
                    const record = event.target.result;
                    resolve(record && record.version >= currentVersion);
                };

                request.onerror = () => resolve(false);
            });
        } catch {
            return false;
        }
    }

    /**
     * Load avatar with caching
     * Returns cached version or fetches from network
     * @param {string} avatarId - Avatar ID
     * @param {Function} fetchFn - Async function to fetch avatar data
     */
    async loadAvatar(avatarId, fetchFn) {
        if (!avatarId || typeof fetchFn !== 'function') {
            throw new Error('Invalid arguments to loadAvatar');
        }

        // Check cache first
        const cached = await this.get(avatarId);
        if (cached) {
            return { data: cached, fromCache: true };
        }

        // Check for pending load (coalesce duplicate requests)
        if (this.pendingLoads.has(avatarId)) {
            const data = await this.pendingLoads.get(avatarId);
            return { data, fromCache: false };
        }

        // Fetch from network
        const loadPromise = (async () => {
            try {
                const data = await fetchFn(avatarId);
                await this.set(avatarId, data, data.version || 1);
                return data;
            } finally {
                this.pendingLoads.delete(avatarId);
            }
        })();

        this.pendingLoads.set(avatarId, loadPromise);

        const data = await loadPromise;
        return { data, fromCache: false };
    }

    /**
     * Preload avatars for nearby players
     * @param {string[]} avatarIds - Array of avatar IDs to preload
     * @param {Function} fetchFn - Async function to fetch avatar data
     * @param {number} concurrency - Max concurrent fetches
     */
    async preloadAvatars(avatarIds, fetchFn, concurrency = 3) {
        if (!Array.isArray(avatarIds)) return [];

        // Filter to uncached avatars
        const uncached = [];
        for (const id of avatarIds) {
            if (!this.memoryCache.has(id) && !this.pendingLoads.has(id)) {
                uncached.push(id);
            }
        }

        if (uncached.length === 0) return [];

        // Load with limited concurrency
        const results = [];
        const executing = new Set();

        for (const id of uncached) {
            const promise = this.loadAvatar(id, fetchFn)
                .then(result => ({ id, status: 'fulfilled', value: result }))
                .catch(error => ({ id, status: 'rejected', reason: error }))
                .finally(() => executing.delete(promise));

            executing.add(promise);
            results.push(promise);

            if (executing.size >= concurrency) {
                await Promise.race(executing);
            }
        }

        return Promise.all(results);
    }

    /**
     * Cleanup expired entries from IndexedDB
     */
    async cleanupExpired() {
        if (!this.db) return 0;

        const expiryMs = this.expiryDays * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - expiryMs;
        let deletedCount = 0;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(IDB_STORE_NAME);
                const index = store.index('accessedAt');
                const range = IDBKeyRange.upperBound(cutoff);
                const request = index.openCursor(range);

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        deletedCount++;
                        cursor.continue();
                    }
                };

                transaction.oncomplete = () => {
                    if (deletedCount > 0) {
                        console.log(`[AvatarCache] Cleaned up ${deletedCount} expired entries`);
                    }
                    resolve(deletedCount);
                };

                transaction.onerror = () => resolve(deletedCount);
            } catch {
                resolve(0);
            }
        });
    }

    /**
     * Clear all cached data
     */
    async clear() {
        // Clear memory
        this.memoryCache.clear();

        // Clear IndexedDB
        if (this.dbReady) {
            try {
                await new Promise((resolve) => {
                    const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(IDB_STORE_NAME);
                    const request = store.clear();
                    request.onsuccess = () => resolve(true);
                    request.onerror = () => resolve(false);
                });
            } catch (error) {
                console.error('[AvatarCache] Clear error:', error);
                this.stats.errors++;
            }
        }

        // Reset stats
        this.stats = {
            memoryHits: 0,
            diskHits: 0,
            misses: 0,
            evictions: 0,
            errors: 0
        };
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.memoryHits + this.stats.diskHits + this.stats.misses;
        const hitRate = total > 0
            ? ((this.stats.memoryHits + this.stats.diskHits) / total * 100).toFixed(1)
            : '0.0';

        return {
            ...this.stats,
            memorySize: this.memoryCache.size,
            maxSize: this.memoryCache.maxSize,
            hitRate: `${hitRate}%`,
            pendingLoads: this.pendingLoads.size,
            dbReady: this.dbReady
        };
    }

    /**
     * Get approximate memory usage
     */
    getMemoryUsage() {
        let totalBytes = 0;
        let count = 0;

        for (const [key, value] of this.memoryCache.entries()) {
            count++;
            // Use rough estimate to avoid expensive JSON.stringify
            if (value && typeof value === 'object') {
                // Estimate based on voxel count if available
                if (value.voxelCount !== undefined) {
                    totalBytes += value.voxelCount * 4 + 1000; // 4 bytes per voxel + overhead
                } else {
                    totalBytes += 10000; // Default estimate per avatar
                }
            }
        }

        return {
            entries: count,
            estimatedBytes: totalBytes,
            estimatedKB: (totalBytes / 1024).toFixed(2),
            estimatedMB: (totalBytes / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Dispose and close IndexedDB connection
     */
    dispose() {
        this.memoryCache.clear();
        this.pendingLoads.clear();

        if (this.db) {
            try {
                this.db.close();
            } catch (error) {
                console.error('[AvatarCache] Close error:', error);
            }
            this.db = null;
            this.dbReady = false;
        }
    }
}

export default AvatarCache;
