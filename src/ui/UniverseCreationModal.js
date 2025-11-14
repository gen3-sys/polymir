
import * as THREE from '../lib/three.module.js';
import { SystemVisualizer } from './SystemVisualizer.js';
import { PlanetCustomizer } from './PlanetCustomizer.js';
import { BiomeSettingsModal } from './BiomeSettingsModal.js';
import { SystemConfigTabSimplified } from './SystemConfigTabSimplified.js';
import { SchematicLibraryManager } from './SchematicLibraryManager.js';
import { TerrainPainterModal } from './TerrainPainterModal.js';

class SystemGeneratorMenuEnhanced {
    constructor(engine) {
        this.engine = engine;
        this.menuElement = null;
        this.currentTab = 'system';
        this.currentSystem = null;
        this.planetCustomizers = new Map();
        this.useGlobalDefaults = true;
        this.systemConfigTab = new SystemConfigTabSimplified(this);
        this.schematicManager = new SchematicLibraryManager();
        this.biomeModal = new BiomeSettingsModal();

        this.previewMode = 'system';
        this.previewPlanets = [];
        this.previewDustParticles = null;

        this.clusterSystems = [];
        this.superclusterViewActive = false;

        window.systemGenerator = this;
        window.systemMenu = this;
        window.systemConfigTab = this.systemConfigTab;
        
        
        window.configureBiomeDetails = (biomeType) => {
            console.log(`� Configuring biome details for: ${biomeType}`);
            this.biomeModal.show(biomeType);
        };
        
        window.launchBlockBench = () => {
            console.log('� Launching BlockBench...');
            alert('BlockBench integration coming soon!');
        };
        
        
        this.starLightingSystem = null;
        this.megachunkManager = null;
        
        
        this.settings = {
            systemType: 'standard',
            seed: Math.floor(Math.random() * 1000000),
            complexity: 'medium',
            planetCount: 5,
            enableRingworlds: true,
            enableMoons: true,
            enableAsteroids: true
        };
        
        
        this.globalDefaults = {
            temperature: 'temperate',
            gravity: 1.0,
            biomes: {
                desert: 15,
                forest: 25,
                ocean: 30,
                grassland: 20,
                mountains: 10
            },
            structureFrequency: 'common',
            structureTags: ['alien_ruins', 'settlement']
        };
        
        this.loadSavedWorlds();
        
        
        this.loadingIndicator = null;
    }
    
    /**
     * Show loading indicator
     */
    showLoadingIndicator(message = 'Loading...') {
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
        }
        
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            font-family: monospace;
            font-size: 16px;
            z-index: 10000;
            text-align: center;
        `;
        this.loadingIndicator.innerHTML = `
            <div style="margin-bottom: 10px;">${message}</div>
            <div style="width: 100px; height: 4px; background: #333; border-radius: 2px; overflow: hidden;">
                <div style="width: 100%; height: 100%; background: #00ff00; animation: loading 1s infinite;"></div>
            </div>
        `;
        
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes loading {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(this.loadingIndicator);
    }
    
    /**
     * Hide loading indicator
     */
    hideLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
    }
    
    /**
     * Show the menu
     */
    show() {
        const starfield = document.getElementById('starfield-layer');
        const sparkles = document.getElementById('sparkles-canvas');

        if (starfield) starfield.style.display = 'block';
        if (sparkles) sparkles.style.display = 'block';

        if (!this.menuElement) {
            this.createMenu();
        }

        this.menuElement.style.display = 'block';

        if (this.engine) {
            this.engine.paused = true;
        }

        setTimeout(() => this.attachPreviewRenderer(), 100);
    }

    attachPreviewRenderer() {
        console.log('[Preview] Attempting to attach preview renderer');
        const previewCanvas = document.getElementById('preview-canvas');
        console.log('[Preview] previewCanvas:', previewCanvas);
        console.log('[Preview] this.engine:', this.engine);
        console.log('[Preview] this.engine.renderer:', this.engine?.renderer);

        if (previewCanvas && this.engine && this.engine.renderer) {
            console.log('[Preview] All prerequisites met, attaching renderer');
            if (!this.originalCanvas) {
                this.originalCanvas = this.engine.renderer.domElement;
                console.log('[Preview] Stored original canvas');
            }

            const previewContainer = previewCanvas.parentElement;
            console.log('[Preview] previewContainer:', previewContainer);

            if (previewContainer && !previewContainer.contains(this.engine.renderer.domElement)) {
                previewCanvas.style.display = 'none';
                this.engine.renderer.domElement.style.width = '100%';
                this.engine.renderer.domElement.style.height = '100%';
                previewContainer.appendChild(this.engine.renderer.domElement);
                console.log('[Preview] Renderer attached to preview container');
                console.log('[Preview] Scene children count:', this.engine.scene.children.length);
                console.log('[Preview] Camera position:', this.engine.camera.position);
                console.log('[Preview] Renderer size:', this.engine.renderer.getSize(new THREE.Vector2()));

                this.setupPreviewCamera();
                this.createPreviewStar();
                this.updatePreviewForMode();
                this.startPreviewRendering();
            } else {
                console.log('[Preview] Container already contains renderer or container is null');
            }
        } else {
            console.log('[Preview] Prerequisites not met - cannot attach renderer');
        }
    }

    setupPreviewCamera() {
        if (!this.engine || !this.engine.camera) return;

        console.log('[Preview] Setting up camera for preview');
        this.engine.camera.position.set(0, 500, 1000);
        this.engine.camera.lookAt(0, 0, 0);
        console.log('[Preview] Camera positioned at:', this.engine.camera.position);
    }

    createPreviewStar() {
        if (!this.engine || !this.engine.scene) return;

        console.log('[Preview] Creating preview star');

        const starConfig = this.systemConfigTab?.getSystemConfig()?.star || { type: 'yellow', radius: 30 };
        const starRadius = starConfig.radius || 30;
        const starType = starConfig.type || 'yellow';

        const starGeometry = new THREE.SphereGeometry(starRadius, 32, 32);
        const starColor = this.getStarColor(starType);
        const starMaterial = new THREE.MeshBasicMaterial({
            color: starColor,
            emissive: starColor,
            emissiveIntensity: 1
        });

        if (this.previewStar) {
            this.engine.scene.remove(this.previewStar);
        }

        this.previewStar = new THREE.Mesh(starGeometry, starMaterial);
        this.previewStar.position.set(0, 0, 0);
        this.engine.scene.add(this.previewStar);

        if (this.previewLight) {
            this.engine.scene.remove(this.previewLight);
        }

        this.previewLight = new THREE.PointLight(starColor, 2, 10000);
        this.previewLight.position.set(0, 0, 0);
        this.engine.scene.add(this.previewLight);

        console.log('[Preview] Star added to scene at origin, radius:', starRadius);

        this.createOrbitalDust();
    }

    createOrbitalDust() {
        if (!this.engine || !this.engine.scene) return;

        if (this.previewDustParticles) {
            this.engine.scene.remove(this.previewDustParticles);
        }

        const dustCount = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(dustCount * 3);
        const colors = new Float32Array(dustCount * 3);
        const sizes = new Float32Array(dustCount);

        for (let i = 0; i < dustCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 100 + Math.random() * 400;
            const height = (Math.random() - 0.5) * 50;

            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = height;
            positions[i * 3 + 2] = Math.sin(angle) * radius;

            const brightness = 0.3 + Math.random() * 0.7;
            colors[i * 3] = brightness;
            colors[i * 3 + 1] = brightness * 0.9;
            colors[i * 3 + 2] = brightness * 0.8;

            sizes[i] = 0.5 + Math.random() * 1.5;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            sizeAttenuation: true
        });

        this.previewDustParticles = new THREE.Points(geometry, material);
        this.previewDustParticles.userData.dustRotation = 0;
        this.engine.scene.add(this.previewDustParticles);
    }

    setPreviewMode(mode) {
        console.log(`[Preview] Switching to ${mode} mode`);
        this.previewMode = mode;

        document.querySelectorAll('.preview-mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
                const colors = {
                    galaxy: { bg: 'rgba(100, 100, 255, 0.3)', border: '#6B8AFF' },
                    system: { bg: 'rgba(254, 0, 137, 0.3)', border: '#FE0089' },
                    planet: { bg: 'rgba(0, 255, 100, 0.3)', border: '#00FF66' }
                };
                btn.style.background = colors[mode].bg;
                btn.style.borderColor = colors[mode].border;
            } else {
                const baseColors = {
                    galaxy: { bg: 'rgba(100, 100, 255, 0.1)', border: '#6B8AFF' },
                    system: { bg: 'rgba(254, 0, 137, 0.1)', border: '#FE0089' },
                    planet: { bg: 'rgba(0, 255, 100, 0.1)', border: '#00FF66' }
                };
                const btnMode = btn.dataset.mode;
                btn.style.background = baseColors[btnMode].bg;
                btn.style.borderColor = baseColors[btnMode].border;
            }
        });

        this.updatePreviewForMode();
    }

    toggleSuperclusterView() {
        this.superclusterViewActive = !this.superclusterViewActive;

        const planetCardsContainer = document.getElementById('planet-cards-container');
        const superclusterContainer = document.getElementById('supercluster-config-container');
        const superclusterContent = document.getElementById('supercluster-content');

        if (this.superclusterViewActive) {
            planetCardsContainer.style.display = 'none';
            superclusterContainer.style.display = 'block';

            const systemCards = this.clusterSystems.map(sys => `
                <div class="planet-tile" style="
                    border-color: #00FFFF;
                    width: 180px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <div style="color: #FFD700; font-size: 11px; font-weight: bold; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${sys.name}
                        </div>
                        <button onclick="event.stopPropagation(); window.systemGenerator.removeClusterSystem('${sys.id}')" style="
                            background: linear-gradient(135deg, #FF0000 0%, #CC0000 100%);
                            color: white;
                            border: none;
                            border-radius: 3px;
                            padding: 2px 4px;
                            cursor: pointer;
                            font-size: 10px;
                        ">X</button>
                    </div>

                    <div style="color: #888; font-size: 8px; margin-bottom: 4px;">
                        ${new Date(sys.timestamp).toLocaleTimeString()}
                    </div>

                    <div style="display: grid; grid-template-columns: 50px 1fr; gap: 4px; align-items: center; margin-bottom: 2px;">
                        <label style="color: #888; font-size: 9px;">Planets</label>
                        <span style="color: #00FF00; font-size: 10px;">${sys.config.planets?.length || 0}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: 50px 1fr; gap: 4px; align-items: center; margin-bottom: 4px;">
                        <label style="color: #888; font-size: 9px;">Star</label>
                        <span style="color: #00FF00; font-size: 10px;">${sys.config.star?.type || 'yellow'}</span>
                    </div>

                    <button onclick="window.systemGenerator.loadClusterSystem('${sys.id}'); window.systemGenerator.toggleSuperclusterView();" style="
                        width: 100%;
                        padding: 4px 8px;
                        background: rgba(107, 138, 255, 0.1);
                        color: white;
                        border: 2px solid #6B8AFF;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 10px;
                        font-family: 'Courier New', monospace;
                        font-weight: bold;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(100, 100, 255, 0.2)'" onmouseout="this.style.background='rgba(107, 138, 255, 0.1)'">
                        LOAD
                    </button>
                </div>
            `).join('');

            superclusterContent.innerHTML = `
                <div style="
                    display: grid;
                    grid-template-columns: repeat(5, 180px);
                    gap: 30px;
                    align-items: start;
                ">
                    ${this.clusterSystems.length > 0
                        ? systemCards
                        : '<p style="color: #888; grid-column: 1 / -1;">No systems added to cluster yet. Use "Add to Cluster" to save systems.</p>'
                    }
                </div>
            `;
        } else {
            planetCardsContainer.style.display = 'block';
            superclusterContainer.style.display = 'none';
        }
    }

    updatePreviewForMode() {
        if (!this.engine || !this.engine.scene) return;

        this.clearPreviewPlanets();

        switch(this.previewMode) {
            case 'galaxy':
                this.renderGalaxyView();
                break;
            case 'system':
                this.renderSystemView();
                break;
            case 'planet':
                this.renderPlanetView();
                break;
        }
    }

    refreshPreview() {
        this.updatePreviewForMode();
    }

    renderConfiguredPlanets() {
        this.refreshPreview();
    }

    clearPreviewPlanets() {
        this.previewPlanets.forEach(mesh => {
            if (mesh && this.engine.scene) {
                this.engine.scene.remove(mesh);
            }
        });
        this.previewPlanets = [];
    }

    renderGalaxyView() {
        console.log('[Preview] Rendering galaxy view');
        this.setupPreviewCamera();
        this.engine.camera.position.set(0, 1000, 2000);
        this.engine.camera.lookAt(0, 0, 0);

        const systemConfig = this.systemConfigTab?.getSystemConfig();
        if (!systemConfig || !systemConfig.planets) return;

        systemConfig.planets.forEach((planet, index) => {
            const angle = (index / systemConfig.planets.length) * Math.PI * 2;
            const orbitRadius = planet.orbitalRadius || 150;
            const x = Math.cos(angle) * orbitRadius;
            const z = Math.sin(angle) * orbitRadius;

            const distance = this.engine.camera.position.distanceTo(
                new THREE.Vector3(x, 0, z)
            );

            const apparentSize = (planet.radius || 20) / distance * 1000;

            if (apparentSize > 5) {
                const geometry = new THREE.SphereGeometry(planet.radius || 20, 16, 16);
                const material = new THREE.MeshBasicMaterial({
                    color: this.getPlanetColor(planet),
                    opacity: 0.9,
                    transparent: true
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(x, 0, z);
                this.engine.scene.add(mesh);
                this.previewPlanets.push(mesh);
            } else {
                const geometry = new THREE.BufferGeometry();
                const vertices = new Float32Array([0, 0, 0]);
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

                const material = new THREE.PointsMaterial({
                    color: this.getPlanetColor(planet),
                    size: 3,
                    sizeAttenuation: false
                });

                const point = new THREE.Points(geometry, material);
                point.position.set(x, 0, z);
                this.engine.scene.add(point);
                this.previewPlanets.push(point);
            }
        });
    }

    renderSystemView() {
        console.log('[Preview] Rendering system view');
        this.setupPreviewCamera();

        const systemConfig = this.systemConfigTab?.getSystemConfig();
        if (!systemConfig || !systemConfig.planets) return;

        systemConfig.planets.forEach((planet, index) => {
            const angle = (index / systemConfig.planets.length) * Math.PI * 2;
            const orbitRadius = planet.orbitalRadius || 150;
            const x = Math.cos(angle) * orbitRadius;
            const z = Math.sin(angle) * orbitRadius;

            const geometry = new THREE.SphereGeometry(planet.radius || 20, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color: this.getPlanetColor(planet),
                shininess: 30
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, 0, z);
            this.engine.scene.add(mesh);
            this.previewPlanets.push(mesh);
        });
    }

    renderPlanetView() {
        console.log('[Preview] Rendering planet view');
        this.engine.camera.position.set(100, 50, 100);
        this.engine.camera.lookAt(0, 0, 0);

        const systemConfig = this.systemConfigTab?.getSystemConfig();
        if (!systemConfig || !systemConfig.planets || systemConfig.planets.length === 0) return;

        const planet = systemConfig.planets[0];
        const geometry = new THREE.SphereGeometry(planet.radius || 20, 64, 64);
        const material = new THREE.MeshPhongMaterial({
            color: this.getPlanetColor(planet),
            shininess: 50
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0, 0);
        this.engine.scene.add(mesh);
        this.previewPlanets.push(mesh);
    }

    getPlanetColor(planet) {
        if (planet.color) {
            return new THREE.Color(planet.color);
        }

        const colors = {
            'terrestrial': 0x4169E1,
            'martian': 0xCD5C5C,
            'jovian': 0xDEB887,
            'ice_world': 0xE0FFFF,
            'lava_world': 0xFF4500,
            'venusian': 0xFFA500
        };

        return new THREE.Color(colors[planet.type] || 0x888888);
    }

    createDefaultPreviewScene() {
        console.log('[Preview] createDefaultPreviewScene called');

        if (!this.engine || !this.engine.scene) {
            console.log('[Preview] No engine/scene available, skipping default scene');
            return;
        }

        console.log('[Preview] Creating default preview scene with star');

        const starConfig = this.systemConfigTab?.getSystemConfig()?.star || { type: 'yellow', radius: 30, temperature: 5778 };

        const starGeometry = new THREE.SphereGeometry(starConfig.radius || 30, 32, 32);
        const starColor = this.getStarColor(starConfig.type || 'yellow');
        const starMaterial = new THREE.MeshBasicMaterial({
            color: starColor,
            emissive: starColor,
            emissiveIntensity: 1
        });

        if (this.previewStar) {
            this.engine.scene.remove(this.previewStar);
        }

        this.previewStar = new THREE.Mesh(starGeometry, starMaterial);
        this.previewStar.position.set(0, 0, 0);
        this.engine.scene.add(this.previewStar);

        const light = new THREE.PointLight(starColor, 2, 10000);
        light.position.set(0, 0, 0);
        this.engine.scene.add(light);

        console.log('[Preview] Default star added to scene at origin');
    }

    getStarColor(starType) {
        const colors = {
            'blue': 0x9BB0FF,
            'white': 0xF8F7FF,
            'yellow': 0xFFD700,
            'orange': 0xFFAA00,
            'red': 0xFF4500
        };
        return colors[starType] || colors['yellow'];
    }

    startPreviewRendering() {
        console.log('[Preview] Starting preview rendering loop');

        if (this.previewRenderLoop) {
            cancelAnimationFrame(this.previewRenderLoop);
        }

        let frameCount = 0;
        const renderPreview = () => {
            if (this.engine && this.engine.renderer && this.engine.scene && this.engine.camera) {
                if (this.previewDustParticles && this.previewDustParticles.userData) {
                    this.previewDustParticles.userData.dustRotation += 0.0005;
                    this.previewDustParticles.rotation.y = this.previewDustParticles.userData.dustRotation;
                }

                this.engine.renderer.render(this.engine.scene, this.engine.camera);

                if (frameCount === 0) {
                    console.log('[Preview] First frame rendered');
                    console.log('[Preview] Scene children:', this.engine.scene.children);
                    console.log('[Preview] Camera:', this.engine.camera.position, this.engine.camera.rotation);
                }
                frameCount++;
            }
            this.previewRenderLoop = requestAnimationFrame(renderPreview);
        };

        renderPreview();
    }

    stopPreviewRendering() {
        if (this.previewRenderLoop) {
            console.log('[Preview] Stopping preview rendering loop');
            cancelAnimationFrame(this.previewRenderLoop);
            this.previewRenderLoop = null;
        }
    }

    detachPreviewRenderer() {
        this.stopPreviewRendering();

        if (this.originalCanvas && this.engine && this.engine.renderer) {
            const previewCanvas = document.getElementById('preview-canvas');
            if (previewCanvas) {
                const previewContainer = previewCanvas.parentElement;
                if (previewContainer && previewContainer.contains(this.engine.renderer.domElement)) {
                    previewContainer.removeChild(this.engine.renderer.domElement);
                    previewCanvas.style.display = 'block';
                }
            }
            document.body.appendChild(this.originalCanvas);
        }
    }
    
    /**
     * Create animated starfield background
     */
    createStarfieldBackground() {
        
        if (document.getElementById('menu-starfield-bg')) return;
        
        const starfield = document.createElement('div');
        starfield.id = 'menu-starfield-bg';
        starfield.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000033;
            z-index: 9998;
            overflow: hidden;
        `;
        
        
        for (let layer = 0; layer < 3; layer++) {
            const starsContainer = document.createElement('div');
            starsContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
            `;
            
            
            const starCount = 150 - (layer * 40); 
            for (let i = 0; i < starCount; i++) {
                const star = document.createElement('div');
                const size = Math.random() * (3 - layer) + 0.5;
                const x = Math.random() * 100;
                const y = Math.random() * 100;
                const brightness = Math.random() * 0.5 + 0.5;
                const twinkleDelay = Math.random() * 5;
                
                star.style.cssText = `
                    position: absolute;
                    left: ${x}%;
                    top: ${y}%;
                    width: ${size}px;
                    height: ${size}px;
                    background: radial-gradient(circle, rgba(255, 255, 255, ${brightness}) 0%, transparent 70%);
                    border-radius: 50%;
                    animation: twinkle ${3 + layer}s ease-in-out ${twinkleDelay}s infinite;
                `;
                
                starsContainer.appendChild(star);
            }
            
            
            for (let i = 0; i < 10; i++) {
                const star = document.createElement('div');
                const size = Math.random() * 2 + 1;
                const x = Math.random() * 100;
                const y = Math.random() * 100;
                const colors = ['#FFB6C1', '#87CEEB', '#FFD700', '#FF6B6B', '#4ECDC4'];
                const color = colors[Math.floor(Math.random() * colors.length)];
                
                star.style.cssText = `
                    position: absolute;
                    left: ${x}%;
                    top: ${y}%;
                    width: ${size}px;
                    height: ${size}px;
                    background: radial-gradient(circle, ${color} 0%, transparent 70%);
                    border-radius: 50%;
                    animation: twinkle ${4 + layer}s ease-in-out ${Math.random() * 5}s infinite;
                    box-shadow: 0 0 ${size * 2}px ${color}40;
                `;
                
                starsContainer.appendChild(star);
            }
            
            starfield.appendChild(starsContainer);
        }
        
        
        if (!document.getElementById('starfield-styles')) {
            const style = document.createElement('style');
            style.id = 'starfield-styles';
            style.textContent = `
                @keyframes twinkle {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
                
                @keyframes shootingStar {
                    0% {
                        transform: translateX(0) translateY(0) rotate(-45deg);
                        opacity: 1;
                    }
                    100% {
                        transform: translateX(300px) translateY(300px) rotate(-45deg);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        
        setInterval(() => {
            if (!document.getElementById('menu-starfield-bg')) return;
            
            const shootingStar = document.createElement('div');
            const startX = Math.random() * window.innerWidth;
            const startY = Math.random() * window.innerHeight * 0.5;
            
            shootingStar.style.cssText = `
                position: absolute;
                left: ${startX}px;
                top: ${startY}px;
                width: 2px;
                height: 100px;
                background: linear-gradient(to bottom, transparent, #FFFFFF, transparent);
                transform: rotate(-45deg);
                animation: shootingStar 1s linear forwards;
            `;
            
            starfield.appendChild(shootingStar);
            setTimeout(() => shootingStar.remove(), 1000);
        }, 3000);
        
        document.body.appendChild(starfield);
    }
    
    /**
     * Create the enhanced menu
     */
    createMenu() {
        
        const existingMenu = document.getElementById('system-generator-enhanced');
        if (existingMenu) {
            existingMenu.remove();
        }
        
        const menu = document.createElement('div');
        menu.id = 'system-generator-enhanced';
        menu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 85vw;
            max-width: 1200px;
            height: 90vh;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(10, 10, 40, 0.95) 100%);
            border: 2px solid #FE0089;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            font-family: 'Courier New', monospace;
            color: #00FF00;
            z-index: 10000;
            box-shadow: 0 0 30px rgba(254, 0, 137, 0.5);
        `;

        
        const header = document.createElement('div');
        header.style.cssText = 'padding: 10px; border-bottom: 2px solid #FE0089; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = `
            <button id="back-to-menu-btn" style="
                padding: 8px 15px;
                background: linear-gradient(135deg, #666 0%, #444 100%);
                color: white;
                border: 1px solid #888;
                border-radius: 5px;
                font-size: 12px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
            ">← Back to Menu</button>
            <h1 style="color: #FFD700; margin: 0; text-shadow: 0 0 10px #FFD700; font-size: 18px;">
                POLYMIR V3 - UNIVERSE CREATION ENGINE
            </h1>
            <div style="width: 100px;"></div>
        `;

        
        const tabNav = document.createElement('div');
        tabNav.style.cssText = 'display: flex; background: rgba(254, 0, 137, 0.1); border-bottom: 2px solid #FE0089;';
        tabNav.innerHTML = `
            <button class="tab-btn" data-tab="supercluster" style="flex: 1; padding: 10px; background: transparent; color: #FE0089; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                SUPERCLUSTER
            </button>
            <button class="tab-btn active" data-tab="system" style="flex: 1; padding: 10px; background: rgba(254, 0, 137, 0.2); color: #FE0089; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                SYSTEM/GALAXY
            </button>
            <button class="tab-btn" data-tab="biomes" style="flex: 1; padding: 10px; background: transparent; color: #FE0089; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                BIOME STRUCTURES
            </button>
            <button class="tab-btn" data-tab="library" style="flex: 1; padding: 10px; background: transparent; color: #FE0089; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                SCHEMATIC LIBRARY
            </button>
        `;

        
        const content = document.createElement('div');
        content.id = 'tab-content';
        content.style.cssText = 'flex: 1; overflow: hidden; padding: 12px; position: relative; min-height: 0;';

        
        menu.appendChild(header);
        menu.appendChild(tabNav);
        menu.appendChild(content);
        
        document.body.appendChild(menu);
        this.menuElement = menu;
        
        
        setTimeout(() => {
            this.showSystemTab();
            
            
            this.attachEventListeners();
        }, 0);
    }
    
    /**
     * Show supercluster configuration tab
     */
    showSuperclusterTab() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.style.background = 'transparent';
            btn.classList.remove('active');
            if (btn.dataset.tab === 'supercluster') {
                btn.style.background = 'rgba(0, 255, 255, 0.2)';
                btn.classList.add('active');
            }
        });

        this.currentTab = 'supercluster';

        const content = document.getElementById('tab-content');

        const systemCards = this.clusterSystems.map(sys => `
            <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 10px; border: 1px solid #6B8AFF;">
                <h4 style="color: #FFD700; margin: 0 0 10px 0;">${sys.name}</h4>
                <p style="color: #888; font-size: 12px; margin: 0 0 10px 0;">Added ${new Date(sys.timestamp).toLocaleTimeString()}</p>
                <div style="color: #00FF00; font-size: 11px;">
                    <div>Planets: ${sys.config.planets?.length || 0}</div>
                    <div>Star: ${sys.config.star?.type || 'yellow'}</div>
                </div>
                <div style="display: flex; gap: 5px; margin-top: 10px;">
                    <button onclick="window.systemGenerator.loadClusterSystem('${sys.id}')" style="
                        flex: 1;
                        padding: 5px 10px;
                        background: #6B8AFF;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 11px;
                    ">Load</button>
                    <button onclick="window.systemGenerator.removeClusterSystem('${sys.id}')" style="
                        padding: 5px 10px;
                        background: #FF0000;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 11px;
                    ">Remove</button>
                </div>
            </div>
        `).join('');

        content.innerHTML = `
            <div style="padding: 20px;">
                <h2 style="color: #FFD700; margin-bottom: 20px;">Supercluster Configuration</h2>

                <div style="background: rgba(0, 100, 200, 0.1); border: 2px solid #00FFFF; border-radius: 15px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #00FFFF; margin-bottom: 15px;">Supercluster Properties</h3>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                        <div>
                            <label style="color: #00FF00; display: block; margin-bottom: 5px;">Name</label>
                            <input type="text" value="Laniakea" style="
                                width: 100%;
                                padding: 8px;
                                background: rgba(0, 0, 0, 0.5);
                                color: #00FF00;
                                border: 1px solid #00FF00;
                                border-radius: 5px;
                            ">
                        </div>

                        <div>
                            <label style="color: #00FF00; display: block; margin-bottom: 5px;">Systems in Cluster</label>
                            <input type="number" value="${this.clusterSystems.length}" readonly style="
                                width: 100%;
                                padding: 8px;
                                background: rgba(0, 0, 0, 0.7);
                                color: #FFD700;
                                border: 1px solid #00FF00;
                                border-radius: 5px;
                            ">
                        </div>
                    </div>
                </div>

                <div style="background: rgba(254, 0, 137, 0.1); border: 2px solid #FE0089; border-radius: 15px; padding: 20px;">
                    <h3 style="color: #FE0089; margin-bottom: 15px;">Systems in Cluster (${this.clusterSystems.length})</h3>

                    ${this.clusterSystems.length === 0 ? `
                        <div style="text-align: center; padding: 40px; color: #888;">
                            <p>No systems added yet.</p>
                            <p style="font-size: 12px; margin-top: 10px;">Configure a system in the SYSTEM/GALAXY tab and click "ADD TO CLUSTER"</p>
                        </div>
                    ` : `
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                            ${systemCards}
                        </div>
                    `}
                </div>

                <div style="margin-top: 20px; text-align: center; color: #888; font-size: 14px;">
                    Configure individual star systems in the SYSTEM/GALAXY tab
                </div>
            </div>
        `;
    }

    /**
     * Show system configuration tab
     */
    showSystemTab() {
        const content = document.getElementById('tab-content');

        content.innerHTML = this.systemConfigTab.getHTML();


        this.attachSystemTabListeners();
    }

    /**
     * Attach event listeners for system tab
     */
    attachSystemTabListeners() {

        this.systemConfigTab.attachEventListeners();
    }

    /**
     * Show planet customization tab
     */
    showPlanetsTab() {
        const content = document.getElementById('tab-content');
        
        if (!this.currentSystem) {
            content.innerHTML = `
                <div style="text-align: center; padding: 50px; color: #FFD700;">
                    <h2> No System Generated</h2>
                    <p>Please generate a system first to customize planets</p>
                </div>
            `;
            return;
        }
        
        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h2 style="color: #FFD700;">� Planet Customization</h2>
                <p style="color: #888888;">Configure each planet's properties individually</p>
            </div>
            <div id="planet-list"></div>
        `;
        
        
        const planetList = document.getElementById('planet-list');
        this.currentSystem.planets.forEach(planet => {
            const customizer = new PlanetCustomizer(planet, null);
            const panel = customizer.createPanel();
            planetList.appendChild(panel);
            this.planetCustomizers.set(planet.id, customizer);
        });
    }
    
    /**
     * Show biome structures tab
     */
    showBiomesTab() {
        const content = document.getElementById('tab-content');
        content.innerHTML = `
            <div style="padding: 20px;">
                <h2 style="color: #FFD700; margin-bottom: 20px;">� Biome Structure Configuration</h2>
                
                <!-- Biome Structure Settings -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
                    ${this.createEnhancedBiomeCards()}
                </div>
                
                <!-- Structure Spawn Rules -->
                <div style="background: rgba(0, 255, 255, 0.1); border: 2px solid #00FFFF; border-radius: 15px; padding: 20px;">
                    <h3 style="color: #00FFFF; margin-bottom: 15px;">� Global Structure Settings</h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                        <div>
                            <label style="color: #00FF00;">Surface Structures</label>
                            <div style="margin-top: 10px;">
                                <label style="color: #888888; display: block; margin: 5px 0;">
                                    <input type="checkbox" checked> Ancient Ruins (5% chance)
                                </label>
                                <label style="color: #888888; display: block; margin: 5px 0;">
                                    <input type="checkbox" checked> Settlements (3% chance)
                                </label>
                                <label style="color: #888888; display: block; margin: 5px 0;">
                                    <input type="checkbox"> Dungeons (2% chance)
                                </label>
                            </div>
                        </div>
                        <div>
                            <label style="color: #00FF00;">Space Structures</label>
                            <div style="margin-top: 10px;">
                                <label style="color: #888888; display: block; margin: 5px 0;">
                                    <input type="checkbox" checked> Space Stations (Orbit)
                                </label>
                                <label style="color: #888888; display: block; margin: 5px 0;">
                                    <input type="checkbox" checked> Derelict Ships (Random)
                                </label>
                                <label style="color: #888888; display: block; margin: 5px 0;">
                                    <input type="checkbox"> Asteroid Bases (Belt only)
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Create enhanced biome cards with structures
     */
    createEnhancedBiomeCards() {
        const biomes = [
            { 
                type: 'desert', icon: '�', color: '#F4A460',
                structures: ['Pyramids', 'Oasis Towns', 'Sand Temples'],
                vegetation: 10, resources: 'Rare minerals'
            },
            { 
                type: 'forest', icon: '�', color: '#228B22',
                structures: ['Tree Villages', 'Druid Circles', 'Hidden Groves'],
                vegetation: 90, resources: 'Wood, herbs'
            },
            { 
                type: 'ocean', icon: '�', color: '#4169E1',
                structures: ['Underwater Cities', 'Coral Reefs', 'Shipwrecks'],
                vegetation: 30, resources: 'Fish, pearls'
            },
            { 
                type: 'ice', icon: '', color: '#E0FFFF',
                structures: ['Ice Fortresses', 'Frozen Labs', 'Crystal Caves'],
                vegetation: 5, resources: 'Ice crystals'
            },
            { 
                type: 'grassland', icon: '�', color: '#90EE90',
                structures: ['Villages', 'Windmills', 'Stone Circles'],
                vegetation: 60, resources: 'Crops, livestock'
            },
            { 
                type: 'mountains', icon: '', color: '#8B7355',
                structures: ['Monasteries', 'Mine Shafts', 'Dragon Lairs'],
                vegetation: 20, resources: 'Ore, gems'
            },
            { 
                type: 'lava', icon: '�', color: '#FF4500',
                structures: ['Obsidian Towers', 'Lava Forges', 'Fire Temples'],
                vegetation: 0, resources: 'Obsidian, sulfur'
            },
            { 
                type: 'crystal', icon: '�', color: '#E6E6FA',
                structures: ['Crystal Spires', 'Energy Nodes', 'Prism Gardens'],
                vegetation: 15, resources: 'Energy crystals'
            },
            { 
                type: 'void', icon: '�', color: '#4B0082',
                structures: ['Void Stations', 'Dark Obelisks', 'Null Zones'],
                vegetation: 0, resources: 'Dark matter'
            }
        ];
        
        return biomes.map(biome => `
            <div style="
                background: linear-gradient(135deg, ${biome.color}22 0%, ${biome.color}11 100%);
                border: 2px solid ${biome.color};
                border-radius: 10px;
                padding: 20px;
                cursor: pointer;
                transition: all 0.3s;
                position: relative;
                overflow: hidden;
            " class="biome-card" data-biome="${biome.type}"
               onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 5px 20px ${biome.color}66'"
               onmouseout="this.style.transform=''; this.style.boxShadow=''">
                <h3 style="color: ${biome.color}; margin: 0 0 10px 0;">
                    ${biome.icon} ${biome.type.toUpperCase()}
                </h3>
                
                <div style="font-size: 12px; color: #CCCCCC; margin-bottom: 15px;">
                    <div style="margin: 5px 0;">
                        <span style="color: #00FF00;">Vegetation:</span> ${biome.vegetation}%
                    </div>
                    <div style="margin: 5px 0;">
                        <span style="color: #FFD700;">Resources:</span> ${biome.resources}
                    </div>
                </div>
                
                <div style="border-top: 1px solid ${biome.color}44; padding-top: 10px;">
                    <div style="color: #00FFFF; font-size: 11px; margin-bottom: 8px;">UNIQUE STRUCTURES:</div>
                    ${biome.structures.map(s => `
                        <label style="display: block; margin: 3px 0; font-size: 11px;">
                            <input type="checkbox" checked> ${s}
                        </label>
                    `).join('')}
                </div>
                
                <button onclick="window.configureBiomeDetails('${biome.type}')" style="
                    margin-top: 10px;
                    padding: 8px 16px;
                    background: ${biome.color};
                    color: black;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    width: 100%;
                    font-weight: bold;
                "> Configure</button>
            </div>
        `).join('');
    }
    
    /**
     * Create biome configuration cards (legacy)
     */
    createBiomeCards() {
        const biomes = [
            { type: 'desert', icon: '�', color: '#F4A460' },
            { type: 'forest', icon: '�', color: '#228B22' },
            { type: 'ocean', icon: '�', color: '#4169E1' },
            { type: 'ice', icon: '', color: '#E0FFFF' },
            { type: 'grassland', icon: '�', color: '#90EE90' },
            { type: 'mountains', icon: '', color: '#8B7355' },
            { type: 'lava', icon: '�', color: '#FF4500' },
            { type: 'crystal', icon: '�', color: '#E6E6FA' },
            { type: 'void', icon: '�', color: '#4B0082' }
        ];
        
        return biomes.map(biome => `
            <div style="
                background: linear-gradient(135deg, ${biome.color}22 0%, ${biome.color}11 100%);
                border: 2px solid ${biome.color};
                border-radius: 10px;
                padding: 20px;
                cursor: pointer;
                transition: transform 0.3s;
            " class="biome-card" data-biome="${biome.type}">
                <h3 style="color: ${biome.color}; margin: 0 0 10px 0;">
                    ${biome.icon} ${biome.type.toUpperCase()}
                </h3>
                <div style="font-size: 12px; color: #888888;">
                    <div>Vegetation: ${this.globalDefaults.biomes[biome.type] || 50}%</div>
                    <div>Resources: Common</div>
                    <div>Structures: 5 types</div>
                </div>
                <button style="
                    margin-top: 10px;
                    padding: 8px 16px;
                    background: ${biome.color};
                    color: black;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    width: 100%;
                "> Configure</button>
            </div>
        `).join('');
    }
    
    /**
     * Show schematic library tab
     */
    showLibraryTab() {
        const content = document.getElementById('tab-content');

        // Add custom scrollbar styles if not already present
        if (!document.getElementById('schematic-library-styles')) {
            const style = document.createElement('style');
            style.id = 'schematic-library-styles';
            style.textContent = `
                #schematic-categories::-webkit-scrollbar,
                #schematic-grid-wrapper::-webkit-scrollbar {
                    width: 12px;
                }
                #schematic-categories::-webkit-scrollbar-track,
                #schematic-grid-wrapper::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.5);
                    border-radius: 6px;
                }
                #schematic-categories::-webkit-scrollbar-thumb,
                #schematic-grid-wrapper::-webkit-scrollbar-thumb {
                    background: rgba(255, 215, 0, 0.5);
                    border-radius: 6px;
                    border: 2px solid rgba(0, 0, 0, 0.3);
                }
                #schematic-categories::-webkit-scrollbar-thumb:hover,
                #schematic-grid-wrapper::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 215, 0, 0.7);
                }
            `;
            document.head.appendChild(style);
        }

        content.innerHTML = `
            <div style="display: flex; gap: 20px; height: 100%; max-height: 100%; position: relative; overflow: hidden;">
                <!-- Library Sidebar -->
                <div style="
                    width: 280px;
                    flex-shrink: 0;
                    background: linear-gradient(135deg, rgba(0, 255, 255, 0.12) 0%, rgba(0, 200, 200, 0.08) 100%);
                    border: 1px solid rgba(0, 255, 255, 0.3);
                    padding: 20px;
                    border-radius: 12px;
                    overflow-y: auto;
                    box-shadow: 0 4px 20px rgba(0, 255, 255, 0.1);
                ">
                    <h3 style="
                        color: #00FFFF;
                        margin: 0 0 20px 0;
                        font-size: 16px;
                        letter-spacing: 0.5px;
                        border-bottom: 2px solid rgba(0, 255, 255, 0.3);
                        padding-bottom: 10px;
                    ">� Schematic Library</h3>

                    <!-- Upload Schematic Button -->
                    <button onclick="document.getElementById('schematic-upload').click()" style="
                        width: 100%;
                        padding: 12px;
                        margin-bottom: 20px;
                        background: linear-gradient(135deg, #00DD00 0%, #00AA00 100%);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: bold;
                        font-size: 13px;
                        transition: all 0.2s;
                        box-shadow: 0 2px 8px rgba(0, 255, 0, 0.2);
                    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0, 255, 0, 0.3)'"
                       onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px rgba(0, 255, 0, 0.2)'">
                        � Upload Schematic
                    </button>
                    <input type="file" id="schematic-upload" accept=".mvox,.schematic,.nbt,.litematic" style="display: none;">

                    <input type="search" id="schematic-search" placeholder="Search schematics..." style="
                        width: 100%;
                        padding: 10px 12px;
                        margin-bottom: 20px;
                        background: rgba(0, 17, 34, 0.8);
                        color: #00FF00;
                        border: 1px solid rgba(0, 255, 0, 0.3);
                        border-radius: 6px;
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        transition: all 0.2s;
                    " onfocus="this.style.borderColor='#00FF00'; this.style.boxShadow='0 0 8px rgba(0, 255, 0, 0.2)'"
                       onblur="this.style.borderColor='rgba(0, 255, 0, 0.3)'; this.style.boxShadow='none'"
                       oninput="window.systemGenerator?.searchSchematics(this.value)">

                    <div style="
                        color: #00FFFF;
                        font-size: 11px;
                        font-weight: bold;
                        letter-spacing: 1px;
                        margin-bottom: 12px;
                        text-transform: uppercase;
                    ">Categories</div>
                    <div id="schematic-categories" style="max-height: 400px; overflow-y: auto;">
                        ${this.renderSchematicCategories()}
                    </div>
                </div>

                <!-- Schematic Grid -->
                <div style="
                    flex: 1;
                    min-height: 0;
                    max-height: 100%;
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(10, 10, 40, 0.4) 100%);
                    border: 1px solid rgba(255, 215, 0, 0.2);
                    padding: 24px;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                ">
                    <div style="flex-shrink: 0; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="
                                color: #FFD700;
                                margin: 0;
                                font-size: 18px;
                                letter-spacing: 0.5px;
                            ">Available Schematics</h3>
                            <div style="color: #888888; font-size: 12px;" id="schematic-count">Loading...</div>
                        </div>
                        <div style="
                            color: #FFA500;
                            font-size: 11px;
                            padding: 8px 12px;
                            background: rgba(255, 165, 0, 0.1);
                            border-left: 3px solid #FFA500;
                            border-radius: 4px;
                        ">
                            <strong>Furniture</strong> items are recolorable. <strong>Objects</strong> are detailed items with fixed colors and emissive lighting.
                        </div>
                    </div>
                    <div id="schematic-grid-wrapper" style="flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0;">
                        <div id="schematic-grid" style="
                            display: grid;
                            grid-template-columns: repeat(4, 1fr);
                            gap: 20px;
                            align-items: start;
                            padding-bottom: 20px;
                        ">
                        ${this.createSchematicThumbnails()}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render schematic categories from library
     */
    renderSchematicCategories() {
        if (!this.schematicManager) {
            return '<div style="color: #888888; padding: 10px; text-align: center;">Loading categories...</div>';
        }

        const categoryGroups = {
            'USER BUILDS': ['player_build'],
            'FURNITURE': ['furniture', 'objects'],
            'PLANETARY': ['alien_ruins', 'settlement', 'mining_outpost', 'dungeon', 'research_station'],
            'ORBITAL': ['space_station', 'derelict_ship', 'satellite']
        };

        let html = `
            <div class="category-item" data-category="all" style="
                padding: 10px 12px;
                margin: 4px 0 16px 0;
                color: #FFD700;
                cursor: pointer;
                transition: all 0.2s;
                border-radius: 6px;
                font-size: 13px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(255, 215, 0, 0.1);
                border: 1px solid rgba(255, 215, 0, 0.3);
            " onmouseover="this.style.background='rgba(255, 215, 0, 0.2)'; this.style.transform='translateX(4px)'"
               onmouseout="this.style.background='rgba(255, 215, 0, 0.1)'; this.style.transform='translateX(0)'"
               onclick="window.systemGenerator?.showAllSchematics()">
                <span>All Schematics</span>
            </div>
        `;

        for (const [groupName, categories] of Object.entries(categoryGroups)) {
            const groupColor = groupName === 'PLANETARY' ? '#00FF00' :
                             groupName === 'ORBITAL' ? '#00FFFF' :
                             groupName === 'FURNITURE' ? '#FFA500' :
                             '#FF69B4';

            const groupId = groupName.replace(/\s+/g, '-').toLowerCase();
            const isCollapsible = groupName === 'PLANETARY' || groupName === 'ORBITAL';
            const defaultExpanded = !isCollapsible;

            html += `
                <div style="margin: 16px 0 8px 0;">
                    <div style="
                        color: #FFD700;
                        font-size: 10px;
                        font-weight: bold;
                        letter-spacing: 0.8px;
                        padding: 8px 6px;
                        border-bottom: 1px solid rgba(255, 215, 0, 0.3);
                        ${isCollapsible ? 'cursor: pointer;' : ''}
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        transition: all 0.2s;
                    " ${isCollapsible ? `onclick="window.systemGenerator?.toggleCategoryGroup('${groupId}')"` : ''}
                       ${isCollapsible ? `onmouseover="this.style.background='rgba(255, 215, 0, 0.1)'" onmouseout="this.style.background='transparent'"` : ''}>
                        <span>${groupName}</span>
                        ${isCollapsible ? `<span id="toggle-${groupId}" style="font-size: 12px;">▶</span>` : ''}
                    </div>
                    <div id="group-${groupId}" style="display: ${defaultExpanded ? 'block' : 'none'};">
            `;

            for (const category of categories) {
                const schematics = this.schematicManager.getSchematicsByCategory(category);
                const count = schematics.length;

                const displayName = category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                html += `
                    <div class="category-item" data-category="${category}" style="
                        padding: 10px 12px;
                        margin: 4px 0;
                        color: ${groupColor};
                        cursor: pointer;
                        transition: all 0.2s;
                        border-radius: 6px;
                        font-size: 13px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    " onmouseover="this.style.background='rgba(0,255,255,0.15)'; this.style.transform='translateX(4px)'"
                       onmouseout="this.style.background='transparent'; this.style.transform='translateX(0)'"
                       onclick="window.systemGenerator?.filterSchematicsByCategory('${category}')">
                        <span>${displayName}</span>
                        <span style="
                            background: rgba(0, 0, 0, 0.4);
                            padding: 2px 8px;
                            border-radius: 10px;
                            font-size: 11px;
                            color: #888888;
                        ">${count}</span>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        return html;
    }

    /**
     * Toggle category group expansion
     */
    toggleCategoryGroup(groupId) {
        const groupElement = document.getElementById(`group-${groupId}`);
        const toggleIcon = document.getElementById(`toggle-${groupId}`);

        if (!groupElement || !toggleIcon) return;

        const isHidden = groupElement.style.display === 'none';
        groupElement.style.display = isHidden ? 'block' : 'none';
        toggleIcon.textContent = isHidden ? '▼' : '▶';
    }

    /**
     * Get icon for category (NO EMOJIS)
     */
    getCategoryIcon(category) {
        // No icons - removed all emojis
        return '';
    }

    /**
     * Show all schematics (reset filter)
     */
    showAllSchematics() {
        const grid = document.getElementById('schematic-grid');
        const countElement = document.getElementById('schematic-count');
        const searchInput = document.getElementById('schematic-search');

        if (!grid || !this.schematicManager) return;

        if (searchInput) {
            searchInput.value = '';
        }

        const allSchematics = this.schematicManager.getStructureSchematics();
        const filtered = Array.from(allSchematics.values()).filter(s =>
            s.planet === false && s.tags && s.tags.length > 0
        );

        if (countElement) {
            countElement.textContent = `${filtered.length} schematic${filtered.length !== 1 ? 's' : ''}`;
        }

        grid.innerHTML = this.renderSchematicCards(filtered);
    }

    /**
     * Search schematics by name or tags
     */
    searchSchematics(query) {
        const grid = document.getElementById('schematic-grid');
        const countElement = document.getElementById('schematic-count');

        if (!grid || !this.schematicManager) return;

        const allSchematics = this.schematicManager.getStructureSchematics();
        const filtered = Array.from(allSchematics.values()).filter(s => {
            if (!s.planet && s.tags && s.tags.length > 0) {
                const searchLower = query.toLowerCase();
                const nameMatch = s.name.toLowerCase().includes(searchLower);
                const tagMatch = s.tags.some(tag => tag.toLowerCase().includes(searchLower));
                const categoryMatch = s.category.toLowerCase().includes(searchLower);
                return nameMatch || tagMatch || categoryMatch;
            }
            return false;
        });

        if (countElement) {
            countElement.textContent = query
                ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${query}"`
                : `${filtered.length} schematic${filtered.length !== 1 ? 's' : ''}`;
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="
                    grid-column: 1 / -1;
                    color: #888888;
                    text-align: center;
                    padding: 60px 20px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px dashed rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                ">
                    <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;">🔍</div>
                    <div style="font-size: 16px; color: #FFD700; margin-bottom: 10px;">No results found</div>
                    <div style="font-size: 13px;">Try a different search term</div>
                </div>
            `;
        } else {
            grid.innerHTML = this.renderSchematicCards(filtered);
        }
    }

    /**
     * Filter schematics by category
     */
    filterSchematicsByCategory(category) {
        console.log(`Filtering schematics by category: ${category}`);

        const grid = document.getElementById('schematic-grid');
        const countElement = document.getElementById('schematic-count');

        if (!grid) return;

        const schematics = this.schematicManager.getSchematicsByCategory(category);

        if (countElement) {
            countElement.textContent = `${schematics.length} schematic${schematics.length !== 1 ? 's' : ''} in ${category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`;
        }

        if (schematics.length === 0) {
            grid.innerHTML = `
                <div style="
                    grid-column: 1 / -1;
                    color: #888888;
                    text-align: center;
                    padding: 60px 20px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px dashed rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                ">
                    <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;">${this.getCategoryIcon(category)}</div>
                    <div style="font-size: 16px; color: #FFD700; margin-bottom: 10px;">No schematics in this category</div>
                    <div style="font-size: 13px;">Try selecting a different category</div>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.renderSchematicCards(schematics);
    }

    /**
     * Render schematic cards
     */
    renderSchematicCards(schematics) {
        return schematics.map(schem => {
            const sizeStr = schem.size
                ? `${schem.size.x}×${schem.size.y}×${schem.size.z}`
                : 'Unknown';

            const previewContent = schem.preview
                ? `<img src="${schem.preview}" alt="${schem.name}" style="
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    image-rendering: pixelated;
                   "/>`
                : `<div style="font-size: 48px; opacity: 0.5;">${this.getCategoryIcon(schem.category)}</div>`;

            return `
                <div class="schematic-card" data-schematic-id="${schem.id}" style="
                    background: linear-gradient(135deg, rgba(0, 255, 255, 0.08) 0%, rgba(0, 200, 200, 0.05) 100%);
                    border: 2px solid rgba(0, 255, 255, 0.3);
                    border-radius: 10px;
                    padding: 12px;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.3s;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                " onmouseover="
                    this.style.background='linear-gradient(135deg, rgba(0, 255, 255, 0.18) 0%, rgba(0, 200, 200, 0.12) 100%)';
                    this.style.borderColor='rgba(0, 255, 170, 0.6)';
                    this.style.transform='translateY(-4px)';
                    this.style.boxShadow='0 6px 20px rgba(0, 255, 255, 0.3)';
                " onmouseout="
                    this.style.background='linear-gradient(135deg, rgba(0, 255, 255, 0.08) 0%, rgba(0, 200, 200, 0.05) 100%)';
                    this.style.borderColor='rgba(0, 255, 255, 0.3)';
                    this.style.transform='translateY(0)';
                    this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.3)';
                " onclick="window.systemGenerator?.previewSchematic('${schem.id}')">
                    <div style="
                        width: 100%;
                        height: 160px;
                        background: linear-gradient(135deg, #000022 0%, #001133 100%);
                        border: 1px solid rgba(0, 51, 68, 0.6);
                        border-radius: 8px;
                        margin-bottom: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                        position: relative;
                        box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5);
                    ">
                        ${previewContent}
                        <div style="
                            position: absolute;
                            bottom: 6px;
                            right: 6px;
                            background: rgba(0, 0, 0, 0.7);
                            padding: 3px 8px;
                            border-radius: 4px;
                            font-size: 10px;
                            color: #888888;
                        ">${sizeStr}</div>
                    </div>
                    <div style="
                        color: #00FF00;
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 6px;
                        text-shadow: 0 0 4px rgba(0, 255, 0, 0.3);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    " title="${schem.name}">${schem.name}</div>
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                        font-size: 11px;
                    ">
                        <span style="color: #888888;">${schem.author || 'Unknown'}</span>
                        ${schem.voxelCount ? `<span style="
                            color: #666666;
                            background: rgba(0, 0, 0, 0.3);
                            padding: 2px 6px;
                            border-radius: 4px;
                        ">${schem.voxelCount} blocks</span>` : ''}
                    </div>
                    <div style="
                        display: flex;
                        flex-wrap: wrap;
                        gap: 4px;
                        justify-content: center;
                        margin-top: 8px;
                    ">
                        ${schem.tags.slice(0, 3).map(tag => `<span style="
                            display: inline-block;
                            padding: 3px 8px;
                            background: rgba(0, 51, 68, 0.6);
                            color: #00FFFF;
                            border: 1px solid rgba(0, 255, 255, 0.3);
                            border-radius: 4px;
                            font-size: 9px;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        ">${tag}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Create schematic thumbnail cards
     */
    createSchematicThumbnails() {
        let schematics = [];

        if (this.schematicManager) {
            const structureSchematics = this.schematicManager.getStructureSchematics();
            schematics = Array.from(structureSchematics.values()).filter(s =>
                s.planet === false && s.tags && s.tags.length > 0
            );
        }

        if (schematics.length === 0) {
            return `
                <div style="
                    grid-column: 1 / -1;
                    color: #888888;
                    text-align: center;
                    padding: 60px 20px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px dashed rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                ">
                    <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;">[BOX]</div>
                    <div style="font-size: 16px; color: #FFD700; margin-bottom: 10px;">No schematics available</div>
                    <div style="font-size: 13px;">Schematics are being generated...</div>
                </div>
            `;
        }

        setTimeout(() => {
            const countElement = document.getElementById('schematic-count');
            if (countElement) {
                countElement.textContent = `${schematics.length} schematic${schematics.length !== 1 ? 's' : ''}`;
            }
        }, 0);

        return this.renderSchematicCards(schematics);
    }
    
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        
        const backBtn = document.getElementById('back-to-menu-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.hide();
                
                if (window.returnToHomepage) {
                    window.returnToHomepage();
                } else {
                    
                    const homepage = document.getElementById('home-page');
                    if (homepage) {
                        homepage.style.display = 'flex';
                    }
                }
            };
        }
        
        
        const mainGenerateBtn = document.getElementById('main-generate-btn');
        if (mainGenerateBtn) {
            mainGenerateBtn.onclick = () => {
                this.generateSystem();
            };
        }
        
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = (e) => {
                
                document.querySelectorAll('.tab-btn').forEach(b => {
                    b.style.background = 'transparent';
                    b.classList.remove('active');
                });
                e.target.style.background = 'rgba(0, 255, 255, 0.2)';
                e.target.classList.add('active');
                
                
                const tab = e.target.dataset.tab;
                this.currentTab = tab;

                switch(tab) {
                    case 'supercluster': this.showSuperclusterTab(); break;
                    case 'system': this.showSystemTab(); break;
                    case 'biomes': this.showBiomesTab(); break;
                    case 'library': this.showLibraryTab(); break;
                }
            };
        });
        
        
        document.querySelectorAll('input[name="defaults-mode"]').forEach(radio => {
            radio.onchange = (e) => {
                this.useGlobalDefaults = e.target.value === 'global';
                document.getElementById('system-status').textContent = 
                    this.useGlobalDefaults ? 'Using Global Defaults' : 'Custom Per-Planet Mode';
            };
        });
        
        
        
        window.systemGenerator = this;
        
        
        
        
        
        
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.onclick = () => {
                this.startExploration();
            };
        }
    }
    
    /**
     * Get schematics to place on planet based on biome frequencies
     */
    getSchematicsForPlanet(planet) {
        const schematics = [];
        
        
        if (!this.schematicManager) {
            console.log('No schematic manager available');
            return schematics;
        }
        
        
        const allSchematics = this.schematicManager.getAllSchematics();
        
        
        const biomes = planet.biomes || planet.biomeDistribution || {};
        
        for (const [biome, weight] of Object.entries(biomes)) {
            if (weight > 0) {
                
                for (const [id, schematic] of allSchematics) {
                    if (schematic.biomes && schematic.biomes.includes(biome)) {
                        
                        const frequency = schematic.frequency || 0.01;
                        if (Math.random() < frequency * weight) {
                            schematics.push({
                                id: schematic.id,
                                name: schematic.name,
                                biome: biome,
                                data: schematic
                            });
                        }
                    }
                }
            }
        }
        
        console.log(`� Selected ${schematics.length} schematics for planet ${planet.name}`);
        return schematics;
    }
    
    /**
     * Remove planet from system (called by PlanetCard)
     */
    removePlanet(planetId) {
        console.log(`� Removing planet: ${planetId}`);
        if (this.systemConfigTab && this.systemConfigTab.removePlanet) {
            this.systemConfigTab.removePlanet(planetId);
        }
    }
    
    /**
     * Set planet preset (called by PlanetCard)
     */
    setPlanetPreset(planetId, presetId) {
        console.log(`� Setting planet ${planetId} to preset: ${presetId}`);
    }

    /**
     * Open terrain painter for planet
     */
    openTerrainPainter(planetId) {
        console.log(`� Opening terrain painter for: ${planetId}`);

        if (!this.systemConfigTab || !this.systemConfigTab.planetCards) {
            console.error("No planet cards available");
            return;
        }

        const planetCard = Array.from(this.systemConfigTab.planetCards.values())
            .find(card => card.planetId === planetId);

        if (!planetCard) {
            console.error(`Planet card not found: ${planetId}`);
            return;
        }

        const planetConfig = planetCard.getConfig();

        this.hide();

        const painter = new TerrainPainterModal(this);
        painter.show(planetConfig);
    }

    /**
     * Preview a schematic (called when clicking schematic card)
     */
    previewSchematic(schematicId) {
        console.log(`� Previewing schematic: ${schematicId}`);

        if (!this.schematicManager) {
            console.error('No schematic manager available');
            return;
        }

        const schematic = this.schematicManager.getSchematic(schematicId);
        if (!schematic) {
            console.error(`Schematic not found: ${schematicId}`);
            return;
        }

        console.log(`� Loaded schematic:`, schematic);
        console.log(`   Name: ${schematic.name}`);
        console.log(`   Category: ${schematic.category}`);
        console.log(`   Tags:`, schematic.tags);
        console.log(`   Size:`, schematic.size);

        if (schematic.generate) {
            const testOrigin = { x: 0, y: 0, z: 0 };
            const microblocks = schematic.generate(testOrigin, 0);
            console.log(`   Generated ${microblocks.length} microblocks`);

            alert(`Schematic: ${schematic.name}\nSize: ${schematic.size.x}x${schematic.size.y}x${schematic.size.z}\nMicroblocks: ${microblocks.length}\nCategory: ${schematic.category}\n\nThis schematic is now available for placement in generated worlds!`);
        }
    }

    /**
     * Add current system configuration to cluster
     */
    addSystemToCluster() {
        console.log('Adding system to cluster...');

        const systemConfig = this.systemConfigTab.getSystemConfig();

        const systemName = systemConfig.star?.name || `System ${this.clusterSystems.length + 1}`;

        const clusterSystem = {
            id: `system_${Date.now()}`,
            name: systemName,
            config: JSON.parse(JSON.stringify(systemConfig)),
            timestamp: Date.now()
        };

        this.clusterSystems.push(clusterSystem);

        console.log(`System "${systemName}" added to cluster. Total systems: ${this.clusterSystems.length}`);
        console.log('Cluster systems:', this.clusterSystems);

        alert(`System "${systemName}" added to cluster!\n\nTotal systems in cluster: ${this.clusterSystems.length}\n\nYou can view and manage systems in the SUPERCLUSTER tab.`);
    }

    /**
     * Load a system from the cluster back into the editor
     */
    loadClusterSystem(systemId) {
        const system = this.clusterSystems.find(s => s.id === systemId);

        if (!system) {
            console.error(`System ${systemId} not found in cluster`);
            return;
        }

        console.log(`Loading system: ${system.name}`);

        if (this.systemConfigTab && this.systemConfigTab.loadConfiguration) {
            this.systemConfigTab.loadConfiguration(system.config);
            this.currentTab = 'system';
            this.showSystemTab();

            const tabBtns = document.querySelectorAll('.tab-btn');
            tabBtns.forEach(btn => {
                btn.style.background = 'transparent';
                btn.classList.remove('active');
                if (btn.dataset.tab === 'system') {
                    btn.style.background = 'rgba(0, 255, 255, 0.2)';
                    btn.classList.add('active');
                }
            });
        }

        console.log(`System "${system.name}" loaded into editor`);
    }

    /**
     * Remove a system from the cluster
     */
    removeClusterSystem(systemId) {
        const system = this.clusterSystems.find(s => s.id === systemId);

        if (!system) {
            console.error(`System ${systemId} not found in cluster`);
            return;
        }

        if (confirm(`Remove "${system.name}" from cluster?`)) {
            this.clusterSystems = this.clusterSystems.filter(s => s.id !== systemId);
            console.log(`System "${system.name}" removed. Remaining systems: ${this.clusterSystems.length}`);
            this.showSuperclusterTab();
        }
    }

    /**
     * Generate system
     */
    async generateSystem() {
        console.log('� Starting system generation... [v3 - All config refs fixed]');
        
        
        const fullConfig = this.systemConfigTab.getSystemConfig();
        console.log('� Full system config:', fullConfig);
        
        
        console.log(' WIRING CHECK:');
        if (fullConfig.planets && fullConfig.planets.length > 0) {
            fullConfig.planets.forEach((p, i) => {
                console.log(`  Planet ${i}: gravity=${p.gravity}, water=${p.waterLevel}, biomes=`, p.biomes);
            });
        }
        
        
        this.settings.systemType = document.getElementById('system-type')?.value || 'standard';
        this.settings.seed = parseInt(document.getElementById('seed')?.value) || Math.floor(Math.random() * 1000000);
        this.settings.starType = fullConfig.star?.type || 'yellow';
        
        this.settings.star = fullConfig.star;
        this.settings.planets = fullConfig.planets;
        this.settings.asteroidBelts = fullConfig.asteroidBelts || [];
        
        
        this.settings.ringworlds = fullConfig.ringworlds || [
            {
                name: 'Test Ringworld',
                radius: 500,        
                width: 100,         
                thickness: 30,      
                rotationSpeed: 0.0005,
                gravityStrength: 9.81,
                enableRimWalls: true,
                wallHeight: 50,
                
                
                
                biomeDistribution: {
                    temperate: 0.5,  
                    barren: 0.5      
                },
                temperature: 288,    
                sunDirection: { x: 0, y: 1, z: 0 }  
            }
        ];
        
        this.settings.features = {
            asteroids: fullConfig.asteroidBelts?.length > 0,
            ringworlds: true  
        };
        
        console.log('� Generating with settings:', this.settings);
        
        const systemEngine = this.engine.unifiedEngine;
        
        if (!systemEngine) {
            console.error(' No unified engine available! Engine:', this.engine);
            return;
        }
        
        console.log(' Using UnifiedSystemEngine to create system...');
        
        
        await systemEngine.createSystem({
            name: this.settings.systemName || 'New System',
            seed: this.settings.seed,
            star: fullConfig.star,
            planets: fullConfig.planets,
            ringworlds: this.settings.ringworlds, 
            asteroidBelts: fullConfig.asteroidBelts,
            asteroidFields: fullConfig.asteroidFields
        });
        
        console.log(' System generation complete!');
        
        
        try {
            this.showLoadingIndicator('Generating system...');
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        } finally {
            this.hideLoadingIndicator();
        }
        
        this.hide();
        
        return systemEngine;
    }
    
    /**
     * Generate using UNIFIED SYSTEM ENGINE
     */
    async generateWithOrbitalSystem() {
        console.log('� Using UNIFIED SYSTEM ENGINE for generation');
        const system = this.engine.systemEngine;
        const config = this.systemConfigTab.getSystemConfig();
        
        
        try {
            const result = await system.createSystem(config);
            console.log(' System created with UNIFIED ENGINE:', result);
        } catch (err) {
            console.error('Failed to create system:', err);
        }
    }
    
    /**
     * Recursively create orbiting bodies
     */
    createOrbitingBodies(system, parentId, children) {
        children.forEach(child => {
            child.parentId = parentId;
            system.createMoon?.(child);
            
            
            if (child.children && child.children.length > 0) {
                this.createOrbitingBodies(system, child.id, child.children);
            }
        });
    }
    
    /**
     * Start exploration
     */
    async startExploration() {
        console.log('� Starting game exploration! [Using UNIFIED SYSTEM ENGINE]');
        console.log('Current system:', this.currentSystem);
        console.log('SystemConfigTab available:', !!this.systemConfigTab);
        
        
        this.hide();
        if (this.container) {
            this.container.style.display = 'none';
            this.container.remove();
        }
        
        const starfield = document.getElementById('menu-starfield-bg');
        if (starfield) {
            starfield.remove();
            console.log('� Removed menu starfield overlay');
        }
        
        if (this.engine) {
            this.engine.worldExists = true;
            this.engine.gameSystemsInitialized = true;
            this.engine.worldLoaded = true;
            
            
            if (this.engine.start) {
                if (!this.engine.isRunning) {
                    console.log('� Starting engine render loop...');
                    this.engine.start();
                } else {
                    console.log(' Engine already running');
                }
            } else {
                console.log(' Engine is GUI-only mode, no start method');
                
                if (window.initEngine) {
                    console.log('� Initializing real engine...');
                    await window.initEngine();
                    
                    if (window.engine) {
                        this.engine = window.engine;
                        if (this.engine.start && !this.engine.isRunning) {
                            this.engine.start();
                        }
                    }
                }
            }
            
            
            let orbitalSystem = this.engine.systemEngine;
            
            if (!orbitalSystem) {
                console.error(' UNIFIED SYSTEM ENGINE not initialized!');
                return;
            }
            
            
            if (orbitalSystem) {
                console.log(' Using UNIFIED SYSTEM ENGINE to spawn planets...');
                const config = this.systemConfigTab?.getSystemConfig() || this.currentSystem || {};
                
                console.log('� Initializing test system with USER config:', config);
                console.log('   - Planets:', config.planets?.length || 0);
                console.log('   - Star:', config.star);
                
                
                if (orbitalSystem.clearAllBodies) {
                    orbitalSystem.clearAllBodies();
                }
                
                
                console.log('� CALLING generateFromConfig WITH COMPLETE CONFIG!');
                
                
                const fullConfig = {
                    star: config.star || { 
                        name: 'Sol', 
                        radius: 40, 
                        temperature: 5778,
                        type: 'yellow',
                        luminosity: 1.0,
                        mass: 1.0
                    },
                    planets: config.planets || [],
                    asteroidBelts: config.asteroidBelts || [],
                    ringworlds: config.ringworlds || [],
                    seed: this.settings.seed,
                    systemType: this.settings.systemType
                };
                
                console.log('� Full config being passed:', fullConfig);
                
                
                orbitalSystem.generateFromConfig(fullConfig);
                
                
                console.log('� Final scene contents:');
                console.log('Total children:', this.engine.scene.children.length);
                let meshCount = 0;
                let groupCount = 0;
                this.engine.scene.traverse((obj) => {
                    if (obj.type === 'Mesh') {
                        meshCount++;
                        console.log(`  - Mesh: ${obj.name || 'unnamed'} at`, obj.position.toArray(), 'visible:', obj.visible);
                    } else if (obj.type === 'Group') {
                        groupCount++;
                        console.log(`  - Group: ${obj.name || 'unnamed'} with ${obj.children.length} children, visible:`, obj.visible);
                    } else if (obj.type === 'InstancedMesh') {
                        console.log(`  - InstancedMesh: ${obj.name || 'unnamed'} with ${obj.count} instances, visible:`, obj.visible);
                    }
                });
                console.log(`Summary: ${meshCount} meshes, ${groupCount} groups in scene`);
                
                
                console.log('� System bodies:', orbitalSystem.bodies?.size || 0);
                console.log('� System planets:', orbitalSystem.planets?.size || 0);
                orbitalSystem.testBodies.forEach((body, id) => {
                    console.log(`  - Body ${id}:`, body.type, 'at', body.position);
                });
                orbitalSystem.testMeshes.forEach((mesh, id) => {
                    console.log(`  - Mesh ${id}:`, mesh.type, 'visible:', mesh.visible);
                });
            }
            
            
            if (this.engine.playerCamera) {
                
                
                this.engine.playerCamera.position.set(
                    60,   
                    30,   
                    60    
                );
                console.log('� Camera positioned at:', this.engine.playerCamera.position.toArray());
                
                
                const dx = 0 - this.engine.playerCamera.position.x;  
                const dy = 0 - this.engine.playerCamera.position.y;
                const dz = 0 - this.engine.playerCamera.position.z;
                const distanceXZ = Math.sqrt(dx*dx + dz*dz);
                
                
                this.engine.yaw = Math.atan2(dx, dz);
                
                
                this.engine.pitch = -Math.atan2(dy, distanceXZ);
                
                
                this.engine.playerCamera.rotation.order = 'YXZ';
                this.engine.playerCamera.rotation.y = this.engine.yaw;
                this.engine.playerCamera.rotation.x = this.engine.pitch;
                
                console.log(`� Camera at (${this.engine.playerCamera.position.x.toFixed(0)}, ${this.engine.playerCamera.position.y.toFixed(0)}, ${this.engine.playerCamera.position.z.toFixed(0)}) looking at star with yaw=${this.engine.yaw.toFixed(2)}, pitch=${this.engine.pitch.toFixed(2)}`);
            }
            
            
            if (!this.engine.playerController && this.engine.initializeSphericalPlayerController) {
                console.log('Initializing player controller...');
                this.engine.initializeSphericalPlayerController();
            }
            
            if (!this.engine.playerBody) {
                console.log('� Creating player physics body...');
                this.engine.createPlayerPhysicsBody();
                
                
                if (this.engine.playerBody && this.engine.playerCamera) {
                    this.engine.playerBody.position.set(
                        this.engine.playerCamera.position.x,
                        this.engine.playerCamera.position.y,
                        this.engine.playerCamera.position.z
                    );
                    console.log('� Physics body synced with camera at:', this.engine.playerCamera.position.toArray());
                }
            }
            
            
            if (this.engine.playerController) {
                this.engine.playerController.inSpace = true;
                this.engine.playerController.onPlanet = false;
                this.engine.moveState.inSpace = true;
            }
            
            
            this.engine.paused = false;
            
            
            this.engine.orbitalTestEnabled = true;
            this.engine.systemInfoVisible = true;
            
            
            const clickPrompt = document.createElement('div');
            clickPrompt.id = 'click-to-play';
            clickPrompt.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: #00ff00;
                padding: 30px;
                border: 2px solid #00ff00;
                border-radius: 10px;
                font-family: monospace;
                font-size: 20px;
                text-align: center;
                z-index: 10000;
                cursor: pointer;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
            `;
            clickPrompt.innerHTML = `
                <h2 style="margin: 0 0 20px 0; color: #00ff00;">� SYSTEM READY</h2>
                <p style="margin: 10px 0;">Click to enter universe</p>
                <p style="font-size: 14px; color: #88ff88;">WASD=move | Space=jump | Q/E=orbit</p>
            `;
            document.body.appendChild(clickPrompt);
            
            
            clickPrompt.onclick = () => {
                document.body.requestPointerLock();
                clickPrompt.remove();
                
                
                if (this.engine.crosshairs) {
                    this.engine.crosshairs.style.display = 'block';
                }
                
                
                if (this.engine.showNotification) {
                    this.engine.showNotification(
                        '� WASD=move | Space=jump | O=orbits | G=gravity | Q/E=orbit control',
                        'rgba(0, 255, 0, 0.9)'
                    );
                }
            };
            
            console.log(' Game started! You can now explore!');
        }
    }
    
    /**
     * Create planet impostor (lightweight sphere) instead of full voxels
     * Following the architecture: start with impostor, generate voxels on approach
     */
    createPlanetImpostor(planetConfig, index) {
        if (!this.engine.scene || !THREE) return;
        
        
        const geometry = new THREE.SphereGeometry(planetConfig.radius || 20, 16, 16);
        
        
        const colors = {
            'desert': 0xF4A460,
            'forest': 0x228B22,
            'ocean': 0x4169E1,
            'ice': 0xE0FFFF,
            'lava': 0xFF4500,
            'temperate': 0x90EE90
        };
        
        const biomeType = planetConfig.biomes?.[0]?.type || 'temperate';
        const color = colors[biomeType] || 0x888888;
        
        
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.02, 
            shininess: 50,
            specular: 0x111111, 
            
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(planetConfig.position);
        mesh.userData = {
            type: 'planet',
            id: planetConfig.id,
            schematicId: planetConfig.id,
            isImpostor: true,
            willGenerateVoxels: true,
            schematic: planetConfig 
        };
        
        
        planetConfig.baseColor = new THREE.Color(color);
        planetConfig.mesh = mesh; 
        
        
        if (planetConfig.hasRings) {
            planetConfig.ringRotation = new THREE.Quaternion();
            
            const ringGeometry = new THREE.RingGeometry(
                (planetConfig.radius || 20) * 1.5,
                (planetConfig.radius || 20) * 2.5,
                32
            );
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0xC4B5A0, 
                side: THREE.DoubleSide,
                opacity: 0.4,
                transparent: true
            });
            const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
            ringMesh.rotation.x = Math.PI / 2;
            mesh.add(ringMesh);
            planetConfig.ringMesh = ringMesh;
        }
        
        
        this.engine.scene.add(mesh);
        
        
        if (this.engine.defaultStarSystem) {
            this.engine.defaultStarSystem.testBodies.set(planetConfig.id, planetConfig);
            this.engine.defaultStarSystem.testMeshes.set(planetConfig.id, mesh);
        }
        
        
        if (this.megachunkManager) {
            this.megachunkManager.addPhysicsBody({
                id: planetConfig.id,
                type: 'planet',
                position: planetConfig.position,
                velocity: planetConfig.velocity || { x: 0, y: 0, z: 0 },
                mass: planetConfig.mass || 1000,
                collisionShape: { radius: planetConfig.radius || 20 }
            });
        }
        
        
        
        console.log(`Created impostor for ${planetConfig.name} - voxels will generate on approach`);
    }
    
    /**
     * Show click to play overlay for pointer lock
     */
    showClickToPlayOverlay() {
        
        const existing = document.getElementById('click-to-play-overlay');
        if (existing) existing.remove();
        
        
        const overlay = document.createElement('div');
        overlay.id = 'click-to-play-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            cursor: pointer;
        `;
        
        overlay.innerHTML = `
            <div style="
                text-align: center;
                color: white;
                font-family: 'Orbitron', monospace;
            ">
                <h1 style="font-size: 48px; margin-bottom: 20px; color: #00FF00;">
                    � CLICK TO START EXPLORING
                </h1>
                <p style="font-size: 20px; color: #00FFFF;">
                    Click anywhere to capture mouse and begin
                </p>
                <div style="margin-top: 30px; font-size: 16px; color: #FFD700;">
                    <p>WASD = Move | Mouse = Look | Space/Shift = Up/Down</p>
                    <p>O = Orbits | G = Gravity | Q/E = Orbital Controls</p>
                </div>
            </div>
        `;
        
        
        overlay.onclick = () => {
            document.body.requestPointerLock();
            overlay.remove();
        };
        
        document.body.appendChild(overlay);
    }
    
    /**
     * Hide menu
     */
    hide() {
        if (this.menuElement) {
            this.menuElement.style.display = 'none';
        }

        this.detachPreviewRenderer();
    }
    
    /**
     * Load saved worlds
     */
    loadSavedWorlds() {
        
        try {
            const saved = localStorage.getItem('polymir-saved-systems');
            if (saved) {
                this.savedSystems = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load saved systems:', e);
        }
    }
    
    /**
     * Initialize lighting systems with megachunk integration
     */
    initializeLightingSystems() {
        
        this.megachunkManager = new PhysicsManager({
            activationDistance: 1000,
            deactivationDistance: 1500,
            railsUpdateInterval: 30000, 
            quantumUpdateInterval: 16 
        });
        
        
        this.starLightingSystem = new StarLightingSystem({
            maxActiveLights: 4,
            transitionSpeed: 0.02,
            skyboxUpdateInterval: 30000,
            activationRadius: 5000,
            deactivationRadius: 6000
        });
        
        this.starLightingSystem.initialize(this.engine.scene, this.megachunkManager);
        
        
        window.starLightingSystem = this.starLightingSystem;
        window.megachunkManager = this.megachunkManager;
        
        
        this.startLightingUpdateLoop();
        
        console.log('Lighting systems initialized with megachunk integration');
    }
    
    /**
     * Start lighting update loop integrated with megachunk system
     */
    startLightingUpdateLoop() {
        let lastTime = performance.now();
        
        const updateLighting = () => {
            const currentTime = performance.now();
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;
            
            
            if (this.engine.camera) {
                this.starLightingSystem.updatePlayerPosition(this.engine.camera.position);
                this.megachunkManager.setPlayerPosition(this.engine.camera.position);
            }
            
            
            this.megachunkManager.update(deltaTime);
            
            
            this.starLightingSystem.update(deltaTime);
            
            
            if (this.engine.defaultStarSystem) {
                for (const [planetId, planet] of this.engine.defaultStarSystem.testBodies) {
                    if (planet.mesh) {
                        this.starLightingSystem.updatePlanetLighting(planet, deltaTime);
                    }
                }
            }
            
            requestAnimationFrame(updateLighting);
        };
        
        updateLighting();
        console.log('Started lighting update loop with megachunk integration');
    }
}

export { SystemGeneratorMenuEnhanced };
export { SystemGeneratorMenuEnhanced as UniverseCreationModal };