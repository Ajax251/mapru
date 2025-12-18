// sw.js
const CACHE_NAME = 'cloud-app-v3';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ловим отправку файла
    if (url.pathname.includes('share-target') && event.request.method === 'POST') {
        event.respondWith(
            (async () => {
                try {
                    // Пытаемся получить данные
                    const formData = await event.request.formData();
                    const file = formData.get('media');

                    if (file) {
                        // Сохраняем в IDB
                        await saveFileToDB(file);
                        // УСПЕХ: Редирект с флагом успеха
                        return Response.redirect('./index.html?action=shared&status=ok', 303);
                    }
                } catch (err) {
                    console.error('SW Error:', err);
                    // ОШИБКА: Редирект с флагом ошибки (чтобы не зависло)
                    return Response.redirect('./index.html?action=error&msg=' + encodeURIComponent(err.message), 303);
                }

                // ЕСЛИ ФАЙЛА НЕТ: Просто редирект
                return Response.redirect('./index.html', 303);
            })()
        );
    }
});

function saveFileToDB(file) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('CloudShareDB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { autoIncrement: true });
        };
        req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').add(file);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve(); // Всегда resolve, чтобы не ломать поток
        };
        req.onerror = () => resolve();
    });
}