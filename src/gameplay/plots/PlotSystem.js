import { HTTPAdapter } from '../../io/network/HTTPAdapter.js';
import { IndexedDBAdapter } from '../../io/storage/IndexedDBAdapter.js';

export class PlotSystem {
    constructor(factionManager, config = {}) {
        this.factionManager = factionManager;
        this.plots = new Map();
        this.playerPlots = new Map();
        this.minSpacing = 10;
        this.plotExpansionStep = 5;

        // Network and storage adapters
        this.httpAdapter = new HTTPAdapter({
            baseUrl: config.backendUrl || 'http://localhost:3000',
            playerId: config.playerId || null
        });
        this.storageAdapter = new IndexedDBAdapter({
            dbName: 'polymir',
            storeName: 'plots'
        });

        this.initializeAdapters();
    }

    /**
     * Initialize storage adapter
     */
    async initializeAdapters() {
        try {
            await this.storageAdapter.initialize();
            await this.loadPersistedPlots();
            console.log('[PlotSystem] Storage initialized');
        } catch (error) {
            console.error('[PlotSystem] Storage initialization failed:', error);
        }
    }

    /**
     * Load persisted plots from storage
     */
    async loadPersistedPlots() {
        try {
            if (!this.storageAdapter.isInitialized) return;

            const plotsData = await this.storageAdapter.get('plots');
            if (plotsData) {
                this.plots = new Map(plotsData.plots);
                this.playerPlots = new Map(
                    plotsData.playerPlots.map(([playerId, plotIds]) => [playerId, new Set(plotIds)])
                );
                console.log(`[PlotSystem] Loaded ${this.plots.size} plots from storage`);
            }
        } catch (error) {
            console.error('[PlotSystem] Failed to load persisted plots:', error);
        }
    }

    /**
     * Save plots to storage
     */
    async savePlots() {
        try {
            if (!this.storageAdapter.isInitialized) return;

            const plotsData = {
                plots: Array.from(this.plots.entries()),
                playerPlots: Array.from(this.playerPlots.entries()).map(([playerId, plotIds]) => [
                    playerId,
                    Array.from(plotIds)
                ])
            };

            await this.storageAdapter.set('plots', plotsData, { type: 'plots' });
        } catch (error) {
            console.error('[PlotSystem] Failed to save plots:', error);
        }
    }

    createPlot(playerId, position, factionId = null) {
        const plotId = this.generatePlotId();

        const plot = {
            id: plotId,
            owner: playerId,
            factionId: factionId,
            position: { ...position },
            bounds: {
                min: { x: position.x - 5, y: position.y - 5, z: position.z - 5 },
                max: { x: position.x + 5, y: position.y + 5, z: position.z + 5 }
            },
            voxelCount: 0,
            created: Date.now(),
            lastExpanded: Date.now()
        };

        this.plots.set(plotId, plot);

        if (!this.playerPlots.has(playerId)) {
            this.playerPlots.set(playerId, new Set());
        }
        this.playerPlots.get(playerId).add(plotId);

        // Persist to storage
        this.savePlots();

        return plotId;
    }

    getPlotAtPosition(position) {
        for (const plot of this.plots.values()) {
            if (this.isPositionInPlot(position, plot)) {
                return plot;
            }
        }
        return null;
    }

    isPositionInPlot(position, plot) {
        return position.x >= plot.bounds.min.x &&
               position.x <= plot.bounds.max.x &&
               position.y >= plot.bounds.min.y &&
               position.y <= plot.bounds.max.y &&
               position.z >= plot.bounds.min.z &&
               position.z <= plot.bounds.max.z;
    }

    canBuildAtPosition(playerId, position) {
        const plot = this.getPlotAtPosition(position);

        if (!plot) {
            if (this.isTooCloseToOtherPlots(position, playerId)) {
                return false;
            }
            return true;
        }

        return plot.owner === playerId;
    }

    isTooCloseToOtherPlots(position, playerId) {
        for (const plot of this.plots.values()) {
            if (plot.owner === playerId) continue;

            const distance = Math.sqrt(
                Math.pow(position.x - plot.position.x, 2) +
                Math.pow(position.y - plot.position.y, 2) +
                Math.pow(position.z - plot.position.z, 2)
            );

            if (distance < this.minSpacing) {
                return true;
            }
        }

        return false;
    }

    onVoxelPlaced(playerId, position, factionId = null) {
        let plot = this.getPlotAtPosition(position);

        if (!plot) {
            const playerPlots = this.playerPlots.get(playerId);
            if (playerPlots && playerPlots.size > 0) {
                const nearestPlot = this.getNearestPlayerPlot(playerId, position);
                if (nearestPlot && this.shouldExpandPlot(nearestPlot, position)) {
                    this.expandPlot(nearestPlot.id, position);
                    plot = nearestPlot;
                } else {
                    const plotId = this.createPlot(playerId, position, factionId);
                    plot = this.plots.get(plotId);
                }
            } else {
                const plotId = this.createPlot(playerId, position, factionId);
                plot = this.plots.get(plotId);
            }
        }

        if (plot) {
            plot.voxelCount++;
            if (factionId && this.factionManager) {
                this.factionManager.addBlocksToFaction(factionId, 1);
            }
        }
    }

    onVoxelRemoved(playerId, position, factionId = null) {
        const plot = this.getPlotAtPosition(position);

        if (plot && plot.owner === playerId) {
            plot.voxelCount = Math.max(0, plot.voxelCount - 1);
            if (factionId && this.factionManager) {
                this.factionManager.removeBlocksFromFaction(factionId, 1);
            }
        }
    }

    getNearestPlayerPlot(playerId, position) {
        const playerPlots = this.playerPlots.get(playerId);
        if (!playerPlots) return null;

        let nearestPlot = null;
        let minDistance = Infinity;

        for (const plotId of playerPlots) {
            const plot = this.plots.get(plotId);
            if (!plot) continue;

            const distance = Math.sqrt(
                Math.pow(position.x - plot.position.x, 2) +
                Math.pow(position.y - plot.position.y, 2) +
                Math.pow(position.z - plot.position.z, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestPlot = plot;
            }
        }

        return nearestPlot;
    }

    shouldExpandPlot(plot, position) {
        const distance = Math.sqrt(
            Math.pow(position.x - plot.position.x, 2) +
            Math.pow(position.y - plot.position.y, 2) +
            Math.pow(position.z - plot.position.z, 2)
        );

        const currentSize = Math.max(
            plot.bounds.max.x - plot.bounds.min.x,
            plot.bounds.max.y - plot.bounds.min.y,
            plot.bounds.max.z - plot.bounds.min.z
        );

        return distance < currentSize + this.plotExpansionStep;
    }

    expandPlot(plotId, position) {
        const plot = this.plots.get(plotId);
        if (!plot) return false;

        plot.bounds.min.x = Math.min(plot.bounds.min.x, position.x - this.plotExpansionStep);
        plot.bounds.min.y = Math.min(plot.bounds.min.y, position.y - this.plotExpansionStep);
        plot.bounds.min.z = Math.min(plot.bounds.min.z, position.z - this.plotExpansionStep);

        plot.bounds.max.x = Math.max(plot.bounds.max.x, position.x + this.plotExpansionStep);
        plot.bounds.max.y = Math.max(plot.bounds.max.y, position.y + this.plotExpansionStep);
        plot.bounds.max.z = Math.max(plot.bounds.max.z, position.z + this.plotExpansionStep);

        plot.lastExpanded = Date.now();

        // Persist to storage
        this.savePlots();

        return true;
    }

    getPlayerPlots(playerId) {
        const playerPlots = this.playerPlots.get(playerId);
        if (!playerPlots) return [];

        return Array.from(playerPlots).map(plotId => this.plots.get(plotId)).filter(Boolean);
    }

    deletePlot(plotId) {
        const plot = this.plots.get(plotId);
        if (!plot) return false;

        const playerPlots = this.playerPlots.get(plot.owner);
        if (playerPlots) {
            playerPlots.delete(plotId);
        }

        this.plots.delete(plotId);

        // Persist to storage
        this.savePlots();
        return true;
    }

    generatePlotId() {
        return `plot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    save() {
        return {
            plots: Array.from(this.plots.entries()),
            playerPlots: Array.from(this.playerPlots.entries()).map(([k, v]) => [k, Array.from(v)])
        };
    }

    load(data) {
        if (data.plots) {
            this.plots = new Map(data.plots);
        }
        if (data.playerPlots) {
            this.playerPlots = new Map(data.playerPlots.map(([k, v]) => [k, new Set(v)]));
        }
    }
}

export default PlotSystem;
