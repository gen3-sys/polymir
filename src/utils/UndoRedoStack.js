/**
 * UndoRedoStack - Generic undo/redo history manager
 *
 * Single Responsibility: Manage undo/redo state history
 * Pure utility class for any operation that needs undo/redo
 */
export class UndoRedoStack {
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Push new state onto undo stack
     * @param {*} state - State to save (will be cloned)
     */
    push(state) {
        
        this.redoStack = [];

        
        const clonedState = this.cloneState(state);
        this.undoStack.push(clonedState);

        
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo to previous state
     * @param {*} currentState - Current state to move to redo stack
     * @returns {*} Previous state, or null if no undo available
     */
    undo(currentState) {
        if (this.undoStack.length === 0) {
            return null;
        }

        
        this.redoStack.push(this.cloneState(currentState));

        
        return this.undoStack.pop();
    }

    /**
     * Redo to next state
     * @param {*} currentState - Current state to move to undo stack
     * @returns {*} Next state, or null if no redo available
     */
    redo(currentState) {
        if (this.redoStack.length === 0) {
            return null;
        }

        
        this.undoStack.push(this.cloneState(currentState));

        
        return this.redoStack.pop();
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Get undo stack depth
     * @returns {number}
     */
    getUndoDepth() {
        return this.undoStack.length;
    }

    /**
     * Get redo stack depth
     * @returns {number}
     */
    getRedoDepth() {
        return this.redoStack.length;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Clone state (deep copy)
     * @param {*} state
     * @returns {*}
     * @private
     */
    cloneState(state) {
        if (state === null || state === undefined) {
            return state;
        }

        
        if (state instanceof Map) {
            const cloned = new Map();
            for (const [key, value] of state.entries()) {
                cloned.set(key, this.cloneState(value));
            }
            return cloned;
        }

        
        if (Array.isArray(state)) {
            return state.map(item => this.cloneState(item));
        }

        
        if (typeof state === 'object') {
            const cloned = {};
            for (const key in state) {
                if (state.hasOwnProperty(key)) {
                    cloned[key] = this.cloneState(state[key]);
                }
            }
            return cloned;
        }

        
        return state;
    }
}
