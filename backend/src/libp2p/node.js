/**
 * POLYMIR LIBP2P NODE
 * ===================
 * P2P networking for distributed validation and events
 *
 * Network topology:
 * - Server = bootstrap node + relay
 * - Players connect to server first
 * - Players also connect directly to nearby peers
 * - GossipSub for regional event broadcasting
 * - DHT for peer discovery
 */

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@libp2p/noise';
import { mplex } from '@libp2p/mplex';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import logger from '../utils/logger.js';

const p2pLogger = logger.child('libp2p');

// =============================================
// LIBP2P NODE STATE
// =============================================

let libp2pNode = null;
let messageHandlers = new Map();

// =============================================
// NODE INITIALIZATION
// =============================================

/**
 * Initialize libp2p node
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} libp2p node instance
 */
export async function initializeLibp2p(options = {}) {
    try {
        p2pLogger.info('Initializing libp2p node');

        const listenAddresses = [
            process.env.LIBP2P_LISTEN_TCP || '/ip4/0.0.0.0/tcp/9001',
            process.env.LIBP2P_LISTEN_WS || '/ip4/0.0.0.0/tcp/9002/ws'
        ];

        const bootstrapNodes = process.env.LIBP2P_BOOTSTRAP_NODES
            ? process.env.LIBP2P_BOOTSTRAP_NODES.split(',').filter(Boolean)
            : [];

        libp2pNode = await createLibp2p({
            addresses: {
                listen: listenAddresses,
                announce: options.announceAddr ? [options.announceAddr] : []
            },
            transports: [
                tcp(),
                webSockets()
            ],
            connectionEncryption: [
                noise()
            ],
            streamMuxers: [
                mplex()
            ],
            peerDiscovery: bootstrapNodes.length > 0 ? [
                bootstrap({
                    list: bootstrapNodes
                })
            ] : [],
            services: {
                identify: identify(),
                ping: ping(),
                pubsub: gossipsub({
                    emitSelf: false, // Don't receive own messages
                    fallbackToFloodsub: true,
                    floodPublish: true
                }),
                dht: kadDHT({
                    clientMode: false // Server mode for DHT queries
                })
            }
        });

        // Set up event listeners
        setupEventListeners();

        // Start the node
        await libp2pNode.start();

        const peerId = libp2pNode.peerId.toString();
        const addresses = libp2pNode.getMultiaddrs();

        p2pLogger.info('libp2p node started', {
            peerId,
            addresses: addresses.map(a => a.toString())
        });

        return libp2pNode;
    } catch (error) {
        p2pLogger.error('Failed to initialize libp2p', { error: error.message });
        throw error;
    }
}

/**
 * Set up libp2p event listeners
 */
function setupEventListeners() {
    libp2pNode.addEventListener('peer:connect', (event) => {
        const peerId = event.detail.toString();
        p2pLogger.debug('Peer connected', { peerId });
    });

    libp2pNode.addEventListener('peer:disconnect', (event) => {
        const peerId = event.detail.toString();
        p2pLogger.debug('Peer disconnected', { peerId });
    });

    libp2pNode.addEventListener('peer:discovery', (event) => {
        const peerId = event.detail.id.toString();
        p2pLogger.trace('Peer discovered', { peerId });
    });
}

/**
 * Get libp2p node instance
 * @returns {Object} libp2p node
 */
export function getLibp2p() {
    if (!libp2pNode) {
        throw new Error('libp2p node not initialized. Call initializeLibp2p() first.');
    }
    return libp2pNode;
}

/**
 * Stop libp2p node
 * @returns {Promise<void>}
 */
export async function stopLibp2p() {
    if (libp2pNode) {
        p2pLogger.info('Stopping libp2p node');
        await libp2pNode.stop();
        libp2pNode = null;
        p2pLogger.info('libp2p node stopped');
    }
}

// =============================================
// TOPIC SUBSCRIPTION
// =============================================

/**
 * Subscribe to a GossipSub topic
 * @param {string} topic - Topic name
 * @param {Function} handler - Message handler (msg) => void
 * @returns {Promise<void>}
 */
export async function subscribeTopic(topic, handler) {
    const node = getLibp2p();

    try {
        // Store handler
        messageHandlers.set(topic, handler);

        // Subscribe to topic
        node.services.pubsub.subscribe(topic);

        // Set up message listener
        node.services.pubsub.addEventListener('message', (event) => {
            if (event.detail.topic === topic) {
                handleTopicMessage(topic, event.detail);
            }
        });

        p2pLogger.info('Subscribed to topic', { topic });
    } catch (error) {
        p2pLogger.error('Failed to subscribe to topic', { topic, error: error.message });
        throw error;
    }
}

/**
 * Unsubscribe from a topic
 * @param {string} topic
 * @returns {Promise<void>}
 */
export async function unsubscribeTopic(topic) {
    const node = getLibp2p();

    try {
        node.services.pubsub.unsubscribe(topic);
        messageHandlers.delete(topic);
        p2pLogger.info('Unsubscribed from topic', { topic });
    } catch (error) {
        p2pLogger.error('Failed to unsubscribe from topic', { topic, error: error.message });
        throw error;
    }
}

/**
 * Handle incoming topic message
 * @param {string} topic
 * @param {Object} message
 */
function handleTopicMessage(topic, message) {
    const handler = messageHandlers.get(topic);

    if (!handler) {
        p2pLogger.warn('No handler for topic', { topic });
        return;
    }

    try {
        // Decode message data
        const data = JSON.parse(new TextDecoder().decode(message.data));

        p2pLogger.trace('Received message on topic', {
            topic,
            from: message.from.toString(),
            data
        });

        // Call handler
        handler(data, message.from.toString());
    } catch (error) {
        p2pLogger.error('Failed to handle topic message', {
            topic,
            error: error.message
        });
    }
}

// =============================================
// MESSAGE PUBLISHING
// =============================================

/**
 * Publish message to topic
 * @param {string} topic
 * @param {Object} data - Data to publish (will be JSON encoded)
 * @returns {Promise<void>}
 */
export async function publishToTopic(topic, data) {
    const node = getLibp2p();

    try {
        const json = JSON.stringify(data);
        const buffer = new TextEncoder().encode(json);

        await node.services.pubsub.publish(topic, buffer);

        p2pLogger.trace('Published to topic', { topic, dataSize: buffer.length });
    } catch (error) {
        p2pLogger.error('Failed to publish to topic', { topic, error: error.message });
        throw error;
    }
}

/**
 * Broadcast message to multiple topics
 * @param {Array<string>} topics
 * @param {Object} data
 * @returns {Promise<void>}
 */
export async function broadcastToTopics(topics, data) {
    await Promise.all(topics.map(topic => publishToTopic(topic, data)));
}

// =============================================
// PEER MANAGEMENT
// =============================================

/**
 * Get list of connected peers
 * @returns {Array<string>} Peer IDs
 */
export function getConnectedPeers() {
    const node = getLibp2p();
    return Array.from(node.getPeers()).map(peer => peer.toString());
}

/**
 * Get number of connected peers
 * @returns {number}
 */
export function getPeerCount() {
    return getConnectedPeers().length;
}

/**
 * Connect to a specific peer
 * @param {string} multiaddr - Peer multiaddress
 * @returns {Promise<void>}
 */
export async function connectToPeer(multiaddr) {
    const node = getLibp2p();

    try {
        p2pLogger.debug('Connecting to peer', { multiaddr });
        await node.dial(multiaddr);
        p2pLogger.info('Connected to peer', { multiaddr });
    } catch (error) {
        p2pLogger.error('Failed to connect to peer', { multiaddr, error: error.message });
        throw error;
    }
}

/**
 * Disconnect from a peer
 * @param {string} peerId
 * @returns {Promise<void>}
 */
export async function disconnectFromPeer(peerId) {
    const node = getLibp2p();

    try {
        await node.hangUp(peerId);
        p2pLogger.info('Disconnected from peer', { peerId });
    } catch (error) {
        p2pLogger.error('Failed to disconnect from peer', { peerId, error: error.message });
        throw error;
    }
}

// =============================================
// TOPIC MANAGEMENT
// =============================================

/**
 * Get list of subscribed topics
 * @returns {Array<string>}
 */
export function getSubscribedTopics() {
    const node = getLibp2p();
    return node.services.pubsub.getTopics();
}

/**
 * Get peers subscribed to a topic
 * @param {string} topic
 * @returns {Array<string>} Peer IDs
 */
export function getTopicPeers(topic) {
    const node = getLibp2p();
    return node.services.pubsub.getSubscribers(topic).map(peer => peer.toString());
}

/**
 * Get number of peers on a topic
 * @param {string} topic
 * @returns {number}
 */
export function getTopicPeerCount(topic) {
    return getTopicPeers(topic).length;
}

// =============================================
// DHT OPERATIONS
// =============================================

/**
 * Find peers near a location (using DHT)
 * @param {Object} location - {x, y, z} coordinates
 * @param {number} maxPeers - Maximum peers to return
 * @returns {Promise<Array<string>>} Peer IDs
 */
export async function findNearbyPeers(location, maxPeers = 10) {
    const node = getLibp2p();

    try {
        // Use location hash as DHT key
        const locationKey = `loc:${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;

        const peers = [];
        for await (const peer of node.services.dht.getClosestPeers(locationKey)) {
            peers.push(peer.id.toString());
            if (peers.length >= maxPeers) break;
        }

        return peers;
    } catch (error) {
        p2pLogger.error('Failed to find nearby peers', { error: error.message });
        return [];
    }
}

/**
 * Announce location to DHT
 * @param {Object} location - {x, y, z}
 * @returns {Promise<void>}
 */
export async function announceLocation(location) {
    const node = getLibp2p();

    try {
        const locationKey = `loc:${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
        const value = new TextEncoder().encode(node.peerId.toString());

        await node.services.dht.put(locationKey, value);
        p2pLogger.debug('Announced location to DHT', { location });
    } catch (error) {
        p2pLogger.warn('Failed to announce location', { error: error.message });
    }
}

// =============================================
// NODE INFO
// =============================================

/**
 * Get node information
 * @returns {Object}
 */
export function getNodeInfo() {
    const node = getLibp2p();

    return {
        peerId: node.peerId.toString(),
        addresses: node.getMultiaddrs().map(a => a.toString()),
        connectedPeers: getPeerCount(),
        subscribedTopics: getSubscribedTopics()
    };
}

// =============================================
// EXPORTS
// =============================================

export default {
    initializeLibp2p,
    getLibp2p,
    stopLibp2p,
    subscribeTopic,
    unsubscribeTopic,
    publishToTopic,
    broadcastToTopics,
    getConnectedPeers,
    getPeerCount,
    connectToPeer,
    disconnectFromPeer,
    getSubscribedTopics,
    getTopicPeers,
    getTopicPeerCount,
    findNearbyPeers,
    announceLocation,
    getNodeInfo
};
