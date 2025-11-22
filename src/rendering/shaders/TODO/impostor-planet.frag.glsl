precision highp sampler3D;

uniform sampler3D chunkTexture;
uniform float chunkTextureSize;
uniform float chunkSize;
uniform vec3 lightPosition;
uniform float ambientIntensity;
uniform float debugCulling;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vSpherePos;
varying float vHeight;

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

vec3 getTerrainColor(float height, vec3 spherePos) {
    vec3 color;

    if (height < -5.0) {
        color = vec3(0.13, 0.43, 0.69);
    } else if (height < 0.0) {
        color = mix(vec3(0.13, 0.43, 0.69), vec3(0.30, 0.59, 0.78), (height + 5.0) / 5.0);
    } else if (height < 2.0) {
        color = vec3(0.76, 0.70, 0.50);
    } else if (height < 10.0) {
        float variation = noise(spherePos * 40.0) * 0.1;
        color = vec3(0.30, 0.60, 0.30) + vec3(variation);
    } else if (height < 18.0) {
        float variation = noise(spherePos * 60.0) * 0.08;
        color = vec3(0.24, 0.51, 0.24) + vec3(variation);
    } else if (height < 25.0) {
        float rockiness = noise(spherePos * 80.0);
        color = mix(vec3(0.47, 0.39, 0.35), vec3(0.55, 0.55, 0.50), rockiness);
    } else {
        float snowVariation = noise(spherePos * 100.0) * 0.05;
        color = vec3(0.94, 0.94, 0.98) + vec3(snowVariation);
    }

    return color;
}

void main() {
    vec3 chunkCoord = floor(vPosition / chunkSize);

    vec3 texCoord = (chunkCoord + vec3(chunkTextureSize * 0.5)) / chunkTextureSize;

    float isLoaded = texture(chunkTexture, texCoord).r;
    bool shouldCull = isLoaded > 0.5;

    if (debugCulling > 0.5) {
        if (shouldCull) {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 0.5);
            return;
        }
    } else {
        if (shouldCull) {
            discard;
        }
    }

    vec3 color = getTerrainColor(vHeight, vSpherePos);

    vec3 lightDir = normalize(lightPosition);
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    vec3 finalColor = color * (ambientIntensity + diffuse * 0.6);

    gl_FragColor = vec4(finalColor, 1.0);
}
