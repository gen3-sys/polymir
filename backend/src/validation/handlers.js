/**
 * POLYMIR VALIDATION MESSAGE HANDLERS
 * ====================================
 * libp2p message handlers for distributed validation system
 * Processes validation requests and votes over the P2P network
 */

import logger from '../utils/logger.js';
import { subscribeTopic, publishToTopic } from '../libp2p/node.js';

const log = logger.child('ValidationHandlers');

// =============================================
// VALIDATION MESSAGE HANDLERS
// =============================================

/**
 * Create validation request handler
 * Processes incoming validation requests from network
 * @param {Object} validationOrchestrator
 * @param {Object} centralLibraryDB
 * @param {Object} ipfsClient
 * @returns {Function}
 */
export function createValidationRequestHandler(validationOrchestrator, centralLibraryDB, ipfsClient) {
    /**
     * Handle validation_request message
     * @param {Object} message
     * @param {Object} peerInfo
     */
    return async function handleValidationRequest(message, peerInfo) {
        const { consensusId, eventDataCid, timestamp } = message;

        try {
            log.debug('Validation request received', {
                consensusId,
                eventDataCid,
                from: peerInfo.id?.toString()
            });

            // Get consensus from database
            const consensus = await centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                log.warn('Consensus not found', { consensusId });
                return;
            }

            // Already resolved
            if (consensus.is_valid !== null) {
                log.debug('Consensus already resolved', {
                    consensusId,
                    isValid: consensus.is_valid
                });
                return;
            }

            // Download event data from IPFS
            const eventData = await ipfsClient.download(eventDataCid);
            const parsedData = JSON.parse(eventData.toString());

            log.info('Validation request ready for processing', {
                consensusId,
                eventType: consensus.event_type,
                submitter: consensus.submitter_id
            });

            // Validators would process this locally and submit votes
            // This is handled by external validator clients

        } catch (error) {
            log.error('Validation request handling failed', {
                consensusId,
                error: error.message
            });
        }
    };
}

/**
 * Create validation vote handler
 * Processes incoming validation votes from network
 * @param {Object} validationOrchestrator
 * @returns {Function}
 */
export function createValidationVoteHandler(validationOrchestrator) {
    /**
     * Handle validation_vote message
     * @param {Object} message
     * @param {Object} peerInfo
     */
    return async function handleValidationVote(message, peerInfo) {
        const { consensusId, validatorId, agrees, computationProofCid, signature } = message;

        try {
            log.debug('Validation vote received', {
                consensusId,
                validatorId,
                agrees,
                from: peerInfo.id?.toString()
            });

            // TODO: Verify signature to ensure vote authenticity
            // This would use libp2p peer identity verification

            // Submit vote through orchestrator
            const result = await validationOrchestrator.submitVote(
                consensusId,
                validatorId,
                agrees,
                computationProofCid ? { cid: computationProofCid } : null
            );

            log.info('Vote processed', {
                consensusId,
                validatorId,
                consensusReached: result.consensusReached
            });

            // If consensus reached, broadcast result
            if (result.consensusReached) {
                // This would publish consensus_reached message
                log.info('Broadcasting consensus result', {
                    consensusId,
                    isValid: result.isValid
                });
            }

        } catch (error) {
            log.error('Vote handling failed', {
                consensusId,
                validatorId,
                error: error.message
            });
        }
    };
}

/**
 * Create consensus reached handler
 * Processes consensus resolution notifications
 * @param {Object} centralLibraryDB
 * @returns {Function}
 */
export function createConsensusReachedHandler(centralLibraryDB) {
    /**
     * Handle consensus_reached message
     * @param {Object} message
     * @param {Object} peerInfo
     */
    return async function handleConsensusReached(message, peerInfo) {
        const { consensusId, isValid, agreeCount, disagreeCount, proofCid } = message;

        try {
            log.info('Consensus reached notification', {
                consensusId,
                isValid,
                agreeCount,
                disagreeCount,
                from: peerInfo.id?.toString()
            });

            // Verify consensus result matches local calculation
            const consensus = await centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                log.warn('Unknown consensus', { consensusId });
                return;
            }

            if (consensus.is_valid !== null && consensus.is_valid !== isValid) {
                log.error('Consensus mismatch detected', {
                    consensusId,
                    localResult: consensus.is_valid,
                    networkResult: isValid
                });
                return;
            }

            log.debug('Consensus result verified', { consensusId });

        } catch (error) {
            log.error('Consensus reached handling failed', {
                consensusId,
                error: error.message
            });
        }
    };
}

/**
 * Create validation timeout handler
 * Processes validation timeout notifications
 * @param {Object} validationOrchestrator
 * @returns {Function}
 */
export function createValidationTimeoutHandler(validationOrchestrator) {
    /**
     * Handle validation_timeout message
     * @param {Object} message
     * @param {Object} peerInfo
     */
    return async function handleValidationTimeout(message, peerInfo) {
        const { consensusId } = message;

        try {
            log.warn('Validation timeout notification', {
                consensusId,
                from: peerInfo.id?.toString()
            });

            // Check local validation state
            const state = validationOrchestrator.getValidationState(consensusId);

            if (state && state.status === 'pending') {
                log.info('Triggering local timeout handling', { consensusId });
                await validationOrchestrator.handleValidationTimeout(consensusId);
            }

        } catch (error) {
            log.error('Timeout handling failed', {
                consensusId,
                error: error.message
            });
        }
    };
}

// =============================================
// HANDLER REGISTRATION
// =============================================

/**
 * Register all validation handlers with libp2p node
 * @param {Object} libp2pNode
 * @param {Object} validationOrchestrator
 * @param {Object} centralLibraryDB
 * @param {Object} ipfsClient
 */
export async function registerValidationHandlers(libp2pNode, validationOrchestrator, centralLibraryDB, ipfsClient) {
    const handlers = {
        'validation_request': createValidationRequestHandler(
            validationOrchestrator,
            centralLibraryDB,
            ipfsClient
        ),
        'validation_vote': createValidationVoteHandler(validationOrchestrator),
        'consensus_reached': createConsensusReachedHandler(centralLibraryDB),
        'validation_timeout': createValidationTimeoutHandler(validationOrchestrator)
    };

    // Subscribe to validation topic (only if libp2p is available)
    const topic = 'polymir/validations';

    if (libp2pNode) {
        // Use subscribeTopic wrapper function
        await subscribeTopic(topic, async (message, from) => {
            try {
                const { type, ...data } = message;

                const handler = handlers[type];

                if (!handler) {
                    log.warn('Unknown validation message type', { type });
                    return;
                }

                await handler(data, { id: from });

            } catch (error) {
                log.error('Validation message handling failed', {
                    error: error.message
                });
            }
        });

        log.info('Validation handlers registered', {
            topic,
            handlerCount: Object.keys(handlers).length
        });
    } else {
        log.warn('libp2p not available - validation handlers will not receive network messages');
        log.info('Validation handlers created (local only)', {
            handlerCount: Object.keys(handlers).length
        });
    }
}

// =============================================
// MESSAGE PUBLISHING UTILITIES
// =============================================

/**
 * Publish validation request to network
 * @param {Object} libp2pNode
 * @param {string} consensusId
 * @param {string} eventDataCid
 */
export async function publishValidationRequest(libp2pNode, consensusId, eventDataCid) {
    try {
        const message = {
            type: 'validation_request',
            consensusId,
            eventDataCid,
            timestamp: Date.now()
        };

        await libp2pNode.publish('polymir/validations', message);

        log.debug('Validation request published', { consensusId });

    } catch (error) {
        log.error('Failed to publish validation request', {
            consensusId,
            error: error.message
        });
    }
}

/**
 * Publish validation vote to network
 * @param {Object} libp2pNode
 * @param {string} consensusId
 * @param {string} validatorId
 * @param {boolean} agrees
 * @param {string} computationProofCid
 */
export async function publishValidationVote(libp2pNode, consensusId, validatorId, agrees, computationProofCid = null) {
    try {
        const message = {
            type: 'validation_vote',
            consensusId,
            validatorId,
            agrees,
            computationProofCid,
            timestamp: Date.now()
            // TODO: Add signature for vote authenticity
        };

        await libp2pNode.publish('polymir/validations', message);

        log.debug('Validation vote published', {
            consensusId,
            validatorId,
            agrees
        });

    } catch (error) {
        log.error('Failed to publish validation vote', {
            consensusId,
            error: error.message
        });
    }
}

/**
 * Publish consensus reached notification
 * @param {Object} libp2pNode
 * @param {string} consensusId
 * @param {boolean} isValid
 * @param {number} agreeCount
 * @param {number} disagreeCount
 */
export async function publishConsensusReached(libp2pNode, consensusId, isValid, agreeCount, disagreeCount) {
    try {
        const message = {
            type: 'consensus_reached',
            consensusId,
            isValid,
            agreeCount,
            disagreeCount,
            timestamp: Date.now()
        };

        await libp2pNode.publish('polymir/validations', message);

        log.info('Consensus reached published', {
            consensusId,
            isValid
        });

    } catch (error) {
        log.error('Failed to publish consensus reached', {
            consensusId,
            error: error.message
        });
    }
}

// =============================================
// EXPORTS
// =============================================

export default {
    createValidationRequestHandler,
    createValidationVoteHandler,
    createConsensusReachedHandler,
    createValidationTimeoutHandler,
    registerValidationHandlers,
    publishValidationRequest,
    publishValidationVote,
    publishConsensusReached
};
