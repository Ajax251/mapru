// export-html-map.js

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
        
        // Получаем текущую дату для заголовка
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

            // Определяем тип слоя для панели управления
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
    <link rel="icon" href="https://img.icons8.com/?size=100&id=4gm1ppixZZIY&format=png&color=000000" type="image/png">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU" type="text/javascript"></script>
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

        .layers-widget { top: 90px; width: 200px; padding: 10px 15px; }
        .layers-btn { width: 100%; background: #3b82f6; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9rem; transition: 0.2s; }
        .layers-btn:hover { background: #2563eb; }
        .layers-list { margin-top: 10px; display: none; flex-direction: column; gap: 8px; font-size: 0.85rem; color: #333; }
        .layers-list.show { display: flex; }
        .layers-list label { cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .layers-list input { cursor: pointer; }

        .custom-placemark { position: absolute; font-family: sans-serif; user-select: none; text-align: center; font-weight: 700; color: #000; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 2px #fff; transform: translate(-50%, -50%); white-space: nowrap; }
        .numbered-point-label { position: absolute; color: #FF0000; font-weight: bold; font-family: Arial, sans-serif; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff; user-select: none; transform: translate(-50%, -50%); }
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

    <script>
        ymaps.ready(init);

        function init() {
            var map = new ymaps.Map("map", { center: [${center[0]}, ${center[1]}], zoom: ${zoom}, type: "${mapType}", controls:['zoomControl', 'typeSelector', 'fullscreenControl', 'rulerControl'] });
            var mapData = ${jsonFeatures};
            
            var layerGroups = { ZU: [], OKS: [], Structure: [], ZOUIT:[], Labels:[] };
            var activeLayers = { ZU: true, OKS: true, Structure: true, ZOUIT: true, Labels: true };
            var labelsInfoArray =[]; 
            
            var activeGeoObject = null;
            var activeGeoObjectOriginalStyle = null;

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
                        
                    geoObject.events.add('click', function (e) {
                        e.stopPropagation();
                        var target = e.get('target');

                        if (activeGeoObject === target) {
                            clearSelection();
                            document.getElementById('sidebar').classList.remove('open');
                        } else {
                            clearSelection();
                            activeGeoObjectOriginalStyle = {
                                strokeColor: target.options.get('strokeColor'),
                                strokeWidth: target.options.get('strokeWidth'),
                                strokeOpacity: target.options.get('strokeOpacity'),
                                fillColor: target.options.get('fillColor')
                            };
                            target.options.set({
                                strokeColor: '#00BFFF',
                                strokeWidth: Math.max(activeGeoObjectOriginalStyle.strokeWidth + 1, 3),
                                strokeOpacity: 1,
                                fillColor: 'rgba(0, 191, 255, 0.2)' 
                            });
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

            document.getElementById('layers-toggle').addEventListener('click', function() {
                document.getElementById('layers-list').classList.toggle('show');
            });

            document.querySelectorAll('.layer-cb').forEach(function(cb) {
                cb.addEventListener('change', function(e) {
                    var type = e.target.value;
                    var isVisible = e.target.checked;
                    activeLayers[type] = isVisible;

                    if (type === 'Labels') {
                        updateLabelsVisibility(); 
                    } else {
                        layerGroups[type].forEach(function(obj) { obj.options.set('visible', isVisible); });
                    }
                });
            });

            function updateLabelsVisibility() {
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
                if (e.get('newZoom') !== e.get('oldZoom')) updateLabelsVisibility();
            });
            setTimeout(updateLabelsVisibility, 500);

            var sidebar = document.getElementById('sidebar');
            var sidebarContent = document.getElementById('sidebar-content');
            var sidebarTitle = document.getElementById('sidebar-title');

            document.getElementById('close-sidebar').addEventListener('click', function() {
                sidebar.classList.remove('open');
                clearSelection(); 
            });

            // Расширенный словарь переводов
            var propDict = {
                'status': 'Статус', 'common_data_status': 'Статус данных',
                'declared_area': 'Площадь декларированная (м²)', 'specified_area': 'Площадь уточненная (м²)',
                'build_record_area': 'Площадь ОКС (м²)', 'params_extension': 'Протяженность (м)',
                'permitted_use_established_by_document': 'Разрешенное использование', 'purpose': 'Назначение',
                'land_record_category_type': 'Категория земель', 'quarter_cad_number': 'Кадастровый квартал',
                'cadastralDistrictsCode': 'Кадастровый округ', 'cadastral_district': 'Кадастровый округ',
                'adastralDistrictsCode': 'Кадастровый округ',
                'readable_address': 'Адрес', 'address_readable_address': 'Адрес',
                'name_by_doc': 'Наименование по документу', 'params_name': 'Наименование',
                'content_restrict_encumbrances': 'Ограничения (Обременения)',
                'legal_act_document_date': 'Дата документа', 'legal_act_document_issuer': 'Орган, выдавший документ',
                'legal_act_document_name': 'Вид документа', 'legal_act_document_number': 'Номер документа',
                'year_built': 'Год постройки', 'materials': 'Материал стен', 'floors': 'Этажность',
                'ownership_type': 'Форма собственности', 'right_type': 'Тип права',
                'registration_date': 'Дата регистрации', 'land_record_reg_date': 'Дата внесения в ЕГРН',
                'cost_application_date': 'Дата применения стоимости', 'cost_determination_date': 'Дата определения стоимости',
                'cost_index': 'Удельный показатель (руб/м²)', 'cost_registration_date': 'Дата регистрации стоимости',
                'cost_value': 'Кадастровая стоимость (руб.)', 'determination_couse': 'Основание стоимости',
                'land_record_type': 'Тип объекта', 'subtype': 'Подтип', 'previously_posted': 'Учет',
                'categoryName': 'Категория объекта',
                'build_record_type_value': 'Тип здания',
                'build_record_registration_date': 'Дата внесения в ЕГРН',
                'building_name': 'Наименование'
            };

            var skipKeys =['id', 'category', 'systemInfo', 'externalKey', 'interactionId', 'subcategory', 'options', 'geometry', 'label', 'cost_approvement_date', 'land_record_area', 'land_record_area_declaration', 'land_record_area_verified', 'cad_num', 'cad_number', 'reg_numb_border', 'descr'];

            var topKeys =['status', 'common_data_status', 'specified_area', 'declared_area', 'build_record_area', 'params_extension', 'permitted_use_established_by_document', 'purpose', 'land_record_category_type', 'quarter_cad_number', 'cadastral_district', 'readable_address', 'address_readable_address', 'name_by_doc', 'params_name', 'building_name', 'content_restrict_encumbrances', 'legal_act_document_date', 'legal_act_document_issuer', 'legal_act_document_name', 'legal_act_document_number'];
            
            var costKeys =['cost_application_date', 'cost_determination_date', 'cost_index', 'cost_registration_date', 'cost_value', 'determination_couse'];

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
                    html += '<tr><th colspan="2" style="background:#f1f5f9; border-top: 2px solid #cbd5e1; text-align:center; font-size: 0.95rem; padding: 12px; color: #1e3a8a;">Сведения о стоимости</th></tr>';
                    costKeys.forEach(function(k) { if (allData.hasOwnProperty(k)) renderRow(k); });
                }

                html += '</tbody></table>';
                sidebarContent.innerHTML = html;
                sidebar.classList.add('open');
            }
        }
    </script>
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