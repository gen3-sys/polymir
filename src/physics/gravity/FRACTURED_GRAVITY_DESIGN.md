# Fractured Ringworld Gravity System - Design Document

## Overview

The **FracturedGravitySystem** handles gravity for ringworlds that have been broken into multiple arc segments through collisions, explosions, or structural failure. Each segment maintains its own curved gravity centerline, creating a perturbed toroidal gravity field.

## Conceptual Model

### Intact Ringworld
- Single continuous torus with uniform gravity pointing toward the ring centerline
- Gravity field rotates uniformly with the structure
- Simple toroidal coordinate system

### Fractured Ringworld
- Multiple independent arc segments, each with:
  - Its own curved gravity centerline (arc of the original torus)
  - Independent rotation and tumbling motion
  - Overlapping gravity influence zones at fracture boundaries
  - Smooth gravity interpolation between segments

## Architecture

### Core Components

```
FracturedGravitySystem
├── segments: Map<id, GravitySegment>
├── influenceRadius: number
├── blendDistance: number
└── Methods:
    ├── registerSegment(id, config)
    ├── unregisterSegment(id)
    ├── getGravityAt(position)
    ├── update(deltaTime)
    └── blendGravityFields(segments, position)

GravitySegment
├── Arc Definition
│   ├── arcStart: radians
│   ├── arcEnd: radians
│   ├── ringRadius: distance to centerline
│   └── tubeRadius: thickness
├── Transform
│   ├── center: Vector3
│   ├── axis: Vector3 (normalized)
│   ├── rotation: radians
│   ├── quaternion: Quaternion (cached)
│   └── angularVelocity: Vector3
├── Physics
│   ├── mass: number
│   └── voxelCount: number
└── Gravity
    ├── influenceRadius: number
    └── strength: number (9.8 m/s²)
```

## Gravity Calculation Algorithm

### Single Segment Gravity

For a position `P` near segment `S`:

1. **Transform to Local Space**
   ```javascript
   localPos = P - S.center
   localPos.applyQuaternion(S.inverseQuaternion)
   ```

2. **Project onto Ring Plane**
   ```javascript
   axisComponent = localPos · S.axis
   radialPos = localPos - S.axis * axisComponent
   radialDist = |radialPos|
   ```

3. **Find Nearest Point on Arc**
   ```javascript
   angle = atan2(radialPos.z, radialPos.x)
   clampedAngle = clamp(angle, S.arcStart, S.arcEnd)

   nearestPoint = (
       cos(clampedAngle) * S.ringRadius,
       axisComponent,
       sin(clampedAngle) * S.ringRadius
   )
   ```

4. **Calculate Gravity Direction**
   ```javascript
   toCenter = nearestPoint - localPos
   distFromCenterline = |toCenter|
   distFromSurface = distFromCenterline - S.tubeRadius

   direction = normalize(toCenter)
   direction.applyQuaternion(S.quaternion) // Back to world space
   ```

5. **Apply Falloff**
   ```javascript
   if (distFromSurface > S.influenceRadius) {
       influence = 0
   } else {
       t = distFromSurface / S.influenceRadius
       influence = smoothstep(1 - t) // Cubic or custom curve
   }

   gravityStrength = S.strength * influence
   ```

### Multi-Segment Blending

When multiple segments influence a position:

1. **Calculate Each Segment's Contribution**
   ```javascript
   contributions = []
   for each segment S:
       gravity = calculateSegmentGravity(S, position)
       contributions.push(gravity)
   ```

2. **Normalize Weights**
   ```javascript
   totalInfluence = sum(contributions.map(g => g.influence))

   for each contribution:
       weight = contribution.influence / totalInfluence
   ```

3. **Blend Gravity Vectors**
   ```javascript
   blendedGravity = Vector3(0, 0, 0)

   for each contribution:
       blendedGravity += contribution.direction * contribution.strength * weight
   ```

4. **Determine Dominant Segment**
   ```javascript
   dominantSegment = contributions.maxBy(c => c.influence)
   ```

## Fracture Integration

### Chunk-Based Fracturing (Future)

When implementing chunk-based fracturing:

```javascript
// 1. Detect fracture event (collision, explosion, structural failure)
onFractureEvent(ringworld, fracturePoints) {
    // 2. Analyze connectivity
    const segments = analyzeConnectedComponents(ringworld.chunks, fracturePoints)

    // 3. For each disconnected segment
    for (const segment of segments) {
        // Calculate arc bounds
        const arcBounds = calculateArcBounds(segment.chunks, ringworld.center)

        // Calculate center of mass
        const centerOfMass = calculateCenterOfMass(segment.chunks)

        // Calculate moment of inertia and angular velocity
        const inertia = calculateMomentOfInertia(segment.chunks, centerOfMass)
        const angularVel = calculateAngularVelocity(segment.velocity, inertia)

        // Register gravity segment
        fracturedGravity.registerSegment(`segment_${segment.id}`, {
            arcStart: arcBounds.start,
            arcEnd: arcBounds.end,
            ringRadius: ringworld.ringRadius,
            tubeRadius: ringworld.tubeRadius,
            center: centerOfMass,
            axis: ringworld.axis.clone(),
            rotation: 0,
            rotationSpeed: 0, // Replaced by angularVelocity
            angularVelocity: angularVel,
            mass: segment.totalMass,
            voxelCount: segment.chunks.length * CHUNK_SIZE³,
            fractureTime: Date.now(),
            parentSegmentId: ringworld.id
        })

        // Create physics body for segment
        createRigidBody(segment, {
            position: centerOfMass,
            velocity: segment.velocity,
            angularVelocity: angularVel,
            mass: segment.totalMass,
            inertia: inertia
        })
    }

    // 4. Remove original ringworld gravity
    gravitySystem.unregisterSegment(ringworld.id)
}
```

### Arc Bounds Calculation

```javascript
function calculateArcBounds(chunks, ringCenter) {
    const angles = chunks.map(chunk => {
        const chunkPos = chunk.getWorldPosition()
        const radialPos = chunkPos.sub(ringCenter)
        return Math.atan2(radialPos.z, radialPos.x)
    })

    // Handle wrap-around at 0/2π
    angles.sort()

    // Find largest gap (indicates discontinuity)
    let maxGap = 0
    let gapIndex = 0
    for (let i = 0; i < angles.length; i++) {
        const gap = angles[(i + 1) % angles.length] - angles[i]
        if (gap > maxGap) {
            maxGap = gap
            gapIndex = i
        }
    }

    // Arc bounds are from end of gap to start of gap
    return {
        start: angles[(gapIndex + 1) % angles.length],
        end: angles[gapIndex]
    }
}
```

## Gravity Field Interpolation

### Smooth Transitions at Fracture Boundaries

The system automatically creates smooth gravity transitions at fracture boundaries through weighted blending:

```
Position P between segments A and B:

  influenceA = 0.7    influenceB = 0.3
  weightA = 0.7       weightB = 0.3

  gravity = gravityA * 0.7 + gravityB * 0.3
```

This prevents:
- Sudden gravity direction changes
- Discontinuous acceleration
- Player disorientation at boundaries

### Falloff Curves

Available falloff curves for gravity influence:

1. **Linear**: `f(t) = t`
   - Uniform falloff
   - Simple, predictable

2. **Quadratic**: `f(t) = t²`
   - Faster falloff near edge
   - Sharper boundary

3. **Cubic**: `f(t) = t³`
   - Very smooth near surface
   - Rapid falloff at edge
   - Default for ringworlds

4. **Smoothstep**: `f(t) = t² * (3 - 2t)`
   - Smooth at both ends
   - Natural feeling transitions
   - Recommended for fractured segments

## Performance Considerations

### Spatial Culling

```javascript
findNearbySegments(position) {
    // Quick AABB check before detailed calculation
    const maxDist = segment.ringRadius + segment.tubeRadius + segment.influenceRadius

    if (position.distanceTo(segment.center) < maxDist) {
        return segment // Potentially influencing
    }
}
```

### Caching

```javascript
// Cache nearest segment for frequently queried positions
nearestSegmentCache: Map<positionKey, {segment, expiry}>

// Invalidate cache on segment updates
onSegmentUpdate() {
    nearestSegmentCache.clear()
}
```

### Level of Detail

For distant players, use simplified gravity:
```javascript
if (distanceToPlayer > LOD_DISTANCE) {
    // Approximate all segments as single point mass
    return calculatePointMassGravity(combinedCenterOfMass, totalMass)
}
```

## Physics Integration

### Rigid Body Dynamics

Each segment acts as a rigid body:

```javascript
segment.update(deltaTime) {
    // Update rotation from angular velocity
    const angularDelta = angularVelocity * deltaTime
    const rotationQuat = Quaternion.fromAxisAngle(
        normalize(angularDelta),
        length(angularDelta)
    )

    quaternion = quaternion * rotationQuat

    // Update position from linear velocity
    center += velocity * deltaTime

    // Apply external forces (gravity from other bodies, collisions)
    applyForces(deltaTime)
}
```

### Inter-Segment Gravity

Segments can gravitationally attract each other:

```javascript
// In debris physics system
for (const segmentA of segments) {
    for (const segmentB of segments) {
        if (segmentA === segmentB) continue

        const force = calculateMutualGravity(
            segmentA.mass, segmentB.mass,
            segmentA.center, segmentB.center
        )

        segmentA.applyForce(force)
        segmentB.applyForce(-force)
    }
}
```

## Example Usage

### Basic Setup

```javascript
import { FracturedGravitySystem } from './systems/FracturedGravitySystem.js';

const gravitySystem = new FracturedGravitySystem({
    ringRadius: 1000,
    tubeRadius: 200,
    influenceRadius: 100,
    blendDistance: 50,
    falloffCurve: 'smooth'
});
```

### Register Fractured Segments

```javascript
// Segment 1: Arc from 0° to 90°
gravitySystem.registerSegment('segment_1', {
    arcStart: 0,
    arcEnd: Math.PI / 2,
    ringRadius: 1000,
    tubeRadius: 200,
    center: new THREE.Vector3(0, 0, 0),
    axis: new THREE.Vector3(0, 1, 0),
    rotation: 0,
    rotationSpeed: 0.02,
    angularVelocity: new THREE.Vector3(0.01, 0, 0.01),
    mass: 5000,
    influenceRadius: 100,
    strength: 9.8
});

// Segment 2: Arc from 120° to 270°
gravitySystem.registerSegment('segment_2', {
    arcStart: Math.PI * 2/3,
    arcEnd: Math.PI * 1.5,
    ringRadius: 1000,
    tubeRadius: 200,
    center: new THREE.Vector3(50, 0, -30), // Slightly displaced
    axis: new THREE.Vector3(0, 1, 0),
    rotation: 0.1,
    rotationSpeed: -0.015,
    angularVelocity: new THREE.Vector3(-0.005, 0.01, 0),
    mass: 7500,
    influenceRadius: 100,
    strength: 9.8
});
```

### Update and Query

```javascript
// In game loop
function update(deltaTime) {
    // Update segment physics
    gravitySystem.update(deltaTime);

    // Query gravity at player position
    const gravityData = gravitySystem.getGravityAt(player.position);

    // Apply to player
    player.velocity.add(gravityData.acceleration.multiplyScalar(deltaTime));
    player.upVector = gravityData.upVector;

    // Check which segment(s) are influencing player
    if (gravityData.segments) {
        for (const seg of gravityData.segments) {
            console.log(`${seg.id}: ${seg.weight * 100}% influence`);
        }
    }
}
```

### Visualization

```javascript
// Visualize gravity fields
for (const [segId, segment] of gravitySystem.getSegments()) {
    // Draw arc centerline
    const arcCurve = createArcCurve(
        segment.center,
        segment.ringRadius,
        segment.arcStart,
        segment.arcEnd,
        segment.axis
    );

    // Apply segment rotation
    arcCurve.applyQuaternion(segment.getQuaternion());

    scene.add(new THREE.Line(arcCurve, lineMaterial));

    // Draw influence sphere at segment center
    const influenceSphere = new THREE.Mesh(
        new THREE.SphereGeometry(segment.influenceRadius, 16, 16),
        new THREE.MeshBasicMaterial({
            color: 0xff00ff,
            wireframe: true,
            transparent: true,
            opacity: 0.2
        })
    );
    influenceSphere.position.copy(segment.center);
    scene.add(influenceSphere);
}
```

## Future Enhancements

### Procedural Fracture Patterns

```javascript
// Generate realistic fracture lines based on stress analysis
function generateFracturePattern(ringworld, impactPoint, impactForce) {
    const stressField = calculateStressField(ringworld, impactPoint, impactForce)
    const fractureLines = propagateCracks(stressField, STRESS_THRESHOLD)
    return segmentRing(ringworld, fractureLines)
}
```

### Healing/Welding

```javascript
// Merge segments that come into gentle contact
function attemptWeld(segment1, segment2) {
    if (areAdjacent(segment1, segment2) && relativeVelocity < WELD_THRESHOLD) {
        const mergedSegment = mergeSegments(segment1, segment2)
        gravitySystem.unregisterSegment(segment1.id)
        gravitySystem.unregisterSegment(segment2.id)
        gravitySystem.registerSegment(mergedSegment.id, mergedSegment)
    }
}
```

### Tidal Forces

```javascript
// Calculate tidal stress on segments from nearby massive objects
function calculateTidalStress(segment, nearbyObjects) {
    const centerGravity = calculateGravityAt(segment.center, nearbyObjects)

    // Sample gravity at segment extents
    const endpointGravity1 = calculateGravityAt(segment.arcEndpoint1, nearbyObjects)
    const endpointGravity2 = calculateGravityAt(segment.arcEndpoint2, nearbyObjects)

    // Tidal force is the differential
    const tidalStress = max(
        |endpointGravity1 - centerGravity|,
        |endpointGravity2 - centerGravity|
    )

    // Cause further fracturing if stress exceeds threshold
    if (tidalStress > TIDAL_FRACTURE_THRESHOLD) {
        fractureSegment(segment)
    }
}
```

## Validation

### Unit Tests

```javascript
describe('FracturedGravitySystem', () => {
    test('Single segment acts like intact torus', () => {
        const system = new FracturedGravitySystem()
        system.registerSegment('full', {
            arcStart: 0,
            arcEnd: Math.PI * 2,
            // ... full ring
        })

        const gravity = system.getGravityAt(testPosition)
        expect(gravity.direction).toPointTowardCenterline()
    })

    test('Gravity blends smoothly at segment boundaries', () => {
        const system = new FracturedGravitySystem()
        system.registerSegment('seg1', { arcStart: 0, arcEnd: Math.PI })
        system.registerSegment('seg2', { arcStart: Math.PI, arcEnd: Math.PI * 2 })

        // Test positions near boundary
        const positions = generateTestPositionsNearBoundary(Math.PI)

        for (const pos of positions) {
            const gravity = system.getGravityAt(pos)
            expect(gravity.acceleration).toBeContinuous()
        }
    })

    test('Rotating segments update gravity field', () => {
        const system = new FracturedGravitySystem()
        const segment = system.registerSegment('rotating', {
            rotationSpeed: 1.0,
            // ...
        })

        const initialGravity = system.getGravityAt(testPosition)
        system.update(Math.PI) // Half rotation
        const rotatedGravity = system.getGravityAt(testPosition)

        expect(rotatedGravity.direction).not.toEqual(initialGravity.direction)
    })
})
```

## References

- Original GravitySystem.js - Toroidal coordinate calculations
- DebrisPhysics.js - Rigid body dynamics and orbital mechanics
- Schematic.js - RingworldSchematic metadata structure

---

**Status**: Design Complete, Implementation Ready for Testing
**Version**: 1.0.0
**Last Updated**: 2025-11-13
