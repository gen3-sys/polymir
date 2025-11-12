import { noise3d } from './noise3d.js';

export function octaveNoise(x, y, z, octaves) {
    let result = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves.length; i++) {
        const octave = octaves[i];
        result += noise3d(x * frequency, y * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= octave.persistence || 0.5;
        frequency *= octave.lacunarity || 2.0;
    }

    return result / maxValue;
}
