export class ChunkCoordinate {
    static toKey(cx, cy, cz) {
        const x = (cx + 512) & 0x3FF;
        const y = (cy + 512) & 0x3FF;
        const z = (cz + 512) & 0x3FF;
        return (x << 20) | (y << 10) | z;
    }

    static fromKey(key) {
        const cx = ((key >> 20) & 0x3FF) - 512;
        const cy = ((key >> 10) & 0x3FF) - 512;
        const cz = (key & 0x3FF) - 512;
        return { cx, cy, cz };
    }

    static getNeighbors(cx, cy, cz) {
        return [
            { cx: cx + 1, cy, cz },
            { cx: cx - 1, cy, cz },
            { cx, cy: cy + 1, cz },
            { cx, cy: cy - 1, cz },
            { cx, cy, cz: cz + 1 },
            { cx, cy, cz: cz - 1 }
        ];
    }

    static worldToChunk(worldX, worldY, worldZ, chunkSize) {
        return {
            cx: Math.floor(worldX / chunkSize),
            cy: Math.floor(worldY / chunkSize),
            cz: Math.floor(worldZ / chunkSize)
        };
    }

    static chunkToWorld(cx, cy, cz, chunkSize) {
        return {
            x: cx * chunkSize,
            y: cy * chunkSize,
            z: cz * chunkSize
        };
    }
}
