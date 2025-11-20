uniform float time;
uniform vec3 portalColor;
uniform float intensity;
uniform sampler2D noiseTexture;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

// Simple noise function
float noise(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 uv = vUv;

    // Animated swirl effect
    float angle = atan(uv.y - 0.5, uv.x - 0.5);
    float radius = length(uv - 0.5);

    float swirl = angle + radius * 5.0 - time * 2.0;
    vec2 swirlUv = vec2(cos(swirl), sin(swirl)) * radius + 0.5;

    // Layered colors
    vec3 color1 = portalColor;
    vec3 color2 = portalColor * 0.5 + vec3(0.3, 0.0, 0.5);

    float pattern = sin(swirlUv.x * 10.0 + time) * cos(swirlUv.y * 10.0 - time * 0.5);
    pattern = (pattern + 1.0) * 0.5;

    vec3 finalColor = mix(color1, color2, pattern);

    // Pulse effect
    float pulse = sin(time * 3.0) * 0.2 + 0.8;
    finalColor *= pulse * intensity;

    // Edge glow
    float edge = 1.0 - radius * 2.0;
    edge = smoothstep(0.0, 0.3, edge);
    finalColor += edge * portalColor * 0.5;

    // Transparency based on radius
    float alpha = smoothstep(1.0, 0.3, radius) * 0.9;

    gl_FragColor = vec4(finalColor, alpha);
}
