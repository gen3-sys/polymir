/**
 * POLYMIR BACKEND SERVER
 * ======================
 * Main server entry point - orchestrates all backend systems
 * Handles initialization, shutdown, and system lifecycle
 */

import express from 'express';
import { config, logConfigSummary } from './config.js';
import logger from './utils/logger.js';
import { poolManager } from './db/pool.js';
import { CentralLibraryDB } from './db/centralLibrary.js';
import { WorldServerDB } from './db/worldServer.js';
import { initializeIPFS, getIPFS } from './ipfs/client.js';
import { initializeLibp2p, getLibp2p } from './libp2p/node.js';
import { ValidationOrchestrator } from './validation/validator.js';
import { registerValidationHandlers } from './validation/handlers.js';
import { BodyPhysicsSystem } from './physics/bodyPhysics.js';
import { PolymirWebSocketServer } from './websocket/server.js';
import { registerConnectionHandlers } from './websocket/handlers/connection.js';
import { registerPositionHandlers } from './websocket/handlers/position.js';
import { registerSubscriptionHandlers } from './websocket/handlers/subscription.js';
import { registerValidationHandlers as registerWsValidationHandlers } from './websocket/handlers/validation.js';
import { registerDamageHandlers } from './websocket/handlers/damage.js';
import { registerShipHandlers } from './websocket/handlers/ships.js';
import { getCorsMiddleware } from './api/middleware/cors.js';
import { createAuthMiddleware, requireTrustScore } from './api/middleware/auth.js';
import { createPlayerRoutes } from './api/routes/players.js';
import { createSchematicRoutes } from './api/routes/schematics.js';
import { createValidationRoutes } from './api/routes/validation.js';

const log = logger.child('Server');

// =============================================
// SERVER STATE
// =============================================

const serverState = {
    isInitialized: false,
    isShuttingDown: false,
    startTime: null,

    // System references
    centralPool: null,
    worldPool: null,
    centralLibraryDB: null,
    worldServerDB: null,
    ipfsClient: null,
    libp2pNode: null,
    validationOrchestrator: null,
    expressApp: null,
    httpServer: null,
    wsServer: null,
    physicsSystem: null
};

// =============================================
// INITIALIZATION
// =============================================

/**
 * Initialize all backend systems
 */
async function initialize() {
    try {
        log.info('='.repeat(60));
        log.info('POLYMIR BACKEND SERVER STARTING');
        log.info('='.repeat(60));

        logConfigSummary();

        // =============================================
        // STEP 1: Initialize database connection pools
        // =============================================
        log.info('Step 1/9: Initializing database pools...');

        serverState.centralPool = poolManager.createPool('CENTRAL_LIBRARY', {
            host: config.centralDB.host,
            port: config.centralDB.port,
            database: config.centralDB.database,
            user: config.centralDB.user,
            password: config.centralDB.password,
            maxConnections: config.centralDB.maxConnections,
            minConnections: config.centralDB.minConnections,
            idleTimeout: config.centralDB.idleTimeout,
            connectionTimeout: config.centralDB.connectionTimeout
        });

        serverState.worldPool = poolManager.createPool('WORLD_SERVER', {
            host: config.worldDB.host,
            port: config.worldDB.port,
            database: config.worldDB.database,
            user: config.worldDB.user,
            password: config.worldDB.password,
            maxConnections: config.worldDB.maxConnections,
            minConnections: config.worldDB.minConnections,
            idleTimeout: config.worldDB.idleTimeout,
            connectionTimeout: config.worldDB.connectionTimeout
        });

        await poolManager.initializeAll();

        // =============================================
        // STEP 2: Initialize IPFS client
        // =============================================
        log.info('Step 2/9: Initializing IPFS client...');

        try {
            await initializeIPFS({
                host: config.ipfs.host,
                port: config.ipfs.port,
                protocol: config.ipfs.protocol
            });
            serverState.ipfsClient = getIPFS();
            log.info('IPFS client initialized');
        } catch (error) {
            log.warn('IPFS initialization failed (optional)', { error: error.message });
            serverState.ipfsClient = null; // IPFS is optional
        }

        // =============================================
        // STEP 3: Initialize libp2p node
        // =============================================
        log.info('Step 3/9: Initializing libp2p node...');

        try {
            await initializeLibp2p({
                listenAddresses: [
                    config.libp2p.listenTcp,
                    config.libp2p.listenWs
                ],
                announceAddresses: [config.libp2p.announceAddr],
                bootstrapNodes: config.libp2p.bootstrapNodes
            });
            serverState.libp2pNode = getLibp2p();
            log.info('libp2p node initialized');
        } catch (error) {
            log.warn('libp2p initialization failed (optional)', { error: error.message });
            serverState.libp2pNode = null; // libp2p is optional
        }

        // =============================================
        // STEP 4: Create database adapters
        // =============================================
        log.info('Step 4/9: Creating database adapters...');

        serverState.centralLibraryDB = new CentralLibraryDB(serverState.centralPool);
        serverState.worldServerDB = new WorldServerDB(serverState.worldPool);

        // =============================================
        // STEP 5: Initialize validation orchestrator
        // =============================================
        log.info('Step 5/9: Initializing validation orchestrator...');

        serverState.validationOrchestrator = new ValidationOrchestrator(
            serverState.centralLibraryDB,
            serverState.ipfsClient,
            serverState.libp2pNode
        );

        // Register libp2p validation handlers
        registerValidationHandlers(
            serverState.libp2pNode,
            serverState.validationOrchestrator,
            serverState.centralLibraryDB,
            serverState.ipfsClient
        );

        // =============================================
        // STEP 6: Initialize Express REST API
        // =============================================
        log.info('Step 6/9: Initializing REST API...');

        serverState.expressApp = express();

        // Middleware
        serverState.expressApp.use(express.json({ limit: '50mb' }));
        serverState.expressApp.use(getCorsMiddleware());

        // Health check endpoint
        serverState.expressApp.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: Date.now() - serverState.startTime,
                version: '1.0.0-alpha',
                serverId: config.server.id,
                serverName: config.server.name,
                database: poolManager.getAllStats(),
                physics: serverState.physicsSystem?.getStats(),
                websocket: serverState.wsServer?.getStats()
            });
        });

        // API routes
        const authMiddleware = createAuthMiddleware(serverState.centralLibraryDB);

        serverState.expressApp.use('/api/players',
            createPlayerRoutes(serverState.centralLibraryDB, authMiddleware)
        );

        serverState.expressApp.use('/api/schematics',
            createSchematicRoutes(
                serverState.centralLibraryDB,
                serverState.ipfsClient,
                authMiddleware,
                requireTrustScore
            )
        );

        serverState.expressApp.use('/api/validation',
            createValidationRoutes(
                serverState.centralLibraryDB,
                serverState.ipfsClient,
                authMiddleware
            )
        );

        // 404 handler
        serverState.expressApp.use((req, res) => {
            res.status(404).json({
                error: 'Not found',
                path: req.path
            });
        });

        // Error handler
        serverState.expressApp.use((err, req, res, next) => {
            log.error('Express error', {
                error: err.message,
                stack: err.stack,
                path: req.path
            });

            res.status(500).json({
                error: 'Internal server error',
                message: config.isDevelopment() ? err.message : 'An error occurred'
            });
        });

        // Start HTTP server
        serverState.httpServer = serverState.expressApp.listen(config.api.port, config.api.host, () => {
            log.info(`REST API listening on ${config.api.url}`);
        });

        // =============================================
        // STEP 7: Initialize WebSocket server
        // =============================================
        log.info('Step 7/9: Initializing WebSocket server...');

        serverState.wsServer = new PolymirWebSocketServer({
            port: config.websocket.port,
            host: config.websocket.host,
            pingInterval: config.websocket.pingInterval,
            pingTimeout: config.websocket.pingTimeout,
            maxConnections: config.websocket.maxConnections
        });

        await serverState.wsServer.initialize();

        // Register WebSocket handlers
        registerConnectionHandlers(
            serverState.wsServer,
            serverState.centralLibraryDB,
            serverState.worldServerDB
        );

        registerPositionHandlers(
            serverState.wsServer,
            serverState.worldServerDB
        );

        registerSubscriptionHandlers(
            serverState.wsServer,
            serverState.worldServerDB
        );

        registerWsValidationHandlers(
            serverState.wsServer,
            serverState.centralLibraryDB
        );

        registerDamageHandlers(
            serverState.wsServer,
            serverState.worldServerDB
        );

        registerShipHandlers(
            serverState.wsServer,
            serverState.worldServerDB
        );

        log.info(`WebSocket server listening on ${config.websocket.url}`);

        // =============================================
        // STEP 8: Initialize physics system
        // =============================================
        log.info('Step 8/9: Initializing physics system...');

        serverState.physicsSystem = new BodyPhysicsSystem(
            serverState.worldServerDB,
            serverState.wsServer
        );

        serverState.physicsSystem.start();

        // =============================================
        // STEP 9: Register server in central library
        // =============================================
        log.info('Step 9/9: Registering server in central library...');

        // Generate peer ID - use libp2p peerId if available, otherwise use server ID
        const libp2pPeerId = serverState.libp2pNode
            ? serverState.libp2pNode.peerId.toString()
            : `local-${config.server.id}`; // Fallback for local development

        await serverState.centralLibraryDB.registerServer({
            serverId: config.server.id,
            serverName: config.server.name,
            libp2pPeerId,
            rulesetHash: config.server.rulesetHash,
            positionX: config.server.position.x,
            positionY: config.server.position.y,
            positionZ: config.server.position.z,
            apiUrl: config.api.url,
            websocketUrl: config.websocket.url
        });

        // Start heartbeat
        setInterval(async () => {
            try {
                await serverState.centralLibraryDB.updateServerHeartbeat(config.server.id);
            } catch (error) {
                log.error('Heartbeat failed', { error: error.message });
            }
        }, 30000); // Every 30 seconds

        // =============================================
        // Initialization complete
        // =============================================
        serverState.isInitialized = true;
        serverState.startTime = Date.now();

        log.info('='.repeat(60));
        log.info('POLYMIR BACKEND SERVER READY');
        log.info('='.repeat(60));
        log.info(`Server ID: ${config.server.id}`);
        log.info(`Server Name: ${config.server.name}`);
        log.info(`REST API: ${config.api.url}`);
        log.info(`WebSocket: ${config.websocket.url}`);
        if (serverState.libp2pNode) {
            log.info(`libp2p Peer ID: ${serverState.libp2pNode.peerId.toString()}`);
        } else {
            log.info(`libp2p: Not available (local development mode)`);
        }
        log.info('='.repeat(60));

    } catch (error) {
        log.error('Initialization failed', {
            error: error.message,
            stack: error.stack
        });

        // Cleanup partially initialized systems
        await shutdown(1);
    }
}

// =============================================
// SHUTDOWN
// =============================================

/**
 * Graceful shutdown of all systems
 * @param {number} exitCode - Process exit code
 */
async function shutdown(exitCode = 0) {
    // Prevent multiple shutdown attempts
    if (serverState.isShuttingDown) {
        log.warn('Shutdown already in progress');
        return;
    }

    serverState.isShuttingDown = true;

    log.info('='.repeat(60));
    log.info('POLYMIR BACKEND SERVER SHUTTING DOWN');
    log.info('='.repeat(60));

    try {
        // Shutdown in reverse order of initialization

        // Stop physics system
        if (serverState.physicsSystem) {
            log.info('Stopping physics system...');
            serverState.physicsSystem.stop();
        }

        // Close WebSocket server
        if (serverState.wsServer) {
            log.info('Closing WebSocket server...');
            await serverState.wsServer.close();
        }

        // Close HTTP server
        if (serverState.httpServer) {
            log.info('Closing HTTP server...');
            await new Promise((resolve) => {
                serverState.httpServer.close(() => resolve());
            });
        }

        // Stop libp2p node
        if (serverState.libp2pNode) {
            log.info('Stopping libp2p node...');
            await serverState.libp2pNode.stop();
        }

        // Close database pools
        if (poolManager) {
            log.info('Closing database pools...');
            await poolManager.closeAll();
        }

        log.info('='.repeat(60));
        log.info('POLYMIR BACKEND SERVER STOPPED');
        log.info('='.repeat(60));

    } catch (error) {
        log.error('Error during shutdown', {
            error: error.message,
            stack: error.stack
        });
        exitCode = 1;
    }

    process.exit(exitCode);
}

// =============================================
// SIGNAL HANDLERS
// =============================================

// Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
    log.info('SIGTERM received');
    shutdown(0);
});

// Graceful shutdown on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    log.info('SIGINT received');
    shutdown(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
    });
    shutdown(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
    });
    shutdown(1);
});

// =============================================
// START SERVER
// =============================================

// Start initialization
initialize().catch((error) => {
    log.error('Failed to start server', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

// =============================================
// EXPORTS (for testing)
// =============================================

export { serverState, initialize, shutdown };
