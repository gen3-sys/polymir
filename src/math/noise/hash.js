export function hash(x, y, z) {
    let p = {
        x: x * 443.897,
        y: y * 441.423,
        z: z * 437.195
    };

    p.x = p.x - Math.floor(p.x);
    p.y = p.y - Math.floor(p.y);
    p.z = p.z - Math.floor(p.z);

    const dotProduct = p.x * (p.y + 19.19) + p.y * (p.x + 19.19) + p.z * (p.z + 19.19);
    p.x += dotProduct;
    p.y += dotProduct;
    p.z += dotProduct;

    const result = (p.x + p.y) * p.z;
    return result - Math.floor(result);
}
