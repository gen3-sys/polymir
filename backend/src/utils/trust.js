/**
 * POLYMIR TRUST SYSTEM
 * ====================
 * Trust-based validation with consensus mechanisms
 *
 * Trust Score Range: 0.0 - 1.0
 * - 0.0-0.5: Low trust (requires many validators)
 * - 0.5-0.9: Medium trust (requires some validators)
 * - 0.9-1.0: High trust (instant approval)
 */

// =============================================
// TRUST CONFIGURATION
// =============================================

export const TRUST_CONFIG = {
    // Initial trust for new players
    INITIAL_SCORE: 0.5,

    // Trust boundaries
    LOW_TRUST_THRESHOLD: 0.5,
    MEDIUM_TRUST_THRESHOLD: 0.9,
    HIGH_TRUST_THRESHOLD: 0.9,

    // Validators required by trust tier
    VALIDATORS_REQUIRED: {
        LOW: 5,      // 0.0-0.5 requires 5 validators
        MEDIUM: 3,   // 0.5-0.9 requires 3 validators
        HIGH: 0      // 0.9-1.0 requires 0 validators (instant)
    },

    // Trust adjustments
    TRUST_INCREASE_CORRECT: 0.02,      // +2% for correct validation
    TRUST_DECREASE_INCORRECT: 0.10,    // -10% for incorrect validation
    TRUST_DECREASE_CONSENSUS_FAIL: 0.15, // -15% when your action is rejected

    // Consensus thresholds
    CONSENSUS_AGREEMENT_THRESHOLD: 0.67, // 67% must agree

    // Validation timeout
    VALIDATION_TIMEOUT_MS: 300000, // 5 minutes

    // Trust decay (optional - not implemented yet)
    TRUST_DECAY_ENABLED: false,
    TRUST_DECAY_RATE: 0.001 // Per day of inactivity
};

// Load from environment if available
if (process.env.TRUST_INITIAL_SCORE) {
    TRUST_CONFIG.INITIAL_SCORE = parseFloat(process.env.TRUST_INITIAL_SCORE);
}
if (process.env.TRUST_INCREASE_CORRECT) {
    TRUST_CONFIG.TRUST_INCREASE_CORRECT = parseFloat(process.env.TRUST_INCREASE_CORRECT);
}
if (process.env.TRUST_DECREASE_INCORRECT) {
    TRUST_CONFIG.TRUST_DECREASE_INCORRECT = parseFloat(process.env.TRUST_DECREASE_INCORRECT);
}
if (process.env.VALIDATION_TIMEOUT_MS) {
    TRUST_CONFIG.VALIDATION_TIMEOUT_MS = parseInt(process.env.VALIDATION_TIMEOUT_MS);
}

// =============================================
// TRUST TIER DETERMINATION
// =============================================

/**
 * Get trust tier from score
 * @param {number} trustScore - 0.0 to 1.0
 * @returns {'HIGH'|'MEDIUM'|'LOW'}
 */
export function getTrustTier(trustScore) {
    if (trustScore >= TRUST_CONFIG.HIGH_TRUST_THRESHOLD) return 'HIGH';
    if (trustScore >= TRUST_CONFIG.LOW_TRUST_THRESHOLD) return 'MEDIUM';
    return 'LOW';
}

/**
 * Get number of validators required for trust score
 * @param {number} trustScore
 * @returns {number}
 */
export function getValidatorsRequired(trustScore) {
    const tier = getTrustTier(trustScore);
    return TRUST_CONFIG.VALIDATORS_REQUIRED[tier];
}

/**
 * Check if action needs validation
 * @param {number} trustScore
 * @returns {boolean}
 */
export function needsValidation(trustScore) {
    return getValidatorsRequired(trustScore) > 0;
}

// =============================================
// TRUST SCORE CALCULATIONS
// =============================================

/**
 * Calculate new trust score after correct validation
 * @param {number} currentScore
 * @returns {number} New score (clamped to 0-1)
 */
export function calculateTrustIncrease(currentScore) {
    const newScore = currentScore + TRUST_CONFIG.TRUST_INCREASE_CORRECT;
    return clampTrust(newScore);
}

/**
 * Calculate new trust score after incorrect validation
 * @param {number} currentScore
 * @returns {number} New score (clamped to 0-1)
 */
export function calculateTrustDecrease(currentScore) {
    const newScore = currentScore - TRUST_CONFIG.TRUST_DECREASE_INCORRECT;
    return clampTrust(newScore);
}

/**
 * Calculate new trust score after consensus rejection
 * @param {number} currentScore
 * @returns {number} New score (clamped to 0-1)
 */
export function calculateTrustConsensusFail(currentScore) {
    const newScore = currentScore - TRUST_CONFIG.TRUST_DECREASE_CONSENSUS_FAIL;
    return clampTrust(newScore);
}

/**
 * Clamp trust score to valid range [0, 1]
 * @param {number} score
 * @returns {number}
 */
function clampTrust(score) {
    return Math.max(0.0, Math.min(1.0, score));
}

// =============================================
// CONSENSUS CALCULATIONS
// =============================================

/**
 * Calculate consensus result from validator votes
 * @param {Array<boolean>} votes - Array of true (agree) / false (disagree)
 * @returns {{
 *   isValid: boolean,
 *   agreeCount: number,
 *   disagreeCount: number,
 *   totalVotes: number,
 *   agreementRatio: number,
 *   consensusReached: boolean
 * }}
 */
export function calculateConsensus(votes) {
    const agreeCount = votes.filter(v => v === true).length;
    const disagreeCount = votes.filter(v => v === false).length;
    const totalVotes = votes.length;

    if (totalVotes === 0) {
        return {
            isValid: false,
            agreeCount: 0,
            disagreeCount: 0,
            totalVotes: 0,
            agreementRatio: 0,
            consensusReached: false
        };
    }

    const agreementRatio = agreeCount / totalVotes;
    const consensusReached = agreementRatio >= TRUST_CONFIG.CONSENSUS_AGREEMENT_THRESHOLD;

    return {
        isValid: consensusReached,
        agreeCount,
        disagreeCount,
        totalVotes,
        agreementRatio,
        consensusReached
    };
}

/**
 * Check if consensus has been reached (enough votes collected)
 * @param {number} currentVotes
 * @param {number} requiredVotes
 * @returns {boolean}
 */
export function hasEnoughVotes(currentVotes, requiredVotes) {
    return currentVotes >= requiredVotes;
}

/**
 * Calculate validator trust adjustment based on consensus outcome
 * @param {boolean} validatorVote - Did validator agree?
 * @param {boolean} consensusResult - Was consensus valid?
 * @param {number} currentTrust - Validator's current trust
 * @returns {{newTrust: number, delta: number, reason: string}}
 */
export function calculateValidatorAdjustment(validatorVote, consensusResult, currentTrust) {
    const validatorCorrect = validatorVote === consensusResult;

    if (validatorCorrect) {
        const newTrust = calculateTrustIncrease(currentTrust);
        return {
            newTrust,
            delta: newTrust - currentTrust,
            reason: 'validation_correct'
        };
    } else {
        const newTrust = calculateTrustDecrease(currentTrust);
        return {
            newTrust,
            delta: newTrust - currentTrust,
            reason: 'validation_incorrect'
        };
    }
}

/**
 * Calculate submitter trust adjustment based on consensus
 * @param {boolean} consensusValid - Was action validated?
 * @param {number} currentTrust - Submitter's current trust
 * @returns {{newTrust: number, delta: number, reason: string}}
 */
export function calculateSubmitterAdjustment(consensusValid, currentTrust) {
    if (consensusValid) {
        // Submitter's action was approved - small trust increase
        const newTrust = calculateTrustIncrease(currentTrust);
        return {
            newTrust,
            delta: newTrust - currentTrust,
            reason: 'consensus_passed'
        };
    } else {
        // Submitter's action was rejected - large trust decrease
        const newTrust = calculateTrustConsensusFail(currentTrust);
        return {
            newTrust,
            delta: newTrust - currentTrust,
            reason: 'consensus_failed'
        };
    }
}

// =============================================
// VALIDATION REQUEST PRIORITIZATION
// =============================================

/**
 * Calculate priority score for validation request
 * Higher score = higher priority
 * @param {Object} request
 * @param {number} request.submitterTrust
 * @param {number} request.age - Age in milliseconds
 * @param {string} request.eventType
 * @returns {number} Priority score
 */
export function calculateValidationPriority(request) {
    let priority = 0;

    // Lower trust = higher priority (needs more scrutiny)
    priority += (1.0 - request.submitterTrust) * 100;

    // Older requests get higher priority
    const ageMinutes = request.age / (1000 * 60);
    priority += ageMinutes * 10;

    // Event type priority
    const eventPriority = {
        'schematic_placement': 30,
        'chunk_modification': 20,
        'block_placement': 10
    };
    priority += eventPriority[request.eventType] || 0;

    return priority;
}

/**
 * Sort validation requests by priority
 * @param {Array<Object>} requests
 * @returns {Array<Object>} Sorted by priority (highest first)
 */
export function sortValidationsByPriority(requests) {
    return requests
        .map(req => ({
            ...req,
            priority: calculateValidationPriority(req)
        }))
        .sort((a, b) => b.priority - a.priority);
}

// =============================================
// VALIDATOR SELECTION
// =============================================

/**
 * Select best validators for a validation request
 * Criteria: High trust, nearby location, recently active
 * @param {Array<Object>} availableValidators
 * @param {Object} request - Validation request with location
 * @param {number} count - Number of validators needed
 * @returns {Array<Object>} Selected validators
 */
export function selectValidators(availableValidators, request, count) {
    // Score each validator
    const scored = availableValidators.map(validator => {
        let score = 0;

        // Trust score (0-100)
        score += validator.trust_score * 100;

        // Distance score (closer is better)
        if (request.location && validator.location) {
            const distance = calculateDistance(
                request.location,
                validator.location
            );
            // Inverse distance scoring (max 50 points)
            const distanceScore = Math.max(0, 50 - distance / 10);
            score += distanceScore;
        }

        // Activity score (recently active is better)
        if (validator.last_active) {
            const minutesSinceActive = (Date.now() - validator.last_active) / (1000 * 60);
            const activityScore = Math.max(0, 30 - minutesSinceActive / 10);
            score += activityScore;
        }

        // Validation history (accurate validators preferred)
        if (validator.validations_submitted > 0) {
            const accuracy = validator.validations_correct / validator.validations_submitted;
            score += accuracy * 20;
        }

        return {
            ...validator,
            selectionScore: score
        };
    });

    // Sort by score and take top N
    return scored
        .sort((a, b) => b.selectionScore - a.selectionScore)
        .slice(0, count);
}

/**
 * Calculate distance between two locations (simplified)
 * @param {Object} loc1 - {x, y, z}
 * @param {Object} loc2 - {x, y, z}
 * @returns {number}
 */
function calculateDistance(loc1, loc2) {
    const dx = loc2.x - loc1.x;
    const dy = loc2.y - loc1.y;
    const dz = loc2.z - loc1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// =============================================
// TRUST STATISTICS
// =============================================

/**
 * Calculate trust statistics for a player
 * @param {Object} player - Player record with validation history
 * @returns {Object} Statistics
 */
export function calculateTrustStats(player) {
    const accuracy = player.validations_submitted > 0
        ? player.validations_correct / player.validations_submitted
        : 0;

    const tier = getTrustTier(player.trust_score);
    const validatorsNeeded = getValidatorsRequired(player.trust_score);

    return {
        trustScore: player.trust_score,
        tier,
        validatorsNeeded,
        accuracy: Math.round(accuracy * 100) / 100,
        accuracyPercentage: Math.round(accuracy * 100),
        totalValidations: player.validations_submitted,
        correctValidations: player.validations_correct,
        incorrectValidations: player.validations_incorrect,
        trustTrend: calculateTrustTrend(player)
    };
}

/**
 * Calculate trust trend (improving/declining/stable)
 * @param {Object} player
 * @returns {'improving'|'declining'|'stable'}
 */
function calculateTrustTrend(player) {
    // Simple heuristic based on recent accuracy
    const recentAccuracy = player.validations_submitted > 0
        ? player.validations_correct / player.validations_submitted
        : 0.5;

    if (recentAccuracy > 0.8) return 'improving';
    if (recentAccuracy < 0.5) return 'declining';
    return 'stable';
}

// =============================================
// VALIDATION EXPIRY
// =============================================

/**
 * Check if validation request has expired
 * @param {Date} submittedAt
 * @returns {boolean}
 */
export function isValidationExpired(submittedAt) {
    const age = Date.now() - submittedAt.getTime();
    return age > TRUST_CONFIG.VALIDATION_TIMEOUT_MS;
}

/**
 * Calculate remaining time for validation
 * @param {Date} submittedAt
 * @returns {number} Milliseconds remaining (0 if expired)
 */
export function getValidationTimeRemaining(submittedAt) {
    const age = Date.now() - submittedAt.getTime();
    const remaining = TRUST_CONFIG.VALIDATION_TIMEOUT_MS - age;
    return Math.max(0, remaining);
}

// =============================================
// EXPORTS
// =============================================

export default {
    TRUST_CONFIG,
    getTrustTier,
    getValidatorsRequired,
    needsValidation,
    calculateTrustIncrease,
    calculateTrustDecrease,
    calculateTrustConsensusFail,
    calculateConsensus,
    hasEnoughVotes,
    calculateValidatorAdjustment,
    calculateSubmitterAdjustment,
    calculateValidationPriority,
    sortValidationsByPriority,
    selectValidators,
    calculateTrustStats,
    isValidationExpired,
    getValidationTimeRemaining
};
