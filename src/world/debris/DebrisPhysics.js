import * as THREE from '../../lib/three.module.js';

export class DebrisPhysics {
    constructor(config = {}) {
        this.G = config.G || 6.674e-8;

        this.orbitZoneMin = config.orbitZoneMin || 1.5;
        this.orbitZoneMax = config.orbitZoneMax || 2.5;
        this.fallZoneMin = config.fallZoneMin || 1.0;
        this.fallZoneMax = config.fallZoneMax || 1.5;

        this.captureTimeThreshold = config.captureTimeThreshold || 1.5;

        this.shatterVelocityThreshold = config.shatterVelocityThreshold || 20;
        this.craterVelocityThreshold = config.craterVelocityThreshold || 5;
        this.settleVelocityThreshold = config.settleVelocityThreshold || 5;
    }

    calculateGravityAcceleration(position, gravitySources) {
        const acceleration = new THREE.Vector3(0, 0, 0);

        for (const source of gravitySources) {
            const direction = source.position.clone().sub(position);
            const distance = direction.length();

            if (distance > 0.1) {
                direction.normalize();
                const forceMagnitude = (this.G * source.mass) / (distance * distance);
                acceleration.add(direction.multiplyScalar(forceMagnitude));
            }
        }

        return acceleration;
    }

    determineGravityZone(distance, planetRadius) {
        const ratio = distance / planetRadius;

        if (ratio <= this.fallZoneMin) {
            return 'surface';
        } else if (ratio <= this.fallZoneMax) {
            return 'fall';
        } else if (ratio <= this.orbitZoneMax) {
            return 'orbit';
        } else {
            return 'escape';
        }
    }

    checkOrbitalStability(debris, planetPos, planetMass, planetRadius) {
        const relativePos = debris.position.clone().sub(planetPos);
        const relativeVel = debris.velocity.clone();
        const distance = relativePos.length();

        const mu = this.G * planetMass;
        const speed = relativeVel.length();

        const epsilon = (speed * speed / 2) - (mu / distance);

        if (epsilon >= 0) {
            return {stable: false, reason: 'escape_trajectory', energy: epsilon};
        }

        const semiMajorAxis = -mu / (2 * epsilon);

        const h = new THREE.Vector3().crossVectors(relativePos, relativeVel);
        const hMag = h.length();

        const eccentricity = Math.sqrt(1 + (2 * epsilon * hMag * hMag) / (mu * mu));

        const periapsis = semiMajorAxis * (1 - eccentricity);
        const apoapsis = semiMajorAxis * (1 + eccentricity);

        const minSafeDistance = planetRadius + 10;

        if (periapsis < minSafeDistance) {
            return {
                stable: false,
                reason: 'will_impact',
                periapsis: periapsis,
                minSafe: minSafeDistance
            };
        }

        return {
            stable: true,
            semiMajorAxis: semiMajorAxis,
            eccentricity: eccentricity,
            periapsis: periapsis,
            apoapsis: apoapsis,
            energy: epsilon
        };
    }

    determineImpactType(velocity) {
        const speed = velocity.length();

        if (speed > this.shatterVelocityThreshold) {
            return {
                type: 'shatter',
                craterRadius: Math.floor(Math.log2(speed - this.shatterVelocityThreshold + 1) + 3),
                shouldFragment: true,
                fragmentCount: Math.max(3, Math.floor(speed / 10))
            };
        } else if (speed > this.craterVelocityThreshold) {
            return {
                type: 'crater',
                craterRadius: Math.max(1, Math.floor(speed / 10)),
                shouldFragment: false
            };
        } else {
            return {
                type: 'settle',
                craterRadius: 0,
                shouldFragment: false
            };
        }
    }

    calculateFragmentVelocities(originalVelocity, fragmentCount) {
        const fragments = [];
        const baseSpeed = originalVelocity.length() * 0.5;

        for (let i = 0; i < fragmentCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const speed = baseSpeed + (Math.random() - 0.5) * baseSpeed * 0.5;

            const dir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.sin(phi) * Math.sin(theta),
                Math.cos(phi)
            );

            fragments.push(dir.multiplyScalar(speed));
        }

        return fragments;
    }

    calculateMutualGravity(debris1, debris2, mutualGravityStrength = 0.001) {
        const distance = debris1.position.distanceTo(debris2.position);

        if (distance < 0.1) return {force1: new THREE.Vector3(), force2: new THREE.Vector3()};

        const force = (debris1.mass * debris2.mass * mutualGravityStrength) / (distance * distance);

        const dir1to2 = debris2.position.clone().sub(debris1.position).normalize();
        const dir2to1 = dir1to2.clone().multiplyScalar(-1);

        return {
            force1: dir1to2.multiplyScalar(force / debris1.mass),
            force2: dir2to1.multiplyScalar(force / debris2.mass)
        };
    }
}
