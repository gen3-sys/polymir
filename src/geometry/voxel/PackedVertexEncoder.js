/**
 * PackedVertexEncoder - 32-bit Integer Vertex Compression
 *
 * Packs position + normal + textureID into single 32-bit integer
 * Achieves 7× compression: 28 bytes → 4 bytes per vertex
 *
 * Encoding Layout (32 bits):
 * [6 bits: X] [6 bits: Y] [6 bits: Z] [3 bits: normal] [8 bits: textureID] [3 bits: unused]
 *
 * Position Range: 0-63 (6 bits each axis)
 * Normal Index: 0-7 (3 bits) - maps to 6 cardinal directions + 2 diagonal
 * Texture ID: 0-255 (8 bits)
 *
 * Usage: Batch-relative coordinates (vertices in 0-64 range)
 */

export class PackedVertexEncoder {
    static NORMAL_VECTORS = [
        [1, 0, 0],   // 0: +X
        [-1, 0, 0],  // 1: -X
        [0, 1, 0],   // 2: +Y
        [0, -1, 0],  // 3: -Y
        [0, 0, 1],   // 4: +Z
        [0, 0, -1],  // 5: -Z
        [0, 0, 0],   // 6: unused
        [0, 0, 0]    // 7: unused
    ];

    /**
     * Pack vertex data into single 32-bit integer
     * @param {number} x - Local X position (0-63)
     * @param {number} y - Local Y position (0-63)
     * @param {number} z - Local Z position (0-63)
     * @param {number} normalX - Normal X component (-1, 0, or 1)
     * @param {number} normalY - Normal Y component (-1, 0, or 1)
     * @param {number} normalZ - Normal Z component (-1, 0, or 1)
     * @param {number} textureID - Texture ID (0-255)
     * @returns {number} Packed 32-bit integer
     */
    static pack(x, y, z, normalX, normalY, normalZ, textureID) {
        // Clamp positions to 6-bit range (0-63)
        const px = Math.floor(x) & 0x3F;
        const py = Math.floor(y) & 0x3F;
        const pz = Math.floor(z) & 0x3F;

        // Encode normal to 3-bit index
        const normalIdx = this.encodeNormal(normalX, normalY, normalZ);

        // Clamp textureID to 8-bit range (0-255)
        const texID = textureID & 0xFF;

        // Pack into 32-bit integer
        const packed = px |
                       (py << 6) |
                       (pz << 12) |
                       (normalIdx << 18) |
                       (texID << 21);

        return packed;
    }

    /**
     * Unpack 32-bit integer into vertex data
     * @param {number} packed - Packed 32-bit integer
     * @returns {Object} {x, y, z, normalX, normalY, normalZ, textureID}
     */
    static unpack(packed) {
        const x = packed & 0x3F;
        const y = (packed >> 6) & 0x3F;
        const z = (packed >> 12) & 0x3F;
        const normalIdx = (packed >> 18) & 0x7;
        const textureID = (packed >> 21) & 0xFF;

        const [normalX, normalY, normalZ] = this.NORMAL_VECTORS[normalIdx];

        return { x, y, z, normalX, normalY, normalZ, textureID };
    }

    /**
     * Encode normal vector to 3-bit index
     */
    static encodeNormal(nx, ny, nz) {
        if (nx === 1) return 0;  // +X
        if (nx === -1) return 1; // -X
        if (ny === 1) return 2;  // +Y
        if (ny === -1) return 3; // -Y
        if (nz === 1) return 4;  // +Z
        if (nz === -1) return 5; // -Z
        return 6; // Default
    }

    /**
     * Pack geometry data into Int32Array
     * @param {Object} geometryData - {vertices, normals, colors, indices}
     * @param {number} chunkSize - Size of chunk (for validation)
     * @returns {Object} {packedVertices: Int32Array, indices: Uint32Array}
     */
    static packGeometry(geometryData, chunkSize = 16) {
        const { vertices, normals, colors, indices } = geometryData;
        const vertexCount = vertices.length / 3;

        const packedVertices = new Int32Array(vertexCount);

        for (let i = 0; i < vertexCount; i++) {
            const x = vertices[i * 3];
            const y = vertices[i * 3 + 1];
            const z = vertices[i * 3 + 2];

            const nx = normals[i * 3];
            const ny = normals[i * 3 + 1];
            const nz = normals[i * 3 + 2];

            // Convert RGB color to textureID (simplified - use actual texture atlas later)
            const r = Math.floor(colors[i * 3] * 255);
            const g = Math.floor(colors[i * 3 + 1] * 255);
            const b = Math.floor(colors[i * 3 + 2] * 255);
            const textureID = this.colorToTextureID(r, g, b);

            packedVertices[i] = this.pack(x, y, z, nx, ny, nz, textureID);
        }

        return {
            packedVertices,
            indices: indices instanceof Uint32Array ? indices : new Uint32Array(indices),
            vertexCount
        };
    }

    /**
     * Unpack Int32Array into geometry data
     * @param {Int32Array} packedVertices
     * @param {Uint32Array} indices
     * @returns {Object} {vertices, normals, colors, indices}
     */
    static unpackGeometry(packedVertices, indices) {
        const vertexCount = packedVertices.length;

        const vertices = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 3);

        for (let i = 0; i < vertexCount; i++) {
            const unpacked = this.unpack(packedVertices[i]);

            vertices[i * 3] = unpacked.x;
            vertices[i * 3 + 1] = unpacked.y;
            vertices[i * 3 + 2] = unpacked.z;

            normals[i * 3] = unpacked.normalX;
            normals[i * 3 + 1] = unpacked.normalY;
            normals[i * 3 + 2] = unpacked.normalZ;

            const [r, g, b] = this.textureIDToColor(unpacked.textureID);
            colors[i * 3] = r / 255;
            colors[i * 3 + 1] = g / 255;
            colors[i * 3 + 2] = b / 255;
        }

        return { vertices, normals, colors, indices };
    }

    /**
     * Simplified color to textureID mapping
     * TODO: Replace with actual texture atlas lookup
     */
    static colorToTextureID(r, g, b) {
        // Simple hash: use dominant color channel
        if (r > g && r > b) return 1;  // Red-ish = texture 1
        if (g > r && g > b) return 2;  // Green-ish = texture 2
        if (b > r && b > g) return 3;  // Blue-ish = texture 3
        return 0; // Gray-ish = texture 0
    }

    /**
     * Simplified textureID to color mapping
     * TODO: Replace with actual texture atlas lookup
     */
    static textureIDToColor(textureID) {
        switch (textureID) {
            case 1: return [200, 100, 100]; // Red-ish
            case 2: return [100, 200, 100]; // Green-ish
            case 3: return [100, 100, 200]; // Blue-ish
            default: return [128, 128, 128]; // Gray
        }
    }

    /**
     * Calculate memory savings
     * @param {number} vertexCount - Number of vertices
     * @returns {Object} Memory comparison
     */
    static calculateSavings(vertexCount) {
        const unpackedSize = vertexCount * 28; // 3 pos + 3 normal + 3 color = 9 floats * 4 bytes
        const packedSize = vertexCount * 4;    // 1 int32 = 4 bytes
        const savings = unpackedSize - packedSize;
        const compressionRatio = unpackedSize / packedSize;

        return {
            unpackedSize,
            packedSize,
            savings,
            compressionRatio,
            savingsPercent: ((savings / unpackedSize) * 100).toFixed(1)
        };
    }
}
