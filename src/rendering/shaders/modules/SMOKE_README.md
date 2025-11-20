# Volumetric Smoke/Fog System

Complete volumetric rendering system for smoke and fog effects, extracted from the React volumetric smoke demo and modularized for the Polymir engine.

## Overview

The smoke system provides three distinct rendering modes, extensive configurability, and performance optimizations for real-time volumetric effects.

### Three Rendering Modes

1. **CONTINUOUS** - Fog fills the entire volume
   - Use for: Thick fog, volumetric clouds, smoke-filled rooms
   - Performance: Medium
   - Player interaction: No

2. **GROUND FOG** - Height-based fog with player disturbance
   - Use for: Ground fog, mist, fog that reacts to movement
   - Performance: Medium
   - Player interaction: Yes (pushes fog away)

3. **PARTICLE** - Physics-based particle system
   - Use for: Smoke puffs, dynamic fog, realistic smoke behavior
   - Performance: Lower (physics simulation)
   - Player interaction: Yes (particles react to player)

## Modules

### 1. `smoke.glsl.js`
GLSL shader code for volumetric rendering.

**Exports:**
- `smokeVertexShader` - Vertex shader string
- `smokeFragmentShader` - Fragment shader string (with all three modes)
- `smokeDefaults` - Default configuration values

**Features:**
- Ray-marched volumetric rendering
- Multi-scale noise generation (FBM)
- Three rendering modes in one shader
- Performance optimizations (LOD, quality scaling)
- Chromatic dispersion effect

### 2. `smokeParticles.js`
Particle physics simulation system.

**Exports:**
- `SmokeParticle` class - Individual particle
- `SmokeParticleSystem` class - Particle manager
- `particleDefaults` - Default physics parameters

**Features:**
- Gravity simulation
- Air resistance/settling
- Particle-particle repulsion
- Wind/turbulence forces
- Ground collision and cling behavior
- Player interaction (pushes particles)
- Box boundary constraints

### 3. `smokeConfig.js`
Configuration management API.

**Exports:**
- `SmokeConfig` class - Configuration manager
- `SMOKE_PRESETS` - Preset names
- `SMOKE_MODES` - Mode names

**Methods:**
- `loadPreset(name)` - Load preset configuration
- `applyUniforms(gl, uniforms, time)` - Apply config to shader
- `getPhysicsParams()` - Get physics parameters
- `toJSON()` / `fromJSON(json)` - Serialization
- `exportToFile(filename)` - Export configuration
- `importFromFile(file)` - Import configuration

### 4. `smokeSystem.js`
Main entry point that re-exports everything.

**Exports:**
- All exports from above modules
- `createSmokeUniforms()` - Create Three.js uniforms object
- `getSmokeUniforms(gl, program)` - Get WebGL uniform locations
- `createSmokeMesh(options)` - Helper to create smoke mesh

## Quick Start

### Basic Usage (Three.js)

```javascript
import * as THREE from 'three';
import {
    smokeVertexShader,
    smokeFragmentShader,
    SmokeConfig,
    createSmokeUniforms
} from './rendering/shaders/modules/smokeSystem.js';

// Create configuration
const smokeConfig = new SmokeConfig();
smokeConfig.loadPreset('mystical');

// Create smoke material
const smokeMaterial = new THREE.ShaderMaterial({
    vertexShader: smokeVertexShader,
    fragmentShader: smokeFragmentShader,
    uniforms: createSmokeUniforms(),
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false
});

// Create smoke volume
const smokeGeometry = new THREE.BoxGeometry(2, 2, 2);
const smokeMesh = new THREE.Mesh(smokeGeometry, smokeMaterial);
scene.add(smokeMesh);

// Render loop
function animate(time) {
    const deltaTime = clock.getDelta();

    // Apply configuration to uniforms
    smokeConfig.applyUniforms(null, smokeMaterial.uniforms, time * 0.001);

    // Set player and light positions
    smokeMaterial.uniforms.playerPos.value.copy(player.position);
    smokeMaterial.uniforms.lightPos.value.copy(light.position);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
```

### With Particle Physics

```javascript
import { SmokeParticleSystem } from './rendering/shaders/modules/smokeSystem.js';

// Create configuration in particle mode
smokeConfig.fogMode = 'particle';

// Create particle system
const particleSystem = new SmokeParticleSystem(35);

// Render loop
function animate(time) {
    const deltaTime = clock.getDelta();

    // Update particle physics
    particleSystem.update(
        deltaTime,
        smokeConfig.getPhysicsParams(),
        player.position
    );

    // Sync particle positions to shader
    const positions = particleSystem.getPositions();
    smokeMaterial.uniforms.uParticlePositions.value = positions;
    smokeMaterial.uniforms.uParticleCount.value = particleSystem.count;

    // Apply config
    smokeConfig.applyUniforms(null, smokeMaterial.uniforms, time * 0.001);

    renderer.render(scene, camera);
}
```

## Configuration Parameters

### Visual Parameters (0-2 range, except where noted)

| Parameter | Range | Description | Modes |
|-----------|-------|-------------|-------|
| `chaos` | 0-2 | Noise frequency & randomness | Continuous, Ground |
| `clumping` | 0-2 | Density concentration | Continuous, Ground |
| `curl` | 0-2 | Swirling motion intensity | Ground |
| `turbulence` | 0-2 | Flow disturbance scale | Continuous, Ground |
| `responsiveness` | 0-2 | Player interaction strength | Ground, Particle |
| `density` | 0-2 | Overall fog thickness | All |
| `flowSpeed` | 0-2 | Animation speed | All |
| `heightFalloff` | 0-2 | Vertical density fade | Ground, Particle |
| `edgeGlow` | 0-1 | Boundary lighting intensity | All |
| `lightIntensity` | 0-2 | Brightness of illumination | All |
| `chromaticDispersion` | 0-1 | Prism-like color separation | All |

### Particle Physics (Particle mode only)

| Parameter | Range | Description |
|-----------|-------|-------------|
| `particleCount` | 10-100 | Number of particles |
| `gravity` | 0-2 | Downward force strength |
| `settling` | 0-1 | Drag/dampening |
| `repulsion` | 0-2 | Particle-particle repulsion |
| `windStrength` | 0-2 | Turbulent wind force |
| `particleSize` | 0-2 | Influence radius |
| `groundCling` | 0-1 | How much particles stick to ground |

### Performance (0-1 range)

| Parameter | Range | Description |
|-----------|-------|-------------|
| `quality` | 0-1 | Overall render quality (affects step count) |
| `lodEnabled` | bool | Enable distance-based LOD |
| `lodDistance` | 0-1 | Distance threshold for LOD |
| `antiAliasing` | 0-1 | Temporal anti-aliasing strength |
| `maxDistance` | 0-1 | Max render distance (culling) |

## Presets

### default
Balanced settings for general use.
- Good all-around performance
- Moderate density and detail
- Quality: 0.7

### heavy
Dense, slow-moving fog.
- High density (1.5)
- Strong ground cling
- Lower turbulence
- Quality: 0.6

### wispy
Light, fast-moving smoke.
- Low density (0.3)
- High turbulence and curl
- Fast flow speed
- Quality: 0.8

### mystical
Colorful, swirling fog with effects.
- High curl (1.5)
- Strong edge glow (0.8)
- Chromatic dispersion (0.6)
- Quality: 0.75

### performance
Optimized for maximum FPS.
- Low quality (0.4)
- Reduced particle count (25)
- No chromatic dispersion
- Aggressive LOD (0.7)

## Performance Guide

### Target Frame Rates

| Quality Setting | Expected FPS | Use Case |
|----------------|--------------|----------|
| 0.3-0.4 | 60+ FPS | Voxel games, fast action |
| 0.5-0.6 | 45-60 FPS | General gameplay |
| 0.7-0.8 | 30-45 FPS | Cinematic scenes |
| 0.9-1.0 | 15-30 FPS | Screenshots, slow scenes |

### Optimization Tips

1. **Particle Mode Performance**
   - Keep particle count 20-35 (default 35 is optimized)
   - Repulsion is O(n²) - disabled automatically above 50 particles
   - Consider hiding visual markers in production

2. **LOD (Level of Detail)**
   - Enable for outdoor/large scenes
   - Lower lodDistance = more aggressive culling
   - Automatically reduces quality at distance

3. **Quality Scaling**
   - Quality 0.4: ~30 steps, large step size
   - Quality 0.7: ~84 steps, medium step size
   - Quality 1.0: ~120 steps, small step size

4. **Expensive Effects**
   - Chromatic dispersion: ~5-10% performance cost
   - Particle physics: ~10-20% cost (depends on count)
   - Multi-scale noise: Built-in, can't disable

5. **Distance Culling**
   - maxDistance culls entire volume beyond threshold
   - Smooth fade prevents popping
   - Lower for indoor scenes (0.5-0.6)

## Integration with Voxel Engine

### Example: Fog in Caves

```javascript
// Create fog volumes for cave sections
function createCaveFog(position, size) {
    const config = new SmokeConfig();
    config.loadPreset('mystical');
    config.fogMode = 'ground';
    config.density = 0.8;
    config.heightFalloff = 1.2;

    const geometry = new THREE.BoxGeometry(...size);
    const material = new THREE.ShaderMaterial({
        vertexShader: smokeVertexShader,
        fragmentShader: smokeFragmentShader,
        uniforms: createSmokeUniforms(),
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.userData.smokeConfig = config;

    return mesh;
}
```

### Example: Chimney Smoke

```javascript
// Particle mode for chimney smoke
const chimneySmoke = createSmokeMesh({
    size: [0.5, 2.0, 0.5],
    preset: 'wispy',
    mode: 'particle'
});

// Position above chimney
chimneySmoke.position.set(houseX, houseY + 3, houseZ);

// Update particles to rise
const particleSystem = new SmokeParticleSystem(20);
particleSystem.update(deltaTime, {
    gravity: -0.2, // Negative gravity to make smoke rise!
    windStrength: 0.8,
    settling: 0.3,
    repulsion: 0.6,
    ...smokeConfig.getPhysicsParams()
}, playerPosition);
```

## Advanced Features

### Chromatic Dispersion

Simulates prism-like color separation for mystical/magical effects.

```javascript
config.chromaticDispersion = 0.5; // 0-1
// Creates red/blue color fringing at edges
// Expensive - use sparingly
```

### Edge Glow

Adds subtle blue tint to volume boundaries.

```javascript
config.edgeGlow = 0.8; // 0-1
// Creates soft boundary lighting
// Good for mystical/magical fog
```

### Player Interaction

Ground and Particle modes support player disturbance.

```javascript
// Ground mode: fog pushes away from player
config.responsiveness = 1.5; // 0-2, higher = stronger

// Particle mode: particles pushed by player movement
particleSystem.update(deltaTime, params, playerPosition);
```

## Troubleshooting

### Performance Issues

1. Lower quality setting
2. Enable LOD
3. Reduce maxDistance
4. Use 'performance' preset
5. Reduce particle count (particle mode)
6. Disable chromatic dispersion

### Visual Issues

**Fog too thick:** Lower `density` parameter
**Fog too thin:** Increase `density` and `clumping`
**Not animating:** Check `flowSpeed` > 0
**Particles falling through floor:** Increase `groundCling`
**Jittery particles:** Lower `windStrength` and `turbulence`

### Shader Compilation Errors

- Ensure WebGL2 support
- Check uniform array sizes (max 100 particles)
- Verify Three.js version compatibility

## Export/Import Configurations

```javascript
// Export current settings
config.exportToFile('my-smoke-config.json');

// Import settings
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.onchange = async (e) => {
    await config.importFromFile(e.target.files[0]);
};
fileInput.click();

// Or manually
const json = config.toJSON();
localStorage.setItem('smokeConfig', JSON.stringify(json));

// Load later
const loaded = JSON.parse(localStorage.getItem('smokeConfig'));
config.fromJSON(loaded);
```

## Source Files

Original implementation: `shaders/volumetric_smoke_v2.jsx`

Extracted modules in `src/rendering/shaders/modules/`:
- `smoke.glsl.js` - Shader code
- `smokeParticles.js` - Physics simulation
- `smokeConfig.js` - Configuration API
- `smokeSystem.js` - Main entry point
- `SMOKE_README.md` - This documentation

## Next Steps

See [ATMOSPHERIC_SYSTEM.md](./ATMOSPHERIC_SYSTEM.md) for integrating smoke with skybox, ocean, and cloud systems into a unified atmospheric rendering pipeline.
