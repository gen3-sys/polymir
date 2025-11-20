/**
 * StormSystem - Dynamic weather pattern generation
 *
 * Generates storms, precipitation, and lightning using procedural noise.
 * Storm cells move across the planet surface in deterministic patterns.
 */

import { noise3d } from '../../math/noise/noise3d.js';

export class StormSystem {
    constructor(seed = 0) {
        this.seed = seed;
        this.globalIntensity = 0.5;  // Global storm activity level (0-1)
        this.stormCellSize = 0.15;    // Size of individual storm cells
        this.stormSpeed = 0.05;       // How fast storms move
        this.lightningFrequency = 0.1; // How often lightning occurs
    }

    /**
     * Get storm intensity at a surface coordinate
     *
     * @param {number} surfaceX - Normalized surface X
     * @param {number} surfaceY - Normalized surface Y
     * @param {number} surfaceZ - Normalized surface Z
     * @param {number} time - Current time
     * @returns {Object} {intensity, precipitation, lightning}
     */
    getIntensityAtSurface(surfaceX, surfaceY, surfaceZ, time) {
        // Generate storm cells using multi-scale noise
        const stormCellNoise = this.getStormCellNoise(surfaceX, surfaceY, surfaceZ, time);

        // Apply global intensity multiplier
        const intensity = Math.max(0, Math.min(1, stormCellNoise * this.globalIntensity));

        // Precipitation increases with storm intensity
        const precipitation = intensity > 0.3 ? (intensity - 0.3) / 0.7 : 0;

        // Lightning occurs in strongest storm regions
        const lightningThreshold = 0.7;
        const lightningNoise = noise3d(
            surfaceX * 10 + this.seed,
            surfaceY * 10,
            time * 5  // Fast flickering
        );
        const lightning = (intensity > lightningThreshold && lightningNoise > 0.8) ? 1.0 : 0.0;

        return {
            intensity: intensity,
            precipitation: precipitation,
            lightning: lightning
        };
    }

    /**
     * Generate storm cell noise pattern
     * Uses multiple octaves for realistic storm clustering
     *
     * @param {number} surfaceX - Surface X
     * @param {number} surfaceY - Surface Y
     * @param {number} surfaceZ - Surface Z
     * @param {number} time - Current time
     * @returns {number} Storm noise value (0-1)
     */
    getStormCellNoise(surfaceX, surfaceY, surfaceZ, time) {
        // Animate storm movement
        const animTime = time * this.stormSpeed;

        // Large-scale storm systems
        const largeScale = noise3d(
            (surfaceX + this.seed) * 0.5 + animTime * 0.1,
            (surfaceY + this.seed) * 0.5,
            (surfaceZ + this.seed) * 0.5 + animTime * 0.05
        );

        // Medium-scale storm cells
        const mediumScale = noise3d(
            (surfaceX + this.seed) * 2.0 + animTime * 0.15,
            (surfaceY + this.seed) * 2.0,
            (surfaceZ + this.seed) * 2.0 + animTime * 0.1
        );

        // Small-scale turbulence
        const smallScale = noise3d(
            (surfaceX + this.seed) * 8.0 + animTime * 0.3,
            (surfaceY + this.seed) * 8.0,
            (surfaceZ + this.seed) * 8.0 + animTime * 0.2
        );

        // Combine scales (large systems with turbulent edges)
        let combined = largeScale * 0.6 + mediumScale * 0.3 + smallScale * 0.1;

        // Normalize to 0-1
        combined = (combined + 1.0) * 0.5;

        // Apply cell size threshold (creates distinct storm cells)
        const threshold = 1.0 - this.stormCellSize;
        combined = Math.max(0, (combined - threshold) / this.stormCellSize);

        return combined;
    }

    /**
     * Set global storm intensity
     * @param {number} intensity - Intensity (0-1)
     */
    setGlobalIntensity(intensity) {
        this.globalIntensity = Math.max(0, Math.min(1, intensity));
    }

    /**
     * Set storm cell parameters
     * @param {number} size - Storm cell size
     * @param {number} speed - Storm movement speed
     */
    setStormParameters(size, speed) {
        if (size !== undefined) this.stormCellSize = size;
        if (speed !== undefined) this.stormSpeed = speed;
    }

    /**
     * Set lightning frequency
     * @param {number} frequency - Lightning frequency (0-1)
     */
    setLightningFrequency(frequency) {
        this.lightningFrequency = Math.max(0, Math.min(1, frequency));
    }

    /**
     * Get precipitation type based on temperature/altitude
     * (Could be expanded to support rain/snow/hail)
     *
     * @param {number} temperature - Temperature at location
     * @param {number} altitude - Altitude above sea level
     * @returns {string} Precipitation type ('none', 'rain', 'snow', 'hail')
     */
    getPrecipitationType(temperature, altitude) {
        if (temperature < -5) return 'snow';
        if (temperature < 0 && altitude > 1000) return 'snow';
        if (temperature > 25) return 'rain';
        return 'rain';
    }
}
