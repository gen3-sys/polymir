/**
 * Deterministic Galaxy Naming System
 * Generates unique, consistent names for galaxies based on seed/coordinates
 */

export class GalaxyNaming {
    static catalogPrefixes = ['NGC', 'UGC', 'ESO', 'MCG', 'CGCG', 'IC', 'PGC', 'Mrk', 'Arp'];

    static constellations = [
        'Andromeda', 'Antlia', 'Apus', 'Aquarius', 'Aquila', 'Ara', 'Aries', 'Auriga',
        'Boötes', 'Caelum', 'Camelopardalis', 'Cancer', 'Canes Venatici', 'Canis Major', 'Canis Minor',
        'Capricornus', 'Carina', 'Cassiopeia', 'Centaurus', 'Cepheus', 'Cetus', 'Chamaeleon',
        'Circinus', 'Columba', 'Coma Berenices', 'Corona Australis', 'Corona Borealis', 'Corvus',
        'Crater', 'Crux', 'Cygnus', 'Delphinus', 'Dorado', 'Draco', 'Equuleus', 'Eridanus',
        'Fornax', 'Gemini', 'Grus', 'Hercules', 'Horologium', 'Hydra', 'Hydrus', 'Indus',
        'Lacerta', 'Leo', 'Leo Minor', 'Lepus', 'Libra', 'Lupus', 'Lynx', 'Lyra',
        'Mensa', 'Microscopium', 'Monoceros', 'Musca', 'Norma', 'Octans', 'Ophiuchus', 'Orion',
        'Pavo', 'Pegasus', 'Perseus', 'Phoenix', 'Pictor', 'Pisces', 'Piscis Austrinus',
        'Puppis', 'Pyxis', 'Reticulum', 'Sagitta', 'Sagittarius', 'Scorpius', 'Sculptor',
        'Scutum', 'Serpens', 'Sextans', 'Taurus', 'Telescopium', 'Triangulum', 'Triangulum Australe',
        'Tucana', 'Ursa Major', 'Ursa Minor', 'Vela', 'Virgo', 'Volans', 'Vulpecula'
    ];

    static generateGalaxyId(x, y, z, superclusterSeed = 0) {
        const combined = `${superclusterSeed}_${x}_${y}_${z}`;
        return `galaxy_${this.hashString(combined)}`;
    }

    static generateGalaxyName(galaxyId, useModifier = true) {
        const hash = this.hashString(galaxyId);
        const nameType = hash % 3;

        if (nameType === 0) {
            const catalog = this.catalogPrefixes[hash % this.catalogPrefixes.length];
            const number = 100 + (hash % 9000);
            const suffix = ['', 'A', 'B', 'C'][hash % 4];
            return `${catalog} ${number}${suffix}`;
        }

        if (nameType === 1) {
            const constellation = this.constellations[hash % this.constellations.length];
            const designation = String.fromCharCode(65 + (hash % 26));
            return `${designation} ${constellation}`;
        }

        const ra = (hash % 24).toString().padStart(2, '0');
        const dec = ((hash % 180) - 90);
        const decSign = dec >= 0 ? '+' : '';
        const decStr = Math.abs(dec).toString().padStart(2, '0');
        const seq = (hash % 1000).toString().padStart(3, '0');
        return `J${ra}${decSign}${decStr}-${seq}`;
    }

    /**
     * Generate a galaxy object with unique ID, name, and metadata
     */
    static createGalaxy(x = 0, y = 0, z = 0, superclusterSeed = 0, options = {}) {
        const galaxyId = this.generateGalaxyId(x, y, z, superclusterSeed);
        const galaxyName = options.name || this.generateGalaxyName(galaxyId);

        return {
            id: galaxyId,
            name: galaxyName,
            position: { x, y, z },
            superclusterSeed,
            timestamp: Date.now(),
            systems: [],
            permissions: {
                owner: options.owner || 'local',
                public: options.public || false,
                allowedUsers: options.allowedUsers || []
            },
            metadata: {
                created: new Date().toISOString(),
                version: '1.0.0',
                type: options.type || 'spiral'
            }
        };
    }

    /**
     * Hash a string to a consistent number
     */
    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    /**
     * Validate galaxy ID format
     */
    static isValidGalaxyId(galaxyId) {
        return typeof galaxyId === 'string' && galaxyId.startsWith('galaxy_');
    }

    /**
     * Extract coordinates from galaxy ID (if stored in a specific format)
     */
    static parseGalaxyId(galaxyId) {
        if (!this.isValidGalaxyId(galaxyId)) {
            return null;
        }

        return {
            id: galaxyId,
            hash: galaxyId.replace('galaxy_', '')
        };
    }
}

/**
 * Deterministic Planet Naming System
 */
export class PlanetNaming {
    static starPrefixes = [
        'Kepler', 'TRAPPIST', 'Gliese', 'Ross', 'Wolf', 'Luyten', 'Lacaille',
        'Groombridge', 'Lalande', 'Struve', 'HD', 'HIP', 'LHS', 'WISE', 'EPIC',
        'TOI', 'KOI', 'K2', 'WASP', 'HAT', 'XO', 'CoRoT', 'OGLE', 'MOA'
    ];

    static generatePlanetId(systemId, orbitIndex, seed = 0) {
        const combined = `${systemId}_orbit${orbitIndex}_${seed}`;
        return `planet_${this.hashString(combined)}`;
    }

    static generatePlanetName(planetId, biome, orbitIndex, options = {}) {
        const hash = this.hashString(planetId);
        const nameType = hash % 3;

        if (nameType === 0) {
            const starPrefix = this.starPrefixes[hash % this.starPrefixes.length];
            const starNumber = 10 + (hash % 9990);
            const planetLetter = String.fromCharCode(98 + orbitIndex);
            return `${starPrefix}-${starNumber} ${planetLetter}`;
        }

        if (nameType === 1) {
            const designation = Math.floor(100 + (hash % 900));
            const sector = String.fromCharCode(65 + (hash % 26));
            const subsector = String.fromCharCode(65 + ((hash >> 8) % 26));
            const planetNum = orbitIndex + 1;
            return `${designation}-${sector}${subsector}-${planetNum}`;
        }

        const ra = (hash % 24).toString().padStart(2, '0');
        const raMin = (hash % 60).toString().padStart(2, '0');
        const dec = ((hash % 180) - 90);
        const decSign = dec >= 0 ? '+' : '';
        const decStr = Math.abs(dec).toString().padStart(2, '0');
        const planetLetter = String.fromCharCode(98 + orbitIndex);
        return `J${ra}${raMin}${decSign}${decStr}.${planetLetter}`;
    }

    static generateSimpleName(systemName, orbitIndex) {
        const letters = 'bcdefghijklmnop';
        if (orbitIndex < letters.length) {
            return `${systemName} ${letters[orbitIndex]}`;
        }
        return `${systemName} ${orbitIndex + 1}`;
    }

    /**
     * Hash string to number (same as GalaxyNaming for consistency)
     */
    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    /**
     * Create complete planet object with deterministic naming
     */
    static createPlanet(systemId, orbitIndex, biome, options = {}) {
        const seed = options.seed || Date.now();
        const planetId = this.generatePlanetId(systemId, orbitIndex, seed);
        const planetName = options.name || this.generatePlanetName(planetId, biome, orbitIndex);

        return {
            id: planetId,
            name: planetName,
            biome: biome,
            orbitIndex: orbitIndex,
            systemId: systemId,
            ...options
        };
    }
}
