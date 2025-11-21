/**
 * POLYMIR SCHEMATIC API ROUTES
 * =============================
 * REST API endpoints for schematic upload, download, search, and management
 */

import express from 'express';
import logger from '../../utils/logger.js';

const router = express.Router();

// =============================================
// SCHEMATIC ROUTES FACTORY
// =============================================

/**
 * Create schematic routes with dependency injection
 * @param {Object} centralLibraryDB - Central Library database adapter
 * @param {Object} ipfsClient - IPFS client
 * @param {Function} authMiddleware - Authentication middleware
 * @param {Function} requireTrustScore - Trust score middleware
 * @returns {Router} Express router
 */
export function createSchematicRoutes(centralLibraryDB, ipfsClient, authMiddleware, requireTrustScore) {
    const log = logger.child('API:Schematics');

    // =============================================
    // PUBLIC ROUTES (No authentication required)
    // =============================================

    /**
     * GET /api/schematics/search
     * Search schematics with filters
     */
    router.get('/search', async (req, res) => {
        try {
            const filters = {
                category: req.query.category,
                tags: req.query.tags ? req.query.tags.split(',') : undefined,
                creatorId: req.query.creatorId,
                isPlanet: req.query.isPlanet === 'true' ? true : req.query.isPlanet === 'false' ? false : undefined,
                sortBy: req.query.sortBy || 'created_at',
                sortOrder: req.query.sortOrder || 'DESC',
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };

            const schematics = await centralLibraryDB.searchSchematics(filters);

            res.json({
                schematics,
                count: schematics.length,
                filters
            });

        } catch (error) {
            log.error('Search failed', { error: error.message });
            res.status(500).json({
                error: 'Search failed',
                message: 'Internal server error'
            });
        }
    });

    /**
     * GET /api/schematics/:schematicId
     * Get schematic metadata by ID
     */
    router.get('/:schematicId', async (req, res) => {
        try {
            const { schematicId } = req.params;

            const schematic = await centralLibraryDB.getSchematicById(schematicId);

            if (!schematic) {
                return res.status(404).json({
                    error: 'Schematic not found'
                });
            }

            res.json(schematic);

        } catch (error) {
            log.error('Get schematic failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get schematic'
            });
        }
    });

    /**
     * GET /api/schematics/cid/:fileCid
     * Get schematic metadata by IPFS CID
     */
    router.get('/cid/:fileCid', async (req, res) => {
        try {
            const { fileCid } = req.params;

            const schematic = await centralLibraryDB.getSchematicByCid(fileCid);

            if (!schematic) {
                return res.status(404).json({
                    error: 'Schematic not found'
                });
            }

            res.json(schematic);

        } catch (error) {
            log.error('Get schematic by CID failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get schematic'
            });
        }
    });

    /**
     * GET /api/schematics/:schematicId/download
     * Download schematic file from IPFS
     */
    router.get('/:schematicId/download', async (req, res) => {
        try {
            const { schematicId } = req.params;

            // Get schematic metadata
            const schematic = await centralLibraryDB.getSchematicById(schematicId);

            if (!schematic) {
                return res.status(404).json({
                    error: 'Schematic not found'
                });
            }

            // Download from IPFS
            const fileData = await ipfsClient.downloadFromIPFS(schematic.file_cid);

            // Increment download count
            await centralLibraryDB.incrementDownloadCount(schematicId);

            // Set response headers
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${schematic.name}.mvox"`);
            res.setHeader('X-Schematic-Id', schematicId);
            res.setHeader('X-File-CID', schematic.file_cid);

            // Send file data
            res.send(fileData);

            log.info('Schematic downloaded', {
                schematicId,
                name: schematic.name,
                size: fileData.length
            });

        } catch (error) {
            log.error('Download failed', { error: error.message });
            res.status(500).json({
                error: 'Download failed',
                message: error.message
            });
        }
    });

    /**
     * GET /api/schematics/:schematicId/usage
     * Get schematic usage statistics
     */
    router.get('/:schematicId/usage', async (req, res) => {
        try {
            const { schematicId } = req.params;

            const stats = await centralLibraryDB.getSchematicUsageStats(schematicId);

            res.json({
                schematicId,
                stats
            });

        } catch (error) {
            log.error('Get usage stats failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get usage statistics'
            });
        }
    });

    // =============================================
    // AUTHENTICATED ROUTES (Require trust)
    // =============================================

    /**
     * POST /api/schematics/upload
     * Upload new schematic to IPFS and register metadata
     * Requires trust score >= 0.3
     */
    router.post('/upload', authMiddleware, requireTrustScore(0.3), async (req, res) => {
        try {
            const {
                name,
                description,
                fileData,
                thumbnailData,
                sizeX,
                sizeY,
                sizeZ,
                voxelCount,
                category,
                tags,
                biomes,
                isPlanet,
                spawnFrequency
            } = req.body;

            // Validation
            if (!name || !fileData || !sizeX || !sizeY || !sizeZ || !voxelCount || !category) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['name', 'fileData', 'sizeX', 'sizeY', 'sizeZ', 'voxelCount', 'category']
                });
            }

            // Upload file to IPFS
            const result = await ipfsClient.uploadToIPFS(Buffer.from(fileData, 'base64'));
            const fileCid = result.cid;

            log.info('Schematic file uploaded to IPFS', { fileCid, name });

            // Upload thumbnail if provided
            let thumbnailCid = null;
            if (thumbnailData) {
                const thumbResult = await ipfsClient.uploadToIPFS(Buffer.from(thumbnailData, 'base64'));
                thumbnailCid = thumbResult.cid;
            }

            // Create schematic metadata
            const schematic = await centralLibraryDB.createSchematic({
                creatorId: req.playerId,
                name,
                description,
                fileCid,
                thumbnailCid,
                sizeX,
                sizeY,
                sizeZ,
                voxelCount,
                category,
                tags: tags || [],
                biomes: biomes || [],
                isPlanet: isPlanet || false,
                spawnFrequency: spawnFrequency || 0.0
            });

            log.info('Schematic registered', {
                schematicId: schematic.schematic_id,
                name,
                creator: req.player.username
            });

            res.status(201).json({
                success: true,
                schematic: {
                    schematicId: schematic.schematic_id,
                    fileCid,
                    thumbnailCid,
                    createdAt: schematic.created_at
                }
            });

        } catch (error) {
            log.error('Upload failed', { error: error.message });
            res.status(500).json({
                error: 'Upload failed',
                message: error.message
            });
        }
    });

    /**
     * PUT /api/schematics/:schematicId
     * Update schematic metadata (creator only)
     */
    router.put('/:schematicId', authMiddleware, async (req, res) => {
        try {
            const { schematicId } = req.params;

            // Get schematic
            const schematic = await centralLibraryDB.getSchematicById(schematicId);

            if (!schematic) {
                return res.status(404).json({
                    error: 'Schematic not found'
                });
            }

            // Check ownership
            if (schematic.creator_id !== req.playerId) {
                return res.status(403).json({
                    error: 'Permission denied',
                    message: 'You are not the creator of this schematic'
                });
            }

            // TODO: Implement update logic
            // For now, only allow updating description, tags, spawn_frequency

            res.status(501).json({
                error: 'Not implemented',
                message: 'Schematic update endpoint coming soon'
            });

        } catch (error) {
            log.error('Update failed', { error: error.message });
            res.status(500).json({
                error: 'Update failed'
            });
        }
    });

    /**
     * POST /api/schematics/:schematicId/usage
     * Record schematic placement in world
     */
    router.post('/:schematicId/usage', authMiddleware, async (req, res) => {
        try {
            const { schematicId } = req.params;
            const {
                worldServerId,
                megachunkX,
                megachunkY,
                megachunkZ,
                bodyId
            } = req.body;

            // Validation
            if (!worldServerId || megachunkX === undefined || megachunkY === undefined || megachunkZ === undefined) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['worldServerId', 'megachunkX', 'megachunkY', 'megachunkZ']
                });
            }

            // Record usage
            await centralLibraryDB.recordSchematicUsage({
                schematicId,
                placedBy: req.playerId,
                worldServerId,
                megachunkX,
                megachunkY,
                megachunkZ,
                bodyId: bodyId || null
            });

            log.info('Schematic usage recorded', {
                schematicId,
                playerId: req.playerId,
                worldServerId
            });

            res.json({
                success: true,
                message: 'Usage recorded'
            });

        } catch (error) {
            log.error('Record usage failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to record usage'
            });
        }
    });

    // =============================================
    // COMPOSITE BUILD ROUTES
    // =============================================

    /**
     * GET /api/schematics/:schematicId/components
     * Get all component schematics of a composite build
     */
    router.get('/:schematicId/components', async (req, res) => {
        try {
            const { schematicId } = req.params;

            const schematic = await centralLibraryDB.getSchematicById(schematicId);

            if (!schematic) {
                return res.status(404).json({
                    error: 'Schematic not found'
                });
            }

            if (!schematic.is_composite) {
                return res.json({
                    schematicId,
                    isComposite: false,
                    components: [],
                    count: 0
                });
            }

            const components = await centralLibraryDB.getSchematicComponents(schematicId);

            res.json({
                schematicId,
                isComposite: true,
                components: components.map(c => ({
                    referenceId: c.reference_id,
                    childSchematicId: c.child_schematic_id,
                    childName: c.child_name,
                    childFileCid: c.child_file_cid,
                    childThumbnailCid: c.child_thumbnail_cid,
                    childSize: [c.child_size_x, c.child_size_y, c.child_size_z],
                    childIsComposite: c.child_is_composite,
                    offset: [c.offset_x, c.offset_y, c.offset_z],
                    rotation: [c.rotation_x, c.rotation_y, c.rotation_z, c.rotation_w],
                    layerId: c.layer_id,
                    layerScaleRatio: c.layer_scale_ratio,
                    sortOrder: c.sort_order
                })),
                count: components.length
            });

        } catch (error) {
            log.error('Get components failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get components'
            });
        }
    });

    /**
     * POST /api/schematics/:schematicId/components
     * Add a component to a composite build (creator only)
     */
    router.post('/:schematicId/components', authMiddleware, async (req, res) => {
        try {
            const { schematicId } = req.params;
            const {
                childSchematicId,
                offsetX, offsetY, offsetZ,
                rotationX, rotationY, rotationZ, rotationW,
                layerId, layerScaleRatio
            } = req.body;

            // Get parent schematic
            const schematic = await centralLibraryDB.getSchematicById(schematicId);

            if (!schematic) {
                return res.status(404).json({
                    error: 'Schematic not found'
                });
            }

            // Check ownership
            if (schematic.creator_id !== req.playerId) {
                return res.status(403).json({
                    error: 'Permission denied',
                    message: 'Only the creator can modify components'
                });
            }

            // Validate child schematic exists
            if (!childSchematicId) {
                return res.status(400).json({
                    error: 'Missing childSchematicId'
                });
            }

            const childSchematic = await centralLibraryDB.getSchematicById(childSchematicId);
            if (!childSchematic) {
                return res.status(404).json({
                    error: 'Child schematic not found'
                });
            }

            // Add reference
            const result = await centralLibraryDB.addSchematicReference({
                parentSchematicId: schematicId,
                childSchematicId,
                offsetX: offsetX || 0,
                offsetY: offsetY || 0,
                offsetZ: offsetZ || 0,
                rotationX: rotationX || 0,
                rotationY: rotationY || 0,
                rotationZ: rotationZ || 0,
                rotationW: rotationW || 1,
                layerId: layerId || 0,
                layerScaleRatio: layerScaleRatio || 1.0
            });

            log.info('Component added to composite', {
                parentId: schematicId,
                childId: childSchematicId,
                referenceId: result.reference_id
            });

            res.status(201).json({
                success: true,
                referenceId: result.reference_id,
                addedAt: result.added_at
            });

        } catch (error) {
            log.error('Add component failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to add component'
            });
        }
    });

    /**
     * DELETE /api/schematics/:schematicId/components/:referenceId
     * Remove a component from a composite build (creator only)
     */
    router.delete('/:schematicId/components/:referenceId', authMiddleware, async (req, res) => {
        try {
            const { schematicId, referenceId } = req.params;

            // Get parent schematic
            const schematic = await centralLibraryDB.getSchematicById(schematicId);

            if (!schematic) {
                return res.status(404).json({
                    error: 'Schematic not found'
                });
            }

            // Check ownership
            if (schematic.creator_id !== req.playerId) {
                return res.status(403).json({
                    error: 'Permission denied',
                    message: 'Only the creator can modify components'
                });
            }

            const success = await centralLibraryDB.removeSchematicReference(referenceId);

            if (success) {
                log.info('Component removed from composite', {
                    parentId: schematicId,
                    referenceId
                });

                res.json({
                    success: true,
                    message: 'Component removed'
                });
            } else {
                res.status(404).json({
                    error: 'Reference not found'
                });
            }

        } catch (error) {
            log.error('Remove component failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to remove component'
            });
        }
    });

    /**
     * POST /api/schematics/composite
     * Create a new composite build from multiple schematics
     */
    router.post('/composite', authMiddleware, requireTrustScore(0.3), async (req, res) => {
        try {
            const {
                name,
                description,
                category,
                tags,
                components // Array of { schematicId, offset: [x,y,z], rotation: [x,y,z,w], layerId, layerScaleRatio }
            } = req.body;

            // Validation
            if (!name || !Array.isArray(components) || components.length < 2) {
                return res.status(400).json({
                    error: 'Invalid composite build',
                    required: ['name', 'components (array with 2+ items)']
                });
            }

            // Validate all component schematics exist
            for (const comp of components) {
                if (!comp.schematicId) {
                    return res.status(400).json({
                        error: 'Each component must have schematicId'
                    });
                }

                const exists = await centralLibraryDB.getSchematicById(comp.schematicId);
                if (!exists) {
                    return res.status(404).json({
                        error: `Component schematic not found: ${comp.schematicId}`
                    });
                }
            }

            // Create composite
            const result = await centralLibraryDB.createCompositeBuild(
                {
                    creatorId: req.playerId,
                    name,
                    description,
                    category: category || 'composite_build',
                    tags: tags || ['composite'],
                    sizeX: 1, // Placeholder - would compute from components
                    sizeY: 1,
                    sizeZ: 1,
                    voxelCount: 0,
                    fileCid: null // Composite doesn't have direct file
                },
                components
            );

            log.info('Composite build created', {
                schematicId: result.schematic_id,
                name,
                componentCount: components.length,
                creator: req.playerId
            });

            res.status(201).json({
                success: true,
                schematicId: result.schematic_id,
                createdAt: result.created_at,
                componentCount: components.length
            });

        } catch (error) {
            log.error('Create composite failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to create composite build'
            });
        }
    });

    /**
     * GET /api/schematics/:schematicId/used-in
     * Get all composite builds that use this schematic as a component
     */
    router.get('/:schematicId/used-in', async (req, res) => {
        try {
            const { schematicId } = req.params;

            const builds = await centralLibraryDB.getBuildsUsingSchematic(schematicId);

            res.json({
                schematicId,
                usedIn: builds.map(b => ({
                    schematicId: b.schematic_id,
                    name: b.name,
                    creatorId: b.creator_id,
                    offset: [b.offset_x, b.offset_y, b.offset_z],
                    layerId: b.layer_id
                })),
                count: builds.length
            });

        } catch (error) {
            log.error('Get used-in failed', { error: error.message });
            res.status(500).json({
                error: 'Failed to get usage info'
            });
        }
    });

    return router;
}

// =============================================
// EXPORTS
// =============================================

export default createSchematicRoutes;
