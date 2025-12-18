// sw.js
const CACHE_NAME = 'cloud-app-v4';

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
        event.respondWith(handleShareTarget(event.request));
    }
});

async function handleShareTarget(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('media');
        
        // Также проверяем другие возможные поля
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const shareUrl = formData.get('url') || '';

        if (file && file.size > 0) {
            // ВАЖНО: Читаем содержимое файла в ArrayBuffer СЕЙЧАС,
            // пока File объект еще "живой"
            const arrayBuffer = await file.arrayBuffer();
            
            // Сохраняем данные + метаинформацию
            await saveFileToDB({
                name: file.name || `shared_${Date.now()}`,
                type: file.type || 'application/octet-stream',
                size: file.size,
                data: arrayBuffer,  // Бинарные данные
                timestamp: Date.now()
            });
            
            return Response.redirect('./index.html?action=shared&status=ok', 303);
        }
        
        // Если файла нет, но есть текст/URL - можно обработать как заметку
        if (text || shareUrl) {
            await saveTextToDB({
                title: title,
                text: text,
                url: shareUrl,
                timestamp: Date.now()
            });
            return Response.redirect('./index.html?action=shared&status=text', 303);
        }
        
        return Response.redirect('./index.html?action=shared&status=empty', 303);
        
    } catch (err) {
        console.error('SW Share Error:', err);
        return Response.redirect('./index.html?action=error&msg=' + encodeURIComponent(err.message || 'Unknown error'), 303);
    }
}

function saveFileToDB(fileData) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('CloudShareDB', 2); // Увеличиваем версию!
        
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Удаляем старое хранилище если есть
            if (db.objectStoreNames.contains('files')) {
                db.deleteObjectStore('files');
            }
            // Создаём новое с правильной структурой
            db.createObjectStore('files', { autoIncrement: true });
            
            // Для текстовых данных
            if (!db.objectStoreNames.contains('texts')) {
                db.createObjectStore('texts', { autoIncrement: true });
            }
        };
        
        req.onsuccess = (e) => {
            try {
                const db = e.target.result;
                const tx = db.transaction('files', 'readwrite');
                const store = tx.objectStore('files');
                store.add(fileData);
                tx.oncomplete = () => {
                    console.log('SW: File saved to DB');
                    resolve();
                };
                tx.onerror = (err) => {
                    console.error('SW: TX Error', err);
                    resolve(); // Не reject, чтобы редирект прошел
                };
            } catch (err) {
                console.error('SW: DB Operation Error', err);
                resolve();
            }
        };
        
        req.onerror = (err) => {
            console.error('SW: DB Open Error', err);
            resolve();
        };
    });
}

function saveTextToDB(textData) {
    return new Promise((resolve) => {
        const req = indexedDB.open('CloudShareDB', 2);
        req.onsuccess = (e) => {
            try {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('texts')) {
                    resolve();
                    return;
                }
                const tx = db.transaction('texts', 'readwrite');
                tx.objectStore('texts').add(textData);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (err) {
                resolve();
            }
        };
        req.onerror = () => resolve();
    });
}