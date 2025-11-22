export class NBT {
    static TAG_END = 0;
    static TAG_BYTE = 1;
    static TAG_SHORT = 2;
    static TAG_INT = 3;
    static TAG_LONG = 4;
    static TAG_FLOAT = 5;
    static TAG_DOUBLE = 6;
    static TAG_BYTE_ARRAY = 7;
    static TAG_STRING = 8;
    static TAG_LIST = 9;
    static TAG_COMPOUND = 10;
    static TAG_INT_ARRAY = 11;

    static encodeVoxels(voxels, metadata = {}) {
        const buffer = [];

        this.writeTag(buffer, this.TAG_COMPOUND, 'voxelData');

        if (metadata.chunkX !== undefined) {
            this.writeTag(buffer, this.TAG_INT, 'chunkX');
            this.writeInt(buffer, metadata.chunkX);
        }
        if (metadata.chunkY !== undefined) {
            this.writeTag(buffer, this.TAG_INT, 'chunkY');
            this.writeInt(buffer, metadata.chunkY);
        }
        if (metadata.chunkZ !== undefined) {
            this.writeTag(buffer, this.TAG_INT, 'chunkZ');
            this.writeInt(buffer, metadata.chunkZ);
        }
        if (metadata.chunkSize !== undefined) {
            this.writeTag(buffer, this.TAG_INT, 'chunkSize');
            this.writeInt(buffer, metadata.chunkSize);
        }

        this.writeTag(buffer, this.TAG_INT, 'voxelCount');
        this.writeInt(buffer, voxels.size);

        this.writeTag(buffer, this.TAG_INT_ARRAY, 'positions');
        this.writeInt(buffer, voxels.size);
        for (const [key] of voxels) {
            this.writeInt(buffer, key);
        }

        this.writeTag(buffer, this.TAG_INT_ARRAY, 'colors');
        this.writeInt(buffer, voxels.size);
        for (const [, voxel] of voxels) {
            this.writeInt(buffer, voxel.color || 0x808080);
        }

        // Write layer indices if present
        const hasLayers = Array.from(voxels.values()).some(v => v.layerIndex !== undefined && v.layerIndex !== 0);
        if (hasLayers) {
            this.writeTag(buffer, this.TAG_INT_ARRAY, 'layerIndices');
            this.writeInt(buffer, voxels.size);
            for (const [, voxel] of voxels) {
                this.writeInt(buffer, voxel.layerIndex || 0);
            }
        }

        // Write semantics if present
        const hasSemantics = Array.from(voxels.values()).some(v => v.semantics !== undefined);
        if (hasSemantics) {
            this.writeTag(buffer, this.TAG_INT_ARRAY, 'semantics');
            this.writeInt(buffer, voxels.size);
            for (const [, voxel] of voxels) {
                this.writeInt(buffer, voxel.semantics || 0);
            }
        }

        this.writeByte(buffer, this.TAG_END);

        return new Uint8Array(buffer);
    }

    static decodeVoxels(data) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let offset = 0;

        const voxels = new Map();
        const metadata = {};

        const rootType = view.getUint8(offset++);
        if (rootType !== this.TAG_COMPOUND) {
            throw new Error('Invalid NBT: Root tag must be compound');
        }

        const rootNameLength = view.getUint16(offset);
        offset += 2 + rootNameLength;

        let positions = [];
        let colors = [];
        let layerIndices = [];
        let semantics = [];

        while (offset < data.length) {
            const tagType = view.getUint8(offset++);
            if (tagType === this.TAG_END) break;

            const nameLength = view.getUint16(offset);
            offset += 2;
            const name = new TextDecoder().decode(data.slice(offset, offset + nameLength));
            offset += nameLength;

            switch (tagType) {
                case this.TAG_INT:
                    const intValue = view.getInt32(offset);
                    offset += 4;
                    if (name === 'chunkX' || name === 'chunkY' || name === 'chunkZ' || name === 'chunkSize' || name === 'voxelCount') {
                        metadata[name] = intValue;
                    }
                    break;

                case this.TAG_INT_ARRAY:
                    const arrayLength = view.getInt32(offset);
                    offset += 4;
                    const array = [];
                    for (let i = 0; i < arrayLength; i++) {
                        array.push(view.getInt32(offset));
                        offset += 4;
                    }
                    if (name === 'positions') {
                        positions = array;
                    } else if (name === 'colors') {
                        colors = array;
                    } else if (name === 'layerIndices') {
                        layerIndices = array;
                    } else if (name === 'semantics') {
                        semantics = array;
                    }
                    break;

                default:
                    throw new Error(`Unsupported tag type: ${tagType}`);
            }
        }

        for (let i = 0; i < positions.length; i++) {
            const voxelData = {
                color: colors[i]
            };

            if (layerIndices.length > 0) {
                voxelData.layerIndex = layerIndices[i];
            }

            if (semantics.length > 0) {
                voxelData.semantics = semantics[i];
            }

            voxels.set(positions[i], voxelData);
        }

        return { voxels, metadata };
    }

    static writeTag(buffer, type, name) {
        buffer.push(type);
        this.writeString(buffer, name);
    }

    static writeByte(buffer, value) {
        buffer.push(value & 0xFF);
    }

    static writeInt(buffer, value) {
        buffer.push((value >> 24) & 0xFF);
        buffer.push((value >> 16) & 0xFF);
        buffer.push((value >> 8) & 0xFF);
        buffer.push(value & 0xFF);
    }

    static writeString(buffer, str) {
        const bytes = new TextEncoder().encode(str);
        buffer.push((bytes.length >> 8) & 0xFF);
        buffer.push(bytes.length & 0xFF);
        buffer.push(...bytes);
    }
}
