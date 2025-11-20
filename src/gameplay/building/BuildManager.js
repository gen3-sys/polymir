/**
 * BuildManager.js
 * Build metadata and ownership
 */

import { ErrorHandler } from './ErrorHandler.js';
import { Config } from './Config.js';

export class BuildManager {
  constructor() {
    
    this.builds = new Map();
    this.nextBuildId = 1;

    
    this.savedBuilds = new Set();

    
  }

  /**
   * Create a new build
   * Returns the generated buildId
   */
  createBuild(owner) {
    try {
      
      const validatedOwner = ErrorHandler.validateUsername(owner);

      const id = `${Config.BUILD.ID_PREFIX}${String(this.nextBuildId).padStart(Config.BUILD.ID_PADDING, '0')}`;
      this.nextBuildId++;

      const buildData = {
        id: id,
        owner: validatedOwner,
        name: id, 
        voxelCount: 0,
        created: Date.now(),
        saved: false, 
        tags: {}
      };

      this.builds.set(id, buildData);
      console.log(`[BuildManager] Created build ${id} for ${validatedOwner}`);
      return id;
    } catch (error) {
      console.error('[BuildManager] Failed to create build:', error);
      return null;
    }
  }

  /**
   * Delete a build by ID
   * Note: Does NOT remove voxels from VoxelWorld (caller must handle that)
   */
  deleteBuild(buildId) {
    return this.builds.delete(buildId);
  }

  /**
   * Get build metadata by ID
   * Returns metadata object or null
   */
  getBuildData(buildId) {
    return this.builds.get(buildId) || null;
  }

  /**
   * Update voxel count for a build
   * If count reaches 0, auto-delete the build
   */
  updateVoxelCount(buildId, delta) {
    const build = this.builds.get(buildId);
    if (!build) return;

    build.voxelCount += delta;

    
    if (build.voxelCount <= 0) {
      this.deleteBuild(buildId);
    }
  }

  /**
   * Get buildId at a specific position
   * Queries voxelWorld to find which build occupies that position
   */
  getBuildAtPosition(x, y, z, scale, voxelWorld) {
    const voxel = voxelWorld.getVoxel(x, y, z, scale);
    return voxel ? voxel.buildId : null;
  }

  /**
   * Check if user can edit a build
   * For "Add-Only" mode, anyone can add
   * For metadata editing, only owner can modify
   */
  canUserEdit(buildId, username) {
    const build = this.builds.get(buildId);
    if (!build) return false;

    
    return build.owner === username;
  }

  /**
   * Mark a build as saved/exported
   */
  markBuildAsSaved(buildId) {
    const build = this.builds.get(buildId);
    if (build) {
      build.saved = true;
      this.savedBuilds.add(buildId);
      console.log(`[BuildManager] Build ${buildId} marked as saved`);
    }
  }

  /**
   * Rename a build (also marks it as intentionally kept)
   */
  renameBuild(buildId, newName) {
    const build = this.builds.get(buildId);
    if (build) {
      build.name = newName;
      build.saved = true; 
      this.savedBuilds.add(buildId);
      console.log(`[BuildManager] Build ${buildId} renamed to "${newName}" and marked as saved`);
    }
  }

  /**
   * Get all builds as array
   * Returns array of build metadata objects
   */
  getAllBuilds() {
    return Array.from(this.builds.values());
  }

  /**
   * Get all builds owned by a specific user
   * Returns array of build metadata objects
   */
  getUserBuilds(username) {
    const userBuilds = [];
    for (const build of this.builds.values()) {
      if (build.owner === username) {
        userBuilds.push(build);
      }
    }
    return userBuilds;
  }

  /**
   * Get small unsaved builds that can be merged
   * Returns array of buildIds
   */
  getSmallUnsavedBuilds() {
    const smallBuilds = [];

    for (const [buildId, build] of this.builds) {
      
      if (buildId === 'platform' || buildId === 'WORLD' || buildId === 'WORLDMOD') continue;

      
      if (build.saved || this.savedBuilds.has(buildId)) continue;

      
      if (build.voxelCount <= 5 && build.voxelCount > 0) {
        smallBuilds.push(buildId);
      }
    }

    return smallBuilds;
  }

  /**
   * Merge multiple builds into one (for same-material clustering)
   */
  mergeBuilds(targetBuildId, sourceBuildIds, voxelWorld) {
    const targetBuild = this.builds.get(targetBuildId);
    if (!targetBuild) return false;

    let mergedVoxelCount = 0;

    for (const sourceId of sourceBuildIds) {
      const sourceBuild = this.builds.get(sourceId);
      if (sourceBuild && sourceId !== targetBuildId) {
        
        if (voxelWorld) {
          const sourceVoxels = voxelWorld.getBuildVoxels(sourceId);
          for (const voxel of sourceVoxels) {
            voxel.buildId = targetBuildId;
          }
        }

        mergedVoxelCount += sourceBuild.voxelCount;
        this.deleteBuild(sourceId);
      }
    }

    
    targetBuild.voxelCount += mergedVoxelCount;

    console.log(`[BuildManager] Merged ${sourceBuildIds.length} builds into ${targetBuildId}`);
    return true;
  }

  /**
   * Serialize build data for localStorage
   */
  save() {
    return {
      builds: Object.fromEntries(this.builds),
      nextBuildId: this.nextBuildId
    };
  }

  /**
   * Load build data from localStorage
   */
  load(data) {
    this.builds.clear();
    if (data.builds) {
      for (const [key, value] of Object.entries(data.builds)) {
        
        if (!value.created) {
          value.created = Date.now();
        }
        this.builds.set(key, value);
      }
    }
    if (data.nextBuildId) {
      this.nextBuildId = data.nextBuildId;
    }
  }

  /**
   * Clean up on destruction
   */
  destroy() {
    
  }
}
