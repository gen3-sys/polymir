import * as THREE from '../lib/three.module.js';

export class PortalManager {
    constructor(scene, renderer, chunkManager) {
        this.scene = scene;
        this.renderer = renderer;
        this.chunkManager = chunkManager;

        this.portals = new Map();
        this.portalLinks = new Map();
        this.pocketDimensions = new Map();

        // Voxel-based portal tracking
        this.voxelPortals = []; // { id, blocks, bounds, schematic, renderTarget, portalMesh, portalCamera, center }
        this.nextPortalId = 1;
        this.portalRenderSize = 1024;
        this.portalRecursionDepth = 2;
    }

    createPortal(config) {
        const {
            position,
            normal,
            size,
            shape = 'rectangle',
            isPocketEntrance = false,
            pocketSchematicId = null
        } = config;

        const id = this.generateId();

        const portal = {
            id,
            position: [...position],
            normal: this.normalizeVector(normal),
            size: [...size],
            shape,
            linkedPortalId: null,
            isPocketEntrance,
            pocketDimensionId: null,
            active: true,
            maxRecursion: 3
        };

        if (isPocketEntrance && pocketSchematicId) {
            portal.pocketDimensionId = this.createPocketDimension(pocketSchematicId);
            const exitPortal = this.createPocketExitPortal(portal);
            this.linkPortals(id, exitPortal.id);
        }

        this.portals.set(id, portal);
        return id;
    }

    createPocketDimension(interiorSchematicId) {
        const id = this.generateId('pocket');

        const pocket = {
            id,
            interiorSchematicId,
            instances: [],
            externalSize: [3, 3, 3],
            internalSize: [48, 48, 48],
            scaleFactor: 16,
            localGravity: [0, -9.8, 0],
            entrancePortalId: null,
            exitPortalId: null
        };

        this.pocketDimensions.set(id, pocket);
        return id;
    }

    createPocketExitPortal(entrancePortal) {
        const pocket = this.pocketDimensions.get(entrancePortal.pocketDimensionId);
        if (!pocket) return null;

        const exitPosition = [
            pocket.internalSize[0] / 2,
            pocket.internalSize[1] / 2,
            0
        ];

        const exitPortal = {
            id: this.generateId(),
            position: exitPosition,
            normal: [0, 0, -1],
            size: [
                entrancePortal.size[0] * pocket.scaleFactor,
                entrancePortal.size[1] * pocket.scaleFactor
            ],
            shape: entrancePortal.shape,
            linkedPortalId: entrancePortal.id,
            isPocketEntrance: false,
            pocketDimensionId: null,
            active: true,
            maxRecursion: 3
        };

        this.portals.set(exitPortal.id, exitPortal);

        pocket.entrancePortalId = entrancePortal.id;
        pocket.exitPortalId = exitPortal.id;

        return exitPortal;
    }

    linkPortals(portalAId, portalBId) {
        const pA = this.portals.get(portalAId);
        const pB = this.portals.get(portalBId);

        if (!pA || !pB) return false;

        pA.linkedPortalId = portalBId;
        pB.linkedPortalId = portalAId;

        this.portalLinks.set(portalAId, portalBId);
        this.portalLinks.set(portalBId, portalAId);

        return true;
    }

    getPortal(portalId) {
        return this.portals.get(portalId);
    }

    getPocketDimension(pocketId) {
        return this.pocketDimensions.get(pocketId);
    }

    removePortal(portalId) {
        const portal = this.portals.get(portalId);
        if (!portal) return;

        if (portal.linkedPortalId) {
            const linked = this.portals.get(portal.linkedPortalId);
            if (linked) {
                linked.linkedPortalId = null;
            }
            this.portalLinks.delete(portal.linkedPortalId);
        }

        if (portal.pocketDimensionId) {
            this.pocketDimensions.delete(portal.pocketDimensionId);
        }

        this.portals.delete(portalId);
        this.portalLinks.delete(portalId);
    }

    normalizeVector(v) {
        const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (len === 0) return [0, 0, 1];
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    generateId(prefix = 'portal') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `${prefix}_${timestamp}_${random}`;
    }

    // ========== VOXEL-BASED PORTAL SYSTEM ==========

    /**
     * Called when a portal block is placed
     * @param {number} worldX - World X coordinate
     * @param {number} worldY - World Y coordinate
     * @param {number} worldZ - World Z coordinate
     * @param {object} placementNormal - Face normal where block was placed
     * @param {object} placementRotation - Player's rotation when placing {yaw, pitch}
     */
    onPortalBlockPlaced(worldX, worldY, worldZ, placementNormal, placementRotation) {
        // Detect if this connects to an existing portal structure
        const existingPortal = this.voxelPortals.find(p =>
            p.blocks.some(b => {
                const dist = Math.abs(b.x - worldX) + Math.abs(b.y - worldY) + Math.abs(b.z - worldZ);
                return dist === 1; // Adjacent
            })
        );

        if (existingPortal) {
            // Extend existing portal
            existingPortal.blocks.push({ x: worldX, y: worldY, z: worldZ });
            // Recompute schematic with updated blocks
            const blocks = this.detectPortalStructure(worldX, worldY, worldZ);
            existingPortal.schematic = this.createPortalSchematic(
                blocks,
                existingPortal.schematic.normal,
                existingPortal.schematic.placementRotation
            );
            console.log(`🌀 Extended portal #${existingPortal.id} (${existingPortal.blocks.length} blocks)`);
        } else {
            // New portal structure
            let cardinalNormal = this.normalizeToCardinal(placementNormal);

            // FIX #2: Validate normal direction - should point toward empty space
            const frontVoxel = this.getVoxelAt(
                worldX + cardinalNormal.x,
                worldY + cardinalNormal.y,
                worldZ + cardinalNormal.z
            );
            const backVoxel = this.getVoxelAt(
                worldX - cardinalNormal.x,
                worldY - cardinalNormal.y,
                worldZ - cardinalNormal.z
            );

            // If front is solid and back is empty, we're facing the wrong way - flip it
            if (frontVoxel !== 0 && backVoxel === 0) {
                cardinalNormal = {
                    x: -cardinalNormal.x,
                    y: -cardinalNormal.y,
                    z: -cardinalNormal.z
                };
                console.log(`   🔄 Flipped normal to point toward empty space: [${cardinalNormal.x}, ${cardinalNormal.y}, ${cardinalNormal.z}]`);
            }

            const blocks = this.detectPortalStructure(worldX, worldY, worldZ);
            // NOTE: placementRotation is now IGNORED for orientation - only normal is used
            const schematic = this.createPortalSchematic(blocks, cardinalNormal, {
                yaw: 0,
                pitch: 0
            });

            const newPortal = {
                id: this.nextPortalId++,
                blocks: blocks,
                bounds: schematic.bounds,
                schematic: schematic,
                linkedTo: null,
                renderTarget: null,
                portalMesh: null,
                portalCamera: null,
                center: null
            };

            this.voxelPortals.push(newPortal);
            console.log(`🌀 Created new portal #${newPortal.id} (${blocks.length} blocks)`);
            console.log(`   Portal normal: [${cardinalNormal.x}, ${cardinalNormal.y}, ${cardinalNormal.z}]`);

            // Check for unlinked portals to link
            const unlinked = this.voxelPortals.filter(p => p.linkedTo === null && p.id !== newPortal.id);
            if (unlinked.length > 0) {
                // Auto-link to first unlinked portal
                this.linkVoxelPortals(newPortal.id, unlinked[0].id);
            }
        }
    }

    /**
     * Detect connected portal blocks using flood-fill
     */
    detectPortalStructure(startX, startY, startZ) {
        const PORTAL_BLOCK_ID = 300; // From VoxelTypes.PORTAL_BLOCK.id
        const visited = new Set();
        const blocks = [];
        const queue = [{ x: startX, y: startY, z: startZ }];

        while (queue.length > 0) {
            const { x, y, z } = queue.shift();
            const key = `${x},${y},${z}`;

            if (visited.has(key)) continue;
            visited.add(key);

            // Check if this block is a portal block
            const voxel = this.getVoxelAt(x, y, z);
            if (voxel !== PORTAL_BLOCK_ID) continue;

            blocks.push({ x, y, z });

            // Check 6 adjacent blocks
            const neighbors = [
                { x: x + 1, y, z }, { x: x - 1, y, z },
                { x, y: y + 1, z }, { x, y: y - 1, z },
                { x, y, z: z + 1 }, { x, y, z: z - 1 }
            ];

            neighbors.forEach(n => {
                const nKey = `${n.x},${n.y},${n.z}`;
                if (!visited.has(nKey)) {
                    queue.push(n);
                }
            });
        }

        return blocks;
    }

    /**
     * Get voxel ID at world coordinates
     */
    getVoxelAt(x, y, z) {
        // Delegate to chunk manager
        if (!this.chunkManager) return 0;

        const chunkX = Math.floor(x / 16);
        const chunkY = Math.floor(y / 16);
        const chunkZ = Math.floor(z / 16);

        const chunk = this.chunkManager.getChunk(chunkX, chunkY, chunkZ);
        if (!chunk) return 0;

        const localX = ((x % 16) + 16) % 16;
        const localY = ((y % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;

        return chunk.getVoxel(localX, localY, localZ);
    }

    normalizeToCardinal(normal) {
        const absX = Math.abs(normal.x);
        const absY = Math.abs(normal.y);
        const absZ = Math.abs(normal.z);

        if (absX > absY && absX > absZ) {
            return { x: normal.x > 0 ? 1 : -1, y: 0, z: 0 };
        } else if (absY > absX && absY > absZ) {
            return { x: 0, y: normal.y > 0 ? 1 : -1, z: 0 };
        } else {
            return { x: 0, y: 0, z: normal.z > 0 ? 1 : -1 };
        }
    }

    createPortalSchematic(blocks, normal, placementRotation) {
        const bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        blocks.forEach(({ x, y, z }) => {
            bounds.min.x = Math.min(bounds.min.x, x);
            bounds.min.y = Math.min(bounds.min.y, y);
            bounds.min.z = Math.min(bounds.min.z, z);
            bounds.max.x = Math.max(bounds.max.x, x);
            bounds.max.y = Math.max(bounds.max.y, y);
            bounds.max.z = Math.max(bounds.max.z, z);
        });

        return {
            type: 'PORTAL',
            version: 1,
            created: Date.now(),
            bounds,
            blockCount: blocks.length,
            blocks: blocks.map(b => ({ ...b, type: 300 })),
            linkedTo: null,
            placementRotation: placementRotation || { yaw: 0, pitch: 0 },
            normal
        };
    }

    linkVoxelPortals(idA, idB) {
        const portalA = this.voxelPortals.find(p => p.id === idA);
        const portalB = this.voxelPortals.find(p => p.id === idB);

        if (!portalA || !portalB) return false;

        portalA.linkedTo = idB;
        portalB.linkedTo = idA;

        console.log(`✅ Linked portal #${idA} ↔ #${idB}`);

        // Create portal surfaces for rendering
        this.createPortalSurface(portalA);
        this.createPortalSurface(portalB);

        return true;
    }

    createPortalSurface(portal) {
        if (!this.renderer || !this.scene) return;

        // Create render target for this portal's view
        const renderTarget = new THREE.WebGLRenderTarget(this.portalRenderSize, this.portalRenderSize, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: true,
            generateMipmaps: false
        });

        portal.renderTarget = renderTarget;

        // Create camera for this portal's perspective
        const portalCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        portal.portalCamera = portalCamera;

        // Calculate portal surface position
        const bounds = portal.schematic.bounds;
        const center = new THREE.Vector3(
            (bounds.min.x + bounds.max.x) / 2,
            (bounds.min.y + bounds.max.y) / 2,
            (bounds.min.z + bounds.max.z) / 2
        );

        const normal = new THREE.Vector3(portal.schematic.normal.x, portal.schematic.normal.y, portal.schematic.normal.z);
        const width = Math.max(
            Math.abs(bounds.max.x - bounds.min.x),
            Math.abs(bounds.max.z - bounds.min.z)
        ) + 1;
        const height = Math.abs(bounds.max.y - bounds.min.y) + 1;

        // FIX #1: Build deterministic orthonormal basis - ONLY uses normal, not player rotation
        // This makes portals behave like Portal 2 - consistent orientation based on surface type
        const worldUp = new THREE.Vector3(0, 1, 0);
        const worldForward = new THREE.Vector3(0, 0, 1);

        let up, right;

        // Determine portal "up" direction based on surface type
        if (Math.abs(normal.y) > 0.99) {
            // HORIZONTAL SURFACE (floor or ceiling)
            // Use world Z as the portal's "up" direction
            up = worldForward.clone();
            // If ceiling (normal points down), reverse the up direction
            if (normal.y < 0) {
                up.negate();
            }
        } else {
            // VERTICAL SURFACE (wall)
            // Use world Y (sky direction) as base for portal's "up"
            up = worldUp.clone();
            // Project onto portal plane to make it perpendicular to normal
            up.sub(normal.clone().multiplyScalar(up.dot(normal))).normalize();
        }

        // Right vector: perpendicular to both up and normal
        right = new THREE.Vector3().crossVectors(up, normal).normalize();

        // Recalculate up to ensure perfect orthonormal basis (fixes any floating point errors)
        up = new THREE.Vector3().crossVectors(normal, right).normalize();

        // Forward points INTO portal surface (for correct crossing detection)
        const forward = normal.clone().negate();

        // Build portal transform matrix T = [R | p] where R = [right up forward]
        const T = new THREE.Matrix4();
        T.makeBasis(right, up, forward);
        T.setPosition(center);

        // Store transform and inverse for teleportation
        portal.transform = T;
        portal.transformInv = new THREE.Matrix4().copy(T).invert();
        portal.center = center;
        portal.forward = forward;
        portal.right = right;
        portal.up = up;

        // Create portal mesh (plane with render target texture)
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
            map: renderTarget.texture,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true,
            depthTest: true
        });

        const portalMesh = new THREE.Mesh(geometry, material);
        portalMesh.position.copy(center);

        // Orient mesh to match portal basis
        const quaternion = new THREE.Quaternion();
        quaternion.setFromRotationMatrix(T);
        portalMesh.setRotationFromQuaternion(quaternion);

        portal.portalMesh = portalMesh;
        this.scene.add(portalMesh);

        console.log(`📺 Created portal surface for portal #${portal.id} at [${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}]`);
    }

    setObliqueNearPlane(camera, portalPlane) {
        // Oblique near-plane clipping - prevents artifacts at portal surface
        const clipPlane = new THREE.Vector4(
            portalPlane.normal.x,
            portalPlane.normal.y,
            portalPlane.normal.z,
            -portalPlane.constant
        );

        const projectionMatrix = camera.projectionMatrix;

        const q = new THREE.Vector4(
            (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0],
            (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5],
            -1.0,
            (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14]
        );

        const c = clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

        projectionMatrix.elements[2] = c.x;
        projectionMatrix.elements[6] = c.y;
        projectionMatrix.elements[10] = c.z + 1.0;
        projectionMatrix.elements[14] = c.w;
    }

    /**
     * Update portal views - called every frame
     * Uses affine transform approach: M = T_B · F · T_A⁻¹
     */
    updatePortalViews(playerCamera, recursionLevel = 0) {
        if (recursionLevel >= this.portalRecursionDepth) return;

        for (const srcPortal of this.voxelPortals) {
            if (srcPortal.linkedTo === null || !srcPortal.renderTarget || !srcPortal.transform) continue;

            const dstPortal = this.voxelPortals.find(p => p.id === srcPortal.linkedTo);
            if (!dstPortal || !dstPortal.transform) continue;

            // Flip matrix F = diag(1, 1, -1, 1) reverses forward axis
            const F = new THREE.Matrix4();
            F.set(
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, -1, 0,
                0, 0, 0, 1
            );

            // Teleport transform M = T_B · F · T_A⁻¹
            const M = new THREE.Matrix4();
            M.multiplyMatrices(dstPortal.transform, F);
            M.multiply(srcPortal.transformInv);

            // Transform camera position
            const camPosHomogeneous = new THREE.Vector4(
                playerCamera.position.x,
                playerCamera.position.y,
                playerCamera.position.z,
                1
            );
            camPosHomogeneous.applyMatrix4(M);

            const transformedPos = new THREE.Vector3(
                camPosHomogeneous.x,
                camPosHomogeneous.y,
                camPosHomogeneous.z
            );

            // Edge correction: ensure camera is on correct side of destination portal
            const distFromPortal = new THREE.Vector3()
                .subVectors(transformedPos, dstPortal.center)
                .dot(dstPortal.forward.clone().negate()); // Forward points IN, so negate for OUT

            const epsilon = 0.3;
            if (distFromPortal < epsilon) {
                // Project onto exit plane with offset
                const correction = dstPortal.forward.clone().negate().multiplyScalar(epsilon - distFromPortal);
                transformedPos.add(correction);
            }

            srcPortal.portalCamera.position.copy(transformedPos);

            // Transform camera orientation using 3×3 rotation part
            const R_A = new THREE.Matrix3().setFromMatrix4(srcPortal.transform);
            const R_B = new THREE.Matrix3().setFromMatrix4(dstPortal.transform);
            const F_3 = new THREE.Matrix3().set(
                1, 0, 0,
                0, 1, 0,
                0, 0, -1
            );

            // Get camera's current world orientation matrix
            const camWorldMat = new THREE.Matrix4().makeRotationFromQuaternion(playerCamera.quaternion);
            const C_world = new THREE.Matrix3().setFromMatrix4(camWorldMat);

            // Transform: C_world' = R_B · F_3 · R_A^T · C_world
            const R_A_T = new THREE.Matrix3().copy(R_A).transpose();
            const temp1 = new THREE.Matrix3().multiplyMatrices(R_A_T, C_world);
            const temp2 = new THREE.Matrix3().multiplyMatrices(F_3, temp1);
            const C_world_prime = new THREE.Matrix3().multiplyMatrices(R_B, temp2);

            // Convert back to quaternion
            const rotMat4 = new THREE.Matrix4().setFromMatrix3(C_world_prime);
            const newQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotMat4);
            srcPortal.portalCamera.quaternion.copy(newQuaternion);

            // Update projection matrix
            srcPortal.portalCamera.updateProjectionMatrix();

            // Apply oblique near-plane clipping
            const exitNormal = dstPortal.forward.clone().negate(); // Points out of portal
            const portalPlane = new THREE.Plane();
            portalPlane.setFromNormalAndCoplanarPoint(exitNormal, dstPortal.center);
            this.setObliqueNearPlane(srcPortal.portalCamera, portalPlane);

            // Temporarily hide this portal's mesh to avoid self-occlusion
            const wasVisible = srcPortal.portalMesh.visible;
            srcPortal.portalMesh.visible = false;

            // Render recursively (portals through portals)
            if (recursionLevel < this.portalRecursionDepth - 1) {
                this.updatePortalViews(playerCamera, recursionLevel + 1);
            }

            // Render the scene from the transformed viewpoint
            const currentRenderTarget = this.renderer.getRenderTarget();
            this.renderer.setRenderTarget(srcPortal.renderTarget);
            this.renderer.clear();
            this.renderer.render(this.scene, srcPortal.portalCamera);
            this.renderer.setRenderTarget(currentRenderTarget);

            // Restore portal mesh visibility
            srcPortal.portalMesh.visible = wasVisible;
        }
    }

    /**
     * Called when a portal block is removed
     */
    onPortalBlockRemoved(worldX, worldY, worldZ) {
        // Find which portal this block belonged to
        const portalIndex = this.voxelPortals.findIndex(p =>
            p.blocks.some(b => b.x === worldX && b.y === worldY && b.z === worldZ)
        );

        if (portalIndex !== -1) {
            const portal = this.voxelPortals[portalIndex];

            // Remove the block
            portal.blocks = portal.blocks.filter(b =>
                !(b.x === worldX && b.y === worldY && b.z === worldZ)
            );

            if (portal.blocks.length === 0) {
                // Portal fully destroyed - clean up rendering resources
                if (portal.portalMesh) {
                    this.scene.remove(portal.portalMesh);
                    portal.portalMesh.geometry.dispose();
                    portal.portalMesh.material.dispose();
                }
                if (portal.renderTarget) {
                    portal.renderTarget.dispose();
                }

                if (portal.linkedTo !== null) {
                    // Unlink and clean up the other portal's rendering
                    const linkedPortal = this.voxelPortals.find(p => p.id === portal.linkedTo);
                    if (linkedPortal) {
                        linkedPortal.linkedTo = null;
                        linkedPortal.schematic.linkedTo = null;

                        // Remove linked portal's surface
                        if (linkedPortal.portalMesh) {
                            this.scene.remove(linkedPortal.portalMesh);
                            linkedPortal.portalMesh.geometry.dispose();
                            linkedPortal.portalMesh.material.dispose();
                            linkedPortal.portalMesh = null;
                        }
                        if (linkedPortal.renderTarget) {
                            linkedPortal.renderTarget.dispose();
                            linkedPortal.renderTarget = null;
                        }

                        console.log(`🔓 Unlinked portal #${linkedPortal.id}`);
                    }
                }
                this.voxelPortals.splice(portalIndex, 1);
                console.log(`🗑️ Destroyed portal #${portal.id}`);
            } else {
                // Update schematic with remaining blocks
                portal.schematic = this.createPortalSchematic(
                    portal.blocks,
                    portal.schematic.normal,
                    portal.schematic.placementRotation
                );
                console.log(`⚠️ Modified portal #${portal.id} (${portal.blocks.length} blocks)`);
            }
        }
    }

    save() {
        return {
            portals: Array.from(this.portals.entries()),
            portalLinks: Array.from(this.portalLinks.entries()),
            pocketDimensions: Array.from(this.pocketDimensions.entries())
        };
    }

    load(data) {
        if (data.portals) {
            this.portals = new Map(data.portals);
        }
        if (data.portalLinks) {
            this.portalLinks = new Map(data.portalLinks);
        }
        if (data.pocketDimensions) {
            this.pocketDimensions = new Map(data.pocketDimensions);
        }
    }
}

export default PortalManager;
