/**
 * ShipManager.js
 * Client-side ship state management
 *
 * Handles:
 * - Local ship physics simulation
 * - Ship boarding/disembarking
 * - Input handling when piloting
 * - Syncing ship state with server
 * - Managing player position relative to ship
 */

import { ShipConfig, SHIP_STATE, SHIP_PHYSICS } from './ShipConfig.js';

/**
 * Ship instance with runtime state
 */
export class ShipInstance {
    constructor(config) {
        this.config = config;
        this.shipId = config.shipId;

        // Transform
        this.position = { x: 0, y: 0, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0, w: 1 };
        this.angularVelocity = { x: 0, y: 0, z: 0 };

        // State
        this.state = SHIP_STATE.INACTIVE;
        this.pilotId = null;
        this.passengers = new Map(); // playerId -> localPosition

        // Control input
        this.throttle = 0; // -1 to 1
        this.pitch = 0;    // -1 to 1
        this.yaw = 0;      // -1 to 1
        this.roll = 0;     // -1 to 1

        // Fuel
        this.currentFuel = config.currentFuel || config.fuelCapacity;
    }

    /**
     * Update ship physics
     * @param {number} deltaTime - Time step in seconds
     */
    update(deltaTime) {
        if (this.state === SHIP_STATE.DESTROYED) return;

        // Apply thrust if piloted and has fuel
        if (this.state === SHIP_STATE.PILOTED && this.throttle !== 0) {
            this.applyThrust(deltaTime);
        }

        // Apply rotation if piloted
        if (this.state === SHIP_STATE.PILOTED) {
            this.applyRotation(deltaTime);
        }

        // Apply drag
        this.applyDrag(deltaTime);

        // Update position from velocity
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Clamp velocity
        const speed = Math.sqrt(
            this.velocity.x ** 2 +
            this.velocity.y ** 2 +
            this.velocity.z ** 2
        );
        if (speed > SHIP_PHYSICS.MAX_VELOCITY) {
            const scale = SHIP_PHYSICS.MAX_VELOCITY / speed;
            this.velocity.x *= scale;
            this.velocity.y *= scale;
            this.velocity.z *= scale;
        }
    }

    /**
     * Apply thrust based on throttle and forward direction
     */
    applyThrust(deltaTime) {
        if (this.currentFuel <= 0) return;

        const acceleration = this.config.getAcceleration() * this.throttle;

        // Get forward direction from rotation quaternion
        const forward = this.getForwardVector();

        // Apply acceleration
        this.velocity.x += forward.x * acceleration * deltaTime;
        this.velocity.y += forward.y * acceleration * deltaTime;
        this.velocity.z += forward.z * acceleration * deltaTime;

        // Consume fuel
        const fuelUsed = this.config.totalFuelConsumption * Math.abs(this.throttle) * deltaTime;
        this.currentFuel = Math.max(0, this.currentFuel - fuelUsed);
    }

    /**
     * Apply rotation from control inputs
     */
    applyRotation(deltaTime) {
        const rotSpeed = SHIP_PHYSICS.ROTATION_SPEED * deltaTime;

        // Apply gyroscope stabilization
        const stabilization = 1 + (this.config.gyroscopeStrength / 100);

        // Compute target angular velocity from inputs
        const targetAngularVel = {
            x: this.pitch * rotSpeed * stabilization,
            y: this.yaw * rotSpeed * stabilization,
            z: this.roll * rotSpeed * stabilization
        };

        // Smoothly adjust angular velocity
        const smoothing = 0.1;
        this.angularVelocity.x += (targetAngularVel.x - this.angularVelocity.x) * smoothing;
        this.angularVelocity.y += (targetAngularVel.y - this.angularVelocity.y) * smoothing;
        this.angularVelocity.z += (targetAngularVel.z - this.angularVelocity.z) * smoothing;

        // Apply angular velocity to rotation quaternion
        this.applyAngularVelocity(deltaTime);
    }

    /**
     * Apply angular velocity to rotation quaternion
     */
    applyAngularVelocity(deltaTime) {
        const ax = this.angularVelocity.x * deltaTime;
        const ay = this.angularVelocity.y * deltaTime;
        const az = this.angularVelocity.z * deltaTime;

        // Small angle approximation for quaternion update
        const halfAx = ax * 0.5;
        const halfAy = ay * 0.5;
        const halfAz = az * 0.5;

        const qx = this.rotation.x;
        const qy = this.rotation.y;
        const qz = this.rotation.z;
        const qw = this.rotation.w;

        // Quaternion derivative: dq = 0.5 * omega * q
        // omega as quaternion: (halfAx, halfAy, halfAz, 0)
        this.rotation.x = qx + (halfAx * qw + halfAy * qz - halfAz * qy);
        this.rotation.y = qy + (halfAy * qw + halfAz * qx - halfAx * qz);
        this.rotation.z = qz + (halfAz * qw + halfAx * qy - halfAy * qx);
        this.rotation.w = qw - (halfAx * qx + halfAy * qy + halfAz * qz);

        // Normalize quaternion
        this.normalizeRotation();
    }

    /**
     * Normalize rotation quaternion
     */
    normalizeRotation() {
        const len = Math.sqrt(
            this.rotation.x ** 2 +
            this.rotation.y ** 2 +
            this.rotation.z ** 2 +
            this.rotation.w ** 2
        );
        if (len > 0.0001) {
            this.rotation.x /= len;
            this.rotation.y /= len;
            this.rotation.z /= len;
            this.rotation.w /= len;
        }
    }

    /**
     * Apply space drag
     */
    applyDrag(deltaTime) {
        const drag = SHIP_PHYSICS.SPACE_DRAG;
        this.velocity.x *= (1 - drag * deltaTime);
        this.velocity.y *= (1 - drag * deltaTime);
        this.velocity.z *= (1 - drag * deltaTime);
    }

    /**
     * Get forward direction vector from rotation
     */
    getForwardVector() {
        // Forward is +Z in local space
        const qx = this.rotation.x;
        const qy = this.rotation.y;
        const qz = this.rotation.z;
        const qw = this.rotation.w;

        return {
            x: 2 * (qx * qz + qw * qy),
            y: 2 * (qy * qz - qw * qx),
            z: 1 - 2 * (qx * qx + qy * qy)
        };
    }

    /**
     * Get up direction vector from rotation
     */
    getUpVector() {
        const qx = this.rotation.x;
        const qy = this.rotation.y;
        const qz = this.rotation.z;
        const qw = this.rotation.w;

        return {
            x: 2 * (qx * qy - qw * qz),
            y: 1 - 2 * (qx * qx + qz * qz),
            z: 2 * (qy * qz + qw * qx)
        };
    }

    /**
     * Convert local ship position to world position
     */
    localToWorld(localPos) {
        // Rotate local position by ship rotation
        const qx = this.rotation.x;
        const qy = this.rotation.y;
        const qz = this.rotation.z;
        const qw = this.rotation.w;

        // Quaternion rotation: v' = q * v * q^-1
        const px = localPos.x;
        const py = localPos.y;
        const pz = localPos.z;

        // Optimized quaternion-vector rotation
        const ix = qw * px + qy * pz - qz * py;
        const iy = qw * py + qz * px - qx * pz;
        const iz = qw * pz + qx * py - qy * px;
        const iw = -qx * px - qy * py - qz * pz;

        return {
            x: this.position.x + (ix * qw + iw * -qx + iy * -qz - iz * -qy),
            y: this.position.y + (iy * qw + iw * -qy + iz * -qx - ix * -qz),
            z: this.position.z + (iz * qw + iw * -qz + ix * -qy - iy * -qx)
        };
    }

    /**
     * Convert world position to local ship position
     */
    worldToLocal(worldPos) {
        // Translate relative to ship
        const rx = worldPos.x - this.position.x;
        const ry = worldPos.y - this.position.y;
        const rz = worldPos.z - this.position.z;

        // Inverse rotation (conjugate for unit quaternion)
        const qx = -this.rotation.x;
        const qy = -this.rotation.y;
        const qz = -this.rotation.z;
        const qw = this.rotation.w;

        const ix = qw * rx + qy * rz - qz * ry;
        const iy = qw * ry + qz * rx - qx * rz;
        const iz = qw * rz + qx * ry - qy * rx;
        const iw = -qx * rx - qy * ry - qz * rz;

        return {
            x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
            y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
            z: iz * qw + iw * -qz + ix * -qy - iy * -qx
        };
    }

    /**
     * Serialize for network sync
     */
    serialize() {
        return {
            shipId: this.shipId,
            position: { ...this.position },
            velocity: { ...this.velocity },
            rotation: { ...this.rotation },
            angularVelocity: { ...this.angularVelocity },
            state: this.state,
            pilotId: this.pilotId,
            currentFuel: this.currentFuel,
            throttle: this.throttle
        };
    }

    /**
     * Apply server state update
     */
    applyServerState(state) {
        this.position = state.position || this.position;
        this.velocity = state.velocity || this.velocity;
        this.rotation = state.rotation || this.rotation;
        this.angularVelocity = state.angularVelocity || this.angularVelocity;
        this.state = state.state || this.state;
        this.pilotId = state.pilotId;
        this.currentFuel = state.currentFuel ?? this.currentFuel;
    }
}

/**
 * ShipManager - manages all ships visible to client
 */
export class ShipManager {
    constructor(options = {}) {
        this.playerId = options.playerId;
        this.wsAdapter = options.wsAdapter;

        // All known ships
        this.ships = new Map(); // shipId -> ShipInstance

        // Player's current ship (if aboard)
        this.currentShipId = null;
        this.isPiloting = false;
        this.localPosition = { x: 0, y: 0, z: 0 }; // Position on current ship

        // Update settings
        this.syncInterval = options.syncInterval || 50; // ms
        this.lastSyncTime = 0;

        // Bind event handlers
        if (this.wsAdapter) {
            this.setupNetworkHandlers();
        }
    }

    /**
     * Set up WebSocket event handlers
     */
    setupNetworkHandlers() {
        this.wsAdapter.on('ship_state', (msg) => this.handleShipState(msg));
        this.wsAdapter.on('ship_created', (msg) => this.handleShipCreated(msg));
        this.wsAdapter.on('ship_destroyed', (msg) => this.handleShipDestroyed(msg));
        this.wsAdapter.on('ship_boarded', (msg) => this.handleShipBoarded(msg));
        this.wsAdapter.on('ship_exited', (msg) => this.handleShipExited(msg));
        this.wsAdapter.on('pilot_change', (msg) => this.handlePilotChange(msg));
    }

    /**
     * Update all ships
     */
    update(deltaTime) {
        for (const ship of this.ships.values()) {
            ship.update(deltaTime);
        }

        // Sync piloted ship to server
        if (this.isPiloting && this.currentShipId) {
            const now = Date.now();
            if (now - this.lastSyncTime >= this.syncInterval) {
                this.syncShipState();
                this.lastSyncTime = now;
            }
        }
    }

    /**
     * Get ship by ID
     */
    getShip(shipId) {
        return this.ships.get(shipId);
    }

    /**
     * Get current ship (if aboard)
     */
    getCurrentShip() {
        if (!this.currentShipId) return null;
        return this.ships.get(this.currentShipId);
    }

    /**
     * Add a ship from server data
     */
    addShip(shipData) {
        const config = ShipConfig.deserialize(shipData.config || shipData);
        const instance = new ShipInstance(config);

        // Apply current state
        if (shipData.position) instance.position = shipData.position;
        if (shipData.velocity) instance.velocity = shipData.velocity;
        if (shipData.rotation) instance.rotation = shipData.rotation;
        instance.state = shipData.state || SHIP_STATE.INACTIVE;
        instance.pilotId = shipData.pilotId;
        instance.currentFuel = shipData.currentFuel ?? config.fuelCapacity;

        this.ships.set(config.shipId, instance);
        return instance;
    }

    /**
     * Remove a ship
     */
    removeShip(shipId) {
        if (this.currentShipId === shipId) {
            this.exitShip();
        }
        this.ships.delete(shipId);
    }

    // =============================================
    // BOARDING / PILOTING
    // =============================================

    /**
     * Board a ship
     */
    async boardShip(shipId, seatIndex = null) {
        const ship = this.ships.get(shipId);
        if (!ship) {
            console.warn('[ShipManager] Cannot board unknown ship:', shipId);
            return false;
        }

        // Request boarding from server
        if (this.wsAdapter) {
            await this.wsAdapter.send({
                type: 'board_ship',
                shipId,
                playerId: this.playerId,
                seatIndex
            });
        }

        // Optimistically set state
        this.currentShipId = shipId;
        this.isPiloting = seatIndex === 0 || ship.config.pilotSeat !== null;
        ship.passengers.set(this.playerId, { ...this.localPosition });

        if (this.isPiloting && !ship.pilotId) {
            ship.pilotId = this.playerId;
            ship.state = SHIP_STATE.PILOTED;
        }

        console.log(`[ShipManager] Boarded ship ${shipId}, piloting: ${this.isPiloting}`);
        return true;
    }

    /**
     * Exit current ship
     */
    async exitShip() {
        if (!this.currentShipId) return;

        const ship = this.ships.get(this.currentShipId);

        // Notify server
        if (this.wsAdapter) {
            await this.wsAdapter.send({
                type: 'exit_ship',
                shipId: this.currentShipId,
                playerId: this.playerId
            });
        }

        // Update local state
        if (ship) {
            ship.passengers.delete(this.playerId);
            if (ship.pilotId === this.playerId) {
                ship.pilotId = null;
                ship.state = ship.velocity.x !== 0 || ship.velocity.y !== 0 || ship.velocity.z !== 0
                    ? SHIP_STATE.DRIFTING
                    : SHIP_STATE.INACTIVE;
            }
        }

        this.currentShipId = null;
        this.isPiloting = false;
        this.localPosition = { x: 0, y: 0, z: 0 };

        console.log('[ShipManager] Exited ship');
    }

    /**
     * Take pilot controls
     */
    async takePilotSeat() {
        const ship = this.getCurrentShip();
        if (!ship || ship.pilotId) return false;

        if (this.wsAdapter) {
            await this.wsAdapter.send({
                type: 'take_pilot_seat',
                shipId: this.currentShipId,
                playerId: this.playerId
            });
        }

        ship.pilotId = this.playerId;
        ship.state = SHIP_STATE.PILOTED;
        this.isPiloting = true;

        return true;
    }

    /**
     * Release pilot controls
     */
    async releasePilotSeat() {
        const ship = this.getCurrentShip();
        if (!ship || ship.pilotId !== this.playerId) return false;

        if (this.wsAdapter) {
            await this.wsAdapter.send({
                type: 'release_pilot_seat',
                shipId: this.currentShipId,
                playerId: this.playerId
            });
        }

        ship.pilotId = null;
        ship.state = SHIP_STATE.DRIFTING;
        this.isPiloting = false;

        return true;
    }

    // =============================================
    // CONTROLS
    // =============================================

    /**
     * Set throttle (when piloting)
     */
    setThrottle(value) {
        const ship = this.getCurrentShip();
        if (!ship || !this.isPiloting) return;
        ship.throttle = Math.max(-1, Math.min(1, value));
    }

    /**
     * Set pitch (when piloting)
     */
    setPitch(value) {
        const ship = this.getCurrentShip();
        if (!ship || !this.isPiloting) return;
        ship.pitch = Math.max(-1, Math.min(1, value));
    }

    /**
     * Set yaw (when piloting)
     */
    setYaw(value) {
        const ship = this.getCurrentShip();
        if (!ship || !this.isPiloting) return;
        ship.yaw = Math.max(-1, Math.min(1, value));
    }

    /**
     * Set roll (when piloting)
     */
    setRoll(value) {
        const ship = this.getCurrentShip();
        if (!ship || !this.isPiloting) return;
        ship.roll = Math.max(-1, Math.min(1, value));
    }

    /**
     * Release all controls (stop input)
     */
    releaseControls() {
        const ship = this.getCurrentShip();
        if (!ship) return;
        ship.throttle = 0;
        ship.pitch = 0;
        ship.yaw = 0;
        ship.roll = 0;
    }

    // =============================================
    // NETWORK SYNC
    // =============================================

    /**
     * Sync current ship state to server
     */
    syncShipState() {
        const ship = this.getCurrentShip();
        if (!ship || !this.isPiloting || !this.wsAdapter) return;

        this.wsAdapter.send({
            type: 'ship_control',
            shipId: ship.shipId,
            position: ship.position,
            velocity: ship.velocity,
            rotation: ship.rotation,
            throttle: ship.throttle,
            pitch: ship.pitch,
            yaw: ship.yaw,
            roll: ship.roll,
            currentFuel: ship.currentFuel
        });
    }

    // =============================================
    // NETWORK EVENT HANDLERS
    // =============================================

    handleShipState(msg) {
        const ship = this.ships.get(msg.shipId);
        if (!ship) {
            // Unknown ship, add it
            this.addShip(msg);
            return;
        }

        // Don't override local state if we're piloting
        if (ship.pilotId === this.playerId && this.isPiloting) {
            // Only update fuel and passengers from server
            ship.currentFuel = msg.currentFuel ?? ship.currentFuel;
            return;
        }

        ship.applyServerState(msg);
    }

    handleShipCreated(msg) {
        console.log('[ShipManager] Ship created:', msg.shipId);
        this.addShip(msg);
    }

    handleShipDestroyed(msg) {
        console.log('[ShipManager] Ship destroyed:', msg.shipId);
        this.removeShip(msg.shipId);
    }

    handleShipBoarded(msg) {
        const ship = this.ships.get(msg.shipId);
        if (!ship) return;

        ship.passengers.set(msg.playerId, msg.localPosition || { x: 0, y: 0, z: 0 });

        if (msg.isPilot && !ship.pilotId) {
            ship.pilotId = msg.playerId;
            ship.state = SHIP_STATE.PILOTED;
        }
    }

    handleShipExited(msg) {
        const ship = this.ships.get(msg.shipId);
        if (!ship) return;

        ship.passengers.delete(msg.playerId);

        if (ship.pilotId === msg.playerId) {
            ship.pilotId = null;
            ship.state = SHIP_STATE.DRIFTING;
        }
    }

    handlePilotChange(msg) {
        const ship = this.ships.get(msg.shipId);
        if (!ship) return;

        ship.pilotId = msg.pilotId;
        ship.state = msg.pilotId ? SHIP_STATE.PILOTED : SHIP_STATE.DRIFTING;
    }

    // =============================================
    // PLAYER POSITION
    // =============================================

    /**
     * Get player world position (accounting for ship if aboard)
     */
    getPlayerWorldPosition(basePosition) {
        const ship = this.getCurrentShip();
        if (!ship) return basePosition;

        // Player position is relative to ship
        return ship.localToWorld(this.localPosition);
    }

    /**
     * Update player local position on ship
     */
    setLocalPosition(x, y, z) {
        this.localPosition = { x, y, z };

        const ship = this.getCurrentShip();
        if (ship) {
            ship.passengers.set(this.playerId, { ...this.localPosition });
        }
    }
}

export default ShipManager;
