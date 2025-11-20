import * as THREE from '../lib/three.module.js';

export class PortalRenderer {
    constructor(scene, portalManager) {
        this.scene = scene;
        this.portalManager = portalManager;
        this.portalMeshes = new Map();
        this.portalMaterial = null;
        this.time = 0;

        this.createPortalMaterial();
    }

    async createPortalMaterial() {
        const vertexShader = await fetch('./src/rendering/shaders/portal.vert.glsl').then(r => r.text());
        const fragmentShader = await fetch('./src/rendering/shaders/portal.frag.glsl').then(r => r.text());

        this.portalMaterial = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                time: { value: 0 },
                portalColor: { value: new THREE.Color(0x8800FF) },
                intensity: { value: 1.5 },
                noiseTexture: { value: null }
            },
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
    }

    createPortalMesh(portal) {
        const width = portal.size[0];
        const height = portal.size[1];

        const geometry = new THREE.PlaneGeometry(width, height, 32, 32);

        // Add wave deformation to vertices
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const wave = Math.sin(x * 2) * Math.cos(y * 2) * 0.1;
            positions.setZ(i, wave);
        }
        positions.needsUpdate = true;

        const mesh = new THREE.Mesh(geometry, this.portalMaterial.clone());

        // Position portal
        mesh.position.set(
            portal.position[0],
            portal.position[1],
            portal.position[2]
        );

        // Orient portal based on normal
        const normal = new THREE.Vector3(
            portal.normal[0],
            portal.normal[1],
            portal.normal[2]
        );
        const up = new THREE.Vector3(0, 1, 0);

        if (Math.abs(normal.y) > 0.99) {
            up.set(1, 0, 0);
        }

        mesh.lookAt(
            mesh.position.x + normal.x,
            mesh.position.y + normal.y,
            mesh.position.z + normal.z
        );

        return mesh;
    }

    createPortalFrameEffect(portal) {
        const width = portal.size[0];
        const height = portal.size[1];

        const points = [];
        const segments = 32;

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * width * 0.5;
            const y = Math.sin(angle) * height * 0.5;
            points.push(new THREE.Vector3(x, y, 0));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0x00FFFF,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        const line = new THREE.Line(geometry, material);
        line.position.copy(new THREE.Vector3(
            portal.position[0],
            portal.position[1],
            portal.position[2]
        ));

        return line;
    }

    updatePortals() {
        // Remove deleted portals
        for (const [id, mesh] of this.portalMeshes) {
            if (!this.portalManager.portals.has(id)) {
                this.scene.remove(mesh.portal);
                this.scene.remove(mesh.frame);
                mesh.portal.geometry.dispose();
                mesh.frame.geometry.dispose();
                this.portalMeshes.delete(id);
            }
        }

        // Add new portals
        for (const [id, portal] of this.portalManager.portals) {
            if (!this.portalMeshes.has(id) && portal.active) {
                const portalMesh = this.createPortalMesh(portal);
                const frameMesh = this.createPortalFrameEffect(portal);

                this.scene.add(portalMesh);
                this.scene.add(frameMesh);

                this.portalMeshes.set(id, {
                    portal: portalMesh,
                    frame: frameMesh,
                    data: portal
                });
            }
        }
    }

    update(deltaTime) {
        this.time += deltaTime;

        // Update shader uniforms
        for (const [id, meshGroup] of this.portalMeshes) {
            if (meshGroup.portal.material.uniforms) {
                meshGroup.portal.material.uniforms.time.value = this.time;

                // Pulse linked portals
                const portal = this.portalManager.getPortal(id);
                if (portal && portal.linkedPortalId) {
                    const pulse = Math.sin(this.time * 3) * 0.3 + 1.2;
                    meshGroup.portal.material.uniforms.intensity.value = pulse;

                    // Sync color with linked portal
                    meshGroup.portal.material.uniforms.portalColor.value.setHex(0xFF00FF);
                } else {
                    meshGroup.portal.material.uniforms.portalColor.value.setHex(0x8800FF);
                }
            }

            // Rotate portal effect
            meshGroup.portal.rotation.z += deltaTime * 0.5;

            // Pulse frame
            const framePulse = Math.sin(this.time * 4) * 0.2 + 0.8;
            meshGroup.frame.material.opacity = framePulse;
        }
    }

    checkPortalProximity(position, threshold = 1.0) {
        for (const [id, meshGroup] of this.portalMeshes) {
            const portalPos = meshGroup.portal.position;
            const distance = position.distanceTo(portalPos);

            if (distance < threshold) {
                const portal = this.portalManager.getPortal(id);
                if (portal && portal.linkedPortalId) {
                    return {
                        portalId: id,
                        linkedPortalId: portal.linkedPortalId,
                        distance
                    };
                }
            }
        }
        return null;
    }

    teleportThroughPortal(position, portalProximity) {
        const sourcePortal = this.portalManager.getPortal(portalProximity.portalId);
        const targetPortal = this.portalManager.getPortal(portalProximity.linkedPortalId);

        if (!sourcePortal || !targetPortal) return null;

        // Calculate relative position
        const sourcePos = new THREE.Vector3(...sourcePortal.position);
        const targetPos = new THREE.Vector3(...targetPortal.position);

        const relativePos = position.clone().sub(sourcePos);
        const newPosition = targetPos.clone().add(relativePos);

        return newPosition;
    }

    dispose() {
        for (const [id, meshGroup] of this.portalMeshes) {
            this.scene.remove(meshGroup.portal);
            this.scene.remove(meshGroup.frame);
            meshGroup.portal.geometry.dispose();
            meshGroup.frame.geometry.dispose();
            if (meshGroup.portal.material.dispose) {
                meshGroup.portal.material.dispose();
            }
        }
        this.portalMeshes.clear();

        if (this.portalMaterial) {
            this.portalMaterial.dispose();
        }
    }
}

export default PortalRenderer;
