export class ChunkDamageData {
    constructor(chunkCoord) {
        this.chunkCoord = chunkCoord;
        this.addedVoxels = new Map();
        this.removedVoxels = new Set();
        this.impactHistory = [];
        this.isDirty = false;
        this.version = 1;
    }

    addVoxel(localX, localY, localZ, colorId, timestamp = Date.now()) {
        const key = `${localX},${localY},${localZ}`;

        if (this.removedVoxels.has(key)) {
            this.removedVoxels.delete(key);
        }

        this.addedVoxels.set(key, {
            colorId: colorId,
            timestamp: timestamp,
            x: localX,
            y: localY,
            z: localZ
        });

        this.isDirty = true;
    }

    removeVoxel(localX, localY, localZ) {
        const key = `${localX},${localY},${localZ}`;

        this.addedVoxels.delete(key);
        this.removedVoxels.add(key);

        this.isDirty = true;
    }

    hasVoxel(localX, localY, localZ) {
        const key = `${localX},${localY},${localZ}`;
        return this.addedVoxels.has(key) && !this.removedVoxels.has(key);
    }

    isVoxelRemoved(localX, localY, localZ) {
        const key = `${localX},${localY},${localZ}`;
        return this.removedVoxels.has(key);
    }

    getMergedVoxelData(baseVoxels) {
        const merged = new Map();

        if (baseVoxels) {
            for (const [key, voxel] of baseVoxels) {
                if (!this.removedVoxels.has(key)) {
                    merged.set(key, voxel);
                }
            }
        }

        for (const [key, voxel] of this.addedVoxels) {
            if (!this.removedVoxels.has(key)) {
                merged.set(key, voxel);
            }
        }

        return merged;
    }

    getMergedVoxelArray(baseVoxels) {
        const mergedMap = this.getMergedVoxelData(baseVoxels);
        return Array.from(mergedMap.values());
    }

    recordImpact(position, velocity, type, debrisId, mass) {
        this.impactHistory.push({
            time: Date.now(),
            position: {x: position.x, y: position.y, z: position.z},
            velocity: velocity,
            type: type,
            debrisId: debrisId,
            mass: mass
        });

        if (this.impactHistory.length > 50) {
            this.impactHistory.shift();
        }
    }

    clearDamage() {
        this.addedVoxels.clear();
        this.removedVoxels.clear();
        this.isDirty = true;
    }

    getStats() {
        return {
            addedCount: this.addedVoxels.size,
            removedCount: this.removedVoxels.size,
            impactCount: this.impactHistory.length,
            isDirty: this.isDirty
        };
    }

    serialize() {
        return {
            chunkCoord: this.chunkCoord,
            addedVoxels: Array.from(this.addedVoxels.entries()),
            removedVoxels: Array.from(this.removedVoxels),
            impactHistory: this.impactHistory,
            version: this.version
        };
    }

    static deserialize(data) {
        const damageData = new ChunkDamageData(data.chunkCoord);
        damageData.addedVoxels = new Map(data.addedVoxels);
        damageData.removedVoxels = new Set(data.removedVoxels);
        damageData.impactHistory = data.impactHistory || [];
        damageData.version = data.version || 1;
        damageData.isDirty = true;
        return damageData;
    }
}
