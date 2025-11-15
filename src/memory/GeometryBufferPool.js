export class GeometryBufferPool {
    constructor(maxBuffers = 200) {
        this.available = [];
        this.inUse = new Map();
        this.maxBuffers = maxBuffers;

        this.stats = {
            allocations: 0,
            reuses: 0,
            releases: 0
        };
    }

    acquire(vertexCount) {
        const size = vertexCount * 3;

        for (let i = 0; i < this.available.length; i++) {
            if (this.available[i].size >= size) {
                const buffer = this.available.splice(i, 1)[0];
                this.stats.reuses++;
                return buffer;
            }
        }

        this.stats.allocations++;
        return {
            vertices: new Float32Array(size),
            normals: new Float32Array(size),
            colors: new Float32Array(size),
            size: size
        };
    }

    release(chunkKey, buffer) {
        this.inUse.delete(chunkKey);
        this.stats.releases++;

        if (this.available.length < this.maxBuffers) {
            this.available.push(buffer);
        }
    }

    assignToChunk(chunkKey, buffer) {
        this.inUse.set(chunkKey, buffer);
        return buffer;
    }

    getStats() {
        const reuseRate = this.stats.allocations > 0
            ? (this.stats.reuses / (this.stats.allocations + this.stats.reuses) * 100).toFixed(1)
            : 0;

        return {
            allocations: this.stats.allocations,
            reuses: this.stats.reuses,
            releases: this.stats.releases,
            reuseRate: `${reuseRate}%`,
            availableBuffers: this.available.length,
            inUseBuffers: this.inUse.size
        };
    }
}
