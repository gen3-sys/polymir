/**
 * POLYMIR PLAYER API ROUTES
 * ==========================
 * REST API endpoints for player registration, authentication, and trust queries
 */

import express from 'express';
import { hashPassword, verifyPassword } from '../middleware/auth.js';
import logger from '../../utils/logger.js';

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
     * Register a new player with optional passphrase (IRC-style)
     * - With passphrase: Protected username, must use passphrase to login
     * - Without passphrase: Guest mode, anyone can reclaim the name
     */
    router.post('/register', async (req, res) => {
        try {
            const { username, password } = req.body;

            // Username is required
            if (!username) {
                return res.status(400).json({
                    error: 'Missing username',
                    required: ['username']
                });
            }

            if (username.length < 3 || username.length > 32) {
                return res.status(400).json({
                    error: 'Invalid username',
                    message: 'Username must be 3-32 characters'
                });
            }

            if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
                return res.status(400).json({
                    error: 'Invalid username',
                    message: 'Only letters, numbers, underscore, and hyphen allowed'
                });
            }

            // Check if username exists
            const existing = await centralLibraryDB.getPlayerByUsername(username);

            if (existing) {
                // Username exists - check if it has a password
                if (existing.password_hash) {
                    return res.status(409).json({
                        error: 'Username protected',
                        message: 'This username is protected by a passphrase. Use /login instead.'
                    });
                } else {
                    // Guest account - let them reclaim it
                    log.info('Guest username reclaimed', {
                        playerId: existing.player_id,
                        username: existing.username
                    });

                    return res.json({
                        success: true,
                        player: {
                            playerId: existing.player_id,
                            username: existing.username,
                            trustScore: existing.trust_score,
                            isGuest: true
                        }
                    });
                }
            }

            // New username - create player
            // If password provided, hash it; otherwise null for guest
            let passwordHash = null;
            if (password && password.length > 0) {
                if (password.length < 6) {
                    return res.status(400).json({
                        error: 'Invalid passphrase',
                        message: 'Passphrase must be at least 6 characters'
                    });
                }
                passwordHash = await hashPassword(password);
            }

            const player = await centralLibraryDB.createPlayer(username, passwordHash);

            log.info('Player registered', {
                playerId: player.player_id,
                username: player.username,
                isGuest: !passwordHash
            });

            res.status(201).json({
                success: true,
                player: {
                    playerId: player.player_id,
                    username: player.username,
                    trustScore: player.trust_score,
                    createdAt: player.created_at,
                    isGuest: !passwordHash
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
     * Authenticate player (IRC-style)
     * - If username has no passphrase: Allow login without password
     * - If username has passphrase: Require correct password
     */
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username) {
                return res.status(400).json({
                    error: 'Missing username',
                    required: ['username']
                });
            }

            // Get player
            const player = await centralLibraryDB.getPlayerByUsername(username);

            if (!player) {
                return res.status(401).json({
                    error: 'User not found',
                    message: 'Username does not exist. Use /register to create it.'
                });
            }

            // Check if account is protected by passphrase
            if (player.password_hash) {
                // Protected account - require password
                if (!password) {
                    return res.status(401).json({
                        error: 'Passphrase required',
                        message: 'This username is protected by a passphrase'
                    });
                }

                const isValid = await verifyPassword(password, player.password_hash);

                if (!isValid) {
                    return res.status(401).json({
                        error: 'Invalid passphrase',
                        message: 'Incorrect passphrase for this username'
                    });
                }
            }
            // else: Guest account, no password needed

            log.info('Player logged in', {
                playerId: player.player_id,
                username: player.username,
                isGuest: !player.password_hash
            });

            res.json({
                success: true,
                player: {
                    playerId: player.player_id,
                    username: player.username,
                    trustScore: player.trust_score,
                    lastActive: player.last_active,
                    isGuest: !player.password_hash
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
     * POST /api/players/set-passphrase
     * Set or update passphrase for current user (converts guest to protected)
     */
    router.post('/set-passphrase', authMiddleware, async (req, res) => {
        try {
            const { playerId } = req;
            const { currentPassword, newPassword } = req.body;

            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({
                    error: 'Invalid passphrase',
                    message: 'New passphrase must be at least 6 characters'
                });
            }

            const player = await centralLibraryDB.getPlayerById(playerId);

            if (!player) {
                return res.status(404).json({ error: 'Player not found' });
            }

            // If already has password, verify current password
            if (player.password_hash) {
                if (!currentPassword) {
                    return res.status(400).json({
                        error: 'Current passphrase required',
                        message: 'Must provide current passphrase to change it'
                    });
                }

                const isValid = await verifyPassword(currentPassword, player.password_hash);
                if (!isValid) {
                    return res.status(401).json({
                        error: 'Invalid current passphrase'
                    });
                }
            }

            // Hash and set new password
            const passwordHash = await hashPassword(newPassword);
            await centralLibraryDB.updatePlayerPassword(playerId, passwordHash);

            log.info('Player passphrase updated', {
                playerId,
                username: player.username,
                wasGuest: !player.password_hash
            });

            res.json({
                success: true,
                message: player.password_hash
                    ? 'Passphrase updated'
                    : 'Passphrase set - your username is now protected'
            });

        } catch (error) {
            log.error('Set passphrase failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to set passphrase',
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
