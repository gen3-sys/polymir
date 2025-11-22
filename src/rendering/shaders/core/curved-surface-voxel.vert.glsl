// ============================================================================
// CURVED SURFACE VOXEL VERTEX SHADER
// ============================================================================
//
// This shader bends flat voxel geometry onto curved megastructure surfaces
// (torus/ringworld, sphere, or flat plane). It works in tandem with the
// fragment shader which performs TRUE per-pixel surface mapping.
//
// COORDINATE SYSTEM (Torus):
//   - Flat grid: X = along ring, Y = height/depth, Z = around tube
//   - Torus orientation: Y-up, ring lies in XZ plane
//   - theta = angle around the ring (from X in flat space)
//   - phi = angle around the tube cross-section (from Z in flat space)
//
// USAGE:
//   - Set uSurfaceType: 0=plane, 1=sphere, 2=torus
//   - For torus: set uMajorRadius (ring) and uMinorRadius (tube)
//   - For best results on curved surfaces, use maxQuadSize=1 in greedy mesher
//     to avoid triangle diagonal interpolation artifacts
//
// The vertex shader bends vertices for correct rasterization bounds, while
// the fragment shader computes true per-pixel positions and depth values.
// ============================================================================

// Surface bending parameters
uniform vec3 uPlayerPos;           // Player position in world space
uniform int uSurfaceType;          // 0=plane, 1=sphere, 2=torus
uniform float uMajorRadius;        // For torus: major radius (ring radius)
uniform float uMinorRadius;        // For torus: minor radius (tube radius)
uniform float uSphereRadius;       // For sphere: radius
uniform mat4 uViewMatrix;          // Passed to fragment shader for per-pixel depth
uniform mat4 uProjectionMatrix;    // Passed to fragment shader for per-pixel depth

attribute vec3 color;

varying vec3 vColor;
varying vec3 vFlatPos;      // Flat grid position - fragment shader uses this for per-pixel mapping
varying vec3 vFlatNormal;   // Original normal in flat space - transformed per-pixel in fragment

// Compute torus position from flat grid coordinates
// Maps flat (x, y, z) to torus surface where:
//   x -> theta (angle around ring)
//   z -> phi (angle around tube)
//   y -> radial depth (height above/below surface)
vec3 torusPosition(vec3 flatPos) {
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

void main() {
    vColor = color;

    // Get flat grid position (before any bending)
    vec3 flatPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 flatNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    // Pass flat position to fragment shader for per-pixel mapping
    vFlatPos = flatPos;
    vFlatNormal = flatNormal;

    if (uSurfaceType == 2) {
        // TORUS: Bend vertices, but also compute neighbors for proper triangle coverage
        vec3 torusPos = torusPosition(flatPos);
        gl_Position = projectionMatrix * viewMatrix * vec4(torusPos, 1.0);

    } else if (uSurfaceType == 1) {
        // SPHERE: Map to sphere surface
        float dist = length(flatPos.xz);
        float theta = atan(flatPos.z, flatPos.x);
        float phi = atan(flatPos.y, dist);
        float depth = length(flatPos) - uSphereRadius;

        float r = uSphereRadius + depth;
        vec3 spherePos = vec3(
            r * cos(phi) * cos(theta),
            r * sin(phi),
            r * cos(phi) * sin(theta)
        );

        gl_Position = projectionMatrix * viewMatrix * vec4(spherePos, 1.0);

    } else {
        // PLANE: No bending
        gl_Position = projectionMatrix * viewMatrix * vec4(flatPos, 1.0);
    }
}
