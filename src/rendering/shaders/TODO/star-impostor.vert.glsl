uniform float planetRadius;
uniform float chunkSize;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vSpherePos;
varying float vHeight;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vPosition = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vSpherePos = normalize(position);

    vec3 offset = vPosition;
    vHeight = length(offset) - planetRadius;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
