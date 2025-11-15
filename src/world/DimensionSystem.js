import * as THREE from '../lib/three.module.js';

export class DimensionSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.currentDimension = 'universe';
        this.dimensions = {
            universe: {
                name: 'Universe',
                skyColor: 0x12121f,
                fogColor: 0x12121f,
                fogNear: 1000,
                fogFar: 10000
            },
            ribbon: {
                name: 'The Ribbon',
                skyColor: 0x87CEEB,
                fogColor: 0x87CEEB,
                fogNear: 200,
                fogFar: 2000
            },
            custom: {
                name: 'Custom World',
                skyColor: 0x443366,
                fogColor: 0x443366,
                fogNear: 100,
                fogFar: 1500
            }
        };
        this.transitionActive = false;
        this.fadeOverlay = null;
        this.onDimensionChange = null;
    }

    initialize() {
        this.applyDimensionSettings('universe');
    }

    getCurrentDimension() {
        return this.currentDimension;
    }

    switchToDimension(dimensionId, params = {}) {
        if (this.transitionActive) {
            return;
        }

        if (!this.dimensions[dimensionId]) {
            return;
        }

        this.transitionActive = true;

        this.fadeOut().then(() => {
            this.currentDimension = dimensionId;
            this.applyDimensionSettings(dimensionId);

            if (this.onDimensionChange) {
                this.onDimensionChange(dimensionId, params);
            }

            this.fadeIn().then(() => {
                this.transitionActive = false;
            });
        });
    }

    applyDimensionSettings(dimensionId) {
        const settings = this.dimensions[dimensionId];

        this.scene.background = new THREE.Color(settings.skyColor);

        this.scene.fog = new THREE.Fog(
            settings.fogColor,
            settings.fogNear,
            settings.fogFar
        );
    }

    fadeOut() {
        return new Promise(resolve => {
            const overlay = this.createFadeOverlay();
            let opacity = 0;

            const fade = () => {
                opacity += 0.05;
                overlay.material.opacity = opacity;

                if (opacity >= 1) {
                    resolve();
                } else {
                    requestAnimationFrame(fade);
                }
            };

            fade();
        });
    }

    fadeIn() {
        return new Promise(resolve => {
            const overlay = this.getFadeOverlay();
            let opacity = 1;

            const fade = () => {
                opacity -= 0.05;
                overlay.material.opacity = opacity;

                if (opacity <= 0) {
                    this.removeFadeOverlay();
                    resolve();
                } else {
                    requestAnimationFrame(fade);
                }
            };

            fade();
        });
    }

    createFadeOverlay() {
        if (this.fadeOverlay) return this.fadeOverlay;

        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false
        });

        this.fadeOverlay = new THREE.Mesh(geometry, material);
        this.fadeOverlay.position.z = -1;

        this.camera.add(this.fadeOverlay);

        return this.fadeOverlay;
    }

    getFadeOverlay() {
        return this.fadeOverlay || this.createFadeOverlay();
    }

    removeFadeOverlay() {
        if (this.fadeOverlay) {
            this.camera.remove(this.fadeOverlay);
            this.fadeOverlay = null;
        }
    }

    goToUniverse(params = {}) {
        this.switchToDimension('universe', params);
    }

    goToRibbon() {
        this.switchToDimension('ribbon');
    }

    goToCustomWorld(worldData) {
        this.switchToDimension('custom', { worldData });
    }
}

export default DimensionSystem;
