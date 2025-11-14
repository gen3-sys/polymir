/**
 * POLYMIR V3 - Beautiful System Configuration Tab
 * 
 * Tile-based UI with themed scrollbars and proper layout
 * Integrates new Phase 4-5 features
 */

// Removed broken import - PreviewRenderer doesn't exist
// import { PreviewRenderer } from './PreviewRenderer.js';

// Global function for adding ring worlds (available immediately)
window.addRingWorld = function() {
    if (window.systemConfigTab) {
        window.systemConfigTab.loadPreset('ring');
    } else {
        console.error('System Config Tab not initialized yet. Please try again.');
        // Try again after a short delay
        setTimeout(() => {
            if (window.systemConfigTab) {
                window.systemConfigTab.loadPreset('ring');
            }
        }, 500);
    }
};

export class SystemConfigTabSimplified {
    constructor(systemGenerator) {
        this.generator = systemGenerator;
        this.planets = [];
        this.moons = [];
        this.nextPlanetId = 1;
        this.nextMoonId = 1;
        this.selectedPlanetId = null;
        // this.previewRenderer = new PreviewRenderer(); // Removed - doesn't exist

        // Procedural name generation
        this.planetNamePrefixes = ['Ke', 'Tra', 'Xer', 'Zor', 'Pol', 'Ven', 'Mar', 'Nep', 'Ura', 'Sat'];
        this.planetNameSuffixes = ['ion', 'us', 'on', 'is', 'or', 'an', 'os', 'ar', 'ix', 'yx'];
        
        // Make this available globally for button clicks
        window.systemConfigTab = this;
        
        // Also make the loadPreset function directly available
        window.loadSystemPreset = (presetName) => this.loadPreset(presetName);
        
        // Extended planet presets with new features
        this.planetPresets = {
            'earth': {
                name: 'Terra',
                type: 'terrestrial',
                radius: 20, // blocks
                orbitalRadius: 150, // blocks
                orbitalPeriod: 365,
                rotationPeriod: 24,
                axialTilt: 23.5,
                rotationSpeed: 0.001,
                orbitalSpeed: 0.0003,
                waterLevel: 50,
                waterCoverage: 70,
                terrainAmplitude: 1000,
                hasAtmosphere: true,
                atmosphereComposition: 'earth-like',
                color: '#4169E1',
                icon: '',
                gravity: 1.0,
                mass: 1.0,
                density: 5.5,
                biomes: {
                    ocean: 30,
                    grassland: 20,
                    forest: 20,
                    desert: 10,
                    mountains: 10,
                    ice: 10
                }
            },
            'mars': {
                name: 'Rust',
                type: 'martian',
                radius: 10, // blocks (smaller than Earth)
                orbitalRadius: 228, // blocks
                orbitalPeriod: 687,
                rotationPeriod: 24.6,
                axialTilt: 25,
                rotationSpeed: 0.0012,
                orbitalSpeed: 0.00025,
                waterLevel: 0,
                waterCoverage: 0,
                terrainAmplitude: 2000,
                hasAtmosphere: false,
                color: '#CD5C5C',
                icon: '',
                gravity: 0.38,
                mass: 0.11,
                density: 3.9,
                biomes: {
                    desert: 70,
                    ice: 20,
                    lava: 10
                }
            },
            'jupiter': {
                name: 'Giant',
                type: 'jovian',
                radius: 70, // blocks (gas giant, much larger)
                orbitalRadius: 520, // blocks
                orbitalPeriod: 4333,
                rotationPeriod: 10,
                axialTilt: 3,
                rotationSpeed: 0.003, // Fast rotation
                orbitalSpeed: 0.0001,
                gasGiantOnly: true,
                hasRings: true,
                ringInnerRadius: 85,
                ringOuterRadius: 120,
                color: '#DEB887',
                icon: '',
                gravity: 2.5,
                mass: 318,
                density: 1.3,
                biomes: {
                    grassland: 40,
                    forest: 30,
                    mountains: 20,
                    ocean: 10
                }
            },
            'venus': {
                name: 'Inferno',
                type: 'venusian',
                radius: 19,
                orbitalRadius: 108,
                orbitalPeriod: 225,
                rotationPeriod: -243, // Retrograde
                axialTilt: 177,
                waterLevel: 0,
                waterCoverage: 0,
                terrainAmplitude: 500,
                hasAtmosphere: true,
                atmosphereComposition: 'toxic',
                volcanicActivity: 0.8,
                color: '#FFA500',
                icon: '',
                gravity: 0.9,
                mass: 0.82,
                density: 5.2,
                biomeDistribution: { volcanic: 0.6, desert: 0.3, molten: 0.1 }
            },
            'ice': {
                name: 'Frozen',
                type: 'ice_world',
                radius: 15, // blocks
                orbitalRadius: 400, // blocks (far from star)
                orbitalPeriod: 1000,
                rotationPeriod: 30,
                axialTilt: 45,
                rotationSpeed: 0.0008,
                orbitalSpeed: 0.00008,
                waterLevel: 100,
                waterCoverage: 100,
                terrainAmplitude: 300,
                hasAtmosphere: false,
                hasIceCaps: true,
                color: '#E0FFFF',
                icon: '',
                gravity: 0.5,
                mass: 0.3,
                density: 2.0,
                biomes: {
                    ice: 80,
                    mountains: 15,
                    ocean: 5
                }
            },
            'lava': {
                name: 'Vulcan',
                type: 'lava_world',
                radius: 18, // blocks
                orbitalRadius: 50, // blocks (close to star)
                orbitalPeriod: 88,
                rotationPeriod: 59,
                tidalLocked: true,
                axialTilt: 2,
                rotationSpeed: 0.0005,
                orbitalSpeed: 0.0005,
                waterLevel: -50,
                waterCoverage: 0,
                terrainAmplitude: 3000,
                volcanicActivity: 1.0,
                color: '#FF4500',
                icon: '',
                gravity: 0.6,
                mass: 0.4,
                density: 4.5,
                biomes: {
                    lava: 60,
                    desert: 30,
                    mountains: 10
                }
            },
            'ringworld': {
                name: 'Halo',
                type: 'ringworld',
                worldType: 'ring',
                centeredOnStar: true,
                orbitalRadius: 0,
                radius: 400,
                width: 50,
                spinSpeed: 0.0005,
                artificialGravity: true,
                color: '#FE0089',
                icon: '',
                gravity: 1.0,
                mass: 1000,
                density: 0.1,
                biomeDistribution: { temperate: 0.5, forest: 0.3, grassland: 0.2 },
                ringTerrain: { amplitudeNormalized: 0.4, frequency: 2, octaves: 3 }
            },
            'impossible': {
                name: 'Paradox',
                type: 'impossible_world',
                worldType: 'mobius',
                radius: 30,
                orbitalRadius: 300,
                geometry: 'klein_bottle',
                dimensionCount: 5,
                quantumFlux: 0.7,
                color: '#9400D3',
                icon: '',
                gravity: Math.random() * 2,
                mass: NaN,
                density: Infinity,
                biomeDistribution: { void: 0.5, crystal: 0.5 }
            },
            'ring': {
                name: 'Halo',
                type: 'ringworld',
                worldType: 'ring',
                centeredOnStar: true,
                radius: 150, // blocks (massive ringworld)
                width: 100, // blocks width
                orbitalRadius: 0, // No orbit - centered on star
                rotationSpeed: 0.001,
                orbitalSpeed: 0.0002,
                axialTilt: 0,
                spinSpeed: 0.001,
                artificialGravity: true,
                color: '#FFD700',
                icon: '',
                gravity: 1.0,
                mass: 10000,
                density: 0.01,
                ringTerrain: { amplitudeNormalized: 0.4, frequency: 2, octaves: 3 },
                biomes: {
                    grassland: 35,
                    forest: 30,
                    ocean: 15,
                    desert: 10,
                    mountains: 10
                }
            }
        };
        
        // Toggle states
        this.toggleStates = {
            orbital: false,
            water: false,
            terrain: false,
            atmosphere: false,
            exotic: false
        };
        
        // Asteroid configuration
        this.asteroidConfig = {
            enabled: true,
            count: 30,
            size: 5,
            innerRadius: 250,
            outerRadius: 350,
            comets: false
        };
        
        // Ring & Moon configuration
        this.ringMoonConfig = {
            targetBody: null,
            rings: {
                enabled: false,
                type: 'shader',  // 'shader' or 'voxel'
                innerRadius: 1.5,  // Multiplier of body radius
                outerRadius: 2.5,
                density: 0.8,
                color: '#C4B5A0'
            },
            moons: {
                count: 0,
                size: 5,
                tidalLocked: true
            }
        };

        // Add default planets so the user has something to start with
        // Add planets with proper spacing (2x combined gravity radii)
        // Planet 1: Earth-like
        const earth = {
            ...this.planetPresets['earth'],
            id: this.nextPlanetId++,
            orbitalRadius: 150,
            gravityRadius: 150 * 0.6 // Default to 60% of orbital radius
        };
        this.planets.push(earth);

        // Planet 2: Mars-like
        const mars = {
            ...this.planetPresets['mars'],
            id: this.nextPlanetId++
        };
        // Calculate proper orbit: 2x (earth gravity + mars gravity)
        mars.gravityRadius = 250 * 0.6;
        mars.orbitalRadius = earth.orbitalRadius + (2 * (earth.gravityRadius + mars.gravityRadius));
        this.planets.push(mars);

        // Planet 3: Gas Giant with rings
        const jupiter = {
            ...this.planetPresets['jupiter'],
            id: this.nextPlanetId++,
            hasRings: true,
            ringInnerRadius: 105, // 1.5x planet radius (70 * 1.5)
            ringOuterRadius: 175, // 2.5x planet radius (70 * 2.5)
            ringColor: '#D2691E'
        };
        // Calculate proper orbit: 2x (mars gravity + jupiter gravity)
        jupiter.gravityRadius = 520 * 0.6;
        jupiter.orbitalRadius = mars.orbitalRadius + (2 * (mars.gravityRadius + jupiter.gravityRadius));
        this.planets.push(jupiter);
    }
    
    /**
     * Add custom CSS for beautiful themed scrollbars and tiles
     */
    injectStyles() {
        if (!document.getElementById('polymir-ui-styles')) {
            const style = document.createElement('style');
            style.id = 'polymir-ui-styles';
            style.textContent = `
                /* Themed Scrollbars */
                .polymir-scrollable::-webkit-scrollbar {
                    width: 12px;
                    height: 12px;
                }
                
                .polymir-scrollable::-webkit-scrollbar-track {
                    background: linear-gradient(90deg, #001122 0%, #002244 100%);
                    border: 1px solid #FE0089;
                    border-radius: 6px;
                }
                
                .polymir-scrollable::-webkit-scrollbar-thumb {
                    background: linear-gradient(135deg, #FE0089 0%, #0088FF 100%);
                    border-radius: 6px;
                    border: 1px solid #FE0089;
                    box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
                }
                
                .polymir-scrollable::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(135deg, #FE0089 0%, #00AAFF 100%);
                    box-shadow: 0 0 15px rgba(0, 255, 255, 0.8);
                }
                
                /* Planet Tiles */
                .planet-tile {
                    background: linear-gradient(135deg, rgba(0, 20, 40, 0.9) 0%, rgba(0, 40, 80, 0.9) 100%);
                    border: 2px solid #FE0089;
                    border-radius: 8px;
                    padding: 4px;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(0, 255, 255, 0.2);
                }
                
                .planet-tile:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 8px 25px rgba(0, 255, 255, 0.4);
                    border-color: #00FF00;
                }
                
                .planet-tile::before {
                    content: '';
                    position: absolute;
                    top: -2px;
                    left: -2px;
                    right: -2px;
                    bottom: -2px;
                    background: linear-gradient(45deg, #FE0089, transparent, #00FF00);
                    border-radius: 15px;
                    opacity: 0;
                    z-index: -1;
                    transition: opacity 0.3s;
                }
                
                .planet-tile:hover::before {
                    opacity: 0.3;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 0.3; }
                    50% { transform: scale(1.05); opacity: 0.5; }
                }
                
                /* Toggle Sections */
                .toggle-section {
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 20, 40, 0.5) 100%);
                    border: 1px solid;
                    border-radius: 10px;
                    margin-bottom: 15px;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }
                
                .toggle-header {
                    padding: 4px 6px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.3s ease;
                    font-weight: normal;
                    font-size: 10px;
                }
                
                .toggle-header:hover {
                    background: rgba(0, 255, 255, 0.1);
                }
                
                .toggle-content {
                    max-height: 0;
                    overflow: hidden;
                    transition: max-height 0.5s ease;
                    padding: 0;
                }
                
                .toggle-content.expanded {
                    max-height: 500px;
                    padding: 4px;
                }
                
                /* Beautiful inputs */
                .polymir-input {
                    width: 100%;
                    padding: 1px 2px;
                    background: linear-gradient(135deg, #001122 0%, #002244 100%);
                    color: #00FF00;
                    border: 1px solid #FE0089;
                    border-radius: 5px;
                    transition: all 0.3s ease;
                    font-family: 'Courier New', monospace;
                    font-size: 10px !important;
                }
                
                .polymir-input:focus {
                    outline: none;
                    border-color: #00FF00;
                    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
                    background: linear-gradient(135deg, #002233 0%, #003355 100%);
                }
                
                /* Button hover animations */
                button {
                    transition: all 0.2s ease !important;
                    position: relative;
                    cursor: pointer;
                }
                
                button:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 6px 20px rgba(0, 255, 255, 0.4) !important;
                    filter: brightness(1.3) !important;
                }
                
                button:active {
                    transform: translateY(0) !important;
                    box-shadow: 0 2px 5px rgba(0, 255, 255, 0.2) !important;
                    filter: brightness(0.9) !important;
                }
                
                /* Checkbox and radio animations */
                input[type="checkbox"], input[type="radio"] {
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                input[type="checkbox"]:hover, input[type="radio"]:hover {
                    transform: scale(1.2);
                }
                
                /* Select dropdown hover */
                select {
                    transition: all 0.2s ease !important;
                }
                
                select:hover {
                    border-color: #00FF00 !important;
                    box-shadow: 0 0 5px rgba(0, 255, 0, 0.3) !important;
                }
                
                /* Preset buttons */
                .preset-btn {
                    padding: 12px 20px;
                    border: 2px solid;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-weight: bold;
                    position: relative;
                    overflow: hidden;
                    font-size: 14px;
                }
                
                .preset-btn:hover {
                    transform: scale(1.05);
                    box-shadow: 0 5px 20px rgba(255, 255, 255, 0.3);
                }
                
                .preset-btn::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.3);
                    transform: translate(-50%, -50%);
                    transition: width 0.5s, height 0.5s;
                }
                
                .preset-btn:active::after {
                    width: 200px;
                    height: 200px;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    /**
     * Render the tab content
     */
    render() {
        this.injectStyles();
        
        return `
            <div style="padding: 8px; padding-top: 30px; height: 100%; overflow: visible;">
                <!-- Main layout with right sidebar -->
                <div style="display: flex; gap: 10px; height: 100%;">
                    <!-- Left content area -->
                    <div style="flex: 1; position: relative;">
                        <!-- Top row: Stacked cards and Preview -->
                        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                            <!-- Stacked Star and Asteroid Cards -->
                            <div id="left-stacked-cards" style="display: flex; flex-direction: column; gap: 6px;">
                                <!-- Star Card -->
                                <div class="planet-tile" style="border-color: #FFD700; background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 140, 0, 0.1) 100%); padding: 4px; min-width: 180px; max-width: 180px; height: auto;" data-body-id="star">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <input type="text" value="Sol" class="polymir-input" style="width: 100px; font-size: 10px; padding: 1px 2px;" 
                                   id="star-name" onchange="window.systemConfigTab.updateStar('name', this.value)">
                            <span style="color: #FFD700; font-size: 10px;">STAR</span>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div>
                                <label style="color: #888; font-size: 10px; display: block;">Color: <span id="star-color-label">White</span></label>
                                <input type="range" min="0" max="4" step="0.01" value="2" class="polymir-input"
                                       style="width: 100%;" id="star-color-slider"
                                       oninput="window.systemConfigTab.updateStarColor(parseFloat(this.value))">
                                <div style="display: flex; justify-content: space-between; font-size: 8px; color: #666;">
                                    <span>Red</span>
                                    <span>Orange</span>
                                    <span>White</span>
                                    <span>Blue</span>
                                    <span>Dark</span>
                                </div>
                            </div>
                            <div>
                                <label style="color: #888; font-size: 10px; display: block;">Radius</label>
                                <input type="number" value="60" min="10" max="100" class="polymir-input" style="font-size: 10px; padding: 0px; height: 20px;"
                                       id="star-radius" onchange="window.systemConfigTab.updateStar('radius', parseFloat(this.value))">
                            </div>
                        </div>
                                </div>
                                
                                <!-- Asteroid/Non-Voxel Configuration Card -->
                                <div class="planet-tile" style="border-color: #888888; background: linear-gradient(135deg, rgba(60, 60, 60, 0.1) 0%, rgba(40, 40, 40, 0.1) 100%); padding: 4px; min-width: 180px; max-width: 180px; height: auto;" data-body-id="asteroids">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                    <span style="color: #888888; font-size: 10px; font-weight: bold;">ASTEROIDS</span>
                                    <label style="display: flex; align-items: center; gap: 2px; color: #888; font-size: 10px;">
                                        <input type="checkbox" id="enable-asteroids" checked onchange="window.systemConfigTab.updateAsteroids('enabled', this.checked)">
                                        ON
                                    </label>
                                </div>
                                
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
                                        <div>
                                            <label style="color: #888; font-size: 10px; display: block;">Count</label>
                                            <input type="number" value="30" min="0" max="100" class="polymir-input" style="font-size: 10px; padding: 0px; height: 20px;"
                                                   id="asteroid-count" onchange="window.systemConfigTab.updateAsteroids('count', parseInt(this.value))">
                                        </div>
                                        <div>
                                            <label style="color: #888; font-size: 10px; display: block;">Size</label>
                                            <input type="number" value="5" min="1" max="20" class="polymir-input" style="font-size: 10px; padding: 0px; height: 20px;"
                                                   id="asteroid-size" onchange="window.systemConfigTab.updateAsteroids('size', parseFloat(this.value))">
                                        </div>
                                    </div>
                                    <div>
                                        <label style="color: #888; font-size: 10px; display: block;">Belt Range</label>
                                        <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 2px; align-items: center;">
                                            <input type="number" value="250" min="100" max="500" class="polymir-input" style="font-size: 10px; padding: 0px; height: 20px;"
                                                   id="asteroid-inner" onchange="window.systemConfigTab.updateAsteroids('innerRadius', parseFloat(this.value))">
                                            <span style="color: #888; font-size: 10px;">-</span>
                                            <input type="number" value="350" min="150" max="600" class="polymir-input" style="font-size: 10px; padding: 0px; height: 20px;"
                                                   id="asteroid-outer" onchange="window.systemConfigTab.updateAsteroids('outerRadius', parseFloat(this.value))">
                                        </div>
                                    </div>
                                    <label style="display: flex; align-items: center; gap: 4px; color: #888; font-size: 10px;">
                                        <input type="checkbox" id="enable-comets" onchange="window.systemConfigTab.updateAsteroids('comets', this.checked)">
                                        Add Comets
                                    </label>
                                </div>
                                </div>
                                
                                <!-- Ring & Moon Generator Card -->
                            <div class="planet-tile" style="border-color: #9400D3; background: linear-gradient(135deg, rgba(148, 0, 211, 0.1) 0%, rgba(75, 0, 130, 0.1) 100%); padding: 4px; min-width: 180px; max-width: 180px; height: auto;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span style="color: #9400D3; font-size: 10px; font-weight: bold;">RING & MOON GEN</span>
                                </div>
                                
                                <!-- Body selector -->
                                <div style="margin-bottom: 4px;">
                                    <label style="color: #888; font-size: 10px; display: block;">Target Body</label>
                                    <select id="ring-moon-target" class="polymir-input" style="font-size: 10px; padding: 0px; height: 20px; width: 100%;" 
                                            onchange="window.systemConfigTab.updateRingMoonTarget(this.value)">
                                        <option value="">Select Body</option>
                                        <option value="star">Sol (Star)</option>
                                        ${this.planets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                    </select>
                                </div>
                                
                                <!-- Ring Options -->
                                <div style="background: rgba(255,215,0,0.05); padding: 4px; margin-bottom: 4px; border-radius: 4px;">
                                    <div style="color: #FFD700; font-size: 10px; margin-bottom: 2px;">Ring Options</div>
                                    
                                    <label style="display: flex; align-items: center; gap: 2px; color: #888; font-size: 10px; margin-bottom: 2px;">
                                        <input type="checkbox" id="add-rings" onchange="window.systemConfigTab.updateRingConfig('enabled', this.checked)">
                                        Add Rings
                                    </label>
                                    
                                    <div style="display: flex; gap: 4px; margin-bottom: 2px;">
                                        <label style="display: flex; align-items: center; gap: 2px; color: #888; font-size: 10px;">
                                            <input type="radio" name="ring-type" value="shader" checked 
                                                   onchange="window.systemConfigTab.updateRingConfig('type', 'shader')">
                                            Shader
                                        </label>
                                        <label style="display: flex; align-items: center; gap: 2px; color: #888; font-size: 10px;">
                                            <input type="radio" name="ring-type" value="voxel" 
                                                   onchange="window.systemConfigTab.updateRingConfig('type', 'voxel')">
                                            Voxel
                                        </label>
                                    </div>
                                    
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
                                        <div>
                                            <label style="color: #888; font-size: 10px;">Inner</label>
                                            <input type="number" value="1.5" min="1.0" max="5.0" step="0.1" 
                                                   class="polymir-input" style="font-size: 10px; padding: 0px; height: 18px;"
                                                   id="ring-inner" onchange="window.systemConfigTab.updateRingConfig('innerRadius', parseFloat(this.value))">
                                        </div>
                                        <div>
                                            <label style="color: #888; font-size: 10px;">Outer</label>
                                            <input type="number" value="2.5" min="1.5" max="10.0" step="0.1" 
                                                   class="polymir-input" style="font-size: 10px; padding: 0px; height: 18px;"
                                                   id="ring-outer" onchange="window.systemConfigTab.updateRingConfig('outerRadius', parseFloat(this.value))">
                                        </div>
                                    </div>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 2px;">
                                        <div>
                                            <label style="color: #888; font-size: 10px;">Terrain Amp (0..1 of 0.5×gR)</label>
                                            <input type="number" min="0" max="1" step="0.01"
                                                   class="polymir-input" style="font-size: 10px; padding: 0px; height: 18px;"
                                                   onchange="window.systemConfigTab.updateRingConfig('amplitudeNormalized', parseFloat(this.value))">
                                        </div>
                                        <div>
                                            <label style="color: #888; font-size: 10px;">Freq</label>
                                            <input type="number" min="0" step="0.1"
                                                   class="polymir-input" style="font-size: 10px; padding: 0px; height: 18px;"
                                                   onchange="window.systemConfigTab.updateRingConfig('frequency', parseFloat(this.value))">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Moon Options -->
                                <div style="background: rgba(192,192,192,0.05); padding: 4px; border-radius: 4px;">
                                    <div style="color: #C0C0C0; font-size: 10px; margin-bottom: 2px;">Moon Options</div>
                                    
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-bottom: 2px;">
                                        <div>
                                            <label style="color: #888; font-size: 10px;">Count</label>
                                            <input type="number" value="0" min="0" max="10" 
                                                   class="polymir-input" style="font-size: 10px; padding: 0px; height: 18px;"
                                                   id="moon-count" onchange="window.systemConfigTab.updateMoonConfig('count', parseInt(this.value))">
                                        </div>
                                        <div>
                                            <label style="color: #888; font-size: 10px;">Size</label>
                                            <input type="number" value="5" min="1" max="20" 
                                                   class="polymir-input" style="font-size: 10px; padding: 0px; height: 18px;"
                                                   id="moon-size" onchange="window.systemConfigTab.updateMoonConfig('size', parseFloat(this.value))">
                                        </div>
                                    </div>
                                    
                                    <label style="display: flex; align-items: center; gap: 2px; color: #888; font-size: 10px;">
                                        <input type="checkbox" id="moon-tidal-lock" 
                                               onchange="window.systemConfigTab.updateMoonConfig('tidalLocked', this.checked)">
                                        Tidal Lock
                                    </label>
                                    
                                    <button onclick="window.systemConfigTab.generateMoon()" style="
                                        padding: 2px 4px;
                                        background: linear-gradient(135deg, #C0C0C0 0%, #808080 100%);
                                        color: black;
                                        border: 1px solid #C0C0C0;
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 10px;
                                        font-family: 'Courier New', monospace;
                                        width: 100%;
                                        margin-top: 4px;
                                    ">+ ADD MOON</button>
                                </div>
                                </div>
                            </div>
                            
                            <!-- 3D Preview Canvas with header -->
                            <div style="position: relative; flex: 1;">
                                <h3 style="
                                    position: absolute;
                                    top: 10px;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    color: #00FF00; 
                                    margin: 0;
                                    font-size: 11px;
                                    font-weight: bold;
                                    text-transform: uppercase;
                                    letter-spacing: 1px;
                                    padding: 2px 12px;
                                    background: rgba(0, 20, 40, 0.9);
                                    border: 1px solid #00FF00;
                                    border-radius: 10px;
                                    z-index: 15;
                                ">Terrain Painter</h3>
                                <div id="system-preview-3d" style="
                                width: 100%;
                                height: 320px;
                                background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%);
                                border: 2px solid #FE0089;
                                border-radius: 10px;
                                position: relative;
                                overflow: hidden;
                                box-shadow: inset 0 0 30px rgba(0, 100, 200, 0.3);
                            ">
                                <canvas id="preview-canvas" style="width: 100%; height: 100%; cursor: grab; user-select: none;"></canvas>
                                <div style="
                                    position: absolute;
                                    bottom: 8px;
                                    left: 8px;
                                    color: #FE0089;
                                    font-size: 10px;
                                    text-shadow: 0 0 5px #000;
                                    background: rgba(0, 0, 0, 0.5);
                                    padding: 4px 8px;
                                    border-radius: 5px;
                                ">
                                    Drag to rotate • Scroll to zoom
                                </div>
                            </div>
                            </div>
                        </div>
                        
                        <!-- Planet Bodies Grid (spans entire width including under sidebar) -->
                        <div style="position: absolute; top: 340px; left: 0; right: -110px; bottom: -100px; z-index: 10;">
                            <div id="bodies-grid" style="
                                display: grid; 
                                grid-template-columns: repeat(5, 180px); 
                                gap: 30px; 
                                height: auto;
                                overflow: visible;
                                z-index: 10;
                                align-items: start;
                            ">
                                <!-- Ghost card to skip the space under Ring & Moon Gen -->
                                <div style="visibility: hidden;"></div>
                                
                                <!-- Planet Cards - start after the ghost card -->
                                ${this.planets.map(p => this.renderPlanetTile(p)).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right Sidebar with professional container -->
                    <div class="planet-tile" style="
                        width: 100px;
                        padding: 4px;
                        border-color: #FE0089;
                        background: linear-gradient(135deg, rgba(0, 20, 40, 0.9) 0%, rgba(0, 40, 80, 0.9) 100%);
                        display: flex;
                        flex-direction: column;
                        gap: 3px;
                        height: fit-content;
                        position: relative;
                        z-index: 50;
                        pointer-events: auto;
                    ">
                        <!-- Generate System button at top -->
                        <button onclick="window.systemGenerator.generateSystem()" style="
                            padding: 6px 8px;
                            background: linear-gradient(135deg, #00FF00 0%, #00AA00 100%);
                            color: black;
                            border: 2px solid #00FF00;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 10px;
                            font-family: 'Courier New', monospace;
                            font-weight: bold;
                            width: 100%;
                            box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
                        ">GENERATE<br>SYSTEM</button>
                        
                        <div style="height: 1px; background: #FE0089; margin: 2px 0;"></div>
                        
                        <!-- Action buttons -->
                        <button onclick="window.systemConfigTab.addPlanet()" style="
                            padding: 2px 4px;
                            background: linear-gradient(135deg, #00FF00 0%, #00AA00 100%);
                            color: black;
                            border: 1px solid #00FF00;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 10px;
                            font-family: 'Courier New', monospace;
                            width: 100%;
                        ">+ ADD PLANET</button>
                        
                        <button onclick="window.addRingWorld()" style="
                            padding: 2px 4px;
                            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
                            color: black;
                            border: 1px solid #FFD700;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 10px;
                            font-family: 'Courier New', monospace;
                            width: 100%;
                            margin-top: 2px;
                        ">+ ADD RING WORLD</button>
                        
                        <button onclick="window.systemConfigTab.saveConfiguration()" style="
                            padding: 2px 4px;
                            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
                            color: black;
                            border: 1px solid #FFD700;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 10px;
                            font-family: 'Courier New', monospace;
                            width: 100%;
                        ">SAVE CONFIG</button>
                        
                        <button onclick="window.systemConfigTab.showSavedConfigs()" style="
                            padding: 2px 4px;
                            background: linear-gradient(135deg, #9400D3 0%, #4B0082 100%);
                            color: white;
                            border: 1px solid #9400D3;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 10px;
                            font-family: 'Courier New', monospace;
                            width: 100%;
                        ">LOAD CONFIG</button>
                        
                        <div style="height: 1px; background: #FE0089; margin: 2px 0;"></div>
                        
                        <!-- Preset buttons -->
                        ${this.renderCompactPresetButtons()}
                        
                        <div style="height: 1px; background: #FE0089; margin: 2px 0;"></div>
                        
                        <button onclick="window.systemConfigTab.showPresetModifier()" style="
                            padding: 4px 8px;
                            background: linear-gradient(135deg, #444 0%, #222 100%);
                            color: #FFD700;
                            border: 1px solid #666;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 10px;
                            font-family: 'Courier New', monospace;
                            font-weight: bold;
                            width: 100%;
                        ">MODIFY</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render compact preset buttons for sidebar
     */
    renderCompactPresetButtons() {
        const presets = [
            { key: 'earth', name: 'Terra', gradient: 'linear-gradient(135deg, #4169E1 0%, #1E90FF 100%)', color: 'white' },
            { key: 'mars', name: 'Rust', gradient: 'linear-gradient(135deg, #CD5C5C 0%, #8B4513 100%)', color: 'white' },
            { key: 'jupiter', name: 'Giant', gradient: 'linear-gradient(135deg, #DEB887 0%, #D2691E 100%)', color: 'black' },
            { key: 'ice', name: 'Frozen', gradient: 'linear-gradient(135deg, #E0FFFF 0%, #87CEEB 100%)', color: 'black' },
            { key: 'lava', name: 'Vulcan', gradient: 'linear-gradient(135deg, #FF4500 0%, #DC143C 100%)', color: 'white' },
            { key: 'ring', name: 'Halo', gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', color: 'black' }
        ];
        
        return presets.map(preset => {
            return `
                <button onclick="window.systemConfigTab.loadPreset('${preset.key}')" style="
                    padding: 4px 8px;
                    background: ${preset.gradient};
                    color: ${preset.color};
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 10px;
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    white-space: nowrap;
                    width: 100%;
                    transition: all 0.2s;
                ">${preset.name.toUpperCase()}</button>
            `;
        }).join('');
    }
    
    /**
     * Render preset buttons
     */
    renderPresetButtons() {
        const presets = [
            { key: 'earth', gradient: 'linear-gradient(135deg, #4169E1 0%, #1E90FF 100%)', color: 'white' },
            { key: 'mars', gradient: 'linear-gradient(135deg, #CD5C5C 0%, #8B4513 100%)', color: 'white' },
            { key: 'jupiter', gradient: 'linear-gradient(135deg, #DEB887 0%, #D2691E 100%)', color: 'black' },
            { key: 'venus', gradient: 'linear-gradient(135deg, #FFA500 0%, #FF6347 100%)', color: 'black' },
            { key: 'ice', gradient: 'linear-gradient(135deg, #E0FFFF 0%, #87CEEB 100%)', color: 'black' },
            { key: 'lava', gradient: 'linear-gradient(135deg, #FF4500 0%, #DC143C 100%)', color: 'white' },
            { key: 'ringworld', gradient: 'linear-gradient(135deg, #FE0089 0%, #00CED1 100%)', color: 'black' },
            { key: 'impossible', gradient: 'linear-gradient(135deg, #9400D3 0%, #FF1493 100%)', color: 'white' }
        ];
        
        return presets.map(preset => {
            const p = this.planetPresets[preset.key];
            return `
                <button onclick="window.systemConfigTab.loadPreset('${preset.key}')" class="preset-btn" style="
                    background: ${preset.gradient};
                    color: ${preset.color};
                    border-color: ${p.color};
                ">
                    <div style="font-size: 16px;">${p.icon}</div>
                    <div style="font-size: 9px; margin-top: 1px;">${p.name}</div>
                </button>
            `;
        }).join('');
    }
    
    /**
     * Render a planet tile
     */
    renderPlanetTile(planet) {
        const borderColor = planet.type === 'moon' ? '#C0C0C0' :
                          planet.type === 'impossible_world' ? '#9400D3' :
                          planet.type === 'ringworld' ? '#FE0089' :
                          planet.gasGiantOnly ? '#DEB887' :
                          planet.hasAtmosphere ? '#00FF00' : '#FF8888';
        
        const showAdvanced = planet.showAdvanced || false;
        const isMoon = planet.type === 'moon';
        
        const isSelected = this.selectedPlanetId === planet.id;
        return `
            <div class="planet-tile" onclick="window.systemConfigTab.selectPlanet(${planet.id})" style="
                border-color: ${isSelected ? '#FFD700' : borderColor}; 
                background: ${isSelected ? 'rgba(255, 215, 0, 0.1)' : 'transparent'};
                border-width: ${isSelected ? '2px' : '1px'};
                box-shadow: ${isSelected ? '0 0 10px rgba(255, 215, 0, 0.5)' : 'none'};
                ${isMoon ? 'margin-left: 20px;' : ''}; 
                height: ${showAdvanced ? 'auto' : 'fit-content'}; 
                overflow: visible;
                cursor: pointer;
                transition: all 0.3s ease;
            " data-planet-id="${planet.id}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <div style="display: flex; align-items: center; gap: 2px;">
                        ${isMoon ? `<span style="color: #888; font-size: 8px;">↳</span>` : ''}
                        <input type="text" value="${planet.name}" class="polymir-input" style="width: ${isMoon ? '90px' : '110px'}; font-size: 10px; padding: 1px 2px;"
                               onclick="event.stopPropagation()"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'name', this.value)">
                        ${isMoon ? `<span style="color: #888; font-size: 8px;">${planet.parentName}</span>` : ''}
                    </div>
                    <button onclick="event.stopPropagation(); window.systemConfigTab.removePlanet(${planet.id})" style="
                        background: linear-gradient(135deg, #FF0000 0%, #CC0000 100%);
                        color: white;
                        border: none;
                        border-radius: 3px;
                        padding: 2px 4px;
                        cursor: pointer;
                        font-size: 10px;
                    ">X</button>
                </div>
                
                <!-- Basic Properties -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-bottom: 2px;" onclick="event.stopPropagation()">
                    <div>
                        <label style="color: #888; font-size: 9px;">Radius (blocks)</label>
                        <input type="number" value="${Math.round(planet.radius || 20)}" min="${isMoon ? 1 : 5}" max="${isMoon ? 50 : 200}" class="polymir-input" style="font-size: 10px; padding: 1px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'radius', parseFloat(this.value))">
                    </div>
                    <div>
                        <label style="color: #888; font-size: 9px;">${isMoon ? 'Distance' : 'Orbit'} (blk)</label>
                        <input type="number" value="${Math.round(planet.orbitalRadius || 100)}" min="${isMoon ? 10 : 30}" max="${isMoon ? 200 : 1000}" class="polymir-input" style="font-size: 10px; padding: 1px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalRadius', parseFloat(this.value))">
                    </div>
                </div>

                <!-- Rotation & Tilt Properties -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-bottom: 2px;" onclick="event.stopPropagation()">
                    <div>
                        <label style="color: #888; font-size: 9px;">Tilt (deg)</label>
                        <input type="number" value="${Math.round((planet.axialTilt || 0) * 10) / 10}" min="0" max="180" step="0.5" class="polymir-input" style="font-size: 10px; padding: 1px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'axialTilt', parseFloat(this.value))">
                    </div>
                    <div>
                        <label style="color: #888; font-size: 9px;">Rotation</label>
                        <input type="number" value="${Math.round((planet.rotationSpeed || 0.001) * 10000) / 10000}" min="0" max="0.01" step="0.0001" class="polymir-input" style="font-size: 10px; padding: 1px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'rotationSpeed', parseFloat(this.value))">
                    </div>
                </div>

                <!-- Orbital Speed (Year) -->
                <div style="margin-bottom: 2px;" onclick="event.stopPropagation()">
                    <label style="color: #888; font-size: 9px;">Year Speed</label>
                    <input type="number" value="${Math.round((planet.orbitalSpeed || 0.0003) * 10000) / 10000}" min="0" max="0.01" step="0.0001" class="polymir-input" style="font-size: 10px; padding: 1px; width: 100%;"
                           onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalSpeed', parseFloat(this.value))">
                </div>
                
                <!-- Quick toggles -->
                <div style="margin-bottom: 2px;">
                    ${isMoon ? `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-bottom: 2px;">
                            <div>
                                <label style="color: #888; font-size: 10px;">Inclination</label>
                                <input type="number" value="${planet.orbitalInclination || 0}" min="-90" max="90" step="5" 
                                       class="polymir-input" style="font-size: 10px; padding: 1px;"
                                       onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalInclination', parseFloat(this.value))">
                            </div>
                            <div>
                                <label style="color: #888; font-size: 10px;">Direction</label>
                                <select class="polymir-input" style="font-size: 10px; padding: 0px; height: 20px;"
                                        onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalDirection', this.value)">
                                    <option value="prograde" ${planet.orbitalDirection === 'prograde' ? 'selected' : ''}>Prograde</option>
                                    <option value="retrograde" ${planet.orbitalDirection === 'retrograde' ? 'selected' : ''}>Retrograde</option>
                                </select>
                            </div>
                        </div>
                        <label style="display: flex; align-items: center; gap: 2px; color: #888; font-size: 10px;">
                            <input type="checkbox" ${planet.tidalLocked ? 'checked' : ''} 
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'tidalLocked', this.checked)">
                            Tidal Lock
                        </label>
                    ` : `
                        <div style="display: flex; gap: 4px;">
                            <label style="display: flex; align-items: center; gap: 2px; color: #888; font-size: 10px;">
                                <input type="checkbox" ${planet.generateStructures ? 'checked' : ''} 
                                       onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'generateStructures', this.checked)">
                                Structures
                            </label>
                            <label style="display: flex; align-items: center; gap: 2px; color: #FFD700; font-size: 10px;">
                                <input type="checkbox" ${planet.hasAsteroidBelt ? 'checked' : ''} 
                                       onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'hasAsteroidBelt', this.checked)">
                                Asteroid Belt
                            </label>
                        </div>
                    `}
                </div>
                
                <!-- Advanced toggle -->
                <div style="background: rgba(0,0,0,0.2); padding: 2px 4px; margin: 2px -4px; cursor: pointer;"
                     onclick="window.systemConfigTab.toggleAdvanced(${planet.id})">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #FE0089; font-size: 10px;">Advanced</span>
                        <span style="color: #FE0089; font-size: 10px;">${showAdvanced ? '▼' : '▶'}</span>
                    </div>
                </div>
                
                <!-- Advanced Options (hidden by default) -->
                <div style="display: ${showAdvanced ? 'block' : 'none'}; margin-top: 4px;">
                    ${this.renderToggleSection(planet, 'orbital', 'Orbital', '#FE0089')}
                    ${this.renderToggleSection(planet, 'water', 'Water', '#4169E1')}
                    ${this.renderToggleSection(planet, 'terrain', 'Terrain', '#8B4513')}
                    ${this.renderToggleSection(planet, 'atmosphere', 'Atmosphere', '#87CEEB')}
                    ${planet.type === 'impossible_world' ? this.renderToggleSection(planet, 'exotic', 'Exotic', '#9400D3') : ''}
                    ${planet.type === 'ringworld' || planet.worldType === 'ring' ? this.renderToggleSection(planet, 'ring', 'Ring Settings', '#FFD700') : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Render a toggle section
     */
    renderToggleSection(planet, type, label, color) {
        const isExpanded = planet[`show${type.charAt(0).toUpperCase() + type.slice(1)}`] || false;
        
        let content = '';
        switch(type) {
            case 'orbital':
                content = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
                        <!-- Orbital Mechanics -->
                        <div>
                            <label style="color: #888; font-size: 10px;">Orbit Radius</label>
                            <input type="number" value="${planet.orbitalRadius || 100}" min="10" max="1000" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalRadius', parseFloat(this.value))">
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Orbit Speed</label>
                            <input type="number" value="${planet.orbitalSpeed || 0.001}" min="0" max="0.1" step="0.0001" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalSpeed', parseFloat(this.value))">
                        </div>
                        
                        <!-- Body Properties -->
                        <div>
                            <label style="color: #888; font-size: 10px;">Body Radius</label>
                            <input type="number" value="${planet.radius || 20}" min="1" max="200" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'radius', parseFloat(this.value))">
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Rotation (hrs)</label>
                            <input type="number" value="${planet.rotationPeriod || 24}" min="0.1" max="10000" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'rotationPeriod', parseFloat(this.value))">
                        </div>
                        
                        <!-- Tilt and Special Properties -->
                        <div>
                            <label style="color: #888; font-size: 10px;">Axial Tilt (°)</label>
                            <input type="number" value="${planet.axialTilt || 0}" min="-180" max="180" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'axialTilt', parseFloat(this.value))">
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Inclination (°)</label>
                            <input type="number" value="${planet.orbitalInclination || 0}" min="-90" max="90" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalInclination', parseFloat(this.value))">
                        </div>
                        
                        <!-- Orbital Period and Eccentricity -->
                        <div>
                            <label style="color: #888; font-size: 10px;">Orbit Days</label>
                            <input type="number" value="${planet.orbitalPeriod || 365}" min="1" max="100000" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'orbitalPeriod', parseFloat(this.value))">
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Eccentricity</label>
                            <input type="number" value="${planet.eccentricity || 0}" min="0" max="0.99" step="0.01" class="polymir-input" style="font-size: 10px; padding: 1px;"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'eccentricity', parseFloat(this.value))">
                        </div>
                        
                        ${planet.type !== 'moon' ? `
                        <div style="grid-column: span 2;">
                            <label style="color: #888; font-size: 10px;">
                                <input type="checkbox" ${planet.tidalLocked ? 'checked' : ''}
                                       onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'tidalLocked', this.checked)">
                                Tidally Locked
                            </label>
                        </div>
                        
                        <!-- Add Moons Button -->
                        <div style="grid-column: span 2;">
                            <button onclick="window.systemConfigTab.attachMoonToPlanet(${planet.id})" style="
                                width: 100%;
                                padding: 2px 4px;
                                background: linear-gradient(135deg, #C0C0C0 0%, #808080 100%);
                                color: black;
                                border: 1px solid #C0C0C0;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">+ Add Moon to ${planet.name}</button>
                        </div>
                        ` : ''}
                    </div>
                `;
                break;
            case 'water':
                content = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="color: #888; font-size: 10px;">Water Level (m)</label>
                            <input type="number" value="${planet.waterLevel || 0}" min="0" max="200" class="polymir-input"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'waterLevel', parseFloat(this.value))">
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Coverage (%)</label>
                            <input type="number" value="${planet.waterCoverage || 70}" min="0" max="100" class="polymir-input"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'waterCoverage', parseFloat(this.value))">
                        </div>
                    </div>
                `;
                break;
            case 'terrain':
                content = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <div>
                            <label style="color: #888; font-size: 10px;">Amplitude (0..1 of 0.5×gR)</label>
                            <input type="number" min="0" max="1" step="0.01"
                                   value="${planet.terrain?.amplitudeNormalized ?? 0.3}"
                                   class="polymir-input"
                                   onchange="window.systemConfigTab.updateTerrain(${planet.id}, 'amplitudeNormalized', parseFloat(this.value))">
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Frequency</label>
                            <input type="number" min="0" step="0.1"
                                   value="${planet.terrain?.frequency ?? 2}"
                                   class="polymir-input"
                                   onchange="window.systemConfigTab.updateTerrain(${planet.id}, 'frequency', parseFloat(this.value))">
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Octaves</label>
                            <input type="number" min="1" max="8" step="1"
                                   value="${planet.terrain?.octaves ?? 3}"
                                   class="polymir-input"
                                   onchange="window.systemConfigTab.updateTerrain(${planet.id}, 'octaves', parseInt(this.value))">
                        </div>
                        <div style="align-self: end; color: #666; font-size: 9px;">
                            Max height = 0.5 × gravity radius. Amplitude is a fraction of that.
                        </div>
                    </div>
                `;
                break;
            case 'atmosphere':
                content = `
                    <div>
                        <label style="color: #888; font-size: 10px;">Composition</label>
                        <select class="polymir-input" onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'atmosphereComposition', this.value)">
                            <option value="earth-like" ${planet.atmosphereComposition === 'earth-like' ? 'selected' : ''}>Earth-like</option>
                            <option value="toxic" ${planet.atmosphereComposition === 'toxic' ? 'selected' : ''}>Toxic</option>
                            <option value="methane" ${planet.atmosphereComposition === 'methane' ? 'selected' : ''}>Methane</option>
                            <option value="thin" ${planet.atmosphereComposition === 'thin' ? 'selected' : ''}>Thin</option>
                        </select>
                    </div>
                `;
                break;
            case 'exotic':
                content = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="color: #888; font-size: 10px;">Geometry</label>
                            <select class="polymir-input" onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'geometry', this.value)">
                                <option value="klein_bottle">Klein Bottle</option>
                                <option value="mobius">Möbius Strip</option>
                                <option value="tesseract">Tesseract</option>
                            </select>
                        </div>
                        <div>
                            <label style="color: #888; font-size: 10px;">Quantum Flux</label>
                            <input type="number" value="${planet.quantumFlux || 0.5}" min="0" max="1" step="0.1" class="polymir-input"
                                   onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'quantumFlux', parseFloat(this.value))">
                        </div>
                    </div>
                `;
                break;
            case 'ring':
                content = `
                    <label style="font-size: 9px; color: #FFD700;">
                        <input type="checkbox" ${planet.starCentered ? 'checked' : ''} 
                            onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'starCentered', this.checked); window.systemConfigTab.generator?.showSystemTab();">
                         Star-Centered Ring
                    </label>
                    <div style="font-size: 8px; color: #888; margin-top: 2px;">
                        ${planet.starCentered ? '1 AU Star Ring!' : 'Planet-scale ring'}
                    </div>
                    <div style="margin-top: 4px; background: rgba(255,215,0,0.05); padding: 4px; border-radius: 4px;">
                        <div style="color: #FFD700; font-size: 10px; margin-bottom: 2px;">Terrain Noise</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
                            <div>
                                <label style="color: #888; font-size: 10px;">Amplitude</label>
                                <input type="number" value="${planet.ringTerrain?.amplitude ?? 0.5}" min="0" max="5" step="0.05"
                                       class="polymir-input" style="font-size: 10px; padding: 1px;"
                                       onchange="window.systemConfigTab.updateRingTerrain(${planet.id}, 'amplitude', parseFloat(this.value))">
                            </div>
                            <div>
                                <label style="color: #888; font-size: 10px;">Frequency</label>
                                <input type="number" value="${planet.ringTerrain?.frequency ?? 2}" min="0" max="20" step="0.1"
                                       class="polymir-input" style="font-size: 10px; padding: 1px;"
                                       onchange="window.systemConfigTab.updateRingTerrain(${planet.id}, 'frequency', parseFloat(this.value))">
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 2px;">
                            <div>
                                <label style="color: #888; font-size: 10px;">Octaves</label>
                                <input type="number" value="${planet.ringTerrain?.octaves ?? 3}" min="1" max="8" step="1"
                                       class="polymir-input" style="font-size: 10px; padding: 1px;"
                                       onchange="window.systemConfigTab.updateRingTerrain(${planet.id}, 'octaves', parseInt(this.value))">
                            </div>
                            <div>
                                <label style="color: #888; font-size: 10px;">Lamplitude</label>
                                <input type="number" value="${planet.ringTerrain?.lamplitude ?? 0.5}" min="0" max="5" step="0.05"
                                       class="polymir-input" style="font-size: 10px; padding: 1px;"
                                       onchange="window.systemConfigTab.updateRingTerrain(${planet.id}, 'lamplitude', parseFloat(this.value))">
                            </div>
                        </div>
                        <div style="font-size: 8px; color: #888; margin-top: 2px;">Green/Gray/Brown terrain will be auto-mixed with noise.</div>
                    </div>
                `;
                break;
        }
        
        return `
            <div class="toggle-section" style="border-color: ${color};">
                <div class="toggle-header" onclick="window.systemConfigTab.toggleSection(${planet.id}, '${type}')" 
                     style="color: ${color}; font-size: 10px;">
                    <span>${label}</span>
                    <span>${isExpanded ? '▼' : '▶'}</span>
                </div>
                <div class="toggle-content ${isExpanded ? 'expanded' : ''}">
                    ${content}
                </div>
            </div>
        `;
    }
    
    /**
     * Toggle a section
     */
    toggleSection(planetId, sectionType) {
        const planet = this.planets.find(p => p.id === planetId);
        if (planet) {
            const key = `show${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)}`;
            planet[key] = !planet[key];
            
            // Re-render
            if (this.generator) {
                this.generator.showSystemTab();
            }
        }
    }
    
    /**
     * Toggle advanced options for a planet
     */
    toggleAdvanced(planetId) {
        const planet = this.planets.find(p => p.id === planetId);
        if (planet) {
            planet.showAdvanced = !planet.showAdvanced;
            
            // Re-render
            if (this.generator) {
                this.generator.showSystemTab();
            }
        }
    }
    
    /**
     * Update ring/moon target body
     */
    updateRingMoonTarget(targetId) {
        this.ringMoonConfig.targetBody = targetId;
        console.log('Ring/Moon target set to:', targetId);
    }
    
    /**
     * Update ring configuration
     */
    updateRingConfig(property, value) {
        this.ringMoonConfig.rings[property] = value;
        console.log(`Updated ring ${property}:`, value);
        
        // Apply rings to target body if enabled
        if (this.ringMoonConfig.targetBody && this.ringMoonConfig.rings.enabled) {
            this.applyRingsToBody(this.ringMoonConfig.targetBody);
        }
        
        this.updatePreview();
    }
    
    /**
     * Update moon configuration
     */
    updateMoonConfig(property, value) {
        this.ringMoonConfig.moons[property] = value;
        console.log(`Updated moon ${property}:`, value);
    }
    
    /**
     * Apply rings to a specific body
     */
    applyRingsToBody(bodyId) {
        if (bodyId === 'star') {
            // Apply to star
            if (!this.star) {
                this.star = { name: 'Sol', type: 'white', radius: 60, colorValue: 2.0 };
            }
            this.star.hasRings = this.ringMoonConfig.rings.enabled;
            this.star.ringConfig = { ...this.ringMoonConfig.rings };
        } else {
            // Apply to planet
            const planet = this.planets.find(p => p.id == bodyId);
            if (planet) {
                planet.hasRings = this.ringMoonConfig.rings.enabled;
                planet.ringType = this.ringMoonConfig.rings.type;
                planet.ringInnerRadius = planet.radius * this.ringMoonConfig.rings.innerRadius;
                planet.ringOuterRadius = planet.radius * this.ringMoonConfig.rings.outerRadius;
                planet.ringDensity = this.ringMoonConfig.rings.density;
                planet.ringColor = this.ringMoonConfig.rings.color;
                // Wire ring terrain settings to preview consumer
                planet.ringTerrain = planet.ringTerrain || {};
                if (typeof this.ringMoonConfig.rings.amplitudeNormalized === 'number') {
                    planet.ringTerrain.amplitudeNormalized = this.ringMoonConfig.rings.amplitudeNormalized;
                }
                if (typeof this.ringMoonConfig.rings.frequency === 'number') {
                    planet.ringTerrain.frequency = this.ringMoonConfig.rings.frequency;
                }
            }
        }
        
        this.updatePreview();
    }
    
    /**
     * Attach a moon to a specific planet (from planet's orbital section)
     */
    attachMoonToPlanet(planetId) {
        const parent = this.planets.find(p => p.id === planetId);
        if (!parent) return;
        
        const moonConfig = {
            id: this.nextPlanetId++,
            name: `${parent.name} Moon ${(parent.moons?.length || 0) + 1}`,
            type: 'moon',
            parentId: planetId,
            parentName: parent.name,
            radius: 5 + Math.random() * 5,
            orbitalRadius: parent.radius * (2 + Math.random() * 2),
            orbitalSpeed: 0.001 + Math.random() * 0.002,
            rotationPeriod: 24 + Math.random() * 48,
            axialTilt: Math.random() * 30,
            orbitalInclination: Math.random() * 10 - 5,
            eccentricity: Math.random() * 0.1,
            tidalLocked: Math.random() > 0.3,
            gravity: 0.1 + Math.random() * 0.3,
            mass: 0.01,
            density: 3.0 + Math.random() * 2,
            biomeDistribution: { lunar: 0.7, crater: 0.3 },
            color: '#C0C0C0',
            isMoon: true
        };
        
        // Add to parent's moon list
        if (!parent.moons) parent.moons = [];
        parent.moons.push(moonConfig.id);
        
        // Add to planets array for rendering
        this.planets.push(moonConfig);
        
        console.log(`Attached moon to ${parent.name}:`, moonConfig);
        
        // Update preview and re-render
        this.updatePreview();
        if (this.generator) {
            this.generator.showSystemTab();
        }
    }
    
    /**
     * Generate a moon for the selected body (from Ring & Moon Gen panel)
     */
    generateMoon() {
        if (!this.ringMoonConfig.targetBody) {
            alert('Please select a target body first');
            return;
        }
        
        const moonConfig = {
            id: this.nextPlanetId++,
            name: `Moon ${this.nextPlanetId}`,
            type: 'moon',
            radius: this.ringMoonConfig.moons.size || 5,
            parent: this.ringMoonConfig.targetBody,
            tidalLocked: this.ringMoonConfig.moons.tidalLocked,
            orbitalRadius: 0,  // Will be calculated based on parent
            orbitalSpeed: 0.001,
            orbitalInclination: 0,  // Degrees off the plane
            orbitalDirection: 'prograde',  // 'prograde' or 'retrograde'
            rotationPeriod: 27.3,  // Earth days (default like our Moon)
            axialTilt: 5,  // Degrees
            eccentricity: 0.05,
            gravity: 0.17,  // Moon-like gravity
            mass: 0.012,
            density: 3.3,
            color: '#C0C0C0',
            isMoon: true,
            biomeDistribution: { lunar: 1.0 }
        };
        
        if (this.ringMoonConfig.targetBody === 'star') {
            // Orbit around star - unlikely but possible
            moonConfig.orbitalRadius = 50;
            moonConfig.parentName = 'Sol';
            moonConfig.parentId = 'star';
        } else {
            // Orbit around planet
            const parent = this.planets.find(p => p.id == this.ringMoonConfig.targetBody);
            if (parent) {
                moonConfig.orbitalRadius = parent.radius * 3;  // Default to 3x parent radius
                moonConfig.parentName = parent.name;
                moonConfig.parentId = parent.id;
                
                // Add moon to parent's moon list
                if (!parent.moons) parent.moons = [];
                parent.moons.push(moonConfig.id);
            }
        }
        
        // Add moon as a special type of planet card
        this.planets.push(moonConfig);
        
        console.log('Generated moon card:', moonConfig);
        
        // Re-render
        if (this.generator) {
            this.generator.showSystemTab();
        }
        
        this.updatePreview();
    }
    
    /**
     * Render ring configuration (deprecated - kept for compatibility)
     */
    renderRingConfig(planet) {
        return `
            <div style="background: rgba(255,215,0,0.05); padding: 4px; margin-bottom: 4px; border-radius: 4px;">
                <div style="color: #FFD700; font-size: 10px; margin-bottom: 2px;">Ring Configuration</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
                    <div>
                        <label style="color: #888; font-size: 10px;">Inner R</label>
                        <input type="number" value="${planet.ringInnerRadius || planet.radius * 1.5}" min="${planet.radius}" max="${planet.radius * 5}" 
                               class="polymir-input" style="font-size: 10px; padding: 1px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'ringInnerRadius', parseFloat(this.value))">
                    </div>
                    <div>
                        <label style="color: #888; font-size: 10px;">Outer R</label>
                        <input type="number" value="${planet.ringOuterRadius || planet.radius * 2.5}" min="${planet.radius}" max="${planet.radius * 5}" 
                               class="polymir-input" style="font-size: 10px; padding: 1px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'ringOuterRadius', parseFloat(this.value))">
                    </div>
                    <div>
                        <label style="color: #888; font-size: 10px;">Density</label>
                        <input type="number" value="${planet.ringDensity || 0.8}" min="0.1" max="1.0" step="0.1" 
                               class="polymir-input" style="font-size: 10px; padding: 1px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'ringDensity', parseFloat(this.value))">
                    </div>
                    <div>
                        <label style="color: #888; font-size: 10px;">Color</label>
                        <input type="color" value="${planet.ringColor || '#C4B5A0'}" 
                               class="polymir-input" style="font-size: 10px; padding: 1px; height: 20px;"
                               onchange="window.systemConfigTab.updatePlanet(${planet.id}, 'ringColor', this.value)">
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Update star property
     */
    updateStar(property, value) {
        if (!this.star) {
            this.star = { name: 'Sol', type: 'white', radius: 60, colorValue: 2.0 };
        }
        this.star[property] = value;
        console.log(` Updated star ${property}:`, value);
        this.updatePreview();
    }

    updateStarColor(colorValue) {
        if (!this.star) {
            this.star = { name: 'Sol', type: 'white', radius: 60, colorValue: 2.0 };
        }

        // Map slider value to color names
        let colorName, type;
        if (colorValue < 0.5) {
            colorName = 'Red';
            type = 'red';
        } else if (colorValue < 1.5) {
            colorName = 'Orange';
            type = 'orange';
        } else if (colorValue < 2.5) {
            colorName = 'White';
            type = 'white';
        } else if (colorValue < 3.5) {
            colorName = 'Blue';
            type = 'blue';
        } else {
            colorName = 'Dark';
            type = 'dark';
        }

        this.star.colorValue = colorValue;
        this.star.type = type;

        // Update label
        const label = document.getElementById('star-color-label');
        if (label) {
            label.textContent = colorName;
        }

        console.log(` Updated star color: ${colorName} (${colorValue})`);
        this.updatePreview();
    }
    
    /**
     * Update asteroid configuration
     */
    updateAsteroids(property, value) {
        this.asteroidConfig[property] = value;
        console.log(`Updated asteroids ${property}:`, value);
        this.updatePreview();
    }
    
    /**
     * Update planet property
     */
    updatePlanet(planetId, property, value) {
        const planet = this.planets.find(p => p.id === planetId);
        if (planet) {
            planet[property] = value;
            console.log(`Updated planet ${planetId} ${property} to ${value}`);

            // Special handling for star-centered rings
            if (property === 'starCentered' && value === true && planet.worldType === 'ring') {
                // Ensure ring worlds have nature biomes if not already set
                if (!planet.biomes || Object.keys(planet.biomes).length === 0) {
                    planet.biomes = {
                        grassland: 35,  // Green fields
                        forest: 30,     // Forests
                        ocean: 15,      // Water
                        desert: 5,      // Some arid
                        mountains: 10,  // Terrain
                        crystal: 5,     // Decorative
                        ice: 0,
                        lava: 0
                    };
                    planet.biomePattern = 'banded';
                    console.log('Added default nature biomes to ring world');
                }
            }

            // Only regenerate if property requires new geometry
            const geometryProperties = ['radius', 'worldType', 'type', 'biomes', 'hasRings', 'ringInnerRadius', 'ringOuterRadius', 'ringColor'];
            const needsRegeneration = geometryProperties.includes(property);

            if (needsRegeneration) {
                // Full regeneration needed - geometry change
                this.updatePreview();
            } else {
                // Just update the property in-place without regenerating
                // axialTilt - just rotation, no geometry change
                // color - just material color, no geometry change
                // orbitalRadius, orbitalSpeed, rotationSpeed - animation loop handles
                // structures, asteroids - generation-time only
                console.log(`Property ${property} updated without regeneration`);
            }
        }
    }

    /**
     * Update structured terrain settings for a planet
     */
    updateTerrain(planetId, key, value) {
        const planet = this.planets.find(p => p.id === planetId);
        if (!planet) return;
        if (!planet.terrain) planet.terrain = {};
        planet.terrain[key] = value;
        this.updatePreview();
    }

    /**
     * Update ringworld terrain noise settings
     */
    updateRingTerrain(planetId, key, value) {
        const planet = this.planets.find(p => p.id === planetId);
        if (!planet) return;
        if (!planet.ringTerrain) planet.ringTerrain = {};
        planet.ringTerrain[key] = value;
        console.log('Updated ring terrain', key, value);
        this.updatePreview();
    }
    
    /**
     * Select a planet for focus
     */
    selectPlanet(planetId) {
        this.selectedPlanetId = planetId;

        // Find planet
        const planet = this.planets.find(p => p.id === planetId);
        if (!planet || !this.generator) return;

        // Enter planet editing mode
        this.generator.enterPlanetEditingMode(planet);

        console.log(`Entering terrain editing mode for: ${planet.name}`);
    }

    /**
     * Add a new planet
     */
    generatePlanetName() {
        const prefix = this.planetNamePrefixes[Math.floor(Math.random() * this.planetNamePrefixes.length)];
        const suffix = this.planetNameSuffixes[Math.floor(Math.random() * this.planetNameSuffixes.length)];
        const number = this.planets.length + 1;
        return `${prefix}${suffix}-${number}`;
    }

    addPlanet(preset = null) {
        // Calculate proper orbital radius based on 2x combined gravity radii
        let orbitalRadius = 150; // Default starting orbit

        if (this.planets.length > 0) {
            // Find the outermost planet
            const lastPlanet = this.planets.reduce((max, p) =>
                p.orbitalRadius > max.orbitalRadius ? p : max
            );

            // Calculate new planet's radius and gravity radius
            const newRadius = preset?.radius || 20;
            const newGravityRadius = (preset?.orbitalRadius || (lastPlanet.orbitalRadius + 200)) * 0.6;

            // Last planet's gravity radius
            const lastGravityRadius = lastPlanet.gravityRadius || (lastPlanet.orbitalRadius * 0.6);

            // New orbit = last orbit + 2x (last gravity + new gravity)
            orbitalRadius = lastPlanet.orbitalRadius + (2 * (lastGravityRadius + newGravityRadius));
        }

        const newPlanet = preset ? {
            ...preset,
            id: this.nextPlanetId++,
            name: this.generatePlanetName(), // Generate procedural name instead of using preset name
            worldType: preset.worldType || 'sphere',
            orbitalRadius: orbitalRadius,
            gravityRadius: orbitalRadius * 0.6,
            axialTilt: preset.axialTilt !== undefined ? preset.axialTilt : Math.random() * 30, // 0-30 degrees
            rotationSpeed: preset.rotationSpeed || (0.0005 + Math.random() * 0.002), // Random spin
            orbitalSpeed: preset.orbitalSpeed || (0.0001 + Math.random() * 0.0005), // Random orbit speed
            gasGiantOnly: preset.gasGiantOnly || false // EXPLICITLY preserve gasGiantOnly flag
        } : {
            id: this.nextPlanetId++,
            name: this.generatePlanetName(),
            type: 'terrestrial',
            worldType: 'sphere',
            radius: 20, // blocks
            orbitalRadius: orbitalRadius,
            gravityRadius: orbitalRadius * 0.6,
            orbitalPeriod: 365,
            rotationPeriod: 24,
            axialTilt: Math.random() * 30, // 0-30 degrees random tilt
            rotationSpeed: 0.0005 + Math.random() * 0.002, // Random rotation speed
            orbitalSpeed: 0.0001 + Math.random() * 0.0005, // Random orbital speed
            waterLevel: 0,
            waterCoverage: 0,
            terrainAmplitude: 1000,
            terrainFrequency: 0.01,
            hasAtmosphere: false,
            color: '#808080'
        };

        console.log('[SystemConfigTab] Adding planet:', newPlanet);
        console.log('[SystemConfigTab] gasGiantOnly flag on new planet:', newPlanet.gasGiantOnly);

        this.planets.push(newPlanet);

        // Auto-select the newly added planet
        this.selectedPlanetId = newPlanet.id;
        
        // Re-render
        if (this.generator) {
            this.generator.showSystemTab();
        }
        
        // Update preview after DOM updates
        setTimeout(() => this.updatePreview(), 100);
    }
    
    /**
     * Remove a planet
     */
    removePlanet(planetId) {
        this.planets = this.planets.filter(p => p.id !== planetId);
        
        // Re-render
        if (this.generator) {
            this.generator.showSystemTab();
        }
        
        // Update preview after DOM updates
        setTimeout(() => this.updatePreview(), 100);
    }
    
    /**
     * Get planet icon
     */
    getPlanetIcon(type) {
        const icons = {
            'terrestrial': '●',
            'martian': '●',
            'jovian': '●',
            'venusian': '●',
            'ice_world': '●',
            'lava_world': '●',
            'ringworld': '○',
            'impossible_world': '◉',
            'moon': '●',
            'asteroid': '·'
        };
        return icons[type] || '●';
    }
    
    /**
     * Render the tab content (for compatibility with menu)
     */
    getHTML() {
        return this.render();
    }
    
    /**
     * Load a planet preset
     */
    loadPreset(presetName) {
        console.log(`Loading preset: ${presetName}`);
        const preset = this.planetPresets[presetName];
        if (preset) {
            console.log('Preset found:', preset);
            console.log('gasGiantOnly flag in preset:', preset.gasGiantOnly);
            this.addPlanet(preset);
        } else {
            console.error(`Preset not found: ${presetName}`);
        }
    }
    
    /**
     * Save configuration to local storage
     */
    saveConfiguration() {
        const config = this.getSystemConfig();
        const name = prompt('Enter a name for this configuration:', `System_${Date.now()}`);
        
        if (name) {
            let saves = {};
            try {
                saves = JSON.parse(localStorage.getItem('polymir_saved_systems') || '{}');
            } catch (e) {
                console.error('Failed to load saves:', e);
            }
            
            saves[name] = {
                ...config,
                timestamp: Date.now(),
                name: name
            };
            
            try {
                localStorage.setItem('polymir_saved_systems', JSON.stringify(saves));
                alert(`Configuration "${name}" saved successfully!`);
                console.log(' Saved configuration:', saves[name]);
            } catch (e) {
                console.error('Failed to save configuration:', e);
                alert('Failed to save configuration. Storage may be full.');
            }
        }
    }
    
    /**
     * Show preset modifier
     */
    showPresetModifier() {
        console.log(' Modifier not yet implemented');
        alert('Preset Modifier: Customize planet generation parameters (Coming Soon!)');
    }
    
    /**
     * Show saved configurations
     */
    showSavedConfigs() {
        try {
            const saves = JSON.parse(localStorage.getItem('polymir_saved_systems') || '{}');
            const names = Object.keys(saves);
            
            if (names.length === 0) {
                alert('No saved configurations found');
                return;
            }
            
            const selected = prompt(`Select a configuration to load:\n\n${names.join('\n')}`);
            
            if (selected && saves[selected]) {
                this.loadConfiguration(saves[selected]);
            }
        } catch (e) {
            console.error('Failed to load saved configurations:', e);
        }
    }
    
    /**
     * Load a configuration
     */
    loadConfiguration(config) {
        // Load star settings
        if (config.star) {
            document.getElementById('star-type').value = config.star.type;
            document.getElementById('star-radius').value = config.star.radius;
        }
        
        // Load planets
        this.planets = config.planets || [];
        this.nextPlanetId = Math.max(...this.planets.map(p => p.id), 0) + 1;
        
        // Re-render
        if (this.generator) {
            this.generator.showSystemTab();
        }
        
        alert('Configuration loaded successfully!');
    }
    
    /**
     * Attach event listeners after rendering
     */
    attachEventListeners() {
        // Initialize 3D preview
        setTimeout(() => {
            if (this.previewRenderer) {
                this.previewRenderer.init();
                this.updatePreview();
            }
        }, 100);
    }
    
    /**
     * Update 3D preview with current configuration
     */
    updatePreview() {
        // Trigger UniverseCreationModal to redraw planets and orbits with updated configs
        if (this.generator && this.generator.renderConfiguredPlanets) {
            this.generator.renderConfiguredPlanets();
        }
    }
    
    /**
     * Auto-space planets to prevent collisions
     */
    autoSpacePlanets() {
        console.log(' Auto-spacing planets to prevent collisions...');
        
        // Sort planets by current orbital radius
        this.planets.sort((a, b) => (a.orbitalRadius || 0) - (b.orbitalRadius || 0));
        
        let currentRadius = 100; // Start first planet at 100 units
        
        this.planets.forEach((planet, index) => {
            const planetRadius = planet.radius || 20;
            const gravityRadius = planet.gravityRadius || planetRadius;
            const minSeparation = gravityRadius * 2.5;
            
            // Ensure this planet is far enough from the previous
            if (index > 0) {
                const prevPlanet = this.planets[index - 1];
                const prevGravity = prevPlanet.gravityRadius || prevPlanet.radius || 20;
                const minDistance = prevGravity + gravityRadius + 50; // 50 units buffer
                
                currentRadius = Math.max(
                    currentRadius + minDistance,
                    planet.orbitalRadius || currentRadius
                );
            }
            
            planet.orbitalRadius = currentRadius;
            console.log(`Planet ${planet.name}: orbital radius set to ${currentRadius}`);
        });
        
        // Re-render and update preview
        if (this.generator) {
            this.generator.showSystemTab();
        }
        
        alert('Orbits have been auto-spaced to prevent collisions!');
    }
    
    /**
     * Get complete system configuration
     */
    getSystemConfig() {
        // Use the configured asteroid settings
        const asteroidBelt = this.asteroidConfig.enabled ? {
            innerRadius: this.asteroidConfig.innerRadius,
            outerRadius: this.asteroidConfig.outerRadius,
            asteroidCount: this.asteroidConfig.count,
            averageSize: this.asteroidConfig.size,
            name: 'Main Belt',
            hasComets: this.asteroidConfig.comets
        } : null;
        
        return {
            star: {
                type: document.getElementById('star-type')?.value || 'yellow',
                radius: parseFloat(document.getElementById('star-radius')?.value) || 30,
                temperature: parseFloat(document.getElementById('star-temp')?.value) || 5778
            },
            planets: this.planets.map(p => ({
                ...p,
                // Ensure all properties are present from toggles
                waterLevel: p.showWater ? (p.waterLevel || 0) : 0,
                waterCoverage: p.showWater ? (p.waterCoverage || 70) : 0,
                terrainAmplitude: p.showTerrain ? (p.terrainAmplitude || 1000) : 100,
                terrainFrequency: p.showTerrain ? (p.terrainFrequency || 0.01) : 0.01,
                hasAtmosphere: p.showAtmosphere || false,
                atmosphereComposition: p.showAtmosphere ? (p.atmosphereComposition || 'earth-like') : null,
                gasGiantOnly: p.gasGiantOnly || false,
                // Orbital mechanics from toggles
                tidalLocked: p.showOrbital ? (p.tidalLocked || false) : false,
                orbitalPeriod: p.showOrbital ? (p.orbitalPeriod || 365) : 365,
                rotationPeriod: p.showOrbital ? (p.rotationPeriod || 24) : 24,
                // CRITICAL: Include physics and biomes!
                gravity: p.gravity || 1.0,
                mass: p.mass || 1.0,
                density: p.density || 5.5,
                biomeDistribution: p.biomeDistribution || { temperate: 1.0 },
                axialTilt: p.showOrbital ? (p.axialTilt || 0) : 0,
                // Exotic properties
                geometry: p.geometry,
                quantumFlux: p.quantumFlux,
                dimensionCount: p.dimensionCount
            })),
            // Include asteroid belt if enabled
            asteroidBelts: asteroidBelt ? [asteroidBelt] : [],
            features: {
                asteroids: true,
                ringworlds: this.planets.some(p => p.type === 'ringworld'),
                impossibleWorlds: this.planets.some(p => p.type === 'impossible_world')
            }
        };
    }

    /**
     * Add a moon to a specific planet
     */
    addMoon(planetId) {
        const moonId = this.nextMoonId++;
        const moonName = `Moon ${moonId}`;

        const newMoon = {
            id: moonId,
            parentId: planetId,
            name: moonName,
            radius: 5 + Math.random() * 10,
            orbit: 50 + Math.random() * 100,
            type: 'moon',
            color: '#888888'
        };

        this.moons.push(newMoon);
        console.log(`Added moon ${moonName} to planet ${planetId}`);

        // Re-render if in editing mode
        if (this.generator && this.generator.editingMode === 'planet') {
            const planet = this.planets.find(p => p.id === planetId);
            if (planet) {
                this.generator.enterPlanetEditingMode(planet);
            }
        }
    }

    /**
     * Create moon card HTML
     */
    createMoonCard(moon) {
        return `
            <div class="planet-card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 2px solid #444; border-radius: 10px; padding: 10px; position: relative;">
                <!-- Delete button -->
                <button onclick="window.systemConfigTab.removeMoon(${moon.id})"
                        style="position: absolute; top: 5px; right: 5px; width: 20px; height: 20px; padding: 0; background: #000; color: #FF0000; border: 1px solid #FF0000; border-radius: 50%; cursor: pointer; font-size: 12px; line-height: 1;">
                    ×
                </button>

                <!-- Moon info -->
                <div style="text-align: center; margin-bottom: 8px;">
                    <div style="color: #888; font-size: 18px; margin-bottom: 5px;"></div>
                    <div style="color: #FFD700; font-size: 12px; font-weight: bold;">${moon.name}</div>
                </div>

                <!-- Properties -->
                <div style="font-size: 10px; color: #888;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                        <div>
                            <label style="color: #666;">Radius</label>
                            <input type="number" value="${moon.radius}" min="1" max="50"
                                   onchange="window.systemConfigTab.updateMoonProperty(${moon.id}, 'radius', this.value)"
                                   style="width: 100%; padding: 3px; background: #000; color: #00FFFF; border: 1px solid #00FFFF; border-radius: 3px; font-size: 10px;">
                        </div>
                        <div>
                            <label style="color: #666;">Orbit</label>
                            <input type="number" value="${moon.orbit}" min="10" max="500"
                                   onchange="window.systemConfigTab.updateMoonProperty(${moon.id}, 'orbit', this.value)"
                                   style="width: 100%; padding: 3px; background: #000; color: #00FFFF; border: 1px solid #00FFFF; border-radius: 3px; font-size: 10px;">
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Remove a moon
     */
    removeMoon(moonId) {
        const index = this.moons.findIndex(m => m.id === moonId);
        if (index !== -1) {
            this.moons.splice(index, 1);
            console.log(`Removed moon ${moonId}`);

            // Re-render if in editing mode
            if (this.generator && this.generator.editingMode === 'planet' && this.generator.editingPlanet) {
                this.generator.enterPlanetEditingMode(this.generator.editingPlanet);
            }
        }
    }

    /**
     * Update moon property
     */
    updateMoonProperty(moonId, property, value) {
        const moon = this.moons.find(m => m.id === moonId);
        if (moon) {
            moon[property] = parseFloat(value);
            console.log(`Updated moon ${moonId} ${property} to ${value}`);
        }
    }
}

