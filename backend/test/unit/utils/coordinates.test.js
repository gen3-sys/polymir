/**
 * COORDINATE SYSTEM UNIT TESTS
 * =============================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    worldToMegachunk,
    worldToLocal,
    localToWorld,
    getNeighborMegachunks
} from '../../../src/utils/coordinates.js';

describe('Coordinate System', () => {
    describe('worldToMegachunk', () => {
        it('should convert positive world coordinates to megachunk', () => {
            const result = worldToMegachunk({ x: 300, y: 150, z: 600 });
            assert.deepStrictEqual(result, { x: 1, y: 0, z: 2 });
        });

        it('should convert negative world coordinates to megachunk', () => {
            const result = worldToMegachunk({ x: -300, y: -150, z: -600 });
            assert.deepStrictEqual(result, { x: -2, y: -1, z: -3 });
        });

        it('should handle origin correctly', () => {
            const result = worldToMegachunk({ x: 0, y: 0, z: 0 });
            assert.deepStrictEqual(result, { x: 0, y: 0, z: 0 });
        });

        it('should handle megachunk boundaries', () => {
            const result1 = worldToMegachunk({ x: 255.999, y: 255.999, z: 255.999 });
            assert.deepStrictEqual(result1, { x: 0, y: 0, z: 0 });

            const result2 = worldToMegachunk({ x: 256, y: 256, z: 256 });
            assert.deepStrictEqual(result2, { x: 1, y: 1, z: 1 });
        });
    });

    describe('worldToLocal', () => {
        it('should convert world coordinates to local (0-255.999)', () => {
            const result = worldToLocal({ x: 300, y: 150, z: 600 });
            assert.strictEqual(result.x, 44); // 300 % 256
            assert.strictEqual(result.y, 150);
            assert.strictEqual(result.z, 88); // 600 % 256
        });

        it('should handle negative world coordinates', () => {
            const result = worldToLocal({ x: -10, y: -5, z: -300 });
            assert.strictEqual(result.x, 246); // -10 % 256 + 256
            assert.strictEqual(result.y, 251); // -5 % 256 + 256
            assert.strictEqual(result.z, 212); // -300 % 256 + 256
        });

        it('should keep local coordinates in range [0, 256)', () => {
            const result = worldToLocal({ x: 512, y: 1000, z: -512 });
            assert.ok(result.x >= 0 && result.x < 256);
            assert.ok(result.y >= 0 && result.y < 256);
            assert.ok(result.z >= 0 && result.z < 256);
        });
    });

    describe('localToWorld', () => {
        it('should convert local coordinates back to world coordinates', () => {
            const megachunk = { x: 2, y: 1, z: 3 };
            const local = { x: 50, y: 100, z: 150 };
            const result = localToWorld(megachunk, local);

            assert.deepStrictEqual(result, {
                x: 562, // 2 * 256 + 50
                y: 356, // 1 * 256 + 100
                z: 918  // 3 * 256 + 150
            });
        });

        it('should round-trip correctly', () => {
            const original = { x: 300, y: 150, z: 600 };
            const megachunk = worldToMegachunk(original);
            const local = worldToLocal(original);
            const result = localToWorld(megachunk, local);

            assert.strictEqual(result.x, original.x);
            assert.strictEqual(result.y, original.y);
            assert.strictEqual(result.z, original.z);
        });

        it('should handle negative megachunk coordinates', () => {
            const megachunk = { x: -1, y: -2, z: -3 };
            const local = { x: 100, y: 200, z: 50 };
            const result = localToWorld(megachunk, local);

            assert.deepStrictEqual(result, {
                x: -156, // -1 * 256 + 100
                y: -312, // -2 * 256 + 200
                z: -718  // -3 * 256 + 50
            });
        });
    });

    describe('getNeighborMegachunks', () => {
        it('should return 26 neighbors for a megachunk', () => {
            const neighbors = getNeighborMegachunks({ x: 0, y: 0, z: 0 });
            assert.strictEqual(neighbors.length, 26);
        });

        it('should include all adjacent megachunks', () => {
            const neighbors = getNeighborMegachunks({ x: 5, y: 10, z: 15 });

            // Check that direct neighbors are included
            assert.ok(neighbors.some(n => n.x === 6 && n.y === 10 && n.z === 15));  // +x
            assert.ok(neighbors.some(n => n.x === 4 && n.y === 10 && n.z === 15));  // -x
            assert.ok(neighbors.some(n => n.x === 5 && n.y === 11 && n.z === 15));  // +y
            assert.ok(neighbors.some(n => n.x === 5 && n.y === 9 && n.z === 15));   // -y
            assert.ok(neighbors.some(n => n.x === 5 && n.y === 10 && n.z === 16));  // +z
            assert.ok(neighbors.some(n => n.x === 5 && n.y === 10 && n.z === 14));  // -z
        });

        it('should not include the center megachunk itself', () => {
            const center = { x: 5, y: 10, z: 15 };
            const neighbors = getNeighborMegachunks(center);

            assert.ok(!neighbors.some(n =>
                n.x === center.x && n.y === center.y && n.z === center.z
            ));
        });

        it('should include diagonal neighbors', () => {
            const neighbors = getNeighborMegachunks({ x: 0, y: 0, z: 0 });

            // Check diagonal (corner) neighbor
            assert.ok(neighbors.some(n => n.x === 1 && n.y === 1 && n.z === 1));
            assert.ok(neighbors.some(n => n.x === -1 && n.y === -1 && n.z === -1));
        });
    });
});
