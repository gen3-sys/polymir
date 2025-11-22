/**
 * POLYMIR TEST SETUP
 * ==================
 * Global test configuration and utilities
 */

import { before, after } from 'node:test';
import { poolManager } from '../src/db/pool.js';

// Test database configuration
export const TEST_CONFIG = {
    centralDB: {
        host: process.env.TEST_CENTRAL_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_CENTRAL_DB_PORT || '5432'),
        database: process.env.TEST_CENTRAL_DB_NAME || 'polymir_central_test',
        user: process.env.TEST_CENTRAL_DB_USER || 'postgres',
        password: process.env.TEST_CENTRAL_DB_PASSWORD || 'postgres',
        maxConnections: 5
    },
    worldDB: {
        host: process.env.TEST_WORLD_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_WORLD_DB_PORT || '5432'),
        database: process.env.TEST_WORLD_DB_NAME || 'polymir_world_test',
        user: process.env.TEST_WORLD_DB_USER || 'postgres',
        password: process.env.TEST_WORLD_DB_PASSWORD || 'postgres',
        maxConnections: 5
    }
};

// Mock IPFS client for tests
export class MockIPFSClient {
    constructor() {
        this.storage = new Map();
    }

    async upload(data) {
        const cid = `Qm${Math.random().toString(36).substring(2, 15)}`;
        this.storage.set(cid, data);
        return cid;
    }

    async download(cid) {
        const data = this.storage.get(cid);
        if (!data) {
            throw new Error('CID not found');
        }
        return data;
    }

    async isInitialized() {
        return true;
    }
}

// Mock libp2p node for tests
export class MockLibp2pNode {
    constructor() {
        this.started = false;
        this.pubsub = {
            publish: async () => {},
            subscribe: async () => {},
            unsubscribe: async () => {}
        };
    }

    async start() {
        this.started = true;
    }

    async stop() {
        this.started = false;
    }

    isStarted() {
        return this.started;
    }
}

// Database test helpers
export async function setupTestDatabase(poolConfig, schemaFile) {
    const pool = poolManager.createPool('test', poolConfig);
    await poolManager.initializeAll();

    // Clean database
    const client = await pool.pool.connect();
    try {
        // Drop all tables (in reverse order of dependencies)
        await client.query('DROP SCHEMA IF EXISTS public CASCADE');
        await client.query('CREATE SCHEMA public');
        await client.query('GRANT ALL ON SCHEMA public TO postgres');
        await client.query('GRANT ALL ON SCHEMA public TO public');
    } finally {
        client.release();
    }

    return pool;
}

export async function teardownTestDatabase() {
    await poolManager.closeAll();
}

// Assertion helpers
export function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);

    if (actualStr !== expectedStr) {
        throw new Error(
            `${message || 'Deep equality assertion failed'}\n` +
            `Expected: ${expectedStr}\n` +
            `Actual: ${actualStr}`
        );
    }
}

export function assertThrows(fn, expectedError, message) {
    let thrown = false;
    let error = null;

    try {
        fn();
    } catch (e) {
        thrown = true;
        error = e;
    }

    if (!thrown) {
        throw new Error(message || 'Expected function to throw');
    }

    if (expectedError && !(error instanceof expectedError)) {
        throw new Error(
            `${message || 'Wrong error type'}\n` +
            `Expected: ${expectedError.name}\n` +
            `Actual: ${error.constructor.name}`
        );
    }
}

export async function assertRejects(promise, expectedError, message) {
    let thrown = false;
    let error = null;

    try {
        await promise;
    } catch (e) {
        thrown = true;
        error = e;
    }

    if (!thrown) {
        throw new Error(message || 'Expected promise to reject');
    }

    if (expectedError && !(error instanceof expectedError)) {
        throw new Error(
            `${message || 'Wrong error type'}\n` +
            `Expected: ${expectedError.name}\n` +
            `Actual: ${error.constructor.name}`
        );
    }
}

// Time helpers
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Random data generators
export function randomString(length = 10) {
    return Math.random().toString(36).substring(2, 2 + length);
}

export function randomFloat(min = 0, max = 1) {
    return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

export function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Vector helpers
export function randomVector3() {
    return {
        x: randomFloat(-1000, 1000),
        y: randomFloat(-1000, 1000),
        z: randomFloat(-1000, 1000)
    };
}

export function randomQuaternion() {
    // Generate random unit quaternion
    const u1 = Math.random();
    const u2 = Math.random() * Math.PI * 2;
    const u3 = Math.random() * Math.PI * 2;

    const sqrt1MinusU1 = Math.sqrt(1 - u1);
    const sqrtU1 = Math.sqrt(u1);

    return {
        x: sqrt1MinusU1 * Math.sin(u2),
        y: sqrt1MinusU1 * Math.cos(u2),
        z: sqrtU1 * Math.sin(u3),
        w: sqrtU1 * Math.cos(u3)
    };
}
