/**
 * POLYMIR CHAT FILTER
 * ===================
 * Configurable profanity/spam filter for chat messages
 * Supports words, phrases, wildcards, and multiple filter modes
 */

import fs from 'fs';
import path from 'path';
import logger from './logger.js';

const log = logger.child('ChatFilter');

// =============================================
// FILTER MODES
// =============================================

export const FilterMode = {
    CENSOR: 'censor',           // Replace with asterisks (default)
    HIDE: 'hide',               // Hide entire message
    CLICK_TO_REVEAL: 'reveal'   // Show spoiler-style, click to reveal
};

// =============================================
// DEFAULT CENSORED ENTRIES
// =============================================

// Supports: words, phrases (with spaces), wildcards (* = any chars)
const DEFAULT_ENTRIES = [
    // Slurs and hate speech
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded',
    'kike', 'chink', 'spic', 'wetback', 'beaner', 'gook',
    'tranny', 'dyke', 'coon',

    // Common profanity
    'fuck', 'fuck*', '*fucker', 'motherfucker',
    'shit', 'shit*', 'bullshit', 'horseshit',
    'asshole', 'arsehole',
    'bitch', 'bitch*', 'bastard',
    'cock', 'dick', 'cunt', 'pussy', 'twat',
    'whore', 'slut',

    // Phrases
    'kill yourself', 'kys', 'go die', 'neck yourself',

    // Leetspeak variations
    'f4ck', 'fvck', 'sh1t', 'b1tch', 'a55', 'd1ck',

    // Wildcard examples
    'n*gger', 'n*gga', 'f*ck', 'sh*t'
];

// =============================================
// CHAT FILTER CLASS
// =============================================

export class ChatFilter {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            mode: config.mode || FilterMode.CENSOR,
            wordListPath: config.wordListPath || './config/censored_words.json',
            replacementChar: config.replacementChar || '*',
            checkLeetspeak: config.checkLeetspeak !== false,
            caseSensitive: config.caseSensitive || false,
            ...config
        };

        // Storage for entries (words, phrases, wildcards)
        this.entries = new Set();      // All active entries
        this.customEntries = new Set(); // User-added entries
        this.whitelisted = new Set();   // Never filter these

        // Compiled patterns for efficient matching
        this.compiledPatterns = [];

        // Leetspeak substitution map
        this.leetMap = {
            '4': 'a', '@': 'a', '8': 'b', '3': 'e',
            '1': 'i', '!': 'i', '0': 'o', '5': 's',
            '$': 's', '7': 't', '+': 't'
        };

        this.isLoaded = false;
    }

    /**
     * Initialize filter - load from file or use defaults
     */
    async initialize() {
        // Start with defaults
        DEFAULT_ENTRIES.forEach(entry => this.entries.add(entry.toLowerCase()));

        // Try to load custom config
        try {
            const configDir = path.dirname(this.config.wordListPath);
            await fs.promises.mkdir(configDir, { recursive: true });

            if (fs.existsSync(this.config.wordListPath)) {
                const data = await fs.promises.readFile(this.config.wordListPath, 'utf8');
                const saved = JSON.parse(data);

                if (saved.entries) {
                    saved.entries.forEach(e => this.entries.add(e.toLowerCase()));
                }
                if (saved.customEntries) {
                    saved.customEntries.forEach(e => {
                        this.customEntries.add(e.toLowerCase());
                        this.entries.add(e.toLowerCase());
                    });
                }
                if (saved.whitelisted) {
                    saved.whitelisted.forEach(e => {
                        this.whitelisted.add(e.toLowerCase());
                        this.entries.delete(e.toLowerCase());
                    });
                }
                if (saved.mode && Object.values(FilterMode).includes(saved.mode)) {
                    this.config.mode = saved.mode;
                }
                if (typeof saved.enabled === 'boolean') {
                    this.config.enabled = saved.enabled;
                }

                log.info('Chat filter loaded', {
                    entryCount: this.entries.size,
                    customCount: this.customEntries.size,
                    mode: this.config.mode
                });
            } else {
                await this.save();
                log.info('Chat filter initialized with defaults', { entryCount: this.entries.size });
            }
        } catch (error) {
            log.warn('Failed to load filter config, using defaults', { error: error.message });
        }

        // Compile patterns for matching
        this.compilePatterns();
        this.isLoaded = true;
    }

    /**
     * Compile entries into regex patterns for efficient matching
     */
    compilePatterns() {
        this.compiledPatterns = [];

        for (const entry of this.entries) {
            if (this.whitelisted.has(entry)) continue;

            try {
                const pattern = this.entryToRegex(entry);
                this.compiledPatterns.push({
                    entry,
                    regex: new RegExp(pattern, 'gi'),
                    isPhrase: entry.includes(' '),
                    hasWildcard: entry.includes('*')
                });
            } catch (error) {
                log.warn('Invalid filter entry', { entry, error: error.message });
            }
        }
    }

    /**
     * Convert entry (word/phrase/wildcard) to regex pattern
     * @param {string} entry
     * @returns {string}
     */
    entryToRegex(entry) {
        // Escape special regex chars except *
        let pattern = entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

        // Convert * wildcards to regex .*
        pattern = pattern.replace(/\*/g, '.*');

        // For single words (no spaces), add word boundaries
        // For phrases, don't use word boundaries to allow partial matches
        if (!entry.includes(' ') && !entry.includes('*')) {
            pattern = `\\b${pattern}\\b`;
        }

        return pattern;
    }

    /**
     * Normalize text (leetspeak conversion, separator removal)
     * @param {string} text
     * @returns {string}
     */
    normalizeText(text) {
        let normalized = text.toLowerCase();

        if (this.config.checkLeetspeak) {
            for (const [leet, char] of Object.entries(this.leetMap)) {
                normalized = normalized.split(leet).join(char);
            }
        }

        return normalized;
    }

    /**
     * Check if text contains filtered content
     * @param {string} text
     * @returns {{ found: boolean, matches: Array<{entry: string, match: string}> }}
     */
    check(text) {
        if (!this.config.enabled || !text) {
            return { found: false, matches: [] };
        }

        const matches = [];
        const lowerText = text.toLowerCase();
        const normalizedText = this.normalizeText(text);

        for (const { entry, regex, isPhrase, hasWildcard } of this.compiledPatterns) {
            // Reset regex lastIndex for global flag
            regex.lastIndex = 0;

            // Check original text
            let match = regex.exec(lowerText);
            if (match) {
                matches.push({ entry, match: match[0] });
                continue;
            }

            // Check normalized text (leetspeak converted)
            regex.lastIndex = 0;
            match = regex.exec(normalizedText);
            if (match) {
                matches.push({ entry, match: match[0] });
            }
        }

        return {
            found: matches.length > 0,
            matches
        };
    }

    /**
     * Apply filter to text based on current mode
     * @param {string} text
     * @returns {{
     *   text: string,
     *   wasFiltered: boolean,
     *   matches: Array,
     *   mode: string,
     *   hidden: boolean,
     *   spoiler: boolean
     * }}
     */
    filter(text) {
        if (!this.config.enabled || !text) {
            return {
                text,
                wasFiltered: false,
                matches: [],
                mode: this.config.mode,
                hidden: false,
                spoiler: false
            };
        }

        const { found, matches } = this.check(text);

        if (!found) {
            return {
                text,
                wasFiltered: false,
                matches: [],
                mode: this.config.mode,
                hidden: false,
                spoiler: false
            };
        }

        // Apply based on mode
        switch (this.config.mode) {
            case FilterMode.HIDE:
                return {
                    text: '[Message hidden due to filter]',
                    wasFiltered: true,
                    matches,
                    mode: this.config.mode,
                    hidden: true,
                    spoiler: false
                };

            case FilterMode.CLICK_TO_REVEAL:
                return {
                    text,  // Original text, client handles reveal UI
                    wasFiltered: true,
                    matches,
                    mode: this.config.mode,
                    hidden: false,
                    spoiler: true
                };

            case FilterMode.CENSOR:
            default:
                let filtered = text;
                for (const { entry, match } of matches) {
                    const replacement = this.config.replacementChar.repeat(match.length);
                    // Use case-insensitive replace
                    filtered = filtered.replace(new RegExp(this.escapeRegex(match), 'gi'), replacement);
                }
                return {
                    text: filtered,
                    wasFiltered: true,
                    matches,
                    mode: this.config.mode,
                    hidden: false,
                    spoiler: false
                };
        }
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Save config to file
     */
    async save() {
        try {
            const configDir = path.dirname(this.config.wordListPath);
            await fs.promises.mkdir(configDir, { recursive: true });

            const data = {
                enabled: this.config.enabled,
                mode: this.config.mode,
                entries: Array.from(this.entries).filter(e => !this.customEntries.has(e)),
                customEntries: Array.from(this.customEntries),
                whitelisted: Array.from(this.whitelisted)
            };

            await fs.promises.writeFile(
                this.config.wordListPath,
                JSON.stringify(data, null, 2)
            );

            log.debug('Chat filter saved');
        } catch (error) {
            log.error('Failed to save chat filter', { error: error.message });
        }
    }

    // =============================================
    // ENTRY MANAGEMENT
    // =============================================

    /**
     * Add entry (word, phrase, or wildcard pattern)
     * @param {string} entry - Can include spaces (phrase) or * (wildcard)
     * @param {boolean} isCustom
     */
    addEntry(entry, isCustom = true) {
        const lower = entry.toLowerCase().trim();
        if (!lower) return false;

        this.entries.add(lower);
        if (isCustom) {
            this.customEntries.add(lower);
        }
        this.whitelisted.delete(lower);
        this.compilePatterns();

        return true;
    }

    /**
     * Remove entry
     */
    removeEntry(entry) {
        const lower = entry.toLowerCase().trim();
        this.entries.delete(lower);
        this.customEntries.delete(lower);
        this.compilePatterns();
        return true;
    }

    /**
     * Whitelist entry (never filter)
     */
    whitelistEntry(entry) {
        const lower = entry.toLowerCase().trim();
        if (!lower) return false;

        this.whitelisted.add(lower);
        this.entries.delete(lower);
        this.customEntries.delete(lower);
        this.compilePatterns();

        return true;
    }

    /**
     * Remove from whitelist
     */
    unwhitelistEntry(entry) {
        const lower = entry.toLowerCase().trim();
        this.whitelisted.delete(lower);
        return true;
    }

    // =============================================
    // MODE & SETTINGS
    // =============================================

    /**
     * Set filter mode
     * @param {string} mode - 'censor', 'hide', or 'reveal'
     */
    setMode(mode) {
        if (Object.values(FilterMode).includes(mode)) {
            this.config.mode = mode;
            return true;
        }
        return false;
    }

    /**
     * Enable/disable filter
     */
    setEnabled(enabled) {
        this.config.enabled = enabled;
    }

    // =============================================
    // GETTERS FOR GUI
    // =============================================

    /**
     * Get config for GUI
     */
    getConfig() {
        return {
            enabled: this.config.enabled,
            mode: this.config.mode,
            modes: Object.values(FilterMode),
            replacementChar: this.config.replacementChar,
            checkLeetspeak: this.config.checkLeetspeak,
            entryCount: this.entries.size,
            customEntries: Array.from(this.customEntries).sort(),
            whitelisted: Array.from(this.whitelisted).sort(),
            defaultEntryCount: DEFAULT_ENTRIES.length
        };
    }

    /**
     * Get full entry list (for admin GUI)
     */
    getFullEntryList() {
        return {
            all: Array.from(this.entries).sort(),
            custom: Array.from(this.customEntries).sort(),
            whitelisted: Array.from(this.whitelisted).sort(),
            defaults: DEFAULT_ENTRIES.slice().sort()
        };
    }

    /**
     * Reset to defaults
     */
    resetToDefaults() {
        this.entries.clear();
        this.customEntries.clear();
        this.whitelisted.clear();
        this.config.mode = FilterMode.CENSOR;

        DEFAULT_ENTRIES.forEach(entry => this.entries.add(entry.toLowerCase()));
        this.compilePatterns();

        log.info('Chat filter reset to defaults');
    }

    // Backward compatibility aliases
    addWord(word, isCustom = true) { return this.addEntry(word, isCustom); }
    removeWord(word) { return this.removeEntry(word); }
    whitelistWord(word) { return this.whitelistEntry(word); }
}

// =============================================
// SINGLETON INSTANCE
// =============================================

export const chatFilter = new ChatFilter();

export default chatFilter;
