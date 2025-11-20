/**
 * CloudGenerator - Procedural 3D cloud generation
 *
 * Generates deterministic cloud patterns based on surface coordinates.
 * Uses 3D Perlin/Simplex noise for realistic cloud formations.
 * Supports multiple cloud layers with different characteristics.
 */

import { noise3d } from '../../math/noise/noise3d.js';

export class CloudGenerator {
    constructor(seed = 0) {
        this.seed = seed;
    }

    /**
     * Get cloud density at a specific surface coordinate and height
     *
     * @param {number} surfaceX - Normalized surface X (-1 to 1)
     * @param {number} surfaceY - Normalized surface Y (-1 to 1)
     * @param {number} surfaceZ - Normalized surface Z (-1 to 1)
     * @param {number} time - Animation time
     * @param {Array} cloudLayers - Array of cloud layer configurations
     * @returns {Object} {density, height, layerIndex}
     */
    getDensityAtSurface(surfaceX, surfaceY, surfaceZ, time, cloudLayers) {
        let maxDensity = 0;
        let cloudHeight = 0;
        let activeLayerIndex = -1;

        for (let i = 0; i < cloudLayers.length; i++) {
            const layer = cloudLayers[i];
            const density = this.getLayerDensity(
                surfaceX,
                surfaceY,
                surfaceZ,
                time,
                layer
            );

            if (density > maxDensity) {
                maxDensity = density;
                cloudHeight = layer.altitude + layer.thickness * 0.5;
                activeLayerIndex = i;
            }
        }

        return {
            density: maxDensity,
            height: cloudHeight,
            layerIndex: activeLayerIndex
        };
    }

    /**
     * Get cloud density for a specific layer
     *
     * @param {number} surfaceX - Surface X coordinate
     * @param {number} surfaceY - Surface Y coordinate
     * @param {number} surfaceZ - Surface Z coordinate
     * @param {number} time - Animation time
     * @param {Object} layer - Layer configuration
     * @returns {number} Cloud density (0-1)
     */
    getLayerDensity(surfaceX, surfaceY, surfaceZ, time, layer) {
        // Apply layer-specific animation speed
        const animTime = time * layer.speed;

        // Base noise coordinates (seeded)
        const nx = (surfaceX + this.seed) * layer.noiseScale;
        const ny = (surfaceY + this.seed) * layer.noiseScale;
        const nz = (surfaceZ + this.seed) * layer.noiseScale;

        // Multi-octave noise for cloud detail
        let density = 0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let totalAmplitude = 0;

        for (let octave = 0; octave < layer.noiseOctaves; octave++) {
            // Add time offset for animation
            const noiseValue = noise3d(
                nx * frequency + animTime * 0.1,
                ny * frequency,
                nz * frequency + animTime * 0.05
            );

            density += noiseValue * amplitude;
            totalAmplitude += amplitude;

            amplitude *= 0.5;  // Reduce influence of higher octaves
            frequency *= 2.0;  // Increase detail at higher octaves
        }

        // Normalize to 0-1 range
        density = (density / totalAmplitude + 1.0) * 0.5;

        // Apply coverage threshold (sparse vs dense clouds)
        density = Math.max(0, density - (1.0 - layer.coverage)) / layer.coverage;

        // Apply layer density multiplier
        density *= layer.density;

        // Clamp to 0-1
        return Math.max(0, Math.min(1, density));
    }

    /**
     * Get cloud density at a 3D world position (for raymarching)
     *
     * @param {number} worldX - World X coordinate
     * @param {number} worldY - World Y coordinate
     * @param {number} worldZ - World Z coordinate
     * @param {number} heightInLayer - Normalized height within layer (0-1)
     * @param {number} time - Animation time
     * @param {Object} layer - Layer configuration
     * @returns {number} Cloud density (0-1)
     */
    getDensityAt3DPosition(worldX, worldY, worldZ, heightInLayer, time, layer) {
        // Normalize world coordinates to sphere surface
        const dist = Math.sqrt(worldX * worldX + worldY * worldY + worldZ * worldZ);
        const epsilon = 0.0001;
        const safeDist = dist < epsilon ? epsilon : dist;

        const surfaceX = worldX / safeDist;
        const surfaceY = worldY / safeDist;
        const surfaceZ = worldZ / safeDist;

        // Get base density at surface
        let density = this.getLayerDensity(surfaceX, surfaceY, surfaceZ, time, layer);

        // Apply height-based density falloff
        // Clouds are denser in middle of layer, thinner at edges
        const heightFalloff = 1.0 - Math.abs(heightInLayer * 2.0 - 1.0);
        density *= heightFalloff;

        return density;
    }

    /**
     * Get wind-displaced cloud position
     * Used for cloud animation/drift
     *
     * @param {number} surfaceX - Surface X
     * @param {number} surfaceY - Surface Y
     * @param {number} surfaceZ - Surface Z
     * @param {number} time - Animation time
     * @param {number} windSpeed - Wind speed multiplier
     * @param {number} windDirection - Wind direction in radians
     * @param {number} windCurl - Wind turbulence amount
     * @returns {Object} Displaced coordinates {x, y, z}
     */
    getWindDisplacedCoords(surfaceX, surfaceY, surfaceZ, time, windSpeed, windDirection, windCurl) {
        // Calculate wind offset
        const windOffsetX = Math.cos(windDirection) * time * windSpeed;
        const windOffsetZ = Math.sin(windDirection) * time * windSpeed;

        // Add turbulence/curl
        const curlNoise = noise3d(
            surfaceX * 2.0 + this.seed,
            surfaceY * 2.0,
            time * 0.1
        );
        const curlX = curlNoise * windCurl;
        const curlZ = curlNoise * windCurl * 0.7;

        return {
            x: surfaceX + windOffsetX + curlX,
            y: surfaceY,
            z: surfaceZ + windOffsetZ + curlZ
        };
    }

    /**
     * Sample cloud shadow at a surface point
     * Used for surface lighting calculations
     *
     * @param {number} surfaceX - Surface X
     * @param {number} surfaceY - Surface Y
     * @param {number} surfaceZ - Surface Z
     * @param {number} time - Current time
     * @param {Array} cloudLayers - Cloud layers
     * @returns {number} Shadow amount (0 = full light, 1 = full shadow)
     */
    getCloudShadow(surfaceX, surfaceY, surfaceZ, time, cloudLayers) {
        const cloudData = this.getDensityAtSurface(surfaceX, surfaceY, surfaceZ, time, cloudLayers);

        // Denser clouds cast darker shadows
        return cloudData.density * 0.7;  // Max 70% shadow
    }
}
