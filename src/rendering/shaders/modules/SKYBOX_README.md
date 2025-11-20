# Skybox System Modules

This directory contains modular shader components for rendering a complete environmental skybox system, extracted from the advanced skybox demonstrations in `shaders/skybox/`.

## Overview

The skybox system provides:
- **Dynamic day/night cycles** with smooth sky color transitions
- **Celestial bodies**: Realistic sun and moon positioning with phases
- **Star field**: Procedural stars with Milky Way galaxy band and twinkling
- **Ocean rendering**: Multi-scale wave simulation with physically-based water shading
- **Cloud integration**: Ocean waves respond to cloud shadows for realistic wind effects

## Modules

### 1. `skybox.glsl.js`
GLSL shader functions for rendering the sky, sun, moon, and stars.

**Exports:**
- `skyboxShaderModule` - GLSL code string to include in fragment shaders
- `skyboxDefaults` - Default configuration values

**GLSL Functions:**
- `getSkyColor(rayDir, timeOfDay)` - Returns sky gradient color
- `getSunDirection(timeOfDay)` - Calculates sun position
- `getSunColor(timeOfDay)` - Returns sun color based on time
- `getMoonDirection(timeOfDay)` - Calculates moon position
- `getMoonColor(timeOfDay)` - Returns moon color
- `renderStars(rayDir, time)` - Renders star field with Milky Way
- `getNightFactor(timeOfDay)` - Returns 0-1 for blending stars

### 2. `ocean.glsl.js`
GLSL shader functions for rendering realistic ocean water.

**Exports:**
- `oceanShaderModule` - GLSL code string to include in fragment shaders
- `oceanDefaults` - Default ocean configuration values

**GLSL Functions:**
- `oceanRender(rayOrigin, rayDir, time, sunDir, sunColor, moonDir, moonColor)` - Main ocean rendering function
- `getWaveHeight(oceanPos, time)` - Calculates wave displacement
- `getWaveNormal(oceanPos, time)` - Calculates wave surface normal

**Features:**
- Multi-octave noise-based waves (swells, medium, small, detail)
- Fresnel reflections
- Subsurface scattering
- Dynamic foam on wave crests
- Sun/moon glints
- Cloud reflections (when cloud module is available)
- Cloud shadow interaction (waves smaller under cloud cover)

### 3. `skyboxConfig.js`
JavaScript API for managing skybox configuration and uniforms.

**Exports:**
- `SkyboxConfig` class - Configuration manager
- `PRESETS` - Preset environment names

**SkyboxConfig Methods:**
- `constructor()` - Creates new config with default values
- `applyUniforms(gl, uniforms, time)` - Applies config to WebGL uniforms
- `updateTime(deltaTime)` - Advances time of day
- `loadPreset(presetName)` - Loads preset environment
- `toJSON()` / `fromJSON(json)` - Serialization

### 4. `skyboxSystem.js`
Main entry point that re-exports everything and provides documentation.

**Exports:**
- All exports from the above modules
- `getSkyboxUniforms(gl, program)` - Helper to get all uniform locations
- Comprehensive usage documentation

## Quick Start

### Basic Usage

```javascript
import {
    skyboxShaderModule,
    oceanShaderModule,
    SkyboxConfig,
    getSkyboxUniforms
} from './rendering/shaders/modules/skyboxSystem.js';

// 1. Create configuration
const config = new SkyboxConfig();
config.loadPreset('ocean');

// 2. Build fragment shader
const fragmentShader = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uCameraPos;
uniform mat3 uCameraRot;

${skyboxShaderModule}
${oceanShaderModule}

out vec4 fragColor;

void main() {
    vec2 uv = (gl_FragCoord.xy / uResolution - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    vec3 rayDir = normalize(uCameraRot * vec3(uv, -1.0));

    vec3 sunDir = getSunDirection(uTimeOfDay);
    vec3 sunColor = getSunColor(uTimeOfDay);
    vec3 moonDir = getMoonDirection(uTimeOfDay);
    vec3 moonColor = getMoonColor(uTimeOfDay);

    vec3 color = getSkyColor(rayDir, uTimeOfDay);

    float nightFactor = getNightFactor(uTimeOfDay);
    color += renderStars(rayDir, uTime) * nightFactor;

    vec3 ocean = oceanRender(uCameraPos, rayDir, uTime, sunDir, sunColor, moonDir, moonColor);
    if (length(ocean) > 0.01) {
        color = mix(color, ocean, 0.8);
    }

    float sunDot = dot(rayDir, sunDir);
    if (sunDot > 0.995) {
        color += sunColor * smoothstep(0.995, 0.9995, sunDot) * 15.0;
    }

    color += sunColor * pow(max(0.0, sunDot), 8.0) * uSunGlow;

    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    fragColor = vec4(color, 1.0);
}
`;

// 3. Compile and link program (standard WebGL)
// ...

// 4. Get uniform locations
const uniforms = getSkyboxUniforms(gl, program);

// 5. Render loop
function render(time) {
    const deltaTime = time - lastTime;

    config.updateTime(deltaTime);
    config.applyUniforms(gl, uniforms, time);

    gl.uniform1f(uniforms.uTime, time);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    gl.uniform3fv(uniforms.uCameraPos, cameraPosition);
    gl.uniformMatrix3fv(uniforms.uCameraRot, false, cameraRotation);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
}
```

### Integration with Clouds

To enable cloud-ocean interaction (cloud shadows affect waves):

```javascript
import { cloudShaderModule } from './rendering/shaders/modules/clouds.glsl.js';

const fragmentShader = `#version 300 es
precision highp float;

${skyboxShaderModule}
${cloudShaderModule}

// Define this to enable cloud-ocean interaction
#define HAS_CLOUD_DENSITY

${oceanShaderModule}

// ... rest of shader
`;
```

When `HAS_CLOUD_DENSITY` is defined, the ocean module will:
1. Sample cloud density above water surface
2. Reduce wave height under cloud shadows
3. Dim water reflections in shadowed areas
4. Create choppy waves at cloud edges

## Available Presets

```javascript
config.loadPreset('ocean');  // Mid-day ocean, moderate waves
config.loadPreset('lake');   // Calm morning lake
config.loadPreset('storm');  // Stormy with large waves
config.loadPreset('sunset'); // Golden hour
config.loadPreset('night');  // Nighttime with full moon
config.loadPreset('dawn');   // Early morning
```

## Configuration Parameters

### Time & Celestial
- `timeOfDay` (0-24): Current hour
- `timeSpeed` (0-2): Time advancement speed
- `sunAngle` (0-90°): Axial tilt
- `sunAzimuth` (0-360°): Sun rotation
- `sunSize`, `sunIntensity`, `sunGlow`: Sun appearance
- `moonVisible`, `moonSize`, `moonBrightness`, `moonPhase`, `moonGlow`: Moon settings

### Stars
- `starsVisible` (bool): Toggle stars
- `starSize`, `starDensity`: Star appearance
- `milkyWayIntensity`: Milky Way brightness
- `twinkleSpeed`: Animation speed

### Ocean Waves (Multi-Scale)
- `waveAmplitude` (0-2): Overall wave height
- `waveSpeed` (0-3): Animation speed
- `swellScale`/`swellAmount`: Large ocean swells
- `mediumScale`/`mediumAmount`: Medium waves
- `smallScale`/`smallAmount`: Small ripples
- `detailScale`/`detailAmount`: Fine details

### Water Appearance
- `foamThreshold`, `foamDetail`: Wave crest foam
- `fresnelStrength`: Reflection intensity
- `subsurfaceScatter`: Light penetration
- `waterClarity`: Transparency
- `sunReflectionSize`, `moonReflectionSize`: Specular highlight sizes
- `cloudReflections` (bool): Enable cloud reflections

### Atmosphere
- `windSpeed` (0-2): Wind strength
- `turbulence` (0-1): Atmospheric turbulence

## Source Files

These modules were extracted and refactored from:
- `shaders/skybox/combined-skybox-final (1).html` - Basic skybox with stars and ocean
- `shaders/skybox/enhanced-skybox-complete.html` - Advanced version with moon phases and enhanced ocean

Both source files remain available for reference and testing.

## Performance Notes

- Star rendering has 6+10 layers, consider reducing for lower-end devices
- Ocean wave calculation uses 4 octaves of noise
- Cloud-ocean interaction requires additional samples (8 per pixel)
- Use `uStarsVisible` to disable stars during daytime for performance
- Adjust `MAX_DIST` constant to control ocean rendering distance

## Extending the System

To add new features:

1. **Custom wave patterns**: Modify `getWaveHeight()` in ocean module
2. **Different sky colors**: Adjust color values in `getSkyColor()`
3. **Aurora/atmospheric effects**: Add new functions to skybox module
4. **Underwater rendering**: Check `rayOrigin.y < 0` in ocean function
5. **Custom presets**: Add cases to `loadPreset()` in config class

## Example: Collision Test Integration

The `collision_test.html` already uses the cloud module. To add skybox:

```javascript
// In collision_test.html
import { skyboxShaderModule, oceanShaderModule, SkyboxConfig } from './src/rendering/shaders/modules/skyboxSystem.js';

const skyboxConfig = new SkyboxConfig();
skyboxConfig.loadPreset('ocean');

// Integrate into existing rendering...
```

See `skyboxSystem.js` for complete integration examples.
