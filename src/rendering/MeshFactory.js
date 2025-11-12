import * as THREE from '../lib/three.module.js';

export class MeshFactory {
    
    static createChunkMesh(geometryData, material) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometryData.vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(geometryData.normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(geometryData.colors, 3));

        const clonedMaterial = material.clone();
        return new THREE.Mesh(geometry, clonedMaterial);
    }

    
    static disposeMesh(mesh) {
        if (mesh.geometry) {
            mesh.geometry.dispose();
        }
        if (mesh.material) {
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => mat.dispose());
            } else {
                mesh.material.dispose();
            }
        }
    }
}
