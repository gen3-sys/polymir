import { MVoxFile } from '../../storage/MVoxFile.js';

export class PlanetFracturer {
    constructor(planetMvox, fracturePattern) {
        this.planet = planetMvox;
        this.pattern = fracturePattern;
    }

    fracture(impactVector = null) {
        if (impactVector) {
            this.pattern.rotate(impactVector);
        }

        const fragments = [];
        const chunksMap = this.planet.voxels || new Map();

        for (let fragID = 0; fragID < this.pattern.numFragments; fragID++) {
            const fragmentChunks = this.collectFragmentChunks(chunksMap, fragID);

            if (fragmentChunks.size === 0) continue;

            const fragmentCenter = this.calculateFragmentCenter(fragmentChunks, fragID);

            const fragmentMetadata = {
                ...this.planet.metadata,
                objectType: 'voxel_planet',
                originalObjectFilename: this.planet.metadata.originalObjectFilename || this.planet.metadata.name,
                hasShattered: true,
                shatterGeneration: (this.planet.metadata.shatterGeneration || 0) + 1,
                parentFragmentID: fragID,
                gravitationalCenter: fragmentCenter,
                gravitationalRadius: this.estimateFragmentRadius(fragmentChunks),
                name: (this.planet.metadata.name || 'Planet') + '_Fragment_' + fragID
            };

            const fragmentMvox = new MVoxFile('planet', fragmentChunks, fragmentMetadata);
            fragments.push(fragmentMvox);
        }

        return fragments;
    }

    collectFragmentChunks(chunksMap, fragmentID) {
        const fragmentChunks = new Map();

        for (const [key, chunk] of chunksMap) {
            const [cx, cy, cz] = key.split(',').map(Number);
            const chunkCenterX = cx * 16 + 8;
            const chunkCenterY = cy * 16 + 8;
            const chunkCenterZ = cz * 16 + 8;

            const chunkFragID = this.pattern.getFragmentID(chunkCenterX, chunkCenterY, chunkCenterZ);

            if (chunkFragID === fragmentID) {
                fragmentChunks.set(key, chunk);
            }
        }

        return fragmentChunks;
    }

    calculateFragmentCenter(fragmentChunks, fragmentID) {
        const patternCenter = this.pattern.getFragmentCenter(fragmentID);

        if (fragmentChunks.size === 0) {
            return patternCenter;
        }

        let sumX = 0, sumY = 0, sumZ = 0;
        let count = 0;

        for (const [key] of fragmentChunks) {
            const [cx, cy, cz] = key.split(',').map(Number);
            sumX += cx * 16 + 8;
            sumY += cy * 16 + 8;
            sumZ += cz * 16 + 8;
            count++;
        }

        return {
            x: sumX / count,
            y: sumY / count,
            z: sumZ / count
        };
    }

    estimateFragmentRadius(fragmentChunks) {
        if (fragmentChunks.size === 0) return 50;

        const center = this.calculateFragmentCenter(fragmentChunks, 0);
        let maxDist = 0;

        for (const [key] of fragmentChunks) {
            const [cx, cy, cz] = key.split(',').map(Number);
            const chunkX = cx * 16 + 8;
            const chunkY = cy * 16 + 8;
            const chunkZ = cz * 16 + 8;

            const dist = Math.sqrt(
                (chunkX - center.x) ** 2 +
                (chunkY - center.y) ** 2 +
                (chunkZ - center.z) ** 2
            );

            maxDist = Math.max(maxDist, dist);
        }

        return maxDist + 32;
    }
}

export default PlanetFracturer;
