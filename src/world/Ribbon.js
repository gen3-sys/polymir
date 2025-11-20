import * as THREE from '../lib/three.module.js';
import { RibbonMesh } from './RibbonMesh.js';

export class Ribbon {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.ribbonMesh = new RibbonMesh(scene);
        this.plots = new Map();
        this.minSpacing = 10;
        this.surfaceRaycaster = new THREE.Raycaster();
        this.isSnapped = false;
        this.ribbonDistance = 100;
        this.velocity = new THREE.Vector3();
        this.isGrounded = false;
        this.lastAutoRollUp = new THREE.Vector3(0, 1, 0);
    }

    initialize() {
        this.ribbonMesh.initialize();
        this.positionCameraOnRibbon();
    }

    positionCameraOnRibbon() {
        const playerHeight = 1.8;
        const spawnDistance = 100;
        const spawnPosition = this.ribbonMesh.getPositionAtDistance(spawnDistance);
        const spawnOrientation = this.ribbonMesh.getOrientationAtDistance(spawnDistance);

        const spawnUp = spawnOrientation.up.clone().normalize();
        const surfacePoint = spawnPosition.clone().add(
            spawnUp.clone().multiplyScalar(this.ribbonMesh.ribbonThickness / 2 + playerHeight + 0.2)
        );

        this.camera.position.copy(surfacePoint);
        this.camera.rotation.set(0, 0, 0);

        this.velocity.set(0, 0, 0);
        this.isGrounded = true;
        this.isSnapped = true;
        this.ribbonDistance = spawnDistance;
    }

    applyRibbonGravity(deltaTime) {
        const position = this.camera.position;
        const playerHeight = 1.8;
        const baseDistance = this.ribbonDistance;

        if (this.isSnapped) {
            let nearestPos = null;
            let nearestDist = Infinity;
            let nearestDistance = baseDistance;

            for (let offset = -30; offset <= 30; offset += 10) {
                const testDistance = baseDistance + offset;
                const testPos = this.ribbonMesh.getPositionAtDistance(testDistance);
                const dist = Math.sqrt(
                    (position.x - testPos.x) ** 2 +
                    (position.z - testPos.z) ** 2
                );
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestPos = testPos;
                    nearestDistance = testDistance;
                }
            }

            const orientation = this.ribbonMesh.getOrientationAtDistance(nearestDistance);
            const up = orientation.up;
            const right = orientation.right;
            const surfacePoint = nearestPos.clone().add(
                up.clone().multiplyScalar(this.ribbonMesh.ribbonThickness / 2)
            );
            const toPlayer = new THREE.Vector3().subVectors(position, surfacePoint);

            const alongUp = up.dot(toPlayer);
            const upCorrection = (playerHeight - alongUp);
            if (Math.abs(upCorrection) > 1e-3) {
                position.add(up.clone().multiplyScalar(upCorrection));
            }

            let lateral = right.dot(toPlayer);
            const halfWidth = this.ribbonMesh.ribbonWidth / 2 - 2;
            if (Math.abs(lateral) > halfWidth) {
                const clamped = Math.sign(lateral) * halfWidth;
                const delta = clamped - lateral;
                position.add(right.clone().multiplyScalar(delta));
            }

            this.ribbonDistance = nearestDistance;
            this.isGrounded = true;
            this.velocity.y = 0;
        } else {
            let gravityUp = new THREE.Vector3(0, 1, 0);
            let nearestPosG = null;
            let nearestDistG = Infinity;
            let nearestDistanceG = baseDistance;

            for (let offset = -30; offset <= 30; offset += 10) {
                const testDistance = baseDistance + offset;
                const testPos = this.ribbonMesh.getPositionAtDistance(testDistance);
                const dG = Math.sqrt(
                    (position.x - testPos.x) ** 2 +
                    (position.z - testPos.z) ** 2
                );
                if (dG < nearestDistG) {
                    nearestDistG = dG;
                    nearestPosG = testPos;
                    nearestDistanceG = testDistance;
                }
            }

            const orientG = this.ribbonMesh.getOrientationAtDistance(nearestDistanceG);
            gravityUp.copy(orientG.up);

            const gravityDir = gravityUp.clone().multiplyScalar(-1);
            const gAccel = 30;
            const dt = deltaTime || 0.016;

            const velAlong = gravityUp.dot(new THREE.Vector3(0, this.velocity.y, 0));
            let velUp = gravityUp.clone().multiplyScalar(velAlong);
            velUp.add(gravityDir.multiplyScalar(gAccel * dt));

            position.add(velUp.clone().multiplyScalar(dt));
            this.velocity.y = velUp.dot(gravityUp);

            const downOrigin = position.clone();
            const downDir = gravityUp.clone().multiplyScalar(-1);
            this.surfaceRaycaster.set(downOrigin, downDir);
            this.surfaceRaycaster.near = 0.0;
            this.surfaceRaycaster.far = playerHeight + 2.0;

            const hitTop = this.surfaceRaycaster.intersectObject(
                this.ribbonMesh.ribbonTopMesh,
                false
            );

            if (hitTop && hitTop.length > 0) {
                const hit = hitTop[0];
                const feetToHit = (position.y - playerHeight) - hit.point.y;
                if (this.velocity.y <= 0 && feetToHit <= 0.2 && hit.distance <= (playerHeight + 1.0)) {
                    position.y = hit.point.y + playerHeight;
                    this.velocity.y = 0;
                    this.isGrounded = true;
                    this.isSnapped = true;

                    let bestDist = Infinity;
                    let bestDistance = baseDistance;
                    for (let offset = -30; offset <= 30; offset += 10) {
                        const testDistance = baseDistance + offset;
                        const testPos = this.ribbonMesh.getPositionAtDistance(testDistance);
                        const d = Math.sqrt(
                            (hit.point.x - testPos.x) ** 2 +
                            (hit.point.z - testPos.z) ** 2
                        );
                        if (d < bestDist) {
                            bestDist = d;
                            bestDistance = testDistance;
                        }
                    }
                    this.ribbonDistance = bestDistance;
                } else {
                    this.isGrounded = false;
                }
            } else {
                this.isGrounded = false;
            }

            const ribbonPos = this.ribbonMesh.getPositionAtDistance(baseDistance);
            if (position.y < ribbonPos.y - 500) {
                this.positionCameraOnRibbon();
            }
        }
    }

    update(deltaTime) {
        this.ribbonMesh.update(deltaTime, this.camera.position);
        this.applyRibbonGravity(deltaTime);
    }
}

export default Ribbon;
