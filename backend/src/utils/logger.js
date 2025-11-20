/**
 * POLYMIR LOGGING UTILITY
 * =======================
 * Simple structured logging with levels and timestamps
 */

// =============================================
// LOG LEVELS
// =============================================

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

const LOG_LEVEL_NAMES = {
    0: 'ERROR',
    1: 'WARN',
    2: 'INFO',
    3: 'DEBUG',
    4: 'TRACE'
};

// Get log level from environment
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// =============================================
// COLOR CODES (for terminal output)
// =============================================

const COLORS = {
    RESET: '\x1b[0m',
    RED: '\x1b[31m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    GRAY: '\x1b[90m'
};

const LEVEL_COLORS = {
    ERROR: COLORS.RED,
    WARN: COLORS.YELLOW,
    INFO: COLORS.BLUE,
    DEBUG: COLORS.MAGENTA,
    TRACE: COLORS.GRAY
};

// =============================================
// LOGGER CLASS
// =============================================

class Logger {
    constructor(context = 'POLYMIR') {
        this.context = context;
    }

    /**
     * Log message at specified level
     * @param {number} level
     * @param {string} message
     * @param {Object} metadata
     */
    log(level, message, metadata = {}) {
        if (level > currentLevel) return;

        const levelName = LOG_LEVEL_NAMES[level];
        const timestamp = new Date().toISOString();
        const color = LEVEL_COLORS[levelName] || COLORS.RESET;

        // Format message
        const prefix = `${color}[${timestamp}] [${levelName}] [${this.context}]${COLORS.RESET}`;
        const metaStr = Object.keys(metadata).length > 0
            ? ' ' + JSON.stringify(metadata)
            : '';

        console.log(`${prefix} ${message}${metaStr}`);
    }

    error(message, metadata) {
        this.log(LOG_LEVELS.ERROR, message, metadata);
    }

    warn(message, metadata) {
        this.log(LOG_LEVELS.WARN, message, metadata);
    }

    info(message, metadata) {
        this.log(LOG_LEVELS.INFO, message, metadata);
    }

    debug(message, metadata) {
        this.log(LOG_LEVELS.DEBUG, message, metadata);
    }

    trace(message, metadata) {
        this.log(LOG_LEVELS.TRACE, message, metadata);
    }

    /**
     * Create child logger with extended context
     * @param {string} childContext
     * @returns {Logger}
     */
    child(childContext) {
        return new Logger(`${this.context}:${childContext}`);
    }
}

// =============================================
// DEFAULT LOGGER INSTANCE
// =============================================

export const logger = new Logger('POLYMIR');

// =============================================
// EXPORTS
// =============================================

export { Logger, LOG_LEVELS };
export default logger;
