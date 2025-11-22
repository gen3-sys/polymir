varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vSpherePos;

uniform float time;

float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yxz + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
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
    float turbulence = noise(vSpherePos * 10.0);

    float r = 1.0;
    float g = 0.8 + turbulence * 0.2;
    float b = 0.3 + turbulence * 0.4;

    vec3 color = vec3(r, g, b);

    gl_FragColor = vec4(color, 1.0);
}
