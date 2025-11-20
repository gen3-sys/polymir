/**
 * POLYMIR IPFS CLIENT
 * ===================
 * IPFS integration for content-addressed storage
 *
 * What's stored on IPFS:
 * - .mvox schematic files
 * - Modified chunk data
 * - Validation proofs
 * - World snapshots
 */

import { create } from 'ipfs-http-client';
import logger from '../utils/logger.js';

const ipfsLogger = logger.child('IPFS');

// =============================================
// IPFS CLIENT INITIALIZATION
// =============================================

let ipfsClient = null;

/**
 * Initialize IPFS HTTP client
 * @returns {Promise<Object>} IPFS client instance
 */
export async function initializeIPFS() {
    try {
        const host = process.env.IPFS_HOST || 'localhost';
        const port = parseInt(process.env.IPFS_PORT || '5001');
        const protocol = process.env.IPFS_PROTOCOL || 'http';

        ipfsLogger.info('Connecting to IPFS node', { host, port, protocol });

        ipfsClient = create({
            host,
            port,
            protocol
        });

        // Test connection
        const version = await ipfsClient.version();
        ipfsLogger.info('Connected to IPFS', { version: version.version });

        return ipfsClient;
    } catch (error) {
        ipfsLogger.error('Failed to connect to IPFS', { error: error.message });
        throw error;
    }
}

/**
 * Get IPFS client instance
 * @returns {Object} IPFS client
 */
export function getIPFS() {
    if (!ipfsClient) {
        throw new Error('IPFS client not initialized. Call initializeIPFS() first.');
    }
    return ipfsClient;
}

// =============================================
// FILE UPLOAD
// =============================================

/**
 * Upload buffer to IPFS
 * @param {Buffer|Uint8Array} data
 * @param {Object} options - IPFS add options
 * @returns {Promise<{cid: string, size: number}>}
 */
export async function uploadToIPFS(data, options = {}) {
    const client = getIPFS();

    try {
        ipfsLogger.debug('Uploading to IPFS', { size: data.length });

        const result = await client.add(data, {
            pin: true, // Auto-pin uploaded content
            ...options
        });

        const cid = result.cid.toString();
        ipfsLogger.info('Uploaded to IPFS', { cid, size: result.size });

        return {
            cid,
            size: result.size
        };
    } catch (error) {
        ipfsLogger.error('Failed to upload to IPFS', { error: error.message });
        throw error;
    }
}

/**
 * Upload JSON object to IPFS
 * @param {Object} obj - JavaScript object
 * @returns {Promise<{cid: string, size: number}>}
 */
export async function uploadJSONToIPFS(obj) {
    const json = JSON.stringify(obj);
    const buffer = Buffer.from(json, 'utf-8');
    return uploadToIPFS(buffer);
}

/**
 * Upload schematic (.mvox file) to IPFS
 * @param {Buffer} mvoxData - Binary .mvox file data
 * @returns {Promise<{cid: string, size: number}>}
 */
export async function uploadSchematicToIPFS(mvoxData) {
    ipfsLogger.debug('Uploading schematic to IPFS');
    return uploadToIPFS(mvoxData);
}

/**
 * Upload chunk data to IPFS
 * @param {Buffer} chunkData - Compressed chunk voxel data
 * @returns {Promise<{cid: string, size: number}>}
 */
export async function uploadChunkToIPFS(chunkData) {
    ipfsLogger.debug('Uploading chunk to IPFS');
    return uploadToIPFS(chunkData);
}

// =============================================
// FILE DOWNLOAD
// =============================================

/**
 * Download file from IPFS by CID
 * @param {string} cid - IPFS Content ID
 * @param {Object} options - Download options
 * @param {number} options.timeout - Timeout in ms
 * @returns {Promise<Buffer>}
 */
export async function downloadFromIPFS(cid, options = {}) {
    const client = getIPFS();

    try {
        ipfsLogger.debug('Downloading from IPFS', { cid });

        const chunks = [];
        for await (const chunk of client.cat(cid, { timeout: options.timeout || 30000 })) {
            chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);
        ipfsLogger.info('Downloaded from IPFS', { cid, size: buffer.length });

        return buffer;
    } catch (error) {
        ipfsLogger.error('Failed to download from IPFS', { cid, error: error.message });
        throw error;
    }
}

/**
 * Download and parse JSON from IPFS
 * @param {string} cid
 * @returns {Promise<Object>}
 */
export async function downloadJSONFromIPFS(cid) {
    const buffer = await downloadFromIPFS(cid);
    const json = buffer.toString('utf-8');
    return JSON.parse(json);
}

/**
 * Download schematic from IPFS
 * @param {string} cid
 * @returns {Promise<Buffer>} .mvox file data
 */
export async function downloadSchematicFromIPFS(cid) {
    ipfsLogger.debug('Downloading schematic from IPFS', { cid });
    return downloadFromIPFS(cid);
}

/**
 * Download chunk data from IPFS
 * @param {string} cid
 * @returns {Promise<Buffer>} Chunk voxel data
 */
export async function downloadChunkFromIPFS(cid) {
    ipfsLogger.debug('Downloading chunk from IPFS', { cid });
    return downloadFromIPFS(cid);
}

// =============================================
// PINNING
// =============================================

/**
 * Pin content to keep it cached locally
 * @param {string} cid
 * @returns {Promise<void>}
 */
export async function pinContent(cid) {
    const client = getIPFS();

    try {
        ipfsLogger.debug('Pinning content', { cid });
        await client.pin.add(cid);
        ipfsLogger.info('Pinned content', { cid });
    } catch (error) {
        ipfsLogger.error('Failed to pin content', { cid, error: error.message });
        throw error;
    }
}

/**
 * Unpin content to free up space
 * @param {string} cid
 * @returns {Promise<void>}
 */
export async function unpinContent(cid) {
    const client = getIPFS();

    try {
        ipfsLogger.debug('Unpinning content', { cid });
        await client.pin.rm(cid);
        ipfsLogger.info('Unpinned content', { cid });
    } catch (error) {
        ipfsLogger.warn('Failed to unpin content', { cid, error: error.message });
        // Don't throw - unpinning is not critical
    }
}

/**
 * List all pinned CIDs
 * @returns {Promise<Array<string>>}
 */
export async function listPinnedContent() {
    const client = getIPFS();

    try {
        const pins = [];
        for await (const pin of client.pin.ls()) {
            pins.push(pin.cid.toString());
        }
        return pins;
    } catch (error) {
        ipfsLogger.error('Failed to list pinned content', { error: error.message });
        throw error;
    }
}

// =============================================
// CID VALIDATION
// =============================================

/**
 * Check if CID exists on IPFS
 * @param {string} cid
 * @returns {Promise<boolean>}
 */
export async function cidExists(cid) {
    const client = getIPFS();

    try {
        await client.block.stat(cid, { timeout: 5000 });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get file size from CID without downloading
 * @param {string} cid
 * @returns {Promise<number>} Size in bytes
 */
export async function getCIDSize(cid) {
    const client = getIPFS();

    try {
        const stat = await client.block.stat(cid);
        return stat.size;
    } catch (error) {
        ipfsLogger.error('Failed to get CID size', { cid, error: error.message });
        throw error;
    }
}

// =============================================
// BATCHING OPERATIONS
// =============================================

/**
 * Upload multiple files to IPFS
 * @param {Array<{name: string, data: Buffer}>} files
 * @returns {Promise<Array<{name: string, cid: string, size: number}>>}
 */
export async function uploadBatch(files) {
    const client = getIPFS();

    try {
        ipfsLogger.debug('Uploading batch to IPFS', { count: files.length });

        const results = [];
        for await (const result of client.addAll(files, { pin: true })) {
            results.push({
                name: result.path,
                cid: result.cid.toString(),
                size: result.size
            });
        }

        ipfsLogger.info('Uploaded batch to IPFS', { count: results.length });
        return results;
    } catch (error) {
        ipfsLogger.error('Failed to upload batch', { error: error.message });
        throw error;
    }
}

/**
 * Download multiple files from IPFS
 * @param {Array<string>} cids
 * @returns {Promise<Array<{cid: string, data: Buffer}>>}
 */
export async function downloadBatch(cids) {
    ipfsLogger.debug('Downloading batch from IPFS', { count: cids.length });

    const results = await Promise.all(
        cids.map(async (cid) => {
            try {
                const data = await downloadFromIPFS(cid);
                return { cid, data };
            } catch (error) {
                ipfsLogger.warn('Failed to download CID', { cid, error: error.message });
                return { cid, data: null, error: error.message };
            }
        })
    );

    return results;
}

// =============================================
// GARBAGE COLLECTION
// =============================================

/**
 * Run IPFS garbage collection to free up space
 * @returns {Promise<void>}
 */
export async function runGarbageCollection() {
    const client = getIPFS();

    try {
        ipfsLogger.info('Running IPFS garbage collection');
        await client.repo.gc();
        ipfsLogger.info('IPFS garbage collection completed');
    } catch (error) {
        ipfsLogger.error('Failed to run garbage collection', { error: error.message });
        throw error;
    }
}

// =============================================
// EXPORTS
// =============================================

export default {
    initializeIPFS,
    getIPFS,
    uploadToIPFS,
    uploadJSONToIPFS,
    uploadSchematicToIPFS,
    uploadChunkToIPFS,
    downloadFromIPFS,
    downloadJSONFromIPFS,
    downloadSchematicFromIPFS,
    downloadChunkFromIPFS,
    pinContent,
    unpinContent,
    listPinnedContent,
    cidExists,
    getCIDSize,
    uploadBatch,
    downloadBatch,
    runGarbageCollection
};
