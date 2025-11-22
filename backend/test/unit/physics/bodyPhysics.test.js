/**
 * BODY PHYSICS UNIT TESTS
 * ========================
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { BodyPhysicsSystem } from '../../../src/physics/bodyPhysics.js';
import { MockIPFSClient } from '../../setup.js';

describe('Body Physics System', () => {
    let physicsSystem;
    let mockDB;

    beforeEach(() => {
        mockDB = {
            bodies: new Map(),
            async getCelestialBody(bodyId) {
                return this.bodies.get(bodyId) || null;
            },
            async updateCelestialBodyPhysics(bodyId, position, velocity, rotation, angularVelocity) {
                const body = this.bodies.get(bodyId);
                if (body) {
                    body.position_x = position.x;
                    body.position_y = position.y;
                    body.position_z = position.z;
                    body.velocity_x = velocity.x;
                    body.velocity_y = velocity.y;
                    body.velocity_z = velocity.z;
                    body.rotation_x = rotation.x;
                    body.rotation_y = rotation.y;
                    body.rotation_z = rotation.z;
                    body.rotation_w = rotation.w;
                    body.angular_velocity_x = angularVelocity.x;
                    body.angular_velocity_y = angularVelocity.y;
                    body.angular_velocity_z = angularVelocity.z;
                }
            }
        };

        physicsSystem = new BodyPhysicsSystem(mockDB, { tickRate: 10 });
    });

    afterEach(() => {
        if (physicsSystem.running) {
            physicsSystem.stop();
        }
    });

    describe('registerBody', () => {
        it('should register a celestial body', async () => {
            const bodyId = 'test-body-1';
            await physicsSystem.registerBody(bodyId);

            const body = physicsSystem.bodies.get(bodyId);
            assert.ok(body);
            assert.strictEqual(body.bodyId, bodyId);
        });

        it('should initialize position from database', async () => {
            const bodyId = 'test-body-2';
            mockDB.bodies.set(bodyId, {
                body_id: bodyId,
                position_x: 100,
                position_y: 200,
                position_z: 300
            });

            await physicsSystem.registerBody(bodyId);
            const body = physicsSystem.bodies.get(bodyId);

            assert.strictEqual(body.position.x, 100);
            assert.strictEqual(body.position.y, 200);
            assert.strictEqual(body.position.z, 300);
        });

        it('should initialize rotation as identity quaternion', async () => {
            const bodyId = 'test-body-3';
            await physicsSystem.registerBody(bodyId);
            const body = physicsSystem.bodies.get(bodyId);

            assert.strictEqual(body.rotation.x, 0);
            assert.strictEqual(body.rotation.y, 0);
            assert.strictEqual(body.rotation.z, 0);
            assert.strictEqual(body.rotation.w, 1);
        });
    });

    describe('setVelocity', () => {
        it('should set linear velocity', async () => {
            const bodyId = 'test-body-4';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setVelocity(bodyId, { x: 10, y: 20, z: 30 });
            const body = physicsSystem.bodies.get(bodyId);

            assert.strictEqual(body.velocity.x, 10);
            assert.strictEqual(body.velocity.y, 20);
            assert.strictEqual(body.velocity.z, 30);
        });

        it('should clamp velocity to max limits', async () => {
            const bodyId = 'test-body-5';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setVelocity(bodyId, { x: 10000, y: 10000, z: 10000 });
            const body = physicsSystem.bodies.get(bodyId);

            // Should be clamped to maxVelocity (1000)
            assert.ok(Math.abs(body.velocity.x) <= 1000);
            assert.ok(Math.abs(body.velocity.y) <= 1000);
            assert.ok(Math.abs(body.velocity.z) <= 1000);
        });
    });

    describe('setAngularVelocity', () => {
        it('should set angular velocity', async () => {
            const bodyId = 'test-body-6';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setAngularVelocity(bodyId, { x: 0.1, y: 0.2, z: 0.3 });
            const body = physicsSystem.bodies.get(bodyId);

            assert.strictEqual(body.angularVelocity.x, 0.1);
            assert.strictEqual(body.angularVelocity.y, 0.2);
            assert.strictEqual(body.angularVelocity.z, 0.3);
        });

        it('should clamp angular velocity to max limits', async () => {
            const bodyId = 'test-body-7';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setAngularVelocity(bodyId, { x: 100, y: 100, z: 100 });
            const body = physicsSystem.bodies.get(bodyId);

            // Should be clamped to maxAngularVelocity (10)
            assert.ok(Math.abs(body.angularVelocity.x) <= 10);
            assert.ok(Math.abs(body.angularVelocity.y) <= 10);
            assert.ok(Math.abs(body.angularVelocity.z) <= 10);
        });
    });

    describe('tick', () => {
        it('should update position based on velocity', async () => {
            const bodyId = 'test-body-8';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setVelocity(bodyId, { x: 10, y: 0, z: 0 });
            const body = physicsSystem.bodies.get(bodyId);
            const initialX = body.position.x;

            await physicsSystem.tick();

            // Position should have moved (velocity * deltaTime)
            assert.ok(body.position.x > initialX);
        });

        it('should update rotation based on angular velocity', async () => {
            const bodyId = 'test-body-9';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setAngularVelocity(bodyId, { x: 0, y: 1, z: 0 });
            const body = physicsSystem.bodies.get(bodyId);

            await physicsSystem.tick();

            // Rotation quaternion should have changed
            assert.ok(body.rotation.y !== 0 || body.rotation.w !== 1);
        });

        it('should maintain quaternion normalization', async () => {
            const bodyId = 'test-body-10';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setAngularVelocity(bodyId, { x: 1, y: 1, z: 1 });

            for (let i = 0; i < 10; i++) {
                await physicsSystem.tick();
            }

            const body = physicsSystem.bodies.get(bodyId);
            const { x, y, z, w } = body.rotation;
            const magnitude = Math.sqrt(x*x + y*y + z*z + w*w);

            // Quaternion should remain normalized
            assert.ok(Math.abs(magnitude - 1.0) < 0.001);
        });

        it('should persist state to database', async () => {
            const bodyId = 'test-body-11';
            mockDB.bodies.set(bodyId, {
                body_id: bodyId,
                position_x: 0,
                position_y: 0,
                position_z: 0
            });

            await physicsSystem.registerBody(bodyId);
            physicsSystem.setVelocity(bodyId, { x: 10, y: 0, z: 0 });

            await physicsSystem.tick();

            // Check database was updated
            const dbBody = mockDB.bodies.get(bodyId);
            assert.ok(dbBody.position_x > 0);
        });
    });

    describe('start/stop', () => {
        it('should start physics loop', () => {
            physicsSystem.start();
            assert.strictEqual(physicsSystem.running, true);
        });

        it('should stop physics loop', () => {
            physicsSystem.start();
            physicsSystem.stop();
            assert.strictEqual(physicsSystem.running, false);
        });

        it('should not start multiple loops', () => {
            physicsSystem.start();
            const firstInterval = physicsSystem.tickInterval;

            physicsSystem.start();
            const secondInterval = physicsSystem.tickInterval;

            assert.strictEqual(firstInterval, secondInterval);
        });
    });

    describe('getBodyState', () => {
        it('should return current body state', async () => {
            const bodyId = 'test-body-12';
            await physicsSystem.registerBody(bodyId);

            physicsSystem.setVelocity(bodyId, { x: 5, y: 10, z: 15 });
            const state = physicsSystem.getBodyState(bodyId);

            assert.ok(state);
            assert.strictEqual(state.velocity.x, 5);
            assert.strictEqual(state.velocity.y, 10);
            assert.strictEqual(state.velocity.z, 15);
        });

        it('should return null for unregistered body', () => {
            const state = physicsSystem.getBodyState('nonexistent');
            assert.strictEqual(state, null);
        });
    });
});
