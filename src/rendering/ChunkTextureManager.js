export class ChunkTextureManager {
    constructor(size, texture, data) {
        this.size = size;
        this.texture = texture;
        this.data = data;
    }

    update(cx, cy, cz, isLoaded) {
        const offset = this.size / 2;
        const tx = Math.floor(cx + offset);
        const ty = Math.floor(cy + offset);
        const tz = Math.floor(cz + offset);

        if (tx >= 0 && tx < this.size &&
            ty >= 0 && ty < this.size &&
            tz >= 0 && tz < this.size) {
            const index = tx + ty * this.size + tz * this.size * this.size;
            this.data[index] = isLoaded ? 255 : 0;
        }
    }

    markNeedsUpdate() {
        this.texture.needsUpdate = true;
    }
}
