import * as THREE from '../lib/three.module.js';

export class CameraTransition {
    constructor(camera, fpsControls) {
        this.camera = camera;
        this.fpsControls = fpsControls;

        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 3.0;

        this.startPosition = new THREE.Vector3();
        this.startRotation = new THREE.Euler();
        this.targetPosition = new THREE.Vector3();
        this.targetLookAt = new THREE.Vector3();

        this.onComplete = null;
    }

    transitionTo(targetPosition, targetLookAt, duration = 3.0, onComplete = null) {
        this.startPosition.copy(this.camera.position);
        this.startRotation.copy(this.camera.rotation);

        this.targetPosition.copy(targetPosition);
        this.targetLookAt.copy(targetLookAt);

        this.transitionDuration = duration;
        this.transitionProgress = 0;
        this.isTransitioning = true;
        this.onComplete = onComplete;

        if (this.fpsControls && this.fpsControls.locked) {
            document.exitPointerLock();
        }
    }

    transitionToPlanet(planetPosition, planetRadius, duration = 3.0, onComplete = null) {
        const direction = new THREE.Vector3()
            .subVectors(this.camera.position, planetPosition)
            .normalize();

        const distance = planetRadius * 2.5;
        const targetPos = new THREE.Vector3()
            .copy(planetPosition)
            .add(direction.multiplyScalar(distance));

        this.transitionTo(targetPos, planetPosition, duration, onComplete);
    }

    transitionToSystemCenter(systemPosition, systemRadius, duration = 3.0, onComplete = null) {
        const direction = new THREE.Vector3()
            .subVectors(this.camera.position, systemPosition)
            .normalize();

        const distance = systemRadius * 5.0;
        const targetPos = new THREE.Vector3()
            .copy(systemPosition)
            .add(direction.multiplyScalar(distance));

        this.transitionTo(targetPos, systemPosition, duration, onComplete);
    }

    update(deltaTime) {
        if (!this.isTransitioning) return;

        this.transitionProgress += deltaTime / this.transitionDuration;

        if (this.transitionProgress >= 1.0) {
            this.transitionProgress = 1.0;
            this.isTransitioning = false;

            this.camera.position.copy(this.targetPosition);
            this.camera.lookAt(this.targetLookAt);

            if (this.onComplete) {
                this.onComplete();
            }
            return;
        }

        const t = this.easeInOutCubic(this.transitionProgress);

        this.camera.position.lerpVectors(this.startPosition, this.targetPosition, t);

        const tempQuatStart = new THREE.Quaternion().setFromEuler(this.startRotation);
        const tempQuatEnd = new THREE.Quaternion();

        const tempCam = new THREE.Object3D();
        tempCam.position.copy(this.targetPosition);
        tempCam.lookAt(this.targetLookAt);
        tempQuatEnd.setFromEuler(tempCam.rotation);

        const finalQuat = new THREE.Quaternion().slerpQuaternions(tempQuatStart, tempQuatEnd, t);
        this.camera.quaternion.copy(finalQuat);
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    cancel() {
        this.isTransitioning = false;
        this.transitionProgress = 0;
        if (this.onComplete) {
            this.onComplete();
        }
    }
}
