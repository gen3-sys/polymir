/**
 * POLYMIR WEBSOCKET VALIDATION HANDLER
 * =====================================
 * Handles real-time validation requests and broadcasts
 * Notifies validators of pending validations in their region
 */

import logger from '../../utils/logger.js';
import { getValidatorsRequired } from '../../utils/trust.js';

const log = logger.child('WS:Validation');

// =============================================
// VALIDATION HANDLERS
// =============================================

/**
 * Create validation notification handler
 * Broadcasts validation request to nearby validators
 * @param {Object} centralLibraryDB
 * @returns {Function} Handler function
 */
export function createValidationNotificationHandler(centralLibraryDB) {
    /**
     * Handle 'validation_request' message
     * Request validation and notify nearby validators
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleValidationRequest(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const {
            eventType,
            eventDataCid,
            megachunkId,
            bodyId
        } = message;

        if (!eventType || !eventDataCid) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing required fields',
                required: ['eventType', 'eventDataCid']
            });
            return;
        }

        try {
            // Get player trust score
            const player = await centralLibraryDB.getPlayerById(clientInfo.playerId);
            const validatorsRequired = getValidatorsRequired(player.trust_score);

            // Create consensus result
            const consensus = await centralLibraryDB.createConsensusResult({
                eventType,
                eventDataCid,
                submitterId: clientInfo.playerId,
                worldServerId: null, // TODO: Get from config
                megachunkX: null,
                megachunkY: null,
                megachunkZ: null
            });

            log.info('Validation requested via WebSocket', {
                consensusId: consensus.consensus_id,
                eventType,
                playerId: clientInfo.playerId,
                validatorsRequired
            });

            // Broadcast to nearby validators
            const notificationMessage = {
                type: 'validation_available',
                consensusId: consensus.consensus_id,
                eventType,
                eventDataCid,
                submitterId: clientInfo.playerId,
                validatorsRequired,
                megachunkId,
                bodyId,
                timestamp: Date.now()
            };

            let notifiedCount = 0;

            // Notify validators in same megachunk
            if (megachunkId) {
                notifiedCount += wsServer.broadcastToMegachunk(megachunkId, notificationMessage);
            }

            // Notify validators on same body
            if (bodyId) {
                notifiedCount += wsServer.broadcastToBody(bodyId, notificationMessage);
            }

            // Send confirmation to requester
            wsServer.sendToClient(connectionId, {
                type: 'validation_requested',
                consensusId: consensus.consensus_id,
                validatorsRequired,
                validatorsNotified: notifiedCount,
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Validation request failed', {
                connectionId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Validation request failed',
                message: error.message
            });
        }
    };
}

/**
 * Create validation vote handler
 * @param {Object} centralLibraryDB
 * @returns {Function} Handler function
 */
export function createValidationVoteHandler(centralLibraryDB) {
    /**
     * Handle 'validation_vote' message
     * Submit vote and notify others if consensus reached
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleValidationVote(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { consensusId, agrees, computationProofCid } = message;

        if (!consensusId || agrees === undefined) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing required fields',
                required: ['consensusId', 'agrees']
            });
            return;
        }

        try {
            // Get consensus
            const consensus = await centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                wsServer.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Consensus not found'
                });
                return;
            }

            // Check if already resolved
            if (consensus.is_valid !== null) {
                wsServer.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Consensus already resolved',
                    isValid: consensus.is_valid
                });
                return;
            }

            // Prevent self-validation
            if (consensus.submitter_id === clientInfo.playerId) {
                wsServer.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Cannot validate your own action'
                });
                return;
            }

            // Record vote
            await centralLibraryDB.recordValidationVote(
                consensusId,
                clientInfo.playerId,
                agrees,
                computationProofCid || null
            );

            log.info('Validation vote recorded', {
                consensusId,
                validator: clientInfo.playerId,
                agrees
            });

            // Get updated consensus
            const updatedConsensus = await centralLibraryDB.getConsensusResult(consensusId);
            const votes = updatedConsensus.votes.filter(v => v.validator_id);
            const agreeCount = votes.filter(v => v.agrees).length;
            const disagreeCount = votes.filter(v => !v.agrees).length;
            const totalVotes = votes.length;

            // Check if consensus reached
            const requiredValidators = getValidatorsRequired(0.5); // Default
            let consensusReached = false;
            let isValid = null;

            if (totalVotes >= requiredValidators) {
                consensusReached = true;
                isValid = agreeCount > disagreeCount;

                // Update consensus
                await centralLibraryDB.updateConsensusResult(
                    consensusId,
                    isValid,
                    agreeCount,
                    disagreeCount,
                    null
                );

                log.info('Consensus reached via WebSocket', {
                    consensusId,
                    isValid,
                    agreeCount,
                    disagreeCount
                });

                // Notify submitter
                wsServer.sendToPlayer(consensus.submitter_id, {
                    type: 'validation_complete',
                    consensusId,
                    isValid,
                    agreeCount,
                    disagreeCount,
                    totalVotes,
                    timestamp: Date.now()
                });
            }

            // Send confirmation to voter
            wsServer.sendToClient(connectionId, {
                type: 'vote_recorded',
                consensusId,
                agrees,
                totalVotes,
                agreeCount,
                disagreeCount,
                consensusReached,
                isValid,
                timestamp: Date.now()
            });

        } catch (error) {
            if (error.code === '23505') {
                wsServer.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Already voted on this consensus'
                });
                return;
            }

            log.error('Validation vote failed', {
                connectionId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Vote failed',
                message: error.message
            });
        }
    };
}

/**
 * Create validation status handler
 * @param {Object} centralLibraryDB
 * @returns {Function} Handler function
 */
export function createValidationStatusHandler(centralLibraryDB) {
    /**
     * Handle 'validation_status' message
     * Get current status of a consensus
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleValidationStatus(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { consensusId } = message;

        if (!consensusId) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing consensusId'
            });
            return;
        }

        try {
            const consensus = await centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                wsServer.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Consensus not found'
                });
                return;
            }

            const votes = consensus.votes.filter(v => v.validator_id);
            const agreeCount = votes.filter(v => v.agrees).length;
            const disagreeCount = votes.filter(v => !v.agrees).length;

            wsServer.sendToClient(connectionId, {
                type: 'validation_status',
                consensusId,
                eventType: consensus.event_type,
                submitterId: consensus.submitter_id,
                isValid: consensus.is_valid,
                totalVotes: votes.length,
                agreeCount,
                disagreeCount,
                submittedAt: consensus.submitted_at,
                resolvedAt: consensus.resolved_at,
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Get validation status failed', {
                connectionId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to get validation status',
                message: error.message
            });
        }
    };
}

// =============================================
// HANDLER REGISTRATION
// =============================================

/**
 * Register all validation handlers
 * @param {Object} wsServer
 * @param {Object} centralLibraryDB
 */
export function registerValidationHandlers(wsServer, centralLibraryDB) {
    wsServer.registerHandler('validation_request', createValidationNotificationHandler(centralLibraryDB));
    wsServer.registerHandler('validation_vote', createValidationVoteHandler(centralLibraryDB));
    wsServer.registerHandler('validation_status', createValidationStatusHandler(centralLibraryDB));

    log.info('Validation handlers registered');
}

// =============================================
// EXPORTS
// =============================================

export default {
    createValidationNotificationHandler,
    createValidationVoteHandler,
    createValidationStatusHandler,
    registerValidationHandlers
};
