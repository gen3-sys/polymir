export class Logger {
    static config = {
        Game: false,
        Engine: false,
        LoadingAnimation: false,
        ChunkLoader: false,
        LODManager: false,
        OrbitalSystem: false,
        UniverseCreationModal: false,
        SphereGenerator: false,
        StarGenerator: false,
        MaterialFactory: false,
        MeshFactory: false,
        ChunkTextureManager: false,
        ShaderLoader: false,
        FPSControls: false,
        MVoxLoader: false,
        MvoxTypes: false,
        Schematic: false,
        Semantics: false,
        SparseMap: false,
        Voxel: false,
        VoxelData: false,
        VoxelTypes: false,
        EconomyManager: false,
        FactionManager: false,
        PermissionSystem: false,
        PlotSystem: false,
        FaceCuller: false,
        GreedyMesher: false,
        MeshBuilder: false,
        VoxelRenderer: false,
        PlanetTooltip: false,
        Chunk: false,
        ChunkCoordinate: false,
        MVoxFile: false,
        NBT: false,
        WorldCache: false,
        BiomeSystem: false,
        BuildManager: false,
        Config: false,
        CoreModules: false,
        ErrorHandler: false,
        ExportSystem: false,
        GravitySystem: false,
        MaterialPalette: false,
        BiomeSettingsModal: false,
        PlanetCustomizer: false,
        SchematicLibraryManager: false,
        SystemConfigTabSimplified: false,
        SystemVisualizer: false,
        TerrainPainterModal: false,
        DimensionSystem: false,
        CelestialBody: false,
        PortalManager: false,
        Ribbon: false,
        RibbonMesh: false,
        WorldLayerSystem: false,
        DebrisManager: false,
        DebrisEntity: false,
        DebrisPhysics: false,
        ChunkDamageData: false
    };

    static log(module, ...args) {
        if (!this.config.hasOwnProperty(module)) {
            throw new Error(`Logger: Unregistered module "${module}". Add it to Logger.config first.`);
        }
        if (this.config[module]) {
            console.log(`[${module}]`, ...args);
        }
    }

    static warn(module, ...args) {
        if (!this.config.hasOwnProperty(module)) {
            throw new Error(`Logger: Unregistered module "${module}". Add it to Logger.config first.`);
        }
        if (this.config[module]) {
            console.warn(`[${module}]`, ...args);
        }
    }

    static error(module, ...args) {
        if (!this.config.hasOwnProperty(module)) {
            throw new Error(`Logger: Unregistered module "${module}". Add it to Logger.config first.`);
        }
        console.error(`[${module}]`, ...args);
    }

    static enable(module) {
        this.config[module] = true;
    }

    static disable(module) {
        this.config[module] = false;
    }

    static enableAll() {
        Object.keys(this.config).forEach(key => this.config[key] = true);
    }

    static disableAll() {
        Object.keys(this.config).forEach(key => this.config[key] = false);
    }
}

window.Logger = Logger;
