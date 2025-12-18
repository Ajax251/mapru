const CACHE_NAME = 'cloud-app-v6';
const DB_NAME = 'CloudShareDB';
const DB_VERSION = 1; // Сбрасываем на 1 после удаления!

self.addEventListener('install', (event) => {
    console.log('SW: Install');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('SW: Activate');
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Чистим старые кэши
            caches.keys().then(keys => 
                Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
            )
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.includes('share-target') && event.request.method === 'POST') {
        console.log('SW: Share target');
        event.respondWith(handleShare(event.request));
    }
});

async function handleShare(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('media');
        
        console.log('SW: File:', file?.name, file?.size);

        if (file && file.size > 0) {
            // Читаем файл
            const buffer = await file.arrayBuffer();
            console.log('SW: Buffer size:', buffer.byteLength);
            
            // Сохраняем
            const saved = await saveFile({
                name: file.name,
                type: file.type || 'application/octet-stream',
                data: buffer
            });
            
            if (saved) {
                return Response.redirect('./index.html?shared=1&t=' + Date.now(), 303);
            }
        }
        
        return Response.redirect('./index.html?shared=0', 303);
        
    } catch (err) {
        console.error('SW Error:', err);
        return Response.redirect('./index.html?error=' + encodeURIComponent(err.message), 303);
    }
}

function saveFile(fileData) {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            
            req.onupgradeneeded = (e) => {
                console.log('SW: DB upgrade');
                const db = e.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { autoIncrement: true });
                }
            };
            
            req.onsuccess = (e) => {
                console.log('SW: DB open ok');
                const db = e.target.result;
                
                try {
                    const tx = db.transaction('files', 'readwrite');
                    tx.objectStore('files').add(fileData);
                    tx.oncomplete = () => {
                        console.log('SW: Saved!');
                        db.close();
                        resolve(true);
                    };
                    tx.onerror = () => {
                        db.close();
                        resolve(false);
                    };
                } catch (e) {
                    db.close();
                    resolve(false);
                }
            };
            
            req.onerror = () => {
                console.error('SW: DB error');
                resolve(false);
            };
            
        } catch (e) {
            resolve(false);
        }
    });
}