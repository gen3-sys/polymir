/**
 * WeatherSystem - Unified planetary weather system
 *
 * Handles weather generation for any gravitational shape (sphere, torus, plane).
 * Weather is deterministic based on surface coordinates, ensuring consistency
 * between impostor view (space) and surface view (on-planet).
 *
 * Features:
 * - Procedural cloud layers with 3D noise
 * - Storm systems with deterministic patterns
 * - Aurora effects at poles
 * - Time-of-day atmosphere rendering
 * - Seed-based determinism for same weather at same location
 */

import { AtmosphereModule } from '../render/skybox/modules/AtmosphereModule.js';
import { CloudGenerator } from './weather/CloudGenerator.js';
import { StormSystem } from './weather/StormSystem.js';

export class WeatherSystem {
    /**
     * @param {GravitationalShapeConfig} gravitationalShape - Planet's gravity shape
     * @param {BiomeConfiguration} biomeConfig - Biome configuration for weather variation
     * @param {number} seed - Seed for deterministic weather generation
     */
    constructor(gravitationalShape, biomeConfig = null, seed = 0) {
        this.gravity = gravitationalShape;
        this.biomeConfig = biomeConfig;
        this.seed = seed;

        // Atmosphere rendering (sky colors, sun, scattering)
        this.atmosphere = new AtmosphereModule({
            timeOfDay: 12.0,  // Start at noon
            sunIntensity: 1.0,
            sunSize: 0.02,
            sunCoronaSize: 0.1
        });

        // Cloud generation
        this.cloudGenerator = new CloudGenerator(seed);

        // Cloud layers configuration
        this.cloudLayers = [
            {
                altitude: 200,      // Distance from planet radius
                thickness: 80,      // Layer thickness
                density: 0.5,       // Base cloud density
                coverage: 0.6,      // How much of sky is covered
                speed: 0.08,        // Animation speed
                noiseScale: 0.8,    // Noise detail level
                noiseOctaves: 4     // Noise complexity
            }
        ];

        // Storm systems (rain, thunder, high winds)
        this.stormSystem = new StormSystem(seed);

        // Global wind parameters
        this.windSpeed = 0.08;
        this.windDirection = Math.PI / 4;  // 45 degrees in radians
        this.windCurl = 0.4;  // How much wind swirls

        // Shadow parameters
        this.shadowStrength = 0.7;
        this.shadowSoftness = 0.5;

        // Aurora (for polar regions)
        this.auroraIntensity = 0.4;
        this.auroraSpeed = 0.5;

        // Time tracking
        this.weatherTime = 0;  // For cloud/storm animation (separate from time-of-day)
        this.timeOfDay = 12.0;  // 0-24 hours
        this.sunPaused = false;
        this.sunSpeed = 0.1;
    }

    /**
     * Update weather system (advance time, animate clouds)
     * @param {number} deltaTime - Time delta in seconds
     */
    update(deltaTime) {
        // Advance weather animation time
        this.weatherTime += deltaTime * this.windSpeed;

        // Advance time of day
        if (!this.sunPaused) {
            this.timeOfDay += deltaTime * this.sunSpeed;
            this.timeOfDay %= 24;  // Wrap to 0-24 hours
            this.atmosphere.setTimeOfDay(this.timeOfDay);
        }

        // Update atmosphere module
        this.atmosphere.update(deltaTime);
    }

    /**
     * Get weather data at a specific world position
     * Uses surface coordinates for deterministic weather patterns
     *
     * @param {number} worldX - World X coordinate
     * @param {number} worldY - World Y coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {Object} Weather data {cloudDensity, stormIntensity, windVector, lightning}
     */
    getWeatherAt(worldX, worldY, worldZ) {
        // Convert world coords to surface coords (normalized to sphere/torus/plane surface)
        const surfaceCoords = this.gravity.getSurfaceCoordinates(worldX, worldY, worldZ);
        const distance = this.gravity.getDistanceFromCenter(worldX, worldY, worldZ);

        // Generate cloud density at this location
        const cloudData = this.cloudGenerator.getDensityAtSurface(
            surfaceCoords.x,
            surfaceCoords.y,
            surfaceCoords.z,
            this.weatherTime,
            this.cloudLayers
        );

        // Generate storm intensity
        const stormData = this.stormSystem.getIntensityAtSurface(
            surfaceCoords.x,
            surfaceCoords.y,
            surfaceCoords.z,
            this.weatherTime
        );

        // Calculate wind vector (affected by storms)
        const windVector = this.calculateWindVector(surfaceCoords, stormData.intensity);

        return {
            cloudDensity: cloudData.density,
            cloudHeight: cloudData.height,
            stormIntensity: stormData.intensity,
            windVector: windVector,
            lightning: stormData.lightning,
            precipitation: stormData.precipitation
        };
    }

    /**
     * Calculate wind vector at surface coordinates
     * @param {Object} surfaceCoords - Normalized surface coordinates
     * @param {number} stormIntensity - Storm intensity multiplier
     * @returns {Object} Wind vector {x, y, z}
     */
    calculateWindVector(surfaceCoords, stormIntensity = 0) {
        // Base wind direction
        const windX = Math.cos(this.windDirection) * this.windSpeed;
        const windZ = Math.sin(this.windDirection) * this.windSpeed;

        // Add curl/turbulence
        const curlX = Math.sin(surfaceCoords.y * Math.PI * 2) * this.windCurl;
        const curlZ = Math.cos(surfaceCoords.x * Math.PI * 2) * this.windCurl;

        // Storm amplification
        const stormMultiplier = 1.0 + stormIntensity * 2.0;

        return {
            x: (windX + curlX) * stormMultiplier,
            y: stormIntensity * 0.5,  // Updrafts during storms
            z: (windZ + curlZ) * stormMultiplier
        };
    }

    /**
     * Add a cloud layer
     * @param {Object} layerConfig - Layer configuration
     */
    addCloudLayer(layerConfig) {
        this.cloudLayers.push({
            altitude: layerConfig.altitude ?? 200,
            thickness: layerConfig.thickness ?? 80,
            density: layerConfig.density ?? 0.5,
            coverage: layerConfig.coverage ?? 0.6,
            speed: layerConfig.speed ?? 0.08,
            noiseScale: layerConfig.noiseScale ?? 0.8,
            noiseOctaves: layerConfig.noiseOctaves ?? 4
        });
    }

    /**
     * Remove cloud layer by index
     * @param {number} index - Layer index
     */
    removeCloudLayer(index) {
        if (index >= 0 && index < this.cloudLayers.length) {
            this.cloudLayers.splice(index, 1);
        }
    }

    /**
     * Load weather preset
     * @param {string} presetName - 'clear', 'partly_cloudy', 'overcast', 'stormy', 'heavy', 'wispy'
     */
    loadPreset(presetName) {
        const presets = {
            clear: {
                cloudLayers: [],
                stormIntensity: 0
            },
            partly_cloudy: {
                cloudLayers: [{
                    altitude: 200,
                    thickness: 60,
                    density: 0.3,
                    coverage: 0.4,
                    speed: 0.05,
                    noiseScale: 1.0,
                    noiseOctaves: 3
                }],
                stormIntensity: 0
            },
            overcast: {
                cloudLayers: [{
                    altitude: 180,
                    thickness: 120,
                    density: 0.8,
                    coverage: 0.9,
                    speed: 0.12,
                    noiseScale: 0.6,
                    noiseOctaves: 5
                }],
                stormIntensity: 0.3
            },
            stormy: {
                cloudLayers: [
                    {
                        altitude: 150,
                        thickness: 100,
                        density: 0.9,
                        coverage: 1.0,
                        speed: 0.2,
                        noiseScale: 0.5,
                        noiseOctaves: 6
                    },
                    {
                        altitude: 250,
                        thickness: 80,
                        density: 0.6,
                        coverage: 0.8,
                        speed: 0.15,
                        noiseScale: 0.8,
                        noiseOctaves: 4
                    }
                ],
                stormIntensity: 0.8
            },
            heavy: {
                cloudLayers: [{
                    altitude: 160,
                    thickness: 140,
                    density: 1.0,
                    coverage: 1.0,
                    speed: 0.25,
                    noiseScale: 0.4,
                    noiseOctaves: 7
                }],
                stormIntensity: 1.0
            },
            wispy: {
                cloudLayers: [{
                    altitude: 250,
                    thickness: 40,
                    density: 0.2,
                    coverage: 0.3,
                    speed: 0.03,
                    noiseScale: 1.5,
                    noiseOctaves: 2
                }],
                stormIntensity: 0
            }
        };

        const preset = presets[presetName];
        if (preset) {
            this.cloudLayers = preset.cloudLayers;
            this.stormSystem.setGlobalIntensity(preset.stormIntensity);
        }
    }

    /**
     * Set time of day (0-24 hours)
     * @param {number} hours - Time in hours
     */
    setTimeOfDay(hours) {
        this.timeOfDay = hours % 24;
        this.atmosphere.setTimeOfDay(this.timeOfDay);
    }

    /**
     * Pause/unpause sun movement
     * @param {boolean} paused - Whether sun should be paused
     */
    pauseSun(paused) {
        this.sunPaused = paused;
    }

    /**
     * Set sun speed multiplier
     * @param {number} speed - Speed multiplier (0-1 range)
     */
    setSunSpeed(speed) {
        this.sunSpeed = speed;
    }

    /**
     * Get shader uniforms for atmosphere rendering
     * @returns {Object} Uniforms for THREE.js shader
     */
    getAtmosphereUniforms() {
        return this.atmosphere.getUniforms();
    }

    /**
     * Get shader uniforms for cloud rendering
     * @param {number} planetRadius - Planet radius for cloud layer positioning
     * @returns {Object} Uniforms for THREE.js shader
     */
    getCloudUniforms(planetRadius) {
        const uniforms = {
            uPlanetRadius: { value: planetRadius },
            uWeatherTime: { value: this.weatherTime },
            uWindSpeed: { value: this.windSpeed },
            uWindDirection: { value: this.windDirection },
            uWindCurl: { value: this.windCurl },
            uShadowStrength: { value: this.shadowStrength },
            uShadowSoftness: { value: this.shadowSoftness },
            uCloudLayerCount: { value: this.cloudLayers.length }
        };

        // Add cloud layer data (up to 4 layers for shader efficiency)
        for (let i = 0; i < Math.min(4, this.cloudLayers.length); i++) {
            const layer = this.cloudLayers[i];
            uniforms[`uCloudLayer${i}Altitude`] = { value: layer.altitude };
            uniforms[`uCloudLayer${i}Thickness`] = { value: layer.thickness };
            uniforms[`uCloudLayer${i}Density`] = { value: layer.density };
            uniforms[`uCloudLayer${i}Coverage`] = { value: layer.coverage };
            uniforms[`uCloudLayer${i}Speed`] = { value: layer.speed };
            uniforms[`uCloudLayer${i}NoiseScale`] = { value: layer.noiseScale };
            uniforms[`uCloudLayer${i}NoiseOctaves`] = { value: layer.noiseOctaves };
        }

        return uniforms;
    }

    /**
     * Export configuration for serialization
     * @returns {Object} Serializable configuration
     */
    exportConfig() {
        return {
            seed: this.seed,
            cloudLayers: this.cloudLayers,
            windSpeed: this.windSpeed,
            windDirection: this.windDirection,
            windCurl: this.windCurl,
            shadowStrength: this.shadowStrength,
            shadowSoftness: this.shadowSoftness,
            auroraIntensity: this.auroraIntensity,
            auroraSpeed: this.auroraSpeed,
            timeOfDay: this.timeOfDay,
            sunSpeed: this.sunSpeed,
            atmosphereConfig: this.atmosphere.exportConfig()
        };
    }

    /**
     * Import configuration from serialized data
     * @param {Object} config - Configuration object
     */
    importConfig(config) {
        if (config.cloudLayers) this.cloudLayers = config.cloudLayers;
        if (config.windSpeed !== undefined) this.windSpeed = config.windSpeed;
        if (config.windDirection !== undefined) this.windDirection = config.windDirection;
        if (config.windCurl !== undefined) this.windCurl = config.windCurl;
        if (config.shadowStrength !== undefined) this.shadowStrength = config.shadowStrength;
        if (config.shadowSoftness !== undefined) this.shadowSoftness = config.shadowSoftness;
        if (config.auroraIntensity !== undefined) this.auroraIntensity = config.auroraIntensity;
        if (config.auroraSpeed !== undefined) this.auroraSpeed = config.auroraSpeed;
        if (config.timeOfDay !== undefined) this.setTimeOfDay(config.timeOfDay);
        if (config.sunSpeed !== undefined) this.sunSpeed = config.sunSpeed;
        if (config.atmosphereConfig) this.atmosphere.importConfig(config.atmosphereConfig);
    }
}
