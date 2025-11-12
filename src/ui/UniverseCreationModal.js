/**
 * POLYMIR V3 - Enhanced System Generator Menu
 * 
 * Complete universe creation interface with planet customization,
 * biome settings, and schematic library management
 * 
 * v4 - Fixed all config references, defensive checks, and star lighting
 * Last updated: 2024-01-21
 */

// import { SimplifiedOrbitalSystem } from '../test/SimplifiedOrbitalSystem.js'; // OBSOLETE - Using UnifiedSystemEngine
// WorldGenerationAnimation removed - UI bloat
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
        
        // Make generators accessible globally for buttons
        window.systemGenerator = this;
        window.systemMenu = this;  // For PlanetCard compatibility
        window.systemConfigTab = this.systemConfigTab;
        
        // Global functions for UI buttons
        window.configureBiomeDetails = (biomeType) => {
            console.log(`🎨 Configuring biome details for: ${biomeType}`);
            this.biomeModal.show(biomeType);
        };
        
        window.launchBlockBench = () => {
            console.log('🛠️ Launching BlockBench...');
            // TODO: Implement BlockBench integration
            alert('BlockBench integration coming soon!');
        };
        
        // Initialize lighting systems
        this.starLightingSystem = null;
        this.megachunkManager = null;
        
        // Settings
        this.settings = {
            systemType: 'standard',
            seed: Math.floor(Math.random() * 1000000),
            complexity: 'medium',
            planetCount: 5,
            enableRingworlds: true,
            enableMoons: true,
            enableAsteroids: true
        };
        
        // Global defaults for planets
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
        
        // Loading indicator
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
        
        // Add CSS animation
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
    }
    
    /**
     * Create animated starfield background
     */
    createStarfieldBackground() {
        // Check if starfield already exists
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
        
        // Create multiple layers of stars
        for (let layer = 0; layer < 3; layer++) {
            const starsContainer = document.createElement('div');
            starsContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
            `;
            
            // Create stars for this layer
            const starCount = 150 - (layer * 40); // More stars in background layers
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
            
            // Add some colored stars
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
        
        // Add CSS animation for twinkling
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
        
        // Add occasional shooting stars
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
        // Remove any existing menu first
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
            height: auto;
            min-height: 600px;
            max-height: 95vh;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(10, 10, 40, 0.95) 100%);
            border: 2px solid #00FFFF;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            font-family: 'Courier New', monospace;
            color: #00FF00;
            z-index: 10000;
            box-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 10px; border-bottom: 2px solid #00FFFF; display: flex; justify-content: space-between; align-items: center;';
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
        
        // Tab Navigation - Keep biomes but remove redundant planet details
        const tabNav = document.createElement('div');
        tabNav.style.cssText = 'display: flex; background: rgba(0, 255, 255, 0.1); border-bottom: 2px solid #00FFFF;';
        tabNav.innerHTML = `
            <button class="tab-btn active" data-tab="system" style="flex: 1; padding: 10px; background: rgba(0, 255, 255, 0.2); color: #00FFFF; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                UNIVERSE BUILDER
            </button>
            <button class="tab-btn" data-tab="biomes" style="flex: 1; padding: 10px; background: transparent; color: #00FFFF; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                BIOME STRUCTURES
            </button>
            <button class="tab-btn" data-tab="library" style="flex: 1; padding: 10px; background: transparent; color: #00FFFF; border: none; cursor: pointer; font-weight: bold; font-size: 13px;">
                SCHEMATIC LIBRARY
            </button>
        `;
        
        // Status Bar with Generate Button
        const statusBar = document.createElement('div');
        statusBar.style.cssText = 'padding: 8px; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; border-bottom: 1px solid #00FFFF;';
        statusBar.innerHTML = `
            <button id="main-generate-btn" style="
                padding: 12px 30px;
                background: linear-gradient(135deg, #00FF00 0%, #00AA00 100%);
                color: black;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.6);
                font-family: 'Courier New', monospace;
                text-transform: uppercase;
                letter-spacing: 1px;
            ">🚀 GENERATE UNIVERSE</button>
        `;
        
        // Content Container
        const content = document.createElement('div');
        content.id = 'tab-content';
        content.style.cssText = 'flex: 1; overflow: visible; padding: 12px; position: relative;';
        
        // Removed action buttons section entirely
        /*
            <button id="generate-btn" style="
                padding: 10px 20px;
                margin: 0 5px;
                background: linear-gradient(135deg, #00FF00 0%, #00AA00 100%);
                color: black;
                border: none;
                border-radius: 5px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 0 15px rgba(0, 255, 0, 0.5);
            ">GENERATE SYSTEM</button>
            
            <button id="customize-btn" style="
                padding: 10px 20px;
                margin: 0 5px;
                background: linear-gradient(135deg, #00AAFF 0%, #0066CC 100%);
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                display: none;
            ">CUSTOMIZE PLANETS</button>
            
            <button id="start-btn" style="
                padding: 10px 20px;
                margin: 0 5px;
                background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
                color: black;
                border: none;
                border-radius: 5px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                display: none;
                box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
            ">START EXPLORATION</button>
        `;
        */
        
        // Assemble menu
        menu.appendChild(header);
        menu.appendChild(tabNav);
        menu.appendChild(statusBar);
        menu.appendChild(content);
        // Removed action buttons - Generate System is in the sidebar
        
        document.body.appendChild(menu);
        this.menuElement = menu;
        
        // Initialize with system tab after DOM is ready
        setTimeout(() => {
            this.showSystemTab();
            
            // Attach event listeners
            this.attachEventListeners();
        }, 0);
    }
    
    /**
     * Show system configuration tab
     */
    showSystemTab() {
        const content = document.getElementById('tab-content');
        // Use the simplified SystemConfigTab
        content.innerHTML = this.systemConfigTab.getHTML();
        
        // Attach event listeners for the new tab
        this.attachSystemTabListeners();
    }
    
    /**
     * Attach event listeners for system tab
     */
    attachSystemTabListeners() {
        // The simplified tab handles its own event listeners internally
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
                    <h2>⚠️ No System Generated</h2>
                    <p>Please generate a system first to customize planets</p>
                </div>
            `;
            return;
        }
        
        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h2 style="color: #FFD700;">🪐 Planet Customization</h2>
                <p style="color: #888888;">Configure each planet's properties individually</p>
            </div>
            <div id="planet-list"></div>
        `;
        
        // Create customizer for each planet
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
                <h2 style="color: #FFD700; margin-bottom: 20px;">🌍 Biome Structure Configuration</h2>
                
                <!-- Biome Structure Settings -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
                    ${this.createEnhancedBiomeCards()}
                </div>
                
                <!-- Structure Spawn Rules -->
                <div style="background: rgba(0, 255, 255, 0.1); border: 2px solid #00FFFF; border-radius: 15px; padding: 20px;">
                    <h3 style="color: #00FFFF; margin-bottom: 15px;">🏗️ Global Structure Settings</h3>
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
                type: 'desert', icon: '🏜️', color: '#F4A460',
                structures: ['Pyramids', 'Oasis Towns', 'Sand Temples'],
                vegetation: 10, resources: 'Rare minerals'
            },
            { 
                type: 'forest', icon: '🌲', color: '#228B22',
                structures: ['Tree Villages', 'Druid Circles', 'Hidden Groves'],
                vegetation: 90, resources: 'Wood, herbs'
            },
            { 
                type: 'ocean', icon: '🌊', color: '#4169E1',
                structures: ['Underwater Cities', 'Coral Reefs', 'Shipwrecks'],
                vegetation: 30, resources: 'Fish, pearls'
            },
            { 
                type: 'ice', icon: '❄️', color: '#E0FFFF',
                structures: ['Ice Fortresses', 'Frozen Labs', 'Crystal Caves'],
                vegetation: 5, resources: 'Ice crystals'
            },
            { 
                type: 'grassland', icon: '🌾', color: '#90EE90',
                structures: ['Villages', 'Windmills', 'Stone Circles'],
                vegetation: 60, resources: 'Crops, livestock'
            },
            { 
                type: 'mountains', icon: '⛰️', color: '#8B7355',
                structures: ['Monasteries', 'Mine Shafts', 'Dragon Lairs'],
                vegetation: 20, resources: 'Ore, gems'
            },
            { 
                type: 'lava', icon: '🌋', color: '#FF4500',
                structures: ['Obsidian Towers', 'Lava Forges', 'Fire Temples'],
                vegetation: 0, resources: 'Obsidian, sulfur'
            },
            { 
                type: 'crystal', icon: '💎', color: '#E6E6FA',
                structures: ['Crystal Spires', 'Energy Nodes', 'Prism Gardens'],
                vegetation: 15, resources: 'Energy crystals'
            },
            { 
                type: 'void', icon: '🌌', color: '#4B0082',
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
                ">⚙️ Configure</button>
            </div>
        `).join('');
    }
    
    /**
     * Create biome configuration cards (legacy)
     */
    createBiomeCards() {
        const biomes = [
            { type: 'desert', icon: '🏜️', color: '#F4A460' },
            { type: 'forest', icon: '🌲', color: '#228B22' },
            { type: 'ocean', icon: '🌊', color: '#4169E1' },
            { type: 'ice', icon: '❄️', color: '#E0FFFF' },
            { type: 'grassland', icon: '🌾', color: '#90EE90' },
            { type: 'mountains', icon: '⛰️', color: '#8B7355' },
            { type: 'lava', icon: '🌋', color: '#FF4500' },
            { type: 'crystal', icon: '💎', color: '#E6E6FA' },
            { type: 'void', icon: '🌌', color: '#4B0082' }
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
                ">⚙️ Configure</button>
            </div>
        `).join('');
    }
    
    /**
     * Show schematic library tab
     */
    showLibraryTab() {
        const content = document.getElementById('tab-content');
        content.innerHTML = `
            <div style="display: flex; gap: 20px; height: 100%; position: relative;">
                <!-- Library Sidebar -->
                <div style="width: 300px; background: rgba(0, 255, 255, 0.1); padding: 20px; border-radius: 10px; overflow-y: auto;">
                    <h3 style="color: #00FFFF; margin: 0 0 15px 0;">🏗️ Universal Schematic Library</h3>
                    
                    <!-- Upload Schematic Button -->
                    <button onclick="document.getElementById('schematic-upload').click()" style="
                        width: 100%;
                        padding: 10px;
                        margin-bottom: 10px;
                        background: linear-gradient(135deg, #00FF00 0%, #00AA00 100%);
                        color: black;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: bold;
                    ">📤 Upload Schematic</button>
                    <input type="file" id="schematic-upload" accept=".schematic,.nbt,.litematic" style="display: none;">
                    
                    <!-- BlockBench Creator Suite Button -->
                    <button onclick="window.launchBlockBench()" style="
                        width: 100%;
                        padding: 12px;
                        margin-bottom: 15px;
                        background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: bold;
                        box-shadow: 0 3px 10px rgba(255, 107, 53, 0.3);
                        transition: all 0.3s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        <span style="font-size: 20px;">🎨</span>
                        <span>BlockBench Creator</span>
                    </button>
                    
                    <input type="search" placeholder="Search schematics..." style="
                        width: 100%;
                        padding: 10px;
                        margin-bottom: 15px;
                        background: #001122;
                        color: #00FF00;
                        border: 1px solid #00FF00;
                    ">
                    
                    <div style="color: #888888; font-size: 12px; margin-bottom: 10px;">CATEGORIES</div>
                    <div id="schematic-categories" style="max-height: 400px; overflow-y: auto;">
                        <!-- Surface Structures -->
                        <div style="color: #FFD700; font-size: 11px; margin: 10px 0 5px 0; border-bottom: 1px solid #FFD70044;">PLANETARY</div>
                        <div class="category-item" style="padding: 8px; color: #00FF00; cursor: pointer;">🏛️ Ancient Ruins (12)</div>
                        <div class="category-item" style="padding: 8px; color: #00FF00; cursor: pointer;">🏘️ Settlements (15)</div>
                        <div class="category-item" style="padding: 8px; color: #00FF00; cursor: pointer;">⛏️ Mining Outposts (8)</div>
                        <div class="category-item" style="padding: 8px; color: #00FF00; cursor: pointer;">🏰 Dungeons (10)</div>
                        <div class="category-item" style="padding: 8px; color: #00FF00; cursor: pointer;">🌲 Natural Features (20)</div>
                        
                        <!-- Space Structures -->
                        <div style="color: #FFD700; font-size: 11px; margin: 10px 0 5px 0; border-bottom: 1px solid #FFD70044;">ORBITAL</div>
                        <div class="category-item" style="padding: 8px; color: #00FFFF; cursor: pointer;">🛸 Space Stations (7)</div>
                        <div class="category-item" style="padding: 8px; color: #00FFFF; cursor: pointer;">🚀 Derelict Ships (9)</div>
                        <div class="category-item" style="padding: 8px; color: #00FFFF; cursor: pointer;">🛰️ Satellites (5)</div>
                        <div class="category-item" style="padding: 8px; color: #00FFFF; cursor: pointer;">💫 Orbital Rings (3)</div>
                        
                        <!-- Deep Space -->
                        <div style="color: #FFD700; font-size: 11px; margin: 10px 0 5px 0; border-bottom: 1px solid #FFD70044;">DEEP SPACE</div>
                        <div class="category-item" style="padding: 8px; color: #9400D3; cursor: pointer;">🌌 Void Structures (4)</div>
                        <div class="category-item" style="padding: 8px; color: #9400D3; cursor: pointer;">⚫ Black Hole Stations (2)</div>
                        <div class="category-item" style="padding: 8px; color: #9400D3; cursor: pointer;">🌀 Wormhole Gates (3)</div>
                        
                        <!-- User Creations -->
                        <div style="color: #FFD700; font-size: 11px; margin: 10px 0 5px 0; border-bottom: 1px solid #FFD70044;">USER BUILDS</div>
                        <div class="category-item" style="padding: 8px; color: #FF69B4; cursor: pointer;">🎨 Custom Builds (0)</div>
                        <div class="category-item" style="padding: 8px; color: #FF69B4; cursor: pointer;">🏗️ BlockBench Models (0)</div>
                    </div>
                </div>
                
                <!-- Schematic Grid -->
                <div style="flex: 1; background: rgba(0, 0, 0, 0.5); padding: 20px; border-radius: 10px;">
                    <h3 style="color: #FFD700; margin: 0 0 15px 0;">Available Schematics</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;">
                        ${this.createSchematicThumbnails()}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Create schematic thumbnail cards
     */
    createSchematicThumbnails() {
        let schematics = [];

        if (this.schematicManager) {
            const allSchematics = this.schematicManager.getAllSchematics();
            schematics = Array.from(allSchematics.values()).filter(s =>
                s.category !== 'blocks' && s.tags && s.tags.length > 0
            );
        }

        if (schematics.length === 0) {
            schematics = [
                {
                    id: 'ancient_temple',
                    name: 'Ancient Temple',
                    size: { x: 50, y: 30, z: 50 },
                    tags: ['alien_ruins', 'dungeon']
                },
                {
                    id: 'mining_station',
                    name: 'Mining Station',
                    size: { x: 30, y: 20, z: 30 },
                    tags: ['mining_outpost', 'industrial']
                },
                {
                    id: 'crashed_frigate',
                    name: 'Crashed Frigate',
                    size: { x: 80, y: 25, z: 40 },
                    tags: ['crashed_ship', 'salvage']
                },
                {
                    id: 'desert_outpost',
                    name: 'Desert Outpost',
                    size: { x: 40, y: 15, z: 40 },
                    tags: ['settlement', 'trade']
                },
                {
                    id: 'crystal_cave',
                    name: 'Crystal Cave',
                    size: { x: 60, y: 40, z: 60 },
                    tags: ['dungeon', 'resources']
                },
                {
                    id: 'research_lab',
                    name: 'Research Lab',
                    size: { x: 35, y: 25, z: 35 },
                    tags: ['research_station', 'tech']
                }
            ];
        }

        return schematics.map(schem => {
            const sizeStr = schem.size
                ? `${schem.size.x}x${schem.size.y}x${schem.size.z}`
                : 'Unknown';

            return `
                <div class="schematic-card" data-schematic-id="${schem.id}" style="
                    background: rgba(0, 255, 255, 0.1);
                    border: 1px solid #00FFFF;
                    border-radius: 5px;
                    padding: 10px;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='rgba(0, 255, 255, 0.2)'; this.style.borderColor='#00FFAA'"
                   onmouseout="this.style.background='rgba(0, 255, 255, 0.1)'; this.style.borderColor='#00FFFF'"
                   onclick="window.systemGenerator?.previewSchematic('${schem.id}')">
                    <div style="
                        width: 100%;
                        height: 100px;
                        background: linear-gradient(135deg, #001122 0%, #003344 100%);
                        border-radius: 5px;
                        margin-bottom: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 40px;
                    ">🏗️</div>
                    <div style="color: #00FF00; font-size: 12px; font-weight: bold;">${schem.name}</div>
                    <div style="color: #888888; font-size: 10px;">${sizeStr}</div>
                    <div style="margin-top: 5px;">
                        ${schem.tags.map(tag => `<span style="
                            display: inline-block;
                            padding: 2px 6px;
                            margin: 2px;
                            background: #003344;
                            color: #00FFFF;
                            border-radius: 3px;
                            font-size: 9px;
                        ">${tag}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Back to menu button
        const backBtn = document.getElementById('back-to-menu-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.hide();
                // Return to homepage
                if (window.returnToHomepage) {
                    window.returnToHomepage();
                } else {
                    // Fallback: show the homepage directly
                    const homepage = document.getElementById('home-page');
                    if (homepage) {
                        homepage.style.display = 'flex';
                    }
                }
            };
        }
        
        // Main generate button
        const mainGenerateBtn = document.getElementById('main-generate-btn');
        if (mainGenerateBtn) {
            mainGenerateBtn.onclick = () => {
                this.generateSystem();
            };
        }
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = (e) => {
                // Update active tab styling
                document.querySelectorAll('.tab-btn').forEach(b => {
                    b.style.background = 'transparent';
                    b.classList.remove('active');
                });
                e.target.style.background = 'rgba(0, 255, 255, 0.2)';
                e.target.classList.add('active');
                
                // Show corresponding content
                const tab = e.target.dataset.tab;
                this.currentTab = tab;
                
                switch(tab) {
                    case 'system': this.showSystemTab(); break;
                    case 'biomes': this.showBiomesTab(); break;
                    case 'library': this.showLibraryTab(); break;
                }
            };
        });
        
        // Global/Custom toggle
        document.querySelectorAll('input[name="defaults-mode"]').forEach(radio => {
            radio.onchange = (e) => {
                this.useGlobalDefaults = e.target.value === 'global';
                document.getElementById('system-status').textContent = 
                    this.useGlobalDefaults ? 'Using Global Defaults' : 'Custom Per-Planet Mode';
            };
        });
        
        // Generate button is now in SystemConfigTabSimplified sidebar
        // We need to make generateSystem available globally since button uses window.systemGenerator
        window.systemGenerator = this;
        
        // The button in SystemConfigTabSimplified.js line 736 calls:
        // onclick="window.systemGenerator.generateSystem()"
        // So this should already work if window.systemGenerator is set
        
        // Start button (if exists - was removed from UI)
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
        
        // Use the local schematicManager from the menu
        if (!this.schematicManager) {
            console.log('No schematic manager available');
            return schematics;
        }
        
        // Get all schematics from library
        const allSchematics = this.schematicManager.getAllSchematics();
        
        // For each biome on planet, get applicable schematics
        const biomes = planet.biomes || planet.biomeDistribution || {};
        
        for (const [biome, weight] of Object.entries(biomes)) {
            if (weight > 0) {
                // Find schematics tagged for this biome
                for (const [id, schematic] of allSchematics) {
                    if (schematic.biomes && schematic.biomes.includes(biome)) {
                        // Use frequency from schematic settings
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
        
        console.log(`📦 Selected ${schematics.length} schematics for planet ${planet.name}`);
        return schematics;
    }
    
    /**
     * Remove planet from system (called by PlanetCard)
     */
    removePlanet(planetId) {
        console.log(`🗑️ Removing planet: ${planetId}`);
        if (this.systemConfigTab && this.systemConfigTab.removePlanet) {
            this.systemConfigTab.removePlanet(planetId);
        }
    }
    
    /**
     * Set planet preset (called by PlanetCard)
     */
    setPlanetPreset(planetId, presetId) {
        console.log(`🎨 Setting planet ${planetId} to preset: ${presetId}`);
    }

    /**
     * Open terrain painter for planet
     */
    openTerrainPainter(planetId) {
        console.log(`ud83cudfa8 Opening terrain painter for: ${planetId}`);

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
        console.log(`🏗️ Previewing schematic: ${schematicId}`);

        if (!this.schematicManager) {
            console.error('No schematic manager available');
            return;
        }

        const schematic = this.schematicManager.getSchematic(schematicId);
        if (!schematic) {
            console.error(`Schematic not found: ${schematicId}`);
            return;
        }

        console.log(`📦 Loaded schematic:`, schematic);
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
     * Generate system
     */
    async generateSystem() {
        console.log('🌌 Starting system generation... [v3 - All config refs fixed]');
        
        // Get FULL configuration from SystemConfigTab
        const fullConfig = this.systemConfigTab.getSystemConfig();
        console.log('📦 Full system config:', fullConfig);
        
        // LOG CRITICAL VALUES TO VERIFY WIRING
        console.log('✅ WIRING CHECK:');
        if (fullConfig.planets && fullConfig.planets.length > 0) {
            fullConfig.planets.forEach((p, i) => {
                console.log(`  Planet ${i}: gravity=${p.gravity}, water=${p.waterLevel}, biomes=`, p.biomes);
            });
        }
        
        // Gather base settings
        this.settings.systemType = document.getElementById('system-type')?.value || 'standard';
        this.settings.seed = parseInt(document.getElementById('seed')?.value) || Math.floor(Math.random() * 1000000);
        this.settings.starType = fullConfig.star?.type || 'yellow';
        
        // CRITICAL: Pass planet configs to generator!
        this.settings.star = fullConfig.star;
        this.settings.planets = fullConfig.planets;
        this.settings.asteroidBelts = fullConfig.asteroidBelts || [];
        
        // ADD A TEST RINGWORLD with biome distribution test!
        this.settings.ringworlds = fullConfig.ringworlds || [
            {
                name: 'Test Ringworld',
                radius: 500,        // Distance from center
                width: 100,         // Width of habitable surface
                thickness: 30,      // Structural thickness
                rotationSpeed: 0.0005,
                gravityStrength: 9.81,
                enableRimWalls: true,
                wallHeight: 50,
                // TEST: 50% green (temperate), 50% gray (barren)
                // Inner surface should be green (sun-facing)
                // Outer surface should be gray (space-facing)
                biomeDistribution: {
                    temperate: 0.5,  // Green - should appear on inner surface
                    barren: 0.5      // Gray - should appear on outer surface
                },
                temperature: 288,    // Earth-like for testing
                sunDirection: { x: 0, y: 1, z: 0 }  // Sun above ring
            }
        ];
        
        this.settings.features = {
            asteroids: fullConfig.asteroidBelts?.length > 0,
            ringworlds: true  // Force true for testing
        };
        
        console.log('🚀 Generating with settings:', this.settings);
        
        // CRITICAL FIX: Use the actual unified engine!
        const systemEngine = this.engine.unifiedEngine;
        
        if (!systemEngine) {
            console.error('❌ No unified engine available! Engine:', this.engine);
            return;
        }
        
        console.log('✅ Using UnifiedSystemEngine to create system...');
        
        // Create the system with FULL CONFIG PASSED THROUGH
        await systemEngine.createSystem({
            name: this.settings.systemName || 'New System',
            seed: this.settings.seed,
            star: fullConfig.star,
            planets: fullConfig.planets,
            ringworlds: this.settings.ringworlds, // From test ringworld above
            asteroidBelts: fullConfig.asteroidBelts,
            asteroidFields: fullConfig.asteroidFields
        });
        
        console.log('✅ System generation complete!');
        
        // Show loading indicator and guarantee cleanup
        try {
            this.showLoadingIndicator('Generating system...');
            // Simulate generation time
            await new Promise(resolve => setTimeout(resolve, 1000));
        } finally {
            this.hideLoadingIndicator();
        }
        // Hide menu after generation
        this.hide();
        
        return systemEngine;
    }
    
    /**
     * Generate using UNIFIED SYSTEM ENGINE
     */
    async generateWithOrbitalSystem() {
        console.log('🌟 Using UNIFIED SYSTEM ENGINE for generation');
        const system = this.engine.systemEngine;
        const config = this.systemConfigTab.getSystemConfig();
        
        // Use UNIFIED API - just pass the whole config!
        try {
            const result = await system.createSystem(config);
            console.log('✅ System created with UNIFIED ENGINE:', result);
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
            
            // Recursive for moon-of-moons
            if (child.children && child.children.length > 0) {
                this.createOrbitingBodies(system, child.id, child.children);
            }
        });
    }
    
    /**
     * Start exploration
     */
    async startExploration() {
        console.log('🎮 Starting game exploration! [Using UNIFIED SYSTEM ENGINE]');
        console.log('Current system:', this.currentSystem);
        console.log('SystemConfigTab available:', !!this.systemConfigTab);
        
        // Hide menu completely
        this.hide();
        if (this.container) {
            this.container.style.display = 'none';
            this.container.remove();
        }
        
        // CRITICAL: REMOVE THE STARFIELD THAT'S BLOCKING THE GAME VIEW!
        const starfield = document.getElementById('menu-starfield-bg');
        if (starfield) {
            starfield.remove();
            console.log('🌌 Removed menu starfield overlay');
        }
        
        // CRITICAL: Enable world so mouse input works!
        if (this.engine) {
            this.engine.worldExists = true;
            this.engine.gameSystemsInitialized = true;
            this.engine.worldLoaded = true;
            
            // Ensure engine is running (if it has a start method)
            if (this.engine.start) {
                if (!this.engine.isRunning) {
                    console.log('🚀 Starting engine render loop...');
                    this.engine.start();
                } else {
                    console.log('✅ Engine already running');
                }
            } else {
                console.log('⚠️ Engine is GUI-only mode, no start method');
                // In GUI-only mode, we need to initialize the real engine
                if (window.initEngine) {
                    console.log('🎮 Initializing real engine...');
                    await window.initEngine();
                    // The real engine should now be available
                    if (window.engine) {
                        this.engine = window.engine;
                        if (this.engine.start && !this.engine.isRunning) {
                            this.engine.start();
                        }
                    }
                }
            }
            
            // Use UNIFIED SYSTEM ENGINE
            let orbitalSystem = this.engine.systemEngine;
            
            if (!orbitalSystem) {
                console.error('❌ UNIFIED SYSTEM ENGINE not initialized!');
                return;
            }
            
            // Now we definitely have orbitalSystem
            if (orbitalSystem) {
                console.log('✅ Using UNIFIED SYSTEM ENGINE to spawn planets...');
                const config = this.systemConfigTab?.getSystemConfig() || this.currentSystem || {};
                
                // CRITICAL FIX: Pass the actual config to the system!
                console.log('🌌 Initializing test system with USER config:', config);
                console.log('   - Planets:', config.planets?.length || 0);
                console.log('   - Star:', config.star);
                
                // Clear any existing bodies first
                if (orbitalSystem.clearAllBodies) {
                    orbitalSystem.clearAllBodies();
                }
                
                // USE THE NEW generateFromConfig METHOD THAT HANDLES EVERYTHING!
                console.log('🚀 CALLING generateFromConfig WITH COMPLETE CONFIG!');
                
                // Build complete configuration from UI settings
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
                
                console.log('📦 Full config being passed:', fullConfig);
                
                // Call the new method that properly handles all settings
                orbitalSystem.generateFromConfig(fullConfig);
                
                // Debug: List what's actually in the scene
                console.log('🔍 Final scene contents:');
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
                
                // Check what bodies were created
                console.log('📊 System bodies:', orbitalSystem.bodies?.size || 0);
                console.log('📊 System planets:', orbitalSystem.planets?.size || 0);
                orbitalSystem.testBodies.forEach((body, id) => {
                    console.log(`  - Body ${id}:`, body.type, 'at', body.position);
                });
                orbitalSystem.testMeshes.forEach((mesh, id) => {
                    console.log(`  - Mesh ${id}:`, mesh.type, 'visible:', mesh.visible);
                });
            }
            
            // Position player in space above the system (like in the image)
            if (this.engine.playerCamera) {
                // Position player EVEN CLOSER to see the emissive star blocks!
                // Star is at 0,0,0, planets start around 80-200 units away
                this.engine.playerCamera.position.set(
                    60,   // Close enough to see star voxels
                    30,   // Lower height  
                    60    // Closer diagonal view
                );
                console.log('📷 Camera positioned at:', this.engine.playerCamera.position.toArray());
                
                // Set yaw/pitch to look at the star
                const dx = 0 - this.engine.playerCamera.position.x;  // Star is at 0,0,0
                const dy = 0 - this.engine.playerCamera.position.y;
                const dz = 0 - this.engine.playerCamera.position.z;
                const distanceXZ = Math.sqrt(dx*dx + dz*dz);
                
                // Calculate yaw (horizontal rotation)
                this.engine.yaw = Math.atan2(dx, dz);
                
                // Calculate pitch (vertical rotation)
                this.engine.pitch = -Math.atan2(dy, distanceXZ);
                
                // Apply the rotation immediately
                this.engine.playerCamera.rotation.order = 'YXZ';
                this.engine.playerCamera.rotation.y = this.engine.yaw;
                this.engine.playerCamera.rotation.x = this.engine.pitch;
                
                console.log(`📷 Camera at (${this.engine.playerCamera.position.x.toFixed(0)}, ${this.engine.playerCamera.position.y.toFixed(0)}, ${this.engine.playerCamera.position.z.toFixed(0)}) looking at star with yaw=${this.engine.yaw.toFixed(2)}, pitch=${this.engine.pitch.toFixed(2)}`);
            }
            
            // Initialize player controller if needed
            if (!this.engine.playerController && this.engine.initializeSphericalPlayerController) {
                console.log('Initializing player controller...');
                this.engine.initializeSphericalPlayerController();
            }
            
            // CRITICAL: Create player physics body for movement
            if (!this.engine.playerBody) {
                console.log('🎮 Creating player physics body...');
                this.engine.createPlayerPhysicsBody();
                
                // Sync physics body position with camera
                if (this.engine.playerBody && this.engine.playerCamera) {
                    this.engine.playerBody.position.set(
                        this.engine.playerCamera.position.x,
                        this.engine.playerCamera.position.y,
                        this.engine.playerCamera.position.z
                    );
                    console.log('📍 Physics body synced with camera at:', this.engine.playerCamera.position.toArray());
                }
            }
            
            // Set player as floating in space
            if (this.engine.playerController) {
                this.engine.playerController.inSpace = true;
                this.engine.playerController.onPlanet = false;
                this.engine.moveState.inSpace = true;
            }
            
            // Unpause game
            this.engine.paused = false;
            
            // Enable orbital visualization
            this.engine.orbitalTestEnabled = true;
            this.engine.systemInfoVisible = true;
            
            // Create a click prompt overlay for pointer lock
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
                <h2 style="margin: 0 0 20px 0; color: #00ff00;">🌌 SYSTEM READY</h2>
                <p style="margin: 10px 0;">Click to enter universe</p>
                <p style="font-size: 14px; color: #88ff88;">WASD=move | Space=jump | Q/E=orbit</p>
            `;
            document.body.appendChild(clickPrompt);
            
            // Add click handler to request pointer lock
            clickPrompt.onclick = () => {
                document.body.requestPointerLock();
                clickPrompt.remove();
                
                // Show crosshairs after lock
                if (this.engine.crosshairs) {
                    this.engine.crosshairs.style.display = 'block';
                }
                
                // Show controls notification
                if (this.engine.showNotification) {
                    this.engine.showNotification(
                        '🌌 WASD=move | Space=jump | O=orbits | G=gravity | Q/E=orbit control',
                        'rgba(0, 255, 0, 0.9)'
                    );
                }
            };
            
            console.log('✅ Game started! You can now explore!');
        }
    }
    
    /**
     * Create planet impostor (lightweight sphere) instead of full voxels
     * Following the architecture: start with impostor, generate voxels on approach
     */
    createPlanetImpostor(planetConfig, index) {
        if (!this.engine.scene || !THREE) return;
        
        // Create simple sphere mesh as impostor
        const geometry = new THREE.SphereGeometry(planetConfig.radius || 20, 16, 16);
        
        // Use basic material with planet color
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
        
        // Use Phong material for proper star lighting with day/night cycles
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.02, // Very subtle self-illumination
            shininess: 50,
            specular: 0x111111, // Subtle specular for realism
            // Material will be lit by star DirectionalLight
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(planetConfig.position);
        mesh.userData = {
            type: 'planet',
            id: planetConfig.id,
            schematicId: planetConfig.id,
            isImpostor: true,
            willGenerateVoxels: true,
            schematic: planetConfig // Store full data for lighting system
        };
        
        // Store base color for day/night cycle
        planetConfig.baseColor = new THREE.Color(color);
        planetConfig.mesh = mesh; // Reference for lighting updates
        
        // Add ring if planet has them
        if (planetConfig.hasRings) {
            planetConfig.ringRotation = new THREE.Quaternion();
            // Create ring impostor
            const ringGeometry = new THREE.RingGeometry(
                (planetConfig.radius || 20) * 1.5,
                (planetConfig.radius || 20) * 2.5,
                32
            );
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0xC4B5A0, // Saturn-like color
                side: THREE.DoubleSide,
                opacity: 0.4,
                transparent: true
            });
            const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
            ringMesh.rotation.x = Math.PI / 2;
            mesh.add(ringMesh);
            planetConfig.ringMesh = ringMesh;
        }
        
        // Add to scene
        this.engine.scene.add(mesh);
        
        // Track in test system
        if (this.engine.defaultStarSystem) {
            this.engine.defaultStarSystem.testBodies.set(planetConfig.id, planetConfig);
            this.engine.defaultStarSystem.testMeshes.set(planetConfig.id, mesh);
        }
        
        // Add to megachunk system if available
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
        
        // Orbital path visualization removed - was creating duplicate orbits
        
        console.log(`Created impostor for ${planetConfig.name} - voxels will generate on approach`);
    }
    
    /**
     * Show click to play overlay for pointer lock
     */
    showClickToPlayOverlay() {
        // Remove any existing overlay
        const existing = document.getElementById('click-to-play-overlay');
        if (existing) existing.remove();
        
        // Create overlay
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
                    🌌 CLICK TO START EXPLORING
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
        
        // Add click handler
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
        
        // Don't remove starfield - let it stay as backdrop for the game
        // The starfield becomes the game's background
    }
    
    /**
     * Load saved worlds
     */
    loadSavedWorlds() {
        // Check localStorage for saved configurations
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
        // Initialize physics manager for efficient distant body updates
        this.megachunkManager = new PhysicsManager({
            activationDistance: 1000,
            deactivationDistance: 1500,
            railsUpdateInterval: 30000, // 30 seconds for distant bodies
            quantumUpdateInterval: 16 // 60fps for near bodies
        });
        
        // Initialize star lighting system with megachunk integration
        this.starLightingSystem = new StarLightingSystem({
            maxActiveLights: 4,
            transitionSpeed: 0.02,
            skyboxUpdateInterval: 30000,
            activationRadius: 5000,
            deactivationRadius: 6000
        });
        
        this.starLightingSystem.initialize(this.engine.scene, this.megachunkManager);
        
        // Make globally accessible for debugging
        window.starLightingSystem = this.starLightingSystem;
        window.megachunkManager = this.megachunkManager;
        
        // Start lighting update loop
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
            
            // Update player position in both systems
            if (this.engine.camera) {
                this.starLightingSystem.updatePlayerPosition(this.engine.camera.position);
                this.megachunkManager.setPlayerPosition(this.engine.camera.position);
            }
            
            // Update megachunk manager (handles rails/quantum transitions)
            this.megachunkManager.update(deltaTime);
            
            // Update lighting
            this.starLightingSystem.update(deltaTime);
            
            // Update planet lighting for all tracked planets
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