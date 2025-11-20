/**
 * POLYMIR V3 - Planet Customization Panel
 *
 * Full control over planet parameters, biomes, and structures
 * Part of the Universe Creation Engine
 */

export class PlanetCustomizer {
    constructor(planetData, schematicLibrary) {
        this.planet = planetData;
        this.library = schematicLibrary;
        this.element = null;
        
        
        this.biomeDefaults = {
            desert: { vegetation: 5, resources: 30, terrain: 'rolling', structures: [] },
            forest: { vegetation: 85, resources: 60, terrain: 'rolling', structures: [] },
            ocean: { vegetation: 20, resources: 40, terrain: 'flat', structures: [] },
            ice: { vegetation: 5, resources: 50, terrain: 'mountainous', structures: [] },
            grassland: { vegetation: 60, resources: 45, terrain: 'rolling', structures: [] },
            mountains: { vegetation: 30, resources: 70, terrain: 'extreme', structures: [] },
            lava: { vegetation: 0, resources: 80, terrain: 'extreme', structures: [] },
            crystal: { vegetation: 10, resources: 90, terrain: 'mountainous', structures: [] }
        };
    }
    
    /**
     * Create the customization panel
     */
    createPanel() {
        const panel = document.createElement('div');
        panel.className = 'planet-customizer';
        panel.style.cssText = `
            background: rgba(0, 0, 0, 0.95);
            border: 2px solid #FE0089;
            border-radius: 10px;
            padding: 20px;
            margin: 10px 0;
            color: #FE0089;
            font-family: monospace;
        `;
        
        panel.innerHTML = `
            <h3 style="color: #FE0089; margin: 0 0 15px 0;">
                ê ${this.planet.name || 'Planet'} Configuration
            </h3>
            
            <!-- Basic Parameters -->
            <div class="param-section" style="margin-bottom: 20px;">
                <h4 style="color: #FE0089;">Basic Parameters</h4>
                
                <div style="margin: 10px 0;">
                    <label>Temperature:</label>
                    <select id="temp-${this.planet.id}" style="margin-left: 10px; background: #001122; color: #FE0089; border: 1px solid #FE0089;">
                        <option value="frozen"> Frozen (-200¬∞C to -50¬∞C)</option>
                        <option value="cold">® Cold (-50¬∞C to 0¬∞C)</option>
                        <option value="temperate" selected>ç Temperate (0¬∞C to 30¬∞C)</option>
                        <option value="hot">• Hot (30¬∞C to 100¬∞C)</option>
                        <option value="molten">ã Molten (100¬∞C+)</option>
                    </select>
                </div>
                
                <div style="margin: 10px 0;">
                    <label>Size (km):</label>
                    <input type="range" id="size-${this.planet.id}" 
                           min="1000" max="50000" value="${this.planet.radius * 2}" 
                           style="margin-left: 10px; width: 200px;">
                    <span id="size-val-${this.planet.id}">${this.planet.radius * 2} km</span>
                </div>
                
                <div style="margin: 10px 0;">
                    <label>Gravity (g):</label>
                    <input type="range" id="gravity-${this.planet.id}" 
                           min="0.1" max="3.0" step="0.1" value="1.0" 
                           style="margin-left: 10px; width: 200px;">
                    <span id="gravity-val-${this.planet.id}">1.0g</span>
                </div>
            </div>
            
            <!-- Biome Distribution -->
            <div class="biome-section" style="margin-bottom: 20px;">
                <h4 style="color: #FE0089;">Biome Distribution</h4>
                <div id="biomes-${this.planet.id}">
                    ${this.createBiomeSliders()}
                </div>
                <button onclick="this.normalizeBiomes()" style="
                    margin-top: 10px;
                    padding: 5px 10px;
                    background: #003344;
                    color: #FE0089;
                    border: 1px solid #FE0089;
                    cursor: pointer;
                ">Normalize to 100%</button>
            </div>
            
            <!-- Structure Frequency -->
            <div class="structure-section">
                <h4 style="color: #FE0089;">Structure Spawning</h4>
                
                <div style="margin: 10px 0;">
                    <label>Global Frequency:</label>
                    <select id="struct-freq-${this.planet.id}" style="margin-left: 10px; background: #001122; color: #FE0089; border: 1px solid #FE0089;">
                        <option value="none">None</option>
                        <option value="rare">Rare (1-5 per biome)</option>
                        <option value="common" selected>Common (5-15 per biome)</option>
                        <option value="abundant">Abundant (15-30 per biome)</option>
                        <option value="dense">Dense (30+ per biome)</option>
                    </select>
                </div>
                
                <div style="margin: 10px 0;">
                    <label>Structure Tags:</label>
                    <div id="struct-tags-${this.planet.id}" style="margin-top: 5px;">
                        ${this.createStructureTagCheckboxes()}
                    </div>
                </div>
                
                <button onclick="this.openBiomeSettings()" style="
                    margin-top: 10px;
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #FE0089 0%, #00AA00 100%);
                    color: black;
                    border: none;
                    border-radius: 5px;
                    font-weight: bold;
                    cursor: pointer;
                "> Advanced Biome Settings</button>
            </div>
        `;
        
        this.element = panel;
        this.attachEventListeners();
        return panel;
    }
    
    /**
     * Create biome distribution sliders
     */
    createBiomeSliders() {
        const biomes = ['desert', 'forest', 'ocean', 'ice', 'grassland', 'mountains'];
        const colors = {
            desert: '#F4A460',
            forest: '#228B22',
            ocean: '#4169E1',
            ice: '#E0FFFF',
            grassland: '#90EE90',
            mountains: '#8B7355'
        };
        
        return biomes.map(biome => `
            <div style="margin: 5px 0; display: flex; align-items: center;">
                <span style="width: 100px; color: ${colors[biome]};">
                    ${biome.charAt(0).toUpperCase() + biome.slice(1)}:
                </span>
                <input type="range" id="biome-${biome}-${this.planet.id}" 
                       min="0" max="100" value="${100 / biomes.length}" 
                       style="width: 150px; margin: 0 10px;">
                <span id="biome-val-${biome}-${this.planet.id}">${Math.floor(100 / biomes.length)}%</span>
            </div>
        `).join('');
    }
    
    /**
     * Create structure tag checkboxes
     */
    createStructureTagCheckboxes() {
        const tags = [
            'alien_ruins',
            'mining_outpost',
            'ancient_temple',
            'crashed_ship',
            'research_station',
            'military_base',
            'settlement',
            'monument'
        ];
        
        return tags.map(tag => `
            <label style="display: inline-block; margin: 5px; color: #88FF88;">
                <input type="checkbox" id="tag-${tag}-${this.planet.id}" value="${tag}">
                ${tag.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </label>
        `).join('');
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        
        const sizeSlider = document.getElementById(`size-${this.planet.id}`);
        if (sizeSlider) {
            sizeSlider.oninput = (e) => {
                document.getElementById(`size-val-${this.planet.id}`).textContent = e.target.value + ' km';
                this.planet.radius = parseInt(e.target.value) / 2;
            };
        }
        
        
        const gravitySlider = document.getElementById(`gravity-${this.planet.id}`);
        if (gravitySlider) {
            gravitySlider.oninput = (e) => {
                document.getElementById(`gravity-val-${this.planet.id}`).textContent = e.target.value + 'g';
                this.planet.gravity = parseFloat(e.target.value);
            };
        }
        
        
        const biomes = ['desert', 'forest', 'ocean', 'ice', 'grassland', 'mountains'];
        biomes.forEach(biome => {
            const slider = document.getElementById(`biome-${biome}-${this.planet.id}`);
            if (slider) {
                slider.oninput = (e) => {
                    document.getElementById(`biome-val-${biome}-${this.planet.id}`).textContent = e.target.value + '%';
                };
            }
        });
    }
    
    /**
     * Normalize biome percentages to 100%
     */
    normalizeBiomes() {
        const biomes = ['desert', 'forest', 'ocean', 'ice', 'grassland', 'mountains'];
        let total = 0;
        
        
        biomes.forEach(biome => {
            const slider = document.getElementById(`biome-${biome}-${this.planet.id}`);
            if (slider) {
                total += parseInt(slider.value);
            }
        });
        
        
        if (total > 0) {
            biomes.forEach(biome => {
                const slider = document.getElementById(`biome-${biome}-${this.planet.id}`);
                if (slider) {
                    const normalized = Math.floor((parseInt(slider.value) / total) * 100);
                    slider.value = normalized;
                    document.getElementById(`biome-val-${biome}-${this.planet.id}`).textContent = normalized + '%';
                }
            });
        }
    }
    
    /**
     * Get configuration data
     */
    getConfiguration() {
        const config = {
            temperature: document.getElementById(`temp-${this.planet.id}`)?.value,
            size: parseInt(document.getElementById(`size-${this.planet.id}`)?.value),
            gravity: parseFloat(document.getElementById(`gravity-${this.planet.id}`)?.value),
            biomes: {},
            structureFrequency: document.getElementById(`struct-freq-${this.planet.id}`)?.value,
            structureTags: []
        };
        
        
        const biomes = ['desert', 'forest', 'ocean', 'ice', 'grassland', 'mountains'];
        biomes.forEach(biome => {
            const value = document.getElementById(`biome-${biome}-${this.planet.id}`)?.value;
            if (value) {
                config.biomes[biome] = parseInt(value);
            }
        });
        
        
        const tags = document.querySelectorAll(`input[id^="tag-"][id$="-${this.planet.id}"]:checked`);
        tags.forEach(tag => {
            config.structureTags.push(tag.value);
        });
        
        return config;
    }
}

