export class BiomeConfigEventBus {
    constructor() {
        this.listeners = new Map();
        this.eventHistory = [];
        this.maxHistorySize = 100;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        const callbacks = this.listeners.get(event);
        callbacks.push(callback);

        return () => {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    once(event, callback) {
        const unsubscribe = this.on(event, (data) => {
            callback(data);
            unsubscribe();
        });
        return unsubscribe;
    }

    emit(event, data = null) {
        this.recordEvent(event, data);

        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }

        if (this.listeners.has('*')) {
            const wildcardCallbacks = this.listeners.get('*');
            wildcardCallbacks.forEach(callback => {
                try {
                    callback({ event, data });
                } catch (error) {
                    console.error(`Error in wildcard event listener:`, error);
                }
            });
        }
    }

    off(event, callback = null) {
        if (callback === null) {
            this.listeners.delete(event);
        } else if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    clear() {
        this.listeners.clear();
    }

    recordEvent(event, data) {
        this.eventHistory.push({
            event,
            data,
            timestamp: Date.now()
        });

        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }

    getEventHistory(event = null) {
        if (event === null) {
            return [...this.eventHistory];
        }
        return this.eventHistory.filter(e => e.event === event);
    }

    hasListeners(event) {
        return this.listeners.has(event) && this.listeners.get(event).length > 0;
    }

    getListenerCount(event) {
        if (!this.listeners.has(event)) return 0;
        return this.listeners.get(event).length;
    }
}

const globalBiomeEventBus = new BiomeConfigEventBus();

export const BIOME_EVENTS = {
    DISTRIBUTION_CHANGED: 'biome:distribution:changed',
    STRUCTURE_TOGGLED: 'biome:structure:toggled',
    VEGETATION_CHANGED: 'biome:vegetation:changed',
    CONFIG_LOADED: 'biome:config:loaded',
    CONFIG_SAVED: 'biome:config:saved',
    CONFIG_RESET: 'biome:config:reset',
    PALETTE_CHANGED: 'biome:palette:changed',
    BIOME_SELECTED: 'biome:selected'
};

export default globalBiomeEventBus;
