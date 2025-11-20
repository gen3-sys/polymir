// Curved Surface Voxel Fragment Shader
// Simple shading for voxels on curved surfaces

precision highp float;

varying vec3 vColor;
varying vec3 vNormal;

uniform vec3 uSunDirection;

void main() {
    // Simple directional lighting
    vec3 sunDir = normalize(uSunDirection);
    float diffuse = max(dot(vNormal, sunDir), 0.0);

    // Ambient + diffuse
    float lighting = 0.4 + 0.6 * diffuse;

    vec3 finalColor = vColor * lighting;

    gl_FragColor = vec4(finalColor, 1.0);
}
