import { noise3d } from '../../math/noise/noise3d.js';

export class SphereGenerator {
    constructor(radius = 150, voxelSize = 1) {
        this.radius = radius;
        this.voxelSize = voxelSize;
    }

    getHeightAtSpherePos(sphereX, sphereY, sphereZ) {
        let height = 0;
        height += (noise3d(sphereX * 2, sphereY * 2, sphereZ * 2) - 0.5) * 15;
        height += (noise3d(sphereX * 5, sphereY * 5, sphereZ * 5) - 0.5) * 8;
        height += (noise3d(sphereX * 12, sphereY * 12, sphereZ * 12) - 0.5) * 4;
        height += (noise3d(sphereX * 25, sphereY * 25, sphereZ * 25) - 0.5) * 2;
        return height * 0.5;
    }

    getTerrainColor(height) {
        if (height < -5) return 0x2269B0;
        if (height < 0) return 0x4D96C7;
        if (height < 2) return 0xC2B380;
        if (height < 10) return 0x4D9A4D;
        if (height < 18) return 0x3D833D;
        if (height < 25) return 0x786358;
        return 0xF0F0FA;
    }

    generateChunk(cx, cy, cz, chunkSize = 16) {
        const chunkWorldX = cx * chunkSize;
        const chunkWorldY = cy * chunkSize;
        const chunkWorldZ = cz * chunkSize;

        const chunkDist = Math.sqrt(
            chunkWorldX * chunkWorldX +
            chunkWorldY * chunkWorldY +
            chunkWorldZ * chunkWorldZ
        );

        if (chunkDist > this.radius + 50) return null;

        const chunk = { voxels: new Map() };
        let chunkVoxelCount = 0;

        for (let x = 0; x < chunkSize; x++) {
            for (let y = 0; y < chunkSize; y++) {
                for (let z = 0; z < chunkSize; z++) {
                    const worldX = chunkWorldX + x;
                    const worldY = chunkWorldY + y;
                    const worldZ = chunkWorldZ + z;

                    const dist = Math.sqrt(worldX * worldX + worldY * worldY + worldZ * worldZ);

                    const sphereX = worldX / dist;
                    const sphereY = worldY / dist;
                    const sphereZ = worldZ / dist;

                    const height = this.getHeightAtSpherePos(sphereX, sphereY, sphereZ);
                    const surfaceRadius = this.radius + height;

                    if (dist <= surfaceRadius) {
                        const color = this.getTerrainColor(height);
                        const key = (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);
                        chunk.voxels.set(key, {
                            type: "solid",
                            color
                        });
                        chunkVoxelCount++;
                    }
                }
            }
        }

        return chunkVoxelCount > 0 ? chunk : null;
    }

    generateAllChunks(chunkSize = 16) {
        const chunks = new Map();
        const chunkRadius = Math.ceil((this.radius + 30) / chunkSize);

        for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
            for (let cy = -chunkRadius; cy <= chunkRadius; cy++) {
                for (let cz = -chunkRadius; cz <= chunkRadius; cz++) {
                    const chunk = this.generateChunk(cx, cy, cz, chunkSize);
                    if (chunk) {
                        chunks.set(`${cx},${cy},${cz}`, chunk);
                    }
                }
            }
        }

        return chunks;
    }

    getSurfaceChunks(chunkSize = 16, cameraPosition = null) {
        const surfaceChunks = [];
        const maxChunkRadius = Math.ceil((this.radius + 30) / chunkSize);

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
                        if (cameraPosition) {
                            const chunkCenter = {
                                x: chunkWorldX + chunkSize / 2,
                                y: chunkWorldY + chunkSize / 2,
                                z: chunkWorldZ + chunkSize / 2
                            };

                            const toChunk = {
                                x: chunkCenter.x - cameraPosition.x,
                                y: chunkCenter.y - cameraPosition.y,
                                z: chunkCenter.z - cameraPosition.z
                            };

                            const chunkDir = {
                                x: chunkCenter.x,
                                y: chunkCenter.y,
                                z: chunkCenter.z
                            };

                            const chunkDirLen = Math.sqrt(chunkDir.x * chunkDir.x + chunkDir.y * chunkDir.y + chunkDir.z * chunkDir.z);
                            chunkDir.x /= chunkDirLen;
                            chunkDir.y /= chunkDirLen;
                            chunkDir.z /= chunkDirLen;

                            const toChunkLen = Math.sqrt(toChunk.x * toChunk.x + toChunk.y * toChunk.y + toChunk.z * toChunk.z);
                            toChunk.x /= toChunkLen;
                            toChunk.y /= toChunkLen;
                            toChunk.z /= toChunkLen;

                            const dot = chunkDir.x * toChunk.x + chunkDir.y * toChunk.y + chunkDir.z * toChunk.z;

                            if (dot > 0) {
                                surfaceChunks.push({ cx, cy, cz });
                            }
                        } else {
                            surfaceChunks.push({ cx, cy, cz });
                        }
                    }
                }
            }
        }

        return surfaceChunks;
    }
}
