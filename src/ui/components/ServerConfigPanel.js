/**
 * ServerConfigPanel - GUI for configuring server-side world generation
 *
 * Configures:
 * - Supercluster hierarchy (galaxies, systems, bodies)
 * - Body generation parameters (types, biomes, layers)
 * - Collision prevention and spacing
 * - Lazy-loading generation radii
 * - Seed management for deterministic generation
 */

import { GravitationalShapeConfig, GravitationalShapes } from '../../config/GravitationalShapeConfig.js';
import { BiomeConfiguration } from '../../config/BiomeConfiguration.js';

export class ServerConfigPanel {
    constructor(options = {}) {
        this.container = options.container || null;
        this.onConfigChanged = options.onConfigChanged || null;

        // Master seed for all procedural generation
        this.masterSeed = options.masterSeed || Math.floor(Math.random() * 2147483647);

        // Supercluster configuration
        this.superclusterConfig = {
            name: 'Laniakea',
            seed: this.masterSeed,

            // Hierarchy counts
            galaxyCount: 10,
            systemsPerGalaxy: { min: 50, max: 200 },
            bodiesPerSystem: { min: 2, max: 12 },

            // Spatial distribution
            superclusterRadius: 100000,  // Units
            galaxySpacing: 8000,         // Minimum between galaxy centers
            systemSpacing: 500,          // Minimum between system centers

            // Body type probabilities (must sum to 1.0)
            bodyTypeProbabilities: {
                terrestrial: 0.45,    // Standard voxel planets
                gasGiant: 0.15,       // Impostor-only gas giants
                ringworld: 0.05,      // Toroidal ringworlds
                icePlanet: 0.15,      // Ice worlds
                lavaPlanet: 0.10,     // Volcanic worlds
                barren: 0.10          // Barren rocky worlds
            }
        };

        // Generation zone radii (in chunks)
        this.generationZones = {
            // Pre-generation: generate terrain before player arrives
            preGenerationRadius: 64,    // Chunks ahead of player to generate

            // Active: full terrain detail with biomes
            activeRadius: 32,           // Full detail generation

            // Core-only: past this, use fast core layer generation
            coreOnlyRadius: 128,        // Beyond this, only core layers

            // Unload: remove chunks from memory
            unloadRadius: 256           // Chunks to keep loaded
        };

        // Default body generation parameters
        this.bodyDefaults = {
            // Layer configuration template
            layers: [
                { name: 'inner_core', depthRange: [0, 0.2], voxelType: 7, mode: 'uniform' },
                { name: 'outer_core', depthRange: [0.2, 0.4], voxelType: 6, mode: 'uniform' },
                { name: 'mantle', depthRange: [0.4, 0.85], voxelType: 1, mode: 'simple' },
                { name: 'crust', depthRange: [0.85, 1.0], voxelType: 'biome', mode: 'full' }
            ],

            // Terrain bounds
            terrainMinHeight: -15,
            terrainMaxHeight: 50,
            waterLevel: 100,  // Percentage of radius

            // Size ranges by body type
            sizeRanges: {
                terrestrial: { min: 80, max: 200 },
                gasGiant: { min: 300, max: 800 },
                ringworld: { majorRadius: { min: 300, max: 600 }, minorRadius: { min: 60, max: 150 } },
                icePlanet: { min: 60, max: 180 },
                lavaPlanet: { min: 50, max: 150 },
                barren: { min: 30, max: 100 }
            }
        };

        // Collision prevention settings
        this.collisionSettings = {
            // Orbital spacing multiplier (gravity radius * this = minimum spacing)
            orbitalSpacingMultiplier: 2.5,

            // Gravity radius calculation (planet radius * this = gravity influence)
            gravityRadiusMultiplier: 0.6,

            // System capture zone multiplier
            systemCaptureMultiplier: 1.15
        };

        // Biome configuration (uses existing BiomeConfiguration)
        this.biomeConfig = new BiomeConfiguration({
            seed: this.masterSeed
        });

        // UI state
        this.isVisible = false;
        this.activeSection = 'hierarchy';

        // Build UI if container provided
        if (this.container) {
            this.build();
        }
    }

    /**
     * Generate a deterministic seed from master seed and identifier
     */
    generateSeed(identifier) {
        let hash = this.masterSeed;
        for (let i = 0; i < identifier.length; i++) {
            hash = ((hash << 5) - hash) + identifier.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Generate galaxy seed from position
     */
    getGalaxySeed(galaxyIndex) {
        return this.generateSeed(`galaxy_${galaxyIndex}`);
    }

    /**
     * Generate system seed from galaxy and system indices
     */
    getSystemSeed(galaxyIndex, systemIndex) {
        return this.generateSeed(`galaxy_${galaxyIndex}_system_${systemIndex}`);
    }

    /**
     * Generate body seed from full hierarchy
     */
    getBodySeed(galaxyIndex, systemIndex, bodyIndex) {
        return this.generateSeed(`galaxy_${galaxyIndex}_system_${systemIndex}_body_${bodyIndex}`);
    }

    /**
     * Generate body parameters from seed
     * Returns complete configuration for generating a celestial body
     */
    generateBodyParams(galaxyIndex, systemIndex, bodyIndex) {
        const seed = this.getBodySeed(galaxyIndex, systemIndex, bodyIndex);
        const rng = this.seededRandom(seed);

        // Determine body type based on probabilities
        const bodyType = this.selectBodyType(rng);

        // Generate size based on type
        const size = this.generateBodySize(bodyType, rng);

        // Generate orbital parameters
        const orbital = this.generateOrbitalParams(bodyIndex, rng);

        // Generate biome distribution for this body
        const biomeDistribution = this.generateBiomeDistribution(bodyType, rng);

        // Generate layer configuration
        const layers = this.generateLayerConfig(bodyType);

        // Create gravitational shape config
        const gravityShape = this.createGravityShape(bodyType, size);

        return {
            seed,
            bodyType,
            size,
            orbital,
            biomeDistribution,
            layers,
            gravityShape: gravityShape.serialize(),
            terrainMinHeight: this.bodyDefaults.terrainMinHeight,
            terrainMaxHeight: this.bodyDefaults.terrainMaxHeight,
            waterLevel: bodyType === 'icePlanet' ? 120 :
                        bodyType === 'lavaPlanet' ? 0 :
                        this.bodyDefaults.waterLevel,
            // Metadata
            galaxyIndex,
            systemIndex,
            bodyIndex,
            generated: false,  // Flag for lazy loading
            generatedChunks: 0
        };
    }

    /**
     * Seeded random number generator
     */
    seededRandom(seed) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    /**
     * Select body type based on configured probabilities
     */
    selectBodyType(rng) {
        const roll = rng();
        let cumulative = 0;

        for (const [type, probability] of Object.entries(this.superclusterConfig.bodyTypeProbabilities)) {
            cumulative += probability;
            if (roll <= cumulative) {
                return type;
            }
        }

        return 'terrestrial'; // Fallback
    }

    /**
     * Generate body size based on type
     */
    generateBodySize(bodyType, rng) {
        const range = this.bodyDefaults.sizeRanges[bodyType];

        if (bodyType === 'ringworld') {
            return {
                majorRadius: range.majorRadius.min + rng() * (range.majorRadius.max - range.majorRadius.min),
                minorRadius: range.minorRadius.min + rng() * (range.minorRadius.max - range.minorRadius.min)
            };
        }

        return {
            radius: range.min + rng() * (range.max - range.min)
        };
    }

    /**
     * Generate orbital parameters
     */
    generateOrbitalParams(bodyIndex, rng) {
        // Base orbital radius increases with body index
        const baseRadius = 150 + bodyIndex * 100;
        const variation = rng() * 50 - 25;

        return {
            radius: baseRadius + variation,
            period: Math.pow(baseRadius / 100, 1.5) * 365,  // Kepler's third law approximation
            inclination: (rng() - 0.5) * 10,  // -5 to +5 degrees
            eccentricity: rng() * 0.1,  // 0 to 0.1
            phase: rng() * Math.PI * 2  // Starting position
        };
    }

    /**
     * Generate biome distribution for body type
     */
    generateBiomeDistribution(bodyType, rng) {
        const distributions = {
            terrestrial: {
                grassland: 20 + rng() * 10,
                forest: 15 + rng() * 10,
                ocean: 20 + rng() * 15,
                desert: 10 + rng() * 10,
                mountains: 10 + rng() * 5,
                ice: 5 + rng() * 5
            },
            gasGiant: {
                // Gas giants don't have biomes, but store atmospheric data
                atmosphere: 100
            },
            ringworld: {
                grassland: 25 + rng() * 10,
                forest: 20 + rng() * 10,
                ocean: 15 + rng() * 10,
                desert: 15 + rng() * 10,
                mountains: 15 + rng() * 5
            },
            icePlanet: {
                ice: 60 + rng() * 20,
                mountains: 20 + rng() * 10,
                ocean: 10 + rng() * 10
            },
            lavaPlanet: {
                lava: 50 + rng() * 20,
                volcanic: 30 + rng() * 10,
                mountains: 10 + rng() * 10
            },
            barren: {
                desert: 50 + rng() * 20,
                mountains: 30 + rng() * 15,
                void: 10 + rng() * 10
            }
        };

        return distributions[bodyType] || distributions.terrestrial;
    }

    /**
     * Generate layer configuration based on body type
     */
    generateLayerConfig(bodyType) {
        if (bodyType === 'gasGiant') {
            // Gas giants are impostor-only, no layers
            return [];
        }

        if (bodyType === 'ringworld') {
            return [
                { name: 'structural_core', depthRange: [0, 0.5], voxelType: 7, mode: 'uniform' },
                { name: 'foundation', depthRange: [0.5, 0.85], voxelType: 1, mode: 'simple' },
                { name: 'surface', depthRange: [0.85, 1.0], voxelType: 'biome', mode: 'full' }
            ];
        }

        // Standard planetary layers
        return [...this.bodyDefaults.layers];
    }

    /**
     * Create gravitational shape configuration
     */
    createGravityShape(bodyType, size) {
        if (bodyType === 'ringworld') {
            return GravitationalShapes.ringworld(
                { x: 0, y: 0, z: 0 },
                size.majorRadius,
                size.minorRadius
            );
        }

        // All other types use point/sphere gravity
        return GravitationalShapes.sphere(
            { x: 0, y: 0, z: 0 },
            size.radius
        );
    }

    /**
     * Calculate minimum spacing between two bodies
     */
    calculateMinSpacing(body1Params, body2Params) {
        const getGravityRadius = (params) => {
            if (params.bodyType === 'ringworld') {
                return params.size.majorRadius + params.size.minorRadius;
            }
            return params.size.radius * this.collisionSettings.gravityRadiusMultiplier;
        };

        const gr1 = getGravityRadius(body1Params);
        const gr2 = getGravityRadius(body2Params);

        return (gr1 + gr2) * this.collisionSettings.orbitalSpacingMultiplier;
    }

    /**
     * Validate and adjust orbital positions to prevent collisions
     */
    validateOrbitalSpacing(systemBodies) {
        // Sort by orbital radius
        systemBodies.sort((a, b) => a.orbital.radius - b.orbital.radius);

        for (let i = 1; i < systemBodies.length; i++) {
            const minSpacing = this.calculateMinSpacing(systemBodies[i - 1], systemBodies[i]);
            const currentSpacing = systemBodies[i].orbital.radius - systemBodies[i - 1].orbital.radius;

            if (currentSpacing < minSpacing) {
                // Push this body outward
                systemBodies[i].orbital.radius = systemBodies[i - 1].orbital.radius + minSpacing;
            }
        }

        return systemBodies;
    }

    /**
     * Generate complete system configuration
     */
    generateSystemConfig(galaxyIndex, systemIndex) {
        const systemSeed = this.getSystemSeed(galaxyIndex, systemIndex);
        const rng = this.seededRandom(systemSeed);

        // Determine number of bodies
        const bodyCount = Math.floor(
            this.superclusterConfig.bodiesPerSystem.min +
            rng() * (this.superclusterConfig.bodiesPerSystem.max - this.superclusterConfig.bodiesPerSystem.min)
        );

        // Generate all bodies
        const bodies = [];
        for (let i = 0; i < bodyCount; i++) {
            bodies.push(this.generateBodyParams(galaxyIndex, systemIndex, i));
        }

        // Validate spacing
        const validatedBodies = this.validateOrbitalSpacing(bodies);

        // Calculate system capture radius
        const farthestBody = validatedBodies[validatedBodies.length - 1];
        const farthestGravityRadius = farthestBody.bodyType === 'ringworld'
            ? farthestBody.size.majorRadius + farthestBody.size.minorRadius
            : farthestBody.size.radius * this.collisionSettings.gravityRadiusMultiplier;

        const captureRadius = (farthestBody.orbital.radius + farthestGravityRadius) *
                              this.collisionSettings.systemCaptureMultiplier;

        // Generate star parameters
        const starType = this.generateStarType(rng);

        return {
            seed: systemSeed,
            galaxyIndex,
            systemIndex,
            starType,
            captureRadius,
            bodies: validatedBodies,
            position: {
                x: (rng() - 0.5) * this.superclusterConfig.galaxySpacing,
                y: (rng() - 0.5) * this.superclusterConfig.galaxySpacing * 0.1,
                z: (rng() - 0.5) * this.superclusterConfig.galaxySpacing
            }
        };
    }

    /**
     * Generate star type based on probability
     */
    generateStarType(rng) {
        const types = [
            { type: 'yellow', temp: 5778, probability: 0.35 },
            { type: 'red', temp: 3500, probability: 0.30 },
            { type: 'orange', temp: 4500, probability: 0.20 },
            { type: 'white', temp: 8000, probability: 0.10 },
            { type: 'blue', temp: 15000, probability: 0.05 }
        ];

        const roll = rng();
        let cumulative = 0;

        for (const star of types) {
            cumulative += star.probability;
            if (roll <= cumulative) {
                return { type: star.type, temperature: star.temp };
            }
        }

        return { type: 'yellow', temperature: 5778 };
    }

    /**
     * Serialize full configuration for storage/transmission
     */
    serialize() {
        return {
            masterSeed: this.masterSeed,
            superclusterConfig: this.superclusterConfig,
            generationZones: this.generationZones,
            bodyDefaults: this.bodyDefaults,
            collisionSettings: this.collisionSettings,
            biomeConfig: this.biomeConfig.serialize()
        };
    }

    /**
     * Deserialize configuration
     */
    static deserialize(data) {
        const panel = new ServerConfigPanel({ masterSeed: data.masterSeed });
        panel.superclusterConfig = data.superclusterConfig;
        panel.generationZones = data.generationZones;
        panel.bodyDefaults = data.bodyDefaults;
        panel.collisionSettings = data.collisionSettings;
        panel.biomeConfig = BiomeConfiguration.deserialize(data.biomeConfig);
        return panel;
    }

    /**
     * Build the UI
     */
    build() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.className = 'server-config-panel';

        // Inject styles
        this.injectStyles();

        // Create header
        const header = this.createHeader();
        this.container.appendChild(header);

        // Create tab navigation
        const tabs = this.createTabNavigation();
        this.container.appendChild(tabs);

        // Create content sections
        const content = document.createElement('div');
        content.className = 'scp-content polymir-scrollable';
        content.id = 'scp-content';
        this.container.appendChild(content);

        // Render active section
        this.renderSection(this.activeSection);

        // Create footer with actions
        const footer = this.createFooter();
        this.container.appendChild(footer);
    }

    /**
     * Inject CSS styles
     */
    injectStyles() {
        if (document.getElementById('server-config-panel-styles')) return;

        const style = document.createElement('style');
        style.id = 'server-config-panel-styles';
        style.textContent = `
            .server-config-panel {
                background: linear-gradient(135deg, rgba(0, 10, 30, 0.95) 0%, rgba(0, 20, 50, 0.95) 100%);
                border: 2px solid #FE0089;
                border-radius: 12px;
                padding: 15px;
                color: #00FF00;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 0 30px rgba(254, 0, 137, 0.3);
            }

            .scp-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid #FE0089;
            }

            .scp-title {
                color: #00FFFF;
                font-size: 16px;
                font-weight: bold;
                text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
            }

            .scp-seed-display {
                color: #FFD700;
                font-size: 11px;
            }

            .scp-tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }

            .scp-tab {
                padding: 8px 12px;
                background: rgba(0, 50, 100, 0.3);
                border: 1px solid #0088FF;
                border-radius: 5px;
                color: #0088FF;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 11px;
            }

            .scp-tab:hover {
                background: rgba(0, 136, 255, 0.2);
                transform: translateY(-1px);
            }

            .scp-tab.active {
                background: linear-gradient(135deg, #FE0089 0%, #0088FF 100%);
                color: white;
                border-color: #FE0089;
            }

            .scp-content {
                flex: 1;
                overflow-y: auto;
                padding-right: 10px;
                min-height: 300px;
                max-height: 500px;
            }

            .scp-section {
                margin-bottom: 20px;
            }

            .scp-section-title {
                color: #FFD700;
                font-size: 13px;
                margin-bottom: 10px;
                padding-bottom: 5px;
                border-bottom: 1px solid rgba(255, 215, 0, 0.3);
            }

            .scp-row {
                display: grid;
                grid-template-columns: 150px 1fr;
                gap: 10px;
                align-items: center;
                margin-bottom: 8px;
            }

            .scp-label {
                color: #888;
                font-size: 11px;
            }

            .scp-input {
                width: 100%;
                padding: 5px 8px;
                background: rgba(0, 20, 40, 0.8);
                border: 1px solid #0088FF;
                border-radius: 4px;
                color: #00FF00;
                font-family: 'Courier New', monospace;
                font-size: 11px;
            }

            .scp-input:focus {
                outline: none;
                border-color: #FE0089;
                box-shadow: 0 0 5px rgba(254, 0, 137, 0.3);
            }

            .scp-range-container {
                display: flex;
                gap: 5px;
                align-items: center;
            }

            .scp-range-input {
                width: 60px;
            }

            .scp-slider {
                flex: 1;
                -webkit-appearance: none;
                height: 6px;
                background: linear-gradient(90deg, #001122 0%, #002244 100%);
                border-radius: 3px;
                border: 1px solid #0088FF;
            }

            .scp-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 14px;
                height: 14px;
                background: linear-gradient(135deg, #FE0089 0%, #0088FF 100%);
                border-radius: 50%;
                cursor: pointer;
                border: 1px solid #FE0089;
            }

            .scp-probability-bar {
                display: flex;
                height: 20px;
                border-radius: 4px;
                overflow: hidden;
                margin: 5px 0;
            }

            .scp-probability-segment {
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                color: white;
                text-shadow: 0 0 2px black;
                transition: width 0.3s;
            }

            .scp-footer {
                display: flex;
                gap: 10px;
                margin-top: 15px;
                padding-top: 10px;
                border-top: 1px solid #FE0089;
            }

            .scp-btn {
                padding: 8px 16px;
                border: 2px solid;
                border-radius: 5px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
                font-size: 11px;
                font-weight: bold;
                transition: all 0.2s;
            }

            .scp-btn-primary {
                background: linear-gradient(135deg, #FE0089 0%, #CC0066 100%);
                border-color: #FE0089;
                color: white;
            }

            .scp-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(254, 0, 137, 0.4);
            }

            .scp-btn-secondary {
                background: rgba(0, 136, 255, 0.2);
                border-color: #0088FF;
                color: #0088FF;
            }

            .scp-btn-secondary:hover {
                background: rgba(0, 136, 255, 0.3);
            }

            .scp-preview-box {
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid #0088FF;
                border-radius: 5px;
                padding: 10px;
                margin-top: 10px;
                font-size: 10px;
                max-height: 150px;
                overflow-y: auto;
            }

            .scp-preview-title {
                color: #00FFFF;
                margin-bottom: 5px;
            }

            .scp-layer-item {
                display: grid;
                grid-template-columns: 100px 80px 80px 1fr;
                gap: 8px;
                padding: 5px;
                margin-bottom: 5px;
                background: rgba(0, 50, 100, 0.2);
                border-radius: 4px;
                align-items: center;
            }

            .scp-color-preview {
                width: 20px;
                height: 20px;
                border-radius: 3px;
                border: 1px solid #0088FF;
            }

            /* Scrollbar styling */
            .scp-content::-webkit-scrollbar {
                width: 8px;
            }

            .scp-content::-webkit-scrollbar-track {
                background: rgba(0, 20, 40, 0.5);
                border-radius: 4px;
            }

            .scp-content::-webkit-scrollbar-thumb {
                background: linear-gradient(135deg, #FE0089 0%, #0088FF 100%);
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Create header element
     */
    createHeader() {
        const header = document.createElement('div');
        header.className = 'scp-header';
        header.innerHTML = `
            <div class="scp-title">Server World Configuration</div>
            <div class="scp-seed-display">
                Master Seed: <span id="scp-master-seed">${this.masterSeed}</span>
                <button class="scp-btn scp-btn-secondary" style="padding: 2px 8px; margin-left: 10px;"
                        onclick="window.serverConfigPanel.randomizeSeed()">Randomize</button>
            </div>
        `;
        return header;
    }

    /**
     * Create tab navigation
     */
    createTabNavigation() {
        const tabs = document.createElement('div');
        tabs.className = 'scp-tabs';

        const sections = [
            { id: 'hierarchy', label: 'Hierarchy' },
            { id: 'bodies', label: 'Body Types' },
            { id: 'biomes', label: 'Biomes' },
            { id: 'zones', label: 'Gen Zones' },
            { id: 'preview', label: 'Preview' }
        ];

        for (const section of sections) {
            const tab = document.createElement('div');
            tab.className = `scp-tab ${this.activeSection === section.id ? 'active' : ''}`;
            tab.textContent = section.label;
            tab.onclick = () => this.switchSection(section.id);
            tabs.appendChild(tab);
        }

        return tabs;
    }

    /**
     * Create footer with action buttons
     */
    createFooter() {
        const footer = document.createElement('div');
        footer.className = 'scp-footer';
        footer.innerHTML = `
            <button class="scp-btn scp-btn-primary" onclick="window.serverConfigPanel.generatePreview()">
                Generate Preview
            </button>
            <button class="scp-btn scp-btn-secondary" onclick="window.serverConfigPanel.exportConfig()">
                Export Config
            </button>
            <button class="scp-btn scp-btn-secondary" onclick="window.serverConfigPanel.importConfig()">
                Import Config
            </button>
            <button class="scp-btn scp-btn-secondary" onclick="window.serverConfigPanel.resetDefaults()">
                Reset Defaults
            </button>
        `;
        return footer;
    }

    /**
     * Switch active section
     */
    switchSection(sectionId) {
        this.activeSection = sectionId;

        // Update tab styles
        const tabs = this.container.querySelectorAll('.scp-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.textContent.toLowerCase().includes(sectionId.substring(0, 4)));
        });

        this.renderSection(sectionId);
    }

    /**
     * Render section content
     */
    renderSection(sectionId) {
        const content = document.getElementById('scp-content');
        if (!content) return;

        switch (sectionId) {
            case 'hierarchy':
                content.innerHTML = this.renderHierarchySection();
                break;
            case 'bodies':
                content.innerHTML = this.renderBodiesSection();
                break;
            case 'biomes':
                content.innerHTML = this.renderBiomesSection();
                break;
            case 'zones':
                content.innerHTML = this.renderZonesSection();
                break;
            case 'preview':
                content.innerHTML = this.renderPreviewSection();
                break;
        }

        this.attachEventListeners();
    }

    /**
     * Render hierarchy configuration section
     */
    renderHierarchySection() {
        const cfg = this.superclusterConfig;

        return `
            <div class="scp-section">
                <div class="scp-section-title">Supercluster Settings</div>

                <div class="scp-row">
                    <span class="scp-label">Supercluster Name</span>
                    <input type="text" class="scp-input" id="scp-name" value="${cfg.name}"
                           onchange="window.serverConfigPanel.updateConfig('superclusterConfig.name', this.value)">
                </div>

                <div class="scp-row">
                    <span class="scp-label">Galaxy Count</span>
                    <div class="scp-range-container">
                        <input type="number" class="scp-input scp-range-input" id="scp-galaxy-count"
                               value="${cfg.galaxyCount}" min="1" max="100"
                               onchange="window.serverConfigPanel.updateConfig('superclusterConfig.galaxyCount', parseInt(this.value))">
                        <input type="range" class="scp-slider" min="1" max="100" value="${cfg.galaxyCount}"
                               oninput="document.getElementById('scp-galaxy-count').value = this.value; window.serverConfigPanel.updateConfig('superclusterConfig.galaxyCount', parseInt(this.value))">
                    </div>
                </div>

                <div class="scp-row">
                    <span class="scp-label">Supercluster Radius</span>
                    <input type="number" class="scp-input" value="${cfg.superclusterRadius}"
                           onchange="window.serverConfigPanel.updateConfig('superclusterConfig.superclusterRadius', parseInt(this.value))">
                </div>
            </div>

            <div class="scp-section">
                <div class="scp-section-title">Galaxy Settings</div>

                <div class="scp-row">
                    <span class="scp-label">Systems per Galaxy</span>
                    <div class="scp-range-container">
                        <input type="number" class="scp-input scp-range-input" placeholder="Min" value="${cfg.systemsPerGalaxy.min}"
                               onchange="window.serverConfigPanel.updateConfig('superclusterConfig.systemsPerGalaxy.min', parseInt(this.value))">
                        <span style="color: #888;">to</span>
                        <input type="number" class="scp-input scp-range-input" placeholder="Max" value="${cfg.systemsPerGalaxy.max}"
                               onchange="window.serverConfigPanel.updateConfig('superclusterConfig.systemsPerGalaxy.max', parseInt(this.value))">
                    </div>
                </div>

                <div class="scp-row">
                    <span class="scp-label">Galaxy Spacing</span>
                    <input type="number" class="scp-input" value="${cfg.galaxySpacing}"
                           onchange="window.serverConfigPanel.updateConfig('superclusterConfig.galaxySpacing', parseInt(this.value))">
                </div>
            </div>

            <div class="scp-section">
                <div class="scp-section-title">System Settings</div>

                <div class="scp-row">
                    <span class="scp-label">Bodies per System</span>
                    <div class="scp-range-container">
                        <input type="number" class="scp-input scp-range-input" placeholder="Min" value="${cfg.bodiesPerSystem.min}"
                               onchange="window.serverConfigPanel.updateConfig('superclusterConfig.bodiesPerSystem.min', parseInt(this.value))">
                        <span style="color: #888;">to</span>
                        <input type="number" class="scp-input scp-range-input" placeholder="Max" value="${cfg.bodiesPerSystem.max}"
                               onchange="window.serverConfigPanel.updateConfig('superclusterConfig.bodiesPerSystem.max', parseInt(this.value))">
                    </div>
                </div>

                <div class="scp-row">
                    <span class="scp-label">System Spacing</span>
                    <input type="number" class="scp-input" value="${cfg.systemSpacing}"
                           onchange="window.serverConfigPanel.updateConfig('superclusterConfig.systemSpacing', parseInt(this.value))">
                </div>
            </div>
        `;
    }

    /**
     * Render body types configuration section
     */
    renderBodiesSection() {
        const probs = this.superclusterConfig.bodyTypeProbabilities;
        const sizes = this.bodyDefaults.sizeRanges;

        const typeColors = {
            terrestrial: '#3d8b3d',
            gasGiant: '#DEB887',
            ringworld: '#FFD700',
            icePlanet: '#87CEEB',
            lavaPlanet: '#FF4500',
            barren: '#808080'
        };

        // Build probability bar
        let probBar = '';
        for (const [type, prob] of Object.entries(probs)) {
            const width = prob * 100;
            probBar += `<div class="scp-probability-segment" style="width: ${width}%; background: ${typeColors[type]};">${Math.round(prob * 100)}%</div>`;
        }

        // Build type rows
        let typeRows = '';
        for (const [type, prob] of Object.entries(probs)) {
            const sizeRange = sizes[type];
            const sizeDisplay = type === 'ringworld'
                ? `Major: ${sizeRange.majorRadius.min}-${sizeRange.majorRadius.max}, Minor: ${sizeRange.minorRadius.min}-${sizeRange.minorRadius.max}`
                : `${sizeRange.min} - ${sizeRange.max}`;

            typeRows += `
                <div class="scp-row" style="grid-template-columns: 100px 80px 1fr;">
                    <span class="scp-label" style="color: ${typeColors[type]};">${type}</span>
                    <input type="number" class="scp-input" value="${Math.round(prob * 100)}" min="0" max="100" step="5"
                           onchange="window.serverConfigPanel.updateBodyProbability('${type}', parseInt(this.value) / 100)">
                    <span style="color: #666; font-size: 10px;">${sizeDisplay} units</span>
                </div>
            `;
        }

        return `
            <div class="scp-section">
                <div class="scp-section-title">Body Type Distribution</div>
                <div class="scp-probability-bar">${probBar}</div>
                ${typeRows}
                <div style="color: #888; font-size: 10px; margin-top: 10px;">
                    * Probabilities will be normalized to sum to 100%
                </div>
            </div>

            <div class="scp-section">
                <div class="scp-section-title">Default Layer Configuration</div>
                ${this.renderLayerConfig()}
            </div>

            <div class="scp-section">
                <div class="scp-section-title">Collision Prevention</div>

                <div class="scp-row">
                    <span class="scp-label">Orbital Spacing Mult.</span>
                    <input type="number" class="scp-input" value="${this.collisionSettings.orbitalSpacingMultiplier}" step="0.1"
                           onchange="window.serverConfigPanel.updateConfig('collisionSettings.orbitalSpacingMultiplier', parseFloat(this.value))">
                </div>

                <div class="scp-row">
                    <span class="scp-label">Gravity Radius Mult.</span>
                    <input type="number" class="scp-input" value="${this.collisionSettings.gravityRadiusMultiplier}" step="0.1"
                           onchange="window.serverConfigPanel.updateConfig('collisionSettings.gravityRadiusMultiplier', parseFloat(this.value))">
                </div>
            </div>
        `;
    }

    /**
     * Render layer configuration
     */
    renderLayerConfig() {
        const layers = this.bodyDefaults.layers;

        let html = '<div style="margin-top: 10px;">';

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            html += `
                <div class="scp-layer-item">
                    <input type="text" class="scp-input" value="${layer.name}" style="font-size: 10px;"
                           onchange="window.serverConfigPanel.updateLayer(${i}, 'name', this.value)">
                    <input type="number" class="scp-input" value="${layer.depthRange[0]}" step="0.05" min="0" max="1"
                           onchange="window.serverConfigPanel.updateLayerDepth(${i}, 0, parseFloat(this.value))">
                    <input type="number" class="scp-input" value="${layer.depthRange[1]}" step="0.05" min="0" max="1"
                           onchange="window.serverConfigPanel.updateLayerDepth(${i}, 1, parseFloat(this.value))">
                    <select class="scp-input" onchange="window.serverConfigPanel.updateLayer(${i}, 'mode', this.value)">
                        <option value="uniform" ${layer.mode === 'uniform' ? 'selected' : ''}>Uniform</option>
                        <option value="simple" ${layer.mode === 'simple' ? 'selected' : ''}>Simple</option>
                        <option value="full" ${layer.mode === 'full' ? 'selected' : ''}>Full</option>
                    </select>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    /**
     * Render biomes section
     */
    renderBiomesSection() {
        const dist = this.biomeConfig.getBiomeDistribution();

        const biomeColors = {
            desert: '#C2B280', forest: '#228B22', ocean: '#1E90FF',
            ice: '#E0FFFF', grassland: '#90EE90', mountains: '#808080',
            lava: '#FF4500', crystal: '#9400D3', void: '#1a1a2e',
            toxic: '#7CFC00', temperate: '#32CD32', volcanic: '#B22222'
        };

        let biomeRows = '';
        for (const [biome, weight] of Object.entries(dist)) {
            biomeRows += `
                <div class="scp-row" style="grid-template-columns: 100px 60px 1fr 30px;">
                    <span class="scp-label">${biome}</span>
                    <input type="number" class="scp-input" value="${weight}" min="0" max="100"
                           onchange="window.serverConfigPanel.updateBiomeWeight('${biome}', parseInt(this.value))">
                    <input type="range" class="scp-slider" min="0" max="100" value="${weight}"
                           oninput="this.previousElementSibling.value = this.value; window.serverConfigPanel.updateBiomeWeight('${biome}', parseInt(this.value))">
                    <div class="scp-color-preview" style="background: ${biomeColors[biome] || '#888'};"></div>
                </div>
            `;
        }

        return `
            <div class="scp-section">
                <div class="scp-section-title">Biome Distribution</div>
                ${biomeRows}
            </div>

            <div class="scp-section">
                <div class="scp-section-title">Terrain Generation</div>

                <div class="scp-row">
                    <span class="scp-label">Min Terrain Height</span>
                    <input type="number" class="scp-input" value="${this.bodyDefaults.terrainMinHeight}"
                           onchange="window.serverConfigPanel.updateConfig('bodyDefaults.terrainMinHeight', parseInt(this.value))">
                </div>

                <div class="scp-row">
                    <span class="scp-label">Max Terrain Height</span>
                    <input type="number" class="scp-input" value="${this.bodyDefaults.terrainMaxHeight}"
                           onchange="window.serverConfigPanel.updateConfig('bodyDefaults.terrainMaxHeight', parseInt(this.value))">
                </div>

                <div class="scp-row">
                    <span class="scp-label">Water Level (%)</span>
                    <input type="number" class="scp-input" value="${this.bodyDefaults.waterLevel}" min="0" max="200"
                           onchange="window.serverConfigPanel.updateConfig('bodyDefaults.waterLevel', parseInt(this.value))">
                </div>
            </div>
        `;
    }

    /**
     * Render generation zones section
     */
    renderZonesSection() {
        const zones = this.generationZones;

        return `
            <div class="scp-section">
                <div class="scp-section-title">Generation Zone Radii (in chunks)</div>
                <div style="color: #888; font-size: 10px; margin-bottom: 15px;">
                    These zones determine when and how terrain is generated as players approach.
                </div>

                <div class="scp-row">
                    <span class="scp-label">Pre-Generation</span>
                    <div class="scp-range-container">
                        <input type="number" class="scp-input scp-range-input" value="${zones.preGenerationRadius}"
                               onchange="window.serverConfigPanel.updateConfig('generationZones.preGenerationRadius', parseInt(this.value))">
                        <span style="color: #00FF00; font-size: 10px;">Generate ahead of player</span>
                    </div>
                </div>

                <div class="scp-row">
                    <span class="scp-label">Active Detail</span>
                    <div class="scp-range-container">
                        <input type="number" class="scp-input scp-range-input" value="${zones.activeRadius}"
                               onchange="window.serverConfigPanel.updateConfig('generationZones.activeRadius', parseInt(this.value))">
                        <span style="color: #FFFF00; font-size: 10px;">Full biome + structures</span>
                    </div>
                </div>

                <div class="scp-row">
                    <span class="scp-label">Core-Only</span>
                    <div class="scp-range-container">
                        <input type="number" class="scp-input scp-range-input" value="${zones.coreOnlyRadius}"
                               onchange="window.serverConfigPanel.updateConfig('generationZones.coreOnlyRadius', parseInt(this.value))">
                        <span style="color: #FF8800; font-size: 10px;">Fast core layer only</span>
                    </div>
                </div>

                <div class="scp-row">
                    <span class="scp-label">Unload</span>
                    <div class="scp-range-container">
                        <input type="number" class="scp-input scp-range-input" value="${zones.unloadRadius}"
                               onchange="window.serverConfigPanel.updateConfig('generationZones.unloadRadius', parseInt(this.value))">
                        <span style="color: #FF0000; font-size: 10px;">Remove from memory</span>
                    </div>
                </div>
            </div>

            <div class="scp-preview-box">
                <div class="scp-preview-title">Zone Visualization</div>
                <svg width="100%" height="100" viewBox="0 0 300 100">
                    <!-- Unload zone -->
                    <circle cx="150" cy="50" r="${zones.unloadRadius / 3}" fill="rgba(255,0,0,0.1)" stroke="#FF0000" stroke-width="1"/>
                    <!-- Core-only zone -->
                    <circle cx="150" cy="50" r="${zones.coreOnlyRadius / 3}" fill="rgba(255,136,0,0.1)" stroke="#FF8800" stroke-width="1"/>
                    <!-- Pre-generation zone -->
                    <circle cx="150" cy="50" r="${zones.preGenerationRadius / 3}" fill="rgba(0,255,0,0.1)" stroke="#00FF00" stroke-width="1"/>
                    <!-- Active zone -->
                    <circle cx="150" cy="50" r="${zones.activeRadius / 3}" fill="rgba(255,255,0,0.2)" stroke="#FFFF00" stroke-width="2"/>
                    <!-- Player -->
                    <circle cx="150" cy="50" r="3" fill="#00FFFF"/>
                </svg>
            </div>
        `;
    }

    /**
     * Render preview section
     */
    renderPreviewSection() {
        return `
            <div class="scp-section">
                <div class="scp-section-title">Configuration Preview</div>
                <div style="color: #888; font-size: 10px; margin-bottom: 10px;">
                    Click "Generate Preview" to see sample systems generated with current settings.
                </div>
                <div id="scp-preview-output" class="scp-preview-box" style="max-height: 350px;">
                    <div style="color: #666;">No preview generated yet.</div>
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners after rendering
     */
    attachEventListeners() {
        // Make panel globally accessible for inline handlers
        window.serverConfigPanel = this;
    }

    /**
     * Update nested config value
     */
    updateConfig(path, value) {
        const parts = path.split('.');
        let obj = this;

        for (let i = 0; i < parts.length - 1; i++) {
            obj = obj[parts[i]];
        }

        obj[parts[parts.length - 1]] = value;

        if (this.onConfigChanged) {
            this.onConfigChanged(this.serialize());
        }
    }

    /**
     * Update body type probability and normalize
     */
    updateBodyProbability(type, value) {
        this.superclusterConfig.bodyTypeProbabilities[type] = value;

        // Normalize to sum to 1.0
        const total = Object.values(this.superclusterConfig.bodyTypeProbabilities).reduce((a, b) => a + b, 0);
        if (total > 0) {
            for (const key of Object.keys(this.superclusterConfig.bodyTypeProbabilities)) {
                this.superclusterConfig.bodyTypeProbabilities[key] /= total;
            }
        }

        // Re-render to update display
        this.renderSection('bodies');

        if (this.onConfigChanged) {
            this.onConfigChanged(this.serialize());
        }
    }

    /**
     * Update biome weight
     */
    updateBiomeWeight(biome, weight) {
        this.biomeConfig.setBiomeDistribution(biome, weight);

        if (this.onConfigChanged) {
            this.onConfigChanged(this.serialize());
        }
    }

    /**
     * Update layer property
     */
    updateLayer(index, property, value) {
        if (this.bodyDefaults.layers[index]) {
            this.bodyDefaults.layers[index][property] = value;
        }

        if (this.onConfigChanged) {
            this.onConfigChanged(this.serialize());
        }
    }

    /**
     * Update layer depth range
     */
    updateLayerDepth(index, rangeIndex, value) {
        if (this.bodyDefaults.layers[index]) {
            this.bodyDefaults.layers[index].depthRange[rangeIndex] = value;
        }

        if (this.onConfigChanged) {
            this.onConfigChanged(this.serialize());
        }
    }

    /**
     * Randomize master seed
     */
    randomizeSeed() {
        this.masterSeed = Math.floor(Math.random() * 2147483647);
        this.superclusterConfig.seed = this.masterSeed;
        this.biomeConfig.seed = this.masterSeed;

        const seedDisplay = document.getElementById('scp-master-seed');
        if (seedDisplay) {
            seedDisplay.textContent = this.masterSeed;
        }

        if (this.onConfigChanged) {
            this.onConfigChanged(this.serialize());
        }
    }

    /**
     * Generate and display preview
     */
    generatePreview() {
        const output = document.getElementById('scp-preview-output');
        if (!output) return;

        // Generate a sample system
        const systemConfig = this.generateSystemConfig(0, 0);

        let html = `
            <div class="scp-preview-title">Sample System (Galaxy 0, System 0)</div>
            <div style="margin-bottom: 10px;">
                <span style="color: #FFD700;">Star Type:</span> ${systemConfig.starType.type} (${systemConfig.starType.temperature}K)
            </div>
            <div style="margin-bottom: 10px;">
                <span style="color: #FFD700;">Capture Radius:</span> ${Math.round(systemConfig.captureRadius)} units
            </div>
            <div style="margin-bottom: 10px;">
                <span style="color: #FFD700;">Bodies:</span> ${systemConfig.bodies.length}
            </div>
        `;

        for (const body of systemConfig.bodies) {
            const sizeDisplay = body.bodyType === 'ringworld'
                ? `Major: ${Math.round(body.size.majorRadius)}, Minor: ${Math.round(body.size.minorRadius)}`
                : `Radius: ${Math.round(body.size.radius)}`;

            html += `
                <div style="background: rgba(0,50,100,0.3); padding: 8px; margin: 5px 0; border-radius: 4px; border-left: 3px solid ${this.getBodyTypeColor(body.bodyType)};">
                    <div style="color: ${this.getBodyTypeColor(body.bodyType)}; font-weight: bold;">${body.bodyType}</div>
                    <div style="font-size: 9px; color: #888;">
                        Orbit: ${Math.round(body.orbital.radius)} | ${sizeDisplay} | Seed: ${body.seed}
                    </div>
                </div>
            `;
        }

        output.innerHTML = html;
    }

    /**
     * Get color for body type
     */
    getBodyTypeColor(type) {
        const colors = {
            terrestrial: '#3d8b3d',
            gasGiant: '#DEB887',
            ringworld: '#FFD700',
            icePlanet: '#87CEEB',
            lavaPlanet: '#FF4500',
            barren: '#808080'
        };
        return colors[type] || '#888888';
    }

    /**
     * Export configuration to JSON file
     */
    exportConfig() {
        const config = this.serialize();
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `polymir-server-config-${this.masterSeed}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Import configuration from JSON file
     */
    importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);

                    // Apply imported config
                    this.masterSeed = data.masterSeed;
                    this.superclusterConfig = data.superclusterConfig;
                    this.generationZones = data.generationZones;
                    this.bodyDefaults = data.bodyDefaults;
                    this.collisionSettings = data.collisionSettings;
                    this.biomeConfig = BiomeConfiguration.deserialize(data.biomeConfig);

                    // Rebuild UI
                    this.build();

                    if (this.onConfigChanged) {
                        this.onConfigChanged(this.serialize());
                    }

                    console.log('Configuration imported successfully');
                } catch (err) {
                    console.error('Failed to import configuration:', err);
                    alert('Failed to import configuration: ' + err.message);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    /**
     * Reset to default values
     */
    resetDefaults() {
        if (!confirm('Reset all settings to defaults?')) return;

        const newPanel = new ServerConfigPanel({ container: this.container });

        // Copy properties
        this.masterSeed = newPanel.masterSeed;
        this.superclusterConfig = newPanel.superclusterConfig;
        this.generationZones = newPanel.generationZones;
        this.bodyDefaults = newPanel.bodyDefaults;
        this.collisionSettings = newPanel.collisionSettings;
        this.biomeConfig = newPanel.biomeConfig;

        this.build();

        if (this.onConfigChanged) {
            this.onConfigChanged(this.serialize());
        }
    }

    /**
     * Show the panel
     */
    show() {
        if (this.container) {
            this.container.style.display = 'flex';
            this.isVisible = true;
        }
    }

    /**
     * Hide the panel
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            this.isVisible = false;
        }
    }

    /**
     * Toggle visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

export default ServerConfigPanel;
