/**
 * AvatarNetworkSync - Real-time avatar synchronization for multiplayer
 *
 * Handles syncing avatar data, poses, and expressions between players.
 * Optimized for bandwidth efficiency with delta updates and message batching.
 *
 * Features:
 * - Avatar ID broadcast on join
 * - Pose/animation state sync with smallest-three quaternion compression
 * - Expression state sync (event-based)
 * - Message batching to reduce overhead
 * - Interpolation buffer for smooth remote avatars
 * - Reconnection with exponential backoff
 */

import * as THREE from 'three';

// Sync configuration
const CONFIG = {
    POSE_SYNC_RATE: 10,           // Pose updates per second
    POSITION_SYNC_RATE: 20,       // Position updates per second
    INTERPOLATION_DELAY: 100,     // ms delay for interpolation buffer
    MAX_BUFFER_AGE: 500,          // ms to keep in interpolation buffer
    BATCH_INTERVAL: 50,           // ms between batched sends
    MAX_BATCH_SIZE: 10,           // Max messages per batch
    RECONNECT_BASE_DELAY: 1000,   // Initial reconnect delay
    RECONNECT_MAX_DELAY: 30000,   // Max reconnect delay
    RECONNECT_MAX_ATTEMPTS: 10
};

// Message types
export const MSG_TYPE = {
    AVATAR_DATA: 'avatar_data',
    AVATAR_REQUEST: 'avatar_request',
    POSE_UPDATE: 'pose_update',
    POSITION_UPDATE: 'position_update',
    EXPRESSION_CHANGE: 'expression_change',
    ANIMATION_STATE: 'animation_state',
    LOOK_AT: 'look_at',
    BATCH: 'batch'  // Batched messages
};

/**
 * Compress quaternion using smallest-three encoding
 * Reduces quaternion to 4 bytes (index + 3 x 10-bit values)
 */
function compressQuaternion(q) {
    const values = [q.x, q.y, q.z, q.w];
    const abs = values.map(Math.abs);

    // Find largest component
    let maxIdx = 0;
    for (let i = 1; i < 4; i++) {
        if (abs[i] > abs[maxIdx]) maxIdx = i;
    }

    // Sign of largest determines signs of others
    const sign = values[maxIdx] < 0 ? -1 : 1;

    // Encode 3 smallest components (10 bits each, range -0.707 to 0.707)
    const compressed = [];
    for (let i = 0; i < 4; i++) {
        if (i !== maxIdx) {
            // Quantize to 10 bits: map [-1, 1] to [0, 1023]
            compressed.push(Math.round((values[i] * sign + 1) * 511.5) & 0x3FF);
        }
    }

    return { i: maxIdx, v: compressed };
}

/**
 * Decompress smallest-three encoded quaternion
 */
function decompressQuaternion(data) {
    const { i, v } = data;

    // Dequantize values
    const decoded = v.map(val => (val / 511.5) - 1);

    // Compute largest component from unit quaternion constraint
    let sumSq = 0;
    for (const val of decoded) sumSq += val * val;
    const largest = Math.sqrt(Math.max(0, 1 - sumSq));

    // Reconstruct quaternion
    const result = new Float32Array(4);
    let di = 0;
    for (let j = 0; j < 4; j++) {
        result[j] = (j === i) ? largest : decoded[di++];
    }

    return new THREE.Quaternion(result[0], result[1], result[2], result[3]);
}

/**
 * Ring buffer for interpolation states - O(1) add/trim
 */
class InterpolationBuffer {
    constructor(maxAge = CONFIG.MAX_BUFFER_AGE, capacity = 32) {
        this.capacity = capacity;
        this.states = new Array(capacity);
        this.head = 0;      // Next write position
        this.tail = 0;      // Oldest valid position
        this.size = 0;
        this.maxAge = maxAge;
    }

    add(state) {
        state.receivedAt = performance.now();

        // Write at head position - O(1)
        this.states[this.head] = state;
        this.head = (this.head + 1) % this.capacity;

        if (this.size < this.capacity) {
            this.size++;
        } else {
            // Buffer full, advance tail (overwrite oldest)
            this.tail = (this.tail + 1) % this.capacity;
        }

        this.trim();
    }

    trim() {
        const cutoff = performance.now() - this.maxAge;

        // Advance tail past expired entries - O(1) amortized
        while (this.size > 0) {
            const state = this.states[this.tail];
            if (!state || state.receivedAt >= cutoff) break;

            this.states[this.tail] = null; // Allow GC
            this.tail = (this.tail + 1) % this.capacity;
            this.size--;
        }
    }

    /**
     * Get interpolation data for a given render time
     * @returns {Object} Discriminated union:
     *   - { kind: 'empty' } - no states available
     *   - { kind: 'single', state } - only one state, apply directly
     *   - { kind: 'interpolated', before, after, t } - interpolate between states
     */
    getInterpolated(renderTime) {
        if (this.size === 0) return { kind: 'empty' };

        // Find bracketing states in ring buffer
        let before = null;
        let after = null;

        // Iterate from tail (oldest) to head (newest)
        let idx = this.tail;
        for (let i = 0; i < this.size; i++) {
            const state = this.states[idx];
            if (state) {
                if (state.receivedAt <= renderTime) {
                    before = state;
                } else {
                    after = state;
                    break;
                }
            }
            idx = (idx + 1) % this.capacity;
        }

        // No state before renderTime - return oldest as single state
        if (!before) {
            const oldest = this.states[this.tail];
            return oldest ? { kind: 'single', state: oldest } : { kind: 'empty' };
        }

        // No state after renderTime - return latest as single state
        if (!after) {
            return { kind: 'single', state: before };
        }

        // Calculate interpolation factor
        const duration = after.receivedAt - before.receivedAt;
        const t = duration > 0
            ? Math.min(1, (renderTime - before.receivedAt) / duration)
            : 0;

        return { kind: 'interpolated', before, after, t };
    }

    clear() {
        for (let i = 0; i < this.capacity; i++) {
            this.states[i] = null;
        }
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }

    get length() {
        return this.size;
    }
}

export class AvatarNetworkSync {
    constructor(options = {}) {
        // WebSocket
        this.socket = null;
        this.wsUrl = null;

        // Reconnection state
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.shouldReconnect = true;

        // Local player
        this.localPlayerId = null;
        this.localAvatarId = null;
        this.localAvatarRenderer = null;

        // Remote players
        this.remotePlayers = new Map(); // playerId → { avatarId, renderer, buffer }

        // Interpolation buffers
        this.interpolationBuffers = new Map(); // playerId → InterpolationBuffer

        // Sync timing
        this.lastPoseSync = 0;
        this.lastPositionSync = 0;

        // Message batching
        this.outgoingBatch = [];
        this.batchTimer = null;
        this.lastBatchSend = 0;

        // Pending avatar requests
        this.pendingRequests = new Set();

        // Event callbacks
        this.onPlayerJoin = options.onPlayerJoin || null;
        this.onPlayerLeave = options.onPlayerLeave || null;
        this.onAvatarReceived = options.onAvatarReceived || null;
        this.onConnectionChange = options.onConnectionChange || null;

        // Configuration
        this.config = { ...CONFIG, ...options };

        // Stats
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            reconnects: 0
        };
    }

    /**
     * Connect to WebSocket server
     */
    connect(wsUrl, localPlayerId) {
        this.wsUrl = wsUrl;
        this.localPlayerId = localPlayerId;
        this.shouldReconnect = true;

        this.createSocket();
    }

    /**
     * Create WebSocket connection
     * @private
     */
    createSocket() {
        // Clean up old socket properly to prevent stale handler execution
        if (this.socket) {
            // Remove handlers before closing to prevent onclose triggering reconnect
            this.socket.onopen = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.onmessage = null;
            this.socket.close();
            this.socket = null;
        }

        try {
            this.socket = new WebSocket(this.wsUrl);

            this.socket.onopen = () => {
                console.log('[AvatarNetworkSync] Connected');
                this.reconnectAttempts = 0;

                if (this.onConnectionChange) {
                    this.onConnectionChange('connected');
                }

                // Broadcast avatar if we have one
                if (this.localAvatarId) {
                    this.broadcastAvatarData();
                }

                // Start batch timer
                this.startBatchTimer();
            };

            this.socket.onclose = (event) => {
                console.log('[AvatarNetworkSync] Disconnected:', event.code);
                this.stopBatchTimer();

                if (this.onConnectionChange) {
                    this.onConnectionChange('disconnected');
                }

                if (this.shouldReconnect) {
                    this.scheduleReconnect();
                }
            };

            this.socket.onerror = (error) => {
                console.error('[AvatarNetworkSync] WebSocket error:', error);
            };

            this.socket.onmessage = (event) => {
                this.handleRawMessage(event.data);
            };
        } catch (error) {
            console.error('[AvatarNetworkSync] Failed to create socket:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     * @private
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.config.RECONNECT_MAX_ATTEMPTS) {
            console.error('[AvatarNetworkSync] Max reconnect attempts reached');
            if (this.onConnectionChange) {
                this.onConnectionChange('failed');
            }
            return;
        }

        const delay = Math.min(
            this.config.RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
            this.config.RECONNECT_MAX_DELAY
        );

        console.log(`[AvatarNetworkSync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.stats.reconnects++;
            this.createSocket();
        }, delay);
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this.shouldReconnect = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.stopBatchTimer();

        if (this.socket) {
            // Remove handlers before closing to prevent callbacks during teardown
            this.socket.onopen = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.onmessage = null;
            this.socket.close();
            this.socket = null;
        }
    }

    /**
     * Handle raw incoming message
     * @private
     */
    handleRawMessage(data) {
        try {
            const message = JSON.parse(data);
            this.stats.messagesReceived++;
            this.stats.bytesReceived += data.length;

            // Handle batched messages
            if (message.type === MSG_TYPE.BATCH) {
                for (const msg of message.messages) {
                    this.handleMessage(msg);
                }
            } else {
                this.handleMessage(message);
            }
        } catch (error) {
            console.error('[AvatarNetworkSync] Failed to parse message:', error);
        }
    }

    /**
     * Handle parsed message
     * @private
     */
    handleMessage(message) {
        const { type, playerId, data } = message;

        // Ignore own messages
        if (playerId === this.localPlayerId) return;

        switch (type) {
            case MSG_TYPE.AVATAR_DATA:
                this.handleAvatarData(playerId, data);
                break;
            case MSG_TYPE.AVATAR_REQUEST:
                this.broadcastAvatarData();
                break;
            case MSG_TYPE.POSE_UPDATE:
                this.handlePoseUpdate(playerId, data);
                break;
            case MSG_TYPE.POSITION_UPDATE:
                this.handlePositionUpdate(playerId, data);
                break;
            case MSG_TYPE.EXPRESSION_CHANGE:
                this.handleExpressionChange(playerId, data);
                break;
            case MSG_TYPE.ANIMATION_STATE:
                this.handleAnimationState(playerId, data);
                break;
            case MSG_TYPE.LOOK_AT:
                this.handleLookAt(playerId, data);
                break;
        }
    }

    /**
     * Set local avatar
     */
    setLocalAvatar(avatarId, avatarRenderer) {
        this.localAvatarId = avatarId;
        this.localAvatarRenderer = avatarRenderer;
        this.broadcastAvatarData();
    }

    /**
     * Broadcast local avatar data
     */
    broadcastAvatarData() {
        if (!this.localAvatarId) return;

        this.sendImmediate({
            type: MSG_TYPE.AVATAR_DATA,
            playerId: this.localPlayerId,
            data: { avatarId: this.localAvatarId }
        });
    }

    /**
     * Handle received avatar data
     * @private
     */
    handleAvatarData(playerId, data) {
        const { avatarId } = data;

        const existing = this.remotePlayers.get(playerId);
        if (existing?.avatarId === avatarId) return;

        if (!this.pendingRequests.has(avatarId)) {
            this.pendingRequests.add(avatarId);
            this.fetchAvatarData(avatarId, playerId);
        }
    }

    /**
     * Fetch avatar data from server
     * @private
     */
    async fetchAvatarData(avatarId, playerId) {
        try {
            const response = await fetch(`/api/avatars/${avatarId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const avatarData = await response.json();
            this.pendingRequests.delete(avatarId);

            if (this.onAvatarReceived) {
                this.onAvatarReceived(playerId, avatarData);
            }
        } catch (error) {
            console.error('[AvatarNetworkSync] Failed to fetch avatar:', error);
            this.pendingRequests.delete(avatarId);
        }
    }

    /**
     * Register remote player
     */
    registerRemotePlayer(playerId, avatarId, renderer) {
        // Create interpolation buffer
        const buffer = new InterpolationBuffer(this.config.MAX_BUFFER_AGE);

        this.remotePlayers.set(playerId, {
            avatarId,
            renderer,
            buffer,
            lastUpdate: performance.now()
        });

        this.interpolationBuffers.set(playerId, buffer);

        if (this.onPlayerJoin) {
            this.onPlayerJoin(playerId);
        }
    }

    /**
     * Unregister remote player
     */
    unregisterRemotePlayer(playerId) {
        const player = this.remotePlayers.get(playerId);
        if (!player) return;

        player.renderer?.dispose?.();
        player.buffer?.clear();

        this.remotePlayers.delete(playerId);
        this.interpolationBuffers.delete(playerId);

        if (this.onPlayerLeave) {
            this.onPlayerLeave(playerId);
        }
    }

    /**
     * Update loop - call each frame
     */
    update(deltaTime) {
        const now = performance.now();

        // Send local updates
        if (now - this.lastPoseSync > 1000 / this.config.POSE_SYNC_RATE) {
            this.queuePoseUpdate();
            this.lastPoseSync = now;
        }

        if (now - this.lastPositionSync > 1000 / this.config.POSITION_SYNC_RATE) {
            this.queuePositionUpdate();
            this.lastPositionSync = now;
        }

        // Interpolate remote players
        const renderTime = now - this.config.INTERPOLATION_DELAY;

        for (const [playerId, player] of this.remotePlayers) {
            this.updateRemotePlayer(player, renderTime);
        }
    }

    /**
     * Queue pose update for batching
     * @private
     */
    queuePoseUpdate() {
        if (!this.localAvatarRenderer?.rig) return;

        const rig = this.localAvatarRenderer.rig;
        const bones = {};

        for (const boneName of rig.getBoneNames()) {
            const bone = rig.getBone(boneName);
            if (bone?.rotation) {
                const q = new THREE.Quaternion(
                    bone.rotation.x, bone.rotation.y,
                    bone.rotation.z, bone.rotation.w
                );
                bones[boneName] = compressQuaternion(q);
            }
        }

        this.queueMessage({
            type: MSG_TYPE.POSE_UPDATE,
            playerId: this.localPlayerId,
            data: { t: Date.now(), bones }
        });
    }

    /**
     * Queue position update for batching
     * @private
     */
    queuePositionUpdate() {
        const obj = this.localAvatarRenderer?.getObject3D?.();
        if (!obj) return;

        this.queueMessage({
            type: MSG_TYPE.POSITION_UPDATE,
            playerId: this.localPlayerId,
            data: {
                t: Date.now(),
                p: {
                    x: Math.round(obj.position.x * 100) / 100,
                    y: Math.round(obj.position.y * 100) / 100,
                    z: Math.round(obj.position.z * 100) / 100
                },
                r: Math.round(obj.rotation.y * 1000) / 1000
            }
        });
    }

    /**
     * Send expression change (immediate, event-based)
     */
    sendExpressionChange(expression) {
        this.sendImmediate({
            type: MSG_TYPE.EXPRESSION_CHANGE,
            playerId: this.localPlayerId,
            data: { expression }
        });
    }

    /**
     * Send animation state change (immediate)
     */
    sendAnimationState(state) {
        this.sendImmediate({
            type: MSG_TYPE.ANIMATION_STATE,
            playerId: this.localPlayerId,
            data: { state }
        });
    }

    /**
     * Send look-at target (batched)
     */
    sendLookAt(target) {
        this.queueMessage({
            type: MSG_TYPE.LOOK_AT,
            playerId: this.localPlayerId,
            data: { x: target.x, y: target.y, z: target.z }
        });
    }

    /**
     * Handle pose update from remote player
     * @private
     */
    handlePoseUpdate(playerId, data) {
        const buffer = this.interpolationBuffers.get(playerId);
        if (!buffer) return;

        // Decompress quaternions
        const bones = {};
        for (const [boneName, compressed] of Object.entries(data.bones)) {
            bones[boneName] = decompressQuaternion(compressed);
        }

        buffer.add({
            type: 'pose',
            serverTime: data.t,
            bones
        });
    }

    /**
     * Handle position update from remote player
     * @private
     */
    handlePositionUpdate(playerId, data) {
        const buffer = this.interpolationBuffers.get(playerId);
        if (!buffer) return;

        buffer.add({
            type: 'position',
            serverTime: data.t,
            position: new THREE.Vector3(data.p.x, data.p.y, data.p.z),
            rotation: data.r
        });
    }

    /**
     * Handle expression change
     * @private
     */
    handleExpressionChange(playerId, data) {
        const player = this.remotePlayers.get(playerId);
        player?.renderer?.expressionController?.setExpression?.(data.expression);
    }

    /**
     * Handle animation state change
     * @private
     */
    handleAnimationState(playerId, data) {
        const player = this.remotePlayers.get(playerId);
        player?.renderer?.animationMixer?.setState?.(data.state);
    }

    /**
     * Handle look-at update
     * @private
     */
    handleLookAt(playerId, data) {
        const player = this.remotePlayers.get(playerId);
        player?.renderer?.lookAtController?.lookAt?.(data);
    }

    /**
     * Update remote player with interpolation
     * @private
     */
    updateRemotePlayer(player, renderTime) {
        const result = player.buffer.getInterpolated(renderTime);

        switch (result.kind) {
            case 'empty':
                return;

            case 'interpolated': {
                const { before, after, t } = result;

                if (before.type === 'pose' && player.renderer?.rig) {
                    this.applyInterpolatedPose(player.renderer.rig, before, after, t);
                }

                if (before.type === 'position' && player.renderer) {
                    this.applyInterpolatedPosition(player.renderer, before, after, t);
                }
                break;
            }

            case 'single': {
                const { state } = result;

                if (state.type === 'pose' && player.renderer?.rig) {
                    for (const [boneName, q] of Object.entries(state.bones)) {
                        const bone = player.renderer.rig.getBone(boneName);
                        if (bone) {
                            bone.rotation = { x: q.x, y: q.y, z: q.z, w: q.w };
                        }
                    }
                    player.renderer.rig.updateWorldTransforms?.();
                }

                if (state.type === 'position') {
                    const obj = player.renderer.getObject3D?.();
                    if (obj) {
                        obj.position.copy(state.position);
                        obj.rotation.y = state.rotation;
                    }
                }
                break;
            }
        }

        player.lastUpdate = performance.now();
    }

    /**
     * Apply interpolated pose to rig
     * @private
     */
    applyInterpolatedPose(rig, before, after, t) {
        for (const [boneName, beforeQ] of Object.entries(before.bones)) {
            const bone = rig.getBone(boneName);
            if (!bone) continue;

            let finalQ = beforeQ;
            if (after?.bones?.[boneName]) {
                finalQ = beforeQ.clone().slerp(after.bones[boneName], t);
            }

            bone.rotation = { x: finalQ.x, y: finalQ.y, z: finalQ.z, w: finalQ.w };
        }

        rig.updateWorldTransforms?.();
    }

    /**
     * Apply interpolated position
     * @private
     */
    applyInterpolatedPosition(renderer, before, after, t) {
        const obj = renderer.getObject3D?.();
        if (!obj) return;

        if (after) {
            const position = before.position.clone().lerp(after.position, t);
            const rotation = before.rotation + (after.rotation - before.rotation) * t;
            obj.position.copy(position);
            obj.rotation.y = rotation;
        } else {
            obj.position.copy(before.position);
            obj.rotation.y = before.rotation;
        }
    }

    /**
     * Queue message for batching
     * @private
     */
    queueMessage(message) {
        this.outgoingBatch.push(message);

        // Send immediately if batch is full
        if (this.outgoingBatch.length >= this.config.MAX_BATCH_SIZE) {
            this.flushBatch();
        }
    }

    /**
     * Send message immediately (bypass batching)
     * @private
     */
    sendImmediate(message) {
        if (!this.isConnected()) return;

        const json = JSON.stringify(message);
        this.socket.send(json);
        this.stats.messagesSent++;
        this.stats.bytesSent += json.length;
    }

    /**
     * Flush pending batch
     * @private
     */
    flushBatch() {
        if (this.outgoingBatch.length === 0 || !this.isConnected()) return;

        const message = this.outgoingBatch.length === 1
            ? this.outgoingBatch[0]
            : { type: MSG_TYPE.BATCH, messages: this.outgoingBatch };

        const json = JSON.stringify(message);
        this.socket.send(json);

        this.stats.messagesSent += this.outgoingBatch.length;
        this.stats.bytesSent += json.length;

        this.outgoingBatch = [];
        this.lastBatchSend = performance.now();
    }

    /**
     * Start batch timer
     * @private
     */
    startBatchTimer() {
        this.stopBatchTimer();
        this.batchTimer = setInterval(() => {
            this.flushBatch();
        }, this.config.BATCH_INTERVAL);
    }

    /**
     * Stop batch timer
     * @private
     */
    stopBatchTimer() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    /**
     * Get sync statistics
     */
    getStats() {
        return {
            ...this.stats,
            connected: this.isConnected(),
            remotePlayers: this.remotePlayers.size,
            pendingRequests: this.pendingRequests.size,
            batchQueueSize: this.outgoingBatch.length
        };
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.disconnect();

        for (const [playerId] of this.remotePlayers) {
            this.unregisterRemotePlayer(playerId);
        }

        this.remotePlayers.clear();
        this.interpolationBuffers.clear();
        this.pendingRequests.clear();
        this.outgoingBatch = [];
    }
}

export default AvatarNetworkSync;
