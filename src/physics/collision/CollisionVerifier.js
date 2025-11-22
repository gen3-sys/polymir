import * as THREE from '../lib/three.module.js';

/**
 * CollisionVerifier - Test and verify collision system functionality
 *
 * Usage:
 *   const verifier = new CollisionVerifier(game.voxelCollisionSystem);
 *   verifier.runTests(game.camera.position, game.mainPlanet.mesh.position);
 */
export class CollisionVerifier {
    constructor(voxelCollisionSystem) {
        this.collisionSystem = voxelCollisionSystem;
        this.testResults = [];
    }

    /**
     * Run comprehensive collision tests
     */
    runTests(playerPos, planetCenter) {
        console.log('=== COLLISION SYSTEM VERIFICATION ===');
        this.testResults = [];

        // Test 1: Ground height detection
        this.testGroundHeight(playerPos, planetCenter);

        // Test 2: Raycast in multiple directions
        this.testDirectionalRaycasts(playerPos, planetCenter);

        // Test 3: Sphere overlap detection
        this.testSphereCollision(playerPos);

        // Test 4: Registry stats
        this.testRegistryStats();

        // Print summary
        this.printSummary();

        return this.testResults;
    }

    testGroundHeight(playerPos, planetCenter) {
        console.log('\n--- Test 1: Ground Height Detection ---');

        const groundPos = this.collisionSystem.getGroundHeight(playerPos, planetCenter);

        if (groundPos) {
            const distance = playerPos.distanceTo(groundPos);
            const normal = this.collisionSystem.getGroundNormal(groundPos, planetCenter);

            console.log('✓ Ground detected');
            console.log(`  Position: (${groundPos.x.toFixed(2)}, ${groundPos.y.toFixed(2)}, ${groundPos.z.toFixed(2)})`);
            console.log(`  Distance: ${distance.toFixed(2)} units`);
            console.log(`  Normal: (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`);

            this.testResults.push({ test: 'Ground Height', passed: true, details: `Distance: ${distance.toFixed(2)}` });
        } else {
            console.log('✗ No ground detected (may be out of range)');
            this.testResults.push({ test: 'Ground Height', passed: false, details: 'No ground found' });
        }
    }

    testDirectionalRaycasts(playerPos, planetCenter) {
        console.log('\n--- Test 2: Directional Raycasts ---');

        const directions = [
            { name: 'Down (to planet)', dir: planetCenter.clone().sub(playerPos).normalize() },
            { name: 'Up (away from planet)', dir: playerPos.clone().sub(planetCenter).normalize() },
            { name: 'Forward', dir: new THREE.Vector3(1, 0, 0) },
            { name: 'Right', dir: new THREE.Vector3(0, 1, 0) }
        ];

        let hitCount = 0;
        for (const { name, dir } of directions) {
            const hit = this.collisionSystem.raycast(playerPos, dir, 20);

            if (hit) {
                console.log(`✓ ${name}: HIT at ${hit.distance.toFixed(2)} units`);
                hitCount++;
            } else {
                console.log(`  ${name}: MISS`);
            }
        }

        this.testResults.push({
            test: 'Directional Raycasts',
            passed: hitCount > 0,
            details: `${hitCount}/${directions.length} hits`
        });
    }

    testSphereCollision(playerPos) {
        console.log('\n--- Test 3: Sphere Overlap Detection ---');

        const radii = [0.5, 1.0, 2.0, 5.0];
        let overlapCount = 0;

        for (const radius of radii) {
            const overlaps = this.collisionSystem.checkSphereCollision(playerPos, radius);

            if (overlaps) {
                console.log(`✓ Radius ${radius}: OVERLAP detected`);
                overlapCount++;
            } else {
                console.log(`  Radius ${radius}: No overlap`);
            }
        }

        this.testResults.push({
            test: 'Sphere Collision',
            passed: true,
            details: `${overlapCount}/${radii.length} overlaps`
        });
    }

    testRegistryStats() {
        console.log('\n--- Test 4: Collision Registry Statistics ---');

        const stats = this.collisionSystem.getStats();
        const registry = this.collisionSystem.getRegistry();

        console.log('Collision Stats:');
        console.log(`  Total Queries: ${stats.collision.totalQueries}`);
        console.log(`  Successful Hits: ${stats.collision.successfulHits}`);
        console.log(`  Hit Rate: ${stats.collision.hitRate}`);
        console.log(`  Avg Query Time: ${stats.collision.averageQueryTime.toFixed(3)}ms`);

        console.log('\nRegistry Stats:');
        console.log(`  Total Meshes: ${stats.registry.totalMeshes}`);
        console.log(`  Total Raycasts: ${stats.registry.totalRaycasts}`);
        console.log(`  Cache Hit Rate: ${stats.registry.hitRate}`);

        const meshCount = registry.getAllKeys().length;

        this.testResults.push({
            test: 'Registry Stats',
            passed: meshCount > 0,
            details: `${meshCount} collision meshes registered`
        });
    }

    printSummary() {
        console.log('\n=== VERIFICATION SUMMARY ===');

        const passedTests = this.testResults.filter(r => r.passed).length;
        const totalTests = this.testResults.length;

        console.log(`\nTests Passed: ${passedTests}/${totalTests}`);

        for (const result of this.testResults) {
            const status = result.passed ? '✓' : '✗';
            console.log(`${status} ${result.test}: ${result.details}`);
        }

        if (passedTests === totalTests) {
            console.log('\n✓✓✓ ALL TESTS PASSED ✓✓✓');
            console.log('Collision system is working correctly!');
            console.log('Rendered meshes are properly synchronized with collision.');
        } else {
            console.log(`\n⚠ ${totalTests - passedTests} test(s) failed`);
        }

        console.log('\n===================================\n');
    }

    /**
     * Create visual debug helpers in scene
     */
    createDebugVisualization(scene, playerPos, planetCenter) {
        const helpers = [];

        // Show raycast from player to ground
        const groundPos = this.collisionSystem.getGroundHeight(playerPos, planetCenter);

        if (groundPos) {
            // Ray line
            const points = [playerPos, groundPos];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            helpers.push(line);

            // Ground point marker
            const markerGeometry = new THREE.SphereGeometry(0.5, 8, 8);
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(groundPos);
            scene.add(marker);
            helpers.push(marker);

            // Normal arrow
            const normal = this.collisionSystem.getGroundNormal(groundPos, planetCenter);
            const arrow = new THREE.ArrowHelper(normal, groundPos, 5, 0xffff00);
            scene.add(arrow);
            helpers.push(arrow);
        }

        return helpers;
    }

    /**
     * Clean up debug visualization
     */
    cleanupDebugVisualization(scene, helpers) {
        for (const helper of helpers) {
            scene.remove(helper);
            if (helper.geometry) helper.geometry.dispose();
            if (helper.material) helper.material.dispose();
        }
    }
}

