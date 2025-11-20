/**
 * POLYMIR AUTHENTICATION MIDDLEWARE
 * ==================================
 * JWT-style authentication and player verification
 * Note: Using basic player ID auth for now, can be extended to JWT/OAuth
 */

import bcrypt from 'bcrypt';
import { logger } from '../../utils/logger.js';

// =============================================
// AUTHENTICATION HELPERS
// =============================================

/**
 * Hash password using bcrypt
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// =============================================
// AUTHENTICATION MIDDLEWARE
// =============================================

/**
 * Middleware to authenticate requests
 * Expects X-Player-Id header or Authorization header
 * @param {Object} centralLibraryDB - Database adapter
 * @returns {Function} Express middleware
 */
export function createAuthMiddleware(centralLibraryDB) {
    return async (req, res, next) => {
        try {
            // Extract player ID from headers
            const playerId = req.headers['x-player-id'];
            const authHeader = req.headers['authorization'];

            // No authentication provided
            if (!playerId && !authHeader) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Provide X-Player-Id or Authorization header'
                });
            }

            // Simple player ID authentication
            if (playerId) {
                const player = await centralLibraryDB.getPlayerById(playerId);

                if (!player) {
                    return res.status(401).json({
                        error: 'Invalid player ID',
                        message: 'Player not found'
                    });
                }

                // Attach player to request
                req.player = player;
                req.playerId = playerId;

                logger.trace('Player authenticated', {
                    playerId,
                    username: player.username
                });

                return next();
            }

            // Bearer token authentication (future: JWT)
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);

                // TODO: Implement JWT verification
                // For now, treat token as player ID
                const player = await centralLibraryDB.getPlayerById(token);

                if (!player) {
                    return res.status(401).json({
                        error: 'Invalid token',
                        message: 'Authentication failed'
                    });
                }

                req.player = player;
                req.playerId = player.player_id;

                return next();
            }

            // Invalid authentication format
            return res.status(401).json({
                error: 'Invalid authentication',
                message: 'Unsupported authentication method'
            });

        } catch (error) {
            logger.error('Authentication error', {
                error: error.message,
                path: req.path
            });

            return res.status(500).json({
                error: 'Authentication failed',
                message: 'Internal server error'
            });
        }
    };
}

/**
 * Middleware to check minimum trust score
 * Must be used after authentication middleware
 * @param {number} minTrustScore - Minimum required trust score (0.0 to 1.0)
 * @returns {Function} Express middleware
 */
export function requireTrustScore(minTrustScore) {
    return (req, res, next) => {
        if (!req.player) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Player not authenticated'
            });
        }

        if (req.player.trust_score < minTrustScore) {
            return res.status(403).json({
                error: 'Insufficient trust score',
                message: `Required: ${minTrustScore}, Current: ${req.player.trust_score}`,
                requiredTrustScore: minTrustScore,
                currentTrustScore: req.player.trust_score
            });
        }

        next();
    };
}

/**
 * Optional authentication middleware
 * Attaches player if authenticated, but doesn't require it
 * @param {Object} centralLibraryDB
 * @returns {Function} Express middleware
 */
export function optionalAuth(centralLibraryDB) {
    return async (req, res, next) => {
        try {
            const playerId = req.headers['x-player-id'];

            if (playerId) {
                const player = await centralLibraryDB.getPlayerById(playerId);
                if (player) {
                    req.player = player;
                    req.playerId = playerId;
                }
            }

            next();
        } catch (error) {
            // Don't fail request if optional auth fails
            logger.warn('Optional auth failed', { error: error.message });
            next();
        }
    };
}

/**
 * Middleware to verify player owns a resource
 * @param {string} resourceField - Field name containing owner ID (e.g., 'creator_id')
 * @returns {Function} Express middleware
 */
export function requireOwnership(resourceField = 'creator_id') {
    return (req, res, next) => {
        if (!req.player) {
            return res.status(401).json({
                error: 'Authentication required'
            });
        }

        // Resource owner ID from body, params, or query
        const resourceOwnerId = req.body[resourceField] ||
                               req.params[resourceField] ||
                               req.query[resourceField];

        if (!resourceOwnerId) {
            return res.status(400).json({
                error: 'Missing resource owner',
                message: `Field ${resourceField} not found`
            });
        }

        if (resourceOwnerId !== req.playerId) {
            return res.status(403).json({
                error: 'Permission denied',
                message: 'You do not own this resource'
            });
        }

        next();
    };
}

/**
 * Rate limiting helper (simple in-memory implementation)
 * For production, use Redis-backed rate limiter
 */
class SimpleRateLimiter {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map();
    }

    isRateLimited(identifier) {
        const now = Date.now();
        const userRequests = this.requests.get(identifier) || [];

        // Remove old requests outside the window
        const validRequests = userRequests.filter(time => now - time < this.windowMs);

        if (validRequests.length >= this.maxRequests) {
            return true;
        }

        // Add current request
        validRequests.push(now);
        this.requests.set(identifier, validRequests);

        return false;
    }

    cleanup() {
        const now = Date.now();
        for (const [identifier, requests] of this.requests.entries()) {
            const validRequests = requests.filter(time => now - time < this.windowMs);
            if (validRequests.length === 0) {
                this.requests.delete(identifier);
            } else {
                this.requests.set(identifier, validRequests);
            }
        }
    }
}

/**
 * Create rate limiting middleware
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Express middleware
 */
export function createRateLimiter(maxRequests = 100, windowMs = 60000) {
    const limiter = new SimpleRateLimiter(maxRequests, windowMs);

    // Cleanup every minute
    setInterval(() => limiter.cleanup(), 60000);

    return (req, res, next) => {
        const identifier = req.playerId || req.ip;

        if (limiter.isRateLimited(identifier)) {
            logger.warn('Rate limit exceeded', {
                identifier,
                path: req.path,
                maxRequests,
                windowMs
            });

            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: `Maximum ${maxRequests} requests per ${windowMs / 1000} seconds`,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        next();
    };
}

// =============================================
// EXPORTS
// =============================================

export default {
    createAuthMiddleware,
    requireTrustScore,
    optionalAuth,
    requireOwnership,
    createRateLimiter,
    hashPassword,
    verifyPassword
};
