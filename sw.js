const CACHE_NAME = 'map-pwa-v1.3';

const ASSETS_TO_CACHE = [
    './',
    './map.html',
    './msk.js',
    './sk.js',
    './webfonts/all.min.css',
    './webfonts/proj4.js',
    './webfonts/xlsx.full.min.js',
    './webfonts/jszip.min.js',
    './webfonts/html2canvas.min.js',
    './webfonts/FileSaver.min.js',
    './webfonts/supabase-js@2.js',
    './webfonts/heic2any.min.js',
    './webfonts/full.umd.js',
    './webfonts/index.js',
    './webfonts/turf.min.js',
    './app/map/3d-viewer.js',
    './app/map/export-html-map.js',
    './app/map/schema-generator.js?v=2.0',
    './app/map/pzz-module.js',
    './img/map.png',
    './img/icon.svg',
    './img/icon-192.png',
    './img/icon-512.png',
    './img/menu.png',
    './img/history.png',
    './img/find.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.hostname.includes('nspd.gov.ru') || 
        url.hostname.includes('supabase.co') || 
        url.hostname.includes('mapruapp.ru') ||
        url.hostname.includes('googleapis.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque') && event.request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./map.html') || caches.match('map.html') || caches.match('./');
                }
                return cachedResponse;
            });

            return cachedResponse || fetchPromise;
        })
    );
});