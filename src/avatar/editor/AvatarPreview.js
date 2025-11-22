/**
 * AvatarPreview - Live animated preview panel for avatar editor
 *
 * Displays the avatar with animation, expressions, and render mode toggle.
 * Provides real-time feedback while editing.
 *
 * Features:
 * - Animation playback (idle, walk, run, emotes)
 * - Expression testing
 * - Render mode toggle (cube/smooth)
 * - Lighting preview
 * - Turntable auto-rotate
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VoxelAvatarRenderer, RENDER_MODE } from '../render/VoxelAvatarRenderer.js';
import { VoxelAvatarRig } from '../rig/VoxelAvatarRig.js';
import { AvatarAnimationMixer, ANIMATION_STATE } from '../animation/AvatarAnimationMixer.js';
import { ExpressionController, EXPRESSION } from '../animation/ExpressionController.js';
import { LookAtController } from '../animation/LookAtController.js';

// Preview lighting presets
export const LIGHTING_PRESET = {
    STUDIO: 'studio',
    OUTDOOR: 'outdoor',
    DRAMATIC: 'dramatic',
    FLAT: 'flat'
};

// Background presets
export const BACKGROUND_PRESET = {
    DARK: 0x1a1a2e,
    LIGHT: 0xe8e8e8,
    BLUE: 0x2c3e50,
    GREEN: 0x27ae60,
    TRANSPARENT: null
};

export class AvatarPreview {
    constructor(containerElement, options = {}) {
        // Container
        this.container = containerElement;

        // Three.js components
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;

        // Avatar components
        this.avatarData = null;
        this.avatarRig = null;
        this.avatarRenderer = null;
        this.animationMixer = null;
        this.expressionController = null;
        this.lookAtController = null;

        // Lighting
        this.lights = {
            ambient: null,
            key: null,
            fill: null,
            rim: null
        };

        // Ground plane
        this.groundPlane = null;

        // Preview state
        this.isPlaying = true;
        this.turntableEnabled = options.turntable || false;
        this.turntableSpeed = options.turntableSpeed || 0.5;
        this.currentAnimation = ANIMATION_STATE.IDLE;
        this.currentExpression = EXPRESSION.NEUTRAL;
        this.renderMode = options.renderMode || RENDER_MODE.CUBE;

        // Timing
        this.clock = new THREE.Clock();
        this.animationId = null;

        // Options
        this.backgroundColor = options.backgroundColor || BACKGROUND_PRESET.DARK;
        this.showGround = options.showGround !== false;
        this.showShadows = options.showShadows !== false;

        // Callbacks
        this.onAnimationChange = options.onAnimationChange || null;
        this.onRenderModeChange = options.onRenderModeChange || null;

        // Initialize
        this.initialize();
    }

    /**
     * Initialize the preview
     */
    initialize() {
        this.setupRenderer();
        this.setupScene();
        this.setupLighting(LIGHTING_PRESET.STUDIO);
        this.setupGround();
        this.setupControls();
        this.startRenderLoop();
    }

    /**
     * Setup Three.js renderer
     */
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: this.backgroundColor === null
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.showShadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    /**
     * Setup scene and camera
     */
    setupScene() {
        this.scene = new THREE.Scene();

        if (this.backgroundColor !== null) {
            this.scene.background = new THREE.Color(this.backgroundColor);
        }

        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100);
        this.camera.position.set(0, 1.2, 3.5);
    }

    /**
     * Setup lighting
     */
    setupLighting(preset = LIGHTING_PRESET.STUDIO) {
        // Remove existing lights
        for (const light of Object.values(this.lights)) {
            if (light) this.scene.remove(light);
        }

        switch (preset) {
            case LIGHTING_PRESET.STUDIO:
                this.lights.ambient = new THREE.AmbientLight(0x404060, 0.4);

                this.lights.key = new THREE.DirectionalLight(0xffffff, 1.0);
                this.lights.key.position.set(3, 5, 3);
                this.lights.key.castShadow = this.showShadows;
                this.lights.key.shadow.mapSize.width = 1024;
                this.lights.key.shadow.mapSize.height = 1024;

                this.lights.fill = new THREE.DirectionalLight(0x8888ff, 0.3);
                this.lights.fill.position.set(-3, 3, -2);

                this.lights.rim = new THREE.DirectionalLight(0xffffee, 0.4);
                this.lights.rim.position.set(0, 3, -5);
                break;

            case LIGHTING_PRESET.OUTDOOR:
                this.lights.ambient = new THREE.AmbientLight(0x87ceeb, 0.5);

                this.lights.key = new THREE.DirectionalLight(0xfffacd, 1.2);
                this.lights.key.position.set(5, 10, 2);
                this.lights.key.castShadow = this.showShadows;

                this.lights.fill = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.4);
                break;

            case LIGHTING_PRESET.DRAMATIC:
                this.lights.ambient = new THREE.AmbientLight(0x101020, 0.2);

                this.lights.key = new THREE.SpotLight(0xff6600, 2.0);
                this.lights.key.position.set(2, 4, 2);
                this.lights.key.angle = Math.PI / 6;
                this.lights.key.castShadow = this.showShadows;

                this.lights.rim = new THREE.SpotLight(0x0066ff, 1.0);
                this.lights.rim.position.set(-2, 3, -2);
                this.lights.rim.angle = Math.PI / 4;
                break;

            case LIGHTING_PRESET.FLAT:
                this.lights.ambient = new THREE.AmbientLight(0xffffff, 1.0);
                break;
        }

        // Add lights to scene
        for (const light of Object.values(this.lights)) {
            if (light) this.scene.add(light);
        }
    }

    /**
     * Setup ground plane
     */
    setupGround() {
        if (!this.showGround) return;

        const geometry = new THREE.PlaneGeometry(5, 5);
        const material = new THREE.MeshStandardMaterial({
            color: 0x333344,
            roughness: 0.8,
            metalness: 0.2
        });

        this.groundPlane = new THREE.Mesh(geometry, material);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.receiveShadow = this.showShadows;
        this.scene.add(this.groundPlane);
    }

    /**
     * Setup orbit controls
     */
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.target.set(0, 1, 0);
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 8;
        this.controls.maxPolarAngle = Math.PI * 0.9;
    }

    /**
     * Load avatar for preview
     */
    loadAvatar(avatarData) {
        // Remove existing avatar
        if (this.avatarRenderer) {
            this.scene.remove(this.avatarRenderer.getObject3D());
            this.avatarRenderer.dispose();
        }

        this.avatarData = avatarData;

        // Create rig
        this.avatarRig = new VoxelAvatarRig();
        this.avatarRig.initialize(avatarData);

        // Create renderer
        this.avatarRenderer = new VoxelAvatarRenderer({
            renderMode: this.renderMode,
            enableShadows: this.showShadows
        });

        const avatarObject = this.avatarRenderer.initialize(avatarData, this.avatarRig);
        this.scene.add(avatarObject);

        // Create animation mixer
        this.animationMixer = new AvatarAnimationMixer();
        this.animationMixer.initialize(this.avatarRig);

        // Create expression controller
        this.expressionController = new ExpressionController();
        this.expressionController.initialize(avatarData);

        // Create look-at controller
        this.lookAtController = new LookAtController();
        this.lookAtController.initialize(this.avatarRig);

        // Set initial state
        this.setAnimation(ANIMATION_STATE.IDLE);
    }

    /**
     * Update avatar (after edits)
     */
    updateAvatar() {
        if (this.avatarRenderer) {
            this.avatarRenderer.rebuildMeshes();
        }
    }

    /**
     * Set animation state
     */
    setAnimation(state) {
        this.currentAnimation = state;

        if (this.animationMixer) {
            this.animationMixer.setState(state);
        }

        if (this.onAnimationChange) {
            this.onAnimationChange(state);
        }
    }

    /**
     * Set expression
     */
    setExpression(expression) {
        this.currentExpression = expression;

        if (this.expressionController) {
            this.expressionController.setExpression(expression);
        }
    }

    /**
     * Set render mode
     */
    setRenderMode(mode) {
        this.renderMode = mode;

        if (this.avatarRenderer) {
            this.avatarRenderer.setRenderMode(mode);
        }

        if (this.onRenderModeChange) {
            this.onRenderModeChange(mode);
        }
    }

    /**
     * Toggle render mode
     */
    toggleRenderMode() {
        const newMode = this.renderMode === RENDER_MODE.CUBE
            ? RENDER_MODE.SMOOTH
            : RENDER_MODE.CUBE;
        this.setRenderMode(newMode);
        return newMode;
    }

    /**
     * Set background
     */
    setBackground(preset) {
        this.backgroundColor = preset;

        if (preset === null) {
            this.scene.background = null;
            this.renderer.setClearColor(0x000000, 0);
        } else {
            this.scene.background = new THREE.Color(preset);
        }
    }

    /**
     * Toggle turntable rotation
     */
    toggleTurntable() {
        this.turntableEnabled = !this.turntableEnabled;
        return this.turntableEnabled;
    }

    /**
     * Set turntable speed
     */
    setTurntableSpeed(speed) {
        this.turntableSpeed = speed;
    }

    /**
     * Play/pause animation
     */
    togglePlayback() {
        this.isPlaying = !this.isPlaying;
        return this.isPlaying;
    }

    /**
     * Set look-at target
     */
    setLookAtTarget(target) {
        if (this.lookAtController) {
            this.lookAtController.lookAt(target);
        }
    }

    /**
     * Enable/disable auto look
     */
    setAutoLook(enabled) {
        if (this.lookAtController) {
            this.lookAtController.setAutoLookEnabled(enabled);
        }
    }

    /**
     * Take screenshot
     */
    takeScreenshot(width = 512, height = 512) {
        // Store current size
        const currentWidth = this.container.clientWidth;
        const currentHeight = this.container.clientHeight;

        // Resize for screenshot
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Render
        this.renderer.render(this.scene, this.camera);

        // Get image data
        const dataURL = this.renderer.domElement.toDataURL('image/png');

        // Restore size
        this.renderer.setSize(currentWidth, currentHeight);
        this.camera.aspect = currentWidth / currentHeight;
        this.camera.updateProjectionMatrix();

        return dataURL;
    }

    /**
     * Generate thumbnail
     */
    generateThumbnail(size = 256) {
        return this.takeScreenshot(size, size);
    }

    /**
     * Start render loop
     */
    startRenderLoop() {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            const deltaTime = this.clock.getDelta();

            if (this.isPlaying) {
                this.update(deltaTime);
            }

            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };

        animate();
    }

    /**
     * Update animation state
     */
    update(deltaTime) {
        // Update animation mixer
        if (this.animationMixer) {
            this.animationMixer.update(deltaTime);
        }

        // Update expression controller
        if (this.expressionController) {
            this.expressionController.update(deltaTime);
        }

        // Update look-at controller
        if (this.lookAtController) {
            this.lookAtController.update(deltaTime);
        }

        // Update avatar renderer
        if (this.avatarRenderer) {
            this.avatarRenderer.update(this.camera, deltaTime);
        }

        // Turntable rotation
        if (this.turntableEnabled && this.avatarRenderer) {
            const avatarObject = this.avatarRenderer.getObject3D();
            avatarObject.rotation.y += deltaTime * this.turntableSpeed;
        }
    }

    /**
     * Handle resize
     */
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Reset camera position
     */
    resetCamera() {
        this.camera.position.set(0, 1.2, 3.5);
        this.controls.target.set(0, 1, 0);
        this.controls.update();
    }

    /**
     * Set camera view
     */
    setCameraView(view) {
        const distance = 3;
        const target = new THREE.Vector3(0, 1, 0);

        switch (view) {
            case 'front':
                this.camera.position.set(0, 1, distance);
                break;
            case 'back':
                this.camera.position.set(0, 1, -distance);
                break;
            case 'left':
                this.camera.position.set(-distance, 1, 0);
                break;
            case 'right':
                this.camera.position.set(distance, 1, 0);
                break;
            case 'top':
                this.camera.position.set(0, distance + 1, 0.01);
                break;
        }

        this.controls.target.copy(target);
        this.controls.update();
    }

    /**
     * Get available animations
     */
    getAvailableAnimations() {
        return Object.values(ANIMATION_STATE);
    }

    /**
     * Get available expressions
     */
    getAvailableExpressions() {
        return Object.values(EXPRESSION);
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            turntableEnabled: this.turntableEnabled,
            currentAnimation: this.currentAnimation,
            currentExpression: this.currentExpression,
            renderMode: this.renderMode
        };
    }

    /**
     * Dispose resources
     */
    dispose() {
        // Stop render loop
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Dispose avatar
        if (this.avatarRenderer) {
            this.avatarRenderer.dispose();
        }

        // Dispose controllers
        if (this.animationMixer) {
            this.animationMixer.dispose();
        }
        if (this.expressionController) {
            this.expressionController.dispose();
        }
        if (this.lookAtController) {
            this.lookAtController.dispose();
        }

        // Dispose Three.js
        this.renderer.dispose();
        this.controls.dispose();

        // Remove DOM element
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

export default AvatarPreview;
