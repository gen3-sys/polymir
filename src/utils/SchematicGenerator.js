/**
 * Schematic Generator - SOLID CONNECTED VOXELS
 * Creates procedural .mvox schematic files with SOLID, CONNECTED voxel structures
 * No floating pixels - everything must be connected!
 */

import { MVoxFile } from '../storage/MVoxFile.js';

export class SchematicGenerator {
    constructor() {
        this.colorPalette = {
            stone: 0x888888,
            darkStone: 0x555555,
            weatheredStone: 0x9A9A9A,
            metal: 0xC0C0C0,
            darkMetal: 0x404040,
            brightMetal: 0xE0E0E0,
            glass: 0x87CEEB,
            glowStone: 0xFFFF00,
            wood: 0x8B4513,
            darkWood: 0x654321,
            tech: 0x00FFFF,
            techOrange: 0xFF8800,
            crystal: 0xFF00FF,
            crystalBlue: 0x00FFFF,
            crystalGreen: 0x00FF88,
            sand: 0xF4E4C1,
            darkSand: 0xD4C4A1,
            rust: 0xB7410E,
            fire: 0xFF4400
        };
    }

    /**
     * Generate Ancient Temple - SOLID Stepped Pyramid
     */
    generateAncientTemple() {
        const voxels = new Map();

        
        const tiers = [
            { size: 28, height: 0, levels: 3 },
            { size: 24, height: 3, levels: 3 },
            { size: 20, height: 6, levels: 3 },
            { size: 16, height: 9, levels: 3 },
            { size: 12, height: 12, levels: 4 }
        ];

        for (const tier of tiers) {
            const offset = Math.floor((30 - tier.size) / 2);
            
            for (let x = 0; x < tier.size; x++) {
                for (let z = 0; z < tier.size; z++) {
                    for (let y = tier.height; y < tier.height + tier.levels; y++) {
                        const key = this.encodeKey(offset + x, y, offset + z);
                        const isEdge = x === 0 || x === tier.size - 1 || z === 0 || z === tier.size - 1;
                        const pattern = (x + z) % 7 === 0 && isEdge;

                        voxels.set(key, {
                            type: 'stone',
                            color: pattern ? this.colorPalette.glowStone :
                                   isEdge ? this.colorPalette.darkStone :
                                   this.colorPalette.weatheredStone,
                            semantics: 1,
                            emissive: pattern
                        });
                    }
                }
            }
        }

        
        const pillarPos = [[8, 8], [22, 8], [8, 22], [22, 22]];
        for (const [px, pz] of pillarPos) {
            for (let y = 3; y < 20; y++) {
                
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const key = this.encodeKey(px + dx, y, pz + dz);
                        const isBand = y % 5 === 0;
                        voxels.set(key, {
                            type: 'stone',
                            color: isBand ? this.colorPalette.glowStone : this.colorPalette.darkStone,
                            semantics: 1,
                            emissive: isBand
                        });
                    }
                }
            }
        }

        
        for (let y = 16; y < 20; y++) {
            const size = Math.max(1, 20 - y);
            const offset = 15 - Math.floor(size / 2);
            for (let x = 0; x < size; x++) {
                for (let z = 0; z < size; z++) {
                    const key = this.encodeKey(offset + x, y, offset + z);
                    voxels.set(key, {
                        type: 'stone',
                        color: this.colorPalette.glowStone,
                        semantics: 1,
                        emissive: y === 19
                    });
                }
            }
        }

        return this.createMVoxFile('ancient_temple_01', voxels, {
            name: 'Ancient Temple',
            author: 'Procedural',
            planet: false,
            category: 'alien_ruins',
            tags: ['alien_ruins', 'dungeon', 'ancient'],
            biomes: ['desert', 'mountains'],
            description: 'A solid ziggurat temple with glowing accents',
            spawnFrequency: 0.02
        });
    }

    /**
     * Generate Mining Station - SOLID Industrial Building
     */
    generateMiningStation() {
        const voxels = new Map();

        
        for (let x = 3; x < 27; x++) {
            for (let z = 3; z < 27; z++) {
                for (let y = 0; y < 2; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, {
                        type: 'metal',
                        color: this.colorPalette.darkMetal,
                        semantics: 1
                    });
                }
            }
        }

        
        for (let x = 6; x < 14; x++) {
            for (let y = 2; y < 12; y++) {
                for (let z = 6; z < 14; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, {
                        type: 'metal',
                        color: y % 2 === 0 ? this.colorPalette.metal : this.colorPalette.darkMetal,
                        semantics: 1
                    });
                }
            }
        }

        
        for (let y = 2; y < 19; y++) {
            const width = Math.max(1, 3 - Math.floor(y / 7));
            for (let dx = -width; dx <= width; dx++) {
                for (let dz = -width; dz <= width; dz++) {
                    const key = this.encodeKey(15 + dx, y, 15 + dz);
                    voxels.set(key, {
                        type: 'metal',
                        color: y > 14 ? this.colorPalette.rust : this.colorPalette.darkMetal,
                        semantics: 1
                    });
                }
            }
        }

        
        const siloPos = [[21, 8], [21, 22]];
        for (const [sx, sz] of siloPos) {
            for (let y = 2; y < 15; y++) {
                
                for (let dx = -3; dx <= 3; dx++) {
                    for (let dz = -3; dz <= 3; dz++) {
                        if (dx * dx + dz * dz <= 9) {
                            const key = this.encodeKey(sx + dx, y, sz + dz);
                            voxels.set(key, {
                                type: 'metal',
                                color: y % 4 === 0 ? this.colorPalette.brightMetal : this.colorPalette.metal,
                                semantics: 1
                            });
                        }
                    }
                }
            }
        }

        
        const lightPos = [[8, 12, 8], [22, 12, 8], [8, 12, 22], [22, 12, 22], [15, 19, 15]];
        for (const [x, y, z] of lightPos) {
            const key = this.encodeKey(x, y, z);
            voxels.set(key, {
                type: 'tech',
                color: this.colorPalette.techOrange,
                semantics: 1,
                emissive: true
            });
        }

        return this.createMVoxFile('mining_station_01', voxels, {
            name: 'Mining Station',
            author: 'Procedural',
            planet: false,
            category: 'mining_outpost',
            tags: ['mining_outpost', 'industrial', 'outpost'],
            biomes: ['mountains', 'desert', 'ice'],
            description: 'A solid industrial mining complex',
            spawnFrequency: 0.05
        });
    }

    /**
     * Generate Crashed Frigate - SOLID but damaged ship
     */
    generateCrashedFrigate() {
        const voxels = new Map();

        
        for (let x = 10; x < 70; x++) {
            const relX = (x - 40) / 30.0;
            const maxY = Math.floor(10 - Math.abs(relX) * 7);
            const maxZ = Math.floor(18 - Math.abs(relX) * 13);

            for (let y = 0; y <= maxY; y++) {
                for (let z = 20 - maxZ; z < 20 + maxZ; z++) {
                    
                    if (Math.random() < 0.85) {
                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, {
                            type: 'metal',
                            color: (x % 5 === 0) ? this.colorPalette.brightMetal : this.colorPalette.darkMetal,
                            semantics: 1
                        });
                    }
                }
            }
        }

        
        for (let x = 12; x < 18; x++) {
            for (let y = 8; y < 14; y++) {
                for (let z = 17; z < 23; z++) {
                    const key = this.encodeKey(x, y, z);
                    const isWindow = (y === 10 || y === 11) && (z === 17 || z === 22);
                    voxels.set(key, {
                        type: isWindow ? 'glass' : 'metal',
                        color: isWindow ? this.colorPalette.glass : this.colorPalette.darkMetal,
                        semantics: 1
                    });
                }
            }
        }

        
        for (let x = 65; x < 68; x++) {
            for (let y = 3; y < 7; y++) {
                for (let z = 18; z < 22; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, {
                        type: 'tech',
                        color: 0xFF3300,
                        semantics: 1,
                        emissive: true
                    });
                }
            }
        }

        return this.createMVoxFile('crashed_frigate_01', voxels, {
            name: 'Crashed Frigate',
            author: 'Procedural',
            planet: false,
            category: 'crashed_ship',
            tags: ['crashed_ship', 'salvage', 'wreckage'],
            biomes: ['grassland', 'forest', 'desert'],
            description: 'A solid crashed ship with minor damage',
            spawnFrequency: 0.01
        });
    }

    /**
     * Generate Desert Outpost - SOLID Fort
     */
    generateDesertOutpost() {
        const voxels = new Map();

        
        for (let x = 4; x < 36; x++) {
            for (let y = 0; y < 9; y++) {
                for (let z = 4; z < 36; z++) {
                    const isWall = (x < 7 || x > 32 || z < 7 || z > 32);
                    const isGate = (x < 7 && z >= 18 && z <= 22 && y < 6);

                    if (isWall && !isGate) {
                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, {
                            type: 'sand',
                            color: (x + y + z) % 4 === 0 ? this.colorPalette.darkSand : this.colorPalette.sand,
                            semantics: 1
                        });
                    }
                }
            }
        }

        
        const towers = [[4, 4], [35, 4], [4, 35], [35, 35]];
        for (const [tx, tz] of towers) {
            for (let y = 0; y < 14; y++) {
                
                for (let dx = -3; dx <= 3; dx++) {
                    for (let dz = -3; dz <= 3; dz++) {
                        if (dx * dx + dz * dz <= 9) {
                            const key = this.encodeKey(tx + dx, y, tz + dz);
                            voxels.set(key, {
                                type: 'sand',
                                color: y % 3 === 0 ? this.colorPalette.darkSand : this.colorPalette.sand,
                                semantics: 1
                            });
                        }
                    }
                }
            }

            
            const key = this.encodeKey(tx, 14, tz);
            voxels.set(key, {
                type: 'tech',
                color: this.colorPalette.fire,
                semantics: 1,
                emissive: true
            });
        }

        
        for (let x = 16; x < 24; x++) {
            for (let y = 0; y < 11; y++) {
                for (let z = 16; z < 24; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, {
                        type: 'wood',
                        color: y === 10 ? this.colorPalette.darkWood : this.colorPalette.wood,
                        semantics: 1
                    });
                }
            }
        }

        return this.createMVoxFile('desert_outpost_01', voxels, {
            name: 'Desert Outpost',
            author: 'Procedural',
            planet: false,
            category: 'settlement',
            tags: ['settlement', 'trade', 'outpost'],
            biomes: ['desert'],
            description: 'A solid fortified desert trading post',
            spawnFrequency: 0.03
        });
    }

    /**
     * Generate Crystal Cave - Solid rock with crystal spikes
     */
    generateCrystalCave() {
        const voxels = new Map();

        
        for (let x = 10; x < 22; x++) {
            for (let z = 10; z < 22; z++) {
                for (let y = 0; y < 3; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, {
                        type: 'stone',
                        color: this.colorPalette.darkStone,
                        semantics: 1
                    });
                }
            }
        }

        
        const crystalColors = [
            this.colorPalette.crystal,
            this.colorPalette.crystalBlue,
            this.colorPalette.crystalGreen
        ];

        for (let i = 0; i < 12; i++) {
            const cx = Math.floor(12 + Math.random() * 8);
            const cz = Math.floor(12 + Math.random() * 8);
            const height = Math.floor(3 + Math.random() * 6);
            const color = crystalColors[Math.floor(Math.random() * crystalColors.length)];

            for (let y = 3; y < 3 + height; y++) {
                const size = Math.max(1, Math.floor(3 - (y - 3) * 0.5));
                
                for (let dx = -size; dx <= size; dx++) {
                    for (let dz = -size; dz <= size; dz++) {
                        if (Math.abs(dx) + Math.abs(dz) <= size) {
                            const key = this.encodeKey(cx + dx, y, cz + dz);
                            voxels.set(key, {
                                type: 'crystal',
                                color: color,
                                semantics: 1,
                                emissive: true
                            });
                        }
                    }
                }
            }
        }

        
        for (let y = 3; y < 12; y++) {
            const size = Math.max(1, Math.floor(4 - Math.abs(y - 7) * 0.5));
            for (let dx = -size; dx <= size; dx++) {
                for (let dz = -size; dz <= size; dz++) {
                    if (Math.abs(dx) + Math.abs(dz) <= size) {
                        const key = this.encodeKey(16 + dx, y, 16 + dz);
                        voxels.set(key, {
                            type: 'crystal',
                            color: this.colorPalette.crystalBlue,
                            semantics: 1,
                            emissive: true
                        });
                    }
                }
            }
        }

        return this.createMVoxFile('crystal_cave_01', voxels, {
            name: 'Crystal Cave',
            author: 'Procedural',
            planet: false,
            category: 'dungeon',
            tags: ['dungeon', 'resources', 'cave'],
            biomes: ['mountains', 'crystal'],
            description: 'Solid rock floor with glowing crystal formations',
            spawnFrequency: 0.015
        });
    }

    /**
     * Generate Research Lab - SOLID Modern Building
     */
    generateResearchLab() {
        const voxels = new Map();

        
        for (let x = 4; x < 27; x++) {
            for (let y = 0; y < 16; y++) {
                for (let z = 4; z < 27; z++) {
                    const key = this.encodeKey(x, y, z);
                    const isWindow = (x === 4 || x === 26 || z === 4 || z === 26) &&
                                   y >= 5 && y <= 12 && (y % 3 === 0);

                    voxels.set(key, {
                        type: isWindow ? 'glass' : 'metal',
                        color: isWindow ? this.colorPalette.glass :
                               (x + z) % 8 === 0 ? this.colorPalette.brightMetal : this.colorPalette.metal,
                        semantics: 1
                    });
                }
            }
        }

        
        const antennaPos = [[8, 8], [22, 8], [8, 22], [22, 22]];
        for (const [ax, az] of antennaPos) {
            for (let y = 16; y < 24; y++) {
                const width = Math.max(0, 2 - Math.floor((y - 16) / 4));
                for (let dx = -width; dx <= width; dx++) {
                    for (let dz = -width; dz <= width; dz++) {
                        const key = this.encodeKey(ax + dx, y, az + dz);
                        voxels.set(key, {
                            type: 'metal',
                            color: this.colorPalette.darkMetal,
                            semantics: 1
                        });
                    }
                }
            }
            
            const key = this.encodeKey(ax, 24, az);
            voxels.set(key, {
                type: 'tech',
                color: this.colorPalette.tech,
                semantics: 1,
                emissive: true
            });
        }

        return this.createMVoxFile('research_lab_01', voxels, {
            name: 'Research Lab',
            author: 'Procedural',
            planet: false,
            category: 'research_station',
            tags: ['research_station', 'tech', 'science'],
            biomes: ['grassland', 'ice', 'forest'],
            description: 'A solid modern research facility with antennas',
            spawnFrequency: 0.02
        });
    }

    /**
     * Generate Space Station - SOLID Orbital Structure
     */
    generateSpaceStation() {
        const voxels = new Map();
        const centerX = 15, centerY = 15, centerZ = 15;

        
        for (let x = 8; x < 23; x++) {
            for (let y = 8; y < 23; y++) {
                for (let z = 8; z < 23; z++) {
                    const dist = Math.sqrt(
                        Math.pow(x - centerX, 2) +
                        Math.pow(y - centerY, 2) +
                        Math.pow(z - centerZ, 2)
                    );

                    if (dist < 7) {
                        const key = this.encodeKey(x, y, z);
                        const isWindow = dist > 5.5 && (x + y + z) % 3 === 0;
                        voxels.set(key, {
                            type: isWindow ? 'glass' : 'metal',
                            color: isWindow ? this.colorPalette.glass : this.colorPalette.metal,
                            semantics: 1
                        });
                    }
                }
            }
        }

        
        const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (const [dx, dy, dz] of directions) {
            for (let i = 7; i < 15; i++) {
                for (let w = -1; w <= 1; w++) {
                    for (let h = -1; h <= 1; h++) {
                        const x = centerX + dx * i + (dx === 0 ? w : 0);
                        const y = centerY + dy * i + (dy === 0 ? w : 0);
                        const z = centerZ + dz * i + (dz === 0 ? h : 0);

                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, {
                            type: 'metal',
                            color: i % 3 === 0 ? this.colorPalette.brightMetal : this.colorPalette.darkMetal,
                            semantics: 1
                        });
                    }
                }
            }
        }

        
        for (let angle = 0; angle < 8; angle++) {
            const a = (angle / 8) * Math.PI * 2;
            const x = Math.floor(centerX + Math.cos(a) * 7);
            const z = Math.floor(centerZ + Math.sin(a) * 7);
            const key = this.encodeKey(x, centerY, z);
            voxels.set(key, {
                type: 'tech',
                color: this.colorPalette.tech,
                semantics: 1,
                emissive: true
            });
        }

        return this.createMVoxFile('space_station_01', voxels, {
            name: 'Orbital Station Alpha',
            author: 'Procedural',
            planet: false,
            category: 'space_station',
            tags: ['space_station', 'orbital', 'tech'],
            biomes: [],
            description: 'A solid orbital hub with docking arms',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Derelict Ship - SOLID but damaged
     */
    generateDerelictShip() {
        const voxels = new Map();

        
        for (let x = 15; x < 75; x++) {
            for (let y = 0; y < 12; y++) {
                for (let z = 18; z < 32; z++) {
                    
                    const isDamaged = (x > 40 && x < 50 && y > 4);

                    if (!isDamaged && Math.random() < 0.9) {
                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, {
                            type: 'metal',
                            color: this.colorPalette.rust,
                            semantics: 1
                        });
                    }
                }
            }
        }

        
        for (let x = 10; x < 18; x++) {
            for (let y = 10; y < 16; y++) {
                for (let z = 20; z < 30; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, {
                        type: 'metal',
                        color: this.colorPalette.darkMetal,
                        semantics: 1
                    });
                }
            }
        }

        
        for (let x = 20; x < 70; x += 15) {
            const key = this.encodeKey(x, 6, 25);
            voxels.set(key, {
                type: 'tech',
                color: 0xFF3300,
                semantics: 1,
                emissive: true
            });
        }

        return this.createMVoxFile('derelict_ship_01', voxels, {
            name: 'Derelict Cargo Vessel',
            author: 'Procedural',
            planet: false,
            category: 'derelict_ship',
            tags: ['derelict_ship', 'space', 'salvage'],
            biomes: [],
            description: 'A solid abandoned cargo ship with battle damage',
            spawnFrequency: 0
        });
    }

    /**
     * Helper: Encode 3D coordinates to voxel key (5-bit per axis)
     */
    encodeKey(x, y, z) {
        return (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);
    }

    /**
     * Helper: Create MVoxFile from voxel data
     */
    createMVoxFile(id, voxels, metadata) {
        const mvoxFile = new MVoxFile('build', voxels, metadata);
        return {
            id: `schematic_${id}`,
            mvoxFile: mvoxFile,
            metadata: metadata,
            voxels: voxels
        };
    }

    /**
     * FURNITURE GENERATION - Microblocks (1/8th scale) that can be recolored
     * All furniture uses WOOD semantic flags and microblock scale
     */

    /**
     * Helper to create furniture microblock voxel (recolorable)
     */
    createFurnitureMicroblock(color = 0x8B4513) {
        
        const furnitureSemantics = 0x4000 | 0x0001 | 0x1000000 | 0x4000000 | 0x2000000;
        return {
            type: 'microblock',
            color: color,
            semantics: furnitureSemantics,
            recolorable: true,
            scale: 0.125 
        };
    }

    /**
     * Helper to create object microblock voxel (non-recolorable, can be emissive)
     */
    createObjectMicroblock(color, emissive = false) {
        
        let objectSemantics = 0x0001 | 0x1000000 | 0x4000000 | 0x2000000;
        if (emissive) {
            objectSemantics |= 0x800000; 
        }
        return {
            type: 'microblock',
            color: color,
            semantics: objectSemantics,
            recolorable: false,
            emissive: emissive,
            scale: 0.125 
        };
    }

    /**
     * Generate Chair - Simple chair with customizable color (MICROBLOCKS)
     */
    generateChair() {
        const voxels = new Map();
        const baseColor = 0x8B4513; 

        
        const legPositions = [[1, 1], [5, 1], [1, 5], [5, 5]];
        for (const [lx, lz] of legPositions) {
            for (let y = 0; y < 4; y++) {
                for (let dx = 0; dx < 2; dx++) {
                    for (let dz = 0; dz < 2; dz++) {
                        const key = this.encodeKey(lx + dx, y, lz + dz);
                        voxels.set(key, this.createFurnitureMicroblock(baseColor));
                    }
                }
            }
        }

        
        for (let x = 0; x < 8; x++) {
            for (let z = 0; z < 8; z++) {
                const key = this.encodeKey(x, 4, z);
                voxels.set(key, this.createFurnitureMicroblock(baseColor));
            }
        }

        
        for (let x = 0; x < 8; x++) {
            for (let y = 5; y < 10; y++) {
                for (let z = 0; z < 2; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        return this.createMVoxFile('chair_01', voxels, {
            name: 'Chair',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'seating', 'recolorable'],
            biomes: [],
            description: 'Simple chair - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Table - Simple table with customizable color
     */
    generateTable() {
        const voxels = new Map();
        const baseColor = 0x8B4513;

        
        const legPositions = [[1, 1], [11, 1], [1, 11], [11, 11]];
        for (const [lx, lz] of legPositions) {
            for (let y = 0; y < 6; y++) {
                for (let dx = 0; dx < 2; dx++) {
                    for (let dz = 0; dz < 2; dz++) {
                        const key = this.encodeKey(lx + dx, y, lz + dz);
                        voxels.set(key, this.createFurnitureMicroblock(baseColor));
                    }
                }
            }
        }

        
        for (let x = 0; x < 14; x++) {
            for (let z = 0; z < 14; z++) {
                for (let y = 6; y < 8; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        return this.createMVoxFile('table_01', voxels, {
            name: 'Table',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'surface', 'recolorable'],
            biomes: [],
            description: 'Simple table - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Bed - Simple bed with customizable color
     */
    generateBed() {
        const voxels = new Map();
        const baseColor = 0x8B4513;

        
        const legPositions = [[1, 1], [17, 1], [1, 9], [17, 9]];
        for (const [lx, lz] of legPositions) {
            for (let y = 0; y < 3; y++) {
                for (let dx = 0; dx < 2; dx++) {
                    for (let dz = 0; dz < 2; dz++) {
                        const key = this.encodeKey(lx + dx, y, lz + dz);
                        voxels.set(key, this.createFurnitureMicroblock(baseColor));
                    }
                }
            }
        }

        
        for (let x = 0; x < 20; x++) {
            for (let z = 0; z < 12; z++) {
                for (let y = 3; y < 6; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        
        for (let x = 0; x < 20; x++) {
            for (let y = 6; y < 11; y++) {
                for (let z = 0; z < 2; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        return this.createMVoxFile('bed_01', voxels, {
            name: 'Bed',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'bed', 'recolorable'],
            biomes: [],
            description: 'Simple bed - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Bookshelf - Tall shelf with customizable color
     */
    generateBookshelf() {
        const voxels = new Map();
        const baseColor = 0x8B4513;

        
        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 16; y++) {
                for (let z = 0; z < 6; z++) {
                    
                    const isFrame = x === 0 || x === 9 || z === 0 || z === 5 || y === 0 || y === 15;
                    if (isFrame) {
                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, this.createFurnitureMicroblock(baseColor));
                    }
                }
            }
        }

        
        for (let shelfY of [4, 8, 12]) {
            for (let x = 1; x < 9; x++) {
                for (let z = 1; z < 5; z++) {
                    const key = this.encodeKey(x, shelfY, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        return this.createMVoxFile('bookshelf_01', voxels, {
            name: 'Bookshelf',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'storage', 'recolorable'],
            biomes: [],
            description: 'Tall bookshelf - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Desk - Work desk with customizable color
     */
    generateDesk() {
        const voxels = new Map();
        const baseColor = 0x8B4513;

        
        const legPositions = [[1, 1], [15, 1], [1, 9], [15, 9]];
        for (const [lx, lz] of legPositions) {
            for (let y = 0; y < 6; y++) {
                for (let dx = 0; dx < 2; dx++) {
                    for (let dz = 0; dz < 2; dz++) {
                        const key = this.encodeKey(lx + dx, y, lz + dz);
                        voxels.set(key, this.createFurnitureMicroblock(baseColor));
                    }
                }
            }
        }

        
        for (let x = 0; x < 18; x++) {
            for (let z = 0; z < 12; z++) {
                for (let y = 6; y < 8; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        
        for (let x = 2; x < 8; x++) {
            for (let y = 3; y < 6; y++) {
                const key = this.encodeKey(x, y, 0);
                voxels.set(key, this.createFurnitureMicroblock(baseColor));
            }
        }

        return this.createMVoxFile('desk_01', voxels, {
            name: 'Desk',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'workspace', 'recolorable'],
            biomes: [],
            description: 'Work desk with drawer - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Lamp - Standing lamp with customizable color
     */
    generateLamp() {
        const voxels = new Map();
        const baseColor = 0x8B4513;

        
        for (let x = 0; x < 6; x++) {
            for (let z = 0; z < 6; z++) {
                for (let y = 0; y < 2; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        
        for (let y = 2; y < 12; y++) {
            for (let x = 2; x < 4; x++) {
                for (let z = 2; z < 4; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        
        for (let x = 0; x < 6; x++) {
            for (let z = 0; z < 6; z++) {
                for (let y = 12; y < 16; y++) {
                    const isOuterShell = x === 0 || x === 5 || z === 0 || z === 5 || y === 12 || y === 15;
                    if (isOuterShell) {
                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, this.createFurnitureMicroblock(baseColor));
                    }
                }
            }
        }

        return this.createMVoxFile('lamp_01', voxels, {
            name: 'Floor Lamp',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'lighting', 'recolorable'],
            biomes: [],
            description: 'Standing floor lamp - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Sofa - Comfortable couch with customizable color
     */
    generateSofa() {
        const voxels = new Map();
        const baseColor = 0x8B4513;

        
        for (let x = 0; x < 20; x++) {
            for (let z = 0; z < 10; z++) {
                for (let y = 0; y < 3; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        
        for (let x = 0; x < 20; x++) {
            for (let z = 2; z < 10; z++) {
                for (let y = 3; y < 6; y++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        
        for (let x = 0; x < 20; x++) {
            for (let y = 6; y < 14; y++) {
                for (let z = 0; z < 3; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        
        for (let x of [0, 1, 18, 19]) {
            for (let y = 6; y < 10; y++) {
                for (let z = 2; z < 10; z++) {
                    const key = this.encodeKey(x, y, z);
                    voxels.set(key, this.createFurnitureMicroblock(baseColor));
                }
            }
        }

        return this.createMVoxFile('sofa_01', voxels, {
            name: 'Sofa',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'seating', 'recolorable'],
            biomes: [],
            description: 'Comfortable sofa - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Cabinet - Storage cabinet with customizable color
     */
    generateCabinet() {
        const voxels = new Map();
        const baseColor = 0x8B4513;

        
        for (let x = 0; x < 12; x++) {
            for (let y = 0; y < 12; y++) {
                for (let z = 0; z < 8; z++) {
                    const isFrame = x === 0 || x === 11 || y === 0 || y === 11 || z === 0 || z === 7;
                    if (isFrame) {
                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, this.createFurnitureMicroblock(baseColor));
                    }
                }
            }
        }

        
        for (let x = 1; x < 11; x++) {
            for (let z = 1; z < 7; z++) {
                const key = this.encodeKey(x, 6, z);
                voxels.set(key, this.createFurnitureMicroblock(baseColor));
            }
        }

        
        for (let y of [3, 9]) {
            const key1 = this.encodeKey(5, y, 8);
            const key2 = this.encodeKey(6, y, 8);
            voxels.set(key1, {
                type: 'furniture',
                color: baseColor,
                semantics: 2,
                recolorable: true
            });
            voxels.set(key2, {
                type: 'furniture',
                color: baseColor,
                semantics: 2,
                recolorable: true
            });
        }

        return this.createMVoxFile('cabinet_01', voxels, {
            name: 'Cabinet',
            author: 'Procedural',
            planet: false,
            category: 'furniture',
            tags: ['furniture', 'storage', 'recolorable'],
            biomes: [],
            description: 'Storage cabinet - recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * OBJECTS GENERATION - Non-recolorable detailed household items with emissive elements
     * 16x16x16 microblocks = 1 block scale
     */

    /**
     * Generate Coffee Cup - Small cup with handle
     */
    generateCoffeeCup() {
        const voxels = new Map();
        const cupColor = 0xFFFFFF; 
        const coffeeColor = 0x3E2723; 

        
        for (let y = 0; y < 5; y++) {
            for (let x = 1; x < 5; x++) {
                for (let z = 1; z < 5; z++) {
                    const isEdge = x === 1 || x === 4 || z === 1 || z === 4;
                    const isHollow = y > 0 && y < 4 && x > 1 && x < 4 && z > 1 && z < 4;
                    if (isEdge || y === 0 || !isHollow) {
                        const key = this.encodeKey(x, y, z);
                        voxels.set(key, this.createObjectMicroblock(cupColor));
                    }
                }
            }
        }

        
        for (let x = 2; x < 4; x++) {
            for (let z = 2; z < 4; z++) {
                const key = this.encodeKey(x, 4, z);
                voxels.set(key, this.createObjectMicroblock(coffeeColor));
            }
        }

        
        for (let y = 1; y < 4; y++) {
            voxels.set(this.encodeKey(5, y, 2), this.createObjectMicroblock(cupColor));
            voxels.set(this.encodeKey(5, y, 3), this.createObjectMicroblock(cupColor));
        }

        return this.createMVoxFile('coffee_cup_01', voxels, {
            name: 'Coffee Cup',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'kitchen', 'decorative'],
            biomes: [],
            description: 'Small coffee cup - non-recolorable',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Desk Lamp - Small lamp with emissive bulb
     */
    generateDeskLamp() {
        const voxels = new Map();
        const baseColor = 0x2C2C2C; 
        const bulbColor = 0xFFFF88; 

        
        for (let x = 2; x < 6; x++) {
            for (let z = 2; z < 6; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(baseColor));
            }
        }

        
        for (let y = 1; y < 7; y++) {
            voxels.set(this.encodeKey(3, y, 3), this.createObjectMicroblock(baseColor));
            voxels.set(this.encodeKey(4, y, 3), this.createObjectMicroblock(baseColor));
        }

        
        for (let x = 2; x < 5; x++) {
            for (let z = 2; z < 5; z++) {
                voxels.set(this.encodeKey(x, 7, z), this.createObjectMicroblock(baseColor));
            }
        }

        
        voxels.set(this.encodeKey(3, 6, 3), this.createObjectMicroblock(bulbColor, true));
        voxels.set(this.encodeKey(3, 6, 4), this.createObjectMicroblock(bulbColor, true));

        return this.createMVoxFile('desk_lamp_01', voxels, {
            name: 'Desk Lamp',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'lighting', 'emissive'],
            biomes: [],
            description: 'Small desk lamp with emissive bulb',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Computer Monitor - Screen with emissive display
     */
    generateMonitor() {
        const voxels = new Map();
        const frameColor = 0x1A1A1A; 
        const screenColor = 0x4080FF; 

        
        for (let x = 1; x < 7; x++) {
            for (let z = 2; z < 6; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(frameColor));
            }
        }

        
        for (let y = 1; y < 5; y++) {
            for (let x = 3; x < 5; x++) {
                for (let z = 3; z < 5; z++) {
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(frameColor));
                }
            }
        }

        
        for (let x = 0; x < 10; x++) {
            for (let y = 5; y < 12; y++) {
                for (let z = 2; z < 4; z++) {
                    const isFrame = x === 0 || x === 9 || y === 5 || y === 11 || z === 2;
                    if (isFrame) {
                        voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(frameColor));
                    }
                }
            }
        }

        
        for (let x = 1; x < 9; x++) {
            for (let y = 6; y < 11; y++) {
                voxels.set(this.encodeKey(x, y, 2), this.createObjectMicroblock(screenColor, true));
            }
        }

        return this.createMVoxFile('monitor_01', voxels, {
            name: 'Computer Monitor',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'tech', 'emissive'],
            biomes: [],
            description: 'Computer monitor with emissive screen',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Painting - Framed pixel art
     */
    generatePainting() {
        const voxels = new Map();
        const frameColor = 0x654321; 
        const colors = [0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00, 0xFF00FF, 0x00FFFF];

        
        for (let x = 0; x < 12; x++) {
            for (let y = 0; y < 12; y++) {
                const isFrame = x === 0 || x === 11 || y === 0 || y === 11;
                const key = this.encodeKey(x, y, 0);
                if (isFrame) {
                    voxels.set(key, this.createObjectMicroblock(frameColor));
                }
            }
        }

        
        for (let x = 1; x < 11; x++) {
            for (let y = 1; y < 11; y++) {
                const colorIndex = ((x - 1) + (y - 1) * 2) % colors.length;
                const pattern = (x + y) % 3 === 0;
                if (pattern) {
                    voxels.set(this.encodeKey(x, y, 0), this.createObjectMicroblock(colors[colorIndex]));
                }
            }
        }

        return this.createMVoxFile('painting_01', voxels, {
            name: 'Abstract Painting',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'art'],
            biomes: [],
            description: 'Framed abstract pixel art',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Window Frame - Window with glass panes
     */
    generateWindowFrame() {
        const voxels = new Map();
        const frameColor = 0x8B4513; 
        const glassColor = 0x87CEEB; 

        
        for (let x = 0; x < 12; x++) {
            for (let y = 0; y < 14; y++) {
                for (let z = 0; z < 2; z++) {
                    const isOuterFrame = x === 0 || x === 11 || y === 0 || y === 13 || z === 0 || z === 1;
                    if (isOuterFrame) {
                        voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(frameColor));
                    }
                }
            }
        }

        
        for (let y = 1; y < 13; y++) {
            voxels.set(this.encodeKey(6, y, 0), this.createObjectMicroblock(frameColor));
        }

        
        for (let x = 1; x < 11; x++) {
            voxels.set(this.encodeKey(x, 7, 0), this.createObjectMicroblock(frameColor));
        }

        
        for (let x = 1; x < 11; x++) {
            for (let y = 1; y < 13; y++) {
                const isNotDivider = x !== 6 && y !== 7;
                if (isNotDivider) {
                    voxels.set(this.encodeKey(x, y, 0), this.createObjectMicroblock(glassColor));
                }
            }
        }

        return this.createMVoxFile('window_frame_01', voxels, {
            name: 'Window Frame',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'window'],
            biomes: [],
            description: 'Window frame with glass panes',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Table Lamp - Small decorative lamp with emissive shade
     */
    generateTableLamp() {
        const voxels = new Map();
        const baseColor = 0x654321; 
        const poleColor = 0x8B8B8B; 
        const shadeColor = 0xFFE4B5; 

        
        for (let x = 1; x < 6; x++) {
            for (let z = 1; z < 6; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(baseColor));
            }
        }

        
        for (let y = 1; y < 6; y++) {
            voxels.set(this.encodeKey(3, y, 3), this.createObjectMicroblock(poleColor));
        }

        
        for (let x = 1; x < 6; x++) {
            for (let z = 1; z < 6; z++) {
                for (let y = 6; y < 9; y++) {
                    const isEdge = x === 1 || x === 5 || z === 1 || z === 5 || y === 6 || y === 8;
                    if (isEdge) {
                        voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(shadeColor, true));
                    }
                }
            }
        }

        return this.createMVoxFile('table_lamp_01', voxels, {
            name: 'Table Lamp',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'lighting', 'emissive'],
            biomes: [],
            description: 'Small table lamp with emissive shade',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Candle - Small candle with emissive flame
     */
    generateCandle() {
        const voxels = new Map();
        const candleColor = 0xFFF8DC; 
        const flameColor = 0xFFA500; 

        
        for (let x = 2; x < 5; x++) {
            for (let z = 2; z < 5; z++) {
                for (let y = 0; y < 5; y++) {
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(candleColor));
                }
            }
        }

        
        voxels.set(this.encodeKey(3, 5, 3), this.createObjectMicroblock(flameColor, true));
        voxels.set(this.encodeKey(3, 6, 3), this.createObjectMicroblock(0xFFFF00, true)); 

        return this.createMVoxFile('candle_01', voxels, {
            name: 'Candle',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'lighting', 'emissive'],
            biomes: [],
            description: 'Small candle with emissive flame',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Book - Small book object
     */
    generateBook() {
        const voxels = new Map();
        const coverColor = 0x8B0000; 
        const pageColor = 0xFFFAF0; 

        
        for (let x = 1; x < 6; x++) {
            for (let y = 0; y < 6; y++) {
                for (let z = 1; z < 3; z++) {
                    const isCover = x === 1 || x === 5 || y === 0 || y === 5 || z === 1 || z === 2;
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(isCover ? coverColor : pageColor));
                }
            }
        }

        return this.createMVoxFile('book_01', voxels, {
            name: 'Book',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'reading'],
            biomes: [],
            description: 'Small book object',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Mug - Coffee/tea mug
     */
    generateMug() {
        const voxels = new Map();
        const mugColor = 0x4169E1; 

        
        for (let y = 0; y < 5; y++) {
            for (let x = 2; x < 6; x++) {
                for (let z = 2; z < 6; z++) {
                    const isEdge = x === 2 || x === 5 || z === 2 || z === 5 || y === 0;
                    const isHollow = y > 0 && y < 4 && x > 2 && x < 5 && z > 2 && z < 5;
                    if (isEdge || !isHollow) {
                        voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(mugColor));
                    }
                }
            }
        }

        
        for (let y = 1; y < 4; y++) {
            voxels.set(this.encodeKey(6, y, 3), this.createObjectMicroblock(mugColor));
            voxels.set(this.encodeKey(6, y, 4), this.createObjectMicroblock(mugColor));
        }

        return this.createMVoxFile('mug_01', voxels, {
            name: 'Mug',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'kitchen', 'decorative'],
            biomes: [],
            description: 'Blue ceramic mug',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Keyboard - Computer keyboard
     */
    generateKeyboard() {
        const voxels = new Map();
        const baseColor = 0x2C2C2C; 
        const keyColor = 0x404040; 

        
        for (let x = 0; x < 14; x++) {
            for (let z = 0; z < 6; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(baseColor));
            }
        }

        
        for (let x = 1; x < 13; x++) {
            for (let z = 1; z < 5; z++) {
                if ((x + z) % 2 === 0) {
                    voxels.set(this.encodeKey(x, 1, z), this.createObjectMicroblock(keyColor));
                }
            }
        }

        return this.createMVoxFile('keyboard_01', voxels, {
            name: 'Keyboard',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'tech', 'computer'],
            biomes: [],
            description: 'Computer keyboard',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Mouse - Computer mouse
     */
    generateMouse() {
        const voxels = new Map();
        const mouseColor = 0x1A1A1A;

        
        for (let x = 2; x < 6; x++) {
            for (let y = 0; y < 2; y++) {
                for (let z = 1; z < 6; z++) {
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(mouseColor));
                }
            }
        }

        
        voxels.set(this.encodeKey(3, 2, 2), this.createObjectMicroblock(0x404040));
        voxels.set(this.encodeKey(4, 2, 2), this.createObjectMicroblock(0x404040));

        return this.createMVoxFile('mouse_01', voxels, {
            name: 'Mouse',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'tech', 'computer'],
            biomes: [],
            description: 'Computer mouse',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Plant Pot - Small potted plant
     */
    generatePlantPot() {
        const voxels = new Map();
        const potColor = 0x8B4513;
        const soilColor = 0x3E2723;
        const plantColor = 0x228B22;

        
        for (let y = 0; y < 4; y++) {
            for (let x = 1; x < 6; x++) {
                for (let z = 1; z < 6; z++) {
                    const isEdge = x === 1 || x === 5 || z === 1 || z === 5 || y === 0;
                    const isHollow = y > 0 && x > 1 && x < 5 && z > 1 && z < 5;
                    if (isEdge || !isHollow) {
                        voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(potColor));
                    }
                }
            }
        }

        
        for (let x = 2; x < 5; x++) {
            for (let z = 2; z < 5; z++) {
                voxels.set(this.encodeKey(x, 3, z), this.createObjectMicroblock(soilColor));
            }
        }

        
        for (let y = 4; y < 8; y++) {
            voxels.set(this.encodeKey(3, y, 3), this.createObjectMicroblock(plantColor));
        }

        
        const leafPositions = [[2, 7, 3], [4, 7, 3], [3, 7, 2], [3, 7, 4], [3, 8, 3]];
        for (const [x, y, z] of leafPositions) {
            voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(plantColor));
        }

        return this.createMVoxFile('plant_pot_01', voxels, {
            name: 'Potted Plant',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'plant'],
            biomes: [],
            description: 'Small potted plant',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Clock - Wall clock
     */
    generateClock() {
        const voxels = new Map();
        const frameColor = 0x654321;
        const faceColor = 0xFFFAF0;
        const handColor = 0x000000;

        
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                const dx = x - 3.5;
                const dy = y - 3.5;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 3.8 && dist > 3) {
                    voxels.set(this.encodeKey(x, y, 0), this.createObjectMicroblock(frameColor));
                } else if (dist <= 3) {
                    voxels.set(this.encodeKey(x, y, 0), this.createObjectMicroblock(faceColor));
                }
            }
        }

        
        voxels.set(this.encodeKey(4, 4, 0), this.createObjectMicroblock(handColor));
        voxels.set(this.encodeKey(4, 3, 0), this.createObjectMicroblock(handColor));
        voxels.set(this.encodeKey(5, 4, 0), this.createObjectMicroblock(handColor));

        return this.createMVoxFile('clock_01', voxels, {
            name: 'Wall Clock',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'time'],
            biomes: [],
            description: 'Round wall clock',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Picture Frame - Empty photo frame
     */
    generatePictureFrame() {
        const voxels = new Map();
        const frameColor = 0xFFD700; 
        const photoColor = 0x87CEEB;

        
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 10; y++) {
                const isFrame = x === 0 || x === 7 || y === 0 || y === 9;
                voxels.set(this.encodeKey(x, y, 0), this.createObjectMicroblock(isFrame ? frameColor : photoColor));
            }
        }

        return this.createMVoxFile('picture_frame_01', voxels, {
            name: 'Picture Frame',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'photo'],
            biomes: [],
            description: 'Gold picture frame',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Vase - Decorative vase
     */
    generateVase() {
        const voxels = new Map();
        const vaseColor = 0x4682B4; 

        
        for (let y = 0; y < 7; y++) {
            const width = y < 2 ? 2 : (y < 5 ? 3 : 2);
            const offset = 3 - Math.floor(width / 2);
            for (let x = offset; x < offset + width; x++) {
                for (let z = offset; z < offset + width; z++) {
                    const isEdge = x === offset || x === offset + width - 1 || z === offset || z === offset + width - 1;
                    const isHollow = y > 1 && y < 6;
                    if (isEdge || !isHollow || y === 0) {
                        voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(vaseColor));
                    }
                }
            }
        }

        return this.createMVoxFile('vase_01', voxels, {
            name: 'Vase',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative'],
            biomes: [],
            description: 'Decorative blue vase',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Bottle - Glass bottle
     */
    generateBottle() {
        const voxels = new Map();
        const glassColor = 0x90EE90;
        const capColor = 0x8B4513;

        
        for (let y = 0; y < 6; y++) {
            for (let x = 2; x < 5; x++) {
                for (let z = 2; z < 5; z++) {
                    const isEdge = x === 2 || x === 4 || z === 2 || z === 4 || y === 0;
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(glassColor));
                }
            }
        }

        
        for (let y = 6; y < 8; y++) {
            voxels.set(this.encodeKey(3, y, 3), this.createObjectMicroblock(glassColor));
        }

        
        voxels.set(this.encodeKey(3, 8, 3), this.createObjectMicroblock(capColor));

        return this.createMVoxFile('bottle_01', voxels, {
            name: 'Glass Bottle',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'kitchen'],
            biomes: [],
            description: 'Green glass bottle',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Radio - Vintage radio with emissive dial
     */
    generateRadio() {
        const voxels = new Map();
        const bodyColor = 0x654321; 
        const dialColor = 0x00FF00; 
        const speakerColor = 0x2C2C2C;

        
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 5; y++) {
                for (let z = 0; z < 4; z++) {
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(bodyColor));
                }
            }
        }

        
        for (let x = 1; x < 3; x++) {
            for (let y = 1; y < 4; y++) {
                voxels.set(this.encodeKey(x, y, 3), this.createObjectMicroblock(speakerColor));
            }
        }

        
        for (let x = 5; x < 7; x++) {
            for (let y = 2; y < 4; y++) {
                voxels.set(this.encodeKey(x, y, 3), this.createObjectMicroblock(dialColor, true));
            }
        }

        return this.createMVoxFile('radio_01', voxels, {
            name: 'Vintage Radio',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'tech', 'emissive', 'vintage'],
            biomes: [],
            description: 'Vintage radio with emissive dial',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Speaker - Audio speaker
     */
    generateSpeaker() {
        const voxels = new Map();
        const bodyColor = 0x1A1A1A;
        const coneColor = 0x404040;

        
        for (let x = 1; x < 7; x++) {
            for (let y = 0; y < 8; y++) {
                for (let z = 0; z < 5; z++) {
                    const isEdge = x === 1 || x === 6 || y === 0 || y === 7 || z === 0 || z === 4;
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(isEdge ? bodyColor : coneColor));
                }
            }
        }

        
        for (let x = 2; x < 6; x++) {
            for (let y = 2; y < 6; y++) {
                const dx = x - 3.5;
                const dy = y - 3.5;
                if (Math.sqrt(dx * dx + dy * dy) < 1.8) {
                    voxels.set(this.encodeKey(x, y, 4), this.createObjectMicroblock(coneColor));
                }
            }
        }

        return this.createMVoxFile('speaker_01', voxels, {
            name: 'Speaker',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'tech', 'audio'],
            biomes: [],
            description: 'Audio speaker',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Tablet - Tablet device with emissive screen
     */
    generateTablet() {
        const voxels = new Map();
        const frameColor = 0x2C2C2C;
        const screenColor = 0x4080FF; 

        
        for (let x = 0; x < 10; x++) {
            for (let z = 0; z < 7; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(frameColor));
            }
        }

        
        for (let x = 1; x < 9; x++) {
            for (let z = 1; z < 6; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(screenColor, true));
            }
        }

        return this.createMVoxFile('tablet_01', voxels, {
            name: 'Tablet',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'tech', 'emissive'],
            biomes: [],
            description: 'Tablet with emissive screen',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Alarm Clock - Digital clock with emissive display
     */
    generateAlarmClock() {
        const voxels = new Map();
        const bodyColor = 0x1A1A1A;
        const displayColor = 0xFF0000; 

        
        for (let x = 1; x < 7; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 1; z < 5; z++) {
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(bodyColor));
                }
            }
        }

        
        for (let x = 2; x < 6; x++) {
            voxels.set(this.encodeKey(x, 2, 4), this.createObjectMicroblock(displayColor, true));
        }

        return this.createMVoxFile('alarm_clock_01', voxels, {
            name: 'Alarm Clock',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'time', 'emissive'],
            biomes: [],
            description: 'Digital alarm clock with red display',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Trophy - Award trophy
     */
    generateTrophy() {
        const voxels = new Map();
        const goldColor = 0xFFD700;
        const baseColor = 0x654321;

        
        for (let x = 1; x < 6; x++) {
            for (let z = 1; z < 6; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(baseColor));
            }
        }

        
        for (let y = 1; y < 4; y++) {
            voxels.set(this.encodeKey(3, y, 3), this.createObjectMicroblock(goldColor));
        }

        
        for (let x = 2; x < 5; x++) {
            for (let y = 4; y < 7; y++) {
                for (let z = 2; z < 5; z++) {
                    const isEdge = x === 2 || x === 4 || z === 2 || z === 4 || y === 4;
                    voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(goldColor));
                }
            }
        }

        
        voxels.set(this.encodeKey(1, 5, 3), this.createObjectMicroblock(goldColor));
        voxels.set(this.encodeKey(5, 5, 3), this.createObjectMicroblock(goldColor));

        return this.createMVoxFile('trophy_01', voxels, {
            name: 'Trophy',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'award'],
            biomes: [],
            description: 'Gold trophy',
            spawnFrequency: 0
        });
    }

    /**
     * Generate Globe - World globe
     */
    generateGlobe() {
        const voxels = new Map();
        const oceanColor = 0x4682B4;
        const landColor = 0x228B22;
        const standColor = 0x654321;

        
        for (let x = 1; x < 6; x++) {
            for (let z = 1; z < 6; z++) {
                voxels.set(this.encodeKey(x, 0, z), this.createObjectMicroblock(standColor));
            }
        }

        
        for (let y = 1; y < 3; y++) {
            voxels.set(this.encodeKey(3, y, 3), this.createObjectMicroblock(standColor));
        }

        
        for (let x = 1; x < 7; x++) {
            for (let y = 3; y < 9; y++) {
                for (let z = 1; z < 7; z++) {
                    const dx = x - 3.5;
                    const dy = y - 6;
                    const dz = z - 3.5;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < 2.8) {
                        
                        const isLand = ((x + y + z) % 3 === 0);
                        voxels.set(this.encodeKey(x, y, z), this.createObjectMicroblock(isLand ? landColor : oceanColor));
                    }
                }
            }
        }

        return this.createMVoxFile('globe_01', voxels, {
            name: 'Globe',
            author: 'Procedural',
            planet: false,
            category: 'objects',
            tags: ['objects', 'decorative', 'education'],
            biomes: [],
            description: 'World globe on stand',
            spawnFrequency: 0
        });
    }

    /**
     * Generate all schematics
     */
    generateAll() {
        console.log('—  Generating 40 schematics (8 structures + 8 furniture + 24 objects)...');
        return [
            
            this.generateAncientTemple(),
            this.generateMiningStation(),
            this.generateCrashedFrigate(),
            this.generateDesertOutpost(),
            this.generateCrystalCave(),
            this.generateResearchLab(),
            this.generateSpaceStation(),
            this.generateDerelictShip(),
            
            this.generateChair(),
            this.generateTable(),
            this.generateBed(),
            this.generateBookshelf(),
            this.generateDesk(),
            this.generateLamp(),
            this.generateSofa(),
            this.generateCabinet(),
            
            this.generateCoffeeCup(),
            this.generateDeskLamp(),
            this.generateMonitor(),
            this.generatePainting(),
            this.generateWindowFrame(),
            this.generateTableLamp(),
            this.generateCandle(),
            this.generateBook(),
            this.generateMug(),
            this.generateKeyboard(),
            this.generateMouse(),
            this.generatePlantPot(),
            this.generateClock(),
            this.generatePictureFrame(),
            this.generateVase(),
            this.generateBottle(),
            this.generateRadio(),
            this.generateSpeaker(),
            this.generateTablet(),
            this.generateAlarmClock(),
            this.generateTrophy(),
            this.generateGlobe()
        ];
    }
}
