const CACHE_NAME = 'cloud-app-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Перехватываем отправку файла через "Поделиться"
    if (url.pathname.endsWith('/share-target') && event.request.method === 'POST') {
        event.respondWith(
            (async () => {
                const formData = await event.request.formData();
                const file = formData.get('media'); // Имя поля из manifest.json

                if (file) {
                    // Сохраняем файл в IndexedDB, чтобы забрать его на главной странице
                    await saveFileToDB(file);
                }

                // Перенаправляем пользователя обратно в приложение
                return Response.redirect('./index.html?action=shared', 303);
            })()
        );
    }
});

// --- HELPER: IndexedDB для Service Worker ---
function saveFileToDB(file) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('CloudShareDB', 1);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files', { autoIncrement: true });
            }
        };

        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('files', 'readwrite');
            const store = tx.objectStore('files');
            store.add(file);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject();
        };
        request.onerror = reject;
    });
}