/**
 * Skybox Configuration Module
 *
 * Provides JavaScript API for configuring and managing skybox rendering.
 * This module provides:
 * - Default configuration values
 * - Preset environments (ocean, lake, storm, sunset, etc.)
 * - Helper functions for managing uniforms
 * - Integration with WebGL programs
 */

import { skyboxDefaults } from './skybox.glsl.js';
import { oceanDefaults } from './ocean.glsl.js';

export class SkyboxConfig {
    constructor() {
        // Time and celestial bodies
        this.timeOfDay = skyboxDefaults.timeOfDay;
        this.timeSpeed = 0.1;
        this.sunAngle = skyboxDefaults.sunAngle;
        this.sunAzimuth = skyboxDefaults.sunAzimuth;
        this.sunSize = skyboxDefaults.sunSize;
        this.sunIntensity = skyboxDefaults.sunIntensity;
        this.sunGlow = skyboxDefaults.sunGlow;

        this.moonVisible = skyboxDefaults.moonVisible;
        this.moonSize = skyboxDefaults.moonSize;
        this.moonBrightness = skyboxDefaults.moonBrightness;
        this.moonPhase = skyboxDefaults.moonPhase;
        this.moonGlow = skyboxDefaults.moonGlow;

        // Stars
        this.starsVisible = skyboxDefaults.starsVisible;
        this.starSize = skyboxDefaults.starSize;
        this.starDensity = skyboxDefaults.starDensity;
        this.milkyWayIntensity = skyboxDefaults.milkyWayIntensity;
        this.twinkleSpeed = skyboxDefaults.twinkleSpeed;

        // Ocean
        this.waveAmplitude = oceanDefaults.waveAmplitude;
        this.waveSpeed = oceanDefaults.waveSpeed;
        this.waveDirection = oceanDefaults.waveDirection;
        this.waveChoppiness = oceanDefaults.waveChoppiness;
        this.waveSteepness = oceanDefaults.waveSteepness;
        this.swellScale = oceanDefaults.swellScale;
        this.swellAmount = oceanDefaults.swellAmount;
        this.mediumScale = oceanDefaults.mediumScale;
        this.mediumAmount = oceanDefaults.mediumAmount;
        this.smallScale = oceanDefaults.smallScale;
        this.smallAmount = oceanDefaults.smallAmount;
        this.detailScale = oceanDefaults.detailScale;
        this.detailAmount = oceanDefaults.detailAmount;
        this.foamThreshold = oceanDefaults.foamThreshold;
        this.foamDetail = oceanDefaults.foamDetail;
        this.fresnelStrength = oceanDefaults.fresnelStrength;
        this.subsurfaceScatter = oceanDefaults.subsurfaceScatter;
        this.waterClarity = oceanDefaults.waterClarity;
        this.sunReflectionSize = oceanDefaults.sunReflectionSize;
        this.moonReflectionSize = oceanDefaults.moonReflectionSize;
        this.cloudReflections = oceanDefaults.cloudReflections;

        // Wind and atmosphere
        this.windSpeed = 0.5;
        this.turbulence = 0.5;
    }

    /**
     * Apply this configuration to a WebGL program's uniforms
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Object} uniforms - Object containing uniform locations
     * @param {number} time - Current time in seconds
     */
    applyUniforms(gl, uniforms, time) {
        // Time and celestial
        if (uniforms.uTimeOfDay) gl.uniform1f(uniforms.uTimeOfDay, this.timeOfDay);
        if (uniforms.uSunAngle) gl.uniform1f(uniforms.uSunAngle, this.sunAngle);
        if (uniforms.uSunAzimuth) gl.uniform1f(uniforms.uSunAzimuth, this.sunAzimuth);
        if (uniforms.uSunSize) gl.uniform1f(uniforms.uSunSize, this.sunSize);
        if (uniforms.uSunIntensity) gl.uniform1f(uniforms.uSunIntensity, this.sunIntensity);
        if (uniforms.uSunGlow) gl.uniform1f(uniforms.uSunGlow, this.sunGlow);

        if (uniforms.uMoonVisible) gl.uniform1i(uniforms.uMoonVisible, this.moonVisible ? 1 : 0);
        if (uniforms.uMoonSize) gl.uniform1f(uniforms.uMoonSize, this.moonSize);
        if (uniforms.uMoonBrightness) gl.uniform1f(uniforms.uMoonBrightness, this.moonBrightness);
        if (uniforms.uMoonPhase) gl.uniform1f(uniforms.uMoonPhase, this.moonPhase);
        if (uniforms.uMoonGlow) gl.uniform1f(uniforms.uMoonGlow, this.moonGlow);

        // Stars
        if (uniforms.uStarsVisible) gl.uniform1i(uniforms.uStarsVisible, this.starsVisible ? 1 : 0);
        if (uniforms.uStarSize) gl.uniform1f(uniforms.uStarSize, this.starSize);
        if (uniforms.uStarDensity) gl.uniform1f(uniforms.uStarDensity, this.starDensity);
        if (uniforms.uMilkyWayIntensity) gl.uniform1f(uniforms.uMilkyWayIntensity, this.milkyWayIntensity);
        if (uniforms.uTwinkleSpeed) gl.uniform1f(uniforms.uTwinkleSpeed, this.twinkleSpeed);

        // Ocean
        if (uniforms.uWaveAmplitude) gl.uniform1f(uniforms.uWaveAmplitude, this.waveAmplitude);
        if (uniforms.uWaveSpeed) gl.uniform1f(uniforms.uWaveSpeed, this.waveSpeed);
        if (uniforms.uWaveDirection) gl.uniform1f(uniforms.uWaveDirection, this.waveDirection);
        if (uniforms.uWaveChoppiness) gl.uniform1f(uniforms.uWaveChoppiness, this.waveChoppiness);
        if (uniforms.uWaveSteepness) gl.uniform1f(uniforms.uWaveSteepness, this.waveSteepness);
        if (uniforms.uSwellScale) gl.uniform1f(uniforms.uSwellScale, this.swellScale);
        if (uniforms.uSwellAmount) gl.uniform1f(uniforms.uSwellAmount, this.swellAmount);
        if (uniforms.uMediumScale) gl.uniform1f(uniforms.uMediumScale, this.mediumScale);
        if (uniforms.uMediumAmount) gl.uniform1f(uniforms.uMediumAmount, this.mediumAmount);
        if (uniforms.uSmallScale) gl.uniform1f(uniforms.uSmallScale, this.smallScale);
        if (uniforms.uSmallAmount) gl.uniform1f(uniforms.uSmallAmount, this.smallAmount);
        if (uniforms.uDetailScale) gl.uniform1f(uniforms.uDetailScale, this.detailScale);
        if (uniforms.uDetailAmount) gl.uniform1f(uniforms.uDetailAmount, this.detailAmount);
        if (uniforms.uFoamThreshold) gl.uniform1f(uniforms.uFoamThreshold, this.foamThreshold);
        if (uniforms.uFoamDetail) gl.uniform1f(uniforms.uFoamDetail, this.foamDetail);
        if (uniforms.uFresnelStrength) gl.uniform1f(uniforms.uFresnelStrength, this.fresnelStrength);
        if (uniforms.uSubsurfaceScatter) gl.uniform1f(uniforms.uSubsurfaceScatter, this.subsurfaceScatter);
        if (uniforms.uWaterClarity) gl.uniform1f(uniforms.uWaterClarity, this.waterClarity);
        if (uniforms.uSunReflectionSize) gl.uniform1f(uniforms.uSunReflectionSize, this.sunReflectionSize);
        if (uniforms.uMoonReflectionSize) gl.uniform1f(uniforms.uMoonReflectionSize, this.moonReflectionSize);
        if (uniforms.uCloudReflections) gl.uniform1i(uniforms.uCloudReflections, this.cloudReflections ? 1 : 0);

        // Wind
        if (uniforms.uWindSpeed) gl.uniform1f(uniforms.uWindSpeed, this.windSpeed);
        if (uniforms.uTurbulence) gl.uniform1f(uniforms.uTurbulence, this.turbulence);
    }

    /**
     * Update time of day with automatic wrapping
     * @param {number} deltaTime - Time elapsed since last update (in seconds)
     */
    updateTime(deltaTime) {
        if (this.timeSpeed > 0) {
            this.timeOfDay = (this.timeOfDay + this.timeSpeed * deltaTime) % 24;
        }
    }

    /**
     * Load a preset environment configuration
     * @param {string} presetName - Name of preset (ocean, lake, storm, sunset)
     */
    loadPreset(presetName) {
        switch(presetName.toLowerCase()) {
            case 'ocean':
                this.timeOfDay = 14;
                this.waveAmplitude = 0.41;
                this.waveSpeed = 1.0;
                this.windSpeed = 0.5;
                this.turbulence = 0.4;
                this.swellAmount = 1.0;
                this.mediumAmount = 0.5;
                this.smallAmount = 0.2;
                break;

            case 'lake':
                this.timeOfDay = 10;
                this.waveAmplitude = 0.1;
                this.waveSpeed = 0.5;
                this.windSpeed = 0.2;
                this.turbulence = 0.2;
                this.swellAmount = 0.3;
                this.mediumAmount = 0.4;
                this.smallAmount = 0.3;
                break;

            case 'storm':
                this.timeOfDay = 15;
                this.waveAmplitude = 1.2;
                this.waveSpeed = 2.0;
                this.windSpeed = 1.5;
                this.turbulence = 0.8;
                this.swellAmount = 1.5;
                this.mediumAmount = 1.0;
                this.smallAmount = 0.5;
                break;

            case 'sunset':
                this.timeOfDay = 19.5;
                this.sunAngle = 5;
                this.waveAmplitude = 0.3;
                this.waveSpeed = 0.8;
                this.windSpeed = 0.3;
                this.turbulence = 0.3;
                this.swellAmount = 0.8;
                this.mediumAmount = 0.4;
                this.smallAmount = 0.2;
                break;

            case 'night':
                this.timeOfDay = 2;
                this.waveAmplitude = 0.25;
                this.waveSpeed = 0.6;
                this.windSpeed = 0.4;
                this.turbulence = 0.3;
                this.moonVisible = true;
                this.moonPhase = 0.5; // Full moon
                this.starsVisible = true;
                break;

            case 'dawn':
                this.timeOfDay = 6;
                this.sunAngle = 23.5;
                this.waveAmplitude = 0.2;
                this.waveSpeed = 0.5;
                this.windSpeed = 0.3;
                this.turbulence = 0.2;
                break;

            default:
                console.warn(`Unknown preset: ${presetName}`);
        }
    }

    /**
     * Get a JSON representation of the current configuration
     * @returns {Object} Configuration as plain object
     */
    toJSON() {
        return {
            timeOfDay: this.timeOfDay,
            timeSpeed: this.timeSpeed,
            sunAngle: this.sunAngle,
            sunAzimuth: this.sunAzimuth,
            sunSize: this.sunSize,
            sunIntensity: this.sunIntensity,
            sunGlow: this.sunGlow,
            moonVisible: this.moonVisible,
            moonSize: this.moonSize,
            moonBrightness: this.moonBrightness,
            moonPhase: this.moonPhase,
            moonGlow: this.moonGlow,
            starsVisible: this.starsVisible,
            starSize: this.starSize,
            starDensity: this.starDensity,
            milkyWayIntensity: this.milkyWayIntensity,
            twinkleSpeed: this.twinkleSpeed,
            waveAmplitude: this.waveAmplitude,
            waveSpeed: this.waveSpeed,
            windSpeed: this.windSpeed,
            turbulence: this.turbulence
        };
    }

    /**
     * Load configuration from JSON
     * @param {Object} json - Configuration object
     */
    fromJSON(json) {
        Object.assign(this, json);
    }
}

// Export preset configurations as constants
export const PRESETS = {
    OCEAN: 'ocean',
    LAKE: 'lake',
    STORM: 'storm',
    SUNSET: 'sunset',
    NIGHT: 'night',
    DAWN: 'dawn'
};
