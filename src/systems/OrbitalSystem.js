import * as THREE from '../lib/three.module.js';
import { CelestialBody } from '../world/entities/CelestialBody.js';

export class OrbitalSystem {
    constructor(scene) {
        this.scene = scene;
        this.bodies = [];
        this.star = null;
        this.lights = new Map();
    }

    setStar(celestialBody) {
        this.star = celestialBody;
        this.bodies.push(celestialBody);
    }

    addPlanet(celestialBody, parent) {
        if (parent) {
            parent.addChild(celestialBody);
        } else if (this.star) {
            this.star.addChild(celestialBody);
        }
        this.bodies.push(celestialBody);
    }

    update(deltaTime) {
        if (this.star) {
            this.star.update(deltaTime);
        }

        this.updateLights();
    }

    updateLights() {
        for (const body of this.bodies) {
            if (body.isEmissive()) {
                let light = this.lights.get(body);

                if (!light) {
                    light = new THREE.PointLight(
                        body.getLightColor(),
                        body.getLightIntensity(),
                        100000
                    );
                    this.scene.add(light);
                    this.lights.set(body, light);
                }

                const pos = body.getWorldPosition();
                light.position.set(pos.x, pos.y, pos.z);
                light.color.setHex(body.getLightColor());
                light.intensity = body.getLightIntensity();
            }
        }
    }

    getStarPosition() {
        if (this.star) {
            return this.star.getWorldPosition();
        }
        return { x: 0, y: 0, z: 0 };
    }

    getStarLightDirection(fromPosition) {
        const starPos = this.getStarPosition();
        const dx = starPos.x - fromPosition.x;
        const dy = starPos.y - fromPosition.y;
        const dz = starPos.z - fromPosition.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist === 0) return { x: 0, y: 1, z: 0 };

        return {
            x: dx / dist,
            y: dy / dist,
            z: dz / dist
        };
    }

    getBodies() {
        return this.bodies;
    }

    getPlanets() {
        return this.bodies.filter(body => body.type === 'planet');
    }
}
