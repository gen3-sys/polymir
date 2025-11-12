export class LODManager {
    constructor(switchDistance = 300) {
        this.switchDistance = switchDistance;
        this.unloadDistance = 2000;
    }

    shouldLoadVoxels(cameraPosition, surfaceRadius) {
        const distToSurface = cameraPosition.length() - surfaceRadius;
        return distToSurface < this.switchDistance;
    }

    getUnloadDistance() {
        return this.unloadDistance;
    }

    getRenderMode(cameraPosition, surfaceRadius) {
        return this.shouldLoadVoxels(cameraPosition, surfaceRadius) ? 'VOXELS' : 'IMPOSTOR';
    }
}
