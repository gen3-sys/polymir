export class ChunkCoordinate {
    static toKey(cx, cy, cz) {
        return `${cx},${cy},${cz}`;
    }

    static fromKey(key) {
        const [cx, cy, cz] = key.split(',').map(Number);
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
