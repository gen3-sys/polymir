import { Logger } from '../debug/Logger.js';
import * as THREE from '../lib/three.module.js';
import { SphereGenerator } from '../generation/generators/SphereGenerator.js';
import { StarGenerator } from '../generation/generators/StarGenerator.js';
import { CelestialBody } from '../world/entities/CelestialBody.js';
import { ChunkLoader } from '../spatial/ChunkLoader.js';
import { ChunkTextureManager } from '../rendering/ChunkTextureManager.js';
import { MaterialFactory } from '../rendering/materials/MaterialFactory.js';
import { MVoxLoader } from '../data/mvox/MVoxLoader.js';
import { MeshFactory } from '../rendering/MeshFactory.js';
import { LODManager } from '../spatial/LODManager.js';
import { ChunkCoordinate } from '../spatial/ChunkCoordinate.js';

export class Engine {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.orbitalSystem = game.orbitalSystem;
        this.currentSystem = null;

        
        this.chunkLoader = new ChunkLoader(game.chunkSize, 16);
        this.chunkTextureManager = new ChunkTextureManager(game.chunkTextureSize);
        this.materialFactory = new MaterialFactory();
        
        this.mvoxLoader = null;
        this.meshFactory = new MeshFactory(this.materialFactory, this.chunkTextureManager);
    }

    async createSystem(config) {
        Logger.log('Engine', '===== ENGINE.CREATESYSTEM CALLED =====');
        Logger.log('Engine', 'Creating system with config:', config);

        this.currentSystem = {
            name: config.name || 'New System',
            seed: config.seed,
            star: null,
            planets: [],
            asteroidBelts: [],
            ringworlds: []
        };

        
        if (config.star) {
            this.currentSystem.star = await this.createStar(config.star);
        }

        
        if (config.planets && config.planets.length > 0) {
            for (let i = 0; i < config.planets.length; i++) {
                const planetConfig = config.planets[i];
                Logger.log('Engine', `Creating planet ${i}:`, planetConfig);
                const planet = await this.createPlanet(planetConfig, i);
                this.currentSystem.planets.push(planet);
            }
        }

        Logger.log('Engine', 'System creation complete:', this.currentSystem);
        Logger.log('Engine', 'this.game.loadingAnimation exists:', !!this.game.loadingAnimation);
        Logger.log('Engine', 'Number of planets to update:', this.currentSystem.planets.length);

        
        if (this.game.loadingAnimation) {
            Logger.log('Engine', 'Updating distance models for all planets...');
            for (let i = 0; i < this.currentSystem.planets.length; i++) {
                const planet = this.currentSystem.planets[i];
                Logger.log('Engine', `*** CALLING updatePlanetDistanceModel for planet ${i}: ${planet.name} ***`);
                Logger.log('Engine', 'Planet config:', planet.config);
                this.game.loadingAnimation.updatePlanetDistanceModel(i, planet.config);
            }
        } else {
            Logger.warn('Engine', 'WARNING: loadingAnimation does not exist, cannot update planet distance models!');
        }

        
        
        
        return this.currentSystem;
    }

    async createStar(starConfig) {
        Logger.log('Engine', 'Creating star:', starConfig);

        const star = new CelestialBody({
            type: 'star',
            radius: starConfig.radius || 80,
            position: starConfig.position || { x: 0, y: 0, z: 0 },
            rotationSpeed: 0
        });

        
        star.config = starConfig;

        this.orbitalSystem.setStar(star);
        return star;
    }

    async createPlanet(planetConfig, index) {
        Logger.log('Engine', 'Creating planet:', planetConfig);

        const planet = new CelestialBody({
            type: 'planet',
            name: planetConfig.name || `Planet ${index + 1}`,
            radius: planetConfig.radius || 150,
            position: { x: 0, y: 0, z: 0 },
            orbitRadius: planetConfig.orbitalRadius || planetConfig.orbitRadius || 0,
            orbitSpeed: planetConfig.orbitalSpeed || planetConfig.orbitSpeed || 0,
            rotationSpeed: planetConfig.rotationSpeed || 0.05,
            rotationTilt: planetConfig.rotationTilt || 0.4,
            gravity: planetConfig.gravity || 1.0,
            waterLevel: planetConfig.waterLevel || 0,
            biomes: planetConfig.biomes || {},
            claimOwner: null
        });

        this.orbitalSystem.addPlanet(planet, this.currentSystem.star);

        
        planet.config = planetConfig;

        
        

        return planet;
    }

    async slicePlanetSurface(planet, planetConfig, onSurfaceReady = null) {
        
        if (planetConfig.gasGiantOnly || planetConfig.type === 'jovian') {
            Logger.log('Engine', `Skipping surface slicing for gas giant: ${planet.name}`);
            return;
        }

        
        if (!this.mvoxLoader && this.game.mvoxLoader) {
            this.mvoxLoader = this.game.mvoxLoader;
        }

        const mvoxId = `planet_${planetConfig.name}_surface`;
        const mvoxLoader = this.mvoxLoader;

        
        Logger.log('Engine', `Checking for cached .mvox: ${mvoxId}`);
        try {
            const existing = await mvoxLoader.load(mvoxId);
            if (existing && existing.chunks && existing.chunks.size > 0) {
                Logger.log('Engine', `  ✓ Found cached planet with ${existing.chunks.size} chunks`);
                planetConfig.mvoxId = mvoxId;
                planetConfig.distanceModel = existing.metadata?.distanceModel;
                return;
            }
        } catch (e) {
            Logger.log('Engine', '  No cache found, will generate');
        }

        
        Logger.log('Engine', `Generating distance model for: ${planet.name}`);
        const radius = (planetConfig.radius || 20) * 16;
        const generator = new SphereGenerator(radius, 1, {
            ...planetConfig,
            biomes: planetConfig.biomeDistribution || planetConfig.biomes
        });

        
        planetConfig.distanceModel = {
            radius: radius,
            planetMesh: planet 
        };

        
        Logger.log('Engine', `Slicing outer surface layers: ${planet.name}`);
        const chunkSize = 16;

        
        const allCoords = this.getSortedChunkCoordinates(radius, chunkSize);

        const fullChunks = new Map();
        const surfaceData = {};

        
        const outerCount = Math.ceil(allCoords.length * 0.2);
        const outerCoords = allCoords.slice(0, outerCount);

        Logger.log('Engine', `  Processing ${outerCount} outer chunks first (batched with yields)...`);

        
        const chunksPerBatch = 20; 
        for (let i = 0; i < outerCoords.length; i += chunksPerBatch) {
            const batch = outerCoords.slice(i, i + chunksPerBatch);

            for (const { cx, cy, cz } of batch) {
                const chunkData = generator.generateChunk(cx, cy, cz, chunkSize);
                if (chunkData && chunkData.voxels && chunkData.voxels.size > 0) {
                    const key = ChunkCoordinate.toKey(cx, cy, cz);
                    fullChunks.set(key, chunkData);

                    const surfaceVoxels = this.extractSurfaceVoxels(chunkData, cx, cy, cz, fullChunks, chunkSize);
                    if (surfaceVoxels.size > 0) {
                        surfaceData[key] = { voxels: surfaceVoxels };
                    }
                }
            }

            
            await new Promise(resolve => setTimeout(resolve, 0));
            Logger.log('Engine', `    Outer chunks: ${fullChunks.size}/${outerCount}...`);
        }

        Logger.log('Engine', `  ✓ Generated ${fullChunks.size} outer chunks, ${Object.keys(surfaceData).length} with surface faces`);

        
        if (mvoxLoader) {
            try {
                await mvoxLoader.save(mvoxId, fullChunks, {
                type: 'planet_partial',
                planetName: planetConfig.name,
                radius: radius,
                generated: Date.now(),
                distanceModel: planetConfig.distanceModel,
                surfaceFaces: surfaceData,
                complete: false
            });

                planetConfig.mvoxId = mvoxId;
                Logger.log('Engine', `  ✓ Saved surface faces to .mvox (${Object.keys(surfaceData).length} chunks)`);

                
                if (onSurfaceReady) {
                    onSurfaceReady(planetConfig);
                }
            } catch (e) {
                Logger.error('Engine', '  Failed to save surface faces:', e.message || e);
            }
        }

        
        Logger.log('Engine', `  Continuing to slice inner chunks in background...`);
        this.continueSlicingInBackground(generator, allCoords.slice(outerCount), fullChunks, surfaceData, mvoxId, planetConfig, chunkSize);
    }

    getSortedChunkCoordinates(radius, chunkSize) {
        const coords = [];
        const maxChunkRadius = Math.ceil((radius + 30) / chunkSize);

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

                    
                    if (Math.abs(chunkDist - radius) < chunkSize * 3) {
                        coords.push({ cx, cy, cz, dist: chunkDist });
                    }
                }
            }
        }

        
        coords.sort((a, b) => b.dist - a.dist);
        return coords;
    }

    extractSurfaceVoxels(chunkData, cx, cy, cz, fullChunks, chunkSize) {
        const surfaceVoxels = new Map();

        chunkData.voxels.forEach((voxel, packedKey) => {
            const lx = packedKey & 0x1F;
            const ly = (packedKey >> 5) & 0x1F;
            const lz = (packedKey >> 10) & 0x1F;

            
            const exposed = [
                [lx-1, ly, lz], [lx+1, ly, lz],
                [lx, ly-1, lz], [lx, ly+1, lz],
                [lx, ly, lz-1], [lx, ly, lz+1]
            ].some(([nx, ny, nz]) => {
                let checkCx = cx, checkCy = cy, checkCz = cz;
                let checkLx = nx, checkLy = ny, checkLz = nz;

                if (checkLx < 0) { checkCx--; checkLx = chunkSize - 1; }
                else if (checkLx >= chunkSize) { checkCx++; checkLx = 0; }
                if (checkLy < 0) { checkCy--; checkLy = chunkSize - 1; }
                else if (checkLy >= chunkSize) { checkCy++; checkLy = 0; }
                if (checkLz < 0) { checkCz--; checkLz = chunkSize - 1; }
                else if (checkLz >= chunkSize) { checkCz++; checkLz = 0; }

                const neighborChunk = fullChunks.get(`${checkCx},${checkCy},${checkCz}`);
                if (!neighborChunk) return true;

                const nKey = (checkLx & 0x1F) | ((checkLy & 0x1F) << 5) | ((checkLz & 0x1F) << 10);
                return !neighborChunk.voxels.has(nKey);
            });

            if (exposed) {
                surfaceVoxels.set(packedKey, voxel);
            }
        });

        return surfaceVoxels;
    }

    async continueSlicingInBackground(generator, remainingCoords, fullChunks, surfaceData, mvoxId, planetConfig, chunkSize) {
        const chunksPerBatch = 50;

        for (let i = 0; i < remainingCoords.length; i += chunksPerBatch) {
            const batch = remainingCoords.slice(i, i + chunksPerBatch);

            for (const { cx, cy, cz } of batch) {
                const chunkData = generator.generateChunk(cx, cy, cz, chunkSize);
                if (chunkData && chunkData.voxels && chunkData.voxels.size > 0) {
                    const key = ChunkCoordinate.toKey(cx, cy, cz);
                    fullChunks.set(key, chunkData);

                    const surfaceVoxels = this.extractSurfaceVoxels(chunkData, cx, cy, cz, fullChunks, chunkSize);
                    if (surfaceVoxels.size > 0) {
                        surfaceData[key] = { voxels: surfaceVoxels };
                    }
                }
            }

            
            await new Promise(resolve => setTimeout(resolve, 0));

            
            if ((i + chunksPerBatch) % 200 === 0 && this.mvoxLoader) {
                try {
                    await this.mvoxLoader.save(mvoxId, fullChunks, {
                        type: 'planet_partial',
                        planetName: planetConfig.name,
                        radius: generator.radius,
                        generated: Date.now(),
                        distanceModel: planetConfig.distanceModel,
                        surfaceFaces: surfaceData,
                        complete: false
                    });
                    Logger.log('Engine', `    Saved progress: ${fullChunks.size} chunks`);
                } catch (e) {
                    Logger.error('Engine', '  Failed to save progress:', e.message);
                }
            }
        }

        
        if (this.mvoxLoader) {
            try {
                await this.mvoxLoader.save(mvoxId, fullChunks, {
                type: 'planet_complete',
                planetName: planetConfig.name,
                radius: generator.radius,
                generated: Date.now(),
                distanceModel: planetConfig.distanceModel,
                surfaceFaces: surfaceData,
                complete: true
            });
                Logger.log('Engine', `  ✓ Planet slicing COMPLETE: ${fullChunks.size} total chunks, ${Object.keys(surfaceData).length} surface chunks`);
            } catch (e) {
                Logger.error('Engine', '  Failed to save final planet:', e.message);
            }
        }
    }

    async startLoadingWorkflow(planet) {
        Logger.log('Engine', 'Starting loading workflow for:', planet.name);

        
        this.game.canvas.style.display = 'block';
        Logger.log('Engine', 'Canvas made visible');

        
        this.game.mainPlanet = planet;
        this.game.planetRadius = planet.radius;

        
        this.game.isLoading = true;
        this.game.loadingStartTime = performance.now();
        this.game.minLoadingDuration = 1000;

        
        if (this.game.loadingAnimation) {
            Logger.log('Engine', 'Passing planet config to loading animation:', planet.config);
            this.game.loadingAnimation.setPlanetMetadata(
                planet.name,
                this.currentSystem.name,
                planet.config
            );
            
            this.game.loadingAnimation.showPlanets();
        }

        
        if (!this.game.worldCache) {
            const WorldCache = (await import('../storage/WorldCache.js')).WorldCache;
            this.game.worldCache = new WorldCache();
            await this.game.worldCache.init();
            const MVoxLoaderClass = (await import('../data/mvox/MVoxLoader.js')).MVoxLoader;
            this.game.mvoxLoader = new MVoxLoaderClass(this.game.worldCache);
            
            this.mvoxLoader = this.game.mvoxLoader;
        }

        
        await this.game.loadShaders();

        
        const planetGenerator = new SphereGenerator(planet.radius, 1, planet.config);
        this.game.planetGenerator = planetGenerator;

        
        this.game.planetChunks.clear();

        
        this.game.generateStar();

        
        this.game.createMaterials();

        
        this.game.buildImpostor();

        
        this.game.beginSurfaceLoading();

        
        this.startRenderLoop();

        Logger.log('Engine', 'Loading workflow initiated - surface chunks loading from .mvox');
    }

    async generatePlanetWithBiomes(planet) {
        Logger.log('Engine', 'Setting up planet generation with biomes:', planet.config.biomes);
        Logger.log('Engine', 'Planet radius:', planet.radius, 'Chunk size:', this.game.chunkSize);
        Logger.log('Engine', 'Full planet config:', planet.config);

        const planetGenerator = new SphereGenerator(planet.radius, 1, planet.config);
        this.game.planetGenerator = planetGenerator;

        
        this.game.planetChunks = new Map();

        
        this.game.currentPlanetConfig = planet.config;

        
        this.game.chunkLoader = new ChunkLoader(this.game.chunkSize, 8);
        this.game.lodManager = new LODManager(300);

        
        const allSurfaceChunks = planetGenerator.getSurfaceChunks(this.game.chunkSize, null);
        Logger.log('Engine', 'Queueing', allSurfaceChunks.length, 'surface chunks for generation');

        
        this.game.surfaceChunksToLoad = allSurfaceChunks;
        this.game.loadedSurfaceChunks = 0;

        
        
    }

    startRenderLoop() {
        Logger.log('Engine', 'Starting render loop');
        this.game.lastTime = performance.now();
        this.game.lastRenderTime = performance.now();
        this.game.frameCount = 0;

        const animate = () => {
            requestAnimationFrame(animate);
            this.game.render();
        };
        animate();
    }

    async sliceModelToVoxels(planet, chunks) {
        Logger.log('Engine', 'Slicing 3D model into voxels...');

        
        const voxelData = {
            chunks: [],
            biomes: planet.config.biomes || {},
            gravity: planet.config.gravity || 1.0,
            waterLevel: planet.config.waterLevel || 0
        };

        for (const chunk of chunks) {
            
            const chunkVoxels = await this.generateChunkVoxels(chunk, planet.config);
            voxelData.chunks.push(chunkVoxels);
        }

        return voxelData;
    }

    async generateChunkVoxels(chunk, planetConfig) {
        
        return {
            key: chunk.key,
            coord: chunk.coord,
            voxels: chunk.voxels || new Uint8Array(16 * 16 * 16),
            biomeData: planetConfig.biomes
        };
    }

    async createMvoxData(planet, voxelData) {
        Logger.log('Engine', 'Creating .mvox format data');

        const mvoxData = {
            version: '1.0',
            name: planet.name,
            metadata: {
                radius: planet.radius,
                gravity: planet.config.gravity,
                waterLevel: planet.config.waterLevel,
                biomes: planet.config.biomes,
                seed: this.currentSystem.seed,
                createdAt: Date.now()
            },
            chunks: voxelData.chunks,
            distanceModel: {
                
                type: 'sphere',
                radius: planet.radius
            }
        };

        return mvoxData;
    }

    async savePlanetToMvox(planet) {
        Logger.log('Engine', 'Saving planet to .mvox file:', planet.name);
        const mvoxData = await this.createMvoxData(planet, planet.voxelData);
        return mvoxData;
    }

    async loadPlanetFromMvox(mvoxPath) {
        Logger.log('Engine', 'Loading planet from .mvox:', mvoxPath);
        const mvoxData = await this.mvoxLoader.load(mvoxPath);
        return mvoxData;
    }

    applyShaders(planet, localVoxels = true, distanceModel = true) {
        Logger.log('Engine', 'Applying shaders to planet:', planet.name);

        if (localVoxels) {
            
            Logger.log('Engine', 'Applying local voxel shaders');
        }

        if (distanceModel) {
            
            Logger.log('Engine', 'Applying distance model shaders');
            if (planet.mesh) {
                const material = this.materialFactory.createPlanetMaterial(planet.config);
                planet.mesh.material = material;
            }
        }
    }
}

