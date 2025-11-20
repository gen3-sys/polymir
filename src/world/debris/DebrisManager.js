import * as THREE from '../../lib/three.module.js';
import { Logger } from '../../debug/Logger.js';
import { ChunkDamageData } from './ChunkDamageData.js';
import { DebrisEntity } from './DebrisEntity.js';
import { DebrisPhysics } from './DebrisPhysics.js';
import { ChunkCoordinate } from '../../spatial/ChunkCoordinate.js';

export class DebrisManager {
    constructor(game) {
        this.game = game;

        this.debrisEntities = new Map();
        this.damageData = new Map();
        this.debrisPool = [];

        this.physics = new DebrisPhysics();

        this.planet = null;
        this.chunkSize = 16;

        this.maxActiveDebris = 100;
        this.enabled = true;

        this.gravitySources = [];
    }

    setPlanet(planet) {
        this.planet = planet;
        this.gravitySources = [{
            position: new THREE.Vector3(0, 0, 0),
            mass: planet.mass || 1e15,
            radius: planet.radius || 150
        }];
    }

    setChunkSize(size) {
        this.chunkSize = size;
    }

    spawnDebris(config) {
        if (this.debrisEntities.size >= this.maxActiveDebris) {
            Logger.warn('DebrisManager', 'Max debris limit reached');
            return null;
        }

        let debris;
        if (this.debrisPool.length > 0) {
            debris = this.debrisPool.pop();
            debris.position.copy(config.position);
            debris.velocity.copy(config.velocity || new THREE.Vector3());
            debris.angularVelocity.copy(config.angularVelocity || new THREE.Vector3());
            debris.schematic = config.schematic;
            debris.mass = config.mass || (config.schematic.voxels.length * 100);
            debris.type = config.type || 'asteroid';
            debris.state = 'flying';
            debris.isPooled = false;
        } else {
            debris = new DebrisEntity(config);
        }

        this.debrisEntities.set(debris.id, debris);

        if (this.game && this.game.scene && config.createMesh !== false) {
            const mesh = this.createDebrisMesh(debris);
            debris.setMesh(mesh);
            this.game.scene.add(mesh);
        }

        Logger.log('DebrisManager', `Spawned debris ${debris.id} with ${debris.voxelCount} voxels at`, debris.position);

        return debris;
    }

    createDebrisMesh(debris) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({
            color: debris.type === 'comet' ? 0x88ccff : 0x888888
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(debris.radius, debris.radius, debris.radius);
        mesh.position.copy(debris.position);

        return mesh;
    }

    update(deltaTime) {
        if (!this.enabled || !this.planet) return;

        for (const debris of this.debrisEntities.values()) {
            this.updateDebris(debris, deltaTime);
        }
    }

    updateDebris(debris, deltaTime) {
        if (debris.state === 'flying') {
            const gravityAccel = this.physics.calculateGravityAcceleration(
                debris.position,
                this.gravitySources
            );

            debris.updatePhysics(deltaTime, gravityAccel);

            this.checkGravityZones(debris, deltaTime);
            this.checkSurfaceCollision(debris);
        } else if (debris.state === 'orbiting') {
            debris.incrementOrbitTime(deltaTime);

            if (debris.orbitTime >= this.physics.captureTimeThreshold) {
                this.captureAsMoon(debris);
            }
        }
    }

    checkGravityZones(debris, deltaTime) {
        const planetPos = this.gravitySources[0].position;
        const planetRadius = this.gravitySources[0].radius;
        const distance = debris.position.distanceTo(planetPos);

        const zone = this.physics.determineGravityZone(distance, planetRadius);

        if (zone === 'orbit') {
            const stability = this.physics.checkOrbitalStability(
                debris,
                planetPos,
                this.gravitySources[0].mass,
                planetRadius
            );

            if (stability.stable) {
                if (debris.state !== 'orbiting') {
                    debris.transitionState('orbiting');
                    Logger.log('DebrisManager', `Debris ${debris.id} entered stable orbit`);
                }
            } else {
                if (debris.state === 'orbiting') {
                    debris.transitionState('flying');
                }
            }
        } else if (zone === 'escape') {
            if (debris.state === 'orbiting') {
                debris.transitionState('flying');
            }
        }
    }

    checkSurfaceCollision(debris) {
        const planetPos = this.gravitySources[0].position;
        const planetRadius = this.gravitySources[0].radius;
        const distance = debris.position.distanceTo(planetPos);

        const collisionDistance = planetRadius + 2;

        if (distance <= collisionDistance) {
            this.handleImpact(debris);
        }
    }

    handleImpact(debris) {
        const impactType = this.physics.determineImpactType(debris.velocity);

        Logger.log('DebrisManager', `Impact: ${debris.id} type=${impactType.type} v=${debris.velocity.length().toFixed(1)} m/s`);

        const impactWorldPos = debris.position.clone();
        const chunkCoord = this.worldToChunkCoord(impactWorldPos);
        const localCoord = this.worldToLocalCoord(impactWorldPos, chunkCoord);

        if (impactType.type === 'shatter') {
            this.createCrater(impactWorldPos, impactType.craterRadius);

            if (impactType.shouldFragment) {
                this.spawnFragments(debris, impactType.fragmentCount);
            }

            this.recordImpact(chunkCoord, impactWorldPos, debris.velocity.length(), 'shatter', debris.id, debris.mass);
        } else if (impactType.type === 'crater') {
            this.createCrater(impactWorldPos, impactType.craterRadius);
            this.recordImpact(chunkCoord, impactWorldPos, debris.velocity.length(), 'crater', debris.id, debris.mass);
        } else if (impactType.type === 'settle') {
            this.settleDebris(debris, chunkCoord, localCoord);
            this.recordImpact(chunkCoord, impactWorldPos, debris.velocity.length(), 'settle', debris.id, debris.mass);
        }

        this.removeDebris(debris.id);
    }

    createCrater(worldPos, radius) {
        const minWorld = worldPos.clone().addScalar(-radius);
        const maxWorld = worldPos.clone().addScalar(radius);

        const minChunk = this.worldToChunkCoord(minWorld);
        const maxChunk = this.worldToChunkCoord(maxWorld);

        for (let cx = minChunk.cx; cx <= maxChunk.cx; cx++) {
            for (let cy = minChunk.cy; cy <= maxChunk.cy; cy++) {
                for (let cz = minChunk.cz; cz <= maxChunk.cz; cz++) {
                    const chunkCoord = {cx, cy, cz};
                    const damageData = this.getDamageData(chunkCoord);

                    const chunkWorldOrigin = this.chunkCoordToWorld(chunkCoord);
                    const localCenter = worldPos.clone().sub(chunkWorldOrigin);

                    for (let lx = 0; lx < this.chunkSize; lx++) {
                        for (let ly = 0; ly < this.chunkSize; ly++) {
                            for (let lz = 0; lz < this.chunkSize; lz++) {
                                const localPos = new THREE.Vector3(lx, ly, lz);
                                const dist = localPos.distanceTo(localCenter);

                                if (dist <= radius) {
                                    damageData.removeVoxel(lx, ly, lz);
                                }
                            }
                        }
                    }

                    this.invalidateChunkMesh(chunkCoord);
                }
            }
        }

        Logger.log('DebrisManager', `Created crater radius=${radius} at`, worldPos);
    }

    settleDebris(debris, chunkCoord, localCoord) {
        const damageData = this.getDamageData(chunkCoord);

        for (const voxel of debris.schematic.voxels) {
            const lx = Math.floor(localCoord.x + voxel.x);
            const ly = Math.floor(localCoord.y + voxel.y);
            const lz = Math.floor(localCoord.z + voxel.z);

            if (lx >= 0 && lx < this.chunkSize && ly >= 0 && ly < this.chunkSize && lz >= 0 && lz < this.chunkSize) {
                damageData.addVoxel(lx, ly, lz, voxel.colorId);
            }
        }

        this.invalidateChunkMesh(chunkCoord);

        Logger.log('DebrisManager', `Settled debris ${debris.id} with ${debris.voxelCount} voxels`);
    }

    spawnFragments(debris, fragmentCount) {
        const voxelsPerFragment = Math.ceil(debris.voxelCount / fragmentCount);
        const fragmentVelocities = this.physics.calculateFragmentVelocities(debris.velocity, fragmentCount);

        for (let i = 0; i < Math.min(fragmentCount, debris.voxelCount); i++) {
            const startIdx = i * voxelsPerFragment;
            const endIdx = Math.min(startIdx + voxelsPerFragment, debris.schematic.voxels.length);
            const fragmentVoxels = debris.schematic.voxels.slice(startIdx, endIdx);

            if (fragmentVoxels.length === 0) continue;

            const fragmentSchematic = {
                voxels: fragmentVoxels,
                bounds: debris.schematic.bounds
            };

            const randomOffset = new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4
            );

            this.spawnDebris({
                position: debris.position.clone().add(randomOffset),
                velocity: fragmentVelocities[i],
                angularVelocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2
                ),
                schematic: fragmentSchematic,
                type: 'fragment'
            });
        }

        Logger.log('DebrisManager', `Spawned ${fragmentCount} fragments from ${debris.id}`);
    }

    captureAsMoon(debris) {
        Logger.log('DebrisManager', `Capturing debris ${debris.id} as moon`);

        this.removeDebris(debris.id);
    }

    removeDebris(debrisId) {
        const debris = this.debrisEntities.get(debrisId);
        if (!debris) return;

        if (debris.mesh && this.game && this.game.scene) {
            this.game.scene.remove(debris.mesh);
            debris.dispose();
        }

        this.debrisEntities.delete(debrisId);

        debris.reset();
        this.debrisPool.push(debris);
    }

    getDamageData(chunkCoord) {
        const key = ChunkCoordinate.toKey(chunkCoord.cx, chunkCoord.cy, chunkCoord.cz);
        if (!this.damageData.has(key)) {
            this.damageData.set(key, new ChunkDamageData(chunkCoord));
        }
        return this.damageData.get(key);
    }

    invalidateChunkMesh(chunkCoord) {
        const key = ChunkCoordinate.toKey(chunkCoord.cx, chunkCoord.cy, chunkCoord.cz);

        if (this.game && this.game.loadedMeshes) {
            const mesh = this.game.loadedMeshes.get(key);
            if (mesh && this.game.scene) {
                this.game.scene.remove(mesh);
                this.game.loadedMeshes.delete(key);
            }
        }

        const damageData = this.getDamageData(chunkCoord);
        damageData.isDirty = true;
    }

    recordImpact(chunkCoord, position, velocity, type, debrisId, mass) {
        const damageData = this.getDamageData(chunkCoord);
        damageData.recordImpact(position, velocity, type, debrisId, mass);
    }

    worldToChunkCoord(worldPos) {
        return {
            cx: Math.floor(worldPos.x / this.chunkSize),
            cy: Math.floor(worldPos.y / this.chunkSize),
            cz: Math.floor(worldPos.z / this.chunkSize)
        };
    }

    worldToLocalCoord(worldPos, chunkCoord) {
        const chunkWorldOrigin = this.chunkCoordToWorld(chunkCoord);
        return {
            x: worldPos.x - chunkWorldOrigin.x,
            y: worldPos.y - chunkWorldOrigin.y,
            z: worldPos.z - chunkWorldOrigin.z
        };
    }

    chunkCoordToWorld(chunkCoord) {
        return new THREE.Vector3(
            chunkCoord.cx * this.chunkSize,
            chunkCoord.cy * this.chunkSize,
            chunkCoord.cz * this.chunkSize
        );
    }

    clearAllDamage() {
        for (const damageData of this.damageData.values()) {
            damageData.clearDamage();
            this.invalidateChunkMesh(damageData.chunkCoord);
        }

        Logger.log('DebrisManager', 'Cleared all damage data');
    }

    clearAllDebris() {
        for (const debrisId of Array.from(this.debrisEntities.keys())) {
            this.removeDebris(debrisId);
        }

        Logger.log('DebrisManager', 'Cleared all debris');
    }

    getStats() {
        return {
            activeDebris: this.debrisEntities.size,
            pooledDebris: this.debrisPool.length,
            damagedChunks: this.damageData.size,
            totalAddedVoxels: Array.from(this.damageData.values()).reduce((sum, d) => sum + d.addedVoxels.size, 0),
            totalRemovedVoxels: Array.from(this.damageData.values()).reduce((sum, d) => sum + d.removedVoxels.size, 0),
            totalImpacts: Array.from(this.damageData.values()).reduce((sum, d) => sum + d.impactHistory.length, 0)
        };
    }

    exportDamageData() {
        const exported = {
            version: 1,
            chunks: {}
        };

        for (const [key, damageData] of this.damageData) {
            if (damageData.addedVoxels.size > 0 || damageData.removedVoxels.size > 0) {
                exported.chunks[key] = damageData.serialize();
            }
        }

        return exported;
    }

    importDamageData(data) {
        if (!data || data.version !== 1) {
            Logger.error('DebrisManager', 'Invalid damage data version');
            return false;
        }

        this.clearAllDamage();

        for (const [key, chunkData] of Object.entries(data.chunks)) {
            const damageData = ChunkDamageData.deserialize(chunkData);
            this.damageData.set(key, damageData);
            this.invalidateChunkMesh(damageData.chunkCoord);
        }

        Logger.log('DebrisManager', `Imported ${Object.keys(data.chunks).length} damaged chunks`);
        return true;
    }
}
