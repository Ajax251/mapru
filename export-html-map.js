// export-html-map.js

async function generateStandaloneHtmlMap(allObjectsArray, mapInstance) {
    if (!mapInstance) {
        showNotification('Карта не инициализирована', 'error');
        return;
    }

    showLoader('Сбор данных для HTML-карты...');

    try {
        const center = mapInstance.getCenter();
        const zoom = mapInstance.getZoom();
        const mapType = mapInstance.getType();

        // Собираем все объекты с карты
        const exportFeatures =[];

        allObjectsArray.forEach(obj => {
            if (!obj || !obj.geometry) return;

            // Пропускаем рамки выделения квартала
            if (obj instanceof ymaps.Polygon && obj.options.get('strokeStyle') === 'dash' && !obj.properties.get('isZouit')) {
                return;
            }

            const geometryType = obj.geometry.getType();
            const coordinates = obj.geometry.getCoordinates();
            
            // Забираем полные сырые данные объекта, если они есть
            const featureData = obj.properties.get('featureData') || null;
            const hintContent = obj.properties.get('hintContent') || null;
            const iconContent = obj.properties.get('iconContent') || null;

            if (obj instanceof ymaps.Polygon) {
                exportFeatures.push({
                    type: 'Polygon',
                    coords: coordinates,
                    style: {
                        strokeColor: obj.options.get('strokeColor') || '#FF0000',
                        strokeWidth: obj.options.get('strokeWidth') || 2,
                        strokeOpacity: obj.options.get('strokeOpacity') !== undefined ? obj.options.get('strokeOpacity') : 0.8,
                        fillColor: obj.options.get('fillColor') || '#00000000'
                    },
                    featureData: featureData,
                    hintContent: hintContent
                });
            } else if (obj instanceof ymaps.Polyline) {
                exportFeatures.push({
                    type: 'LineString',
                    coords: coordinates,
                    style: {
                        strokeColor: obj.options.get('strokeColor') || '#FF0000',
                        strokeWidth: obj.options.get('strokeWidth') || 2,
                        strokeOpacity: obj.options.get('strokeOpacity') !== undefined ? obj.options.get('strokeOpacity') : 0.8
                    },
                    featureData: featureData,
                    hintContent: hintContent
                });
            } else if (obj instanceof ymaps.Placemark) {
                // Если это метка (кадастровый номер, нумерация точек или фото)
                const isLabel = !!iconContent;
                const isVertex = obj.properties.get('isVertexPoint'); // точки типа н1
                
                exportFeatures.push({
                    type: 'Placemark',
                    coords: coordinates,
                    isLabel: isLabel,
                    isVertex: isVertex,
                    content: iconContent,
                    preset: obj.options.get('preset'),
                    featureData: featureData,
                    hintContent: hintContent
                });
            }
        });

        // Защита от закрывающих тегов script внутри JSON
        const jsonFeatures = JSON.stringify(exportFeatures).replace(/<\//g, "<\\/");

        // Формируем автономный HTML
        const htmlString = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Интерактивная карта (Экспорт)</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://api-maps.yandex.ru/2.1/?apikey=dde71a0e-b612-44b7-b53b-82533420240f&lang=ru_RU" type="text/javascript"></script>
    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; overflow: hidden; background: #eef2f7; }
        .layout { display: flex; width: 100%; height: 100%; position: relative; }
        #map { flex-grow: 1; height: 100%; position: relative; z-index: 1; }
        
        /* Стили боковой панели */
        .sidebar { 
            width: 400px; 
            background: #ffffff; 
            box-shadow: -5px 0 25px rgba(0,0,0,0.1); 
            z-index: 10; 
            display: flex; 
            flex-direction: column; 
            position: absolute; 
            right: 0; 
            top: 0; 
            height: 100%; 
            transform: translateX(100%); 
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
            border-left: 1px solid #e2e8f0;
        }
        .sidebar.open { transform: translateX(0); }
        
        .sidebar-header { 
            padding: 15px 20px; 
            background: linear-gradient(135deg, #1e3a8a, #3b82f6); 
            color: white; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
        }
        .sidebar-header h3 { margin: 0; font-size: 1.1rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .close-sidebar-btn { background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; }
        .close-sidebar-btn:hover { opacity: 1; }
        
        .sidebar-content { padding: 0; overflow-y: auto; flex-grow: 1; background: #f8fafc; }
        
        /* Таблица свойств */
        .prop-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .prop-table th, .prop-table td { padding: 10px 15px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; word-wrap: break-word; }
        .prop-table th { background: #f1f5f9; color: #475569; width: 40%; font-weight: 600; }
        .prop-table tr:hover td { background: #f8fafc; }
        
        /* Плашка на карте */
        .info-widget { position: absolute; top: 15px; left: 15px; z-index: 10; background: rgba(255,255,255,0.9); backdrop-filter: blur(5px); padding: 15px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.05); }
        .info-widget h4 { margin: 0 0 5px 0; color: #1e293b; font-size: 1rem; }
        .info-widget p { margin: 0; color: #64748b; font-size: 0.85rem; }

        /* Кастомная метка для кадастровых номеров (как в оригинале) */
        .custom-placemark {
            position: absolute; font-weight: 700; color: #ffff00;
            text-shadow: -2px -2px 1px rgba(0,0,0,0.9), 2px -2px 1px rgba(0,0,0,0.9), -2px 2px 1px rgba(0,0,0,0.9), 2px 2px 1px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.8);
            font-family: Arial, sans-serif; user-select: none; letter-spacing: 0.7px;
            transform: translate(-50%, -50%); white-space: nowrap; text-align: center;
        }
        /* Кастомная метка для точек (н1) */
        .numbered-point-label {
            color: #FF0000; font-size: 14px; font-weight: bold; font-family: Arial, sans-serif;
            text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
            user-select: none; transform: translate(-50%, -50%); position: absolute;
        }
    </style>
</head>
<body>
    <div class="layout">
        <div id="map">
            <div class="info-widget">
                <h4>Сводная карта объектов</h4>
                <p><i class="fas fa-hand-pointer"></i> Кликните на объект для деталей</p>
                <p style="margin-top: 5px;"><strong>${exportFeatures.length}</strong> объектов загружено</p>
            </div>
        </div>
        
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h3 id="sidebar-title">Информация об объекте</h3>
                <button class="close-sidebar-btn" id="close-sidebar" title="Закрыть">&times;</button>
            </div>
            <div class="sidebar-content" id="sidebar-content">
                <!-- Сюда вставляется таблица свойств -->
                <div style="padding: 20px; text-align: center; color: #94a3b8;">Выберите объект на карте</div>
            </div>
        </div>
    </div>

    <script>
        ymaps.ready(init);

        function init() {
            var map = new ymaps.Map("map", {
                center: [${center[0]}, ${center[1]}],
                zoom: ${zoom},
                type: "${mapType}",
                controls: ['zoomControl', 'typeSelector', 'fullscreenControl', 'rulerControl']
            });

            var mapData = ${jsonFeatures};
            var labelsArray =[]; // Массив для текстовых меток (чтобы управлять видимостью)

            // Макет для кадастровых номеров (с авто-размером шрифта)
            var CustomPlacemarkLayout = ymaps.templateLayoutFactory.createClass(
                '<div class="custom-placemark" style="font-size: $[properties.fontSize]px;">$[properties.iconContent]</div>',
                {
                    build: function () {
                        this.constructor.superclass.build.call(this);
                        this.updateFontSize();
                    },
                    onMapChange: function () {
                        this.updateFontSize();
                    },
                    updateFontSize: function() {
                        var map = this.getData().options.get('map');
                        if (map) {
                            var zoom = map.getZoom();
                            var fontSize = Math.max(10, Math.min(16, 8 + zoom * 0.4));
                            var el = this.getParentElement().querySelector('.custom-placemark');
                            if (el) el.style.fontSize = fontSize + 'px';
                        }
                    }
                }
            );

            // Макет для точек н1
            var NumberedPointLayout = ymaps.templateLayoutFactory.createClass(
                '<div class="numbered-point-label">$[properties.iconContent]</div>'
            );

            mapData.forEach(function(item) {
                var geoObject;

                // 1. Полигоны
                if (item.type === 'Polygon') {
                    geoObject = new ymaps.Polygon(item.coords, {
                        featureData: item.featureData,
                        hintContent: item.hintContent
                    }, {
                        strokeColor: item.style.strokeColor,
                        strokeWidth: item.style.strokeWidth,
                        strokeOpacity: item.style.strokeOpacity,
                        fillColor: item.style.fillColor,
                        cursor: 'pointer'
                    });
                } 
                // 2. Линии
                else if (item.type === 'LineString') {
                    geoObject = new ymaps.Polyline(item.coords, {
                        featureData: item.featureData,
                        hintContent: item.hintContent
                    }, {
                        strokeColor: item.style.strokeColor,
                        strokeWidth: item.style.strokeWidth,
                        strokeOpacity: item.style.strokeOpacity,
                        cursor: 'pointer'
                    });
                } 
                // 3. Метки (текст / точки)
                else if (item.type === 'Placemark') {
                    if (item.isLabel) {
                        geoObject = new ymaps.Placemark(item.coords, {
                            iconContent: item.content,
                            featureData: item.featureData
                        }, {
                            iconLayout: item.isVertex ? NumberedPointLayout : CustomPlacemarkLayout,
                            visible: map.getZoom() > 14,
                            zIndex: 1000
                        });
                        if (!item.isVertex) {
                            labelsArray.push(geoObject); // Запоминаем для скрытия/показа
                        }
                    } else if (item.preset) {
                        // Обычные точки с пресетом (например islands#redDotIcon)
                        geoObject = new ymaps.Placemark(item.coords, {
                            hintContent: item.hintContent,
                            featureData: item.featureData
                        }, { preset: item.preset });
                    }
                }

                if (geoObject) {
                    // Добавляем обработчик клика для открытия сайдбара (только для полигонов и линий)
                    if (item.type === 'Polygon' || item.type === 'LineString') {
                        geoObject.events.add('click', function (e) {
                            openSidebar(item.featureData, item.hintContent);
                        });
                    }
                    map.geoObjects.add(geoObject);
                }
            });

            // Управление видимостью меток при зуме
            map.events.add('boundschange', function (e) {
                if (e.get('newZoom') !== e.get('oldZoom')) {
                    var zoom = map.getZoom();
                    var isVisible = zoom > 14;
                    labelsArray.forEach(function(label) {
                        label.options.set('visible', isVisible);
                        // Вызываем обновление размера шрифта
                        var layout = label.getOverlaySync() && label.getOverlaySync().getLayoutSync();
                        if (layout && typeof layout.updateFontSize === 'function') {
                            layout.updateFontSize();
                        }
                    });
                }
            });

            // Логика боковой панели
            var sidebar = document.getElementById('sidebar');
            var sidebarContent = document.getElementById('sidebar-content');
            var sidebarTitle = document.getElementById('sidebar-title');

            document.getElementById('close-sidebar').addEventListener('click', function() {
                sidebar.classList.remove('open');
            });

            function openSidebar(featureData, hintContent) {
                sidebarContent.innerHTML = '';
                var html = '<table class="prop-table"><tbody>';
                
                if (featureData && featureData.properties) {
                    var props = featureData.properties;
                    var opts = props.options || {};
                    
                    sidebarTitle.textContent = opts.cad_num || opts.cad_number || opts.reg_numb_border || props.descr || 'Объект';

                    // Основные свойства
                    for (var key in props) {
                        if (key !== 'options' && key !== 'geometry' && !key.startsWith('_')) {
                            var val = props[key] !== null ? props[key] : '-';
                            html += '<tr><th>' + translateKey(key) + '</th><td>' + val + '</td></tr>';
                        }
                    }
                    // Свойства из options (сырые данные Росреестра)
                    html += '<tr><th colspan="2" style="background:#e2e8f0; text-align:center;">Подробные данные ЕГРН</th></tr>';
                    for (var oKey in opts) {
                        var oVal = opts[oKey] !== null ? opts[oKey] : '-';
                        html += '<tr><th>' + translateKey(oKey) + '</th><td>' + oVal + '</td></tr>';
                    }
                } else if (hintContent) {
                    sidebarTitle.textContent = 'Информация';
                    if (typeof hintContent === 'object') {
                        for (var hKey in hintContent) {
                            if (hintContent[hKey]) {
                                html += '<tr><th>' + translateKey(hKey) + '</th><td>' + hintContent[hKey] + '</td></tr>';
                            }
                        }
                    } else {
                        html += '<tr><th>Описание</th><td>' + hintContent + '</td></tr>';
                    }
                } else {
                    sidebarTitle.textContent = 'Объект';
                    html += '<tr><td colspan="2" style="text-align:center;">Нет подробных данных</td></tr>';
                }

                html += '</tbody></table>';
                sidebarContent.innerHTML = html;
                sidebar.classList.add('open');
            }

            // Простой словарь для перевода ключей в читаемый вид
            function translateKey(key) {
                var dict = {
                    'descr': 'Номер / Описание',
                    'categoryName': 'Категория объекта',
                    'readable_address': 'Адрес',
                    'address_readable_address': 'Адрес',
                    'area': 'Площадь',
                    'build_record_area': 'Площадь ОКС',
                    'declared_area': 'Площадь декларированная',
                    'specified_area': 'Площадь уточненная',
                    'cost_value': 'Кадастровая стоимость',
                    'cost_index': 'Удельный показатель (руб/м²)',
                    'permitted_use_established_by_document': 'ВРИ по документу',
                    'land_record_category_type': 'Категория земель',
                    'purpose': 'Назначение',
                    'year_built': 'Год постройки',
                    'materials': 'Материал стен',
                    'floors': 'Этажность',
                    'params_extension': 'Протяженность',
                    'name_by_doc': 'Наименование по документу',
                    'ownership_type': 'Форма собственности',
                    'right_type': 'Тип права',
                    'registration_date': 'Дата регистрации',
                    'land_record_reg_date': 'Дата внесения в ЕГРН'
                };
                return dict[key] || key;
            }
        }
    </script>
</body>
</html>`;

        // Создаем файл и скачиваем его
        const blob = new Blob([htmlString], { type: "text/html;charset=utf-8" });
        const dateStr = new Date().toISOString().slice(0, 10);
        saveAs(blob, `Интерактивная_Карта_${dateStr}.html`);

        showNotification('HTML-карта успешно сформирована и сохранена', 'success', 'check-circle');

    } catch (error) {
        console.error('Ошибка генерации HTML карты:', error);
        showNotification('Ошибка при экспорте HTML карты', 'error', 'exclamation-triangle');
    } finally {
        hideLoader();
    }
}