import * as THREE from '../lib/three.module.js';
import { SparklesSystem } from './SparklesSystem.js';

export class UniverseCreationModal {
    constructor(engine) {
        this.engine = engine;
        this.menuElement = null;
        this.currentTab = 'system';
        this.currentSystem = null;
        this.planetCustomizers = new Map();
        this.useGlobalDefaults = true;
        this.previewCanvas = null;
        this.previewRenderer = null;
        this.previewAnimating = false;
        this.sparklesCanvas = null;
        this.sparklesSystem = null;

        window.universeCreation = this;
        window.systemGenerator = this;

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

        this.loadingIndicator = null;
    }

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
            z-index: 10001;
            text-align: center;
        `;
        this.loadingIndicator.innerHTML = `
            <div style="margin-bottom: 10px;">${message}</div>
            <div style="width: 100px; height: 4px; background: #333; border-radius: 2px; overflow: hidden;">
                <div style="width: 100%; height: 100%; background: #ff88cc; animation: loading 1s infinite;"></div>
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

    hideLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
    }

    show() {
        if (!this.sparklesSystem) {
            this.createSparklesBackground();
        }

        if (!this.menuElement) {
            this.createMenu();
            this.setupKeyboardHandlers();
        }

        if (this.sparklesCanvas) {
            this.sparklesCanvas.style.display = 'block';
        }
        if (this.sparklesSystem) {
            this.sparklesSystem.resume();
        }

        this.menuElement.style.display = 'block';
    }

    createSparklesBackground() {
        if (this.sparklesCanvas) return;

        this.sparklesCanvas = document.createElement('canvas');
        this.sparklesCanvas.id = 'universe-modal-sparkles';
        this.sparklesCanvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9998;
            pointer-events: none;
        `;

        document.body.appendChild(this.sparklesCanvas);
        this.sparklesSystem = new SparklesSystem(this.sparklesCanvas);
    }

    hide() {
        if (this.menuElement) {
            this.menuElement.style.display = 'none';
        }
        if (this.sparklesCanvas) {
            this.sparklesCanvas.style.display = 'none';
        }
        if (this.sparklesSystem) {
            this.sparklesSystem.pause();
        }
        this.previewAnimating = false;
    }

    setupKeyboardHandlers() {
        this.escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);
    }

    createMenu() {
        const existingMenu = document.getElementById('universe-creation-modal');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.id = 'universe-creation-modal';
        menu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 85vw;
            max-width: 1200px;
            height: auto;
            min-height: 600px;
            max-height: 95vh;
            background: linear-gradient(135deg, rgba(15, 0, 15, 0.95) 0%, rgba(40, 10, 30, 0.95) 100%);
            border: 2px solid #00FFFF;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            font-family: 'Courier New', monospace;
            color: #ff88cc;
            z-index: 10000;
            box-shadow: none;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'padding: 10px; border-bottom: 2px solid #ff0088; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = `
            <button id="back-to-menu-btn" style="
                padding: 8px 15px;
                background: linear-gradient(135deg, #660033 0%, #330022 100%);
                color: #ff88cc;
                border: 1px solid #ff0088;
                border-radius: 5px;
                font-size: 12px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
            ">← Back to Menu</button>
            <h1 style="color: #ff0088; margin: 0; text-shadow: 0 0 10px #ff0088; font-size: 18px;">
                POLYMIR V3 - UNIVERSE CREATION ENGINE
            </h1>
            <div style="width: 100px;"></div>
        `;

        const tabNav = document.createElement('div');
        tabNav.style.cssText = 'display: flex; background: rgba(255, 0, 136, 0.1); border-bottom: 2px solid #ff0088;';
        tabNav.innerHTML = `
            <button class="tab-btn active" data-tab="system" style="flex: 1; padding: 10px; background: rgba(255, 0, 136, 0.2); color: #ff0088; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                UNIVERSE BUILDER
            </button>
            <button class="tab-btn" data-tab="biomes" style="flex: 1; padding: 10px; background: transparent; color: #ff0088; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                BIOME STRUCTURES
            </button>
            <button class="tab-btn" data-tab="library" style="flex: 1; padding: 10px; background: transparent; color: #ff0088; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                SCHEMATIC LIBRARY
            </button>
        `;

        const content = document.createElement('div');
        content.id = 'tab-content';
        content.style.cssText = 'flex: 1; overflow: visible; padding: 12px; position: relative;';

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

    showSystemTab() {
        const content = document.getElementById('tab-content');
        content.innerHTML = this.getSystemTabHTML();
        this.attachSystemTabListeners();
    }

    getSystemTabHTML() {
        return `
            <div style="display: flex; gap: 15px; height: 100%;">
                <div style="width: 300px; background: rgba(0, 255, 255, 0.05); padding: 15px; border-radius: 8px; overflow-y: auto;">
                    <h3 style="color: #00FFFF; margin-bottom: 15px; font-size: 14px;">SYSTEM SETTINGS</h3>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; color: #ff88cc; margin-bottom: 5px; font-size: 12px;">Seed</label>
                        <input type="number" id="system-seed" value="${this.settings.seed}" style="
                            width: 100%;
                            padding: 6px;
                            background: rgba(0, 0, 0, 0.5);
                            border: 1px solid #00FFFF;
                            border-radius: 4px;
                            color: #00FFFF;
                            font-family: 'Courier New', monospace;
                        ">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; color: #ff88cc; margin-bottom: 5px; font-size: 12px;">Planet Count</label>
                        <input type="range" id="planet-count" min="1" max="10" value="${this.settings.planetCount}" style="width: 100%;">
                        <div style="color: #00FFFF; font-size: 12px; text-align: center;" id="planet-count-value">${this.settings.planetCount}</div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; color: #ff88cc; margin-bottom: 5px; font-size: 12px;">
                            <input type="checkbox" id="enable-moons" ${this.settings.enableMoons ? 'checked' : ''}>
                            Enable Moons
                        </label>
                        <label style="display: block; color: #ff88cc; margin-bottom: 5px; font-size: 12px;">
                            <input type="checkbox" id="enable-asteroids" ${this.settings.enableAsteroids ? 'checked' : ''}>
                            Enable Asteroids
                        </label>
                    </div>

                    <button id="generate-system-btn" style="
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #ff0088 0%, #cc0066 100%);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        font-size: 14px;
                        font-weight: bold;
                        cursor: pointer;
                        box-shadow: 0 0 15px rgba(255, 0, 136, 0.5);
                        margin-bottom: 10px;
                    ">GENERATE SYSTEM</button>

                    <button id="start-exploration-btn" style="
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
                        color: black;
                        border: none;
                        border-radius: 5px;
                        font-size: 14px;
                        font-weight: bold;
                        cursor: pointer;
                        box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
                    ">START EXPLORATION</button>
                </div>

                <div style="flex: 1; background: rgba(0, 0, 0, 0.3); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 500px; position: relative; overflow: hidden;">
                    <canvas id="system-preview-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
                </div>
            </div>
        `;
    }

    attachSystemTabListeners() {
        const planetCountSlider = document.getElementById('planet-count');
        const planetCountValue = document.getElementById('planet-count-value');
        const generateBtn = document.getElementById('generate-system-btn');
        const startBtn = document.getElementById('start-exploration-btn');

        if (planetCountSlider) {
            planetCountSlider.addEventListener('input', (e) => {
                this.settings.planetCount = parseInt(e.target.value);
                planetCountValue.textContent = e.target.value;
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateSystem());
        }

        if (startBtn) {
            startBtn.addEventListener('click', () => this.startExploration());
        }

        this.setupPreviewRenderer();
    }

    setupPreviewRenderer() {
        this.previewCanvas = document.getElementById('system-preview-canvas');
        if (!this.previewCanvas) return;

        const parent = this.previewCanvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;

        if (this.previewRenderer) {
            this.previewRenderer.setSize(width, height);
        } else {
            this.previewRenderer = new THREE.WebGLRenderer({ canvas: this.previewCanvas, antialias: true, alpha: true });
            this.previewRenderer.setSize(width, height);
        }

        // Create the loading animation if it doesn't exist
        if (!this.engine.loadingAnimation) {
            import('../rendering/LoadingAnimation.js').then(module => {
                const LoadingAnimation = module.LoadingAnimation;
                this.engine.loadingAnimation = new LoadingAnimation(
                    this.previewRenderer,
                    null,
                    { rotationSpeed: 0.05, rotationTilt: 0.4 }
                );
                // Make planets visible immediately for preview (not waiting for loading)
                this.engine.loadingAnimation.planet.visible = true;
                this.engine.loadingAnimation.orbitPath.visible = true;
            });
        }

        if (!this.previewAnimating) {
            this.previewAnimating = true;
            this.animatePreview();
        }
    }

    animatePreview() {
        if (!this.previewAnimating || !this.menuElement || this.menuElement.style.display === 'none') {
            this.previewAnimating = false;
            return;
        }

        if (this.engine.loadingAnimation && this.previewRenderer) {
            const deltaTime = 0.016;

            // Update the loading animation (rotates sun, orbits planet, updates shaders)
            this.engine.loadingAnimation.update(deltaTime, 0, 0, '');

            // Render the scene with sun and orbiting planet
            this.previewRenderer.render(
                this.engine.loadingAnimation.scene,
                this.engine.loadingAnimation.camera
            );
        }

        requestAnimationFrame(() => this.animatePreview());
    }

    showBiomesTab() {
        const content = document.getElementById('tab-content');
        content.innerHTML = `
            <div style="padding: 10px;">
                <h2 style="color: #FFD700; margin-bottom: 10px; font-size: 14px;">BIOME STRUCTURE CONFIGURATION</h2>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 20px;">
                    ${this.getBiomeCards()}
                </div>
            </div>
        `;
    }

    getBiomeCards() {
        const biomes = ['desert', 'forest', 'ocean', 'grassland', 'mountains', 'tundra'];
        return biomes.map(biome => `
            <div style="
                background: rgba(0, 255, 255, 0.1);
                border: 1px solid #00FFFF;
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
            " onclick="window.universeCreation.openTerrainPainter('${biome}')">
                <h3 style="color: #00FFFF; margin-bottom: 10px; font-size: 13px; text-transform: uppercase;">
                    ${biome}
                </h3>
                <p style="color: #888; font-size: 11px;">Click to edit terrain</p>
            </div>
        `).join('');
    }

    showLibraryTab() {
        const content = document.getElementById('tab-content');
        content.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #FFD700;">
                <h2>SCHEMATIC LIBRARY</h2>
                <p style="color: #888; margin-top: 10px;">Coming soon - browse and import .mvox schematics</p>
            </div>
        `;
    }

    attachEventListeners() {
        const backBtn = document.getElementById('back-to-menu-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.hide());
        }

        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabBtns.forEach(b => {
                    b.style.background = 'transparent';
                    b.classList.remove('active');
                });
                btn.style.background = 'rgba(255, 0, 136, 0.2)';
                btn.classList.add('active');

                const tab = btn.dataset.tab;
                this.currentTab = tab;

                if (tab === 'system') {
                    this.showSystemTab();
                } else if (tab === 'biomes') {
                    this.showBiomesTab();
                } else if (tab === 'library') {
                    this.showLibraryTab();
                }
            });
        });
    }

    async generateSystem() {
        this.showLoadingIndicator('Generating system...');

        await new Promise(resolve => setTimeout(resolve, 1500));

        this.hideLoadingIndicator();
        this.currentSystem = { planets: [] };
    }

    async startExploration() {
        this.hide();
        this.previewAnimating = false;

        document.getElementById('canvas').style.display = 'block';

        this.engine.start();
        await this.engine.initialize();
    }

    openTerrainPainter(biome) {
        alert(`Terrain painter for ${biome} - Coming soon!`);
    }

    dispose() {
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
        }
        if (this.menuElement) {
            this.menuElement.remove();
        }
    }
}
