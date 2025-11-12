export class VoxelData {
    constructor() {
        this.voxels = new Map();
    }

    setVoxel(x, y, z, voxel) {
        this.voxels.set(`${x},${y},${z}`, voxel);
    }

    getVoxel(x, y, z) {
        return this.voxels.get(`${x},${y},${z}`);
    }

    hasVoxel(x, y, z) {
        return this.voxels.has(`${x},${y},${z}`);
    }

    deleteVoxel(x, y, z) {
        return this.voxels.delete(`${x},${y},${z}`);
    }

    clear() {
        this.voxels.clear();
    }

    get size() {
        return this.voxels.size;
    }

    entries() {
        return this.voxels.entries();
    }

    [Symbol.iterator]() {
        return this.voxels.entries();
    }
}
