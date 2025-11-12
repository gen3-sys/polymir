import { hash } from './hash.js';

export function noise3d(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sz = fz * fz * (3 - 2 * fz);

    const c000 = hash(ix, iy, iz);
    const c100 = hash(ix + 1, iy, iz);
    const c010 = hash(ix, iy + 1, iz);
    const c110 = hash(ix + 1, iy + 1, iz);
    const c001 = hash(ix, iy, iz + 1);
    const c101 = hash(ix + 1, iy, iz + 1);
    const c011 = hash(ix, iy + 1, iz + 1);
    const c111 = hash(ix + 1, iy + 1, iz + 1);

    const k0 = c000 + (c100 - c000) * sx;
    const k1 = c010 + (c110 - c010) * sx;
    const k2 = c001 + (c101 - c001) * sx;
    const k3 = c011 + (c111 - c011) * sx;
    const k4 = k0 + (k1 - k0) * sy;
    const k5 = k2 + (k3 - k2) * sy;

    return k4 + (k5 - k4) * sz;
}
