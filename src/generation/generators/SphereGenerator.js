import { noise3d } from '../../math/noise/noise3d.js';
import { BiomeConfiguration } from '../../config/BiomeConfiguration.js';
import { VOXEL_TYPES } from '../../data/voxel/VoxelTypes.js';

export class SphereGenerator {
    constructor(radius = 150, voxelSize = 1, biomeConfig = null) {
        this.radius = radius;
        this.voxelSize = voxelSize;
        this.biomeConfig = biomeConfig || new BiomeConfiguration();
    }

    getHeightAtSpherePos(sphereX, sphereY, sphereZ) {
        const poleY = Math.abs(sphereY);
        const poleDamping = 1.0 - Math.pow(poleY, 4);

        let continentalNoise = noise3d(sphereX * 1.5, sphereY * 1.5, sphereZ * 1.5);
        let mountainNoise = noise3d(sphereX * 4, sphereY * 4, sphereZ * 4);
        let detailNoise = noise3d(sphereX * 12, sphereY * 12, sphereZ * 12);
        let fineNoise = noise3d(sphereX * 25, sphereY * 25, sphereZ * 25);

        let mountainRangeNoise = noise3d(sphereX * 2.5, sphereY * 2.5, sphereZ * 2.5);
        let ridgeNoise = Math.abs(noise3d(sphereX * 3.5 + 500, sphereY * 3.5 + 500, sphereZ * 3.5 + 500) - 0.5) * 2;

        let erosionNoise = noise3d(sphereX * 8, sphereY * 8, sphereZ * 8);

        let height = 0;
        height += (continentalNoise - 0.5) * 40;
        height += (mountainNoise - 0.5) * 20;
        height += (detailNoise - 0.5) * 8;
        height += (fineNoise - 0.5) * 3;

        if (mountainRangeNoise > 0.6) {
            const rangeFactor = (mountainRangeNoise - 0.6) * 2.5;
            const ridgeHeight = (1.0 - ridgeNoise) * 25 * rangeFactor;
            height += ridgeHeight;

            if (erosionNoise < 0.35 && height > 5) {
                const riverDepth = (0.35 - erosionNoise) * 15;
                height -= riverDepth;
            }
        }

        if (mountainNoise > 0.65) {
            height += Math.pow((mountainNoise - 0.65) * 2.5, 2) * 20;
        }

        if (continentalNoise > 0.4 && continentalNoise < 0.65 && erosionNoise > 0.6) {
            const lakeFactor = Math.min((erosionNoise - 0.6) * 2.5, 1.0);
            height -= lakeFactor * 6;
        }

        return height * poleDamping;
    }

    getTerrainColor(height) {
        if (height < -15) return 0x1a4d7a;
        if (height < -5) return 0x2269B0;
        if (height < 0) return 0x4D96C7;
        if (height < 3) return 0xC2B380;
        if (height < 8) return 0x4D9A4D;
        if (height < 20) return 0x3D833D;
        if (height < 35) return 0x786358;
        if (height < 50) return 0x9B8B7E;
        return 0xF0F0FA;
    }

    getTerrainColorAndType(worldX, worldY, worldZ, height) {
        const dist = Math.sqrt(worldX * worldX + worldY * worldY + worldZ * worldZ);
        const epsilon = 0.0001;
        const safeDist = dist < epsilon ? epsilon : dist;

        const nx = worldX / safeDist;
        const ny = worldY / safeDist;
        const nz = worldZ / safeDist;

        const biome = this.biomeConfig.getBiomeAt(nx, ny, nz, height);
        const biomeData = this.biomeConfig.getBiomeData(biome);

        if (!biomeData) {
            return { color: this.getTerrainColor(height), type: "solid" };
        }

        const surfaceRadius = this.radius + height;
        const distanceFromSurface = surfaceRadius - dist;
        const normalizedDepth = Math.max(0, Math.min(1, distanceFromSurface / 30));

        const colorIndex = Math.floor(normalizedDepth * (biomeData.colorRange.length - 1));
        const color = biomeData.colorRange[colorIndex];

        const noiseVal = noise3d(worldX * 0.1, worldY * 0.1, worldZ * 0.1);
        const type = this.biomeConfig.getVoxelTypeAtDepth(biome, distanceFromSurface, 30, noiseVal);

        return { color, type };
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

                    const epsilon = 0.0001;
                    const safeDist = dist < epsilon ? epsilon : dist;

                    const sphereX = worldX / safeDist;
                    const sphereY = worldY / safeDist;
                    const sphereZ = worldZ / safeDist;

                    const height = this.getHeightAtSpherePos(sphereX, sphereY, sphereZ);
                    const surfaceRadius = this.radius + height;

                    if (dist <= surfaceRadius) {
                        const depthBelowSurface = surfaceRadius - dist;

                        const caveNoise1 = noise3d(worldX * 0.05, worldY * 0.05, worldZ * 0.05);
                        const caveNoise2 = noise3d(worldX * 0.08 + 100, worldY * 0.08 + 100, worldZ * 0.08 + 100);
                        const caveNoise3 = noise3d(worldX * 0.12 + 200, worldY * 0.12 + 200, worldZ * 0.12 + 200);

                        const caveThreshold = 0.5;
                        const isCave = (caveNoise1 > caveThreshold && caveNoise2 > caveThreshold) ||
                                      (caveNoise1 > caveThreshold && caveNoise3 > caveThreshold);

                        const surfaceProtection = Math.min(1.0, depthBelowSurface / 10.0);

                        if (!isCave || surfaceProtection < 0.3) {
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
