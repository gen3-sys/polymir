/**
 * Isometric Schematic Renderer
 * Renders voxel schematics as isometric preview images
 */

export class IsometricSchematicRenderer {
    constructor(width = 200, height = 200) {
        this.width = width;
        this.height = height;
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Render schematic to canvas and return data URL
     */
    render(voxels, dimensions = { x: 32, y: 32, z: 32 }) {
        
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = '#000033';
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!voxels || voxels.size === 0) {
            return this.canvas.toDataURL('image/png');
        }

        
        const voxelArray = [];
        for (const [key, voxel] of voxels) {
            const x = key & 0x1F;
            const y = (key >> 5) & 0x1F;
            const z = (key >> 10) & 0x1F;
            voxelArray.push({ x, y, z, voxel });
        }

        
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const { x, y, z } of voxelArray) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        const sizeX = maxX - minX + 1;
        const sizeY = maxY - minY + 1;
        const sizeZ = maxZ - minZ + 1;
        const maxSize = Math.max(sizeX, sizeY, sizeZ);

        
        const scale = Math.min(this.width, this.height) / (maxSize * 1.5);

        
        voxelArray.sort((a, b) => {
            const depthA = a.x + a.y + a.z;
            const depthB = b.x + b.y + b.z;
            return depthA - depthB;
        });

        
        for (const { x, y, z, voxel } of voxelArray) {
            
            const relX = x - centerX;
            const relY = y - centerY;
            const relZ = z - centerZ;

            
            const isoX = (relX - relZ) * Math.cos(Math.PI / 6);
            const isoY = (relX + relZ) * Math.sin(Math.PI / 6) - relY;

            
            const screenX = this.width / 2 + isoX * scale;
            const screenY = this.height / 2 + isoY * scale;

            
            this.drawIsometricCube(screenX, screenY, scale, voxel.color, voxel.emissive);
        }

        return this.canvas.toDataURL('image/png');
    }

    /**
     * Draw an isometric cube
     */
    drawIsometricCube(x, y, size, color, emissive = false) {
        const width = size * 2;
        const height = size;

        
        const r = (color >> 16) & 0xFF;
        const g = (color >> 8) & 0xFF;
        const b = color & 0xFF;

        
        const topColor = `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
        this.ctx.fillStyle = emissive ? `rgb(${r}, ${g}, ${b})` : topColor;

        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + width / 2, y - height / 2);
        this.ctx.lineTo(x, y - height);
        this.ctx.lineTo(x - width / 2, y - height / 2);
        this.ctx.closePath();
        this.ctx.fill();

        
        const leftColor = `rgb(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)})`;
        this.ctx.fillStyle = emissive ? `rgb(${Math.floor(r * 0.8)}, ${Math.floor(g * 0.8)}, ${Math.floor(b * 0.8)})` : leftColor;

        this.ctx.beginPath();
        this.ctx.moveTo(x - width / 2, y - height / 2);
        this.ctx.lineTo(x, y - height);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x - width / 2, y + height / 2);
        this.ctx.closePath();
        this.ctx.fill();

        
        const rightColor = `rgb(${Math.floor(r * 0.8)}, ${Math.floor(g * 0.8)}, ${Math.floor(b * 0.8)})`;
        this.ctx.fillStyle = emissive ? `rgb(${Math.floor(r * 0.9)}, ${Math.floor(g * 0.9)}, ${Math.floor(b * 0.9)})` : rightColor;

        this.ctx.beginPath();
        this.ctx.moveTo(x + width / 2, y - height / 2);
        this.ctx.lineTo(x, y - height);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + width / 2, y + height / 2);
        this.ctx.closePath();
        this.ctx.fill();

        
        if (emissive) {
            this.ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;
            this.ctx.shadowBlur = 10;
            this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
            this.ctx.beginPath();
            this.ctx.arc(x, y - height / 2, size * 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.lineWidth = 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + width / 2, y - height / 2);
        this.ctx.lineTo(x, y - height);
        this.ctx.lineTo(x - width / 2, y - height / 2);
        this.ctx.closePath();
        this.ctx.stroke();
    }

    /**
     * Render schematic with sampling for large models
     */
    renderWithSampling(voxels, maxVoxels = 1000) {
        if (voxels.size <= maxVoxels) {
            return this.render(voxels);
        }

        
        const sampledVoxels = new Map();
        const sampleRate = Math.ceil(voxels.size / maxVoxels);
        let index = 0;

        for (const [key, voxel] of voxels) {
            if (index % sampleRate === 0) {
                sampledVoxels.set(key, voxel);
            }
            index++;
        }

        return this.render(sampledVoxels);
    }

    /**
     * Get canvas element
     */
    getCanvas() {
        return this.canvas;
    }

    /**
     * Clear canvas
     */
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }
}
