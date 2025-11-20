/**
 * GravityFalloff - Pure utility functions for gravity falloff curves
 *
 * Single Responsibility: Gravity influence falloff calculations
 * Pure Functions: No side effects, deterministic
 */

/**
 * Apply falloff curve to normalized distance
 * @param {number} t - Normalized distance (0 = at surface, 1 = at edge of influence)
 * @param {string} curve - Falloff curve type
 * @returns {number} Influence multiplier [0, 1]
 */
export function applyFalloff(t, curve = 'cubic') {
    const clamped = Math.max(0, Math.min(1, t));

    switch (curve) {
        case 'linear':
            return clamped;

        case 'quadratic':
            return clamped * clamped;

        case 'cubic':
            return clamped * clamped * clamped;

        case 'smooth':
            
            return clamped * clamped * (3 - 2 * clamped);

        case 'smoother':
            
            return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);

        default:
            return clamped;
    }
}

/**
 * Calculate gravity influence from distance
 * @param {number} distanceFromSurface - Distance from surface
 * @param {number} influenceRadius - Maximum influence distance
 * @param {string} falloffCurve - Falloff curve type
 * @returns {number} Influence [0, 1]
 */
export function calculateInfluence(distanceFromSurface, influenceRadius, falloffCurve = 'cubic') {
    if (distanceFromSurface <= 0) {
        return 1.0; 
    }

    if (distanceFromSurface >= influenceRadius) {
        return 0.0; 
    }

    const t = distanceFromSurface / influenceRadius;
    return applyFalloff(1 - t, falloffCurve);
}
