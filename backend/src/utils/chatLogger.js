/**
 * POLYMIR CHAT LOGGER
 * ===================
 * Rotating file logger for chat messages with soft handover
 * Prevents log files from growing too large while preserving history
 */

import fs from 'fs';
import path from 'path';

// =============================================
// CONFIGURATION
// =============================================

const DEFAULT_CONFIG = {
    logDir: './logs/chat',
    maxFileSize: 5 * 1024 * 1024, // 5MB per file
    maxFiles: 10,                  // Keep last 10 files
    flushInterval: 5000,           // Flush to disk every 5 seconds
    filePrefix: 'chat'
};

// =============================================
// CHAT LOGGER CLASS
// =============================================

export class ChatLogger {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.currentFile = null;
        this.currentStream = null;
        this.currentSize = 0;
        this.buffer = [];
        this.flushTimer = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the logger - create log directory and open first file
     */
    async initialize() {
        if (this.isInitialized) return;

        // Ensure log directory exists
        await fs.promises.mkdir(this.config.logDir, { recursive: true });

        // Open initial log file
        await this.rotateFile();

        // Start periodic flush
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.config.flushInterval);

        this.isInitialized = true;
    }

    /**
     * Generate filename with timestamp
     * @returns {string}
     */
    generateFilename() {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .slice(0, 19);
        return `${this.config.filePrefix}_${timestamp}.log`;
    }

    /**
     * Rotate to a new log file (soft handover)
     */
    async rotateFile() {
        // Flush any pending writes
        await this.flush();

        // Close current stream
        if (this.currentStream) {
            await new Promise((resolve, reject) => {
                this.currentStream.end(() => resolve());
            });
        }

        // Create new file
        const filename = this.generateFilename();
        this.currentFile = path.join(this.config.logDir, filename);
        this.currentStream = fs.createWriteStream(this.currentFile, { flags: 'a' });
        this.currentSize = 0;

        // Write header
        const header = `\n=== Chat Log Started: ${new Date().toISOString()} ===\n\n`;
        this.currentStream.write(header);
        this.currentSize += Buffer.byteLength(header);

        // Clean up old files
        await this.cleanupOldFiles();
    }

    /**
     * Remove old log files beyond maxFiles limit
     */
    async cleanupOldFiles() {
        try {
            const files = await fs.promises.readdir(this.config.logDir);
            const logFiles = files
                .filter(f => f.startsWith(this.config.filePrefix) && f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.config.logDir, f)
                }));

            // Sort by name (which includes timestamp, so oldest first)
            logFiles.sort((a, b) => a.name.localeCompare(b.name));

            // Remove oldest files if over limit
            const toRemove = logFiles.length - this.config.maxFiles;
            if (toRemove > 0) {
                for (let i = 0; i < toRemove; i++) {
                    await fs.promises.unlink(logFiles[i].path);
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old chat logs:', error.message);
        }
    }

    /**
     * Log a chat message
     * @param {Object} message - Chat message data
     */
    log(message) {
        if (!this.isInitialized) {
            console.warn('ChatLogger not initialized');
            return;
        }

        const entry = {
            timestamp: new Date().toISOString(),
            ...message
        };

        this.buffer.push(entry);

        // Check if we need to rotate
        const entrySize = Buffer.byteLength(JSON.stringify(entry) + '\n');
        if (this.currentSize + entrySize > this.config.maxFileSize) {
            this.rotateFile();
        }
    }

    /**
     * Log a player chat message
     * @param {string} playerId
     * @param {string} username
     * @param {string} content
     * @param {string} channel - 'global', 'local', 'whisper', etc.
     * @param {Object} metadata - Additional data
     */
    logChat(playerId, username, content, channel = 'global', metadata = {}) {
        this.log({
            type: 'chat',
            playerId,
            username,
            content,
            channel,
            ...metadata
        });
    }

    /**
     * Log a system event (join, leave, etc.)
     * @param {string} event
     * @param {Object} data
     */
    logEvent(event, data = {}) {
        this.log({
            type: 'event',
            event,
            ...data
        });
    }

    /**
     * Flush buffer to disk
     */
    async flush() {
        if (this.buffer.length === 0 || !this.currentStream) return;

        const entries = this.buffer.splice(0, this.buffer.length);
        const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

        return new Promise((resolve, reject) => {
            this.currentStream.write(lines, (error) => {
                if (error) {
                    console.error('Failed to write chat log:', error.message);
                    reject(error);
                } else {
                    this.currentSize += Buffer.byteLength(lines);
                    resolve();
                }
            });
        });
    }

    /**
     * Get recent chat messages (reads from current file)
     * @param {number} limit - Max messages to return
     * @returns {Promise<Array>}
     */
    async getRecent(limit = 50) {
        await this.flush();

        try {
            const content = await fs.promises.readFile(this.currentFile, 'utf8');
            const lines = content.split('\n')
                .filter(line => line.startsWith('{'))
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean);

            return lines.slice(-limit);
        } catch (error) {
            console.error('Failed to read chat log:', error.message);
            return [];
        }
    }

    /**
     * Close the logger gracefully
     */
    async close() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }

        await this.flush();

        if (this.currentStream) {
            await new Promise((resolve) => {
                this.currentStream.end(() => resolve());
            });
            this.currentStream = null;
        }

        this.isInitialized = false;
    }
}

// =============================================
// SINGLETON INSTANCE
// =============================================

export const chatLogger = new ChatLogger();

export default chatLogger;
