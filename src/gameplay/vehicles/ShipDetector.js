/**
 * ShipDetector.js
 * Detects when a build/schematic qualifies as a ship
 *
 * A build becomes a ship when:
 * 1. It contains at least one CONTROL_PANEL block
 * 2. (Optional) It contains thrusters for movement
 * 3. (Optional) It contains a pilot seat for boarding
 */

import { BLOCK_FUNCTION } from '../../data/Semantics.js';
import { VOXEL_TYPES } from '../../data/voxel/VoxelTypes.js';
import { ShipConfig, analyzeSchematicForShip } from './ShipConfig.js';

// Build voxel type ID lookup for block functions
const CONTROL_PANEL_IDS = new Set();
const THRUSTER_IDS = new Set();
const SEAT_IDS = new Set();

// Populate lookup sets
for (const [key, type] of Object.entries(VOXEL_TYPES)) {
    if (type.blockFunction === BLOCK_FUNCTION.CONTROL_PANEL) {
        CONTROL_PANEL_IDS.add(type.id);
    } else if (type.blockFunction === BLOCK_FUNCTION.THRUSTER) {
        THRUSTER_IDS.add(type.id);
    } else if (type.blockFunction === BLOCK_FUNCTION.SEAT) {
        SEAT_IDS.add(type.id);
    }
}

/**
 * Check if a voxel type is a control panel
 */
export function isControlPanel(voxelTypeId) {
    return CONTROL_PANEL_IDS.has(voxelTypeId);
}

/**
 * Check if a voxel type is a thruster
 */
export function isThruster(voxelTypeId) {
    return THRUSTER_IDS.has(voxelTypeId);
}

/**
 * Check if a voxel type is a seat
 */
export function isSeat(voxelTypeId) {
    return SEAT_IDS.has(voxelTypeId);
}

/**
 * ShipDetector class for analyzing builds/schematics
 */
export class ShipDetector {
    constructor(options = {}) {
        // Minimum requirements for ship detection
        this.requireControlPanel = options.requireControlPanel !== false;
        this.requireThruster = options.requireThruster || false;
        this.requireSeat = options.requireSeat || false;
    }

    /**
     * Analyze a schematic to determine if it's a ship
     * @param {Object} schematic - Schematic with voxel data
     * @returns {Object} Detection result with ship info
     */
    analyzeSchematic(schematic) {
        const result = {
            isShip: false,
            hasControlPanel: false,
            hasThrusters: false,
            hasPilotSeat: false,
            hasPassengerSeats: false,
            controlPanelCount: 0,
            thrusterCount: 0,
            seatCount: 0,
            shipConfig: null,
            reason: null
        };

        const voxels = schematic.voxels || schematic.blocks;
        if (!voxels) {
            result.reason = 'No voxel data found';
            return result;
        }

        // Scan voxels for ship blocks
        this.scanVoxels(voxels, result);

        // Check requirements
        if (this.requireControlPanel && !result.hasControlPanel) {
            result.reason = 'Missing control panel';
            return result;
        }

        if (this.requireThruster && !result.hasThrusters) {
            result.reason = 'Missing thrusters';
            return result;
        }

        if (this.requireSeat && !result.hasPilotSeat) {
            result.reason = 'Missing pilot seat';
            return result;
        }

        // Build is a ship!
        if (result.hasControlPanel) {
            result.isShip = true;
            result.shipConfig = analyzeSchematicForShip(schematic);
            result.reason = 'Valid ship configuration';
        }

        return result;
    }

    /**
     * Scan voxels for ship-related blocks
     */
    scanVoxels(voxels, result) {
        const iterate = (callback) => {
            if (voxels instanceof Map) {
                for (const [key, voxel] of voxels) {
                    callback(voxel);
                }
            } else if (Array.isArray(voxels)) {
                for (const voxel of voxels) {
                    callback(voxel);
                }
            } else if (typeof voxels === 'object') {
                // Flat object with x,y,z keys
                for (const key of Object.keys(voxels)) {
                    callback(voxels[key]);
                }
            }
        };

        iterate((voxel) => {
            const typeId = voxel.type || voxel.id || voxel;
            if (typeof typeId !== 'number') return;

            if (isControlPanel(typeId)) {
                result.hasControlPanel = true;
                result.controlPanelCount++;
            } else if (isThruster(typeId)) {
                result.hasThrusters = true;
                result.thrusterCount++;
            } else if (isSeat(typeId)) {
                result.seatCount++;
                const voxelType = this.getVoxelTypeById(typeId);
                if (voxelType && voxelType.isPilotSeat) {
                    result.hasPilotSeat = true;
                } else {
                    result.hasPassengerSeats = true;
                }
            }
        });
    }

    /**
     * Analyze damage map entries to detect ship builds
     * Used during build detection to check if a cluster qualifies as a ship
     * @param {Array} damageEntries - Array of damage map entries
     * @returns {Object} Detection result
     */
    analyzeDamageCluster(damageEntries) {
        const result = {
            isShip: false,
            hasControlPanel: false,
            hasThrusters: false,
            hasPilotSeat: false,
            controlPanelCount: 0,
            thrusterCount: 0,
            seatCount: 0,
            shipConfig: null,
            reason: null
        };

        for (const entry of damageEntries) {
            if (entry.change_type !== 'add') continue;

            const typeId = entry.voxel_type;
            if (typeof typeId !== 'number') continue;

            if (isControlPanel(typeId)) {
                result.hasControlPanel = true;
                result.controlPanelCount++;
            } else if (isThruster(typeId)) {
                result.hasThrusters = true;
                result.thrusterCount++;
            } else if (isSeat(typeId)) {
                result.seatCount++;
                const voxelType = this.getVoxelTypeById(typeId);
                if (voxelType && voxelType.isPilotSeat) {
                    result.hasPilotSeat = true;
                }
            }
        }

        // Check if it qualifies as a ship
        if (this.requireControlPanel && !result.hasControlPanel) {
            result.reason = 'Missing control panel';
            return result;
        }

        if (result.hasControlPanel) {
            result.isShip = true;
            result.reason = 'Valid ship configuration';

            // Build voxel data for ShipConfig
            const blocks = damageEntries
                .filter(e => e.change_type === 'add')
                .map(e => ({
                    x: e.voxel_x,
                    y: e.voxel_y,
                    z: e.voxel_z,
                    type: e.voxel_type
                }));

            result.shipConfig = new ShipConfig({ blocks });
        }

        return result;
    }

    /**
     * Quick check if a single block type makes something potentially a ship
     * @param {number} voxelTypeId - Block type ID being placed
     * @returns {boolean} - True if this block triggers ship detection
     */
    isShipTriggerBlock(voxelTypeId) {
        return isControlPanel(voxelTypeId);
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
}

/**
 * Default singleton detector
 */
export const shipDetector = new ShipDetector();

export default ShipDetector;
