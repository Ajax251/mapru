// sw.js
const CACHE_NAME = 'cloud-app-v5';
const DB_NAME = 'CloudShareDB';
const DB_VERSION = 3; // Увеличиваем версию!

self.addEventListener('install', (event) => {
    console.log('SW: Installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('SW: Activating...');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.includes('share-target') && event.request.method === 'POST') {
        console.log('SW: Share target hit!');
        event.respondWith(handleShareTarget(event.request));
    }
});

async function handleShareTarget(request) {
    console.log('SW: Processing share...');
    
    try {
        const formData = await request.formData();
        const file = formData.get('media');
        
        console.log('SW: Got file:', file ? file.name : 'none', file ? file.size : 0);

        if (file && file.size > 0) {
            const arrayBuffer = await file.arrayBuffer();
            console.log('SW: Read', arrayBuffer.byteLength, 'bytes');
            
            await saveFileToDB({
                name: file.name || `shared_${Date.now()}`,
                type: file.type || 'application/octet-stream',
                size: file.size,
                data: arrayBuffer,
                timestamp: Date.now()
            });
            
            console.log('SW: File saved, redirecting...');
            return Response.redirect('./index.html?action=shared&status=ok&t=' + Date.now(), 303);
        }
        
        console.log('SW: No file in form data');
        return Response.redirect('./index.html?action=shared&status=empty', 303);
        
    } catch (err) {
        console.error('SW Error:', err);
        return Response.redirect('./index.html?action=error&msg=' + encodeURIComponent(err.message), 303);
    }
}

function saveFileToDB(fileData) {
    return new Promise((resolve, reject) => {
        console.log('SW: Opening DB...');
        
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        
        req.onupgradeneeded = (e) => {
            console.log('SW: DB Upgrade from', e.oldVersion, 'to', e.newVersion);
            const db = e.target.result;
            
            // Удаляем старые stores
            if (db.objectStoreNames.contains('files')) {
                db.deleteObjectStore('files');
            }
            if (db.objectStoreNames.contains('texts')) {
                db.deleteObjectStore('texts');
            }
            
            // Создаём новые
            db.createObjectStore('files', { autoIncrement: true });
            console.log('SW: Created files store');
        };
        
        req.onsuccess = (e) => {
            console.log('SW: DB Opened');
            const db = e.target.result;
            
            try {
                const tx = db.transaction('files', 'readwrite');
                const store = tx.objectStore('files');
                
                const addReq = store.add(fileData);
                
                addReq.onsuccess = () => {
                    console.log('SW: File added to store');
                };
                
                tx.oncomplete = () => {
                    console.log('SW: Transaction complete');
                    db.close();
                    resolve();
                };
                
                tx.onerror = (err) => {
                    console.error('SW: TX Error:', err);
                    db.close();
                    resolve(); // resolve anyway to allow redirect
                };
            } catch (err) {
                console.error('SW: Store error:', err);
                db.close();
                resolve();
            }
        };
        
        req.onerror = (e) => {
            console.error('SW: DB Error:', e.target.error);
            resolve(); // resolve anyway
        };
        
        req.onblocked = () => {
            console.warn('SW: DB Blocked');
            resolve();
        };
    });
}