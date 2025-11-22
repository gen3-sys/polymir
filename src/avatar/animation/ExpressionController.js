/**
 * ExpressionController - Facial expression management for voxel avatars
 *
 * Controls facial expressions through voxel pattern swapping.
 * Supports smooth transitions, automatic blinking, and emotion triggers.
 *
 * Features:
 * - Expression blending (interpolate between voxel patterns)
 * - Automatic blink cycle
 * - Emotion triggers from game events
 * - Lip-sync ready (phoneme → expression mapping)
 */

// Standard expression names (VRM-compatible)
export const EXPRESSION = {
    NEUTRAL: 'neutral',
    HAPPY: 'happy',
    SAD: 'sad',
    ANGRY: 'angry',
    SURPRISED: 'surprised',
    RELAXED: 'relaxed',
    BLINK: 'blink',
    BLINK_LEFT: 'blinkLeft',
    BLINK_RIGHT: 'blinkRight',
    // Lip sync phonemes
    AA: 'aa',
    IH: 'ih',
    OU: 'ou',
    EE: 'ee',
    OH: 'oh'
};

// Expression blend shapes (how much each expression contributes)
export const EXPRESSION_WEIGHTS = {
    [EXPRESSION.NEUTRAL]: { base: true },
    [EXPRESSION.HAPPY]: { mouth: 0.8, eyes: 0.3 },
    [EXPRESSION.SAD]: { mouth: 0.7, eyes: 0.5, brows: 0.4 },
    [EXPRESSION.ANGRY]: { mouth: 0.5, eyes: 0.4, brows: 0.8 },
    [EXPRESSION.SURPRISED]: { mouth: 0.9, eyes: 0.8, brows: 0.6 },
    [EXPRESSION.BLINK]: { eyes: 1.0 }
};

export class ExpressionController {
    constructor(options = {}) {
        // Reference to avatar data
        this.avatarData = null;

        // Current expression state
        this.currentExpression = EXPRESSION.NEUTRAL;
        this.targetExpression = EXPRESSION.NEUTRAL;
        this.expressionWeight = 1.0;

        // Expression blending
        this.blendProgress = 1.0;
        this.blendDuration = options.blendDuration || 0.2; // seconds

        // Blink state
        this.blinkEnabled = options.blinkEnabled !== false;
        this.blinkInterval = options.blinkInterval || 4.0; // seconds between blinks
        this.blinkDuration = options.blinkDuration || 0.15;
        this.blinkTimer = 0;
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.blinkVariance = options.blinkVariance || 2.0; // Random variance

        // Expression queue (for sequential expressions)
        this.expressionQueue = [];

        // Emotion triggers
        this.emotionTriggers = new Map();
        this.setupDefaultTriggers();

        // Lip sync state
        this.lipSyncEnabled = false;
        this.currentPhoneme = null;
        this.phonemeWeight = 0;

        // Cache for interpolated voxels
        this.interpolatedVoxels = new Map();

        // Callbacks
        this.onExpressionChange = options.onExpressionChange || null;
        this.onBlink = options.onBlink || null;
    }

    /**
     * Initialize with avatar data
     * @param {VoxelAvatarData} avatarData - Avatar data with expressions
     */
    initialize(avatarData) {
        this.avatarData = avatarData;

        // Ensure neutral expression exists
        if (!avatarData.getExpression(EXPRESSION.NEUTRAL)) {
            // Create empty neutral (base voxels are the neutral expression)
            avatarData.setExpression(EXPRESSION.NEUTRAL, new Map());
        }

        // Randomize initial blink timer
        this.blinkTimer = Math.random() * this.blinkInterval;
    }

    /**
     * Setup default emotion triggers
     */
    setupDefaultTriggers() {
        // Damage taken
        this.emotionTriggers.set('damage', {
            expression: EXPRESSION.SURPRISED,
            duration: 0.5,
            priority: 2
        });

        // Health low
        this.emotionTriggers.set('lowHealth', {
            expression: EXPRESSION.SAD,
            duration: 2.0,
            priority: 1
        });

        // Item obtained
        this.emotionTriggers.set('itemObtained', {
            expression: EXPRESSION.HAPPY,
            duration: 1.0,
            priority: 1
        });

        // Combat engaged
        this.emotionTriggers.set('combat', {
            expression: EXPRESSION.ANGRY,
            duration: 3.0,
            priority: 1
        });
    }

    /**
     * Set expression with smooth transition
     * @param {string} expression - Expression name
     * @param {Object} options - Transition options
     */
    setExpression(expression, options = {}) {
        if (expression === this.targetExpression && !options.force) {
            return;
        }

        // Check if expression exists
        if (!this.avatarData || !this.avatarData.getExpression(expression)) {
            if (expression !== EXPRESSION.NEUTRAL) {
                console.warn(`[ExpressionController] Expression not found: ${expression}`);
                return;
            }
        }

        const previous = this.currentExpression;

        // Start blend
        this.targetExpression = expression;
        this.blendProgress = 0;
        this.blendDuration = options.duration ?? this.blendDuration;

        // Fire callback
        if (this.onExpressionChange) {
            this.onExpressionChange(expression, previous);
        }
    }

    /**
     * Queue an expression to play after current one
     */
    queueExpression(expression, duration = 1.0) {
        this.expressionQueue.push({
            expression,
            duration,
            elapsed: 0
        });
    }

    /**
     * Trigger emotion from game event
     * @param {string} eventName - Event name (e.g., 'damage', 'itemObtained')
     */
    triggerEmotion(eventName) {
        const trigger = this.emotionTriggers.get(eventName);
        if (!trigger) return;

        // Queue the expression
        this.queueExpression(trigger.expression, trigger.duration);
    }

    /**
     * Update expression state
     * @param {number} deltaTime - Time since last update
     */
    update(deltaTime) {
        // Update blink
        if (this.blinkEnabled) {
            this.updateBlink(deltaTime);
        }

        // Update expression blend
        if (this.blendProgress < 1.0) {
            this.blendProgress += deltaTime / this.blendDuration;
            if (this.blendProgress >= 1.0) {
                this.blendProgress = 1.0;
                this.currentExpression = this.targetExpression;
            }
        }

        // Process expression queue
        if (this.expressionQueue.length > 0) {
            const current = this.expressionQueue[0];

            if (current.elapsed === 0) {
                // Start this queued expression
                this.setExpression(current.expression);
            }

            current.elapsed += deltaTime;

            if (current.elapsed >= current.duration) {
                this.expressionQueue.shift();

                // Return to neutral if queue is empty
                if (this.expressionQueue.length === 0) {
                    this.setExpression(EXPRESSION.NEUTRAL);
                }
            }
        }

        // Update lip sync
        if (this.lipSyncEnabled) {
            this.updateLipSync(deltaTime);
        }

        // Apply expression to avatar
        this.applyExpression();
    }

    /**
     * Update blink state
     */
    updateBlink(deltaTime) {
        this.blinkTimer += deltaTime;

        if (this.isBlinking) {
            this.blinkProgress += deltaTime / this.blinkDuration;

            if (this.blinkProgress >= 1.0) {
                // Blink complete
                this.isBlinking = false;
                this.blinkProgress = 0;

                // Reset timer with variance
                this.blinkTimer = 0;
                this.blinkInterval = 3.0 + Math.random() * this.blinkVariance;
            }
        } else {
            // Check if it's time to blink
            if (this.blinkTimer >= this.blinkInterval) {
                this.startBlink();
            }
        }
    }

    /**
     * Start a blink
     */
    startBlink() {
        this.isBlinking = true;
        this.blinkProgress = 0;

        if (this.onBlink) {
            this.onBlink();
        }
    }

    /**
     * Force a blink
     */
    forceBlink() {
        this.startBlink();
    }

    /**
     * Update lip sync state
     */
    updateLipSync(deltaTime) {
        // Lip sync would be driven by audio analysis
        // For now, this is a placeholder for future implementation
    }

    /**
     * Set phoneme for lip sync
     */
    setPhoneme(phoneme, weight = 1.0) {
        this.currentPhoneme = phoneme;
        this.phonemeWeight = weight;
    }

    /**
     * Apply current expression to avatar voxels
     */
    applyExpression() {
        if (!this.avatarData) return;

        // Get expression delta voxels
        const targetDelta = this.avatarData.getExpression(this.targetExpression);
        const currentDelta = this.avatarData.getExpression(this.currentExpression);

        // Apply blink overlay if blinking
        if (this.isBlinking) {
            const blinkDelta = this.avatarData.getExpression(EXPRESSION.BLINK);
            if (blinkDelta) {
                // Calculate blink weight (0 → 1 → 0 curve)
                const blinkWeight = this.calculateBlinkCurve(this.blinkProgress);
                this.applyExpressionDelta(blinkDelta, blinkWeight);
            }
        }

        // Apply expression blend
        if (targetDelta && this.blendProgress < 1.0) {
            // Blending between expressions
            const blendWeight = this.smoothstep(this.blendProgress);

            // Remove current expression influence
            if (currentDelta) {
                this.applyExpressionDelta(currentDelta, 1.0 - blendWeight);
            }

            // Apply target expression influence
            this.applyExpressionDelta(targetDelta, blendWeight);
        } else if (targetDelta) {
            // Fully in target expression
            this.applyExpressionDelta(targetDelta, 1.0);
        }
    }

    /**
     * Apply expression delta voxels with weight
     * @param {Map} delta - Map of encoded positions to palette indices
     * @param {number} weight - Blend weight (0-1)
     */
    applyExpressionDelta(delta, weight) {
        if (!delta || weight <= 0) return;

        // Store interpolated voxels for renderer to use
        for (const [encodedPos, paletteIndex] of delta) {
            const existing = this.interpolatedVoxels.get(encodedPos);
            if (existing) {
                // Blend with existing
                existing.weight = Math.min(1, existing.weight + weight);
                existing.paletteIndex = paletteIndex; // Take latest for now
            } else {
                this.interpolatedVoxels.set(encodedPos, {
                    paletteIndex,
                    weight
                });
            }
        }
    }

    /**
     * Get interpolated expression voxels for rendering
     * @returns {Map} Map of encoded positions to { paletteIndex, weight }
     */
    getInterpolatedVoxels() {
        return this.interpolatedVoxels;
    }

    /**
     * Clear interpolated voxels (call before each frame)
     */
    clearInterpolatedVoxels() {
        this.interpolatedVoxels.clear();
    }

    /**
     * Calculate blink curve (smooth close and open)
     */
    calculateBlinkCurve(progress) {
        // Quick close, slower open
        if (progress < 0.3) {
            // Close phase (0 → 1)
            return this.smoothstep(progress / 0.3);
        } else {
            // Open phase (1 → 0)
            return 1.0 - this.smoothstep((progress - 0.3) / 0.7);
        }
    }

    /**
     * Smoothstep interpolation
     */
    smoothstep(t) {
        t = Math.max(0, Math.min(1, t));
        return t * t * (3 - 2 * t);
    }

    /**
     * Get current expression name
     */
    getCurrentExpression() {
        return this.currentExpression;
    }

    /**
     * Get blend progress
     */
    getBlendProgress() {
        return this.blendProgress;
    }

    /**
     * Check if currently blinking
     */
    getIsBlinking() {
        return this.isBlinking;
    }

    /**
     * Enable/disable automatic blinking
     */
    setBlinkEnabled(enabled) {
        this.blinkEnabled = enabled;
        if (!enabled) {
            this.isBlinking = false;
            this.blinkProgress = 0;
        }
    }

    /**
     * Enable/disable lip sync
     */
    setLipSyncEnabled(enabled) {
        this.lipSyncEnabled = enabled;
        if (!enabled) {
            this.currentPhoneme = null;
            this.phonemeWeight = 0;
        }
    }

    /**
     * Add custom emotion trigger
     */
    addEmotionTrigger(eventName, expression, duration, priority = 1) {
        this.emotionTriggers.set(eventName, {
            expression,
            duration,
            priority
        });
    }

    /**
     * Remove emotion trigger
     */
    removeEmotionTrigger(eventName) {
        this.emotionTriggers.delete(eventName);
    }

    /**
     * Get all available expressions
     */
    getAvailableExpressions() {
        if (!this.avatarData) return [EXPRESSION.NEUTRAL];
        return [EXPRESSION.NEUTRAL, ...this.avatarData.getExpressionNames()];
    }

    /**
     * Get debug info
     */
    getDebugInfo() {
        return {
            currentExpression: this.currentExpression,
            targetExpression: this.targetExpression,
            blendProgress: this.blendProgress.toFixed(2),
            isBlinking: this.isBlinking,
            blinkProgress: this.blinkProgress.toFixed(2),
            queueLength: this.expressionQueue.length,
            lipSyncEnabled: this.lipSyncEnabled,
            currentPhoneme: this.currentPhoneme
        };
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.expressionQueue = [];
        this.emotionTriggers.clear();
        this.interpolatedVoxels.clear();
        this.avatarData = null;
    }
}

export default ExpressionController;
