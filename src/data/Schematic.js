import { SEMANTIC } from './Semantics.js';
import { MvoxType, MvoxCollisionMode } from './mvox/MvoxTypes.js';

export class Schematic {
    constructor() {
        this.blocks = new Map();
        this.metadata = {
            type: MvoxType.BUILD,
            collisionMode: MvoxCollisionMode.SOLID,
            gravity: "PLANAR",
            gravityStrength: 9.8,
            gravityCenter: { x: 0, y: 0, z: 0 },
            gravityDirection: { x: 0, y: -1, z: 0 },
            scale: 1.0,
            version: 1,
            created: Date.now(),
            author: 'unknown',
            name: 'Untitled'
        };
        this.bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };
        this.statistics = {
            blockCount: 0,
            solidBlocks: 0,
            liquidBlocks: 0,
            airBlocks: 0,
            emissiveBlocks: 0
        };
    }

    addBlock(x, y, z, blockData) {
        const key = `${x},${y},${z}`;
        const enhancedBlockData = {
            ...blockData,
            emissive: blockData.emissive || false
        };
        this.blocks.set(key, enhancedBlockData);
        this.updateBounds(x, y, z);
        this.updateStatistics(enhancedBlockData);

        if (enhancedBlockData.emissive) {
            if (!this.metadata.hasEmissive) {
                this.metadata.hasEmissive = true;
            }
            if (!this.metadata.emissiveBlocks) {
                this.metadata.emissiveBlocks = 0;
            }
            this.metadata.emissiveBlocks++;
        }
    }

    removeBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        const block = this.blocks.get(key);
        if (block) {
            this.blocks.delete(key);
            this.statistics.blockCount--;

            if (block.emissive && this.metadata.emissiveBlocks) {
                this.metadata.emissiveBlocks--;
                if (this.metadata.emissiveBlocks === 0) {
                    this.metadata.hasEmissive = false;
                }
            }

            return block;
        }
        return null;
    }

    getBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        return this.blocks.get(key) || null;
    }

    hasBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        return this.blocks.has(key);
    }

    updateBounds(x, y, z) {
        this.bounds.min.x = Math.min(this.bounds.min.x, x);
        this.bounds.min.y = Math.min(this.bounds.min.y, y);
        this.bounds.min.z = Math.min(this.bounds.min.z, z);

        this.bounds.max.x = Math.max(this.bounds.max.x, x);
        this.bounds.max.y = Math.max(this.bounds.max.y, y);
        this.bounds.max.z = Math.max(this.bounds.max.z, z);
    }

    updateStatistics(blockData) {
        this.statistics.blockCount++;

        if (blockData.semantics) {
            if (blockData.semantics & SEMANTIC.SOLID) {
                this.statistics.solidBlocks++;
            } else if (blockData.semantics & SEMANTIC.LIQUID) {
                this.statistics.liquidBlocks++;
            } else if (blockData.semantics & SEMANTIC.GAS) {
                this.statistics.airBlocks++;
            }

            if (blockData.emissive || (blockData.semantics & SEMANTIC.EMISSIVE)) {
                this.statistics.emissiveBlocks++;
            }
        }
    }

    setGravity(type, params = {}) {
        this.metadata.gravity = type;

        switch(type) {
            case "POINT":
                this.metadata.gravityCenter = params.center || { x: 0, y: 0, z: 0 };
                this.metadata.gravityRadius = params.radius || 1000;
                this.metadata.surfaceGravity = params.surfaceGravity || 9.8;
                break;

            case "RING":
                this.metadata.ringAxis = params.axis || { x: 0, y: 1, z: 0 };
                this.metadata.ringRadius = params.radius || 1000;
                this.metadata.tubeRadius = params.tubeRadius || 200;
                this.metadata.rotationSpeed = params.rotationSpeed || 0.001;
                this.metadata.surfaceGravity = params.surfaceGravity || 9.8;
                break;

            case "PLANAR":
                this.metadata.gravityDirection = params.direction || { x: 0, y: -1, z: 0 };
                this.metadata.gravityStrength = params.strength || 9.8;
                break;

            case "RIBBON":
                this.metadata.gravityStrength = params.strength || 9.8;
                break;

            case "CUSTOM":
                this.metadata.gravityFunction = params.function || null;
                this.metadata.gravityParams = params.customParams || {};
                break;
        }
    }

    getGravityConfig() {
        const config = {
            type: this.metadata.gravity,
            strength: this.metadata.gravityStrength
        };

        switch(this.metadata.gravity) {
            case "POINT":
                config.center = this.metadata.gravityCenter;
                config.radius = this.metadata.gravityRadius;
                config.surfaceGravity = this.metadata.surfaceGravity;
                break;

            case "RING":
                config.axis = this.metadata.ringAxis;
                config.ringRadius = this.metadata.ringRadius;
                config.tubeRadius = this.metadata.tubeRadius;
                config.rotationSpeed = this.metadata.rotationSpeed;
                config.surfaceGravity = this.metadata.surfaceGravity;
                break;

            case "PLANAR":
                config.direction = this.metadata.gravityDirection;
                break;

            case "RIBBON":
                config.strength = this.metadata.gravityStrength;
                break;

            case "CUSTOM":
                config.function = this.metadata.gravityFunction;
                config.params = this.metadata.gravityParams;
                break;
        }

        return config;
    }

    serialize() {
        return {
            version: this.metadata.version,
            metadata: this.metadata,
            bounds: this.bounds,
            statistics: this.statistics,
            blocks: Array.from(this.blocks.entries()).map(([key, value]) => ({
                position: key,
                data: value
            }))
        };
    }

    deserialize(data) {
        this.metadata = data.metadata || this.metadata;
        this.bounds = data.bounds || this.bounds;
        this.statistics = data.statistics || this.statistics;

        this.blocks.clear();
        if (data.blocks) {
            data.blocks.forEach(({ position, data: blockData }) => {
                this.blocks.set(position, blockData);
            });
        }

        return this;
    }

    clone() {
        const newSchematic = new Schematic();
        newSchematic.metadata = { ...this.metadata };
        newSchematic.bounds = {
            min: { ...this.bounds.min },
            max: { ...this.bounds.max }
        };
        newSchematic.statistics = { ...this.statistics };

        this.blocks.forEach((value, key) => {
            newSchematic.blocks.set(key, {
                ...value,
                emissive: value.emissive || false
            });
        });

        return newSchematic;
    }

    merge(otherSchematic, offset = { x: 0, y: 0, z: 0 }) {
        otherSchematic.blocks.forEach((blockData, key) => {
            const [x, y, z] = key.split(',').map(Number);
            this.addBlock(
                x + offset.x,
                y + offset.y,
                z + offset.z,
                { ...blockData }
            );
        });

        return this;
    }

    transform(transformFunc) {
        const newBlocks = new Map();

        this.blocks.forEach((blockData, key) => {
            const [x, y, z] = key.split(',').map(Number);
            const transformed = transformFunc(x, y, z, blockData);

            if (transformed) {
                const newKey = `${transformed.x},${transformed.y},${transformed.z}`;
                newBlocks.set(newKey, transformed.data || blockData);
            }
        });

        this.blocks = newBlocks;
        this.recalculateBounds();
        return this;
    }

    recalculateBounds() {
        this.bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        this.blocks.forEach((_, key) => {
            const [x, y, z] = key.split(',').map(Number);
            this.updateBounds(x, y, z);
        });
    }

    getVolume() {
        const width = this.bounds.max.x - this.bounds.min.x + 1;
        const height = this.bounds.max.y - this.bounds.min.y + 1;
        const depth = this.bounds.max.z - this.bounds.min.z + 1;
        return width * height * depth;
    }

    getDimensions() {
        return {
            width: this.bounds.max.x - this.bounds.min.x + 1,
            height: this.bounds.max.y - this.bounds.min.y + 1,
            depth: this.bounds.max.z - this.bounds.min.z + 1
        };
    }
}

export class RingworldSchematic extends Schematic {
    constructor() {
        super();
        this.metadata.gravity = "RING";
        this.metadata.type = MvoxType.STRUCTURE;
        this.metadata.collisionMode = MvoxCollisionMode.SOLID;
        this.innerRadius = 0;
        this.outerRadius = 0;

        this.metadata.ringAxis = { x: 0, y: 1, z: 0 };
        this.metadata.ringRadius = 1000;
        this.metadata.tubeRadius = 200;
        this.metadata.rotationSpeed = 0.001;
        this.metadata.dayNightCycle = true;
        this.metadata.shadowSquares = [];
    }

    addShadowSquare(angle, width, height, distance) {
        this.metadata.shadowSquares.push({
            angle,
            width,
            height,
            distance,
            opacity: 0.8
        });
    }

    getGravityAtRingPosition(ringAngle, tubeAngle) {
        const x = Math.cos(ringAngle) * this.metadata.ringRadius;
        const z = Math.sin(ringAngle) * this.metadata.ringRadius;

        const localX = Math.cos(tubeAngle) * Math.cos(ringAngle);
        const localY = Math.sin(tubeAngle);
        const localZ = Math.cos(tubeAngle) * Math.sin(ringAngle);

        return {
            x: -localX,
            y: -localY,
            z: -localZ
        };
    }

    serialize() {
        const base = super.serialize();
        base.ringworld = {
            innerRadius: this.innerRadius,
            outerRadius: this.outerRadius,
            shadowSquares: this.metadata.shadowSquares
        };
        return base;
    }
}

export class SphericalSchematic extends Schematic {
    constructor() {
        super();
        this.metadata.gravity = "POINT";
        this.metadata.type = MvoxType.PLANET;
        this.metadata.collisionMode = MvoxCollisionMode.TERRAIN;
        this.radius = 0;
        this.coreRadius = 0;
        this.mantleRadius = 0;
        this.crustRadius = 0;
    }

    setLayers(core, mantle, crust) {
        this.coreRadius = core;
        this.mantleRadius = mantle;
        this.crustRadius = crust;
        this.radius = crust;

        this.metadata.gravityRadius = crust;
        this.metadata.layers = {
            core: { radius: core, density: 12.0 },
            mantle: { radius: mantle, density: 4.5 },
            crust: { radius: crust, density: 2.7 }
        };
    }

    getLayerAtRadius(r) {
        if (r <= this.coreRadius) return 'core';
        if (r <= this.mantleRadius) return 'mantle';
        if (r <= this.crustRadius) return 'crust';
        return 'atmosphere';
    }

    serialize() {
        const base = super.serialize();
        base.spherical = {
            radius: this.radius,
            coreRadius: this.coreRadius,
            mantleRadius: this.mantleRadius,
            crustRadius: this.crustRadius
        };
        return base;
    }
}

export class PlanarSchematic extends Schematic {
    constructor() {
        super();
        this.metadata.gravity = "PLANAR";
        this.metadata.type = MvoxType.BUILD;
        this.metadata.collisionMode = MvoxCollisionMode.SOLID;
        this.metadata.infinite = false;
        this.metadata.wrapping = { x: false, z: false };
    }

    setWrapping(wrapX, wrapZ) {
        this.metadata.wrapping.x = wrapX;
        this.metadata.wrapping.z = wrapZ;
    }

    setInfinite(infinite = true) {
        this.metadata.infinite = infinite;
    }

    wrapCoordinates(x, y, z) {
        let wrappedX = x;
        let wrappedZ = z;

        if (this.metadata.wrapping.x) {
            const width = this.bounds.max.x - this.bounds.min.x + 1;
            wrappedX = ((x - this.bounds.min.x) % width + width) % width + this.bounds.min.x;
        }

        if (this.metadata.wrapping.z) {
            const depth = this.bounds.max.z - this.bounds.min.z + 1;
            wrappedZ = ((z - this.bounds.min.z) % depth + depth) % depth + this.bounds.min.z;
        }

        return { x: wrappedX, y, z: wrappedZ };
    }
}

export { MvoxType, MvoxCollisionMode };
