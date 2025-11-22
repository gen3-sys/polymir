uniform vec3 lightPosition;
uniform float ambientIntensity;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vec3 lightDir = normalize(lightPosition);
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    vec3 finalColor = vColor * (ambientIntensity + diffuse * 0.6);

    gl_FragColor = vec4(finalColor, 1.0);
}
