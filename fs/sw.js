const CACHE_NAME = 'cloud-app-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Сразу активируем новый SW
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // Немедленно берем контроль над страницей
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Перехватываем POST запрос от Android (Share Target)
    // Используем includes, чтобы сработать даже если путь чуть отличается
    if (url.pathname.includes('share-target') && event.request.method === 'POST') {
        event.respondWith(
            (async () => {
                try {
                    const formData = await event.request.formData();
                    const file = formData.get('media'); // Имя поля из manifest.json

                    if (file) {
                        // Сохраняем файл в базу данных браузера
                        await saveFileToDB(file);
                        // Редирект с флагом успеха
                        return Response.redirect('./index.html?action=shared', 303);
                    }
                } catch (err) {
                    console.error('Share error:', err);
                }
                
                // Даже если ошибка или файла нет - редиректим, чтобы телефон не завис
                return Response.redirect('./index.html?action=error', 303);
            })()
        );
    }
});

// --- Вспомогательная функция: IndexedDB ---
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
            tx.onerror = () => resolve(); // Не реджектим, чтобы не ломать редирект
        };
        request.onerror = () => resolve();
    });
}