import { NBT } from './NBT.js';

export class MVoxFile {
    constructor(type, voxels, metadata = {}) {
        this.type = type;
        this.voxels = voxels;
        this.metadata = metadata;
        this.references = [];
    }

    addReference(mvoxId, scaleRatio, position = [0, 0, 0], rotation = [0, 0, 0]) {
        this.references.push({
            mvox_id: mvoxId,
            scale_ratio: scaleRatio,
            position,
            rotation
        });
    }

    encode() {
        const header = {
            version: 1,
            type: this.type,
            compression: 'none',
            nbt_schema: `polymir_${this.type}_v1`,
            scale_label: this.metadata.scale_label || 'block',

            planet: this.metadata.planet !== undefined ? this.metadata.planet : (this.type === 'planet'),

            category: this.metadata.category || this.metadata.buildType || 'uncategorized',
            tags: this.metadata.tags || [],

            metadata: {
                author: this.metadata.author || 'unknown',
                name: this.metadata.name || 'Untitled',
                bounds: this.metadata.bounds || [16, 16, 16],
                created: this.metadata.created || Date.now(),
                description: this.metadata.description || '',
                biomes: this.metadata.biomes || [],
                spawnFrequency: this.metadata.spawnFrequency || 0.05,
                ...this.metadata
            }
        };

        if (this.references.length > 0) {
            header.references = this.references;
        }

        const headerJson = JSON.stringify(header);
        const headerBytes = new TextEncoder().encode(headerJson);
        const separator = new TextEncoder().encode('\n');

        const nbtData = NBT.encodeVoxels(this.voxels, {
            chunkX: this.metadata.chunkX,
            chunkY: this.metadata.chunkY,
            chunkZ: this.metadata.chunkZ,
            chunkSize: this.metadata.chunkSize || 16
        });

        const totalLength = headerBytes.length + separator.length + nbtData.length;
        const result = new Uint8Array(totalLength);
        result.set(headerBytes, 0);
        result.set(separator, headerBytes.length);
        result.set(nbtData, headerBytes.length + separator.length);

        return result;
    }

    static decode(data) {
        let separatorIndex = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0x0A) {
                separatorIndex = i;
                break;
            }
        }

        if (separatorIndex === -1) {
            throw new Error('Invalid .mvox format: No header separator found');
        }

        const headerBytes = data.slice(0, separatorIndex);
        const headerJson = new TextDecoder().decode(headerBytes);
        const header = JSON.parse(headerJson);

        const nbtData = data.slice(separatorIndex + 1);
        const { voxels, metadata } = NBT.decodeVoxels(nbtData);

        const file = new MVoxFile(
            header.type,
            voxels,
            {
                ...header.metadata,
                ...metadata,
                planet: header.planet,
                category: header.category,
                tags: header.tags || []
            }
        );

        if (header.references) {
            file.references = header.references;
        }

        return file;
    }

    async save(cache, mvoxId) {
        const data = this.encode();
        await cache.saveMVox(mvoxId, data, this.type);
    }

    static async load(cache, mvoxId) {
        const data = await cache.loadMVox(mvoxId);
        if (!data) return null;
        return MVoxFile.decode(data);
    }

    toBlob() {
        const data = this.encode();
        return new Blob([data], { type: 'application/octet-stream' });
    }

    download(filename = 'structure') {
        const blob = this.toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.mvox`;
        a.click();
        URL.revokeObjectURL(url);
    }

    static async fromFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        return MVoxFile.decode(data);
    }

    getBounds() {
        if (this.voxels.size === 0) {
            return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const [encodedKey] of this.voxels) {
            const x = encodedKey & 0x1F;
            const y = (encodedKey >> 5) & 0x1F;
            const z = (encodedKey >> 10) & 0x1F;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        }

        return {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
            size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1]
        };
    }
}
