// ============================================================================
// CURVED SURFACE VOXEL FRAGMENT SHADER
// ============================================================================
//
// TRUE per-pixel torus/sphere mapping with correct depth for seamless
// megastructure rendering. This shader is specifically designed for rendering
// voxel terrain on curved surfaces like ringworlds (torus) without seams.
//
// KEY TECHNIQUE:
//   The vertex shader bends vertices onto the curved surface for rasterization,
//   but this creates interpolation errors across triangle interiors. This
//   fragment shader solves that by:
//
//   1. Receiving interpolated FLAT coordinates (vFlatPos) from vertex shader
//   2. Computing the TRUE curved surface position per-pixel using parametric
//      torus equations (cheap - just a few trig ops, NOT raymarching)
//   3. Writing correct depth via gl_FragDepth for proper occlusion
//   4. Transforming normals per-pixel for smooth lighting on curved surfaces
//
// TORUS PARAMETRIC EQUATIONS:
//   theta = flatPos.x / majorRadius  (angle around ring)
//   phi = flatPos.z / minorRadius    (angle around tube)
//   r = minorRadius + flatPos.y      (radial distance including height)
//
//   x = (majorRadius + r * cos(phi)) * cos(theta)
//   y = r * sin(phi)
//   z = (majorRadius + r * cos(phi)) * sin(theta)
//
// REQUIREMENTS:
//   - uViewMatrix and uProjectionMatrix must be passed as custom uniforms
//     (Three.js doesn't expose these to fragment shaders by default)
//   - Update these uniforms every frame from camera.matrixWorldInverse
//     and camera.projectionMatrix
//   - For best results, use maxQuadSize=1 in greedy mesher to eliminate
//     triangle diagonal interpolation artifacts
//
// ============================================================================

precision highp float;

uniform vec3 uSunDirection;
uniform int uSurfaceType;          // 0=plane, 1=sphere, 2=torus
uniform float uMajorRadius;        // For torus: ring radius
uniform float uMinorRadius;        // For torus: tube radius
uniform float uSphereRadius;       // For sphere: radius
uniform mat4 uViewMatrix;          // Camera view matrix for per-pixel depth
uniform mat4 uProjectionMatrix;    // Camera projection matrix for per-pixel depth

varying vec3 vColor;
varying vec3 vFlatPos;      // Interpolated flat grid position from vertex shader
varying vec3 vFlatNormal;   // Original normal in flat space (pre-bend)

// ============================================================================
// TORUS POSITION MAPPING
// ============================================================================
// Computes world-space torus position from flat grid coordinates.
// This is the core of per-pixel surface mapping - we compute the exact
// position on the torus for each pixel, not just interpolate vertex positions.
vec3 getTorusPosition(vec3 flatPos) {
    float theta = flatPos.x / uMajorRadius;
    float phi = flatPos.z / uMinorRadius;
    float depth = flatPos.y;
    float r = uMinorRadius + depth;
    return vec3(
        (uMajorRadius + r * cos(phi)) * cos(theta),
        r * sin(phi),
        (uMajorRadius + r * cos(phi)) * sin(theta)
    );
}

// ============================================================================
// NORMAL TRANSFORMATION
// ============================================================================
// Transforms a flat-space normal vector to the curved surface's local
// coordinate frame. This gives correct lighting on curved surfaces.
//
// For a torus, we build an orthonormal basis at each point:
//   - tangentRing: tangent along the ring direction (d/dtheta)
//   - tangentTube: tangent along the tube direction (d/dphi)
//   - surfaceNormal: outward-pointing normal from tube center
//
// The flat normal components map to this basis:
//   flatNormal.x -> tangentRing  (faces pointing along ring)
//   flatNormal.y -> surfaceNormal (faces pointing outward)
//   flatNormal.z -> tangentTube  (faces pointing around tube)
vec3 transformNormal(vec3 flatNormal, vec3 flatPos) {
    if (uSurfaceType == 2) {
        // TORUS
        float theta = flatPos.x / uMajorRadius;
        float phi = flatPos.z / uMinorRadius;

        // Build local coordinate frame on torus surface
        // Tangent along ring (d/dtheta)
        vec3 tangentRing = normalize(vec3(-sin(theta), 0.0, cos(theta)));

        // Tangent along tube (d/dphi)
        vec3 tangentTube = normalize(vec3(
            -sin(phi) * cos(theta),
            cos(phi),
            -sin(phi) * sin(theta)
        ));

        // Surface normal (outward)
        vec3 surfaceNormal = normalize(vec3(
            cos(phi) * cos(theta),
            sin(phi),
            cos(phi) * sin(theta)
        ));

        // Transform flat normal using local basis
        // flatNormal.x -> tangentRing, flatNormal.y -> surfaceNormal, flatNormal.z -> tangentTube
        return normalize(
            flatNormal.x * tangentRing +
            flatNormal.y * surfaceNormal +
            flatNormal.z * tangentTube
        );

    } else if (uSurfaceType == 1) {
        // SPHERE - similar basis transformation
        float theta = atan(flatPos.z, flatPos.x);
        float dist = length(flatPos.xz);
        float phi = atan(flatPos.y, dist);

        vec3 tangentTheta = normalize(vec3(-sin(theta), 0.0, cos(theta)));
        vec3 tangentPhi = normalize(vec3(
            -sin(phi) * cos(theta),
            cos(phi),
            -sin(phi) * sin(theta)
        ));
        vec3 surfaceNormal = normalize(vec3(
            cos(phi) * cos(theta),
            sin(phi),
            cos(phi) * sin(theta)
        ));

        return normalize(
            flatNormal.x * tangentTheta +
            flatNormal.y * surfaceNormal +
            flatNormal.z * tangentPhi
        );

    } else {
        // PLANE - no transformation
        return flatNormal;
    }
}

// ============================================================================
// MAIN - Per-pixel surface mapping and lighting
// ============================================================================
void main() {
    // STEP 1: Compute TRUE world position per-pixel
    // This is the key to seamless rendering - we don't rely on interpolated
    // vertex positions, we compute the exact torus position for each pixel
    vec3 worldPos;
    if (uSurfaceType == 2) {
        worldPos = getTorusPosition(vFlatPos);
    } else {
        worldPos = vFlatPos;
    }

    // STEP 2: Compute correct depth per-pixel
    // This eliminates seams by ensuring each pixel has mathematically correct
    // depth regardless of how triangles were rasterized
    vec4 clipPos = uProjectionMatrix * uViewMatrix * vec4(worldPos, 1.0);
    float ndcDepth = clipPos.z / clipPos.w;
    gl_FragDepth = ndcDepth * 0.5 + 0.5;

    // STEP 3: Transform normal to curved surface space
    vec3 curvedNormal = transformNormal(vFlatNormal, vFlatPos);

    // STEP 4: Lighting calculation
    vec3 sunDir = normalize(uSunDirection);
    float diffuse = max(dot(curvedNormal, sunDir), 0.0);
    float lighting = 0.4 + 0.6 * diffuse;  // Ambient + diffuse

    vec3 finalColor = vColor * lighting;
    gl_FragColor = vec4(finalColor, 1.0);
}
