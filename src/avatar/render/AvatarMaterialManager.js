/**
 * AvatarMaterialManager - Material and shader management for avatar rendering
 *
 * Creates and manages Three.js materials for both cube and smooth render modes.
 * Supports palette-based coloring, emissive effects, and transparency.
 *
 * Features:
 * - Palette-based coloring via texture or uniforms
 * - Emissive material support for glowing parts
 * - Transparency handling
 * - Optional outline shader
 * - Material caching and reuse
 */

import * as THREE from 'three';
import { COLOR_TYPE } from '../data/AvatarPalette.js';

// Shader chunks for custom avatar rendering
const PALETTE_VERTEX_SHADER = `
    attribute vec3 color;
    varying vec3 vColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        vColor = color;
        vNormal = normalize(normalMatrix * normal);

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;

        gl_Position = projectionMatrix * mvPosition;
    }
`;

const PALETTE_FRAGMENT_SHADER = `
    uniform sampler2D paletteTexture;
    uniform vec3 ambientLight;
    uniform vec3 directionalLight;
    uniform vec3 lightDirection;

    varying vec3 vColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        // Decode palette index from color.r (0-1 range, 16 colors)
        float paletteIndex = vColor.r * 16.0;
        float u = (floor(paletteIndex) + 0.5) / 16.0;

        // Sample palette texture
        vec4 paletteColor = texture2D(paletteTexture, vec2(u, 0.5));

        // Simple lighting
        vec3 normal = normalize(vNormal);
        float diffuse = max(dot(normal, lightDirection), 0.0);

        vec3 lighting = ambientLight + directionalLight * diffuse;
        vec3 finalColor = paletteColor.rgb * lighting;

        gl_FragColor = vec4(finalColor, paletteColor.a);
    }
`;

// Simple emissive shader
const EMISSIVE_FRAGMENT_SHADER = `
    uniform sampler2D paletteTexture;
    uniform float emissiveIntensity;

    varying vec3 vColor;
    varying vec3 vNormal;

    void main() {
        float paletteIndex = vColor.r * 16.0;
        float u = (floor(paletteIndex) + 0.5) / 16.0;
        vec4 paletteColor = texture2D(paletteTexture, vec2(u, 0.5));

        // Emissive glow
        vec3 finalColor = paletteColor.rgb * (1.0 + emissiveIntensity);

        gl_FragColor = vec4(finalColor, paletteColor.a);
    }
`;

export class AvatarMaterialManager {
    constructor(options = {}) {
        // Palette data (normalized colors)
        this.paletteColors = []; // Array of [r, g, b, type] (0-1 range)

        // Palette texture (16x1 pixels)
        this.paletteTexture = null;

        // Cached materials
        this.cubeMaterial = null;
        this.smoothMaterial = null;
        this.emissiveMaterial = null;
        this.transparentMaterial = null;
        this.outlineMaterial = null;

        // Options
        this.enableOutline = options.enableOutline || false;
        this.outlineColor = options.outlineColor || 0x000000;
        this.outlineWidth = options.outlineWidth || 0.02;

        // Lighting defaults
        this.ambientLight = new THREE.Color(0.4, 0.4, 0.4);
        this.directionalLight = new THREE.Color(0.8, 0.8, 0.8);
        this.lightDirection = new THREE.Vector3(0.5, 1.0, 0.3).normalize();
    }

    /**
     * Initialize materials from avatar palette
     * @param {AvatarPalette} palette - Avatar palette instance
     */
    initializePalette(palette) {
        // Convert palette to normalized array
        this.paletteColors = [];
        for (let i = 0; i < palette.size(); i++) {
            const normalized = palette.getColorNormalized(i);
            const color = palette.getColor(i);
            this.paletteColors.push({
                r: normalized[0],
                g: normalized[1],
                b: normalized[2],
                a: normalized[3],
                type: color.type
            });
        }

        // Pad to 16 colors
        while (this.paletteColors.length < 16) {
            this.paletteColors.push({ r: 1, g: 0, b: 1, a: 1, type: COLOR_TYPE.SOLID });
        }

        // Create palette texture
        this.createPaletteTexture();

        // Create materials
        this.createMaterials();
    }

    /**
     * Create 16x1 palette texture
     */
    createPaletteTexture() {
        const size = 16;
        const data = new Uint8Array(size * 4);

        for (let i = 0; i < size; i++) {
            const color = this.paletteColors[i] || { r: 1, g: 0, b: 1, a: 1 };
            data[i * 4] = Math.round(color.r * 255);
            data[i * 4 + 1] = Math.round(color.g * 255);
            data[i * 4 + 2] = Math.round(color.b * 255);
            data[i * 4 + 3] = Math.round(color.a * 255);
        }

        if (this.paletteTexture) {
            this.paletteTexture.dispose();
        }

        this.paletteTexture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        this.paletteTexture.minFilter = THREE.NearestFilter;
        this.paletteTexture.magFilter = THREE.NearestFilter;
        this.paletteTexture.needsUpdate = true;
    }

    /**
     * Create all material types
     */
    createMaterials() {
        // Dispose existing materials
        this.dispose();

        // Cube mode material (instanced, vertex colors)
        this.cubeMaterial = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true
        });

        // Smooth mode material (custom shader with palette lookup)
        this.smoothMaterial = new THREE.ShaderMaterial({
            uniforms: {
                paletteTexture: { value: this.paletteTexture },
                ambientLight: { value: this.ambientLight },
                directionalLight: { value: this.directionalLight },
                lightDirection: { value: this.lightDirection }
            },
            vertexShader: PALETTE_VERTEX_SHADER,
            fragmentShader: PALETTE_FRAGMENT_SHADER,
            vertexColors: true
        });

        // Emissive material
        this.emissiveMaterial = new THREE.ShaderMaterial({
            uniforms: {
                paletteTexture: { value: this.paletteTexture },
                emissiveIntensity: { value: 2.0 }
            },
            vertexShader: PALETTE_VERTEX_SHADER,
            fragmentShader: EMISSIVE_FRAGMENT_SHADER,
            vertexColors: true
        });

        // Transparent material
        this.transparentMaterial = new THREE.MeshLambertMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        // Outline material (for toon effect)
        if (this.enableOutline) {
            this.outlineMaterial = new THREE.MeshBasicMaterial({
                color: this.outlineColor,
                side: THREE.BackSide
            });
        }
    }

    /**
     * Get material for cube mode rendering
     */
    getCubeMaterial() {
        return this.cubeMaterial;
    }

    /**
     * Get material for smooth mode rendering
     */
    getSmoothMaterial() {
        return this.smoothMaterial;
    }

    /**
     * Get emissive material
     */
    getEmissiveMaterial() {
        return this.emissiveMaterial;
    }

    /**
     * Get transparent material
     */
    getTransparentMaterial() {
        return this.transparentMaterial;
    }

    /**
     * Get outline material
     */
    getOutlineMaterial() {
        return this.outlineMaterial;
    }

    /**
     * Get appropriate material based on color type
     */
    getMaterialForColorType(colorType) {
        switch (colorType) {
            case COLOR_TYPE.EMISSIVE:
                return this.emissiveMaterial;
            case COLOR_TYPE.TRANSPARENT:
                return this.transparentMaterial;
            default:
                return this.smoothMaterial;
        }
    }

    /**
     * Get color as normalized array [r, g, b, a]
     * @param {number} paletteIndex - Index into palette
     * @returns {Array|null}
     */
    getColor(paletteIndex) {
        if (paletteIndex < 0 || paletteIndex >= this.paletteColors.length) {
            return null;
        }
        const c = this.paletteColors[paletteIndex];
        return [c.r, c.g, c.b, c.a];
    }

    /**
     * Get color as THREE.Color
     */
    getThreeColor(paletteIndex) {
        const c = this.paletteColors[paletteIndex];
        if (!c) return new THREE.Color(1, 0, 1); // Magenta for missing
        return new THREE.Color(c.r, c.g, c.b);
    }

    /**
     * Update a single palette color
     */
    updateColor(index, color) {
        if (index < 0 || index >= this.paletteColors.length) return;

        this.paletteColors[index] = {
            r: color.r / 255,
            g: color.g / 255,
            b: color.b / 255,
            a: color.type === COLOR_TYPE.TRANSPARENT ? 0.5 : 1.0,
            type: color.type
        };

        // Update texture
        this.updatePaletteTexture();
    }

    /**
     * Update palette texture data
     */
    updatePaletteTexture() {
        if (!this.paletteTexture) return;

        const data = this.paletteTexture.image.data;
        for (let i = 0; i < 16; i++) {
            const color = this.paletteColors[i] || { r: 1, g: 0, b: 1, a: 1 };
            data[i * 4] = Math.round(color.r * 255);
            data[i * 4 + 1] = Math.round(color.g * 255);
            data[i * 4 + 2] = Math.round(color.b * 255);
            data[i * 4 + 3] = Math.round(color.a * 255);
        }
        this.paletteTexture.needsUpdate = true;
    }

    /**
     * Set lighting parameters
     */
    setLighting(ambient, directional, direction) {
        if (ambient) {
            this.ambientLight.copy(ambient);
            if (this.smoothMaterial) {
                this.smoothMaterial.uniforms.ambientLight.value.copy(ambient);
            }
        }
        if (directional) {
            this.directionalLight.copy(directional);
            if (this.smoothMaterial) {
                this.smoothMaterial.uniforms.directionalLight.value.copy(directional);
            }
        }
        if (direction) {
            this.lightDirection.copy(direction).normalize();
            if (this.smoothMaterial) {
                this.smoothMaterial.uniforms.lightDirection.value.copy(this.lightDirection);
            }
        }
    }

    /**
     * Set emissive intensity
     */
    setEmissiveIntensity(intensity) {
        if (this.emissiveMaterial) {
            this.emissiveMaterial.uniforms.emissiveIntensity.value = intensity;
        }
    }

    /**
     * Set outline parameters
     */
    setOutline(enabled, color = null, width = null) {
        this.enableOutline = enabled;
        if (color !== null) this.outlineColor = color;
        if (width !== null) this.outlineWidth = width;

        if (enabled && !this.outlineMaterial) {
            this.outlineMaterial = new THREE.MeshBasicMaterial({
                color: this.outlineColor,
                side: THREE.BackSide
            });
        } else if (!enabled && this.outlineMaterial) {
            this.outlineMaterial.dispose();
            this.outlineMaterial = null;
        }
    }

    /**
     * Create an outline mesh for an existing mesh
     */
    createOutlineMesh(originalMesh) {
        if (!this.enableOutline || !this.outlineMaterial) return null;

        const outlineMesh = new THREE.Mesh(
            originalMesh.geometry,
            this.outlineMaterial
        );
        outlineMesh.scale.setScalar(1 + this.outlineWidth);
        outlineMesh.name = originalMesh.name + '_outline';

        return outlineMesh;
    }

    /**
     * Check if a palette index is emissive
     */
    isEmissive(paletteIndex) {
        const color = this.paletteColors[paletteIndex];
        return color && color.type === COLOR_TYPE.EMISSIVE;
    }

    /**
     * Check if a palette index is transparent
     */
    isTransparent(paletteIndex) {
        const color = this.paletteColors[paletteIndex];
        return color && color.type === COLOR_TYPE.TRANSPARENT;
    }

    /**
     * Get all emissive color indices
     */
    getEmissiveIndices() {
        return this.paletteColors
            .map((c, i) => c.type === COLOR_TYPE.EMISSIVE ? i : -1)
            .filter(i => i >= 0);
    }

    /**
     * Get all transparent color indices
     */
    getTransparentIndices() {
        return this.paletteColors
            .map((c, i) => c.type === COLOR_TYPE.TRANSPARENT ? i : -1)
            .filter(i => i >= 0);
    }

    /**
     * Dispose all materials and textures
     */
    dispose() {
        if (this.cubeMaterial) {
            this.cubeMaterial.dispose();
            this.cubeMaterial = null;
        }
        if (this.smoothMaterial) {
            this.smoothMaterial.dispose();
            this.smoothMaterial = null;
        }
        if (this.emissiveMaterial) {
            this.emissiveMaterial.dispose();
            this.emissiveMaterial = null;
        }
        if (this.transparentMaterial) {
            this.transparentMaterial.dispose();
            this.transparentMaterial = null;
        }
        if (this.outlineMaterial) {
            this.outlineMaterial.dispose();
            this.outlineMaterial = null;
        }
        if (this.paletteTexture) {
            this.paletteTexture.dispose();
            this.paletteTexture = null;
        }
    }
}

export default AvatarMaterialManager;
