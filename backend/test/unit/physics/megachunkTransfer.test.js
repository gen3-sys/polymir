/**
 * MEGACHUNK TRANSFER UNIT TESTS
 * ==============================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    detectBoundaryCrossing,
    wrapLocalPosition,
    predictBoundaryCrossing
} from '../../../src/physics/megachunkTransfer.js';

describe('Megachunk Transfer System', () => {
    describe('detectBoundaryCrossing', () => {
        it('should detect crossing at positive X boundary', () => {
            const oldPos = { x: 255.5, y: 100, z: 100 };
            const newPos = { x: 256.5, y: 100, z: 100 };

            const crossing = detectBoundaryCrossing(oldPos, newPos);
            assert.strictEqual(crossing.crossed, true);
            assert.deepStrictEqual(crossing.newMegachunk, { x: 1, y: 0, z: 0 });
        });

        it('should detect crossing at negative X boundary', () => {
            const oldPos = { x: 0.5, y: 100, z: 100 };
            const newPos = { x: -0.5, y: 100, z: 100 };

            const crossing = detectBoundaryCrossing(oldPos, newPos);
            assert.strictEqual(crossing.crossed, true);
            assert.deepStrictEqual(crossing.newMegachunk, { x: -1, y: 0, z: 0 });
        });

        it('should detect crossing at Y boundary', () => {
            const oldPos = { x: 100, y: 255.5, z: 100 };
            const newPos = { x: 100, y: 256.5, z: 100 };

            const crossing = detectBoundaryCrossing(oldPos, newPos);
            assert.strictEqual(crossing.crossed, true);
            assert.deepStrictEqual(crossing.newMegachunk, { x: 0, y: 1, z: 0 });
        });

        it('should detect crossing at Z boundary', () => {
            const oldPos = { x: 100, y: 100, z: 255.5 };
            const newPos = { x: 100, y: 100, z: 256.5 };

            const crossing = detectBoundaryCrossing(oldPos, newPos);
            assert.strictEqual(crossing.crossed, true);
            assert.deepStrictEqual(crossing.newMegachunk, { x: 0, y: 0, z: 1 });
        });

        it('should not detect crossing when within megachunk', () => {
            const oldPos = { x: 100, y: 100, z: 100 };
            const newPos = { x: 150, y: 150, z: 150 };

            const crossing = detectBoundaryCrossing(oldPos, newPos);
            assert.strictEqual(crossing.crossed, false);
        });

        it('should detect multi-axis crossing', () => {
            const oldPos = { x: 255.5, y: 255.5, z: 100 };
            const newPos = { x: 256.5, y: 256.5, z: 100 };

            const crossing = detectBoundaryCrossing(oldPos, newPos);
            assert.strictEqual(crossing.crossed, true);
            assert.deepStrictEqual(crossing.newMegachunk, { x: 1, y: 1, z: 0 });
        });

        it('should detect multiple megachunk jumps', () => {
            const oldPos = { x: 100, y: 100, z: 100 };
            const newPos = { x: 600, y: 100, z: 100 };

            const crossing = detectBoundaryCrossing(oldPos, newPos);
            assert.strictEqual(crossing.crossed, true);
            assert.deepStrictEqual(crossing.newMegachunk, { x: 2, y: 0, z: 0 });
        });
    });

    describe('wrapLocalPosition', () => {
        it('should wrap position at positive boundary', () => {
            const wrapped = wrapLocalPosition(256.5);
            assert.ok(wrapped >= 0 && wrapped < 256);
            assert.strictEqual(wrapped, 0.5);
        });

        it('should wrap position at negative boundary', () => {
            const wrapped = wrapLocalPosition(-0.5);
            assert.ok(wrapped >= 0 && wrapped < 256);
            assert.strictEqual(wrapped, 255.5);
        });

        it('should not wrap position within bounds', () => {
            const wrapped = wrapLocalPosition(100.5);
            assert.strictEqual(wrapped, 100.5);
        });

        it('should handle multiple wraps', () => {
            const wrapped = wrapLocalPosition(512.5);
            assert.strictEqual(wrapped, 0.5);
        });

        it('should handle large negative values', () => {
            const wrapped = wrapLocalPosition(-512.5);
            assert.ok(wrapped >= 0 && wrapped < 256);
            assert.strictEqual(wrapped, 255.5);
        });

        it('should handle exact boundaries', () => {
            const wrapped1 = wrapLocalPosition(256);
            assert.strictEqual(wrapped1, 0);

            const wrapped2 = wrapLocalPosition(0);
            assert.strictEqual(wrapped2, 0);
        });
    });

    describe('predictBoundaryCrossing', () => {
        it('should predict crossing within lookahead time', () => {
            const position = { x: 250, y: 100, z: 100 };
            const velocity = { x: 10, y: 0, z: 0 }; // Will cross in 0.6 seconds

            const prediction = predictBoundaryCrossing(position, velocity, 1.0);
            assert.strictEqual(prediction.willCross, true);
            assert.ok(prediction.timeUntilCrossing > 0);
            assert.ok(prediction.timeUntilCrossing < 1.0);
        });

        it('should not predict crossing beyond lookahead time', () => {
            const position = { x: 100, y: 100, z: 100 };
            const velocity = { x: 10, y: 0, z: 0 }; // Will cross in 15.6 seconds

            const prediction = predictBoundaryCrossing(position, velocity, 1.0);
            assert.strictEqual(prediction.willCross, false);
        });

        it('should not predict crossing with zero velocity', () => {
            const position = { x: 250, y: 100, z: 100 };
            const velocity = { x: 0, y: 0, z: 0 };

            const prediction = predictBoundaryCrossing(position, velocity, 1.0);
            assert.strictEqual(prediction.willCross, false);
        });

        it('should predict crossing on any axis', () => {
            const position = { x: 100, y: 250, z: 100 };
            const velocity = { x: 0, y: 10, z: 0 };

            const prediction = predictBoundaryCrossing(position, velocity, 1.0);
            assert.strictEqual(prediction.willCross, true);
            assert.strictEqual(prediction.crossingAxis, 'y');
        });

        it('should find earliest crossing when multiple axes', () => {
            const position = { x: 250, y: 240, z: 100 };
            const velocity = { x: 10, y: 20, z: 0 };

            const prediction = predictBoundaryCrossing(position, velocity, 1.0);
            assert.strictEqual(prediction.willCross, true);
            // Y axis crosses first (250->256 in 0.3s vs 240->256 in 0.8s)
            assert.strictEqual(prediction.crossingAxis, 'x');
        });

        it('should handle negative velocity (backward crossing)', () => {
            const position = { x: 5, y: 100, z: 100 };
            const velocity = { x: -10, y: 0, z: 0 };

            const prediction = predictBoundaryCrossing(position, velocity, 1.0);
            assert.strictEqual(prediction.willCross, true);
        });
    });
});
