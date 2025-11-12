export class ShaderLoader {
    static async loadShader(path) {
        
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch(path + cacheBuster, {
            cache: 'no-store'
        });
        return await response.text();
    }

    static async loadShaderPair(vertPath, fragPath) {
        const [vert, frag] = await Promise.all([
            this.loadShader(vertPath),
            this.loadShader(fragPath)
        ]);
        return { vert, frag };
    }

    static async loadAll(shaderPairs) {
        const results = {};
        const promises = Object.entries(shaderPairs).map(async ([key, paths]) => {
            results[key] = await this.loadShaderPair(paths.vert, paths.frag);
        });
        await Promise.all(promises);
        return results;
    }
}
