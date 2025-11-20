import * as THREE from '../lib/three.module.js';

/**
 * GravitySystem - Handles surface-relative gravity and movement basis
 *
 * Features:
 * - Distance-based gravity influence (0-1 fade from surface to gravity radius)
 * - Surface normal calculation (radial from planet center OR toroidal for ringworlds)
 * - Tangent basis vectors for surface-relative movement
 * - Position projection to maintain distance from surface
 * - Support for POINT (spherical), RING (toroidal), PLANAR, and RIBBON gravity types
 */
export class GravitySystem {
    constructor(config) {
        
        if (config instanceof THREE.Vector3) {
            
            const planetCenter = config;
            const planetRadius = arguments[1];
            this.type = 'POINT';
            this.center = planetCenter.clone();
            this.radius = planetRadius;
        } else {
            
            this.type = config.type || 'POINT';

            if (this.type === 'POINT') {
                this.center = config.center ? new THREE.Vector3(config.center.x, config.center.y, config.center.z) : new THREE.Vector3(0, 0, 0);
                this.radius = config.radius || 100;
            } else if (this.type === 'RING') {
                this.center = config.center ? new THREE.Vector3(config.center.x, config.center.y, config.center.z) : new THREE.Vector3(0, 0, 0);
                this.ringAxis = config.ringAxis ? new THREE.Vector3(config.ringAxis.x, config.ringAxis.y, config.ringAxis.z).normalize() : new THREE.Vector3(0, 1, 0);
                this.ringRadius = config.ringRadius || 1000; 
                this.tubeRadius = config.tubeRadius || 200;  
                this.rotationSpeed = config.rotationSpeed || 0;
                this.currentRotation = 0; 
                this.radius = this.tubeRadius; 
            } else if (this.type === 'PLANAR') {
                this.direction = config.direction ? new THREE.Vector3(config.direction.x, config.direction.y, config.direction.z).normalize() : new THREE.Vector3(0, -1, 0);
                this.strength = config.strength || 9.8;
                this.radius = 0; 
            } else if (this.type === 'RIBBON') {
                this.strength = config.strength || 9.8;
                this.radius = 0; 
            }
        }

        this.gravityRadius = 50; 
        this.playerHeight = 1.8; 

        
        if (this.type === 'POINT') {
            this.planetCenter = this.center;
            this.planetRadius = this.radius;
        }
    }

    /**
     * Update gravity system (for rotating ringworlds)
     * @param {number} deltaTime - Time elapsed in seconds
     */
    update(deltaTime) {
        if (this.type === 'RING' && this.rotationSpeed !== 0) {
            this.currentRotation += this.rotationSpeed * deltaTime;
            
            this.currentRotation = this.currentRotation % (Math.PI * 2);
        }
    }

    /**
     * Calculate gravity influence based on distance from surface
     * @param {THREE.Vector3} position - Player position
     * @returns {number} 0.0 (no gravity) to 1.0 (full gravity)
     */
    getInfluence(position) {
        if (this.type === 'PLANAR' || this.type === 'RIBBON') {
            return 1.0; 
        }

        let distFromSurface;

        if (this.type === 'POINT') {
            const distFromCenter = position.distanceTo(this.center);
            distFromSurface = distFromCenter - this.radius;
        } else if (this.type === 'RING') {
            
            const toroidalDist = this.getToroidalDistance(position);
            distFromSurface = toroidalDist.distanceFromSurface;
        }

        if (distFromSurface <= 0) return 1.0; 
        if (distFromSurface >= this.gravityRadius) return 0.0; 

        
        const t = distFromSurface / this.gravityRadius;
        return 1 - (t * t * t);
    }

    /**
     * Calculate toroidal coordinates and distance for ringworld gravity
     * @param {THREE.Vector3} position - World position
     * @returns {Object} Toroidal distance information
     * @private
     */
    getToroidalDistance(position) {
        
        const localPos = position.clone().sub(this.center);

        
        if (this.currentRotation !== 0) {
            const cosR = Math.cos(-this.currentRotation);
            const sinR = Math.sin(-this.currentRotation);

            
            const x = localPos.x * cosR - localPos.z * sinR;
            const z = localPos.x * sinR + localPos.z * cosR;
            localPos.x = x;
            localPos.z = z;
        }

        
        const axisComponent = localPos.dot(this.ringAxis);
        const radialPos = localPos.clone().sub(this.ringAxis.clone().multiplyScalar(axisComponent));
        const radialDist = radialPos.length();

        
        const ringCenterlinePoint = radialPos.clone().normalize().multiplyScalar(this.ringRadius);

        
        const toSurface = localPos.clone().sub(ringCenterlinePoint);
        const distanceFromSurface = toSurface.length() - this.tubeRadius;

        
        const towardCenterline = ringCenterlinePoint.clone().add(this.ringAxis.clone().multiplyScalar(axisComponent)).sub(localPos);
        towardCenterline.normalize();

        return {
            distanceFromSurface,
            towardCenterline, 
            ringAngle: Math.atan2(radialPos.z, radialPos.x),
            tubeAngle: Math.atan2(toSurface.y, radialDist - this.ringRadius)
        };
    }

    /**
     * Get the "up" direction (away from surface)
     * @param {THREE.Vector3} position - Player position
     * @returns {THREE.Vector3} Normalized up vector
     */
    getUpVector(position) {
        if (this.type === 'POINT') {
            return position.clone().sub(this.center).normalize();
        } else if (this.type === 'RING') {
            
            const toroidalDist = this.getToroidalDistance(position);
            return toroidalDist.towardCenterline.clone().negate();
        } else if (this.type === 'PLANAR') {
            return this.direction.clone().negate();
        } else if (this.type === 'RIBBON') {
            
            return new THREE.Vector3(0, 1, 0);
        }

        
        return new THREE.Vector3(0, 1, 0);
    }

    /**
     * Get distance from surface (positive = above, negative = below)
     * @param {THREE.Vector3} position - Player position
     * @returns {number} Distance in world units
     */
    getDistanceFromSurface(position) {
        if (this.type === 'POINT') {
            const distFromCenter = position.distanceTo(this.center);
            return distFromCenter - this.radius;
        } else if (this.type === 'RING') {
            const toroidalDist = this.getToroidalDistance(position);
            return toroidalDist.distanceFromSurface;
        } else if (this.type === 'PLANAR') {
            return position.dot(this.direction);
        } else if (this.type === 'RIBBON') {
            return 0; 
        }

        return 0;
    }

    /**
     * Project position to surface + playerHeight
     * @param {THREE.Vector3} position - Current position
     * @returns {THREE.Vector3} Position on surface at correct height
     */
    projectToSurface(position) {
        if (this.type === 'POINT') {
            const direction = this.getUpVector(position);
            const targetDistance = this.radius + this.playerHeight;
            return this.center.clone().addScaledVector(direction, targetDistance);
        } else if (this.type === 'RING') {
            const toroidalDist = this.getToroidalDistance(position);
            const upDirection = toroidalDist.towardCenterline.clone().negate();

            
            const localPos = position.clone().sub(this.center);
            const axisComponent = localPos.dot(this.ringAxis);
            const radialPos = localPos.clone().sub(this.ringAxis.clone().multiplyScalar(axisComponent));
            const radialDist = radialPos.length();

            const ringCenterlinePoint = radialPos.clone().normalize().multiplyScalar(this.ringRadius);
            const onSurface = ringCenterlinePoint.clone()
                .add(this.ringAxis.clone().multiplyScalar(axisComponent));

            
            return this.center.clone()
                .add(onSurface)
                .addScaledVector(upDirection, this.tubeRadius + this.playerHeight);
        } else if (this.type === 'PLANAR') {
            return position.clone().sub(this.direction.clone().multiplyScalar(
                position.dot(this.direction) - this.playerHeight
            ));
        } else if (this.type === 'RIBBON') {
            return position.clone(); 
        }

        return position.clone();
    }

    /**
     * Get movement basis vectors for surface-relative controls
     * @param {THREE.Vector3} position - Player position
     * @param {THREE.Vector3} lookDirection - Camera forward direction
     * @returns {{forward: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3}}
     */
    getTangentBasis(position, lookDirection) {
        const influence = this.getInfluence(position);

        
        if (influence < 0.01) {
            const forward = lookDirection.clone().normalize();
            const worldUp = new THREE.Vector3(0, 1, 0);

            
            let right;
            if (Math.abs(forward.dot(worldUp)) > 0.999) {
                right = new THREE.Vector3(1, 0, 0);
            } else {
                right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
            }

            const up = new THREE.Vector3().crossVectors(right, forward).normalize();
            return { forward, right, up };
        }

        
        const gravityUp = this.getUpVector(position);

        
        const lookDotUp = lookDirection.dot(gravityUp);
        const forward = lookDirection.clone()
            .sub(gravityUp.clone().multiplyScalar(lookDotUp))
            .normalize();

        
        if (forward.lengthSq() < 0.001) {
            
            const worldForward = new THREE.Vector3(0, 0, -1);
            const fallbackDot = worldForward.dot(gravityUp);
            forward.copy(worldForward)
                .sub(gravityUp.clone().multiplyScalar(fallbackDot))
                .normalize();

            
            if (forward.lengthSq() < 0.001) {
                forward.set(1, 0, 0);
                const testDot = forward.dot(gravityUp);
                forward.sub(gravityUp.clone().multiplyScalar(testDot)).normalize();
            }
        }

        
        const right = new THREE.Vector3()
            .crossVectors(gravityUp, forward)
            .normalize();

        return { forward, right, up: gravityUp };
    }

    /**
     * Update gravity source position (for orbital systems)
     * @param {THREE.Vector3} newCenter - New center position
     */
    updateCenter(newCenter) {
        if (this.center) {
            this.center.copy(newCenter);
        }

        
        if (this.planetCenter) {
            this.planetCenter.copy(newCenter);
        }
    }

    /**
     * Update planet center (for orbital systems where planet moves)
     * @param {THREE.Vector3} newCenter - New planet center position
     * @deprecated Use updateCenter instead
     */
    updatePlanetCenter(newCenter) {
        this.updateCenter(newCenter);
    }

    /**
     * Manually set rotation angle for ringworld (useful for syncing with visual model)
     * @param {number} rotation - Rotation angle in radians
     */
    setRotation(rotation) {
        if (this.type === 'RING') {
            this.currentRotation = rotation % (Math.PI * 2);
        }
    }

    /**
     * Get current rotation angle (for ringworlds)
     * @returns {number} Current rotation in radians
     */
    getRotation() {
        if (this.type === 'RING') {
            return this.currentRotation;
        }
        return 0;
    }
}
