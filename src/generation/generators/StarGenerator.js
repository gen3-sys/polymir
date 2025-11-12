import { VoxelData } from '../../data/voxel/VoxelData.js';
import { hash } from '../../math/noise/hash.js';
import { noise3d } from '../../math/noise/noise3d.js';
import { ChunkCoordinate } from '../../spatial/ChunkCoordinate.js';

export class StarGenerator {
    constructor(radius, centerX = 0, centerY = 0, centerZ = 0) {
        this.radius = radius;
        this.centerX = centerX;
        this.centerY = centerY;
        this.centerZ = centerZ;
    }

    getHeightAtSpherePos(sphereX, sphereY, sphereZ) {
        let height = 0;
        height += (noise3d(sphereX * 3, sphereY * 3, sphereZ * 3) - 0.5) * 8;
        height += (noise3d(sphereX * 8, sphereY * 8, sphereZ * 8) - 0.5) * 4;
        height += (noise3d(sphereX * 16, sphereY * 16, sphereZ * 16) - 0.5) * 2;
        return height * 0.5;
    }

    getEmissiveColor(height, sphereX, sphereY, sphereZ) {
        const turbulence = noise3d(sphereX * 10, sphereY * 10, sphereZ * 10);

        const r = 1.0;
        const g = 0.8 + turbulence * 0.2;
        const b = 0.3 + turbulence * 0.4;

        return {
            r: Math.floor(r * 255),
            g: Math.floor(g * 255),
            b: Math.floor(b * 255)
        };
    }

    generateChunk(cx, cy, cz, chunkSize) {
        const chunkWorldX = cx * chunkSize + this.centerX;
        const chunkWorldY = cy * chunkSize + this.centerY;
        const chunkWorldZ = cz * chunkSize + this.centerZ;

        const chunkDist = Math.sqrt(
            chunkWorldX * chunkWorldX +
            chunkWorldY * chunkWorldY +
            chunkWorldZ * chunkWorldZ
        );

        if (chunkDist > this.radius + 50) return null;

        const voxels = new Map();
        let voxelCount = 0;

        for (let x = 0; x < chunkSize; x++) {
            for (let y = 0; y < chunkSize; y++) {
                for (let z = 0; z < chunkSize; z++) {
                    const worldX = chunkWorldX + x;
                    const worldY = chunkWorldY + y;
                    const worldZ = chunkWorldZ + z;

                    const dist = Math.sqrt(worldX * worldX + worldY * worldY + worldZ * worldZ);

                    if (dist < 10) continue;

                    const sphereX = worldX / dist;
                    const sphereY = worldY / dist;
                    const sphereZ = worldZ / dist;

                    const height = this.getHeightAtSpherePos(sphereX, sphereY, sphereZ);
                    const targetRadius = this.radius + height;

                    if (dist <= targetRadius && dist >= targetRadius - 1) {
                        const color = this.getEmissiveColor(height, sphereX, sphereY, sphereZ);
                        const key = (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);
                        voxels.set(key, {
                            x, y, z,
                            color: (color.r << 16) | (color.g << 8) | color.b,
                            type: 'star_emissive'
                        });
                        voxelCount++;
                    }
                }
            }
        }

        if (voxelCount === 0) return null;

        const voxelData = new VoxelData();
        voxelData.voxels = voxels;

        return {
            voxels,
            voxelCount
        };
    }

    generateAllChunks(chunkSize) {
        const chunks = new Map();
        const maxChunkRadius = Math.ceil((this.radius + 50) / chunkSize);

        for (let cx = -maxChunkRadius; cx <= maxChunkRadius; cx++) {
            for (let cy = -maxChunkRadius; cy <= maxChunkRadius; cy++) {
                for (let cz = -maxChunkRadius; cz <= maxChunkRadius; cz++) {
                    const chunkData = this.generateChunk(cx, cy, cz, chunkSize);

                    if (chunkData) {
                        const key = ChunkCoordinate.toKey(cx, cy, cz);
                        chunks.set(key, chunkData);
                    }
                }
            }
        }

        return chunks;
    }

    getSurfaceChunks(chunkSize) {
        const surfaceChunks = [];
        const maxChunkRadius = Math.ceil((this.radius + 50) / chunkSize);

        for (let cx = -maxChunkRadius; cx <= maxChunkRadius; cx++) {
            for (let cy = -maxChunkRadius; cy <= maxChunkRadius; cy++) {
                for (let cz = -maxChunkRadius; cz <= maxChunkRadius; cz++) {
                    const chunkWorldX = cx * chunkSize;
                    const chunkWorldY = cy * chunkSize;
                    const chunkWorldZ = cz * chunkSize;

                    const chunkDist = Math.sqrt(
                        chunkWorldX * chunkWorldX +
                        chunkWorldY * chunkWorldY +
                        chunkWorldZ * chunkWorldZ
                    );

                    if (Math.abs(chunkDist - this.radius) < chunkSize * 2) {
                        surfaceChunks.push({ cx, cy, cz });
                    }
                }
            }
        }

        return surfaceChunks;
    }
}
