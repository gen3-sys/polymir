# POLYMIR Voxel Avatar System

## Overview

A complete voxel-based avatar system that allows players to sculpt custom avatars from voxels, automatically rigged to a VRM-compatible skeleton for animations. Avatars can render in "cube mode" (chunky) or "smooth mode" (greedy-meshed), with full expression support and physics-enabled accessories.

**Design Goals:**
- Maximum avatar file size: ~10KB compressed
- Render 50+ avatars on screen at 60fps
- Full VRM animation compatibility via three-vrm
- Seamless integration with existing POLYMIR voxel pipeline

---

## Technical Specifications

### Avatar Voxel Grid
```
Dimensions: 32 x 64 x 32 (width x height x depth)
Max voxels: 65,536 (typically 2,000-8,000 used)
Voxel size: 1 unit = ~3cm real-world scale
Total height: ~1.9m (64 * 3cm)
```

### Palette Constraints
```
Colors per avatar: 16 max
Color source: MaterialPalette system (consistency with world)
Special types:
  - Solid (standard)
  - Emissive (glowing eyes, accessories)
  - Transparent (visors, wings)
```

### VRM Bone Mapping Regions
```
Y-Axis Regions (bottom to top):
  0-8:   Feet
  8-20:  Lower legs
  20-32: Upper legs
  32-36: Hips
  36-48: Spine/Torso
  48-52: Chest
  52-56: Neck
  56-64: Head

X-Axis Regions (for arms):
  0-6:   Right arm
  6-10:  Right shoulder
  10-22: Torso center
  22-26: Left shoulder
  26-32: Left arm

Z-Axis: Front/back distinction for face, spine curve
```

### Expression System
```
Method: Voxel pattern swapping for face region (Y:56-64, X:10-22, Z:20-32)
Expressions:
  - neutral (default)
  - happy (raised mouth corners)
  - sad (lowered mouth corners)
  - angry (furrowed brow)
  - surprised (wide eyes, open mouth)
  - blink (closed eyes)

Storage: Each expression stores only delta voxels from neutral (~50-200 voxels)
```

### Spring Bone Regions (Physics)
```
Configurable regions that simulate physics:
  - Hair (top/back of head)
  - Ears (side of head, for animal avatars)
  - Tail (extends from hip region)
  - Cape/clothing (back torso)
  - Accessories (marked by creator)

Physics params per region:
  - stiffness: 0.0-1.0
  - damping: 0.0-1.0
  - gravity: vec3
```

---

## File Structure

```
src/avatar/
├── data/
│   ├── VoxelAvatarData.js        # Core data structure
│   ├── AvatarPalette.js          # Color palette management
│   ├── AvatarExpressions.js      # Expression delta storage
│   └── AvatarSerializer.js       # Compress/decompress for storage
│
├── rig/
│   ├── VoxelAvatarRig.js         # Bone hierarchy and mapping
│   ├── BoneRegionMapper.js       # Voxel position → bone assignment
│   ├── WeightCalculator.js       # Smooth weights at joints
│   └── SpringBoneConfig.js       # Physics region setup
│
├── render/
│   ├── VoxelAvatarRenderer.js    # Main renderer orchestrator
│   ├── CubeModeRenderer.js       # Instanced cube rendering
│   ├── SmoothModeRenderer.js     # Greedy-meshed rendering
│   ├── AvatarLODController.js    # Distance-based LOD switching
│   └── AvatarMaterialManager.js  # Material/shader management
│
├── animation/
│   ├── VRMBridge.js              # three-vrm integration
│   ├── AvatarAnimationMixer.js   # Animation state machine
│   ├── ExpressionController.js   # Face expression transitions
│   └── LookAtController.js       # Eye/head tracking
│
├── editor/
│   ├── VoxelAvatarEditor.js      # Main editor component
│   ├── EditorTools.js            # Pencil, eraser, fill, etc.
│   ├── EditorHistory.js          # Undo/redo system
│   ├── TemplateLibrary.js        # Starter templates
│   ├── ExpressionEditor.js       # Face expression editor
│   ├── SpringBoneEditor.js       # Physics region marking
│   └── AvatarPreview.js          # Animated preview panel
│
└── multiplayer/
    ├── AvatarNetworkSync.js      # Position/animation sync
    ├── AvatarCache.js            # LRU cache for other players' avatars
    └── AvatarImpostor.js         # Distant avatar rendering

backend/
├── src/api/routes/avatars.js     # REST API endpoints
└── migrations/003_avatars_schema.sql
```

---

## Implementation Phases

### Phase 1: Data Foundation
**Goal:** Establish core data structures and serialization

- [ ] **1.1 VoxelAvatarData.js** - Core avatar data class
  - Voxel grid storage (sparse map for efficiency)
  - Palette array (16 colors max)
  - Metadata (name, creator ID, timestamps)
  - Render preference flag
  - Validation methods

- [ ] **1.2 AvatarPalette.js** - Palette management
  - Integration with MaterialPalette system
  - Color slot assignment
  - Emissive/transparent type flags
  - Palette presets (skin tones, hair colors, etc.)

- [ ] **1.3 AvatarSerializer.js** - Compression and storage
  - Run-length encoding for voxel grid
  - Delta compression for expressions
  - Binary format specification
  - Import/export to JSON (editor use)
  - Target: <10KB compressed for full avatar

- [ ] **1.4 Unit tests** - Data layer verification
  - Serialization round-trip tests
  - Compression ratio benchmarks
  - Palette constraint enforcement

**Estimated file sizes:**
- VoxelAvatarData.js: ~300 lines
- AvatarPalette.js: ~150 lines
- AvatarSerializer.js: ~400 lines

---

### Phase 2: Rigging System
**Goal:** Map voxels to VRM-compatible bone hierarchy

- [ ] **2.1 VoxelAvatarRig.js** - Main rig class
  - VRM humanoid bone hierarchy (55 bones)
  - Bone transform management
  - Pose application methods
  - T-pose / A-pose defaults

- [ ] **2.2 BoneRegionMapper.js** - Voxel-to-bone assignment
  - Y/X/Z region definitions (configurable)
  - Automatic bone assignment from voxel position
  - Manual override support (for custom shapes)
  - Visualization helpers (debug bone regions)

- [ ] **2.3 WeightCalculator.js** - Smooth joint deformation
  - Linear blend weights at region boundaries
  - Configurable blend distance
  - Weight painting preview
  - Optimization: pre-calculate and cache weights

- [ ] **2.4 SpringBoneConfig.js** - Physics setup
  - Region marking (which voxels have physics)
  - Chain detection (connected physics voxels)
  - Parameter presets (hair, cape, ears, tail)
  - Integration with three-vrm spring bones

**Estimated file sizes:**
- VoxelAvatarRig.js: ~400 lines
- BoneRegionMapper.js: ~300 lines
- WeightCalculator.js: ~250 lines
- SpringBoneConfig.js: ~200 lines

---

### Phase 3: Rendering Pipeline
**Goal:** Efficient avatar rendering in both cube and smooth modes

- [ ] **3.1 VoxelAvatarRenderer.js** - Render orchestrator
  - Mode selection (cube/smooth/auto)
  - Bone transform application
  - Frustum culling
  - Render state management

- [ ] **3.2 CubeModeRenderer.js** - Chunky voxel rendering
  - Instanced cube rendering per bone group
  - Bone transform as instance attribute
  - Color from palette as instance attribute
  - Optimization: merge static bone groups

- [ ] **3.3 SmoothModeRenderer.js** - Greedy-meshed rendering
  - Integration with existing GreedyMesher
  - Per-bone-group mesh generation
  - Mesh caching (regenerate only on pose change)
  - Optional: marching cubes for organic look

- [ ] **3.4 AvatarLODController.js** - Distance-based LOD
  - LOD levels:
    - Near (<20 units): Full detail, smooth mode
    - Medium (20-50 units): Cube mode
    - Far (50-100 units): Simplified cube (skip small voxels)
    - Distant (>100 units): Billboard impostor
  - Smooth transitions between LOD levels

- [ ] **3.5 AvatarMaterialManager.js** - Shader management
  - Palette-based coloring shader
  - Emissive support
  - Transparency handling
  - Outline shader (optional, for visibility)

**Estimated file sizes:**
- VoxelAvatarRenderer.js: ~350 lines
- CubeModeRenderer.js: ~400 lines
- SmoothModeRenderer.js: ~350 lines
- AvatarLODController.js: ~200 lines
- AvatarMaterialManager.js: ~250 lines

---

### Phase 4: Animation Integration
**Goal:** Full VRM animation support via three-vrm

- [ ] **4.1 VRMBridge.js** - three-vrm integration
  - VRM humanoid bone name mapping
  - Animation clip conversion
  - First-person mode (hide head voxels)
  - VRM meta handling

- [ ] **4.2 AvatarAnimationMixer.js** - Animation state machine
  - State definitions (idle, walk, run, jump, emote)
  - Blend trees for smooth transitions
  - Animation layering (base + additive)
  - Speed/timescale control

- [ ] **4.3 ExpressionController.js** - Facial expressions
  - Expression blending (interpolate between swaps)
  - Automatic blink cycle
  - Emotion triggers from game events
  - Lip-sync ready (phoneme → expression mapping)

- [ ] **4.4 LookAtController.js** - Eye/head tracking
  - Target position tracking
  - Head rotation limits
  - Eye voxel offset (if eyes are separate)
  - Smooth interpolation

- [ ] **4.5 Animation library** - Base animations
  - Idle (breathing, subtle movement)
  - Walk cycle
  - Run cycle
  - Jump
  - Basic emotes (wave, dance, sit)

**Estimated file sizes:**
- VRMBridge.js: ~450 lines
- AvatarAnimationMixer.js: ~350 lines
- ExpressionController.js: ~250 lines
- LookAtController.js: ~150 lines

---

### Phase 5: Editor - Core
**Goal:** Basic voxel sculpting interface

- [ ] **5.1 VoxelAvatarEditor.js** - Main editor component
  - Three.js canvas with orbit controls
  - Tool panel integration
  - Palette panel integration
  - Save/load functionality
  - Preview panel
  - Responsive layout

- [ ] **5.2 EditorTools.js** - Sculpting tools
  - Pencil (single voxel place)
  - Eraser (single voxel remove)
  - Box select (region operations)
  - Fill (flood fill same color)
  - Paint (change color, keep voxel)
  - Mirror mode (X-axis symmetry)
  - Eyedropper (pick color from voxel)

- [ ] **5.3 EditorHistory.js** - Undo/redo
  - Action recording
  - State snapshots (every N actions)
  - Memory-efficient diff storage
  - Keyboard shortcuts (Ctrl+Z, Ctrl+Y)

- [ ] **5.4 TemplateLibrary.js** - Starter templates
  - Human base (male, female, neutral)
  - Robot base
  - Animal bases (cat, dog, bird)
  - Creature bases (slime, ghost)
  - Empty (start from scratch)

**Estimated file sizes:**
- VoxelAvatarEditor.js: ~600 lines
- EditorTools.js: ~400 lines
- EditorHistory.js: ~200 lines
- TemplateLibrary.js: ~300 lines

---

### Phase 6: Editor - Advanced
**Goal:** Expression editing, physics marking, and polish

- [ ] **6.1 ExpressionEditor.js** - Face expression creation
  - Face region isolation view
  - Expression slot selection
  - Delta voxel editing (changes from neutral)
  - Preview expression on avatar
  - Copy/mirror expression data

- [ ] **6.2 SpringBoneEditor.js** - Physics region marking
  - Paint mode for physics regions
  - Chain visualization
  - Parameter sliders per region
  - Real-time physics preview
  - Presets (hair, cape, tail)

- [ ] **6.3 AvatarPreview.js** - Live preview panel
  - Animation playback
  - Expression testing
  - Render mode toggle (cube/smooth)
  - Lighting preview
  - Turntable auto-rotate

- [ ] **6.4 Editor UI polish**
  - Keyboard shortcuts reference
  - Tool tooltips
  - Grid/guide toggles
  - Bone region overlay toggle
  - Color palette organization
  - Auto-save drafts

**Estimated file sizes:**
- ExpressionEditor.js: ~350 lines
- SpringBoneEditor.js: ~300 lines
- AvatarPreview.js: ~250 lines

---

### Phase 7: Backend Integration
**Goal:** Database storage and API endpoints

- [ ] **7.1 Database schema** - migrations/003_avatars_schema.sql
  ```sql
  CREATE TABLE avatars (
    id UUID PRIMARY KEY,
    owner_id UUID REFERENCES players(id),
    name VARCHAR(64) NOT NULL,
    voxel_data BYTEA NOT NULL,        -- Compressed voxel grid
    rig_config JSONB,                  -- Bone weights, expressions
    thumbnail BYTEA,                   -- Auto-generated preview
    render_preference VARCHAR(16),     -- 'cube', 'smooth', 'auto'
    is_public BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,  -- Player's active avatar
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
  );

  CREATE INDEX idx_avatars_owner ON avatars(owner_id);
  CREATE INDEX idx_avatars_public ON avatars(is_public) WHERE is_public = true;
  ```

- [ ] **7.2 avatars.js** - REST API routes
  - POST /api/avatars - Create new avatar
  - GET /api/avatars/:id - Get avatar by ID
  - GET /api/avatars/mine - List player's avatars
  - PUT /api/avatars/:id - Update avatar
  - DELETE /api/avatars/:id - Delete avatar
  - POST /api/avatars/:id/publish - Make public
  - GET /api/avatars/public - Browse public avatars
  - POST /api/avatars/:id/clone - Clone public avatar

- [ ] **7.3 Avatar validation**
  - Voxel count limits
  - Palette size enforcement
  - File size limits
  - Content moderation hooks (future)

- [ ] **7.4 Thumbnail generation**
  - Server-side rendering (headless Three.js)
  - OR client-generated on save
  - Standard size: 256x256 PNG

**Estimated file sizes:**
- 003_avatars_schema.sql: ~50 lines
- avatars.js: ~400 lines

---

### Phase 8: Multiplayer Integration
**Goal:** Sync avatars between players efficiently

- [ ] **8.1 AvatarNetworkSync.js** - Real-time sync
  - Avatar ID broadcast on join
  - Pose/animation state sync (compressed)
  - Expression state sync
  - Bandwidth optimization (delta updates)

- [ ] **8.2 AvatarCache.js** - Client-side caching
  - LRU cache for loaded avatar data
  - IndexedDB persistence
  - Cache invalidation on avatar update
  - Preload nearby players' avatars

- [ ] **8.3 AvatarImpostor.js** - Distant rendering
  - Billboard sprite generation
  - Color-sampled impostor (dominant colors)
  - Smooth transition to full render
  - Shadow proxy (simple shape)

- [ ] **8.4 Bandwidth optimization**
  - Avatar data: load once, cache forever (until version change)
  - Pose updates: 10Hz compressed quaternions
  - Expression: event-based (only on change)

**Estimated file sizes:**
- AvatarNetworkSync.js: ~300 lines
- AvatarCache.js: ~250 lines
- AvatarImpostor.js: ~200 lines

---

### Phase 9: Optimization
**Goal:** Performance tuning for 50+ avatars at 60fps

- [ ] **9.1 Rendering optimization**
  - GPU instancing for cube mode
  - Geometry merging for smooth mode
  - Shader LOD (simpler shaders at distance)
  - Occlusion culling
  - Render batching by material

- [ ] **9.2 Animation optimization**
  - Bone transform caching
  - Skip updates for off-screen avatars
  - Reduced update rate at distance
  - Animation LOD (fewer bones at distance)

- [ ] **9.3 Memory optimization**
  - Voxel data sharing (instanced templates)
  - Mesh pooling and reuse
  - Texture atlas for palettes
  - Unload distant avatar meshes

- [ ] **9.4 Loading optimization**
  - Progressive loading (silhouette → full detail)
  - Priority queue (closest first)
  - Background worker decompression
  - Predictive loading (load direction of movement)

- [ ] **9.5 Profiling and benchmarks**
  - 50 avatar stress test
  - Memory usage tracking
  - Draw call analysis
  - Frame time breakdown

---

### Phase 10: Polish and Testing
**Goal:** Complete, tested, documented system

- [ ] **10.1 Test pages**
  - tests/voxel_avatar_editor_test.html
  - tests/avatar_animation_test.html
  - tests/avatar_multiplayer_test.html
  - tests/avatar_performance_test.html

- [ ] **10.2 Error handling**
  - Graceful fallback for corrupt avatar data
  - Network failure recovery
  - Missing animation handling
  - Invalid palette recovery

- [ ] **10.3 Accessibility**
  - Keyboard navigation in editor
  - Color-blind friendly palette indicators
  - Screen reader labels

- [ ] **10.4 Documentation**
  - Avatar format specification
  - Editor user guide
  - API documentation
  - Performance guidelines

---

## Dependency Graph

```
Phase 1 (Data) ─────┬──────────────────────────────────────┐
                    │                                      │
                    ▼                                      ▼
Phase 2 (Rig) ──────┼────► Phase 4 (Animation)    Phase 7 (Backend)
                    │              │                       │
                    ▼              ▼                       │
Phase 3 (Render) ◄──┴──────────────┘                       │
        │                                                  │
        ▼                                                  ▼
Phase 5 (Editor Core) ────► Phase 6 (Editor Adv) ◄────────┘
        │                          │
        ▼                          ▼
Phase 8 (Multiplayer) ◄────────────┘
        │
        ▼
Phase 9 (Optimization)
        │
        ▼
Phase 10 (Polish)
```

---

## Implementation Order (Batch Plan)

### Batch 1: Foundation (Phases 1-2)
Files: VoxelAvatarData.js, AvatarPalette.js, AvatarSerializer.js, VoxelAvatarRig.js, BoneRegionMapper.js, WeightCalculator.js, SpringBoneConfig.js

**Deliverable:** Avatar data can be created, serialized, and rigged to bones

### Batch 2: Rendering (Phase 3)
Files: VoxelAvatarRenderer.js, CubeModeRenderer.js, SmoothModeRenderer.js, AvatarLODController.js, AvatarMaterialManager.js

**Deliverable:** Avatars render in cube and smooth modes with LOD

### Batch 3: Animation (Phase 4)
Files: VRMBridge.js, AvatarAnimationMixer.js, ExpressionController.js, LookAtController.js

**Deliverable:** Avatars animate with VRM-compatible animations

### Batch 4: Editor Core (Phase 5)
Files: VoxelAvatarEditor.js, EditorTools.js, EditorHistory.js, TemplateLibrary.js
Test: tests/voxel_avatar_editor_test.html

**Deliverable:** Functional voxel avatar editor

### Batch 5: Editor Advanced (Phase 6)
Files: ExpressionEditor.js, SpringBoneEditor.js, AvatarPreview.js

**Deliverable:** Complete editor with expressions and physics

### Batch 6: Backend (Phase 7)
Files: 003_avatars_schema.sql, avatars.js

**Deliverable:** Avatars persist to database

### Batch 7: Multiplayer (Phase 8)
Files: AvatarNetworkSync.js, AvatarCache.js, AvatarImpostor.js

**Deliverable:** See other players' avatars

### Batch 8: Optimization & Polish (Phases 9-10)
Focus: Performance tuning, testing, documentation

**Deliverable:** Production-ready avatar system

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Avatar file size | <10KB compressed |
| Editor load time | <2 seconds |
| Avatar render time | <1ms per avatar |
| 50 avatars at 60fps | Maintain 60fps |
| Animation smoothness | No visible jitter |
| Cache hit rate | >90% for repeated avatars |

---

## Open Questions

1. **Expression interpolation**: Should we blend between voxel patterns or hard-swap?
2. **Animation source**: Ship with animations or load from VRM files?
3. **Avatar marketplace**: Allow selling avatars or purely free sharing?
4. **Content moderation**: How to handle inappropriate avatars?
5. **Avatar accessories**: Separate attachment system or built into base avatar?

---

## Changelog

- **v1.0** (2025-01-XX): Initial system design
