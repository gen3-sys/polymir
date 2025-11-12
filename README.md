# POLYMIR - Scale-Invariant Voxel Universe Engine

**Version:** 1.0.0-alpha
**Status:** Architecture Complete, Implementation In Progress
**License:** AGPL-3.0 (Copyleft - Free commercial use if derivative work is open-source)
**Target:** GitHub Pages + Cloudflare Workers

---

## Project Vision

A WebGPU-based voxel universe engine featuring:
- Scale-invariant fractal architecture - Same data format from nano to macro scale (16:1 ratio)
- Emergent orbital mechanics - Day/night cycles from actual planetary rotation
- Progressive chunk loading - Wavefront propagation with LOD (DistantHorizons-inspired)
- Shader-based impostor rendering - Per-chunk culling via 3D texture
- Voxelgon transition geometry - Seamless blending between voxel and impostor
- .mvox format - Universal scale-invariant voxel storage with NBT compression
- Async multiplayer - Plot/schematic sharing without real-time netcode overhead

---

## Architecture Overview

### Dependency Hierarchy (Bottom to Top)

```
utils/          Pure utilities (Logger, Color, Random)
  ↓
math/           Pure math (Vector3, noise, Quaternion)
  ↓
data/           Data structures (SparseMap, Octree)
  ↓
geometry/       Mesh generation (GreedyMesher, Sphere)
  ↓
spatial/        Chunk management (Chunk, ChunkLoader)
  ↓
generation/ + serialization/
  ↓
io/ + rendering/
  ↓
physics/
  ↓
systems/
  ↓
world/
  ↓
gameplay/
  ↓
ui/ + input/
  ↓
app/
```

### Core Principles

1. Single Responsibility - Each module does ONE thing
2. Zero Circular Dependencies - Strict bottom-up hierarchy
3. Interface-Based - Adapters for storage, network, rendering
4. Pure Functions - Math/noise/generation are pure (no side effects)
5. Testable in Isolation - Every component can be unit tested
6. Framework Agnostic Core - Only rendering/ touches Three.js
7. < 600 Lines Per File - Large systems split into focused modules

---

## Directory Structure

```
polymir/
├── src/
│   ├── lib/                    Vendored dependencies (Three.js)
│   ├── core/                   Engine lifecycle (EventBus, Clock)
│   ├── math/                   Pure math (Vector3, noise, Quaternion)
│   ├── data/                   Data structures (SparseMap, Octree, LRU)
│   ├── geometry/               Mesh generation (GreedyMesher, Sphere)
│   ├── spatial/                Chunk management (Chunk, ChunkLoader, LOD)
│   ├── generation/             Procedural generation (Noise, Terrain, Planet)
│   ├── serialization/          .mvox format, NBT, compression
│   ├── io/                     I/O adapters (IndexedDB, HTTP, WebSocket)
│   ├── rendering/              Three.js wrapper, shaders, materials
│   ├── physics/                Physics simulation (Gravity, Collision)
│   ├── systems/                ECS-style systems (ChunkLoadingSystem)
│   ├── world/                  World state (Layers, CelestialBody)
│   ├── gameplay/               Game mechanics (Economy, Plots, Building)
│   ├── ui/                     User interface (HUD, Hotbar, Menus)
│   ├── input/                  Input handling (Keyboard, Mouse, Gamepad)
│   ├── utils/                  Utilities (Logger, PerformanceMonitor)
│   └── app/                    Application entry (Game.js)
│
├── backend/                    Cloudflare Workers backend
├── tests/                      Unit & integration tests
├── examples/                   Minimal working examples
├── tools/                      Development tools
└── docs/                       Architecture & API documentation
```

---

## Implementation TODO List

### Phase 1: Foundation (Pure Logic)
- [ ] math/ - Pure math library
  - [ ] Vector3.js - 3D vector operations
  - [ ] Quaternion.js - Rotation math
  - [ ] Matrix4.js - Transformation matrices
  - [x] noise/hash.js - Hash function (JS ↔ GLSL parity)
  - [x] noise/noise3d.js - 3D Perlin noise
  - [x] noise/octave.js - Multi-octave layering

- [ ] data/ - Data structures
  - [x] structures/SparseMap.js - Memory-efficient voxel storage
  - [ ] structures/LRUCache.js - Least-recently-used cache
  - [ ] structures/PriorityQueue.js - Heap-based priority queue
  - [ ] voxel/Voxel.js - Single voxel data structure
  - [x] voxel/VoxelData.js - Chunk voxel storage wrapper
  - [ ] voxel/VoxelTypes.js - Voxel type registry

- [ ] utils/ - Pure utilities
  - [ ] Logger.js - Structured logging
  - [ ] Color.js - Color conversion utilities
  - [ ] Random.js - Seeded random number generator

### Phase 2: Geometry & Spatial
- [ ] geometry/ - Mesh generation
  - [ ] voxel/ChunkGeometry.js - Generate geometry from voxel data
  - [x] voxel/FaceCuller.js - Remove hidden faces
  - [x] voxel/GreedyMesher.js - Merge adjacent same-color faces
  - [x] voxel/MeshBuilder.js - Build vertex/index buffers
  - [ ] procedural/Sphere.js - Spherical mesh generation
  - [ ] procedural/Torus.js - Toroidal mesh generation

- [ ] spatial/ - Chunk management
  - [x] Chunk.js - Chunk container (position, data, state)
  - [x] ChunkCoordinate.js - Chunk coordinate utilities
  - [ ] ChunkManager.js - Chunk lifecycle management
  - [x] ChunkLoader.js - Progressive loading algorithm (wavefront)
  - [x] LODManager.js - Distance-based LOD management
  - [ ] strategies/DistanceBasedLOD.js - Distance-based LOD
  - [ ] strategies/WavefrontLOD.js - Wavefront propagation

### Phase 3: Generation & Serialization
- [ ] generation/ - Procedural generation
  - [ ] generators/Generator.js - Base generator interface
  - [ ] generators/TerrainGenerator.js - Noise-based terrain
  - [x] generators/SphereGenerator.js - Spherical voxel planets
  - [x] generators/StarGenerator.js - Voxelized emissive stars
  - [ ] generators/TorusGenerator.js - Toroidal ringworlds
  - [ ] samplers/NoiseSampler.js - Sample noise at point
  - [ ] samplers/BiomeSampler.js - Sample biome type
  - [ ] mappers/HeightMapper.js - Map noise to height
  - [ ] mappers/ColorMapper.js - Map height to color
  - [ ] mappers/BiomeMapper.js - Map conditions to biome

- [ ] serialization/ - Data encoding/decoding
  - [ ] formats/MvoxCodec.js - .mvox encode/decode
  - [ ] formats/NBTCodec.js - NBT binary format
  - [ ] compression/GzipCompressor.js - Gzip compression

### Phase 4: I/O & Rendering
- [ ] io/ - Input/output adapters
  - [ ] storage/StorageAdapter.js - Storage interface
  - [ ] storage/IndexedDBAdapter.js - IndexedDB implementation
  - [ ] storage/MemoryAdapter.js - In-memory (for testing)
  - [ ] network/NetworkAdapter.js - Network interface
  - [ ] network/HTTPAdapter.js - HTTP fetch implementation
  - [ ] network/MockAdapter.js - Mock network (for testing)

- [ ] rendering/ - Graphics pipeline
  - [ ] Renderer.js - Main renderer (Three.js wrapper)
  - [ ] Camera.js - Camera wrapper
  - [ ] Scene.js - Scene graph wrapper
  - [x] ShaderLoader.js - Async shader file loader
  - [x] ChunkTextureManager.js - 3D chunk culling texture
  - [x] LoadingAnimation.js - Loading screen with orbiting starfield
  - [x] materials/MaterialFactory.js - Shader material factory
  - [ ] materials/VoxelMaterial.js - Voxel shader material
  - [ ] materials/ImpostorMaterial.js - Distance impostor material
  - [x] shaders/voxel.vert.glsl - Voxel vertex shader
  - [x] shaders/voxel.frag.glsl - Voxel fragment shader
  - [x] shaders/impostor-planet.vert.glsl - Planet impostor vertex
  - [x] shaders/impostor-planet.frag.glsl - Planet impostor fragment
  - [ ] renderables/ChunkRenderable.js - Render voxel chunk
  - [ ] renderables/ImpostorRenderable.js - Render impostor mesh

### Phase 5: Physics & Systems
- [ ] physics/ - Physics simulation
  - [ ] PhysicsWorld.js - Physics world container
  - [ ] bodies/RigidBody.js - Physics body
  - [ ] forces/Gravity.js - Gravity force
  - [ ] collision/CollisionDetector.js - Collision detection

- [ ] systems/ - Game systems
  - [ ] System.js - Base system interface
  - [x] OrbitalSystem.js - Orbital mechanics and lighting
  - [ ] ChunkLoadingSystem.js - Chunk loading system
  - [ ] RenderingSystem.js - Rendering updates
  - [ ] PhysicsSystem.js - Physics updates
  - [ ] InputSystem.js - Input event handling

### Phase 6: World & Gameplay
- [ ] world/ - World management
  - [ ] World.js - World container
  - [ ] Layer.js - Base layer class
  - [ ] layers/RibbonLayer.js - Ribbon dimension
  - [ ] layers/UniverseLayer.js - Universe dimension
  - [x] entities/CelestialBody.js - Planet/star with orbital properties
  - [ ] entities/Player.js - Player entity

- [ ] gameplay/ - Game mechanics
  - [ ] economy/Wallet.js - Player wallet
  - [ ] plots/Plot.js - Plot data structure
  - [ ] plots/PlotManager.js - Plot management
  - [ ] plots/Permissions.js - Permission system
  - [ ] building/BuildingMode.js - View/Edit/Build modes
  - [ ] building/VoxelPlacer.js - Place/remove voxels

### Phase 7: UI & Input
- [ ] ui/ - User interface
  - [ ] UIManager.js - UI state management
  - [ ] components/HUD.js - Heads-up display
  - [ ] components/Hotbar.js - Voxel type selector

- [ ] input/ - Input handling
  - [ ] InputManager.js - Input coordinator
  - [ ] Keyboard.js - Keyboard events
  - [ ] Mouse.js - Mouse events

### Phase 8: Application & Backend
- [ ] app/ - Application entry
  - [x] Game.js - Main game class (glue code)
  - [ ] Config.js - Configuration management

- [ ] backend/ - Server implementation
  - [ ] handlers/mvox.js - .mvox upload/download
  - [ ] handlers/plots.js - Plot data persistence
  - [ ] worker.js - Cloudflare Worker entry

### Phase 9: Examples & Documentation
- [ ] examples/ - Working examples
  - [ ] 01-noise-viewer/ - Visualize noise functions
  - [ ] 02-chunk-rendering/ - Basic chunk rendering
  - [ ] 03-planet-lod/ - Planet with LOD switching

- [ ] docs/ - Documentation
  - [ ] architecture/OVERVIEW.md - System architecture
  - [ ] architecture/DEPENDENCIES.md - Dependency graph
  - [ ] specs/MVOX_FORMAT.md - .mvox specification
  - [ ] guides/DEPLOYMENT.md - Deployment guide

---

## Getting Started

### Prerequisites
- Modern browser with WebGL 2.0 support
- Node.js 18+ (for backend development)
- Git

### Quick Start
```bash
git clone https://github.com/yourusername/polymir.git
cd polymir

python -m http.server 8000

http://localhost:8000
```

### Backend Setup (Optional)
```bash
cd backend
npm install
npx wrangler dev
npx wrangler deploy
```

---

## Development Guidelines

### File Size Limit
- Target: < 600 lines per file
- Rationale: Maintain focus, improve testability, reduce merge conflicts
- Action: Split large files into focused modules

### Naming Conventions
- Files: PascalCase for classes (ChunkLoader.js), camelCase for utilities (noise.js)
- Classes: PascalCase (class VoxelChunk)
- Functions: camelCase (function generateTerrain())
- Constants: UPPER_SNAKE_CASE (const CHUNK_SIZE = 16)

### Module Structure
```javascript
import * as THREE from '../lib/three/three.module.js';
import { Vector3 } from '../math/Vector3.js';

const CHUNK_SIZE = 16;

export class VoxelChunk {

}

export { VoxelChunk };
```

### Testing Requirements
- Unit tests: Every pure function/class
- Integration tests: Cross-module interactions
- Test file naming: OriginalName.test.js

---

## Contributing

1. Check TODO list above for available tasks
2. Create branch: git checkout -b feature/your-feature
3. Follow guidelines: < 600 lines, single responsibility, no circular deps
4. Write tests: Unit tests for all logic
5. Submit PR: Reference TODO item in description
6. Wait for review: Maintainer will confirm completion

---

## License

AGPL-3.0 (GNU Affero General Public License v3.0)

Free commercial use permitted IF derivative work remains open-source under AGPL-3.0.
See LICENSE file for full details.

---

## Acknowledgments

- Three.js - 3D graphics library
- Minecraft NBT format - Inspiration for .mvox format
- DistantHorizons - LOD system inspiration
- Barnes-Hut algorithm - Spatial hierarchy inspiration

---

**Last Updated:** 2025-11-11
**Architecture Version:** 1.0.0
**Implementation Status:** Foundation In Progress
#   p o l y m i r  
 