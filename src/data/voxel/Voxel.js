import { SEMANTIC, hasFlag, setFlag, clearFlag } from '../Semantics.js';

export class Voxel {
    constructor(color = 0x000000, semantics = 0) {
        this.color = color;
        this.semantics = semantics;
    }

    hasFlag(flag) {
        return hasFlag(this, flag);
    }

    setFlag(flag) {
        setFlag(this, flag);
    }

    clearFlag(flag) {
        clearFlag(this, flag);
    }

    isSolid() {
        return hasFlag(this, SEMANTIC.SOLID);
    }

    isLiquid() {
        return hasFlag(this, SEMANTIC.LIQUID);
    }

    hasGravity() {
        return hasFlag(this, SEMANTIC.GRAVITY);
    }

    isTransparent() {
        return hasFlag(this, SEMANTIC.TRANSPARENT);
    }

    isEmissive() {
        return hasFlag(this, SEMANTIC.EMISSIVE);
    }

    isFlammable() {
        return hasFlag(this, SEMANTIC.FLAMMABLE);
    }

    isMineable() {
        return hasFlag(this, SEMANTIC.MINEABLE);
    }

    isBreakable() {
        return hasFlag(this, SEMANTIC.BREAKABLE);
    }

    getRGB() {
        return {
            r: (this.color >> 16) & 0xFF,
            g: (this.color >> 8) & 0xFF,
            b: this.color & 0xFF
        };
    }

    getRGBNormalized() {
        return {
            r: ((this.color >> 16) & 0xFF) / 255,
            g: ((this.color >> 8) & 0xFF) / 255,
            b: (this.color & 0xFF) / 255
        };
    }

    setRGB(r, g, b) {
        this.color = ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
    }

    clone() {
        const voxel = new Voxel(this.color, this.semantics);

        if (this.temperature !== undefined) voxel.temperature = this.temperature;
        if (this.light !== undefined) voxel.light = this.light;
        if (this.damage !== undefined) voxel.damage = this.damage;
        if (this.metadata) voxel.metadata = { ...this.metadata };

        return voxel;
    }

    toJSON() {
        const json = {
            color: this.color,
            semantics: this.semantics
        };

        if (this.temperature !== undefined) json.temperature = this.temperature;
        if (this.light !== undefined) json.light = this.light;
        if (this.damage !== undefined) json.damage = this.damage;
        if (this.metadata) json.metadata = this.metadata;

        return json;
    }

    static fromJSON(json) {
        const voxel = new Voxel(json.color || 0x000000, json.semantics || 0);

        if (json.temperature !== undefined) voxel.temperature = json.temperature;
        if (json.light !== undefined) voxel.light = json.light;
        if (json.damage !== undefined) voxel.damage = json.damage;
        if (json.metadata) voxel.metadata = { ...json.metadata };

        return voxel;
    }

    static fromObject(obj) {
        if (obj instanceof Voxel) {
            return obj;
        }
        return Voxel.fromJSON(obj);
    }

    toObject() {
        return this.toJSON();
    }

    toString() {
        const rgb = this.getRGB();
        return `Voxel(color: #${this.color.toString(16).padStart(6, '0')}, rgb: [${rgb.r},${rgb.g},${rgb.b}], semantics: 0x${this.semantics.toString(16).padStart(8, '0')})`;
    }
}

Voxel.createSolid = function(color) {
    return new Voxel(color, SEMANTIC.SOLID);
};

Voxel.createLiquid = function(color) {
    return new Voxel(color, SEMANTIC.LIQUID | SEMANTIC.GRAVITY | SEMANTIC.TRANSPARENT);
};

Voxel.createAir = function() {
    return new Voxel(0x000000, 0);
};

Voxel.createGlass = function(color) {
    return new Voxel(color, SEMANTIC.SOLID | SEMANTIC.TRANSPARENT | SEMANTIC.BREAKABLE);
};

Voxel.createEmissive = function(color, solid = true) {
    const semantics = SEMANTIC.EMISSIVE | (solid ? SEMANTIC.SOLID : 0);
    return new Voxel(color, semantics);
};

export default Voxel;
