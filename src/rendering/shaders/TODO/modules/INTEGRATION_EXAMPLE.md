# Integrating Skybox System into collision_test.html

This guide shows how to add the skybox system to `collision_test.html`.

## Step 1: Import the Modules

Add these imports after the existing cloud module import (around line 128):

```javascript
import { cloudShaderModule } from './src/rendering/shaders/modules/clouds.glsl.js';
import {
    skyboxShaderModule,
    oceanShaderModule,
    SkyboxConfig,
    getSkyboxUniforms
} from './src/rendering/shaders/modules/skyboxSystem.js';
```

## Step 2: Create Skybox Configuration

After imports, create a configuration instance:

```javascript
// Create skybox configuration
const skyboxConfig = new SkyboxConfig();
skyboxConfig.loadPreset('ocean'); // or 'lake', 'storm', 'sunset', 'night', 'dawn'
```

## Step 3: Add Skybox Rendering (Option A: Simple Background)

If you want a simple skybox background behind the voxel world:

### Create a fullscreen quad shader

```javascript
// Skybox vertex shader
const skyboxVertexShader = `#version 300 es
in vec2 position;
out vec2 vUv;

void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.999, 1.0); // Render at far plane
}`;

// Skybox fragment shader
const skyboxFragmentShader = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uCameraPos;
uniform mat3 uCameraRot;

${skyboxShaderModule}
${oceanShaderModule}

void main() {
    // Calculate ray direction from camera
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    vec3 rayDir = normalize(uCameraRot * vec3(uv, -1.0));

    // Get celestial bodies
    vec3 sunDir = getSunDirection(uTimeOfDay);
    vec3 sunColor = getSunColor(uTimeOfDay);
    vec3 moonDir = getMoonDirection(uTimeOfDay);
    vec3 moonColor = getMoonColor(uTimeOfDay);

    // Base sky color
    vec3 color = getSkyColor(rayDir, uTimeOfDay);

    // Add stars at night
    float nightFactor = getNightFactor(uTimeOfDay);
    color += renderStars(rayDir, uTime) * nightFactor;

    // Render ocean
    vec3 oceanColor = oceanRender(uCameraPos, rayDir, uTime, sunDir, sunColor, moonDir, moonColor);
    if (length(oceanColor) > 0.01) {
        color = mix(color, oceanColor, 0.8);
    }

    // Sun disk
    float sunDot = dot(rayDir, sunDir);
    if (sunDot > 0.995) {
        float sunIntensity = smoothstep(0.995, 0.9995, sunDot);
        color += sunColor * sunIntensity * 15.0;
    }

    // Sun glow
    color += sunColor * pow(max(0.0, sunDot), 8.0) * uSunGlow;

    // Moon (if visible)
    if (uMoonVisible && moonDir.y > 0.0) {
        float moonDot = dot(rayDir, moonDir);
        if (moonDot > 0.998) {
            float moonIntensity = smoothstep(0.998, 0.9995, moonDot);
            color += moonColor * moonIntensity * 10.0;
        }
    }

    // Tone mapping
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));

    fragColor = vec4(color, 1.0);
}`;
```

### Create and setup skybox rendering

```javascript
// Create skybox shader program
const skyboxProgram = createShaderProgram(gl, skyboxVertexShader, skyboxFragmentShader);
const skyboxUniforms = getSkyboxUniforms(gl, skyboxProgram);

// Create fullscreen quad
const skyboxQuadVertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1
]);
const skyboxQuadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, skyboxQuadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, skyboxQuadVertices, gl.STATIC_DRAW);

const skyboxPositionLocation = gl.getAttribLocation(skyboxProgram, 'position');
```

### Update render loop

In the main render function, draw skybox first:

```javascript
function render(time) {
    const deltaTime = (time - lastTime) * 0.001;
    lastTime = time;

    // Update time of day
    skyboxConfig.updateTime(deltaTime);

    // Clear
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ===== RENDER SKYBOX =====
    gl.useProgram(skyboxProgram);
    gl.disable(gl.DEPTH_TEST); // Skybox is always behind everything

    // Apply skybox uniforms
    skyboxConfig.applyUniforms(gl, skyboxUniforms, time);
    gl.uniform1f(skyboxUniforms.uTime, time);
    gl.uniform2f(skyboxUniforms.uResolution, canvas.width, canvas.height);
    gl.uniform3fv(skyboxUniforms.uCameraPos, camera.position.toArray());

    // Calculate camera rotation matrix
    const cameraRotation = new THREE.Matrix3().setFromMatrix4(camera.matrixWorld);
    gl.uniformMatrix3fv(skyboxUniforms.uCameraRot, false, cameraRotation.elements);

    // Draw skybox quad
    gl.bindBuffer(gl.ARRAY_BUFFER, skyboxQuadBuffer);
    gl.enableVertexAttribArray(skyboxPositionLocation);
    gl.vertexAttribPointer(skyboxPositionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ===== RENDER VOXEL WORLD =====
    gl.enable(gl.DEPTH_TEST);

    // ... existing collision_test rendering code ...
    renderer.render(scene, camera);

    requestAnimationFrame(render);
}
```

## Step 4: Add UI Controls (Optional)

Add controls to the existing control panel:

```javascript
// Add to HTML controls div
const skyboxControlsHTML = `
    <h3>🌤️ Skybox</h3>
    <label>Time: <span id="time-of-day">12:00</span></label>
    <input type="range" id="time-slider" min="0" max="24" step="0.1" value="12">
    <button id="preset-ocean">Ocean</button>
    <button id="preset-sunset">Sunset</button>
    <button id="preset-night">Night</button>
    <button id="preset-storm">Storm</button>
`;

// Add event listeners
document.getElementById('time-slider').addEventListener('input', (e) => {
    skyboxConfig.timeOfDay = parseFloat(e.target.value);
    const hours = Math.floor(skyboxConfig.timeOfDay);
    const minutes = Math.floor((skyboxConfig.timeOfDay % 1) * 60);
    document.getElementById('time-of-day').textContent =
        `${hours}:${minutes.toString().padStart(2, '0')}`;
});

document.getElementById('preset-ocean').addEventListener('click', () => {
    skyboxConfig.loadPreset('ocean');
});
document.getElementById('preset-sunset').addEventListener('click', () => {
    skyboxConfig.loadPreset('sunset');
});
document.getElementById('preset-night').addEventListener('click', () => {
    skyboxConfig.loadPreset('night');
});
document.getElementById('preset-storm').addEventListener('click', () => {
    skyboxConfig.loadPreset('storm');
});
```

## Option B: Integrate into Three.js Scene

If you prefer to keep everything in Three.js:

```javascript
// Create skybox as a large sphere with custom shader material
const skyboxGeometry = new THREE.SphereGeometry(10000, 32, 32);
const skyboxMaterial = new THREE.ShaderMaterial({
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vWorldPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        ${skyboxShaderModule}
        ${oceanShaderModule}

        varying vec3 vWorldPosition;
        uniform vec3 uCameraPos;
        uniform float uTime;

        void main() {
            vec3 rayDir = normalize(vWorldPosition - uCameraPos);

            vec3 sunDir = getSunDirection(uTimeOfDay);
            vec3 sunColor = getSunColor(uTimeOfDay);
            vec3 moonDir = getMoonDirection(uTimeOfDay);
            vec3 moonColor = getMoonColor(uTimeOfDay);

            vec3 color = getSkyColor(rayDir, uTimeOfDay);
            float nightFactor = getNightFactor(uTimeOfDay);
            color += renderStars(rayDir, uTime) * nightFactor;

            // ... rest of shader ...

            gl_FragColor = vec4(color, 1.0);
        }
    `,
    side: THREE.BackSide,
    depthWrite: false
});

// Add uniforms
skyboxMaterial.uniforms = {
    uCameraPos: { value: camera.position },
    uTime: { value: 0 },
    uTimeOfDay: { value: 12 },
    // ... add all other skybox uniforms ...
};

const skyboxMesh = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
scene.add(skyboxMesh);

// Update in render loop
function render(time) {
    skyboxMaterial.uniforms.uTime.value = time * 0.001;
    skyboxMaterial.uniforms.uCameraPos.value.copy(camera.position);
    skyboxConfig.updateTime(deltaTime);

    // Apply config to material uniforms
    skyboxMaterial.uniforms.uTimeOfDay.value = skyboxConfig.timeOfDay;
    // ... etc ...

    renderer.render(scene, camera);
}
```

## Testing

After integration:

1. Load `collision_test.html` in browser
2. You should see a dynamic sky with day/night cycle
3. Try different presets to see ocean, storms, sunsets
4. The sky will animate automatically based on `timeSpeed`
5. Stars appear at night, sun during day

## Performance Tips

- Set `skyboxConfig.starsVisible = false` during daytime
- Reduce ocean render distance by adjusting `MAX_DIST`
- Lower `uStarDensity` for better performance
- Disable `cloudReflections` if clouds aren't visible

## Troubleshooting

**Skybox not visible:** Make sure it's rendered first (before voxels) or use `depthWrite: false` in Three.js
**Wrong orientation:** Check camera rotation matrix is correctly passed to shader
**Performance issues:** Reduce star layer count from 6 to 3, disable Milky Way
**Colors too bright:** Adjust tone mapping or reduce `sunIntensity`

