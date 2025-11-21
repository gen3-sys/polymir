/**
 * POLYMIR DATABASE CONNECTION POOL
 * =================================
 * PostgreSQL connection pooling for both Central Library and World Server databases
 * Manages connection lifecycle, health checks, and graceful shutdown
 */

import pg from 'pg';
import logger from '../utils/logger.js';

const { Pool } = pg;

// =============================================
// CONNECTION POOL MANAGER
// =============================================

class DatabasePool {
    constructor(config, poolName = 'DEFAULT') {
        this.poolName = poolName;
        this.config = config;
        this.pool = null;
        this.isInitialized = false;
        this.log = logger.child(`DB:${poolName}`);
    }

    /**
     * Initialize connection pool
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log.warn('Pool already initialized');
            return;
        }

        try {
            this.pool = new Pool({
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                user: this.config.user,
                password: this.config.password,

                // Connection pool settings
                max: this.config.maxConnections || 20,
                min: this.config.minConnections || 2,
                idleTimeoutMillis: this.config.idleTimeout || 30000,
                connectionTimeoutMillis: this.config.connectionTimeout || 5000,

                // Retry settings
                maxUses: this.config.maxUses || 7500,

                // Statement timeout (30 seconds)
                statement_timeout: this.config.statementTimeout || 30000
            });

            // Set up pool event handlers
            this.setupEventHandlers();

            // Test connection
            await this.testConnection();

            this.isInitialized = true;
            this.log.info('Database pool initialized', {
                host: this.config.host,
                database: this.config.database,
                maxConnections: this.config.maxConnections || 20
            });
        } catch (error) {
            this.log.error('Failed to initialize database pool', {
                error: error.message,
                database: this.config.database
            });
            throw error;
        }
    }

    /**
     * Set up pool event handlers
     */
    setupEventHandlers() {
        // Connection acquired from pool
        this.pool.on('acquire', (client) => {
            this.log.trace('Client acquired from pool', {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            });
        });

        // Client returned to pool
        this.pool.on('release', (client) => {
            this.log.trace('Client released to pool', {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount
            });
        });

        // Pool error (non-fatal)
        this.pool.on('error', (err, client) => {
            this.log.error('Unexpected error on idle client', {
                error: err.message,
                stack: err.stack
            });
        });

        // Client connection (successful)
        this.pool.on('connect', (client) => {
            this.log.trace('New client connected to database');
        });

        // Client removal from pool
        this.pool.on('remove', (client) => {
            this.log.trace('Client removed from pool', {
                totalCount: this.pool.totalCount
            });
        });
    }

    /**
     * Test database connection
     * @returns {Promise<boolean>}
     */
    async testConnection() {
        try {
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as time, current_database() as database');
            client.release();

            this.log.debug('Connection test successful', {
                serverTime: result.rows[0].time,
                database: result.rows[0].database
            });

            return true;
        } catch (error) {
            this.log.error('Connection test failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Execute a query with automatic connection management
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query result
     */
    async query(text, params = []) {
        if (!this.isInitialized) {
            throw new Error(`Database pool ${this.poolName} not initialized`);
        }

        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;

            this.log.trace('Query executed', {
                duration: `${duration}ms`,
                rows: result.rowCount,
                command: result.command
            });

            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.log.error('Query failed', {
                error: error.message,
                duration: `${duration}ms`,
                query: text.substring(0, 100)
            });
            throw error;
        }
    }

    /**
     * Execute multiple queries in a transaction
     * @param {Function} callback - Async function that receives a client
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        if (!this.isInitialized) {
            throw new Error(`Database pool ${this.poolName} not initialized`);
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');
            this.log.trace('Transaction BEGIN');

            const result = await callback(client);

            await client.query('COMMIT');
            this.log.trace('Transaction COMMIT');

            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            this.log.warn('Transaction ROLLBACK', {
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get a client from the pool (manual connection management)
     * Remember to call client.release() when done!
     * @returns {Promise<Object>} Database client
     */
    async getClient() {
        if (!this.isInitialized) {
            throw new Error(`Database pool ${this.poolName} not initialized`);
        }

        return await this.pool.connect();
    }

    /**
     * Get pool statistics
     * @returns {Object} Pool stats
     */
    getStats() {
        if (!this.pool) {
            return {
                initialized: false
            };
        }

        return {
            initialized: this.isInitialized,
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount
        };
    }

    /**
     * Gracefully close the pool
     * @returns {Promise<void>}
     */
    async close() {
        if (!this.pool) {
            return;
        }

        try {
            this.log.info('Closing database pool...');
            await this.pool.end();
            this.isInitialized = false;
            this.log.info('Database pool closed');
        } catch (error) {
            this.log.error('Error closing database pool', {
                error: error.message
            });
            throw error;
        }
    }
}

// =============================================
// POOL MANAGER (Singleton)
// =============================================

class PoolManager {
    constructor() {
        this.pools = new Map();
    }

    /**
     * Create and register a database pool
     * @param {string} name - Pool name
     * @param {Object} config - Database configuration
     * @returns {DatabasePool}
     */
    createPool(name, config) {
        if (this.pools.has(name)) {
            logger.warn(`Pool ${name} already exists, returning existing pool`);
            return this.pools.get(name);
        }

        const pool = new DatabasePool(config, name);
        this.pools.set(name, pool);

        logger.info(`Pool ${name} created`);
        return pool;
    }

    /**
     * Get a registered pool
     * @param {string} name - Pool name
     * @returns {DatabasePool}
     */
    getPool(name) {
        const pool = this.pools.get(name);
        if (!pool) {
            throw new Error(`Pool ${name} not found`);
        }
        return pool;
    }

    /**
     * Initialize all registered pools
     * @returns {Promise<void>}
     */
    async initializeAll() {
        logger.info('Initializing all database pools...');

        const initPromises = Array.from(this.pools.values()).map(pool =>
            pool.initialize()
        );

        await Promise.all(initPromises);

        logger.info(`All ${this.pools.size} pools initialized`);
    }

    /**
     * Get statistics for all pools
     * @returns {Object}
     */
    getAllStats() {
        const stats = {};
        for (const [name, pool] of this.pools) {
            stats[name] = pool.getStats();
        }
        return stats;
    }

    /**
     * Close all pools gracefully
     * @returns {Promise<void>}
     */
    async closeAll() {
        logger.info('Closing all database pools...');

        const closePromises = Array.from(this.pools.values()).map(pool =>
            pool.close()
        );

        await Promise.all(closePromises);

        this.pools.clear();
        logger.info('All database pools closed');
    }
}

// =============================================
// SINGLETON INSTANCE
// =============================================

export const poolManager = new PoolManager();

// =============================================
// EXPORTS
// =============================================

export { DatabasePool, PoolManager };
export default poolManager;
