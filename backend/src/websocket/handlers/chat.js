/**
 * POLYMIR CHAT HANDLER
 * ====================
 * WebSocket message handlers for server chat
 * Supports global, local (proximity), and whisper channels
 */

import logger from '../../utils/logger.js';
import { chatLogger } from '../../utils/chatLogger.js';
import { chatFilter } from '../../utils/chatFilter.js';

const log = logger.child('Chat');

// =============================================
// CONFIGURATION
// =============================================

const CHAT_CONFIG = {
    maxMessageLength: 500,
    rateLimitMessages: 10,      // Max messages per window
    rateLimitWindow: 10000,     // 10 seconds
    localRadius: 100,           // Units for local chat
    historyLimit: 50            // Messages to send on join
};

// Rate limiting tracker
const rateLimits = new Map(); // playerId -> { count, windowStart }

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Check if player is rate limited
 * @param {string} playerId
 * @returns {boolean}
 */
function isRateLimited(playerId) {
    const now = Date.now();
    const limit = rateLimits.get(playerId);

    if (!limit) {
        rateLimits.set(playerId, { count: 1, windowStart: now });
        return false;
    }

    // Reset window if expired
    if (now - limit.windowStart > CHAT_CONFIG.rateLimitWindow) {
        rateLimits.set(playerId, { count: 1, windowStart: now });
        return false;
    }

    // Check if over limit
    if (limit.count >= CHAT_CONFIG.rateLimitMessages) {
        return true;
    }

    limit.count++;
    return false;
}

/**
 * Sanitize chat message content
 * @param {string} content
 * @returns {string}
 */
function sanitizeContent(content) {
    if (typeof content !== 'string') return '';

    return content
        .trim()
        .slice(0, CHAT_CONFIG.maxMessageLength)
        .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

// =============================================
// MESSAGE HANDLERS
// =============================================

/**
 * Handle chat message
 * @param {string} connectionId
 * @param {Object} message
 * @param {PolymirWebSocketServer} server
 */
async function handleChatMessage(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated to chat'
        });
        return;
    }

    const { content, channel = 'global', target } = message;
    let sanitized = sanitizeContent(content);

    if (!sanitized) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Empty message'
        });
        return;
    }

    // Apply chat filter
    const filterResult = chatFilter.filter(sanitized);

    // If hidden mode, don't send the message at all
    if (filterResult.hidden) {
        server.sendToClient(connectionId, {
            type: 'chat_blocked',
            reason: 'Message blocked by filter'
        });
        log.debug('Message blocked by filter', {
            playerId: client.playerId,
            matches: filterResult.matches
        });
        return;
    }

    // Update content based on filter result
    if (filterResult.wasFiltered) {
        sanitized = filterResult.text;
        log.debug('Message filtered', {
            playerId: client.playerId,
            matches: filterResult.matches,
            mode: filterResult.mode
        });
    }

    // Rate limit check
    if (isRateLimited(client.playerId)) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Sending messages too fast'
        });
        return;
    }

    const chatMessage = {
        type: 'chat',
        messageId: `${Date.now()}-${client.playerId}`,
        playerId: client.playerId,
        username: client.username || 'Unknown',
        content: sanitized,
        channel,
        timestamp: Date.now(),
        // Include spoiler flag if in reveal mode
        spoiler: filterResult.spoiler || false
    };

    // Log to file
    chatLogger.logChat(
        client.playerId,
        client.username,
        sanitized,
        channel,
        { connectionId }
    );

    // Route based on channel
    switch (channel) {
        case 'global':
            handleGlobalChat(chatMessage, server, connectionId);
            break;

        case 'local':
            handleLocalChat(chatMessage, server, connectionId, client);
            break;

        case 'whisper':
            handleWhisper(chatMessage, server, connectionId, target);
            break;

        default:
            handleGlobalChat(chatMessage, server, connectionId);
    }

    log.debug('Chat message', {
        playerId: client.playerId,
        channel,
        length: sanitized.length
    });
}

/**
 * Broadcast to all authenticated players
 */
function handleGlobalChat(chatMessage, server, senderConnectionId) {
    server.broadcast(chatMessage, (client) => {
        return client.connectionId !== senderConnectionId;
    });

    // Send confirmation to sender
    server.sendToClient(senderConnectionId, {
        ...chatMessage,
        self: true
    });
}

/**
 * Broadcast to nearby players only
 */
function handleLocalChat(chatMessage, server, senderConnectionId, senderClient) {
    const senderPos = senderClient.position || { x: 0, y: 0, z: 0 };

    let sentCount = 0;

    for (const [connId, client] of server.clients) {
        if (!client.isAuthenticated) continue;
        if (connId === senderConnectionId) continue;

        const clientPos = client.position || { x: 0, y: 0, z: 0 };
        const dx = clientPos.x - senderPos.x;
        const dy = clientPos.y - senderPos.y;
        const dz = clientPos.z - senderPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance <= CHAT_CONFIG.localRadius) {
            server.sendToClient(connId, chatMessage);
            sentCount++;
        }
    }

    // Send confirmation to sender
    server.sendToClient(senderConnectionId, {
        ...chatMessage,
        self: true,
        reachedCount: sentCount
    });
}

/**
 * Send private message to specific player
 */
function handleWhisper(chatMessage, server, senderConnectionId, targetUsername) {
    if (!targetUsername) {
        server.sendToClient(senderConnectionId, {
            type: 'error',
            error: 'Whisper requires target username'
        });
        return;
    }

    // Find target by username
    let targetClient = null;
    let targetConnId = null;

    for (const [connId, client] of server.clients) {
        if (client.username === targetUsername) {
            targetClient = client;
            targetConnId = connId;
            break;
        }
    }

    if (!targetClient) {
        server.sendToClient(senderConnectionId, {
            type: 'error',
            error: `Player "${targetUsername}" not found or offline`
        });
        return;
    }

    // Send to target
    server.sendToClient(targetConnId, {
        ...chatMessage,
        channel: 'whisper',
        whisperFrom: chatMessage.username
    });

    // Send confirmation to sender
    server.sendToClient(senderConnectionId, {
        ...chatMessage,
        self: true,
        whisperTo: targetUsername
    });
}

/**
 * Handle request for chat history
 */
async function handleChatHistory(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    const limit = Math.min(message.limit || 50, CHAT_CONFIG.historyLimit);
    const history = await chatLogger.getRecent(limit);

    // Filter to only global messages for history
    const globalHistory = history.filter(m => m.channel === 'global' || !m.channel);

    server.sendToClient(connectionId, {
        type: 'chat_history',
        messages: globalHistory
    });
}

// =============================================
// FILTER MANAGEMENT HANDLERS
// =============================================

/**
 * Get filter configuration (for GUI)
 */
async function handleGetFilterConfig(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    server.sendToClient(connectionId, {
        type: 'filter_config',
        config: chatFilter.getConfig()
    });
}

/**
 * Get full word list (admin only - for now just check authenticated)
 */
async function handleGetFilterWords(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    server.sendToClient(connectionId, {
        type: 'filter_words',
        words: chatFilter.getFullWordList()
    });
}

/**
 * Add word to filter
 */
async function handleAddFilterWord(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    const { word } = message;
    if (!word || typeof word !== 'string') {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Word is required'
        });
        return;
    }

    chatFilter.addWord(word.trim());
    await chatFilter.save();

    server.sendToClient(connectionId, {
        type: 'filter_word_added',
        word: word.trim().toLowerCase(),
        config: chatFilter.getConfig()
    });

    log.info('Filter word added', { word: word.trim(), by: client.username });
}

/**
 * Remove word from filter
 */
async function handleRemoveFilterWord(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    const { word } = message;
    if (!word || typeof word !== 'string') {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Word is required'
        });
        return;
    }

    chatFilter.removeWord(word.trim());
    await chatFilter.save();

    server.sendToClient(connectionId, {
        type: 'filter_word_removed',
        word: word.trim().toLowerCase(),
        config: chatFilter.getConfig()
    });

    log.info('Filter word removed', { word: word.trim(), by: client.username });
}

/**
 * Whitelist word (never filter)
 */
async function handleWhitelistWord(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    const { word } = message;
    if (!word || typeof word !== 'string') {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Word is required'
        });
        return;
    }

    chatFilter.whitelistWord(word.trim());
    await chatFilter.save();

    server.sendToClient(connectionId, {
        type: 'filter_word_whitelisted',
        word: word.trim().toLowerCase(),
        config: chatFilter.getConfig()
    });

    log.info('Filter word whitelisted', { word: word.trim(), by: client.username });
}

/**
 * Toggle filter enabled/disabled
 */
async function handleToggleFilter(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    const enabled = message.enabled !== false;
    chatFilter.setEnabled(enabled);
    await chatFilter.save();

    server.sendToClient(connectionId, {
        type: 'filter_toggled',
        enabled,
        config: chatFilter.getConfig()
    });

    log.info('Filter toggled', { enabled, by: client.username });
}

/**
 * Test a message against the filter
 */
async function handleTestFilter(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    const { text } = message;
    if (!text || typeof text !== 'string') {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Text is required'
        });
        return;
    }

    const result = chatFilter.filter(text);

    server.sendToClient(connectionId, {
        type: 'filter_test_result',
        original: text,
        filtered: result.text,
        wasFiltered: result.wasFiltered,
        matches: result.matches,
        mode: result.mode,
        hidden: result.hidden,
        spoiler: result.spoiler
    });
}

/**
 * Set filter mode (censor, hide, reveal)
 */
async function handleSetFilterMode(connectionId, message, server) {
    const client = server.getClient(connectionId);

    if (!client || !client.isAuthenticated) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Must be authenticated'
        });
        return;
    }

    const { mode } = message;
    if (!mode) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Mode is required (censor, hide, or reveal)'
        });
        return;
    }

    const success = chatFilter.setMode(mode);
    if (!success) {
        server.sendToClient(connectionId, {
            type: 'error',
            error: 'Invalid mode. Use: censor, hide, or reveal'
        });
        return;
    }

    await chatFilter.save();

    server.sendToClient(connectionId, {
        type: 'filter_mode_set',
        mode,
        config: chatFilter.getConfig()
    });

    log.info('Filter mode changed', { mode, by: client.username });
}

// =============================================
// HANDLER REGISTRATION
// =============================================

/**
 * Register all chat handlers with WebSocket server
 * @param {PolymirWebSocketServer} server
 */
export function registerChatHandlers(server) {
    // Chat messaging
    server.registerHandler('chat', handleChatMessage);
    server.registerHandler('chat_history', handleChatHistory);

    // Filter management
    server.registerHandler('filter_get_config', handleGetFilterConfig);
    server.registerHandler('filter_get_words', handleGetFilterWords);
    server.registerHandler('filter_add_word', handleAddFilterWord);
    server.registerHandler('filter_remove_word', handleRemoveFilterWord);
    server.registerHandler('filter_whitelist_word', handleWhitelistWord);
    server.registerHandler('filter_toggle', handleToggleFilter);
    server.registerHandler('filter_test', handleTestFilter);
    server.registerHandler('filter_set_mode', handleSetFilterMode);

    log.info('Chat handlers registered');
}

export default registerChatHandlers;
