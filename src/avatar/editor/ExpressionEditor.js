/**
 * ExpressionEditor - Face expression creation and editing
 *
 * Provides tools for creating facial expressions by editing voxels
 * in the face region. Expressions are stored as deltas from neutral.
 *
 * Features:
 * - Face region isolation view
 * - Expression slot selection
 * - Delta voxel editing (changes from neutral)
 * - Preview expression on avatar
 * - Copy/mirror expression data
 */

import * as THREE from 'three';
import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';
import { EXPRESSION } from '../animation/ExpressionController.js';

// Face region bounds (where expressions are edited)
export const FACE_REGION = {
    minX: 10,
    maxX: 22,
    minY: 56,
    maxY: 64,
    minZ: 16,
    maxZ: 24
};

// Expression slot definitions
export const EXPRESSION_SLOTS = [
    { id: EXPRESSION.NEUTRAL, name: 'Neutral', description: 'Default resting face', editable: false },
    { id: EXPRESSION.HAPPY, name: 'Happy', description: 'Smiling, raised cheeks', editable: true },
    { id: EXPRESSION.SAD, name: 'Sad', description: 'Frowning, lowered mouth', editable: true },
    { id: EXPRESSION.ANGRY, name: 'Angry', description: 'Furrowed brow, tight mouth', editable: true },
    { id: EXPRESSION.SURPRISED, name: 'Surprised', description: 'Wide eyes, open mouth', editable: true },
    { id: EXPRESSION.BLINK, name: 'Blink', description: 'Closed eyes', editable: true },
    { id: 'custom1', name: 'Custom 1', description: 'User-defined expression', editable: true },
    { id: 'custom2', name: 'Custom 2', description: 'User-defined expression', editable: true }
];

export class ExpressionEditor {
    constructor(options = {}) {
        // Reference to main editor
        this.mainEditor = null;
        this.avatarData = null;

        // Current expression being edited
        this.currentExpression = EXPRESSION.HAPPY;
        this.isEditing = false;

        // Neutral face snapshot (base for deltas)
        this.neutralSnapshot = new Map();

        // Current expression delta
        this.currentDelta = new Map();

        // Three.js components for isolated view
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Face mesh for editing
        this.faceMesh = null;
        this.faceVoxels = [];

        // UI state
        this.selectedVoxel = null;
        this.previewMode = false;
        this.blendWeight = 1.0;

        // Raycasting
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Options
        this.containerElement = options.container || null;
        this.onExpressionChange = options.onExpressionChange || null;
    }

    /**
     * Initialize expression editor
     * @param {VoxelAvatarData} avatarData - Avatar data reference
     */
    initialize(avatarData, container = null) {
        this.avatarData = avatarData;

        if (container) {
            this.containerElement = container;
            this.setupRenderer();
        }

        // Capture neutral face
        this.captureNeutralFace();

        // Load existing expressions
        this.loadExpressions();
    }

    /**
     * Setup Three.js renderer for isolated face view
     */
    setupRenderer() {
        if (!this.containerElement) return;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a2a3e);

        // Camera (orthographic for precise editing)
        const aspect = this.containerElement.clientWidth / this.containerElement.clientHeight;
        const viewSize = 0.5;
        this.camera = new THREE.OrthographicCamera(
            -viewSize * aspect, viewSize * aspect,
            viewSize, -viewSize,
            0.1, 10
        );
        this.camera.position.set(0, 0, 2);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.containerElement.clientWidth, this.containerElement.clientHeight);
        this.containerElement.appendChild(this.renderer.domElement);

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(0, 0, 5);
        this.scene.add(directional);

        // Event listeners
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    }

    /**
     * Capture neutral face voxels as snapshot
     */
    captureNeutralFace() {
        this.neutralSnapshot.clear();

        if (!this.avatarData) return;

        // Capture all voxels in face region
        for (let x = FACE_REGION.minX; x <= FACE_REGION.maxX; x++) {
            for (let y = FACE_REGION.minY; y <= FACE_REGION.maxY; y++) {
                for (let z = FACE_REGION.minZ; z <= FACE_REGION.maxZ; z++) {
                    const paletteIndex = this.avatarData.getVoxel(x, y, z);
                    if (paletteIndex !== null) {
                        const key = this.avatarData.encodePosition(x, y, z);
                        this.neutralSnapshot.set(key, paletteIndex);
                    }
                }
            }
        }
    }

    /**
     * Load existing expressions from avatar data
     */
    loadExpressions() {
        if (!this.avatarData) return;

        // Expressions are already stored in avatarData.expressions
        // Just ensure neutral exists
        if (!this.avatarData.getExpression(EXPRESSION.NEUTRAL)) {
            this.avatarData.setExpression(EXPRESSION.NEUTRAL, new Map());
        }
    }

    /**
     * Select expression slot for editing
     */
    selectExpression(expressionId) {
        // Save current if editing
        if (this.isEditing) {
            this.saveCurrentExpression();
        }

        this.currentExpression = expressionId;

        // Load expression delta
        const existingDelta = this.avatarData.getExpression(expressionId);
        this.currentDelta = existingDelta ? new Map(existingDelta) : new Map();

        // Update face view
        this.updateFaceView();
    }

    /**
     * Start editing current expression
     */
    startEditing() {
        const slot = EXPRESSION_SLOTS.find(s => s.id === this.currentExpression);
        if (!slot || !slot.editable) {
            console.warn('[ExpressionEditor] Cannot edit this expression slot');
            return false;
        }

        this.isEditing = true;
        return true;
    }

    /**
     * Stop editing and save
     */
    stopEditing() {
        if (this.isEditing) {
            this.saveCurrentExpression();
            this.isEditing = false;
        }
    }

    /**
     * Set voxel in current expression
     * @param {number} x - X coordinate (face region local)
     * @param {number} y - Y coordinate (face region local)
     * @param {number} z - Z coordinate (face region local)
     * @param {number} paletteIndex - Palette index, or null to remove
     */
    setExpressionVoxel(x, y, z, paletteIndex) {
        if (!this.isEditing) return false;

        // Convert to global coordinates
        const globalX = FACE_REGION.minX + x;
        const globalY = FACE_REGION.minY + y;
        const globalZ = FACE_REGION.minZ + z;

        // Validate bounds
        if (globalX > FACE_REGION.maxX || globalY > FACE_REGION.maxY || globalZ > FACE_REGION.maxZ) {
            return false;
        }

        const key = this.avatarData.encodePosition(globalX, globalY, globalZ);
        const neutralValue = this.neutralSnapshot.get(key);

        if (paletteIndex === null) {
            // Remove from delta (revert to neutral or empty)
            this.currentDelta.delete(key);
        } else if (paletteIndex !== neutralValue) {
            // Store as delta (different from neutral)
            this.currentDelta.set(key, paletteIndex);
        } else {
            // Same as neutral, remove from delta
            this.currentDelta.delete(key);
        }

        // Update view
        this.updateFaceView();

        return true;
    }

    /**
     * Remove voxel from expression
     */
    removeExpressionVoxel(x, y, z) {
        return this.setExpressionVoxel(x, y, z, null);
    }

    /**
     * Save current expression to avatar data
     */
    saveCurrentExpression() {
        if (!this.avatarData || !this.currentExpression) return;

        this.avatarData.setExpression(this.currentExpression, new Map(this.currentDelta));

        if (this.onExpressionChange) {
            this.onExpressionChange(this.currentExpression, this.currentDelta);
        }
    }

    /**
     * Update face mesh view
     */
    updateFaceView() {
        if (!this.scene) return;

        // Remove existing face mesh
        if (this.faceMesh) {
            this.scene.remove(this.faceMesh);
            this.faceMesh.geometry.dispose();
        }

        // Build face geometry from neutral + delta
        const positions = [];
        const colors = [];
        const voxelScale = 0.03;

        // Combine neutral with current delta
        const faceVoxels = new Map(this.neutralSnapshot);
        for (const [key, paletteIndex] of this.currentDelta) {
            if (paletteIndex !== null) {
                faceVoxels.set(key, paletteIndex);
            } else {
                faceVoxels.delete(key);
            }
        }

        // Create cube for each voxel
        for (const [key, paletteIndex] of faceVoxels) {
            const pos = this.avatarData.decodePosition(key);

            // Center the face in view
            const localX = (pos.x - (FACE_REGION.minX + FACE_REGION.maxX) / 2) * voxelScale;
            const localY = (pos.y - (FACE_REGION.minY + FACE_REGION.maxY) / 2) * voxelScale;
            const localZ = (pos.z - FACE_REGION.minZ) * voxelScale;

            // Add cube vertices
            this.addCubeToArrays(positions, colors, localX, localY, localZ, voxelScale, paletteIndex);
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        // Create mesh
        const material = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.faceMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.faceMesh);
    }

    /**
     * Add cube vertices to arrays
     */
    addCubeToArrays(positions, colors, x, y, z, size, paletteIndex) {
        const s = size * 0.5;
        const color = this.avatarData.palette.getColorNormalized(paletteIndex) || [1, 0, 1, 1];

        // Front face
        const faces = [
            // Front
            [[-s, -s, s], [s, -s, s], [s, s, s], [-s, -s, s], [s, s, s], [-s, s, s]],
            // Back
            [[s, -s, -s], [-s, -s, -s], [-s, s, -s], [s, -s, -s], [-s, s, -s], [s, s, -s]],
            // Top
            [[-s, s, -s], [-s, s, s], [s, s, s], [-s, s, -s], [s, s, s], [s, s, -s]],
            // Bottom
            [[-s, -s, s], [-s, -s, -s], [s, -s, -s], [-s, -s, s], [s, -s, -s], [s, -s, s]],
            // Right
            [[s, -s, s], [s, -s, -s], [s, s, -s], [s, -s, s], [s, s, -s], [s, s, s]],
            // Left
            [[-s, -s, -s], [-s, -s, s], [-s, s, s], [-s, -s, -s], [-s, s, s], [-s, s, -s]]
        ];

        for (const face of faces) {
            for (const vertex of face) {
                positions.push(x + vertex[0], y + vertex[1], z + vertex[2]);
                colors.push(color[0], color[1], color[2]);
            }
        }
    }

    /**
     * Copy expression to another slot
     */
    copyExpression(fromId, toId) {
        const sourceDelta = this.avatarData.getExpression(fromId);
        if (!sourceDelta) return false;

        this.avatarData.setExpression(toId, new Map(sourceDelta));
        return true;
    }

    /**
     * Mirror expression (left/right swap)
     */
    mirrorExpression() {
        const mirroredDelta = new Map();
        const centerX = (FACE_REGION.minX + FACE_REGION.maxX) / 2;

        for (const [key, paletteIndex] of this.currentDelta) {
            const pos = this.avatarData.decodePosition(key);

            // Mirror X coordinate around center
            const mirroredX = Math.round(2 * centerX - pos.x);

            // Validate bounds
            if (mirroredX >= FACE_REGION.minX && mirroredX <= FACE_REGION.maxX) {
                const mirroredKey = this.avatarData.encodePosition(mirroredX, pos.y, pos.z);
                mirroredDelta.set(mirroredKey, paletteIndex);
            }
        }

        this.currentDelta = mirroredDelta;
        this.updateFaceView();
    }

    /**
     * Clear current expression (revert to neutral)
     */
    clearExpression() {
        this.currentDelta.clear();
        this.updateFaceView();
    }

    /**
     * Preview expression with blend weight
     */
    setPreviewWeight(weight) {
        this.blendWeight = Math.max(0, Math.min(1, weight));
        // This would be used by the main renderer to blend the expression
    }

    /**
     * Toggle preview mode
     */
    togglePreview() {
        this.previewMode = !this.previewMode;
        return this.previewMode;
    }

    /**
     * Mouse move handler
     */
    onMouseMove(event) {
        if (!this.renderer) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * Click handler for voxel selection
     */
    onClick(event) {
        if (!this.isEditing || !this.faceMesh) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.faceMesh);

        if (intersects.length > 0) {
            // Convert intersection point to voxel coordinates
            const point = intersects[0].point;
            // Handle voxel selection/modification
            // This would integrate with the main editor's current tool
        }
    }

    /**
     * Render loop
     */
    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Get expression statistics
     */
    getStats() {
        return {
            currentExpression: this.currentExpression,
            isEditing: this.isEditing,
            deltaSize: this.currentDelta.size,
            neutralSize: this.neutralSnapshot.size,
            blendWeight: this.blendWeight
        };
    }

    /**
     * Get all expression slots
     */
    getExpressionSlots() {
        return EXPRESSION_SLOTS.map(slot => ({
            ...slot,
            hasDelta: this.avatarData?.getExpression(slot.id)?.size > 0
        }));
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.stopEditing();

        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }

        if (this.faceMesh) {
            this.faceMesh.geometry.dispose();
            this.faceMesh.material.dispose();
        }

        this.neutralSnapshot.clear();
        this.currentDelta.clear();
    }
}

export default ExpressionEditor;
