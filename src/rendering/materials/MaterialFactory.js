import * as THREE from '../../lib/three.module.js';

export class MaterialFactory {
    static createImpostorMaterial(shaders, planetRadius, chunkTexture, chunkTextureSize, chunkSize, lightPosition = null) {
        return new THREE.ShaderMaterial({
            uniforms: {
                planetRadius: { value: planetRadius },
                chunkTexture: { value: chunkTexture },
                chunkTextureSize: { value: chunkTextureSize },
                chunkSize: { value: chunkSize },
                lightPosition: { value: lightPosition || new THREE.Vector3(500, 300, 500) },
                ambientIntensity: { value: 0.4 },
                debugCulling: { value: 0.0 }
            },
            vertexShader: shaders.vert,
            fragmentShader: shaders.frag
        });
    }

    static createStarImpostorMaterial(shaders, starRadius, chunkTexture, chunkTextureSize, chunkSize) {
        return new THREE.ShaderMaterial({
            uniforms: {
                planetRadius: { value: starRadius },
                chunkTexture: { value: chunkTexture },
                chunkTextureSize: { value: chunkTextureSize },
                chunkSize: { value: chunkSize },
                lightPosition: { value: new THREE.Vector3(0, 0, 0) },
                ambientIntensity: { value: 1.0 },
                time: { value: 0 }
            },
            vertexShader: shaders.vert,
            fragmentShader: shaders.frag
        });
    }

    static createVoxelMaterial(shaders, lightPosition = null) {
        return new THREE.ShaderMaterial({
            uniforms: {
                lightPosition: { value: lightPosition || new THREE.Vector3(500, 300, 500) },
                ambientIntensity: { value: 0.4 }
            },
            vertexShader: shaders.vert,
            fragmentShader: shaders.frag,
            vertexColors: true
        });
    }

    static create3DChunkTexture(size) {
        const data = new Uint8Array(size * size * size);
        const texture = new THREE.DataTexture3D(data, size, size, size);
        texture.format = THREE.RedFormat;
        texture.type = THREE.UnsignedByteType;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.needsUpdate = true;
        return { texture, data };
    }
}
