/**
 * Cloud Raymarching Shader Module
 *
 * Provides GLSL functions for volumetric cloud rendering.
 * Can be integrated into voxel shaders or impostor shaders.
 *
 * Usage:
 *   Import this module and include the shader code in your fragment shader.
 *   Call raymarchClouds() to get cloud color and alpha.
 */

export const cloudShaderModule = `
// ============================================================================
// CLOUD RAYMARCHING MODULE
// ============================================================================

// Cloud layer uniforms (up to 4 layers supported)
uniform float uPlanetRadius;
uniform float uWeatherTime;
uniform float uCloudLayerCount;

// Wind
uniform float uWindSpeed;
uniform float uWindDirection;
uniform float uWindCurl;

// Shadows
uniform float uShadowStrength;
uniform float uShadowSoftness;

// Sun direction (from atmosphere module)
uniform vec3 uSunDir;

// Layer 0
uniform float uCloudLayer0Altitude;
uniform float uCloudLayer0Thickness;
uniform float uCloudLayer0Density;
uniform float uCloudLayer0Coverage;
uniform float uCloudLayer0Speed;
uniform float uCloudLayer0NoiseScale;
uniform float uCloudLayer0NoiseOctaves;

// Layer 1
uniform float uCloudLayer1Altitude;
uniform float uCloudLayer1Thickness;
uniform float uCloudLayer1Density;
uniform float uCloudLayer1Coverage;
uniform float uCloudLayer1Speed;
uniform float uCloudLayer1NoiseScale;
uniform float uCloudLayer1NoiseOctaves;

// Layer 2
uniform float uCloudLayer2Altitude;
uniform float uCloudLayer2Thickness;
uniform float uCloudLayer2Density;
uniform float uCloudLayer2Coverage;
uniform float uCloudLayer2Speed;
uniform float uCloudLayer2NoiseScale;
uniform float uCloudLayer2NoiseOctaves;

// Layer 3
uniform float uCloudLayer3Altitude;
uniform float uCloudLayer3Thickness;
uniform float uCloudLayer3Density;
uniform float uCloudLayer3Coverage;
uniform float uCloudLayer3Speed;
uniform float uCloudLayer3NoiseScale;
uniform float uCloudLayer3NoiseOctaves;

// ============================================================================
// NOISE FUNCTIONS (3D Perlin-style noise)
// ============================================================================

float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(
            mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
            f.y
        ),
        mix(
            mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
            f.y
        ),
        f.z
    );
}

// ============================================================================
// SPHERE INTERSECTION
// ============================================================================

vec2 sphereIntersect(vec3 rayOrigin, vec3 rayDir, float radius) {
    float a = dot(rayDir, rayDir);
    float b = 2.0 * dot(rayOrigin, rayDir);
    float c = dot(rayOrigin, rayOrigin) - radius * radius;
    float discriminant = b * b - 4.0 * a * c;

    if (discriminant < 0.0) {
        return vec2(-1.0, -1.0);  // No intersection
    }

    float sqrtDisc = sqrt(discriminant);
    float t1 = (-b - sqrtDisc) / (2.0 * a);
    float t2 = (-b + sqrtDisc) / (2.0 * a);

    return vec2(t1, t2);
}

// ============================================================================
// CLOUD DENSITY CALCULATION
// ============================================================================

float getCloudDensityForLayer(
    vec3 surfacePos,
    float heightInLayer,
    float altitude,
    float thickness,
    float density,
    float coverage,
    float speed,
    float noiseScale,
    float noiseOctaves
) {
    // Animate clouds
    float animTime = uWeatherTime * speed;

    // Multi-octave noise
    float cloudDensity = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float totalAmplitude = 0.0;

    for (float octave = 0.0; octave < 8.0; octave += 1.0) {
        if (octave >= noiseOctaves) break;

        vec3 samplePos = surfacePos * noiseScale * frequency;
        samplePos.x += animTime * 0.1;
        samplePos.z += animTime * 0.05;

        float noiseValue = noise3d(samplePos);
        cloudDensity += noiseValue * amplitude;
        totalAmplitude += amplitude;

        amplitude *= 0.5;
        frequency *= 2.0;
    }

    // Normalize
    cloudDensity = (cloudDensity / totalAmplitude + 1.0) * 0.5;

    // Apply coverage threshold
    cloudDensity = max(0.0, (cloudDensity - (1.0 - coverage)) / coverage);

    // Apply density multiplier
    cloudDensity *= density;

    // Height-based falloff (clouds denser in middle of layer)
    float heightFalloff = 1.0 - abs(heightInLayer * 2.0 - 1.0);
    cloudDensity *= heightFalloff;

    return clamp(cloudDensity, 0.0, 1.0);
}

// Get cloud density at a 3D position
float getCloudDensity(vec3 pos, int layerIndex, float heightInLayer) {
    // Normalize to surface
    float dist = length(pos);
    vec3 surfacePos = pos / max(dist, 0.0001);

    if (layerIndex == 0) {
        return getCloudDensityForLayer(
            surfacePos, heightInLayer,
            uCloudLayer0Altitude, uCloudLayer0Thickness,
            uCloudLayer0Density, uCloudLayer0Coverage,
            uCloudLayer0Speed, uCloudLayer0NoiseScale,
            uCloudLayer0NoiseOctaves
        );
    } else if (layerIndex == 1) {
        return getCloudDensityForLayer(
            surfacePos, heightInLayer,
            uCloudLayer1Altitude, uCloudLayer1Thickness,
            uCloudLayer1Density, uCloudLayer1Coverage,
            uCloudLayer1Speed, uCloudLayer1NoiseScale,
            uCloudLayer1NoiseOctaves
        );
    } else if (layerIndex == 2) {
        return getCloudDensityForLayer(
            surfacePos, heightInLayer,
            uCloudLayer2Altitude, uCloudLayer2Thickness,
            uCloudLayer2Density, uCloudLayer2Coverage,
            uCloudLayer2Speed, uCloudLayer2NoiseScale,
            uCloudLayer2NoiseOctaves
        );
    } else if (layerIndex == 3) {
        return getCloudDensityForLayer(
            surfacePos, heightInLayer,
            uCloudLayer3Altitude, uCloudLayer3Thickness,
            uCloudLayer3Density, uCloudLayer3Coverage,
            uCloudLayer3Speed, uCloudLayer3NoiseScale,
            uCloudLayer3NoiseOctaves
        );
    }

    return 0.0;
}

// ============================================================================
// CLOUD LIGHTING
// ============================================================================

vec3 getCloudLighting(vec3 pos, float density, vec3 sunDir) {
    // Base cloud color (white-ish)
    vec3 baseColor = vec3(0.9, 0.95, 1.0);

    // Sun lighting
    vec3 surfaceNormal = normalize(pos);
    float sunDot = dot(surfaceNormal, sunDir);
    float dayFactor = smoothstep(-0.1, 0.1, sunDot);

    // Sun color based on height
    float sunHeight = sunDir.y;
    vec3 zenithSunColor = vec3(1.0, 0.95, 0.85);
    vec3 horizonSunColor = vec3(1.0, 0.5, 0.2);
    vec3 duskSunColor = vec3(0.8, 0.3, 0.4);

    vec3 dynamicSunColor;
    if (sunHeight > 0.3) {
        dynamicSunColor = mix(horizonSunColor, zenithSunColor, (sunHeight - 0.3) / 0.7);
    } else if (sunHeight > -0.1) {
        dynamicSunColor = mix(duskSunColor, horizonSunColor, (sunHeight + 0.1) / 0.4);
    } else {
        dynamicSunColor = duskSunColor * 0.3;
    }

    // Combine
    vec3 lighting = baseColor * (0.4 + dayFactor * 0.6);
    lighting *= mix(vec3(0.6, 0.7, 0.9), dynamicSunColor, dayFactor);

    return lighting;
}

// ============================================================================
// MAIN RAYMARCHING FUNCTION
// ============================================================================

vec4 raymarchClouds(vec3 rayOrigin, vec3 rayDir, int layerIndex) {
    // Get layer parameters
    float altitude = 0.0;
    float thickness = 0.0;

    if (layerIndex == 0) {
        altitude = uCloudLayer0Altitude;
        thickness = uCloudLayer0Thickness;
    } else if (layerIndex == 1) {
        altitude = uCloudLayer1Altitude;
        thickness = uCloudLayer1Thickness;
    } else if (layerIndex == 2) {
        altitude = uCloudLayer2Altitude;
        thickness = uCloudLayer2Thickness;
    } else if (layerIndex == 3) {
        altitude = uCloudLayer3Altitude;
        thickness = uCloudLayer3Thickness;
    } else {
        return vec4(0.0);  // Invalid layer
    }

    // Cloud volume boundaries
    float innerRadius = uPlanetRadius + altitude;
    float outerRadius = uPlanetRadius + altitude + thickness;

    // Find entry/exit points
    vec2 outerHit = sphereIntersect(rayOrigin, rayDir, outerRadius);
    vec2 innerHit = sphereIntersect(rayOrigin, rayDir, innerRadius);

    if (outerHit.y < 0.0) return vec4(0.0);  // Missed entirely

    float camDist = length(rayOrigin);
    float tStart, tEnd;

    // Camera outside cloud layer
    if (camDist > outerRadius) {
        tStart = max(0.0, outerHit.x);
        if (innerHit.x > 0.0 && innerHit.x < outerHit.y) {
            tEnd = innerHit.x;  // Stop at planet
        } else {
            tEnd = outerHit.y;  // Exit far side
        }
    }
    // Camera inside cloud layer
    else if (camDist > innerRadius) {
        tStart = 0.0;
        tEnd = (innerHit.x > 0.0) ? innerHit.x : outerHit.y;
    }
    // Camera inside planet
    else {
        if (innerHit.y > 0.0) {
            tStart = innerHit.y;
            tEnd = outerHit.y;
        } else {
            return vec4(0.0);
        }
    }

    // Raymarch through cloud volume
    float stepSize = 0.8;
    float jitter = hash(vec3(gl_FragCoord.xy * 0.1, uWeatherTime)) * 0.5;
    float t = tStart + jitter;

    float transmittance = 1.0;
    vec3 cloudColor = vec3(0.0);

    for (int i = 0; i < 50; i++) {
        if (transmittance < 0.01 || t > tEnd) break;

        vec3 pos = rayOrigin + rayDir * t;
        float distFromCenter = length(pos);

        if (distFromCenter >= innerRadius && distFromCenter <= outerRadius) {
            float heightInLayer = (distFromCenter - innerRadius) / thickness;
            float cloudDensity = getCloudDensity(pos, layerIndex, heightInLayer);

            if (cloudDensity > 0.01) {
                vec3 lighting = getCloudLighting(pos, cloudDensity, uSunDir);
                float absorption = exp(-cloudDensity * stepSize * 0.08);

                cloudColor += lighting * cloudDensity * transmittance * (1.0 - absorption);
                transmittance *= absorption;
            }
        }

        t += stepSize;
    }

    float alpha = 1.0 - transmittance;
    return vec4(cloudColor, alpha);
}

// Raymarch all active cloud layers
vec4 raymarchAllCloudLayers(vec3 rayOrigin, vec3 rayDir) {
    vec4 finalColor = vec4(0.0);
    float finalAlpha = 0.0;

    int layerCount = int(uCloudLayerCount);

    for (int i = 0; i < 4; i++) {
        if (i >= layerCount) break;

        vec4 layerResult = raymarchClouds(rayOrigin, rayDir, i);

        // Composite layers (back-to-front alpha blending)
        finalColor.rgb = finalColor.rgb * (1.0 - layerResult.a) + layerResult.rgb * layerResult.a;
        finalAlpha = finalAlpha + layerResult.a * (1.0 - finalAlpha);
    }

    finalColor.a = finalAlpha;
    return finalColor;
}
`;
