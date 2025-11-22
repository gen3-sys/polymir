uniform vec3 lightPosition;
uniform float ambientIntensity;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vColor = color;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
