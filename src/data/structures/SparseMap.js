export class SparseMap {
    constructor() {
        this.data = new Map();
    }

    key(x, y, z) {
        return `${x},${y},${z}`;
    }

    set(x, y, z, value) {
        this.data.set(this.key(x, y, z), value);
    }

    get(x, y, z) {
        return this.data.get(this.key(x, y, z));
    }

    has(x, y, z) {
        return this.data.has(this.key(x, y, z));
    }

    delete(x, y, z) {
        return this.data.delete(this.key(x, y, z));
    }

    clear() {
        this.data.clear();
    }

    get size() {
        return this.data.size;
    }

    *entries() {
        for (const [key, value] of this.data) {
            const [x, y, z] = key.split(',').map(Number);
            yield [[x, y, z], value];
        }
    }

    [Symbol.iterator]() {
        return this.entries();
    }
}
