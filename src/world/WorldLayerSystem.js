export class WorldLayerSystem {
    constructor() {
        this.originalWorld = new Map();
        this.damageMap = new Set();
        this.worldMods = new Map();
        this.voxelLayers = new Map();
    }

    setOriginalWorld(voxels) {
        for (const voxel of voxels) {
            const key = this.getVoxelKey(voxel.x, voxel.y, voxel.z, voxel.scale || 1);

            this.originalWorld.set(key, {
                color: voxel.color,
                semantics: voxel.semantics,
                buildId: voxel.buildId || 'WORLD'
            });

            this.voxelLayers.set(key, 'original');
        }
    }

    isOriginalWorld(x, y, z, scale = 1) {
        const key = this.getVoxelKey(x, y, z, scale);
        return this.originalWorld.has(key) && !this.damageMap.has(key);
    }

    addDamage(x, y, z, scale = 1) {
        const key = this.getVoxelKey(x, y, z, scale);

        if (this.originalWorld.has(key)) {
            this.damageMap.add(key);
            this.voxelLayers.set(key, 'damage');
            return true;
        }
        return false;
    }

    removeDamage(x, y, z, scale = 1) {
        const key = this.getVoxelKey(x, y, z, scale);

        if (this.damageMap.delete(key)) {
            if (this.originalWorld.has(key)) {
                this.voxelLayers.set(key, 'original');
            }
            return true;
        }
        return false;
    }

    addWorldMod(x, y, z, scale = 1, voxelData) {
        const key = this.getVoxelKey(x, y, z, scale);

        if (this.originalWorld.has(key) && !this.damageMap.has(key)) {
            return false;
        }

        this.worldMods.set(key, {
            color: voxelData.color,
            semantics: voxelData.semantics,
            buildId: 'WORLDMOD'
        });

        this.voxelLayers.set(key, 'worldmod');
        return true;
    }

    mergeToWorldMods(voxels) {
        let mergedCount = 0;

        for (const voxel of voxels) {
            if (this.addWorldMod(voxel.x, voxel.y, voxel.z, voxel.scale || 1, voxel)) {
                voxel.buildId = 'WORLDMOD';
                mergedCount++;
            }
        }

        return mergedCount;
    }

    getCompositeWorld() {
        const composite = [];

        for (const [key, voxelData] of this.originalWorld) {
            if (!this.damageMap.has(key)) {
                const [x, y, z, scale] = this.parseVoxelKey(key);
                composite.push({
                    x: parseFloat(x),
                    y: parseFloat(y),
                    z: parseFloat(z),
                    scale: parseFloat(scale),
                    ...voxelData
                });
            }
        }

        for (const [key, voxelData] of this.worldMods) {
            const [x, y, z, scale] = this.parseVoxelKey(key);
            composite.push({
                x: parseFloat(x),
                y: parseFloat(y),
                z: parseFloat(z),
                scale: parseFloat(scale),
                ...voxelData
            });
        }

        return composite;
    }

    resetWorld(options = {}) {
        const {
            clearDamage = true,
            clearWorldMods = true
        } = options;

        const cleared = {
            damage: 0,
            worldMods: 0
        };

        if (clearDamage) {
            cleared.damage = this.damageMap.size;
            this.damageMap.clear();

            for (const key of this.originalWorld.keys()) {
                this.voxelLayers.set(key, 'original');
            }
        }

        if (clearWorldMods) {
            cleared.worldMods = this.worldMods.size;
            this.worldMods.clear();
        }

        return cleared;
    }

    getLayerStats() {
        return {
            original: this.originalWorld.size,
            damaged: this.damageMap.size,
            worldMods: this.worldMods.size,
            intact: this.originalWorld.size - this.damageMap.size
        };
    }

    getVoxelKey(x, y, z, scale) {
        return `${x},${y},${z},${scale}`;
    }

    parseVoxelKey(key) {
        return key.split(',');
    }

    save() {
        return {
            originalWorld: Array.from(this.originalWorld.entries()),
            damageMap: Array.from(this.damageMap),
            worldMods: Array.from(this.worldMods.entries()),
            voxelLayers: Array.from(this.voxelLayers.entries())
        };
    }

    load(data) {
        if (data.originalWorld) {
            this.originalWorld = new Map(data.originalWorld);
        }
        if (data.damageMap) {
            this.damageMap = new Set(data.damageMap);
        }
        if (data.worldMods) {
            this.worldMods = new Map(data.worldMods);
        }
        if (data.voxelLayers) {
            this.voxelLayers = new Map(data.voxelLayers);
        }
    }
}

export default WorldLayerSystem;
