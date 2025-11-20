export class PermissionSystem {
    constructor(factionManager, plotSystem) {
        this.factionManager = factionManager;
        this.plotSystem = plotSystem;
        this.permissions = new Map();
        this.buildPermissions = new Map();
    }

    canPlayerBuild(playerId, position, factionId = null) {
        if (!this.plotSystem.canBuildAtPosition(playerId, position)) {
            return false;
        }

        if (factionId && this.factionManager) {
            const blockLimit = this.factionManager.getEffectiveBlockLimit(factionId);
            const blockCount = this.factionManager.factionBlockCounts.get(factionId) || 0;

            if (blockCount >= blockLimit) {
                return false;
            }
        }

        return true;
    }

    canPlayerDestroy(playerId, position, targetPlayerId) {
        if (playerId === targetPlayerId) {
            return true;
        }

        const plot = this.plotSystem.getPlotAtPosition(position);
        if (!plot) {
            return false;
        }

        return plot.owner === playerId;
    }

    grantBuildPermission(ownerId, targetPlayerId, plotId) {
        const plot = this.plotSystem.plots.get(plotId);
        if (!plot || plot.owner !== ownerId) {
            return false;
        }

        const key = `${plotId}:${targetPlayerId}`;
        this.buildPermissions.set(key, {
            plotId: plotId,
            ownerId: ownerId,
            targetPlayerId: targetPlayerId,
            granted: Date.now()
        });

        return true;
    }

    revokeBuildPermission(ownerId, targetPlayerId, plotId) {
        const plot = this.plotSystem.plots.get(plotId);
        if (!plot || plot.owner !== ownerId) {
            return false;
        }

        const key = `${plotId}:${targetPlayerId}`;
        return this.buildPermissions.delete(key);
    }

    hasBuildPermission(playerId, plotId) {
        const plot = this.plotSystem.plots.get(plotId);
        if (!plot) {
            return false;
        }

        if (plot.owner === playerId) {
            return true;
        }

        const key = `${plotId}:${playerId}`;
        return this.buildPermissions.has(key);
    }

    canPlayerModifyFactionBuilds(playerId, factionId) {
        if (!this.factionManager) return false;

        const shipFaction = this.factionManager.getShipFaction(playerId);
        return shipFaction === factionId;
    }

    save() {
        return {
            buildPermissions: Array.from(this.buildPermissions.entries())
        };
    }

    load(data) {
        if (data.buildPermissions) {
            this.buildPermissions = new Map(data.buildPermissions);
        }
    }
}

export default PermissionSystem;
