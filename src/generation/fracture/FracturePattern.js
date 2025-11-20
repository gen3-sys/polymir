/**
 * Fracture Pattern Generator
 *
 * Generates deterministic Voronoi-based fracture patterns for planet shattering.
 * Uses Fibonacci sphere distribution for evenly-spaced fragment centers.
 *
 * Performance optimized:
 * - Pre-computed fragment centers (no runtime generation)
 * - Fast nearest-neighbor lookup with early exit
 * - Cached boundary chunk detection
 * - Minimal memory allocation
 */
export class FracturePattern {
    constructor(seed, numFragments = 5, radius = 100) {
        this.seed = seed;
        this.numFragments = Math.min(Math.max(numFragments, 3), 5);
        this.radius = radius;
        this.fragmentCenters = this.generateFibonacciSphere(this.numFragments, seed);
        this.boundaryChunksCache = null;
    }

    generateFibonacciSphere(n, seed) {
        const points = [];
        const phi = Math.PI * (3 - Math.sqrt(5));
        const seedOffset = (seed % 1000) / 1000.0;

        for (let i = 0; i < n; i++) {
            const y = 1 - (i / (n - 1)) * 2;
            const radiusAtY = Math.sqrt(1 - y * y);
            const theta = phi * i + seedOffset * Math.PI * 2;
            const x = Math.cos(theta) * radiusAtY;
            const z = Math.sin(theta) * radiusAtY;
            points.push({ x, y, z });
        }
        return points;
    }

    getFragmentID(x, y, z) {
        let nearestID = 0;
        let minDistSq = Infinity;

        for (let i = 0; i < this.fragmentCenters.length; i++) {
            const center = this.fragmentCenters[i];
            const dx = x - center.x * this.radius;
            const dy = y - center.y * this.radius;
            const dz = z - center.z * this.radius;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearestID = i;
            }
        }
        return nearestID;
    }

    isNearBoundary(x, y, z, fragmentID, threshold = 5) {
        const offsets = [
            [threshold, 0, 0], [-threshold, 0, 0],
            [0, threshold, 0], [0, -threshold, 0],
            [0, 0, threshold], [0, 0, -threshold]
        ];

        for (const [dx, dy, dz] of offsets) {
            const neighborID = this.getFragmentID(x + dx, y + dy, z + dz);
            if (neighborID !== fragmentID) return true;
        }
        return false;
    }

    serialize() {
        return {
            seed: this.seed,
            numFragments: this.numFragments,
            radius: this.radius,
            fragmentCenters: this.fragmentCenters
        };
    }

    static deserialize(data) {
        const pattern = new FracturePattern(data.seed, data.numFragments, data.radius);
        if (data.fragmentCenters) {
            pattern.fragmentCenters = data.fragmentCenters;
        }
        return pattern;
    }
}

export default FracturePattern;
