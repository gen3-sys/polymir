/**
 * Ocean Rendering Shader Module
 *
 * Provides GLSL functions for rendering realistic ocean water with:
 * - Multi-scale wave simulation using noise
 * - Cloud shadow interaction on water
 * - Physically-based water shading (Fresnel, subsurface scattering)
 * - Foam, reflections, and wave crests
 * - Sun/moon glints
 *
 * Usage:
 *   Import this module and include the shader code in your fragment shader.
 *   Call oceanRender() to render the ocean surface.
 *   Requires skybox module for sun/moon direction functions.
 */

export const oceanShaderModule = `
// ============================================================================
// OCEAN RENDERING MODULE
// ============================================================================

#ifndef MAX_DIST
#define MAX_DIST 40000.0
#endif

// Ocean wave uniforms
uniform float uWaveAmplitude;     // Overall wave height
uniform float uWaveSpeed;         // Wave animation speed
uniform float uWaveDirection;     // Wind direction in radians
uniform float uWaveChoppiness;    // How choppy the waves are
uniform float uWaveSteepness;     // Wave steepness factor

// Multi-scale wave controls
uniform float uSwellScale;        // Large swell wavelength
uniform float uSwellAmount;       // Large swell contribution
uniform float uMediumScale;       // Medium wave wavelength
uniform float uMediumAmount;      // Medium wave contribution
uniform float uSmallScale;        // Small wave wavelength
uniform float uSmallAmount;       // Small wave contribution
uniform float uDetailScale;       // Fine detail wavelength
uniform float uDetailAmount;      // Fine detail contribution

// Water appearance
uniform float uFoamThreshold;     // Height threshold for foam
uniform float uFoamDetail;        // Foam texture detail
uniform float uFresnelStrength;   // Fresnel reflection strength
uniform float uSubsurfaceScatter; // Subsurface scattering amount
uniform float uWaterClarity;      // Water transparency/color depth

// Reflection controls
uniform float uSunReflectionSize;  // Sun specular highlight size
uniform float uMoonReflectionSize; // Moon specular highlight size
uniform bool uCloudReflections;    // Enable cloud reflections in water

// Wind and turbulence
uniform float uWindSpeed;
uniform float uTurbulence;

// ============================================================================
// OCEAN WAVE GENERATION
// ============================================================================

// Multi-octave wave using noise (requires noise_skybox from skybox module)
float getWaveHeight(vec3 oceanPos, float time) {
    float wave = 0.0;

    // Position in wave space
    vec3 wavePos = vec3(oceanPos.x * 0.001, oceanPos.z * 0.001, time * uWaveSpeed * 0.1);

    // Large swells
    float swell = noise_skybox(wavePos * uSwellScale) * uWaveAmplitude * uSwellAmount;
    wave += swell;

    // Medium waves
    float mediumWaves = noise_skybox(wavePos * uMediumScale + vec3(100.0)) * uWaveAmplitude * uMediumAmount;
    wave += mediumWaves;

    // Small waves
    float smallWaves = noise_skybox(wavePos * uSmallScale + vec3(200.0)) * uWaveAmplitude * uSmallAmount;
    wave += smallWaves;

    // Very small details
    float details = noise_skybox(wavePos * uDetailScale + vec3(300.0)) * uWaveAmplitude * uDetailAmount;
    wave += details;

    return wave;
}

// Calculate wave normal using derivative approximation
vec3 getWaveNormal(vec3 oceanPos, float time) {
    float delta = 1.0;

    float waveCenter = getWaveHeight(oceanPos, time);
    float waveX = getWaveHeight(oceanPos + vec3(delta, 0, 0), time);
    float waveZ = getWaveHeight(oceanPos + vec3(0, 0, delta), time);

    vec3 normal = vec3(
        (waveCenter - waveX) / delta,
        1.0,
        (waveCenter - waveZ) / delta
    );

    return normalize(normal);
}

// ============================================================================
// OCEAN RENDERING
// ============================================================================

vec3 oceanRender(vec3 rayOrigin, vec3 rayDir, float time, vec3 sunDir, vec3 sunColor, vec3 moonDir, vec3 moonColor) {
    // Only render ocean if looking down and above water
    if (rayDir.y >= 0.0 || rayOrigin.y < -100.0) return vec3(0.0);

    // Ray-plane intersection at y=0
    float t = -rayOrigin.y / rayDir.y;
    if (t < 0.0 || t > MAX_DIST) return vec3(0.0);

    vec3 oceanPos = rayOrigin + rayDir * t;

    // Calculate cloud shadow for wind modulation
    float cloudShadow = 1.0;

    // Note: Cloud shadow calculation requires cloud density function from clouds module
    // If clouds module is loaded, this will modulate waves based on cloud coverage
    #ifdef HAS_CLOUD_DENSITY
    for (int i = 0; i < 3; i++) {
        if (uLayerEnabled[i]) {
            float layerBase = uLayerHeight[i];
            float layerTop = layerBase + uLayerThickness[i];

            vec3 cloudCheckPos = oceanPos + vec3(0.0, (layerBase + layerTop) * 0.5, 0.0);
            cloudCheckPos.xz -= sunDir.xz * (cloudCheckPos.y - oceanPos.y) / max(0.1, sunDir.y);

            float cloudDens = cloudDensity(cloudCheckPos);
            cloudShadow *= 1.0 - cloudDens * 0.7;
        }
    }
    #endif

    // Wind strength based on cloud shadow (clear sky = stronger wind)
    float windStrength = mix(0.6, 1.0, cloudShadow);

    // Wave calculation with wind modulation
    float wave = getWaveHeight(oceanPos, time) * windStrength;
    vec3 normal = getWaveNormal(oceanPos, time);

    // Add turbulence at cloud edges
    #ifdef HAS_CLOUD_DENSITY
    float cloudEdgeTurbulence = abs(dFdx(cloudShadow)) + abs(dFdy(cloudShadow));
    if (cloudEdgeTurbulence > 0.01) {
        float turbulence = noise_skybox(vec3(oceanPos.xz * 0.01, time * 2.0)) * cloudEdgeTurbulence;
        wave += turbulence * uWaveAmplitude * 0.2;
    }
    #endif

    // Base water colors (physically based)
    vec3 deepColor = vec3(0.003, 0.04, 0.08);
    vec3 shallowColor = vec3(0.02, 0.15, 0.25);
    vec3 scatterColor = vec3(0.004, 0.1, 0.15);

    // Apply cloud shadow to water color
    deepColor *= cloudShadow;
    shallowColor *= cloudShadow;
    scatterColor *= cloudShadow * 0.7;

    // View-dependent color mixing
    float viewDepth = max(0.0, -rayDir.y);
    vec3 waterColor = mix(shallowColor, deepColor, viewDepth * uWaterClarity);

    // Subsurface scattering from sun
    float scatter = max(0.0, dot(normalize(vec3(sunDir.x, abs(sunDir.y), sunDir.z)), -rayDir));
    waterColor += scatterColor * pow(scatter, 3.0) * uSubsurfaceScatter;

    // Fresnel effect
    float fresnel = pow(1.0 - max(0.0, dot(normal, -rayDir)), 2.0);
    fresnel = mix(0.02, 1.0, fresnel) * uFresnelStrength;

    // Wave crest enhancement (only in lit areas)
    float waveHeight = wave / (uWaveAmplitude * 2.0);
    float crestFactor = smoothstep(-0.5, 0.5, waveHeight) * cloudShadow;
    fresnel = mix(fresnel * 0.3, fresnel, crestFactor);

    // Shadow kills reflections
    float reflectionStrength = mix(0.1, 1.0, pow(cloudShadow, 2.0));
    fresnel *= reflectionStrength;

    // Foam on wave crests
    float foamThreshold = uWaveAmplitude * mix(0.7, 0.4, cloudShadow) * uFoamThreshold;
    float foamLine = smoothstep(foamThreshold * 0.7, foamThreshold, wave * cloudShadow);
    float foamPattern = abs(sin(wave * 10.0 * uFoamDetail)) * 0.5 + 0.5;
    float foamTex = foamLine * foamPattern * crestFactor;
    vec3 foamColor = vec3(0.9, 0.95, 1.0) * foamTex * cloudShadow;

    // Sky reflection
    vec3 reflectDir = reflect(rayDir, normal);
    vec3 skyReflection = getSkyColor(reflectDir, uTimeOfDay);

    // Sun glints (only in bright areas)
    float sunDotReflect = max(0.0, dot(reflectDir, sunDir));
    float glint = 0.0;
    if (cloudShadow > 0.8 && crestFactor > 0.7 && sunDotReflect > 0.9) {
        glint = pow(sunDotReflect, 100.0 / uSunReflectionSize) * crestFactor * cloudShadow;
        skyReflection += sunColor * glint * 10.0;
    }

    // Moon glints
    if (uMoonVisible && moonDir.y > 0.0) {
        float moonDotReflect = max(0.0, dot(reflectDir, moonDir));
        if (cloudShadow > 0.5 && moonDotReflect > 0.95) {
            float moonGlint = pow(moonDotReflect, 50.0 / uMoonReflectionSize) * cloudShadow;
            skyReflection += moonColor * moonGlint * 5.0;
        }
    }

    // Cloud reflections (if enabled and clouds module is present)
    #ifdef HAS_CLOUD_DENSITY
    if (uCloudReflections && reflectDir.y > 0.0 && cloudShadow > 0.3) {
        vec4 cloudReflection = vec4(0.0);
        for (int i = 0; i < 3; i++) {
            if (uLayerEnabled[i]) {
                float layerBase = uLayerHeight[i];
                float layerTop = layerBase + uLayerThickness[i];
                float cloudT = (layerBase + layerTop * 0.5 - oceanPos.y) / reflectDir.y;

                if (cloudT > 0.0) {
                    vec3 cloudPos = oceanPos + reflectDir * cloudT;
                    float density = cloudDensity(cloudPos);

                    if (density > 0.01) {
                        float lightness = max(0.3, dot(vec3(0, 1, 0), sunDir));
                        vec3 cloudColor = mix(
                            vec3(0.4, 0.5, 0.7) * 0.6,
                            sunColor,
                            lightness
                        );

                        if (uTimeOfDay < 6.0 || uTimeOfDay > 18.0) {
                            cloudColor = mix(cloudColor, vec3(1.0, 0.6, 0.3), 0.3);
                        }

                        cloudColor *= cloudShadow * cloudShadow;

                        cloudReflection.rgb = cloudColor;
                        cloudReflection.a = density * cloudShadow;
                        break;
                    }
                }
            }
        }
        skyReflection = mix(skyReflection, cloudReflection.rgb, cloudReflection.a);
    }
    #endif

    skyReflection *= cloudShadow * cloudShadow;

    // Wave shimmer (only in sunlight)
    if (cloudShadow > 0.6 && crestFactor > 0.5) {
        float shimmer = sin(oceanPos.x * 0.1 + wave * 5.0) * sin(oceanPos.z * 0.1 - wave * 3.0);
        shimmer = smoothstep(0.3, 0.7, shimmer) * crestFactor * cloudShadow;
        skyReflection += skyReflection * shimmer * 0.5;
    }

    // Combine water color with reflection
    vec3 finalColor = mix(waterColor, skyReflection, fresnel);
    finalColor += foamColor * (1.0 - fresnel);

    // Distance fog
    float fogStart = 5000.0;
    float fogEnd = MAX_DIST * 0.8;
    float fogFactor = smoothstep(fogStart, fogEnd, t);
    vec3 horizonColor = getSkyColor(vec3(rayDir.x, 0.0, rayDir.z), uTimeOfDay);
    finalColor = mix(finalColor, horizonColor, fogFactor);

    return finalColor;
}
`;

// Default ocean configuration values
export const oceanDefaults = {
    waveAmplitude: 0.41,
    waveSpeed: 1.0,
    waveDirection: 0.0,
    waveChoppiness: 0.5,
    waveSteepness: 0.5,
    swellScale: 2.0,
    swellAmount: 1.0,
    mediumScale: 5.0,
    mediumAmount: 0.5,
    smallScale: 12.0,
    smallAmount: 0.2,
    detailScale: 25.0,
    detailAmount: 0.1,
    foamThreshold: 1.0,
    foamDetail: 1.0,
    fresnelStrength: 1.0,
    subsurfaceScatter: 1.0,
    waterClarity: 1.0,
    sunReflectionSize: 1.0,
    moonReflectionSize: 1.0,
    cloudReflections: true
};
