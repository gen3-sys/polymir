export class FactionManager {
    constructor(config = {}) {
        this.config = {
            baseBlockLimit: config.baseBlockLimit || 100,
            blockExpansionCost: config.blockExpansionCost || 1000,
            blockExpansionAmount: config.blockExpansionAmount || 50,
            startingCurrency: config.startingCurrency || 10000,
            fleetBonusMultiplier: config.fleetBonusMultiplier || 0.2,
            ...config
        };

        this.factions = new Map();
        this.factionRelationships = new Map();
        this.factionCurrencies = new Map();
        this.factionShips = new Map();
        this.factionFleets = new Map();
        this.shipFactionMap = new Map();
        this.factionBlockLimits = new Map();
        this.factionBlockCounts = new Map();

        this.initialize();
    }

    initialize() {
        this.createDefaultFactions();
        this.initializeRelationships();
        this.initializeCurrencies();
    }

    createDefaultFactions() {
        const defaultFactions = [
            {
                id: 'neutral',
                name: 'Neutral',
                type: 'neutral',
                color: 0x888888,
                blockBonus: 1.0,
                fleetBonus: 1.0,
                currencyBonus: 1.0
            },
            {
                id: 'explorers',
                name: 'Explorers',
                type: 'explorer',
                color: 0x4CAF50,
                blockBonus: 1.2,
                fleetBonus: 1.1,
                currencyBonus: 1.3
            },
            {
                id: 'fighters',
                name: 'Fighters',
                type: 'combat',
                color: 0xF44336,
                blockBonus: 1.1,
                fleetBonus: 1.3,
                currencyBonus: 0.9
            },
            {
                id: 'traders',
                name: 'Traders',
                type: 'economic',
                color: 0xFF9800,
                blockBonus: 1.3,
                fleetBonus: 0.9,
                currencyBonus: 1.5
            },
            {
                id: 'miners',
                name: 'Miners',
                type: 'industrial',
                color: 0x795548,
                blockBonus: 1.1,
                fleetBonus: 1.0,
                currencyBonus: 1.2
            }
        ];

        for (const factionData of defaultFactions) {
            this.createFaction(factionData);
        }
    }

    initializeRelationships() {
        const relationships = {
            'neutral': { 'neutral': 0, 'explorers': 0, 'fighters': 0, 'traders': 0, 'miners': 0 },
            'explorers': { 'neutral': 0, 'explorers': 1, 'fighters': -0.3, 'traders': 0.5, 'miners': 0.2 },
            'fighters': { 'neutral': 0, 'explorers': -0.3, 'fighters': 0.8, 'traders': -0.5, 'miners': -0.2 },
            'traders': { 'neutral': 0, 'explorers': 0.5, 'fighters': -0.5, 'traders': 0.9, 'miners': 0.7 },
            'miners': { 'neutral': 0, 'explorers': 0.2, 'fighters': -0.2, 'traders': 0.7, 'miners': 0.6 }
        };

        for (const [faction1, relations] of Object.entries(relationships)) {
            this.factionRelationships.set(faction1, new Map(Object.entries(relations)));
        }
    }

    initializeCurrencies() {
        for (const factionId of this.factions.keys()) {
            this.factionCurrencies.set(factionId, this.config.startingCurrency);
        }
    }

    createFaction(factionData) {
        const factionId = factionData.id;

        if (this.factions.has(factionId)) {
            return null;
        }

        const faction = {
            id: factionId,
            name: factionData.name,
            type: factionData.type,
            color: factionData.color,
            blockBonus: factionData.blockBonus,
            fleetBonus: factionData.fleetBonus,
            currencyBonus: factionData.currencyBonus,
            created: Date.now(),
            memberCount: 0,
            shipCount: 0,
            fleetCount: 0
        };

        this.factions.set(factionId, faction);
        this.factionShips.set(factionId, new Set());
        this.factionFleets.set(factionId, new Map());
        this.factionBlockLimits.set(factionId, this.config.baseBlockLimit);
        this.factionBlockCounts.set(factionId, 0);

        this.factionRelationships.set(factionId, new Map());
        for (const otherFactionId of this.factions.keys()) {
            this.factionRelationships.get(factionId).set(otherFactionId, 0);
            if (otherFactionId !== factionId) {
                this.factionRelationships.get(otherFactionId).set(factionId, 0);
            }
        }

        this.factionCurrencies.set(factionId, this.config.startingCurrency);

        return factionId;
    }

    assignShipToFaction(shipId, factionId) {
        if (!this.factions.has(factionId)) return false;

        const previousFaction = this.shipFactionMap.get(shipId);
        if (previousFaction) {
            this.factionShips.get(previousFaction).delete(shipId);
            this.factions.get(previousFaction).shipCount--;
        }

        this.shipFactionMap.set(shipId, factionId);
        this.factionShips.get(factionId).add(shipId);
        this.factions.get(factionId).shipCount++;

        return true;
    }

    getShipFaction(shipId) {
        return this.shipFactionMap.get(shipId) || null;
    }

    getEffectiveBlockLimit(factionId) {
        const baseLimit = this.factionBlockLimits.get(factionId) || this.config.baseBlockLimit;
        const faction = this.factions.get(factionId);
        const factionBonus = faction ? faction.blockBonus : 1.0;
        return Math.floor(baseLimit * factionBonus);
    }

    expandBlockLimit(factionId, amount = this.config.blockExpansionAmount) {
        const currentLimit = this.factionBlockLimits.get(factionId) || this.config.baseBlockLimit;
        const cost = this.config.blockExpansionCost * (amount / this.config.blockExpansionAmount);

        if (!this.spendCurrency(factionId, cost)) {
            return false;
        }

        this.factionBlockLimits.set(factionId, currentLimit + amount);
        return true;
    }

    addBlocksToFaction(factionId, blockCount) {
        const currentCount = this.factionBlockCounts.get(factionId) || 0;
        const newCount = currentCount + blockCount;
        const effectiveLimit = this.getEffectiveBlockLimit(factionId);

        if (newCount > effectiveLimit) {
            return false;
        }

        this.factionBlockCounts.set(factionId, newCount);
        this.factions.get(factionId).totalBlocks = newCount;

        return true;
    }

    removeBlocksFromFaction(factionId, blockCount) {
        const currentCount = this.factionBlockCounts.get(factionId) || 0;
        const newCount = Math.max(0, currentCount - blockCount);

        this.factionBlockCounts.set(factionId, newCount);
        this.factions.get(factionId).totalBlocks = newCount;

        return true;
    }

    getFactionCurrency(factionId) {
        return this.factionCurrencies.get(factionId) || 0;
    }

    addCurrency(factionId, amount) {
        if (amount <= 0) return false;

        const currentCurrency = this.factionCurrencies.get(factionId) || 0;
        const faction = this.factions.get(factionId);
        const factionBonus = faction ? faction.currencyBonus : 1.0;
        const newCurrency = currentCurrency + (amount * factionBonus);

        this.factionCurrencies.set(factionId, newCurrency);
        return true;
    }

    spendCurrency(factionId, amount) {
        if (amount <= 0) return true;

        const currentCurrency = this.factionCurrencies.get(factionId) || 0;

        if (currentCurrency < amount) {
            return false;
        }

        this.factionCurrencies.set(factionId, currentCurrency - amount);
        return true;
    }

    getRelationship(faction1Id, faction2Id) {
        const relations = this.factionRelationships.get(faction1Id);
        if (!relations) return 0;
        return relations.get(faction2Id) || 0;
    }

    setRelationship(faction1Id, faction2Id, value) {
        const clampedValue = Math.max(-1, Math.min(1, value));

        const relations1 = this.factionRelationships.get(faction1Id);
        const relations2 = this.factionRelationships.get(faction2Id);

        if (!relations1 || !relations2) return false;

        relations1.set(faction2Id, clampedValue);
        relations2.set(faction1Id, clampedValue);

        return true;
    }

    createFleet(factionId, fleetName) {
        const fleets = this.factionFleets.get(factionId);
        if (!fleets) return null;

        const fleetId = `fleet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        const fleet = {
            id: fleetId,
            name: fleetName,
            factionId: factionId,
            ships: new Set(),
            leader: null,
            created: Date.now()
        };

        fleets.set(fleetId, fleet);
        this.factions.get(factionId).fleetCount++;

        return fleetId;
    }

    addShipToFleet(fleetId, shipId) {
        const shipFaction = this.getShipFaction(shipId);
        if (!shipFaction) return false;

        const fleets = this.factionFleets.get(shipFaction);
        if (!fleets) return false;

        const fleet = fleets.get(fleetId);
        if (!fleet) return false;

        fleet.ships.add(shipId);

        if (fleet.ships.size === 1) {
            fleet.leader = shipId;
        }

        return true;
    }

    getFleetBonus(shipId) {
        const shipFaction = this.getShipFaction(shipId);
        if (!shipFaction) return 1.0;

        const fleets = this.factionFleets.get(shipFaction);
        if (!fleets) return 1.0;

        for (const fleet of fleets.values()) {
            if (fleet.ships.has(shipId)) {
                const fleetSize = fleet.ships.size;
                const faction = this.factions.get(shipFaction);
                const factionBonus = faction ? faction.fleetBonus : 1.0;
                return 1.0 + (fleetSize - 1) * this.config.fleetBonusMultiplier * factionBonus;
            }
        }

        return 1.0;
    }

    getFactionState(factionId) {
        const faction = this.factions.get(factionId);
        if (!faction) return null;

        return {
            ...faction,
            currency: this.getFactionCurrency(factionId),
            blockLimit: this.getEffectiveBlockLimit(factionId),
            blockCount: this.factionBlockCounts.get(factionId) || 0
        };
    }

    save() {
        return {
            factions: Array.from(this.factions.entries()),
            factionRelationships: Array.from(this.factionRelationships.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
            factionCurrencies: Array.from(this.factionCurrencies.entries()),
            factionShips: Array.from(this.factionShips.entries()).map(([k, v]) => [k, Array.from(v)]),
            factionFleets: Array.from(this.factionFleets.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
            shipFactionMap: Array.from(this.shipFactionMap.entries()),
            factionBlockLimits: Array.from(this.factionBlockLimits.entries()),
            factionBlockCounts: Array.from(this.factionBlockCounts.entries())
        };
    }

    load(data) {
        if (data.factions) {
            this.factions = new Map(data.factions);
        }
        if (data.factionRelationships) {
            this.factionRelationships = new Map(data.factionRelationships.map(([k, v]) => [k, new Map(v)]));
        }
        if (data.factionCurrencies) {
            this.factionCurrencies = new Map(data.factionCurrencies);
        }
        if (data.factionShips) {
            this.factionShips = new Map(data.factionShips.map(([k, v]) => [k, new Set(v)]));
        }
        if (data.factionFleets) {
            this.factionFleets = new Map(data.factionFleets.map(([k, v]) => [k, new Map(v)]));
        }
        if (data.shipFactionMap) {
            this.shipFactionMap = new Map(data.shipFactionMap);
        }
        if (data.factionBlockLimits) {
            this.factionBlockLimits = new Map(data.factionBlockLimits);
        }
        if (data.factionBlockCounts) {
            this.factionBlockCounts = new Map(data.factionBlockCounts);
        }
    }
}

export default FactionManager;
