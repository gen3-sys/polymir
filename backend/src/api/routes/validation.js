/**
 * POLYMIR VALIDATION API ROUTES
 * ==============================
 * REST API endpoints for requesting and submitting validation consensus
 * Handles trust-based validation requests and vote submission
 */

import express from 'express';
import logger from '../../utils/logger.js';
import { getValidatorsRequired } from '../../utils/trust.js';

const router = express.Router();

// =============================================
// VALIDATION ROUTES FACTORY
// =============================================

/**
 * Create validation routes with dependency injection
 * @param {Object} centralLibraryDB - Central Library database adapter
 * @param {Object} ipfsClient - IPFS client
 * @param {Function} authMiddleware - Authentication middleware
 * @returns {Router} Express router
 */
export function createValidationRoutes(centralLibraryDB, ipfsClient, authMiddleware) {
    const log = logger.child('API:Validation');

    // =============================================
    // VALIDATION REQUEST ROUTES
    // =============================================

    /**
     * POST /api/validation/request
     * Request validation for an action
     * Authenticated players can request validation
     */
    router.post('/request', authMiddleware, async (req, res) => {
        try {
            const {
                eventType,
                eventData,
                worldServerId,
                megachunkX,
                megachunkY,
                megachunkZ
            } = req.body;

            // Validation
            if (!eventType || !eventData) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['eventType', 'eventData']
                });
            }

            // Supported event types
            const validEventTypes = [
                'block_placement',
                'schematic_placement',
                'chunk_modification',
                'terrain_edit'
            ];

            if (!validEventTypes.includes(eventType)) {
                return res.status(400).json({
                    error: 'Invalid event type',
                    validTypes: validEventTypes
                });
            }

            // Upload event data to IPFS
            const eventDataJson = JSON.stringify(eventData);
            const eventDataCid = await ipfsClient.upload(Buffer.from(eventDataJson));

            log.debug('Event data uploaded to IPFS', { eventDataCid, eventType });

            // Calculate required validators based on trust score
            const validatorsRequired = getValidatorsRequired(req.player.trust_score);

            // Create consensus result
            const consensus = await centralLibraryDB.createConsensusResult({
                eventType,
                eventDataCid,
                submitterId: req.playerId,
                worldServerId: worldServerId || null,
                megachunkX: megachunkX || null,
                megachunkY: megachunkY || null,
                megachunkZ: megachunkZ || null
            });

            log.info('Validation requested', {
                consensusId: consensus.consensus_id,
                eventType,
                submitter: req.player.username,
                trustScore: req.player.trust_score,
                validatorsRequired
            });

            res.status(201).json({
                success: true,
                consensus: {
                    consensusId: consensus.consensus_id,
                    eventType,
                    eventDataCid,
                    validatorsRequired,
                    submittedAt: consensus.submitted_at
                }
            });

        } catch (error) {
            log.error('Validation request failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to create validation request',
                message: error.message
            });
        }
    });

    /**
     * POST /api/validation/:consensusId/vote
     * Submit a validation vote
     * Authenticated validators can vote on pending validations
     */
    router.post('/:consensusId/vote', authMiddleware, async (req, res) => {
        try {
            const { consensusId } = req.params;
            const { agrees, computationProof } = req.body;

            // Validation
            if (agrees === undefined) {
                return res.status(400).json({
                    error: 'Missing required field: agrees',
                    message: 'agrees must be true or false'
                });
            }

            // Get consensus result
            const consensus = await centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                return res.status(404).json({
                    error: 'Consensus not found'
                });
            }

            // Check if already resolved
            if (consensus.is_valid !== null) {
                return res.status(400).json({
                    error: 'Consensus already resolved',
                    isValid: consensus.is_valid,
                    resolvedAt: consensus.resolved_at
                });
            }

            // Prevent submitter from validating their own action
            if (consensus.submitter_id === req.playerId) {
                return res.status(403).json({
                    error: 'Cannot validate your own action',
                    message: 'Validators must be different from submitter'
                });
            }

            // Upload computation proof to IPFS if provided
            let proofCid = null;
            if (computationProof) {
                const proofJson = JSON.stringify(computationProof);
                proofCid = await ipfsClient.upload(Buffer.from(proofJson));
            }

            // Record vote
            await centralLibraryDB.recordValidationVote(
                consensusId,
                req.playerId,
                agrees,
                proofCid
            );

            log.info('Validation vote recorded', {
                consensusId,
                validator: req.player.username,
                agrees,
                trustScore: req.player.trust_score
            });

            // Get updated consensus with votes
            const updatedConsensus = await centralLibraryDB.getConsensusResult(consensusId);

            // Count votes
            const votes = updatedConsensus.votes.filter(v => v.validator_id);
            const agreeCount = votes.filter(v => v.agrees).length;
            const disagreeCount = votes.filter(v => !v.agrees).length;
            const totalVotes = votes.length;

            // Check if consensus reached (simple majority for now)
            const requiredValidators = getValidatorsRequired(
                consensus.submitter_id === '00000000-0000-0000-0000-000000000000' ? 1.0 : 0.5
            );

            let consensusReached = false;
            let isValid = null;

            if (totalVotes >= requiredValidators) {
                consensusReached = true;
                isValid = agreeCount > disagreeCount;

                // Update consensus result
                await centralLibraryDB.updateConsensusResult(
                    consensusId,
                    isValid,
                    agreeCount,
                    disagreeCount,
                    proofCid
                );

                log.info('Consensus reached', {
                    consensusId,
                    isValid,
                    agreeCount,
                    disagreeCount
                });
            }

            res.json({
                success: true,
                consensusId,
                vote: {
                    agrees,
                    proofCid
                },
                consensus: {
                    totalVotes,
                    agreeCount,
                    disagreeCount,
                    requiredValidators,
                    consensusReached,
                    isValid
                }
            });

        } catch (error) {
            if (error.code === '23505') { // Unique violation (already voted)
                return res.status(409).json({
                    error: 'Already voted',
                    message: 'You have already submitted a vote for this consensus'
                });
            }

            log.error('Vote submission failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to submit vote',
                message: error.message
            });
        }
    });

    /**
     * GET /api/validation/:consensusId
     * Get consensus result with votes
     */
    router.get('/:consensusId', authMiddleware, async (req, res) => {
        try {
            const { consensusId } = req.params;

            const consensus = await centralLibraryDB.getConsensusResult(consensusId);

            if (!consensus) {
                return res.status(404).json({
                    error: 'Consensus not found'
                });
            }

            // Count votes
            const votes = consensus.votes.filter(v => v.validator_id);
            const agreeCount = votes.filter(v => v.agrees).length;
            const disagreeCount = votes.filter(v => !v.agrees).length;

            res.json({
                consensusId: consensus.consensus_id,
                eventType: consensus.event_type,
                eventDataCid: consensus.event_data_cid,
                submitterId: consensus.submitter_id,
                isValid: consensus.is_valid,
                totalVotes: votes.length,
                agreeCount,
                disagreeCount,
                submittedAt: consensus.submitted_at,
                resolvedAt: consensus.resolved_at,
                votes: votes.map(v => ({
                    validatorId: v.validator_id,
                    agrees: v.agrees,
                    votedAt: v.voted_at
                }))
            });

        } catch (error) {
            log.error('Get consensus failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get consensus'
            });
        }
    });

    /**
     * GET /api/validation/pending
     * Get pending validations (for validators to pick up)
     */
    router.get('/pending', authMiddleware, async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 20;

            // Get unresolved consensus results
            const query = `
                SELECT cr.*,
                       COUNT(vv.vote_id) as current_votes
                FROM consensus_results cr
                LEFT JOIN validation_votes vv ON cr.consensus_id = vv.consensus_id
                WHERE cr.is_valid IS NULL
                  AND cr.submitted_at > NOW() - INTERVAL '1 hour'
                GROUP BY cr.consensus_id
                HAVING COUNT(vv.vote_id) < 5
                ORDER BY cr.submitted_at ASC
                LIMIT $1
            `;

            const result = await centralLibraryDB.pool.query(query, [limit]);

            res.json({
                pending: result.rows,
                count: result.rows.length
            });

        } catch (error) {
            log.error('Get pending validations failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get pending validations'
            });
        }
    });

    /**
     * GET /api/validation/history
     * Get validation history for authenticated player
     */
    router.get('/history', authMiddleware, async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;

            // Get player's validation votes
            const query = `
                SELECT vv.*,
                       cr.event_type,
                       cr.is_valid as consensus_result,
                       cr.resolved_at
                FROM validation_votes vv
                JOIN consensus_results cr ON vv.consensus_id = cr.consensus_id
                WHERE vv.validator_id = $1
                ORDER BY vv.voted_at DESC
                LIMIT $2
            `;

            const result = await centralLibraryDB.pool.query(query, [req.playerId, limit]);

            res.json({
                playerId: req.playerId,
                history: result.rows,
                count: result.rows.length
            });

        } catch (error) {
            log.error('Get validation history failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get validation history'
            });
        }
    });

    return router;
}

// =============================================
// EXPORTS
// =============================================

export default createValidationRoutes;
