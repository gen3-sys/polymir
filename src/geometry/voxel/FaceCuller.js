import { Chunk } from '../../spatial/Chunk.js';

export class FaceCuller {
    static cullHiddenFaces(chunk, neighborChecker) {
        const exposedFaces = [];

        for (const [encodedKey, voxel] of chunk.voxels) {
            
            const { x, y, z } = Chunk.decodeKey(encodedKey);

            if (!neighborChecker(x + 1, y, z)) {
                exposedFaces.push({ x, y, z, dir: 'px', color: voxel.color });
            }
            if (!neighborChecker(x - 1, y, z)) {
                exposedFaces.push({ x, y, z, dir: 'nx', color: voxel.color });
            }
            if (!neighborChecker(x, y + 1, z)) {
                exposedFaces.push({ x, y, z, dir: 'py', color: voxel.color });
            }
            if (!neighborChecker(x, y - 1, z)) {
                exposedFaces.push({ x, y, z, dir: 'ny', color: voxel.color });
            }
            if (!neighborChecker(x, y, z + 1)) {
                exposedFaces.push({ x, y, z, dir: 'pz', color: voxel.color });
            }
            if (!neighborChecker(x, y, z - 1)) {
                exposedFaces.push({ x, y, z, dir: 'nz', color: voxel.color });
            }
        }

        return exposedFaces;
    }
}
