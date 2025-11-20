// Surface bending parameters
uniform vec3 uPlayerPos;           // Player position in world space
uniform float uNearRadius;         // Distance where bending starts (in chunks)
uniform float uFarRadius;          // Distance where bending is complete
uniform int uSurfaceType;          // 0=plane, 1=sphere, 2=torus
uniform float uMajorRadius;        // For torus: major radius
uniform float uMinorRadius;        // For torus: minor radius
uniform float uSphereRadius;       // For sphere: radius

attribute vec3 color;
varying vec3 vColor;
varying vec3 vNormal;

// Convert flat grid position to torus surface coordinates
// Assumes chunks are laid out in a flat XZ grid where:
// X = arc length around major ring (0 to 2*PI*R)
// Z = arc length around minor tube (0 to 2*PI*r)
// Y = depth/height
vec2 flatGridToTorusSurface(vec3 pos) {
    // Convert arc lengths to angles
    float u = pos.x / uMajorRadius;  // theta (around ring)
    float v = pos.z / uMinorRadius;  // phi (around tube)
    return vec2(u, v);
}

// Map surface coordinates back to world with proper curvature
// For ringworld: outer surface (where green terrain is) should be at phi=0 (top/outside of tube)
// depth is height above outer surface (Y in flat grid)
vec3 torusSurfaceToWorld(vec2 uv, float depth) {
    // depth=0 is the outer surface, depth increases outward
    float r = uMinorRadius + depth;
    float x = (uMajorRadius + r * cos(uv.y)) * cos(uv.x);
    float y = r * sin(uv.y);
    float z = (uMajorRadius + r * cos(uv.y)) * sin(uv.x);
    return vec3(x, y, z);
}

// Convert world position to sphere surface coordinates
vec2 worldToSphereSurface(vec3 pos) {
    float dist = length(pos);
    float u = atan(pos.z, pos.x);
    float v = asin(pos.y / max(dist, 0.001));
    return vec2(u, v);
}

// Map sphere surface coordinates back to world
vec3 sphereSurfaceToWorld(vec2 uv, float depth) {
    float r = uSphereRadius + depth;
    float x = r * cos(uv.y) * cos(uv.x);
    float y = r * sin(uv.y);
    float z = r * cos(uv.y) * sin(uv.x);
    return vec3(x, y, z);
}

void main() {
    vColor = color;

    // Transform local vertex position to world space
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    // Calculate distance from player to this vertex
    float distToPlayer = length(worldPos - uPlayerPos);

    // Calculate bend factor based on distance
    // 0 = no bend (near player), 1 = full bend (far from player)
    float bendFactor = 0.0;
    if (distToPlayer > uNearRadius) {
        bendFactor = clamp((distToPlayer - uNearRadius) / (uFarRadius - uNearRadius), 0.0, 1.0);
    }

    // Apply bending based on surface type
    if (bendFactor > 0.0 && uSurfaceType > 0) {
        if (uSurfaceType == 2) {
            // TORUS BENDING
            // Convert flat grid position to torus surface coordinates
            vec2 surfaceCoords = flatGridToTorusSurface(worldPos);

            // Depth is the Y coordinate in the flat grid
            float currentDepth = worldPos.y;

            // Get curved position on torus
            vec3 curvedPos = torusSurfaceToWorld(surfaceCoords, currentDepth);

            // Lerp between flat and curved based on bendFactor
            worldPos = mix(worldPos, curvedPos, bendFactor);

            // Calculate normal on torus surface
            vec3 curvedNormal = normalize(vec3(
                cos(surfaceCoords.y) * cos(surfaceCoords.x),
                sin(surfaceCoords.y),
                cos(surfaceCoords.y) * sin(surfaceCoords.x)
            ));
            worldNormal = mix(worldNormal, curvedNormal, bendFactor);

        } else if (uSurfaceType == 1) {
            // SPHERE BENDING
            vec2 surfaceCoords = worldToSphereSurface(worldPos);
            float currentDepth = length(worldPos) - uSphereRadius;

            vec3 curvedPos = sphereSurfaceToWorld(surfaceCoords, currentDepth);
            worldPos = mix(worldPos, curvedPos, bendFactor);

            vec3 curvedNormal = normalize(worldPos);
            worldNormal = mix(worldNormal, curvedNormal, bendFactor);
        }
    }

    // Apply view and projection transformations
    // Transform the potentially bent normal from world space to view space
    vNormal = normalize(mat3(viewMatrix) * worldNormal);
    // worldPos is already in world space, so apply view and projection only
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
