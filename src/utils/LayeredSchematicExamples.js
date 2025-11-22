/**
 * LayeredSchematicExamples - Example generators demonstrating hierarchical layer system
 *
 * Creates .mvox files with multiple layers showing:
 * - Layer 0: Full-size blocks (1m³)
 * - Layer 1: Microblocks (1/16th scale, 0.0625m³)
 * - Layer 2: Nano-blocks (1/256th scale, 0.00390625m³)
 */

import { MVoxFile } from '../serialization/formats/MVoxFile.js';
import { LayerConfiguration } from '../world/LayerConfiguration.js';
import { LayeredVoxelData } from '../world/LayeredVoxelData.js';

export class LayeredSchematicExamples {
    constructor() {
        this.colorPalette = {
            stone: 0x888888,
            metal: 0xC0C0C0,
            gold: 0xFFD700,
            red: 0xFF0000,
            green: 0x00FF00,
            blue: 0x0000FF,
            yellow: 0xFFFF00,
            cyan: 0x00FFFF,
            magenta: 0xFF00FF,
            white: 0xFFFFFF
        };
    }

    /**
     * Example 1: Simple 2-layer cube
     * Layer 0: 4x4x4 block cube
     * Layer 1: 4x4x4 microblock detail inside one block
     */
    generateSimpleTwoLayerCube() {
        const layerConfig = LayerConfiguration.createSimple(2, 'microblock');
        const layeredData = new LayeredVoxelData(layerConfig);

        // Layer 0: Create a 4x4x4 cube of blocks
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                for (let z = 0; z < 4; z++) {
                    layeredData.setVoxel(0, [x, y, z], {
                        color: this.colorPalette.stone,
                        semantics: 1
                    });
                }
            }
        }

        // Layer 1: Add microblock detail inside the block at (1,1,1)
        // Since layer 1 is at 16x resolution, position (1,1,1) in layer 0
        // corresponds to (16,16,16) to (31,31,31) in layer 1
        const layer1Offset = [16, 16, 16];

        // Create a small golden structure made of microblocks
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                for (let z = 0; z < 8; z++) {
                    // Create a hollow cube pattern
                    const isEdge = x === 0 || x === 7 || y === 0 || y === 7 || z === 0 || z === 7;
                    if (isEdge) {
                        layeredData.setVoxel(1, [
                            layer1Offset[0] + x,
                            layer1Offset[1] + y,
                            layer1Offset[2] + z
                        ], {
                            color: this.colorPalette.gold,
                            semantics: 1
                        });
                    }
                }
            }
        }

        return this.createMVoxFromLayered(layeredData, {
            name: 'Simple Two-Layer Cube',
            description: 'Layer 0: 4x4x4 block cube. Layer 1: Golden microblock details inside block (1,1,1)',
            category: 'example',
            tags: ['example', 'layers', 'tutorial']
        });
    }

    /**
     * Example 2: Three-layer nested detail
     * Demonstrates how microblocks in Layer 1 can contain nano-blocks in Layer 2
     */
    generateThreeLayerNested() {
        const layerConfig = LayerConfiguration.createSimple(3, 'microblock');
        const layeredData = new LayeredVoxelData(layerConfig);

        // Layer 0: Single block
        layeredData.setVoxel(0, [0, 0, 0], {
            color: this.colorPalette.red,
            semantics: 1
        });

        // Layer 1: 16x16x16 microblocks filling that block
        // Create a pattern every 4 microblocks
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                for (let z = 0; z < 16; z++) {
                    if ((x + y + z) % 4 === 0) {
                        layeredData.setVoxel(1, [x, y, z], {
                            color: this.colorPalette.green,
                            semantics: 1
                        });
                    }
                }
            }
        }

        // Layer 2: Nano-blocks (256x smaller than layer 0)
        // Add detail to one layer-1 microblock at (8,8,8)
        // This corresponds to (128,128,128) to (143,143,143) in layer 2
        const layer2Offset = [128, 128, 128];

        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                for (let z = 0; z < 16; z++) {
                    // Create a small sphere pattern
                    const dx = x - 7.5;
                    const dy = y - 7.5;
                    const dz = z - 7.5;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (dist < 6) {
                        layeredData.setVoxel(2, [
                            layer2Offset[0] + x,
                            layer2Offset[1] + y,
                            layer2Offset[2] + z
                        ], {
                            color: this.colorPalette.blue,
                            semantics: 1
                        });
                    }
                }
            }
        }

        return this.createMVoxFromLayered(layeredData, {
            name: 'Three-Layer Nested Detail',
            description: 'Demonstrates recursive detail: block -> microblocks -> nano-blocks',
            category: 'example',
            tags: ['example', 'layers', 'nested', 'advanced']
        });
    }

    /**
     * Example 3: Furniture with fine detail
     * A table at layer 0 with microblock decorations at layer 1
     */
    generateFurnitureWithDetail() {
        const layerConfig = LayerConfiguration.createSimple(2, 'microblock');
        const layeredData = new LayeredVoxelData(layerConfig);

        // Layer 0: Create a simple table (blocks)
        // Table legs
        const legPositions = [[0, 0], [6, 0], [0, 6], [6, 6]];
        for (const [lx, lz] of legPositions) {
            for (let y = 0; y < 4; y++) {
                layeredData.setVoxel(0, [lx, y, lz], {
                    color: this.colorPalette.stone,
                    semantics: 1
                });
            }
        }

        // Table top
        for (let x = 0; x < 7; x++) {
            for (let z = 0; z < 7; z++) {
                layeredData.setVoxel(0, [x, 4, z], {
                    color: this.colorPalette.stone,
                    semantics: 1
                });
            }
        }

        // Layer 1: Add microblock details on table surface
        // Place a small vase made of microblocks at table center
        // Table center is at block (3, 4, 3), which is (48, 64, 48) in layer 1 coordinates
        const vaseBase = [48 + 4, 64 + 16, 48 + 4]; // Offset to center of block, then up one block

        // Vase body
        for (let y = 0; y < 6; y++) {
            const width = y < 2 ? 2 : 3;
            const offset = Math.floor((8 - width) / 2);

            for (let x = 0; x < width; x++) {
                for (let z = 0; z < width; z++) {
                    layeredData.setVoxel(1, [
                        vaseBase[0] + offset + x,
                        vaseBase[1] + y,
                        vaseBase[2] + offset + z
                    ], {
                        color: this.colorPalette.cyan,
                        semantics: 1
                    });
                }
            }
        }

        // Flowers (simple colored dots)
        const flowerPos = [
            [vaseBase[0] + 3, vaseBase[1] + 7, vaseBase[2] + 3],
            [vaseBase[0] + 5, vaseBase[1] + 8, vaseBase[2] + 4],
            [vaseBase[0] + 2, vaseBase[1] + 9, vaseBase[2] + 5]
        ];

        for (const pos of flowerPos) {
            layeredData.setVoxel(1, pos, {
                color: this.colorPalette.magenta,
                semantics: 1
            });
        }

        return this.createMVoxFromLayered(layeredData, {
            name: 'Table with Microblock Vase',
            description: 'Layer 0: Table blocks. Layer 1: Decorative vase made of microblocks',
            category: 'furniture',
            tags: ['furniture', 'layers', 'decorative']
        });
    }

    /**
     * Example 4: Mechanism with fine gears
     * Demonstrates using layers for mechanical detail
     */
    generateMechanismWithGears() {
        const layerConfig = LayerConfiguration.createSimple(2, 'microblock');
        const layeredData = new LayeredVoxelData(layerConfig);

        // Layer 0: Machine housing (metal blocks)
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                for (let z = 0; z < 5; z++) {
                    // Hollow box
                    const isEdge = x === 0 || x === 4 || y === 0 || y === 4 || z === 0 || z === 4;
                    if (isEdge) {
                        layeredData.setVoxel(0, [x, y, z], {
                            color: this.colorPalette.metal,
                            semantics: 1
                        });
                    }
                }
            }
        }

        // Layer 1: Internal gears made of microblocks
        // Gear 1: Centered in block (2, 2, 2) -> (32, 32, 32) in layer 1
        this.createMicroblockGear(layeredData, [32 + 8, 32 + 8, 32 + 8], 6, this.colorPalette.gold);

        // Gear 2: Adjacent gear
        this.createMicroblockGear(layeredData, [32 + 8, 32 + 8, 48 + 8], 5, this.colorPalette.yellow);

        return this.createMVoxFromLayered(layeredData, {
            name: 'Mechanism with Microblock Gears',
            description: 'Layer 0: Metal housing. Layer 1: Intricate gear mechanisms',
            category: 'mechanism',
            tags: ['mechanism', 'layers', 'technical']
        });
    }

    /**
     * Helper: Create a gear pattern using microblocks
     */
    createMicroblockGear(layeredData, center, radius, color) {
        const [cx, cy, cz] = center;
        const numTeeth = 8;

        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 32) {
            const r = radius + (Math.floor((angle / (Math.PI * 2)) * numTeeth) % 2 === 0 ? 1 : 0);
            const x = Math.floor(cx + Math.cos(angle) * r);
            const y = cy;
            const z = Math.floor(cz + Math.sin(angle) * r);

            layeredData.setVoxel(1, [x, y, z], {
                color: color,
                semantics: 1
            });

            // Add thickness
            layeredData.setVoxel(1, [x, y + 1, z], {
                color: color,
                semantics: 1
            });
            layeredData.setVoxel(1, [x, y - 1, z], {
                color: color,
                semantics: 1
            });
        }

        // Center hub
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    if (dx * dx + dy * dy + dz * dz <= 4) {
                        layeredData.setVoxel(1, [cx + dx, cy + dy, cz + dz], {
                            color: color,
                            semantics: 1
                        });
                    }
                }
            }
        }
    }

    /**
     * Helper: Create MVoxFile from LayeredVoxelData
     */
    createMVoxFromLayered(layeredData, metadata) {
        // Convert to flat map for NBT encoding
        const flatMap = layeredData.toFlatMap();

        const mvoxFile = new MVoxFile('build', flatMap, {
            ...metadata,
            author: 'LayeredSystem',
            created: Date.now()
        });

        // Set layer configuration
        mvoxFile.setLayerConfiguration(layeredData.layerConfig);

        return mvoxFile;
    }

    /**
     * Generate all examples
     */
    generateAll() {
        console.log('Generating layered schematic examples...');

        const examples = [
            {
                id: 'two_layer_cube',
                file: this.generateSimpleTwoLayerCube()
            },
            {
                id: 'three_layer_nested',
                file: this.generateThreeLayerNested()
            },
            {
                id: 'furniture_detail',
                file: this.generateFurnitureWithDetail()
            },
            {
                id: 'mechanism_gears',
                file: this.generateMechanismWithGears()
            }
        ];

        console.log(`Generated ${examples.length} layered examples`);
        return examples;
    }

    /**
     * Get usage documentation
     */
    static getDocumentation() {
        return `
Hierarchical Layer System Documentation
=======================================

## Concept
The layer system allows voxels to exist at multiple scales within a single .mvox file.

Layer 0: Full-size blocks (1m³ per voxel)
Layer 1: Microblocks (0.0625m³ per voxel, 16³ per Layer 0 block)
Layer 2: Nano-blocks (0.00390625m³ per voxel, 16³ per Layer 1 microblock)

## Coordinate Systems
Each layer has its own coordinate space:

- Layer 0 position (1, 2, 3) = world position (1m, 2m, 3m)
- Layer 1 position (16, 32, 48) = world position (1m, 2m, 3m)
- Layer 2 position (256, 512, 768) = world position (1m, 2m, 3m)

## Render Modes
- 'block': Voxels render at their layer's base scale
- 'microblock': Voxels render at 1/16th of their layer's base scale

## Use Cases
1. **Furniture Details**: Blocks for structure, microblocks for decoration
2. **Mechanical Parts**: Blocks for housing, microblocks for gears/mechanisms
3. **Artistic Detail**: Blocks for main form, microblocks for fine details
4. **Nested Structures**: Recursive detail at any scale

## File Format
.mvox files with layers include:
{
  "layerConfiguration": {
    "layers": [
      {"index": 0, "position": [0,0,0], "absoluteScale": 1.0, "renderMode": "block"},
      {"index": 1, "position": [0,0,0], "absoluteScale": 0.0625, "renderMode": "microblock"}
    ]
  }
}

NBT data includes layerIndex for each voxel.
        `;
    }
}

export default LayeredSchematicExamples;
