# POLYMIR - Scale-Invariant Voxel Universe Engine

**Version:** 1.0.0-alpha
**Status:** Architecture Complete, Implementation In Progress
**License:** AGPL-3.0 (Copyleft - Free commercial use if derivative work is open-source & also Copyleft)
**Target:** GitHub Pages + Cloudflare Workers

---

## Project Vision

A WebGPU-based voxel universe engine featuring:
- **Scale-invariant fractal architecture** - Same data format from nano to macro scale (16:1 ratio)
- **Emergent orbital mechanics** - Day/night cycles from actual planetary rotation
- **Parallel asynchronous chunk loading** - 3 simultaneous loaders with priority queue (93% draw call reduction)
- **Hierarchical LOD system** - Supercluster → Galaxy → System → Planet view transitions
- **4×4×4 batch rendering** - Material separation (terrain/builds/foliage/emissive)
- **Dynamic impostor culling** - Progressive triangle removal as voxels load (10-15% GPU savings)
- **Shader-based impostor rendering** - Per-chunk culling via 3D texture with SDF ray marching
- **System capture zones** - Smooth lighting transitions (ambient ↔ directional)
- **.mvox format** - Universal scale-invariant voxel storage with NBT compression
- **Async multiplayer** - Plot/schematic sharing without real-time netcode overhead

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

## Optimized Rendering Architecture

### Hierarchical Spatial Structure

POLYMIR uses a scale-invariant hierarchy where each level uses the same 16:1 ratio:

```
SUPERCLUSTER (Megachunk Grid: 16×16×16 chunks = 256×256×256 voxels)
  ↓ contains
GALAXIES (rendered as dust clouds + bright centers)
  ↓ contains
SYSTEMS (rendered as colored dots with star glow)
  ↓ contains
PLANETS (spherical impostors OR voxel chunks based on distance)
  ↓ contains
CHUNKS (16×16×16 voxels, batched into 4×4×4 groups)
  ↓ contains
VOXELS (individual blocks, greedy-meshed in 3D)
```

**Absolute Coordinate System:**
- **World Grid Origin**: Supercluster center (silent absolute reference frame)
- **Object Tracking**: Each celestial body has a point position in supercluster space
- **Rotation Isolation**: Objects rotate around their own origins, tracking point stays in megachunk grid
- **Megachunk System**: 16×16×16 chunks per megachunk

**Coordinate Transform Chain:**
```javascript
// Player world position = supercluster + all parent transforms
worldPos = supercluster.pos
  + rotateBy(galaxy.rotation, galaxy.localPos)
  + rotateBy(system.rotation, system.localPos)
  + rotateBy(planet.rotation, planet.localPos)
```

---

### LOD Rendering System by View Distance

| View Distance | Render Mode | Geometry Type | Draw Call Strategy | Chunk Loader State |
|--------------|-------------|---------------|-------------------|-------------------|
| **Supercluster View** | Dust clouds + star dots | Particle system / billboards | Single batched draw per galaxy | Disabled |
| **Galaxy View** | Systems as colored dots | Point sprites with star glow | Batched instanced rendering | Disabled |
| **System View** | Spherical planet impostors | Icosahedron with SDF shader | Per-planet draw call | Disabled |
| **Planet Surface** | Voxel chunk meshes | Greedy-meshed geometry | **4 per batch** (terrain/builds/foliage/emissive) | **Enabled** |

#### System Capture Zone Definition

The transition from galaxy/system view to planet surface rendering is controlled by the **system capture zone**:

```javascript
// Calculate system capture radius
const farthestPlanetOrbit = max(planet.orbitRadius for all planets in system);
const farthestPlanetGravity = farthestPlanet.radius * gravityMultiplier;
const systemCaptureRadius = (farthestPlanetOrbit + farthestPlanetGravity) * 1.15;

// Determine rendering mode
const distanceToStar = distance(camera, star.position);
const isInSystemView = distanceToStar < systemCaptureRadius;
```

**When entering system capture zone:**
- Transition from **ambient-only lighting** (galaxy) → **directional star lighting**
- Enable spherical impostor rendering for planets
- Activate chunk loader when camera approaches planet surface (<300 units)

**Lighting Transition (Smooth Crossfade):**
```javascript
// 10% transition zone at capture boundary
transitionStart = systemCaptureRadius * 0.90;
transitionEnd = systemCaptureRadius * 1.10;

if (distToStar < transitionStart) {
  directionalIntensity = 1.0;        // Full star lighting
  ambientIntensity = 0.3;            // Minimal fill light
} else if (distToStar > transitionEnd) {
  directionalIntensity = 0.0;        // No star
  ambientIntensity = 1.0;            // Pure galaxy ambient
} else {
  // Smooth lerp in transition zone
  t = (distToStar - transitionStart) / (transitionEnd - transitionStart);
  directionalIntensity = 1.0 - t;
  ambientIntensity = 0.3 + (0.7 * t);
}
```

---

### Parallel Asynchronous Chunk Loading System

Three independent loaders run simultaneously with priority-based deduplication:

#### 1. Near-Player Loader (Highest Priority)
- **Range**: 100 units from player
- **Content**: Everything (terrain, caves, structures, builds)
- **Speed**: 64 chunks per frame (entire 4×4×4 batch at once)
- **Update Frequency**: 60fps (every frame)
- **Purpose**: Immediate detail around player

#### 2. Aggressive Surface Loader (Medium Priority)
- **Range**: 600 units from player
- **Content**: Surface chunks only (marked `isSurface` at generation)
- **Speed**: 64 chunks per frame (one batch)
- **Update Frequency**: 60fps
- **Purpose**: Rapidly display visible horizon
- **Pause Condition**: All surface chunks within 600 units loaded

#### 3. Lazy Background Loader (Lowest Priority)
- **Range**: 300 units from player (LOD boundary)
- **Content**: Everything (underground caves, distant surface)
- **Speed**: 8 chunks per frame (gradual streaming)
- **Update Frequency**: 10fps (every 100ms)
- **Purpose**: Fill in non-critical detail
- **Activation**: Only runs when aggressive loader paused

#### Priority Queue & Deduplication

```javascript
// Merge results with priority (near-player > aggressive > lazy)
priorityQueue = [];

// Add chunks from each loader
for (chunk in nearPlayerChunks) {
  chunkMap.set(chunk.key, { ...chunk, priority: 3 });
}
for (chunk in aggressiveSurfaceChunks) {
  if (!chunkMap.has(chunk.key)) {  // Deduplicate
    chunkMap.set(chunk.key, { ...chunk, priority: 2 });
  }
}
for (chunk in lazyBackgroundChunks) {
  if (!chunkMap.has(chunk.key)) {  // Deduplicate
    chunkMap.set(chunk.key, { ...chunk, priority: 1 });
  }
}

// Sort by priority, then distance
priorityQueue = Array.from(chunkMap.values())
  .sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.distToPlayer - b.distToPlayer;
  });
```

#### Surface Chunk Detection

Chunks are marked as `isSurface` at generation time:

```javascript
// In SphereGenerator.generateChunk()
let hasAir = false;
let hasSolid = false;

for (voxel in chunk) {
  if (voxel.isSolid) hasSolid = true;
  else hasAir = true;
}

// Surface chunks contain BOTH air and solid (cross the boundary)
chunk.metadata.isSurface = hasAir && hasSolid;

// Also mark chunks near surface (within 2 chunks of radius)
chunk.metadata.isNearSurface = Math.abs(distToCenter - radius) < chunkSize * 2;
```

**Performance:** O(1) surface detection via metadata lookup (no runtime calculation)

---

### Batch Rendering Strategy

#### 4×4×4 Chunk Batching

**Batch Volume:**
- 4×4×4 chunks = 64 chunks per batch
- Each chunk = 16×16×16 voxels
- Total voxels per batch = 64 × 4,096 = **262,144 voxels**

**Spatial Grouping:**
```javascript
// Batch coordinate = floor(chunkCoord / 4)
batchX = Math.floor(chunkX / 4);
batchY = Math.floor(chunkY / 4);
batchZ = Math.floor(chunkZ / 4);
batchKey = `${batchX},${batchY},${batchZ}`;
```

#### Material Separation (4 Meshes Per Batch)

Each batch produces **4 separate meshes** for draw call optimization:

1. **Terrain Mesh**: Natural blocks (stone, dirt, sand, grass, water)
2. **Builds Mesh**: Player-placed structures (wood, metal, glass, decorative)
3. **Foliage Mesh**: Vegetation (leaves, grass, flowers, vines)
4. **Emissive Mesh**: Glowing blocks (lava, torches, crystals, stars)

**Categorization:**
```javascript
function categorizeVoxel(voxel, worldPos, biome) {
  if (voxel.type === 'player_placed') return 'builds';
  if (voxel.type === 'foliage') return 'foliage';
  if (voxel.isEmissive || voxel.lightLevel > 0) return 'emissive';
  return 'terrain';  // Default
}
```

**Meshing Pipeline Per Batch:**
```javascript
// Separate voxels by category
materialBuckets = { terrain: [], builds: [], foliage: [], emissive: [] };

for (chunk in batch64Chunks) {
  for (voxel in chunk.voxels) {
    category = categorizeVoxel(voxel);
    materialBuckets[category].push(voxel);
  }
}

// Greedy mesh each category separately
terrainMesh = greedyMesh3D(materialBuckets.terrain);
buildsMesh = greedyMesh3D(materialBuckets.builds);
foliageMesh = greedyMesh3D(materialBuckets.foliage);
emissiveMesh = greedyMesh3D(materialBuckets.emissive);
```

**Draw Call Reduction:**
- **Before batching**: 400 chunks × 1 = 400 draw calls
- **After batching**: 7 batches × 4 materials = **28 draw calls**
- **Reduction**: 93% fewer draw calls

---

### Dynamic Impostor Culling

As voxel chunks load, the impostor sphere mesh is progressively culled to save GPU work:

#### Voxel Surface Guarantee
```javascript
// Ensure voxel surface always occludes impostor (no gaps)
impostorRadius = planetRadius - 1.0;  // At least 1 unit smaller
minVoxelSurfaceRadius = planetRadius;
maxVoxelSurfaceRadius = planetRadius + maxTerrainHeight;
```

**Why this works**: Voxel surface extends beyond impostor → safe to cull impostor geometry underneath

#### Progressive Culling in 600-Unit Sphere

```javascript
// As chunks load within 600 units, cull impostor triangles
function cullImpostorRegion(playerPosition, radius = 600) {
  const positions = impostorMesh.geometry.attributes.position.array;
  const newTriangles = [];

  // Iterate impostor triangles (IcosahedronGeometry detail 64 ≈ 40,000-80,000 tris)
  for (let i = 0; i < positions.length; i += 9) {  // 3 verts × 3 components
    const triangleCenter = {
      x: (positions[i] + positions[i+3] + positions[i+6]) / 3,
      y: (positions[i+1] + positions[i+4] + positions[i+7]) / 3,
      z: (positions[i+2] + positions[i+5] + positions[i+8]) / 3
    };

    const distToPlayer = distance(triangleCenter, playerPosition);

    // Keep triangle if OUTSIDE 600-unit radius (not yet covered by voxels)
    if (distToPlayer > radius) {
      newTriangles.push(...positions.slice(i, i + 9));
    }
  }

  // Update geometry with culled triangles
  impostorMesh.geometry.setAttribute('position',
    new THREE.Float32BufferAttribute(newTriangles, 3)
  );
}
```

**GPU Savings:**
- **600-unit sphere** covers ≈ 10-15% of planet surface
- **Culled triangles**: 4,000-12,000 fewer triangles to render
- **Fragment shader savings**: No per-pixel lighting for culled region

---

### Optimization Techniques

#### 1. 3D Greedy Meshing (Planned)
**Current**: 2D rectangular quads per axis (6 directions)
**Target**: 3D axis-aligned bounding boxes (AABBs)

**Algorithm:**
- Scan volume in 3D slices
- Merge adjacent same-color voxels into boxes (X×Y×Z dimensions)
- Output: `{x, y, z, width, height, depth, color}` instead of 6 separate faces

**Expected Reduction**: 30-50% fewer quads than 2D greedy meshing

#### 2. Indexed Geometry
**Current**: 6 vertices per quad (v1→v2→v3, v1→v3→v4 as separate triangles)
**Target**: 4 vertices + 6 indices per quad

```javascript
// Instead of duplicating vertices
vertices = [v1, v2, v3, v1, v3, v4];  // 6 verts (current)

// Use indexed geometry
vertices = [v1, v2, v3, v4];  // 4 verts
indices = [0, 1, 2, 0, 2, 3];  // 6 indices
```

**Savings**: 33% reduction in vertex buffer size

#### 3. Batch-Relative Coordinates
**Problem**: Large world coordinates cause float precision jitter
**Solution**: Store vertices relative to batch origin

```javascript
// Current: World-space coordinates (large numbers)
vertexX = chunkX * 16 + localX;  // Could be 10,000+ units

// Target: Batch-relative coordinates
vertexX = (chunkX % 4) * 16 + localX;  // Always 0-64 range
mesh.position.set(batchX * 64, batchY * 64, batchZ * 64);
```

**Benefit**: Eliminates Z-fighting at large distances, improves precision

#### 4. Frustum Culling
**Implementation**: GPU-accelerated via Three.js (built-in)

```javascript
mesh.frustumCulled = true;  // Enabled by default
```

For batched meshes, manually check before adding to batch:
```javascript
const isVisible = frustum.intersectsBox(chunk.boundingBox);
if (isVisible) {
  batch.addChunk(chunk);
}
```

#### 5. Backface Culling
**Implementation**: GPU-side (free with material configuration)

```javascript
material.side = THREE.FrontSide;  // Cull back faces (default)
```

**Alternative**: CPU-side during meshing (not recommended due to camera movement)

#### 6. Asynchronous Meshing
**Problem**: Greedy meshing 64 chunks blocks main thread (10-50ms)
**Solution**: Offload to Web Worker or idle time

**Option A: requestIdleCallback**
```javascript
requestIdleCallback((deadline) => {
  const meshes = greedyMesh(batch);
  addToScene(meshes);
}, { timeout: 50 });
```

**Option B: Web Worker** (preferred for true parallelism)
```javascript
// worker.js
self.onmessage = (e) => {
  const { batch } = e.data;
  const geometryData = greedyMesh(batch);
  self.postMessage({ geometryData }, [geometryData.vertices.buffer]);  // Transferable
};
```

---

### Unified Greedy Meshing Pipeline (Scale-Invariant)

**CRITICAL PRINCIPLE**: All voxel geometry uses the **same greedy meshing algorithm** regardless of scale.

#### Scale Levels and Meshing
```
Supercluster Voxels (megachunks: 16×16×16 chunks)
  ↓ Use SAME greedy meshing algorithm
Galaxy Voxels (chunks: 16×16×16 blocks)
  ↓ Use SAME greedy meshing algorithm
System Voxels (blocks: 16×16×16 microblocks)
  ↓ Use SAME greedy meshing algorithm
Planet Voxels (microblocks: finest detail)
  ↓ Use SAME greedy meshing algorithm
Chunk Impostors (surrounded chunks)
  ↓ Use SAME greedy meshing algorithm (or fast single-color cube)
```

#### Unified Meshing Interface

**All voxel types use this pipeline:**
```javascript
class UnifiedVoxelMesher {
  /**
   * Universal meshing method for ALL scales
   * @param {Map} voxels - Sparse voxel map (encoded key → voxel data)
   * @param {Object} options - Scale-specific options
   * @returns {Object} - Geometry data (vertices, normals, colors/textureIDs)
   */
  static mesh(voxels, options = {}) {
    const {
      voxelSize = 1,           // Physical size of each voxel
      useTextureID = true,     // Group by textureID (not color)
      useFastImpostor = false, // For surrounded chunks
      batchRelative = true     // Use batch-relative coordinates
    } = options;

    // Step 1: Fast impostor path (O(n) linear time)
    if (useFastImpostor) {
      return this.generateFastImpostor(voxels, voxelSize);
    }

    // Step 2: Face culling (O(n) per voxel, O(6n) neighbor checks)
    const exposedFaces = this.cullHiddenFaces(voxels, options);

    // Step 3: Greedy meshing by texture (O(f) where f = exposed faces)
    const mergedQuads = this.greedyMeshByTexture(exposedFaces, useTextureID);

    // Step 4: Build geometry (indexed or non-indexed)
    const geometry = this.buildGeometry(mergedQuads, {
      voxelSize,
      batchRelative,
      useIndexedGeometry: true  // 33% vertex reduction
    });

    return geometry;
  }

  static greedyMeshByTexture(exposedFaces, useTextureID = true) {
    // Group faces by texture ID (not color!)
    const facesByTextureAndDir = new Map();

    for (const face of exposedFaces) {
      const groupKey = useTextureID
        ? `${face.textureID}_${face.dir}`  // Group by texture
        : `${face.color}_${face.dir}`;     // Fallback: group by color

      if (!facesByTextureAndDir.has(groupKey)) {
        facesByTextureAndDir.set(groupKey, []);
      }
      facesByTextureAndDir.get(groupKey).push(face);
    }

    const allMergedQuads = [];

    // Greedy merge each texture group independently
    for (const [groupKey, faces] of facesByTextureAndDir) {
      // 2D greedy meshing (current implementation)
      const quads2D = GreedyMesher.meshFaces(faces);

      // OR 3D greedy meshing (planned optimization)
      // const quads3D = GreedyMesher3D.meshAABB(faces);

      allMergedQuads.push(...quads2D);
    }

    return allMergedQuads;
  }

  static generateFastImpostor(voxels, voxelSize) {
    // O(n) dominant texture detection
    const textureCounts = new Map();
    let maxCount = 0;
    let dominantTexture = 0;

    for (const [key, voxel] of voxels) {
      const count = (textureCounts.get(voxel.textureID) || 0) + 1;
      textureCounts.set(voxel.textureID, count);

      if (count > maxCount) {
        maxCount = count;
        dominantTexture = voxel.textureID;
      }
    }

    // Create simple cube (12 triangles, 24 vertices)
    return this.createCubeGeometry(voxelSize, dominantTexture);
  }
}
```

#### Scale-Specific Usage Examples

**Example 1: Planet Surface Chunks (Standard Voxels)**
```javascript
// 16×16×16 block chunks
const geometry = UnifiedVoxelMesher.mesh(chunk.voxels, {
  voxelSize: 1.0,
  useTextureID: true,
  useFastImpostor: false,
  batchRelative: true
});
```

**Example 2: Microblocks (Fine Detail)**
```javascript
// 16×16×16 microblocks per block
const geometry = UnifiedVoxelMesher.mesh(microblockVoxels, {
  voxelSize: 1.0 / 16.0,  // 1/16th the size of blocks
  useTextureID: true,
  useFastImpostor: false,
  batchRelative: true
});
```

**Example 3: Internal Chunk Impostor (Fast Path)**
```javascript
// Surrounded chunk with no exposed faces
const geometry = UnifiedVoxelMesher.mesh(chunk.voxels, {
  voxelSize: 1.0,
  useTextureID: true,
  useFastImpostor: true,  // O(n) fast impostor
  batchRelative: true
});
```

**Example 4: Structure from .mvox Reference**
```javascript
// Nested .mvox (tree, building, etc.)
const mvoxFile = await loadMVox('tree_oak_01');
const geometry = UnifiedVoxelMesher.mesh(mvoxFile.voxels, {
  voxelSize: 1.0,
  useTextureID: true,
  useFastImpostor: false,
  batchRelative: false  // World-space for structures
});
```

**Example 5: Megachunk (Galaxy-Scale Voxels)**
```javascript
// 16×16×16 chunk megachunks (galaxy view)
const geometry = UnifiedVoxelMesher.mesh(megachunk.voxels, {
  voxelSize: 256.0,  // Each "voxel" is a 16×16×16 chunk
  useTextureID: true,
  useFastImpostor: false,
  batchRelative: false
});
```

#### Efficiency Guarantees

**Time Complexity** (all scales):
- Fast impostor: **O(n)** where n = voxel count
- Face culling: **O(6n)** worst case (6 neighbor checks per voxel)
- Greedy meshing: **O(f)** where f = exposed faces
- Geometry build: **O(q)** where q = merged quads

**Total: O(n + f + q)** which is linear in practice

**Space Complexity**:
- Sparse voxel storage: **O(n)** only solid voxels
- Exposed faces: **O(f)** typically f << 6n due to culling
- Merged quads: **O(q)** typically q << f due to greedy merging
- Final geometry: **O(4q)** with indexed geometry (4 verts per quad)

**Memory Efficiency**:
- **Texture-based grouping**: Thousands of same-texture faces → 1 large quad
- **Indexed geometry**: 4 vertices per quad instead of 6 (33% reduction)
- **Batch-relative coords**: Eliminates float precision issues
- **Fast impostor**: 24 vertices for entire surrounded chunk

#### Performance Targets by Scale

| Scale | Voxel Count | Meshing Time | Output Geometry |
|-------|-------------|--------------|-----------------|
| **Microblocks** | 4,096 | ~2ms | 100-500 quads |
| **Blocks (Chunk)** | 4,096 | ~5ms | 200-800 quads |
| **Chunks (Batch)** | 262,144 | ~50ms* | 1,000-4,000 quads |
| **Fast Impostor** | 4,096 | ~0.5ms | 24 vertices (cube) |

*With async meshing (Web Worker), doesn't block main thread

#### Shared Optimizations Across All Scales

1. **Texture-Based Grouping**: Same texture → merge into large quads
2. **Indexed Geometry**: 4 vertices + 6 indices per quad (not 6 vertices)
3. **Packed Integer Vertices**: Position + normal + textureID in 32 bits
4. **Batch-Relative Coordinates**: No float precision issues at any scale
5. **Fast Impostor Path**: O(n) fallback for surrounded geometry
6. **Async Meshing**: Web Workers for non-blocking processing

#### Implementation Notes

**DO NOT create separate meshing code for different scales!**
- ❌ **WRONG**: `meshMicroblocks()`, `meshChunks()`, `meshMegachunks()`
- ✅ **CORRECT**: `UnifiedVoxelMesher.mesh(voxels, { voxelSize })`

**Benefits of Unified Approach:**
- Single codebase to optimize (not 5 separate implementations)
- Consistent quality across all scales
- Same optimizations apply universally
- Easier to maintain and debug
- Scale transitions are seamless (same visual quality)

---

### Performance Targets

#### Load Time
- **Frame 1-5**: Near-player chunks (100 units) → Immediate detail
- **Frame 6-70**: Aggressive surface (600 units) → Full horizon
- **Frame 71+**: Lazy background (caves, distant) → Complete detail

**Total**: ~1 second to detailed surface at 60fps

#### Draw Calls
- **Current**: 800 chunks × 1 = 800 draw calls
- **Target**: ~13 batches × 4 materials = **52 draw calls**
- **Reduction**: 93.5%

#### Memory
- **Buffer Pool**: `GeometryBufferPool` reuses Float32Arrays (200 max)
- **Reuse Rate Target**: >80%

#### Triangle Count
- **Greedy Meshing**: 40-60% reduction from naive cubes
- **3D Greedy Meshing**: Additional 30-50% reduction
- **Impostor Culling**: 15% reduction in impostor triangles

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

### Phase 0: Rendering Optimization (High Priority)

This phase implements the parallel asynchronous chunk loading architecture and batch rendering optimizations.

- [ ] **spatial/loaders/** - Parallel chunk loading system
  - [ ] NearPlayerLoader.js - 100-unit radius aggressive loader (highest priority)
  - [ ] AggressiveSurfaceLoader.js - 600-unit radius surface-only loader
  - [ ] LazyBackgroundLoader.js - 300-unit radius background loader
  - [ ] ParallelChunkLoadingSystem.js - Orchestrator with priority queue & deduplication

- [ ] **spatial/batching/** - Chunk batching system
  - [ ] ChunkBatcher.js - Group chunks into 4×4×4 spatial batches
  - [ ] MaterialSeparator.js - Separate voxels by terrain/builds/foliage/emissive
  - [ ] BatchCoordinate.js - Batch-relative coordinate system

- [ ] **data/** - Chunk metadata extensions
  - [ ] ChunkMetadata.js - Surface detection flags (`isSurface`, `isNearSurface`)
  - [ ] VoxelCategory.js - Voxel categorization (terrain/builds/foliage/emissive)

- [ ] **geometry/voxel/** - Advanced meshing
  - [ ] UnifiedVoxelMesher.js - **CRITICAL**: Single meshing pipeline for ALL scales (microblocks → megachunks)
  - [ ] GreedyMesher3D.js - 3D AABB greedy meshing (30-50% reduction)
  - [ ] IndexedMeshBuilder.js - 4 vertices + 6 indices (33% reduction)
  - [ ] BatchMeshBuilder.js - Build meshes for 4×4×4 batches
  - [ ] TextureGrouper.js - Group faces by textureID (not color) for massive merging
  - [ ] FastImpostorGenerator.js - O(n) dominant-texture cube for surrounded chunks

- [ ] **rendering/** - Impostor & batch rendering
  - [ ] ImpostorCuller.js - Dynamic impostor triangle culling (600-unit sphere)
  - [ ] BatchRenderer.js - Render 4 material meshes per batch
  - [ ] MaterialCategorizer.js - Map voxel types to material categories

- [ ] **world/** - Coordinate systems
  - [ ] CoordinateSystem.js - Hierarchical transform chain (supercluster → galaxy → system → planet)
  - [ ] CoordinateTransform.js - Transform utilities between coordinate spaces
  - [ ] MegachunkGrid.js - 16×16×16 chunk megachunk system

- [ ] **workers/** - Asynchronous processing
  - [ ] MeshingWorker.js - Web Worker for greedy meshing (true parallelism)
  - [ ] WorkerPool.js - Worker pool management (acquire/release)

- [ ] **systems/** - LOD & lighting systems
  - [ ] SystemCaptureZone.js - Calculate system capture radius (star + 1.15× furthest orbit)
  - [ ] LightingTransitionSystem.js - Smooth ambient ↔ directional crossfade
  - [ ] ViewDistanceLOD.js - Manage LOD transitions (supercluster → galaxy → system → planet)

### Phase 0.5: Layered Planet Generation & Fracturing System (High Priority)

This phase implements the core-layer planet generation architecture with support for planet shattering mechanics and multiple planet types.

- [ ] **config/** - Planet generation configuration
  - [ ] PlanetGenerationConfig.js - Core layer structure, terrain bounds, water level, default configurations
  - [ ] GravitationalShapeConfig.js - Point-mass (sphere), ring (torus), plane shape definitions

- [ ] **generation/generators/** - Core and layered generation
  - [ ] CoreLayerGenerator.js - Simple uniform fill for core chunks (0-100% of gravitational radius)
    - Bright core (0-20% radius, emissive yellow)
    - Medium core (20-50% radius, emissive orange)
    - Stone mantle (50-100% radius, gray stone)
  - [ ] LayeredPlanetGenerator.js - Orchestrates core + terrain generation pipeline
    - Core layer generation (fast, uniform)
    - Surface terrain generation (complex, biome-based)
    - Water post-processing (fill empty below water level)
    - Surface chunk marking (isSurface flag)
    - Integration with fracture pattern
  - [ ] GasGiantGenerator.js - Gas giant .mvox creation (no chunks, impostor-only)

- [ ] **generation/fracture/** - Planet shattering system
  - [ ] FracturePattern.js - Voronoi fracture pattern generation
    - Fibonacci sphere distribution (3-5 fragments for simple splits)
    - Fragment ID lookup for any point
    - Boundary chunk detection
    - Serialization for .mvox storage
  - [ ] PlanetFracturer.js - Execute planet splitting on collision
    - Split chunks by fragment ID
    - Calculate new gravitational centers per fragment
    - Generate child .mvox files with updated metadata
    - Preserve core layer structure in fragments

- [ ] **generation/postprocess/** - Post-generation processing
  - [ ] WaterFiller.js - Fill empty voxels below water level radius
  - [ ] ChunkClassifier.js - Mark surface chunks, core chunks, boundary chunks

- [ ] **storage/** - .mvox format extensions
  - [ ] Update MVoxFile.js with fracture tracking metadata:
    - `objectType` - "voxel_planet" | "gas_giant"
    - `originalObjectFilename` - Source file before shattering
    - `hasShattered` - true for debris fragments
    - `shatterGeneration` - Split depth counter (0 = original)
    - `parentFragmentID` - Which fragment of parent
    - `impostorOnly` - true for gas giants
    - `atmosphereConfig` - Gas giant atmospheric properties
    - `coreLayers` - Array of layer definitions (minRadius, maxRadius, voxelType)
    - `terrainMinHeight` / `terrainMaxHeight` - Terrain generation bounds
    - `waterLevel` - Post-process water fill radius
    - `fracturePattern` - Pre-computed Voronoi centers

- [ ] **rendering/** - Gas giant rendering
  - [ ] GasGiantRenderer.js - Shader-based impostor with animated atmospheric bands
  - [ ] shaders/gas-giant.vert.glsl - Gas giant vertex shader
  - [ ] shaders/gas-giant.frag.glsl - Gas giant fragment shader with procedural bands

- [ ] **systems/** - Integration and collision
  - [ ] PlanetTypeDetector.js - Route to voxel system vs impostor rendering based on objectType
  - [ ] CollisionSystem.js - Detect collisions, preload fracture zones, execute splits
    - Gas giants don't shatter (visual effects only)
    - Voxel planets fracture into debris
    - Preload boundary chunks 10 seconds before impact

- [ ] **data/voxel/** - Core voxel types
  - [ ] Add to VoxelTypes.js:
    - CORE_BRIGHT (emissive yellow, inner core)
    - CORE_MEDIUM (emissive orange, outer core)
    - Update existing STONE for mantle layer

- [ ] **Modifications to Existing Files:**
  - [ ] SphereGenerator.js - Remove water generation, integrate with LayeredPlanetGenerator
  - [ ] BiomeConfiguration.js - Add terrainMinHeight, terrainMaxHeight, waterLevel properties

**Key Implementation Principles:**
- Core layers based on distance from gravitational center (sphere/torus/plane agnostic)
- Default core layer radii: 0-20%, 20-50%, 50-100% of gravitational radius (configurable)
- Shell generation uses exclusive ranges with `break` to prevent overlap
- Water is post-processing: fill empty voxels below water level radius
- All chunks stored in .mvox (core layers optimize generation speed, not storage)
- Fracture patterns pre-computed and stored for deterministic shattering (3-5 fragments)
- Gas giants: zero voxels, pure impostor rendering, cannot shatter

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

**Last Updated:** 2025-01-16
**Architecture Version:** 2.1.0 (Layered Planet Generation & Fracturing)
**Implementation Status:** Generation Architecture Planning Complete

### Version 2.1.0 Changes (2025-01-16)
- ✨ **NEW**: Layered Planet Generation System (Phase 0.5)
  - Core layer architecture (bright core → medium core → stone mantle)
  - Distance-based shell generation (sphere/torus/plane agnostic)
  - Water post-processing (fill empty voxels below water level)
  - Surface chunk classification for load prioritization
- ✨ **NEW**: Planet Fracturing System
  - Voronoi-based fracture patterns (3-5 fragments for simple splits)
  - Deterministic shattering with pre-computed patterns
  - Fragment metadata tracking (generation depth, parent lineage)
  - Boundary chunk preloading on collision detection
- ✨ **NEW**: Multiple Planet Types
  - Voxel planets (full chunk generation with core layers)
  - Gas giants (impostor-only, zero voxels, no shattering)
  - Planet type detection and routing system
- ✨ **NEW**: .mvox Format Extensions
  - Fracture tracking metadata (originalObjectFilename, hasShattered, shatterGeneration)
  - Object type discrimination (voxel_planet vs gas_giant)
  - Core layer configuration storage
  - Terrain bounds and water level properties

### Version 2.0.0 Changes (2025-01-15)
- ✨ **NEW**: Parallel Asynchronous Chunk Loading System (3 loaders with priority queue)
- ✨ **NEW**: 4×4×4 Chunk Batching with Material Separation (93% draw call reduction)
- ✨ **NEW**: Dynamic Impostor Culling (10-15% GPU savings)
- ✨ **NEW**: Hierarchical Spatial Structure (Supercluster → Galaxy → System → Planet)
- ✨ **NEW**: System Capture Zone with Lighting Transitions
- ✨ **NEW**: Surface Chunk Detection at Generation Time
- 📈 **PLANNED**: 3D Greedy Meshing (30-50% additional reduction)
- 📈 **PLANNED**: Indexed Geometry (33% vertex buffer reduction)
- 📈 **PLANNED**: Batch-Relative Coordinates (eliminates precision jitter)
- 📈 **PLANNED**: Web Worker Async Meshing (non-blocking)
#   p o l y m i r 
 
 
