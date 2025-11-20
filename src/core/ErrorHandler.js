/**
 * ErrorHandler.js
 * Centralized error handling, validation, and logging
 */

export class ErrorHandler {
  /**
   * Validate username
   */
  static validateUsername(username) {
    if (typeof username !== 'string' || username.trim().length === 0) {
      throw new Error(`Invalid username: ${username}`);
    }
    if (username.length > 50) {
      throw new Error(`Username too long: ${username}`);
    }
    return username.trim();
  }

  /**
   * Validate buildId
   */
  static validateBuildId(buildId) {
    if (typeof buildId !== 'string' || buildId.trim().length === 0) {
      throw new Error(`Invalid buildId: ${buildId}`);
    }
    return buildId.trim();
  }

  /**
   * Validate color hex string
   */
  static validateColor(color) {
    if (typeof color !== 'string') {
      throw new Error(`Color must be a string: ${color}`);
    }

    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRegex.test(color)) {
      throw new Error(`Invalid color format: ${color}. Expected #RRGGBB`);
    }

    return color.toLowerCase();
  }

  /**
   * Validate alpha value (0-1)
   */
  static validateAlpha(alpha) {
    if (typeof alpha !== 'number' || isNaN(alpha)) {
      throw new Error(`Alpha must be a number: ${alpha}`);
    }
    return Math.max(0, Math.min(1, alpha));
  }

  /**
   * Validate voxel scale
   */
  static validateScale(scale) {
    if (typeof scale !== 'number' || isNaN(scale) || scale <= 0) {
      throw new Error(`Invalid scale: ${scale}`);
    }

    
    const validScales = [1.0, 0.0625];
    if (!validScales.includes(scale)) {
      throw new Error(`Scale must be 1.0 or 0.0625, got: ${scale}`);
    }

    return scale;
  }

  /**
   * Validate coordinates
   */
  static validateCoordinate(coord, name = 'coordinate') {
    if (typeof coord !== 'number' || isNaN(coord) || !isFinite(coord)) {
      throw new Error(`Invalid ${name}: ${coord}`);
    }
    return coord;
  }

  /**
   * Validate brush size
   */
  static validateBrushSize(size, min = 1, max = 10) {
    if (typeof size !== 'number' || isNaN(size)) {
      throw new Error(`Brush size must be a number: ${size}`);
    }

    const clamped = Math.max(min, Math.min(max, Math.floor(size)));
    if (clamped !== size) {
      console.warn(`Brush size ${size} clamped to ${clamped}`);
    }

    return clamped;
  }

  /**
   * Safe localStorage write with quota handling
   */
  static safeLocalStorageSet(key, value) {
    try {
      const serialized = JSON.stringify(value);

      
      const sizeBytes = new Blob([serialized]).size;
      if (sizeBytes > 5 * 1024 * 1024) { 
        throw new Error(`Data too large: ${(sizeBytes / 1024 / 1024).toFixed(2)}MB`);
      }

      localStorage.setItem(key, serialized);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.error('LocalStorage quota exceeded. Clearing old data...');

        
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const oldKey = localStorage.key(i);
          if (oldKey && oldKey.startsWith('voxelWorld_backup_')) {
            localStorage.removeItem(oldKey);
          }
        }

        
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (retryError) {
          console.error('Failed to save after cleanup:', retryError);
          return false;
        }
      } else {
        console.error(`LocalStorage error for key "${key}":`, e);
        return false;
      }
    }
  }

  /**
   * Safe localStorage read
   */
  static safeLocalStorageGet(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;

      return JSON.parse(item);
    } catch (e) {
      console.error(`Failed to read localStorage key "${key}":`, e);
      return defaultValue;
    }
  }

  /**
   * Wrap function with error boundary
   */
  static wrapWithErrorBoundary(fn, context = 'Operation') {
    return function(...args) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        console.error(`[ErrorHandler] ${context} failed:`, error);
        console.error('Stack trace:', error.stack);

        
        alert(`Error: ${context} failed. Check console for details.`);

        return null;
      }
    };
  }

  /**
   * Log performance warning
   */
  static warnPerformance(operation, durationMs, threshold = 16) {
    if (durationMs > threshold) {
      console.warn(`[Performance] ${operation} took ${durationMs.toFixed(2)}ms (threshold: ${threshold}ms)`);
    }
  }

  /**
   * Validate voxel data object
   */
  static validateVoxelData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Voxel data must be an object');
    }

    return {
      color: this.validateColor(data.color || '#808080'),
      alpha: this.validateAlpha(data.alpha ?? 1.0),
      buildId: data.buildId || null
    };
  }
}
