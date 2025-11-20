/**
 * Smoke Configuration Module
 *
 * Provides JavaScript API for configuring and managing volumetric smoke rendering.
 * This module provides:
 * - Default configuration values
 * - Preset configurations (default, heavy, wispy, mystical, performance)
 * - Helper functions for managing uniforms
 * - Three rendering modes (continuous, ground, particle)
 *
 * Usage:
 *   const config = new SmokeConfig();
 *   config.loadPreset('mystical');
 *   config.applyUniforms(gl, uniforms, time);
 */

import { smokeDefaults } from './smoke.glsl.js';
import { particleDefaults } from './smokeParticles.js';

export class SmokeConfig {
    constructor() {
        // Mode
        this.fogMode = smokeDefaults.fogMode;

        // Visual parameters
        this.chaos = smokeDefaults.chaos;
        this.clumping = smokeDefaults.clumping;
        this.curl = smokeDefaults.curl;
        this.turbulence = smokeDefaults.turbulence;
        this.responsiveness = smokeDefaults.responsiveness;
        this.density = smokeDefaults.density;
        this.flowSpeed = smokeDefaults.flowSpeed;
        this.heightFalloff = smokeDefaults.heightFalloff;
        this.edgeGlow = smokeDefaults.edgeGlow;
        this.lightIntensity = smokeDefaults.lightIntensity;
        this.chromaticDispersion = smokeDefaults.chromaticDispersion;

        // Particle physics
        this.particleCount = smokeDefaults.particleCount;
        this.gravity = particleDefaults.gravity;
        this.settling = particleDefaults.settling;
        this.repulsion = particleDefaults.repulsion;
        this.windStrength = particleDefaults.windStrength;
        this.particleSize = particleDefaults.particleSize;
        this.groundCling = particleDefaults.groundCling;

        // Performance
        this.quality = smokeDefaults.quality;
        this.lodEnabled = smokeDefaults.lodEnabled;
        this.lodDistance = smokeDefaults.lodDistance;
        this.antiAliasing = smokeDefaults.antiAliasing;
        this.maxDistance = smokeDefaults.maxDistance;
    }

    /**
     * Get fog mode as shader value
     * @returns {number} 0.0 = continuous, 0.5 = ground, 1.0 = particle
     */
    getFogModeValue() {
        switch (this.fogMode) {
            case 'continuous': return 0.0;
            case 'ground': return 0.5;
            case 'particle': return 1.0;
            default: return 0.0;
        }
    }

    /**
     * Apply this configuration to WebGL shader uniforms
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Object} uniforms - Object containing uniform locations
     * @param {number} time - Current time in seconds
     */
    applyUniforms(gl, uniforms, time) {
        // Mode
        if (uniforms.fogMode) {
            gl.uniform1f(uniforms.fogMode, this.getFogModeValue());
        }

        // Time
        if (uniforms.time) {
            gl.uniform1f(uniforms.time, time);
        }

        // Visual parameters
        if (uniforms.uChaos) gl.uniform1f(uniforms.uChaos, this.chaos);
        if (uniforms.uClumping) gl.uniform1f(uniforms.uClumping, this.clumping);
        if (uniforms.uCurl) gl.uniform1f(uniforms.uCurl, this.curl);
        if (uniforms.uTurbulence) gl.uniform1f(uniforms.uTurbulence, this.turbulence);
        if (uniforms.uResponsiveness) gl.uniform1f(uniforms.uResponsiveness, this.responsiveness);
        if (uniforms.uDensity) gl.uniform1f(uniforms.uDensity, this.density);
        if (uniforms.uFlowSpeed) gl.uniform1f(uniforms.uFlowSpeed, this.flowSpeed);
        if (uniforms.uHeightFalloff) gl.uniform1f(uniforms.uHeightFalloff, this.heightFalloff);
        if (uniforms.uEdgeGlow) gl.uniform1f(uniforms.uEdgeGlow, this.edgeGlow);
        if (uniforms.uLightIntensity) gl.uniform1f(uniforms.uLightIntensity, this.lightIntensity);
        if (uniforms.uChromaticDispersion) gl.uniform1f(uniforms.uChromaticDispersion, this.chromaticDispersion);

        // Particle parameters
        if (uniforms.uParticleCount) gl.uniform1i(uniforms.uParticleCount, this.particleCount);
        if (uniforms.uParticleSize) gl.uniform1f(uniforms.uParticleSize, this.particleSize);

        // Performance
        if (uniforms.uQuality) gl.uniform1f(uniforms.uQuality, this.quality);
        if (uniforms.uLodEnabled) gl.uniform1f(uniforms.uLodEnabled, this.lodEnabled ? 1.0 : 0.0);
        if (uniforms.uLodDistance) gl.uniform1f(uniforms.uLodDistance, this.lodDistance);
        if (uniforms.uAntiAliasing) gl.uniform1f(uniforms.uAntiAliasing, this.antiAliasing);
        if (uniforms.uMaxDistance) gl.uniform1f(uniforms.uMaxDistance, this.maxDistance);
    }

    /**
     * Get physics parameters for particle system
     * @returns {Object} Physics parameters
     */
    getPhysicsParams() {
        return {
            gravity: this.gravity,
            settling: this.settling,
            repulsion: this.repulsion,
            windStrength: this.windStrength,
            particleSize: this.particleSize,
            groundCling: this.groundCling,
            responsiveness: this.responsiveness,
            flowSpeed: this.flowSpeed
        };
    }

    /**
     * Load a preset configuration
     * @param {string} presetName - Name of preset (default, heavy, wispy, mystical, performance)
     */
    loadPreset(presetName) {
        const presets = {
            default: {
                chaos: 0.5, clumping: 0.5, curl: 0.5, turbulence: 0.5, responsiveness: 0.5,
                density: 0.5, flowSpeed: 0.5, heightFalloff: 0.5, edgeGlow: 0.3, lightIntensity: 0.5,
                chromaticDispersion: 0.0,
                particleCount: 35, gravity: 0.5, settling: 0.5, repulsion: 0.5, windStrength: 0.5,
                particleSize: 0.5, groundCling: 0.8,
                quality: 0.7, lodEnabled: true, lodDistance: 0.5, antiAliasing: 0.7, maxDistance: 0.8
            },
            heavy: {
                chaos: 0.3, clumping: 1.2, curl: 0.2, turbulence: 0.3, responsiveness: 0.8,
                density: 1.5, flowSpeed: 0.3, heightFalloff: 1.0, edgeGlow: 0.2, lightIntensity: 0.8,
                chromaticDispersion: 0.1,
                particleCount: 45, gravity: 0.8, settling: 0.7, repulsion: 0.3, windStrength: 0.2,
                particleSize: 0.7, groundCling: 0.9,
                quality: 0.6, lodEnabled: true, lodDistance: 0.6, antiAliasing: 0.6, maxDistance: 0.7
            },
            wispy: {
                chaos: 1.5, clumping: 0.2, curl: 1.2, turbulence: 1.3, responsiveness: 1.0,
                density: 0.3, flowSpeed: 1.0, heightFalloff: 0.3, edgeGlow: 0.5, lightIntensity: 1.0,
                chromaticDispersion: 0.3,
                particleCount: 30, gravity: 0.3, settling: 0.3, repulsion: 0.8, windStrength: 1.2,
                particleSize: 0.4, groundCling: 0.5,
                quality: 0.8, lodEnabled: true, lodDistance: 0.4, antiAliasing: 0.8, maxDistance: 0.9
            },
            mystical: {
                chaos: 0.8, clumping: 0.6, curl: 1.5, turbulence: 1.0, responsiveness: 0.4,
                density: 0.8, flowSpeed: 0.2, heightFalloff: 0.5, edgeGlow: 0.8, lightIntensity: 0.6,
                chromaticDispersion: 0.6,
                particleCount: 40, gravity: 0.4, settling: 0.6, repulsion: 0.6, windStrength: 0.4,
                particleSize: 0.6, groundCling: 0.7,
                quality: 0.75, lodEnabled: true, lodDistance: 0.5, antiAliasing: 0.75, maxDistance: 0.85
            },
            performance: {
                chaos: 0.4, clumping: 0.5, curl: 0.3, turbulence: 0.4, responsiveness: 0.5,
                density: 0.5, flowSpeed: 0.5, heightFalloff: 0.5, edgeGlow: 0.1, lightIntensity: 0.5,
                chromaticDispersion: 0.0,
                particleCount: 25, gravity: 0.5, settling: 0.5, repulsion: 0.4, windStrength: 0.3,
                particleSize: 0.5, groundCling: 0.8,
                quality: 0.4, lodEnabled: true, lodDistance: 0.7, antiAliasing: 0.5, maxDistance: 0.6
            }
        };

        if (presets[presetName]) {
            Object.assign(this, presets[presetName]);
        } else {
            console.warn(`Unknown smoke preset: ${presetName}`);
        }
    }

    /**
     * Get a JSON representation of the current configuration
     * @returns {Object} Configuration as plain object
     */
    toJSON() {
        return {
            fogMode: this.fogMode,
            chaos: this.chaos,
            clumping: this.clumping,
            curl: this.curl,
            turbulence: this.turbulence,
            responsiveness: this.responsiveness,
            density: this.density,
            flowSpeed: this.flowSpeed,
            heightFalloff: this.heightFalloff,
            edgeGlow: this.edgeGlow,
            lightIntensity: this.lightIntensity,
            chromaticDispersion: this.chromaticDispersion,
            particleCount: this.particleCount,
            gravity: this.gravity,
            settling: this.settling,
            repulsion: this.repulsion,
            windStrength: this.windStrength,
            particleSize: this.particleSize,
            groundCling: this.groundCling,
            quality: this.quality,
            lodEnabled: this.lodEnabled,
            lodDistance: this.lodDistance,
            antiAliasing: this.antiAliasing,
            maxDistance: this.maxDistance
        };
    }

    /**
     * Load configuration from JSON
     * @param {Object} json - Configuration object
     */
    fromJSON(json) {
        Object.assign(this, json);
    }

    /**
     * Export configuration to file
     * @param {string} filename - Optional filename (defaults to timestamp)
     */
    exportToFile(filename) {
        const config = this.toJSON();
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || `smoke-config-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Import configuration from file
     * @param {File} file - File object from input element
     * @returns {Promise} Resolves when configuration is loaded
     */
    importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    this.fromJSON(config);
                    resolve(config);
                } catch (error) {
                    reject(new Error('Error loading configuration file'));
                }
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }
}

// Export preset names as constants
export const SMOKE_PRESETS = {
    DEFAULT: 'default',
    HEAVY: 'heavy',
    WISPY: 'wispy',
    MYSTICAL: 'mystical',
    PERFORMANCE: 'performance'
};

// Export mode names as constants
export const SMOKE_MODES = {
    CONTINUOUS: 'continuous',
    GROUND: 'ground',
    PARTICLE: 'particle'
};
