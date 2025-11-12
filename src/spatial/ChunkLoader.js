import { ChunkCoordinate } from './ChunkCoordinate.js';

export class ChunkLoader {
    constructor(chunkSize = 16, chunksPerFrame = 16) {
        this.chunkSize = chunkSize;
        this.chunksPerFrame = chunksPerFrame;
        this.loadedChunks = new Map();
        this.pendingQueue = [];
        this.queuedSet = new Set();
        this.availableChunks = new Map();
        this.initialized = false;
    }

    setAvailableChunks(chunksMap) {
        this.availableChunks = chunksMap;
    }

    initializeWavefront(playerPosition) {
        if (this.initialized) return;

        let closestKey = null;
        let closestDist = Infinity;

        for (const [key] of this.availableChunks) {
            const { cx, cy, cz } = ChunkCoordinate.fromKey(key);
            const chunkCenter = {
                x: cx * this.chunkSize + this.chunkSize / 2,
                y: cy * this.chunkSize + this.chunkSize / 2,
                z: cz * this.chunkSize + this.chunkSize / 2
            };

            const dist = Math.sqrt(
                (chunkCenter.x - playerPosition.x) ** 2 +
                (chunkCenter.y - playerPosition.y) ** 2 +
                (chunkCenter.z - playerPosition.z) ** 2
            );

            if (dist < closestDist) {
                closestDist = dist;
                closestKey = key;
            }
        }

        if (closestKey) {
            const { cx, cy, cz } = ChunkCoordinate.fromKey(closestKey);
            this.addToQueue(cx, cy, cz, closestDist);
            this.initialized = true;
        }
    }

    addToQueue(cx, cy, cz, distFromPlayer) {
        const key = ChunkCoordinate.toKey(cx, cy, cz);
        
        if (this.queuedSet.has(key) || this.loadedChunks.has(key)) {
            return;
        }

        if (!this.availableChunks.has(key)) {
            return;
        }

        this.queuedSet.add(key);
        this.pendingQueue.push({ cx, cy, cz, distFromPlayer, key });
        this.pendingQueue.sort((a, b) => a.distFromPlayer - b.distFromPlayer);
    }

    updateQueue(playerPosition, loadRadius) {
        const newChunksToAdd = [];

        for (const [key, chunk] of this.loadedChunks) {
            const { cx, cy, cz } = ChunkCoordinate.fromKey(key);
            const neighbors = ChunkCoordinate.getNeighbors(cx, cy, cz);

            for (const { cx: nx, cy: ny, cz: nz } of neighbors) {
                const neighborKey = ChunkCoordinate.toKey(nx, ny, nz);

                if (this.queuedSet.has(neighborKey) || 
                    this.loadedChunks.has(neighborKey) || 
                    !this.availableChunks.has(neighborKey)) {
                    continue;
                }

                const chunkCenter = {
                    x: nx * this.chunkSize + this.chunkSize / 2,
                    y: ny * this.chunkSize + this.chunkSize / 2,
                    z: nz * this.chunkSize + this.chunkSize / 2
                };

                const distFromPlayer = Math.sqrt(
                    (chunkCenter.x - playerPosition.x) ** 2 +
                    (chunkCenter.y - playerPosition.y) ** 2 +
                    (chunkCenter.z - playerPosition.z) ** 2
                );

                if (distFromPlayer <= loadRadius) {
                    newChunksToAdd.push({ cx: nx, cy: ny, cz: nz, distFromPlayer });
                }
            }
        }

        for (const chunk of newChunksToAdd) {
            this.addToQueue(chunk.cx, chunk.cy, chunk.cz, chunk.distFromPlayer);
        }
    }

    loadNextBatch() {
        const batch = this.pendingQueue.splice(0, this.chunksPerFrame);
        const loadedThisFrame = [];

        for (const { cx, cy, cz, key } of batch) {
            const chunkData = this.availableChunks.get(key);

            if (chunkData) {
                this.loadedChunks.set(key, chunkData);
                this.queuedSet.delete(key);
                loadedThisFrame.push({ key, cx, cy, cz, chunkData });
            }
        }

        return loadedThisFrame;
    }

    unloadDistantChunks(playerPosition, unloadRadius) {
        const toUnload = [];
        const minUnloadDistance = 3000;

        for (const [key, chunk] of this.loadedChunks) {
            const { cx, cy, cz } = ChunkCoordinate.fromKey(key);
            const chunkCenter = {
                x: cx * this.chunkSize + this.chunkSize / 2,
                y: cy * this.chunkSize + this.chunkSize / 2,
                z: cz * this.chunkSize + this.chunkSize / 2
            };

            const dist = Math.sqrt(
                (chunkCenter.x - playerPosition.x) ** 2 +
                (chunkCenter.y - playerPosition.y) ** 2 +
                (chunkCenter.z - playerPosition.z) ** 2
            );

            if (dist > unloadRadius && dist > minUnloadDistance) {
                toUnload.push(key);
            }
        }

        for (const key of toUnload) {
            this.loadedChunks.delete(key);
            this.queuedSet.delete(key);
        }

        return toUnload;
    }

    clear() {
        this.loadedChunks.clear();
        this.pendingQueue = [];
        this.queuedSet.clear();
        this.initialized = false;
    }
}
