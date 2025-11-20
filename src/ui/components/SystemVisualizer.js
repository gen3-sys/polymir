/**
 * POLYMIR V3 - System Visualizer
 * 
 * Visual display for generated solar systems
 * Shows all bodies, orbits, and system information
 * 
 * UNDER 600 LINES!
 */

import * as THREE from '../lib/three.module.js';

export class SystemVisualizer {
    constructor(config = {}) {
        this.config = {
            container: config.container || document.body,
            showOrbits: config.showOrbits !== false,
            showLabels: config.showLabels !== false,
            showInfo: config.showInfo !== false,
            orbitColor: config.orbitColor || 0xFFD700,
            labelColor: config.labelColor || '#00FF00',
            ...config
        };
        
        this.systemData = null;
        this.visualElements = new Map();
        this.infoPanel = null;
    }
    
    /**
     * Create info panel UI
     */
    createInfoPanel() {
        const panel = document.createElement('div');
        panel.id = 'system-visualizer';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 400px;
            max-height: 90vh;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(10, 10, 30, 0.9) 100%);
            border: 2px solid #00FF00;
            border-radius: 10px;
            padding: 15px;
            color: #00FF00;
            font-family: monospace;
            font-size: 12px;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
        `;
        
        this.config.container.appendChild(panel);
        this.infoPanel = panel;
        return panel;
    }
    
    /**
     * Visualize complete system
     */
    visualizeSystem(systemData, scene) {
        this.systemData = systemData;
        
        
        if (this.config.showInfo && !this.infoPanel) {
            this.createInfoPanel();
        }
        
        
        this.clearVisualization(scene);
        
        
        this.visualizeStars(systemData.stars, scene);
        this.visualizePlanets(systemData.planets, scene);
        this.visualizeMoons(systemData.moons, scene);
        this.visualizeAsteroids(systemData.asteroids, scene);
        this.visualizeMegastructures(systemData.megastructures, scene);
        
        
        if (this.config.showInfo) {
            this.updateInfoPanel();
        }
        
        return this.visualElements;
    }
    
    /**
     * Visualize stars
     */
    visualizeStars(stars, scene) {
        stars.forEach(star => {
            
            const geometry = new THREE.SphereGeometry(star.radius, 32, 32);
            const material = new THREE.MeshBasicMaterial({
                color: star.color,
                emissive: star.emissive,
                emissiveIntensity: 1.5
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(star.position.x, star.position.y, star.position.z);
            scene.add(mesh);
            
            
            const light = new THREE.PointLight(star.color, star.luminosity, star.radius * 100);
            light.position.copy(mesh.position);
            scene.add(light);
            
            
            this.visualElements.set(star.id, {
                mesh: mesh,
                light: light,
                data: star
            });
            
            
            if (this.config.showLabels) {
                this.addLabel(star.id, star.type, mesh.position, scene);
            }
        });
    }
    
    /**
     * Visualize planets
     */
    visualizePlanets(planets, scene) {
        planets.forEach(planet => {
            
            const geometry = new THREE.SphereGeometry(planet.radius, 24, 24);
            const material = new THREE.MeshPhongMaterial({
                color: this.getPlanetColor(planet.type),
                emissive: 0x000000,
                shininess: 30
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(planet.position.x, planet.position.y, planet.position.z);
            scene.add(mesh);
            
            
            if (this.config.showOrbits) {
                this.addOrbit(planet.orbitalRadius, planet.inclination, scene);
            }
            
            
            this.visualElements.set(planet.id, {
                mesh: mesh,
                orbit: planet.orbitalRadius,
                data: planet
            });
            
            
            if (this.config.showLabels) {
                this.addLabel(planet.name, planet.tags.join(' '), mesh.position, scene);
            }
        });
    }
    
    /**
     * Visualize moons
     */
    visualizeMoons(moons, scene) {
        moons.forEach(moon => {
            const geometry = new THREE.SphereGeometry(moon.radius, 16, 16);
            const material = new THREE.MeshPhongMaterial({
                color: 0xAAAAAA,
                emissive: 0x222222
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(moon.position.x, moon.position.y, moon.position.z);
            scene.add(mesh);
            
            this.visualElements.set(moon.id, {
                mesh: mesh,
                data: moon
            });
        });
    }
    
    /**
     * Visualize asteroids
     */
    visualizeAsteroids(asteroids, scene) {
        if (!asteroids || asteroids.length === 0) return;
        
        
        const geometry = new THREE.IcosahedronGeometry(1, 0);
        const material = new THREE.MeshPhongMaterial({
            color: 0x888888,
            flatShading: true
        });
        
        const instancedMesh = new THREE.InstancedMesh(geometry, material, asteroids.length);
        
        asteroids.forEach((asteroid, i) => {
            const matrix = new THREE.Matrix4();
            matrix.makeTranslation(
                asteroid.position.x,
                asteroid.position.y,
                asteroid.position.z
            );
            matrix.scale(new THREE.Vector3(
                asteroid.radius,
                asteroid.radius,
                asteroid.radius
            ));
            instancedMesh.setMatrixAt(i, matrix);
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        scene.add(instancedMesh);
        
        this.visualElements.set('asteroids', {
            mesh: instancedMesh,
            data: asteroids
        });
    }
    
    /**
     * Visualize megastructures
     */
    visualizeMegastructures(megastructures, scene) {
        megastructures.forEach(structure => {
            if (structure.type === 'ringworld') {
                this.visualizeRingworld(structure, scene);
            } else if (structure.type === 'dyson_sphere') {
                this.visualizeDysonSphere(structure, scene);
            }
        });
    }
    
    /**
     * Visualize ringworld
     */
    visualizeRingworld(ringworld, scene) {
        const geometry = new THREE.TorusGeometry(
            ringworld.radius,
            ringworld.width / 2,
            8,
            64
        );

        const material = new THREE.MeshPhongMaterial({
            color: 0x556677,
            emissive: 0x223344,
            emissiveIntensity: 0.2,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2;

        
        if (ringworld.centerPosition) {
            mesh.position.copy(ringworld.centerPosition);
        } else if (ringworld.orbitalRadius === 0 || ringworld.centeredOnStar) {
            mesh.position.set(0, 0, 0);
        } else {
            mesh.position.set(ringworld.orbitalRadius || 0, 0, 0);
        }

        scene.add(mesh);
        
        this.visualElements.set(ringworld.id, {
            mesh: mesh,
            data: ringworld
        });


        if (this.config.showLabels) {
            const labelPosition = ringworld.centerPosition || mesh.position;
            this.addLabel('Stellar Ringworld', ringworld.tags.join(' '),
                         labelPosition, scene);
        }
    }
    
    /**
     * Visualize Dyson sphere
     */
    visualizeDysonSphere(dyson, scene) {
        
        const geometry = new THREE.SphereGeometry(
            dyson.radius,
            32,
            32,
            0,
            Math.PI * 2 * dyson.completeness
        );
        
        const material = new THREE.MeshPhongMaterial({
            color: 0x444466,
            emissive: 0x000044,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            wireframe: true
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(dyson.centerPosition);
        scene.add(mesh);
        
        this.visualElements.set(dyson.id, {
            mesh: mesh,
            data: dyson
        });
    }
    
    /**
     * Add orbit visualization
     */
    addOrbit(radius, inclination, scene) {
        const points = [];
        const segments = 128;
        
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = inclination ? Math.sin(angle) * radius * Math.sin(inclination) : 0;
            points.push(new THREE.Vector3(x, y, z));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: this.config.orbitColor,
            opacity: 0.5,
            transparent: true
        });
        
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        
        return line;
    }
    
    /**
     * Add label
     */
    addLabel(text, subtext, position, scene) {
        
        
        console.log(`Label: ${text} - ${subtext} at`, position);
    }
    
    /**
     * Update info panel
     */
    updateInfoPanel() {
        if (!this.infoPanel || !this.systemData) return;
        
        let html = `
            <h2 style="color: #FFD700; margin: 0 0 10px 0;">
                ${this.systemData.type.toUpperCase()} SYSTEM
            </h2>
            <div style="color: #88FF88; margin-bottom: 10px;">
                Seed: ${this.systemData.seed}
            </div>
        `;
        
        
        if (this.systemData.stars.length > 0) {
            html += `<h3 style="color: #FFAA00;">STARS (${this.systemData.stars.length})</h3>`;
            this.systemData.stars.forEach(star => {
                html += `
                    <div style="margin-left: 10px; margin-bottom: 5px;">
                        • ${star.type} - R: ${star.radius.toFixed(1)} 
                        - T: ${star.temperature.toFixed(0)}K
                    </div>
                `;
            });
        }
        
        
        if (this.systemData.planets.length > 0) {
            html += `<h3 style="color: #00AAFF;">PLANETS (${this.systemData.planets.length})</h3>`;
            this.systemData.planets.forEach(planet => {
                html += `
                    <div style="margin-left: 10px; margin-bottom: 8px; border-left: 2px solid #00AAFF; padding-left: 8px;">
                        <strong>${planet.name}</strong><br>
                        Type: ${planet.type}<br>
                        Radius: ${planet.radius.toFixed(1)} units<br>
                        Orbit: ${planet.orbitalRadius.toFixed(0)} units<br>
                        Period: ${(planet.orbitalPeriod / 365).toFixed(2)} years<br>
                        <span style="color: #FFD700;">${planet.tags.join(' ')}</span>
                    </div>
                `;
            });
        }
        
        
        if (this.systemData.moons.length > 0) {
            html += `<h3 style="color: #AAAAAA;">MOONS (${this.systemData.moons.length})</h3>`;
            const moonsByPlanet = {};
            this.systemData.moons.forEach(moon => {
                if (!moonsByPlanet[moon.parentId]) {
                    moonsByPlanet[moon.parentId] = [];
                }
                moonsByPlanet[moon.parentId].push(moon);
            });
            
            for (const [planetId, moons] of Object.entries(moonsByPlanet)) {
                html += `
                    <div style="margin-left: 10px;">
                        ${planetId}: ${moons.length} moon(s)
                    </div>
                `;
            }
        }
        
        
        if (this.systemData.megastructures.length > 0) {
            html += `<h3 style="color: #FF00FF;">MEGASTRUCTURES</h3>`;
            this.systemData.megastructures.forEach(structure => {
                html += `
                    <div style="margin-left: 10px; color: #FF88FF;">
                        ${structure.tags.join(' ')}
                    </div>
                `;
            });
        }
        
        
        if (this.systemData.asteroids && this.systemData.asteroids.length > 0) {
            html += `
                <div style="margin-top: 10px; color: #888888;">
                    ${this.systemData.asteroids.length} asteroids in belt
                </div>
            `;
        }
        
        this.infoPanel.innerHTML = html;
    }
    
    /**
     * Get planet color based on type
     */
    getPlanetColor(type) {
        const colors = {
            mercurian: 0x8B7355,
            venusian: 0xFFA500,
            terrestrial: 0x4169E1,
            martian: 0xB22222,
            frozen: 0xE0E0FF,
            europa: 0xCCDDFF,
            jovian: 0xCD853F,
            saturnian: 0xF4E4C1,
            neptunian: 0x4444FF,
            lava: 0xFF4400,
            crystal: 0xFFCCFF,
            machine: 0x888899,
            void: 0x220022
        };
        return colors[type] || 0x888888;
    }
    
    /**
     * Clear visualization
     */
    clearVisualization(scene) {
        this.visualElements.forEach(element => {
            if (element.mesh) {
                scene.remove(element.mesh);
                if (element.mesh.geometry) element.mesh.geometry.dispose();
                if (element.mesh.material) element.mesh.material.dispose();
            }
            if (element.light) {
                scene.remove(element.light);
            }
        });
        this.visualElements.clear();
    }
    
    /**
     * Destroy visualizer
     */
    destroy() {
        if (this.infoPanel) {
            this.infoPanel.remove();
            this.infoPanel = null;
        }
        this.visualElements.clear();
    }
}

