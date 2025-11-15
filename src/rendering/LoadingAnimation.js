import * as THREE from '../lib/three.module.js';

export class LoadingAnimation {
    constructor(renderer, onComplete, planetConfig) {
        this.renderer = renderer;
        this.onComplete = onComplete;

        this.planetRotationSpeed = planetConfig.rotationSpeed || 0.05;
        this.planetRotationTilt = planetConfig.rotationTilt || 0.0;
        this.planetOrbitRadius = 400;
        this.systemRotationSpeed = 0.1;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000510);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(0, 300, 800);
        this.camera.lookAt(0, 0, 0);

        this.isActive = true;
        this.animationTime = 0;
        this.loadingProgress = 0;

        this.cameraAngle = { theta: 0, phi: Math.PI / 4 };
        this.cameraDistance = 800;
        this.mouseDown = false;

        
        this.systemRotation = new THREE.Group();
        this.scene.add(this.systemRotation);

        this.createStarfield();
        this.createSun(); 
        this.createDistanceModelPlanet();
        this.createOrbitalPath();
        this.setupControls();
        this.setupHTMLUI();
        this.createPlanetTooltip();

        this.planet.visible = false;
        this.orbitPath.visible = false;
        this.planetsLoaded = false;
    }

    createPlanetTooltip() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        this.tooltipCanvas = canvas;
        this.tooltipContext = ctx;

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        this.tooltipSprite = new THREE.Sprite(spriteMaterial);
        this.tooltipSprite.renderOrder = 1000;
        this.tooltipSprite.visible = false;
        this.scene.add(this.tooltipSprite);
    }

    setupHTMLUI() {
        this.loadingModal = document.getElementById('loading-modal');
        this.loadingStatus = document.getElementById('loading-status');
        this.loadingBarFill = document.getElementById('loading-bar-fill');
        this.loadingPercent = document.getElementById('loading-percent');

        if (this.loadingModal) {
            this.loadingModal.classList.remove('hidden');
        }
    }

    setupControls() {
        this.onMouseDown = () => this.mouseDown = true;
        this.onMouseUp = () => this.mouseDown = false;
        this.onMouseMove = (e) => {
            if (this.mouseDown) {
                this.cameraAngle.theta += e.movementX * 0.01;
                this.cameraAngle.phi += e.movementY * 0.01;
                this.cameraAngle.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraAngle.phi));
            }
        };
        this.onWheel = (e) => {
            this.cameraDistance += e.deltaY * 0.5;
            this.cameraDistance = Math.max(300, Math.min(1500, this.cameraDistance));
        };

        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('wheel', this.onWheel);
    }

    removeControls() {
        document.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('wheel', this.onWheel);
    }

    createStarfield() {
        const starCount = 3000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 2000 + Math.random() * 3000;

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            const brightness = 0.6 + Math.random() * 0.4;
            colors[i * 3] = brightness;
            colors[i * 3 + 1] = brightness;
            colors[i * 3 + 2] = brightness;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 3,
            vertexColors: true,
            transparent: true,
            opacity: 0.9
        });

        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    createDistanceModelPlanet() {
        const planetRadius = 50;

        const geometry = new THREE.IcosahedronGeometry(planetRadius, 5);

        const vertexShader = `
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec3 vWorldPosition;

            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec3 vWorldPosition;
            uniform vec3 sunWorldPosition;
            uniform float time;

            float hash(vec3 p) {
                p = fract(p * vec3(443.897, 441.423, 437.195));
                p += dot(p, p.yxz + 19.19);
                return fract((p.x + p.y) * p.z);
            }

            float noise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);

                return mix(
                    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
                );
            }

            void main() {
                vec3 spherePos = normalize(vPosition);

                float height = 0.0;
                height += (noise(spherePos * 2.0) - 0.5) * 15.0;
                height += (noise(spherePos * 5.0) - 0.5) * 8.0;
                height += (noise(spherePos * 12.0) - 0.5) * 4.0;
                height += (noise(spherePos * 25.0) - 0.5) * 2.0;
                height *= 0.5;

                vec3 baseColor;
                if (height < -5.0) baseColor = vec3(0.13, 0.43, 0.69);
                else if (height < 0.0) baseColor = vec3(0.30, 0.59, 0.78);
                else if (height < 2.0) baseColor = vec3(0.76, 0.70, 0.50);
                else if (height < 10.0) baseColor = vec3(0.30, 0.60, 0.30);
                else if (height < 18.0) baseColor = vec3(0.24, 0.51, 0.24);
                else if (height < 25.0) baseColor = vec3(0.47, 0.39, 0.35);
                else baseColor = vec3(0.94, 0.94, 0.98);

                
                vec3 lightDir = normalize(sunWorldPosition - vWorldPosition);
                float diff = max(dot(vNormal, lightDir), 0.0);

                
                vec3 ambient = vec3(0.15, 0.15, 0.2) * 0.2;
                
                vec3 diffuse = vec3(1.0, 0.95, 0.8) * diff * 1.0;

                vec3 finalColor = baseColor * (ambient + diffuse);

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                sunWorldPosition: { value: new THREE.Vector3(0, 0, 0) },
                time: { value: 0 }
            }
        });

        this.planet = new THREE.Mesh(geometry, material);
        this.planet.position.set(this.planetOrbitRadius, 0, 0);
        this.planet.rotation.x = this.planetRotationTilt;
        this.planet.rotation.z = this.planetRotationTilt * 0.5;
        this.systemRotation.add(this.planet);

        this.planetMaterial = material;
    }

    createOrbitalPath() {
        const points = [];
        const segments = 128;
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(theta) * this.planetOrbitRadius,
                0,
                Math.sin(theta) * this.planetOrbitRadius
            ));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.3
        });

        this.orbitPath = new THREE.Line(geometry, material);
        this.systemRotation.add(this.orbitPath);
    }

    createSun() {
        const geometry = new THREE.SphereGeometry(60, 64, 64);

        
        const vertexShader = `
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            varying vec3 vNormal;
            varying vec3 vPosition;
            uniform float time;

            
            float hash(vec3 p) {
                p = fract(p * vec3(443.897, 441.423, 437.195));
                p += dot(p, p.yxz + 19.19);
                return fract((p.x + p.y) * p.z);
            }

            float noise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);

                return mix(
                    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
                );
            }

            void main() {
                vec3 spherePos = normalize(vPosition);

                
                float plasma = 0.0;
                plasma += noise(spherePos * 3.0 + time * 0.1) * 0.5;
                plasma += noise(spherePos * 6.0 + time * 0.15) * 0.3;
                plasma += noise(spherePos * 12.0 - time * 0.2) * 0.2;

                
                float flare = noise(spherePos * 2.0 + vec3(time * 0.3, 0.0, 0.0));
                flare = pow(flare, 3.0) * 0.3;

                
                float fresnel = 1.0 - abs(dot(vNormal, vec3(0, 0, 1)));
                fresnel = pow(fresnel, 2.0);

                
                vec3 coreColor = vec3(1.0, 0.95, 0.7);    
                vec3 edgeColor = vec3(1.0, 0.6, 0.2);     
                vec3 flareColor = vec3(1.0, 0.3, 0.1);    

                vec3 baseColor = mix(coreColor, edgeColor, fresnel);
                baseColor = mix(baseColor, flareColor, flare);

                
                float pulse = 0.85 + sin(time * 0.5) * 0.15;
                vec3 finalColor = baseColor * (0.9 + plasma * 0.4) * pulse;

                
                float edgeGlow = pow(fresnel, 1.5) * 0.3;
                finalColor += vec3(edgeGlow);

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                time: { value: 0 }
            }
        });

        this.sun = new THREE.Mesh(geometry, material);
        this.sun.position.set(0, 0, 0);
        this.scene.add(this.sun); 

        this.sunMaterial = material;

        
        const sunLight = new THREE.PointLight(0xffdd99, 2.0, 5000);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight); 

        
        const glowGeometry = new THREE.SphereGeometry(65, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa44,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        this.sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.sun.add(this.sunGlow);
    }

    updateLoadingUI(progress, chunksLoaded, totalChunks, statusText) {
        if (!this.loadingModal) return;

        this.loadingStatus.textContent = statusText || 'Initializing...';
        this.loadingBarFill.style.width = `${progress * 100}%`;
        this.loadingPercent.textContent = `${Math.floor(progress * 100)}% (${chunksLoaded} / ${totalChunks})`;
    }

    showPlanets() {
        if (!this.planetsLoaded) {
            this.planet.visible = true;
            this.orbitPath.visible = true;
            this.tooltipSprite.visible = true;
            this.planetsLoaded = true;
            this.updateTooltip();
        }
    }

    updateTooltip() {
        const ctx = this.tooltipContext;
        const canvas = this.tooltipCanvas;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const modalWidth = 900;
        const modalHeight = 450;
        const modalX = (canvas.width - modalWidth) / 2;
        const modalY = (canvas.height - modalHeight) / 2;

        ctx.fillStyle = 'rgba(15, 20, 35, 0.92)';
        ctx.fillRect(modalX, modalY, modalWidth, modalHeight);

        ctx.strokeStyle = 'rgba(100, 150, 255, 0.7)';
        ctx.lineWidth = 3;
        ctx.strokeRect(modalX, modalY, modalWidth, modalHeight);

        ctx.fillStyle = 'rgba(180, 200, 255, 1.0)';
        ctx.font = 'bold 60px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Terra', modalX + 30, modalY + 80);

        ctx.fillStyle = 'rgba(200, 220, 255, 0.9)';
        ctx.font = '40px monospace';

        const lineHeight = 60;
        let yPos = modalY + 160;

        ctx.fillText(`Time: ${(this.animationTime * 10 % 24).toFixed(1)}h / ${(Math.PI * 2 / this.planetRotationSpeed).toFixed(1)}s day`, modalX + 30, yPos);
        yPos += lineHeight;

        ctx.fillText(`Tilt: ${(this.planetRotationTilt * 180 / Math.PI).toFixed(1)}°`, modalX + 30, yPos);
        yPos += lineHeight;

        ctx.fillText(`Year: ${((this.animationTime * this.systemRotationSpeed / (Math.PI * 2)) % 1 * 100).toFixed(1)}%`, modalX + 30, yPos);
        yPos += lineHeight;

        ctx.fillText(`Owner: Unclaimed`, modalX + 30, yPos);

        this.tooltipSprite.material.map.needsUpdate = true;
    }

    update(deltaTime, chunksLoaded, totalChunks, statusText) {
        if (!this.isActive) return;

        this.animationTime += deltaTime;

        this.systemRotation.rotation.y += deltaTime * this.systemRotationSpeed;

        this.planet.rotation.y += deltaTime * this.planetRotationSpeed;

        
        if (this.sunMaterial && this.sunMaterial.uniforms) {
            this.sunMaterial.uniforms.time.value = this.animationTime;
        }

        
        if (this.planetMaterial && this.planetMaterial.uniforms) {
            this.planetMaterial.uniforms.time.value = this.animationTime;

            const sunWorldPos = new THREE.Vector3();
            this.sun.getWorldPosition(sunWorldPos);

            
            this.planetMaterial.uniforms.sunWorldPosition.value.copy(sunWorldPos);
        }

        this.camera.position.set(
            this.cameraDistance * Math.sin(this.cameraAngle.phi) * Math.sin(this.cameraAngle.theta),
            this.cameraDistance * Math.cos(this.cameraAngle.phi),
            this.cameraDistance * Math.sin(this.cameraAngle.phi) * Math.cos(this.cameraAngle.theta)
        );
        this.camera.lookAt(0, 0, 0);

        if (this.tooltipSprite.visible) {
            const planetWorldPos = new THREE.Vector3();
            this.planet.getWorldPosition(planetWorldPos);

            this.tooltipSprite.position.set(
                planetWorldPos.x,
                planetWorldPos.y + 100,
                planetWorldPos.z
            );

            const distance = this.camera.position.distanceTo(this.tooltipSprite.position);
            const scale = distance * 0.3;
            this.tooltipSprite.scale.set(scale, scale * 0.5, 1);

            this.updateTooltip();
        }

        const progress = totalChunks > 0 ? chunksLoaded / totalChunks : 0;
        this.updateLoadingUI(progress, chunksLoaded, totalChunks, statusText);

        if (chunksLoaded >= totalChunks && totalChunks > 0) {
            this.complete();
        }
    }

    render() {
        if (!this.isActive) return;
        this.renderer.render(this.scene, this.camera);
    }

    complete() {
        if (!this.isActive) return;
        this.isActive = false;

        this.removeControls();

        this.scene.traverse((obj) => {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(mat => {
                        if (mat.map) mat.map.dispose();
                        mat.dispose();
                    });
                } else {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            }
        });

        this.scene.clear();

        if (this.tooltipCanvas) {
            this.tooltipCanvas = null;
            this.tooltipContext = null;
        }

        if (this.loadingModal) {
            this.loadingModal.classList.add('hidden');
        }

        if (this.onComplete) {
            this.onComplete();
        }
    }

    handleResize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
}
