/**
 * Модуль генерации Схемы расположения земельного участка (СРЗУ на КПТ)
 */

// Глобальная переменная для отслеживания загрузки данных в текущей сессии
window.__schemaDataLoaded = false;

// Главная функция, вызываемая из контекстного меню
function startSchemaWorkflow(lat, lon, targetPolygon) {
    console.log("[Schema] Функция startSchemaWorkflow успешно вызвана.");
    if (!targetPolygon) {
        console.error("[Schema] Полигон не передан!");
        return;
    }
    openSchemaSettingsModal(lat, lon, targetPolygon);
}

// Открытие модального окна настроек
function openSchemaSettingsModal(lat, lon, targetPolygon) {
    console.log("[Schema] Формирование HTML модального окна...");
    const modal = document.createElement('div');
    modal.className = 'color-modal';
    modal.style.width = '450px';
    modal.style.zIndex = '15000';

    // Читаем сохраненные настройки или задаем по умолчанию
    const sLineColor = localStorage.getItem('sch_lineColor') || '#FF0000';
    const sLineWidth = localStorage.getItem('sch_lineWidth') || '3';
    const sFillColor = localStorage.getItem('sch_fillColor') || '#FFA500';
    const sFillOpacity = localStorage.getItem('sch_fillOpacity') || '20';
    const sShowPoints = localStorage.getItem('sch_showPoints') !== 'false';
    const sPointColor = localStorage.getItem('sch_pointColor') || '#FF0000';
    const sZoom = localStorage.getItem('sch_zoom') || '100';
    
    // Предлагать не загружать повторно, если уже грузили
    const sSkipLoad = window.__schemaDataLoaded ? 'checked' : '';

    modal.innerHTML = `
        <div class="color-modal-content" style="padding: 20px; text-align: left;">
            <h3 style="margin-top: 0; text-align: center; color: #1e3a8a;">Настройки Схемы</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                <!-- Линия -->
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <label style="font-size: 0.9em; color: #555;">Цвет контура:</label>
                    <input type="color" id="sch_lineColor" value="${sLineColor}" style="width: 100%; height: 35px; border-radius: 5px; border:none; cursor:pointer;">
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <label style="font-size: 0.9em; color: #555;">Толщина: <span id="sch_lineWidth_val">${sLineWidth}</span>px</label>
                    <input type="range" id="sch_lineWidth" min="1" max="10" value="${sLineWidth}">
                </div>
                
                <!-- Заливка -->
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <label style="font-size: 0.9em; color: #555;">Цвет заливки:</label>
                    <input type="color" id="sch_fillColor" value="${sFillColor}" style="width: 100%; height: 35px; border-radius: 5px; border:none; cursor:pointer;">
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <label style="font-size: 0.9em; color: #555;">Заливка: <span id="sch_fillOpacity_val">${sFillOpacity}</span>%</label>
                    <input type="range" id="sch_fillOpacity" min="0" max="100" value="${sFillOpacity}">
                </div>
            </div>

            <div style="border-top: 1px solid #eee; margin: 15px 0;"></div>

            <!-- Точки -->
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <input type="checkbox" id="sch_showPoints" style="width: 18px; height: 18px;" ${sShowPoints ? 'checked' : ''}>
                <label for="sch_showPoints" style="font-weight: bold; cursor: pointer;">Ставить точки (н1, н2...)</label>
            </div>
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px; padding-left: 28px;">
                <label style="font-size: 0.9em; color: #555;">Цвет точек и текста:</label>
                <input type="color" id="sch_pointColor" value="${sPointColor}" style="width: 60px; height: 30px; border:none; cursor:pointer;">
            </div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding-left: 28px;">
                <input type="checkbox" id="sch_autoSort" style="width: 16px; height: 16px;" checked>
                <label for="sch_autoSort" style="font-size: 0.9em; color: #333; cursor: pointer;" title="н1 на Северо-Западе, далее по часовой стрелке">Автоустановка точек (СЗ -> по часовой)</label>
            </div>

            <div style="border-top: 1px solid #eee; margin: 15px 0;"></div>

            <!-- Зум и данные -->
            <div style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 15px;">
                <label style="font-size: 0.9em; color: #555; font-weight: bold;">Масштаб охвата (Зум): <span id="sch_zoom_val">${sZoom}</span>%</label>
                <input type="range" id="sch_zoom" min="20" max="200" step="10" value="${sZoom}">
                <small style="color: #888; font-size: 0.8em;">100% - по размеру объекта, 50% - в 2 раза дальше</small>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                <input type="checkbox" id="sch_skipLoad" style="width: 18px; height: 18px;" ${sSkipLoad}>
                <label for="sch_skipLoad" style="font-size: 0.95em; cursor: pointer; color: #d32f2f; font-weight: bold;">Не делать повторные запросы к НСПД (быстро)</label>
            </div>

            <!-- Кнопки -->
            <div class="buttons" style="display: flex; gap: 10px;">
                <button id="sch_apply_btn" class="apply-btn" style="flex: 1;"><i class="fas fa-check"></i> Создать</button>
                <button id="sch_cancel_btn" class="cancel-btn" style="flex: 1;"><i class="fas fa-times"></i> Отмена</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: ПРИНУДИТЕЛЬНО ПОКАЗЫВАЕМ ОКНО
    modal.style.display = 'block';
    console.log("[Schema] Модальное окно успешно добавлено на страницу и отображено.");

    // Интерактив ползунков
    modal.querySelector('#sch_lineWidth').addEventListener('input', e => modal.querySelector('#sch_lineWidth_val').textContent = e.target.value);
    modal.querySelector('#sch_fillOpacity').addEventListener('input', e => modal.querySelector('#sch_fillOpacity_val').textContent = e.target.value);
    modal.querySelector('#sch_zoom').addEventListener('input', e => modal.querySelector('#sch_zoom_val').textContent = e.target.value);

    // Закрытие
    const closeModal = () => document.body.removeChild(modal);
    modal.querySelector('#sch_cancel_btn').onclick = closeModal;

    // Применение
    modal.querySelector('#sch_apply_btn').onclick = () => {
        console.log("[Schema] Нажата кнопка Создать. Сбор настроек...");
        const config = {
            lineColor: modal.querySelector('#sch_lineColor').value,
            lineWidth: parseInt(modal.querySelector('#sch_lineWidth').value),
            fillColor: modal.querySelector('#sch_fillColor').value,
            fillOpacity: parseInt(modal.querySelector('#sch_fillOpacity').value) / 100,
            showPoints: modal.querySelector('#sch_showPoints').checked,
            pointColor: modal.querySelector('#sch_pointColor').value,
            autoSort: modal.querySelector('#sch_autoSort').checked,
            zoom: parseInt(modal.querySelector('#sch_zoom').value),
            skipLoad: modal.querySelector('#sch_skipLoad').checked
        };

        // Сохраняем в localStorage
        localStorage.setItem('sch_lineColor', config.lineColor);
        localStorage.setItem('sch_lineWidth', config.lineWidth);
        localStorage.setItem('sch_fillColor', config.fillColor);
        localStorage.setItem('sch_fillOpacity', config.fillOpacity * 100);
        localStorage.setItem('sch_showPoints', config.showPoints);
        localStorage.setItem('sch_pointColor', config.pointColor);
        localStorage.setItem('sch_zoom', config.zoom);

        closeModal();
        console.log("[Schema] Запуск генерации схемы с параметрами:", config);
        executeSchemaGeneration(lat, lon, targetPolygon, config);
    };
}

/**
 * Основной процесс генерации
 */
async function executeSchemaGeneration(lat, lon, targetPolygon, config) {
    showLoader('Подготовка Схемы (1/4)...');
    try {
        // 1. Оформление полигона
        const fillHex = Math.round(config.fillOpacity * 255).toString(16).padStart(2, '0');
        targetPolygon.options.set({
            strokeColor: config.lineColor,
            strokeWidth: config.lineWidth,
            fillColor: config.fillOpacity > 0 ? `${config.fillColor}${fillHex}` : '#00000000',
            zIndex: 1000
        });

        // 2. Обработка координат и точек
        let rawCoords = targetPolygon.geometry.getCoordinates()[0].slice(); 
        
        // Убираем дублирующую замыкающую точку, если она есть
        const firstPt = rawCoords[0];
        const lastPt = rawCoords[rawCoords.length - 1];
        if (Math.abs(firstPt[0] - lastPt[0]) < 1e-7 && Math.abs(firstPt[1] - lastPt[1]) < 1e-7) {
            rawCoords.pop();
        }

        if (config.autoSort) {
            console.log("[Schema] Выполняется автосортировка точек (по часовой стрелке).");
            rawCoords = sortPointsClockwiseNW(rawCoords);
        }

        // Удаление старых точек схемы
        const pointsToRemove = [];
        polygons.forEach(p => {
            if (p instanceof ymaps.Placemark && p.properties.get('isSchemaPoint')) pointsToRemove.push(p);
        });
        pointsToRemove.forEach(p => { map.geoObjects.remove(p); polygons = polygons.filter(poly => poly !== p); });

        // Перевод в МСК и отрисовка точек
        console.log("[Schema] Расчет МСК и отрисовка точек на карте...");
        const { mskCoordsTable, centerGeo } = processAndDrawSchemaPoints(rawCoords, targetPolygon, config);

        // 3. Загрузка данных (если не стоит галочка "Не загружать")
        let terrZoneName = "Не установлена";
        if (!config.skipLoad) {
            showLoader('Поиск окружения и ЗОУИТ (2/4)...');
            console.log("[Schema] Выполняем запросы к НСПД (окружение, ОКС, ЗОУИТ)...");
            await loadEnvironmentData(centerGeo, targetPolygon);
            window.__schemaDataLoaded = true; // Запоминаем, что данные загружены
            
            showLoader('Определение терр. зоны (3/4)...');
            terrZoneName = await fetchTerrZoneName(centerGeo);
        } else {
            console.log("[Schema] Опция 'Без загрузки' активна. Ищем Терр. зону в кэше карты.");
            terrZoneName = findTerrZoneLocally(centerGeo) || "Не установлена";
        }

        // 4. Центрирование камеры (Альбомный вид + Зум)
        showLoader('Настройка камеры...');
        await setupCameraForScreenshot(targetPolygon, config.zoom);

        // 5. Скриншот
        showLoader('Создание снимка карты...');
        const mapImageBase64 = await takeMapScreenshotForSchema();

        // 6. Расчет площади
        const geomStats = calculatePreciseGeometry(targetPolygon);
        const areaStr = Math.round(geomStats.area).toLocaleString('ru-RU');

        // 7. Генерация иконок для легенды (canvas -> base64)
        console.log("[Schema] Генерация условных обозначений...");
        const imgLegendPoly = generateLegendPolygonImage(config.lineColor, config.fillColor, config.fillOpacity);
        const imgLegendPoint = generateLegendPointImage(config.pointColor);

        // 8. Открытие документа
        console.log("[Schema] Открытие нового окна с документом.");
        openSchemaDocumentWindow(mapImageBase64, mskCoordsTable, areaStr, terrZoneName, imgLegendPoly, imgLegendPoint);

        showNotification('Схема успешно сформирована', 'success');

    } catch (error) {
        console.error("[Schema] Ошибка при генерации схемы:", error);
        showNotification(`Ошибка: ${error.message}`, 'error', 'exclamation-circle', 7000);
    } finally {
        hideLoader();
    }
}

/**
 * Сортировка: Первая точка - Северо-Запад, остальные по часовой стрелке
 */
function sortPointsClockwiseNW(coords) {
    if (coords.length < 3) return coords;

    // Yandex coords: [lat, lon]
    let sumLat = 0, sumLon = 0;
    coords.forEach(c => { sumLat += c[0]; sumLon += c[1]; });
    const center = [sumLat / coords.length, sumLon / coords.length];

    // Вычисляем угол для каждой точки от центра (0 градусов - строго на Север)
    // Угол растет по часовой стрелке.
    const pointsWithAngle = coords.map(c => {
        const dLat = c[0] - center[0]; // Y
        const dLon = c[1] - center[1]; // X
        // Используем atan2(dLon, dLat) чтобы Север (dLat>0, dLon=0) был 0.
        let angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return { coord: c, angle: angle };
    });

    // Сортируем все точки по часовой стрелке (по возрастанию угла)
    pointsWithAngle.sort((a, b) => a.angle - b.angle);

    // Ищем Северо-Западную точку.
    // СЗ - это угол примерно 315 градусов (или между 270 и 360).
    // Найдем индекс точки, угол которой ближе всего к 315.
    let nwIndex = 0;
    let minDiff = Infinity;
    pointsWithAngle.forEach((p, i) => {
        let diff = Math.abs(p.angle - 315);
        if (diff > 180) diff = 360 - diff; // кратчайшее расстояние по кругу
        if (diff < minDiff) {
            minDiff = diff;
            nwIndex = i;
        }
    });

    // Перестраиваем массив, начиная с nwIndex
    const sortedCoords = [];
    for (let i = 0; i < pointsWithAngle.length; i++) {
        const idx = (nwIndex + i) % pointsWithAngle.length;
        sortedCoords.push(pointsWithAngle[idx].coord);
    }

    return sortedCoords;
}

/**
 * Конвертация в МСК и отрисовка точек
 */
function processAndDrawSchemaPoints(coords, polygon, config) {
    const destSc = localStorage.getItem('savedDefaultMskSystem') || 'EPSG:6331602';
    const destSystem = COORDINATE_SYSTEMS.find(s => s.value === destSc);
    let mskOffsetX = 0, mskOffsetY = 0;

    if (localStorage.getItem('autoLoadMskOffset') !== 'false' && destSystem) {
        mskOffsetX = destSystem.offsetX || 0; mskOffsetY = destSystem.offsetY || 0;
    } else {
        mskOffsetX = parseFloat((localStorage.getItem('savedMskOffsetX') || '0').replace(',', '.')) || 0;
        mskOffsetY = parseFloat((localStorage.getItem('savedMskOffsetY') || '0').replace(',', '.')) || 0;
    }
    if (destSystem && destSystem.def) proj4.defs(destSc, destSystem.def);

    let mskCoordsTable = [];
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

    for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]);
        minLon = Math.min(minLon, c[1]); maxLon = Math.max(maxLon, c[1]);

        // MСК
        const trueLat = c[0] + (mapOffsetY * 0.000008983);
        const trueLon = c[1] + (mapOffsetX * 0.000008983);
        let x_msk = 0, y_msk = 0;
        if (destSystem) {
            const mskPoint = proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            y_msk = mskPoint[0] + mskOffsetY;
            x_msk = mskPoint[1] + mskOffsetX;
        }

        mskCoordsTable.push({
            point: `н${i + 1}`,
            x: x_msk.toFixed(2),
            y: y_msk.toFixed(2)
        });

        // Отрисовка на карте, если включено
        if (config.showPoints) {
            // Кастомный макет для кружочка нужного цвета
            const dotLayout = ymaps.templateLayoutFactory.createClass(
                `<div style="width: 10px; height: 10px; background-color: ${config.pointColor}; border-radius: 50%; border: 1px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.5);"></div>`
            );
            
            // Кастомный макет для текста нужного цвета
            const textLayout = ymaps.templateLayoutFactory.createClass(
                `<div style="color: ${config.pointColor}; font-size: 16px; font-weight: bold; font-family: Arial; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;">н${i + 1}</div>`
            );

            const dot = new ymaps.Placemark(c, {}, { iconLayout: dotLayout, iconOffset: [-5, -5], zIndex: 1140 });
            const label = new ymaps.Placemark(c, {}, { iconLayout: textLayout, iconOffset: [8, -12], zIndex: 1150 });
            
            dot.properties.set({ 'isSchemaPoint': true, 'relatedPolygon': polygon });
            label.properties.set({ 'isSchemaPoint': true, 'relatedPolygon': polygon });
            
            map.geoObjects.add(dot); map.geoObjects.add(label);
            polygons.push(dot); polygons.push(label);
        }
    }
    
    // Замыкаем контур в таблице
    if (mskCoordsTable.length > 0) {
        mskCoordsTable.push({ ...mskCoordsTable[0], point: mskCoordsTable[0].point });
    }

    const centerGeo = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
    return { mskCoordsTable, centerGeo };
}

/**
 * Выполнение запросов к НСПД
 */
async function loadEnvironmentData(centerGeo, polygon) {
    const trueLat = centerGeo[0] + (mapOffsetY * 0.000008983);
    const trueLon = centerGeo[1] + (mapOffsetX * 0.000008983);
    const centerPoint = proj4("EPSG:4326", "EPSG:3857", [trueLon, trueLat]);
    
    const halfSize = 200; 
    const box3857 = [
        [centerPoint[0] - halfSize, centerPoint[1] - halfSize], [centerPoint[0] + halfSize, centerPoint[1] - halfSize],
        [centerPoint[0] + halfSize, centerPoint[1] + halfSize], [centerPoint[0] - halfSize, centerPoint[1] + halfSize],
        [centerPoint[0] - halfSize, centerPoint[1] - halfSize]
    ];

    // Отключаем сдвиг камеры при отрисовке (сохраняем bounds)
    const oldBounds = map.getBounds();

    try {
        const parcels = await searchParcelsByArea(box3857);
        if (parcels && parcels.length > 0) await drawFoundParcels(parcels, false);

        const [oks, structs, zouits] = await Promise.all([
            searchFeaturesByGeometry(polygon, 36369),
            searchFeaturesByGeometry(polygon, 36383),
            searchFeaturesByGeometry(polygon, 36940)
        ]);

        if (oks && oks.length > 0) await processAndDrawBuildings(oks);
        if (structs && structs.length > 0) await processAndDrawStructures(structs);
        if (zouits && zouits.length > 0) await processAndDrawZouits(zouits);
        
    } catch (e) {
        console.warn("Часть данных окружения не загрузилась:", e);
    } finally {
        map.setBounds(oldBounds, {duration: 0});
    }
}

/**
 * Запрос Терр. Зоны
 */
async function fetchTerrZoneName(centerGeo) {
    const trueLat = centerGeo[0] + (mapOffsetY * 0.000008983);
    const trueLon = centerGeo[1] + (mapOffsetX * 0.000008983);
    const res = await searchContainingObjectByPoint(trueLat, trueLon, 36315);
    if (res && res.features && res.features.length > 0) {
        const name = res.features[0].properties?.options?.name_by_doc || res.features[0].properties?.options?.type_zone || 'Территориальная зона';
        
        // Создаем текстовую метку рядом с участком
        const tzLabel = new ymaps.Placemark([centerGeo[0] + 0.0002, centerGeo[1]], {
            iconContent: `ТЗ: ${name}`
        }, {
            preset: 'islands#blueStretchyIcon', zIndex: 1200
        });
        map.geoObjects.add(tzLabel);
        polygons.push(tzLabel);
        return name;
    }
    return "Не установлена";
}

/**
 * Поиск Терр. Зоны среди уже загруженных (если включено "Не загружать")
 */
function findTerrZoneLocally(centerGeo) {
    const p = turf.point([centerGeo[1], centerGeo[0]]);
    for (const obj of polygons) {
        if (obj instanceof ymaps.Polygon && obj.properties.get('featureData')) {
            const fd = obj.properties.get('featureData');
            if (fd.properties?.category === 36315 || fd.properties?.categoryName === 'Территориальные зоны') {
                try {
                    const coords = obj.geometry.getCoordinates()[0];
                    const turfPoly = turf.polygon([coords.map(c => [c[1], c[0]])]);
                    if (turf.booleanPointInPolygon(p, turfPoly)) {
                        return fd.properties.options?.name_by_doc || fd.properties.options?.type_zone || 'Территориальная зона';
                    }
                } catch(e) {}
            }
        }
    }
    return null;
}

/**
 * Центрирование карты с учетом зума и альбомной ориентации
 */
async function setupCameraForScreenshot(polygon, zoomPercent) {
    const bounds = polygon.geometry.getBounds();
    let latDelta = bounds[1][0] - bounds[0][0];
    let lonDelta = bounds[1][1] - bounds[0][1];

    // Форсируем альбомную ориентацию (ширина больше высоты), чтобы влезли надписи
    if (lonDelta / latDelta < 1.5) {
        const neededLonDelta = latDelta * 1.5;
        const diff = neededLonDelta - lonDelta;
        bounds[0][1] -= diff / 2;
        bounds[1][1] += diff / 2;
    }

    // Применение зума (100% = нормальный вид с небольшим отступом, 50% = в 2 раза дальше)
    // Базовый отступ 50% от размера объекта
    const baseMultiplier = 1.5; 
    const userMultiplier = 100 / zoomPercent; // Если 50%, то множитель 2
    const finalMultiplier = baseMultiplier * userMultiplier;

    const cLat = (bounds[0][0] + bounds[1][0]) / 2;
    const cLon = (bounds[0][1] + bounds[1][1]) / 2;

    const newLatDelta = (bounds[1][0] - bounds[0][0]) * finalMultiplier;
    const newLonDelta = (bounds[1][1] - bounds[0][1]) * finalMultiplier;

    map.setBounds([
        [cLat - newLatDelta/2, cLon - newLonDelta/2],
        [cLat + newLatDelta/2, cLon + newLonDelta/2]
    ], { duration: 300 });

    // Ждем окончания анимации и прогрузки тайлов
    await new Promise(r => setTimeout(r, 1200));
}

/**
 * Скриншот
 */
async function takeMapScreenshotForSchema() {
    const widgets = document.querySelectorAll('.widget, .map-mode-switcher, .input-container, .mobile-menu-btn, .camera-height-label, .map-legend, .raster-controls-panel, .bottom-dashboard, .custom-context-menu');
    widgets.forEach(w => { if (w) w.style.display = 'none'; });

    const mapElement = document.getElementById('map');
    const canvas = await html2canvas(mapElement, {
        useCORS: true, allowTaint: true, logging: false,
        width: mapElement.clientWidth, height: mapElement.clientHeight, scrollX: 0, scrollY: 0,
        ignoreElements: (el) => typeof el.className === 'string' && (el.className.includes('-copyright') || el.className.includes('-gototech'))
    });

    widgets.forEach(w => { if (w) w.style.display = ''; });
    return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Генерация картинки легенды для Полигона (Base64)
 */
function generateLegendPolygonImage(strokeColor, fillColor, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = 30; canvas.height = 30;
    const ctx = canvas.getContext('2d');
    
    // Заливка
    ctx.globalAlpha = opacity;
    ctx.fillStyle = fillColor;
    ctx.fillRect(2, 2, 26, 26);
    
    // Контур
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 26, 26);

    return canvas.toDataURL('image/png');
}

/**
 * Генерация картинки легенды для Точки (Base64)
 */
function generateLegendPointImage(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const ctx = canvas.getContext('2d');

    // Точка
    ctx.beginPath();
    ctx.arc(10, 15, 6, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Текст
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText('н1', 20, 16);

    return canvas.toDataURL('image/png');
}

/**
 * Формирование и открытие документа
 */
function openSchemaDocumentWindow(imageBase64, coordsTable, areaStr, terrZoneName, imgLegendPoly, imgLegendPoint) {
    const coordsRows = coordsTable.map(c => `
        <tr>
            <td style="border:1px solid #000; padding:4px; text-align:center;">${c.point}</td>
            <td style="border:1px solid #000; padding:4px; text-align:center;">${c.x}</td>
            <td style="border:1px solid #000; padding:4px; text-align:center;">${c.y}</td>
        </tr>
    `).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Схема расположения земельного участка</title>
    <script src="https://unpkg.com/docx@7.8.2/build/index.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
    <style>
        body { font-family: "Times New Roman", Times, serif; font-size: 14pt; background: #e9ecef; margin: 0; padding: 20px; }
        .page { background: white; width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; }
        .header-text { text-align: right; margin-bottom: 20px; line-height: 1.2; }
        .header-text textarea { width: 350px; font-family: inherit; font-size: inherit; text-align: right; border: 1px dashed #ccc; padding: 5px; resize: none; overflow: hidden;}
        .title { text-align: center; font-weight: bold; font-size: 16pt; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid black; padding: 6px; text-align: left; }
        .coords-table th, .coords-table td { text-align: center; }
        .map-img { width: 100%; max-height: 400px; object-fit: contain; border: 1px solid #000; margin-bottom: 15px; }
        .legend-item { display: flex; align-items: center; margin-bottom: 8px; font-size: 12pt;}
        .legend-item img { margin-right: 10px; height: 20px; object-fit: contain; }
        
        .floating-bar { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; }
        .floating-bar button { padding: 10px 15px; font-size: 14px; cursor: pointer; border: none; border-radius: 5px; color: white; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: 0.2s;}
        .btn-print { background: #3b82f6; } .btn-print:hover { background: #2563eb; }
        .btn-docx { background: #10b981; } .btn-docx:hover { background: #059669; }
        .btn-html { background: #f59e0b; } .btn-html:hover { background: #d97706; }
        
        @media print {
            body { background: none; padding: 0; }
            .page { box-shadow: none; margin: 0; padding: 0; width: 100%; }
            .floating-bar { display: none; }
            .header-text textarea { border: none; }
        }
    </style>
</head>
<body>

    <div class="floating-bar">
        <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> Печать (А4)</button>
        <button class="btn-html" onclick="saveAsHtml()"><i class="fas fa-file-code"></i> Сохранить HTML</button>
        <button class="btn-docx" id="docxBtn"><i class="fas fa-file-word"></i> Скачать DOCX</button>
    </div>

    <div class="page" id="documentContent">
        <div class="header-text">
            <b>Утверждена</b><br>
            <textarea id="authText">Постановлением * 
* района 
*</textarea><br>
            <span style="font-size: 10pt;">(наименование документа об утверждении, включая наименование<br>
            органов государственной власти или органов местного<br>
            самоуправления, принявших решение об утверждении<br>
            или подписавших соглашение о перераспределении<br>
            земельных участков)</span><br><br>
            от _____________ № _____
        </div>

        <div class="title">
            Схема расположения земельного участка или земельных участков на кадастровом плане территории
        </div>

        <table>
            <tr><td colspan="3"><b>Условный номер земельного участка:</b> ЗУ1</td></tr>
            <tr><td colspan="3"><b>Площадь земельного участка:</b> ${areaStr} кв.м.</td></tr>
            <tr><td colspan="3"><b>Территориальная зона:</b> ${terrZoneName}</td></tr>
            <tr class="coords-table">
                <td rowspan="2" style="width: 40%; vertical-align: middle;"><b>Обозначение характерных точек границ</b></td>
                <td colspan="2"><b>Координаты в местной системе координат, м</b></td>
            </tr>
            <tr class="coords-table"><td><b>X</b></td><td><b>Y</b></td></tr>
            ${coordsRows}
        </table>

        <div style="text-align: center; margin: 15px 0;">
            <img src="${imageBase64}" class="map-img" alt="Карта СРЗУ">
            <div><b>Масштаб 1:500</b></div>
        </div>

        <div style="margin-top: 20px;">
            <b>Условные обозначения:</b>
            <div class="legend-item" style="margin-top: 10px;">
                <img src="${imgLegendPoly}"> - образуемый земельный участок
            </div>
            <div class="legend-item">
                <img src="${imgLegendPoint}"> - обозначение характерной точки границы образуемого земельного участка
            </div>
        </div>
    </div>

    <script>
        const authTextArea = document.getElementById('authText');
        const savedText = localStorage.getItem('schemaAuthorityText');
        if (savedText) authTextArea.value = savedText;
        
        function resizeTextarea() {
            authTextArea.style.height = 'auto';
            authTextArea.style.height = (authTextArea.scrollHeight) + 'px';
        }
        
        authTextArea.addEventListener('input', function() {
            localStorage.setItem('schemaAuthorityText', this.value);
            resizeTextarea();
        });
        window.addEventListener('load', resizeTextarea);

        function saveAsHtml() {
            const html = "<!DOCTYPE html><html>" + document.documentElement.innerHTML + "</html>";
            const blob = new Blob([html], {type: "text/html;charset=utf-8"});
            saveAs(blob, "Схема_СРЗУ.html");
        }

        document.getElementById('docxBtn').addEventListener('click', function() {
            const coords = ${JSON.stringify(coordsTable)};
            const authorityLines = authTextArea.value.split('\\n');
            const sqImgData = "${imgLegendPoly}";
            const circImgData = "${imgLegendPoint}";

            const docRows = [
                new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Условный номер земельного участка: ЗУ1", size: 24 })] })], columnSpan: 3 })] }),
                new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Площадь земельного участка: ${areaStr} кв.м.", size: 24 })] })], columnSpan: 3 })] }),
                new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Территориальная зона: ${terrZoneName}", size: 24 })] })], columnSpan: 3 })] }),
                new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Обозначение характерных точек границ", size: 24 })] })], rowSpan: 2, verticalAlign: docx.VerticalAlign.CENTER, width: { size: 40, type: docx.WidthType.PERCENTAGE } }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Координаты в местной системе координат, м", size: 24 })] })], columnSpan: 2 }),
                    ]
                }),
                new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "X", size: 24, bold: true })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Y", size: 24, bold: true })] })] }),
                    ]
                })
            ];

            coords.forEach(c => {
                docRows.push(new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.point, size: 24 })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.x, size: 24 })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.y, size: 24 })] })] }),
                    ]
                }));
            });

            const authParagraphs = authorityLines.map(line => 
                new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: line, size: 24, underline: {} })] })
            );

            const doc = new docx.Document({
                sections: [{
                    properties: { page: { size: { width: docx.convertMillimetersToTwip(210), height: docx.convertMillimetersToTwip(297) }, margin: { top: 1134, right: 850, bottom: 1134, left: 1700 } } },
                    children: [
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "Утверждена", bold: true, size: 24 })] }),
                        ...authParagraphs,
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "(наименование документа об утверждении, включая наименование", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "органов государственной власти или органов местного", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "самоуправления, принявших решение об утверждении", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, spacing: { after: 200 }, children: [new docx.TextRun({ text: "или подписавших соглашение о перераспределении земельных участков)", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, spacing: { after: 400 }, children: [
                            new docx.TextRun({ text: "от ", size: 24, bold: true }),
                            new docx.TextRun({ text: "_____________ ", size: 24, bold: true, underline: {} }),
                            new docx.TextRun({ text: "№ ", size: 24, bold: true }),
                            new docx.TextRun({ text: "_____", size: 24, bold: true, underline: {} })
                        ]}),
                        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                            new docx.TextRun({ text: "Схема расположения земельного участка или земельных участков на кадастровом плане территории", size: 28, bold: true })
                        ]}),
                        new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: docRows }),
                        
                        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [
                            new docx.TextRun({ text: "Масштаб 1:500", size: 24, bold: true })
                        ]}),
                        new docx.Paragraph({ spacing: { after: 100 }, children: [new docx.TextRun({ text: "Условные обозначения:", size: 24, bold: true })] }),
                        new docx.Paragraph({ spacing: { after: 100 }, children: [
                            new docx.ImageRun({ data: sqImgData.split(',')[1], transformation: { width: 22, height: 22 } }),
                            new docx.TextRun({ text: "  - образуемый земельный участок", size: 24 })
                        ]}),
                        new docx.Paragraph({ spacing: { after: 100 }, children: [
                            new docx.ImageRun({ data: circImgData.split(',')[1], transformation: { width: 30, height: 22 } }),
                            new docx.TextRun({ text: "  - обозначение характерной точки границы образуемого земельного участка", size: 24 })
                        ]})
                    ]
                }]
            });

            docx.Packer.toBlob(doc).then(blob => {
                saveAs(blob, "Схема_расположения.docx");
            }).catch(e => alert("Ошибка создания DOCX: " + e));
        });
    </script>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(htmlContent);
    win.document.close();
}