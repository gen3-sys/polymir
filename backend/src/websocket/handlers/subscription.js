/**
 * POLYMIR WEBSOCKET SUBSCRIPTION HANDLER
 * =======================================
 * Handles player subscriptions to spatial regions (megachunks, bodies)
 * Implements interest management for efficient network updates
 */

import logger from '../../utils/logger.js';

const log = logger.child('WS:Subscription');

// =============================================
// SUBSCRIPTION HANDLERS
// =============================================

/**
 * Create megachunk subscription handler
 * @param {Object} worldServerDB - World Server database adapter
 * @returns {Function} Handler function
 */
export function createMegachunkSubscribeHandler(worldServerDB) {
    /**
     * Handle 'subscribe_megachunk' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleMegachunkSubscribe(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { megachunkId } = message;

        if (!megachunkId) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing megachunkId'
            });
            return;
        }

        try {
            // Add to client subscriptions
            clientInfo.subscriptions.megachunks.add(megachunkId);

            // Update database subscriptions
            const allMegachunks = Array.from(clientInfo.subscriptions.megachunks);
            const allBodies = Array.from(clientInfo.subscriptions.bodies);

            await worldServerDB.updatePlayerSubscriptions(
                clientInfo.playerId,
                allMegachunks,
                allBodies
            );

            log.debug('Megachunk subscribed', {
                playerId: clientInfo.playerId,
                megachunkId,
                totalSubscriptions: allMegachunks.length
            });

            // Send confirmation
            wsServer.sendToClient(connectionId, {
                type: 'subscription_confirmed',
                subscriptionType: 'megachunk',
                megachunkId,
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Megachunk subscription failed', {
                connectionId,
                megachunkId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Subscription failed',
                message: error.message
            });
        }
    };
}

/**
 * Create megachunk unsubscribe handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createMegachunkUnsubscribeHandler(worldServerDB) {
    /**
     * Handle 'unsubscribe_megachunk' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleMegachunkUnsubscribe(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            return;
        }

        const { megachunkId } = message;

        if (!megachunkId) {
            return;
        }

        try {
            // Remove from subscriptions
            clientInfo.subscriptions.megachunks.delete(megachunkId);

            // Update database
            const allMegachunks = Array.from(clientInfo.subscriptions.megachunks);
            const allBodies = Array.from(clientInfo.subscriptions.bodies);

            await worldServerDB.updatePlayerSubscriptions(
                clientInfo.playerId,
                allMegachunks,
                allBodies
            );

            log.debug('Megachunk unsubscribed', {
                playerId: clientInfo.playerId,
                megachunkId,
                remainingSubscriptions: allMegachunks.length
            });

            wsServer.sendToClient(connectionId, {
                type: 'unsubscription_confirmed',
                subscriptionType: 'megachunk',
                megachunkId,
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Megachunk unsubscription failed', {
                connectionId,
                megachunkId,
                error: error.message
            });
        }
    };
}

/**
 * Create body subscription handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createBodySubscribeHandler(worldServerDB) {
    /**
     * Handle 'subscribe_body' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleBodySubscribe(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { bodyId } = message;

        if (!bodyId) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing bodyId'
            });
            return;
        }

        try {
            // Verify body exists
            const body = await worldServerDB.getCelestialBodyById(bodyId);

            if (!body) {
                wsServer.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Body not found',
                    bodyId
                });
                return;
            }

            // Add to subscriptions
            clientInfo.subscriptions.bodies.add(bodyId);

            // Update database
            const allMegachunks = Array.from(clientInfo.subscriptions.megachunks);
            const allBodies = Array.from(clientInfo.subscriptions.bodies);

            await worldServerDB.updatePlayerSubscriptions(
                clientInfo.playerId,
                allMegachunks,
                allBodies
            );

            log.debug('Body subscribed', {
                playerId: clientInfo.playerId,
                bodyId,
                bodyType: body.body_type,
                totalSubscriptions: allBodies.length
            });

            // Send confirmation with body info
            wsServer.sendToClient(connectionId, {
                type: 'subscription_confirmed',
                subscriptionType: 'body',
                bodyId,
                body: {
                    bodyType: body.body_type,
                    radius: body.radius,
                    position: {
                        x: body.local_x,
                        y: body.local_y,
                        z: body.local_z
                    }
                },
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Body subscription failed', {
                connectionId,
                bodyId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Subscription failed',
                message: error.message
            });
        }
    };
}

/**
 * Create body unsubscribe handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createBodyUnsubscribeHandler(worldServerDB) {
    /**
     * Handle 'unsubscribe_body' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleBodyUnsubscribe(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            return;
        }

        const { bodyId } = message;

        if (!bodyId) {
            return;
        }

        try {
            // Remove from subscriptions
            clientInfo.subscriptions.bodies.delete(bodyId);

            // Update database
            const allMegachunks = Array.from(clientInfo.subscriptions.megachunks);
            const allBodies = Array.from(clientInfo.subscriptions.bodies);

            await worldServerDB.updatePlayerSubscriptions(
                clientInfo.playerId,
                allMegachunks,
                allBodies
            );

            log.debug('Body unsubscribed', {
                playerId: clientInfo.playerId,
                bodyId,
                remainingSubscriptions: allBodies.length
            });

            wsServer.sendToClient(connectionId, {
                type: 'unsubscription_confirmed',
                subscriptionType: 'body',
                bodyId,
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Body unsubscription failed', {
                connectionId,
                bodyId,
                error: error.message
            });
        }
    };
}

/**
 * Create subscription list handler
 * @returns {Function} Handler function
 */
export function createListSubscriptionsHandler() {
    /**
     * Handle 'list_subscriptions' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleListSubscriptions(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const megachunks = Array.from(clientInfo.subscriptions.megachunks);
        const bodies = Array.from(clientInfo.subscriptions.bodies);

        wsServer.sendToClient(connectionId, {
            type: 'subscriptions_list',
            subscriptions: {
                megachunks,
                bodies
            },
            counts: {
                megachunks: megachunks.length,
                bodies: bodies.length,
                total: megachunks.length + bodies.length
            },
            timestamp: Date.now()
        });

        log.debug('Subscriptions listed', {
            playerId: clientInfo.playerId,
            megachunkCount: megachunks.length,
            bodyCount: bodies.length
        });
    };
}

/**
 * Create subscription clear handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createClearSubscriptionsHandler(worldServerDB) {
    /**
     * Handle 'clear_subscriptions' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleClearSubscriptions(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            return;
        }

        try {
            // Clear all subscriptions
            clientInfo.subscriptions.megachunks.clear();
            clientInfo.subscriptions.bodies.clear();

            // Update database
            await worldServerDB.updatePlayerSubscriptions(
                clientInfo.playerId,
                [],
                []
            );

            log.info('Subscriptions cleared', {
                playerId: clientInfo.playerId
            });

            wsServer.sendToClient(connectionId, {
                type: 'subscriptions_cleared',
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Clear subscriptions failed', {
                connectionId,
                error: error.message
            });
        }
    };
}

// =============================================
// HANDLER REGISTRATION
// =============================================

/**
 * Register all subscription handlers
 * @param {Object} wsServer
 * @param {Object} worldServerDB
 */
export function registerSubscriptionHandlers(wsServer, worldServerDB) {
    wsServer.registerHandler('subscribe_megachunk', createMegachunkSubscribeHandler(worldServerDB));
    wsServer.registerHandler('unsubscribe_megachunk', createMegachunkUnsubscribeHandler(worldServerDB));
    wsServer.registerHandler('subscribe_body', createBodySubscribeHandler(worldServerDB));
    wsServer.registerHandler('unsubscribe_body', createBodyUnsubscribeHandler(worldServerDB));
    wsServer.registerHandler('list_subscriptions', createListSubscriptionsHandler());
    wsServer.registerHandler('clear_subscriptions', createClearSubscriptionsHandler(worldServerDB));

    log.info('Subscription handlers registered');
}

// =============================================
// EXPORTS
// =============================================

export default {
    createMegachunkSubscribeHandler,
    createMegachunkUnsubscribeHandler,
    createBodySubscribeHandler,
    createBodyUnsubscribeHandler,
    createListSubscriptionsHandler,
    createClearSubscriptionsHandler,
    registerSubscriptionHandlers
};
