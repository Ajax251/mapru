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
            let infrastructureType = null;
            
            if (featureData && featureData.properties) {
                const cat = featureData.properties.category;
                const catName = featureData.properties.categoryName || '';
                const purpose = featureData.properties.purpose || '';
                const name = (featureData.properties.params_name || '').toLowerCase();
                
                // Определение типа инфраструктуры
                if (name.includes('газ') || cat === 36385 || purpose.includes('газ') || catName.includes('Газ')) {
                    infrastructureType = 'gas';
                } else if (name.includes('электро') || name.includes('лэп') || cat === 36386 || purpose.includes('электро') || catName.includes('Электрос')) {
                    infrastructureType = 'electric';
                } else if (name.includes('вод') || cat === 36384 || purpose.includes('вод') || catName.includes('Вод')) {
                    infrastructureType = 'water';
                } else if (name.includes('тепл') || cat === 36387 || purpose.includes('тепл') || catName.includes('Тепл')) {
                    infrastructureType = 'heat';
                }
                
                if (obj.properties.get('isBuilding') || cat === 36369 || catName.includes('Здания')) layerType = 'OKS';
                else if (obj.properties.get('isStructure') || cat === 36383 || catName.includes('Сооружения')) layerType = 'Structure';
                else if (obj.properties.get('isZouit') || cat === 36940 || cat === 36315 || cat === 36281 || cat === 36278 || cat === 36314 || catName.includes('Зоны')) layerType = 'ZOUIT';
            }

            if (obj instanceof ymaps.Polygon) {
                exportFeatures.push({
                    type: 'Polygon',
                    layerType: layerType,
                    infrastructureType: infrastructureType,
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
                    infrastructureType: infrastructureType,
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
    <link rel="icon" href="https://img.icons8.com/color/96/map.png" type="image/png">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU" type="text/javascript"></script>
    <style>
        * { box-sizing: border-box; }
        
        body, html { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            overflow: hidden; 
            background: linear-gradient(135deg, #e8ecf1 0%, #f0f4f8 100%);
        }
        
        .layout { 
            display: flex; 
            width: 100%; 
            height: 100%; 
            position: relative; 
        }
        
        #map { 
            flex-grow: 1; 
            height: 100%; 
            position: relative; 
            z-index: 1; 
            background: #1a1a2e;
        }
        
        /* Honeycomb Floor Pattern */
        .honeycomb-floor {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 100%;
            background-color: #4a5568;
            background-image: 
                radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.1) 0%, transparent 70%),
                repeating-linear-gradient(60deg, rgba(79, 70, 229, 0.05) 0px, rgba(79, 70, 229, 0.05) 1px, transparent 1px, transparent 20px),
                repeating-linear-gradient(-60deg, rgba(79, 70, 229, 0.05) 0px, rgba(79, 70, 229, 0.05) 1px, transparent 1px, transparent 20px);
            background-size: 40px 35px;
            opacity: 0.3;
            pointer-events: none;
            z-index: 0;
        }
        
        /* Sidebar Styles */
        .sidebar { 
            width: 450px; 
            max-width: 90vw; 
            background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); 
            box-shadow: -5px 0 35px rgba(0,0,0,0.2); 
            z-index: 1000; 
            display: flex; 
            flex-direction: column; 
            position: absolute; 
            right: 0; 
            top: 0; 
            height: 100%; 
            transform: translateX(100%); 
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
            border-left: 1px solid #cbd5e1; 
        }
        
        .sidebar.open { 
            transform: translateX(0); 
            box-shadow: -10px 0 50px rgba(0,0,0,0.3);
        }
        
        .sidebar-header { 
            padding: 20px 25px; 
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%); 
            color: white; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        
        .sidebar-header h3 { 
            margin: 0; 
            font-size: 1.2rem; 
            font-weight: 700; 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .close-sidebar-btn { 
            background: rgba(255,255,255,0.2); 
            border: none; 
            color: white; 
            font-size: 1.5rem; 
            cursor: pointer; 
            opacity: 0.9; 
            transition: all 0.3s; 
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .close-sidebar-btn:hover { 
            opacity: 1; 
            background: rgba(255,255,255,0.3);
            transform: rotate(90deg);
        }
        
        .sidebar-content { 
            padding: 0; 
            overflow-y: auto; 
            flex-grow: 1; 
            background: #f8fafc; 
        }
        
        .sidebar-content::-webkit-scrollbar {
            width: 8px;
        }
        
        .sidebar-content::-webkit-scrollbar-track {
            background: #f1f5f9;
        }
        
        .sidebar-content::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }
        
        .sidebar-content::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
        
        /* Property Table */
        .prop-table { 
            width: 100%; 
            border-collapse: collapse; 
            font-size: 0.9rem; 
        }
        
        .prop-table th, .prop-table td { 
            padding: 14px 20px; 
            border-bottom: 1px solid #e2e8f0; 
            text-align: left; 
            vertical-align: top; 
            word-wrap: break-word; 
            transition: background 0.2s;
        }
        
        .prop-table th { 
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); 
            color: #475569; 
            width: 45%; 
            font-weight: 700;
            border-right: 1px solid #cbd5e1;
        }
        
        .prop-table tr:hover td { 
            background: linear-gradient(90deg, #f0f9ff 0%, #f8fafc 100%); 
        }
        
        .prop-table tr:last-child td {
            border-bottom: none;
        }
        
        /* Widget Panels */
        .widget-panel { 
            position: absolute; 
            left: 20px; 
            z-index: 100; 
            background: rgba(255,255,255,0.98); 
            backdrop-filter: blur(10px); 
            padding: 18px 22px; 
            border-radius: 16px; 
            box-shadow: 0 8px 32px rgba(0,0,0,0.15); 
            border: 1px solid rgba(255,255,255,0.5);
            transition: all 0.3s ease;
        }
        
        .widget-panel:hover {
            box-shadow: 0 12px 40px rgba(0,0,0,0.2);
            transform: translateY(-2px);
        }
        
        .info-widget { 
            top: 20px; 
            min-width: 280px;
            background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,248,255,0.95) 100%);
        }
        
        .info-widget h4 { 
            margin: 0 0 8px 0; 
            color: #1e293b; 
            font-size: 1.1rem; 
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .info-widget h4 i {
            color: #3b82f6;
        }
        
        .info-widget p { 
            margin: 0; 
            color: #64748b; 
            font-size: 0.9rem; 
            line-height: 1.5;
        }

        .layers-widget { 
            top: 130px; 
            width: 240px; 
            padding: 18px 20px; 
        }
        
        .layers-btn { 
            width: 100%; 
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
            color: white; 
            border: none; 
            padding: 12px 16px; 
            border-radius: 10px; 
            cursor: pointer; 
            font-weight: 700; 
            font-size: 0.95rem; 
            transition: all 0.3s; 
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .layers-btn:hover { 
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
            transform: translateY(-2px);
        }
        
        .layers-list { 
            margin-top: 15px; 
            display: none; 
            flex-direction: column; 
            gap: 10px; 
            font-size: 0.9rem; 
            color: #333; 
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
        }
        
        .layers-list.show { 
            display: flex; 
            animation: slideDown 0.3s ease;
        }
        
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .layers-list label { 
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            gap: 12px; 
            padding: 8px 12px;
            border-radius: 8px;
            transition: background 0.2s;
        }
        
        .layers-list label:hover {
            background: #f1f5f9;
        }
        
        .layers-list input { 
            cursor: pointer; 
            width: 18px;
            height: 18px;
            accent-color: #3b82f6;
        }
        
        .layer-icon {
            width: 24px;
            text-align: center;
            color: #64748b;
        }
        
        /* Infrastructure Type Icons */
        .infra-gas { color: #f59e0b !important; }
        .infra-electric { color: #ef4444 !important; }
        .infra-water { color: #3b82f6 !important; }
        .infra-heat { color: #ef4444 !important; }
        
        /* Custom Placemark */
        .custom-placemark { 
            position: absolute; 
            font-family: 'Segoe UI', sans-serif; 
            user-select: none; 
            text-align: center; 
            font-weight: 700; 
            color: #1e293b; 
            text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 0 4px #fff; 
            transform: translate(-50%, -50%); 
            white-space: nowrap; 
            padding: 4px 10px;
            background: rgba(255,255,255,0.9);
            border-radius: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            border: 1px solid #e2e8f0;
        }
        
        .numbered-point-label { 
            position: absolute; 
            color: #dc2626; 
            font-weight: 800; 
            font-family: Arial, sans-serif; 
            text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff; 
            user-select: none; 
            transform: translate(-50%, -50%); 
            background: rgba(255,255,255,0.95);
            border: 2px solid #dc2626;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        /* 3D Infrastructure Visualization */
        .infrastructure-3d {
            position: absolute;
            pointer-events: none;
            z-index: 50;
        }
        
        .gas-pipe {
            stroke: #f59e0b;
            stroke-width: 4;
            stroke-linecap: round;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        
        .gas-support {
            fill: #92400e;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        
        .electric-line {
            stroke: #ef4444;
            stroke-width: 3;
            stroke-dasharray: 5, 3;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        
        .electric-pole {
            fill: #6b7280;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        
        .electric-wire {
            stroke: #374151;
            stroke-width: 2;
            fill: none;
        }
        
        /* Building 3D Effect */
        .building-3d {
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
        }
        
        /* Loading Animation */
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .loading-indicator {
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        /* Status Badges */
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-active { background: #d1fae5; color: #059669; }
        .status-inactive { background: #fee2e2; color: #dc2626; }
        .status-pending { background: #fef3c7; color: #d97706; }
        
        /* Responsive */
        @media (max-width: 768px) {
            .sidebar { width: 100%; max-width: 100%; }
            .widget-panel { left: 10px; right: 10px; width: auto; }
            .info-widget { top: 10px; }
            .layers-widget { top: 100px; }
        }
    </style>
</head>
<body>
    <div class="layout">
        <div id="map">
            <div class="honeycomb-floor"></div>
            
            <div class="widget-panel info-widget">
                <h4><i class="fas fa-map-marked-alt"></i> Карта объектов</h4>
                <p><i class="fas fa-hand-pointer"></i> Кликните на объект для просмотра деталей</p>
                <p style="margin-top: 8px; font-size: 0.8rem;"><i class="fas fa-calendar"></i> ${todayDate}</p>
            </div>
            
            <div class="widget-panel layers-widget">
                <button class="layers-btn" id="layers-toggle">
                    <i class="fas fa-layer-group"></i> Слои карты
                </button>
                <div id="layers-list" class="layers-list">
                    <label>
                        <span class="layer-icon"><i class="fas fa-square infra-gas"></i></span>
                        <input type="checkbox" class="layer-cb" value="ZU" checked> Земельные участки
                    </label>
                    <label>
                        <span class="layer-icon"><i class="fas fa-building infra-electric"></i></span>
                        <input type="checkbox" class="layer-cb" value="OKS" checked> Здания (ОКС)
                    </label>
                    <label>
                        <span class="layer-icon"><i class="fas fa-bolt infra-electric"></i></span>
                        <input type="checkbox" class="layer-cb" value="Structure" checked> Сооружения
                    </label>
                    <label>
                        <span class="layer-icon"><i class="fas fa-map infra-water"></i></span>
                        <input type="checkbox" class="layer-cb" value="ZOUIT" checked> Зоны и территории
                    </label>
                    <hr style="margin: 8px 0; border: 0; border-top: 1px solid #e2e8f0; width: 100%;">
                    <label>
                        <span class="layer-icon"><i class="fas fa-tag"></i></span>
                        <input type="checkbox" class="layer-cb" value="Labels" checked> Текстовые метки
                    </label>
                    <hr style="margin: 8px 0; border: 0; border-top: 1px solid #e2e8f0; width: 100%;">
                    <label>
                        <span class="layer-icon"><i class="fas fa-fire infra-gas"></i></span>
                        <input type="checkbox" class="layer-cb" value="Gas" checked> Газопроводы
                    </label>
                    <label>
                        <span class="layer-icon"><i class="fas fa-bolt infra-electric"></i></span>
                        <input type="checkbox" class="layer-cb" value="Electric" checked> Электросети
                    </label>
                </div>
            </div>
        </div>
        
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h3 id="sidebar-title"><i class="fas fa-info-circle"></i> Сведения об объекте</h3>
                <button class="close-sidebar-btn" id="close-sidebar" title="Закрыть">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="sidebar-content" id="sidebar-content"></div>
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
            
            map.options.set('minZoom', 10);
            map.options.set('maxZoom', 20);
            
            var mapData = ${jsonFeatures};
            
            var layerGroups = { 
                ZU: [], 
                OKS: [], 
                Structure: [], 
                ZOUIT: [], 
                Labels: [],
                Gas: [],
                Electric: []
            };
            
            var activeLayers = { 
                ZU: true, 
                OKS: true, 
                Structure: true, 
                ZOUIT: true, 
                Labels: true,
                Gas: true,
                Electric: true
            };
            
            var labelsInfoArray = []; 
            var infrastructureObjects = { gas: [], electric: [] };
            
            var activeGeoObject = null;
            var activeGeoObjectOriginalStyle = null;

            // Custom Placemark Layout with better styling
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
                        var m = this.getData().options.get('map');
                        if (m) {
                            var z = m.getZoom();
                            var el = this.getParentElement().querySelector('.custom-placemark');
                            if (el) el.style.fontSize = Math.max(10, Math.min(16, 8 + z * 0.4)) + 'px';
                        }
                    }
                }
            );

            var NumberedPointLayout = ymaps.templateLayoutFactory.createClass(
                '<div class="numbered-point-label">$[properties.iconContent]</div>'
            );

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

            // Create 3D Infrastructure Visualization
            function createInfrastructureVisualization(item, map) {
                if (!item.infrastructureType) return null;
                
                var infraSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                infraSvg.setAttribute('class', 'infrastructure-3d');
                infraSvg.style.width = '100%';
                infraSvg.style.height = '100%';
                infraSvg.style.position = 'absolute';
                infraSvg.style.top = '0';
                infraSvg.style.left = '0';
                infraSvg.style.pointerEvents = 'none';
                
                var infraGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                
                if (item.infrastructureType === 'gas') {
                    // Gas pipeline with supports
                    var pipeLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    pipeLine.setAttribute('class', 'gas-pipe');
                    pipeLine.setAttribute('points', item.coords[0].map(function(c) {
                        var px = map.options.get('projection').toGlobalPixels(c, map.getZoom());
                        return px[0] + ',' + px[1];
                    }).join(' '));
                    infraGroup.appendChild(pipeLine);
                    
                    // Add supports every 50 meters
                    var coords = item.coords[0];
                    for (var i = 0; i < coords.length; i += 5) {
                        var support = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        var px = map.options.get('projection').toGlobalPixels(coords[i], map.getZoom());
                        support.setAttribute('class', 'gas-support');
                        support.setAttribute('x', px[0] - 4);
                        support.setAttribute('y', px[1] - 20);
                        support.setAttribute('width', 8);
                        support.setAttribute('height', 25);
                        infraGroup.appendChild(support);
                    }
                    
                    layerGroups.Gas.push({ svg: infraSvg, group: infraGroup });
                } else if (item.infrastructureType === 'electric') {
                    // Electric line with poles
                    var wireLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    wireLine.setAttribute('class', 'electric-line');
                    wireLine.setAttribute('points', item.coords[0].map(function(c) {
                        var px = map.options.get('projection').toGlobalPixels(c, map.getZoom());
                        return px[0] + ',' + px[1];
                    }).join(' '));
                    infraGroup.appendChild(wireLine);
                    
                    // Add poles
                    var coords = item.coords[0];
                    for (var i = 0; i < coords.length; i += 8) {
                        var pole = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        var px = map.options.get('projection').toGlobalPixels(coords[i], map.getZoom());
                        pole.setAttribute('class', 'electric-pole');
                        pole.setAttribute('x', px[0] - 5);
                        pole.setAttribute('y', px[1] - 35);
                        pole.setAttribute('width', 10);
                        pole.setAttribute('height', 40);
                        infraGroup.appendChild(pole);
                        
                        // Wire sag effect
                        if (i < coords.length - 1) {
                            var wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                            var px1 = map.options.get('projection').toGlobalPixels(coords[i], map.getZoom());
                            var px2 = map.options.get('projection').toGlobalPixels(coords[i+1] || coords[i], map.getZoom());
                            var midX = (px1[0] + px2[0]) / 2;
                            var midY = (px1[1] + px2[1]) / 2 + 10;
                            wire.setAttribute('class', 'electric-wire');
                            wire.setAttribute('d', 'M ' + px1[0] + ',' + (px1[1]-15) + ' Q ' + midX + ',' + midY + ' ' + px2[0] + ',' + (px2[1]-15));
                            infraGroup.appendChild(wire);
                        }
                    }
                    
                    layerGroups.Electric.push({ svg: infraSvg, group: infraGroup });
                }
                
                infraSvg.appendChild(infraGroup);
                document.getElementById('map').appendChild(infraSvg);
                
                return infraSvg;
            }

            // Process map data
            mapData.forEach(function(item) {
                var geoObject;

                if (item.type === 'Polygon' || item.type === 'LineString') {
                    var options = {
                        strokeColor: item.style.strokeColor, 
                        strokeWidth: item.style.strokeWidth,
                        strokeOpacity: item.style.strokeOpacity, 
                        cursor: 'pointer',
                        preset: item.infrastructureType ? 'islands#blueCircleIcon' : null
                    };
                    
                    if (item.type === 'Polygon') {
                        options.fillColor = item.style.fillColor;
                        if (item.layerType === 'OKS') {
                            // Enhanced building fill
                            options.fillColor = item.style.fillColor.replace('00000000', 'rgba(59, 130, 246, 0.3)') || 'rgba(59, 130, 246, 0.3)';
                        }
                    }
                    
                    geoObject = item.type === 'Polygon' 
                        ? new ymaps.Polygon(item.coords, { featureData: item.featureData, infrastructureType: item.infrastructureType }, options)
                        : new ymaps.Polyline(item.coords, { featureData: item.featureData, infrastructureType: item.infrastructureType }, options);
                        
                    // Add 3D infrastructure visualization
                    if (item.infrastructureType && item.type === 'LineString') {
                        createInfrastructureVisualization(item, map);
                    }
                        
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
                                strokeWidth: Math.max(activeGeoObjectOriginalStyle.strokeWidth + 2, 4),
                                strokeOpacity: 1,
                                fillColor: 'rgba(0, 191, 255, 0.3)' 
                            });
                            activeGeoObject = target;
                            openSidebar(item.featureData, item.infrastructureType);
                        }
                    });
                    
                    // Hover effect
                    geoObject.events.add('mouseenter', function(e) {
                        var target = e.get('target');
                        if (target !== activeGeoObject) {
                            target.options.set('strokeOpacity', 1);
                        }
                    });
                    
                    geoObject.events.add('mouseleave', function(e) {
                        var target = e.get('target');
                        if (target !== activeGeoObject) {
                            target.options.set('strokeOpacity', item.style.strokeOpacity);
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

            // Layer toggle
            document.getElementById('layers-toggle').addEventListener('click', function() {
                document.getElementById('layers-list').classList.toggle('show');
            });

            // Layer visibility controls
            document.querySelectorAll('.layer-cb').forEach(function(cb) {
                cb.addEventListener('change', function(e) {
                    var type = e.target.value;
                    var isVisible = e.target.checked;
                    activeLayers[type] = isVisible;

                    if (type === 'Labels') {
                        updateLabelsVisibility(); 
                    } else if (type === 'Gas' || type === 'Electric') {
                        layerGroups[type].forEach(function(obj) { 
                            obj.svg.style.display = isVisible ? 'block' : 'none'; 
                        });
                    } else {
                        layerGroups[type].forEach(function(obj) { 
                            obj.options.set('visible', isVisible); 
                        });
                    }
                });
            });

            // Labels visibility with collision detection
            function updateLabelsVisibility() {
                if (!activeLayers.Labels) {
                    layerGroups.Labels.forEach(function(pm) { pm.options.set('visible', false); });
                    return;
                }

                var currentZoom = map.getZoom();
                var projection = map.options.get('projection');
                var visiblePlacemarks = [];

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
                                placemark: pm, 
                                area: areaInPixels,
                                bbox: { 
                                    left: pixelCenter[0] - textWidth/2, 
                                    right: pixelCenter[0] + textWidth/2, 
                                    top: pixelCenter[1] - fSize, 
                                    bottom: pixelCenter[1] + fSize 
                                }
                            });
                        }
                    } else {
                        pm.options.set('visible', false);
                    }
                });

                // Collision detection
                for (var i = 0; i < visiblePlacemarks.length; i++) {
                    var curr = visiblePlacemarks[i];
                    if (!curr.placemark.options.get('visible')) continue;
                    for (var j = 0; j < i; j++) {
                        var other = visiblePlacemarks[j];
                        if (!other.placemark.options.get('visible')) continue;
                        if (curr.bbox.left < other.bbox.right && 
                            curr.bbox.right > other.bbox.left && 
                            curr.bbox.top < other.bbox.bottom && 
                            curr.bbox.bottom > other.bbox.top) {
                            if (curr.area < other.area) {
                                curr.placemark.options.set('visible', false);
                            } else {
                                other.placemark.options.set('visible', false);
                            }
                        }
                    }
                }
            }

            map.events.add('boundschange', function (e) {
                if (e.get('newZoom') !== e.get('oldZoom')) {
                    updateLabelsVisibility();
                    // Update infrastructure visualization on zoom
                    layerGroups.Gas.concat(layerGroups.Electric).forEach(function(obj) {
                        if (obj.svg.parentNode) {
                            obj.svg.parentNode.removeChild(obj.svg);
                        }
                    });
                    layerGroups.Gas = [];
                    layerGroups.Electric = [];
                    mapData.forEach(function(item) {
                        if (item.infrastructureType && item.type === 'LineString' && activeLayers[item.infrastructureType === 'gas' ? 'Gas' : 'Electric']) {
                            createInfrastructureVisualization(item, map);
                        }
                    });
                }
            });
            
            setTimeout(updateLabelsVisibility, 500);

            // Sidebar functionality
            var sidebar = document.getElementById('sidebar');
            var sidebarContent = document.getElementById('sidebar-content');
            var sidebarTitle = document.getElementById('sidebar-title');

            document.getElementById('close-sidebar').addEventListener('click', function() {
                sidebar.classList.remove('open');
                clearSelection(); 
            });

            // Enhanced property dictionary
            var propDict = {
                'status': 'Статус', 
                'common_data_status': 'Статус данных',
                'declared_area': 'Площадь декларированная (м²)', 
                'specified_area': 'Площадь уточненная (м²)',
                'build_record_area': 'Площадь ОКС (м²)', 
                'params_extension': 'Протяженность (м)',
                'permitted_use_established_by_document': 'Разрешенное использование', 
                'purpose': 'Назначение',
                'land_record_category_type': 'Категория земель', 
                'quarter_cad_number': 'Кадастровый квартал',
                'cadastralDistrictsCode': 'Кадастровый округ', 
                'cadastral_district': 'Кадастровый округ',
                'readable_address': 'Адрес', 
                'address_readable_address': 'Адрес',
                'name_by_doc': 'Наименование по документу', 
                'params_name': 'Наименование',
                'content_restrict_encumbrances': 'Ограничения (Обременения)',
                'legal_act_document_date': 'Дата документа', 
                'legal_act_document_issuer': 'Орган, выдавший документ',
                'legal_act_document_name': 'Вид документа', 
                'legal_act_document_number': 'Номер документа',
                'year_built': 'Год постройки', 
                'materials': 'Материал стен', 
                'floors': 'Этажность',
                'ownership_type': 'Форма собственности', 
                'right_type': 'Тип права',
                'registration_date': 'Дата регистрации', 
                'land_record_reg_date': 'Дата внесения в ЕГРН',
                'cost_application_date': 'Дата применения стоимости', 
                'cost_determination_date': 'Дата определения стоимости',
                'cost_index': 'Удельный показатель (руб/м²)', 
                'cost_registration_date': 'Дата регистрации стоимости',
                'cost_value': 'Кадастровая стоимость (руб.)', 
                'determination_couse': 'Основание стоимости',
                'land_record_type': 'Тип объекта', 
                'subtype': 'Подтип', 
                'previously_posted': 'Учет',
                'categoryName': 'Категория объекта',
                'build_record_type_value': 'Тип здания',
                'build_record_registration_date': 'Дата внесения в ЕГРН',
                'building_name': 'Наименование',
                'infrastructureType': 'Тип инфраструктуры'
            };

            var skipKeys = ['id', 'category', 'systemInfo', 'externalKey', 'interactionId', 'subcategory', 'options', 'geometry', 'label', 'cost_approvement_date', 'land_record_area', 'land_record_area_declaration', 'land_record_area_verified', 'cad_num', 'cad_number', 'reg_numb_border', 'descr'];

            var topKeys = ['status', 'common_data_status', 'specified_area', 'declared_area', 'build_record_area', 'params_extension', 'permitted_use_established_by_document', 'purpose', 'land_record_category_type', 'quarter_cad_number', 'cadastral_district', 'readable_address', 'address_readable_address', 'name_by_doc', 'params_name', 'building_name', 'content_restrict_encumbrances', 'legal_act_document_date', 'legal_act_document_issuer', 'legal_act_document_name', 'legal_act_document_number'];
            
            var costKeys = ['cost_application_date', 'cost_determination_date', 'cost_index', 'cost_registration_date', 'cost_value', 'determination_couse'];

            function openSidebar(featureData, infrastructureType) {
                if (!featureData || !featureData.properties) return;
                
                var props = featureData.properties;
                var opts = props.options || {};
                var allData = Object.assign({}, props, opts); 
                
                var iconClass = 'fa-info-circle';
                if (infrastructureType === 'gas') iconClass = 'fa-fire';
                else if (infrastructureType === 'electric') iconClass = 'fa-bolt';
                else if (allData.isBuilding) iconClass = 'fa-building';
                
                sidebarTitle.innerHTML = '<i class="fas ' + iconClass + '"></i> ' + (opts.cad_num || opts.cad_number || opts.reg_numb_border || props.descr || 'Объект');

                var html = '<table class="prop-table"><tbody>';
                
                function renderRow(k, v) {
                    if (v === null || v === undefined || v === '-' || v === '' || typeof v === 'object') return;
                    var tKey = propDict[k] || k;
                    
                    // Special formatting for status
                    if (k === 'status' || k === 'common_data_status') {
                        var statusClass = 'status-active';
                        if (v.toLowerCase().includes('неакт')) statusClass = 'status-inactive';
                        else if (v.toLowerCase().includes('ожида')) statusClass = 'status-pending';
                        v = '<span class="status-badge ' + statusClass + '">' + v + '</span>';
                    }
                    
                    // Special formatting for cost
                    if (k.includes('cost_value') || k.includes('cost')) {
                        v = '<strong style="color: #1e3a8a;">' + v + '</strong>';
                    }
                    
                    html += '<tr><th>' + tKey + '</th><td>' + v + '</td></tr>';
                    delete allData[k]; 
                }

                topKeys.forEach(function(k) { if (allData.hasOwnProperty(k)) renderRow(k, allData[k]); });

                for (var k in allData) {
                    if (skipKeys.indexOf(k) !== -1 || k.startsWith('_') || costKeys.indexOf(k) !== -1) continue;
                    renderRow(k, allData[k]);
                }

                var hasCost = costKeys.some(function(k) { return allData.hasOwnProperty(k) && allData[k] !== null && allData[k] !== ''; });
                if (hasCost) {
                    html += '<tr><th colspan="2" style="background:linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-top: 2px solid #93c5fd; text-align:center; font-size: 1rem; padding: 16px; color: #1e40af; font-weight: 700;">' +
                            '<i class="fas fa-coins"></i> Сведения о стоимости</th></tr>';
                    costKeys.forEach(function(k) { if (allData.hasOwnProperty(k)) renderRow(k, allData[k]); });
                }
                
                // Infrastructure info
                if (infrastructureType) {
                    var infraName = infrastructureType === 'gas' ? 'Газопровод' : 
                                   infrastructureType === 'electric' ? 'Электросеть' :
                                   infrastructureType === 'water' ? 'Водопровод' : 'Теплосеть';
                    var infraIcon = infrastructureType === 'gas' ? 'fa-fire' :
                                   infrastructureType === 'electric' ? 'fa-bolt' :
                                   infrastructureType === 'water' ? 'fa-tint' : 'fa-temperature-high';
                    html += '<tr><th colspan="2" style="background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-top: 2px solid #fcd34d; text-align:center; font-size: 1rem; padding: 16px; color: #92400e; font-weight: 700;">' +
                            '<i class="fas ' + infraIcon + '"></i> ' + infraName + '</th></tr>';
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