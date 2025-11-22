/**
 * Skybox System - Complete Environmental Rendering
 *
 * This module provides a complete skybox rendering system extracted from
 * the advanced skybox demos. It includes:
 *
 * 1. **Skybox Module** (skybox.glsl.js)
 *    - Day/night sky gradients with smooth transitions
 *    - Sun and moon positioning with axial tilt
 *    - Star field with Milky Way
 *    - Twinkling stars with color variation
 *
 * 2. **Ocean Module** (ocean.glsl.js)
 *    - Multi-scale wave simulation using Perlin noise
 *    - Physically-based water shading (Fresnel, subsurface scattering)
 *    - Cloud shadow interaction on water surface
 *    - Dynamic foam on wave crests
 *    - Sun/moon reflections and glints
 *
 * 3. **Configuration System** (skyboxConfig.js)
 *    - JavaScript API for managing all skybox parameters
 *    - Preset environments (ocean, lake, storm, sunset, night, dawn)
 *    - Uniform management helpers
 *    - Time-of-day animation
 *
 * ## Usage Example
 *
 * ```javascript
 * import { skyboxShaderModule } from './modules/skybox.glsl.js';
 * import { oceanShaderModule } from './modules/ocean.glsl.js';
 * import { cloudShaderModule } from './modules/clouds.glsl.js';
 * import { SkyboxConfig } from './modules/skyboxConfig.js';
 *
 * // Create configuration
 * const skyboxConfig = new SkyboxConfig();
 * skyboxConfig.loadPreset('ocean');
 *
 * // Build shader (fragment shader example)
 * const fragmentShader = `#version 300 es
 *     precision highp float;
 *
 *     uniform float uTime;
 *     uniform vec2 uResolution;
 *     uniform vec3 uCameraPos;
 *     uniform mat3 uCameraRot;
 *
 *     ${skyboxShaderModule}
 *     ${oceanShaderModule}
 *     ${cloudShaderModule}
 *
 *     out vec4 fragColor;
 *
 *     void main() {
 *         // Calculate ray direction
 *         vec2 uv = (gl_FragCoord.xy / uResolution - 0.5) * 2.0;
 *         uv.x *= uResolution.x / uResolution.y;
 *         vec3 rayDir = normalize(uCameraRot * vec3(uv, -1.0));
 *
 *         // Get sun direction and color
 *         vec3 sunDir = getSunDirection(uTimeOfDay);
 *         vec3 sunColor = getSunColor(uTimeOfDay);
 *         vec3 moonDir = getMoonDirection(uTimeOfDay);
 *         vec3 moonColor = getMoonColor(uTimeOfDay);
 *
 *         // Render sky gradient
 *         vec3 color = getSkyColor(rayDir, uTimeOfDay);
 *
 *         // Add stars at night
 *         float nightFactor = getNightFactor(uTimeOfDay);
 *         color += renderStars(rayDir, uTime) * nightFactor;
 *
 *         // Render ocean
 *         vec3 oceanColor = oceanRender(uCameraPos, rayDir, uTime, sunDir, sunColor, moonDir, moonColor);
 *         if (length(oceanColor) > 0.01) {
 *             color = mix(color, oceanColor, 0.8);
 *         }
 *
 *         // Render clouds (if cloud module is included)
 *         vec4 clouds = raymarchClouds(uCameraPos, rayDir, sunDir, sunColor);
 *         color = mix(color, clouds.rgb, clouds.a);
 *
 *         // Add sun disk
 *         float sunDot = dot(rayDir, sunDir);
 *         if (sunDot > 0.995) {
 *             float sunIntensity = smoothstep(0.995, 0.9995, sunDot);
 *             color += sunColor * sunIntensity * 15.0;
 *         }
 *
 *         // Sun glow
 *         float sunGlow = max(0.0, sunDot);
 *         color += sunColor * pow(sunGlow, 8.0) * uSunGlow;
 *
 *         // Tone mapping and gamma correction
 *         color = color / (color + vec3(1.0));
 *         color = pow(color, vec3(1.0 / 2.2));
 *
 *         fragColor = vec4(color, 1.0);
 *     }
 * `;
 *
 * // In render loop
 * function render(time) {
 *     skyboxConfig.updateTime(deltaTime);
 *     skyboxConfig.applyUniforms(gl, uniforms, time);
 *     // ... render
 * }
 * ```
 *
 * ## Integration with Clouds
 *
 * The ocean module can interact with the cloud module for realistic cloud shadows
 * on water. To enable this:
 *
 * 1. Include both cloud and ocean modules in your shader
 * 2. Define `HAS_CLOUD_DENSITY` before including the ocean module
 * 3. Ensure `cloudDensity()` function is available from cloud module
 *
 * Example:
 * ```glsl
 * ${cloudShaderModule}
 * #define HAS_CLOUD_DENSITY
 * ${oceanShaderModule}
 * ```
 *
 * ## Presets
 *
 * Available environment presets:
 * - **ocean**: Mid-day ocean with moderate waves
 * - **lake**: Calm morning lake with small waves
 * - **storm**: Stormy conditions with large waves
 * - **sunset**: Golden hour with gentle waves
 * - **night**: Nighttime with full moon and stars
 * - **dawn**: Early morning atmosphere
 *
 * ## Configuration Parameters
 *
 * ### Time & Celestial Bodies
 * - `timeOfDay`: 0-24 hours
 * - `timeSpeed`: Time progression speed
 * - `sunAngle`: Axial tilt (degrees)
 * - `sunAzimuth`: Sun rotation angle (degrees)
 * - `sunSize`, `sunIntensity`, `sunGlow`: Sun appearance
 * - `moonVisible`, `moonSize`, `moonBrightness`, `moonPhase`, `moonGlow`: Moon settings
 *
 * ### Stars
 * - `starsVisible`: Toggle star rendering
 * - `starSize`, `starDensity`: Star appearance
 * - `milkyWayIntensity`: Milky Way brightness
 * - `twinkleSpeed`: Star animation speed
 *
 * ### Ocean Waves
 * - `waveAmplitude`: Overall wave height
 * - `waveSpeed`: Wave animation speed
 * - `swellScale/Amount`: Large ocean swells
 * - `mediumScale/Amount`: Medium waves
 * - `smallScale/Amount`: Small waves
 * - `detailScale/Amount`: Fine wave details
 *
 * ### Water Appearance
 * - `foamThreshold`, `foamDetail`: Foam on wave crests
 * - `fresnelStrength`: Reflection intensity
 * - `subsurfaceScatter`: Light penetration
 * - `waterClarity`: Water transparency
 * - `cloudReflections`: Enable cloud reflections in water
 *
 * ### Atmosphere
 * - `windSpeed`: Wind strength affecting waves and clouds
 * - `turbulence`: Atmospheric turbulence
 */

export { skyboxShaderModule, skyboxDefaults } from './skybox.glsl.js';
export { oceanShaderModule, oceanDefaults } from './ocean.glsl.js';
export { SkyboxConfig, PRESETS } from './skyboxConfig.js';

// Re-export cloud module for convenience
export { cloudShaderModule } from './clouds.glsl.js';

/**
 * Helper function to get all required uniform locations for skybox system
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {WebGLProgram} program - Shader program
 * @returns {Object} Object containing all uniform locations
 */
export function getSkyboxUniforms(gl, program) {
    return {
        // Time
        uTime: gl.getUniformLocation(program, 'uTime'),
        uTimeOfDay: gl.getUniformLocation(program, 'uTimeOfDay'),

        // Camera
        uResolution: gl.getUniformLocation(program, 'uResolution'),
        uCameraPos: gl.getUniformLocation(program, 'uCameraPos'),
        uCameraRot: gl.getUniformLocation(program, 'uCameraRot'),

        // Sun
        uSunAngle: gl.getUniformLocation(program, 'uSunAngle'),
        uSunAzimuth: gl.getUniformLocation(program, 'uSunAzimuth'),
        uSunSize: gl.getUniformLocation(program, 'uSunSize'),
        uSunIntensity: gl.getUniformLocation(program, 'uSunIntensity'),
        uSunGlow: gl.getUniformLocation(program, 'uSunGlow'),

        // Moon
        uMoonVisible: gl.getUniformLocation(program, 'uMoonVisible'),
        uMoonSize: gl.getUniformLocation(program, 'uMoonSize'),
        uMoonBrightness: gl.getUniformLocation(program, 'uMoonBrightness'),
        uMoonPhase: gl.getUniformLocation(program, 'uMoonPhase'),
        uMoonGlow: gl.getUniformLocation(program, 'uMoonGlow'),

        // Stars
        uStarsVisible: gl.getUniformLocation(program, 'uStarsVisible'),
        uStarSize: gl.getUniformLocation(program, 'uStarSize'),
        uStarDensity: gl.getUniformLocation(program, 'uStarDensity'),
        uMilkyWayIntensity: gl.getUniformLocation(program, 'uMilkyWayIntensity'),
        uTwinkleSpeed: gl.getUniformLocation(program, 'uTwinkleSpeed'),

        // Ocean
        uWaveAmplitude: gl.getUniformLocation(program, 'uWaveAmplitude'),
        uWaveSpeed: gl.getUniformLocation(program, 'uWaveSpeed'),
        uWaveDirection: gl.getUniformLocation(program, 'uWaveDirection'),
        uWaveChoppiness: gl.getUniformLocation(program, 'uWaveChoppiness'),
        uWaveSteepness: gl.getUniformLocation(program, 'uWaveSteepness'),
        uSwellScale: gl.getUniformLocation(program, 'uSwellScale'),
        uSwellAmount: gl.getUniformLocation(program, 'uSwellAmount'),
        uMediumScale: gl.getUniformLocation(program, 'uMediumScale'),
        uMediumAmount: gl.getUniformLocation(program, 'uMediumAmount'),
        uSmallScale: gl.getUniformLocation(program, 'uSmallScale'),
        uSmallAmount: gl.getUniformLocation(program, 'uSmallAmount'),
        uDetailScale: gl.getUniformLocation(program, 'uDetailScale'),
        uDetailAmount: gl.getUniformLocation(program, 'uDetailAmount'),
        uFoamThreshold: gl.getUniformLocation(program, 'uFoamThreshold'),
        uFoamDetail: gl.getUniformLocation(program, 'uFoamDetail'),
        uFresnelStrength: gl.getUniformLocation(program, 'uFresnelStrength'),
        uSubsurfaceScatter: gl.getUniformLocation(program, 'uSubsurfaceScatter'),
        uWaterClarity: gl.getUniformLocation(program, 'uWaterClarity'),
        uSunReflectionSize: gl.getUniformLocation(program, 'uSunReflectionSize'),
        uMoonReflectionSize: gl.getUniformLocation(program, 'uMoonReflectionSize'),
        uCloudReflections: gl.getUniformLocation(program, 'uCloudReflections'),

        // Wind
        uWindSpeed: gl.getUniformLocation(program, 'uWindSpeed'),
        uTurbulence: gl.getUniformLocation(program, 'uTurbulence')
    };
}
