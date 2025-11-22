/**
 * AvatarImpostor - Distant avatar billboard rendering
 *
 * Renders far-away avatars as billboard sprites for performance.
 * Generates color-sampled impostors from avatar data.
 *
 * Features:
 * - Billboard sprite generation
 * - Color-sampled impostor (dominant colors)
 * - Smooth transition to full render
 * - Shadow proxy (simple shape)
 */

import * as THREE from 'three';
import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';

// Impostor configuration
const IMPOSTOR_SIZE = 64;             // Sprite texture resolution
const IMPOSTOR_VIEWS = 8;             // Number of rotation views
const TRANSITION_DISTANCE = 10;       // Blend distance between impostor and full

export class AvatarImpostor {
    constructor(options = {}) {
        // Generated impostor textures
        this.impostorTexture = null;
        this.impostorMaterial = null;
        this.impostorSprite = null;

        // Shadow proxy
        this.shadowProxy = null;

        // Source avatar reference
        this.avatarData = null;
        this.dominantColors = [];

        // Current state
        this.currentView = 0;
        this.opacity = 1.0;
        this.isVisible = true;

        // Options
        this.textureSize = options.textureSize || IMPOSTOR_SIZE;
        this.viewCount = options.viewCount || IMPOSTOR_VIEWS;
        this.enableShadow = options.enableShadow !== false;

        // Render target for generating sprites
        this.renderTarget = null;
        this.renderScene = null;
        this.renderCamera = null;
    }

    /**
     * Generate impostor from avatar data
     * @param {VoxelAvatarData} avatarData - Source avatar data
     * @param {THREE.WebGLRenderer} renderer - Three.js renderer for texture generation
     */
    generate(avatarData, renderer) {
        this.avatarData = avatarData;

        // Extract dominant colors
        this.extractDominantColors();

        // Generate sprite texture
        this.generateTexture(renderer);

        // Create sprite material and mesh
        this.createSprite();

        // Create shadow proxy
        if (this.enableShadow) {
            this.createShadowProxy();
        }
    }

    /**
     * Extract dominant colors from avatar palette
     */
    extractDominantColors() {
        this.dominantColors = [];

        if (!this.avatarData) return;

        // Count voxels per color
        const colorCounts = new Map();
        this.avatarData.forEach((x, y, z, paletteIndex) => {
            colorCounts.set(paletteIndex, (colorCounts.get(paletteIndex) || 0) + 1);
        });

        // Sort by frequency
        const sorted = Array.from(colorCounts.entries())
            .sort((a, b) => b[1] - a[1]);

        // Get top 4 colors
        for (let i = 0; i < Math.min(4, sorted.length); i++) {
            const [paletteIndex, count] = sorted[i];
            const color = this.avatarData.palette.getColor(paletteIndex);
            if (color) {
                this.dominantColors.push({
                    index: paletteIndex,
                    color: new THREE.Color(color.r / 255, color.g / 255, color.b / 255),
                    count
                });
            }
        }
    }

    /**
     * Generate impostor texture with multiple views
     */
    generateTexture(renderer) {
        // Setup offscreen rendering
        this.renderTarget = new THREE.WebGLRenderTarget(
            this.textureSize * this.viewCount,
            this.textureSize,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            }
        );

        this.renderScene = new THREE.Scene();
        this.renderScene.background = null; // Transparent

        // Orthographic camera for clean silhouette
        const aspect = 1;
        const frustumSize = 2;
        this.renderCamera = new THREE.OrthographicCamera(
            -frustumSize * aspect,
            frustumSize * aspect,
            frustumSize,
            -frustumSize,
            0.1,
            10
        );
        this.renderCamera.position.z = 5;

        // Create simplified avatar mesh for rendering
        const simplifiedMesh = this.createSimplifiedMesh();
        this.renderScene.add(simplifiedMesh);

        // Add lighting (stored for disposal)
        this._renderLight = new THREE.DirectionalLight(0xffffff, 1);
        this._renderLight.position.set(1, 1, 2);
        this.renderScene.add(this._renderLight);

        this._renderAmbient = new THREE.AmbientLight(0x404040, 0.5);
        this.renderScene.add(this._renderAmbient);

        // Save current render target
        const currentTarget = renderer.getRenderTarget();

        for (let view = 0; view < this.viewCount; view++) {
            const angle = (view / this.viewCount) * Math.PI * 2;
            simplifiedMesh.rotation.y = angle;

            // Set viewport for this view
            renderer.setRenderTarget(this.renderTarget);
            renderer.setViewport(
                view * this.textureSize,
                0,
                this.textureSize,
                this.textureSize
            );
            renderer.render(this.renderScene, this.renderCamera);
        }

        // Restore render target
        renderer.setRenderTarget(currentTarget);
        renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);

        // Store texture
        this.impostorTexture = this.renderTarget.texture;

        // Cleanup temporary mesh
        this.renderScene.remove(simplifiedMesh);
        simplifiedMesh.geometry.dispose();
        simplifiedMesh.material.dispose();
    }

    /**
     * Create simplified mesh for impostor rendering
     */
    createSimplifiedMesh() {
        if (!this.avatarData) {
            // Return placeholder
            const geometry = new THREE.BoxGeometry(0.5, 1.5, 0.3);
            const material = new THREE.MeshLambertMaterial({ color: 0x888888 });
            return new THREE.Mesh(geometry, material);
        }

        // Create merged geometry from voxels (simplified)
        const positions = [];
        const colors = [];
        const voxelScale = 0.03;

        // Sample every Nth voxel for performance
        const sampleRate = 2;
        let sampledCount = 0;

        this.avatarData.forEach((x, y, z, paletteIndex) => {
            sampledCount++;
            if (sampledCount % sampleRate !== 0) return;

            const color = this.avatarData.palette.getColorNormalized(paletteIndex);
            if (!color) return;

            // Convert to world coordinates
            const wx = (x - AVATAR_WIDTH / 2) * voxelScale;
            const wy = y * voxelScale;
            const wz = (z - AVATAR_DEPTH / 2) * voxelScale;

            // Add cube vertices
            this.addCube(positions, colors, wx, wy, wz, voxelScale * sampleRate, color);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({ vertexColors: true });
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Add cube to geometry arrays
     */
    addCube(positions, colors, x, y, z, size, color) {
        const s = size * 0.5;

        // Simplified: just front and top faces for billboard
        const faces = [
            // Front
            [[x - s, y - s, z + s], [x + s, y - s, z + s], [x + s, y + s, z + s],
             [x - s, y - s, z + s], [x + s, y + s, z + s], [x - s, y + s, z + s]],
            // Top
            [[x - s, y + s, z - s], [x - s, y + s, z + s], [x + s, y + s, z + s],
             [x - s, y + s, z - s], [x + s, y + s, z + s], [x + s, y + s, z - s]]
        ];

        for (const face of faces) {
            for (const vertex of face) {
                positions.push(vertex[0], vertex[1], vertex[2]);
                colors.push(color[0], color[1], color[2]);
            }
        }
    }

    /**
     * Create billboard sprite
     */
    createSprite() {
        if (!this.impostorTexture) return;

        // Create material with atlas texture
        this.impostorMaterial = new THREE.SpriteMaterial({
            map: this.impostorTexture,
            transparent: true,
            alphaTest: 0.1
        });

        this.impostorSprite = new THREE.Sprite(this.impostorMaterial);
        this.impostorSprite.scale.set(1, 2, 1); // Avatar proportions
        this.impostorSprite.center.set(0.5, 0); // Bottom-center pivot
    }

    /**
     * Create shadow proxy (simple capsule)
     */
    createShadowProxy() {
        // Capsule-like shadow using cylinder + spheres
        const proxyGroup = new THREE.Group();

        // Main body cylinder
        const cylinderGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
        const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const cylinder = new THREE.Mesh(cylinderGeometry, shadowMaterial);
        cylinder.position.y = 0.8;
        cylinder.castShadow = true;
        proxyGroup.add(cylinder);

        // Head sphere
        const sphereGeometry = new THREE.SphereGeometry(0.2, 8, 6);
        const headSphere = new THREE.Mesh(sphereGeometry, shadowMaterial);
        headSphere.position.y = 1.5;
        headSphere.castShadow = true;
        proxyGroup.add(headSphere);

        this.shadowProxy = proxyGroup;
        this.shadowProxy.visible = this.enableShadow;
    }

    /**
     * Update impostor based on camera angle
     * @param {THREE.Camera} camera - Scene camera
     */
    update(camera) {
        if (!this.impostorSprite || !camera) return;

        // Calculate view angle relative to avatar
        const avatarPos = this.impostorSprite.position;
        const cameraPos = camera.position;

        const dx = cameraPos.x - avatarPos.x;
        const dz = cameraPos.z - avatarPos.z;
        let angle = Math.atan2(dx, dz);
        if (angle < 0) angle += Math.PI * 2;

        // Select view from atlas
        const viewIndex = Math.floor((angle / (Math.PI * 2)) * this.viewCount) % this.viewCount;

        if (viewIndex !== this.currentView) {
            this.currentView = viewIndex;
            this.updateTextureOffset();
        }

        // Update shadow proxy position
        if (this.shadowProxy) {
            this.shadowProxy.position.copy(avatarPos);
        }
    }

    /**
     * Update texture UV offset for current view
     */
    updateTextureOffset() {
        if (!this.impostorMaterial || !this.impostorTexture) return;

        // Calculate UV offset for current view
        const offset = this.currentView / this.viewCount;
        const width = 1 / this.viewCount;

        // Update material UV transform
        this.impostorMaterial.map.offset.x = offset;
        this.impostorMaterial.map.repeat.x = width;
    }

    /**
     * Set impostor position
     */
    setPosition(x, y, z) {
        if (this.impostorSprite) {
            this.impostorSprite.position.set(x, y, z);
        }
        if (this.shadowProxy) {
            this.shadowProxy.position.set(x, y, z);
        }
    }

    /**
     * Set opacity (for transition blending)
     */
    setOpacity(opacity) {
        this.opacity = opacity;
        if (this.impostorMaterial) {
            this.impostorMaterial.opacity = opacity;
        }
    }

    /**
     * Set visibility
     */
    setVisible(visible) {
        this.isVisible = visible;
        if (this.impostorSprite) {
            this.impostorSprite.visible = visible;
        }
        if (this.shadowProxy) {
            this.shadowProxy.visible = visible && this.enableShadow;
        }
    }

    /**
     * Get the Three.js object for adding to scene
     */
    getObject3D() {
        const group = new THREE.Group();
        if (this.impostorSprite) {
            group.add(this.impostorSprite);
        }
        if (this.shadowProxy) {
            group.add(this.shadowProxy);
        }
        return group;
    }

    /**
     * Get just the sprite
     */
    getSprite() {
        return this.impostorSprite;
    }

    /**
     * Get shadow proxy
     */
    getShadowProxy() {
        return this.shadowProxy;
    }

    /**
     * Calculate blend factor between impostor and full render
     * @param {number} distance - Distance from camera
     * @param {number} lodFarDistance - LOD far distance
     */
    calculateBlendFactor(distance, lodFarDistance) {
        const startBlend = lodFarDistance - TRANSITION_DISTANCE;
        const endBlend = lodFarDistance;

        if (distance <= startBlend) {
            return 0; // Full avatar
        } else if (distance >= endBlend) {
            return 1; // Full impostor
        } else {
            return (distance - startBlend) / TRANSITION_DISTANCE;
        }
    }

    /**
     * Generate simple color-based impostor (no 3D rendering)
     * Faster alternative using dominant colors
     */
    generateSimpleImpostor() {
        this.extractDominantColors();

        if (this.dominantColors.length === 0) {
            // Default gray impostor
            this.dominantColors.push({
                color: new THREE.Color(0.5, 0.5, 0.5),
                count: 1
            });
        }

        // Create canvas-based texture
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Draw simple silhouette with dominant colors
        const mainColor = this.dominantColors[0].color;
        ctx.fillStyle = `rgb(${mainColor.r * 255}, ${mainColor.g * 255}, ${mainColor.b * 255})`;

        // Head (circle)
        ctx.beginPath();
        ctx.arc(16, 12, 8, 0, Math.PI * 2);
        ctx.fill();

        // Body (rectangle)
        ctx.fillRect(8, 20, 16, 24);

        // Legs (rectangles)
        ctx.fillRect(8, 44, 6, 18);
        ctx.fillRect(18, 44, 6, 18);

        // Arms
        if (this.dominantColors.length > 1) {
            const armColor = this.dominantColors[1].color;
            ctx.fillStyle = `rgb(${armColor.r * 255}, ${armColor.g * 255}, ${armColor.b * 255})`;
        }
        ctx.fillRect(2, 22, 6, 16);
        ctx.fillRect(24, 22, 6, 16);

        // Create texture from canvas
        this.impostorTexture = new THREE.CanvasTexture(canvas);
        this.impostorTexture.minFilter = THREE.LinearFilter;
        this.impostorTexture.magFilter = THREE.NearestFilter;

        // Create sprite
        this.impostorMaterial = new THREE.SpriteMaterial({
            map: this.impostorTexture,
            transparent: true
        });

        this.impostorSprite = new THREE.Sprite(this.impostorMaterial);
        this.impostorSprite.scale.set(0.6, 1.2, 1);
        this.impostorSprite.center.set(0.5, 0);
    }

    /**
     * Dispose resources - ensure no memory leaks
     */
    dispose() {
        // Dispose material first (it references the texture)
        if (this.impostorMaterial) {
            this.impostorMaterial.dispose();
            this.impostorMaterial = null;
        }

        // Handle texture disposal carefully to avoid double-dispose:
        // - If renderTarget exists, texture came from renderTarget.texture
        //   and will be disposed when we dispose renderTarget
        // - If renderTarget is null, texture is standalone (from generateSimpleImpostor)
        //   and needs explicit disposal
        if (this.renderTarget) {
            this.renderTarget.dispose(); // This also disposes renderTarget.texture
            this.renderTarget = null;
            this.impostorTexture = null; // Just null the reference, already disposed
        } else if (this.impostorTexture) {
            // Standalone texture (from generateSimpleImpostor)
            this.impostorTexture.dispose();
            this.impostorTexture = null;
        }

        if (this.impostorSprite) {
            // Remove from parent if attached
            if (this.impostorSprite.parent) {
                this.impostorSprite.parent.remove(this.impostorSprite);
            }
            this.impostorSprite = null;
        }
        // Clean up render scene resources (prevents memory leak)
        if (this.renderScene) {
            this.renderScene.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            this.renderScene = null;
        }
        // Clear render resources
        this._renderLight = null;
        this._renderAmbient = null;
        this.renderCamera = null;
        if (this.shadowProxy) {
            // Remove from parent if attached
            if (this.shadowProxy.parent) {
                this.shadowProxy.parent.remove(this.shadowProxy);
            }
            this.shadowProxy.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
            this.shadowProxy = null;
        }
        // Clear references
        this.avatarData = null;
        this.dominantColors = [];
    }
}

export default AvatarImpostor;
