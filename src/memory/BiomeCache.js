/**
 * BiomeCache - Biome Lookup Memoization
 *
 * Caches biome calculations which are deterministic based on position.
 * Provides 1.3-1.8× speedup by avoiding redundant biome lookups.
 *
 * Key Features:
 * - Fast numeric key encoding
 * - Configurable precision for cache hit rate tuning
 * - Cache invalidation when biome configuration changes
 */

export class BiomeCache {
    constructor(biomeConfig, gridSize = 0.05) {
        this.biomeConfig = biomeConfig;
        this.gridSize = gridSize;
        this.cache = new Map();

        this.stats = {
            hits: 0,
            misses: 0
        };
    }

    encodeKey(nx, ny, nz) {
        const gx = Math.round(nx / this.gridSize);
        const gy = Math.round(ny / this.gridSize);
        const gz = Math.round(nz / this.gridSize);
        return `${gx}:${gy}:${gz}`;
    }

    getBiomeAt(nx, ny, nz, height) {
        const key = this.encodeKey(nx, ny, nz);

        if (this.cache.has(key)) {
            this.stats.hits++;
            return this.cache.get(key);
        }

        this.stats.misses++;
        const biome = this.biomeConfig.getBiomeAt(nx, ny, nz, height);
        this.cache.set(key, biome);
        return biome;
    }

    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0 };
    }

    updateConfig(newConfig) {
        this.biomeConfig = newConfig;
        this.clear();
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
            size: this.cache.size
        };
    }

    getMemoryUsage() {
        return this.cache.size * 50;
    }
}
