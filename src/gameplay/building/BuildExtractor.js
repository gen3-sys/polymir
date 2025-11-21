/**
 * BuildExtractor.js
 * Extracts damage map clusters into .mvox schematics
 *
 * Takes a cluster of connected voxels from BuildDetector and:
 * 1. Normalizes positions to local coordinates
 * 2. Computes gravity vector from surface normal
 * 3. Creates MVoxFile with proper metadata
 * 4. Handles attribution for multi-contributor builds
 */

import { MVoxFile } from '../../serialization/formats/MVoxFile.js';
import { GravityAlignment } from '../../math/GravityAlignment.js';

export class BuildExtractor {
    constructor(options = {}) {
        // Default category for extracted builds
        this.defaultCategory = options.defaultCategory || 'player_build';

        // Auto-generate names?
        this.autoGenerateNames = options.autoGenerateNames !== false;
    }

    /**
     * Extract a cluster of voxels into an MVoxFile
     * @param {Object} buildCandidate - From BuildDetector.detectBuilds()
     * @param {Object} context - Additional context (body info, gravitational center, etc.)
     * @returns {MVoxFile}
     */
    extractToMVox(buildCandidate, context = {}) {
        const { voxels, bounds, contributors, primaryContributor } = buildCandidate;

        // Normalize voxel positions to local space (origin at min corner)
        const normalizedVoxels = this.normalizeVoxelPositions(voxels, bounds);

        // Compute gravity vector from context or surface normal
        const gravityVector = this.computeGravityVector(bounds, context);

        // Compute anchor point (default: center of bottom face)
        const anchorPoint = this.computeAnchorPoint(bounds, gravityVector);

        // Generate metadata
        const metadata = this.generateMetadata(buildCandidate, context, contributors, primaryContributor);

        // Create MVoxFile
        const mvox = new MVoxFile('build', normalizedVoxels, {
            ...metadata,
            gravityVector,
            anchorPoint,
            bounds: bounds.size,
            isComposite: false
        });

        return mvox;
    }

    /**
     * Normalize voxel positions so min corner is at origin
     * @param {Array} voxels - Damage map entries
     * @param {Object} bounds - Computed bounds from BuildDetector
     * @returns {Map} Voxel map with normalized positions
     */
    normalizeVoxelPositions(voxels, bounds) {
        const [minX, minY, minZ] = bounds.min;
        const normalizedMap = new Map();

        for (const voxel of voxels) {
            // Normalize to local space
            const localX = voxel.voxel_x - minX;
            const localY = voxel.voxel_y - minY;
            const localZ = voxel.voxel_z - minZ;

            // Encode key (assuming 32x32x32 max bounds for standard encoding)
            const key = localX | (localY << 5) | (localZ << 10);

            // Store voxel data
            normalizedMap.set(key, {
                type: voxel.voxel_type || 1,
                color: voxel.voxel_color || 0xFFFFFF
            });
        }

        return normalizedMap;
    }

    /**
     * Compute gravity vector based on build position relative to gravitational center
     * @param {Object} bounds - Build bounds
     * @param {Object} context - Must include gravitationalCenter
     * @returns {Array} Normalized gravity vector [x, y, z]
     */
    computeGravityVector(bounds, context) {
        if (!context.gravitationalCenter) {
            // Default to Y-down if no gravitational center provided
            return [0, -1, 0];
        }

        // Compute direction from build center to gravitational center
        const [gx, gy, gz] = context.gravitationalCenter;
        const [cx, cy, cz] = bounds.center;

        const dx = gx - cx;
        const dy = gy - cy;
        const dz = gz - cz;

        // Normalize
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 0.0001) {
            return [0, -1, 0]; // Fallback
        }

        return [dx / length, dy / length, dz / length];
    }

    /**
     * Compute anchor point for placement
     * Default: center of the face closest to gravity direction
     * @param {Object} bounds
     * @param {Array} gravityVector
     * @returns {Array} Anchor point [0-1, 0-1, 0-1]
     */
    computeAnchorPoint(bounds, gravityVector) {
        const [gx, gy, gz] = gravityVector;

        // Find dominant gravity axis
        const absX = Math.abs(gx);
        const absY = Math.abs(gy);
        const absZ = Math.abs(gz);

        // Anchor at center of "bottom" face
        if (absY >= absX && absY >= absZ) {
            // Y is dominant - anchor at bottom center
            return [0.5, gy > 0 ? 1 : 0, 0.5];
        } else if (absX >= absZ) {
            // X is dominant
            return [gx > 0 ? 1 : 0, 0.5, 0.5];
        } else {
            // Z is dominant
            return [0.5, 0.5, gz > 0 ? 1 : 0];
        }
    }

    /**
     * Generate metadata for the extracted schematic
     */
    generateMetadata(buildCandidate, context, contributors, primaryContributor) {
        const { voxelCount, bounds } = buildCandidate;

        // Generate name if auto-naming enabled
        let name = context.name;
        if (!name && this.autoGenerateNames) {
            name = this.generateBuildName(bounds, voxelCount);
        }

        return {
            name: name || 'Unnamed Build',
            description: context.description || '',
            author: primaryContributor || 'unknown',
            contributors: contributors.map(c => ({
                playerId: c.playerId,
                voxelCount: c.voxelCount,
                percentage: Math.round((c.voxelCount / voxelCount) * 100)
            })),
            category: context.category || this.defaultCategory,
            tags: context.tags || ['player_build'],
            biomes: context.biomes || [],
            created: Date.now(),

            // Source info
            sourceBodyId: context.bodyId || null,
            sourcePosition: bounds.center,
            extractedAt: Date.now()
        };
    }

    /**
     * Generate a descriptive name based on build characteristics
     */
    generateBuildName(bounds, voxelCount) {
        const [sizeX, sizeY, sizeZ] = bounds.size;
        const maxDim = Math.max(sizeX, sizeY, sizeZ);

        // Classify by size
        let sizeClass;
        if (voxelCount < 20) {
            sizeClass = 'Small';
        } else if (voxelCount < 100) {
            sizeClass = 'Medium';
        } else if (voxelCount < 500) {
            sizeClass = 'Large';
        } else {
            sizeClass = 'Massive';
        }

        // Classify by shape
        let shapeClass;
        if (sizeY > sizeX * 2 && sizeY > sizeZ * 2) {
            shapeClass = 'Tower';
        } else if (sizeX > sizeY * 2 || sizeZ > sizeY * 2) {
            shapeClass = 'Platform';
        } else if (Math.abs(sizeX - sizeZ) < 3 && sizeY < sizeX) {
            shapeClass = 'Dome';
        } else {
            shapeClass = 'Structure';
        }

        return `${sizeClass} ${shapeClass}`;
    }

    /**
     * Extract and create a composite build from multiple touching schematics
     * @param {Array} placements - Schematic placements to combine
     * @param {Object} context - Build context
     * @returns {Object} Composite build data for CentralLibraryDB.createCompositeBuild()
     */
    extractCompositeBuild(placements, context = {}) {
        // Compute combined bounds
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const p of placements) {
            const r = p.approximate_radius || 8;
            minX = Math.min(minX, p.position_x - r);
            minY = Math.min(minY, p.position_y - r);
            minZ = Math.min(minZ, p.position_z - r);
            maxX = Math.max(maxX, p.position_x + r);
            maxY = Math.max(maxY, p.position_y + r);
            maxZ = Math.max(maxZ, p.position_z + r);
        }

        const center = [
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        ];

        // Convert placements to component references
        const components = placements.map(p => ({
            schematicId: p.schematic_id,
            schematicCid: p.schematic_cid,
            offset: [
                p.position_x - center[0],
                p.position_y - center[1],
                p.position_z - center[2]
            ],
            rotation: [
                p.rotation_x || 0,
                p.rotation_y || 0,
                p.rotation_z || 0,
                p.rotation_w || 1
            ],
            layerId: p.layer_id || 0,
            layerScaleRatio: p.layer_scale_ratio || 1.0
        }));

        // Compute gravity vector for the composite
        const gravityVector = context.gravitationalCenter
            ? GravityAlignment.computeSurfaceNormal(center, context.gravitationalCenter)
                .map(v => -v) // Flip to point toward center
            : [0, -1, 0];

        return {
            buildData: {
                name: context.name || `Composite Build (${placements.length} parts)`,
                description: context.description || '',
                creatorId: context.creatorId,
                category: context.category || 'composite_build',
                tags: ['composite', ...(context.tags || [])],
                sizeX: Math.ceil(maxX - minX),
                sizeY: Math.ceil(maxY - minY),
                sizeZ: Math.ceil(maxZ - minZ),
                voxelCount: 0, // Composite doesn't have direct voxels
                fileCid: null, // Will be generated
                gravityVector,
                anchorPoint: [0.5, 0, 0.5]
            },
            components,
            center
        };
    }

    /**
     * Process detected builds and prepare them for server submission
     * @param {Array} builds - From BuildDetector.detectBuilds()
     * @param {Object} context - Body context
     * @returns {Array} Array of { mvox, damageIds } ready for submission
     */
    processBuildCandidates(builds, context) {
        const results = [];

        for (const build of builds) {
            const mvox = this.extractToMVox(build, context);

            results.push({
                mvox,
                damageIds: build.voxels.map(v => v.damage_id),
                bounds: build.bounds,
                primaryContributor: build.primaryContributor,
                contributors: build.contributors
            });
        }

        return results;
    }
}

export default BuildExtractor;
