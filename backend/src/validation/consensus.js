/**
 * POLYMIR CONSENSUS CALCULATOR
 * =============================
 * Advanced consensus algorithms for validation resolution
 * Includes weighted voting, Byzantine fault tolerance, and trust-based consensus
 */

import logger from '../utils/logger.js';

const log = logger.child('Consensus');

// =============================================
// CONSENSUS ALGORITHMS
// =============================================

/**
 * Simple majority consensus
 * @param {Array} votes - Array of vote objects
 * @returns {Object} Consensus result
 */
export function simpleMajority(votes) {
    const agreeCount = votes.filter(v => v.agrees).length;
    const disagreeCount = votes.filter(v => !v.agrees).length;
    const totalVotes = votes.length;

    const isValid = agreeCount > disagreeCount;
    const confidence = Math.abs(agreeCount - disagreeCount) / totalVotes;

    return {
        isValid,
        agreeCount,
        disagreeCount,
        totalVotes,
        confidence,
        algorithm: 'simple_majority'
    };
}

/**
 * Trust-weighted consensus
 * Votes are weighted by validator trust scores
 * @param {Array} votes - Array of vote objects with trust scores
 * @returns {Object} Consensus result
 */
export function trustWeightedConsensus(votes) {
    let agreeWeight = 0;
    let disagreeWeight = 0;
    let totalWeight = 0;

    for (const vote of votes) {
        const weight = vote.trustScore || 0.5;
        totalWeight += weight;

        if (vote.agrees) {
            agreeWeight += weight;
        } else {
            disagreeWeight += weight;
        }
    }

    const isValid = agreeWeight > disagreeWeight;
    const confidence = Math.abs(agreeWeight - disagreeWeight) / totalWeight;

    return {
        isValid,
        agreeCount: votes.filter(v => v.agrees).length,
        disagreeCount: votes.filter(v => !v.agrees).length,
        agreeWeight,
        disagreeWeight,
        totalWeight,
        totalVotes: votes.length,
        confidence,
        algorithm: 'trust_weighted'
    };
}

/**
 * Supermajority consensus
 * Requires 2/3 majority to pass
 * @param {Array} votes
 * @param {number} threshold - Default 0.66 (2/3)
 * @returns {Object}
 */
export function supermajorityConsensus(votes, threshold = 0.66) {
    const agreeCount = votes.filter(v => v.agrees).length;
    const disagreeCount = votes.filter(v => !v.agrees).length;
    const totalVotes = votes.length;

    const agreeRatio = agreeCount / totalVotes;
    const disagreeRatio = disagreeCount / totalVotes;

    let isValid = null;

    if (agreeRatio >= threshold) {
        isValid = true;
    } else if (disagreeRatio >= threshold) {
        isValid = false;
    }
    // else: no consensus (tie or insufficient majority)

    const confidence = isValid !== null ? Math.max(agreeRatio, disagreeRatio) : 0;

    return {
        isValid,
        agreeCount,
        disagreeCount,
        totalVotes,
        agreeRatio,
        disagreeRatio,
        threshold,
        confidence,
        algorithm: 'supermajority'
    };
}

/**
 * Byzantine fault tolerant consensus
 * Tolerates up to f Byzantine (malicious) validators where n = 3f + 1
 * @param {Array} votes
 * @returns {Object}
 */
export function byzantineFaultTolerant(votes) {
    const totalVotes = votes.length;
    const agreeCount = votes.filter(v => v.agrees).length;
    const disagreeCount = votes.filter(v => !v.agrees).length;

    // BFT requires n >= 3f + 1, where f is max Byzantine faults
    // For safety, we need 2f + 1 votes for same outcome
    const f = Math.floor((totalVotes - 1) / 3);
    const requiredVotes = 2 * f + 1;

    let isValid = null;

    if (agreeCount >= requiredVotes) {
        isValid = true;
    } else if (disagreeCount >= requiredVotes) {
        isValid = false;
    }
    // else: no BFT consensus

    const confidence = isValid !== null
        ? Math.max(agreeCount, disagreeCount) / totalVotes
        : 0;

    return {
        isValid,
        agreeCount,
        disagreeCount,
        totalVotes,
        maxByzantineFaults: f,
        requiredVotes,
        confidence,
        algorithm: 'byzantine_fault_tolerant'
    };
}

/**
 * Quorum-based consensus
 * Requires minimum quorum participation and majority within quorum
 * @param {Array} votes
 * @param {number} totalValidators - Total eligible validators
 * @param {number} quorumThreshold - Minimum participation (default 0.5)
 * @returns {Object}
 */
export function quorumConsensus(votes, totalValidators, quorumThreshold = 0.5) {
    const totalVotes = votes.length;
    const agreeCount = votes.filter(v => v.agrees).length;
    const disagreeCount = votes.filter(v => !v.agrees).length;

    const participation = totalVotes / totalValidators;
    const hasQuorum = participation >= quorumThreshold;

    let isValid = null;

    if (hasQuorum) {
        isValid = agreeCount > disagreeCount;
    }

    const confidence = hasQuorum
        ? Math.abs(agreeCount - disagreeCount) / totalVotes
        : 0;

    return {
        isValid,
        agreeCount,
        disagreeCount,
        totalVotes,
        totalValidators,
        participation,
        hasQuorum,
        quorumThreshold,
        confidence,
        algorithm: 'quorum'
    };
}

/**
 * Adaptive consensus
 * Selects algorithm based on validator count and trust distribution
 * @param {Array} votes - Votes with trust scores
 * @param {Object} options
 * @returns {Object}
 */
export function adaptiveConsensus(votes, options = {}) {
    const totalVotes = votes.length;

    // Small validator set (< 5) - Use simple majority
    if (totalVotes < 5) {
        return simpleMajority(votes);
    }

    // Medium validator set (5-10) - Use trust-weighted
    if (totalVotes < 10) {
        return trustWeightedConsensus(votes);
    }

    // Large validator set (10+) - Use BFT
    return byzantineFaultTolerant(votes);
}

// =============================================
// CONSENSUS CALCULATOR CLASS
// =============================================

export class ConsensusCalculator {
    constructor(algorithm = 'adaptive') {
        this.algorithm = algorithm;
        this.algorithms = {
            simple_majority: simpleMajority,
            trust_weighted: trustWeightedConsensus,
            supermajority: supermajorityConsensus,
            byzantine_fault_tolerant: byzantineFaultTolerant,
            quorum: quorumConsensus,
            adaptive: adaptiveConsensus
        };
    }

    /**
     * Calculate consensus for a set of votes
     * @param {Array} votes
     * @param {Object} options
     * @returns {Object}
     */
    calculate(votes, options = {}) {
        if (!votes || votes.length === 0) {
            return {
                isValid: null,
                error: 'No votes provided',
                totalVotes: 0
            };
        }

        const algorithmFunc = this.algorithms[this.algorithm];

        if (!algorithmFunc) {
            log.error('Unknown consensus algorithm', { algorithm: this.algorithm });
            return simpleMajority(votes);
        }

        try {
            const result = algorithmFunc(votes, options);

            log.debug('Consensus calculated', {
                algorithm: this.algorithm,
                totalVotes: votes.length,
                isValid: result.isValid,
                confidence: result.confidence
            });

            return result;

        } catch (error) {
            log.error('Consensus calculation failed', {
                algorithm: this.algorithm,
                error: error.message
            });

            // Fallback to simple majority
            return simpleMajority(votes);
        }
    }

    /**
     * Set consensus algorithm
     * @param {string} algorithm
     */
    setAlgorithm(algorithm) {
        if (!this.algorithms[algorithm]) {
            throw new Error(`Unknown algorithm: ${algorithm}`);
        }
        this.algorithm = algorithm;
        log.info('Consensus algorithm changed', { algorithm });
    }

    /**
     * Get available algorithms
     * @returns {Array<string>}
     */
    getAvailableAlgorithms() {
        return Object.keys(this.algorithms);
    }
}

// =============================================
// CONSENSUS METRICS
// =============================================

/**
 * Calculate consensus quality metrics
 * @param {Object} consensusResult
 * @returns {Object}
 */
export function calculateConsensusMetrics(consensusResult) {
    const {
        isValid,
        agreeCount,
        disagreeCount,
        totalVotes,
        confidence
    } = consensusResult;

    // Agreement level (0-1)
    const agreementLevel = totalVotes > 0
        ? Math.max(agreeCount, disagreeCount) / totalVotes
        : 0;

    // Polarization (0-1, higher = more divided)
    const polarization = totalVotes > 0
        ? Math.abs(agreeCount - disagreeCount) / totalVotes
        : 0;

    // Participation quality (based on total votes)
    const participationQuality = Math.min(1, totalVotes / 10); // Optimal: 10+ validators

    // Overall consensus strength (0-1)
    const strength = (confidence + agreementLevel + polarization) / 3;

    return {
        agreementLevel,
        polarization,
        participationQuality,
        strength,
        reliability: strength * participationQuality
    };
}

/**
 * Detect potential consensus manipulation
 * @param {Array} votes
 * @returns {Object}
 */
export function detectManipulation(votes) {
    if (votes.length < 3) {
        return { suspicious: false, reason: 'Insufficient data' };
    }

    // Check for coordinated voting patterns
    const agreeCount = votes.filter(v => v.agrees).length;
    const disagreeCount = votes.filter(v => !v.agrees).length;

    // Perfect split might indicate collusion
    if (agreeCount === disagreeCount && votes.length >= 6) {
        return {
            suspicious: true,
            reason: 'Perfect vote split (possible collusion)',
            severity: 'medium'
        };
    }

    // All votes the same (unanimous) is suspicious for contentious actions
    if (agreeCount === 0 || disagreeCount === 0) {
        return {
            suspicious: true,
            reason: 'Unanimous vote (unusual for complex validation)',
            severity: 'low'
        };
    }

    // Check for identical trust scores (possible sybil attack)
    const trustScores = votes.map(v => v.trustScore || 0.5);
    const uniqueScores = new Set(trustScores);

    if (uniqueScores.size === 1 && votes.length >= 5) {
        return {
            suspicious: true,
            reason: 'Identical trust scores (possible sybil attack)',
            severity: 'high'
        };
    }

    return { suspicious: false };
}

// =============================================
// EXPORTS
// =============================================

export default {
    simpleMajority,
    trustWeightedConsensus,
    supermajorityConsensus,
    byzantineFaultTolerant,
    quorumConsensus,
    adaptiveConsensus,
    ConsensusCalculator,
    calculateConsensusMetrics,
    detectManipulation
};
