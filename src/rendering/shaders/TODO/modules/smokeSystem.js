/**
 * Volumetric Smoke System - Complete Environmental Effect
 *
 * This module provides a complete volumetric smoke/fog rendering system with:
 *
 * 1. **Three Rendering Modes**
 *    - CONTINUOUS: Fog throughout entire volume
 *    - GROUND: Height-based fog with player disturbance
 *    - PARTICLE: Physics-based particles with fog puffs
 *
 * 2. **Advanced Features**
 *    - Ray-marched volumetric rendering
 *    - Player interaction (pushes fog away)
 *    - Particle physics simulation
 *    - Chromatic dispersion effect
 *    - Performance optimizations (LOD, quality scaling)
 *
 * 3. **Configuration System**
 *    - Extensive parameter control
 *    - Preset configurations
 *    - Import/export settings
 *
 * ## Usage Example
 *
 * ```javascript
 * import {
 *     smokeVertexShader,
 *     smokeFragmentShader,
 *     SmokeConfig,
 *     SmokeParticleSystem,
 *     getSmokeUniforms
 * } from './modules/smokeSystem.js';
 *
 * // Create configuration
 * const smokeConfig = new SmokeConfig();
 * smokeConfig.loadPreset('mystical');
 * smokeConfig.fogMode = 'ground';
 *
 * // Create particle system (if using particle mode)
 * const particleSystem = new SmokeParticleSystem(35);
 *
 * // Create shader material
 * const material = new THREE.ShaderMaterial({
 *     vertexShader: smokeVertexShader,
 *     fragmentShader: smokeFragmentShader,
 *     uniforms: createSmokeUniforms(),
 *     transparent: true,
 *     side: THREE.BackSide,
 *     depthWrite: false
 * });
 *
 * // In render loop
 * function render(time, deltaTime) {
 *     // Update particle physics (if in particle mode)
 *     if (smokeConfig.fogMode === 'particle') {
 *         particleSystem.update(deltaTime, smokeConfig.getPhysicsParams(), playerPosition);
 *
 *         // Sync particle positions to shader
 *         const positions = particleSystem.getPositions();
 *         material.uniforms.uParticlePositions.value = positions;
 *     }
 *
 *     // Apply config to uniforms
 *     smokeConfig.applyUniforms(gl, material.uniforms, time);
 *
 *     // Set player and light positions
 *     material.uniforms.playerPos.value.copy(playerPosition);
 *     material.uniforms.lightPos.value.copy(lightPosition);
 *
 *     renderer.render(scene, camera);
 * }
 * ```
 *
 * ## Three.js Integration
 *
 * ```javascript
 * // Create smoke volume
 * const geometry = new THREE.BoxGeometry(2, 2, 2);
 * const smokeMaterial = new THREE.ShaderMaterial({
 *     vertexShader: smokeVertexShader,
 *     fragmentShader: smokeFragmentShader,
 *     uniforms: createSmokeUniforms(),
 *     transparent: true,
 *     side: THREE.BackSide,
 *     depthWrite: false
 * });
 *
 * const smokeMesh = new THREE.Mesh(geometry, smokeMaterial);
 * scene.add(smokeMesh);
 * ```
 *
 * ## Parameters
 *
 * ### Visual Parameters (0-2 range)
 * - `chaos`: Noise frequency & randomness
 * - `clumping`: Density concentration
 * - `curl`: Swirling motion intensity (ground mode)
 * - `turbulence`: Flow disturbance scale
 * - `responsiveness`: Player interaction strength
 * - `density`: Overall fog thickness
 * - `flowSpeed`: Animation speed
 * - `heightFalloff`: Vertical density fade (ground mode)
 * - `edgeGlow`: Boundary lighting intensity (0-1)
 * - `lightIntensity`: Brightness of illumination
 * - `chromaticDispersion`: Prism-like color separation (0-1)
 *
 * ### Particle Physics (particle mode only)
 * - `particleCount`: Number of particles (10-100)
 * - `gravity`: Downward force strength (0-2)
 * - `settling`: Drag/dampening (0-1)
 * - `repulsion`: Particle-particle repulsion (0-2)
 * - `windStrength`: Turbulent wind force (0-2)
 * - `particleSize`: Influence radius (0-2)
 * - `groundCling`: How much particles stick to ground (0-1)
 *
 * ### Performance (0-1 range)
 * - `quality`: Overall render quality (affects step count)
 * - `lodEnabled`: Enable distance-based LOD
 * - `lodDistance`: Distance threshold for LOD
 * - `antiAliasing`: Temporal anti-aliasing strength
 * - `maxDistance`: Max render distance (culling)
 *
 * ## Presets
 *
 * Available presets:
 * - **default**: Balanced settings for general use
 * - **heavy**: Dense, slow-moving fog
 * - **wispy**: Light, fast-moving smoke
 * - **mystical**: Colorful, swirling fog with chromatic dispersion
 * - **performance**: Optimized for maximum FPS
 *
 * ## Performance Tips
 *
 * 1. **For voxel games**: Use 'performance' preset, quality 0.4-0.6
 * 2. **Particle mode**: Keep count 20-35, disable markers in production
 * 3. **LOD**: Enable for outdoor scenes with distance
 * 4. **Quality**: 0.4 = ~60 FPS, 0.7 = ~30 FPS, 1.0 = ~15 FPS
 * 5. **Chromatic dispersion**: Expensive, use sparingly
 */

// Re-export everything
export { smokeVertexShader, smokeFragmentShader, smokeDefaults } from './smoke.glsl.js';
export { SmokeParticle, SmokeParticleSystem, particleDefaults } from './smokeParticles.js';
export { SmokeConfig, SMOKE_PRESETS, SMOKE_MODES } from './smokeConfig.js';

import * as THREE from 'three';

/**
 * Create smoke uniforms object for Three.js ShaderMaterial
 * @returns {Object} Uniforms object
 */
export function createSmokeUniforms() {
    return {
        time: { value: 0 },
        lightPos: { value: new THREE.Vector3(1, 1, 1) },
        fogMode: { value: 0.0 },
        playerPos: { value: new THREE.Vector3(0, -1, 0) },

        // Visual parameters
        uChaos: { value: 0.5 },
        uClumping: { value: 0.5 },
        uCurl: { value: 0.5 },
        uTurbulence: { value: 0.5 },
        uResponsiveness: { value: 0.5 },
        uDensity: { value: 0.5 },
        uFlowSpeed: { value: 0.5 },
        uHeightFalloff: { value: 0.5 },
        uEdgeGlow: { value: 0.3 },
        uLightIntensity: { value: 0.5 },
        uChromaticDispersion: { value: 0.0 },

        // Performance
        uQuality: { value: 0.7 },
        uLodEnabled: { value: 1.0 },
        uLodDistance: { value: 0.5 },
        uAntiAliasing: { value: 0.7 },
        uMaxDistance: { value: 0.8 },

        // Particle data
        uParticlePositions: { value: new Array(100).fill(0).map(() => new THREE.Vector3()) },
        uParticleCount: { value: 35 },
        uParticleSize: { value: 0.5 }
    };
}

/**
 * Get all smoke uniform locations for WebGL program
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {WebGLProgram} program - Shader program
 * @returns {Object} Object containing all uniform locations
 */
export function getSmokeUniforms(gl, program) {
    return {
        time: gl.getUniformLocation(program, 'time'),
        lightPos: gl.getUniformLocation(program, 'lightPos'),
        fogMode: gl.getUniformLocation(program, 'fogMode'),
        playerPos: gl.getUniformLocation(program, 'playerPos'),

        // Visual parameters
        uChaos: gl.getUniformLocation(program, 'uChaos'),
        uClumping: gl.getUniformLocation(program, 'uClumping'),
        uCurl: gl.getUniformLocation(program, 'uCurl'),
        uTurbulence: gl.getUniformLocation(program, 'uTurbulence'),
        uResponsiveness: gl.getUniformLocation(program, 'uResponsiveness'),
        uDensity: gl.getUniformLocation(program, 'uDensity'),
        uFlowSpeed: gl.getUniformLocation(program, 'uFlowSpeed'),
        uHeightFalloff: gl.getUniformLocation(program, 'uHeightFalloff'),
        uEdgeGlow: gl.getUniformLocation(program, 'uEdgeGlow'),
        uLightIntensity: gl.getUniformLocation(program, 'uLightIntensity'),
        uChromaticDispersion: gl.getUniformLocation(program, 'uChromaticDispersion'),

        // Performance
        uQuality: gl.getUniformLocation(program, 'uQuality'),
        uLodEnabled: gl.getUniformLocation(program, 'uLodEnabled'),
        uLodDistance: gl.getUniformLocation(program, 'uLodDistance'),
        uAntiAliasing: gl.getUniformLocation(program, 'uAntiAliasing'),
        uMaxDistance: gl.getUniformLocation(program, 'uMaxDistance'),

        // Particle data
        uParticlePositions: gl.getUniformLocation(program, 'uParticlePositions'),
        uParticleCount: gl.getUniformLocation(program, 'uParticleCount'),
        uParticleSize: gl.getUniformLocation(program, 'uParticleSize')
    };
}

/**
 * Helper to create a complete smoke volume mesh for Three.js
 * @param {Object} options - Configuration options
 * @returns {THREE.Mesh} Smoke mesh ready to add to scene
 */
export function createSmokeMesh(options = {}) {
    const {
        size = [2, 2, 2],
        preset = 'default',
        mode = 'continuous'
    } = options;

    const geometry = new THREE.BoxGeometry(...size);
    const material = new THREE.ShaderMaterial({
        vertexShader: require('./smoke.glsl.js').smokeVertexShader,
        fragmentShader: require('./smoke.glsl.js').smokeFragmentShader,
        uniforms: createSmokeUniforms(),
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false
    });

    // Apply preset
    const config = new (require('./smokeConfig.js').SmokeConfig)();
    config.loadPreset(preset);
    config.fogMode = mode;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.smokeConfig = config;

    return mesh;
}
