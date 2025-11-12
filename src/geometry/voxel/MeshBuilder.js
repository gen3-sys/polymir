export class MeshBuilder {
    static buildGeometry(exposedFaces, chunkPosition, chunkSize) {
        const faceCount = exposedFaces.length;
        const vertexCount = faceCount * 6; 

        
        const vertices = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 3);

        let vIdx = 0; 
        let nIdx = 0; 
        let cIdx = 0; 

        for (const face of exposedFaces) {
            const worldX = chunkPosition.x * chunkSize + face.x;
            const worldY = chunkPosition.y * chunkSize + face.y;
            const worldZ = chunkPosition.z * chunkSize + face.z;

            const r = ((face.color >> 16) & 255) / 255;
            const g = ((face.color >> 8) & 255) / 255;
            const b = (face.color & 255) / 255;

            let v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z, v4x, v4y, v4z;
            let nx, ny, nz;

            if (face.dir === 'px') {
                v1x = worldX + 0.5; v1y = worldY - 0.5; v1z = worldZ - 0.5;
                v2x = worldX + 0.5; v2y = worldY + 0.5; v2z = worldZ - 0.5;
                v3x = worldX + 0.5; v3y = worldY + 0.5; v3z = worldZ + 0.5;
                v4x = worldX + 0.5; v4y = worldY - 0.5; v4z = worldZ + 0.5;
                nx = 1; ny = 0; nz = 0;
            } else if (face.dir === 'nx') {
                v1x = worldX - 0.5; v1y = worldY - 0.5; v1z = worldZ + 0.5;
                v2x = worldX - 0.5; v2y = worldY + 0.5; v2z = worldZ + 0.5;
                v3x = worldX - 0.5; v3y = worldY + 0.5; v3z = worldZ - 0.5;
                v4x = worldX - 0.5; v4y = worldY - 0.5; v4z = worldZ - 0.5;
                nx = -1; ny = 0; nz = 0;
            } else if (face.dir === 'py') {
                v1x = worldX - 0.5; v1y = worldY + 0.5; v1z = worldZ - 0.5;
                v2x = worldX - 0.5; v2y = worldY + 0.5; v2z = worldZ + 0.5;
                v3x = worldX + 0.5; v3y = worldY + 0.5; v3z = worldZ + 0.5;
                v4x = worldX + 0.5; v4y = worldY + 0.5; v4z = worldZ - 0.5;
                nx = 0; ny = 1; nz = 0;
            } else if (face.dir === 'ny') {
                v1x = worldX - 0.5; v1y = worldY - 0.5; v1z = worldZ + 0.5;
                v2x = worldX - 0.5; v2y = worldY - 0.5; v2z = worldZ - 0.5;
                v3x = worldX + 0.5; v3y = worldY - 0.5; v3z = worldZ - 0.5;
                v4x = worldX + 0.5; v4y = worldY - 0.5; v4z = worldZ + 0.5;
                nx = 0; ny = -1; nz = 0;
            } else if (face.dir === 'pz') {
                v1x = worldX - 0.5; v1y = worldY - 0.5; v1z = worldZ + 0.5;
                v2x = worldX + 0.5; v2y = worldY - 0.5; v2z = worldZ + 0.5;
                v3x = worldX + 0.5; v3y = worldY + 0.5; v3z = worldZ + 0.5;
                v4x = worldX - 0.5; v4y = worldY + 0.5; v4z = worldZ + 0.5;
                nx = 0; ny = 0; nz = 1;
            } else { 
                v1x = worldX + 0.5; v1y = worldY - 0.5; v1z = worldZ - 0.5;
                v2x = worldX - 0.5; v2y = worldY - 0.5; v2z = worldZ - 0.5;
                v3x = worldX - 0.5; v3y = worldY + 0.5; v3z = worldZ - 0.5;
                v4x = worldX + 0.5; v4y = worldY + 0.5; v4z = worldZ - 0.5;
                nx = 0; ny = 0; nz = -1;
            }

            
            vertices[vIdx++] = v1x; vertices[vIdx++] = v1y; vertices[vIdx++] = v1z;
            vertices[vIdx++] = v2x; vertices[vIdx++] = v2y; vertices[vIdx++] = v2z;
            vertices[vIdx++] = v3x; vertices[vIdx++] = v3y; vertices[vIdx++] = v3z;

            
            vertices[vIdx++] = v1x; vertices[vIdx++] = v1y; vertices[vIdx++] = v1z;
            vertices[vIdx++] = v3x; vertices[vIdx++] = v3y; vertices[vIdx++] = v3z;
            vertices[vIdx++] = v4x; vertices[vIdx++] = v4y; vertices[vIdx++] = v4z;

            
            for (let i = 0; i < 6; i++) {
                normals[nIdx++] = nx;
                normals[nIdx++] = ny;
                normals[nIdx++] = nz;
            }

            
            for (let i = 0; i < 6; i++) {
                colors[cIdx++] = r;
                colors[cIdx++] = g;
                colors[cIdx++] = b;
            }
        }

        return { vertices, normals, colors };
    }
}
