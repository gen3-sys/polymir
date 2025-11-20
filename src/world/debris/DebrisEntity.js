import * as THREE from '../../lib/three.module.js';

export class DebrisEntity {
    constructor(config) {
        this.id = config.id || `debris_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.position = config.position.clone();
        this.velocity = config.velocity ? config.velocity.clone() : new THREE.Vector3();
        this.angularVelocity = config.angularVelocity ? config.angularVelocity.clone() : new THREE.Vector3();

        this.schematic = config.schematic;
        this.mass = config.mass || (this.schematic.voxels.length * 100);
        this.type = config.type || 'asteroid';

        this.state = 'flying';
        this.orbitTime = 0;
        this.captureCheckRadius = null;

        this.mesh = null;
        this.isPooled = false;

        this.createdAt = Date.now();
        this.lastUpdate = Date.now();
    }

    get voxelCount() {
        return this.schematic ? this.schematic.voxels.length : 0;
    }

    get radius() {
        if (!this.schematic || !this.schematic.bounds) return 1;
        const bounds = this.schematic.bounds;
        return Math.max(bounds.width, bounds.height, bounds.depth) / 2;
    }

    updatePhysics(deltaTime, gravityAcceleration) {
        if (this.state !== 'flying') return;

        this.velocity.add(gravityAcceleration.clone().multiplyScalar(deltaTime));

        this.velocity.multiplyScalar(0.9999);

        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        if (this.angularVelocity && this.mesh) {
            const angularSpeed = this.angularVelocity.length();
            if (angularSpeed > 0.0001) {
                const axis = this.angularVelocity.clone().normalize();
                const angle = angularSpeed * deltaTime;
                this.mesh.rotateOnAxis(axis, angle);
            }
        }

        if (this.mesh) {
            this.mesh.position.copy(this.position);
        }

        this.lastUpdate = Date.now();
    }

    setMesh(mesh) {
        this.mesh = mesh;
        this.mesh.userData.debrisId = this.id;
        this.mesh.position.copy(this.position);
    }

    transitionState(newState) {
        this.state = newState;

        if (newState === 'orbiting') {
            this.orbitTime = 0;
        } else if (newState === 'impacting' || newState === 'captured') {
            this.velocity.set(0, 0, 0);
            this.angularVelocity.set(0, 0, 0);
        }
    }

    incrementOrbitTime(deltaTime) {
        if (this.state === 'orbiting') {
            this.orbitTime += deltaTime;
        }
    }

    reset() {
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.state = 'flying';
        this.orbitTime = 0;
        this.isPooled = true;
    }

    dispose() {
        if (this.mesh) {
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(m => m.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
            this.mesh = null;
        }
    }

    serialize() {
        return {
            id: this.id,
            position: {x: this.position.x, y: this.position.y, z: this.position.z},
            velocity: {x: this.velocity.x, y: this.velocity.y, z: this.velocity.z},
            angularVelocity: {x: this.angularVelocity.x, y: this.angularVelocity.y, z: this.angularVelocity.z},
            schematic: this.schematic,
            mass: this.mass,
            type: this.type,
            state: this.state,
            orbitTime: this.orbitTime
        };
    }

    static deserialize(data) {
        return new DebrisEntity({
            id: data.id,
            position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
            velocity: new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z),
            angularVelocity: new THREE.Vector3(data.angularVelocity.x, data.angularVelocity.y, data.angularVelocity.z),
            schematic: data.schematic,
            mass: data.mass,
            type: data.type
        });
    }
}
