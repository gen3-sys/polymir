import { FaceCuller } from '../geometry/voxel/FaceCuller.js';
import { MeshBuilder } from '../geometry/voxel/MeshBuilder.js';
import { GreedyMesher } from '../geometry/voxel/GreedyMesher.js';

export class Chunk {
    constructor(chunkX, chunkY, chunkZ, chunkSize = 16) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkZ = chunkZ;
        this.chunkSize = chunkSize;
        this.voxels = new Map();
        this.mesh = null;
        this.dirty = true;
    }

    static encodeKey(x, y, z) {
        return (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);
    }

    static decodeKey(key) {
        return {
            x: key & 0x1F,
            y: (key >> 5) & 0x1F,
            z: (key >> 10) & 0x1F
        };
    }

    setVoxel(x, y, z, voxel) {
        this.voxels.set(Chunk.encodeKey(x, y, z), voxel);
        this.dirty = true;
    }

    getVoxel(x, y, z) {
        return this.voxels.get(Chunk.encodeKey(x, y, z));
    }

    hasVoxel(x, y, z) {
        return this.voxels.has(Chunk.encodeKey(x, y, z));
    }

    buildMesh(neighborLookup) {
        if (!this.dirty) return this.mesh;

        if (this.mesh) {
            if (this.mesh.geometry) {
                this.mesh.geometry.dispose();
            }
            this.mesh = null;
        }

        if (this.voxels.size === 0) {
            this.dirty = false;
            return null;
        }

        const hasVoxel = (x, y, z) => {
            if (x >= 0 && x < this.chunkSize &&
                y >= 0 && y < this.chunkSize &&
                z >= 0 && z < this.chunkSize) {
                return this.voxels.has(Chunk.encodeKey(x, y, z));
            }

            if (neighborLookup) {
                return neighborLookup(this.chunkX, this.chunkY, this.chunkZ, x, y, z, this.chunkSize);
            }

            return false;
        };

        const exposedFaces = FaceCuller.cullHiddenFaces(this, hasVoxel);

        if (exposedFaces.length === 0) {
            this.dirty = false;
            return null;
        }

        const mergedQuads = GreedyMesher.meshFaces(exposedFaces);

        const geometryData = MeshBuilder.buildGeometryGreedy(
            mergedQuads,
            { x: this.chunkX, y: this.chunkY, z: this.chunkZ },
            this.chunkSize
        );

        this.dirty = false;
        return geometryData;
    }

    buildMeshPooled(neighborLookup, bufferPool) {
        if (!this.dirty) return this.mesh;

        if (this.mesh) {
            if (this.mesh.geometry) {
                this.mesh.geometry.dispose();
            }
            this.mesh = null;
        }

        if (this.voxels.size === 0) {
            this.dirty = false;
            return null;
        }

        const hasVoxel = (x, y, z) => {
            if (x >= 0 && x < this.chunkSize &&
                y >= 0 && y < this.chunkSize &&
                z >= 0 && z < this.chunkSize) {
                return this.voxels.has(Chunk.encodeKey(x, y, z));
            }

            if (neighborLookup) {
                return neighborLookup(this.chunkX, this.chunkY, this.chunkZ, x, y, z, this.chunkSize);
            }

            return false;
        };

        const exposedFaces = FaceCuller.cullHiddenFaces(this, hasVoxel);

        if (exposedFaces.length === 0) {
            this.dirty = false;
            return null;
        }

        const mergedQuads = GreedyMesher.meshFaces(exposedFaces);

        const geometryData = MeshBuilder.buildGeometryGreedyPooled(
            mergedQuads,
            { x: this.chunkX, y: this.chunkY, z: this.chunkZ },
            this.chunkSize,
            bufferPool
        );

        this.dirty = false;
        return geometryData;
    }

    dispose() {
        if (this.mesh && this.mesh.geometry) {
            this.mesh.geometry.dispose();
        }
        this.mesh = null;
        this.voxels.clear();
    }
}
