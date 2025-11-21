import { NBT } from './NBT.js';
import { LayerConfiguration } from '../../world/LayerConfiguration.js';

export class MVoxFile {
    constructor(type, voxels, metadata = {}) {
        this.type = type;
        this.voxels = voxels;
        this.metadata = metadata;
        this.references = [];
        this.layerConfig = null; // LayerConfiguration for multi-layer files

        // Composite build support
        // isComposite: true = this is a "build" containing schematic references
        // isComposite: false = this is a singular schematic (just voxels)
        this.isComposite = metadata.isComposite || false;
        this.components = []; // Child schematic references for composite builds
    }

    /**
     * Add a nested schematic reference (for composite builds)
     * @deprecated Use addComponent() for composite builds
     */
    addReference(mvoxId, scaleRatio, position = [0, 0, 0], rotation = [0, 0, 0]) {
        this.references.push({
            mvox_id: mvoxId,
            scale_ratio: scaleRatio,
            position,
            rotation
        });
    }

    /**
     * Add a component schematic to this composite build
     * @param {Object} component - Component definition
     * @param {string} component.schematicId - Central Library schematic ID
     * @param {string} component.schematicCid - IPFS CID of the .mvox file
     * @param {Array<number>} component.offset - Position relative to build origin [x, y, z]
     * @param {Array<number>} component.rotation - Quaternion rotation [x, y, z, w]
     * @param {number} component.layerId - Layer index (0 = blocks, 1 = microblocks)
     * @param {number} component.layerScaleRatio - Scale ratio for this component
     */
    addComponent(component) {
        this.isComposite = true;
        this.components.push({
            schematic_id: component.schematicId,
            schematic_cid: component.schematicCid,
            offset: component.offset || [0, 0, 0],
            rotation: component.rotation || [0, 0, 0, 1],
            layer_id: component.layerId || 0,
            layer_scale_ratio: component.layerScaleRatio || 1.0,
            sort_order: this.components.length
        });
    }

    /**
     * Check if this is a composite build (contains other schematics)
     */
    getIsComposite() {
        return this.isComposite || this.components.length > 0;
    }

    /**
     * Get all component schematics (for composite builds)
     */
    getComponents() {
        return this.components;
    }

    /**
     * Set layer configuration for multi-layer voxel data
     */
    setLayerConfiguration(layerConfig) {
        this.layerConfig = layerConfig;
    }

    /**
     * Get layer configuration
     */
    getLayerConfiguration() {
        return this.layerConfig;
    }

    encode() {
        const header = {
            version: 1,
            type: this.type,
            compression: 'none',
            nbt_schema: `polymir_${this.type}_v1`,
            scale_label: this.metadata.scale_label || 'block',

            planet: this.metadata.planet !== undefined ? this.metadata.planet : (this.type === 'planet'),

            category: this.metadata.category || this.metadata.buildType || 'uncategorized',
            tags: this.metadata.tags || [],

            // Planet fracturing metadata
            objectType: this.metadata.objectType || 'voxel_planet',
            originalObjectFilename: this.metadata.originalObjectFilename || null,
            hasShattered: this.metadata.hasShattered || false,
            shatterGeneration: this.metadata.shatterGeneration || 0,
            parentFragmentID: this.metadata.parentFragmentID !== undefined ? this.metadata.parentFragmentID : null,
            impostorOnly: this.metadata.impostorOnly || false,

            metadata: {
                author: this.metadata.author || 'unknown',
                name: this.metadata.name || 'Untitled',
                bounds: this.metadata.bounds || [16, 16, 16],
                created: this.metadata.created || Date.now(),
                description: this.metadata.description || '',
                biomes: this.metadata.biomes || [],
                spawnFrequency: this.metadata.spawnFrequency || 0.05,

                // Gravity alignment for placement
                // Defines which direction is "down" for this schematic
                // Default [0, -1, 0] = Y-down (standard for most builds)
                // Placement aligns this vector to point toward gravitational center
                gravityVector: this.metadata.gravityVector || [0, -1, 0],

                // Optional: anchor point for placement (default: center-bottom)
                // [0.5, 0, 0.5] = center of bottom face
                anchorPoint: this.metadata.anchorPoint || [0.5, 0, 0.5],

                // Planet generation config
                gravitationalCenter: this.metadata.gravitationalCenter,
                gravitationalRadius: this.metadata.gravitationalRadius,
                coreLayers: this.metadata.coreLayers,
                terrainMinHeight: this.metadata.terrainMinHeight,
                terrainMaxHeight: this.metadata.terrainMaxHeight,
                waterLevel: this.metadata.waterLevel,
                // Gas giant specific
                atmosphereConfig: this.metadata.atmosphereConfig,
                // Fracture pattern
                fracturePattern: this.metadata.fracturePattern,
                ...this.metadata
            }
        };

        if (this.references.length > 0) {
            header.references = this.references;
        }

        // Composite build support
        // isComposite: true = "build" containing other schematics
        // isComposite: false = singular schematic (just voxels)
        header.isComposite = this.getIsComposite();
        if (this.components.length > 0) {
            header.components = this.components;
        }

        // Add layer configuration to header if present
        if (this.layerConfig) {
            header.layerConfiguration = this.layerConfig.toJSON();
        }

        const headerJson = JSON.stringify(header);
        const headerBytes = new TextEncoder().encode(headerJson);
        const separator = new TextEncoder().encode('\n');

        const nbtData = NBT.encodeVoxels(this.voxels, {
            chunkX: this.metadata.chunkX,
            chunkY: this.metadata.chunkY,
            chunkZ: this.metadata.chunkZ,
            chunkSize: this.metadata.chunkSize || 16
        });

        const totalLength = headerBytes.length + separator.length + nbtData.length;
        const result = new Uint8Array(totalLength);
        result.set(headerBytes, 0);
        result.set(separator, headerBytes.length);
        result.set(nbtData, headerBytes.length + separator.length);

        return result;
    }

    static decode(data) {
        let separatorIndex = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0x0A) {
                separatorIndex = i;
                break;
            }
        }

        if (separatorIndex === -1) {
            throw new Error('Invalid .mvox format: No header separator found');
        }

        const headerBytes = data.slice(0, separatorIndex);
        const headerJson = new TextDecoder().decode(headerBytes);
        const header = JSON.parse(headerJson);

        const nbtData = data.slice(separatorIndex + 1);
        const { voxels, metadata } = NBT.decodeVoxels(nbtData);

        const file = new MVoxFile(
            header.type,
            voxels,
            {
                ...header.metadata,
                ...metadata,
                planet: header.planet,
                category: header.category,
                tags: header.tags || [],
                // Planet fracturing metadata
                objectType: header.objectType,
                originalObjectFilename: header.originalObjectFilename,
                hasShattered: header.hasShattered,
                shatterGeneration: header.shatterGeneration,
                parentFragmentID: header.parentFragmentID,
                impostorOnly: header.impostorOnly,
                // Composite build flag
                isComposite: header.isComposite || false
            }
        );

        if (header.references) {
            file.references = header.references;
        }

        // Load composite build components
        if (header.isComposite) {
            file.isComposite = true;
        }
        if (header.components && header.components.length > 0) {
            file.components = header.components;
            file.isComposite = true;
        }

        // Load layer configuration if present
        if (header.layerConfiguration) {
            file.layerConfig = LayerConfiguration.fromJSON(header.layerConfiguration);
        }

        return file;
    }

    async save(cache, mvoxId) {
        const data = this.encode();
        await cache.saveMVox(mvoxId, data, this.type);
    }

    static async load(cache, mvoxId) {
        const data = await cache.loadMVox(mvoxId);
        if (!data) return null;
        return MVoxFile.decode(data);
    }

    toBlob() {
        const data = this.encode();
        return new Blob([data], { type: 'application/octet-stream' });
    }

    download(filename = 'structure') {
        const blob = this.toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.mvox`;
        a.click();
        URL.revokeObjectURL(url);
    }

    static async fromFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        return MVoxFile.decode(data);
    }

    getBounds() {
        if (this.voxels.size === 0) {
            return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const [encodedKey] of this.voxels) {
            const x = encodedKey & 0x1F;
            const y = (encodedKey >> 5) & 0x1F;
            const z = (encodedKey >> 10) & 0x1F;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        }

        return {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
            size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1]
        };
    }
}
