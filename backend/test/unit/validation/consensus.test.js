/**
 * CONSENSUS ALGORITHMS UNIT TESTS
 * ================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ConsensusCalculator } from '../../../src/validation/consensus.js';

describe('Consensus Algorithms', () => {
    const calculator = new ConsensusCalculator();

    describe('simpleMajority', () => {
        it('should accept with simple majority', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: true },
                { validator_id: '3', approved: false }
            ];

            const result = calculator.calculate(votes, 'simple_majority');
            assert.strictEqual(result.accepted, true);
            assert.strictEqual(result.approvalCount, 2);
            assert.strictEqual(result.rejectionCount, 1);
        });

        it('should reject without majority', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: false },
                { validator_id: '3', approved: false }
            ];

            const result = calculator.calculate(votes, 'simple_majority');
            assert.strictEqual(result.accepted, false);
            assert.strictEqual(result.approvalCount, 1);
            assert.strictEqual(result.rejectionCount, 2);
        });

        it('should handle tie (reject on tie)', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: false }
            ];

            const result = calculator.calculate(votes, 'simple_majority');
            assert.strictEqual(result.accepted, false);
        });
    });

    describe('trustWeightedConsensus', () => {
        it('should weight votes by trust score', () => {
            const votes = [
                { validator_id: '1', approved: true, trust_score: 0.9 },
                { validator_id: '2', approved: false, trust_score: 0.3 }
            ];

            const result = calculator.calculate(votes, 'trust_weighted');
            assert.strictEqual(result.accepted, true);
            assert.ok(result.weightedApproval > result.weightedRejection);
        });

        it('should reject when high-trust validators reject', () => {
            const votes = [
                { validator_id: '1', approved: true, trust_score: 0.3 },
                { validator_id: '2', approved: false, trust_score: 0.9 }
            ];

            const result = calculator.calculate(votes, 'trust_weighted');
            assert.strictEqual(result.accepted, false);
        });

        it('should handle equal trust scores', () => {
            const votes = [
                { validator_id: '1', approved: true, trust_score: 0.5 },
                { validator_id: '2', approved: true, trust_score: 0.5 },
                { validator_id: '3', approved: false, trust_score: 0.5 }
            ];

            const result = calculator.calculate(votes, 'trust_weighted');
            assert.strictEqual(result.accepted, true);
        });
    });

    describe('supermajorityConsensus', () => {
        it('should require 2/3 majority', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: true },
                { validator_id: '3', approved: false }
            ];

            const result = calculator.calculate(votes, 'supermajority');
            assert.strictEqual(result.accepted, true);
            assert.ok(result.approvalRatio >= 2/3);
        });

        it('should reject when below 2/3 threshold', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: true },
                { validator_id: '3', approved: false },
                { validator_id: '4', approved: false }
            ];

            const result = calculator.calculate(votes, 'supermajority');
            assert.strictEqual(result.accepted, false);
            assert.ok(result.approvalRatio < 2/3);
        });
    });

    describe('byzantineFaultTolerant', () => {
        it('should tolerate up to f Byzantine faults (3f+1 nodes)', () => {
            // With 4 validators, can tolerate 1 Byzantine fault
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: true },
                { validator_id: '3', approved: true },
                { validator_id: '4', approved: false } // Byzantine
            ];

            const result = calculator.calculate(votes, 'byzantine_fault_tolerant');
            assert.strictEqual(result.accepted, true);
        });

        it('should reject when Byzantine threshold exceeded', () => {
            // With 4 validators, can tolerate 1 Byzantine fault
            // 2 Byzantine faults should cause rejection
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: true },
                { validator_id: '3', approved: false },
                { validator_id: '4', approved: false }
            ];

            const result = calculator.calculate(votes, 'byzantine_fault_tolerant');
            assert.strictEqual(result.accepted, false);
        });
    });

    describe('quorumConsensus', () => {
        it('should require 3/4 quorum', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: true },
                { validator_id: '3', approved: true },
                { validator_id: '4', approved: false }
            ];

            const result = calculator.calculate(votes, 'quorum');
            assert.strictEqual(result.accepted, true);
        });

        it('should reject when below quorum', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: true },
                { validator_id: '3', approved: false },
                { validator_id: '4', approved: false }
            ];

            const result = calculator.calculate(votes, 'quorum');
            assert.strictEqual(result.accepted, false);
        });
    });

    describe('adaptiveConsensus', () => {
        it('should use supermajority for low-trust submitters', () => {
            const votes = [
                { validator_id: '1', approved: true, trust_score: 0.8 },
                { validator_id: '2', approved: true, trust_score: 0.7 },
                { validator_id: '3', approved: false, trust_score: 0.6 }
            ];

            const result = calculator.calculate(votes, 'adaptive', { submitterTrust: 0.3 });
            // Should require 2/3 majority due to low submitter trust
            assert.strictEqual(result.accepted, true);
        });

        it('should use simple majority for high-trust submitters', () => {
            const votes = [
                { validator_id: '1', approved: true },
                { validator_id: '2', approved: false }
            ];

            const result = calculator.calculate(votes, 'adaptive', { submitterTrust: 0.9 });
            // Should use simple majority for high trust
            assert.strictEqual(result.accepted, false); // Tie rejects
        });
    });

    describe('detectManipulation', () => {
        it('should detect collusion (all validators have same trust)', () => {
            const votes = [
                { validator_id: '1', approved: true, trust_score: 0.5 },
                { validator_id: '2', approved: true, trust_score: 0.5 },
                { validator_id: '3', approved: true, trust_score: 0.5 }
            ];

            const result = calculator.calculate(votes, 'simple_majority');
            assert.ok(result.suspiciousPatterns.includes('identical_trust_scores'));
        });

        it('should detect rapid voting (all within 1 second)', () => {
            const now = Date.now();
            const votes = [
                { validator_id: '1', approved: true, voted_at: new Date(now) },
                { validator_id: '2', approved: true, voted_at: new Date(now + 100) },
                { validator_id: '3', approved: true, voted_at: new Date(now + 200) }
            ];

            const result = calculator.calculate(votes, 'simple_majority');
            assert.ok(result.suspiciousPatterns.includes('rapid_voting'));
        });

        it('should not flag legitimate voting patterns', () => {
            const now = Date.now();
            const votes = [
                { validator_id: '1', approved: true, trust_score: 0.8, voted_at: new Date(now) },
                { validator_id: '2', approved: false, trust_score: 0.6, voted_at: new Date(now + 5000) },
                { validator_id: '3', approved: true, trust_score: 0.7, voted_at: new Date(now + 10000) }
            ];

            const result = calculator.calculate(votes, 'simple_majority');
            assert.strictEqual(result.suspiciousPatterns.length, 0);
        });
    });
});
