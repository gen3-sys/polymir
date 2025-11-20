export class WorldCache {
    constructor(dbName = 'PolymirCache', version = 2) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('chunks')) {
                    db.createObjectStore('chunks', { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains('meshes')) {
                    db.createObjectStore('meshes', { keyPath: 'key' });
                }

                
                if (!db.objectStoreNames.contains('mvox_files')) {
                    const mvoxStore = db.createObjectStore('mvox_files', { keyPath: 'id' });
                    mvoxStore.createIndex('type', 'type', { unique: false });
                    mvoxStore.createIndex('author', 'author', { unique: false });
                }

                
                if (!db.objectStoreNames.contains('schematics')) {
                    const schematicStore = db.createObjectStore('schematics', { keyPath: 'id' });
                    schematicStore.createIndex('type', 'type', { unique: false });
                    schematicStore.createIndex('name', 'name', { unique: false });
                }
            };
        });
    }

    async saveChunks(chunks, worldId) {
        const transaction = this.db.transaction(['chunks'], 'readwrite');
        const store = transaction.objectStore('chunks');

        const chunkArray = Array.from(chunks.entries()).map(([key, data]) => ({
            key: `${worldId}_${key}`,
            voxels: Array.from(data.voxels.entries())
        }));

        for (const chunk of chunkArray) {
            store.put(chunk);
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async loadChunks(worldId) {
        const transaction = this.db.transaction(['chunks'], 'readonly');
        const store = transaction.objectStore('chunks');
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const chunks = new Map();
                for (const item of request.result) {
                    if (item.key.startsWith(`${worldId}_`)) {
                        const key = item.key.substring(worldId.length + 1);
                        chunks.set(key, {
                            voxels: new Map(item.voxels)
                        });
                    }
                }
                resolve(chunks.size > 0 ? chunks : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async saveMesh(key, geometryData, worldId) {
        const transaction = this.db.transaction(['meshes'], 'readwrite');
        const store = transaction.objectStore('meshes');

        store.put({
            key: `${worldId}_${key}`,
            vertices: Array.from(geometryData.vertices),
            normals: Array.from(geometryData.normals),
            colors: Array.from(geometryData.colors)
        });

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async loadMesh(key, worldId) {
        const transaction = this.db.transaction(['meshes'], 'readonly');
        const store = transaction.objectStore('meshes');
        const request = store.get(`${worldId}_${key}`);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    resolve({
                        vertices: new Float32Array(request.result.vertices),
                        normals: new Float32Array(request.result.normals),
                        colors: new Float32Array(request.result.colors)
                    });
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clear() {
        const transaction = this.db.transaction(['chunks', 'meshes', 'mvox_files', 'schematics'], 'readwrite');
        transaction.objectStore('chunks').clear();
        transaction.objectStore('meshes').clear();
        transaction.objectStore('mvox_files').clear();
        transaction.objectStore('schematics').clear();

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    

    async saveMVox(id, data, type, metadata = {}) {
        const transaction = this.db.transaction(['mvox_files'], 'readwrite');
        const store = transaction.objectStore('mvox_files');

        store.put({
            id,
            type,
            data: Array.from(data),
            author: metadata.author || 'local',
            name: metadata.name || 'Untitled',
            created: metadata.created || Date.now(),
            size: data.length,
            ...metadata
        });

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async loadMVox(id) {
        const transaction = this.db.transaction(['mvox_files'], 'readonly');
        const store = transaction.objectStore('mvox_files');
        const request = store.get(id);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (request.result) {
                    resolve(new Uint8Array(request.result.data));
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async listMVox(type = null) {
        const transaction = this.db.transaction(['mvox_files'], 'readonly');
        const store = transaction.objectStore('mvox_files');

        const request = type
            ? store.index('type').getAll(type)
            : store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const results = request.result.map(item => ({
                    id: item.id,
                    type: item.type,
                    name: item.name,
                    author: item.author,
                    created: item.created,
                    size: item.size
                }));
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteMVox(id) {
        const transaction = this.db.transaction(['mvox_files'], 'readwrite');
        const store = transaction.objectStore('mvox_files');
        store.delete(id);

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    

    async addSchematic(id, mvoxId, metadata = {}) {
        const transaction = this.db.transaction(['schematics'], 'readwrite');
        const store = transaction.objectStore('schematics');

        store.put({
            id,
            mvox_id: mvoxId,
            type: metadata.type || 'build',
            name: metadata.name || 'Untitled',
            author: metadata.author || 'unknown',
            acquired: Date.now(),
            cost: metadata.cost || 0,
            ...metadata
        });

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getSchematics() {
        const transaction = this.db.transaction(['schematics'], 'readonly');
        const store = transaction.objectStore('schematics');
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async removeSchematic(id) {
        const transaction = this.db.transaction(['schematics'], 'readwrite');
        const store = transaction.objectStore('schematics');
        store.delete(id);

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}
