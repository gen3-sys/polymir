export class GasGiantGenerator {
    constructor(radius, atmosphereConfig = null) {
        this.radius = radius;
        this.atmosphereConfig = atmosphereConfig || this.getDefaultAtmosphere();
    }

    getDefaultAtmosphere() {
        return {
            baseColor: 0xFFA500,
            bandColors: [0xFF8C00, 0xFFD700, 0xCD853F],
            bandSpeed: 0.1,
            turbulence: 0.3,
            cloudLayers: 3,
            rotation: 0.02
        };
    }

    generate() {
        return {
            objectType: 'gas_giant',
            gravitationalRadius: this.radius,
            atmosphereConfig: this.atmosphereConfig,
            chunks: null,
            impostorOnly: true,
            originalObjectFilename: null,
            hasShattered: false,
            shatterGeneration: 0
        };
    }

    static createJupiterLike(radius) {
        return new GasGiantGenerator(radius, {
            baseColor: 0xC88B3A,
            bandColors: [0xE0AC69, 0xAB6A3C, 0xD4A373],
            bandSpeed: 0.15,
            turbulence: 0.4,
            cloudLayers: 4,
            rotation: 0.05
        });
    }

    static createSaturnLike(radius) {
        return new GasGiantGenerator(radius, {
            baseColor: 0xFAD5A5,
            bandColors: [0xF5DEB3, 0xFFE4B5, 0xEED9C4],
            bandSpeed: 0.12,
            turbulence: 0.25,
            cloudLayers: 3,
            rotation: 0.04
        });
    }

    static createNeptuneLike(radius) {
        return new GasGiantGenerator(radius, {
            baseColor: 0x4169E1,
            bandColors: [0x1E90FF, 0x6495ED, 0x4682B4],
            bandSpeed: 0.08,
            turbulence: 0.2,
            cloudLayers: 2,
            rotation: 0.03
        });
    }
}

export default GasGiantGenerator;
