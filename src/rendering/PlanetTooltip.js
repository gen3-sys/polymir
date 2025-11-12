import * as THREE from '../lib/three.module.js';

export class PlanetTooltip {
    constructor(renderer) {
        this.renderer = renderer;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = 512;
        this.ctx = this.canvas.getContext('2d');

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        this.sprite = new THREE.Sprite(spriteMaterial);
        this.sprite.renderOrder = 1000;
        this.sprite.visible = false;
    }

    update(planet, scene) {
        if (!planet) {
            this.sprite.visible = false;
            return;
        }

        this.sprite.visible = true;

        const dayLength = planet.rotationSpeed > 0 ? (Math.PI * 2) / planet.rotationSpeed : 0;
        const currentDayTime = dayLength > 0 ? (planet.rotation % (Math.PI * 2)) / (Math.PI * 2) : 0;
        const hourOfDay = currentDayTime * 24;

        const yearLength = planet.orbitSpeed > 0 ? (Math.PI * 2) / planet.orbitSpeed : 0;
        const yearProgress = yearLength > 0 ? (planet.time * planet.orbitSpeed) % (Math.PI * 2) / (Math.PI * 2) : 0;

        const tiltDegrees = (planet.rotationTilt * 180 / Math.PI).toFixed(1);

        this.drawTooltip({
            name: planet.name || (planet.type === 'star' ? 'Star' : 'Planet'),
            type: planet.type,
            hourOfDay: hourOfDay.toFixed(1),
            dayLength: dayLength.toFixed(1),
            tilt: tiltDegrees,
            yearProgress: (yearProgress * 100).toFixed(1),
            yearLength: yearLength.toFixed(1),
            claimOwner: planet.claimOwner || 'Unclaimed'
        });

        const worldPos = planet.getWorldPosition();
        this.sprite.position.set(worldPos.x, worldPos.y + planet.radius + 100, worldPos.z);

        const distance = 200;
        this.sprite.scale.set(distance * 0.8, distance * 0.4, 1);

        if (!scene.children.includes(this.sprite)) {
            scene.add(this.sprite);
        }
    }

    drawTooltip(data) {
        const ctx = this.ctx;
        const canvas = this.canvas;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const modalWidth = 900;
        const modalHeight = 450;
        const modalX = (canvas.width - modalWidth) / 2;
        const modalY = (canvas.height - modalHeight) / 2;

        ctx.fillStyle = 'rgba(15, 20, 35, 0.92)';
        ctx.fillRect(modalX, modalY, modalWidth, modalHeight);

        ctx.strokeStyle = data.type === 'star' ? 'rgba(255, 200, 100, 0.7)' : 'rgba(100, 150, 255, 0.7)';
        ctx.lineWidth = 3;
        ctx.strokeRect(modalX, modalY, modalWidth, modalHeight);

        ctx.fillStyle = data.type === 'star' ? 'rgba(255, 220, 150, 1.0)' : 'rgba(180, 200, 255, 1.0)';
        ctx.font = 'bold 60px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(data.name, modalX + 30, modalY + 80);

        ctx.fillStyle = 'rgba(200, 220, 255, 0.9)';
        ctx.font = '40px monospace';

        const lineHeight = 60;
        let yPos = modalY + 160;

        if (data.type !== 'star') {
            ctx.fillText(`Time: ${data.hourOfDay}h / ${data.dayLength}s day`, modalX + 30, yPos);
            yPos += lineHeight;

            ctx.fillText(`Tilt: ${data.tilt}°`, modalX + 30, yPos);
            yPos += lineHeight;

            ctx.fillText(`Year: ${data.yearProgress}% (${data.yearLength}s orbit)`, modalX + 30, yPos);
            yPos += lineHeight;
        }

        ctx.fillText(`Owner: ${data.claimOwner}`, modalX + 30, yPos);

        this.sprite.material.map.needsUpdate = true;
    }

    hide() {
        this.sprite.visible = false;
    }
}
