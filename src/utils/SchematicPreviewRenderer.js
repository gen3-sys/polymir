/**
 * Schematic Preview Renderer
 * Uses the same THREE.js voxel rendering as the game engine
 */

import * as THREE from '../lib/three.module.js';
import { FaceCuller, MeshBuilder } from '../geometry/voxel/VoxelRenderer.js';

export class SchematicPreviewRenderer {
    constructor(width = 300, height = 300) {
        this.width = width;
        this.height = height;

        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);

        
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

        
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = false;

        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight1.position.set(1, 1, 0.5);
        this.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
        directionalLight2.position.set(-1, 0.5, -0.5);
        this.scene.add(directionalLight2);
    }

    /**
     * Render voxel schematic using game's voxel renderer
     */
    render(voxels) {
        
        this.scene.children.forEach(child => {
            if (child.isMesh) {
                this.scene.remove(child);
                child.geometry?.dispose();
                child.material?.dispose();
            }
        });

        if (!voxels || voxels.size === 0) {
            this.renderer.render(this.scene, this.camera);
            return this.renderer.domElement.toDataURL('image/png');
        }

        
        const neighborChecker = (x, y, z) => {
            const key = (x & 0x1F) | ((y & 0x1F) << 5) | ((z & 0x1F) << 10);
            return voxels.has(key);
        };

        
        const pseudoChunk = { voxels };

        
        const exposedFaces = FaceCuller.cullHiddenFaces(pseudoChunk, neighborChecker);

        
        const geometryData = MeshBuilder.buildGeometry(exposedFaces, { x: 0, y: 0, z: 0 }, 1);

        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometryData.vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(geometryData.normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(geometryData.colors, 3));

        
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true
        });

        
        const mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);

        
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;

        if (bbox) {
            const center = new THREE.Vector3();
            bbox.getCenter(center);

            const size = new THREE.Vector3();
            bbox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);

            
            const distance = maxDim * 2;
            this.camera.position.set(
                center.x + distance,
                center.y + distance * 0.7,
                center.z + distance
            );
            this.camera.lookAt(center);
        }

        
        this.renderer.render(this.scene, this.camera);

        
        return this.renderer.domElement.toDataURL('image/png');
    }

    /**
     * Render with sampling for large models
     */
    renderWithSampling(voxels, maxVoxels = 2000) {
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
     * Dispose of renderer resources
     */
    dispose() {
        this.scene.children.forEach(child => {
            if (child.isMesh) {
                child.geometry?.dispose();
                child.material?.dispose();
            }
        });
        this.renderer.dispose();
    }
}
