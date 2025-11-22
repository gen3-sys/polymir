/**
 * EditorTools - Sculpting tools for voxel avatar editor
 *
 * Provides various tools for placing, removing, and modifying voxels.
 *
 * Tools:
 * - Pencil: Single voxel place
 * - Eraser: Single voxel remove
 * - Box Select: Region operations
 * - Fill: Flood fill same color
 * - Paint: Change color, keep voxel
 * - Mirror: X-axis symmetry
 * - Eyedropper: Pick color from voxel
 */

// Tool types
export const TOOL_TYPE = {
    PENCIL: 'pencil',
    ERASER: 'eraser',
    PAINT: 'paint',
    FILL: 'fill',
    BOX_SELECT: 'boxSelect',
    EYEDROPPER: 'eyedropper',
    LINE: 'line',
    RECTANGLE: 'rectangle',
    ELLIPSE: 'ellipse'
};

// Tool configurations
const TOOL_CONFIG = {
    [TOOL_TYPE.PENCIL]: {
        name: 'Pencil',
        shortcut: 'B',
        description: 'Place single voxels',
        cursor: 'crosshair',
        continuous: true
    },
    [TOOL_TYPE.ERASER]: {
        name: 'Eraser',
        shortcut: 'E',
        description: 'Remove voxels',
        cursor: 'crosshair',
        continuous: true
    },
    [TOOL_TYPE.PAINT]: {
        name: 'Paint',
        shortcut: 'P',
        description: 'Change voxel color without removing',
        cursor: 'crosshair',
        continuous: true
    },
    [TOOL_TYPE.FILL]: {
        name: 'Fill',
        shortcut: 'G',
        description: 'Fill connected voxels of same color',
        cursor: 'cell',
        continuous: false
    },
    [TOOL_TYPE.BOX_SELECT]: {
        name: 'Box Select',
        shortcut: 'M',
        description: 'Select rectangular region',
        cursor: 'crosshair',
        continuous: false
    },
    [TOOL_TYPE.EYEDROPPER]: {
        name: 'Eyedropper',
        shortcut: 'I',
        description: 'Pick color from existing voxel',
        cursor: 'copy',
        continuous: false
    },
    [TOOL_TYPE.LINE]: {
        name: 'Line',
        shortcut: 'L',
        description: 'Draw line between two points',
        cursor: 'crosshair',
        continuous: false
    },
    [TOOL_TYPE.RECTANGLE]: {
        name: 'Rectangle',
        shortcut: 'R',
        description: 'Draw filled rectangle',
        cursor: 'crosshair',
        continuous: false
    },
    [TOOL_TYPE.ELLIPSE]: {
        name: 'Ellipse',
        shortcut: 'O',
        description: 'Draw filled ellipse',
        cursor: 'crosshair',
        continuous: false
    }
};

export class EditorTools {
    constructor() {
        // Current tool
        this.currentTool = TOOL_TYPE.PENCIL;
        this.previousTool = null;

        // Tool state
        this.isDrawing = false;
        this.startPoint = null;
        this.endPoint = null;

        // Selection state (for box select)
        this.selection = null;

        // Tool options
        this.options = {
            brushSize: 1,
            mirrorMode: false,
            fillMode: 'solid' // 'solid', 'outline'
        };

        // Callbacks
        this.onToolChange = null;
    }

    /**
     * Get current tool type
     */
    getCurrentTool() {
        return this.currentTool;
    }

    /**
     * Set current tool
     */
    setTool(toolType) {
        if (!TOOL_CONFIG[toolType]) {
            console.warn(`[EditorTools] Unknown tool type: ${toolType}`);
            return;
        }

        this.previousTool = this.currentTool;
        this.currentTool = toolType;

        // Reset tool state
        this.isDrawing = false;
        this.startPoint = null;
        this.endPoint = null;

        // Fire callback
        if (this.onToolChange) {
            this.onToolChange(toolType, this.previousTool);
        }
    }

    /**
     * Get tool configuration
     */
    getToolConfig(toolType = null) {
        return TOOL_CONFIG[toolType || this.currentTool];
    }

    /**
     * Get all tool types
     */
    getAllTools() {
        return Object.keys(TOOL_CONFIG);
    }

    /**
     * Get cursor style for current tool
     */
    getCursor() {
        return this.getToolConfig()?.cursor || 'default';
    }

    /**
     * Check if current tool supports continuous drawing
     */
    isContinuousTool() {
        return this.getToolConfig()?.continuous || false;
    }

    /**
     * Start tool operation
     */
    startOperation(point) {
        this.isDrawing = true;
        this.startPoint = { ...point };
        this.endPoint = { ...point };
    }

    /**
     * Update tool operation (during drag)
     */
    updateOperation(point) {
        if (!this.isDrawing) return;
        this.endPoint = { ...point };
    }

    /**
     * End tool operation
     */
    endOperation(point) {
        if (point) {
            this.endPoint = { ...point };
        }
        this.isDrawing = false;
    }

    /**
     * Cancel current operation
     */
    cancelOperation() {
        this.isDrawing = false;
        this.startPoint = null;
        this.endPoint = null;
    }

    /**
     * Get voxels for line tool (Bresenham's algorithm)
     */
    getLineVoxels(start, end) {
        const voxels = [];

        let x0 = start.x, y0 = start.y, z0 = start.z;
        let x1 = end.x, y1 = end.y, z1 = end.z;

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const dz = Math.abs(z1 - z0);

        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        const sz = z0 < z1 ? 1 : -1;

        // Determine the dominant axis
        if (dx >= dy && dx >= dz) {
            // X dominant
            let errY = 2 * dy - dx;
            let errZ = 2 * dz - dx;

            while (true) {
                voxels.push({ x: x0, y: y0, z: z0 });
                if (x0 === x1) break;

                if (errY > 0) {
                    y0 += sy;
                    errY -= 2 * dx;
                }
                if (errZ > 0) {
                    z0 += sz;
                    errZ -= 2 * dx;
                }
                errY += 2 * dy;
                errZ += 2 * dz;
                x0 += sx;
            }
        } else if (dy >= dx && dy >= dz) {
            // Y dominant
            let errX = 2 * dx - dy;
            let errZ = 2 * dz - dy;

            while (true) {
                voxels.push({ x: x0, y: y0, z: z0 });
                if (y0 === y1) break;

                if (errX > 0) {
                    x0 += sx;
                    errX -= 2 * dy;
                }
                if (errZ > 0) {
                    z0 += sz;
                    errZ -= 2 * dy;
                }
                errX += 2 * dx;
                errZ += 2 * dz;
                y0 += sy;
            }
        } else {
            // Z dominant
            let errX = 2 * dx - dz;
            let errY = 2 * dy - dz;

            while (true) {
                voxels.push({ x: x0, y: y0, z: z0 });
                if (z0 === z1) break;

                if (errX > 0) {
                    x0 += sx;
                    errX -= 2 * dz;
                }
                if (errY > 0) {
                    y0 += sy;
                    errY -= 2 * dz;
                }
                errX += 2 * dx;
                errY += 2 * dy;
                z0 += sz;
            }
        }

        return voxels;
    }

    /**
     * Get voxels for rectangle tool (2D on specified plane)
     */
    getRectangleVoxels(start, end, plane = 'xy', depth = 0) {
        const voxels = [];

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);

        if (this.options.fillMode === 'solid') {
            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    for (let z = minZ; z <= maxZ; z++) {
                        voxels.push({ x, y, z });
                    }
                }
            }
        } else {
            // Outline only
            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    for (let z = minZ; z <= maxZ; z++) {
                        const isEdgeX = x === minX || x === maxX;
                        const isEdgeY = y === minY || y === maxY;
                        const isEdgeZ = z === minZ || z === maxZ;

                        if (isEdgeX || isEdgeY || isEdgeZ) {
                            voxels.push({ x, y, z });
                        }
                    }
                }
            }
        }

        return voxels;
    }

    /**
     * Get voxels for ellipse tool (approximation)
     */
    getEllipseVoxels(center, radiusX, radiusY, radiusZ = 1) {
        const voxels = [];

        const rx2 = radiusX * radiusX;
        const ry2 = radiusY * radiusY;
        const rz2 = radiusZ * radiusZ;

        for (let x = -radiusX; x <= radiusX; x++) {
            for (let y = -radiusY; y <= radiusY; y++) {
                for (let z = -radiusZ; z <= radiusZ; z++) {
                    const dist = (x * x) / rx2 + (y * y) / ry2 + (z * z) / rz2;

                    if (this.options.fillMode === 'solid') {
                        if (dist <= 1) {
                            voxels.push({
                                x: center.x + x,
                                y: center.y + y,
                                z: center.z + z
                            });
                        }
                    } else {
                        // Shell only
                        if (dist <= 1 && dist > 0.7) {
                            voxels.push({
                                x: center.x + x,
                                y: center.y + y,
                                z: center.z + z
                            });
                        }
                    }
                }
            }
        }

        return voxels;
    }

    /**
     * Get voxels for brush (multi-voxel pencil)
     */
    getBrushVoxels(center, size = 1) {
        if (size <= 1) {
            return [{ ...center }];
        }

        const voxels = [];
        const radius = Math.floor(size / 2);

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    // Spherical brush
                    if (dx * dx + dy * dy + dz * dz <= radius * radius) {
                        voxels.push({
                            x: center.x + dx,
                            y: center.y + dy,
                            z: center.z + dz
                        });
                    }
                }
            }
        }

        return voxels;
    }

    /**
     * Apply mirror transformation to voxels
     */
    mirrorVoxels(voxels, avatarWidth) {
        const mirrored = [];

        for (const voxel of voxels) {
            mirrored.push({ ...voxel });
            mirrored.push({
                x: avatarWidth - 1 - voxel.x,
                y: voxel.y,
                z: voxel.z
            });
        }

        // Remove duplicates (center voxels)
        const unique = [];
        const seen = new Set();

        for (const voxel of mirrored) {
            const key = `${voxel.x},${voxel.y},${voxel.z}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(voxel);
            }
        }

        return unique;
    }

    /**
     * Set brush size
     */
    setBrushSize(size) {
        this.options.brushSize = Math.max(1, Math.min(10, size));
    }

    /**
     * Set fill mode
     */
    setFillMode(mode) {
        this.options.fillMode = mode;
    }

    /**
     * Toggle mirror mode
     */
    toggleMirrorMode() {
        this.options.mirrorMode = !this.options.mirrorMode;
        return this.options.mirrorMode;
    }

    /**
     * Set mirror mode
     */
    setMirrorMode(enabled) {
        this.options.mirrorMode = enabled;
    }

    /**
     * Get selection bounds
     */
    getSelectionBounds() {
        if (!this.selection) return null;

        return {
            min: {
                x: Math.min(this.selection.start.x, this.selection.end.x),
                y: Math.min(this.selection.start.y, this.selection.end.y),
                z: Math.min(this.selection.start.z, this.selection.end.z)
            },
            max: {
                x: Math.max(this.selection.start.x, this.selection.end.x),
                y: Math.max(this.selection.start.y, this.selection.end.y),
                z: Math.max(this.selection.start.z, this.selection.end.z)
            }
        };
    }

    /**
     * Set selection
     */
    setSelection(start, end) {
        this.selection = { start: { ...start }, end: { ...end } };
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selection = null;
    }

    /**
     * Check if point is in selection
     */
    isInSelection(x, y, z) {
        if (!this.selection) return false;

        const bounds = this.getSelectionBounds();
        return (
            x >= bounds.min.x && x <= bounds.max.x &&
            y >= bounds.min.y && y <= bounds.max.y &&
            z >= bounds.min.z && z <= bounds.max.z
        );
    }

    /**
     * Get voxels in current selection
     */
    getSelectedVoxels() {
        if (!this.selection) return [];

        const voxels = [];
        const bounds = this.getSelectionBounds();

        for (let x = bounds.min.x; x <= bounds.max.x; x++) {
            for (let y = bounds.min.y; y <= bounds.max.y; y++) {
                for (let z = bounds.min.z; z <= bounds.max.z; z++) {
                    voxels.push({ x, y, z });
                }
            }
        }

        return voxels;
    }

    /**
     * Get tool by shortcut key
     */
    getToolByShortcut(key) {
        const upperKey = key.toUpperCase();

        for (const [toolType, config] of Object.entries(TOOL_CONFIG)) {
            if (config.shortcut === upperKey) {
                return toolType;
            }
        }

        return null;
    }
}

export default EditorTools;
