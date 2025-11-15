import * as THREE from '../lib/three.module.js';
import { SphereGenerator } from '../generation/generators/SphereGenerator.js';
import { StarGenerator } from '../generation/generators/StarGenerator.js';
import { Chunk } from '../spatial/Chunk.js';
import { ChunkLoader } from '../spatial/ChunkLoader.js';
import { ChunkCoordinate } from '../spatial/ChunkCoordinate.js';
import { LODManager } from '../spatial/LODManager.js';
import { ShaderLoader } from '../rendering/ShaderLoader.js';
import { MaterialFactory } from '../rendering/materials/MaterialFactory.js';
import { MeshFactory } from '../rendering/MeshFactory.js';
import { ChunkTextureManager } from '../rendering/ChunkTextureManager.js';
import { LoadingAnimation } from '../rendering/LoadingAnimation.js';
import { OrbitalSystem } from '../systems/OrbitalSystem.js';
import { CelestialBody } from '../world/entities/CelestialBody.js';
import { WorldCache } from '../storage/WorldCache.js';
import { FPSControls } from '../controls/FPSControls.js';
import { CameraTransition } from '../controls/CameraTransition.js';
import { MVoxLoader } from '../data/mvox/MVoxLoader.js';
import { GeometryBufferPool } from '../memory/GeometryBufferPool.js';
import { BiomeConfiguration } from '../config/BiomeConfiguration.js';
import globalBiomeEventBus, { BIOME_EVENTS } from '../systems/BiomeConfigEventBus.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

        this.biomeEventUnsubscribe = null;

        this.planetRadius = 150;
        this.starRadius = 80;
        this.chunkSize = 16;
        this.chunkTextureSize = 64;

        this.loadedMeshes = new Map();
        this.chunkBuffers = new Map();
        this.nestedStructureMeshes = new Map();
        this.materials = {};
        this.isLoading = true;
        this.surfaceChunksToLoad = [];
        this.loadedSurfaceChunks = 0;

        this.geometryBufferPool = new GeometryBufferPool(200);

        this.cachedPlanetPos = new THREE.Vector3();
        this.cachedStarPos = new THREE.Vector3();

        this.setupRenderer();
        this.setupOrbitalSystem();
        this.setupControls();

        this.loadingAnimation = new LoadingAnimation(this.renderer, () => {
            this.onLoadingComplete();
        }, this.mainPlanet);

        this.lastTime = performance.now();
        this.lastRenderTime = performance.now();
        this.frameCount = 0;

        this.validationMetrics = {
            startupErrors: 0,
            fpsDrops: 0,
            memorySpikes: 0,
            lastFPS: 0,
            lastMemory: 0,
            baselineTriangles: 0,
            currentTriangles: 0,
            greedyReduction: 0,
            chunkKeyGenerations: 0,
            chunkKeyLookups: 0
        };
    }

    setupRenderer() {
        this.scene.background = new THREE.Color(0x000510);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.camera.position.set(0, 200, 0);
        this.camera.lookAt(0, 0, 0);
    }

    setupOrbitalSystem() {
        this.orbitalSystem = new OrbitalSystem(this.scene);

        const ambient = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambient);

        const star = new CelestialBody({
            type: 'star',
            radius: this.starRadius,
            position: { x: 0, y: 0, z: 0 },
            rotationSpeed: 0
        });

        this.orbitalSystem.setStar(star);

        const planet = new CelestialBody({
            type: 'planet',
            name: 'Terra',
            radius: this.planetRadius,
            position: { x: 0, y: 0, z: 0 },
            orbitRadius: 0,  
            orbitSpeed: 0,
            rotationSpeed: 0.05,
            rotationTilt: 0.4,
            claimOwner: null
        });

        this.orbitalSystem.addPlanet(planet, star);
        this.mainPlanet = planet;

        const starPos = star.getWorldPosition();
        this.cachedStarPos.set(starPos.x, starPos.y, starPos.z);
    }

    setupControls() {
        this.fpsControls = new FPSControls(this.camera, this.canvas);
        this.cameraTransition = new CameraTransition(this.camera, this.fpsControls);
        window.addEventListener('resize', () => this.handleResize());
    }

    async initialize() {

        this.worldCache = new WorldCache();
        await this.worldCache.init();

        this.mvoxLoader = new MVoxLoader(this.worldCache);

        await this.loadShaders();
        await this.loadOrGeneratePlanet();
        this.generateStar();
        this.createMaterials();
        this.buildImpostor();
        this.beginSurfaceLoading();

    }

    async loadShaders() {
        this.shaders = await ShaderLoader.loadAll({
            impostor: {
                vert: './src/rendering/shaders/impostor-planet.vert.glsl',
                frag: './src/rendering/shaders/impostor-planet.frag.glsl'
            },
            starImpostor: {
                vert: './src/rendering/shaders/star-impostor.vert.glsl',
                frag: './src/rendering/shaders/star-impostor.frag.glsl'
            },
            voxel: {
                vert: './src/rendering/shaders/voxel.vert.glsl',
                frag: './src/rendering/shaders/voxel.frag.glsl'
            }
        });
    }

    async loadOrGeneratePlanet() {
        this.biomeConfig = BiomeConfiguration.loadFromLocalStorage('universe_biome_config') || new BiomeConfiguration();

        const planetGenerator = new SphereGenerator(this.planetRadius, 1, this.biomeConfig);
        this.planetGenerator = planetGenerator;

        this.setupBiomeEventListeners();

        const startCameraPos = {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z
        };

        const allSurfaceChunks = planetGenerator.getSurfaceChunks(this.chunkSize, startCameraPos);
        const sortedChunks = allSurfaceChunks
            .map(coord => {
                const { cx, cy, cz } = coord;
                const chunkCenter = {
                    x: cx * this.chunkSize + this.chunkSize / 2,
                    y: cy * this.chunkSize + this.chunkSize / 2,
                    z: cz * this.chunkSize + this.chunkSize / 2
                };
                const dist = Math.sqrt(
                    (chunkCenter.x - startCameraPos.x) ** 2 +
                    (chunkCenter.y - startCameraPos.y) ** 2 +
                    (chunkCenter.z - startCameraPos.z) ** 2
                );
                return { cx, cy, cz, dist };
            })
            .sort((a, b) => a.dist - b.dist);

        this.surfaceChunksToLoad = sortedChunks.slice(0, 9);

        this.planetChunks = new Map();

        for (const coord of this.surfaceChunksToLoad) {
            const { cx, cy, cz } = coord;
            const key = ChunkCoordinate.toKey(cx, cy, cz);
            const chunkData = planetGenerator.generateChunk(cx, cy, cz, this.chunkSize);
            if (chunkData) {
                this.planetChunks.set(key, chunkData);
            }
        }

        console.log(`✓ Pre-generated ${this.planetChunks.size} chunks:`, this.surfaceChunksToLoad.map(c => `${c.cx},${c.cy},${c.cz}`).join(' '));


        this.chunkLoader = new ChunkLoader(this.chunkSize, 8);
        this.lodManager = new LODManager(300);
    }

    generateStar() {
        const starPos = this.orbitalSystem.star.position;
        const starGenerator = new StarGenerator(
            this.starRadius,
            starPos.x,
            starPos.y,
            starPos.z
        );
        this.starGenerator = starGenerator;
        this.starChunks = new Map();
        this.starSurfaceChunks = starGenerator.getSurfaceChunks(this.chunkSize);
    }

    createMaterials() {
        const { texture, data } = MaterialFactory.create3DChunkTexture(this.chunkTextureSize);
        this.chunkTextureManager = new ChunkTextureManager(this.chunkTextureSize, texture, data);

        const { texture: starTexture, data: starData } = MaterialFactory.create3DChunkTexture(this.chunkTextureSize);
        this.starChunkTextureManager = new ChunkTextureManager(this.chunkTextureSize, starTexture, starData);

        const starPos = this.orbitalSystem.star.getWorldPosition();
        const starPosVec = new THREE.Vector3(starPos.x, starPos.y, starPos.z);

        this.materials.impostor = MaterialFactory.createImpostorMaterial(
            this.shaders.impostor,
            this.planetRadius,
            texture,
            this.chunkTextureSize,
            this.chunkSize,
            starPosVec
        );

        this.materials.starImpostor = MaterialFactory.createStarImpostorMaterial(
            this.shaders.starImpostor,
            this.starRadius,
            starTexture,
            this.chunkTextureSize,
            this.chunkSize
        );

        this.materials.voxel = MaterialFactory.createVoxelMaterial(this.shaders.voxel, starPosVec);
        this.materials.emissive = new THREE.MeshBasicMaterial({ vertexColors: true });

    }

    buildImpostor() {
        this.planetContainer = new THREE.Group();
        this.scene.add(this.planetContainer);

        const minOffset = Math.min(0.5, this.planetRadius * 0.01);
        const impostorScale = (this.planetRadius - minOffset) / this.planetRadius;
        const planetGeometry = new THREE.IcosahedronGeometry(this.planetRadius * impostorScale, 64);

        this.planetMesh = new THREE.Mesh(planetGeometry, this.materials.impostor);
        this.planetContainer.add(this.planetMesh);

        const starMinOffset = Math.min(0.5, this.starRadius * 0.01);
        const starImpostorScale = (this.starRadius - starMinOffset) / this.starRadius;
        const starGeometry = new THREE.IcosahedronGeometry(this.starRadius * starImpostorScale, 64);

        this.starMesh = new THREE.Mesh(starGeometry, this.materials.starImpostor);
        const starPos = this.orbitalSystem.star.position;
        this.starMesh.position.set(starPos.x, starPos.y, starPos.z);
        this.scene.add(this.starMesh);

        this.starLodManager = new LODManager(400);
        this.loadedStarMeshes = new Map();

    }

    beginSurfaceLoading() {
        if (this.loadingAnimation) {
            this.loadingAnimation.showPlanets();
        }
    }

    onLoadingComplete() {
        this.isLoading = false;

        this.benchmarkChunkKeys();
        this.updateCachedPositions();

        if (this.preloadedSurfaceMeshes) {
            for (const { key, mesh} of this.preloadedSurfaceMeshes) {
                this.planetContainer.add(mesh);
                this.loadedMeshes.set(key, mesh);
            }
            this.preloadedSurfaceMeshes = null;
        }

        this.updateScene();

        this.camera.position.copy(this.loadingAnimation.camera.position);
        this.camera.rotation.copy(this.loadingAnimation.camera.rotation);

        const planetPos = this.mainPlanet.getWorldPosition();
        this.cameraTransition.transitionToPlanet(planetPos, this.planetRadius, 3.0);
    }

    loadStarVoxels() {
        if (!this.starChunks) {
            return;
        }

    }

    loadSurfaceChunks() {
        if (this.loadedSurfaceChunks >= this.surfaceChunksToLoad.length) return;

        const coord = this.surfaceChunksToLoad[this.loadedSurfaceChunks];
        const { cx, cy, cz } = coord;
        const key = ChunkCoordinate.toKey(cx, cy, cz);

        const chunkData = this.planetChunks.get(key);
        if (!chunkData) {
            this.loadedSurfaceChunks++;
            return;
        }

        const chunk = new Chunk(cx, cy, cz, this.chunkSize);
        chunk.voxels = chunkData.voxels;

        const geometryData = chunk.buildMeshPooled(
            (cx, cy, cz, lx, ly, lz, cs) => this.neighborLookup(cx, cy, cz, lx, ly, lz, cs),
            this.geometryBufferPool
        );

        if (geometryData) {
            if (geometryData.poolBuffer) {
                this.geometryBufferPool.assignToChunk(key, geometryData.poolBuffer);
                this.chunkBuffers.set(key, geometryData.poolBuffer);
            }
            const mesh = MeshFactory.createChunkMesh(geometryData, this.materials.voxel);

            if (!this.preloadedSurfaceMeshes) {
                this.preloadedSurfaceMeshes = [];
            }
            this.preloadedSurfaceMeshes.push({ key, mesh });
            this.chunkTextureManager.update(cx, cy, cz, true);
        }

        this.loadedSurfaceChunks++;
    }

    neighborLookup(chunkX, chunkY, chunkZ, localX, localY, localZ, chunkSize) {
        const neighborChunkX = chunkX + (localX < 0 ? -1 : (localX >= chunkSize ? 1 : 0));
        const neighborChunkY = chunkY + (localY < 0 ? -1 : (localY >= chunkSize ? 1 : 0));
        const neighborChunkZ = chunkZ + (localZ < 0 ? -1 : (localZ >= chunkSize ? 1 : 0));
        const neighborKey = ChunkCoordinate.toKey(neighborChunkX, neighborChunkY, neighborChunkZ);

        let neighborChunkData = this.planetChunks.get(neighborKey);

        
        if (!neighborChunkData && this.planetGenerator) {
            neighborChunkData = this.planetGenerator.generateChunk(neighborChunkX, neighborChunkY, neighborChunkZ, chunkSize);
            if (neighborChunkData) {
                this.planetChunks.set(neighborKey, neighborChunkData);
            }
        }

        if (!neighborChunkData) return false;

        const nx = ((localX % chunkSize) + chunkSize) % chunkSize;
        const ny = ((localY % chunkSize) + chunkSize) % chunkSize;
        const nz = ((localZ % chunkSize) + chunkSize) % chunkSize;

        const key = (nx & 0x1F) | ((ny & 0x1F) << 5) | ((nz & 0x1F) << 10);
        return neighborChunkData.voxels.has(key);
    }

    updateChunkLoading() {
        if (!this.lodManager) return;

        const cameraToPlanet = new THREE.Vector3(
            this.camera.position.x - this.cachedPlanetPos.x,
            this.camera.position.y - this.cachedPlanetPos.y,
            this.camera.position.z - this.cachedPlanetPos.z
        );

        const distToSurface = cameraToPlanet.length() - this.planetRadius;
        document.getElementById('distance').textContent = Math.round(distToSurface);

        this.updateStarLOD();

        
        if (this.planetMesh) {
            this.planetMesh.visible = true;
        }

        if (!this.lodManager.shouldLoadVoxels(cameraToPlanet, this.planetRadius)) {
            document.getElementById('mode').textContent = `Rendering: IMPOSTOR (Distance LOD)`;
            document.getElementById('chunks').textContent = this.loadedMeshes.size;
            return;
        }

        
        if (!this.chunkLoader.initialized) {
            this.chunkLoader.setAvailableChunks(this.planetChunks);
            this.chunkLoader.initializeWavefront(cameraToPlanet);
        }

        
        const loadRadius = this.lodManager.switchDistance;
        this.chunkLoader.updateQueue(cameraToPlanet, loadRadius);

        const batch = this.chunkLoader.loadNextBatch();

        for (const { cx, cy, cz, key, chunkData } of batch) {
            if (this.loadedMeshes.has(key)) continue;

            const neighborCoords = [
                { cx: cx - 1, cy, cz }, { cx: cx + 1, cy, cz },
                { cx, cy: cy - 1, cz }, { cx, cy: cy + 1, cz },
                { cx, cy, cz: cz - 1 }, { cx, cy, cz: cz + 1 }
            ];

            for (const coord of neighborCoords) {
                const neighborKey = ChunkCoordinate.toKey(coord.cx, coord.cy, coord.cz);
                if (!this.planetChunks.has(neighborKey) && this.planetGenerator) {
                    const neighborData = this.planetGenerator.generateChunk(
                        coord.cx, coord.cy, coord.cz, this.chunkSize
                    );
                    if (neighborData) {
                        this.planetChunks.set(neighborKey, neighborData);
                    }
                }
            }

            this.worldCache.loadMesh(key, 'terra_main').then(geometryData => {
                if (this.loadedMeshes.has(key)) return; 

                if (!geometryData) {
                    const chunk = new Chunk(cx, cy, cz, this.chunkSize);
                    chunk.voxels = chunkData.voxels;

                    geometryData = chunk.buildMeshPooled(
                        (cx, cy, cz, lx, ly, lz, cs) => this.neighborLookup(cx, cy, cz, lx, ly, lz, cs),
                        this.geometryBufferPool
                    );

                    if (geometryData) {
                        if (geometryData.poolBuffer) {
                            this.geometryBufferPool.assignToChunk(key, geometryData.poolBuffer);
                            this.chunkBuffers.set(key, geometryData.poolBuffer);
                        }
                        this.worldCache.saveMesh(key, geometryData, 'terra_main').catch(() => {});
                    }
                }

                if (geometryData) {
                    const mesh = MeshFactory.createChunkMesh(geometryData, this.materials.voxel);
                    this.planetContainer.add(mesh);
                    this.loadedMeshes.set(key, mesh);
                    this.chunkTextureManager.update(cx, cy, cz, true);
                }
            }).catch(() => {
                const chunk = new Chunk(cx, cy, cz, this.chunkSize);
                chunk.voxels = chunkData.voxels;

                const geometryData = chunk.buildMeshPooled(
                    (cx, cy, cz, lx, ly, lz, cs) => this.neighborLookup(cx, cy, cz, lx, ly, lz, cs),
                    this.geometryBufferPool
                );

                if (geometryData) {
                    if (geometryData.poolBuffer) {
                        this.geometryBufferPool.assignToChunk(key, geometryData.poolBuffer);
                        this.chunkBuffers.set(key, geometryData.poolBuffer);
                    }
                    const mesh = MeshFactory.createChunkMesh(geometryData, this.materials.voxel);
                    this.planetContainer.add(mesh);
                    this.loadedMeshes.set(key, mesh);
                    this.chunkTextureManager.update(cx, cy, cz, true);
                }
            });
        }

        const unloaded = this.chunkLoader.unloadDistantChunks(
            cameraToPlanet,
            this.lodManager.getUnloadDistance()
        );

        for (const key of unloaded) {
            const mesh = this.loadedMeshes.get(key);
            if (mesh) {
                this.planetContainer.remove(mesh);
                MeshFactory.disposeMesh(mesh);
                this.loadedMeshes.delete(key);

                const buffer = this.chunkBuffers.get(key);
                if (buffer) {
                    this.geometryBufferPool.release(key, buffer);
                    this.chunkBuffers.delete(key);
                }

                const { cx, cy, cz } = ChunkCoordinate.fromKey(key);
                this.chunkTextureManager.update(cx, cy, cz, false);
            }
        }

        this.chunkTextureManager.markNeedsUpdate();

        document.getElementById('mode').textContent = `Rendering: VOXELS (${this.loadedMeshes.size} chunks, ${this.chunkLoader.pendingQueue.length} pending)`;
        document.getElementById('chunks').textContent = this.loadedMeshes.size;
    }


    updateFPS() {
        this.frameCount++;
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;

        if (deltaTime >= 1000) {
            const fps = Math.round((this.frameCount * 1000) / deltaTime);
            this.frameCount = 0;
            this.lastTime = currentTime;

            if (this.validationMetrics.lastFPS > 0 && fps < this.validationMetrics.lastFPS * 0.9) {
                this.validationMetrics.fpsDrops++;
            }
            this.validationMetrics.lastFPS = fps;

            document.getElementById('fps').textContent = fps;

            if (performance.memory) {
                const memoryMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
                const glInfo = this.renderer.info.memory;
                const gpuInfo = ` (Geo: ${glInfo.geometries}, Tex: ${glInfo.textures})`;
                document.getElementById('memory').textContent = memoryMB + gpuInfo;

                if (this.validationMetrics.lastMemory > 0 && memoryMB > this.validationMetrics.lastMemory * 1.3) {
                    this.validationMetrics.memorySpikes++;
                }
                this.validationMetrics.lastMemory = memoryMB;
            }

            this.validationMetrics.currentTriangles = this.renderer.info.render.triangles;

            const poolStats = this.geometryBufferPool.getStats();
            if (document.getElementById('pool-reuse')) {
                document.getElementById('pool-reuse').textContent = poolStats.reuseRate;
            }
            if (document.getElementById('pool-buffers')) {
                document.getElementById('pool-buffers').textContent =
                    `${poolStats.inUseBuffers}/${poolStats.availableBuffers + poolStats.inUseBuffers}`;
            }
        }
    }

    getValidationStatus() {
        const warnings = this.validationMetrics.fpsDrops + this.validationMetrics.memorySpikes;
        return {
            healthy: warnings === 0,
            warnings,
            details: this.validationMetrics
        };
    }

    benchmarkChunkKeys() {
        const iterations = 100000;
        const testCoords = [];
        for (let i = 0; i < 1000; i++) {
            testCoords.push({
                cx: Math.floor(Math.random() * 1000) - 500,
                cy: Math.floor(Math.random() * 1000) - 500,
                cz: Math.floor(Math.random() * 1000) - 500
            });
        }

        const stringStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            const coord = testCoords[i % testCoords.length];
            const key = `${coord.cx},${coord.cy},${coord.cz}`;
        }
        const stringTime = performance.now() - stringStart;

        const numericStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            const coord = testCoords[i % testCoords.length];
            const key = ChunkCoordinate.toKey(coord.cx, coord.cy, coord.cz);
        }
        const numericTime = performance.now() - numericStart;

        const testMap = new Map();
        for (let i = 0; i < testCoords.length; i++) {
            const coord = testCoords[i];
            testMap.set(ChunkCoordinate.toKey(coord.cx, coord.cy, coord.cz), i);
        }

        const lookupStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            const coord = testCoords[i % testCoords.length];
            const key = ChunkCoordinate.toKey(coord.cx, coord.cy, coord.cz);
            testMap.get(key);
        }
        const lookupTime = performance.now() - lookupStart;

        console.log('=== Chunk Key Performance ===');
        console.log(`String generation: ${stringTime.toFixed(2)}ms`);
        console.log(`Numeric generation: ${numericTime.toFixed(2)}ms`);
        console.log(`Speedup: ${(stringTime / numericTime).toFixed(2)}x faster`);
        console.log(`Map lookup (numeric): ${lookupTime.toFixed(2)}ms`);
        console.log(`Avg lookup: ${((lookupTime / iterations) * 1000000).toFixed(3)}ns`);
    }

    updateCachedPositions() {
        if (this.orbitalSystem && this.mainPlanet) {
            const planetPos = this.mainPlanet.getWorldPosition();
            this.cachedPlanetPos.set(planetPos.x, planetPos.y, planetPos.z);

            const starPos = this.orbitalSystem.star.getWorldPosition();
            this.cachedStarPos.set(starPos.x, starPos.y, starPos.z);
        }
    }

    updateScene() {
        if (this.planetContainer) {
            this.planetContainer.position.copy(this.cachedPlanetPos);
        }

        if (this.starMesh) {
            this.starMesh.position.copy(this.cachedStarPos);
        }

        if (this.materials.impostor?.uniforms.lightPosition) {
            this.materials.impostor.uniforms.lightPosition.value.copy(this.cachedStarPos);
        }
        if (this.materials.voxel?.uniforms.lightPosition) {
            this.materials.voxel.uniforms.lightPosition.value.copy(this.cachedStarPos);
        }
        if (this.materials.starImpostor?.uniforms.lightPosition) {
            this.materials.starImpostor.uniforms.lightPosition.value = this.cachedStarPos;
        }
    }

    async render() {
        const currentTime = performance.now();
        const deltaTime = (currentTime - (this.lastRenderTime || currentTime)) * 0.001;
        this.lastRenderTime = currentTime;

        if (this.isLoading) {
            if (this.surfaceChunksToLoad && this.loadedSurfaceChunks < this.surfaceChunksToLoad.length) {
                
                for (let i = 0; i < 2 && this.loadedSurfaceChunks < this.surfaceChunksToLoad.length; i++) {
                    this.loadSurfaceChunks();
                }
            }

            const totalChunks = this.surfaceChunksToLoad?.length || 0;
            const loadedChunks = this.loadedSurfaceChunks;
            const statusText = this.loadingAnimation.planetsLoaded ? 'Loading surface voxels...' : 'Loading planets...';

            this.loadingAnimation.update(deltaTime, loadedChunks, totalChunks, statusText);
            this.loadingAnimation.render();

            if (totalChunks > 0 && loadedChunks >= totalChunks) {
                this.loadingAnimation.complete();
            }
        } else {
            if (this.orbitalSystem) {
                this.orbitalSystem.update(deltaTime);
                this.updateCachedPositions();
            }

            this.updateScene();

            if (this.cameraTransition.isTransitioning) {
                this.cameraTransition.update(deltaTime);
            } else {
                this.fpsControls.update(deltaTime);
            }

            this.updateFPS();
            this.updateChunkLoading();

            this.renderer.render(this.scene, this.camera);
        }
    }

    start() {
        this.lastTime = performance.now();
        this.lastRenderTime = performance.now();
        this.frameCount = 0;

        const animate = () => {
            requestAnimationFrame(animate);
            this.render();
        };
        animate();
    }

    lerp(start, end, t) {
        return start + (end - start) * t;
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    updateStarLOD() {
        if (!this.starChunks || !this.starLodManager) return;

        const starPos = this.orbitalSystem.star.position;
        const cameraToStar = new THREE.Vector3(
            this.camera.position.x - starPos.x,
            this.camera.position.y - starPos.y,
            this.camera.position.z - starPos.z
        );

        if (!this.starLodManager.shouldLoadVoxels(cameraToStar, this.starRadius)) {
            this.starMesh.visible = true;
            for (const [key, mesh] of this.loadedStarMeshes) {
                this.scene.remove(mesh);
                MeshFactory.disposeMesh(mesh);
            }
            this.loadedStarMeshes.clear();
            return;
        }

        this.starMesh.visible = false;

        if (this.loadedStarMeshes.size === 0) {
            for (const coord of this.starSurfaceChunks) {
                const { cx, cy, cz } = coord;
                const key = ChunkCoordinate.toKey(cx, cy, cz);

                
                let chunkData = this.starChunks.get(key);
                if (!chunkData && this.starGenerator) {
                    chunkData = this.starGenerator.generateChunk(cx, cy, cz, this.chunkSize);
                    if (chunkData) {
                        this.starChunks.set(key, chunkData);
                    }
                }

                if (chunkData) {
                    const chunk = new Chunk(cx, cy, cz, this.chunkSize);
                    chunk.voxels = chunkData.voxels;

                    const geometryData = chunk.buildMesh((cx, cy, cz, lx, ly, lz, cs) => {
                        const neighborKey = ChunkCoordinate.toKey(
                            cx + (lx < 0 ? -1 : (lx >= this.chunkSize ? 1 : 0)),
                            cy + (ly < 0 ? -1 : (ly >= this.chunkSize ? 1 : 0)),
                            cz + (lz < 0 ? -1 : (lz >= this.chunkSize ? 1 : 0))
                        );

                        
                        let neighborChunkData = this.starChunks.get(neighborKey);
                        if (!neighborChunkData && this.starGenerator) {
                            neighborChunkData = this.starGenerator.generateChunk(
                                cx + (lx < 0 ? -1 : (lx >= this.chunkSize ? 1 : 0)),
                                cy + (ly < 0 ? -1 : (ly >= this.chunkSize ? 1 : 0)),
                                cz + (lz < 0 ? -1 : (lz >= this.chunkSize ? 1 : 0)),
                                this.chunkSize
                            );
                            if (neighborChunkData) {
                                this.starChunks.set(neighborKey, neighborChunkData);
                            }
                        }

                        if (!neighborChunkData) return false;

                        const nx = ((lx % this.chunkSize) + this.chunkSize) % this.chunkSize;
                        const ny = ((ly % this.chunkSize) + this.chunkSize) % this.chunkSize;
                        const nz = ((lz % this.chunkSize) + this.chunkSize) % this.chunkSize;

                        const voxelKey = (nx & 0x1F) | ((ny & 0x1F) << 5) | ((nz & 0x1F) << 10);
                        return neighborChunkData.voxels.has(voxelKey);
                    });

                    if (geometryData) {
                        const mesh = MeshFactory.createChunkMesh(geometryData, this.materials.emissive);
                        mesh.position.set(starPos.x, starPos.y, starPos.z);

                        this.scene.add(mesh);
                        this.loadedStarMeshes.set(key, mesh);
                        this.starChunkTextureManager.update(cx, cy, cz, true);
                    }
                }
            }
            this.starChunkTextureManager.markNeedsUpdate();
        }
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        if (this.loadingAnimation) {
            this.loadingAnimation.handleResize(window.innerWidth, window.innerHeight);
        }
    }

    setupBiomeEventListeners() {
        if (this.biomeEventUnsubscribe) {
            this.biomeEventUnsubscribe();
        }

        this.biomeEventUnsubscribe = globalBiomeEventBus.on(BIOME_EVENTS.DISTRIBUTION_CHANGED, (data) => {
            console.log('Biome distribution changed:', data);
            if (this.planetGenerator && this.biomeConfig) {
                this.planetGenerator.biomeConfig = this.biomeConfig;
            }
        });

        globalBiomeEventBus.on(BIOME_EVENTS.CONFIG_LOADED, (data) => {
            console.log('Biome configuration loaded:', data);
            this.biomeConfig = BiomeConfiguration.loadFromLocalStorage('universe_biome_config');
            if (this.planetGenerator) {
                this.planetGenerator.biomeConfig = this.biomeConfig;
            }
        });
    }

    updateBiomeConfiguration(newConfig) {
        this.biomeConfig = newConfig;
        if (this.planetGenerator) {
            this.planetGenerator.biomeConfig = newConfig;
        }
        console.log('Game biome configuration updated');
    }

    dispose() {
        if (this.biomeEventUnsubscribe) {
            this.biomeEventUnsubscribe();
        }
    }
}
