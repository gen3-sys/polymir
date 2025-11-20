import { GasGiantRenderer } from '../rendering/GasGiantRenderer.js';

export class PlanetTypeDetector {
    static detectType(mvoxFile) {
        if (!mvoxFile || !mvoxFile.metadata) {
            return 'voxel_planet';
        }

        if (mvoxFile.metadata.objectType === 'gas_giant' || mvoxFile.metadata.impostorOnly === true) {
            return 'gas_giant';
        }

        if (mvoxFile.metadata.objectType) {
            return mvoxFile.metadata.objectType;
        }

        if (mvoxFile.voxels === null || mvoxFile.voxels === undefined) {
            return 'gas_giant';
        }

        return 'voxel_planet';
    }

    static isGasGiant(mvoxFile) {
        return this.detectType(mvoxFile) === 'gas_giant';
    }

    static isVoxelPlanet(mvoxFile) {
        return this.detectType(mvoxFile) === 'voxel_planet';
    }

    static canShatter(mvoxFile) {
        return this.isVoxelPlanet(mvoxFile);
    }

    static createRenderer(mvoxFile) {
        const type = this.detectType(mvoxFile);

        if (type === 'gas_giant') {
            const atmosphereConfig = mvoxFile.metadata.atmosphereConfig;
            const radius = mvoxFile.metadata.gravitationalRadius || 500;
            return new GasGiantRenderer(atmosphereConfig, radius);
        }

        return null;
    }
}

export default PlanetTypeDetector;
