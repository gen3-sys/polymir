/**
 * POLYMIR VALIDATION ORCHESTRATOR
 * ================================
 * Orchestrates validation requests, validator selection, and trust updates
 * Manages the full validation lifecycle from request to trust adjustment
 */

import { logger } from '../utils/logger.js';
import {
    calculateValidatorRequirement,
    selectValidators,
    calculateTrustAdjustment
} from '../utils/trust.js';

const log = logger.child('Validator');

// =============================================
// VALIDATION ORCHESTRATOR
// =============================================

export class ValidationOrchestrator {
    constructor(centralLibraryDB, ipfsClient, libp2pNode) {
        this.centralLibraryDB = centralLibraryDB;
        this.ipfsClient = ipfsClient;
        this.libp2pNode = libp2pNode;

        // Active validation requests
        this.activeValidations = new Map(); // consensusId -> validation state

        // Validation timeout (5 minutes)
        this.validationTimeout = parseInt(process.env.VALIDATION_TIMEOUT_MS) || 300000;
    }

    /**
     * Request validation for an action
     * @param {Object} request - Validation request
     * @returns {Promise<Object>} Consensus result
     */
    async requestValidation(request) {
        const {
            eventType,
            eventData,
            submitterId,
            worldServerId,
            megachunkX,
            megachunkY,
            megachunkZ
        } = request;

        try {
            // Get submitter trust score
            const submitter = await this.centralLibraryDB.getPlayerById(submitterId);

            if (!submitter) {
                throw new Error('Submitter not found');
            }

            // Calculate required validators
            const validatorsRequired = calculateValidatorRequirement(submitter.trust_score);

            log.info('Validation requested', {
                submitterId,
                eventType,
                trustScore: submitter.trust_score,
                validatorsRequired
            });

            // High trust players bypass validation
            if (validatorsRequired === 0) {
                log.info('High trust player - validation bypassed', {
                    submitterId,
                    trustScore: submitter.trust_score
                });

                return {
                    bypass: true,
                    submitterId,
                    trustScore: submitter.trust_score
                };
            }

            // Upload event data to IPFS
            const eventDataJson = JSON.stringify(eventData);
            const eventDataCid = await this.ipfsClient.upload(Buffer.from(eventDataJson));
            await this.ipfsClient.pin(eventDataCid);

            log.debug('Event data uploaded to IPFS', { eventDataCid });

            // Create consensus result
            const consensus = await this.centralLibraryDB.createConsensusResult({
                eventType,
                eventDataCid,
                submitterId,
                worldServerId: worldServerId || null,
                megachunkX: megachunkX || null,
                megachunkY: megachunkY || null,
                megachunkZ: megachunkZ || null
            });

            // Store validation state
            this.activeValidations.set(consensus.consensus_id, {
                consensusId: consensus.consensus_id,
                submitterId,
                eventType,
                eventDataCid,
                validatorsRequired,
                submittedAt: Date.now(),
                expiresAt: Date.now() + this.validationTimeout,
                status: 'pending'
            });

            // Set expiration timer
            setTimeout(() => {
                this.handleValidationTimeout(consensus.consensus_id);
            }, this.validationTimeout);

            // Select validators
            const validators = await this.selectValidatorsForRequest(
                submitterId,
                validatorsRequired,
                { megachunkX, megachunkY, megachunkZ }
            );

            log.info('Validators selected', {
                consensusId: consensus.consensus_id,
                validatorCount: validators.length,
                required: validatorsRequired
            });

            // Notify validators via libp2p
            await this.notifyValidators(consensus.consensus_id, validators, eventDataCid);

            return {
                consensusId: consensus.consensus_id,
                validatorsRequired,
                validatorsNotified: validators.length,
                submittedAt: consensus.submitted_at
            };

        } catch (error) {
            log.error('Validation request failed', {
                submitterId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Submit validation vote
     * @param {string} consensusId
     * @param {string} validatorId
     * @param {boolean} agrees
     * @param {Object} computationProof
     * @returns {Promise<Object>} Vote result
     */
    async submitVote(consensusId, validatorId, agrees, computationProof = null) {
        try {
            // Get consensus
            const consensus = await this.centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                throw new Error('Consensus not found');
            }

            // Check if already resolved
            if (consensus.is_valid !== null) {
                throw new Error('Consensus already resolved');
            }

            // Prevent self-validation
            if (consensus.submitter_id === validatorId) {
                throw new Error('Cannot validate own action');
            }

            // Upload computation proof if provided
            let proofCid = null;
            if (computationProof) {
                const proofJson = JSON.stringify(computationProof);
                proofCid = await this.ipfsClient.upload(Buffer.from(proofJson));
            }

            // Record vote
            await this.centralLibraryDB.recordValidationVote(
                consensusId,
                validatorId,
                agrees,
                proofCid
            );

            log.info('Vote recorded', {
                consensusId,
                validatorId,
                agrees
            });

            // Check if consensus reached
            const result = await this.checkConsensusStatus(consensusId);

            return result;

        } catch (error) {
            log.error('Vote submission failed', {
                consensusId,
                validatorId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if consensus has been reached
     * @param {string} consensusId
     * @returns {Promise<Object>} Consensus status
     */
    async checkConsensusStatus(consensusId) {
        try {
            const consensus = await this.centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                throw new Error('Consensus not found');
            }

            // Already resolved
            if (consensus.is_valid !== null) {
                return {
                    consensusReached: true,
                    isValid: consensus.is_valid,
                    agreeCount: consensus.agree_count,
                    disagreeCount: consensus.disagree_count,
                    resolvedAt: consensus.resolved_at
                };
            }

            // Count votes
            const votes = consensus.votes.filter(v => v.validator_id);
            const agreeCount = votes.filter(v => v.agrees).length;
            const disagreeCount = votes.filter(v => !v.agrees).length;
            const totalVotes = votes.length;

            // Get validation state
            const validationState = this.activeValidations.get(consensusId);
            const validatorsRequired = validationState?.validatorsRequired || 3;

            // Check if enough votes
            if (totalVotes < validatorsRequired) {
                return {
                    consensusReached: false,
                    totalVotes,
                    agreeCount,
                    disagreeCount,
                    required: validatorsRequired
                };
            }

            // Consensus reached - determine outcome
            const isValid = agreeCount > disagreeCount;

            // Update consensus result
            await this.centralLibraryDB.updateConsensusResult(
                consensusId,
                isValid,
                agreeCount,
                disagreeCount,
                null
            );

            log.info('Consensus reached', {
                consensusId,
                isValid,
                agreeCount,
                disagreeCount
            });

            // Update trust scores
            await this.updateTrustScores(consensus, isValid, votes);

            // Clean up active validation
            this.activeValidations.delete(consensusId);

            return {
                consensusReached: true,
                isValid,
                agreeCount,
                disagreeCount,
                totalVotes
            };

        } catch (error) {
            log.error('Check consensus failed', {
                consensusId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Select validators for validation request
     * @param {string} submitterId
     * @param {number} count
     * @param {Object} location
     * @returns {Promise<Array>} Selected validators
     */
    async selectValidatorsForRequest(submitterId, count, location = {}) {
        try {
            // Get trust leaderboard (top validators)
            const candidates = await this.centralLibraryDB.getTrustLeaderboard(100);

            // Filter out submitter
            const eligibleValidators = candidates.filter(v => v.player_id !== submitterId);

            // Select validators using trust-based selection
            const selected = selectValidators(eligibleValidators, count);

            return selected;

        } catch (error) {
            log.error('Validator selection failed', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Notify validators of pending validation
     * @param {string} consensusId
     * @param {Array} validators
     * @param {string} eventDataCid
     * @returns {Promise<void>}
     */
    async notifyValidators(consensusId, validators, eventDataCid) {
        try {
            const message = {
                type: 'validation_request',
                consensusId,
                eventDataCid,
                timestamp: Date.now()
            };

            // Publish to libp2p gossipsub
            const topic = 'polymir/validations';
            await this.libp2pNode.publish(topic, message);

            log.debug('Validators notified via gossipsub', {
                consensusId,
                validatorCount: validators.length
            });

        } catch (error) {
            log.error('Failed to notify validators', {
                consensusId,
                error: error.message
            });
        }
    }

    /**
     * Update trust scores based on consensus result
     * @param {Object} consensus
     * @param {boolean} isValid
     * @param {Array} votes
     * @returns {Promise<void>}
     */
    async updateTrustScores(consensus, isValid, votes) {
        try {
            // Get submitter
            const submitter = await this.centralLibraryDB.getPlayerById(consensus.submitter_id);

            // Update submitter trust (if action was invalid)
            if (!isValid) {
                const oldScore = submitter.trust_score;
                const adjustment = calculateTrustAdjustment(oldScore, false);
                const newScore = Math.max(0, Math.min(1, oldScore + adjustment));

                await this.centralLibraryDB.updatePlayerTrustScore(
                    consensus.submitter_id,
                    newScore
                );

                await this.centralLibraryDB.recordTrustChange(
                    consensus.submitter_id,
                    oldScore,
                    newScore,
                    'validation_failed',
                    consensus.consensus_id
                );

                log.info('Submitter trust decreased', {
                    playerId: consensus.submitter_id,
                    oldScore,
                    newScore,
                    adjustment
                });
            }

            // Update validator trust scores
            for (const vote of votes) {
                const validator = await this.centralLibraryDB.getPlayerById(vote.validator_id);
                const wasCorrect = vote.agrees === isValid;

                const oldScore = validator.trust_score;
                const adjustment = calculateTrustAdjustment(oldScore, wasCorrect);
                const newScore = Math.max(0, Math.min(1, oldScore + adjustment));

                await this.centralLibraryDB.updatePlayerTrustScore(
                    vote.validator_id,
                    newScore,
                    {
                        submitted: validator.validations_submitted + 1,
                        correct: validator.validations_correct + (wasCorrect ? 1 : 0),
                        incorrect: validator.validations_incorrect + (wasCorrect ? 0 : 1)
                    }
                );

                await this.centralLibraryDB.recordTrustChange(
                    vote.validator_id,
                    oldScore,
                    newScore,
                    wasCorrect ? 'validation_correct' : 'validation_incorrect',
                    consensus.consensus_id
                );

                log.debug('Validator trust updated', {
                    validatorId: vote.validator_id,
                    wasCorrect,
                    oldScore,
                    newScore,
                    adjustment
                });
            }

        } catch (error) {
            log.error('Trust score update failed', {
                consensusId: consensus.consensus_id,
                error: error.message
            });
        }
    }

    /**
     * Handle validation timeout
     * @param {string} consensusId
     * @returns {Promise<void>}
     */
    async handleValidationTimeout(consensusId) {
        const validationState = this.activeValidations.get(consensusId);

        if (!validationState || validationState.status !== 'pending') {
            return;
        }

        try {
            const consensus = await this.centralLibraryDB.getConsensusResult(consensusId);

            // Already resolved
            if (consensus.is_valid !== null) {
                this.activeValidations.delete(consensusId);
                return;
            }

            log.warn('Validation timeout', {
                consensusId,
                submitterId: validationState.submitterId
            });

            // Count votes received
            const votes = consensus.votes.filter(v => v.validator_id);

            if (votes.length === 0) {
                // No votes - mark as expired
                validationState.status = 'expired';

                log.warn('Validation expired with no votes', { consensusId });

                // Optionally decrease submitter trust for expired validation
                // (implementation decision - may indicate suspicious action)

            } else {
                // Some votes received - try to resolve with available votes
                const agreeCount = votes.filter(v => v.agrees).length;
                const disagreeCount = votes.filter(v => !v.agrees).length;

                if (agreeCount !== disagreeCount) {
                    // Clear majority - resolve
                    const isValid = agreeCount > disagreeCount;

                    await this.centralLibraryDB.updateConsensusResult(
                        consensusId,
                        isValid,
                        agreeCount,
                        disagreeCount,
                        null
                    );

                    await this.updateTrustScores(consensus, isValid, votes);

                    log.info('Validation resolved on timeout (majority vote)', {
                        consensusId,
                        isValid,
                        agreeCount,
                        disagreeCount
                    });
                } else {
                    // Tied - mark as expired
                    validationState.status = 'expired';

                    log.warn('Validation expired (tied votes)', {
                        consensusId,
                        agreeCount,
                        disagreeCount
                    });
                }
            }

            this.activeValidations.delete(consensusId);

        } catch (error) {
            log.error('Timeout handling failed', {
                consensusId,
                error: error.message
            });
        }
    }

    /**
     * Get active validation count
     * @returns {number}
     */
    getActiveValidationCount() {
        return this.activeValidations.size;
    }

    /**
     * Get validation state
     * @param {string} consensusId
     * @returns {Object|null}
     */
    getValidationState(consensusId) {
        return this.activeValidations.get(consensusId) || null;
    }
}

// =============================================
// EXPORTS
// =============================================

export default ValidationOrchestrator;
