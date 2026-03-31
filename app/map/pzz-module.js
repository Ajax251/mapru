// ==========================================

console.log("[PZZ Module] Модуль успешно загружен");

// Базовый URL для нового API
const PZZ_API_BASE = 'https://mapruapp.ru/api/pzz';

// --- 1. Работа с базой данных (Fetch API) ---

async function getPzzDataByRegNumber(regNumber) {
    if (!regNumber) {
        console.warn("[PZZ DB] Пропуск запроса данных: нет номера");
        return null;
    }
    console.log(`[PZZ DB] Запрашиваем полные данные для ${regNumber}...`);
    try {
        const response = await fetch(`${PZZ_API_BASE}/get?reg_number=${encodeURIComponent(regNumber)}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const data = await response.json();
        console.log(`[PZZ DB] Ответ от базы для ${regNumber}:`, data ? "Данные найдены" : "Данные отсутствуют");
        return data; // Если ничего не найдено, сервер вернет null
    } catch (err) {
        console.error("[PZZ DB] Ошибка получения данных ПЗЗ:", err);
        return null;
    }
}

async function findPzzByPointDatabase(pointX, pointY) {
    console.log(`[PZZ DB] Поиск в БД по точке X=${pointX}, Y=${pointY}...`);
    try {
        const response = await fetch(`${PZZ_API_BASE}/point?point_x=${pointX}&point_y=${pointY}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const data = await response.json();
        console.log(`[PZZ DB] Найдено объектов по точке: ${data ? data.length : 0}`);
        return data || [];
    } catch (err) {
        console.error("[PZZ DB] Ошибка поиска ПЗЗ по точке:", err);
        return null;
    }
}

async function savePzzToDatabaseFull(payload) {
    console.log("[PZZ DB] Отправка данных на сохранение:", { ...payload, regulations_json: payload.regulations_json ? "(JSON Data)" : "null" });
    try {
        const response = await fetch(`${PZZ_API_BASE}/upsert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        
        if (result.success) {
            console.log("[PZZ DB] Сохранение успешно завершено");
            return true;
        } else {
            throw new Error(result.error || "Неизвестная ошибка сервера");
        }
    } catch (err) {
        console.error("[PZZ DB] Ошибка сохранения ПЗЗ:", err);
        return false;
    }
}

// --- 2. Обработка клика по карте ---

async function handlePzzAction(lat, lon) {
    console.log(`[PZZ Action] Запуск поиска ПЗЗ по координатам: lat=${lat}, lon=${lon}`);
    if (typeof showLoader === 'function') showLoader("Поиск ПЗЗ...");
    
    let targetRegNumber = null;
    let targetName = null;
    let targetGeometry = null;
    let isFromDb = false;
    let isAlreadyOnMap = false;

    try {
        const clickPt = turf.point([lon, lat]);
        let mapCandidates = [];

        console.log("[PZZ Action] Этап 1: Поиск среди уже отрисованных объектов на карте...");
        if (typeof polygons !== 'undefined') {
            polygons.forEach(obj => {
                if (obj instanceof ymaps.Polygon) {
                    const props = obj.properties.get('featureData')?.properties || {};
                    const catId = props.category;
                    const catName = (props.categoryName || '').toLowerCase();
                    const strokeColor = obj.options.get('strokeColor');
                    
                    if (catId === 36278 || catName.includes('муниципальные образования') || strokeColor === '#FFA500' || strokeColor === '#FF1493') {
                        try {
                            const coords = obj.geometry.getCoordinates()[0];
                            const turfPoly = turf.polygon([coords.map(c => [c[1], c[0]])]);
                            if (turf.booleanPointInPolygon(clickPt, turfPoly)) {
                                mapCandidates.push({ obj, area: turf.area(turfPoly) });
                            }
                        } catch (e) {
                            if (obj.geometry.contains([lat, lon])) {
                                mapCandidates.push({ obj, area: Infinity }); 
                            }
                        }
                    }
                }
            });
        }

        if (mapCandidates.length > 0) {
            console.log(`[PZZ Action] Найдено ${mapCandidates.length} объектов под курсором на карте.`);
            mapCandidates.sort((a, b) => a.area - b.area);
            const bestObj = mapCandidates[0].obj;
            const fd = bestObj.properties.get('featureData');
            
            targetRegNumber = fd?.properties?.label || bestObj.properties.get('cadastralNumber') || "Без номера";
            targetName = fd?.properties?.descr || "Без названия";
            targetGeometry = fd?.geometry;
            isAlreadyOnMap = true;
        } else {
            console.log("[PZZ Action] На карте объектов нет. Этап 2: Поиск в базе данных сервера...");
            const centerPoint = typeof toEPSG3857 === 'function' ? toEPSG3857(lat, lon) : null;
            if (centerPoint) {
                // Изменен вызов на новую функцию API
                const dbDataList = await findPzzByPointDatabase(centerPoint.x, centerPoint.y);
                
                if (dbDataList && dbDataList.length > 0) {
                    console.log(`[PZZ Action] Объект найден в БД: ${dbDataList[0].reg_number}`);
                    let bestDbItem = dbDataList[0];
                    let minArea = Infinity;
                    dbDataList.forEach(item => {
                        try {
                            const tGeom = item.geometry.type === 'Polygon' ? turf.polygon(item.geometry.coordinates) : turf.multiPolygon(item.geometry.coordinates);
                            const a = turf.area(tGeom);
                            if (a < minArea) { minArea = a; bestDbItem = item; }
                        } catch(e) {}
                    });

                    targetRegNumber = bestDbItem.reg_number;
                    targetName = bestDbItem.name;
                    targetGeometry = bestDbItem.geometry;
                    isFromDb = true;
                }
            }

            if (!targetRegNumber) {
                console.log("[PZZ Action] В БД пусто. Этап 3: Запрос к API NSPD (Муниципальные образования)...");
                if (typeof queryMunicipalInfo === 'function') {
                    const apiData = await queryMunicipalInfo(lat, lon);
                    if (apiData && apiData.features && apiData.features.length > 0) {
                        console.log(`[PZZ Action] Объект найден в API: ${apiData.features[0].properties.label}`);
                        let bestApiItem = apiData.features[0];
                        let minArea = Infinity;
                        apiData.features.forEach(item => {
                            try {
                                const tGeom = item.geometry.type === 'Polygon' ? turf.polygon(item.geometry.coordinates) : turf.multiPolygon(item.geometry.coordinates);
                                const a = turf.area(tGeom);
                                if (a < minArea) { minArea = a; bestApiItem = item; }
                            } catch(e){}
                        });
                        
                        targetRegNumber = bestApiItem.properties.label || "Без номера";
                        targetName = bestApiItem.properties.descr || "Без названия";
                        targetGeometry = bestApiItem.geometry;
                    }
                }
            }
        }

        if (!targetRegNumber || !targetGeometry) {
            console.warn("[PZZ Action] Поиск завершился неудачно: объект не найден нигде.");
            if (typeof showNotification === 'function') showNotification('Муниципальное образование не найдено', 'warning');
            return;
        }

        console.log(`[PZZ Action] Итоговый объект определен: ${targetRegNumber} - ${targetName}. Запрос дополнительных данных...`);
        const pzzData = await getPzzDataByRegNumber(targetRegNumber);

        if (!isAlreadyOnMap) {
            console.log("[PZZ Action] Отрисовка контура на карте...");
            drawPzzPolygon(targetGeometry, targetRegNumber, targetName, isFromDb);
        } else {
            console.log("[PZZ Action] Объект уже на карте, пропуск отрисовки.");
        }

        console.log("[PZZ Action] Вызов модального окна ПЗЗ...");
        showPzzModal(targetRegNumber, targetName, pzzData, targetGeometry);

    } catch (error) {
        console.error("[PZZ Action] КРИТИЧЕСКАЯ ОШИБКА:", error);
        if (typeof showNotification === 'function') showNotification("Ошибка обработки ПЗЗ", "error");
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

// Отрисовка на карте
function drawPzzPolygon(geometryGeoJSON, regNumber, moName, isFromDatabase) {
    console.log("[PZZ Draw] Старт отрисовки полигона");
    if (typeof map === 'undefined' || !map || !geometryGeoJSON || !geometryGeoJSON.coordinates) {
        console.error("[PZZ Draw] Отмена: нет карты или геометрии");
        return;
    }

    let combinedBounds = null;
    const labelContent = `${regNumber} - ${moName}`;
    const strokeColor = isFromDatabase ? '#FF1493' : '#FFA500';
    const strokeStyle = isFromDatabase ? 'dash' : 'solid';
    const presetStyle = isFromDatabase ? 'islands#pinkStretchyIcon' : 'islands#orangeStretchyIcon';

    const polygonsCoords = geometryGeoJSON.type === 'MultiPolygon' ? geometryGeoJSON.coordinates : [geometryGeoJSON.coordinates];

    for (let polygonIndex = 0; polygonIndex < polygonsCoords.length; polygonIndex++) {
        const polygonCoords = polygonsCoords[polygonIndex];
        
        for (let contourIndex = 0; contourIndex < polygonCoords.length; contourIndex++) {
            const contour = polygonCoords[contourIndex];
            if (!Array.isArray(contour)) continue;

            const coords = [];
            for (const coord of contour) {
                if (!Array.isArray(coord) || coord.length !== 2) continue;
                try {
                    const point = proj4('EPSG:3857', 'EPSG:4326', coord);
                    if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
                        coords.push([point[1], point[0]]); 
                    }
                } catch (e) {}
            }

            if (coords.length >= 3) { 
                const offsetCoords = coords.map(coord => [
                    coord[0] - (typeof mapOffsetY !== 'undefined' ? mapOffsetY : -1) * 0.000008983,
                    coord[1] - (typeof mapOffsetX !== 'undefined' ? mapOffsetX : -4.5) * 0.000008983
                ]);

                const isValid = offsetCoords.every(c => isFinite(c[0]) && isFinite(c[1]));
                if (!isValid) continue;

                const pWidth = typeof polygonStyle !== 'undefined' ? polygonStyle.width + 1 : 4;

                const polygonObj = new ymaps.Polygon([offsetCoords], {
                    cadastralNumber: regNumber,
                    hintContent: labelContent,
                    featureData: {
                        geometry: geometryGeoJSON,
                        properties: { category: 36278, label: regNumber, descr: moName }
                    }
                }, {
                    strokeColor: strokeColor,
                    strokeWidth: pWidth,
                    strokeStyle: strokeStyle,
                    strokeOpacity: 0.9,
                    fillColor: `${strokeColor}33`,
                    interactivityModel: 'default#transparent'
                });

                map.geoObjects.add(polygonObj);
                if (typeof polygons !== 'undefined') polygons.push(polygonObj);

                const bounds = polygonObj.geometry.getBounds();
                if (bounds) {
                    if (!combinedBounds) combinedBounds = bounds;
                    else {
                        combinedBounds[0][0] = Math.min(combinedBounds[0][0], bounds[0][0]);
                        combinedBounds[0][1] = Math.min(combinedBounds[0][1], bounds[0][1]);
                        combinedBounds[1][0] = Math.max(combinedBounds[1][0], bounds[1][0]);
                        combinedBounds[1][1] = Math.max(combinedBounds[1][1], bounds[1][1]);
                    }
                }
            }
        }
    }

    if (combinedBounds) {
        map.setBounds(combinedBounds, { checkZoomRange: true, duration: 400 });
        
        const centerGeo = [(combinedBounds[0][0] + combinedBounds[1][0]) / 2, (combinedBounds[0][1] + combinedBounds[1][1]) / 2];
        const moTextPlacemark = new ymaps.Placemark(centerGeo, {
            iconContent: labelContent,
            hintContent: isFromDatabase ? "ПЗЗ " : "ПЗЗ"
        }, {
            preset: presetStyle,
            draggable: true
        });

        map.geoObjects.add(moTextPlacemark);
        if (typeof polygons !== 'undefined') polygons.push(moTextPlacemark);
        
        if (typeof getAddressByCoords === 'function') {
            getAddressByCoords(centerGeo).then(address => {
                const cityDisp = document.getElementById('city-name-display');
                if(cityDisp) cityDisp.innerHTML = address;
            });
        }
    }
    console.log("[PZZ Draw] Отрисовка завершена");
}

// --- 3. Модальное окно ПЗЗ ---

function showPzzModal(regNumber, moName, pzzData, geometryGeoJSON) {
    console.log(`[PZZ Modal] Инициализация окна для ${regNumber}`);
    const existingModal = document.getElementById('pzz-modal');
    if (existingModal) {
        console.log("[PZZ Modal] Удаление старого окна");
        existingModal.remove();
    }

    pzzData = pzzData || {};
    const currentLink = pzzData.pzz_link || '';
    const docDate = pzzData.doc_date || '';
    const docNumber = pzzData.doc_number || '';
    const docName = pzzData.doc_name || '';
    
    let hasJson = false;
    let existingJsonData = null;
    
    if (pzzData.regulations_json) {
        try {
            existingJsonData = typeof pzzData.regulations_json === 'string' 
                ? JSON.parse(pzzData.regulations_json) 
                : pzzData.regulations_json;
                
            if (Array.isArray(existingJsonData) && existingJsonData.length > 0) {
                hasJson = true;
                console.log("[PZZ Modal] JSON регламентов успешно загружен и распарсен");
            }
        } catch(e) {
            console.error("[PZZ Modal] Ошибка парсинга сохраненного JSON:", e);
        }
    } else {
        console.log("[PZZ Modal] JSON регламентов отсутствует в БД");
    }

    const modal = document.createElement('div');
    modal.id = 'pzz-modal';
    modal.className = 'color-modal';
    modal.style.width = '450px';
    modal.style.maxWidth = '95vw';
    modal.style.zIndex = '20000';
    modal.style.display = 'block'; 

    modal.innerHTML = `
        <div class="color-modal-content" style="padding: 20px; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; max-height: 85vh;">
            
            <div style="text-align: center; border-bottom: 2px solid #0288D1; padding-bottom: 10px;">
                <i class="fas fa-book" style="font-size: 2rem; color: #0288D1; margin-bottom: 10px;"></i>
                <h3 style="margin: 0; color: #1e293b; font-size: 1.2rem;">${regNumber}</h3>
                <p style="margin: 5px 0 0 0; color: #475569; font-size: 0.95rem; font-weight: 500;">${moName}</p>
            </div>

            ${hasJson ? `
                <button id="btn-pzz-viewer" style="width: 100%; padding: 12px; border: none; border-radius: 8px; background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; cursor: pointer; font-weight: bold; font-size: 1rem; box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3); transition: transform 0.2s;">
                    <i class="fas fa-table" style="margin-right: 5px;"></i> Просмотр градостроительных регламентов
                </button>
            ` : ''}

            <div style="display: flex; flex-direction: column; width: 100%;">
                <label style="font-size: 0.85rem; color: #64748b; margin-bottom: 5px; font-weight: 600;">Ссылка на документ ПЗЗ:</label>
                <input type="text" id="pzz-link-input" value="${currentLink}" placeholder="https://..." 
                       style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; font-size: 0.95rem; box-sizing: border-box;">
            </div>

            <button id="btn-pzz-expand" style="background: transparent; border: 1px dashed #cbd5e1; color: #3b82f6; padding: 8px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 5px;">
                <span>Реквизиты и данные JSON</span> <i class="fas fa-chevron-down"></i>
            </button>

            <div id="pzz-extra-fields" style="display: none; flex-direction: column; gap: 10px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div>
                    <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Дата утверждения:</label>
                    <input type="text" id="pzz-date-input" value="${docDate}" placeholder="ДД.ММ.ГГГГ" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; box-sizing: border-box; font-size: 0.9rem;">
                </div>
                <div>
                    <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Номер документа:</label>
                    <input type="text" id="pzz-num-input" value="${docNumber}" placeholder="Введите номер" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; box-sizing: border-box; font-size: 0.9rem;">
                </div>
                <div>
                    <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Наименование документа:</label>
                    <textarea id="pzz-name-input" placeholder="Введите наименование" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; box-sizing: border-box; font-size: 0.9rem; resize: vertical; min-height: 60px;">${docName}</textarea>
                </div>
              <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <label style="font-size: 0.8rem; color: #64748b; font-weight: 600;">База регламентов (JSON файл):</label>
                        <button type="button" onclick="window.open('app/map/pzz_docx2json.html', '_blank')" style="background: #8b5cf6; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(139, 92, 246, 0.2);">
                            <i class="fas fa-file-word"></i> JSON из DOCX
                        </button>
                    </div>
                    <input type="file" id="pzz-json-input" accept=".json" style="font-size: 0.85rem; width: 100%;">
                    <div id="json-status" style="font-size: 0.75rem; color: ${hasJson ? '#10b981' : '#e74c3c'}; margin-top: 5px; font-weight: bold;">
                        ${hasJson ? '✓ В базе сохранен JSON с регламентами' : 'JSON файл не прикреплен'}
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button id="btn-pzz-go" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: ${currentLink ? '#10b981' : '#94a3b8'}; color: white; cursor: ${currentLink ? 'pointer' : 'not-allowed'}; font-weight: bold; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <i class="fas fa-external-link-alt"></i> Перейти
                </button>
                <button id="btn-pzz-save" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: #3b82f6; color: white; cursor: pointer; font-weight: bold; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <i class="fas fa-save"></i> Сохранить
                </button>
            </div>
            <button id="btn-pzz-cancel" style="width: 100%; background: transparent; border: 1px solid #cbd5e1; color: #64748b; padding: 8px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; margin-top: -5px;">Закрыть</button>
        </div>
    `;

    document.body.appendChild(modal);
    console.log("[PZZ Modal] Модальное окно добавлено в DOM");

    const stopProp = (e) => e.stopPropagation();
    modal.addEventListener('paste', stopProp);
    modal.addEventListener('keydown', stopProp);
    modal.addEventListener('keyup', stopProp);
    modal.addEventListener('keypress', stopProp);

    const inputs = modal.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.addEventListener('paste', stopProp);
        input.addEventListener('keydown', stopProp);
    });

    const linkInput = document.getElementById('pzz-link-input');
    const expandBtn = document.getElementById('btn-pzz-expand');
    const extraFields = document.getElementById('pzz-extra-fields');
    const fileInput = document.getElementById('pzz-json-input');
    const jsonStatus = document.getElementById('json-status');
    const goBtn = document.getElementById('btn-pzz-go');
    const saveBtn = document.getElementById('btn-pzz-save');
    const cancelBtn = document.getElementById('btn-pzz-cancel');
    const viewerBtn = document.getElementById('btn-pzz-viewer');

    let parsedJsonData = existingJsonData; 

    expandBtn.addEventListener('click', () => {
        if (extraFields.style.display === 'none') {
            extraFields.style.display = 'flex';
            expandBtn.innerHTML = `<span>Скрыть реквизиты</span> <i class="fas fa-chevron-up"></i>`;
        } else {
            extraFields.style.display = 'none';
            expandBtn.innerHTML = `<span>Реквизиты и данные JSON</span> <i class="fas fa-chevron-down"></i>`;
        }
    });

    linkInput.addEventListener('input', () => {
        const val = linkInput.value.trim();
        if (val.startsWith('http://') || val.startsWith('https://')) {
            goBtn.style.background = '#10b981';
            goBtn.style.cursor = 'pointer';
        } else {
            goBtn.style.background = '#94a3b8';
            goBtn.style.cursor = 'not-allowed';
        }
    });

    goBtn.addEventListener('click', () => {
        const url = linkInput.value.trim();
        if (url.startsWith('http://') || url.startsWith('https://')) {
            window.open(url, '_blank');
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            parsedJsonData = existingJsonData; 
            jsonStatus.textContent = existingJsonData ? '✓ Используется ранее сохраненный JSON' : 'JSON файл не прикреплен';
            jsonStatus.style.color = existingJsonData ? '#10b981' : '#e74c3c';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (Array.isArray(data) && data.length > 0 && data[0].id !== undefined && Array.isArray(data[0].uses)) {
                    parsedJsonData = data;
                    jsonStatus.textContent = '✓ Файл корректен и готов к сохранению';
                    jsonStatus.style.color = '#10b981';
                    console.log("[PZZ Modal] JSON загружен успешно. Зон найдено:", data.length);
                } else {
                    throw new Error('Несоответствие формату JSON (нужны id, name, uses)');
                }
            } catch (err) {
                console.error("[PZZ Modal] Ошибка валидации JSON файла:", err);
                parsedJsonData = null;
                fileInput.value = '';
                jsonStatus.textContent = '✗ Ошибка: Неверный формат JSON файла';
                jsonStatus.style.color = '#e74c3c';
            }
        };
        reader.readAsText(file);
    });

    saveBtn.addEventListener('click', async () => {
        console.log("[PZZ Modal] Нажата кнопка 'Сохранить'");
        const urlToSave = linkInput.value.trim();
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';

        const payload = {
            reg_number: regNumber,
            name: moName,
            pzz_link: urlToSave,
            geometry: geometryGeoJSON,
            doc_date: document.getElementById('pzz-date-input').value.trim(),
            doc_number: document.getElementById('pzz-num-input').value.trim(),
            doc_name: document.getElementById('pzz-name-input').value.trim(),
            regulations_json: parsedJsonData, 
            updated_at: new Date().toISOString()
        };

        // Изменен вызов на новую функцию API
        const success = await savePzzToDatabaseFull(payload);

        if (success) {
            if (typeof window.showNotification === 'function') window.showNotification('Данные ПЗЗ успешно сохранены', 'success');
            modal.remove();
        } else {
            if (typeof window.showNotification === 'function') window.showNotification('Ошибка при сохранении', 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
        }
    });

    if (viewerBtn) {
        viewerBtn.addEventListener('click', () => {
            console.log("[PZZ Modal] Нажата кнопка открытия просмотрщика регламентов");
            openPzzViewer(pzzData, regNumber, moName);
        });
    }
    const closeModal = () => {
        console.log("[PZZ Modal] Окно закрыто");
        modal.remove();
    };
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

// --- 4. ПОЛНОЭКРАННЫЙ ПРОСМОТРЩИК JSON ---
// (Оставлен без изменений, так как он работает с локальными данными)

function openPzzViewer(pzzData, regNumber, moName) {
    if (!pzzData || !pzzData.regulations_json) {
        if(typeof window.showNotification === 'function') window.showNotification('Нет данных JSON для отображения', 'warning');
        return;
    }

    const zonesData = typeof pzzData.regulations_json === 'string' ? JSON.parse(pzzData.regulations_json) : pzzData.regulations_json;
    
    const dName = pzzData.doc_name;
    const dNum = pzzData.doc_number;
    const dDate = pzzData.doc_date;
    const dLink = pzzData.pzz_link;

    const docMetaHtml = `
        <div class="viewer-doc-meta">
            <i class="fas fa-landmark meta-icon"></i>
            <div class="meta-content">
                <div class="meta-title" style="font-size: 1.15rem; color: #0f172a; margin-bottom: 6px;">
                    ${regNumber || 'Без номера'} — ${moName || 'Без названия'}
                </div>
                ${dName ? `<div style="font-size: 0.9rem; font-weight: 600; color: #475569; margin-bottom: 6px;">${dName}</div>` : ''}
                <div class="meta-details">
                    ${dNum ? `<span>№ ${dNum}</span>` : ''}
                    ${dDate ? `<span>от ${dDate}</span>` : ''}
                    ${dLink ? `<a href="${dLink}" target="_blank" class="meta-link"><i class="fas fa-external-link-alt"></i> Документ ПЗЗ/Проверить актуальность..</a>` : ''}
                </div>
            </div>
        </div>
    `;

    const newWin = window.open('', '_blank');
    if (!newWin) {
        alert("Пожалуйста, разрешите всплывающие окна в браузере для просмотра регламентов.");
        return;
    }

    const viewerHtml = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
           <title>${regNumber} — Градостроительные регламенты</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                body { margin: 0; padding: 0; font-family: sans-serif; background: #f1f5f9; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
                .viewer-header { background: #ffffff; padding: 15px 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; z-index: 10; }
                .viewer-title { font-size: 1.2rem; font-weight: bold; color: #2563eb; display: flex; align-items: center; gap: 10px; }
                .viewer-search { display: flex; gap: 20px; flex: 1; justify-content: center; }
                .search-box { display: flex; flex-direction: column; gap: 5px; width: 100%; max-width: 300px; }
                .search-box label { font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; }
                .search-box input { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.9rem; outline: none; }
                .search-box input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.2); }
                
                .viewer-doc-meta { background: #e0f2fe; border-bottom: 1px solid #bae6fd; padding: 10px 25px; display: flex; align-items: center; gap: 15px; }
                .meta-icon { font-size: 1.5rem; color: #0284c7; }
                .meta-content { display: flex; flex-direction: column; }
                .meta-title { font-weight: 600; color: #0f172a; font-size: 0.9rem; margin-bottom: 2px;}
                .meta-details { display: flex; gap: 15px; font-size: 0.8rem; color: #334155; align-items: center; }
                .meta-link { color: #0284c7; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #fff; border-radius: 4px; border: 1px solid #bae6fd; transition: 0.2s;}
                .meta-link:hover { background: #0284c7; color: white; }

                .viewer-body { display: flex; flex: 1; overflow: hidden; }
                .viewer-sidebar { width: 320px; background: #ffffff; border-right: 1px solid #e2e8f0; overflow-y: auto; }
                .viewer-item { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: 0.2s; }
                .viewer-item:hover { background: #eff6ff; }
                .viewer-item.active { background: #dbeafe; border-left: 4px solid #2563eb; }
                .viewer-item-id { font-weight: bold; font-size: 1.1rem; color: #2563eb; margin-bottom: 4px; }
                .viewer-item-name { font-size: 0.85rem; color: #475569; }
                
                .viewer-main { flex: 1; padding: 25px; overflow-y: auto; background: #f8fafc; }
                .viewer-empty { text-align: center; color: #64748b; margin-top: 15%; font-size: 1.1rem; }
                .viewer-table-container { background: #fff; border-radius: 8px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
                .viewer-badge { display: inline-block; background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; color: #475569; margin-bottom: 10px; }
                #viewer-zone-title { margin-top: 0; color: #1e293b; font-size: 1.4rem; margin-bottom: 20px; }
                
                .viewer-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
                .viewer-table th, .viewer-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                .viewer-table th { background: #f1f5f9; font-weight: 600; color: #334155; position: sticky; top: 0; z-index: 5;}
                .viewer-table tr:hover { background: #f8fafc; }
                .type-header { background: #eff6ff !important; font-weight: bold; color: #2563eb; text-align: center !important; font-size: 0.95rem; }
                
                .viewer-mark { background-color: #fef08a; color: #000; padding: 0 2px; border-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
            </style>
        </head>
        <body>
            <div class="viewer-header">
                <div class="viewer-title">
                    <i class="fas fa-table"></i> Градостроительные регламенты
                </div>
                <div class="viewer-search">
                    <div class="search-box">
                        <label>Зона:</label>
                        <input type="text" id="viewer-zone-search" placeholder="Напр: Ж1">
                    </div>
                    <div class="search-box">
                        <label>Вид разрешенного использования:</label>
                        <input type="text" id="viewer-use-search" placeholder="Напр: магазин">
                    </div>
                </div>
            </div>
            
            ${docMetaHtml}

            <div class="viewer-body">
                <div class="viewer-sidebar" id="viewer-sidebar"></div>
                <div class="viewer-main">
                    <div id="viewer-empty-msg" class="viewer-empty">Выберите зону из списка слева</div>
                    <div id="viewer-table-container" class="viewer-table-container" style="display: none;">
                        <div class="viewer-badge" id="viewer-badge"></div>
                        <h2 id="viewer-zone-title"></h2>
                        <table class="viewer-table">
                            <thead>
                                <tr>
                                    <th width="8%">Код</th>
                                    <th width="28%">Наименование вида использования</th>
                                    <th width="12%">Площадь уч-ка (кв.м)</th>
                                    <th width="10%">Ширина уч-ка (м)</th>
                                    <th width="12%">Этажи / Высота</th>
                                    <th width="10%">% заст-ки</th>
                                    <th width="20%">Отступы (м)</th>
                                </tr>
                            </thead>
                            <tbody id="viewer-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;

    newWin.document.open();
    newWin.document.write(viewerHtml);
    newWin.document.close();

    const doc = newWin.document;
    let currentZoneId = null;
    let zoneTerms = [];
    let useTerms = [];

    const sidebarEl = doc.getElementById('viewer-sidebar');
    const tableContainer = doc.getElementById('viewer-table-container');
    const emptyMsg = doc.getElementById('viewer-empty-msg');
    const tableBody = doc.getElementById('viewer-table-body');
    const zoneTitle = doc.getElementById('viewer-zone-title');
    const badge = doc.getElementById('viewer-badge');

    const highlightText = (text) => {
        if (!text) return '';
        const allTerms = [...zoneTerms, ...useTerms];
        if (allTerms.length === 0) return text;
        const safeTerms = allTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(${safeTerms.join('|')})`, 'gi');
        return String(text).replace(regex, '<span class="viewer-mark">$1</span>');
    };

    const renderTable = (zone) => {
        emptyMsg.style.display = 'none';
        tableContainer.style.display = 'block';
        
        badge.innerHTML = highlightText("Зона " + zone.id);
        zoneTitle.innerHTML = highlightText(zone.name);
        tableBody.innerHTML = '';

        const rowsToRender = zone.uses.filter(use => {
            if (useTerms.length === 0) return true;
            const useText = `${use.code} ${use.name}`.toLowerCase();
            return useTerms.every(term => useText.includes(term));
        });

        const grouped = {};
        rowsToRender.forEach(use => {
            if (!grouped[use.type]) grouped[use.type] = [];
            grouped[use.type].push(use);
        });

        for (const [type, uses] of Object.entries(grouped)) {
            const trHead = doc.createElement('tr');
            trHead.innerHTML = `<td colspan="7" class="type-header">${highlightText(type)}</td>`;
            tableBody.appendChild(trHead);

            uses.forEach(use => {
                const tr = doc.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${highlightText(use.code)}</strong></td>
                    <td>${highlightText(use.name)}</td>
                    <td>${highlightText(use.area || 'н.у.')}</td>
                    <td>${highlightText(use.width || 'н.у.')}</td>
                    <td>${highlightText(use.height || 'н.у.')}</td>
                    <td>${highlightText(use.percent || 'н.у.')}</td>
                    <td>${highlightText(use.setback || 'н.у.')}</td>
                `;
                tableBody.appendChild(tr);
            });
        }
    };

    const renderSidebar = (data) => {
        sidebarEl.innerHTML = '';
        if (data.length === 0) {
            sidebarEl.innerHTML = '<div style="padding: 20px; text-align:center; color:#94a3b8;">Ничего не найдено</div>';
            return;
        }

        data.forEach(zone => {
            const div = doc.createElement('div');
            div.className = `viewer-item ${zone.id === currentZoneId ? 'active' : ''}`;
            div.innerHTML = `
                <div class="viewer-item-id">${highlightText(zone.id)}</div>
                <div class="viewer-item-name">${highlightText(zone.name)}</div>
            `;
            div.onclick = () => {
                currentZoneId = zone.id;
                doc.querySelectorAll('.viewer-item').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                renderTable(zone);
            };
            sidebarEl.appendChild(div);
        });
    };

    const updateView = () => {
        const filteredZones = zonesData.filter(zone => {
            const zoneText = `${zone.id} ${zone.name}`.toLowerCase();
            const matchZone = zoneTerms.every(term => zoneText.includes(term));
            
            const matchUse = useTerms.length === 0 || zone.uses.some(use => {
                const useText = `${use.code} ${use.name}`.toLowerCase();
                return useTerms.every(term => useText.includes(term));
            });

            return matchZone && matchUse;
        });

        renderSidebar(filteredZones);

        if (currentZoneId) {
            const activeZone = filteredZones.find(z => z.id === currentZoneId);
            if (activeZone) renderTable(activeZone);
            else {
                tableContainer.style.display = 'none';
                emptyMsg.style.display = 'block';
                currentZoneId = null;
            }
        }
    };

    const zoneSearchInput = doc.getElementById('viewer-zone-search');
    const useSearchInput = doc.getElementById('viewer-use-search');

    zoneSearchInput.addEventListener('input', e => {
        zoneTerms = e.target.value.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        updateView();
    });

    useSearchInput.addEventListener('input', e => {
        useTerms = e.target.value.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        updateView();
    });

    renderSidebar(zonesData);
}


// ==========================================
// ЛОГИКА АВТОСМЕЩЕНИЯ ПО МУНИЦИПАЛЬНЫМ ОБРАЗОВАНИЯМ (МО)
// ==========================================

let lastCheckedCenter = null;
let moOffsetsCache = [];

// Загружаем кэш из localStorage при старте
try {
    const cached = localStorage.getItem('moOffsetsCache');
    if (cached) moOffsetsCache = JSON.parse(cached);
} catch(e) { 
    console.error("Ошибка чтения кэша смещений", e); 
}

// 1. Сохраняем смещения для текущего МО в БД Supabase (конвертируем в WGS84)
// 1. Сохраняем смещения для текущего МО в БД Supabase (конвертируем в WGS84) с проверкой перезаписи
async function saveOffsetsForCurrentMo(lat, lon, yaX, yaY, goX, goY) {
    if (typeof showLoader === 'function') showLoader("Определение МО для сохранения смещения...");
    
    try {
        let targetRegNumber = null;
        let targetName = null;
        let targetGeometry = null;

        // Ищем МО через API NSPD
        if (typeof queryMunicipalInfo === 'function') {
            const apiData = await queryMunicipalInfo(lat, lon);
            if (apiData && apiData.features && apiData.features.length > 0) {
                let bestApiItem = apiData.features[0];
                let minArea = Infinity;
                
                apiData.features.forEach(item => {
                    try {
                        const tGeom = item.geometry.type === 'Polygon' ? turf.polygon(item.geometry.coordinates) : turf.multiPolygon(item.geometry.coordinates);
                        const a = turf.area(tGeom);
                        if (a < minArea) { minArea = a; bestApiItem = item; }
                    } catch(e){}
                });
                
                targetRegNumber = bestApiItem.properties.label || "Без номера";
                targetName = bestApiItem.properties.descr || "Без названия";
                targetGeometry = bestApiItem.geometry;
            }
        }

        if (!targetRegNumber || !targetGeometry) {
            throw new Error("Не удалось определить муниципальное образование в этой точке.");
        }

        // --- НАЧАЛО: Проверка существования записи в БД ---
        const { data: existingData, error: checkError } = await supabaseClient
            .from('municipal_offsets')
            .select('ya_offset_x, ya_offset_y, go_offset_x, go_offset_y')
            .eq('reg_number', targetRegNumber)
            .maybeSingle(); // Возвращает данные или null, не выдает ошибку при отсутствии строк

        if (checkError) {
            console.error("Ошибка при проверке существующих данных:", checkError);
            throw new Error("Не удалось проверить наличие данных в базе.");
        }

        if (existingData) {
            if (typeof hideLoader === 'function') hideLoader(); // Прячем лоадер на время показа окна

            // Встраиваем логику диалогового окна через Promise
            const userConfirmed = await new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'color-modal';
                modal.style.display = 'flex';
                modal.style.zIndex = '20000';
                
                modal.innerHTML = `
                    <div class="color-modal-content" style="width: 400px; max-width: 90vw;">
                        <h3 style="margin-top:0; color:#d97706;"><i class="fas fa-exclamation-triangle"></i> Обновление данных</h3>
                        <p style="font-size:0.95rem; color:#555; text-align:center; margin-bottom: 15px; line-height: 1.4;">
                            Найдены существуюшие смещения для:<br><b style="color: #1e293b;">${targetName}</b><br>Заменить их новыми значениями?
                        </p>
                        <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:20px; text-align:center;">
                            <tr style="border-bottom: 1px solid #ccc; background: #f8fafc;">
                                <th style="padding:8px; text-align:left;">Параметр</th>
                                <th style="padding:8px; color:#64748b;">Было</th>
                                <th style="padding:8px; color:#10b981;">Станет</th>
                            </tr>
                            <tr style="border-bottom: 1px dashed #eee;">
                                <td style="padding:8px; text-align:left; font-weight:600;">Яндекс X</td>
                                <td style="padding:8px; color:#64748b;">${existingData.ya_offset_x}</td>
                                <td style="padding:8px; color:#10b981; font-weight:bold;">${yaX}</td>
                            </tr>
                            <tr style="border-bottom: 1px dashed #eee;">
                                <td style="padding:8px; text-align:left; font-weight:600;">Яндекс Y</td>
                                <td style="padding:8px; color:#64748b;">${existingData.ya_offset_y}</td>
                                <td style="padding:8px; color:#10b981; font-weight:bold;">${yaY}</td>
                            </tr>
                            <tr style="border-bottom: 1px dashed #eee;">
                                <td style="padding:8px; text-align:left; font-weight:600;">Google X</td>
                                <td style="padding:8px; color:#64748b;">${existingData.go_offset_x}</td>
                                <td style="padding:8px; color:#10b981; font-weight:bold;">${goX}</td>
                            </tr>
                            <tr>
                                <td style="padding:8px; text-align:left; font-weight:600;">Google Y</td>
                                <td style="padding:8px; color:#64748b;">${existingData.go_offset_y}</td>
                                <td style="padding:8px; color:#10b981; font-weight:bold;">${goY}</td>
                            </tr>
                        </table>
                        <div class="buttons" style="display:flex; justify-content:space-between; gap:10px; width: 100%;">
                            <button id="btn-replace-ok" style="flex:1; padding:12px; border:none; border-radius:8px; background:#f59e0b; color:white; font-weight:bold; cursor:pointer; transition: 0.2s;"><i class="fas fa-save"></i> Заменить</button>
                            <button id="btn-replace-cancel" style="flex:1; padding:12px; border:none; border-radius:8px; background:#94a3b8; color:white; font-weight:bold; cursor:pointer; transition: 0.2s;"><i class="fas fa-times"></i> Отмена</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                // Ховер-эффекты для кнопок
                const btnOk = modal.querySelector('#btn-replace-ok');
                const btnCancel = modal.querySelector('#btn-replace-cancel');
                btnOk.onmouseenter = () => btnOk.style.background = '#d97706';
                btnOk.onmouseleave = () => btnOk.style.background = '#f59e0b';
                btnCancel.onmouseenter = () => btnCancel.style.background = '#64748b';
                btnCancel.onmouseleave = () => btnCancel.style.background = '#94a3b8';

                const cleanUp = (result) => {
                    document.body.removeChild(modal);
                    resolve(result);
                };

                btnOk.onclick = () => cleanUp(true);
                btnCancel.onclick = () => cleanUp(false);
            });

            if (!userConfirmed) {
                if (typeof showNotification === 'function') showNotification('Сохранение отменено', 'info');
                return false;
            }
            if (typeof showLoader === 'function') showLoader(`Сохранение смещений для ${targetName}...`);
        }
        // --- КОНЕЦ: Проверка существования записи в БД ---

        if (!existingData && typeof showLoader === 'function') {
            showLoader(`Сохранение смещений для ${targetName}...`);
        }

        // Вычисляем Bounding Box с помощью Turf.js (в координатах API, т.е. EPSG:3857)
        const tGeom = targetGeometry.type === 'Polygon' ? turf.polygon(targetGeometry.coordinates) : turf.multiPolygon(targetGeometry.coordinates);
        const bbox3857 = turf.bbox(tGeom); // Возвращает [minLon, minLat, maxLon, maxLat] в EPSG:3857

        // КОНВЕРТАЦИЯ В WGS84 ПЕРЕД СОХРАНЕНИЕМ
        const minWgs = proj4('EPSG:3857', 'EPSG:4326', [bbox3857[0], bbox3857[1]]); // [minLon, minLat] в WGS84
        const maxWgs = proj4('EPSG:3857', 'EPSG:4326', [bbox3857[2], bbox3857[3]]); // [maxLon, maxLat] в WGS84

        // Отправляем данные в таблицу municipal_offsets через supabaseClient
        const { data, error } = await supabaseClient
            .from('municipal_offsets')
            .upsert({
                reg_number: targetRegNumber,
                name: targetName,
                min_lon: minWgs[0],
                min_lat: minWgs[1],
                max_lon: maxWgs[0],
                max_lat: maxWgs[1],
                ya_offset_x: yaX,
                ya_offset_y: yaY,
                go_offset_x: goX,
                go_offset_y: goY,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        
        if (typeof showNotification === 'function') showNotification(`Смещения сохранены для: ${targetName}`, 'success');
        return true;

    } catch (err) {
        console.error("[PZZ Offsets] Ошибка сохранения смещений:", err);
        if (typeof showNotification === 'function') showNotification(`Ошибка: ${err.message}`, 'error');
        return false;
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

// 2. Загрузка всех Bounding Boxes (кэша смещений) из БД
async function loadAllMoOffsetsCache() {
    if (typeof showLoader === 'function') showLoader("Загрузка смещений...");
    
    try {
        const { data, error } = await supabaseClient
            .from('municipal_offsets')
            .select('*');

        if (error) throw error;
        
        console.log(`[PZZ Offsets] Загружено ${data.length} записей смещений.`);
        
        localStorage.setItem('moOffsetsCache', JSON.stringify(data));
        if (typeof showNotification === 'function') showNotification(`Смещения обновлены`, 'success');
        
        return data;
    } catch (err) {
        console.error("[PZZ Offsets] Ошибка загрузки базы:", err);
        if (typeof showNotification === 'function') showNotification(`Ошибка загрузки базы: ${err.message}`, 'error');
        return null;
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}

// 3. Инициализация кнопок UI
function initAutoOffsetUI() {
    const wrapper = document.getElementById('offset-dropdown-wrapper');
    const btn = document.getElementById('auto-offset-btn');
    const menu = document.getElementById('offset-dropdown-menu');
    const checkbox = document.getElementById('auto-offset-checkbox');
    const saveBtn = document.getElementById('btn-save-mo-offset');
    const loadBtn = document.getElementById('btn-load-mo-offsets');

    if (!wrapper || !btn || !menu) return;

    // Восстанавливаем состояние чекбокса
    checkbox.checked = localStorage.getItem('isAutoMoOffsetEnabled') === 'true';

    // Открытие/закрытие меню
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) menu.classList.remove('show');
    });

    // Обработка чекбокса
    checkbox.addEventListener('change', (e) => {
        localStorage.setItem('isAutoMoOffsetEnabled', e.target.checked);
        if (e.target.checked) checkMoOffset(map.getCenter(), true, true);
    });

    // Сохранение
    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.remove('show');
        
        const center = map.getCenter();
        const yX = parseFloat(document.getElementById('mapOffsetX').value.replace(',', '.')) || 0;
        const yY = parseFloat(document.getElementById('mapOffsetY').value.replace(',', '.')) || 0;
        const gX = parseFloat(document.getElementById('kmlMapOffsetX').value.replace(',', '.')) || 0;
        const gY = parseFloat(document.getElementById('kmlMapOffsetY').value.replace(',', '.')) || 0;

        const success = await saveOffsetsForCurrentMo(center[0], center[1], yX, yY, gX, gY);
        if (success) moOffsetsCache = await loadAllMoOffsetsCache() || moOffsetsCache;
    });

    // Загрузка
    loadBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.remove('show');
        moOffsetsCache = await loadAllMoOffsetsCache() || moOffsetsCache;
        // Передаем true, true для вывода уведомления при ручном нажатии
        checkMoOffset(map.getCenter(), true, true); 
    });
}

// 4. Проверка сдвига карты (> 1 км) и применение смещения
function checkMoOffset(currentCenterGeo, forceCheck = false, showForceSuccess = false) {
    if (!currentCenterGeo || !moOffsetsCache || moOffsetsCache.length === 0) {
        if (showForceSuccess && typeof showNotification === 'function') {
            showNotification('Смещений нет', 'warning');
        }
        return;
    }

    // Проверяем, пройдена ли дистанция в 1 км
    if (!forceCheck && lastCheckedCenter) {
        try {
            const from = turf.point([lastCheckedCenter[1], lastCheckedCenter[0]]);
            const to = turf.point([currentCenterGeo[1], currentCenterGeo[0]]);
            if (turf.distance(from, to, { units: 'kilometers' }) < 1.0) return;
        } catch(e) { console.error("Turf Error in checkMoOffset:", e); }
    }

    lastCheckedCenter = currentCenterGeo;
    
    // Яндекс отдает центр карты напрямую в WGS84
    const [lat, lon] = currentCenterGeo;

    // Ищем в каком МО мы находимся (база теперь тоже в WGS84)
    let foundMo = null;
    for (const mo of moOffsetsCache) {
        const minLat = parseFloat(mo.min_lat);
        const maxLat = parseFloat(mo.max_lat);
        const minLon = parseFloat(mo.min_lon);
        const maxLon = parseFloat(mo.max_lon);
        
        // Прямое сравнение без конвертаций!
        if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
            foundMo = mo;
            break;
        }
    }

    if (foundMo) {
        let needUpdate = false;
        
        const currYx = parseFloat(document.getElementById('mapOffsetX').value.replace(',', '.')) || 0;
        const currYy = parseFloat(document.getElementById('mapOffsetY').value.replace(',', '.')) || 0;
        const currGx = parseFloat(document.getElementById('kmlMapOffsetX').value.replace(',', '.')) || 0;
        const currGy = parseFloat(document.getElementById('kmlMapOffsetY').value.replace(',', '.')) || 0;

        const targetYx = parseFloat(foundMo.ya_offset_x);
        const targetYy = parseFloat(foundMo.ya_offset_y);
        const targetGx = parseFloat(foundMo.go_offset_x);
        const targetGy = parseFloat(foundMo.go_offset_y);

        // Применяем смещение Яндекс
        if (!isNaN(targetYx) && !isNaN(targetYy)) {
            if (currYx !== targetYx || currYy !== targetYy) {
                document.getElementById('mapOffsetX').value = targetYx;
                document.getElementById('mapOffsetY').value = targetYy;
                mapOffsetX = targetYx;
                mapOffsetY = targetYy;
                localStorage.setItem('mapOffsetX', mapOffsetX);
                localStorage.setItem('mapOffsetY', mapOffsetY);
                needUpdate = true;
            }
        }

        // Применяем смещение Google
        if (!isNaN(targetGx) && !isNaN(targetGy)) {
            if (currGx !== targetGx || currGy !== targetGy) {
                if (typeof isGoogleLayerActive !== 'undefined' && isGoogleLayerActive) {
                    const deltaX = targetGx - currGx;
                    const deltaY = targetGy - currGy;
                    if (typeof shiftAllMapObjects === 'function') shiftAllMapObjects(deltaY, deltaX); 
                }
                document.getElementById('kmlMapOffsetX').value = targetGx;
                document.getElementById('kmlMapOffsetY').value = targetGy;
                kmlMapOffsetX = targetGx;
                kmlMapOffsetY = targetGy;
                localStorage.setItem('kmlMapOffsetX', kmlMapOffsetX);
                localStorage.setItem('kmlMapOffsetY', kmlMapOffsetY);
                needUpdate = true;
            }
        }

        if (needUpdate) {
         //   if (typeof showNotification === 'function') showNotification(`Применено автосмещение: ${foundMo.name}`, 'info', 'crosshairs');
            if (typeof findAndConvert === 'function') findAndConvert();
        } else if (showForceSuccess) {
            // Уведомление при ручной загрузке
            if (typeof showNotification === 'function') showNotification(`Смещения уже актуальны для: ${foundMo.name}`, 'success');
        }
    } else if (showForceSuccess) {
        // Уведомление, если для этой зоны нет данных
        if (typeof showNotification === 'function') showNotification(`В базе нет данных о смещении для текущей локации`, 'warning');
    }
}
