# Biome Configuration System Integration

## Architecture Overview

The biome configuration system provides professional-grade integration between the UI, game engine, and terrain generation systems.

## Components

### 1. BiomeConfiguration (`src/config/BiomeConfiguration.js`)
Central state management for all biome-related settings.

**Key Features:**
- Manages biome distribution (desert: 10%, forest: 15%, etc.)
- Handles global structure settings
- Provides biome-specific settings (vegetation, resources, structures)
- Automatic persistence to localStorage
- Event-driven architecture with BiomeConfigEventBus

**Usage:**
```javascript
import { BiomeConfiguration } from './config/BiomeConfiguration.js';

// Load existing or create new
const config = BiomeConfiguration.loadFromLocalStorage() || new BiomeConfiguration();

// Update biome distribution
config.setBiomeDistribution('desert', 25);

// Get biome at world position
const biome = config.getBiomeAt(x, y, z);

// Get color for terrain layering
const color = config.getColorAtDepth('grassland', 10, 30);

// Save configuration
config.saveToLocalStorage();
```

### 2. BiomeConfigEventBus (`src/systems/BiomeConfigEventBus.js`)
Event system for live biome configuration updates.

**Events:**
- `DISTRIBUTION_CHANGED` - Biome weight changed
- `STRUCTURE_TOGGLED` - Structure enabled/disabled
- `VEGETATION_CHANGED` - Vegetation density changed
- `CONFIG_LOADED` - Configuration loaded from storage
- `CONFIG_SAVED` - Configuration saved to storage
- `PALETTE_CHANGED` - Material palette changed

**Usage:**
```javascript
import globalBiomeEventBus, { BIOME_EVENTS } from './systems/BiomeConfigEventBus.js';

// Listen for changes
globalBiomeEventBus.on(BIOME_EVENTS.DISTRIBUTION_CHANGED, (data) => {
    console.log(`${data.biome}: ${data.oldWeight}% → ${data.newWeight}%`);
});

// Emit custom events
globalBiomeEventBus.emit(BIOME_EVENTS.BIOME_SELECTED, { biome: 'crystal' });
```

### 3. BiomeSystem (`src/systems/BiomeSystem.js`)
Core biome definitions with voxel types, temperature, humidity, vegetation.

**Features:**
- 12 biome types with complete data
- Color ranges for terrain layering
- Block types (primary/secondary/rare)
- Environmental properties

### 4. MaterialPalette (`src/systems/MaterialPalette.js`)
Material rendering system with biome-specific palettes.

**Features:**
- Automatically generates palettes for each biome
- Temperature-based color shifts
- Star lighting integration

### 5. SphereGenerator (`src/generation/generators/SphereGenerator.js`)
Terrain generation using BiomeConfiguration.

**Integration:**
- Accepts BiomeConfiguration in constructor
- Uses biome data for color and voxel type selection
- Depth-based layering (surface → mid → deep)

### 6. UniverseCreationModal (`src/ui/UniverseCreationModal.js`)
UI for biome configuration.

**Features:**
- Visual biome cards with sliders
- Global structure settings
- Automatic save/load
- Event emission on changes

## Data Flow

```
User Interaction (UI)
    ↓
UniverseCreationModal
    ↓
BiomeConfiguration.setBiomeDistribution()
    ↓
BiomeConfigEventBus.emit(DISTRIBUTION_CHANGED)
    ↓
Game.setupBiomeEventListeners()
    ↓
SphereGenerator.biomeConfig updated
    ↓
New chunks generated with updated biomes
```

## Integration Points

### Game.js
```javascript
// Load configuration
this.biomeConfig = BiomeConfiguration.loadFromLocalStorage('universe_biome_config');

// Pass to generator
const generator = new SphereGenerator(radius, voxelSize, this.biomeConfig);

// Listen for updates
this.setupBiomeEventListeners();
```

### UniverseCreationModal.js
```javascript
// Initialize
this.biomeConfig = BiomeConfiguration.loadFromLocalStorage('universe_biome_config');

// Update on user input
this.biomeConfig.setBiomeDistribution('desert', sliderValue);

// Save automatically
this.biomeConfig.saveToLocalStorage('universe_biome_config');
```

## Biome Data Structure

Each biome has:

```javascript
{
    blocks: {
        primary: VOXEL_TYPES.GRASS.id,      // Surface layer
        secondary: VOXEL_TYPES.DIRT.id,     // Mid layer
        rare: VOXEL_TYPES.STONE.id          // Deep layer / deposits
    },
    temperature: 20,                         // °C
    humidity: 50,                            // 0-100%
    vegetation: 0.6,                         // 0-1 density
    colorRange: [0x90EE90, 0x3DAB32, 0x8B5A3C]  // Surface → Deep
}
```

## Color Layering System

The `getColorAtDepth()` method provides smooth color transitions:

```javascript
// Grassland biome colors
colorRange: [
    0x90EE90,  // Light green (surface, 0% depth)
    0x3DAB32,  // Grass green (mid, 50% depth)
    0x8B5A3C   // Brown dirt (deep, 100% depth)
]
```

## Professional Standards

✅ **Separation of Concerns**: UI, state, events, generation are decoupled
✅ **Event-Driven**: Changes propagate automatically
✅ **Persistence**: LocalStorage integration with serialization
✅ **Type Safety**: Consistent data structures
✅ **Error Handling**: Try-catch blocks with logging
✅ **Documentation**: Inline comments and JSDoc
✅ **Performance**: Caching and efficient lookups
✅ **Extensibility**: Easy to add new biomes or features

## Adding a New Biome

1. Add to `BiomeSystem.biomes`:
```javascript
mybiome: {
    blocks: { primary: 1, secondary: 2, rare: 3 },
    temperature: 25,
    humidity: 40,
    vegetation: 0.5,
    colorRange: [0xRRGGBB, 0xRRGGBB, 0xRRGGBB]
}
```

2. Add to `BiomeConfiguration.distribution`:
```javascript
distribution: {
    // ... existing biomes
    mybiome: 10
}
```

3. Add to UI in `UniverseCreationModal.createEnhancedBiomeCards()`:
```javascript
{ type: 'mybiome', color: '#RRGGBB', structures: [...], vegetation: 50, resources: '...' }
```

4. MaterialPalette automatically generates the palette on initialization.

## Testing

```javascript
// Console testing
const config = new BiomeConfiguration();
config.setBiomeDistribution('lava', 50);
console.log(config.getNormalizedDistribution());

// Event testing
globalBiomeEventBus.on('*', (event) => console.log(event));

// Biome at position
const biome = config.getBiomeAt(100, 0, 50);
console.log(biome); // e.g., "desert"
```

## Future Enhancements

- Biome transition zones (blending between biomes)
- Procedural structure placement based on biome
- Seasonal biome variations
- Player-created custom biomes
- Import/export biome presets
- Network sync for multiplayer

