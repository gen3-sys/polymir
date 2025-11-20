/**
 * POLYMIR PLAYER API ROUTES
 * ==========================
 * REST API endpoints for player registration, authentication, and trust queries
 */

import express from 'express';
import { hashPassword, verifyPassword } from '../middleware/auth.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// =============================================
// PLAYER ROUTES FACTORY
// =============================================

/**
 * Create player routes with database dependency injection
 * @param {Object} centralLibraryDB - Central Library database adapter
 * @param {Function} authMiddleware - Authentication middleware
 * @returns {Router} Express router
 */
export function createPlayerRoutes(centralLibraryDB, authMiddleware) {
    const log = logger.child('API:Players');

    // =============================================
    // PUBLIC ROUTES (No authentication required)
    // =============================================

    /**
     * POST /api/players/register
     * Register a new player
     */
    router.post('/register', async (req, res) => {
        try {
            const { username, password } = req.body;

            // Validation
            if (!username || !password) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['username', 'password']
                });
            }

            if (username.length < 3 || username.length > 32) {
                return res.status(400).json({
                    error: 'Invalid username',
                    message: 'Username must be 3-32 characters'
                });
            }

            if (password.length < 8) {
                return res.status(400).json({
                    error: 'Invalid password',
                    message: 'Password must be at least 8 characters'
                });
            }

            // Hash password
            const passwordHash = await hashPassword(password);

            // Create player
            const player = await centralLibraryDB.createPlayer(username, passwordHash);

            log.info('Player registered', {
                playerId: player.player_id,
                username: player.username
            });

            res.status(201).json({
                success: true,
                player: {
                    playerId: player.player_id,
                    username: player.username,
                    trustScore: player.trust_score,
                    createdAt: player.created_at
                }
            });

        } catch (error) {
            if (error.message.includes('already exists')) {
                return res.status(409).json({
                    error: 'Username taken',
                    message: error.message
                });
            }

            log.error('Registration failed', { error: error.message });
            res.status(500).json({
                error: 'Registration failed',
                message: 'Internal server error'
            });
        }
    });

    /**
     * POST /api/players/login
     * Authenticate player and get player ID
     */
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    error: 'Missing credentials',
                    required: ['username', 'password']
                });
            }

            // Get player
            const player = await centralLibraryDB.getPlayerByUsername(username);

            if (!player) {
                return res.status(401).json({
                    error: 'Invalid credentials',
                    message: 'Username or password incorrect'
                });
            }

            // Verify password
            const isValid = await verifyPassword(password, player.password_hash);

            if (!isValid) {
                return res.status(401).json({
                    error: 'Invalid credentials',
                    message: 'Username or password incorrect'
                });
            }

            log.info('Player logged in', {
                playerId: player.player_id,
                username: player.username
            });

            res.json({
                success: true,
                player: {
                    playerId: player.player_id,
                    username: player.username,
                    trustScore: player.trust_score,
                    lastActive: player.last_active
                }
            });

        } catch (error) {
            log.error('Login failed', { error: error.message });
            res.status(500).json({
                error: 'Login failed',
                message: 'Internal server error'
            });
        }
    });

    /**
     * GET /api/players/:playerId
     * Get public player profile
     */
    router.get('/:playerId', async (req, res) => {
        try {
            const { playerId } = req.params;

            const player = await centralLibraryDB.getPlayerById(playerId);

            if (!player) {
                return res.status(404).json({
                    error: 'Player not found'
                });
            }

            // Return public profile (no password hash)
            res.json({
                playerId: player.player_id,
                username: player.username,
                trustScore: player.trust_score,
                validationsSubmitted: player.validations_submitted,
                validationsCorrect: player.validations_correct,
                createdAt: player.created_at,
                lastActive: player.last_active
            });

        } catch (error) {
            log.error('Get player failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get player'
            });
        }
    });

    /**
     * GET /api/players/username/:username
     * Get player by username
     */
    router.get('/username/:username', async (req, res) => {
        try {
            const { username } = req.params;

            const player = await centralLibraryDB.getPlayerByUsername(username);

            if (!player) {
                return res.status(404).json({
                    error: 'Player not found'
                });
            }

            res.json({
                playerId: player.player_id,
                username: player.username,
                trustScore: player.trust_score,
                validationsSubmitted: player.validations_submitted,
                validationsCorrect: player.validations_correct,
                createdAt: player.created_at,
                lastActive: player.last_active
            });

        } catch (error) {
            log.error('Get player by username failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get player'
            });
        }
    });

    // =============================================
    // AUTHENTICATED ROUTES
    // =============================================

    /**
     * GET /api/players/me
     * Get current authenticated player's profile
     */
    router.get('/me', authMiddleware, async (req, res) => {
        try {
            res.json({
                playerId: req.player.player_id,
                username: req.player.username,
                trustScore: req.player.trust_score,
                validationsSubmitted: req.player.validations_submitted,
                validationsCorrect: req.player.validations_correct,
                validationsIncorrect: req.player.validations_incorrect,
                createdAt: req.player.created_at,
                lastActive: req.player.last_active
            });
        } catch (error) {
            log.error('Get profile failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get profile'
            });
        }
    });

    /**
     * GET /api/players/me/trust-history
     * Get authenticated player's trust history
     */
    router.get('/me/trust-history', authMiddleware, async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;

            const history = await centralLibraryDB.getPlayerTrustHistory(
                req.playerId,
                limit
            );

            res.json({
                playerId: req.playerId,
                history
            });

        } catch (error) {
            log.error('Get trust history failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get trust history'
            });
        }
    });

    /**
     * GET /api/players/leaderboard
     * Get trust leaderboard
     */
    router.get('/leaderboard', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;

            const leaderboard = await centralLibraryDB.getTrustLeaderboard(limit);

            res.json({
                leaderboard,
                count: leaderboard.length
            });

        } catch (error) {
            log.error('Get leaderboard failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get leaderboard'
            });
        }
    });

    return router;
}

// =============================================
// EXPORTS
// =============================================

export default createPlayerRoutes;
