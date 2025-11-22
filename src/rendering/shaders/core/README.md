# Core Shaders

These are the **foundational shaders** for curved megastructure rendering. They define the coordinate transformation pipeline that all other shaders pass through.

## curved-surface-voxel.vert.glsl / curved-surface-voxel.frag.glsl

The core torus/sphere/plane bending shader pair. These shaders:

1. **Transform flat voxel geometry** onto curved surfaces (torus, sphere, plane)
2. **Compute per-pixel positions** using parametric surface equations (not vertex interpolation)
3. **Write correct depth** via `gl_FragDepth` for seamless rendering
4. **Transform normals** per-pixel for accurate lighting on curved surfaces

### Architecture

Other shaders should **build upon** these core shaders. The curved surface transformation happens first, then lighting/effects are computed based on what light **would be** on the curved body.

```
Flat Voxel Data
      │
      ▼
┌─────────────────────────┐
│  CORE CURVED SHADER     │  ◄── This layer
│  - Torus mapping        │
│  - Per-pixel depth      │
│  - Normal transformation│
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  EFFECT SHADERS         │  ◄── Future shaders build on top
│  - Raytracing           │
│  - Atmospheric scatter  │
│  - PBR materials        │
└─────────────────────────┘
```

### Usage Requirements

- `uSurfaceType`: 0=plane, 1=sphere, 2=torus
- `uMajorRadius` / `uMinorRadius`: Torus radii
- `uViewMatrix` / `uProjectionMatrix`: Must be passed as custom uniforms (Three.js doesn't expose to fragment shader by default)
- **maxQuadSize=1** in greedy mesher to eliminate triangle diagonal artifacts

### DO NOT MODIFY

These shaders are locked. They represent the correct, tested solution for seamless toroidal rendering.
