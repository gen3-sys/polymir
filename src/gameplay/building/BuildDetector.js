/**
 * BuildDetector.js
 * Connected component analysis for detecting builds from damage map voxels
 *
 * Uses flood-fill algorithm to find clusters of connected voxels.
 * When a cluster meets the threshold, it's considered a "build" candidate.
 */

export class BuildDetector {
    constructor(options = {}) {
        // Minimum voxels for a cluster to be considered a build
        this.buildThreshold = options.buildThreshold || 5;

        // Maximum distance to consider voxels "connected" (1 = face-adjacent only)
        this.connectionDistance = options.connectionDistance || 1;

        // Include diagonal connections?
        this.includeDiagonals = options.includeDiagonals || false;

        // Cache for visited voxels during detection
        this.visited = new Set();
    }

    /**
     * Encode voxel position to string key
     */
    encodeKey(x, y, z, layerId = 0) {
        return `${x},${y},${z},${layerId}`;
    }

    /**
     * Decode string key to position
     */
    decodeKey(key) {
        const [x, y, z, layerId] = key.split(',').map(Number);
        return { x, y, z, layerId };
    }

    /**
     * Get neighbor offsets based on connection settings
     */
    getNeighborOffsets() {
        const offsets = [
            // Face-adjacent (6 neighbors)
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];

        if (this.includeDiagonals) {
            // Edge-adjacent (12 more)
            offsets.push(
                [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
                [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
                [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]
            );

            // Corner-adjacent (8 more)
            offsets.push(
                [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
                [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
            );
        }

        return offsets;
    }

    /**
     * Find all connected components in a set of voxels
     * @param {Array} voxels - Array of damage map entries with voxel_x, voxel_y, voxel_z, layer_id
     * @returns {Array<Array>} Array of clusters, each cluster is array of voxels
     */
    findConnectedComponents(voxels) {
        // Build lookup map
        const voxelMap = new Map();
        for (const voxel of voxels) {
            const key = this.encodeKey(voxel.voxel_x, voxel.voxel_y, voxel.voxel_z, voxel.layer_id);
            voxelMap.set(key, voxel);
        }

        this.visited.clear();
        const clusters = [];
        const neighborOffsets = this.getNeighborOffsets();

        for (const voxel of voxels) {
            const startKey = this.encodeKey(voxel.voxel_x, voxel.voxel_y, voxel.voxel_z, voxel.layer_id);

            if (this.visited.has(startKey)) continue;

            // BFS flood fill
            const cluster = [];
            const queue = [startKey];

            while (queue.length > 0) {
                const currentKey = queue.shift();

                if (this.visited.has(currentKey)) continue;
                this.visited.add(currentKey);

                const currentVoxel = voxelMap.get(currentKey);
                if (!currentVoxel) continue;

                cluster.push(currentVoxel);

                // Check neighbors
                const { x, y, z, layerId } = this.decodeKey(currentKey);

                for (const [dx, dy, dz] of neighborOffsets) {
                    const neighborKey = this.encodeKey(x + dx, y + dy, z + dz, layerId);

                    if (!this.visited.has(neighborKey) && voxelMap.has(neighborKey)) {
                        queue.push(neighborKey);
                    }
                }
            }

            if (cluster.length > 0) {
                clusters.push(cluster);
            }
        }

        return clusters;
    }

    /**
     * Find clusters that meet the build threshold
     * @param {Array} voxels - Damage map entries
     * @returns {Array<Object>} Array of build candidates with metadata
     */
    detectBuilds(voxels) {
        const clusters = this.findConnectedComponents(voxels);
        const builds = [];

        for (const cluster of clusters) {
            if (cluster.length >= this.buildThreshold) {
                builds.push({
                    voxels: cluster,
                    voxelCount: cluster.length,
                    bounds: this.computeBounds(cluster),
                    contributors: this.getContributors(cluster),
                    primaryContributor: this.getPrimaryContributor(cluster)
                });
            }
        }

        return builds;
    }

    /**
     * Compute bounding box for a cluster
     */
    computeBounds(cluster) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const voxel of cluster) {
            minX = Math.min(minX, voxel.voxel_x);
            minY = Math.min(minY, voxel.voxel_y);
            minZ = Math.min(minZ, voxel.voxel_z);
            maxX = Math.max(maxX, voxel.voxel_x);
            maxY = Math.max(maxY, voxel.voxel_y);
            maxZ = Math.max(maxZ, voxel.voxel_z);
        }

        return {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
            size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1],
            center: [
                (minX + maxX) / 2,
                (minY + maxY) / 2,
                (minZ + maxZ) / 2
            ]
        };
    }

    /**
     * Get all unique contributors to a cluster
     */
    getContributors(cluster) {
        const contributors = new Map();

        for (const voxel of cluster) {
            const playerId = voxel.player_id;
            if (!contributors.has(playerId)) {
                contributors.set(playerId, {
                    playerId,
                    voxelCount: 0,
                    firstContribution: voxel.created_at,
                    lastContribution: voxel.created_at
                });
            }

            const contrib = contributors.get(playerId);
            contrib.voxelCount++;
            if (voxel.created_at < contrib.firstContribution) {
                contrib.firstContribution = voxel.created_at;
            }
            if (voxel.created_at > contrib.lastContribution) {
                contrib.lastContribution = voxel.created_at;
            }
        }

        return Array.from(contributors.values())
            .sort((a, b) => b.voxelCount - a.voxelCount);
    }

    /**
     * Get the player who contributed the most voxels
     */
    getPrimaryContributor(cluster) {
        const contributors = this.getContributors(cluster);
        return contributors.length > 0 ? contributors[0].playerId : null;
    }

    /**
     * Check if a voxel position touches any existing schematic placements
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {Array} placements - Array of schematic placements with bounds
     * @returns {Object|null} The touching placement, or null
     */
    findTouchingPlacement(x, y, z, placements) {
        const neighborOffsets = this.getNeighborOffsets();

        for (const placement of placements) {
            // Check if any neighbor of (x,y,z) is within this placement's bounds
            for (const [dx, dy, dz] of neighborOffsets) {
                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;

                if (this.isPointInPlacement(nx, ny, nz, placement)) {
                    return placement;
                }
            }
        }

        return null;
    }

    /**
     * Check if a point is within a schematic placement's bounds
     */
    isPointInPlacement(x, y, z, placement) {
        // Placement has position and schematic has size
        const px = placement.position_x;
        const py = placement.position_y;
        const pz = placement.position_z;

        // For now, use approximate bounds if schematic size isn't loaded
        // In production, you'd load the schematic metadata to get exact size
        const halfSize = placement.approximate_radius || 8;

        return (
            x >= px - halfSize && x <= px + halfSize &&
            y >= py - halfSize && y <= py + halfSize &&
            z >= pz - halfSize && z <= pz + halfSize
        );
    }

    /**
     * Find clusters that touch existing schematic placements
     * Used for EXTEND_BUILD mode and composite build detection
     * @param {Array} voxels - Damage map entries
     * @param {Array} placements - Existing schematic placements
     * @returns {Array<Object>} Clusters with their touching placements
     */
    findClustersNearPlacements(voxels, placements) {
        const clusters = this.findConnectedComponents(voxels);
        const results = [];

        for (const cluster of clusters) {
            const touchingPlacements = new Set();

            for (const voxel of cluster) {
                const touching = this.findTouchingPlacement(
                    voxel.voxel_x,
                    voxel.voxel_y,
                    voxel.voxel_z,
                    placements
                );

                if (touching) {
                    touchingPlacements.add(touching.placement_id);
                }
            }

            if (touchingPlacements.size > 0) {
                results.push({
                    cluster,
                    touchingPlacementIds: Array.from(touchingPlacements),
                    bounds: this.computeBounds(cluster)
                });
            }
        }

        return results;
    }

    /**
     * Detect when multiple schematic placements should form a composite build
     * @param {Array} placements - All placements on a body
     * @param {number} touchDistance - Max distance to consider "touching"
     * @returns {Array<Array>} Groups of placement IDs that should be merged
     */
    detectCompositeBuildCandidates(placements, touchDistance = 2) {
        // Build adjacency based on placement positions
        const adjacencyMap = new Map();

        for (const p of placements) {
            adjacencyMap.set(p.placement_id, []);
        }

        // Check each pair of placements
        for (let i = 0; i < placements.length; i++) {
            for (let j = i + 1; j < placements.length; j++) {
                const p1 = placements[i];
                const p2 = placements[j];

                // Simple distance check between centers
                const dx = p1.position_x - p2.position_x;
                const dy = p1.position_y - p2.position_y;
                const dz = p1.position_z - p2.position_z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Sum of approximate radii + touch distance
                const r1 = p1.approximate_radius || 8;
                const r2 = p2.approximate_radius || 8;

                if (distance <= r1 + r2 + touchDistance) {
                    adjacencyMap.get(p1.placement_id).push(p2.placement_id);
                    adjacencyMap.get(p2.placement_id).push(p1.placement_id);
                }
            }
        }

        // Find connected components of placements
        const visited = new Set();
        const groups = [];

        for (const placement of placements) {
            if (visited.has(placement.placement_id)) continue;

            const group = [];
            const queue = [placement.placement_id];

            while (queue.length > 0) {
                const current = queue.shift();
                if (visited.has(current)) continue;

                visited.add(current);
                group.push(current);

                for (const neighbor of adjacencyMap.get(current) || []) {
                    if (!visited.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }

            // Only include groups with 2+ placements
            if (group.length >= 2) {
                groups.push(group);
            }
        }

        return groups;
    }
}

export default BuildDetector;
