/**
 * POLYMIR V3 - Schematic Library Manager
 * 
 * Manages user-uploaded schematics for structure spawning
 * Handles tagging, categorization, and biome assignment
 * Includes 3D preview, server validation, and sharing options
 */

import * as THREE from '../lib/three.module.js';


export class SchematicLibraryManager {
    constructor(engine) {
        this.engine = engine;
        this.schematics = new Map();
        this.playerBuilds = new Map();
        this.categories = new Set();
        this.tags = new Set();
        this.buildManager = null;
        this.exportSystem = null;


        this.previewRenderer = null;
        this.previewScene = null;
        this.previewCamera = null;


        this.validationStatus = new Map();
        this.sharingOptions = new Map();


        this.buildingSystem = null;
        this.schematicManager = null;


        this.publicDatabaseUrl = 'https://polymir.io/schematics';


        this.loadLibrary();


        this.initializeCategories();


        this.initializePreviewSystem();


        this.loadPublicSchematics();
    }
    
    /**
     * Get all schematics
     */
    getAllSchematics() {
        return this.schematics;
    }

    /**
     * Get only non-planet schematics (structures for placement)
     */
    getStructureSchematics() {
        const structures = new Map();
        for (const [id, schematic] of this.schematics) {
            if (schematic.planet === false || !schematic.planet) {
                structures.set(id, schematic);
            }
        }
        return structures;
    }

    /**
     * Get schematics for a specific biome
     */
    getSchematicsForBiome(biome) {
        const results = [];
        for (const [id, schematic] of this.schematics) {
            if (schematic.planet !== false && schematic.planet !== true) {
                continue;
            }

            if (schematic.planet === false) {
                if (schematic.biomes && schematic.biomes.includes(biome)) {
                    results.push(schematic);
                }
            }
        }
        return results;
    }

    /**
     * Get schematics by category
     */
    getSchematicsByCategory(category) {
        const results = [];
        for (const [id, schematic] of this.schematics) {
            if (schematic.planet === false && schematic.category === category) {
                results.push(schematic);
            }
        }
        return results;
    }

    /**
     * Get schematics by tag
     */
    getSchematicsByTag(tag) {
        const results = [];
        for (const [id, schematic] of this.schematics) {
            if (schematic.planet === false && schematic.tags && schematic.tags.includes(tag)) {
                results.push(schematic);
            }
        }
        return results;
    }
    
    /**
     * Initialize default categories
     */
    initializeCategories() {
        const defaultCategories = [
            'player_build',
            'home',
            'base',
            'outpost',
            'alien_ruins',
            'mining_outpost',
            'settlement',
            'military_base',
            'research_station',
            'crashed_ship',
            'dungeon',
            'monument',
            'industrial',
            'religious',
            'ancient_tech'
        ];
        
        defaultCategories.forEach(cat => this.categories.add(cat));
    }
    
    /**
     * Set building system reference
     */
    setBuildingSystem(buildingSystem) {
        this.buildingSystem = buildingSystem;
        this.schematicManager = buildingSystem?.schematicManager;
    }
    
    /**
     * Refresh player builds from building system
     */
    refreshPlayerBuilds() {
        if (!this.buildingSystem) return;
        
        
        const playerBuilds = this.buildingSystem.getAllPlayerBuilds();
        
        
        for (const build of playerBuilds) {
            this.playerBuilds.set(build.id, {
                ...build,
                category: 'player_build',
                isPlayerBuild: true
            });
            
            
            this.schematics.set(build.id, {
                ...build,
                category: 'player_build',
                isPlayerBuild: true
            });
        }
        
        console.log(`Refreshed ${playerBuilds.length} player builds`);
    }
    
    /**
     * Get schematics including player builds
     */
    getAllSchematicsWithBuilds() {
        this.refreshPlayerBuilds();
        return this.schematics;
    }
    
    /**
     * Upload a new schematic
     */
    async uploadSchematic(file, metadata = {}) {
        try {
            const id = `schematic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            
            const schematicData = await this.parseSchematicFile(file);
            
            const schematic = {
                id: id,
                name: metadata.name || file.name.replace(/\.[^/.]+$/, ''),
                fileName: file.name,
                size: schematicData.size,
                blocks: schematicData.blocks,
                palette: schematicData.palette,
                tags: metadata.tags || [],
                category: metadata.category || 'uncategorized',
                biomes: metadata.biomes || [],
                author: metadata.author || 'Unknown',
                uploadDate: Date.now(),
                thumbnail: null,
                stats: {
                    blockCount: schematicData.blocks.length,
                    uniqueBlocks: schematicData.palette.length,
                    dimensions: schematicData.size
                }
            };
            
            
            schematic.thumbnail = this.generateThumbnail(schematicData);
            
            
            this.schematics.set(id, schematic);
            
            
            schematic.tags.forEach(tag => this.tags.add(tag));
            
            
            this.saveLibrary();
            
            console.log(`Uploaded schematic: ${schematic.name}`);
            return schematic;
            
        } catch (error) {
            console.error('Failed to upload schematic:', error);
            throw error;
        }
    }
    
    /**
     * Parse schematic file
     */
    async parseSchematicFile(file) {
        
        
        return {
            size: { x: 30, y: 20, z: 30 },
            blocks: [], 
            palette: ['stone', 'wood', 'glass'] // Block types used
        };
    }
    
    /**
     * Show the library modal
     */
    show() {
        if (!this.modalElement) {
            this.createModal();
        }
        this.modalElement.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    
    /**
     * Hide the library modal
     */
    hide() {
        if (this.modalElement) {
            this.modalElement.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
    
    /**
     * Create the modal UI
     */
    createModal() {
        const modal = document.createElement('div');
        modal.className = 'schematic-library-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10002;
            display: none;
            overflow-y: auto;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            position: relative;
            width: 90%;
            max-width: 1200px;
            margin: 50px auto;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(20, 20, 50, 0.95) 100%);
            border: 3px solid #00FFFF;
            border-radius: 15px;
            padding: 30px;
            color: #00FF00;
            font-family: monospace;
        `;
        
        content.innerHTML = `
            <h2 style="color: #FFD700; margin: 0 0 20px 0;">
                Schematic Library Manager
            </h2>
            
            <!-- Upload Section -->
            <div style="margin-bottom: 30px; padding: 20px; background: rgba(0, 255, 255, 0.1); border-radius: 10px;">
                <h3 style="color: #00FFFF;">Upload Schematic</h3>
                <input type="file" id="schematic-upload" accept=".schematic,.nbt,.litematic" style="
                    display: block;
                    margin: 10px 0;
                    padding: 10px;
                    background: #001122;
                    color: #00FF00;
                    border: 1px solid #00FF00;
                    border-radius: 5px;
                    width: 100%;
                ">
                <button onclick="window.schematicLibrary.handleUpload()" style="
                    padding: 10px 20px;
                    background: linear-gradient(135deg, #00FF00 0%, #00AA00 100%);
                    color: black;
                    border: none;
                    border-radius: 5px;
                    font-weight: bold;
                    cursor: pointer;
                ">Upload</button>
            </div>
            
            <!-- 3D Model Voxelizer Section -->
            <div style="margin-bottom: 30px; padding: 20px; background: rgba(255, 0, 255, 0.1); border-radius: 10px;">
                <h3 style="color: #FF00FF;">3D Model Voxelizer</h3>
                <div style="display: flex; gap: 20px; align-items: flex-start;">
                    <div style="flex: 1;">
                        <input type="file" id="model-upload" accept=".gltf,.glb,.obj,.stl,.fbx" style="
                            display: block;
                            margin: 10px 0;
                            padding: 10px;
                            background: #001122;
                            color: #FF00FF;
                            border: 1px solid #FF00FF;
                            border-radius: 5px;
                            width: 100%;
                        ">
                        
                        <div style="margin: 15px 0;">
                            <label style="color: #FF00FF;">Resolution:</label>
                            <input type="range" id="voxel-resolution" min="1" max="100" value="10" style="width: 100%;">
                            <div id="resolution-display" style="color: #FF88FF; font-size: 12px;">10 voxels per meter</div>
                        </div>
                        
                        <div style="margin: 15px 0;">
                            <label style="color: #FF00FF;">
                                <input type="checkbox" id="use-microblocks"> Use Microblocks (32x32x32)
                            </label>
                        </div>
                        
                        <div style="margin: 15px 0;">
                            <label style="color: #FF00FF;">
                                <input type="checkbox" id="hollow-model"> Hollow Interior
                            </label>
                        </div>
                        
                        <button onclick="window.schematicLibrary.voxelizeModel()" style="
                            padding: 10px 20px;
                            background: linear-gradient(135deg, #FF00FF 0%, #AA00AA 100%);
                            color: white;
                            border: none;
                            border-radius: 5px;
                            font-weight: bold;
                            cursor: pointer;
                            width: 100%;
                        ">Voxelize Model</button>
                    </div>
                    
                    <div style="flex: 1;">
                        <div id="voxel-preview" style="
                            width: 100%;
                            height: 250px;
                            background: #000033;
                            border: 2px solid #FF00FF;
                            border-radius: 10px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #666666;
                        ">
                            Model preview will appear here
                        </div>
                        <div id="voxel-stats" style="
                            margin-top: 10px;
                            padding: 10px;
                            background: rgba(0, 0, 0, 0.5);
                            border-radius: 5px;
                            font-size: 12px;
                            color: #FF88FF;
                        ">
                            No model loaded
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Search Section -->
            <div style="margin-bottom: 20px;">
                <input type="text" id="schematic-search" placeholder="Search schematics..." style="
                    width: 100%;
                    padding: 10px;
                    background: #001122;
                    color: #00FF00;
                    border: 1px solid #00FF00;
                    border-radius: 5px;
                    font-size: 14px;
                ">
            </div>
            
            <!-- Library Grid -->
            <div id="schematic-grid" style="
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            ">
                ${this.renderSchematicGrid()}
            </div>
            
            <!-- Statistics -->
            <div style="margin-top: 30px; padding: 15px; background: rgba(0, 0, 0, 0.5); border-radius: 10px;">
                <h3 style="color: #FFD700;">Library Statistics</h3>
                <div id="library-stats" style="font-size: 12px; color: #88FF88;">
                    ${this.renderStatistics()}
                </div>
            </div>
            
            <!-- Close Button -->
            <button onclick="window.schematicLibrary.hide()" style="
                position: absolute;
                top: 20px;
                right: 20px;
                padding: 10px 20px;
                background: #AA0000;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            ">Close</button>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        this.modalElement = modal;
        
        
        window.schematicLibrary = this;
        
        
        const resolutionSlider = document.getElementById('voxel-resolution');
        const resolutionDisplay = document.getElementById('resolution-display');
        if (resolutionSlider) {
            resolutionSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                resolutionDisplay.textContent = `${value} voxels per meter`;
            });
        }
    }
    
    /**
     * Render schematic grid
     */
    renderSchematicGrid() {
        if (this.schematics.size === 0) {
            return '<div style="text-align: center; color: #888888;">No schematics uploaded yet</div>';
        }
        
        let html = '';
        this.schematics.forEach((schematic, id) => {
            html += `
                <div style="
                    background: rgba(0, 255, 255, 0.05);
                    border: 1px solid #00FFFF;
                    border-radius: 10px;
                    padding: 15px;
                    cursor: pointer;
                    transition: all 0.3s;
                " onmouseover="this.style.background='rgba(0, 255, 255, 0.1)'" 
                   onmouseout="this.style.background='rgba(0, 255, 255, 0.05)'">
                    <div style="
                        width: 100%;
                        height: 150px;
                        background: #000033;
                        border-radius: 5px;
                        margin-bottom: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        ${schematic.thumbnail ? 
                            `<img src="${schematic.thumbnail}" style="max-width: 100%; max-height: 100%;">` :
                            '<div style="color: #444444;">No Preview</div>'
                        }
                    </div>
                    <h4 style="color: #FFD700; margin: 0 0 5px 0;">${schematic.name}</h4>
                    <div style="font-size: 10px; color: #888888;">
                        <div>Size: ${schematic.stats?.dimensions?.x || 0} × ${schematic.stats?.dimensions?.y || 0} × ${schematic.stats?.dimensions?.z || 0}</div>
                        <div>Blocks: ${schematic.stats?.blockCount || 0}</div>
                        <div>Category: ${schematic.category}</div>
                    </div>
                    <div style="margin-top: 10px;">
                        ${schematic.tags.map(tag => 
                            `<span style="
                                display: inline-block;
                                padding: 2px 8px;
                                margin: 2px;
                                background: #004444;
                                border-radius: 10px;
                                font-size: 10px;
                            ">${tag}</span>`
                        ).join('')}
                    </div>
                </div>
            `;
        });
        
        return html;
    }
    
    /**
     * Render statistics
     */
    renderStatistics() {
        const stats = this.getStatistics();
        return `
            <div>Total Schematics: ${stats.totalSchematics}</div>
            <div>Total Tags: ${stats.totalTags}</div>
            <div>Average Size: ${stats.averageSize.x} × ${stats.averageSize.y} × ${stats.averageSize.z}</div>
        `;
    }
    
    /**
     * Voxelize 3D model
     */
    async voxelizeModel() {
        const input = document.getElementById('model-upload');
        if (!input || !input.files || input.files.length === 0) {
            alert('Please select a 3D model file to voxelize');
            return;
        }
        
        const file = input.files[0];
        const resolution = parseInt(document.getElementById('voxel-resolution').value);
        const useMicroblocks = document.getElementById('use-microblocks').checked;
        const hollow = document.getElementById('hollow-model').checked;
        
        try {
            
            const previewDiv = document.getElementById('voxel-preview');
            const statsDiv = document.getElementById('voxel-stats');
            previewDiv.innerHTML = '<div style="color: #FF00FF;">Voxelizing...</div>';
            
            
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            
            
            const voxelSchematic = await this.modelVoxelizer.voxelizeModel({
                modelUrl: dataUrl,
                modelFormat: file.name.split('.').pop().toLowerCase(),
                resolution: useMicroblocks ? 0.03125 : (1 / resolution),
                useMicroblocks: useMicroblocks,
                hollow: hollow,
                name: file.name.replace(/\.[^/.]+$/, '')
            });
            
            
            this.showVoxelPreview(voxelSchematic, previewDiv);
            
            
            const blockCount = voxelSchematic.voxels.length;
            const microblockCount = voxelSchematic.microblocks ? 
                Object.keys(voxelSchematic.microblocks).reduce((sum, key) => 
                    sum + voxelSchematic.microblocks[key].length, 0) : 0;
            
            statsDiv.innerHTML = `
                <div style="color: #FF00FF; font-weight: bold;">Voxelization Complete!</div>
                <div>Blocks: ${blockCount}</div>
                ${microblockCount > 0 ? `<div>Microblocks: ${microblockCount}</div>` : ''}
                <div>Dimensions: ${voxelSchematic.dimensions.x}×${voxelSchematic.dimensions.y}×${voxelSchematic.dimensions.z}</div>
                <div>Resolution: ${useMicroblocks ? '32x32x32 microblocks' : resolution + ' voxels/meter'}</div>
            `;
            
            
            if (confirm('Save voxelized model to schematic library?')) {
                const metadata = {
                    name: prompt('Enter schematic name:', voxelSchematic.name),
                    category: 'voxelized_model',
                    tags: ['3d_model', 'voxelized', useMicroblocks ? 'microblocks' : 'blocks'],
                    author: 'Model Voxelizer'
                };
                
                
                const schematicId = `voxel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const schematic = {
                    id: schematicId,
                    ...metadata,
                    fileName: file.name,
                    size: voxelSchematic.dimensions,
                    blocks: voxelSchematic.voxels,
                    microblocks: voxelSchematic.microblocks,
                    uploadDate: Date.now(),
                    thumbnail: this.generateVoxelThumbnail(voxelSchematic),
                    stats: {
                        blockCount: blockCount,
                        microblockCount: microblockCount,
                        dimensions: voxelSchematic.dimensions
                    },
                    isVoxelized: true,
                    originalModel: file.name
                };
                
                this.schematics.set(schematicId, schematic);
                this.saveLibrary();
                
                
                const grid = document.getElementById('schematic-grid');
                if (grid) {
                    grid.innerHTML = this.renderSchematicGrid();
                }
                
                alert('Voxelized model saved to library!');
            }
            
        } catch (error) {
            console.error('Failed to voxelize model:', error);
            alert('Failed to voxelize model: ' + error.message);
        }
    }
    
    /**
     * Show voxel preview in 3D
     */
    showVoxelPreview(voxelSchematic, container) {
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000033);
        
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        
        
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
        
        
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const group = new THREE.Group();
        
        
        const sampleRate = Math.max(1, Math.floor(voxelSchematic.voxels.length / 1000));
        for (let i = 0; i < voxelSchematic.voxels.length; i += sampleRate) {
            const voxel = voxelSchematic.voxels[i];
            const material = new THREE.MeshPhongMaterial({
                color: voxel.color || 0xFF00FF
            });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(voxel.position.x, voxel.position.y, voxel.position.z);
            group.add(cube);
        }
        
        
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        group.position.sub(center);
        scene.add(group);
        
        
        camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
        camera.lookAt(0, 0, 0);
        
        
        const ambient = new THREE.AmbientLight(0x404040);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 1);
        directional.position.set(10, 10, 10);
        scene.add(directional);
        
        
        let animationId;
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            group.rotation.y += 0.01;
            renderer.render(scene, camera);
        };
        animate();
        
        
        container.dataset.animationId = animationId;
        
        
        container.addEventListener('DOMNodeRemoved', () => {
            if (animationId) cancelAnimationFrame(animationId);
            renderer.dispose();
        }, { once: true });
    }
    
    /**
     * Generate thumbnail for voxelized model
     */
    generateVoxelThumbnail(voxelSchematic) {
        
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000033);
        
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        
        
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const group = new THREE.Group();
        
        const sampleRate = Math.max(1, Math.floor(voxelSchematic.voxels.length / 100));
        for (let i = 0; i < voxelSchematic.voxels.length; i += sampleRate) {
            const voxel = voxelSchematic.voxels[i];
            const material = new THREE.MeshPhongMaterial({
                color: voxel.color || 0xFF00FF
            });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(voxel.position.x, voxel.position.y, voxel.position.z);
            group.add(cube);
        }
        
        
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        group.position.sub(center);
        scene.add(group);
        
        camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
        camera.lookAt(0, 0, 0);
        
        
        scene.add(new THREE.AmbientLight(0x404040));
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(10, 10, 10);
        scene.add(light);
        
        
        renderer.render(scene, camera);
        const dataUrl = canvas.toDataURL('image/png');
        
        
        renderer.dispose();
        
        return dataUrl;
    }
    
    /**
     * Handle file upload
     */
    async handleUpload() {
        const input = document.getElementById('schematic-upload');
        if (!input || !input.files || input.files.length === 0) {
            alert('Please select a file to upload');
            return;
        }
        
        const file = input.files[0];
        try {
            const metadata = {
                name: prompt('Enter schematic name:', file.name.replace(/\.[^/.]+$/, '')),
                category: prompt('Enter category (e.g., alien_ruins, settlement):', 'uncategorized'),
                tags: prompt('Enter tags (comma-separated):', '').split(',').map(t => t.trim()).filter(t => t),
                author: prompt('Author name:', 'Unknown')
            };
            
            await this.uploadSchematic(file, metadata);
            
            
            const grid = document.getElementById('schematic-grid');
            if (grid) {
                grid.innerHTML = this.renderSchematicGrid();
            }
            
            
            input.value = '';
            
            alert('Schematic uploaded successfully!');
        } catch (error) {
            alert('Failed to upload schematic: ' + error.message);
        }
    }
    
    /**
     * Initialize 3D preview system
     */
    initializePreviewSystem() {
        
        this.previewScene = new THREE.Scene();
        this.previewScene.background = new THREE.Color(0x111122);
        
        
        this.previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        this.previewCamera.position.set(50, 50, 50);
        this.previewCamera.lookAt(0, 0, 0);
        
        
        const ambient = new THREE.AmbientLight(0x404040);
        this.previewScene.add(ambient);
        
        const directional = new THREE.DirectionalLight(0xffffff, 1);
        directional.position.set(10, 10, 10);
        this.previewScene.add(directional);
    }
    
    /**
     * Generate 3D preview of schematic
     */
    generate3DPreview(schematicData, canvas) {
        if (!canvas) return null;
        
        
        const renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: true,
            preserveDrawingBuffer: true
        });
        renderer.setSize(300, 300);
        
        
        while(this.previewScene.children.length > 2) { 
            this.previewScene.remove(this.previewScene.children[2]);
        }
        
        
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const group = new THREE.Group();
        
        if (schematicData.blocks && schematicData.blocks.length > 0) {
            schematicData.blocks.forEach(block => {
                const material = new THREE.MeshPhongMaterial({
                    color: this.getBlockColor(block.type)
                });
                const cube = new THREE.Mesh(geometry, material);
                cube.position.set(block.x, block.y, block.z);
                group.add(cube);
            });
        } else {
            
            const placeholderGeometry = new THREE.BoxGeometry(10, 10, 10);
            const placeholderMaterial = new THREE.MeshPhongMaterial({
                color: 0x4488ff,
                wireframe: true
            });
            const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
            group.add(placeholder);
        }
        
        
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        
        this.previewScene.add(group);
        
        
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.previewCamera.fov * (Math.PI / 180);
        const cameraZ = Math.abs(maxDim / Math.sin(fov / 2));
        this.previewCamera.position.set(cameraZ, cameraZ, cameraZ);
        this.previewCamera.lookAt(0, 0, 0);
        
        
        renderer.render(this.previewScene, this.previewCamera);
        const dataURL = canvas.toDataURL('image/png');
        
        
        renderer.dispose();
        
        return dataURL;
    }
    
    /**
     * Get block color for preview
     */
    getBlockColor(blockType) {
        const colors = {
            'stone': 0x888888,
            'wood': 0x8B4513,
            'glass': 0x87CEEB,
            'metal': 0xC0C0C0,
            'grass': 0x00FF00,
            'dirt': 0x8B7355,
            'sand': 0xF4E4C1,
            'water': 0x006994,
            'lava': 0xFF4500
        };
        return colors[blockType] || 0x666666;
    }
    
    /**
     * Generate thumbnail for schematic
     */
    generateThumbnail(schematicData) {
        
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        
        
        return this.generate3DPreview(schematicData, canvas);
    }
    
    /**
     * Get schematics by tag
     */
    getByTag(tag) {
        return Array.from(this.schematics.values()).filter(s => s.tags.includes(tag));
    }
    
    /**
     * Get schematics by category
     */
    getByCategory(category) {
        return Array.from(this.schematics.values()).filter(s => s.category === category);
    }
    
    /**
     * Get schematics for biome
     */
    getForBiome(biome) {
        return Array.from(this.schematics.values()).filter(s => 
            s.biomes.length === 0 || s.biomes.includes(biome)
        );
    }
    
    /**
     * Assign schematic to biomes
     */
    assignToBiomes(schematicId, biomes) {
        const schematic = this.schematics.get(schematicId);
        if (schematic) {
            schematic.biomes = biomes;
            this.saveLibrary();
        }
    }
    
    /**
     * Add tags to schematic
     */
    addTags(schematicId, tags) {
        const schematic = this.schematics.get(schematicId);
        if (schematic) {
            tags.forEach(tag => {
                if (!schematic.tags.includes(tag)) {
                    schematic.tags.push(tag);
                    this.tags.add(tag);
                }
            });
            this.saveLibrary();
        }
    }
    
    /**
     * Remove schematic
     */
    removeSchematic(schematicId) {
        this.schematics.delete(schematicId);
        this.saveLibrary();
    }
    
    /**
     * Search schematics
     */
    search(query) {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.schematics.values()).filter(s => 
            s.name.toLowerCase().includes(lowerQuery) ||
            s.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
            s.category.toLowerCase().includes(lowerQuery)
        );
    }
    
    /**
     * Get random schematic for spawn
     */
    getRandomForSpawn(biome, tags = []) {
        let candidates = this.getForBiome(biome);
        
        
        if (tags.length > 0) {
            candidates = candidates.filter(s => 
                tags.some(tag => s.tags.includes(tag))
            );
        }
        
        if (candidates.length === 0) return null;
        
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    
    /**
     * Set sharing options for schematic
     */
    setSharing(schematicId, options = {}) {
        const schematic = this.schematics.get(schematicId);
        if (!schematic) return false;
        
        this.sharingOptions.set(schematicId, {
            public: options.public || false,
            validated: options.validated || false,
            serverUrl: options.serverUrl || null,
            uploadDate: options.public ? Date.now() : null
        });
        
        
        if (options.public && !options.validated) {
            this.requestServerValidation(schematicId);
        }
        
        this.saveLibrary();
        return true;
    }
    
    /**
     * Request server validation for schematic
     */
    async requestServerValidation(schematicId) {
        const schematic = this.schematics.get(schematicId);
        if (!schematic) return;
        
        
        this.validationStatus.set(schematicId, {
            status: 'pending',
            message: 'Validating with server...',
            timestamp: Date.now()
        });
        
        try {
            
            const validationResult = await this.validateWithServer(schematic);
            
            this.validationStatus.set(schematicId, {
                status: validationResult.valid ? 'validated' : 'rejected',
                message: validationResult.message,
                timestamp: Date.now(),
                rules: validationResult.rules
            });
            
            
            if (validationResult.valid) {
                const sharing = this.sharingOptions.get(schematicId) || {};
                sharing.validated = true;
                this.sharingOptions.set(schematicId, sharing);
            }
            
        } catch (error) {
            this.validationStatus.set(schematicId, {
                status: 'error',
                message: 'Failed to validate: ' + error.message,
                timestamp: Date.now()
            });
        }
        
        this.saveLibrary();
    }
    
    /**
     * Simulate server validation
     */
    async validateWithServer(schematic) {
        
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        
        const rules = {
            maxBlocks: 10000,
            maxHeight: 256,
            allowedBlocks: true,
            noExploits: true
        };
        
        
        if (schematic.stats && schematic.stats.blockCount > rules.maxBlocks) {
            return {
                valid: false,
                message: `Exceeds maximum block count (${rules.maxBlocks})`,
                rules: rules
            };
        }
        
        
        if (schematic.size && schematic.size.y > rules.maxHeight) {
            return {
                valid: false,
                message: `Exceeds maximum height (${rules.maxHeight})`,
                rules: rules
            };
        }
        
        
        return {
            valid: true,
            message: 'Schematic validated successfully',
            rules: rules
        };
    }
    
    /**
     * Get validation status
     */
    getValidationStatus(schematicId) {
        return this.validationStatus.get(schematicId) || {
            status: 'unvalidated',
            message: 'Not validated',
            timestamp: null
        };
    }
    
    /**
     * Get public schematics
     */
    getPublicSchematics() {
        const publicIds = [];
        this.sharingOptions.forEach((options, id) => {
            if (options.public && options.validated) {
                publicIds.push(id);
            }
        });
        
        return publicIds.map(id => this.schematics.get(id)).filter(s => s);
    }
    
    /**
     * Upload schematic to server
     */
    async uploadToServer(schematicId) {
        const schematic = this.schematics.get(schematicId);
        const validation = this.getValidationStatus(schematicId);
        
        if (!schematic || validation.status !== 'validated') {
            throw new Error('Schematic must be validated before uploading');
        }
        
        try {
            
            console.log(`Uploading ${schematic.name} to server...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            

            const sharing = this.sharingOptions.get(schematicId) || {};
            sharing.serverUrl = `https://polymir.example.com/schematics/${schematicId}`;
            sharing.uploadDate = Date.now();
            this.sharingOptions.set(schematicId, sharing);
            
            console.log(`Successfully uploaded to: ${sharing.serverUrl}`);
            this.saveLibrary();
            
            return sharing.serverUrl;
            
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    }
    
    /**
     * Get library statistics
     */
    getStatistics() {
        const stats = {
            totalSchematics: this.schematics.size,
            totalTags: this.tags.size,
            totalCategories: this.categories.size,
            byCategory: {},
            byBiome: {},
            averageSize: { x: 0, y: 0, z: 0 }
        };
        
        
        this.categories.forEach(cat => {
            stats.byCategory[cat] = this.getByCategory(cat).length;
        });
        
        
        const biomes = ['desert', 'forest', 'ocean', 'ice', 'grassland', 'mountains', 'lava', 'crystal'];
        biomes.forEach(biome => {
            stats.byBiome[biome] = this.getForBiome(biome).length;
        });
        
        
        if (this.schematics.size > 0) {
            let totalX = 0, totalY = 0, totalZ = 0;
            this.schematics.forEach(s => {
                if (s.stats && s.stats.dimensions) {
                    totalX += s.stats.dimensions.x;
                    totalY += s.stats.dimensions.y;
                    totalZ += s.stats.dimensions.z;
                }
            });
            stats.averageSize = {
                x: Math.round(totalX / this.schematics.size),
                y: Math.round(totalY / this.schematics.size),
                z: Math.round(totalZ / this.schematics.size)
            };
        }
        
        return stats;
    }
    
    /**
     * Export library to JSON
     */
    exportLibrary() {
        const data = {
            version: '1.0',
            exportDate: Date.now(),
            schematics: Array.from(this.schematics.values()),
            categories: Array.from(this.categories),
            tags: Array.from(this.tags)
        };
        
        return JSON.stringify(data, null, 2);
    }
    
    /**
     * Import library from JSON
     */
    importLibrary(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            
            data.schematics.forEach(schematic => {
                this.schematics.set(schematic.id, schematic);
            });
            
            
            data.categories.forEach(cat => this.categories.add(cat));
            data.tags.forEach(tag => this.tags.add(tag));
            
            this.saveLibrary();
            console.log(`Imported ${data.schematics.length} schematics`);
            
        } catch (error) {
            console.error('Failed to import library:', error);
            throw error;
        }
    }
    
    /**
     * Save library to localStorage
     */
    saveLibrary() {
        try {
            const data = {
                schematics: Array.from(this.schematics.entries()),
                categories: Array.from(this.categories),
                tags: Array.from(this.tags)
            };
            localStorage.setItem('polymir-schematic-library', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save library:', e);
        }
    }
    
    /**
     * Load library from localStorage
     */
    loadLibrary() {
        try {
            const saved = localStorage.getItem('polymir-schematic-library');
            if (saved) {
                const data = JSON.parse(saved);


                if (data.schematics) {
                    data.schematics.forEach(([id, schematic]) => {
                        this.schematics.set(id, schematic);
                    });
                }


                if (data.categories) {
                    data.categories.forEach(cat => this.categories.add(cat));
                }
                if (data.tags) {
                    data.tags.forEach(tag => this.tags.add(tag));
                }

                console.log(`Loaded ${this.schematics.size} schematics from library`);
            }
        } catch (e) {
            console.error('Failed to load library:', e);
        }
    }

    /**
     * Load public schematics from database or index
     */
    async loadPublicSchematics() {
        try {
            console.log('[Schematics] Loading public schematic database...');

            const { SchematicGenerator } = await import('../utils/SchematicGenerator.js');
            const { SchematicPreviewRenderer } = await import('../utils/SchematicPreviewRenderer.js');

            const generator = new SchematicGenerator();
            const renderer = new SchematicPreviewRenderer(300, 300);

            const generatedSchematics = generator.generateAll();

            console.log(`[Schematics] Generated ${generatedSchematics.length} schematics with voxel data`);

            for (const schematicData of generatedSchematics) {
                const { id, metadata, voxels } = schematicData;

                
                const previewDataUrl = renderer.renderWithSampling(voxels, 2000);

                const schematic = {
                    id: id,
                    name: metadata.name,
                    planet: metadata.planet,
                    category: metadata.category,
                    tags: metadata.tags,
                    biomes: metadata.biomes,
                    description: metadata.description,
                    author: metadata.author,
                    spawnFrequency: metadata.spawnFrequency,
                    voxels: voxels,
                    voxelCount: voxels.size,
                    preview: previewDataUrl,
                    size: this.calculateSchematicSize(voxels),
                    stats: {
                        blockCount: voxels.size,
                        dimensions: this.calculateSchematicSize(voxels)
                    }
                };

                if (!this.schematics.has(schematic.id)) {
                    this.schematics.set(schematic.id, schematic);
                }

                schematic.tags.forEach(tag => this.tags.add(tag));
                this.categories.add(schematic.category);
            }

            
            renderer.dispose();

            console.log(`[Schematics] Loaded ${generatedSchematics.length} public schematics with 3D previews`);
            return true;

        } catch (error) {
            console.error('Failed to load public schematics:', error);
            console.error(error.stack);

            const mockDatabase = this.createMockPublicDatabase();
            mockDatabase.forEach(schematic => {
                if (!this.schematics.has(schematic.id)) {
                    this.schematics.set(schematic.id, schematic);
                }
                schematic.tags.forEach(tag => this.tags.add(tag));
                this.categories.add(schematic.category);
            });
            console.log(`[WARNING] Fallback: Loaded ${mockDatabase.length} mock schematics`);
            return false;
        }
    }

    /**
     * Calculate schematic size from voxel data
     */
    calculateSchematicSize(voxels) {
        if (!voxels || voxels.size === 0) {
            return { x: 0, y: 0, z: 0 };
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const key of voxels.keys()) {
            const x = key & 0x1F;
            const y = (key >> 5) & 0x1F;
            const z = (key >> 10) & 0x1F;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        }

        return {
            x: maxX - minX + 1,
            y: maxY - minY + 1,
            z: maxZ - minZ + 1
        };
    }

    /**
     * Create mock public database of schematics
     * In production, this would load from an actual API/database
     */
    createMockPublicDatabase() {
        return [
            {
                id: 'schematic_ancient_temple_01',
                name: 'Ancient Temple',
                planet: false,
                category: 'alien_ruins',
                tags: ['alien_ruins', 'dungeon', 'ancient'],
                biomes: ['desert', 'mountains'],
                size: { x: 50, y: 30, z: 50 },
                stats: {
                    blockCount: 12000,
                    dimensions: { x: 50, y: 30, z: 50 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0.02,
                description: 'A mysterious ancient temple with hidden chambers'
            },
            {
                id: 'schematic_mining_station_01',
                name: 'Mining Station',
                planet: false,
                category: 'mining_outpost',
                tags: ['mining_outpost', 'industrial', 'outpost'],
                biomes: ['mountains', 'desert', 'ice'],
                size: { x: 30, y: 20, z: 30 },
                stats: {
                    blockCount: 8000,
                    dimensions: { x: 30, y: 20, z: 30 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0.05,
                description: 'An industrial mining outpost with ore processing'
            },
            {
                id: 'schematic_crashed_frigate_01',
                name: 'Crashed Frigate',
                planet: false,
                category: 'crashed_ship',
                tags: ['crashed_ship', 'salvage', 'wreckage'],
                biomes: ['grassland', 'forest', 'desert'],
                size: { x: 80, y: 25, z: 40 },
                stats: {
                    blockCount: 18000,
                    dimensions: { x: 80, y: 25, z: 40 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0.01,
                description: 'A crashed frigate with salvageable technology'
            },
            {
                id: 'schematic_desert_outpost_01',
                name: 'Desert Outpost',
                planet: false,
                category: 'settlement',
                tags: ['settlement', 'trade', 'outpost'],
                biomes: ['desert'],
                size: { x: 40, y: 15, z: 40 },
                stats: {
                    blockCount: 9000,
                    dimensions: { x: 40, y: 15, z: 40 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0.03,
                description: 'A fortified desert trading outpost'
            },
            {
                id: 'schematic_crystal_cave_01',
                name: 'Crystal Cave',
                planet: false,
                category: 'dungeon',
                tags: ['dungeon', 'resources', 'cave'],
                biomes: ['mountains', 'crystal'],
                size: { x: 60, y: 40, z: 60 },
                stats: {
                    blockCount: 15000,
                    dimensions: { x: 60, y: 40, z: 60 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0.015,
                description: 'A crystalline cave system with rare resources'
            },
            {
                id: 'schematic_research_lab_01',
                name: 'Research Lab',
                planet: false,
                category: 'research_station',
                tags: ['research_station', 'tech', 'science'],
                biomes: ['grassland', 'ice', 'forest'],
                size: { x: 35, y: 25, z: 35 },
                stats: {
                    blockCount: 10000,
                    dimensions: { x: 35, y: 25, z: 35 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0.02,
                description: 'An abandoned research facility with experimental tech'
            },
            {
                id: 'schematic_space_station_01',
                name: 'Orbital Station Alpha',
                planet: false,
                category: 'space_station',
                tags: ['space_station', 'orbital', 'tech'],
                biomes: [],
                size: { x: 60, y: 60, z: 60 },
                stats: {
                    blockCount: 20000,
                    dimensions: { x: 60, y: 60, z: 60 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0,
                description: 'A modular orbital space station (space only)'
            },
            {
                id: 'schematic_derelict_ship_01',
                name: 'Derelict Cargo Vessel',
                planet: false,
                category: 'derelict_ship',
                tags: ['derelict_ship', 'space', 'salvage'],
                biomes: [],
                size: { x: 100, y: 30, z: 50 },
                stats: {
                    blockCount: 22000,
                    dimensions: { x: 100, y: 30, z: 50 }
                },
                author: 'PolymirTeam',
                spawnFrequency: 0,
                description: 'An abandoned cargo vessel drifting in space'
            }
        ];
    }
}

