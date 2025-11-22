/**
 * ships.js
 * WebSocket handlers for ship/vehicle operations
 *
 * Handles:
 * - Ship state synchronization
 * - Boarding/disembarking
 * - Pilot seat management
 * - Ship control input
 * - Ship creation from builds
 */

import logger from '../../utils/logger.js';

const log = logger.child('Ships');

/**
 * Create handler for ship control input
 */
export function createShipControlHandler(wsServer, worldServerDB) {
    return async (connectionId, message) => {
        const { shipId, position, velocity, rotation, throttle, pitch, yaw, roll, currentFuel } = message;

        const clientInfo = wsServer.clients.get(connectionId);
        if (!clientInfo || !clientInfo.playerId) {
            return { error: 'Not authenticated' };
        }

        try {
            // Verify player is piloting this ship
            const ship = await worldServerDB.getShip(shipId);
            if (!ship) {
                return { error: 'Ship not found' };
            }

            if (ship.pilot_id !== clientInfo.playerId) {
                return { error: 'Not piloting this ship' };
            }

            // Update ship state in database
            await worldServerDB.updateShipState(shipId, {
                position_x: position.x,
                position_y: position.y,
                position_z: position.z,
                velocity_x: velocity.x,
                velocity_y: velocity.y,
                velocity_z: velocity.z,
                rotation_x: rotation.x,
                rotation_y: rotation.y,
                rotation_z: rotation.z,
                rotation_w: rotation.w,
                current_fuel: currentFuel
            });

            // Broadcast to players in same megachunk (excluding pilot)
            wsServer.broadcastToMegachunk(ship.megachunk_id, {
                type: 'ship_state',
                shipId,
                position,
                velocity,
                rotation,
                state: 'piloted',
                pilotId: clientInfo.playerId,
                currentFuel,
                throttle
            }, connectionId);

            return { success: true };
        } catch (error) {
            log.error('Ship control error:', error);
            return { error: 'Failed to update ship state' };
        }
    };
}

/**
 * Create handler for boarding a ship
 */
export function createBoardShipHandler(wsServer, worldServerDB) {
    return async (connectionId, message) => {
        const { shipId, seatIndex } = message;

        const clientInfo = wsServer.clients.get(connectionId);
        if (!clientInfo || !clientInfo.playerId) {
            return { error: 'Not authenticated' };
        }

        try {
            // Check if player is already on a ship
            const currentShip = await worldServerDB.getPlayerShip(clientInfo.playerId);
            if (currentShip) {
                return { error: 'Already on a ship' };
            }

            // Get ship
            const ship = await worldServerDB.getShip(shipId);
            if (!ship) {
                return { error: 'Ship not found' };
            }

            if (ship.state === 'destroyed') {
                return { error: 'Ship is destroyed' };
            }

            // Determine if becoming pilot
            const isPilot = seatIndex === 0 || (!ship.pilot_id && seatIndex === null);

            // Add player to ship
            await worldServerDB.addShipPassenger(shipId, clientInfo.playerId, {
                isPilot,
                seatIndex: isPilot ? 0 : seatIndex
            });

            // Update ship state if becoming pilot
            if (isPilot) {
                await worldServerDB.updateShipState(shipId, {
                    pilot_id: clientInfo.playerId,
                    state: 'piloted',
                    last_piloted_at: new Date()
                });
            }

            // Broadcast boarding to ship passengers and nearby players
            wsServer.broadcastToMegachunk(ship.megachunk_id, {
                type: 'ship_boarded',
                shipId,
                playerId: clientInfo.playerId,
                isPilot,
                seatIndex: isPilot ? 0 : seatIndex,
                localPosition: { x: 0, y: 0, z: 0 }
            });

            log.info(`Player ${clientInfo.playerId} boarded ship ${shipId}${isPilot ? ' as pilot' : ''}`);

            return {
                success: true,
                isPilot,
                ship: {
                    shipId,
                    position: { x: ship.position_x, y: ship.position_y, z: ship.position_z },
                    velocity: { x: ship.velocity_x, y: ship.velocity_y, z: ship.velocity_z },
                    rotation: { x: ship.rotation_x, y: ship.rotation_y, z: ship.rotation_z, w: ship.rotation_w },
                    state: isPilot ? 'piloted' : ship.state,
                    pilotId: isPilot ? clientInfo.playerId : ship.pilot_id,
                    currentFuel: ship.current_fuel
                }
            };
        } catch (error) {
            log.error('Board ship error:', error);
            return { error: 'Failed to board ship' };
        }
    };
}

/**
 * Create handler for exiting a ship
 */
export function createExitShipHandler(wsServer, worldServerDB) {
    return async (connectionId, message) => {
        const { shipId } = message;

        const clientInfo = wsServer.clients.get(connectionId);
        if (!clientInfo || !clientInfo.playerId) {
            return { error: 'Not authenticated' };
        }

        try {
            const ship = await worldServerDB.getShip(shipId);
            if (!ship) {
                return { error: 'Ship not found' };
            }

            // Check if player is on this ship
            const passenger = await worldServerDB.getShipPassenger(shipId, clientInfo.playerId);
            if (!passenger) {
                return { error: 'Not on this ship' };
            }

            // Remove passenger
            await worldServerDB.removeShipPassenger(shipId, clientInfo.playerId);

            // If was pilot, update ship state
            if (ship.pilot_id === clientInfo.playerId) {
                const newState = (ship.velocity_x !== 0 || ship.velocity_y !== 0 || ship.velocity_z !== 0)
                    ? 'drifting'
                    : 'inactive';

                await worldServerDB.updateShipState(shipId, {
                    pilot_id: null,
                    state: newState
                });
            }

            // Broadcast exit
            wsServer.broadcastToMegachunk(ship.megachunk_id, {
                type: 'ship_exited',
                shipId,
                playerId: clientInfo.playerId,
                wasPilot: ship.pilot_id === clientInfo.playerId,
                exitPosition: {
                    x: ship.position_x,
                    y: ship.position_y + 2, // Spawn slightly above ship
                    z: ship.position_z
                }
            });

            log.info(`Player ${clientInfo.playerId} exited ship ${shipId}`);

            return {
                success: true,
                exitPosition: {
                    x: ship.position_x,
                    y: ship.position_y + 2,
                    z: ship.position_z
                }
            };
        } catch (error) {
            log.error('Exit ship error:', error);
            return { error: 'Failed to exit ship' };
        }
    };
}

/**
 * Create handler for taking pilot seat
 */
export function createTakePilotSeatHandler(wsServer, worldServerDB) {
    return async (connectionId, message) => {
        const { shipId } = message;

        const clientInfo = wsServer.clients.get(connectionId);
        if (!clientInfo || !clientInfo.playerId) {
            return { error: 'Not authenticated' };
        }

        try {
            const ship = await worldServerDB.getShip(shipId);
            if (!ship) {
                return { error: 'Ship not found' };
            }

            // Check if already has a pilot
            if (ship.pilot_id) {
                return { error: 'Ship already has a pilot' };
            }

            // Check player is on the ship
            const passenger = await worldServerDB.getShipPassenger(shipId, clientInfo.playerId);
            if (!passenger) {
                return { error: 'Not on this ship' };
            }

            // Update to pilot
            await worldServerDB.updateShipPassenger(shipId, clientInfo.playerId, {
                is_pilot: true,
                seat_index: 0
            });

            await worldServerDB.updateShipState(shipId, {
                pilot_id: clientInfo.playerId,
                state: 'piloted',
                last_piloted_at: new Date()
            });

            // Broadcast pilot change
            wsServer.broadcastToMegachunk(ship.megachunk_id, {
                type: 'pilot_change',
                shipId,
                pilotId: clientInfo.playerId
            });

            return { success: true };
        } catch (error) {
            log.error('Take pilot seat error:', error);
            return { error: 'Failed to take pilot seat' };
        }
    };
}

/**
 * Create handler for releasing pilot seat
 */
export function createReleasePilotSeatHandler(wsServer, worldServerDB) {
    return async (connectionId, message) => {
        const { shipId } = message;

        const clientInfo = wsServer.clients.get(connectionId);
        if (!clientInfo || !clientInfo.playerId) {
            return { error: 'Not authenticated' };
        }

        try {
            const ship = await worldServerDB.getShip(shipId);
            if (!ship) {
                return { error: 'Ship not found' };
            }

            if (ship.pilot_id !== clientInfo.playerId) {
                return { error: 'Not the pilot' };
            }

            // Update passenger to non-pilot
            await worldServerDB.updateShipPassenger(shipId, clientInfo.playerId, {
                is_pilot: false,
                seat_index: null
            });

            // Update ship state
            const newState = (ship.velocity_x !== 0 || ship.velocity_y !== 0 || ship.velocity_z !== 0)
                ? 'drifting'
                : 'inactive';

            await worldServerDB.updateShipState(shipId, {
                pilot_id: null,
                state: newState
            });

            // Broadcast pilot change
            wsServer.broadcastToMegachunk(ship.megachunk_id, {
                type: 'pilot_change',
                shipId,
                pilotId: null
            });

            return { success: true };
        } catch (error) {
            log.error('Release pilot seat error:', error);
            return { error: 'Failed to release pilot seat' };
        }
    };
}

/**
 * Create handler for requesting ships in area
 */
export function createShipsRequestHandler(wsServer, worldServerDB) {
    return async (connectionId, message) => {
        const { megachunkId } = message;

        const clientInfo = wsServer.clients.get(connectionId);
        if (!clientInfo || !clientInfo.playerId) {
            return { error: 'Not authenticated' };
        }

        try {
            const ships = await worldServerDB.getShipsInMegachunk(megachunkId);

            return {
                type: 'ships_data',
                megachunkId,
                ships: ships.map(ship => ({
                    shipId: ship.ship_id,
                    name: ship.name,
                    ownerId: ship.owner_id,
                    state: ship.state,
                    pilotId: ship.pilot_id,
                    position: { x: ship.position_x, y: ship.position_y, z: ship.position_z },
                    velocity: { x: ship.velocity_x, y: ship.velocity_y, z: ship.velocity_z },
                    rotation: { x: ship.rotation_x, y: ship.rotation_y, z: ship.rotation_z, w: ship.rotation_w },
                    mass: ship.mass,
                    totalThrust: ship.total_thrust,
                    currentFuel: ship.current_fuel,
                    fuelCapacity: ship.fuel_capacity
                }))
            };
        } catch (error) {
            log.error('Ships request error:', error);
            return { error: 'Failed to get ships' };
        }
    };
}

/**
 * Create handler for creating a ship from schematic placement
 */
export function createShipCreationHandler(wsServer, worldServerDB) {
    return async (connectionId, message) => {
        const { schematicPlacementId, shipConfig, name } = message;

        const clientInfo = wsServer.clients.get(connectionId);
        if (!clientInfo || !clientInfo.playerId) {
            return { error: 'Not authenticated' };
        }

        try {
            // Verify placement exists and player owns it
            const placement = await worldServerDB.getSchematicPlacement(schematicPlacementId);
            if (!placement) {
                return { error: 'Placement not found' };
            }

            if (placement.placed_by !== clientInfo.playerId) {
                return { error: 'Not the owner of this placement' };
            }

            // Check if placement is already a ship
            const existingShip = await worldServerDB.getShipByPlacement(schematicPlacementId);
            if (existingShip) {
                return { error: 'Already registered as a ship' };
            }

            // Get the body to find megachunk_id
            const body = await worldServerDB.getCelestialBodyById(placement.body_id);
            const megachunkId = body ? body.megachunk_id : null;

            // Create ship record
            const ship = await worldServerDB.createShip({
                schematicPlacementId,
                ownerId: clientInfo.playerId,
                name: name || 'Unnamed Ship',
                megachunkId: megachunkId,
                position: {
                    x: placement.position_x,
                    y: placement.position_y,
                    z: placement.position_z
                },
                rotation: {
                    x: placement.rotation_x,
                    y: placement.rotation_y,
                    z: placement.rotation_z,
                    w: placement.rotation_w
                },
                config: shipConfig
            });

            // Broadcast ship creation to megachunk (if known)
            if (megachunkId) {
                wsServer.broadcastToMegachunk(megachunkId, {
                    type: 'ship_created',
                    shipId: ship.ship_id,
                    name: ship.name,
                    ownerId: ship.owner_id,
                    position: { x: ship.position_x, y: ship.position_y, z: ship.position_z },
                    rotation: { x: ship.rotation_x, y: ship.rotation_y, z: ship.rotation_z, w: ship.rotation_w },
                    config: shipConfig
                });
            }

            log.info(`Ship ${ship.ship_id} created from placement ${schematicPlacementId}`);

            return {
                success: true,
                shipId: ship.ship_id
            };
        } catch (error) {
            log.error('Ship creation error:', error);
            return { error: 'Failed to create ship' };
        }
    };
}

/**
 * Register all ship handlers
 */
export function registerShipHandlers(wsServer, worldServerDB) {
    wsServer.registerHandler('ship_control', createShipControlHandler(wsServer, worldServerDB));
    wsServer.registerHandler('board_ship', createBoardShipHandler(wsServer, worldServerDB));
    wsServer.registerHandler('exit_ship', createExitShipHandler(wsServer, worldServerDB));
    wsServer.registerHandler('take_pilot_seat', createTakePilotSeatHandler(wsServer, worldServerDB));
    wsServer.registerHandler('release_pilot_seat', createReleasePilotSeatHandler(wsServer, worldServerDB));
    wsServer.registerHandler('request_ships', createShipsRequestHandler(wsServer, worldServerDB));
    wsServer.registerHandler('create_ship', createShipCreationHandler(wsServer, worldServerDB));

    log.info('Ship handlers registered');
}

export default {
    registerShipHandlers,
    createShipControlHandler,
    createBoardShipHandler,
    createExitShipHandler,
    createTakePilotSeatHandler,
    createReleasePilotSeatHandler,
    createShipsRequestHandler,
    createShipCreationHandler
};
