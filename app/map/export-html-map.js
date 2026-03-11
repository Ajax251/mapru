async function generateStandaloneHtmlMap(allObjectsArray, mapInstance, mapOffsetX, mapOffsetY) {
    if (!mapInstance) {
        showNotification('Карта не инициализирована', 'error');
        return;
    }

    showLoader('Сбор данных для HTML-карты...');

    try {
        const center = mapInstance.getCenter();
        const zoom = mapInstance.getZoom();
        const mapType = mapInstance.getType();
        
        const todayDate = new Date().toLocaleDateString('ru-RU');

        const uniqueObjects = Array.from(new Set(allObjectsArray));
        const exportFeatures = [];

        const revertOffset = (coord) => [
            coord[0] + (mapOffsetY * 0.000008983),
            coord[1] + (mapOffsetX * 0.000008983)
        ];

        uniqueObjects.forEach(obj => {
            if (!obj || !obj.geometry) return;

            if (obj instanceof ymaps.Polygon && obj.options.get('strokeStyle') === 'dash' && !obj.properties.get('isZouit')) {
                return;
            }

            const geometryType = obj.geometry.getType();
            const coordinates = obj.geometry.getCoordinates();
            const featureData = obj.properties.get('featureData') || null;
            const hintContent = obj.properties.get('hintContent') || null;
            const iconContent = obj.properties.get('iconContent') || null;

            let layerType = 'ZU'; 
            if (featureData && featureData.properties) {
                const cat = featureData.properties.category;
                const catName = featureData.properties.categoryName || '';
                if (obj.properties.get('isBuilding') || cat === 36369 || catName.includes('Здания')) layerType = 'OKS';
                else if (obj.properties.get('isStructure') || cat === 36383 || catName.includes('Сооружения')) layerType = 'Structure';
                else if (obj.properties.get('isZouit') || cat === 36940 || cat === 36315 || cat === 36281 || cat === 36278 || cat === 36314 || catName.includes('Зоны')) layerType = 'ZOUIT';
            }

            if (obj instanceof ymaps.Polygon) {
                exportFeatures.push({
                    type: 'Polygon',
                    layerType: layerType,
                    coords: coordinates.map(ring => ring.map(revertOffset)),
                    style: {
                        strokeColor: obj.options.get('strokeColor') || '#FF0000',
                        strokeWidth: obj.options.get('strokeWidth') || 2,
                        strokeOpacity: obj.options.get('strokeOpacity') !== undefined ? obj.options.get('strokeOpacity') : 0.8,
                        fillColor: obj.options.get('fillColor') || '#00000000'
                    },
                    featureData: featureData
                });
            } else if (obj instanceof ymaps.Polyline) {
                exportFeatures.push({
                    type: 'LineString',
                    layerType: layerType,
                    coords: coordinates.map(revertOffset),
                    style: {
                        strokeColor: obj.options.get('strokeColor') || '#FF0000',
                        strokeWidth: obj.options.get('strokeWidth') || 2,
                        strokeOpacity: obj.options.get('strokeOpacity') !== undefined ? obj.options.get('strokeOpacity') : 0.8
                    },
                    featureData: featureData
                });
            } else if (obj instanceof ymaps.Placemark) {
                const isVertex = obj.properties.get('isVertexPoint'); 
                if (iconContent) {
                    let parentPolyCoords = null;
                    if (obj.polygon && obj.polygon.geometry) {
                         parentPolyCoords = obj.polygon.geometry.getCoordinates().map(ring => ring.map(revertOffset));
                    }
                    exportFeatures.push({
                        type: 'Label',
                        layerType: 'Labels',
                        coords: revertOffset(coordinates),
                        content: iconContent,
                        isVertex: isVertex,
                        parentPolyCoords: parentPolyCoords
                    });
                }
            }
        });

        const jsonFeatures = JSON.stringify(exportFeatures).replace(/<\//g, "<\\/");

        const htmlString = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Интерактивная карта объектов</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU" type="text/javascript"><\/script>
    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; overflow: hidden; background: #eef2f7; }
        .layout { display: flex; width: 100%; height: 100%; position: relative; }
        #map { flex-grow: 1; height: 100%; position: relative; z-index: 1; }
        
        .sidebar { width: 420px; max-width: 90vw; background: #ffffff; box-shadow: -5px 0 25px rgba(0,0,0,0.15); z-index: 10; display: flex; flex-direction: column; position: absolute; right: 0; top: 0; height: 100%; transform: translateX(100%); transition: transform 0.3s ease; border-left: 1px solid #cbd5e1; }
        .sidebar.open { transform: translateX(0); }
        .sidebar-header { padding: 15px 20px; background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; display: flex; justify-content: space-between; align-items: center; }
        .sidebar-header h3 { margin: 0; font-size: 1.1rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .close-sidebar-btn { background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; }
        .close-sidebar-btn:hover { opacity: 1; }
        .sidebar-content { padding: 0; overflow-y: auto; flex-grow: 1; background: #f8fafc; }
        
        .prop-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .prop-table th, .prop-table td { padding: 10px 15px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; word-wrap: break-word; }
        .prop-table th { background: #f1f5f9; color: #475569; width: 45%; font-weight: 600; }
        .prop-table tr:hover td { background: #f8fafc; }
        
        .widget-panel { position: absolute; left: 15px; z-index: 10; background: rgba(255,255,255,0.95); backdrop-filter: blur(5px); padding: 15px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.05); }
        .info-widget { top: 15px; }
        .info-widget h4 { margin: 0 0 5px 0; color: #1e293b; font-size: 1rem; }
        .info-widget p { margin: 0; color: #64748b; font-size: 0.85rem; }

        .layers-widget { top: 90px; width: 230px; padding: 10px 15px; }
        .layers-btn { width: 100%; background: #3b82f6; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9rem; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;}
        .layers-btn:hover { background: #2563eb; }
        .print-btn { background: #10b981; margin-top: 10px; }
        .print-btn:hover { background: #059669; }
        .print-btn.active { background: #dc2626; }
        .print-btn.active:hover { background: #b91c1c; }

        .layers-list { margin-top: 10px; display: none; flex-direction: column; gap: 8px; font-size: 0.85rem; color: #333; }
        .layers-list.show { display: flex; }
        .layers-list label { cursor: pointer; display: flex; align-items: center; gap: 8px; }

        .custom-placemark { position: absolute; font-family: sans-serif; user-select: none; text-align: center; font-weight: 700; color: #000; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff; transform: translate(-50%, -50%); white-space: nowrap; }
        .numbered-point-label { position: absolute; color: #FF0000; font-weight: bold; font-family: Arial, sans-serif; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff; user-select: none; transform: translate(-50%, -50%); }

        /* Modal Styles */
        .callout-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; justify-content: center; align-items: center; backdrop-filter: blur(3px); }
        .callout-modal { background: #fff; padding: 25px; border-radius: 12px; width: 450px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); font-family: sans-serif; }
        .callout-modal h3 { margin-top: 0; color: #1e3a8a; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 600; font-size: 14px; color: #333;}
        .radio-group { display: flex; gap: 15px; margin-bottom: 10px; }
        .radio-group label { font-weight: normal; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .callout-modal input[type="text"] { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        .callout-modal .btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        .callout-modal button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        .btn-ok { background: #3b82f6; color: white; }
        .btn-ok:hover { background: #2563eb; }
        .btn-cancel { background: #e2e8f0; color: #333; }
        .btn-cancel:hover { background: #cbd5e1; }
    </style>
</head>
<body>
    <div class="layout">
        <div id="map">
            <div class="widget-panel info-widget">
                <h4>Карта объектов - ${todayDate}</h4>
                <p><i class="fas fa-hand-pointer"></i> Кликните на объект для деталей</p>
            </div>
            
            <div class="widget-panel layers-widget">
                <button class="layers-btn" id="layers-toggle"><i class="fas fa-layer-group"></i> Слои карты</button>
                <div id="layers-list" class="layers-list">
                    <label><input type="checkbox" class="layer-cb" value="ZU" checked> Земельные участки</label>
                    <label><input type="checkbox" class="layer-cb" value="OKS" checked> Здания (ОКС)</label>
                    <label><input type="checkbox" class="layer-cb" value="Structure" checked> Сооружения</label>
                    <label><input type="checkbox" class="layer-cb" value="ZOUIT" checked> Зоны и территории</label>
                    <hr style="margin: 2px 0; border: 0; border-top: 1px solid #ccc; width: 100%;">
                    <label><input type="checkbox" class="layer-cb" value="Labels" checked> Текстовые метки</label>
                </div>
                <button class="layers-btn print-btn" id="callouts-toggle"><i class="fas fa-tags"></i> Выноски</button>
            </div>
        </div>
        
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h3 id="sidebar-title">Сведения об объекте</h3>
                <button class="close-sidebar-btn" id="close-sidebar" title="Закрыть">&times;</button>
            </div>
            <div class="sidebar-content" id="sidebar-content"></div>
        </div>
    </div>

  <!-- Модальное окно выносок -->
    <div class="callout-modal-overlay" id="calloutModal">
        <div class="callout-modal">
            <h3>Настройка выносок</h3>
            
            <div class="form-group">
                <label>Какие участки отобразить?</label>
                <div class="radio-group">
                    <label><input type="radio" name="calloutMode" value="all"> Все участки</label>
                    <label><input type="radio" name="calloutMode" value="declared" checked> Только декларированные</label>
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px; color: #1e40af;">
                    <input type="checkbox" id="showCadNumCheck" checked> <b>Кадастровый номер</b>
                </label>
                <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-left: 25px; margin-bottom: 10px; align-items: center;">
                    <label style="font-size: 12px; cursor: pointer;"><input type="checkbox" id="boldCadNumCheck" checked> Жирный</label>
                    <label style="font-size: 12px; cursor: pointer;"><input type="checkbox" id="shortCadNumCheck"> Окончание (напр. :15)</label>
                    <label style="font-size: 12px;">Размер: <input type="number" id="sizeCadNum" value="13" min="9" max="24" style="width: 50px; padding: 2px 5px;"></label>
                </div>

                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px; color: #1e40af;">
                    <input type="checkbox" id="showAddressCheck" checked> <b>Адрес</b>
                </label>
                <div style="display: flex; gap: 15px; margin-left: 25px; align-items: center;">
                    <label style="font-size: 12px; cursor: pointer;"><input type="checkbox" id="boldAddressCheck"> Жирный</label>
                    <label style="font-size: 12px;">Размер: <input type="number" id="sizeAddress" value="11" min="8" max="24" style="width: 50px; padding: 2px 5px;"></label>
                </div>
            </div>

            <div class="form-group" id="trimGroup">
                <label>Скрыть текст адреса до слов (включительно):</label>
                <input type="text" id="trimTextInput" placeholder="">
                <div style="font-size: 11px; color: #888; margin-top: 4px;">
                    Будет показана только часть адреса после этого текста.
                </div>
            </div>

            <div class="btns">
                <button class="btn-cancel" id="calloutCancel">Отмена</button>
                <button class="btn-ok" id="calloutApply">Выполнить</button>
            </div>
        </div>
    </div>

    <script>
        ymaps.ready(init);

        function init() {
            var map = new ymaps.Map("map", { center: [${center[0]}, ${center[1]}], zoom: ${zoom}, type: "${mapType}", controls:['zoomControl', 'typeSelector', 'fullscreenControl', 'rulerControl'] });
            var mapData = ${jsonFeatures};
            
            var layerGroups = { ZU: [], OKS: [], Structure: [], ZOUIT:[], Labels:[] };
            var activeLayers = { ZU: true, OKS: true, Structure: true, ZOUIT: true, Labels: true };
            var labelsInfoArray = []; 
            
            var activeGeoObject = null;
            var activeGeoObjectOriginalStyle = null;

               var CalloutLayout = ymaps.templateLayoutFactory.createClass(
                '<div style="position: absolute; pointer-events: none;">' +
                    '<svg width="600" height="600" style="position: absolute; overflow: visible; left: 0; top: 0;">' +
                        '<path d="M0,0 L$[properties.elbowX],$[properties.elbowY] L$[properties.shelfEndX],$[properties.elbowY]" stroke="#000" stroke-width="1.5" fill="none" />' +
                        '<circle cx="0" cy="0" r="3" fill="#FF0000" />' +
                    '</svg>' +
                    '<div style="position: absolute; left: $[properties.textLeft]px; top: $[properties.textTop]px; transform: translateY(-100%); background: #fff; border: 1.5px solid #000; padding: 3px 6px; color: #000; white-space: nowrap; box-shadow: 2px 2px 5px rgba(0,0,0,0.3); line-height: 1; box-sizing: border-box;">' +
                        '{% if properties.showCn %}' +
                            '<div style="font-family: Arial; font-size: $[properties.cnSize]px; font-weight: $[properties.cnWeight];">$[properties.cn]</div>' +
                        '{% endif %}' +
                        '{% if properties.addr %}' +
                            '<div style="font-family: Arial; font-size: $[properties.addrSize]px; font-weight: $[properties.addrWeight]; margin-top: {% if properties.showCn %}4px{% else %}0px{% endif %};">$[properties.addr]</div>' +
                        '{% endif %}' +
                    '</div>' +
                '</div>'
            );

            var CustomPlacemarkLayout = ymaps.templateLayoutFactory.createClass(
                '<div class="custom-placemark" style="font-size: $[properties.fontSize]px;">$[properties.iconContent]</div>',
                {
                    build: function () { this.constructor.superclass.build.call(this); this.updateFontSize(); },
                    onMapChange: function () { this.updateFontSize(); },
                    updateFontSize: function() {
                        var m = this.getData().options.get('map');
                        if (m) {
                            var z = m.getZoom();
                            var el = this.getParentElement().querySelector('.custom-placemark');
                            if (el) el.style.fontSize = Math.max(10, Math.min(16, 8 + z * 0.4)) + 'px';
                        }
                    }
                }
            );

            var NumberedPointLayout = ymaps.templateLayoutFactory.createClass('<div class="numbered-point-label" style="font-size: 14px;">$[properties.iconContent]</div>');

            function clearSelection() {
                if (activeGeoObject && activeGeoObjectOriginalStyle) {
                    activeGeoObject.options.set({
                        strokeColor: activeGeoObjectOriginalStyle.strokeColor,
                        strokeWidth: activeGeoObjectOriginalStyle.strokeWidth,
                        strokeOpacity: activeGeoObjectOriginalStyle.strokeOpacity,
                        fillColor: activeGeoObjectOriginalStyle.fillColor
                    });
                }
                activeGeoObject = null;
                activeGeoObjectOriginalStyle = null;
            }

            mapData.forEach(function(item) {
                var geoObject;
                if (item.type === 'Polygon' || item.type === 'LineString') {
                    var options = {
                        strokeColor: item.style.strokeColor, strokeWidth: item.style.strokeWidth,
                        strokeOpacity: item.style.strokeOpacity, cursor: 'pointer'
                    };
                    if (item.type === 'Polygon') options.fillColor = item.style.fillColor;
                    
                    geoObject = item.type === 'Polygon' 
                        ? new ymaps.Polygon(item.coords, { featureData: item.featureData }, options)
                        : new ymaps.Polyline(item.coords, { featureData: item.featureData }, options);
                        
                    // Сохраняем базовый стиль для восстановления после отключения выносок
                    geoObject._baseStyle = {
                        strokeColor: item.style.strokeColor,
                        strokeWidth: item.style.strokeWidth,
                        strokeOpacity: item.style.strokeOpacity,
                        fillColor: item.style.fillColor || '#00000000'
                    };
                        
                    geoObject.events.add('click', function (e) {
                        e.stopPropagation();
                        var target = e.get('target');
                        if (activeGeoObject === target) {
                            clearSelection();
                            document.getElementById('sidebar').classList.remove('open');
                        } else {
                            clearSelection();
                            activeGeoObjectOriginalStyle = {
                                strokeColor: target.options.get('strokeColor'), strokeWidth: target.options.get('strokeWidth'),
                                strokeOpacity: target.options.get('strokeOpacity'), fillColor: target.options.get('fillColor')
                            };
                            target.options.set({ strokeColor: '#00BFFF', strokeWidth: Math.max(activeGeoObjectOriginalStyle.strokeWidth + 1, 3), strokeOpacity: 1, fillColor: 'rgba(0, 191, 255, 0.2)' });
                            activeGeoObject = target;
                            openSidebar(item.featureData);
                        }
                    });
                } else if (item.type === 'Label') {
                    geoObject = new ymaps.Placemark(item.coords, { iconContent: item.content }, {
                        iconLayout: item.isVertex ? NumberedPointLayout : CustomPlacemarkLayout,
                        zIndex: item.isVertex ? 1100 : 1000,
                        visible: map.getZoom() > 14
                    });
                    if (!item.isVertex) labelsInfoArray.push({ placemark: geoObject, polyCoords: item.parentPolyCoords });
                }

                if (geoObject) {
                    layerGroups[item.layerType].push(geoObject);
                    map.geoObjects.add(geoObject);
                }
            });

            map.events.add('click', function () {
                clearSelection();
                document.getElementById('sidebar').classList.remove('open');
            });

            // --- Обработка слоев ---
            document.getElementById('layers-toggle').addEventListener('click', function() {
                document.getElementById('layers-list').classList.toggle('show');
            });

            document.querySelectorAll('.layer-cb').forEach(function(cb) {
                cb.addEventListener('change', function(e) {
                    var type = e.target.value;
                    var isVisible = e.target.checked;
                    activeLayers[type] = isVisible;
                    if (type === 'Labels') updateLabelsVisibility(); 
                    else layerGroups[type].forEach(function(obj) { obj.options.set('visible', isVisible); });
                });
            });

            function updateLabelsVisibility() {
                if (isCalloutModeActive) {
                    // В режиме выносок прячем стандартные метки принудительно
                    layerGroups.Labels.forEach(function(pm) { pm.options.set('visible', false); });
                    return;
                }
                if (!activeLayers.Labels) {
                    layerGroups.Labels.forEach(function(pm) { pm.options.set('visible', false); });
                    return;
                }
                var currentZoom = map.getZoom();
                var projection = map.options.get('projection');
                var visiblePlacemarks =[];
                labelsInfoArray.forEach(function(labelObj) {
                    var pm = labelObj.placemark;
                    var areaInPixels = 1000; 
                    if (labelObj.polyCoords && labelObj.polyCoords[0]) {
                        var polyBounds = ymaps.util.bounds.fromPoints(labelObj.polyCoords[0]);
                        var px1 = projection.toGlobalPixels(polyBounds[0], currentZoom);
                        var px2 = projection.toGlobalPixels(polyBounds[1], currentZoom);
                        areaInPixels = Math.abs(px2[0] - px1[0]) * Math.abs(px2[1] - px1[1]);
                    }
                    if (areaInPixels > 500 || currentZoom > 16) {
                        if (map.geoObjects.indexOf(pm) !== -1) {
                            pm.options.set('visible', true);
                            var fSize = Math.max(10, Math.min(16, 8 + currentZoom * 0.4));
                            var textWidth = fSize * (pm.properties.get('iconContent') || "").length * 0.6;
                            var pixelCenter = projection.toGlobalPixels(pm.geometry.getCoordinates(), currentZoom);
                            visiblePlacemarks.push({
                                placemark: pm, area: areaInPixels,
                                bbox: { left: pixelCenter[0] - textWidth/2, right: pixelCenter[0] + textWidth/2, top: pixelCenter[1] - fSize, bottom: pixelCenter[1] + fSize }
                            });
                        }
                    } else {
                        pm.options.set('visible', false);
                    }
                });
                for (var i = 0; i < visiblePlacemarks.length; i++) {
                    var curr = visiblePlacemarks[i];
                    if (!curr.placemark.options.get('visible')) continue;
                    for (var j = 0; j < i; j++) {
                        var other = visiblePlacemarks[j];
                        if (!other.placemark.options.get('visible')) continue;
                        if (curr.bbox.left < other.bbox.right && curr.bbox.right > other.bbox.left && curr.bbox.top < other.bbox.bottom && curr.bbox.bottom > other.bbox.top) {
                            if (curr.area < other.area) curr.placemark.options.set('visible', false);
                            else other.placemark.options.set('visible', false);
                        }
                    }
                }
            }

            map.events.add('boundschange', function (e) {
                if (e.get('newZoom') !== e.get('oldZoom')) {
                    updateLabelsVisibility();
                    if (isCalloutModeActive) buildCallouts(); // Перерисовываем выноски при зуме
                }
            });
            setTimeout(updateLabelsVisibility, 500);

            // --- Логика Выносок ---
            var isCalloutModeActive = false;
            var drawnCallouts = [];
            
         var calloutsToggleBtn = document.getElementById('callouts-toggle');
            var calloutModal = document.getElementById('calloutModal');
            var trimInput = document.getElementById('trimTextInput');
            var showAddrCheck = document.getElementById('showAddressCheck');

            // --- НОВОЕ: Функция автоопределения текста для обрезки ---
            function getAutoTrimString() {
                var counts = {};
                layerGroups['ZU'].forEach(function(poly) {
                    var fd = poly.properties.get('featureData');
                    if (fd && fd.properties && fd.properties.options && fd.properties.options.readable_address) {
                        var parts = fd.properties.options.readable_address.split(',');
                        if (parts.length >= 3) {
                            // Берем 3-й элемент с конца
                            var target = parts[parts.length - 3].trim();
                            counts[target] = (counts[target] || 0) + 1;
                        }
                    }
                });
                var maxStr = "";
                var maxVal = 0;
                for (var k in counts) {
                    if (counts[k] > maxVal) { 
                        maxVal = counts[k]; 
                        maxStr = k; 
                    }
                }
                return maxStr;
            }

            calloutsToggleBtn.addEventListener('click', function() {
                if (isCalloutModeActive) {
                    disableCalloutMode();
                } else {
                    var selectedText = window.getSelection().toString().trim();
                    
                    if (selectedText) {
                        // Если есть выделенный текст - берем его
                        trimInput.value = selectedText;
                    } else if (!trimInput.value) {
                        // Если поле пустое - предлагаем автоопределенный вариант
                        trimInput.value = getAutoTrimString();
                    }
                    // Если в поле уже что-то введено (и ничего не выделено), оставляем старое значение

                    calloutModal.style.display = 'flex';
                }
            });

            document.getElementById('calloutCancel').addEventListener('click', function() {
                calloutModal.style.display = 'none';
            });

            document.getElementById('calloutApply').addEventListener('click', function() {
                calloutModal.style.display = 'none';
                enableCalloutMode();
            });

            showAddrCheck.addEventListener('change', function() {
                document.getElementById('trimGroup').style.display = this.checked ? 'block' : 'none';
            });

            function isDeclared(featureData) {
                if (!featureData || !featureData.properties || !featureData.properties.options) return false;
                var o = featureData.properties.options;
                var isVerified = o.specified_area || o.land_record_area_verified;
                var hasDeclared = o.declared_area || o.land_record_area_declaration || o.land_record_area;
                return !isVerified && !!hasDeclared;
            }

            function trimAddress(address, trimStr) {
                if (!trimStr || !address) return address;
                var idx = address.toLowerCase().indexOf(trimStr.toLowerCase());
                if (idx !== -1) {
                    var newAddr = address.substring(idx + trimStr.length);
                    return newAddr.replace(/^[\\s.,;:_\\-]+|[\\s.,;:_\\-]+$/g, '');
                }
                return address;
            }

            function disableCalloutMode() {
                isCalloutModeActive = false;
                calloutsToggleBtn.classList.remove('active');
                calloutsToggleBtn.innerHTML = '<i class="fas fa-tags"></i> Печатные выноски';
                
                // Удаляем выноски
                drawnCallouts.forEach(function(c) { map.geoObjects.remove(c); });
                drawnCallouts = [];

                // Восстанавливаем стили полигонов
                layerGroups['ZU'].forEach(function(poly) {
                    if (poly._baseStyle) {
                        poly.options.set({
                            strokeOpacity: poly._baseStyle.strokeOpacity,
                            fillOpacity: poly._baseStyle.fillColor !== '#00000000' ? 0.8 : 0
                        });
                    }
                });
                
                // Возвращаем обычные метки
                updateLabelsVisibility();
            }

            function enableCalloutMode() {
                isCalloutModeActive = true;
                calloutsToggleBtn.classList.add('active');
                calloutsToggleBtn.innerHTML = '<i class="fas fa-times"></i> Отключить выноски';
                updateLabelsVisibility(); // Скроет стандартные метки
                buildCallouts();
            }

function buildCallouts() {
                drawnCallouts.forEach(function(c) { map.geoObjects.remove(c); });
                drawnCallouts = [];

                var mode = document.querySelector('input[name="calloutMode"]:checked').value;
                var trimText = trimInput.value.trim();
                var showAddress = showAddrCheck.checked;
                var showCadNum = document.getElementById('showCadNumCheck').checked;
                var shortCadNum = document.getElementById('shortCadNumCheck').checked;
                
                // Чтение параметров шрифта
                var cnSize = parseInt(document.getElementById('sizeCadNum').value) || 13;
                var cnWeight = document.getElementById('boldCadNumCheck').checked ? 'bold' : 'normal';
                var addrSize = parseInt(document.getElementById('sizeAddress').value) || 11;
                var addrWeight = document.getElementById('boldAddressCheck').checked ? 'bold' : 'normal';

                // Виртуальный контекст для точного расчета размеров текста (Collision detection)
                var ctx = document.createElement("canvas").getContext("2d");

                var projection = map.options.get('projection');
                var zoom = map.getZoom();
                var occupiedRects = [];

                layerGroups['ZU'].forEach(function(poly) {
                    var fd = poly.properties.get('featureData');
                    var isDecl = isDeclared(fd);
                    
                    var isTarget = (mode === 'all') || (mode === 'declared' && isDecl);

                    if (!isTarget) {
                        // Тусклый контур
                        poly.options.set('strokeOpacity', 0.2);
                        poly.options.set('fillOpacity', 0);
                    } else {
                        // Яркий контур
                        poly.options.set('strokeOpacity', 1.0);
                        // Оставляем заливку прозрачной или делаем легкой
                        poly.options.set('fillOpacity', 0.1);

                        // --- Формируем данные выноски ---
                         var cadNum = "Без номера";
                        var addr = "";
                        if (fd && fd.properties) {
                            var o = fd.properties.options || {};
                            cadNum = o.cad_num || o.cad_number || fd.properties.descr || cadNum;
                            addr = o.readable_address || "";
                        }

                        // Сокращаем кадастровый номер, если нужно
                        if (showCadNum && shortCadNum && cadNum && cadNum.indexOf(':') !== -1) {
                            var parts = cadNum.split(':');
                            cadNum = ':' + parts[parts.length - 1];
                        }

                        var finalAddr = "";
                        if (showAddress && addr) {
                            finalAddr = trimText ? trimAddress(addr, trimText) : addr;
                        }


                        // --- Динамический расчет размеров бокса ---
                     var cnWidth = 0, addrWidth = 0;
                        var boxHeight = 6;  // padding top+bottom (3px + 3px)
                        var boxWidth = 14;  // padding left+right (6px + 6px) + borders
                        
                        if (showCadNum && cadNum) {
                            ctx.font = cnWeight + " " + cnSize + "px Arial";
                            cnWidth = ctx.measureText(cadNum).width;
                            boxHeight += cnSize; // У нас line-height: 1, поэтому высота равна размеру шрифта
                        }
                        if (showAddress && finalAddr) {
                            ctx.font = addrWeight + " " + addrSize + "px Arial";
                            addrWidth = ctx.measureText(finalAddr).width;
                            boxHeight += addrSize;
                            if (showCadNum) boxHeight += 4; // margin-top между строками
                        }
                        
                        boxWidth += Math.ceil(Math.max(cnWidth, addrWidth));
                        boxHeight = Math.ceil(boxHeight);
                        
                        if (!showCadNum && (!showAddress || !finalAddr)) {
                            boxWidth = 0; boxHeight = 0;
                        }

                        // --- Ищем точку привязки ---
                        var bounds = poly.geometry.getBounds();
                        var center = [(bounds[0][0]+bounds[1][0])/2, (bounds[0][1]+bounds[1][1])/2];
                        if (!poly.geometry.contains(center)) {
                            center = poly.geometry.getCoordinates()[0][0];
                        }

                        var currentPx = projection.toGlobalPixels(center, zoom);

                        // --- Алгоритм расстановки (Collision Detection) ---
                        var angleOffsets = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0, 3.0, 4.0, -4.0];
                        var lengthsToCheck = [40, 70, 110];

                        var baseAngle = -Math.PI / 4; // По умолчанию вправо-вверх
                        var bestParams = null;

                        searchLoop:
                        for (var i = 0; i < lengthsToCheck.length; i++) {
                            var len = lengthsToCheck[i];
                     for (var j = 0; j < angleOffsets.length; j++) {
                                var angle = baseAngle + angleOffsets[j];
                                var elbowX = Math.round(Math.cos(angle) * len);
                                var elbowY = Math.round(Math.sin(angle) * len);
                                
                                var shelfLength = boxWidth; // Полочка должна быть равна ширине коробки
                                var isRightSide = elbowX >= 0;
                                var shelfEndX = isRightSide ? (elbowX + shelfLength) : (elbowX - shelfLength);
                                
                                var textLeft = isRightSide ? elbowX : (elbowX - shelfLength);
                                var textTop = elbowY;
                                
                                var globalLeft = currentPx[0] + textLeft;
                                var globalTop = currentPx[1] + textTop - boxHeight;

                                var candidateRect = {
                                    left: globalLeft, right: globalLeft + boxWidth,
                                    top: globalTop, bottom: globalTop + boxHeight
                                };

                                var collision = false;
                                for (var k = 0; k < occupiedRects.length; k++) {
                                    var occ = occupiedRects[k];
                                    if (!(candidateRect.right < occ.left - 5 || 
                                          candidateRect.left > occ.right + 5 || 
                                          candidateRect.bottom < occ.top - 5 || 
                                          candidateRect.top > occ.bottom + 5)) {
                                        collision = true;
                                        break;
                                    }
                                }

                                if (!collision) {
                                    occupiedRects.push(candidateRect);
                                    bestParams = { elbowX: elbowX, elbowY: elbowY, shelfEndX: shelfEndX, textLeft: textLeft, textTop: textTop };
                                    break searchLoop;
                                }
                            }
                        }

                        if (!bestParams) {
                            // Если места нет, ставим как попало (справа сверху)
                            var ex = 40, ey = -40;
                            bestParams = { elbowX: ex, elbowY: ey, shelfEndX: ex + boxWidth, textLeft: ex, textTop: ey };
                        }

               // Создаем Placemark
                        var callout = new ymaps.Placemark(center, {
                            showCn: showCadNum,
                            cn: cadNum,
                            cnSize: cnSize,
                            cnWeight: cnWeight,
                            addr: finalAddr,
                            addrSize: addrSize,
                            addrWeight: addrWeight,
                            elbowX: bestParams.elbowX,
                            elbowY: bestParams.elbowY,
                            shelfEndX: bestParams.shelfEndX,
                            textLeft: bestParams.textLeft,
                            textTop: bestParams.textTop
                        }, {
                            iconLayout: CalloutLayout,
                            zIndex: 2000,
                            interactivityModel: 'default#transparent'
                        });

                        map.geoObjects.add(callout);
                        drawnCallouts.push(callout);
                    }
                });
            }

            // --- Боковая панель (без изменений) ---
            var sidebar = document.getElementById('sidebar');
            var sidebarContent = document.getElementById('sidebar-content');
            var sidebarTitle = document.getElementById('sidebar-title');

            document.getElementById('close-sidebar').addEventListener('click', function() {
                sidebar.classList.remove('open');
                clearSelection(); 
            });

            var propDict = {
                'status': 'Статус', 'common_data_status': 'Статус данных',
                'declared_area': 'Площадь декларированная (м²)', 'specified_area': 'Площадь уточненная (м²)',
                'build_record_area': 'Площадь ОКС (м²)', 'params_extension': 'Протяженность (м)',
                'permitted_use_established_by_document': 'Разрешенное использование', 'purpose': 'Назначение',
                'land_record_category_type': 'Категория земель', 'quarter_cad_number': 'Кадастровый квартал',
                'cadastral_district': 'Кадастровый округ', 'readable_address': 'Адрес', 'address_readable_address': 'Адрес',
                'name_by_doc': 'Наименование по документу', 'params_name': 'Наименование',
                'content_restrict_encumbrances': 'Ограничения', 'year_built': 'Год постройки', 
                'materials': 'Материал стен', 'floors': 'Этажность', 'ownership_type': 'Форма собственности', 
                'right_type': 'Тип права', 'land_record_reg_date': 'Дата внесения в ЕГРН',
                'cost_value': 'Кадастровая стоимость (руб.)', 'building_name': 'Наименование'
            };

            var skipKeys =['id', 'category', 'systemInfo', 'options', 'geometry', 'label', 'cost_approvement_date', 'land_record_area', 'land_record_area_declaration', 'land_record_area_verified', 'cad_num', 'cad_number', 'reg_numb_border', 'descr'];
            var topKeys =['status', 'specified_area', 'declared_area', 'build_record_area', 'params_extension', 'permitted_use_established_by_document', 'purpose', 'land_record_category_type', 'readable_address', 'address_readable_address', 'name_by_doc', 'params_name', 'building_name', 'content_restrict_encumbrances'];
            var costKeys =['cost_value', 'cost_index'];

            function openSidebar(featureData) {
                if (!featureData || !featureData.properties) return;
                var props = featureData.properties;
                var opts = props.options || {};
                var allData = Object.assign({}, props, opts); 
                
                sidebarTitle.textContent = opts.cad_num || opts.cad_number || opts.reg_numb_border || props.descr || 'Объект';

                var html = '<table class="prop-table"><tbody>';
                function renderRow(k) {
                    var val = allData[k];
                    if (val === null || val === undefined || val === '-' || val === '' || typeof val === 'object') return;
                    var tKey = propDict[k] || k;
                    html += '<tr><th>' + tKey + '</th><td>' + val + '</td></tr>';
                    delete allData[k]; 
                }

                topKeys.forEach(function(k) { if (allData.hasOwnProperty(k)) renderRow(k); });
                for (var k in allData) {
                    if (skipKeys.indexOf(k) !== -1 || k.startsWith('_') || costKeys.indexOf(k) !== -1) continue;
                    renderRow(k);
                }

                var hasCost = costKeys.some(function(k) { return allData.hasOwnProperty(k) && allData[k] !== null && allData[k] !== ''; });
                if (hasCost) {
                    html += '<tr><th colspan="2" style="background:#f1f5f9; text-align:center; color:#1e3a8a;">Сведения о стоимости</th></tr>';
                    costKeys.forEach(function(k) { if (allData.hasOwnProperty(k)) renderRow(k); });
                }

                html += '</tbody></table>';
                sidebarContent.innerHTML = html;
                sidebar.classList.add('open');
            }
        }
    <\/script>
</body>
</html>`;

        const activeQuarter = window.currentQuarterNumber || '';
        const prefix = activeQuarter ? `${activeQuarter.replace(/:/g, '_')} ` : '';
        
        const blob = new Blob([htmlString], { type: "text/html;charset=utf-8" });
        const dateStr = new Date().toISOString().slice(0, 10);
        saveAs(blob, `${prefix}Интерактивная_карта_${dateStr}.html`);

        showNotification('HTML-карта успешно сохранена', 'success');

    } catch (error) {
        console.error('Ошибка генерации HTML карты:', error);
        showNotification('Ошибка при экспорте HTML карты', 'error');
    } finally {
        hideLoader();
    }
}