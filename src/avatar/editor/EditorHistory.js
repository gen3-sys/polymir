/**
 * EditorHistory - Undo/redo system for voxel avatar editor
 *
 * Tracks changes to the avatar for undo/redo functionality.
 * Uses efficient diff storage and supports batched operations.
 *
 * Features:
 * - Action recording
 * - State snapshots (every N actions)
 * - Memory-efficient diff storage
 * - Keyboard shortcuts support
 */

// Maximum history size
const DEFAULT_MAX_HISTORY = 100;
const SNAPSHOT_INTERVAL = 10; // Actions between full snapshots

// Action types
export const ACTION_TYPE = {
    SET_VOXEL: 'setVoxel',
    REMOVE_VOXEL: 'removeVoxel',
    PAINT_VOXEL: 'paintVoxel',
    BATCH: 'batch',
    PALETTE_CHANGE: 'paletteChange',
    CLEAR: 'clear',
    IMPORT: 'import'
};

export class EditorHistory {
    constructor(options = {}) {
        // History stacks
        this.undoStack = [];
        this.redoStack = [];

        // Configuration
        this.maxHistory = options.maxHistory || DEFAULT_MAX_HISTORY;
        this.snapshotInterval = options.snapshotInterval || SNAPSHOT_INTERVAL;

        // Batch state
        this.currentBatch = null;
        this.isBatching = false;

        // Snapshot tracking
        this.actionsSinceSnapshot = 0;
        this.snapshots = new Map(); // actionIndex → snapshot

        // Callbacks
        this.onHistoryChange = options.onHistoryChange || null;
    }

    /**
     * Record a single action
     * @param {Object} action - Action data
     */
    recordAction(action) {
        // If batching, add to current batch
        if (this.isBatching && this.currentBatch) {
            this.currentBatch.actions.push(action);
            return;
        }

        // Add timestamp
        action.timestamp = Date.now();

        // Push to undo stack
        this.undoStack.push(action);

        // Clear redo stack (new action branch)
        this.redoStack = [];

        // Limit history size
        this.trimHistory();

        // Track for snapshots
        this.actionsSinceSnapshot++;

        // Fire callback
        if (this.onHistoryChange) {
            this.onHistoryChange('record', action);
        }
    }

    /**
     * Start a batch operation
     * Multiple actions are grouped into a single undoable unit
     */
    startBatch() {
        if (this.isBatching) {
            console.warn('[EditorHistory] Already in batch mode');
            return;
        }

        this.isBatching = true;
        this.currentBatch = {
            type: ACTION_TYPE.BATCH,
            actions: [],
            timestamp: Date.now()
        };
    }

    /**
     * End batch operation
     */
    endBatch() {
        if (!this.isBatching || !this.currentBatch) {
            return;
        }

        // Only record if there are actions
        if (this.currentBatch.actions.length > 0) {
            this.undoStack.push(this.currentBatch);
            this.redoStack = [];
            this.trimHistory();
        }

        this.isBatching = false;
        this.currentBatch = null;

        // Fire callback
        if (this.onHistoryChange) {
            this.onHistoryChange('batchEnd');
        }
    }

    /**
     * Cancel current batch without recording
     */
    cancelBatch() {
        this.isBatching = false;
        this.currentBatch = null;
    }

    /**
     * Undo last action
     * @returns {Object|null} Action to undo
     */
    undo() {
        if (this.undoStack.length === 0) {
            return null;
        }

        const action = this.undoStack.pop();
        this.redoStack.push(action);

        // Fire callback
        if (this.onHistoryChange) {
            this.onHistoryChange('undo', action);
        }

        return action;
    }

    /**
     * Redo last undone action
     * @returns {Object|null} Action to redo
     */
    redo() {
        if (this.redoStack.length === 0) {
            return null;
        }

        const action = this.redoStack.pop();
        this.undoStack.push(action);

        // Fire callback
        if (this.onHistoryChange) {
            this.onHistoryChange('redo', action);
        }

        return action;
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Get current history size
     */
    getSize() {
        return this.undoStack.length;
    }

    /**
     * Get undo stack size
     */
    getUndoCount() {
        return this.undoStack.length;
    }

    /**
     * Get redo stack size
     */
    getRedoCount() {
        return this.redoStack.length;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.snapshots.clear();
        this.actionsSinceSnapshot = 0;

        if (this.isBatching) {
            this.cancelBatch();
        }

        // Fire callback
        if (this.onHistoryChange) {
            this.onHistoryChange('clear');
        }
    }

    /**
     * Trim history to max size
     */
    trimHistory() {
        while (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    /**
     * Create a state snapshot
     * @param {Object} state - Full state to snapshot
     */
    createSnapshot(state) {
        const index = this.undoStack.length;
        this.snapshots.set(index, {
            state: this.cloneState(state),
            timestamp: Date.now()
        });
        this.actionsSinceSnapshot = 0;

        // Remove old snapshots
        this.cleanupSnapshots();
    }

    /**
     * Get nearest snapshot for undo target
     */
    getNearestSnapshot(targetIndex) {
        let nearestIndex = -1;
        let nearestSnapshot = null;

        for (const [index, snapshot] of this.snapshots) {
            if (index <= targetIndex && index > nearestIndex) {
                nearestIndex = index;
                nearestSnapshot = snapshot;
            }
        }

        return nearestSnapshot ? { index: nearestIndex, snapshot: nearestSnapshot } : null;
    }

    /**
     * Cleanup old snapshots
     */
    cleanupSnapshots() {
        // Keep only snapshots within the undo stack range
        const minIndex = 0;
        const maxIndex = this.undoStack.length;

        for (const index of this.snapshots.keys()) {
            if (index < minIndex || index > maxIndex) {
                this.snapshots.delete(index);
            }
        }

        // Keep maximum number of snapshots
        const maxSnapshots = Math.ceil(this.maxHistory / this.snapshotInterval);
        while (this.snapshots.size > maxSnapshots) {
            // Remove oldest snapshot
            const oldestIndex = Math.min(...this.snapshots.keys());
            this.snapshots.delete(oldestIndex);
        }
    }

    /**
     * Clone state for snapshot
     */
    cloneState(state) {
        // Deep clone the state
        return JSON.parse(JSON.stringify(state));
    }

    /**
     * Get all actions for a time range
     */
    getActionsInRange(startTime, endTime) {
        return this.undoStack.filter(action =>
            action.timestamp >= startTime && action.timestamp <= endTime
        );
    }

    /**
     * Get recent actions
     */
    getRecentActions(count = 10) {
        return this.undoStack.slice(-count);
    }

    /**
     * Get action at index
     */
    getAction(index) {
        return this.undoStack[index] || null;
    }

    /**
     * Collapse consecutive similar actions
     * Useful for combining multiple paint strokes into one
     */
    collapseActions() {
        if (this.undoStack.length < 2) return;

        const collapsed = [];
        let currentGroup = null;

        for (const action of this.undoStack) {
            if (this.canCollapseWith(currentGroup, action)) {
                // Add to current group
                if (currentGroup.type !== ACTION_TYPE.BATCH) {
                    currentGroup = {
                        type: ACTION_TYPE.BATCH,
                        actions: [currentGroup],
                        timestamp: currentGroup.timestamp
                    };
                }
                currentGroup.actions.push(action);
            } else {
                // Start new group
                if (currentGroup) {
                    collapsed.push(currentGroup);
                }
                currentGroup = action;
            }
        }

        if (currentGroup) {
            collapsed.push(currentGroup);
        }

        this.undoStack = collapsed;
    }

    /**
     * Check if two actions can be collapsed
     */
    canCollapseWith(group, action) {
        if (!group || !action) return false;

        // Same type actions within short time window
        const timeWindow = 500; // ms
        const timeDiff = Math.abs(action.timestamp - group.timestamp);

        if (timeDiff > timeWindow) return false;

        if (group.type === ACTION_TYPE.BATCH) {
            const lastAction = group.actions[group.actions.length - 1];
            return lastAction && lastAction.type === action.type;
        }

        return group.type === action.type;
    }

    /**
     * Serialize history for persistence
     */
    serialize() {
        return {
            undoStack: this.undoStack.map(action => ({ ...action })),
            redoStack: this.redoStack.map(action => ({ ...action })),
            maxHistory: this.maxHistory
        };
    }

    /**
     * Deserialize history from persistence
     */
    static deserialize(data) {
        const history = new EditorHistory({
            maxHistory: data.maxHistory
        });

        history.undoStack = data.undoStack || [];
        history.redoStack = data.redoStack || [];

        return history;
    }

    /**
     * Get debug info
     */
    getDebugInfo() {
        return {
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            snapshotCount: this.snapshots.size,
            isBatching: this.isBatching,
            batchSize: this.currentBatch?.actions.length || 0,
            maxHistory: this.maxHistory
        };
    }
}

export default EditorHistory;
