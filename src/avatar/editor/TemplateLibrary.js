/**
 * TemplateLibrary - Starter templates for voxel avatars
 *
 * Provides pre-made avatar bases that users can start with and customize.
 *
 * Templates:
 * - Human base (male, female, neutral)
 * - Robot base
 * - Animal bases (cat, dog, bird)
 * - Creature bases (slime, ghost)
 * - Empty (start from scratch)
 */

import { AVATAR_WIDTH, AVATAR_HEIGHT, AVATAR_DEPTH } from '../data/VoxelAvatarData.js';
import { COLOR_TYPE } from '../data/AvatarPalette.js';

// Template categories
export const TEMPLATE_CATEGORY = {
    HUMAN: 'human',
    ROBOT: 'robot',
    ANIMAL: 'animal',
    CREATURE: 'creature',
    CUSTOM: 'custom'
};

// Template definitions
const TEMPLATE_DEFINITIONS = {
    human_neutral: {
        name: 'Human (Neutral)',
        category: TEMPLATE_CATEGORY.HUMAN,
        description: 'Basic humanoid base with neutral proportions',
        thumbnail: null, // Would be a URL to preview image
        palette: {
            colors: [
                { r: 234, g: 192, b: 157, type: COLOR_TYPE.SOLID }, // Skin
                { r: 200, g: 160, b: 130, type: COLOR_TYPE.SOLID }, // Skin shadow
                { r: 101, g: 67, b: 33, type: COLOR_TYPE.SOLID },   // Hair
                { r: 130, g: 90, b: 55, type: COLOR_TYPE.SOLID },   // Hair highlight
                { r: 65, g: 105, b: 225, type: COLOR_TYPE.SOLID },  // Eye
                { r: 255, g: 255, b: 255, type: COLOR_TYPE.SOLID }, // Eye white
                { r: 70, g: 130, b: 180, type: COLOR_TYPE.SOLID },  // Shirt
                { r: 50, g: 100, b: 150, type: COLOR_TYPE.SOLID },  // Shirt shadow
                { r: 60, g: 60, b: 80, type: COLOR_TYPE.SOLID },    // Pants
                { r: 40, g: 40, b: 60, type: COLOR_TYPE.SOLID },    // Shoes
                { r: 200, g: 100, b: 100, type: COLOR_TYPE.SOLID }, // Mouth
                { r: 30, g: 30, b: 30, type: COLOR_TYPE.SOLID }     // Outline
            ]
        },
        generator: generateHumanTemplate
    },

    robot: {
        name: 'Robot',
        category: TEMPLATE_CATEGORY.ROBOT,
        description: 'Boxy mechanical robot with glowing elements',
        palette: {
            colors: [
                { r: 100, g: 100, b: 120, type: COLOR_TYPE.SOLID },   // Metal
                { r: 60, g: 60, b: 80, type: COLOR_TYPE.SOLID },      // Dark metal
                { r: 200, g: 50, b: 50, type: COLOR_TYPE.EMISSIVE },  // Red light
                { r: 50, g: 200, b: 255, type: COLOR_TYPE.EMISSIVE }, // Blue light
                { r: 180, g: 180, b: 200, type: COLOR_TYPE.SOLID },   // Light metal
                { r: 40, g: 40, b: 50, type: COLOR_TYPE.SOLID }       // Black
            ]
        },
        generator: generateRobotTemplate
    },

    cat: {
        name: 'Cat',
        category: TEMPLATE_CATEGORY.ANIMAL,
        description: 'Cute humanoid cat with ears and tail',
        palette: {
            colors: [
                { r: 255, g: 200, b: 150, type: COLOR_TYPE.SOLID }, // Fur light
                { r: 200, g: 150, b: 100, type: COLOR_TYPE.SOLID }, // Fur dark
                { r: 255, g: 220, b: 200, type: COLOR_TYPE.SOLID }, // Inner ear/belly
                { r: 255, g: 180, b: 200, type: COLOR_TYPE.SOLID }, // Nose
                { r: 100, g: 200, b: 100, type: COLOR_TYPE.SOLID }, // Eye
                { r: 30, g: 30, b: 30, type: COLOR_TYPE.SOLID },    // Pupil
                { r: 70, g: 130, b: 180, type: COLOR_TYPE.SOLID },  // Clothing
                { r: 50, g: 100, b: 150, type: COLOR_TYPE.SOLID }   // Clothing shadow
            ]
        },
        generator: generateCatTemplate
    },

    slime: {
        name: 'Slime',
        category: TEMPLATE_CATEGORY.CREATURE,
        description: 'Blob-shaped creature with translucent body',
        palette: {
            colors: [
                { r: 100, g: 255, b: 150, type: COLOR_TYPE.TRANSPARENT }, // Body
                { r: 50, g: 200, b: 100, type: COLOR_TYPE.SOLID },        // Core
                { r: 255, g: 255, b: 255, type: COLOR_TYPE.SOLID },       // Eye white
                { r: 30, g: 30, b: 30, type: COLOR_TYPE.SOLID }           // Eye pupil
            ]
        },
        generator: generateSlimeTemplate
    },

    ghost: {
        name: 'Ghost',
        category: TEMPLATE_CATEGORY.CREATURE,
        description: 'Floating spectral creature',
        palette: {
            colors: [
                { r: 220, g: 220, b: 255, type: COLOR_TYPE.TRANSPARENT }, // Body
                { r: 180, g: 180, b: 220, type: COLOR_TYPE.TRANSPARENT }, // Shadow
                { r: 50, g: 50, b: 100, type: COLOR_TYPE.SOLID },         // Eye
                { r: 255, g: 255, b: 255, type: COLOR_TYPE.EMISSIVE }     // Glow
            ]
        },
        generator: generateGhostTemplate
    },

    empty: {
        name: 'Empty',
        category: TEMPLATE_CATEGORY.CUSTOM,
        description: 'Start from scratch with no voxels',
        palette: {
            colors: [
                { r: 234, g: 192, b: 157, type: COLOR_TYPE.SOLID },
                { r: 200, g: 160, b: 130, type: COLOR_TYPE.SOLID },
                { r: 101, g: 67, b: 33, type: COLOR_TYPE.SOLID },
                { r: 70, g: 130, b: 180, type: COLOR_TYPE.SOLID },
                { r: 60, g: 60, b: 80, type: COLOR_TYPE.SOLID },
                { r: 255, g: 255, b: 255, type: COLOR_TYPE.SOLID }
            ]
        },
        generator: () => [] // Empty template
    }
};

// Template generators

function generateHumanTemplate() {
    const voxels = [];
    const skinColor = 0;
    const hairColor = 2;
    const eyeColor = 4;
    const eyeWhite = 5;
    const shirtColor = 6;
    const pantsColor = 8;
    const shoeColor = 9;

    // Head (Y: 56-63)
    for (let y = 56; y < 64; y++) {
        for (let x = 12; x < 20; x++) {
            for (let z = 12; z < 20; z++) {
                const dx = Math.abs(x - 15.5);
                const dz = Math.abs(z - 15.5);
                if (dx > 3 && dz > 3) continue;
                voxels.push({ x, y, z, paletteIndex: skinColor });
            }
        }
    }

    // Hair
    for (let y = 62; y < 64; y++) {
        for (let x = 11; x < 21; x++) {
            for (let z = 11; z < 21; z++) {
                const dx = Math.abs(x - 15.5);
                const dz = Math.abs(z - 15.5);
                if (dx > 4 && dz > 4) continue;
                const key = `${x},${y},${z}`;
                if (!voxels.find(v => v.x === x && v.y === y && v.z === z)) {
                    voxels.push({ x, y, z, paletteIndex: hairColor });
                }
            }
        }
    }

    // Eyes
    voxels.push({ x: 14, y: 59, z: 19, paletteIndex: eyeWhite });
    voxels.push({ x: 17, y: 59, z: 19, paletteIndex: eyeWhite });
    voxels.push({ x: 14, y: 59, z: 20, paletteIndex: eyeColor });
    voxels.push({ x: 17, y: 59, z: 20, paletteIndex: eyeColor });

    // Neck
    for (let y = 52; y < 56; y++) {
        for (let x = 14; x < 18; x++) {
            for (let z = 14; z < 18; z++) {
                voxels.push({ x, y, z, paletteIndex: skinColor });
            }
        }
    }

    // Torso
    for (let y = 38; y < 52; y++) {
        for (let x = 10; x < 22; x++) {
            for (let z = 12; z < 20; z++) {
                voxels.push({ x, y, z, paletteIndex: shirtColor });
            }
        }
    }

    // Arms
    for (let y = 40; y < 52; y++) {
        for (let x = 4; x < 10; x++) {
            for (let z = 14; z < 18; z++) {
                voxels.push({ x, y, z, paletteIndex: y > 46 ? shirtColor : skinColor });
            }
        }
        for (let x = 22; x < 28; x++) {
            for (let z = 14; z < 18; z++) {
                voxels.push({ x, y, z, paletteIndex: y > 46 ? shirtColor : skinColor });
            }
        }
    }

    // Hips
    for (let y = 34; y < 38; y++) {
        for (let x = 10; x < 22; x++) {
            for (let z = 12; z < 20; z++) {
                voxels.push({ x, y, z, paletteIndex: pantsColor });
            }
        }
    }

    // Legs
    for (let y = 6; y < 34; y++) {
        for (let x = 10; x < 16; x++) {
            for (let z = 13; z < 19; z++) {
                voxels.push({ x, y, z, paletteIndex: y < 8 ? shoeColor : pantsColor });
            }
        }
        for (let x = 16; x < 22; x++) {
            for (let z = 13; z < 19; z++) {
                voxels.push({ x, y, z, paletteIndex: y < 8 ? shoeColor : pantsColor });
            }
        }
    }

    // Feet
    for (let y = 0; y < 6; y++) {
        for (let x = 10; x < 16; x++) {
            for (let z = 12; z < 22; z++) {
                voxels.push({ x, y, z, paletteIndex: shoeColor });
            }
        }
        for (let x = 16; x < 22; x++) {
            for (let z = 12; z < 22; z++) {
                voxels.push({ x, y, z, paletteIndex: shoeColor });
            }
        }
    }

    return voxels;
}

function generateRobotTemplate() {
    const voxels = [];
    const metal = 0;
    const darkMetal = 1;
    const redLight = 2;
    const blueLight = 3;
    const lightMetal = 4;

    // Boxy head
    for (let y = 54; y < 64; y++) {
        for (let x = 10; x < 22; x++) {
            for (let z = 10; z < 22; z++) {
                voxels.push({ x, y, z, paletteIndex: metal });
            }
        }
    }

    // Eyes (emissive)
    for (let x = 12; x < 15; x++) {
        voxels.push({ x, y: 58, z: 21, paletteIndex: blueLight });
        voxels.push({ x, y: 59, z: 21, paletteIndex: blueLight });
    }
    for (let x = 17; x < 20; x++) {
        voxels.push({ x, y: 58, z: 21, paletteIndex: blueLight });
        voxels.push({ x, y: 59, z: 21, paletteIndex: blueLight });
    }

    // Body
    for (let y = 30; y < 54; y++) {
        for (let x = 8; x < 24; x++) {
            for (let z = 10; z < 22; z++) {
                voxels.push({ x, y, z, paletteIndex: y % 8 < 4 ? metal : darkMetal });
            }
        }
    }

    // Chest light
    for (let y = 42; y < 48; y++) {
        for (let x = 14; x < 18; x++) {
            voxels.push({ x, y, z: 22, paletteIndex: redLight });
        }
    }

    // Arms
    for (let y = 34; y < 52; y++) {
        for (let x = 2; x < 8; x++) {
            for (let z = 13; z < 19; z++) {
                voxels.push({ x, y, z, paletteIndex: lightMetal });
            }
        }
        for (let x = 24; x < 30; x++) {
            for (let z = 13; z < 19; z++) {
                voxels.push({ x, y, z, paletteIndex: lightMetal });
            }
        }
    }

    // Legs
    for (let y = 0; y < 30; y++) {
        for (let x = 10; x < 16; x++) {
            for (let z = 12; z < 20; z++) {
                voxels.push({ x, y, z, paletteIndex: darkMetal });
            }
        }
        for (let x = 16; x < 22; x++) {
            for (let z = 12; z < 20; z++) {
                voxels.push({ x, y, z, paletteIndex: darkMetal });
            }
        }
    }

    return voxels;
}

function generateCatTemplate() {
    const voxels = [];

    // Start with human base and add cat features
    const humanVoxels = generateHumanTemplate();

    // Add ears
    const furLight = 0;
    const innerEar = 2;

    // Left ear
    for (let y = 62; y < 68; y++) {
        for (let x = 10; x < 14; x++) {
            voxels.push({ x, y, z: 15, paletteIndex: furLight });
            voxels.push({ x, y, z: 16, paletteIndex: y < 66 ? innerEar : furLight });
        }
    }

    // Right ear
    for (let y = 62; y < 68; y++) {
        for (let x = 18; x < 22; x++) {
            voxels.push({ x, y, z: 15, paletteIndex: furLight });
            voxels.push({ x, y, z: 16, paletteIndex: y < 66 ? innerEar : furLight });
        }
    }

    // Combine with human base
    return [...humanVoxels, ...voxels];
}

function generateSlimeTemplate() {
    const voxels = [];
    const body = 0;
    const core = 1;
    const eyeWhite = 2;
    const pupil = 3;

    const centerX = 16, centerY = 20, centerZ = 16;
    const radius = 12;

    // Blob shape
    for (let y = 0; y < 40; y++) {
        for (let x = 4; x < 28; x++) {
            for (let z = 4; z < 28; z++) {
                const dx = x - centerX;
                const dy = (y - centerY) * 1.2;
                const dz = z - centerZ;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < radius) {
                    voxels.push({
                        x, y, z,
                        paletteIndex: dist < radius * 0.5 ? core : body
                    });
                }
            }
        }
    }

    // Eyes
    voxels.push({ x: 12, y: 24, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 13, y: 24, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 12, y: 25, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 13, y: 25, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 12, y: 24, z: 27, paletteIndex: pupil });

    voxels.push({ x: 19, y: 24, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 20, y: 24, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 19, y: 25, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 20, y: 25, z: 26, paletteIndex: eyeWhite });
    voxels.push({ x: 20, y: 24, z: 27, paletteIndex: pupil });

    return voxels;
}

function generateGhostTemplate() {
    const voxels = [];
    const body = 0;
    const shadow = 1;
    const eye = 2;

    const centerX = 16, centerY = 35, centerZ = 16;

    // Ghost body (rounded top, wavy bottom)
    for (let y = 10; y < 60; y++) {
        const radiusAtHeight = y > 40
            ? 10 - (y - 40) * 0.4
            : 10 + Math.sin(y * 0.3) * 2;

        for (let x = 4; x < 28; x++) {
            for (let z = 4; z < 28; z++) {
                const dx = x - centerX;
                const dz = z - centerZ;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < radiusAtHeight) {
                    voxels.push({
                        x, y, z,
                        paletteIndex: y < 20 ? shadow : body
                    });
                }
            }
        }
    }

    // Eyes
    for (let y = 40; y < 46; y++) {
        voxels.push({ x: 12, y, z: 23, paletteIndex: eye });
        voxels.push({ x: 13, y, z: 23, paletteIndex: eye });
        voxels.push({ x: 18, y, z: 23, paletteIndex: eye });
        voxels.push({ x: 19, y, z: 23, paletteIndex: eye });
    }

    return voxels;
}

export class TemplateLibrary {
    constructor() {
        // Built-in templates
        this.templates = new Map();

        // Load built-in templates
        for (const [id, template] of Object.entries(TEMPLATE_DEFINITIONS)) {
            this.templates.set(id, template);
        }

        // Custom templates (user-created)
        this.customTemplates = new Map();
    }

    /**
     * Get template by ID
     */
    getTemplate(id) {
        const template = this.templates.get(id) || this.customTemplates.get(id);
        if (!template) return null;

        return {
            ...template,
            voxels: template.generator ? template.generator() : []
        };
    }

    /**
     * Get all template IDs
     */
    getTemplateIds() {
        return [
            ...Array.from(this.templates.keys()),
            ...Array.from(this.customTemplates.keys())
        ];
    }

    /**
     * Get templates by category
     */
    getTemplatesByCategory(category) {
        const result = [];

        for (const [id, template] of this.templates) {
            if (template.category === category) {
                result.push({ id, ...template });
            }
        }

        for (const [id, template] of this.customTemplates) {
            if (template.category === category) {
                result.push({ id, ...template });
            }
        }

        return result;
    }

    /**
     * Get all categories
     */
    getCategories() {
        return Object.values(TEMPLATE_CATEGORY);
    }

    /**
     * Add custom template
     */
    addCustomTemplate(id, template) {
        this.customTemplates.set(id, {
            ...template,
            category: template.category || TEMPLATE_CATEGORY.CUSTOM
        });
    }

    /**
     * Remove custom template
     */
    removeCustomTemplate(id) {
        return this.customTemplates.delete(id);
    }

    /**
     * Create template from existing avatar
     */
    createTemplateFromAvatar(avatarData, name, description = '') {
        const voxels = avatarData.toArray();
        const palette = avatarData.palette.serialize();

        return {
            name,
            description,
            category: TEMPLATE_CATEGORY.CUSTOM,
            palette,
            generator: () => voxels.map(v => ({ ...v }))
        };
    }

    /**
     * Get template preview data (for thumbnails)
     */
    getTemplatePreview(id) {
        const template = this.templates.get(id) || this.customTemplates.get(id);
        if (!template) return null;

        return {
            name: template.name,
            description: template.description,
            category: template.category,
            thumbnail: template.thumbnail
        };
    }

    /**
     * Serialize custom templates for persistence
     */
    serializeCustomTemplates() {
        const data = {};

        for (const [id, template] of this.customTemplates) {
            data[id] = {
                name: template.name,
                description: template.description,
                category: template.category,
                palette: template.palette,
                voxels: template.generator ? template.generator() : []
            };
        }

        return data;
    }

    /**
     * Load custom templates from persistence
     */
    loadCustomTemplates(data) {
        for (const [id, template] of Object.entries(data)) {
            const voxels = template.voxels || [];
            this.customTemplates.set(id, {
                ...template,
                generator: () => voxels.map(v => ({ ...v }))
            });
        }
    }
}

export default TemplateLibrary;
