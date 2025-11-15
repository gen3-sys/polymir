export class CelestialBody {
    constructor(config) {
        this.type = config.type;
        this.bodyType = config.bodyType || this.inferBodyType(config.type);
        this.name = config.name || (config.type === 'star' ? 'Sol' : 'Planet');
        this.claimOwner = config.claimOwner || null;
        this.radius = config.radius;
        this.position = config.position || { x: 0, y: 0, z: 0 };

        this.orbitRadius = config.orbitRadius || 0;
        this.orbitSpeed = config.orbitSpeed || 0;
        this.orbitTilt = config.orbitTilt || 0;
        this.orbitWobble = config.orbitWobble || 0;
        this.orbitWobbleSpeed = config.orbitWobbleSpeed || 0;
        this.orbitEccentricity = config.orbitEccentricity || 0;
        this.orbitPhase = config.orbitPhase || 0;

        this.orbitCenter = config.orbitCenter || { x: 0, y: 0, z: 0 };
        this.timeScale = config.timeScale || 1.0;

        this.rotationSpeed = config.rotationSpeed || 0;
        this.rotationTilt = config.rotationTilt || 0;
        this.rotationWobble = config.rotationWobble || 0;
        this.rotationWobbleSpeed = config.rotationWobbleSpeed || 0;

        this.rotation = 0;
        this.time = 0;

        this.parent = config.parent || null;
        this.children = [];

        this.generator = config.generator || null;
        this.chunks = new Map();
        this.mesh = null;
        this.impostorMesh = null;
        this.light = null;
    }

    update(deltaTime) {
        this.time += deltaTime;

        if (this.type !== 'star' && this.parent) {
            const orbit = this.calculateOrbit(this.time);
            this.position.x = this.parent.position.x + orbit.x;
            this.position.y = this.parent.position.y + orbit.y;
            this.position.z = this.parent.position.z + orbit.z;
        }

        if (this.rotationSpeed !== 0) {
            const wobble = this.rotationWobble * Math.sin(this.time * this.rotationWobbleSpeed);
            this.rotation += (this.rotationSpeed + wobble) * deltaTime;
        }

        for (const child of this.children) {
            child.update(deltaTime);
        }
    }

    calculateOrbit(time) {
        const angle = this.orbitPhase + time * this.orbitSpeed;

        const wobble = this.orbitWobble * Math.sin(time * this.orbitWobbleSpeed);
        const tiltAngle = this.orbitTilt + wobble;

        const a = this.orbitRadius;
        const b = this.orbitRadius * (1 - this.orbitEccentricity);

        const x = a * Math.cos(angle);
        const y = 0;
        const z = b * Math.sin(angle);

        const cosT = Math.cos(tiltAngle);
        const sinT = Math.sin(tiltAngle);

        return {
            x: x,
            y: y * cosT - z * sinT,
            z: y * sinT + z * cosT
        };
    }

    addChild(celestialBody) {
        celestialBody.parent = this;
        this.children.push(celestialBody);
    }

    getWorldPosition() {
        return {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        };
    }

    isEmissive() {
        return this.type === 'star';
    }

    getLightIntensity() {
        if (this.type === 'star') {
            return 3.0;
        }
        return 0.0;
    }

    getLightColor() {
        if (this.type === 'star') {
            return 0xffffee;
        }
        return 0xffffff;
    }

    inferBodyType(type) {
        const typeMap = {
            'star': 'star',
            'planet': 'planet',
            'moon': 'moon',
            'system': 'system',
            'supercluster': 'supercluster'
        };
        return typeMap[type] || 'planet';
    }

    getHierarchyLevel() {
        const levels = {
            'supercluster': 0,
            'system': 1,
            'star': 2,
            'planet': 3,
            'moon': 4
        };
        return levels[this.bodyType] || 3;
    }
}
