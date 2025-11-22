/**
 * AvatarSerializer - Compression and serialization for voxel avatars
 *
 * Binary format specification (PVAV - Polymir Voxel Avatar):
 *
 * Header (16 bytes):
 *   0-3:  Magic "PVAV" (4 bytes)
 *   4:    Version (uint8)
 *   5:    Flags (uint8) - bit 0: has expressions, bit 1: has spring bones
 *   6-7:  Voxel count (uint16)
 *   8:    Palette size (uint8)
 *   9:    Expression count (uint8)
 *   10:   Spring bone region count (uint8)
 *   11:   Render mode (uint8) - 0: auto, 1: cube, 2: smooth
 *   12-15: Reserved
 *
 * Metadata (variable):
 *   Name length (uint8) + Name (UTF-8)
 *   Creator ID length (uint8) + Creator ID (UTF-8)
 *   Created timestamp (uint64)
 *   Modified timestamp (uint64)
 *
 * Palette (paletteSize * 4 bytes):
 *   For each color: R, G, B, Type (4 bytes)
 *
 * Voxel Data (RLE compressed):
 *   Sorted by Y, X, Z for optimal compression
 *   Each run: encoded position (uint16), palette index (uint8), run length (uint8)
 *
 * Expressions (if flag set):
 *   For each expression:
 *     Name length (uint8) + Name (UTF-8)
 *     Delta count (uint16)
 *     For each delta: encoded position (uint16), palette index (uint8)
 *
 * Spring Bone Regions (if flag set):
 *   For each region:
 *     Name length (uint8) + Name (UTF-8)
 *     Stiffness (float32), Damping (float32), Gravity (float32)
 *     Voxel count (uint16)
 *     For each voxel: encoded position (uint16)
 */

import { VoxelAvatarData, AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from './VoxelAvatarData.js';
import { AvatarPalette, COLOR_TYPE } from './AvatarPalette.js';

// Format constants
const MAGIC = 'PVAV';
const VERSION = 1;

// Flags
const FLAG_HAS_EXPRESSIONS = 0x01;
const FLAG_HAS_SPRING_BONES = 0x02;

// Render modes
const RENDER_MODE_MAP = {
    'auto': 0,
    'cube': 1,
    'smooth': 2
};

const RENDER_MODE_REVERSE = {
    0: 'auto',
    1: 'cube',
    2: 'smooth'
};

export class AvatarSerializer {
    /**
     * Serialize avatar to compressed binary format
     * @param {VoxelAvatarData} avatar
     * @returns {Uint8Array}
     */
    static serialize(avatar) {
        const chunks = [];

        // Calculate flags
        let flags = 0;
        if (avatar.expressions.size > 0) flags |= FLAG_HAS_EXPRESSIONS;
        if (avatar.springBoneRegions.length > 0) flags |= FLAG_HAS_SPRING_BONES;

        // Header (16 bytes)
        const header = new Uint8Array(16);
        // Magic
        header[0] = MAGIC.charCodeAt(0);
        header[1] = MAGIC.charCodeAt(1);
        header[2] = MAGIC.charCodeAt(2);
        header[3] = MAGIC.charCodeAt(3);
        // Version
        header[4] = VERSION;
        // Flags
        header[5] = flags;
        // Voxel count (uint16, little endian)
        const voxelCount = avatar.getVoxelCount();
        header[6] = voxelCount & 0xFF;
        header[7] = (voxelCount >> 8) & 0xFF;
        // Palette size
        header[8] = avatar.palette.size();
        // Expression count
        header[9] = avatar.expressions.size;
        // Spring bone region count
        header[10] = avatar.springBoneRegions.length;
        // Render mode
        header[11] = RENDER_MODE_MAP[avatar.renderMode] || 0;
        // Reserved (12-15)
        chunks.push(header);

        // Metadata
        chunks.push(this.serializeMetadata(avatar.metadata));

        // Palette
        chunks.push(avatar.palette.toBinary());

        // Voxel data (RLE compressed)
        chunks.push(this.serializeVoxels(avatar));

        // Expressions
        if (flags & FLAG_HAS_EXPRESSIONS) {
            chunks.push(this.serializeExpressions(avatar));
        }

        // Spring bone regions
        if (flags & FLAG_HAS_SPRING_BONES) {
            chunks.push(this.serializeSpringBones(avatar));
        }

        // Combine all chunks
        return this.concatArrays(chunks);
    }

    /**
     * Deserialize avatar from binary format
     * @param {Uint8Array} buffer
     * @returns {VoxelAvatarData}
     */
    static deserialize(buffer) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        let offset = 0;

        // Read header
        const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
        if (magic !== MAGIC) {
            throw new Error(`Invalid avatar format: expected ${MAGIC}, got ${magic}`);
        }

        const version = buffer[4];
        if (version > VERSION) {
            console.warn(`[AvatarSerializer] Avatar version ${version} is newer than supported ${VERSION}`);
        }

        const flags = buffer[5];
        const voxelCount = buffer[6] | (buffer[7] << 8);
        const paletteSize = buffer[8];
        const expressionCount = buffer[9];
        const springBoneCount = buffer[10];
        const renderMode = RENDER_MODE_REVERSE[buffer[11]] || 'auto';
        offset = 16;

        // Read metadata
        const { metadata, bytesRead: metadataBytes } = this.deserializeMetadata(buffer, offset);
        offset += metadataBytes;

        // Read palette
        const paletteBuffer = buffer.slice(offset, offset + paletteSize * 4);
        const palette = AvatarPalette.fromBinary(paletteBuffer);
        offset += paletteSize * 4;

        // Create avatar
        const avatar = new VoxelAvatarData({
            palette,
            renderMode,
            ...metadata
        });

        // Read voxels
        const { bytesRead: voxelBytes } = this.deserializeVoxels(buffer, offset, avatar);
        offset += voxelBytes;

        // Read expressions
        if (flags & FLAG_HAS_EXPRESSIONS) {
            const { bytesRead: exprBytes } = this.deserializeExpressions(buffer, offset, avatar, expressionCount);
            offset += exprBytes;
        }

        // Read spring bone regions
        if (flags & FLAG_HAS_SPRING_BONES) {
            const { bytesRead: springBytes } = this.deserializeSpringBones(buffer, offset, avatar, springBoneCount);
            offset += springBytes;
        }

        return avatar;
    }

    // =========================================================================
    // Metadata Serialization
    // =========================================================================

    static serializeMetadata(metadata) {
        const parts = [];

        // Name
        const nameBytes = new TextEncoder().encode(metadata.name || '');
        const nameLengthByte = new Uint8Array([Math.min(255, nameBytes.length)]);
        parts.push(nameLengthByte);
        parts.push(nameBytes.slice(0, 255));

        // Creator ID
        const creatorBytes = new TextEncoder().encode(metadata.creatorId || '');
        const creatorLengthByte = new Uint8Array([Math.min(255, creatorBytes.length)]);
        parts.push(creatorLengthByte);
        parts.push(creatorBytes.slice(0, 255));

        // Timestamps (as uint64, but we'll use 2x uint32 for simplicity)
        const timestamps = new Uint8Array(16);
        const timestampView = new DataView(timestamps.buffer);
        timestampView.setUint32(0, Math.floor(metadata.created / 0x100000000), true);
        timestampView.setUint32(4, metadata.created >>> 0, true);
        timestampView.setUint32(8, Math.floor(metadata.modified / 0x100000000), true);
        timestampView.setUint32(12, metadata.modified >>> 0, true);
        parts.push(timestamps);

        return this.concatArrays(parts);
    }

    static deserializeMetadata(buffer, offset) {
        const decoder = new TextDecoder();
        let pos = offset;

        // Name
        const nameLength = buffer[pos++];
        const name = decoder.decode(buffer.slice(pos, pos + nameLength));
        pos += nameLength;

        // Creator ID
        const creatorLength = buffer[pos++];
        const creatorId = creatorLength > 0 ? decoder.decode(buffer.slice(pos, pos + creatorLength)) : null;
        pos += creatorLength;

        // Timestamps
        const view = new DataView(buffer.buffer, buffer.byteOffset + pos, 16);
        const createdHigh = view.getUint32(0, true);
        const createdLow = view.getUint32(4, true);
        const created = createdHigh * 0x100000000 + createdLow;

        const modifiedHigh = view.getUint32(8, true);
        const modifiedLow = view.getUint32(12, true);
        const modified = modifiedHigh * 0x100000000 + modifiedLow;
        pos += 16;

        return {
            metadata: { name, creatorId, created, modified },
            bytesRead: pos - offset
        };
    }

    // =========================================================================
    // Voxel Serialization (RLE)
    // =========================================================================

    static serializeVoxels(avatar) {
        const voxels = avatar.getSortedVoxels();

        if (voxels.length === 0) {
            // Empty avatar: just write 0 runs
            return new Uint8Array([0, 0]);
        }

        const runs = [];
        let currentRun = null;

        for (const voxel of voxels) {
            const key = avatar.encodePosition(voxel.x, voxel.y, voxel.z);

            if (currentRun === null) {
                // Start new run
                currentRun = {
                    startKey: key,
                    paletteIndex: voxel.paletteIndex,
                    length: 1
                };
            } else if (
                voxel.paletteIndex === currentRun.paletteIndex &&
                key === currentRun.startKey + currentRun.length &&
                currentRun.length < 255
            ) {
                // Continue run
                currentRun.length++;
            } else {
                // End current run, start new one
                runs.push(currentRun);
                currentRun = {
                    startKey: key,
                    paletteIndex: voxel.paletteIndex,
                    length: 1
                };
            }
        }

        // Don't forget the last run
        if (currentRun) {
            runs.push(currentRun);
        }

        // Write runs
        // Format: run count (uint16) + [position (uint16), palette (uint8), length (uint8)] per run
        const buffer = new Uint8Array(2 + runs.length * 4);
        buffer[0] = runs.length & 0xFF;
        buffer[1] = (runs.length >> 8) & 0xFF;

        for (let i = 0; i < runs.length; i++) {
            const run = runs[i];
            const offset = 2 + i * 4;
            buffer[offset] = run.startKey & 0xFF;
            buffer[offset + 1] = (run.startKey >> 8) & 0xFF;
            buffer[offset + 2] = run.paletteIndex;
            buffer[offset + 3] = run.length;
        }

        return buffer;
    }

    static deserializeVoxels(buffer, offset, avatar) {
        const runCount = buffer[offset] | (buffer[offset + 1] << 8);
        let pos = offset + 2;

        for (let i = 0; i < runCount; i++) {
            const startKey = buffer[pos] | (buffer[pos + 1] << 8);
            const paletteIndex = buffer[pos + 2];
            const length = buffer[pos + 3];
            pos += 4;

            // Expand run
            for (let j = 0; j < length; j++) {
                const key = startKey + j;
                const { x, y, z } = avatar.decodePosition(key);
                avatar.voxels.set(key, paletteIndex);
            }
        }

        return { bytesRead: pos - offset };
    }

    // =========================================================================
    // Expression Serialization
    // =========================================================================

    static serializeExpressions(avatar) {
        const parts = [];
        const encoder = new TextEncoder();

        for (const [name, deltaMap] of avatar.expressions) {
            // Name
            const nameBytes = encoder.encode(name);
            parts.push(new Uint8Array([Math.min(32, nameBytes.length)]));
            parts.push(nameBytes.slice(0, 32));

            // Delta count
            const deltaCount = deltaMap.size;
            parts.push(new Uint8Array([deltaCount & 0xFF, (deltaCount >> 8) & 0xFF]));

            // Deltas
            const deltas = new Uint8Array(deltaCount * 3);
            let i = 0;
            for (const [key, paletteIndex] of deltaMap) {
                deltas[i * 3] = key & 0xFF;
                deltas[i * 3 + 1] = (key >> 8) & 0xFF;
                deltas[i * 3 + 2] = paletteIndex;
                i++;
            }
            parts.push(deltas);
        }

        return this.concatArrays(parts);
    }

    static deserializeExpressions(buffer, offset, avatar, count) {
        const decoder = new TextDecoder();
        let pos = offset;

        for (let e = 0; e < count; e++) {
            // Name
            const nameLength = buffer[pos++];
            const name = decoder.decode(buffer.slice(pos, pos + nameLength));
            pos += nameLength;

            // Delta count
            const deltaCount = buffer[pos] | (buffer[pos + 1] << 8);
            pos += 2;

            // Deltas
            const deltaMap = new Map();
            for (let i = 0; i < deltaCount; i++) {
                const key = buffer[pos] | (buffer[pos + 1] << 8);
                const paletteIndex = buffer[pos + 2];
                deltaMap.set(key, paletteIndex);
                pos += 3;
            }

            avatar.expressions.set(name, deltaMap);
        }

        return { bytesRead: pos - offset };
    }

    // =========================================================================
    // Spring Bone Serialization
    // =========================================================================

    static serializeSpringBones(avatar) {
        const parts = [];
        const encoder = new TextEncoder();

        for (const region of avatar.springBoneRegions) {
            // Name
            const nameBytes = encoder.encode(region.name);
            parts.push(new Uint8Array([Math.min(32, nameBytes.length)]));
            parts.push(nameBytes.slice(0, 32));

            // Params (3 float32 = 12 bytes)
            const params = new Float32Array([
                region.params.stiffness,
                region.params.damping,
                region.params.gravityFactor
            ]);
            parts.push(new Uint8Array(params.buffer));

            // Voxel keys
            const voxelCount = region.voxelKeys.size;
            parts.push(new Uint8Array([voxelCount & 0xFF, (voxelCount >> 8) & 0xFF]));

            const voxelKeys = new Uint8Array(voxelCount * 2);
            let i = 0;
            for (const key of region.voxelKeys) {
                voxelKeys[i * 2] = key & 0xFF;
                voxelKeys[i * 2 + 1] = (key >> 8) & 0xFF;
                i++;
            }
            parts.push(voxelKeys);
        }

        return this.concatArrays(parts);
    }

    static deserializeSpringBones(buffer, offset, avatar, count) {
        const decoder = new TextDecoder();
        let pos = offset;

        for (let r = 0; r < count; r++) {
            // Name
            const nameLength = buffer[pos++];
            const name = decoder.decode(buffer.slice(pos, pos + nameLength));
            pos += nameLength;

            // Params
            const paramsView = new DataView(buffer.buffer, buffer.byteOffset + pos, 12);
            const stiffness = paramsView.getFloat32(0, true);
            const damping = paramsView.getFloat32(4, true);
            const gravityFactor = paramsView.getFloat32(8, true);
            pos += 12;

            // Voxel keys
            const voxelCount = buffer[pos] | (buffer[pos + 1] << 8);
            pos += 2;

            const voxelKeys = new Set();
            for (let i = 0; i < voxelCount; i++) {
                const key = buffer[pos] | (buffer[pos + 1] << 8);
                voxelKeys.add(key);
                pos += 2;
            }

            avatar.springBoneRegions.push({
                name,
                voxelKeys,
                params: { stiffness, damping, gravityFactor }
            });
        }

        return { bytesRead: pos - offset };
    }

    // =========================================================================
    // JSON Serialization (for debugging/editing)
    // =========================================================================

    /**
     * Serialize to JSON (human-readable, larger file size)
     */
    static toJSON(avatar) {
        return {
            format: 'PVAV_JSON',
            version: VERSION,
            metadata: { ...avatar.metadata },
            renderMode: avatar.renderMode,
            palette: avatar.palette.serialize(),
            voxels: avatar.toArray(),
            expressions: Object.fromEntries(
                Array.from(avatar.expressions.entries()).map(([name, deltaMap]) => [
                    name,
                    Array.from(deltaMap.entries()).map(([key, idx]) => ({
                        ...avatar.decodePosition(key),
                        paletteIndex: idx
                    }))
                ])
            ),
            springBoneRegions: avatar.springBoneRegions.map(region => ({
                name: region.name,
                params: { ...region.params },
                voxels: Array.from(region.voxelKeys).map(key => avatar.decodePosition(key))
            }))
        };
    }

    /**
     * Deserialize from JSON
     */
    static fromJSON(json) {
        if (json.format !== 'PVAV_JSON') {
            throw new Error('Invalid JSON avatar format');
        }

        const palette = AvatarPalette.deserialize(json.palette);
        const avatar = new VoxelAvatarData({
            palette,
            renderMode: json.renderMode,
            ...json.metadata
        });

        // Load voxels
        for (const v of json.voxels) {
            avatar.setVoxel(v.x, v.y, v.z, v.paletteIndex);
        }

        // Load expressions
        for (const [name, deltas] of Object.entries(json.expressions || {})) {
            const deltaMap = new Map();
            for (const d of deltas) {
                const key = avatar.encodePosition(d.x, d.y, d.z);
                deltaMap.set(key, d.paletteIndex);
            }
            avatar.expressions.set(name, deltaMap);
        }

        // Load spring bone regions
        for (const region of (json.springBoneRegions || [])) {
            const voxelKeys = new Set();
            for (const v of region.voxels) {
                voxelKeys.add(avatar.encodePosition(v.x, v.y, v.z));
            }
            avatar.springBoneRegions.push({
                name: region.name,
                params: { ...region.params },
                voxelKeys
            });
        }

        return avatar;
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    /**
     * Concatenate multiple Uint8Arrays
     */
    static concatArrays(arrays) {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    /**
     * Calculate compressed size estimate
     */
    static estimateSize(avatar) {
        const voxelCount = avatar.getVoxelCount();
        const paletteSize = avatar.palette.size();

        // Rough estimate based on format
        const headerSize = 16;
        const metadataSize = 50 + (avatar.metadata.name?.length || 0) + (avatar.metadata.creatorId?.length || 0);
        const paletteBytes = paletteSize * 4;

        // Assume average run length of 3-5 for typical avatars
        const estimatedRuns = Math.ceil(voxelCount / 4);
        const voxelBytes = 2 + estimatedRuns * 4;

        // Expressions (rough estimate)
        let expressionBytes = 0;
        for (const [name, deltaMap] of avatar.expressions) {
            expressionBytes += 1 + name.length + 2 + deltaMap.size * 3;
        }

        // Spring bones (rough estimate)
        let springBoneBytes = 0;
        for (const region of avatar.springBoneRegions) {
            springBoneBytes += 1 + region.name.length + 12 + 2 + region.voxelKeys.size * 2;
        }

        return {
            header: headerSize,
            metadata: metadataSize,
            palette: paletteBytes,
            voxels: voxelBytes,
            expressions: expressionBytes,
            springBones: springBoneBytes,
            total: headerSize + metadataSize + paletteBytes + voxelBytes + expressionBytes + springBoneBytes
        };
    }

    /**
     * Compress buffer using browser's CompressionStream (if available)
     * Falls back to uncompressed if not supported
     */
    static async compress(buffer) {
        if (typeof CompressionStream === 'undefined') {
            // No compression support, return as-is with marker
            const result = new Uint8Array(buffer.length + 1);
            result[0] = 0; // Uncompressed marker
            result.set(buffer, 1);
            return result;
        }

        try {
            const stream = new CompressionStream('gzip');
            const writer = stream.writable.getWriter();
            writer.write(buffer);
            writer.close();

            const chunks = [];
            const reader = stream.readable.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }

            const compressed = this.concatArrays(chunks);

            // Add compression marker
            const result = new Uint8Array(compressed.length + 1);
            result[0] = 1; // Gzip marker
            result.set(compressed, 1);
            return result;
        } catch (err) {
            console.warn('[AvatarSerializer] Compression failed, using uncompressed:', err);
            const result = new Uint8Array(buffer.length + 1);
            result[0] = 0;
            result.set(buffer, 1);
            return result;
        }
    }

    /**
     * Decompress buffer
     */
    static async decompress(buffer) {
        const marker = buffer[0];
        const data = buffer.slice(1);

        if (marker === 0) {
            // Uncompressed
            return data;
        }

        if (typeof DecompressionStream === 'undefined') {
            throw new Error('Compressed avatar but DecompressionStream not supported');
        }

        try {
            const stream = new DecompressionStream('gzip');
            const writer = stream.writable.getWriter();
            writer.write(data);
            writer.close();

            const chunks = [];
            const reader = stream.readable.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }

            return this.concatArrays(chunks);
        } catch (err) {
            throw new Error('Failed to decompress avatar: ' + err.message);
        }
    }
}

export default AvatarSerializer;
