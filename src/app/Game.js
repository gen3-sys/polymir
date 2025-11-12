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
import { MVoxLoader } from '../data/mvox/MVoxLoader.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

        this.planetRadius = 150;
        this.starRadius = 80;
        this.chunkSize = 16;
        this.chunkTextureSize = 64;

        this.loadedMeshes = new Map();
        this.nestedStructureMeshes = new Map(); 
        this.materials = {};
        this.isLoading = true;
        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 3.0;
        this.surfaceChunksToLoad = [];
        this.loadedSurfaceChunks = 0;

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
    }

    setupRenderer() {
        this.scene.background = new THREE.Color(0x000510);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        this.camera.position.set(0, 155, 0);
        
        this.camera.lookAt(0, 155, -10);
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
            orbitRadius: 400,
            orbitSpeed: 0.1,
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
        window.addEventListener('resize', () => this.handleResize());
    }

    async initialize() {
        console.log('🚀 Starting initialization...');

        this.worldCache = new WorldCache();
        await this.worldCache.init();

        this.mvoxLoader = new MVoxLoader(this.worldCache);

        await this.loadShaders();
        await this.loadOrGeneratePlanet();
        this.generateStar();
        this.createMaterials();
        this.buildImpostor();
        this.beginSurfaceLoading();

        console.log('✓ Initialization complete, loading surface chunks...');
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
        console.log('✓ Shaders loaded');
    }

    async loadOrGeneratePlanet() {
        const planetGenerator = new SphereGenerator(this.planetRadius);
        this.planetGenerator = planetGenerator;

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
                    x: cx * this.chunkSize,
                    y: cy * this.chunkSize,
                    z: cz * this.chunkSize
                };
                const dist = Math.sqrt(
                    (chunkCenter.x - startCameraPos.x) ** 2 +
                    (chunkCenter.y - startCameraPos.y) ** 2 +
                    (chunkCenter.z - startCameraPos.z) ** 2
                );
                return { ...coord, dist };
            })
            .sort((a, b) => a.dist - b.dist);

        
        this.surfaceChunksToLoad = sortedChunks.slice(0, 9);

        
        this.planetChunks = new Map();
        console.log(`✓ Force-loading ${this.surfaceChunksToLoad.length} nearest chunks, rest will load in background...`);

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
        console.log(`✓ Star setup complete, will generate ${this.starSurfaceChunks.length} surface chunks on-demand`);
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

        console.log('✓ Materials created');
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

        console.log('✓ Impostor meshes built (planet + star)');
    }

    beginSurfaceLoading() {
        if (this.loadingAnimation) {
            this.loadingAnimation.showPlanets();
        }
        console.log(`✓ Beginning surface load: ${this.surfaceChunksToLoad.length} chunks`);
    }

    onLoadingComplete() {
        this.isLoading = false;
        this.isTransitioning = true;
        this.transitionProgress = 0;
        this.startTransitionCamera = {
            position: {
                x: this.loadingAnimation.camera.position.x,
                y: this.loadingAnimation.camera.position.y,
                z: this.loadingAnimation.camera.position.z
            },
            angle: {
                theta: this.loadingAnimation.cameraAngle.theta,
                phi: this.loadingAnimation.cameraAngle.phi
            },
            distance: this.loadingAnimation.cameraDistance
        };

        this.updateCachedPositions();

        if (this.preloadedSurfaceMeshes) {
            for (const { key, mesh} of this.preloadedSurfaceMeshes) {
                this.planetContainer.add(mesh);
                this.loadedMeshes.set(key, mesh);
            }
            console.log(`✓ Added ${this.preloadedSurfaceMeshes.length} preloaded surface meshes to planet container`);
            this.preloadedSurfaceMeshes = null;
        }

        this.updateScene();

        if (this.planetMesh) {
            this.planetContainer.remove(this.planetMesh);
            MeshFactory.disposeMesh(this.planetMesh);
            this.planetMesh = null;
        }
    }

    loadStarVoxels() {
        if (!this.starChunks) {
            console.warn('⚠ Star chunks not yet generated, skipping voxel load...');
            return;
        }

        console.log(`✓ Star voxel generation ready: ${this.starChunks.size} chunks prepared for LOD`);
    }

    loadSurfaceChunks() {
        if (this.loadedSurfaceChunks >= this.surfaceChunksToLoad.length) return;

        const coord = this.surfaceChunksToLoad[this.loadedSurfaceChunks];
        const { cx, cy, cz } = coord;
        const key = ChunkCoordinate.toKey(cx, cy, cz);

        
        const chunkData = this.planetChunks.get(key);
        if (!chunkData) {
            console.warn(`No chunk data for ${cx},${cy},${cz}`);
            this.loadedSurfaceChunks++;
            return;
        }

        const chunk = new Chunk(cx, cy, cz, this.chunkSize);
        chunk.voxels = chunkData.voxels;

        const geometryData = chunk.buildMesh((cx, cy, cz, lx, ly, lz, cs) =>
            this.neighborLookup(cx, cy, cz, lx, ly, lz, cs)
        );

        if (geometryData) {
            const mesh = MeshFactory.createChunkMesh(geometryData, this.materials.voxel);

            if (!this.preloadedSurfaceMeshes) {
                this.preloadedSurfaceMeshes = [];
            }
            this.preloadedSurfaceMeshes.push({ key, mesh });
            this.chunkTextureManager.update(cx, cy, cz, true);
        }

        this.loadedSurfaceChunks++;
        if (this.loadedSurfaceChunks % 100 === 0 || this.loadedSurfaceChunks === this.surfaceChunksToLoad.length) {
            console.log(`✓ Surface loading: ${this.loadedSurfaceChunks}/${this.surfaceChunksToLoad.length} chunks (${Math.round(this.loadedSurfaceChunks / this.surfaceChunksToLoad.length * 100)}%)`);
        }
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

            
            this.worldCache.loadMesh(key, 'terra_main').then(geometryData => {
                if (this.loadedMeshes.has(key)) return; 

                if (!geometryData) {
                    
                    const chunk = new Chunk(cx, cy, cz, this.chunkSize);
                    chunk.voxels = chunkData.voxels;

                    geometryData = chunk.buildMesh((cx, cy, cz, lx, ly, lz, cs) =>
                        this.neighborLookup(cx, cy, cz, lx, ly, lz, cs)
                    );

                    
                    if (geometryData) {
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

                const geometryData = chunk.buildMesh((cx, cy, cz, lx, ly, lz, cs) =>
                    this.neighborLookup(cx, cy, cz, lx, ly, lz, cs)
                );

                if (geometryData) {
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

            document.getElementById('fps').textContent = fps;

            if (performance.memory) {
                const memoryMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
                const glInfo = this.renderer.info.memory;
                const gpuInfo = ` (Geo: ${glInfo.geometries}, Tex: ${glInfo.textures})`;
                document.getElementById('memory').textContent = memoryMB + gpuInfo;
            }
        }
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
                console.log('✓ Loading complete, transitioning to game...');
                this.loadingAnimation.complete();
            }
        } else {
            if (this.orbitalSystem) {
                this.orbitalSystem.update(deltaTime);
                this.updateCachedPositions();
            }

            this.updateScene();
            this.fpsControls.update(deltaTime);
            this.updateFPS();

            if (this.isTransitioning) {
                this.transitionProgress += deltaTime / this.transitionDuration;

                if (this.transitionProgress >= 1.0) {
                    this.transitionProgress = 1.0;
                    this.isTransitioning = false;
                    console.log('✓ Transition complete, controls enabled');
                }
            }

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
}
