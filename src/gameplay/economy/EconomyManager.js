export class EconomyManager {
    constructor(factionManager) {
        this.factionManager = factionManager;

        this.currency = new Map();
        this.markets = new Map();
        this.resources = new Map();
        this.claimedSystems = new Map();
        this.ships = new Map();
        this.resourceTypes = new Map();
        this.rarityLevels = new Map();

        this.initialize();
    }

    initialize() {
        this.setupCurrencySystem();
        this.setupMarketSystem();
        this.setupResourceSystem();
        this.setupShipTypes();
    }

    setupCurrencySystem() {
        this.currency.set('credits', {
            name: 'Credits',
            symbol: '₵',
            decimals: 2,
            totalSupply: 1000000000,
            circulatingSupply: 0,
            inflationRate: 0.02
        });

        this.currency.set('wallets', new Map());
    }

    setupMarketSystem() {
        const marketTypes = ['local', 'regional', 'galactic', 'universal'];

        for (const type of marketTypes) {
            this.markets.set(type, {
                type: type,
                items: new Map(),
                transactions: [],
                lastUpdate: Date.now(),
                volatility: this.getMarketVolatility(type)
            });
        }
    }

    setupResourceSystem() {
        const resourceTypes = {
            ore: ['iron', 'copper', 'gold', 'platinum', 'titanium', 'uranium'],
            gas: ['hydrogen', 'helium', 'oxygen', 'nitrogen', 'methane'],
            crystal: ['quartz', 'diamond', 'emerald', 'ruby', 'sapphire'],
            organic: ['wood', 'leather', 'fiber', 'oil', 'protein'],
            exotic: ['antimatter', 'darkmatter', 'neutronium', 'quantum']
        };

        this.resourceTypes = new Map(Object.entries(resourceTypes));

        const rarityLevels = {
            common: { dropRate: 0.8, priceMultiplier: 1.0 },
            uncommon: { dropRate: 0.15, priceMultiplier: 2.0 },
            rare: { dropRate: 0.04, priceMultiplier: 5.0 },
            epic: { dropRate: 0.008, priceMultiplier: 15.0 },
            legendary: { dropRate: 0.002, priceMultiplier: 50.0 }
        };

        this.rarityLevels = new Map(Object.entries(rarityLevels));
    }

    setupShipTypes() {
        const shipTypes = {
            fighter: { maxSize: 100, baseCost: 1000, factionLimit: 5 },
            cruiser: { maxSize: 500, baseCost: 5000, factionLimit: 3 },
            capital: { maxSize: 2000, baseCost: 25000, factionLimit: 1 },
            freighter: { maxSize: 1000, baseCost: 10000, factionLimit: 2 },
            explorer: { maxSize: 300, baseCost: 3000, factionLimit: 4 }
        };

        this.ships.set('types', shipTypes);
    }

    claimSystem(systemId, playerId, factionId = null) {
        if (this.claimedSystems.has(systemId)) {
            return null;
        }

        const claimCost = this.calculateClaimCost(systemId);

        if (!this.hasSufficientFunds(playerId, claimCost)) {
            return null;
        }

        const claim = {
            systemId: systemId,
            playerId: playerId,
            factionId: factionId,
            claimCost: claimCost,
            claimDate: Date.now()
        };

        this.deductFunds(playerId, claimCost);
        this.claimedSystems.set(systemId, claim);

        if (factionId && this.factionManager) {
            this.factionManager.addCurrency(factionId, claimCost * 0.1);
        }

        return claim;
    }

    calculateClaimCost(systemId) {
        return 10000;
    }

    createMarketTransaction(buyerId, sellerId, itemId, quantity, price, marketType = 'local') {
        const market = this.markets.get(marketType);
        if (!market) return null;

        if (!this.hasSufficientFunds(buyerId, price * quantity)) {
            return null;
        }

        const transaction = {
            id: this.generateTransactionId(),
            buyerId: buyerId,
            sellerId: sellerId,
            itemId: itemId,
            quantity: quantity,
            price: price,
            totalValue: price * quantity,
            marketType: marketType,
            timestamp: Date.now(),
            status: 'pending'
        };

        this.executeTransaction(transaction);

        market.transactions.push(transaction);
        market.lastUpdate = Date.now();

        return transaction;
    }

    executeTransaction(transaction) {
        this.transferFunds(transaction.buyerId, transaction.sellerId, transaction.totalValue);
        this.updateMarketPrice(transaction.itemId, transaction.marketType, transaction.price);
        transaction.status = 'completed';
    }

    generateResourceDrop(location, biome, rarity = 'common') {
        const resourceType = this.selectResourceType(biome);
        const resource = this.selectResource(resourceType, rarity);
        const quantity = this.calculateDropQuantity(rarity);

        const drop = {
            id: this.generateDropId(),
            resourceId: resource,
            quantity: quantity,
            rarity: rarity,
            location: location,
            biome: biome,
            timestamp: Date.now(),
            collected: false,
            collector: null
        };

        if (!this.resources.has('drops')) {
            this.resources.set('drops', new Map());
        }
        this.resources.get('drops').set(drop.id, drop);

        return drop;
    }

    selectResourceType(biome) {
        const biomeResources = {
            desert: ['ore', 'crystal'],
            forest: ['organic', 'ore'],
            ocean: ['organic', 'gas'],
            mountain: ['ore', 'crystal'],
            volcanic: ['ore', 'exotic'],
            ice: ['crystal', 'gas'],
            space: ['exotic', 'gas']
        };

        const availableTypes = biomeResources[biome] || ['ore'];
        return availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }

    selectResource(resourceType, rarity) {
        const resources = this.resourceTypes.get(resourceType) || [];
        if (resources.length === 0) return 'unknown';

        return resources[Math.floor(Math.random() * resources.length)];
    }

    calculateDropQuantity(rarity) {
        const raritySettings = this.rarityLevels.get(rarity);
        const baseQuantity = 1;
        const multiplier = raritySettings.priceMultiplier;

        return Math.floor(baseQuantity * multiplier * (0.5 + Math.random()));
    }

    hasSufficientFunds(playerId, amount) {
        const wallet = this.currency.get('wallets').get(playerId);
        return wallet && wallet.balance >= amount;
    }

    deductFunds(playerId, amount) {
        let wallet = this.currency.get('wallets').get(playerId);
        if (!wallet) {
            wallet = { balance: 0, transactions: [] };
            this.currency.get('wallets').set(playerId, wallet);
        }

        wallet.balance -= amount;
        wallet.transactions.push({
            type: 'debit',
            amount: amount,
            timestamp: Date.now()
        });
    }

    transferFunds(fromId, toId, amount) {
        this.deductFunds(fromId, amount);

        let toWallet = this.currency.get('wallets').get(toId);
        if (!toWallet) {
            toWallet = { balance: 0, transactions: [] };
            this.currency.get('wallets').set(toId, toWallet);
        }

        toWallet.balance += amount;
        toWallet.transactions.push({
            type: 'credit',
            amount: amount,
            timestamp: Date.now()
        });
    }

    updateMarketPrice(itemId, marketType, newPrice) {
        const market = this.markets.get(marketType);
        if (market) {
            market.items.set(itemId, {
                price: newPrice,
                lastUpdate: Date.now(),
                volatility: market.volatility
            });
        }
    }

    generateTransactionId() {
        return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateDropId() {
        return `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getMarketVolatility(marketType) {
        const volatilityMap = {
            local: 0.1,
            regional: 0.2,
            galactic: 0.3,
            universal: 0.5
        };
        return volatilityMap[marketType] || 0.1;
    }

    getEconomyStatistics() {
        return {
            currency: {
                totalSupply: this.currency.get('credits').totalSupply,
                circulatingSupply: this.currency.get('credits').circulatingSupply,
                wallets: this.currency.get('wallets').size
            },
            markets: {
                total: this.markets.size,
                transactions: this.markets.get('local')?.transactions.length || 0
            },
            claims: {
                total: this.claimedSystems.size
            },
            resources: {
                types: this.resourceTypes.size,
                drops: this.resources.get('drops')?.size || 0
            }
        };
    }

    save() {
        return {
            currency: {
                credits: this.currency.get('credits'),
                wallets: Array.from(this.currency.get('wallets').entries())
            },
            markets: Array.from(this.markets.entries()),
            claimedSystems: Array.from(this.claimedSystems.entries()),
            resources: {
                drops: this.resources.has('drops') ? Array.from(this.resources.get('drops').entries()) : []
            }
        };
    }

    load(data) {
        if (data.currency) {
            if (data.currency.credits) {
                this.currency.set('credits', data.currency.credits);
            }
            if (data.currency.wallets) {
                this.currency.set('wallets', new Map(data.currency.wallets));
            }
        }
        if (data.markets) {
            this.markets = new Map(data.markets);
        }
        if (data.claimedSystems) {
            this.claimedSystems = new Map(data.claimedSystems);
        }
        if (data.resources && data.resources.drops) {
            this.resources.set('drops', new Map(data.resources.drops));
        }
    }
}

export default EconomyManager;
