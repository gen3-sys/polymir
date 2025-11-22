/**
 * Volumetric Smoke/Fog Shader Module
 *
 * Advanced volumetric rendering system with three modes:
 * 1. CONTINUOUS - Fog throughout the entire volume
 * 2. GROUND FOG - Height-based fog with player interaction
 * 3. PARTICLE - Physics-based particle system with fog puffs
 *
 * Features:
 * - Ray-marched volumetric rendering
 * - Player interaction and disturbance
 * - Particle physics simulation
 * - Performance optimizations (LOD, quality scaling)
 * - Chromatic dispersion effects
 * - Configurable density, chaos, turbulence, curl
 *
 * Usage:
 *   Import this module and use the vertex/fragment shaders in your material.
 *   Use SmokeConfig to manage parameters.
 */

// Vertex shader for volumetric rendering
export const smokeVertexShader = `
varying vec3 vOrigin;
varying vec3 vDirection;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vOrigin = cameraPosition;
    vDirection = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// Fragment shader with full volumetric rendering
export const smokeFragmentShader = `
uniform float time;
uniform vec3 lightPos;
uniform float fogMode; // 0.0 = continuous, 0.5 = ground fog, 1.0 = particle
uniform vec3 playerPos; // Player position for interaction

// Configurable parameters
uniform float uChaos;              // Noise frequency & randomness (0-2)
uniform float uClumping;           // Density concentration (0-2)
uniform float uCurl;               // Swirling motion intensity (0-2)
uniform float uTurbulence;         // Flow disturbance scale (0-2)
uniform float uResponsiveness;     // Player interaction strength (0-2)
uniform float uDensity;            // Overall fog thickness (0-2)
uniform float uFlowSpeed;          // Animation speed (0-2)
uniform float uHeightFalloff;      // Vertical density fade (0-2)
uniform float uEdgeGlow;           // Boundary lighting intensity (0-1)
uniform float uLightIntensity;     // Brightness of illumination (0-2)
uniform float uChromaticDispersion; // Prism-like color separation (0-1)

// Performance parameters
uniform float uQuality;            // Overall render quality 0-1
uniform float uLodEnabled;         // Enable distance-based LOD
uniform float uLodDistance;        // Distance threshold for LOD
uniform float uAntiAliasing;       // Temporal anti-aliasing strength
uniform float uMaxDistance;        // Max render distance (culling)

// Particle data (for particle mode)
uniform vec3 uParticlePositions[100];
uniform int uParticleCount;
uniform float uParticleSize;

varying vec3 vOrigin;
varying vec3 vDirection;

// ============================================================================
// NOISE FUNCTIONS
// ============================================================================

// Hash function for noise
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D Noise
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
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

// Fractal Brownian Motion (FBM)
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for(int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// ============================================================================
// RAY INTERSECTION
// ============================================================================

// Box intersection for ray marching
vec2 boxIntersect(vec3 ro, vec3 rd, vec3 boxSize) {
    vec3 m = 1.0 / rd;
    vec3 n = m * ro;
    vec3 k = abs(m) * boxSize;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    float tN = max(max(t1.x, t1.y), t1.z);
    float tF = min(min(t2.x, t2.y), t2.z);
    if(tN > tF || tF < 0.0) return vec2(-1.0);
    return vec2(tN, tF);
}

// ============================================================================
// DENSITY CALCULATION (MODE-SPECIFIC)
// ============================================================================

float calculateDensity(vec3 pos, float time) {
    float density = 0.0;

    if(fogMode < 0.33) {
        // ========== CONTINUOUS MODE ==========
        // Fog throughout volume with multi-scale noise

        float noiseScale = 1.5 * (0.5 + uChaos * 1.5);
        vec3 q = pos * noiseScale + vec3(0.0, time * 0.15 * uFlowSpeed, 0.0);

        // Turbulence displacement
        float turbScale = 0.5 + uTurbulence * 1.5;
        vec3 turbOffset = vec3(
            fbm(pos * turbScale + vec3(time * 0.1, 0.0, 0.0)) * 0.3,
            fbm(pos * turbScale + vec3(0.0, time * 0.08, 0.0)) * 0.3,
            fbm(pos * turbScale + vec3(0.0, 0.0, time * 0.12)) * 0.3
        ) * uTurbulence;
        q += turbOffset;

        // Multi-octave noise for smooth variation
        density = fbm(q + vec3(time * 0.1 * uFlowSpeed, 0.0, time * 0.12 * uFlowSpeed));
        density += 0.5 * fbm(q * 2.0 + vec3(time * 0.2 * uFlowSpeed, time * 0.1 * uFlowSpeed, 0.0));
        density += 0.25 * fbm(q * 4.0 + vec3(0.0, time * 0.15 * uFlowSpeed, time * 0.18 * uFlowSpeed));

        // Clumping affects density threshold
        float clumpMin = 0.2 + (1.0 - uClumping) * 0.3;
        float clumpMax = 0.8 - (1.0 - uClumping) * 0.2;
        density = smoothstep(clumpMin, clumpMax, density * 0.7 + 0.15);

        // Apply overall density
        density *= 1.8 * (0.5 + uDensity * 1.5);

    } else if(fogMode < 0.67) {
        // ========== GROUND FOG MODE ==========
        // Height-based fog with player disturbance

        // Player disturbance
        vec3 toPlayer = pos - playerPos;
        float playerDist = length(toPlayer.xz);
        float disturbRadius = 0.8 - uResponsiveness * 0.4;
        float disturbStrength = 0.2 + uResponsiveness * 0.6;
        float disturbance = smoothstep(disturbRadius, disturbStrength, playerDist);
        vec3 pushDir = normalize(vec3(toPlayer.x, 0.0, toPlayer.z));

        // Displaced position
        vec3 q = pos;
        q.xz += pushDir.xz * disturbance * 0.4 * uResponsiveness;
        q.y += disturbance * 0.25 * uResponsiveness;

        // Turbulence
        float turbScale = 2.5 * (0.5 + uTurbulence);
        vec3 turbulence = vec3(
            fbm(pos * turbScale + vec3(time * 0.1 * uFlowSpeed, 0.0, time * 0.15 * uFlowSpeed)),
            fbm(pos * turbScale + vec3(time * 0.12 * uFlowSpeed, time * 0.08 * uFlowSpeed, 0.0)),
            fbm(pos * turbScale + vec3(0.0, time * 0.1 * uFlowSpeed, time * 0.13 * uFlowSpeed))
        ) * 0.2 * uTurbulence;
        q += turbulence;

        // Curl (swirling motion)
        float curlAmount = uCurl * 0.5;
        q.x += sin(q.y * 2.0 + time * 0.5 * uFlowSpeed) * curlAmount;
        q.z += cos(q.y * 2.0 + time * 0.6 * uFlowSpeed) * curlAmount;
        q.y += time * 0.05 * uFlowSpeed;

        // Multi-scale noise
        float chaosScale = 1.8 * (0.5 + uChaos);
        float n1 = fbm(q * chaosScale + vec3(time * 0.08 * uFlowSpeed, 0.0, time * 0.1 * uFlowSpeed));
        float n2 = fbm(q * chaosScale * 1.9 + vec3(time * 0.12 * uFlowSpeed, time * 0.15 * uFlowSpeed, 0.0));
        float n3 = fbm(q * chaosScale * 3.3 + vec3(0.0, time * 0.2 * uFlowSpeed, time * 0.18 * uFlowSpeed));

        density = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

        // Clumping
        float clumpMin = 0.25 + (1.0 - uClumping) * 0.2;
        float clumpMax = 0.75 - (1.0 - uClumping) * 0.15;
        density = smoothstep(clumpMin, clumpMax, density);

        // Height falloff
        float groundHeight = pos.y + 1.0;
        float falloffStrength = 2.0 * (0.5 + uHeightFalloff * 1.5);
        float heightFalloff = exp(-groundHeight * falloffStrength);
        float heightBlend = smoothstep(2.0 - uHeightFalloff, -0.2, groundHeight);
        heightFalloff = mix(heightFalloff, heightBlend, 0.5);
        density *= heightFalloff;

        // Apply disturbance reduction
        density *= (1.0 - disturbance * 0.6 * uResponsiveness);

        // Overall density
        density = pow(max(0.0, density), 0.8) * 2.5 * (0.5 + uDensity * 1.5);

    } else {
        // ========== PARTICLE MODE ==========
        // Physics-based particles with fog puffs

        float particleDensity = 0.0;
        float particleInfluence = uParticleSize * 0.3;
        bool nearParticle = false;

        // Spatial culling - check maximum 20 nearest particles
        int particlesChecked = 0;
        int maxParticlesToCheck = 20;

        for(int i = 0; i < 100; i++) {
            if(i >= uParticleCount) break;
            if(particlesChecked >= maxParticlesToCheck) break;

            vec3 toParticle = pos - uParticlePositions[i];
            float dist = length(toParticle);

            // Quick rejection
            if(dist > particleInfluence * 1.2) continue;

            particlesChecked++;

            // Smooth density falloff
            float influence = smoothstep(particleInfluence, 0.0, dist);

            if(influence > 0.01) {
                nearParticle = true;
                influence = pow(influence, 0.5);

                // Simplified noise
                vec3 noisePos = pos * 2.5 + uParticlePositions[i];
                float puffNoise = noise(noisePos);
                puffNoise = smoothstep(0.3, 0.7, puffNoise);

                particleDensity += influence * (0.8 + puffNoise * 0.2);
            }
        }

        if(!nearParticle) {
            density = 0.0;
        } else {
            // Ground cling
            float groundHeight = pos.y + 1.0;
            float heightFalloff = exp(-groundHeight * (2.0 + uHeightFalloff * 2.0));
            particleDensity *= heightFalloff;

            // Player disturbance
            vec3 toPlayer = pos - playerPos;
            float playerDist = length(toPlayer.xz);
            float disturbance = smoothstep(0.8, 0.2, playerDist) * uResponsiveness;
            particleDensity *= (1.0 - disturbance * 0.8);

            density = particleDensity * 3.0 * (0.5 + uDensity * 1.5);
        }
    }

    return density;
}

// ============================================================================
// MAIN RENDERING
// ============================================================================

void main() {
    vec3 rayDir = normalize(vDirection);
    vec3 rayOrigin = vOrigin;

    // Intersect with volume box
    vec2 bounds = boxIntersect(rayOrigin, rayDir, vec3(1.0));

    if(bounds.x < 0.0) {
        discard;
    }

    float tMin = max(bounds.x, 0.0);
    float tMax = bounds.y;

    // Distance-based culling
    float distanceToVolume = length(rayOrigin);
    float maxDist = 10.0 * uMaxDistance;
    if(distanceToVolume > maxDist) {
        discard;
    }

    // Distance fade for smooth culling
    float distanceFade = smoothstep(maxDist * 0.9, maxDist, distanceToVolume);

    // LOD - adjust quality based on distance
    float lodFactor = 1.0;
    if(uLodEnabled > 0.5) {
        float lodThreshold = 5.0 * uLodDistance;
        lodFactor = smoothstep(lodThreshold * 1.5, lodThreshold * 0.5, distanceToVolume);
        lodFactor = mix(0.3, 1.0, lodFactor);
    }

    // Temporal anti-aliasing dithering
    vec2 screenUV = gl_FragCoord.xy * 0.01;
    float temporalDither = fract(sin(dot(screenUV + time * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
    temporalDither = mix(0.5, temporalDither, uAntiAliasing);

    // Adaptive quality settings
    float qualityMult = uQuality * lodFactor;

    // Adjust step count and size based on quality
    int maxSteps = int(mix(30.0, 120.0, qualityMult));
    float stepSize = mix(0.06, 0.025, qualityMult);

    // Further optimize for particle mode
    if(fogMode > 0.67) {
        maxSteps = int(float(maxSteps) * 0.6);
        stepSize *= 1.3;
    }

    // Ray march with adaptive quality
    vec3 color = vec3(0.0);
    float transmittance = 1.0;
    float t = tMin + temporalDither * stepSize;

    for(int i = 0; i < 120; i++) {
        if(i >= maxSteps) break;
        if(t >= tMax || transmittance < 0.01) break;

        vec3 pos = rayOrigin + rayDir * t;
        float density = calculateDensity(pos, time);

        if(density > 0.01) {
            // Edge glow calculation
            vec3 d = abs(pos) - vec3(1.0);
            float distToEdge = max(d.x, max(d.y, d.z));
            float edgeGlow = smoothstep(0.1, -0.8, distToEdge);
            edgeGlow = pow(edgeGlow, 6.0) * uEdgeGlow;

            // Lighting
            vec3 toLight = lightPos - pos;
            float lightDist = length(toLight);
            float lightAtten = (4.0 * uLightIntensity) / (1.0 + lightDist * lightDist);

            // Smoke color
            vec3 smokeColor = vec3(0.9, 0.92, 0.94) * lightAtten;
            smokeColor += vec3(0.08, 0.15, 0.3) * edgeGlow * 0.5;

            // Accumulation
            float absorption = exp(-density * stepSize * 5.0);
            color += smokeColor * density * stepSize * transmittance * 1.5;
            transmittance *= absorption;
        }

        t += stepSize;
    }

    // Chromatic dispersion effect
    vec3 finalColor = color;
    if(uChromaticDispersion > 0.01) {
        vec3 viewDir = normalize(vDirection);
        float dispersionAmount = uChromaticDispersion * 0.02;

        vec2 screenUV = gl_FragCoord.xy / vec2(1920.0, 1080.0);
        vec2 centerOffset = (screenUV - 0.5) * dispersionAmount;
        float edgeDispersion = length(centerOffset) * 2.0;

        float redShift = 1.0 + edgeDispersion * 0.015;
        float blueShift = 1.0 - edgeDispersion * 0.015;

        finalColor.r *= redShift;
        finalColor.b *= blueShift;
        finalColor.g = mix(finalColor.g, (finalColor.r + finalColor.b) * 0.5, 0.3);
    }

    // Final alpha with distance fade
    float finalAlpha = 1.0 - transmittance;
    finalAlpha = smoothstep(0.0, 1.0, finalAlpha);
    finalAlpha *= (1.0 - distanceFade);

    // Temporal anti-aliasing on color
    finalColor = mix(finalColor * 0.95, finalColor, uAntiAliasing);

    gl_FragColor = vec4(finalColor, clamp(finalAlpha, 0.0, 1.0));
}
`;

// Default configuration values
export const smokeDefaults = {
    // Mode
    fogMode: 'continuous', // 'continuous', 'ground', 'particle'

    // Visual parameters
    chaos: 0.5,
    clumping: 0.5,
    curl: 0.5,
    turbulence: 0.5,
    responsiveness: 0.5,
    density: 0.5,
    flowSpeed: 0.5,
    heightFalloff: 0.5,
    edgeGlow: 0.3,
    lightIntensity: 0.5,
    chromaticDispersion: 0.0,

    // Particle physics (particle mode)
    particleCount: 35,
    gravity: 0.5,
    settling: 0.5,
    repulsion: 0.5,
    windStrength: 0.5,
    particleSize: 0.5,
    groundCling: 0.8,

    // Performance
    quality: 0.7,
    lodEnabled: true,
    lodDistance: 0.5,
    antiAliasing: 0.7,
    maxDistance: 0.8
};
