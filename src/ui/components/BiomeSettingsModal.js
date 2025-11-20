/**
 * POLYMIR V3 - Biome Settings Modal
 *
 * Detailed configuration for individual biome types
 * Controls vegetation, resources, terrain, and structure spawning
 */

export class BiomeSettingsModal {
    constructor(biomeType, planetId, schematicLibrary) {
        this.biomeType = biomeType;
        this.planetId = planetId;
        this.library = schematicLibrary;
        this.modalElement = null;
        
        
        this.settings = {
            vegetationDensity: 50,
            resourceRarity: 'common',
            terrainVariation: 'rolling',
            structureTags: [],
            structureFrequency: 'common'
        };
    }
    
    /**
     * Get current settings
     */
    getSettings() {
        return this.settings;
    }
    
    /**
     * Get biome distribution (for simplified UI compatibility)
     */
    getBiomeDistribution() {
        
        return {
            [this.biomeType]: 1.0 
        };
    }
    
    /**
     * Show the modal
     */
    show(biomeType) {
        
        if (biomeType) {
            this.biomeType = biomeType;
        }
        
        
        this.destroy();
        
        
        this.createModal();
        
        this.modalElement.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
    
    /**
     * Create the modal UI
     */
    createModal() {
        
        const existingModal = document.querySelector('.biome-settings-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.className = 'biome-settings-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10001;
            display: none;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 600px;
            max-height: 80vh;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.98) 0%, rgba(10, 10, 40, 0.95) 100%);
            border: 3px solid #00FFFF;
            border-radius: 15px;
            padding: 30px;
            color: #00FF00;
            font-family: monospace;
            overflow-y: auto;
        `;
        
        content.innerHTML = `
            <h2 style="color: #FFD700; margin: 0 0 20px 0;">
                ${(this.biomeType || 'DEFAULT').toUpperCase()} Biome Settings
            </h2>
            
            <!-- Vegetation Density -->
            <div style="margin-bottom: 25px;">
                <h3 style="color: #00FFFF;">Vegetation Density</h3>
                <input type="range" id="vegetation-density" 
                       min="0" max="100" value="${this.settings.vegetationDensity}"
                       style="width: 100%; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; font-size: 12px;">
                    <span>Barren (0%)</span>
                    <span id="vegetation-value">${this.settings.vegetationDensity}%</span>
                    <span>Lush (100%)</span>
                </div>
            </div>
            
            <!-- Resource Rarity -->
            <div style="margin-bottom: 25px;">
                <h3 style="color: #00FFFF;">Resource Rarity</h3>
                <select id="resource-rarity" style="
                    width: 100%;
                    padding: 10px;
                    background: #001122;
                    color: #00FF00;
                    border: 1px solid #00FF00;
                    font-size: 14px;
                ">
                    <option value="abundant">Abundant - Resources everywhere</option>
                    <option value="common" selected>Common - Regular distribution</option>
                    <option value="uncommon">Uncommon - Scattered deposits</option>
                    <option value="rare">Rare - Hard to find</option>
                    <option value="legendary">Legendary - Extremely rare</option>
                </select>
            </div>
            
            <!-- Terrain Variation -->
            <div style="margin-bottom: 25px;">
                <h3 style="color: #00FFFF;">Terrain Variation</h3>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                    ${this.createTerrainOptions()}
                </div>
            </div>
            
            <!-- Structure Configuration -->
            <div style="margin-bottom: 25px;">
                <h3 style="color: #00FFFF;">Structure Spawning</h3>
                
                <div style="margin-bottom: 15px;">
                    <label>Frequency:</label>
                    <select id="structure-frequency" style="
                        margin-left: 10px;
                        padding: 5px;
                        background: #001122;
                        color: #00FF00;
                        border: 1px solid #00FF00;
                    ">
                        <option value="none">None</option>
                        <option value="rare">Rare</option>
                        <option value="common" selected>Common</option>
                        <option value="abundant">Abundant</option>
                    </select>
                </div>
                
                <div>
                    <label>Allowed Structure Types:</label>
                    <div id="structure-tags" style="
                        margin-top: 10px;
                        padding: 10px;
                        background: rgba(0, 255, 255, 0.1);
                        border-radius: 5px;
                        max-height: 150px;
                        overflow-y: auto;
                    ">
                        ${this.createStructureTagList()}
                    </div>
                </div>
            </div>
            
            <!-- Preview Section -->
            <div style="margin-bottom: 25px; padding: 15px; background: rgba(0, 0, 0, 0.5); border-radius: 10px;">
                <h3 style="color: #FFD700;">Settings Preview</h3>
                <div id="settings-preview" style="font-size: 12px; color: #88FF88;">
                    ${this.generatePreview()}
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div style="text-align: center;">
                <button id="apply-btn" style="
                    padding: 12px 24px;
                    margin: 0 10px;
                    background: linear-gradient(135deg, #00FF00 0%, #00AA00 100%);
                    color: black;
                    border: none;
                    border-radius: 5px;
                    font-weight: bold;
                    cursor: pointer;
                ">Apply Settings</button>
                
                <button id="reset-btn" style="
                    padding: 12px 24px;
                    margin: 0 10px;
                    background: #444444;
                    color: white;
                    border: 1px solid #888888;
                    border-radius: 5px;
                    cursor: pointer;
                ">Reset to Default</button>
                
                <button id="close-btn" style="
                    padding: 12px 24px;
                    margin: 0 10px;
                    background: #AA0000;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                ">Close</button>
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        this.modalElement = modal;
        
        this.attachEventListeners();
    }
    
    /**
     * Create terrain option buttons
     */
    createTerrainOptions() {
        const options = [
            { value: 'flat', label: 'Flat', desc: 'Minimal elevation' },
            { value: 'rolling', label: 'Rolling', desc: 'Gentle hills' },
            { value: 'hilly', label: 'Hilly', desc: 'Moderate terrain' },
            { value: 'mountainous', label: 'Mountainous', desc: 'Steep terrain' },
            { value: 'extreme', label: 'Extreme', desc: 'Cliffs & canyons' },
            { value: 'chaotic', label: 'Chaotic', desc: 'Unpredictable' }
        ];
        
        return options.map(opt => `
            <label style="
                display: flex;
                align-items: center;
                padding: 10px;
                background: rgba(0, 255, 255, 0.1);
                border: 2px solid transparent;
                border-radius: 5px;
                cursor: pointer;
            " class="terrain-option">
                <input type="radio" name="terrain" value="${opt.value}" 
                       ${opt.value === 'rolling' ? 'checked' : ''}>
                <div style="margin-left: 10px;">
                    <div>${opt.label}</div>
                    <div style="font-size: 10px; color: #888888;">${opt.desc}</div>
                </div>
            </label>
        `).join('');
    }
    
    /**
     * Create structure tag list
     */
    createStructureTagList() {
        
        const tags = [
            { id: 'alien_ruins', name: 'Alien Ruins', count: 12 },
            { id: 'mining_outpost', name: 'Mining Outpost', count: 8 },
            { id: 'ancient_temple', name: 'Ancient Temple', count: 5 },
            { id: 'crashed_ship', name: 'Crashed Ship', count: 15 },
            { id: 'research_station', name: 'Research Station', count: 6 },
            { id: 'settlement', name: 'Settlement', count: 20 },
            { id: 'monument', name: 'Monument', count: 10 },
            { id: 'dungeon', name: 'Dungeon', count: 7 }
        ];
        
        return tags.map(tag => `
            <label style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 5px;
                margin: 2px 0;
                cursor: pointer;
            ">
                <span>
                    <input type="checkbox" value="${tag.id}">
                    ${tag.name}
                </span>
                <span style="color: #888888; font-size: 10px;">
                    ${tag.count} schematics
                </span>
            </label>
        `).join('');
    }
    
    /**
     * Generate settings preview
     */
    generatePreview() {
        return `
            <div>Vegetation: ${this.settings.vegetationDensity}% coverage</div>
            <div>Resources: ${this.settings.resourceRarity} distribution</div>
            <div>Terrain: ${this.settings.terrainVariation} variation</div>
            <div>Structures: ${this.settings.structureFrequency} spawning</div>
            <div>Tags: ${this.settings.structureTags.length > 0 ? this.settings.structureTags.join(', ') : 'None selected'}</div>
        `;
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        
        const vegSlider = document.getElementById('vegetation-density');
        if (vegSlider) {
            vegSlider.oninput = (e) => {
                document.getElementById('vegetation-value').textContent = e.target.value + '%';
                this.settings.vegetationDensity = parseInt(e.target.value);
                this.updatePreview();
            };
        }
        
        
        const resourceSelect = document.getElementById('resource-rarity');
        if (resourceSelect) {
            resourceSelect.onchange = (e) => {
                this.settings.resourceRarity = e.target.value;
                this.updatePreview();
            };
        }
        
        
        document.querySelectorAll('input[name="terrain"]').forEach(radio => {
            radio.onchange = (e) => {
                this.settings.terrainVariation = e.target.value;
                this.updatePreview();
            };
        });
        
        
        const freqSelect = document.getElementById('structure-frequency');
        if (freqSelect) {
            freqSelect.onchange = (e) => {
                this.settings.structureFrequency = e.target.value;
                this.updatePreview();
            };
        }
        
        
        document.getElementById('apply-btn')?.addEventListener('click', () => this.applySettings());
        document.getElementById('reset-btn')?.addEventListener('click', () => this.resetSettings());
        document.getElementById('close-btn')?.addEventListener('click', () => this.close());
    }
    
    /**
     * Update preview
     */
    updatePreview() {
        const preview = document.getElementById('settings-preview');
        if (preview) {
            preview.innerHTML = this.generatePreview();
        }
    }
    
    /**
     * Apply settings
     */
    applySettings() {
        
        this.settings.structureTags = [];
        document.querySelectorAll('#structure-tags input[type="checkbox"]:checked').forEach(cb => {
            this.settings.structureTags.push(cb.value);
        });
        
        console.log(`Applied settings for ${this.biomeType}:`, this.settings);
        
        
        if (this.onApply) {
            this.onApply(this.settings);
        }
        
        this.close();
    }
    
    /**
     * Reset to defaults
     */
    resetSettings() {
        this.settings = {
            vegetationDensity: 50,
            resourceRarity: 'common',
            terrainVariation: 'rolling',
            structureTags: [],
            structureFrequency: 'common'
        };
        
        
        document.getElementById('vegetation-density').value = 50;
        document.getElementById('vegetation-value').textContent = '50%';
        document.getElementById('resource-rarity').value = 'common';
        document.querySelector('input[name="terrain"][value="rolling"]').checked = true;
        document.getElementById('structure-frequency').value = 'common';
        document.querySelectorAll('#structure-tags input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        this.updatePreview();
    }
    
    /**
     * Close modal
     */
    close() {
        if (this.modalElement) {
            this.modalElement.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
    
    /**
     * Destroy modal
     */
    destroy() {
        
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
        
        
        const allModals = document.querySelectorAll('.biome-settings-modal');
        allModals.forEach(modal => modal.remove());
        
        document.body.style.overflow = ''; // Restore scrolling
    }
}

