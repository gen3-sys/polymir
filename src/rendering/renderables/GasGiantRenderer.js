import * as THREE from '../lib/three.module.js';

export class GasGiantRenderer {
    constructor(atmosphereConfig, radius) {
        this.config = atmosphereConfig;
        this.radius = radius;
        this.mesh = null;
        this.time = 0;
    }

    createMesh() {
        const geometry = new THREE.IcosahedronGeometry(this.radius, 64);
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                baseColor: { value: new THREE.Color(this.config.baseColor) },
                bandColors: { value: this.config.bandColors.map(c => new THREE.Color(c)) },
                time: { value: 0 },
                turbulence: { value: this.config.turbulence },
                bandSpeed: { value: this.config.bandSpeed }
            },
            vertexShader: this.getVertexShader(),
            fragmentShader: this.getFragmentShader(),
            side: THREE.FrontSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        return this.mesh;
    }

    update(deltaTime) {
        if (!this.mesh) return;
        
        this.time += deltaTime;
        this.mesh.material.uniforms.time.value = this.time;
        
        if (this.config.rotation) {
            this.mesh.rotation.y += this.config.rotation * deltaTime;
        }
    }

    getVertexShader() {
        return `
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }

    getFragmentShader() {
        return `
            uniform vec3 baseColor;
            uniform vec3 bandColors[3];
            uniform float time;
            uniform float turbulence;
            uniform float bandSpeed;
            
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            
            void main() {
                vec3 normal = normalize(vNormal);
                float latitude = asin(normal.y) / 3.14159;
                float longitude = atan(normal.z, normal.x) / 6.28318;
                
                float bandPattern = latitude * 10.0 + time * bandSpeed;
                float turbulenceNoise = noise(vec2(longitude * 20.0, bandPattern)) * turbulence;
                
                bandPattern += turbulenceNoise;
                
                float bandIndex = fract(bandPattern);
                vec3 color = baseColor;
                
                if (bandIndex < 0.33) {
                    color = mix(baseColor, bandColors[0], bandIndex / 0.33);
                } else if (bandIndex < 0.66) {
                    color = mix(bandColors[0], bandColors[1], (bandIndex - 0.33) / 0.33);
                } else {
                    color = mix(bandColors[1], bandColors[2], (bandIndex - 0.66) / 0.34);
                }
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}

export default GasGiantRenderer;
