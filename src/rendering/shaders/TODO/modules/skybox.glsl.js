/**
 * Skybox Shader Module
 *
 * Provides GLSL functions for rendering a complete skybox with:
 * - Day/night sky gradients
 * - Sun and moon with phases
 * - Stars and Milky Way
 * - Atmospheric effects
 *
 * Usage:
 *   Import this module and include the shader code in your fragment shader.
 *   Call getSkyColor() to get the base sky gradient.
 *   Call renderCelestialBodies() for sun/moon/stars.
 */

export const skyboxShaderModule = `
// ============================================================================
// SKYBOX MODULE - SKY GRADIENTS AND CELESTIAL BODIES
// ============================================================================

#ifndef PI
#define PI 3.14159265359
#endif

// Sun uniforms
uniform float uTimeOfDay;       // 0-24 hours
uniform float uSunAngle;         // Axial tilt in degrees
uniform float uSunAzimuth;       // Sun rotation angle
uniform float uSunSize;          // Size multiplier for sun disk
uniform float uSunIntensity;     // Brightness multiplier
uniform float uSunGlow;          // Glow strength around sun

// Moon uniforms
uniform bool uMoonVisible;       // Toggle moon rendering
uniform float uMoonSize;         // Size multiplier for moon disk
uniform float uMoonBrightness;   // Moon brightness
uniform float uMoonPhase;        // 0-1, where 0=new, 0.5=full, 1=new
uniform float uMoonGlow;         // Glow strength around moon

// Stars uniforms
uniform bool uStarsVisible;      // Toggle stars
uniform float uStarSize;         // Star size multiplier
uniform float uStarDensity;      // Star density multiplier
uniform float uMilkyWayIntensity; // Milky way brightness
uniform float uTwinkleSpeed;     // Star twinkling speed

// ============================================================================
// HASH FUNCTIONS
// ============================================================================

float hash_skybox(float n) {
    return fract(sin(n) * 43758.5453123);
}

float hash_skybox(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hash_skybox(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

vec3 hash3_skybox(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// ============================================================================
// NOISE FUNCTIONS
// ============================================================================

float noise_skybox(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash_skybox(i.x + i.y * 57.0 + i.z * 113.0);
    float b = hash_skybox(i.x + 1.0 + i.y * 57.0 + i.z * 113.0);
    float c = hash_skybox(i.x + (i.y + 1.0) * 57.0 + i.z * 113.0);
    float d = hash_skybox(i.x + 1.0 + (i.y + 1.0) * 57.0 + i.z * 113.0);
    float e = hash_skybox(i.x + i.y * 57.0 + (i.z + 1.0) * 113.0);
    float f1 = hash_skybox(i.x + 1.0 + i.y * 57.0 + (i.z + 1.0) * 113.0);
    float g = hash_skybox(i.x + (i.y + 1.0) * 57.0 + (i.z + 1.0) * 113.0);
    float h = hash_skybox(i.x + 1.0 + (i.y + 1.0) * 57.0 + (i.z + 1.0) * 113.0);

    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
              mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
}

float fbm_skybox(vec3 p, float complexity) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 4; i++) {
        value += amplitude * noise_skybox(p * frequency);
        amplitude *= 0.5 * complexity;
        frequency *= 2.0;
    }

    return value;
}

// ============================================================================
// SKY GRADIENT
// ============================================================================

vec3 getSkyColor(vec3 rayDir, float timeOfDay) {
    float t = timeOfDay / 24.0;

    // Define colors for different times of day
    vec3 nightBottom = vec3(0.01, 0.01, 0.05);
    vec3 nightTop = vec3(0.0, 0.0, 0.02);
    vec3 dawnBottom = vec3(0.3, 0.2, 0.4);
    vec3 dawnTop = vec3(0.1, 0.15, 0.3);
    vec3 dayBottom = vec3(0.5, 0.7, 0.9);
    vec3 dayTop = vec3(0.2, 0.4, 0.8);
    vec3 duskBottom = vec3(0.4, 0.2, 0.1);
    vec3 duskTop = vec3(0.1, 0.1, 0.2);

    vec3 bottomColor, topColor;

    // Blend between time periods
    if (t < 0.25) { // Night to dawn (0:00 - 6:00)
        float blend = t * 4.0;
        bottomColor = mix(nightBottom, dawnBottom, blend);
        topColor = mix(nightTop, dawnTop, blend);
    } else if (t < 0.5) { // Dawn to day (6:00 - 12:00)
        float blend = (t - 0.25) * 4.0;
        bottomColor = mix(dawnBottom, dayBottom, blend);
        topColor = mix(dawnTop, dayTop, blend);
    } else if (t < 0.75) { // Day to dusk (12:00 - 18:00)
        float blend = (t - 0.5) * 4.0;
        bottomColor = mix(dayBottom, duskBottom, blend);
        topColor = mix(dayTop, duskTop, blend);
    } else { // Dusk to night (18:00 - 24:00)
        float blend = (t - 0.75) * 4.0;
        bottomColor = mix(duskBottom, nightBottom, blend);
        topColor = mix(duskTop, nightTop, blend);
    }

    // Vertical gradient
    float height = rayDir.y * 0.5 + 0.5;
    vec3 skyColor = mix(bottomColor, topColor, height);

    // Horizon glow
    float horizonGlow = exp(-abs(rayDir.y) * 3.0) * 0.3;
    vec3 horizonColor = mix(bottomColor, topColor * 1.5, 0.5);
    skyColor = mix(skyColor, horizonColor, horizonGlow);

    return skyColor;
}

// ============================================================================
// SUN CALCULATION
// ============================================================================

vec3 getSunDirection(float timeOfDay) {
    float dayProgress = timeOfDay / 24.0;
    float rotationAngle = dayProgress * PI * 2.0 - PI * 0.5;
    float tilt = uSunAngle * PI / 180.0;
    float azimuthRad = uSunAzimuth * PI / 180.0;

    vec3 sunPos;
    sunPos.x = sin(rotationAngle) * cos(tilt);
    sunPos.y = cos(rotationAngle) * cos(tilt);
    sunPos.z = sin(tilt);

    float cosAz = cos(azimuthRad);
    float sinAz = sin(azimuthRad);
    vec3 rotatedSun;
    rotatedSun.x = sunPos.x * cosAz - sunPos.z * sinAz;
    rotatedSun.y = sunPos.y;
    rotatedSun.z = sunPos.x * sinAz + sunPos.z * cosAz;

    return normalize(rotatedSun);
}

vec3 getSunColor(float timeOfDay) {
    float t = timeOfDay / 24.0;

    vec3 midnightColor = vec3(0.1, 0.1, 0.2);
    vec3 sunriseColor = vec3(1.0, 0.4, 0.2);
    vec3 morningColor = vec3(1.0, 0.7, 0.4);
    vec3 noonColor = vec3(1.0, 1.0, 0.95);
    vec3 afternoonColor = vec3(1.0, 0.95, 0.85);
    vec3 sunsetColor = vec3(1.0, 0.5, 0.25);
    vec3 duskColor = vec3(0.8, 0.3, 0.4);

    vec3 sunColor;
    if (t < 0.25) {
        sunColor = mix(midnightColor, sunriseColor, t * 4.0);
    } else if (t < 0.5) {
        sunColor = mix(sunriseColor, noonColor, (t - 0.25) * 4.0);
    } else if (t < 0.75) {
        sunColor = mix(noonColor, sunsetColor, (t - 0.5) * 4.0);
    } else {
        sunColor = mix(sunsetColor, midnightColor, (t - 0.75) * 4.0);
    }

    return sunColor;
}

// ============================================================================
// MOON CALCULATION
// ============================================================================

vec3 getMoonDirection(float timeOfDay) {
    // Moon is roughly opposite to sun
    float dayProgress = timeOfDay / 24.0;
    float rotationAngle = (dayProgress + 0.5) * PI * 2.0 - PI * 0.5;
    float tilt = uSunAngle * PI / 180.0;
    float azimuthRad = uSunAzimuth * PI / 180.0;

    vec3 moonPos;
    moonPos.x = sin(rotationAngle) * cos(tilt);
    moonPos.y = cos(rotationAngle) * cos(tilt);
    moonPos.z = sin(tilt);

    float cosAz = cos(azimuthRad);
    float sinAz = sin(azimuthRad);
    vec3 rotatedMoon;
    rotatedMoon.x = moonPos.x * cosAz - moonPos.z * sinAz;
    rotatedMoon.y = moonPos.y;
    rotatedMoon.z = moonPos.x * sinAz + moonPos.z * cosAz;

    return normalize(rotatedMoon);
}

vec3 getMoonColor(float timeOfDay) {
    // Moon has a cooler, bluer tint
    float brightness = uMoonBrightness;
    return vec3(0.8, 0.85, 0.9) * brightness;
}

// ============================================================================
// STARS
// ============================================================================

vec3 renderStars(vec3 rayDir, float time) {
    if (!uStarsVisible) return vec3(0.0);

    vec3 starColor = vec3(0.0);

    // Convert ray direction to spherical coordinates
    vec2 screenPos = vec2(
        atan(rayDir.z, rayDir.x),
        asin(rayDir.y)
    ) * 1000.0;

    // Multiple star layers for depth
    for (int layer = 0; layer < 6; layer++) {
        vec2 gridSize = vec2(30.0 + float(layer) * 20.0) / uStarSize;
        vec2 gridPos = floor(screenPos / gridSize);

        float cellHash = hash_skybox(vec3(gridPos, float(layer)));

        // Star density check
        if (cellHash < 0.02 * uStarDensity) {
            vec2 starOffset = vec2(
                hash_skybox(cellHash * 123.456),
                hash_skybox(cellHash * 789.012)
            ) - 0.5;

            vec2 starPos = (gridPos + starOffset + 0.5) * gridSize;
            float dist = length(screenPos - starPos);

            // Star brightness with twinkling
            float brightness = 0.5 + hash_skybox(cellHash * 456.789) * 0.5;
            brightness *= (1.0 + sin(time * uTwinkleSpeed * 2.0 + cellHash * 100.0) * 0.3);

            float starSize = (0.5 + hash_skybox(cellHash * 234.567)) * uStarSize;

            if (dist < starSize) {
                float intensity = pow(1.0 - (dist / starSize), 2.0) * brightness;

                // Star color variation
                vec3 color = vec3(1.0);
                float colorType = hash_skybox(cellHash * 345.678);
                if (colorType < 0.3) color = vec3(1.0, 0.9, 0.8);      // Warm
                else if (colorType < 0.6) color = vec3(0.8, 0.9, 1.0); // Cool
                else if (colorType < 0.8) color = vec3(1.0, 0.8, 0.7); // Orange

                starColor += color * intensity;
            }
        }
    }

    // Milky Way band
    if (uMilkyWayIntensity > 0.0) {
        vec3 mwDir = rayDir;
        float mwAngle = PI * 0.3;
        mwDir.xz = mat2(cos(mwAngle), -sin(mwAngle), sin(mwAngle), cos(mwAngle)) * mwDir.xz;

        float mwDist = abs(mwDir.y);
        float mwBand = exp(-mwDist * mwDist * 8.0);
        float bandNoise = fbm_skybox(rayDir * 15.0, 0.5) * 0.3;
        mwBand *= (0.7 + bandNoise);

        // Extra stars in Milky Way region
        for (int mwLayer = 0; mwLayer < 10; mwLayer++) {
            vec2 mwGridSize = vec2(30.0 / uMilkyWayIntensity);
            vec2 mwGridPos = floor(screenPos / mwGridSize + vec2(float(mwLayer) * 456.78));
            float mwCellHash = hash_skybox(vec3(mwGridPos, float(mwLayer) + 100.0));

            if (mwCellHash < mwBand * uMilkyWayIntensity * 0.5) {
                vec2 mwOffset = vec2(hash_skybox(mwCellHash * 345.678), hash_skybox(mwCellHash * 456.789)) - 0.5;
                vec2 mwStarPos = (mwGridPos + mwOffset + 0.5) * mwGridSize;
                float mwStarDist = length(screenPos - mwStarPos);

                float mwSize = (0.3 + uStarSize * 0.05) * (0.5 + hash_skybox(mwCellHash * 567.890));
                float mwBrightness = 0.3 + hash_skybox(mwCellHash * 678.901) * 0.5;

                if (mwStarDist < mwSize) {
                    float mwIntensity = pow(1.0 - (mwStarDist / mwSize), 4.0) * mwBrightness;
                    vec3 mwColor = vec3(0.9, 0.95, 1.0);
                    starColor += mwColor * mwIntensity;
                }
            }
        }
    }

    return starColor * uStarDensity;
}

// ============================================================================
// NIGHT FACTOR (for blending stars)
// ============================================================================

float getNightFactor(float timeOfDay) {
    return 1.0 - smoothstep(5.0, 7.0, timeOfDay) * smoothstep(19.0, 17.0, timeOfDay);
}
`;

// Default configuration values
export const skyboxDefaults = {
    timeOfDay: 12.0,
    sunAngle: 23.5,
    sunAzimuth: 180.0,
    sunSize: 1.0,
    sunIntensity: 1.0,
    sunGlow: 0.3,
    moonVisible: true,
    moonSize: 1.0,
    moonBrightness: 0.6,
    moonPhase: 0.5,  // Full moon
    moonGlow: 0.15,
    starsVisible: true,
    starSize: 1.0,
    starDensity: 2.0,
    milkyWayIntensity: 0.7,
    twinkleSpeed: 1.0
};
