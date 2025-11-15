/**
 * MvoxTypes.js
 * Type definitions for .mvox file format
 */

export const MvoxType = Object.freeze({
  BUILD: 'build',
  ITEM: 'item',
  PLANET: 'planet',
  SHIP: 'ship',
  STRUCTURE: 'structure'
});

export const MvoxCollisionMode = Object.freeze({
  SOLID: 'solid',           // Normal solid collision (builds, items)
  TERRAIN: 'terrain',       // Destructible terrain (planets)
  GHOSTED: 'ghosted',       // No collision (decorative)
  PLATFORM: 'platform'      // Special platform type (don't allow building inside)
});

/**
 * Creates .mvox header with type-specific metadata
 */
export function createMvoxHeader(type, metadata = {}) {
  const baseHeader = {
    version: 1,
    type: type,
    compression: 'gzip',
    nbt_schema: `polymir_${type}_v1`,
    scale_label: 'block', // Default, can be overridden
    created: Date.now()
  };

  
  const typeDefaults = {
    [MvoxType.BUILD]: {
      collision_mode: MvoxCollisionMode.SOLID,
      metadata: {
        author: 'unknown',
        name: 'Untitled Build',
        bounds: [0, 0, 0],
        tags: {}
      }
    },
    [MvoxType.PLANET]: {
      collision_mode: MvoxCollisionMode.TERRAIN,
      metadata: {
        radius: 100,
        gravity: 9.8,
        atmosphere: true,
        seed: Math.random(),
        biomes: []
      }
    },
    [MvoxType.SHIP]: {
      collision_mode: MvoxCollisionMode.SOLID,
      metadata: {
        author: 'unknown',
        name: 'Untitled Ship',
        mass: 0,
        control_block: null,
        thrust_blocks: []
      }
    },
    [MvoxType.ITEM]: {
      collision_mode: MvoxCollisionMode.SOLID,
      metadata: {
        stack_size: 1,
        icon: null
      }
    },
    [MvoxType.STRUCTURE]: {
      collision_mode: MvoxCollisionMode.SOLID,
      metadata: {
        author: 'unknown',
        name: 'Untitled Structure'
      }
    }
  };

  const defaults = typeDefaults[type] || typeDefaults[MvoxType.BUILD];

  return {
    ...baseHeader,
    ...defaults,
    metadata: {
      ...defaults.metadata,
      ...metadata
    }
  };
}
