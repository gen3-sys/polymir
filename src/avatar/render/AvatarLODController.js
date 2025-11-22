/**
 * AvatarLODController - Distance-based Level of Detail management
 *
 * Controls avatar rendering quality based on camera distance.
 * Enables efficient rendering of many avatars by reducing detail
 * for distant characters.
 *
 * LOD Levels:
 * - 0: Near (<20 units) - Full detail, smooth mode preferred
 * - 1: Medium (20-50 units) - High detail, cube mode acceptable
 * - 2: Far (50-100 units) - Reduced detail, skip small features
 * - 3: Distant (>100 units) - Billboard impostor or silhouette
 */

// Default LOD distance thresholds (in world units)
export const DEFAULT_LOD_DISTANCES = {
    NEAR: 20,      // LOD 0 → 1 transition
    MEDIUM: 50,    // LOD 1 → 2 transition
    FAR: 100,      // LOD 2 → 3 transition
    UNLOAD: 200    // Beyond this, don't render at all
};

// LOD level definitions
export const LOD_LEVEL = {
    FULL: 0,       // Full detail
    HIGH: 1,       // High detail
    MEDIUM: 2,     // Medium detail
    LOW: 3,        // Low detail / impostor
    UNLOADED: 4    // Not rendered
};

// Render mode recommendations per LOD level
export const LOD_RENDER_MODE = {
    [LOD_LEVEL.FULL]: 'smooth',
    [LOD_LEVEL.HIGH]: 'smooth',
    [LOD_LEVEL.MEDIUM]: 'cube',
    [LOD_LEVEL.LOW]: 'impostor'
};

export class AvatarLODController {
    constructor(config = {}) {
        // Distance thresholds
        this.distances = {
            near: config.nearDistance ?? DEFAULT_LOD_DISTANCES.NEAR,
            medium: config.mediumDistance ?? DEFAULT_LOD_DISTANCES.MEDIUM,
            far: config.farDistance ?? DEFAULT_LOD_DISTANCES.FAR,
            unload: config.unloadDistance ?? DEFAULT_LOD_DISTANCES.UNLOAD
        };

        // Hysteresis to prevent rapid LOD switching
        this.hysteresis = config.hysteresis ?? 2.0; // Units

        // Current state tracking
        this.currentLOD = LOD_LEVEL.FULL;
        this.lastDistance = 0;
        this.transitionProgress = 0;

        // Transition settings
        this.enableTransitions = config.enableTransitions ?? true;
        this.transitionDuration = config.transitionDuration ?? 0.3; // seconds

        // Callbacks
        this.onLODChange = config.onLODChange || null;
    }

    /**
     * Calculate LOD level based on distance
     * @param {number} distance - Distance from camera to avatar
     * @returns {number} LOD level (0-4)
     */
    calculateLOD(distance) {
        this.lastDistance = distance;

        // Apply hysteresis based on current LOD
        // This prevents flickering when distance is near a threshold
        const adjustedDistance = this.applyHysteresis(distance);

        let newLOD;
        if (adjustedDistance > this.distances.unload) {
            newLOD = LOD_LEVEL.UNLOADED;
        } else if (adjustedDistance > this.distances.far) {
            newLOD = LOD_LEVEL.LOW;
        } else if (adjustedDistance > this.distances.medium) {
            newLOD = LOD_LEVEL.MEDIUM;
        } else if (adjustedDistance > this.distances.near) {
            newLOD = LOD_LEVEL.HIGH;
        } else {
            newLOD = LOD_LEVEL.FULL;
        }

        // Handle LOD change
        if (newLOD !== this.currentLOD) {
            const oldLOD = this.currentLOD;
            this.currentLOD = newLOD;

            if (this.onLODChange) {
                this.onLODChange(newLOD, oldLOD, distance);
            }
        }

        return this.currentLOD;
    }

    /**
     * Apply hysteresis to prevent LOD flickering
     */
    applyHysteresis(distance) {
        // When moving away (increasing LOD), require additional distance
        // When moving closer (decreasing LOD), use exact distance
        const thresholds = [
            this.distances.near,
            this.distances.medium,
            this.distances.far,
            this.distances.unload
        ];

        // Find which threshold we're near
        for (let i = 0; i < thresholds.length; i++) {
            const threshold = thresholds[i];
            const expectedLOD = i;

            if (this.currentLOD <= expectedLOD && distance > threshold) {
                // Moving away from camera, apply hysteresis
                return distance - this.hysteresis;
            } else if (this.currentLOD > expectedLOD && distance < threshold) {
                // Moving toward camera, apply hysteresis
                return distance + this.hysteresis;
            }
        }

        return distance;
    }

    /**
     * Get recommended render mode for current LOD
     * @returns {string} 'smooth', 'cube', or 'impostor'
     */
    getRecommendedRenderMode() {
        return LOD_RENDER_MODE[this.currentLOD] || 'cube';
    }

    /**
     * Check if avatar should be rendered at all
     */
    shouldRender() {
        return this.currentLOD !== LOD_LEVEL.UNLOADED;
    }

    /**
     * Check if avatar should use impostor rendering
     */
    shouldUseImpostor() {
        return this.currentLOD === LOD_LEVEL.LOW;
    }

    /**
     * Get detail level multiplier (0-1)
     * Used for gradual detail reduction within LOD levels
     */
    getDetailMultiplier() {
        switch (this.currentLOD) {
            case LOD_LEVEL.FULL:
                return 1.0;
            case LOD_LEVEL.HIGH:
                return 0.9;
            case LOD_LEVEL.MEDIUM:
                return 0.6;
            case LOD_LEVEL.LOW:
                return 0.3;
            default:
                return 0;
        }
    }

    /**
     * Get animation update rate multiplier
     * Distant avatars update less frequently
     */
    getAnimationRateMultiplier() {
        switch (this.currentLOD) {
            case LOD_LEVEL.FULL:
                return 1.0;    // 60 Hz
            case LOD_LEVEL.HIGH:
                return 0.5;    // 30 Hz
            case LOD_LEVEL.MEDIUM:
                return 0.25;   // 15 Hz
            case LOD_LEVEL.LOW:
                return 0.1;    // 6 Hz
            default:
                return 0;
        }
    }

    /**
     * Get bone count for current LOD
     * At lower LODs, skip minor bones
     */
    getBoneCount() {
        switch (this.currentLOD) {
            case LOD_LEVEL.FULL:
                return 55;  // All VRM bones
            case LOD_LEVEL.HIGH:
                return 21;  // Core humanoid bones
            case LOD_LEVEL.MEDIUM:
                return 10;  // Major bones only
            case LOD_LEVEL.LOW:
                return 1;   // Single transform
            default:
                return 0;
        }
    }

    /**
     * Should spring bones be simulated?
     */
    shouldSimulateSpringBones() {
        return this.currentLOD <= LOD_LEVEL.HIGH;
    }

    /**
     * Should expressions be animated?
     */
    shouldAnimateExpressions() {
        return this.currentLOD <= LOD_LEVEL.MEDIUM;
    }

    /**
     * Calculate blend factor for LOD transitions
     * @returns {number} 0-1 blend factor
     */
    getTransitionBlend() {
        if (!this.enableTransitions) return 1.0;

        // Smooth transition based on distance within threshold zone
        const thresholds = [
            this.distances.near,
            this.distances.medium,
            this.distances.far
        ];

        for (let i = 0; i < thresholds.length; i++) {
            const threshold = thresholds[i];
            const zone = this.hysteresis * 2;

            if (Math.abs(this.lastDistance - threshold) < zone) {
                // In transition zone
                const progress = (this.lastDistance - (threshold - zone)) / (zone * 2);
                return Math.max(0, Math.min(1, progress));
            }
        }

        return 1.0; // Fully in current LOD
    }

    /**
     * Set distance thresholds
     */
    setDistances(near, medium, far, unload = null) {
        this.distances.near = near;
        this.distances.medium = medium;
        this.distances.far = far;
        if (unload !== null) {
            this.distances.unload = unload;
        }
    }

    /**
     * Scale all distances by a factor
     * Useful for different world scales
     */
    scaleDistances(factor) {
        this.distances.near *= factor;
        this.distances.medium *= factor;
        this.distances.far *= factor;
        this.distances.unload *= factor;
    }

    /**
     * Get current LOD level
     */
    getCurrentLOD() {
        return this.currentLOD;
    }

    /**
     * Get LOD level name
     */
    getLODName() {
        const names = ['FULL', 'HIGH', 'MEDIUM', 'LOW', 'UNLOADED'];
        return names[this.currentLOD] || 'UNKNOWN';
    }

    /**
     * Force a specific LOD level (for debugging)
     */
    forceLOD(level) {
        if (level >= LOD_LEVEL.FULL && level <= LOD_LEVEL.UNLOADED) {
            this.currentLOD = level;
        }
    }

    /**
     * Get debug info
     */
    getDebugInfo() {
        return {
            currentLOD: this.currentLOD,
            lodName: this.getLODName(),
            lastDistance: this.lastDistance.toFixed(2),
            recommendedMode: this.getRecommendedRenderMode(),
            detailMultiplier: this.getDetailMultiplier(),
            shouldRender: this.shouldRender(),
            distances: { ...this.distances }
        };
    }

    /**
     * Serialize configuration
     */
    serialize() {
        return {
            distances: { ...this.distances },
            hysteresis: this.hysteresis,
            enableTransitions: this.enableTransitions,
            transitionDuration: this.transitionDuration
        };
    }

    /**
     * Create from serialized data
     */
    static deserialize(data) {
        return new AvatarLODController({
            nearDistance: data.distances?.near,
            mediumDistance: data.distances?.medium,
            farDistance: data.distances?.far,
            unloadDistance: data.distances?.unload,
            hysteresis: data.hysteresis,
            enableTransitions: data.enableTransitions,
            transitionDuration: data.transitionDuration
        });
    }
}

export default AvatarLODController;
