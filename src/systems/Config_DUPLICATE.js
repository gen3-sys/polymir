/**
 * Config.js
 * Centralized configuration constants
 */

export const Config = Object.freeze({
  
  PLAYER: {
    WIDTH: 0.6,
    HEIGHT: 1.8,
    HALF_WIDTH: 0.3,
    MOVE_SPEED: 5.0,
    FLY_SPEED: 10.0,
    JUMP_VELOCITY: 6.325, 
    GRAVITY: -20.0,
    COLLISION_TOLERANCE: 0.2,
    DOUBLE_TAP_DELAY_MS: 300,
    MAX_STEP_HEIGHT: 0.5 
  },

  
  VOXEL: {
    BLOCK_SCALE: 1.0,
    MICROBLOCK_SCALE: 0.0625,
    SUBDIVISION_RATIO: 16,
    MAX_BRUSH_SIZE: 10,
    MIN_BRUSH_SIZE: 1,
    RAYCAST_MAX_DISTANCE: 100
  },

  
  BUILD: {
    MIN_COMPONENTS_FOR_SPLIT: 3,
    DEFAULT_COLOR: '#808080',
    DEFAULT_ALPHA: 1.0,
    ID_PREFIX: 'Build_',
    ID_PADDING: 3
  },

  
  WORLD: {
    MIN_Y: -64,
    MAX_Y: 256,
    PLATFORM_SIZE: 128,
    PLATFORM_Y: 0,
    SPAWN_X: 64,
    SPAWN_Y: 10,
    SPAWN_Z: 64
  },

  
  PERFORMANCE: {
    MAX_VOXELS_PER_BUILD: 100000,
    GREEDY_MESH_TOLERANCE: 0.5,
    MAX_SAVE_SIZE_BYTES: 5 * 1024 * 1024 
  },

  
  CAMERA: {
    FOV: 75,
    NEAR: 0.1,
    FAR: 1000,
    MOUSE_SENSITIVITY: 0.002,
    MAX_PITCH: Math.PI / 2
  },

  
  UI: {
    DEFAULT_USERS: ['ZEN', 'EOSYN', 'SYN'],
    DEFAULT_USER: 'ZEN'
  }
});
