/**
 * POLYMIR CORS MIDDLEWARE
 * =======================
 * Cross-Origin Resource Sharing configuration for API endpoints
 * Allows frontend clients to access the API from different origins
 */

import cors from 'cors';
import { logger } from '../../utils/logger.js';

// =============================================
// CORS CONFIGURATION
// =============================================

/**
 * Get allowed origins from environment
 * @returns {Array<string>}
 */
function getAllowedOrigins() {
    const originsEnv = process.env.CORS_ORIGINS || 'http://localhost:8000';
    const origins = originsEnv.split(',').map(origin => origin.trim());

    logger.info('CORS allowed origins', { origins });
    return origins;
}

/**
 * Create CORS middleware with dynamic origin checking
 * @returns {Function} Express middleware
 */
export function createCorsMiddleware() {
    const allowedOrigins = getAllowedOrigins();

    const corsOptions = {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl)
            if (!origin) {
                return callback(null, true);
            }

            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                callback(null, true);
            } else {
                logger.warn('CORS request blocked', { origin, allowedOrigins });
                callback(new Error('Not allowed by CORS'));
            }
        },

        // Allowed HTTP methods
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

        // Allowed headers
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Player-Id',
            'X-Request-Id'
        ],

        // Expose headers to client
        exposedHeaders: [
            'X-Total-Count',
            'X-Page-Count',
            'X-Server-Time'
        ],

        // Allow credentials (cookies, authorization headers)
        credentials: true,

        // Cache preflight response for 1 hour
        maxAge: 3600,

        // Pass CORS preflight response to next handler
        preflightContinue: false,

        // Provide successful OPTIONS status
        optionsSuccessStatus: 204
    };

    return cors(corsOptions);
}

/**
 * Simple CORS middleware for development (allow all)
 * WARNING: Only use in development!
 * @returns {Function} Express middleware
 */
export function createDevCorsMiddleware() {
    logger.warn('Using permissive CORS (development mode)');

    return cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: '*',
        credentials: true,
        maxAge: 3600
    });
}

/**
 * Get appropriate CORS middleware based on environment
 * @returns {Function} Express middleware
 */
export function getCorsMiddleware() {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
        return createDevCorsMiddleware();
    }

    return createCorsMiddleware();
}

// =============================================
// EXPORTS
// =============================================

export default getCorsMiddleware;
