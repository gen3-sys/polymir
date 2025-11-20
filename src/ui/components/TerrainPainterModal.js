/**
 * TerrainPainterModal.js - 3D Terrain Sculpting Interface
 *
 * Provides ZBrush-style 3D sculpting for planet surfaces with real-time preview
 * Uses debris aggregation math for brush physics
 */

import * as THREE from '../lib/three.module.js';
import { OrbitControls } from '../lib/OrbitControls.js';
import { UndoRedoStack } from '../utils/UndoRedoStack.js';

export class TerrainPainterModal {
    constructor(systemGeneratorMenu) {
        this.systemGeneratorMenu = systemGeneratorMenu;
        this.modal = null;
        this.canvas = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.planet = null;
        this.planetMesh = null;
        this.planetConfig = null;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isMouseDown = false;
        this.currentBrush = 'raise';
        this.brushSize = 20;
        this.brushStrength = 0.5;
        this.brushFalloff = 0.8;

        this.originalGeometry = null;
        this.modifiedVertices = new Map();

        
        this.undoStack = new UndoRedoStack(50);
        this.currentStroke = null; 
        this.isStrokeActive = false;

        
        this.autoSaveEnabled = true;
        this.autoSaveInterval = 5000; 
        this.lastAutoSave = Date.now();
        this.hasUnsavedChanges = false;

        this.animationId = null;
        this.animationTime = 0;
        this.planetMaterial = null;

        this.mode = 'brush';
        this.autoRotate = true;
        this.brushCursor = null;

        this.boundKeyHandler = null;
        this.boundResizeHandler = null;
    }

    show(planetConfig, mode = 'painter') {
        this.planetConfig = planetConfig;
        this.viewMode = mode; 
        this.createModal();
        this.initializeScene();
        this.createPlanetMesh();
        this.createBrushCursor();
        this.controls.enabled = false;
        this.setupEventListeners();
        this.animate();
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 20000;
            display: flex;
            flex-direction: column;
        `;

        const titleText = this.viewMode === 'preview'
            ? `Preview - ${this.planetConfig.name}`
            : `Terrain Painter - ${this.planetConfig.name}`;

        this.modal.innerHTML = `
            <div style="padding: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%); border-bottom: 2px solid #00FFFF;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="color: #FFD700; margin: 0;">${titleText}</h2>
                    <div>
                        <button id="terrain-save-btn" style="
                            background: #00AA00;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            margin-right: 10px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 14px;
                        ">Save & Return</button>
                        <button id="terrain-cancel-btn" style="
                            background: #AA0000;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 14px;
                        ">Back</button>
                    </div>
                </div>
            </div>

            <div style="flex: 1; display: flex;">
                <div style="flex: 1; position: relative;">
                    <canvas id="terrain-canvas" style="width: 100%; height: 100%;"></canvas>
                    <div style="
                        position: absolute;
                        top: 20px;
                        left: 20px;
                        background: rgba(0, 0, 0, 0.7);
                        padding: 15px;
                        border-radius: 10px;
                        color: white;
                        font-size: 12px;
                    ">
                        <div><strong>Controls:</strong></div>
                        <div>Left Click + Drag: Sculpt</div>
                        <div>Right Click + Drag: Rotate View</div>
                        <div>Scroll: Zoom</div>
                        <div>1-4: Change Brush</div>
                    </div>
                </div>

                <div style="width: 300px; background: #1a1a2e; padding: 20px; overflow-y: auto;">
                    <h3 style="color: #00FFFF; margin-top: 0;">Mode</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="color: #88FF88; font-size: 12px; display: block; margin-bottom: 5px;">Mode:</label>
                        <select id="painter-mode" style="width: 100%; padding: 8px; background: #0a0a1e; color: white; border: 1px solid #00FFFF; border-radius: 5px;">
                            <option value="brush">Brush Mode</option>
                            <option value="view">View Mode</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; color: #88FF88; font-size: 12px; cursor: pointer;">
                            <input type="checkbox" id="auto-rotate-toggle" checked style="margin-right: 8px;">
                            <span>Auto-Rotate Planet</span>
                        </label>
                    </div>

                    <h3 style="color: #00FFFF; margin-top: 20px;">History</h3>

                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <button id="undo-btn" disabled style="
                            flex: 1;
                            background: #444;
                            color: white;
                            border: 1px solid #666;
                            padding: 8px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: bold;
                        ">⟲ Undo (Ctrl+Z)</button>
                        <button id="redo-btn" disabled style="
                            flex: 1;
                            background: #444;
                            color: white;
                            border: 1px solid #666;
                            padding: 8px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: bold;
                        ">⟳ Redo (Ctrl+Y)</button>
                    </div>

                    <div style="margin-bottom: 20px; padding: 10px; background: rgba(0, 255, 0, 0.1); border-radius: 5px; border: 1px solid #00FF00;">
                        <div style="color: #00FF00; font-size: 11px; display: flex; align-items: center; gap: 5px;">
                            <span id="autosave-indicator">●</span>
                            <span id="autosave-status">Auto-save enabled (5s)</span>
                        </div>
                    </div>

                    <h3 style="color: #00FFFF; margin-top: 20px;">Brush Settings</h3>

                    <div style="margin-bottom: 20px;">
                        <label style="color: #88FF88; font-size: 12px; display: block; margin-bottom: 5px;">Brush Type:</label>
                        <select id="brush-type" style="width: 100%; padding: 8px; background: #0a0a1e; color: white; border: 1px solid #00FFFF; border-radius: 5px;">
                            <option value="raise">Raise (1)</option>
                            <option value="lower">Lower (2)</option>
                            <option value="smooth">Smooth (3)</option>
                            <option value="noise">Noise (4)</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="color: #88FF88; font-size: 12px; display: block; margin-bottom: 5px;">Brush Size: <span id="brush-size-value">20</span></label>
                        <input type="range" id="brush-size" min="5" max="100" value="20" style="width: 100%;">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="color: #88FF88; font-size: 12px; display: block; margin-bottom: 5px;">Strength: <span id="brush-strength-value">0.5</span></label>
                        <input type="range" id="brush-strength" min="0.1" max="2.0" step="0.1" value="0.5" style="width: 100%;">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="color: #88FF88; font-size: 12px; display: block; margin-bottom: 5px;">Falloff: <span id="brush-falloff-value">0.8</span></label>
                        <input type="range" id="brush-falloff" min="0.1" max="1.0" step="0.1" value="0.8" style="width: 100%;">
                    </div>

                    <button id="reset-terrain-btn" style="
                        width: 100%;
                        background: #666;
                        color: white;
                        border: none;
                        padding: 10px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-top: 20px;
                    ">Reset Terrain</button>

                    <div style="margin-top: 30px; padding: 15px; background: rgba(0, 255, 255, 0.1); border-radius: 5px;">
                        <h4 style="color: #00FFFF; margin-top: 0; font-size: 14px;">Terrain Info</h4>
                        <div style="color: #88FF88; font-size: 11px;">
                            <div>Vertices: <span id="vertex-count">0</span></div>
                            <div>Modified: <span id="modified-count">0</span></div>
                            <div>Radius: ${this.planetConfig.radius}m</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.canvas = document.getElementById('terrain-canvas');
    }

    initializeScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);

        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 1, 100000);

        
        
        const visualScale = 10;
        this.visualRadius = this.planetConfig.radius * visualScale;

        console.log('[TerrainPainter] Planet radius:', this.planetConfig.radius, '-> Visual radius:', this.visualRadius);
        const cameraDistance = this.visualRadius * 2;
        console.log('[TerrainPainter] Camera distance:', cameraDistance);
        this.camera.position.set(0, 0, cameraDistance);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = this.visualRadius * 1.5;
        this.controls.maxDistance = this.visualRadius * 10;

        
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        
        const sunDistance = this.visualRadius * 5;
        const directionalLight = new THREE.DirectionalLight(0xffffee, 2.5);
        directionalLight.position.set(sunDistance, sunDistance * 0.5, sunDistance * 0.5);
        this.scene.add(directionalLight);

        
        this.addVisualSun(sunDistance);

        this.addStarfield();
    }

    addVisualSun(sunDistance) {
        const sunGeometry = new THREE.SphereGeometry(this.visualRadius * 0.8, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffaa,
            emissive: 0xffffaa,
            emissiveIntensity: 1
        });
        const sun = new THREE.Mesh(sunGeometry, sunMaterial);
        sun.position.set(sunDistance, sunDistance * 0.5, sunDistance * 0.5);
        this.scene.add(sun);

        
        const glowGeometry = new THREE.SphereGeometry(this.visualRadius * 1.2, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffddaa,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        sun.add(glow);
    }

    addStarfield() {
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xFFFFFF,
            size: 2,
            transparent: true,
            opacity: 0.8
        });

        const starsVertices = [];
        for (let i = 0; i < 5000; i++) {
            const radius = this.visualRadius * 20;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            starsVertices.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(stars);
    }

    createPlanetMesh() {
        
        const geometry = new THREE.SphereGeometry(this.visualRadius, 128, 128);
        console.log('[TerrainPainter] Created sphere geometry with radius:', this.visualRadius);

        this.originalGeometry = geometry.clone();

        
        const material = this.systemGeneratorMenu.createBiomeShaderMaterial(this.planetConfig);
        this.planetMaterial = material;

        this.planetMesh = new THREE.Mesh(geometry, material);
        console.log('[TerrainPainter] Planet mesh position:', this.planetMesh.position);
        console.log('[TerrainPainter] Planet mesh scale:', this.planetMesh.scale);
        this.scene.add(this.planetMesh);

        document.getElementById('vertex-count').textContent = geometry.attributes.position.count;
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.mode === 'brush') {
                this.isMouseDown = true;
                this.beginStroke(); 
                this.onMouseDown(e);
            }
        });
        this.canvas.addEventListener('mouseup', () => {
            if (this.isMouseDown) {
                this.isMouseDown = false;
                this.endStroke(); 
            }
        });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const delta = e.deltaY > 0 ? 1 : -1;

            this.cameraDistance += delta * zoomSpeed * this.visualRadius;
            this.cameraDistance = Math.max(this.minZoom, Math.min(this.maxZoom, this.cameraDistance));

            this.camera.position.z = this.cameraDistance;
        });

        document.getElementById('brush-type').addEventListener('change', (e) => {
            this.currentBrush = e.target.value;
        });

        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.brushSize = parseFloat(e.target.value);
            document.getElementById('brush-size-value').textContent = this.brushSize;
        });

        document.getElementById('brush-strength').addEventListener('input', (e) => {
            this.brushStrength = parseFloat(e.target.value);
            document.getElementById('brush-strength-value').textContent = this.brushStrength;
        });

        document.getElementById('brush-falloff').addEventListener('input', (e) => {
            this.brushFalloff = parseFloat(e.target.value);
            document.getElementById('brush-falloff-value').textContent = this.brushFalloff;
        });

        document.getElementById('painter-mode').addEventListener('change', (e) => {
            this.mode = e.target.value;
            this.controls.enabled = (this.mode === 'view');
            if (this.mode === 'brush') {
                this.createBrushCursor();
            } else {
                this.removeBrushCursor();
            }
        });

        document.getElementById('auto-rotate-toggle').addEventListener('change', (e) => {
            this.autoRotate = e.target.checked;
        });

        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.brushSize = parseFloat(e.target.value);
            document.getElementById('brush-size-value').textContent = this.brushSize;
            if (this.brushCursor) {
                this.updateBrushCursorSize();
            }
        });

        document.getElementById('reset-terrain-btn').addEventListener('click', () => {
            this.resetTerrain();
        });

        document.getElementById('terrain-save-btn').addEventListener('click', () => {
            this.saveAndClose();
        });

        document.getElementById('terrain-cancel-btn').addEventListener('click', () => {
            this.close();
        });

        
        document.getElementById('undo-btn').addEventListener('click', () => {
            this.undo();
        });

        document.getElementById('redo-btn').addEventListener('click', () => {
            this.redo();
        });

        
        this.boundKeyHandler = (e) => {
            
            if (e.key === '1') this.currentBrush = 'raise';
            if (e.key === '2') this.currentBrush = 'lower';
            if (e.key === '3') this.currentBrush = 'smooth';
            if (e.key === '4') this.currentBrush = 'noise';
            const brushSelect = document.getElementById('brush-type');
            if (brushSelect) brushSelect.value = this.currentBrush;

            
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' || e.key === 'Z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo(); 
                    } else {
                        this.undo();
                    }
                } else if (e.key === 'y' || e.key === 'Y') {
                    e.preventDefault();
                    this.redo();
                }
            }
        };

        this.boundResizeHandler = () => this.onResize();

        document.addEventListener('keydown', this.boundKeyHandler);
        window.addEventListener('resize', this.boundResizeHandler);
    }

    onMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.mode === 'brush') {
            this.updateBrushCursor();
            if (this.isMouseDown) {
                this.applyBrush();
            }
        }
    }

    onMouseDown(event) {
        this.applyBrush();
    }

    applyBrush() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.planetMesh);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            const point = intersect.point;
            const faceIndex = intersect.faceIndex;

            this.sculptTerrain(point, faceIndex);
        }
    }

    sculptTerrain(hitPoint, faceIndex) {
        const geometry = this.planetMesh.geometry;
        const positions = geometry.attributes.position;
        const normals = geometry.attributes.normal;

        const brushRadius = this.brushSize;
        const strength = this.brushStrength;

        for (let i = 0; i < positions.count; i++) {
            const vertex = new THREE.Vector3(
                positions.getX(i),
                positions.getY(i),
                positions.getZ(i)
            );

            const worldVertex = vertex.clone().applyMatrix4(this.planetMesh.matrixWorld);
            const distance = worldVertex.distanceTo(hitPoint);

            if (distance < brushRadius) {
                const falloff = Math.pow(1 - (distance / brushRadius), this.brushFalloff);
                const normal = new THREE.Vector3(
                    normals.getX(i),
                    normals.getY(i),
                    normals.getZ(i)
                ).normalize();

                let displacement = 0;

                switch (this.currentBrush) {
                    case 'raise':
                        displacement = strength * falloff * 0.5;
                        break;
                    case 'lower':
                        displacement = -strength * falloff * 0.5;
                        break;
                    case 'smooth':
                        displacement = this.calculateSmoothDisplacement(i, positions) * falloff * 0.3;
                        break;
                    case 'noise':
                        displacement = (Math.random() - 0.5) * strength * falloff * 0.3;
                        break;
                }

                
                const beforePos = vertex.clone();

                vertex.add(normal.multiplyScalar(displacement));

                positions.setXYZ(i, vertex.x, vertex.y, vertex.z);

                
                if (this.isStrokeActive && this.currentStroke) {
                    if (!this.currentStroke.has(i)) {
                        this.currentStroke.set(i, {
                            original: new THREE.Vector3(
                                this.originalGeometry.attributes.position.getX(i),
                                this.originalGeometry.attributes.position.getY(i),
                                this.originalGeometry.attributes.position.getZ(i)
                            ),
                            before: beforePos.clone(),
                            after: vertex.clone()
                        });
                    } else {
                        
                        this.currentStroke.get(i).after.copy(vertex);
                    }
                }

                
                if (!this.modifiedVertices.has(i)) {
                    this.modifiedVertices.set(i, {
                        original: new THREE.Vector3(
                            this.originalGeometry.attributes.position.getX(i),
                            this.originalGeometry.attributes.position.getY(i),
                            this.originalGeometry.attributes.position.getZ(i)
                        ),
                        current: vertex.clone()
                    });
                } else {
                    this.modifiedVertices.get(i).current.copy(vertex);
                }
            }
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        document.getElementById('modified-count').textContent = this.modifiedVertices.size;
    }

    calculateSmoothDisplacement(vertexIndex, positions) {
        const vertex = new THREE.Vector3(
            positions.getX(vertexIndex),
            positions.getY(vertexIndex),
            positions.getZ(vertexIndex)
        );

        let averagePos = new THREE.Vector3();
        let count = 0;

        for (let i = Math.max(0, vertexIndex - 100); i < Math.min(positions.count, vertexIndex + 100); i++) {
            if (i === vertexIndex) continue;

            const neighbor = new THREE.Vector3(
                positions.getX(i),
                positions.getY(i),
                positions.getZ(i)
            );

            if (vertex.distanceTo(neighbor) < 5) {
                averagePos.add(neighbor);
                count++;
            }
        }

        if (count > 0) {
            averagePos.divideScalar(count);
            const targetLength = vertex.length();
            const currentLength = averagePos.length();
            return (targetLength - currentLength) * 0.5;
        }

        return 0;
    }

    resetTerrain() {
        const geometry = this.planetMesh.geometry;
        const positions = geometry.attributes.position;
        const originalPositions = this.originalGeometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            positions.setXYZ(
                i,
                originalPositions.getX(i),
                originalPositions.getY(i),
                originalPositions.getZ(i)
            );
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        this.modifiedVertices.clear();

        document.getElementById('modified-count').textContent = 0;
    }

    saveAndClose() {
        const terrainData = {
            modifiedVertices: Array.from(this.modifiedVertices.entries()).map(([index, data]) => ({
                index: index,
                original: { x: data.original.x, y: data.original.y, z: data.original.z },
                current: { x: data.current.x, y: data.current.y, z: data.current.z }
            }))
        };

        this.planetConfig.sculptedTerrain = terrainData;

        if (window.DEBUG_TERRAIN) {
            console.log('[MirrorEngine_TerrainDEBUG] Saved terrain data:', {
                planetName: this.planetConfig.name,
                modifiedCount: this.modifiedVertices.size
            });
        }

        this.close();
    }

    close() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        
        if (this.boundKeyHandler) {
            document.removeEventListener('keydown', this.boundKeyHandler);
            this.boundKeyHandler = null;
        }

        if (this.boundResizeHandler) {
            window.removeEventListener('resize', this.boundResizeHandler);
            this.boundResizeHandler = null;
        }

        this.removeBrushCursor();

        if (this.modal) {
            this.modal.remove();
        }

        if (this.renderer) {
            this.renderer.dispose();
        }

        
        if (this.systemGeneratorMenu) {
            this.systemGeneratorMenu.show();
        }
    }

    /**
     * Begin tracking a new brush stroke
     */
    beginStroke() {
        this.isStrokeActive = true;
        this.currentStroke = new Map(); 
    }

    /**
     * End current stroke and save to undo stack
     */
    endStroke() {
        if (!this.isStrokeActive || this.currentStroke.size === 0) {
            this.isStrokeActive = false;
            this.currentStroke = null;
            return;
        }

        
        this.undoStack.push(this.currentStroke);
        this.currentStroke = null;
        this.isStrokeActive = false;

        
        this.hasUnsavedChanges = true;

        
        this.updateUndoRedoButtons();
    }

    /**
     * Undo last operation
     */
    undo() {
        if (!this.undoStack.canUndo()) return;

        const previousStroke = this.undoStack.undo(this.currentStroke || new Map());
        if (!previousStroke) return;

        
        this.applyStroke(previousStroke, true); 

        this.hasUnsavedChanges = true;
        this.updateUndoRedoButtons();
    }

    /**
     * Redo last undone operation
     */
    redo() {
        if (!this.undoStack.canRedo()) return;

        const nextStroke = this.undoStack.redo(this.currentStroke || new Map());
        if (!nextStroke) return;

        
        this.applyStroke(nextStroke, false); 

        this.hasUnsavedChanges = true;
        this.updateUndoRedoButtons();
    }

    /**
     * Apply a stroke (for undo/redo)
     * @param {Map} stroke - Stroke data
     * @param {boolean} reverse - Whether to reverse the operation
     */
    applyStroke(stroke, reverse) {
        const geometry = this.planetMesh.geometry;
        const positions = geometry.attributes.position;

        for (const [vertexIndex, data] of stroke.entries()) {
            const targetPos = reverse ? data.before : data.after;

            positions.setXYZ(vertexIndex, targetPos.x, targetPos.y, targetPos.z);

            
            if (this.modifiedVertices.has(vertexIndex)) {
                this.modifiedVertices.get(vertexIndex).current.copy(targetPos);
            } else {
                this.modifiedVertices.set(vertexIndex, {
                    original: data.original.clone(),
                    current: targetPos.clone()
                });
            }
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        document.getElementById('modified-count').textContent = this.modifiedVertices.size;
    }

    /**
     * Update undo/redo button states
     */
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.disabled = !this.undoStack.canUndo();
            undoBtn.style.background = this.undoStack.canUndo() ? '#00AA00' : '#444';
            undoBtn.style.cursor = this.undoStack.canUndo() ? 'pointer' : 'not-allowed';
        }

        if (redoBtn) {
            redoBtn.disabled = !this.undoStack.canRedo();
            redoBtn.style.background = this.undoStack.canRedo() ? '#0088FF' : '#444';
            redoBtn.style.cursor = this.undoStack.canRedo() ? 'pointer' : 'not-allowed';
        }
    }

    /**
     * Auto-save terrain data periodically
     */
    autoSave() {
        if (!this.autoSaveEnabled || !this.hasUnsavedChanges) return;

        const now = Date.now();
        if (now - this.lastAutoSave < this.autoSaveInterval) return;

        
        const terrainData = {
            modifiedVertices: Array.from(this.modifiedVertices.entries()).map(([index, data]) => ({
                index: index,
                original: { x: data.original.x, y: data.original.y, z: data.original.z },
                current: { x: data.current.x, y: data.current.y, z: data.current.z }
            }))
        };

        this.planetConfig.sculptedTerrain = terrainData;
        this.hasUnsavedChanges = false;
        this.lastAutoSave = now;

        
        this.flashAutoSaveIndicator();
    }

    /**
     * Flash auto-save indicator to show save occurred
     */
    flashAutoSaveIndicator() {
        const indicator = document.getElementById('autosave-indicator');
        const status = document.getElementById('autosave-status');

        if (indicator && status) {
            indicator.style.color = '#00FF00';
            indicator.style.textShadow = '0 0 10px #00FF00';
            status.textContent = 'Auto-saved!';

            setTimeout(() => {
                indicator.style.color = '';
                indicator.style.textShadow = '';
                status.textContent = 'Auto-save enabled (5s)';
            }, 1000);
        }
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        
        this.autoSave();

        if (this.controls) {
            this.controls.update();
        }

        if (this.planetMesh && this.autoRotate) {
            this.planetMesh.rotation.y += 0.001;
        }

        if (this.planetMesh) {
            
            if (this.planetMaterial && this.planetMaterial.uniforms) {
                
                if (!this.animationTime) this.animationTime = 0;
                this.animationTime += 0.016;
                this.planetMaterial.uniforms.time.value = this.animationTime;

                
                const sunDistance = this.visualRadius * 5;
                this.planetMaterial.uniforms.sunWorldPosition.value.set(
                    sunDistance,
                    sunDistance * 0.5,
                    sunDistance * 0.5
                );
            }
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onResize() {
        if (!this.canvas || !this.camera || !this.renderer) return;

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    createBrushCursor() {
        if (this.brushCursor) {
            this.scene.remove(this.brushCursor);
        }

        const segments = 32;
        const geometry = new THREE.SphereGeometry(this.brushSize, segments, segments);
        const wireframe = new THREE.WireframeGeometry(geometry);
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 2,
            transparent: true,
            opacity: 0.6,
            depthTest: true,
            depthWrite: false
        });

        this.brushCursor = new THREE.LineSegments(wireframe, material);
        this.brushCursor.visible = false;
        this.scene.add(this.brushCursor);
    }

    removeBrushCursor() {
        if (this.brushCursor) {
            this.scene.remove(this.brushCursor);
            if (this.brushCursor.geometry) {
                this.brushCursor.geometry.dispose();
            }
            if (this.brushCursor.material) {
                this.brushCursor.material.dispose();
            }
            this.brushCursor = null;
        }
    }

    updateBrushCursor() {
        if (!this.brushCursor) {
            this.createBrushCursor();
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.planetMesh);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            this.brushCursor.position.copy(intersect.point);
            this.brushCursor.visible = true;
        } else {
            this.brushCursor.visible = false;
        }
    }

    updateBrushCursorSize() {
        if (this.brushCursor) {
            this.scene.remove(this.brushCursor);
            if (this.brushCursor.geometry) {
                this.brushCursor.geometry.dispose();
            }
            if (this.brushCursor.material) {
                this.brushCursor.material.dispose();
            }
            this.createBrushCursor();
        }
    }
}