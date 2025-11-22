/**
 * Unified Atmospheric System for Polymir Engine
 *
 * This module combines all atmospheric rendering systems into a single,
 * cohesive API for managing environmental effects:
 *
 * - **Skybox**: Sky gradients, sun, moon, stars
 * - **Ocean**: Multi-scale wave rendering with reflections
 * - **Clouds**: Volumetric cloud layers
 * - **Smoke/Fog**: Volumetric smoke with particle physics
 *
 * ## Features
 *
 * - Unified configuration system
 * - System interaction management (cloud shadows, lighting)
 * - Preset atmosphere combinations
 * - Time-of-day synchronization across all systems
 * - Performance optimization coordination
 * - Single uniform application for all systems
 *
 * ## Usage Example
 *
 * ```javascript
 * import { AtmosphericSystem } from './modules/atmosphericSystem.js';
 *
 * // Create unified atmospheric system
 * const atmosphere = new AtmosphericSystem({
 *     skybox: true,
 *     ocean: true,
 *     clouds: true,
 *     smoke: false
 * });
 *
 * // Load a preset atmosphere
 * atmosphere.loadPreset('stormy_ocean');
 *
 * // In render loop
 * function render(time, deltaTime) {
 *     // Update all systems
 *     atmosphere.update(deltaTime);
 *
 *     // Apply all uniforms to materials
 *     atmosphere.applyToMaterials({
 *         skyboxMaterial,
 *         oceanMaterial,
 *         cloudMaterial,
 *         smokeMaterial
 *     });
 *
 *     // Set player position for all interactive systems
 *     atmosphere.setPlayerPosition(player.position);
 *
 *     renderer.render(scene, camera);
 * }
 * ```
 */

// Re-export all shader modules
export * from './skyboxSystem.js';
export * from './clouds.glsl.js';
export * from './smokeSystem.js';

// Import what we need for the unified system
import { SkyboxConfig } from './skyboxConfig.js';
import { SmokeConfig, SMOKE_MODES } from './smokeConfig.js';
import { SmokeParticleSystem } from './smokeParticles.js';
import * as THREE from 'three';

/**
 * Unified atmospheric system manager
 */
export class AtmosphericSystem {
    constructor(options = {}) {
        this.enabled = {
            skybox: options.skybox !== false,
            ocean: options.ocean !== false,
            clouds: options.clouds !== false,
            smoke: options.smoke !== false
        };

        // Create subsystem configurations
        this.skyboxConfig = new SkyboxConfig();
        this.smokeConfig = new SmokeConfig();

        // Create particle system for smoke (if enabled)
        if (this.enabled.smoke) {
            this.particleSystem = new SmokeParticleSystem(this.smokeConfig.particleCount);
        }

        // Shared state
        this.time = 0;
        this.playerPosition = new THREE.Vector3(0, 0, 0);
        this.lightPosition = new THREE.Vector3(1, 1, 1);

        // Cloud parameters (legacy system compatibility)
        this.cloudConfig = {
            density: 0.5,
            coverage: 0.5,
            speed: 0.5,
            height: 500,
            thickness: 200
        };
    }

    /**
     * Update all systems for current frame
     * @param {number} deltaTime - Time since last frame (seconds)
     */
    update(deltaTime) {
        this.time += deltaTime;

        // Update skybox time-of-day
        if (this.enabled.skybox) {
            this.skyboxConfig.updateTime(deltaTime);
        }

        // Update particle physics for smoke
        if (this.enabled.smoke && this.smokeConfig.fogMode === SMOKE_MODES.PARTICLE) {
            this.particleSystem.update(
                deltaTime,
                this.smokeConfig.getPhysicsParams(),
                this.playerPosition
            );
        }
    }

    /**
     * Apply all system uniforms to their respective materials
     * @param {Object} materials - Object containing material references
     */
    applyToMaterials(materials) {
        const { skyboxMaterial, oceanMaterial, cloudMaterial, smokeMaterial } = materials;

        // Apply skybox/ocean uniforms (they share the same shader in most cases)
        if (this.enabled.skybox && skyboxMaterial) {
            this.skyboxConfig.applyUniforms(null, skyboxMaterial.uniforms, this.time);
            skyboxMaterial.uniforms.playerPos.value.copy(this.playerPosition);
        }

        // Apply ocean-specific settings if separate material
        if (this.enabled.ocean && oceanMaterial && oceanMaterial !== skyboxMaterial) {
            this.skyboxConfig.applyUniforms(null, oceanMaterial.uniforms, this.time);
            oceanMaterial.uniforms.playerPos.value.copy(this.playerPosition);
        }

        // Apply cloud uniforms
        if (this.enabled.clouds && cloudMaterial) {
            if (cloudMaterial.uniforms.cloudDensity) {
                cloudMaterial.uniforms.cloudDensity.value = this.cloudConfig.density;
            }
            if (cloudMaterial.uniforms.cloudCoverage) {
                cloudMaterial.uniforms.cloudCoverage.value = this.cloudConfig.coverage;
            }
            if (cloudMaterial.uniforms.cloudSpeed) {
                cloudMaterial.uniforms.cloudSpeed.value = this.cloudConfig.speed;
            }
            if (cloudMaterial.uniforms.time) {
                cloudMaterial.uniforms.time.value = this.time;
            }
        }

        // Apply smoke uniforms
        if (this.enabled.smoke && smokeMaterial) {
            this.smokeConfig.applyUniforms(null, smokeMaterial.uniforms, this.time);
            smokeMaterial.uniforms.playerPos.value.copy(this.playerPosition);
            smokeMaterial.uniforms.lightPos.value.copy(this.lightPosition);

            // Update particle positions if in particle mode
            if (this.smokeConfig.fogMode === SMOKE_MODES.PARTICLE) {
                const positions = this.particleSystem.getPositions();
                smokeMaterial.uniforms.uParticlePositions.value = positions;
                smokeMaterial.uniforms.uParticleCount.value = this.particleSystem.count;
            }
        }
    }

    /**
     * Set player position for all interactive systems
     * @param {THREE.Vector3} position - Player position
     */
    setPlayerPosition(position) {
        this.playerPosition.copy(position);
    }

    /**
     * Set light position for all systems
     * @param {THREE.Vector3} position - Light position
     */
    setLightPosition(position) {
        this.lightPosition.copy(position);
    }

    /**
     * Load a preset atmosphere configuration
     * @param {string} presetName - Name of preset
     */
    loadPreset(presetName) {
        const presets = {
            // Clear sunny day with calm ocean
            sunny_ocean: {
                skybox: { preset: 'ocean', timeOfDay: 12 },
                smoke: { preset: 'performance', mode: SMOKE_MODES.CONTINUOUS, density: 0.1 },
                clouds: { density: 0.3, coverage: 0.4, speed: 0.3 }
            },

            // Calm lake at dawn
            dawn_lake: {
                skybox: { preset: 'dawn', timeOfDay: 6 },
                smoke: { preset: 'wispy', mode: SMOKE_MODES.GROUND, density: 0.6 },
                clouds: { density: 0.4, coverage: 0.5, speed: 0.2 }
            },

            // Stormy ocean with heavy fog
            stormy_ocean: {
                skybox: { preset: 'storm', timeOfDay: 14 },
                smoke: { preset: 'heavy', mode: SMOKE_MODES.GROUND, density: 1.2 },
                clouds: { density: 0.8, coverage: 0.9, speed: 0.8 }
            },

            // Mystical night scene
            mystical_night: {
                skybox: { preset: 'night', timeOfDay: 0 },
                smoke: { preset: 'mystical', mode: SMOKE_MODES.PARTICLE, density: 0.8 },
                clouds: { density: 0.5, coverage: 0.6, speed: 0.2 }
            },

            // Sunset over calm water
            sunset: {
                skybox: { preset: 'sunset', timeOfDay: 18 },
                smoke: { preset: 'wispy', mode: SMOKE_MODES.CONTINUOUS, density: 0.4 },
                clouds: { density: 0.6, coverage: 0.7, speed: 0.3 }
            },

            // Performance-optimized clear day
            performance: {
                skybox: { preset: 'ocean', timeOfDay: 12 },
                smoke: { preset: 'performance', mode: SMOKE_MODES.CONTINUOUS, density: 0.2 },
                clouds: { density: 0.3, coverage: 0.4, speed: 0.3 }
            },

            // Cave/underground with particle smoke
            underground: {
                skybox: { preset: 'night', timeOfDay: 0 },
                smoke: { preset: 'mystical', mode: SMOKE_MODES.PARTICLE, density: 1.0 },
                clouds: { density: 0.0, coverage: 0.0, speed: 0.0 }
            },

            // Foggy morning
            foggy_morning: {
                skybox: { preset: 'dawn', timeOfDay: 7 },
                smoke: { preset: 'heavy', mode: SMOKE_MODES.GROUND, density: 1.5 },
                clouds: { density: 0.7, coverage: 0.8, speed: 0.2 }
            }
        };

        const preset = presets[presetName];
        if (!preset) {
            console.warn(`Unknown atmospheric preset: ${presetName}`);
            return;
        }

        // Apply skybox preset
        if (preset.skybox && this.enabled.skybox) {
            this.skyboxConfig.loadPreset(preset.skybox.preset);
            if (preset.skybox.timeOfDay !== undefined) {
                this.skyboxConfig.timeOfDay = preset.skybox.timeOfDay;
            }
        }

        // Apply smoke preset
        if (preset.smoke && this.enabled.smoke) {
            this.smokeConfig.loadPreset(preset.smoke.preset);
            if (preset.smoke.mode) {
                this.smokeConfig.fogMode = preset.smoke.mode;
            }
            if (preset.smoke.density !== undefined) {
                this.smokeConfig.density = preset.smoke.density;
            }

            // Recreate particle system if count changed
            if (this.smokeConfig.fogMode === SMOKE_MODES.PARTICLE) {
                this.particleSystem = new SmokeParticleSystem(this.smokeConfig.particleCount);
            }
        }

        // Apply cloud settings
        if (preset.clouds && this.enabled.clouds) {
            Object.assign(this.cloudConfig, preset.clouds);
        }
    }

    /**
     * Enable/disable specific atmospheric systems
     * @param {string} system - System name ('skybox', 'ocean', 'clouds', 'smoke')
     * @param {boolean} enabled - Enable state
     */
    setSystemEnabled(system, enabled) {
        if (this.enabled.hasOwnProperty(system)) {
            this.enabled[system] = enabled;

            // Create particle system if enabling smoke in particle mode
            if (system === 'smoke' && enabled && !this.particleSystem) {
                this.particleSystem = new SmokeParticleSystem(this.smokeConfig.particleCount);
            }
        }
    }

    /**
     * Get configuration for a specific system
     * @param {string} system - System name
     * @returns {Object} Configuration object
     */
    getSystemConfig(system) {
        switch (system) {
            case 'skybox':
            case 'ocean':
                return this.skyboxConfig;
            case 'smoke':
                return this.smokeConfig;
            case 'clouds':
                return this.cloudConfig;
            default:
                return null;
        }
    }

    /**
     * Export current atmospheric configuration
     * @returns {Object} Complete configuration
     */
    toJSON() {
        return {
            enabled: { ...this.enabled },
            skybox: this.skyboxConfig.toJSON(),
            smoke: this.smokeConfig.toJSON(),
            clouds: { ...this.cloudConfig },
            time: this.time
        };
    }

    /**
     * Load atmospheric configuration
     * @param {Object} json - Configuration object
     */
    fromJSON(json) {
        if (json.enabled) {
            Object.assign(this.enabled, json.enabled);
        }

        if (json.skybox && this.enabled.skybox) {
            this.skyboxConfig.fromJSON(json.skybox);
        }

        if (json.smoke && this.enabled.smoke) {
            this.smokeConfig.fromJSON(json.smoke);

            // Recreate particle system if needed
            if (this.smokeConfig.fogMode === SMOKE_MODES.PARTICLE) {
                this.particleSystem = new SmokeParticleSystem(this.smokeConfig.particleCount);
            }
        }

        if (json.clouds && this.enabled.clouds) {
            Object.assign(this.cloudConfig, json.clouds);
        }

        if (json.time !== undefined) {
            this.time = json.time;
        }
    }

    /**
     * Export configuration to file
     * @param {string} filename - Optional filename
     */
    exportToFile(filename) {
        const config = this.toJSON();
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || `atmospheric-config-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Import configuration from file
     * @param {File} file - File object
     * @returns {Promise} Resolves when loaded
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
                    reject(new Error('Error loading atmospheric configuration'));
                }
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }

    /**
     * Reset all systems to defaults
     */
    reset() {
        this.skyboxConfig = new SkyboxConfig();
        this.smokeConfig = new SmokeConfig();
        this.cloudConfig = {
            density: 0.5,
            coverage: 0.5,
            speed: 0.5,
            height: 500,
            thickness: 200
        };

        if (this.enabled.smoke) {
            this.particleSystem = new SmokeParticleSystem(this.smokeConfig.particleCount);
        }

        this.time = 0;
    }
}

/**
 * Available preset names
 */
export const ATMOSPHERIC_PRESETS = {
    SUNNY_OCEAN: 'sunny_ocean',
    DAWN_LAKE: 'dawn_lake',
    STORMY_OCEAN: 'stormy_ocean',
    MYSTICAL_NIGHT: 'mystical_night',
    SUNSET: 'sunset',
    PERFORMANCE: 'performance',
    UNDERGROUND: 'underground',
    FOGGY_MORNING: 'foggy_morning'
};

/**
 * Helper function to create a complete atmospheric rendering setup
 * @param {Object} options - Configuration options
 * @returns {Object} Object containing atmosphere manager and materials
 */
export function createAtmosphericSetup(options = {}) {
    const {
        preset = 'sunny_ocean',
        enableSkybox = true,
        enableOcean = true,
        enableClouds = true,
        enableSmoke = false
    } = options;

    // Create atmospheric system
    const atmosphere = new AtmosphericSystem({
        skybox: enableSkybox,
        ocean: enableOcean,
        clouds: enableClouds,
        smoke: enableSmoke
    });

    // Load preset
    atmosphere.loadPreset(preset);

    // Create materials (basic setup - customize as needed)
    const materials = {};

    if (enableSkybox || enableOcean) {
        // Import shaders
        const { skyboxShaderModule } = require('./skybox.glsl.js');
        const { oceanShaderModule } = require('./ocean.glsl.js');

        // Create combined skybox/ocean material
        materials.skyboxMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vPosition;
                varying vec3 vWorldPosition;

                void main() {
                    vPosition = position;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                ${skyboxShaderModule}
                ${oceanShaderModule}

                uniform float time;
                uniform vec3 playerPos;
                varying vec3 vWorldPosition;

                void main() {
                    vec3 rayDir = normalize(vWorldPosition - playerPos);
                    // Combine sky and ocean rendering
                    // ... (implementation depends on specific needs)
                    gl_FragColor = vec4(1.0, 0.5, 0.0, 1.0); // Placeholder
                }
            `,
            uniforms: atmosphere.skyboxConfig.createUniforms(),
            side: THREE.BackSide,
            depthWrite: false
        });
    }

    if (enableSmoke) {
        const { smokeVertexShader, smokeFragmentShader } = require('./smoke.glsl.js');
        const { createSmokeUniforms } = require('./smokeSystem.js');

        materials.smokeMaterial = new THREE.ShaderMaterial({
            vertexShader: smokeVertexShader,
            fragmentShader: smokeFragmentShader,
            uniforms: createSmokeUniforms(),
            transparent: true,
            side: THREE.BackSide,
            depthWrite: false
        });
    }

    return {
        atmosphere,
        materials
    };
}
