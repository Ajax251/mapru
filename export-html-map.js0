// export-html-map.js

/**
 * Функция для экспорта текущего состояния карты в автономный HTML файл.
 * @param {Array} polygonsArray - Массив всех объектов на карте (polygons, areaObjects и т.д.)
 * @param {Object} mapInstance - Экземпляр ymaps.Map
 * @param {Number} mapOffsetX - Текущее смещение по X
 * @param {Number} mapOffsetY - Текущее смещение по Y
 */
async function generateStandaloneHtmlMap(polygonsArray, mapInstance, mapOffsetX, mapOffsetY) {
    if (!mapInstance) {
        showNotification('Карта не инициализирована', 'error');
        return;
    }

    showLoader('Сбор данных для HTML-карты...');

    try {
        const center = mapInstance.getCenter();
        const zoom = mapInstance.getZoom();
        const mapType = mapInstance.getType();

        // 1. Собираем данные об объектах
        const exportFeatures =[];

        polygonsArray.forEach(obj => {
            if (!(obj instanceof ymaps.Polygon) && !(obj instanceof ymaps.Polyline)) {
                return; // Игнорируем метки и тексты, берем только контуры и линии
            }

            // Пропускаем служебные рамки (например, границу выделения квартала)
            if (obj.options.get('strokeStyle') === 'dash' && !obj.properties.get('isZouit')) return;

            const geometryType = obj.geometry.getType();
            let coordinates = obj.geometry.getCoordinates();

            // Функция для отмены визуального смещения карты (возврат к истинному WGS84)
            const revertOffset = (coord) =>[
                coord[0] + (mapOffsetY * 0.000008983),
                coord[1] + (mapOffsetX * 0.000008983)
            ];

            let trueCoordinates;
            if (geometryType === 'Polygon') {
                trueCoordinates = coordinates.map(ring => ring.map(revertOffset));
            } else if (geometryType === 'LineString') {
                trueCoordinates = coordinates.map(revertOffset);
            }

            // Получаем цвета и стили
            const strokeColor = obj.options.get('strokeColor') || '#FF0000';
            const strokeWidth = obj.options.get('strokeWidth') || 2;
            const strokeOpacity = obj.options.get('strokeOpacity') !== undefined ? obj.options.get('strokeOpacity') : 0.8;
            const fillColor = obj.options.get('fillColor') || '#00000000';

            // Получаем данные для балуна
            let balloonContent = '';
            const hintContent = obj.properties.get('hintContent');
            const cadNum = obj.properties.get('cadastralNumber') || 'Без номера';

            if (hintContent && typeof hintContent === 'object') {
                balloonContent += `<div style="font-family: Arial; padding: 5px;">`;
                balloonContent += `<h3 style="margin: 0 0 10px 0; color: #1e3a8a;">${hintContent.cadastralNumber || cadNum}</h3>`;
                if (hintContent.address) balloonContent += `<p style="margin: 5px 0;"><b>Адрес:</b> ${hintContent.address}</p>`;
                if (hintContent.area) balloonContent += `<p style="margin: 5px 0;"><b>Площадь/Длина:</b> ${hintContent.area}</p>`;
                if (hintContent.cost) balloonContent += `<p style="margin: 5px 0;"><b>Стоимость:</b> ${hintContent.cost} руб.</p>`;
                if (hintContent.vri) balloonContent += `<p style="margin: 5px 0;"><b>ВРИ:</b> ${hintContent.vri}</p>`;
                if (hintContent.purpose) balloonContent += `<p style="margin: 5px 0;"><b>Назначение:</b> ${hintContent.purpose}</p>`;
                if (hintContent.ownershipType && hintContent.ownershipType !== '-') balloonContent += `<p style="margin: 5px 0;"><b>Собственность:</b> ${hintContent.ownershipType}</p>`;
                if (hintContent.rightType && hintContent.rightType !== '-') balloonContent += `<p style="margin: 5px 0;"><b>Тип права:</b> ${hintContent.rightType}</p>`;
                balloonContent += `</div>`;
            } else if (typeof hintContent === 'string') {
                balloonContent = `<div style="font-family: Arial; padding: 5px;"><b>${hintContent}</b></div>`;
            } else {
                balloonContent = `<div style="font-family: Arial; padding: 5px;"><b>Объект:</b> ${cadNum}</div>`;
            }

            exportFeatures.push({
                type: geometryType,
                coords: trueCoordinates,
                style: { strokeColor, strokeWidth, strokeOpacity, fillColor },
                balloonContent: balloonContent
            });
        });

        // 2. Формируем HTML-код
        const jsonFeatures = JSON.stringify(exportFeatures);

        const htmlString = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Интерактивная карта объектов</title>
    <!-- Подключаем API Яндекс.Карт -->
    <script src="https://api-maps.yandex.ru/2.1/?apikey=dde71a0e-b612-44b7-b53b-82533420240f&lang=ru_RU" type="text/javascript"></script>
    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; font-family: sans-serif; overflow: hidden; }
        #map { width: 100%; height: 100vh; }
        .controls { position: absolute; top: 10px; left: 10px; z-index: 1000; background: white; padding: 10px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
        h3 { margin: 0 0 5px 0; font-size: 14px; color: #333; }
        p { margin: 0; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="controls">
        <h3>Интерактивная карта</h3>
        <p>Кликните на объект, чтобы посмотреть информацию.</p>
        <p>Всего объектов: ${exportFeatures.length}</p>
    </div>
    <div id="map"></div>

    <script>
        ymaps.ready(init);
        function init() {
            var map = new ymaps.Map("map", {
                center:[${center[0]}, ${center[1]}],
                zoom: ${zoom},
                type: "${mapType}",
                controls: ['zoomControl', 'typeSelector', 'fullscreenControl', 'rulerControl']
            });

            // Данные, вшитые из основной программы
            var mapData = ${jsonFeatures};

            mapData.forEach(function(item) {
                var geoObject;

                if (item.type === 'Polygon') {
                    geoObject = new ymaps.Polygon(item.coords, {
                        balloonContent: item.balloonContent
                    }, {
                        strokeColor: item.style.strokeColor,
                        strokeWidth: item.style.strokeWidth,
                        strokeOpacity: item.style.strokeOpacity,
                        fillColor: item.style.fillColor,
                        fillOpacity: 1 // прозрачность уже заложена в HEX цвете (например #FF000033)
                    });
                } else if (item.type === 'LineString') {
                    geoObject = new ymaps.Polyline(item.coords, {
                        balloonContent: item.balloonContent
                    }, {
                        strokeColor: item.style.strokeColor,
                        strokeWidth: item.style.strokeWidth,
                        strokeOpacity: item.style.strokeOpacity
                    });
                }

                if (geoObject) {
                    map.geoObjects.add(geoObject);
                }
            });
        }
    </script>
</body>
</html>`;

        // 3. Создаем файл и скачиваем
        const blob = new Blob([htmlString], { type: "text/html;charset=utf-8" });
        const dateStr = new Date().toISOString().slice(0, 10);
        saveAs(blob, `Интерактивная_карта_${dateStr}.html`);

        showNotification('HTML-карта успешно сохранена', 'success');

    } catch (error) {
        console.error('Ошибка генерации HTML карты:', error);
        showNotification('Ошибка при экспорте HTML карты', 'error');
    } finally {
        hideLoader();
    }
}