uniform float planetRadius;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vSpherePos;
varying float vHeight;

float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yxz + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
    vec3 spherePos = normalize(position);
    vSpherePos = spherePos;

    float height = 0.0;
    height += (noise3d(spherePos * 2.0) - 0.5) * 15.0;
    height += (noise3d(spherePos * 5.0) - 0.5) * 8.0;
    height += (noise3d(spherePos * 12.0) - 0.5) * 4.0;
    height += (noise3d(spherePos * 25.0) - 0.5) * 2.0;

    vHeight = height;

    float minOffset = min(0.5, planetRadius * 0.01);
    float scaleToFitInsideMinRadius = (planetRadius - minOffset) / planetRadius;

    vec3 displaced = position * scaleToFitInsideMinRadius + spherePos * height * 0.5;
    vPosition = displaced;
    vNormal = normalize(normalMatrix * spherePos);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
