/**
 * Gravitational Shape Configuration
 *
 * Defines the shape of the gravitational field and how to calculate
 * distance from the gravitational center. Supports sphere (point-mass),
 * torus (ring), and plane shapes.
 */
export class GravitationalShapeConfig {
    constructor(type, params = {}) {
        this.type = type; // 'point', 'ring', 'plane'
        this.params = params;

        // Layer-based generation system (core, mantle, crust, etc.)
        this.layers = params.layers || this.getDefaultLayers();

        // Validate configuration
        this.validate();
    }

    /**
     * Default layer configuration for planet-like bodies
     */
    getDefaultLayers() {
        return [
            {
                name: 'inner_core',
                depthRange: [0, 0.2],        // 0-20% from center
                voxelType: 7,                 // Iron/dense material
                generationMode: 'uniform',    // Instant generation
                solid: true
            },
            {
                name: 'outer_core',
                depthRange: [0.2, 0.4],
                voxelType: 6,                 // Molten material
                generationMode: 'uniform',
                solid: true
            },
            {
                name: 'mantle',
                depthRange: [0.4, 0.85],
                voxelType: 1,                 // Stone
                generationMode: 'simple',     // Basic noise
                solid: false                  // Can have caves
            },
            {
                name: 'crust',
                depthRange: [0.85, 1.0],
                voxelType: 'biome',           // Varies by biome
                generationMode: 'full',       // Full terrain generation
                solid: false
            }
        ];
    }

    validate() {
        const validTypes = ['point', 'ring', 'plane'];
        if (!validTypes.includes(this.type)) {
            throw new Error(`Invalid gravitational shape type: ${this.type}`);
        }

        switch (this.type) {
            case 'point':
                if (!this.params.center) {
                    this.params.center = { x: 0, y: 0, z: 0 };
                }
                break;

            case 'ring':
                if (!this.params.center) {
                    this.params.center = { x: 0, y: 0, z: 0 };
                }
                if (this.params.majorRadius === undefined) {
                    throw new Error('Ring shape requires majorRadius parameter');
                }
                if (!this.params.axis) {
                    this.params.axis = { x: 0, y: 1, z: 0 }; // Default: ring in XZ plane
                }
                break;

            case 'plane':
                if (!this.params.center) {
                    this.params.center = { x: 0, y: 0, z: 0 };
                }
                if (!this.params.normal) {
                    this.params.normal = { x: 0, y: 1, z: 0 }; // Default: horizontal plane
                }
                // Normalize the normal vector
                const len = Math.sqrt(
                    this.params.normal.x ** 2 +
                    this.params.normal.y ** 2 +
                    this.params.normal.z ** 2
                );
                if (len > 0) {
                    this.params.normal.x /= len;
                    this.params.normal.y /= len;
                    this.params.normal.z /= len;
                }
                break;
        }
    }

    /**
     * Calculate distance from gravitational center
     * This is the fundamental operation that determines shell/layer assignment
     */
    getDistanceFromCenter(x, y, z) {
        switch (this.type) {
            case 'point':
                return this.getPointDistance(x, y, z);

            case 'ring':
                return this.getRingDistance(x, y, z);

            case 'plane':
                return this.getPlaneDistance(x, y, z);

            default:
                throw new Error(`Unknown gravitational shape type: ${this.type}`);
        }
    }

    /**
     * Point-mass (sphere) distance: standard Euclidean distance
     */
    getPointDistance(x, y, z) {
        const dx = x - this.params.center.x;
        const dy = y - this.params.center.y;
        const dz = z - this.params.center.z;

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Ring (torus) distance: distance from ring centerline
     * Ring is defined by majorRadius and axis direction
     */
    getRingDistance(x, y, z) {
        const cx = this.params.center.x;
        const cy = this.params.center.y;
        const cz = this.params.center.z;
        const majorRadius = this.params.majorRadius;

        // For simplicity, assume ring in XZ plane with Y axis
        // TODO: Support arbitrary axis orientation if needed

        // Distance from Y axis (vertical axis through center)
        const distFromAxis = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);

        // Point on ring centerline closest to this voxel
        const torusX = distFromAxis - majorRadius;
        const torusY = y - cy;

        // Distance from ring centerline (minor radius)
        return Math.sqrt(torusX * torusX + torusY * torusY);
    }

    /**
     * Plane distance: perpendicular distance from plane
     */
    getPlaneDistance(x, y, z) {
        const nx = this.params.normal.x;
        const ny = this.params.normal.y;
        const nz = this.params.normal.z;

        const px = x - this.params.center.x;
        const py = y - this.params.center.y;
        const pz = z - this.params.center.z;

        // Distance = |dot(p, n)| where n is normalized
        return Math.abs(px * nx + py * ny + pz * nz);
    }

    /**
     * Get the closest point on the surface and surface normal
     * Returns: { point: {x, y, z}, normal: {x, y, z}, distance: number }
     */
    getSurfacePoint(x, y, z) {
        switch (this.type) {
            case 'point':
                return this.getPointSurface(x, y, z);
            case 'ring':
                return this.getRingSurface(x, y, z);
            case 'plane':
                return this.getPlaneSurface(x, y, z);
            default:
                throw new Error(`Unknown type: ${this.type}`);
        }
    }

    getPointSurface(x, y, z) {
        const dx = x - this.params.center.x;
        const dy = y - this.params.center.y;
        const dz = z - this.params.center.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.0001) {
            return {
                point: { ...this.params.center },
                normal: { x: 0, y: 1, z: 0 },
                distance: 0
            };
        }

        // Surface normal points outward
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        return {
            point: {
                x: this.params.center.x + nx,
                y: this.params.center.y + ny,
                z: this.params.center.z + nz
            },
            normal: { x: nx, y: ny, z: nz },
            distance: dist - 1 // Assuming unit radius surface
        };
    }

    getRingSurface(x, y, z) {
        const cx = this.params.center.x;
        const cy = this.params.center.y;
        const cz = this.params.center.z;
        const R = this.params.majorRadius;

        // Distance from Y axis
        const distFromAxis = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);

        // Point on ring centerline
        const ringX = distFromAxis > 0.0001 ? (x - cx) / distFromAxis * R + cx : R + cx;
        const ringZ = distFromAxis > 0.0001 ? (z - cz) / distFromAxis * R + cz : cz;
        const ringY = cy;

        // Vector from ring centerline to point
        const dx = x - ringX;
        const dy = y - ringY;
        const dz = z - ringZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.0001) {
            return {
                point: { x: ringX, y: ringY, z: ringZ },
                normal: { x: 0, y: 1, z: 0 },
                distance: 0
            };
        }

        // Surface normal points away from ring centerline
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        return {
            point: {
                x: ringX + nx,
                y: ringY + ny,
                z: ringZ + nz
            },
            normal: { x: nx, y: ny, z: nz },
            distance: dist - 1 // Assuming unit minor radius surface
        };
    }

    getPlaneSurface(x, y, z) {
        const nx = this.params.normal.x;
        const ny = this.params.normal.y;
        const nz = this.params.normal.z;

        const px = x - this.params.center.x;
        const py = y - this.params.center.y;
        const pz = z - this.params.center.z;

        const distance = px * nx + py * ny + pz * nz;

        return {
            point: {
                x: x - distance * nx,
                y: y - distance * ny,
                z: z - distance * nz
            },
            normal: { x: nx, y: ny, z: nz },
            distance: Math.abs(distance)
        };
    }

    /**
     * Get layer at given normalized depth (0 = center, 1 = surface)
     */
    getLayerAtDepth(normalizedDepth) {
        for (const layer of this.layers) {
            if (normalizedDepth >= layer.depthRange[0] && normalizedDepth <= layer.depthRange[1]) {
                return layer;
            }
        }
        // Default to last layer if outside range
        return this.layers[this.layers.length - 1];
    }

    /**
     * Get layer for a world position
     */
    getLayerAtPosition(x, y, z) {
        const distance = this.getDistanceFromCenter(x, y, z);
        // Normalize: 0 at center, 1 at surface
        // Assume surface is at some maximum radius (needs to be defined per shape)
        const maxRadius = this.getMaxRadius();
        const normalizedDepth = Math.min(1, distance / maxRadius);
        return this.getLayerAtDepth(normalizedDepth);
    }

    /**
     * Get maximum radius for normalization
     */
    getMaxRadius() {
        switch (this.type) {
            case 'point':
                return this.params.radius || 100; // Default sphere radius
            case 'ring':
                return this.params.minorRadius || 50; // Minor radius for torus
            case 'plane':
                return 100; // Arbitrary for planes
            default:
                return 100;
        }
    }

    /**
     * Get surface coordinates for biome mapping
     * Returns normalized coordinates for noise sampling
     */
    getSurfaceCoordinates(x, y, z) {
        const dist = this.getDistanceFromCenter(x, y, z);

        switch (this.type) {
            case 'point':
                // Normalize to unit sphere
                if (dist < 0.0001) return { x: 0, y: 0, z: 0 };
                return {
                    x: (x - this.params.center.x) / dist,
                    y: (y - this.params.center.y) / dist,
                    z: (z - this.params.center.z) / dist
                };

            case 'ring':
                // TODO: Torus surface parametrization
                // For now, use simple 3D coordinates
                return { x, y, z };

            case 'plane':
                // Use XZ coordinates on the plane
                return { x, y: 0, z };

            default:
                return { x, y, z };
        }
    }

    /**
     * Serialize to plain object
     */
    serialize() {
        return {
            type: this.type,
            params: { ...this.params },
            layers: this.layers.map(layer => ({ ...layer }))
        };
    }

    /**
     * Deserialize from plain object
     */
    static deserialize(data) {
        const config = new GravitationalShapeConfig(data.type, data.params);
        if (data.layers) {
            config.layers = data.layers;
        }
        return config;
    }
}

/**
 * Factory functions for common shapes
 */
export const GravitationalShapes = {
    sphere(center = { x: 0, y: 0, z: 0 }, radius = 100) {
        return new GravitationalShapeConfig('point', { center, radius });
    },

    torus(center = { x: 0, y: 0, z: 0 }, majorRadius = 200, minorRadius = 50, axis = { x: 0, y: 1, z: 0 }) {
        return new GravitationalShapeConfig('ring', { center, majorRadius, minorRadius, axis });
    },

    plane(center = { x: 0, y: 0, z: 0 }, normal = { x: 0, y: 1, z: 0 }) {
        return new GravitationalShapeConfig('plane', { center, normal });
    },

    /**
     * Create a ringworld with specified dimensions and layer configuration
     */
    ringworld(center = { x: 0, y: 0, z: 0 }, majorRadius = 500, minorRadius = 100) {
        const config = new GravitationalShapeConfig('ring', {
            center,
            majorRadius,
            minorRadius,
            axis: { x: 0, y: 1, z: 0 }
        });

        // Custom layers for ringworld (thinner crust, structural core)
        config.layers = [
            {
                name: 'structural_core',
                depthRange: [0, 0.5],
                voxelType: 7,                 // Dense structural material
                generationMode: 'uniform',
                solid: true
            },
            {
                name: 'foundation',
                depthRange: [0.5, 0.8],
                voxelType: 1,                 // Stone
                generationMode: 'simple',
                solid: true
            },
            {
                name: 'surface',
                depthRange: [0.8, 1.0],
                voxelType: 'biome',
                generationMode: 'full',
                solid: false
            }
        ];

        return config;
    }
};

export default GravitationalShapeConfig;
