
const CACHE_NAME = 'polymir-v7-loading-workflow';
const CACHE_URLS = [
    './src/lib/three.module.js',
    './src/app/Game.js',
    './src/spatial/Chunk.js',
    './src/geometry/voxel/VoxelRenderer.js',
    './polymir_logo.svg'
];


self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching critical resources');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => self.skipWaiting()) 
    );
});


self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim()) 
    );
});


self.addEventListener('fetch', (event) => {
    
    if (event.request.method !== 'GET') return;

    
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('[Service Worker] Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                
                return fetch(event.request).then((response) => {
                    
                    if (!response || response.status !== 200 || response.type === 'error') {
                        return response;
                    }

                    
                    if (event.request.url.match(/\.(js|css|svg|png|jpg|woff2?)$/)) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }

                    return response;
                });
            })
    );
});
