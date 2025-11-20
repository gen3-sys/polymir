/**
 * AtmosphereModule
 *
 * Unified atmosphere rendering with sky gradients, sun, and atmospheric scattering.
 * Extracted from volumetric_ocean_skybox.js and advanced_volumetric_skybox.js
 *
 * Features:
 * - Time-of-day sky gradients (night/dawn/day/dusk)
 * - Configurable sun position and color
 * - Sun disk rendering with corona
 * - Atmospheric scattering (Rayleigh/Mie approximation)
 * - Horizon glow and zenith gradient
 * - Fog and haze simulation
 */

export class AtmosphereModule {
    constructor(options = {}) {
        this.timeOfDay = options.timeOfDay ?? 12.0; // 0-24 hours

        // Sun configuration
        this.sunIntensity = options.sunIntensity ?? 1.0;
        this.sunSize = options.sunSize ?? 0.02;
        this.sunCoronaSize = options.sunCoronaSize ?? 0.1;

        // Atmosphere parameters
        this.rayleighCoefficient = options.rayleighCoefficient ?? [0.0005802, 0.001357, 0.003311];
        this.mieCoefficient = options.mieCoefficient ?? 0.00021;
        this.mieDirectionalG = options.mieDirectionalG ?? 0.76; // Anisotropy factor

        // Sky colors (can be overridden)
        this.nightColors = {
            bottom: options.nightBottom || [0.01, 0.01, 0.05],
            top: options.nightTop || [0.0, 0.0, 0.02]
        };
        this.dawnColors = {
            bottom: options.dawnBottom || [0.3, 0.2, 0.4],
            top: options.dawnTop || [0.1, 0.15, 0.3]
        };
        this.dayColors = {
            bottom: options.dayBottom || [0.5, 0.7, 0.9],
            top: options.dayTop || [0.2, 0.4, 0.8]
        };
        this.duskColors = {
            bottom: options.duskBottom || [0.4, 0.2, 0.1],
            top: options.duskTop || [0.1, 0.1, 0.2]
        };

        // Fog
        this.fogDensity = options.fogDensity ?? 0.0001;
        this.fogColor = options.fogColor || [0.8, 0.9, 1.0];

        this.time = 0;
    }

    /**
     * Get GLSL shader code for atmosphere rendering
     */
    getShaderCode() {
        return `
            // Atmosphere Module Shader Code
            // Sky gradients, sun rendering, atmospheric scattering

            #define PI 3.14159265359

            // Atmosphere uniforms
            uniform float uTimeOfDay;
            uniform float uSunIntensity;
            uniform float uSunSize;
            uniform float uSunCoronaSize;
            uniform vec3 uRayleighCoefficient;
            uniform float uMieCoefficient;
            uniform float uMieDirectionalG;
            uniform float uFogDensity;
            uniform vec3 uFogColor;

            // Color uniforms for different times of day
            uniform vec3 uNightBottom;
            uniform vec3 uNightTop;
            uniform vec3 uDawnBottom;
            uniform vec3 uDawnTop;
            uniform vec3 uDayBottom;
            uniform vec3 uDayTop;
            uniform vec3 uDuskBottom;
            uniform vec3 uDuskTop;

            // Calculate sun direction based on time of day
            vec3 getSunDirection(float timeOfDay) {
                float angle = (timeOfDay / 24.0) * PI * 2.0 - PI * 0.5;
                return normalize(vec3(cos(angle), sin(angle), 0.2));
            }

            // Calculate sun color based on time of day
            vec3 getSunColor(float timeOfDay) {
                float t = timeOfDay / 24.0;

                // Night (0-6, 18-24)
                if (t < 0.25 || t > 0.75) {
                    return vec3(0.08, 0.08, 0.14); // Dark blue, almost invisible
                }
                // Dawn/Dusk (6-7, 17-18)
                else if (t < 0.30 || t > 0.70) {
                    return vec3(1.0, 0.42, 0.22); // Orange/red
                }
                // Day (7-17)
                else {
                    return vec3(1.0, 0.95, 0.85); // Bright yellow-white
                }
            }

            // Sky gradient based on time of day
            vec3 getSkyGradient(vec3 rayDir, float timeOfDay) {
                float t = timeOfDay / 24.0;

                vec3 bottomColor, topColor;

                // Interpolate between time periods
                if (t < 0.25) {
                    // Night to Dawn (0:00 - 6:00)
                    float blend = t * 4.0;
                    bottomColor = mix(uNightBottom, uDawnBottom, blend);
                    topColor = mix(uNightTop, uDawnTop, blend);
                }
                else if (t < 0.5) {
                    // Dawn to Day (6:00 - 12:00)
                    float blend = (t - 0.25) * 4.0;
                    bottomColor = mix(uDawnBottom, uDayBottom, blend);
                    topColor = mix(uDawnTop, uDayTop, blend);
                }
                else if (t < 0.75) {
                    // Day to Dusk (12:00 - 18:00)
                    float blend = (t - 0.5) * 4.0;
                    bottomColor = mix(uDayBottom, uDuskBottom, blend);
                    topColor = mix(uDayTop, uDuskTop, blend);
                }
                else {
                    // Dusk to Night (18:00 - 24:00)
                    float blend = (t - 0.75) * 4.0;
                    bottomColor = mix(uDuskBottom, uNightBottom, blend);
                    topColor = mix(uDuskTop, uNightTop, blend);
                }

                // Vertical gradient from horizon to zenith
                float h = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
                return mix(bottomColor, topColor, h);
            }

            // Render sun disk with corona
            vec3 renderSun(vec3 rayDir, vec3 sunDir, vec3 sunColor, float intensity) {
                float sunDot = max(0.0, dot(rayDir, sunDir));

                // Main sun disk
                float sunDisk = smoothstep(uSunSize, uSunSize * 0.95, acos(sunDot));

                // Corona (soft glow around sun)
                float corona = pow(sunDot, 512.0 / uSunCoronaSize);

                // Combine disk and corona
                vec3 sun = sunColor * (sunDisk + corona * 0.5) * intensity;

                return sun;
            }

            // Rayleigh scattering phase function
            float rayleighPhase(float cosTheta) {
                return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
            }

            // Mie scattering phase function (Henyey-Greenstein)
            float miePhase(float cosTheta, float g) {
                float g2 = g * g;
                float denom = 1.0 + g2 - 2.0 * g * cosTheta;
                return (1.0 - g2) / (4.0 * PI * pow(denom, 1.5));
            }

            // Atmospheric scattering
            vec3 calculateAtmosphericScattering(
                vec3 rayDir,
                vec3 sunDir,
                vec3 sunColor,
                float rayDistance
            ) {
                float cosTheta = dot(rayDir, sunDir);

                // Rayleigh scattering (blue sky)
                float rayleighPhaseValue = rayleighPhase(cosTheta);
                vec3 rayleighScatter = uRayleighCoefficient * rayleighPhaseValue;

                // Mie scattering (haze, sun glow)
                float miePhaseValue = miePhase(cosTheta, uMieDirectionalG);
                vec3 mieScatter = vec3(uMieCoefficient) * miePhaseValue;

                // Optical depth (simplified - increases with distance)
                float opticalDepth = 1.0 - exp(-rayDistance * 0.00001);

                // Combine scattering
                vec3 scatter = (rayleighScatter + mieScatter) * sunColor * opticalDepth;

                return scatter;
            }

            // Apply fog based on distance
            vec3 applyFog(vec3 color, float distance) {
                if (uFogDensity <= 0.0) return color;

                float fogAmount = 1.0 - exp(-distance * uFogDensity);
                return mix(color, uFogColor, fogAmount);
            }

            // Main atmosphere rendering function
            vec3 renderAtmosphere(vec3 rayDir, float maxDistance) {
                vec3 sunDir = getSunDirection(uTimeOfDay);
                vec3 sunColor = getSunColor(uTimeOfDay);

                // Sky gradient base
                vec3 skyColor = getSkyGradient(rayDir, uTimeOfDay);

                // Atmospheric scattering
                vec3 scattering = calculateAtmosphericScattering(rayDir, sunDir, sunColor, maxDistance);
                skyColor += scattering;

                // Sun disk
                vec3 sun = renderSun(rayDir, sunDir, sunColor, uSunIntensity);
                skyColor += sun;

                return skyColor;
            }
        `;
    }

    /**
     * Get uniforms for shader integration
     */
    getUniforms() {
        return {
            // Time and sun
            uTimeOfDay: { value: this.timeOfDay },
            uSunIntensity: { value: this.sunIntensity },
            uSunSize: { value: this.sunSize },
            uSunCoronaSize: { value: this.sunCoronaSize },

            // Scattering coefficients
            uRayleighCoefficient: { value: this.rayleighCoefficient },
            uMieCoefficient: { value: this.mieCoefficient },
            uMieDirectionalG: { value: this.mieDirectionalG },

            // Fog
            uFogDensity: { value: this.fogDensity },
            uFogColor: { value: this.fogColor },

            // Sky colors
            uNightBottom: { value: this.nightColors.bottom },
            uNightTop: { value: this.nightColors.top },
            uDawnBottom: { value: this.dawnColors.bottom },
            uDawnTop: { value: this.dawnColors.top },
            uDayBottom: { value: this.dayColors.bottom },
            uDayTop: { value: this.dayColors.top },
            uDuskBottom: { value: this.duskColors.bottom },
            uDuskTop: { value: this.duskColors.top },

            // Time for animation
            uAtmosphereTime: { value: this.time }
        };
    }

    /**
     * Update module state
     */
    update(deltaTime) {
        this.time += deltaTime;
    }

    /**
     * Set time of day (0-24 hours)
     */
    setTimeOfDay(hours) {
        this.timeOfDay = hours % 24;
    }

    /**
     * Set sun parameters
     */
    setSun(intensity, size, coronaSize) {
        if (intensity !== undefined) this.sunIntensity = intensity;
        if (size !== undefined) this.sunSize = size;
        if (coronaSize !== undefined) this.sunCoronaSize = coronaSize;
    }

    /**
     * Set atmosphere scattering parameters
     */
    setScattering(rayleigh, mie, mieG) {
        if (rayleigh) this.rayleighCoefficient = rayleigh;
        if (mie !== undefined) this.mieCoefficient = mie;
        if (mieG !== undefined) this.mieDirectionalG = mieG;
    }

    /**
     * Set fog parameters
     */
    setFog(density, color) {
        if (density !== undefined) this.fogDensity = density;
        if (color) this.fogColor = color;
    }

    /**
     * Set sky colors for a specific time period
     */
    setSkyColors(period, bottom, top) {
        const periods = {
            night: this.nightColors,
            dawn: this.dawnColors,
            day: this.dayColors,
            dusk: this.duskColors
        };

        if (periods[period]) {
            if (bottom) periods[period].bottom = bottom;
            if (top) periods[period].top = top;
        }
    }

    /**
     * Load preset configuration
     */
    loadPreset(preset) {
        if (preset.timeOfDay !== undefined) this.timeOfDay = preset.timeOfDay;
        if (preset.sunIntensity !== undefined) this.sunIntensity = preset.sunIntensity;
        if (preset.sunSize !== undefined) this.sunSize = preset.sunSize;
        if (preset.sunCoronaSize !== undefined) this.sunCoronaSize = preset.sunCoronaSize;

        if (preset.rayleighCoefficient) this.rayleighCoefficient = preset.rayleighCoefficient;
        if (preset.mieCoefficient !== undefined) this.mieCoefficient = preset.mieCoefficient;
        if (preset.mieDirectionalG !== undefined) this.mieDirectionalG = preset.mieDirectionalG;

        if (preset.fogDensity !== undefined) this.fogDensity = preset.fogDensity;
        if (preset.fogColor) this.fogColor = preset.fogColor;

        // Load color presets
        if (preset.nightColors) {
            this.nightColors = { ...this.nightColors, ...preset.nightColors };
        }
        if (preset.dawnColors) {
            this.dawnColors = { ...this.dawnColors, ...preset.dawnColors };
        }
        if (preset.dayColors) {
            this.dayColors = { ...this.dayColors, ...preset.dayColors };
        }
        if (preset.duskColors) {
            this.duskColors = { ...this.duskColors, ...preset.duskColors };
        }
    }

    /**
     * Export configuration
     */
    exportConfig() {
        return {
            timeOfDay: this.timeOfDay,
            sunIntensity: this.sunIntensity,
            sunSize: this.sunSize,
            sunCoronaSize: this.sunCoronaSize,
            rayleighCoefficient: [...this.rayleighCoefficient],
            mieCoefficient: this.mieCoefficient,
            mieDirectionalG: this.mieDirectionalG,
            fogDensity: this.fogDensity,
            fogColor: [...this.fogColor],
            nightColors: { ...this.nightColors },
            dawnColors: { ...this.dawnColors },
            dayColors: { ...this.dayColors },
            duskColors: { ...this.duskColors }
        };
    }

    /**
     * Get sun direction for given time of day
     * Useful for other systems that need sun position
     */
    getSunDirection(timeOfDay = this.timeOfDay) {
        const angle = (timeOfDay / 24.0) * Math.PI * 2.0 - Math.PI * 0.5;
        return {
            x: Math.cos(angle),
            y: Math.sin(angle),
            z: 0.2
        };
    }

    /**
     * Get sun color for given time of day
     */
    getSunColor(timeOfDay = this.timeOfDay) {
        const t = timeOfDay / 24.0;

        if (t < 0.25 || t > 0.75) return [0.08, 0.08, 0.14];
        if (t < 0.30 || t > 0.70) return [1.0, 0.42, 0.22];
        return [1.0, 0.95, 0.85];
    }
}