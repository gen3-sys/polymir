/**
 * TRUST SYSTEM UNIT TESTS
 * ========================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getValidatorsRequired, getTrustTier } from '../../../src/utils/trust.js';

describe('Trust System', () => {
    describe('getValidatorsRequired', () => {
        it('should require 0 validators for high trust (>= 0.9)', () => {
            assert.strictEqual(getValidatorsRequired(1.0), 0);
            assert.strictEqual(getValidatorsRequired(0.95), 0);
            assert.strictEqual(getValidatorsRequired(0.9), 0);
        });

        it('should require 3 validators for medium trust (0.5-0.89)', () => {
            assert.strictEqual(getValidatorsRequired(0.89), 3);
            assert.strictEqual(getValidatorsRequired(0.8), 3);
            assert.strictEqual(getValidatorsRequired(0.7), 3);
            assert.strictEqual(getValidatorsRequired(0.5), 3);
        });

        it('should require 5 validators for low trust (< 0.5)', () => {
            assert.strictEqual(getValidatorsRequired(0.49), 5);
            assert.strictEqual(getValidatorsRequired(0.3), 5);
            assert.strictEqual(getValidatorsRequired(0.1), 5);
            assert.strictEqual(getValidatorsRequired(0.0), 5);
        });

        it('should handle edge cases', () => {
            assert.strictEqual(getValidatorsRequired(0.9), 0);
            assert.strictEqual(getValidatorsRequired(0.899), 3);
            assert.strictEqual(getValidatorsRequired(0.5), 3);
            assert.strictEqual(getValidatorsRequired(0.499), 5);
        });
    });

    describe('getTrustTier', () => {
        it('should return HIGH for trust >= 0.9', () => {
            assert.strictEqual(getTrustTier(1.0), 'HIGH');
            assert.strictEqual(getTrustTier(0.95), 'HIGH');
            assert.strictEqual(getTrustTier(0.9), 'HIGH');
        });

        it('should return MEDIUM for trust 0.5-0.89', () => {
            assert.strictEqual(getTrustTier(0.89), 'MEDIUM');
            assert.strictEqual(getTrustTier(0.7), 'MEDIUM');
            assert.strictEqual(getTrustTier(0.5), 'MEDIUM');
        });

        it('should return LOW for trust < 0.5', () => {
            assert.strictEqual(getTrustTier(0.49), 'LOW');
            assert.strictEqual(getTrustTier(0.3), 'LOW');
            assert.strictEqual(getTrustTier(0.0), 'LOW');
        });
    });
});
