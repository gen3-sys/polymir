/**
 * ExportSystem.js
 * Handles .mvox export with typed headers
 */

import { MvoxType, MvoxCollisionMode, createMvoxHeader } from './MvoxTypes.js';

export class ExportSystem {
  constructor(voxelWorld, buildManager, playerController, wandTool = null) {
    this.voxelWorld = voxelWorld;
    this.buildManager = buildManager;
    this.playerController = playerController;
    this.wandTool = wandTool;
  }

  /**
   * Export build as .mvox file (JSON header + NBT voxel data)
   * type: MvoxType enum value (BUILD, PLANET, SHIP, etc.)
   */
  exportMvox(buildId, type = MvoxType.BUILD, customMetadata = {}) {
    const build = this.buildManager.getBuildData(buildId);
    if (!build) {
      this.playerController.clearInputs();
      alert('Build not found!');
      return;
    }

    const voxels = this.voxelWorld.getBuildVoxels(buildId);

    
    const bounds = this.calculateBounds(voxels);

    
    const metadata = {
      author: build.owner,
      name: build.name,
      bounds: bounds,
      tags: build.tags,
      ...customMetadata
    };

    
    if (this.wandTool) {
      const wandData = this.wandTool.exportData();
      metadata.portal_regions = wandData.portal_regions;
      metadata.variation_regions = wandData.variation_regions;
      metadata.spawn_points = wandData.spawn_points;
      metadata.win_zones = wandData.win_zones;
      metadata.fail_zones = wandData.fail_zones;
      metadata.gravity_zones = wandData.gravity_zones;
    }

    
    const header = createMvoxHeader(type, metadata);

    
    const voxelData = {
      voxels: voxels.map(v => ({
        pos: [v.x, v.y, v.z],
        scale: v.scale,
        color: v.color,
        alpha: v.alpha
      })),
      children: [] 
    };

    
    const headerString = JSON.stringify(header, null, 2);
    const dataString = JSON.stringify(voxelData, null, 2);
    const mvoxContent = `${headerString}\n${dataString}`;

    
    this.downloadFile(`${build.id}.mvox`, mvoxContent);

    
    this.buildManager.markBuildAsSaved(buildId);
  }

  /**
   * Calculate bounding box for voxels
   */
  calculateBounds(voxels) {
    if (voxels.length === 0) return [0, 0, 0];

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const v of voxels) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      minZ = Math.min(minZ, v.z);
      maxX = Math.max(maxX, v.x + v.scale);
      maxY = Math.max(maxY, v.y + v.scale);
      maxZ = Math.max(maxZ, v.z + v.scale);
    }

    return [
      Math.ceil(maxX - minX),
      Math.ceil(maxY - minY),
      Math.ceil(maxZ - minZ)
    ];
  }

  /**
   * Export build as JSON (original format)
   */
  exportJSON(buildId) {
    const build = this.buildManager.getBuildData(buildId);
    if (!build) {
      this.playerController.clearInputs();
      alert('Build not found!');
      return;
    }

    const voxels = this.voxelWorld.getBuildVoxels(buildId);

    
    const exportData = {
      version: 1,
      buildId: build.id,
      owner: build.owner,
      name: build.name,
      voxelCount: build.voxelCount,
      created: build.created,
      tags: build.tags,
      children: [],
      voxels: voxels.map(v => ({
        pos: [v.x, v.y, v.z],
        scale: v.scale,
        color: v.color,
        alpha: v.alpha
      }))
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    this.downloadFile(`${build.id}.json`, jsonString);

    
    this.buildManager.markBuildAsSaved(buildId);
  }

  /**
   * Export build as NBT (stub)
   */
  exportNBT(buildId) {
    this.playerController.clearInputs();
    alert('NBT export not yet implemented. This will generate Minecraft-compatible NBT format for texture bridge in future updates.');
  }

  /**
   * Trigger file download
   */
  downloadFile(filename, content) {
    const blob = new Blob([content], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
