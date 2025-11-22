/**
 * AvatarPalette - Color palette management for voxel avatars
 *
 * Each avatar has a maximum of 16 colors in its palette.
 * Colors can be solid, emissive (glowing), or transparent.
 *
 * Integrates with the global MaterialPalette system for consistency
 * with the world's visual style.
 */

// Maximum colors per avatar
export const MAX_PALETTE_SIZE = 16;

// Color types
export const COLOR_TYPE = {
    SOLID: 0,
    EMISSIVE: 1,
    TRANSPARENT: 2
};

// Default skin tone presets
export const SKIN_TONE_PRESETS = {
    light: { r: 255, g: 224, b: 196 },
    medium: { r: 234, g: 192, b: 157 },
    tan: { r: 210, g: 158, b: 119 },
    brown: { r: 165, g: 113, b: 78 },
    dark: { r: 107, g: 68, b: 48 },
    pale: { r: 255, g: 238, b: 227 }
};

// Common hair color presets
export const HAIR_COLOR_PRESETS = {
    black: { r: 28, g: 28, b: 28 },
    brown: { r: 101, g: 67, b: 33 },
    blonde: { r: 218, g: 189, b: 141 },
    red: { r: 156, g: 64, b: 43 },
    white: { r: 240, g: 240, b: 240 },
    gray: { r: 150, g: 150, b: 150 },
    pink: { r: 255, g: 153, b: 204 },
    blue: { r: 100, g: 149, b: 237 },
    green: { r: 119, g: 190, b: 119 },
    purple: { r: 155, g: 89, b: 182 }
};

// Eye color presets
export const EYE_COLOR_PRESETS = {
    brown: { r: 139, g: 90, b: 43 },
    blue: { r: 65, g: 105, b: 225 },
    green: { r: 60, g: 179, b: 113 },
    hazel: { r: 143, g: 122, b: 75 },
    gray: { r: 128, g: 128, b: 140 },
    amber: { r: 255, g: 191, b: 0 },
    red: { r: 200, g: 50, b: 50 } // For demons/vampires
};

export class AvatarPalette {
    constructor(colors = null) {
        // Color storage: array of { r, g, b, type }
        this.colors = [];

        if (colors) {
            // Initialize from provided colors
            for (const color of colors) {
                this.addColor(color.r, color.g, color.b, color.type);
            }
        } else {
            // Initialize with default palette
            this.initializeDefaultPalette();
        }
    }

    /**
     * Initialize a sensible default palette for humanoid avatars
     */
    initializeDefaultPalette() {
        // Slot 0: Primary skin tone
        this.addColor(234, 192, 157, COLOR_TYPE.SOLID);

        // Slot 1: Secondary skin (shadows/details)
        this.addColor(200, 160, 130, COLOR_TYPE.SOLID);

        // Slot 2: Hair primary
        this.addColor(101, 67, 33, COLOR_TYPE.SOLID);

        // Slot 3: Hair secondary (highlights)
        this.addColor(130, 90, 55, COLOR_TYPE.SOLID);

        // Slot 4: Eye color
        this.addColor(65, 105, 225, COLOR_TYPE.SOLID);

        // Slot 5: Eye white
        this.addColor(255, 255, 255, COLOR_TYPE.SOLID);

        // Slot 6: Outfit primary
        this.addColor(70, 130, 180, COLOR_TYPE.SOLID);

        // Slot 7: Outfit secondary
        this.addColor(50, 100, 150, COLOR_TYPE.SOLID);

        // Slot 8: Outfit accent
        this.addColor(255, 215, 0, COLOR_TYPE.SOLID);

        // Slot 9: Black (outlines, details)
        this.addColor(30, 30, 30, COLOR_TYPE.SOLID);

        // Slot 10: White
        this.addColor(250, 250, 250, COLOR_TYPE.SOLID);

        // Slot 11: Mouth/lip color
        this.addColor(200, 100, 100, COLOR_TYPE.SOLID);

        // Slot 12: Emissive (glowing eyes, effects)
        this.addColor(100, 200, 255, COLOR_TYPE.EMISSIVE);

        // Slots 13-15: Empty for user customization
    }

    // =========================================================================
    // Color Management
    // =========================================================================

    /**
     * Add a color to the palette
     * @param {number} r - Red (0-255)
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @param {number} type - COLOR_TYPE (SOLID, EMISSIVE, TRANSPARENT)
     * @returns {number} Index of added color, or -1 if palette is full
     */
    addColor(r, g, b, type = COLOR_TYPE.SOLID) {
        if (this.colors.length >= MAX_PALETTE_SIZE) {
            console.warn('[AvatarPalette] Palette is full (max 16 colors)');
            return -1;
        }

        const index = this.colors.length;
        this.colors.push({
            r: Math.max(0, Math.min(255, Math.round(r))),
            g: Math.max(0, Math.min(255, Math.round(g))),
            b: Math.max(0, Math.min(255, Math.round(b))),
            type: type
        });

        return index;
    }

    /**
     * Set color at specific index
     * @returns {boolean} Success
     */
    setColor(index, r, g, b, type = null) {
        if (index < 0 || index >= this.colors.length) {
            console.warn(`[AvatarPalette] Invalid index: ${index}`);
            return false;
        }

        this.colors[index] = {
            r: Math.max(0, Math.min(255, Math.round(r))),
            g: Math.max(0, Math.min(255, Math.round(g))),
            b: Math.max(0, Math.min(255, Math.round(b))),
            type: type !== null ? type : this.colors[index].type
        };

        return true;
    }

    /**
     * Get color at index
     * @returns {{r, g, b, type}|null}
     */
    getColor(index) {
        if (index < 0 || index >= this.colors.length) {
            return null;
        }
        return { ...this.colors[index] };
    }

    /**
     * Get number of colors in palette
     */
    size() {
        return this.colors.length;
    }

    /**
     * Remove last color from palette
     */
    removeLastColor() {
        if (this.colors.length > 0) {
            this.colors.pop();
            return true;
        }
        return false;
    }

    /**
     * Clear all colors
     */
    clear() {
        this.colors = [];
    }

    // =========================================================================
    // Color Conversion
    // =========================================================================

    /**
     * Get color as hex string
     */
    getColorHex(index) {
        const color = this.getColor(index);
        if (!color) return null;
        return '#' + [color.r, color.g, color.b]
            .map(c => c.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Get color as CSS rgba string
     */
    getColorRGBA(index, alpha = 1.0) {
        const color = this.getColor(index);
        if (!color) return null;

        // Transparent type has reduced alpha
        const finalAlpha = color.type === COLOR_TYPE.TRANSPARENT ? 0.5 : alpha;
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${finalAlpha})`;
    }

    /**
     * Get color as normalized array [r, g, b, a] (0-1 range)
     */
    getColorNormalized(index) {
        const color = this.getColor(index);
        if (!color) return null;

        const alpha = color.type === COLOR_TYPE.TRANSPARENT ? 0.5 : 1.0;
        return [
            color.r / 255,
            color.g / 255,
            color.b / 255,
            alpha
        ];
    }

    /**
     * Get color as Three.js compatible integer (0xRRGGBB)
     */
    getColorInt(index) {
        const color = this.getColor(index);
        if (!color) return null;
        return (color.r << 16) | (color.g << 8) | color.b;
    }

    /**
     * Set color from hex string
     */
    setColorFromHex(index, hex) {
        // Remove # if present
        hex = hex.replace('#', '');

        if (hex.length !== 6) {
            console.warn('[AvatarPalette] Invalid hex color');
            return false;
        }

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        return this.setColor(index, r, g, b);
    }

    // =========================================================================
    // Presets
    // =========================================================================

    /**
     * Apply a skin tone preset to a palette slot
     */
    applySkinTone(index, presetName) {
        const preset = SKIN_TONE_PRESETS[presetName];
        if (!preset) {
            console.warn(`[AvatarPalette] Unknown skin tone preset: ${presetName}`);
            return false;
        }
        return this.setColor(index, preset.r, preset.g, preset.b);
    }

    /**
     * Apply a hair color preset to a palette slot
     */
    applyHairColor(index, presetName) {
        const preset = HAIR_COLOR_PRESETS[presetName];
        if (!preset) {
            console.warn(`[AvatarPalette] Unknown hair color preset: ${presetName}`);
            return false;
        }
        return this.setColor(index, preset.r, preset.g, preset.b);
    }

    /**
     * Apply an eye color preset to a palette slot
     */
    applyEyeColor(index, presetName) {
        const preset = EYE_COLOR_PRESETS[presetName];
        if (!preset) {
            console.warn(`[AvatarPalette] Unknown eye color preset: ${presetName}`);
            return false;
        }
        return this.setColor(index, preset.r, preset.g, preset.b);
    }

    // =========================================================================
    // Color Utilities
    // =========================================================================

    /**
     * Find index of color closest to given RGB values
     */
    findClosestColor(r, g, b) {
        let closestIndex = 0;
        let closestDistance = Infinity;

        for (let i = 0; i < this.colors.length; i++) {
            const c = this.colors[i];
            const distance = Math.sqrt(
                Math.pow(c.r - r, 2) +
                Math.pow(c.g - g, 2) +
                Math.pow(c.b - b, 2)
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = i;
            }
        }

        return closestIndex;
    }

    /**
     * Generate a darker shade of a color
     */
    getDarkerShade(index, amount = 0.2) {
        const color = this.getColor(index);
        if (!color) return null;

        return {
            r: Math.round(color.r * (1 - amount)),
            g: Math.round(color.g * (1 - amount)),
            b: Math.round(color.b * (1 - amount)),
            type: color.type
        };
    }

    /**
     * Generate a lighter shade of a color
     */
    getLighterShade(index, amount = 0.2) {
        const color = this.getColor(index);
        if (!color) return null;

        return {
            r: Math.round(color.r + (255 - color.r) * amount),
            g: Math.round(color.g + (255 - color.g) * amount),
            b: Math.round(color.b + (255 - color.b) * amount),
            type: color.type
        };
    }

    /**
     * Check if a color at index is emissive
     */
    isEmissive(index) {
        const color = this.getColor(index);
        return color ? color.type === COLOR_TYPE.EMISSIVE : false;
    }

    /**
     * Check if a color at index is transparent
     */
    isTransparent(index) {
        const color = this.getColor(index);
        return color ? color.type === COLOR_TYPE.TRANSPARENT : false;
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    /**
     * Serialize palette to plain object
     */
    serialize() {
        return {
            colors: this.colors.map(c => ({
                r: c.r,
                g: c.g,
                b: c.b,
                type: c.type
            }))
        };
    }

    /**
     * Deserialize palette from plain object
     */
    static deserialize(data) {
        const palette = new AvatarPalette([]);
        if (data && data.colors) {
            for (const c of data.colors) {
                palette.addColor(c.r, c.g, c.b, c.type || COLOR_TYPE.SOLID);
            }
        }
        return palette;
    }

    /**
     * Create a deep copy of this palette
     */
    clone() {
        const cloned = new AvatarPalette([]);
        for (const color of this.colors) {
            cloned.colors.push({ ...color });
        }
        return cloned;
    }

    /**
     * Get all colors as array
     */
    toArray() {
        return this.colors.map(c => ({ ...c }));
    }

    /**
     * Export palette to compact binary format (4 bytes per color)
     * Format: [R, G, B, Type] for each color
     * @returns {Uint8Array}
     */
    toBinary() {
        const buffer = new Uint8Array(this.colors.length * 4);
        for (let i = 0; i < this.colors.length; i++) {
            const c = this.colors[i];
            buffer[i * 4] = c.r;
            buffer[i * 4 + 1] = c.g;
            buffer[i * 4 + 2] = c.b;
            buffer[i * 4 + 3] = c.type;
        }
        return buffer;
    }

    /**
     * Import palette from binary format
     */
    static fromBinary(buffer) {
        const palette = new AvatarPalette([]);
        const colorCount = Math.floor(buffer.length / 4);

        for (let i = 0; i < colorCount && i < MAX_PALETTE_SIZE; i++) {
            palette.addColor(
                buffer[i * 4],
                buffer[i * 4 + 1],
                buffer[i * 4 + 2],
                buffer[i * 4 + 3]
            );
        }

        return palette;
    }
}

export default AvatarPalette;
