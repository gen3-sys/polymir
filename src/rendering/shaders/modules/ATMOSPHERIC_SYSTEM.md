# Unified Atmospheric System

Complete environmental rendering system for the Polymir engine, combining skybox, ocean, clouds, and volumetric smoke/fog into a single cohesive API.

## Overview

The Atmospheric System unifies four distinct rendering subsystems:

1. **Skybox** - Sky gradients, sun, moon, and stars
2. **Ocean** - Multi-scale wave rendering with reflections
3. **Clouds** - Volumetric cloud layers
4. **Smoke/Fog** - Volumetric smoke with particle physics

Each subsystem can be enabled/disabled independently and configured through a unified interface.

## Quick Start

### Basic Setup

```javascript
import { AtmosphericSystem, ATMOSPHERIC_PRESETS } from './modules/atmosphericSystem.js';
import * as THREE from 'three';

// Create atmospheric system with desired subsystems
const atmosphere = new AtmosphericSystem({
    skybox: true,
    ocean: true,
    clouds: true,
    smoke: false  // Disable smoke for better performance
});

// Load a preset atmosphere
atmosphere.loadPreset(ATMOSPHERIC_PRESETS.SUNNY_OCEAN);

// Create materials for rendering (see detailed examples below)
const skyboxMaterial = createSkyboxMaterial();
const smokeMaterial = createSmokeMaterial();

// In render loop
function animate(time) {
    const deltaTime = clock.getDelta();

    // Update atmospheric systems
    atmosphere.update(deltaTime);

    // Set player position for interactive effects
    atmosphere.setPlayerPosition(player.position);

    // Apply all uniforms to materials
    atmosphere.applyToMaterials({
        skyboxMaterial: skyboxMaterial,
        smokeMaterial: smokeMaterial
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
```

### Using Helper Function

```javascript
import { createAtmosphericSetup } from './modules/atmosphericSystem.js';

// Create complete setup with preset
const { atmosphere, materials } = createAtmosphericSetup({
    preset: 'stormy_ocean',
    enableSkybox: true,
    enableOcean: true,
    enableClouds: true,
    enableSmoke: true
});

// Add to scene
const skyboxGeometry = new THREE.SphereGeometry(1000, 32, 32);
const skyboxMesh = new THREE.Mesh(skyboxGeometry, materials.skyboxMaterial);
scene.add(skyboxMesh);

if (materials.smokeMaterial) {
    const smokeGeometry = new THREE.BoxGeometry(10, 5, 10);
    const smokeMesh = new THREE.Mesh(smokeGeometry, materials.smokeMaterial);
    smokeMesh.position.set(0, 2.5, 0);
    scene.add(smokeMesh);
}
```

## Atmospheric Presets

### SUNNY_OCEAN
Clear sunny day with calm ocean.
- Time: Noon (12:00)
- Clouds: Light coverage (30%)
- Smoke: Minimal atmospheric haze
- Use case: Default outdoor scenes

### DAWN_LAKE
Calm lake at dawn with ground fog.
- Time: Dawn (6:00)
- Clouds: Medium coverage (50%)
- Smoke: Wispy ground fog
- Use case: Early morning scenes, peaceful atmospheres

### STORMY_OCEAN
Dramatic stormy ocean with heavy fog.
- Time: Afternoon (14:00)
- Clouds: Heavy coverage (90%)
- Smoke: Heavy ground fog
- Use case: Intense weather, dramatic scenes

### MYSTICAL_NIGHT
Night scene with mystical particle fog.
- Time: Midnight (0:00)
- Clouds: Medium coverage (60%)
- Smoke: Particle-based mystical fog with chromatic dispersion
- Use case: Magical scenes, caves, mysterious environments

### SUNSET
Sunset over calm water.
- Time: Evening (18:00)
- Clouds: Dramatic coverage (70%)
- Smoke: Wispy atmospheric haze
- Use case: Cinematic scenes, transitions

### PERFORMANCE
Performance-optimized clear day.
- Time: Noon (12:00)
- Clouds: Light coverage (40%)
- Smoke: Minimal low-quality fog
- Use case: Voxel gameplay, high frame rate requirements

### UNDERGROUND
Cave/underground environment.
- Time: Night (darkness)
- Clouds: Disabled
- Smoke: Dense particle smoke
- Use case: Caves, dungeons, underground areas

### FOGGY_MORNING
Foggy morning with heavy ground fog.
- Time: Morning (7:00)
- Clouds: Heavy coverage (80%)
- Smoke: Very dense ground fog
- Use case: Foggy landscapes, mystery scenes

## API Reference

### AtmosphericSystem Class

#### Constructor

```javascript
const atmosphere = new AtmosphericSystem(options)
```

**Options:**
- `skybox` (boolean, default: true) - Enable skybox rendering
- `ocean` (boolean, default: true) - Enable ocean rendering
- `clouds` (boolean, default: true) - Enable cloud rendering
- `smoke` (boolean, default: false) - Enable smoke/fog rendering

#### Methods

##### update(deltaTime)
Update all enabled systems for current frame.

```javascript
atmosphere.update(deltaTime); // deltaTime in seconds
```

##### applyToMaterials(materials)
Apply all system uniforms to their respective materials.

```javascript
atmosphere.applyToMaterials({
    skyboxMaterial: skyboxMat,
    oceanMaterial: oceanMat,  // Optional, if separate
    cloudMaterial: cloudMat,
    smokeMaterial: smokeMat
});
```

##### setPlayerPosition(position)
Set player position for interactive effects (fog disturbance, etc).

```javascript
atmosphere.setPlayerPosition(new THREE.Vector3(x, y, z));
```

##### setLightPosition(position)
Set light position for all systems.

```javascript
atmosphere.setLightPosition(sunPosition);
```

##### loadPreset(presetName)
Load a preset atmospheric configuration.

```javascript
atmosphere.loadPreset('stormy_ocean');
// Or use constant
atmosphere.loadPreset(ATMOSPHERIC_PRESETS.STORMY_OCEAN);
```

##### setSystemEnabled(system, enabled)
Enable/disable specific atmospheric systems at runtime.

```javascript
atmosphere.setSystemEnabled('smoke', true);
atmosphere.setSystemEnabled('clouds', false);
```

**System names:** `'skybox'`, `'ocean'`, `'clouds'`, `'smoke'`

##### getSystemConfig(system)
Get configuration object for a specific system.

```javascript
const smokeConfig = atmosphere.getSystemConfig('smoke');
smokeConfig.density = 1.5;
smokeConfig.chromaticDispersion = 0.8;
```

Returns configuration object:
- `'skybox'` or `'ocean'` → `SkyboxConfig` instance
- `'smoke'` → `SmokeConfig` instance
- `'clouds'` → Cloud config object

##### toJSON() / fromJSON(json)
Serialize/deserialize entire atmospheric configuration.

```javascript
// Save configuration
const config = atmosphere.toJSON();
localStorage.setItem('atmosphere', JSON.stringify(config));

// Load configuration
const saved = JSON.parse(localStorage.getItem('atmosphere'));
atmosphere.fromJSON(saved);
```

##### exportToFile(filename) / importFromFile(file)
Export/import configuration to/from JSON file.

```javascript
// Export
atmosphere.exportToFile('my-atmosphere.json');

// Import
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.onchange = async (e) => {
    await atmosphere.importFromFile(e.target.files[0]);
};
fileInput.click();
```

##### reset()
Reset all systems to default configuration.

```javascript
atmosphere.reset();
```

## Integration Examples

### Example 1: Voxel Game with Dynamic Weather

```javascript
import { AtmosphericSystem, ATMOSPHERIC_PRESETS } from './modules/atmosphericSystem.js';

class WeatherSystem {
    constructor(scene) {
        this.atmosphere = new AtmosphericSystem({
            skybox: true,
            ocean: false,  // No ocean in voxel world
            clouds: true,
            smoke: true    // Ground fog
        });

        this.weatherState = 'clear';
        this.transitionProgress = 0;

        // Create materials
        this.setupMaterials(scene);
    }

    setupMaterials(scene) {
        // Skybox sphere
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);
        const skyMat = createSkyboxMaterial();
        this.skyboxMesh = new THREE.Mesh(skyGeo, skyMat);
        scene.add(this.skyboxMesh);

        // Ground fog volume
        const fogGeo = new THREE.BoxGeometry(100, 20, 100);
        const fogMat = createSmokeMaterial();
        this.fogMesh = new THREE.Mesh(fogGeo, fogMat);
        this.fogMesh.position.y = 10;
        scene.add(this.fogMesh);
    }

    changeWeather(newWeather) {
        const presets = {
            'clear': ATMOSPHERIC_PRESETS.SUNNY_OCEAN,
            'foggy': ATMOSPHERIC_PRESETS.FOGGY_MORNING,
            'stormy': ATMOSPHERIC_PRESETS.STORMY_OCEAN,
            'night': ATMOSPHERIC_PRESETS.MYSTICAL_NIGHT
        };

        if (presets[newWeather]) {
            this.atmosphere.loadPreset(presets[newWeather]);
            this.weatherState = newWeather;
        }
    }

    update(deltaTime, playerPosition) {
        this.atmosphere.update(deltaTime);
        this.atmosphere.setPlayerPosition(playerPosition);

        this.atmosphere.applyToMaterials({
            skyboxMaterial: this.skyboxMesh.material,
            smokeMaterial: this.fogMesh.material
        });
    }
}

// Usage
const weatherSystem = new WeatherSystem(scene);

// Change weather dynamically
weatherSystem.changeWeather('foggy');

// In render loop
weatherSystem.update(deltaTime, player.position);
```

### Example 2: Ocean Scene with Day/Night Cycle

```javascript
import { AtmosphericSystem } from './modules/atmosphericSystem.js';

class OceanScene {
    constructor(scene) {
        this.atmosphere = new AtmosphericSystem({
            skybox: true,
            ocean: true,
            clouds: true,
            smoke: false
        });

        this.atmosphere.loadPreset('sunny_ocean');

        // Create ocean and sky meshes
        this.setupScene(scene);

        // Start day/night cycle
        this.cycleSpeed = 0.1; // Hours per real second
    }

    setupScene(scene) {
        // Sky dome
        const skyGeo = new THREE.SphereGeometry(1000, 64, 64);
        const skyMat = createCombinedSkyOceanMaterial();
        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        scene.add(this.skyMesh);
    }

    update(deltaTime) {
        // Advance time of day
        const skyboxConfig = this.atmosphere.getSystemConfig('skybox');
        skyboxConfig.timeOfDay += this.cycleSpeed * deltaTime;
        if (skyboxConfig.timeOfDay >= 24) {
            skyboxConfig.timeOfDay -= 24;
        }

        // Update sun position for ocean lighting
        const sunDir = new THREE.Vector3(
            Math.cos(skyboxConfig.timeOfDay * Math.PI / 12),
            Math.sin(skyboxConfig.timeOfDay * Math.PI / 12),
            0
        );
        this.atmosphere.setLightPosition(sunDir);

        // Update atmosphere
        this.atmosphere.update(deltaTime);
        this.atmosphere.applyToMaterials({
            skyboxMaterial: this.skyMesh.material
        });
    }
}
```

### Example 3: Cave System with Mystical Fog

```javascript
import { AtmosphericSystem, SMOKE_MODES } from './modules/atmosphericSystem.js';

class CaveEnvironment {
    constructor(scene) {
        this.atmosphere = new AtmosphericSystem({
            skybox: false,  // No sky in caves
            ocean: false,
            clouds: false,
            smoke: true     // Mystical particle fog
        });

        // Configure for mystical cave fog
        const smokeConfig = this.atmosphere.getSystemConfig('smoke');
        smokeConfig.loadPreset('mystical');
        smokeConfig.fogMode = SMOKE_MODES.PARTICLE;
        smokeConfig.density = 1.2;
        smokeConfig.chromaticDispersion = 0.8;
        smokeConfig.edgeGlow = 1.0;

        // Create fog volumes for different cave sections
        this.fogVolumes = [];
        this.createFogVolumes(scene);
    }

    createFogVolumes(scene) {
        const fogMaterial = createSmokeMaterial();

        // Main chamber fog
        const mainFog = new THREE.Mesh(
            new THREE.BoxGeometry(30, 15, 30),
            fogMaterial.clone()
        );
        mainFog.position.set(0, 7.5, 0);
        scene.add(mainFog);
        this.fogVolumes.push(mainFog);

        // Tunnel fog
        const tunnelFog = new THREE.Mesh(
            new THREE.BoxGeometry(5, 3, 20),
            fogMaterial.clone()
        );
        tunnelFog.position.set(15, 1.5, 0);
        scene.add(tunnelFog);
        this.fogVolumes.push(tunnelFog);
    }

    update(deltaTime, playerPosition, torchPosition) {
        this.atmosphere.update(deltaTime);
        this.atmosphere.setPlayerPosition(playerPosition);
        this.atmosphere.setLightPosition(torchPosition);

        // Apply to all fog volumes
        this.fogVolumes.forEach(fogMesh => {
            this.atmosphere.applyToMaterials({
                smokeMaterial: fogMesh.material
            });
        });
    }
}
```

## Performance Optimization

### Performance Guidelines by Subsystem

| System | Performance Impact | Optimization Tips |
|--------|-------------------|------------------|
| Skybox | Low | Always enabled, minimal cost |
| Ocean | Medium | Reduce wave octaves, lower LOD distance |
| Clouds | Medium-High | Reduce ray march steps, increase step size |
| Smoke (Continuous) | Medium | Use 'performance' preset, lower quality |
| Smoke (Ground) | Medium-High | Reduce quality, increase LOD distance |
| Smoke (Particle) | High | Limit particle count to 20-30, disable markers |

### Optimization Strategy

1. **For High-Performance Voxel Gameplay:**
```javascript
const atmosphere = new AtmosphericSystem({
    skybox: true,
    ocean: false,
    clouds: true,
    smoke: false
});

atmosphere.loadPreset(ATMOSPHERIC_PRESETS.PERFORMANCE);

// Further optimize
const skyboxConfig = atmosphere.getSystemConfig('skybox');
skyboxConfig.quality = 0.6;

const cloudConfig = atmosphere.getSystemConfig('clouds');
cloudConfig.density = 0.3;
```

2. **For Cinematic Scenes:**
```javascript
atmosphere.loadPreset(ATMOSPHERIC_PRESETS.STORMY_OCEAN);

// Increase quality
const smokeConfig = atmosphere.getSystemConfig('smoke');
smokeConfig.quality = 0.9;
smokeConfig.chromaticDispersion = 0.7;
```

3. **Adaptive Quality Based on FPS:**
```javascript
function adjustQualityForFPS(currentFPS) {
    const targetFPS = 60;

    if (currentFPS < targetFPS - 10) {
        // Reduce quality
        const smokeConfig = atmosphere.getSystemConfig('smoke');
        smokeConfig.quality = Math.max(0.3, smokeConfig.quality - 0.1);

        if (currentFPS < targetFPS - 20) {
            atmosphere.setSystemEnabled('smoke', false);
        }
    } else if (currentFPS > targetFPS + 5) {
        // Increase quality
        atmosphere.setSystemEnabled('smoke', true);
        const smokeConfig = atmosphere.getSystemConfig('smoke');
        smokeConfig.quality = Math.min(0.8, smokeConfig.quality + 0.05);
    }
}
```

### Expected Frame Rates

| Configuration | Expected FPS | Use Case |
|--------------|--------------|----------|
| Skybox only | 60+ | Minimal overhead |
| Skybox + Clouds (low) | 50-60 | Standard voxel game |
| Skybox + Ocean + Clouds | 40-50 | Ocean scenes |
| All systems (medium quality) | 30-40 | Balanced |
| All systems (high quality) | 20-30 | Cinematic |
| Smoke particle mode (high quality) | 15-25 | Screenshots, slow scenes |

## System Interactions

### Cloud Shadows on Ocean/Smoke

The atmospheric system automatically handles cloud shadow interactions:

```javascript
// Cloud shadows affect ocean lighting
atmosphere.update(deltaTime);
// Cloud density is automatically passed to ocean shader
```

### Time-of-Day Synchronization

All systems share the same time-of-day:

```javascript
const skyboxConfig = atmosphere.getSystemConfig('skybox');
skyboxConfig.timeOfDay = 18.5; // 6:30 PM

// All systems (sun position, lighting, colors) update together
atmosphere.update(deltaTime);
```

### Player Interaction

Smoke and ocean can react to player position:

```javascript
// Set once per frame
atmosphere.setPlayerPosition(player.position);

// Ground fog mode: fog pushes away from player
// Particle mode: particles pushed by player movement
// Ocean: potential future interaction (wake effects)
```

## Custom Configurations

### Creating Custom Atmospheric Presets

```javascript
// Get base configuration
const atmosphere = new AtmosphericSystem();

// Configure skybox
const skyboxConfig = atmosphere.getSystemConfig('skybox');
skyboxConfig.loadPreset('sunset');
skyboxConfig.timeOfDay = 19.5; // Twilight
skyboxConfig.starIntensity = 0.6;

// Configure clouds
const cloudConfig = atmosphere.getSystemConfig('clouds');
cloudConfig.density = 0.8;
cloudConfig.coverage = 0.85;
cloudConfig.speed = 0.4;

// Configure smoke
const smokeConfig = atmosphere.getSystemConfig('smoke');
smokeConfig.loadPreset('wispy');
smokeConfig.density = 0.5;
smokeConfig.edgeGlow = 0.6;

// Save as custom preset
const customConfig = atmosphere.toJSON();
localStorage.setItem('twilight-preset', JSON.stringify(customConfig));

// Load later
const saved = JSON.parse(localStorage.getItem('twilight-preset'));
atmosphere.fromJSON(saved);
```

### Fine-Tuning Individual Parameters

```javascript
// Access and modify any parameter
const smokeConfig = atmosphere.getSystemConfig('smoke');
smokeConfig.chaos = 1.2;
smokeConfig.clumping = 0.8;
smokeConfig.curl = 1.5;
smokeConfig.turbulence = 1.1;
smokeConfig.responsiveness = 1.3;
smokeConfig.density = 0.9;
smokeConfig.flowSpeed = 0.7;
smokeConfig.heightFalloff = 1.0;
smokeConfig.edgeGlow = 0.7;
smokeConfig.lightIntensity = 0.8;
smokeConfig.chromaticDispersion = 0.5;

// Particle physics
smokeConfig.gravity = 0.4;
smokeConfig.settling = 0.6;
smokeConfig.repulsion = 0.7;
smokeConfig.windStrength = 0.9;
smokeConfig.particleSize = 0.6;
smokeConfig.groundCling = 0.85;

// Performance
smokeConfig.quality = 0.75;
smokeConfig.lodEnabled = true;
smokeConfig.lodDistance = 0.6;
smokeConfig.antiAliasing = 0.75;
smokeConfig.maxDistance = 0.85;
```

## Troubleshooting

### Fog Not Appearing

1. Check system is enabled:
```javascript
atmosphere.setSystemEnabled('smoke', true);
```

2. Check density is high enough:
```javascript
const smokeConfig = atmosphere.getSystemConfig('smoke');
console.log(smokeConfig.density); // Should be > 0.3 to be visible
```

3. Check smoke material is created and applied:
```javascript
atmosphere.applyToMaterials({ smokeMaterial: smokeMaterial });
```

### Performance Issues

1. Disable expensive systems:
```javascript
atmosphere.setSystemEnabled('smoke', false);
atmosphere.setSystemEnabled('clouds', false);
```

2. Use performance preset:
```javascript
atmosphere.loadPreset(ATMOSPHERIC_PRESETS.PERFORMANCE);
```

3. Reduce quality:
```javascript
const smokeConfig = atmosphere.getSystemConfig('smoke');
smokeConfig.quality = 0.4;
smokeConfig.chromaticDispersion = 0.0;
```

### Time-of-Day Not Changing

```javascript
// Manual time update
const skyboxConfig = atmosphere.getSystemConfig('skybox');
skyboxConfig.timeOfDay += deltaTime * 0.1; // 0.1 hours per second

// Or let system auto-update
atmosphere.update(deltaTime);
```

### Particle Fog Not Moving

```javascript
// Make sure you're in particle mode
const smokeConfig = atmosphere.getSystemConfig('smoke');
smokeConfig.fogMode = SMOKE_MODES.PARTICLE;

// Ensure particle system is updating
atmosphere.update(deltaTime); // Called every frame
```

## Module Architecture

```
atmosphericSystem.js (Unified API)
├── skyboxSystem.js (Sky rendering)
│   ├── skybox.glsl.js (Sky shaders)
│   ├── ocean.glsl.js (Ocean shaders)
│   └── skyboxConfig.js (Sky configuration)
├── clouds.glsl.js (Cloud rendering)
└── smokeSystem.js (Fog rendering)
    ├── smoke.glsl.js (Fog shaders)
    ├── smokeParticles.js (Physics simulation)
    └── smokeConfig.js (Fog configuration)
```

## See Also

- [SKYBOX_README.md](./SKYBOX_README.md) - Detailed skybox/ocean system documentation
- [SMOKE_README.md](./SMOKE_README.md) - Detailed smoke/fog system documentation
- [INTEGRATION_EXAMPLE.md](./INTEGRATION_EXAMPLE.md) - Integration guide for collision_test.html

## Next Steps

1. **Test Individual Systems**: Test each subsystem independently to understand behavior
2. **Create Custom Presets**: Design atmospheric presets for your specific scenes
3. **Optimize for Target Platform**: Adjust quality settings based on performance requirements
4. **Integrate with Gameplay**: Connect weather changes to game events
5. **Add Dynamic Effects**: Implement transitions between presets for smooth weather changes
