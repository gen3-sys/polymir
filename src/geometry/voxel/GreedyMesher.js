export class GreedyMesher {
    static meshFaces(exposedFaces) {
        const mergedQuads = [];

        const facesByDir = {
            'px': [], 'nx': [],
            'py': [], 'ny': [],
            'pz': [], 'nz': []
        };

        for (const face of exposedFaces) {
            facesByDir[face.dir].push(face);
        }

        for (const dir in facesByDir) {
            const faces = facesByDir[dir];
            const visited = new Set();

            faces.sort((a, b) => {
                if (a.z !== b.z) return a.z - b.z;
                if (a.y !== b.y) return a.y - b.y;
                return a.x - b.x;
            });

            for (const face of faces) {
                const key = `${face.x},${face.y},${face.z}`;
                if (visited.has(key)) continue;

                let width = 1;
                let height = 1;

                let axis1, axis2;
                if (dir === 'px' || dir === 'nx') {
                    axis1 = 'z';
                    axis2 = 'y';
                } else if (dir === 'py' || dir === 'ny') {
                    axis1 = 'z';
                    axis2 = 'x';
                } else {
                    axis1 = 'x';
                    axis2 = 'y';
                }

                while (true) {
                    const nextFace = faces.find(f =>
                        f[axis1] === face[axis1] + width &&
                        f[axis2] === face[axis2] &&
                        f[GreedyMesher.getThirdAxis(axis1, axis2)] === face[GreedyMesher.getThirdAxis(axis1, axis2)] &&
                        f.color === face.color &&
                        !visited.has(`${f.x},${f.y},${f.z}`)
                    );
                    if (!nextFace) break;
                    width++;
                }

                outerLoop: while (true) {
                    for (let i = 0; i < width; i++) {
                        const testPos = {};
                        testPos[axis1] = face[axis1] + i;
                        testPos[axis2] = face[axis2] + height;
                        testPos[GreedyMesher.getThirdAxis(axis1, axis2)] = face[GreedyMesher.getThirdAxis(axis1, axis2)];

                        const nextFace = faces.find(f =>
                            f.x === testPos.x &&
                            f.y === testPos.y &&
                            f.z === testPos.z &&
                            f.color === face.color &&
                            !visited.has(`${f.x},${f.y},${f.z}`)
                        );
                        if (!nextFace) break outerLoop;
                    }
                    height++;
                }

                for (let h = 0; h < height; h++) {
                    for (let w = 0; w < width; w++) {
                        const pos = {};
                        pos[axis1] = face[axis1] + w;
                        pos[axis2] = face[axis2] + h;
                        pos[GreedyMesher.getThirdAxis(axis1, axis2)] = face[GreedyMesher.getThirdAxis(axis1, axis2)];
                        visited.add(`${pos.x},${pos.y},${pos.z}`);
                    }
                }

                mergedQuads.push({
                    x: face.x,
                    y: face.y,
                    z: face.z,
                    width,
                    height,
                    dir: face.dir,
                    color: face.color,
                    axis1,
                    axis2
                });
            }
        }

        return mergedQuads;
    }

    static getThirdAxis(axis1, axis2) {
        if ((axis1 === 'x' && axis2 === 'y') || (axis1 === 'y' && axis2 === 'x')) return 'z';
        if ((axis1 === 'x' && axis2 === 'z') || (axis1 === 'z' && axis2 === 'x')) return 'y';
        return 'x';
    }
}
