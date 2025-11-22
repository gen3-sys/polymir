/**
 * VoxelAvatarEditor - Main voxel avatar sculpting interface
 *
 * Provides a complete editor for creating and modifying voxel avatars.
 * Integrates with the rig system for real-time preview.
 *
 * Features:
 * - Three.js canvas with orbit controls
 * - Tool panel integration (pencil, eraser, fill, etc.)
 * - Palette panel integration
 * - Save/load functionality
 * - Preview panel with animation
 * - Responsive layout
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VoxelAvatarData, AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';
import { AvatarPalette } from '../data/AvatarPalette.js';
import { AvatarSerializer } from '../data/AvatarSerializer.js';
import { VoxelAvatarRig } from '../rig/VoxelAvatarRig.js';
import { VoxelAvatarRenderer, RENDER_MODE, VOXEL_SCALE } from '../render/VoxelAvatarRenderer.js';
import { EditorTools, TOOL_TYPE } from './EditorTools.js';
import { EditorHistory } from './EditorHistory.js';
import { TemplateLibrary } from './TemplateLibrary.js';

// Editor states
export const EDITOR_STATE = {
    IDLE: 'idle',
    DRAWING: 'drawing',
    ERASING: 'erasing',
    SELECTING: 'selecting',
    PREVIEWING: 'previewing'
};

// Editor views
export const EDITOR_VIEW = {
    FREE: 'free',
    FRONT: 'front',
    BACK: 'back',
    LEFT: 'left',
    RIGHT: 'right',
    TOP: 'top',
    BOTTOM: 'bottom'
};

export class VoxelAvatarEditor {
    constructor(containerElement, options = {}) {
        // Container element
        this.container = containerElement;

        // Options
        this.options = {
            backgroundColor: options.backgroundColor || 0x2a2a3e,
            gridColor: options.gridColor || 0x444466,
            showGrid: options.showGrid !== false,
            showBoneRegions: options.showBoneRegions || false,
            mirrorMode: options.mirrorMode || false,
            autoSave: options.autoSave || false,
            autoSaveInterval: options.autoSaveInterval || 60000,
            ...options
        };

        // Three.js components
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;

        // Avatar components
        this.avatarData = null;
        this.avatarRig = null;
        this.avatarRenderer = null;

        // Editor components
        this.tools = new EditorTools();
        this.history = new EditorHistory();
        this.templateLibrary = new TemplateLibrary();

        // Editor state
        this.state = EDITOR_STATE.IDLE;
        this.currentView = EDITOR_VIEW.FREE;
        this.selectedColor = 0;
        this.isModified = false;

        // Interaction state
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredVoxel = null;
        this.isMouseDown = false;

        // Grid and guides
        this.gridHelper = null;
        this.boneRegionOverlay = null;
        this.cursorIndicator = null;

        // Callbacks
        this.onVoxelChange = options.onVoxelChange || null;
        this.onSelectionChange = options.onSelectionChange || null;
        this.onSave = options.onSave || null;

        // Auto-save timer
        this.autoSaveTimer = null;

        // Initialize
        this.initialize();
    }

    /**
     * Initialize the editor
     */
    initialize() {
        this.setupRenderer();
        this.setupScene();
        this.setupLighting();
        this.setupGrid();
        this.setupCursor();
        this.setupEventListeners();

        // Create default avatar
        this.createNewAvatar();

        // Start render loop
        this.animate();

        // Setup auto-save
        if (this.options.autoSave) {
            this.startAutoSave();
        }
    }

    /**
     * Setup Three.js renderer
     */
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
    }

    /**
     * Setup scene and camera
     */
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.options.backgroundColor);

        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.camera.position.set(3, 2, 3);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.target.set(0, 1, 0);
        this.controls.minDistance = 1;
        this.controls.maxDistance = 10;
    }

    /**
     * Setup scene lighting
     */
    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x606080, 0.6);
        this.scene.add(ambient);

        // Key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(5, 10, 5);
        keyLight.castShadow = true;
        this.scene.add(keyLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
        fillLight.position.set(-5, 5, -5);
        this.scene.add(fillLight);

        // Rim light
        const rimLight = new THREE.DirectionalLight(0xffffee, 0.4);
        rimLight.position.set(0, 5, -10);
        this.scene.add(rimLight);
    }

    /**
     * Setup editor grid
     */
    setupGrid() {
        if (!this.options.showGrid) return;

        // Floor grid
        this.gridHelper = new THREE.GridHelper(
            AVATAR_WIDTH * VOXEL_SCALE * 2,
            AVATAR_WIDTH,
            this.options.gridColor,
            this.options.gridColor
        );
        this.gridHelper.material.opacity = 0.3;
        this.gridHelper.material.transparent = true;
        this.scene.add(this.gridHelper);
    }

    /**
     * Setup cursor indicator for voxel placement
     */
    setupCursor() {
        const cursorGeometry = new THREE.BoxGeometry(VOXEL_SCALE, VOXEL_SCALE, VOXEL_SCALE);
        const cursorMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.8
        });
        this.cursorIndicator = new THREE.Mesh(cursorGeometry, cursorMaterial);
        this.cursorIndicator.visible = false;
        this.scene.add(this.cursorIndicator);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const canvas = this.renderer.domElement;

        // Mouse events
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard events
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Resize
        window.addEventListener('resize', () => this.onResize());
    }

    /**
     * Create new avatar
     */
    createNewAvatar(templateName = null) {
        // Create palette and data
        const palette = new AvatarPalette();
        this.avatarData = new VoxelAvatarData({ palette, name: 'New Avatar' });

        // Apply template if specified
        if (templateName) {
            const template = this.templateLibrary.getTemplate(templateName);
            if (template) {
                this.applyTemplate(template);
            }
        }

        // Initialize rig
        this.avatarRig = new VoxelAvatarRig();
        this.avatarRig.initialize(this.avatarData);

        // Initialize renderer
        if (this.avatarRenderer) {
            this.scene.remove(this.avatarRenderer.getObject3D());
            this.avatarRenderer.dispose();
        }

        this.avatarRenderer = new VoxelAvatarRenderer({
            renderMode: RENDER_MODE.CUBE // Cube mode for editing
        });

        const avatarObject = this.avatarRenderer.initialize(this.avatarData, this.avatarRig);
        this.scene.add(avatarObject);

        // Clear history
        this.history.clear();
        this.isModified = false;
    }

    /**
     * Apply template to avatar
     */
    applyTemplate(template) {
        if (!this.avatarData || !template) return;

        // Clear existing voxels
        this.avatarData.clear();

        // Apply template voxels
        for (const voxel of template.voxels) {
            this.avatarData.setVoxel(voxel.x, voxel.y, voxel.z, voxel.paletteIndex);
        }

        // Apply template palette if provided
        if (template.palette) {
            this.avatarData.palette = AvatarPalette.deserialize(template.palette);
        }

        this.rebuildRenderer();
    }

    /**
     * Set voxel at position
     */
    setVoxel(x, y, z, paletteIndex) {
        if (!this.avatarData) return false;

        // Record history
        const previousValue = this.avatarData.getVoxel(x, y, z);
        this.history.recordAction({
            type: 'setVoxel',
            x, y, z,
            previousValue,
            newValue: paletteIndex
        });

        // Set voxel
        this.avatarData.setVoxel(x, y, z, paletteIndex);

        // Mirror if enabled
        if (this.options.mirrorMode) {
            const mirrorX = AVATAR_WIDTH - 1 - x;
            this.avatarData.setVoxel(mirrorX, y, z, paletteIndex);
        }

        this.isModified = true;

        // Callback
        if (this.onVoxelChange) {
            this.onVoxelChange(x, y, z, paletteIndex);
        }

        // Rebuild renderer
        this.rebuildRenderer();

        return true;
    }

    /**
     * Remove voxel at position
     */
    removeVoxel(x, y, z) {
        if (!this.avatarData) return false;

        // Record history
        const previousValue = this.avatarData.getVoxel(x, y, z);
        if (previousValue === null) return false;

        this.history.recordAction({
            type: 'removeVoxel',
            x, y, z,
            previousValue,
            newValue: null
        });

        // Remove voxel
        this.avatarData.removeVoxel(x, y, z);

        // Mirror if enabled
        if (this.options.mirrorMode) {
            const mirrorX = AVATAR_WIDTH - 1 - x;
            this.avatarData.removeVoxel(mirrorX, y, z);
        }

        this.isModified = true;

        // Rebuild renderer
        this.rebuildRenderer();

        return true;
    }

    /**
     * Rebuild avatar renderer
     */
    rebuildRenderer() {
        if (this.avatarRenderer && this.avatarData && this.avatarRig) {
            this.avatarRenderer.rebuildMeshes();
        }
    }

    /**
     * Mouse move handler
     */
    onMouseMove(event) {
        // Update mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Raycast for voxel hover
        this.updateHoveredVoxel();

        // Continue drawing if mouse is down
        if (this.isMouseDown && this.hoveredVoxel) {
            this.applyCurrentTool(this.hoveredVoxel);
        }
    }

    /**
     * Mouse down handler
     */
    onMouseDown(event) {
        if (event.button === 0) { // Left click
            this.isMouseDown = true;

            if (this.hoveredVoxel) {
                this.applyCurrentTool(this.hoveredVoxel);
            }
        } else if (event.button === 2) { // Right click
            // Eyedropper
            if (this.hoveredVoxel) {
                const paletteIndex = this.avatarData.getVoxel(
                    this.hoveredVoxel.x,
                    this.hoveredVoxel.y,
                    this.hoveredVoxel.z
                );
                if (paletteIndex !== null) {
                    this.selectedColor = paletteIndex;
                }
            }
        }
    }

    /**
     * Mouse up handler
     */
    onMouseUp(event) {
        if (event.button === 0) {
            this.isMouseDown = false;
            this.state = EDITOR_STATE.IDLE;
        }
    }

    /**
     * Update hovered voxel based on raycast
     */
    updateHoveredVoxel() {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Raycast against avatar mesh
        if (this.avatarRenderer) {
            const intersects = this.raycaster.intersectObject(
                this.avatarRenderer.getObject3D(),
                true
            );

            if (intersects.length > 0) {
                const point = intersects[0].point;
                const normal = intersects[0].face?.normal || new THREE.Vector3(0, 1, 0);

                // Convert world position to voxel coordinates
                const currentTool = this.tools.getCurrentTool();
                let voxelPos;

                if (currentTool === TOOL_TYPE.PENCIL) {
                    // Place adjacent to surface
                    voxelPos = this.worldToVoxel(
                        point.x + normal.x * VOXEL_SCALE * 0.5,
                        point.y + normal.y * VOXEL_SCALE * 0.5,
                        point.z + normal.z * VOXEL_SCALE * 0.5
                    );
                } else {
                    // Target surface voxel
                    voxelPos = this.worldToVoxel(
                        point.x - normal.x * VOXEL_SCALE * 0.5,
                        point.y - normal.y * VOXEL_SCALE * 0.5,
                        point.z - normal.z * VOXEL_SCALE * 0.5
                    );
                }

                this.hoveredVoxel = voxelPos;
                this.updateCursor(voxelPos);
            } else {
                this.hoveredVoxel = null;
                this.cursorIndicator.visible = false;
            }
        }
    }

    /**
     * Convert world position to voxel coordinates
     */
    worldToVoxel(worldX, worldY, worldZ) {
        return {
            x: Math.floor(worldX / VOXEL_SCALE + AVATAR_WIDTH / 2),
            y: Math.floor(worldY / VOXEL_SCALE),
            z: Math.floor(worldZ / VOXEL_SCALE + AVATAR_DEPTH / 2)
        };
    }

    /**
     * Convert voxel coordinates to world position
     */
    voxelToWorld(voxelX, voxelY, voxelZ) {
        return {
            x: (voxelX - AVATAR_WIDTH / 2 + 0.5) * VOXEL_SCALE,
            y: (voxelY + 0.5) * VOXEL_SCALE,
            z: (voxelZ - AVATAR_DEPTH / 2 + 0.5) * VOXEL_SCALE
        };
    }

    /**
     * Update cursor indicator position
     */
    updateCursor(voxelPos) {
        if (!voxelPos) {
            this.cursorIndicator.visible = false;
            return;
        }

        const worldPos = this.voxelToWorld(voxelPos.x, voxelPos.y, voxelPos.z);
        this.cursorIndicator.position.set(worldPos.x, worldPos.y, worldPos.z);
        this.cursorIndicator.visible = true;
    }

    /**
     * Apply current tool at position
     */
    applyCurrentTool(voxelPos) {
        const tool = this.tools.getCurrentTool();

        switch (tool) {
            case TOOL_TYPE.PENCIL:
                this.setVoxel(voxelPos.x, voxelPos.y, voxelPos.z, this.selectedColor);
                this.state = EDITOR_STATE.DRAWING;
                break;

            case TOOL_TYPE.ERASER:
                this.removeVoxel(voxelPos.x, voxelPos.y, voxelPos.z);
                this.state = EDITOR_STATE.ERASING;
                break;

            case TOOL_TYPE.PAINT:
                // Change color without removing
                if (this.avatarData.hasVoxel(voxelPos.x, voxelPos.y, voxelPos.z)) {
                    this.setVoxel(voxelPos.x, voxelPos.y, voxelPos.z, this.selectedColor);
                }
                break;

            case TOOL_TYPE.FILL:
                this.floodFill(voxelPos.x, voxelPos.y, voxelPos.z, this.selectedColor);
                break;

            case TOOL_TYPE.EYEDROPPER:
                const color = this.avatarData.getVoxel(voxelPos.x, voxelPos.y, voxelPos.z);
                if (color !== null) {
                    this.selectedColor = color;
                }
                break;
        }
    }

    /**
     * Flood fill operation
     */
    floodFill(startX, startY, startZ, newColor) {
        const targetColor = this.avatarData.getVoxel(startX, startY, startZ);
        if (targetColor === null || targetColor === newColor) return;

        const visited = new Set();
        const queue = [{ x: startX, y: startY, z: startZ }];

        // Record batch for history
        this.history.startBatch();

        while (queue.length > 0) {
            const pos = queue.shift();
            const key = `${pos.x},${pos.y},${pos.z}`;

            if (visited.has(key)) continue;
            visited.add(key);

            const currentColor = this.avatarData.getVoxel(pos.x, pos.y, pos.z);
            if (currentColor !== targetColor) continue;

            // Set new color
            this.setVoxel(pos.x, pos.y, pos.z, newColor);

            // Add neighbors
            const neighbors = [
                { x: pos.x + 1, y: pos.y, z: pos.z },
                { x: pos.x - 1, y: pos.y, z: pos.z },
                { x: pos.x, y: pos.y + 1, z: pos.z },
                { x: pos.x, y: pos.y - 1, z: pos.z },
                { x: pos.x, y: pos.y, z: pos.z + 1 },
                { x: pos.x, y: pos.y, z: pos.z - 1 }
            ];

            for (const neighbor of neighbors) {
                if (this.avatarData.isValidPosition(neighbor.x, neighbor.y, neighbor.z)) {
                    queue.push(neighbor);
                }
            }
        }

        this.history.endBatch();
    }

    /**
     * Keyboard handler
     */
    onKeyDown(event) {
        // Ctrl+Z: Undo
        if (event.ctrlKey && event.key === 'z') {
            event.preventDefault();
            this.undo();
        }
        // Ctrl+Y: Redo
        else if (event.ctrlKey && event.key === 'y') {
            event.preventDefault();
            this.redo();
        }
        // Ctrl+S: Save
        else if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            this.save();
        }
        // Tool shortcuts
        else if (event.key === 'b') {
            this.tools.setTool(TOOL_TYPE.PENCIL);
        }
        else if (event.key === 'e') {
            this.tools.setTool(TOOL_TYPE.ERASER);
        }
        else if (event.key === 'g') {
            this.tools.setTool(TOOL_TYPE.FILL);
        }
        else if (event.key === 'p') {
            this.tools.setTool(TOOL_TYPE.PAINT);
        }
        else if (event.key === 'i') {
            this.tools.setTool(TOOL_TYPE.EYEDROPPER);
        }
        // Mirror toggle
        else if (event.key === 'm') {
            this.setMirrorMode(!this.options.mirrorMode);
        }
    }

    /**
     * Keyboard up handler
     */
    onKeyUp(event) {
        // Handle key up events if needed
    }

    /**
     * Resize handler
     */
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Undo last action
     */
    undo() {
        const action = this.history.undo();
        if (!action) return;

        this.applyHistoryAction(action, true);
        this.rebuildRenderer();
    }

    /**
     * Redo last undone action
     */
    redo() {
        const action = this.history.redo();
        if (!action) return;

        this.applyHistoryAction(action, false);
        this.rebuildRenderer();
    }

    /**
     * Apply history action
     */
    applyHistoryAction(action, isUndo) {
        const value = isUndo ? action.previousValue : action.newValue;

        if (value === null) {
            this.avatarData.removeVoxel(action.x, action.y, action.z);
        } else {
            this.avatarData.setVoxel(action.x, action.y, action.z, value);
        }
    }

    /**
     * Set current tool
     */
    setTool(toolType) {
        this.tools.setTool(toolType);
    }

    /**
     * Set selected palette color
     */
    setSelectedColor(index) {
        this.selectedColor = index;
    }

    /**
     * Set mirror mode
     */
    setMirrorMode(enabled) {
        this.options.mirrorMode = enabled;
    }

    /**
     * Set camera view
     */
    setView(view) {
        this.currentView = view;

        const distance = 4;
        const target = new THREE.Vector3(0, 1, 0);

        switch (view) {
            case EDITOR_VIEW.FRONT:
                this.camera.position.set(0, 1, distance);
                break;
            case EDITOR_VIEW.BACK:
                this.camera.position.set(0, 1, -distance);
                break;
            case EDITOR_VIEW.LEFT:
                this.camera.position.set(-distance, 1, 0);
                break;
            case EDITOR_VIEW.RIGHT:
                this.camera.position.set(distance, 1, 0);
                break;
            case EDITOR_VIEW.TOP:
                this.camera.position.set(0, distance + 1, 0);
                break;
            case EDITOR_VIEW.BOTTOM:
                this.camera.position.set(0, -distance + 1, 0);
                break;
        }

        this.camera.lookAt(target);
        this.controls.target.copy(target);
    }

    /**
     * Save avatar
     */
    async save() {
        if (!this.avatarData) return null;

        const serializer = new AvatarSerializer();
        const data = await serializer.serialize(this.avatarData);

        this.isModified = false;

        if (this.onSave) {
            this.onSave(data);
        }

        return data;
    }

    /**
     * Load avatar
     */
    async load(data) {
        const serializer = new AvatarSerializer();
        this.avatarData = await serializer.deserialize(data);

        // Reinitialize rig and renderer
        this.avatarRig = new VoxelAvatarRig();
        this.avatarRig.initialize(this.avatarData);

        if (this.avatarRenderer) {
            this.scene.remove(this.avatarRenderer.getObject3D());
        }

        this.avatarRenderer = new VoxelAvatarRenderer({
            renderMode: RENDER_MODE.CUBE
        });

        const avatarObject = this.avatarRenderer.initialize(this.avatarData, this.avatarRig);
        this.scene.add(avatarObject);

        this.history.clear();
        this.isModified = false;
    }

    /**
     * Start auto-save timer
     */
    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        this.autoSaveTimer = setInterval(() => {
            if (this.isModified) {
                this.save();
            }
        }, this.options.autoSaveInterval);
    }

    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Get editor statistics
     */
    getStats() {
        return {
            voxelCount: this.avatarData ? this.avatarData.getVoxelCount() : 0,
            paletteSize: this.avatarData ? this.avatarData.palette.size() : 0,
            historySize: this.history.getSize(),
            canUndo: this.history.canUndo(),
            canRedo: this.history.canRedo(),
            isModified: this.isModified
        };
    }

    /**
     * Dispose editor
     */
    dispose() {
        // Stop auto-save
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        // Dispose renderer
        if (this.avatarRenderer) {
            this.avatarRenderer.dispose();
        }

        // Dispose Three.js
        this.renderer.dispose();
        this.controls.dispose();

        // Remove DOM elements
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

export default VoxelAvatarEditor;
