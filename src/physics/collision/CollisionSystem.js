import { PlanetTypeDetector } from './PlanetTypeDetector.js';
import { PlanetFracturer } from '../generation/fracture/PlanetFracturer.js';
import { FracturePattern } from '../generation/fracture/FracturePattern.js';

export class CollisionSystem {
    constructor() {
        this.pendingCollisions = [];
        this.collisionThreshold = 10;
    }

    detectCollision(body1, body2) {
        const dist = Math.sqrt(
            (body1.position.x - body2.position.x) ** 2 +
            (body1.position.y - body2.position.y) ** 2 +
            (body1.position.z - body2.position.z) ** 2
        );

        const collisionDist = (body1.radius || 100) + (body2.radius || 100);

        if (dist < collisionDist) {
            const impactVector = {
                x: body2.position.x - body1.position.x,
                y: body2.position.y - body1.position.y,
                z: body2.position.z - body1.position.z
            };

            return {
                colliding: true,
                distance: dist,
                impactVector: impactVector,
                body1: body1,
                body2: body2
            };
        }

        return { colliding: false };
    }

    handleCollision(body1Mvox, body2Mvox, impactVector, force) {
        const canShatter1 = PlanetTypeDetector.canShatter(body1Mvox);
        const canShatter2 = PlanetTypeDetector.canShatter(body2Mvox);

        if (!canShatter1 && !canShatter2) {
            return null;
        }

        const fragments = [];

        if (canShatter1 && force > (body1Mvox.metadata.breakForce || 1.0)) {
            fragments.push(...this.fracturePlanet(body1Mvox, impactVector));
        }

        if (canShatter2 && force > (body2Mvox.metadata.breakForce || 1.0)) {
            const reverseImpact = {
                x: -impactVector.x,
                y: -impactVector.y,
                z: -impactVector.z
            };
            fragments.push(...this.fracturePlanet(body2Mvox, reverseImpact));
        }

        return fragments.length > 0 ? fragments : null;
    }

    fracturePlanet(planetMvox, impactVector) {
        let pattern = planetMvox.metadata.fracturePattern;

        if (!pattern) {
            pattern = new FracturePattern(
                Math.random() * 1000000,
                5,
                planetMvox.metadata.gravitationalRadius || 100
            );
        } else {
            pattern = FracturePattern.deserialize(pattern);
        }

        const fracturer = new PlanetFracturer(planetMvox, pattern);
        return fracturer.fracture(impactVector);
    }

    preloadBoundaryChunks(planetMvox, pattern) {
        if (!pattern.boundaryChunksCache) {
            pattern.precomputeBoundaryChunks(16, planetMvox.metadata.gravitationalRadius);
        }
        return pattern.boundaryChunksCache;
    }

    update(deltaTime, bodies) {
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const result = this.detectCollision(bodies[i], bodies[j]);
                
                if (result.colliding) {
                    this.pendingCollisions.push(result);
                }
            }
        }
    }
}

export default CollisionSystem;
