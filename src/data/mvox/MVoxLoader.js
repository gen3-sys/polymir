export class MVoxLoader {
    constructor(worldCache) {
        this.worldCache = worldCache;
        this.loadedStructures = new Map();
    }

    async load(mvoxId) {
        if (this.loadedStructures.has(mvoxId)) {
            return this.loadedStructures.get(mvoxId);
        }

        const structureData = await this.worldCache.loadChunks(mvoxId);

        if (structureData) {
            this.loadedStructures.set(mvoxId, structureData);
            return structureData;
        }

        return null;
    }

    async save(mvoxId, chunks, metadata = {}) {
        await this.worldCache.saveChunks(chunks, mvoxId);
        this.loadedStructures.set(mvoxId, chunks);

        return {
            id: mvoxId,
            metadata,
            chunkCount: chunks.size
        };
    }

    createFromSelection(voxels, bounds) {
        const chunks = new Map();
        const chunkSize = 16;

        for (const voxel of voxels) {
            const relX = voxel.x - bounds.minX;
            const relY = voxel.y - bounds.minY;
            const relZ = voxel.z - bounds.minZ;

            const chunkX = Math.floor(relX / chunkSize);
            const chunkY = Math.floor(relY / chunkSize);
            const chunkZ = Math.floor(relZ / chunkSize);

            const localX = ((relX % chunkSize) + chunkSize) % chunkSize;
            const localY = ((relY % chunkSize) + chunkSize) % chunkSize;
            const localZ = ((relZ % chunkSize) + chunkSize) % chunkSize;

            const chunkKey = `${chunkX},${chunkY},${chunkZ}`;

            if (!chunks.has(chunkKey)) {
                chunks.set(chunkKey, {
                    voxels: new Map()
                });
            }

            const voxelKey = (localX & 0x1F) | ((localY & 0x1F) << 5) | ((localZ & 0x1F) << 10);
            chunks.get(chunkKey).voxels.set(voxelKey, {
                type: voxel.type || "solid",
                color: voxel.color
            });
        }

        return chunks;
    }

    generateId() {
        return `mvox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
