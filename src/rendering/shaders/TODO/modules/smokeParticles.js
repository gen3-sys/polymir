/**
 * Particle Physics System for Volumetric Smoke
 *
 * Physics-based particle simulation for the smoke "particle" mode.
 * Each particle represents a smoke puff with:
 * - Gravity
 * - Air resistance/settling
 * - Particle-particle repulsion
 * - Wind/turbulence forces
 * - Ground collision and cling behavior
 * - Player interaction
 *
 * Usage:
 *   const system = new SmokeParticleSystem(particleCount);
 *   system.update(deltaTime, physicsParams, playerPosition);
 *   // Sync positions to shader uniforms
 */

import * as THREE from 'three';

/**
 * Single particle with position, velocity, and mass
 */
export class SmokeParticle {
    constructor() {
        this.position = new THREE.Vector3(
            (Math.random() - 0.5) * 1.8,
            Math.random() * 0.5 - 0.8, // Start near ground
            (Math.random() - 0.5) * 1.8
        );
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            0,
            (Math.random() - 0.5) * 0.1
        );
        this.mass = 0.5 + Math.random() * 0.5;
    }

    /**
     * Reset particle to initial state
     */
    reset() {
        this.position.set(
            (Math.random() - 0.5) * 1.8,
            Math.random() * 0.5 - 0.8,
            (Math.random() - 0.5) * 1.8
        );
        this.velocity.set(
            (Math.random() - 0.5) * 0.1,
            0,
            (Math.random() - 0.5) * 0.1
        );
        this.mass = 0.5 + Math.random() * 0.5;
    }
}

/**
 * Particle system manager
 */
export class SmokeParticleSystem {
    constructor(initialCount = 35) {
        this.particles = [];
        this.boxMin = -1.0;
        this.boxMax = 1.0;
        this.initParticles(initialCount);
    }

    /**
     * Initialize particles
     */
    initParticles(count) {
        this.particles = [];
        for (let i = 0; i < count; i++) {
            this.particles.push(new SmokeParticle());
        }
    }

    /**
     * Update particle count if changed
     */
    setParticleCount(count) {
        if (this.particles.length !== count) {
            this.initParticles(count);
        }
    }

    /**
     * Get particle positions as array for shader uniforms
     * @returns {THREE.Vector3[]} Array of positions (padded to 100)
     */
    getPositions() {
        const positions = new Array(100).fill(null).map(() => new THREE.Vector3());
        for (let i = 0; i < Math.min(this.particles.length, 100); i++) {
            positions[i].copy(this.particles[i].position);
        }
        return positions;
    }

    /**
     * Main physics update loop
     * @param {number} deltaTime - Time since last update (seconds)
     * @param {Object} params - Physics parameters
     * @param {THREE.Vector3} playerPosition - Player position for interaction
     */
    update(deltaTime, params, playerPosition) {
        const dt = Math.min(deltaTime, 0.032); // Cap delta time for stability

        // Optimize repulsion - skip for many particles
        const checkRepulsion = this.particles.length < 50;

        this.particles.forEach((particle, i) => {
            // Gravity
            const gravityForce = params.gravity * 2.0;
            particle.velocity.y -= gravityForce * dt;

            // Wind/turbulence force
            const windTime = performance.now() * 0.001 * params.flowSpeed;
            const windX = Math.sin(particle.position.z * 2.0 + windTime) * params.windStrength;
            const windZ = Math.cos(particle.position.x * 2.0 + windTime * 0.8) * params.windStrength;
            particle.velocity.x += windX * dt;
            particle.velocity.z += windZ * dt;

            // Particle-particle repulsion (expensive - only if needed)
            if (checkRepulsion) {
                this.particles.forEach((other, j) => {
                    if (i !== j) {
                        const diff = new THREE.Vector3().subVectors(particle.position, other.position);
                        const dist = diff.length();
                        if (dist < 0.3 && dist > 0.001) {
                            const repulsionForce = params.repulsion * 0.5 / (dist * dist);
                            diff.normalize().multiplyScalar(repulsionForce * dt);
                            particle.velocity.add(diff);
                        }
                    }
                });
            }

            // Player interaction (repulsion)
            if (playerPosition) {
                const toPlayer = new THREE.Vector3().subVectors(particle.position, playerPosition);
                const playerDist = toPlayer.length();
                if (playerDist < 0.6) {
                    const pushForce = params.responsiveness * 2.0 / (playerDist * playerDist + 0.1);
                    toPlayer.normalize().multiplyScalar(pushForce * dt);
                    particle.velocity.add(toPlayer);
                }
            }

            // Ground cling - extra drag near ground
            const groundHeight = particle.position.y + 1.0; // 0 at bottom
            if (groundHeight < 0.3) {
                const clingFactor = 1.0 - (groundHeight / 0.3);
                particle.velocity.x *= Math.pow(0.95, clingFactor * params.groundCling * 50.0 * dt);
                particle.velocity.z *= Math.pow(0.95, clingFactor * params.groundCling * 50.0 * dt);
            }

            // Air resistance/settling
            const damping = 1.0 - params.settling * 0.5;
            particle.velocity.multiplyScalar(Math.pow(damping, dt * 60.0));

            // Update position
            particle.position.add(new THREE.Vector3().copy(particle.velocity).multiplyScalar(dt));

            // Bounce off box walls with energy loss
            if (particle.position.x < this.boxMin) {
                particle.position.x = this.boxMin;
                particle.velocity.x *= -0.3;
            }
            if (particle.position.x > this.boxMax) {
                particle.position.x = this.boxMax;
                particle.velocity.x *= -0.3;
            }
            if (particle.position.z < this.boxMin) {
                particle.position.z = this.boxMin;
                particle.velocity.z *= -0.3;
            }
            if (particle.position.z > this.boxMax) {
                particle.position.z = this.boxMax;
                particle.velocity.z *= -0.3;
            }

            // Ground bounce with high energy loss
            if (particle.position.y < this.boxMin) {
                particle.position.y = this.boxMin;
                particle.velocity.y *= -0.1; // Very inelastic collision
                // Extra settling on ground impact
                particle.velocity.x *= 0.7;
                particle.velocity.z *= 0.7;
            }
            if (particle.position.y > this.boxMax) {
                particle.position.y = this.boxMax;
                particle.velocity.y *= -0.3;
            }
        });
    }

    /**
     * Reset all particles
     */
    reset() {
        this.particles.forEach(particle => particle.reset());
    }

    /**
     * Get particle count
     */
    get count() {
        return this.particles.length;
    }
}

// Default particle physics parameters
export const particleDefaults = {
    gravity: 0.5,         // Downward force strength (0-2)
    settling: 0.5,        // Drag/dampening (0-1)
    repulsion: 0.5,       // Particle-particle repulsion (0-2)
    windStrength: 0.5,    // Turbulent wind force (0-2)
    particleSize: 0.5,    // Influence radius (0-2)
    groundCling: 0.8,     // How much particles stick to ground (0-1)
    responsiveness: 0.5,  // Player interaction strength (0-2)
    flowSpeed: 0.5        // Animation speed (0-2)
};
