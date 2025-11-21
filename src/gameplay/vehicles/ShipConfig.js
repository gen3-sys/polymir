/**
 * ShipConfig.js
 * Configuration for player-built ships/vehicles
 *
 * Ships are schematics that contain at least one CONTROL_PANEL block.
 * They use planar gravity (players walk on the "floor" of the ship).
 * Movement is driven by THRUSTER blocks.
 */

import { GravitationalShapeConfig, GravitationalShapes } from '../../config/GravitationalShapeConfig.js';
import { BLOCK_FUNCTION } from '../../data/Semantics.js';
import { VOXEL_TYPES } from '../../data/voxel/VoxelTypes.js';

/**
 * Ship physics configuration
 */
export const SHIP_PHYSICS = {
    // Base mass per block (kg equivalent)
    BASE_BLOCK_MASS: 10,

    // Drag coefficient in space (very low)
    SPACE_DRAG: 0.001,

    // Drag coefficient in atmosphere
    ATMOSPHERE_DRAG: 0.05,

    // Maximum velocity (units per second)
    MAX_VELOCITY: 500,

    // Rotation speed (radians per second)
    ROTATION_SPEED: Math.PI / 2,

    // Gravity strength on ship deck (planar gravity)
    DECK_GRAVITY: 9.8,

    // Player detach velocity threshold
    DETACH_VELOCITY: 50
};

/**
 * Ship state enum
 */
export const SHIP_STATE = {
    INACTIVE: 'inactive',     // No pilot, stationary
    PILOTED: 'piloted',       // Player is piloting
    DRIFTING: 'drifting',     // Moving but no pilot
    DOCKED: 'docked',         // Attached to station/planet
    DESTROYED: 'destroyed'    // Ship destroyed
};

/**
 * Ship configuration derived from schematic analysis
 */
export class ShipConfig {
    constructor(options = {}) {
        // Identity
        this.shipId = options.shipId || null;
        this.schematicId = options.schematicId || null;
        this.name = options.name || 'Unnamed Ship';
        this.ownerId = options.ownerId || null;

        // Computed from schematic
        this.blockCount = options.blockCount || 0;
        this.bounds = options.bounds || { min: [0, 0, 0], max: [0, 0, 0] };
        this.centerOfMass = options.centerOfMass || { x: 0, y: 0, z: 0 };

        // Control panel position (defines ship "forward" and control point)
        this.controlPanelPosition = options.controlPanelPosition || null;
        this.controlPanelDirection = options.controlPanelDirection || { x: 0, y: 0, z: 1 };

        // Thruster configuration
        this.thrusters = options.thrusters || [];
        this.totalThrust = 0;
        this.totalFuelConsumption = 0;

        // Seat positions
        this.pilotSeat = options.pilotSeat || null;
        this.passengerSeats = options.passengerSeats || [];

        // Computed physics
        this.mass = options.mass || SHIP_PHYSICS.BASE_BLOCK_MASS;
        this.fuelCapacity = options.fuelCapacity || 0;
        this.gyroscopeStrength = options.gyroscopeStrength || 0;

        // Gravity configuration (planar gravity for deck)
        this.gravityConfig = null;
        this.gravityVector = options.gravityVector || { x: 0, y: -1, z: 0 };

        // Current state
        this.state = SHIP_STATE.INACTIVE;
        this.currentFuel = options.currentFuel || 0;

        // Compute derived values if we have block data
        if (options.blocks) {
            this.analyzeBlocks(options.blocks);
        }
    }

    /**
     * Analyze schematic blocks to compute ship properties
     * @param {Map|Array} blocks - Voxel data (position -> voxel type)
     */
    analyzeBlocks(blocks) {
        let totalMass = 0;
        let centerX = 0, centerY = 0, centerZ = 0;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let blockCount = 0;

        this.thrusters = [];
        this.passengerSeats = [];
        this.pilotSeat = null;
        this.controlPanelPosition = null;
        this.totalThrust = 0;
        this.totalFuelConsumption = 0;
        this.fuelCapacity = 0;
        this.gyroscopeStrength = 0;

        // Iterate through blocks
        const iterate = (callback) => {
            if (blocks instanceof Map) {
                for (const [key, voxel] of blocks) {
                    const [x, y, z] = key.split(',').map(Number);
                    callback(x, y, z, voxel);
                }
            } else if (Array.isArray(blocks)) {
                for (const block of blocks) {
                    callback(block.x, block.y, block.z, block);
                }
            }
        };

        iterate((x, y, z, voxel) => {
            const typeId = voxel.type || voxel.id || voxel;
            const voxelType = this.getVoxelTypeById(typeId);

            if (!voxelType || typeId === 0) return; // Skip air

            blockCount++;

            // Bounds
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);

            // Mass
            const blockMass = voxelType.mass || SHIP_PHYSICS.BASE_BLOCK_MASS;
            totalMass += blockMass;
            centerX += x * blockMass;
            centerY += y * blockMass;
            centerZ += z * blockMass;

            // Functional blocks
            if (voxelType.blockFunction === BLOCK_FUNCTION.CONTROL_PANEL) {
                this.controlPanelPosition = { x, y, z };
            } else if (voxelType.blockFunction === BLOCK_FUNCTION.THRUSTER) {
                this.thrusters.push({
                    position: { x, y, z },
                    power: voxelType.thrustPower || 100,
                    fuelConsumption: voxelType.fuelConsumption || 1
                });
                this.totalThrust += voxelType.thrustPower || 100;
                this.totalFuelConsumption += voxelType.fuelConsumption || 1;
            } else if (voxelType.blockFunction === BLOCK_FUNCTION.SEAT) {
                const seat = { position: { x, y, z } };
                if (voxelType.isPilotSeat) {
                    this.pilotSeat = seat;
                } else {
                    this.passengerSeats.push(seat);
                }
            } else if (voxelType.fuelCapacity) {
                this.fuelCapacity += voxelType.fuelCapacity;
            } else if (voxelType.stabilization) {
                this.gyroscopeStrength += voxelType.stabilization;
            }
        });

        // Finalize
        this.blockCount = blockCount;
        this.mass = totalMass > 0 ? totalMass : SHIP_PHYSICS.BASE_BLOCK_MASS;
        this.bounds = {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ]
        };

        if (totalMass > 0) {
            this.centerOfMass = {
                x: centerX / totalMass,
                y: centerY / totalMass,
                z: centerZ / totalMass
            };
        }

        // Set up planar gravity (down is -Y in ship local space)
        this.setupGravity();
    }

    /**
     * Get voxel type by ID
     */
    getVoxelTypeById(id) {
        for (const type of Object.values(VOXEL_TYPES)) {
            if (type.id === id) return type;
        }
        return null;
    }

    /**
     * Set up planar gravity for ship deck
     */
    setupGravity() {
        // Ship uses planar gravity - players are pulled toward the deck
        // The "floor" of the ship is determined by the control panel orientation
        // Default: Y- is down (players walk on XZ plane)

        const shipCenter = {
            x: (this.bounds.min[0] + this.bounds.max[0]) / 2,
            y: this.bounds.min[1], // Bottom of ship is the deck
            z: (this.bounds.min[2] + this.bounds.max[2]) / 2
        };

        this.gravityConfig = GravitationalShapes.plane(
            shipCenter,
            this.gravityVector // Default: { x: 0, y: 1, z: 0 } = pull down toward deck
        );

        // Configure the planar gravity radius (how far from deck gravity works)
        this.gravityConfig.params.radius = Math.max(
            this.bounds.max[0] - this.bounds.min[0],
            this.bounds.max[1] - this.bounds.min[1],
            this.bounds.max[2] - this.bounds.min[2]
        ) * 2;
    }

    /**
     * Check if this configuration represents a valid ship
     */
    isValidShip() {
        return this.controlPanelPosition !== null;
    }

    /**
     * Calculate acceleration based on thrust and mass
     */
    getAcceleration() {
        if (this.mass <= 0) return 0;
        return this.totalThrust / this.mass;
    }

    /**
     * Calculate fuel burn time at full thrust
     */
    getMaxBurnTime() {
        if (this.totalFuelConsumption <= 0) return Infinity;
        return this.fuelCapacity / this.totalFuelConsumption;
    }

    /**
     * Get available seats (pilot + passengers)
     */
    getAllSeats() {
        const seats = [];
        if (this.pilotSeat) {
            seats.push({ ...this.pilotSeat, type: 'pilot' });
        }
        for (const seat of this.passengerSeats) {
            seats.push({ ...seat, type: 'passenger' });
        }
        return seats;
    }

    /**
     * Serialize for network/storage
     */
    serialize() {
        return {
            shipId: this.shipId,
            schematicId: this.schematicId,
            name: this.name,
            ownerId: this.ownerId,
            blockCount: this.blockCount,
            bounds: this.bounds,
            centerOfMass: this.centerOfMass,
            controlPanelPosition: this.controlPanelPosition,
            controlPanelDirection: this.controlPanelDirection,
            thrusters: this.thrusters,
            pilotSeat: this.pilotSeat,
            passengerSeats: this.passengerSeats,
            mass: this.mass,
            totalThrust: this.totalThrust,
            totalFuelConsumption: this.totalFuelConsumption,
            fuelCapacity: this.fuelCapacity,
            gyroscopeStrength: this.gyroscopeStrength,
            gravityVector: this.gravityVector,
            state: this.state,
            currentFuel: this.currentFuel
        };
    }

    /**
     * Deserialize from network/storage
     */
    static deserialize(data) {
        return new ShipConfig(data);
    }
}

/**
 * Analyze a schematic/build to determine if it's a ship
 * @param {Object} schematic - Schematic with voxel data
 * @returns {ShipConfig|null} - Ship config if valid ship, null otherwise
 */
export function analyzeSchematicForShip(schematic) {
    const config = new ShipConfig({
        schematicId: schematic.schematicId || schematic.id,
        name: schematic.name || 'Unnamed Ship',
        ownerId: schematic.author || schematic.ownerId,
        blocks: schematic.voxels || schematic.blocks
    });

    if (config.isValidShip()) {
        return config;
    }

    return null;
}

export default ShipConfig;
