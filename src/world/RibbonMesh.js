import * as THREE from '../lib/three.module.js';

export class RibbonMesh {
    constructor(scene) {
        this.scene = scene;
        this.ribbonWidth = 100;
        this.ribbonThickness = 5;
        this.ribbonTopMesh = null;
        this.ribbonBottomMesh = null;
        this.currentMinDistance = -1000;
        this.currentMaxDistance = 1000;
        this.ribbonCurve = null;
    }

    initialize() {
        this.generateRibbon();
    }

    generateRibbon() {
        if (this.ribbonTopMesh) {
            this.scene.remove(this.ribbonTopMesh);
            this.scene.remove(this.ribbonBottomMesh);
        }

        const curvePoints = [];
        const steps = 200;

        for (let i = 0; i <= steps; i++) {
            const dist = this.currentMinDistance + (i / steps) * (this.currentMaxDistance - this.currentMinDistance);
            curvePoints.push(this.getPositionAtDistance(dist));
        }

        const ribbonCurve = new THREE.CatmullRomCurve3(curvePoints);
        ribbonCurve.curveType = 'catmullrom';
        ribbonCurve.tension = 0.5;

        const topShape = new THREE.Shape();
        topShape.moveTo(-this.ribbonWidth/2, 0);
        topShape.lineTo(this.ribbonWidth/2, 0);
        topShape.lineTo(this.ribbonWidth/2, this.ribbonThickness/2);
        topShape.lineTo(-this.ribbonWidth/2, this.ribbonThickness/2);
        topShape.closePath();

        const bottomShape = new THREE.Shape();
        bottomShape.moveTo(-this.ribbonWidth/2, -this.ribbonThickness/2);
        bottomShape.lineTo(this.ribbonWidth/2, -this.ribbonThickness/2);
        bottomShape.lineTo(this.ribbonWidth/2, 0);
        bottomShape.lineTo(-this.ribbonWidth/2, 0);
        bottomShape.closePath();

        const extrudeSettings = {
            steps: steps * 2,
            bevelEnabled: false,
            extrudePath: ribbonCurve
        };

        const topGeometry = new THREE.ExtrudeGeometry(topShape, extrudeSettings);
        const bottomGeometry = new THREE.ExtrudeGeometry(bottomShape, extrudeSettings);

        const greenMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            side: THREE.DoubleSide
        });

        const brownMaterial = new THREE.MeshBasicMaterial({
            color: 0x8B4513,
            side: THREE.DoubleSide
        });

        this.ribbonTopMesh = new THREE.Mesh(topGeometry, greenMaterial);
        this.ribbonBottomMesh = new THREE.Mesh(bottomGeometry, brownMaterial);

        this.ribbonTopMesh.name = 'ribbon_green_top';
        this.ribbonBottomMesh.name = 'ribbon_brown_bottom';

        this.ribbonCurve = ribbonCurve;

        this.scene.add(this.ribbonTopMesh);
        this.scene.add(this.ribbonBottomMesh);
    }

    getPositionAtDistance(distance) {
        const t = distance * 0.001;
        const radius = 200;

        const x = distance * 0.5 + Math.sin(t * Math.PI * 2) * radius;
        const y = Math.sin(t * Math.PI * 3) * radius + Math.cos(t * Math.PI) * 50;
        const z = Math.cos(t * Math.PI * 2) * radius + Math.sin(t * Math.PI * 4) * 50;

        return new THREE.Vector3(x, y, z);
    }

    getOrientationAtDistance(distance) {
        const current = this.getPositionAtDistance(distance);
        const next = this.getPositionAtDistance(distance + 5);
        const prev = this.getPositionAtDistance(distance - 5);

        const tangent = new THREE.Vector3().subVectors(next, prev).normalize();

        const worldUp = new THREE.Vector3(0, 1, 0);
        const altUp = new THREE.Vector3(1, 0, 0);
        const refUp = Math.abs(tangent.dot(worldUp)) > 0.95 ? altUp : worldUp;
        const right = new THREE.Vector3().crossVectors(tangent, refUp).normalize();
        const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

        return { tangent, up, right };
    }

    updateRibbonGeneration(playerPosition) {
        const playerDistance = playerPosition.x;
        const buffer = 500;
        let needsRebuild = false;

        if (playerDistance > this.currentMaxDistance - buffer) {
            this.currentMaxDistance += 500;
            needsRebuild = true;
        }

        if (playerDistance < this.currentMinDistance + buffer) {
            this.currentMinDistance -= 500;
            needsRebuild = true;
        }

        if (needsRebuild) {
            this.generateRibbon();
        }
    }

    getHeightAtPosition(x) {
        const ribbonPos = this.getPositionAtDistance(x);
        return ribbonPos.y + this.ribbonThickness / 2;
    }

    update(deltaTime, playerPosition) {
        if (playerPosition) {
            this.updateRibbonGeneration(playerPosition);
        }
    }
}

export default RibbonMesh;
