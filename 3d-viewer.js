window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");
    setTimeout(() => {
        try {
            // ====================================================================
            // 1. НАСТРОЙКА ПРОЕКЦИИ И ПОИСК ЦЕНТРА
            // ====================================================================
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels: [], buildings: [], structures: [], zouits: [] };
            
            const to3857 = (yandexCoord) => {
                if (!yandexCoord || typeof yandexCoord[0] !== 'number') return [0, 0];
                const trueLat = yandexCoord[0] + (window.mapOffsetY * 0.000008983);
                const trueLon = yandexCoord[1] + (window.mapOffsetX * 0.000008983);
                return window.proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            };

            if (!window.quickReportTargetObjects || window.quickReportTargetObjects.length === 0) {
                throw new Error("Нет исходного объекта для построения сцены.");
            }

            window.quickReportTargetObjects.forEach(obj => {
                if (!obj || !obj.geometry) return;
                const coords = obj.geometry.getCoordinates();
                const type = obj.geometry.getType();
                let rings = [];
                if (type === 'Point') rings = [[coords]];
                else if (type === 'LineString') rings = [coords];
                else if (type === 'Polygon') rings = coords;
                else if (type === 'MultiPolygon') rings = coords.flat();

                rings.forEach(ring => {
                    ring.forEach(c => {
                        const pt = to3857(c);
                        if (!isNaN(pt[0]) && !isNaN(pt[1])) {
                            minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
                            minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
                        }
                    });
                });
            });

            if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
            const originX = (minX + maxX) / 2;
            const originY = (minY + maxY) / 2;

            // ====================================================================
            // 2. УМНЫЙ АНАЛИЗАТОР СВОЙСТВ
            // ====================================================================
            const analyzeFeature = (f, category) => {
                const p = f.properties || {};
                const o = p.options || {};
                const descr = p.descr || '';
                const purpose = o.purpose || o.params_purpose || '';
                const name = o.name || o.params_name || o.building_name || o.name_by_doc || '';
                
                const text = (descr + ' ' + name + ' ' + purpose).toLowerCase();
                
                let meta = {
                    id: o.cad_num || o.cad_number || o.reg_numb_border || descr || '',
                    name: name || purpose || descr || 'Объект',
                    rawText: text,
                    area: o.build_record_area || o.area || o.specified_area || o.declared_area || o.land_record_area || '',
                    hasExtendedData: !!(purpose || name || o.build_record_area || o.year_built || o.floors),
                    isParcel: false,
                    isSpatial: p._isSpatial !== false,
                };
                
                if (meta.area && !isNaN(parseFloat(meta.area))) {
                    meta.area = parseFloat(meta.area).toLocaleString('ru-RU') + ' м²';
                } else if (o.params_extension) {
                    meta.area = o.params_extension + ' м (длина)';
                }
                
                if (category === 'building') {
                    let defaultFloors = 1;
                    if (text.includes('многоквартир') || text.includes('мкд')) defaultFloors = 9;
                    else if (text.includes('жило') || text.includes('дом')) defaultFloors = 2;
                    else if (text.includes('школ') || text.includes('больниц')) defaultFloors = 3;
                    
                    meta.floors = parseInt(o.floors) || defaultFloors;
                    meta.height = meta.floors * 3.5;
                }
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('воздушн');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && meta.isWater);
                    meta.diameter = parseFloat(o.diameter) || (meta.isGas ? 0.3 : 0.4);
                }
                return meta;
            };

            const processFeatureArray = (featuresArray, type) => {
                const result = [];
                (featuresArray || []).forEach(f => {
                    const meta = analyzeFeature(f, type);
                    
                    if (!meta.isSpatial) {
                        result.push({ type: 'Point', polygons: [], meta: meta });
                        return;
                    }

                    if (!f.geometry || !f.geometry.coordinates) return;
                    let ringsList = [];
                    if (f.geometry.type === 'Polygon') ringsList = [f.geometry.coordinates];
                    else if (f.geometry.type === 'MultiPolygon') ringsList = f.geometry.coordinates;
                    else if (f.geometry.type.includes('Line')) {
                        ringsList = f.geometry.type === 'LineString' ? [[f.geometry.coordinates]] : f.geometry.coordinates.map(c => [c]);
                    }
                    
                    const localPolys = ringsList.map(poly => poly.map(ring => ring.map(c => {
                        if (!c || typeof c[0] !== 'number') return { x: 0, y: 0 };
                        return { x: c[0] - originX, y: c[1] - originY };
                    })));
                    
                    result.push({
                        type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon',
                        polygons: localPolys,
                        meta: meta
                    });
                });
                return result;
            };

            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates();
                const type = obj.geometry.getType();
                const isTargetParcel = obj.properties.get('isParcelInQuarter') || obj.properties.get('isFoundInArea') || (obj.properties.get('featureData') && obj.properties.get('featureData').properties.category === 36368);
                let rings = [];
                if (type === 'Point') rings = [[coords]];
                else if (type === 'LineString') rings = [coords];
                else if (type === 'Polygon') rings = coords;
                else if (type === 'MultiPolygon') rings = coords.flat();

                const localPoly = rings.map(ring => ring.map(c => {
                    const pt = to3857(c); return { x: pt[0] - originX, y: pt[1] - originY };
                }));
                allLocalFeatures.target.push({
                    type: (type === 'Polygon' || type === 'MultiPolygon') ? 'Polygon' : 'Line',
                    polygons: [localPoly],
                    meta: { isParcel: isTargetParcel, name: 'Целевой объект', id: obj.properties.get('cadastralNumber') || '', isSpatial: true }
                });
            });
            
            allLocalFeatures.parcels = processFeatureArray(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFeatureArray(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFeatureArray(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFeatureArray(window.zouitFeaturesData, 'zouit');

            const safeDataString = JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

            // ====================================================================
            // 4. СОЗДАНИЕ UI (Модальное окно + Iframe)
            // ====================================================================
            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();
            
            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '2.5%', left: '2.5%', width: '95%', height: '95%',
                backgroundColor: '#ffffff', borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 25px 80px rgba(0, 0, 0, 0.4)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid #cbd5e1', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });
            
            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '12px 20px', background: '#ffffff',
                color: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '16px', fontFamily: 'system-ui, -apple-system, sans-serif',
                borderBottom: '1px solid #e2e8f0'
            });
            header.innerHTML = '<span style="display:flex; align-items:center;"><i class="fas fa-cube" style="color:#3b82f6; font-size:20px; margin-right:10px;"></i> Кадастровая 3D Модель</span>';
            
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex'; btnContainer.style.gap = '8px';
            const createWinBtn = (iconClass, hoverColor, bgColor = '#f1f5f9') => {
                const btn = document.createElement('button');
                btn.innerHTML = `<i class="${iconClass}"></i>`;
                Object.assign(btn.style, {
                    background: bgColor, border: 'none', color: '#64748b', fontSize: '14px',
                    cursor: 'pointer', width: '32px', height: '32px',
                    borderRadius: '6px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                btn.onmouseenter = () => { btn.style.background = hoverColor; btn.style.color = '#fff'; };
                btn.onmouseleave = () => { btn.style.background = bgColor; btn.style.color = '#64748b'; };
                return btn;
            };
            
            const minBtn = createWinBtn('fas fa-minus', '#3b82f6');
            const closeBtn = createWinBtn('fas fa-times', '#ef4444');
            
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#87CEEB' });
            
            let isMinimized = false;
            minBtn.onclick = () => {
                if (!isMinimized) {
                    modal.style.width = '320px'; modal.style.height = '56px';
                    modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px';
                    modal.style.borderRadius = '12px';
                    iframe.style.display = 'none';
                    minBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
                } else {
                    modal.style.width = '95%'; modal.style.height = '95%';
                    modal.style.top = '2.5%'; modal.style.left = '2.5%'; modal.style.bottom = 'auto';
                    modal.style.borderRadius = '16px';
                    setTimeout(() => iframe.style.display = 'block', 300);
                    minBtn.innerHTML = '<i class="fas fa-minus"></i>';
                }
                isMinimized = !isMinimized;
            };
            closeBtn.onclick = () => modal.remove();
            
            btnContainer.appendChild(minBtn);
            btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer);
            modal.appendChild(header);

            // ====================================================================
            // THREE.JS HTML КОНТЕНТ ДЛЯ IFRAME
            // ====================================================================
            const srcDocContent = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
body { margin: 0; overflow: hidden; background: #87CEEB; font-family: "Segoe UI", system-ui, sans-serif; }
#ui-panel { position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); backdrop-filter: blur(10px); width: 260px; z-index: 100; border: 1px solid #e2e8f0; }
h3 { margin-top: 0; margin-bottom: 15px; color: #1e293b; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; font-weight: 600; }
.layer-control { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; padding: 4px; border-radius: 6px; transition: background 0.2s; }
.layer-control:hover { background: #f1f5f9; }
.layer-control input { margin-right: 12px; cursor: pointer; width: 16px; height: 16px; accent-color: #3b82f6; }
.layer-control label { cursor: pointer; font-size: 13px; color: #334155; font-weight: 500; }
.color-box { width: 14px; height: 14px; display: inline-block; margin-right: 10px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0; }
.info-text { position: absolute; bottom: 20px; right: 20px; background: rgba(255,255,255,0.9); color: #333; padding: 10px 15px; border-radius: 8px; font-size: 12px; font-weight: 600; pointer-events: none; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
.legend-item { display: flex; align-items: center; font-size: 11px; margin-top: 5px; color: #64748b;}
#loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 16px; font-weight: 600; background: rgba(59, 130, 246, 0.9); padding: 15px 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); text-align: center; }
</style>
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"></script>
<script type="importmap">
{"imports": {
  "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
}}
</script>
</head>
<body>
<div id="ui-panel">
    <h3>Слои сцены</h3>
    <div class="layer-control"><input type="checkbox" id="t-target" checked><div class="color-box" style="background: #ef4444;"></div><label for="t-target">Целевой объект</label></div>
    <div class="layer-control"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background: #a8d5ba;"></div><label for="t-parcels">Земельные участки</label></div>
    <div class="layer-control"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background: #f1f5f9;"></div><label for="t-buildings">Здания (ОКС)</label></div>
    <div class="layer-control"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background: #fbbf24;"></div><label for="t-structures">Инженерия / Сети</label></div>
    <div class="layer-control"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background: rgba(168, 85, 247, 0.4);"></div><label for="t-zouit">ЗОУИТ</label></div>
    <div class="layer-control" style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px;"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background: #fff; border: 2px solid #3b82f6;"></div><label for="t-labels">Подписи объектов</label></div>
    
    <div style="margin-top: 15px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px; color: #1e293b;">Связанные объекты (без координат):</div>
        <div class="legend-item"><div class="color-box" style="background: #fcd34d; border-radius: 50%; width: 10px; height: 10px;"></div> Парящие модели (есть данные)</div>
        <div class="legend-item"><div class="color-box" style="background: #8b5cf6; width: 4px; height: 12px; margin-left:3px; margin-right:11px;"></div> Колышки (нет данных)</div>
    </div>
</div>
<div class="info-text">ЛКМ: вращение | ПКМ: панорама | Колесо: масштаб</div>
<div id="loading">Построение 3D архитектуры...</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

try {
    const data = ${safeDataString};
    const animateables = []; 

    // ==========================================
    // СПРАВОЧНИК ТИПОВ ЗДАНИЙ
    // ==========================================
    const BUILDING_DICT = {
        education: {
            keys: ['школ', 'детск', 'сад', 'учебн', 'институт', 'образоват', 'ясли'],
            wall: 0xfcd34d, base: 0x92400e, roof: 0x1e293b, win: 0x93c5fd, winType: 'ribbon', parapet: true
        },
        medical: {
            keys: ['больниц', 'поликлиник', 'мед', 'здрав', 'госпитал', 'фап', 'амбулатор'],
            wall: 0xffffff, base: 0x94a3b8, roof: 0xcbd5e1, win: 0x7dd3fc, winType: 'standard', parapet: true, addon: 'cross'
        },
        mkd: {
            keys: ['многоквартирный', 'мкд', 'общежити', 'квартир'],
            wall: 0xe2e8f0, base: 0x475569, roof: 0x334155, win: 0x3b82f6, winType: 'dense', parapet: true
        },
        private: {
            keys: ['жилой дом', 'индивидуальн', 'частн', 'дачн', 'садов'],
            wall: 0xfde68a, base: 0x78350f, roof: 0x7f1d1d, win: 0x60a5fa, winType: 'standard', parapet: false, hippedRoof: true
        },
        commercial: {
            keys: ['магазин', 'торгов', 'офис', 'бизнес', 'тц', 'трц', 'коммерч'],
            wall: 0x6ee7b7, base: 0x064e3b, roof: 0x1f2937, win: 0x1e3a8a, winType: 'large', parapet: true
        },
        industrial: {
            keys: ['склад', 'цех', 'завод', 'производств', 'промышлен', 'гараж', 'ангар'],
            wall: 0x94a3b8, base: 0x334155, roof: 0x475569, win: null, winType: 'none', parapet: false
        },
        default: {
            wall: 0xf1f5f9, base: 0x64748b, roof: 0x334155, win: 0x93c5fd, winType: 'minimal', parapet: true
        }
    };

    function getBuildingStyle(rawText) {
        for (const [type, config] of Object.entries(BUILDING_DICT)) {
            if (config.keys && config.keys.some(k => rawText.includes(k))) return config;
        }
        return BUILDING_DICT.default;
    }

    // СЦЕНА И КАМЕРА
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe);
    scene.fog = new THREE.FogExp2(0xdbeafe, 0.004);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(40, 60, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; 
    controls.target.set(0, 0, 0);

    // ОСВЕЩЕНИЕ
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.4));
    
    const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.2);
    sunLight.position.set(100, 150, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.top = 150;
    sunLight.shadow.camera.bottom = -150;
    sunLight.shadow.camera.left = -150;
    sunLight.shadow.camera.right = 150;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // ЗЕМЛЯ (Матовая)
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(1000, 200, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = 0.05;
    scene.add(grid);

    // КОМПАС
    function createCompass() {
        const compGroup = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 }));
        base.position.y = 0.25; compGroup.add(base);
        const arrowN = new THREE.Mesh(new THREE.ConeGeometry(2, 10, 4).translate(0, 5, 0).rotateX(Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
        arrowN.position.y = 0.6; arrowN.rotation.y = Math.PI; compGroup.add(arrowN);
        const arrowS = new THREE.Mesh(new THREE.ConeGeometry(2, 10, 4).translate(0, 5, 0).rotateX(Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        arrowS.position.y = 0.6; compGroup.add(arrowS);
        const addLetter = (text, rotY, color) => {
            const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d'); ctx.font = 'bold 80px sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 64);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
            sprite.scale.set(6, 6, 1); sprite.position.set(Math.sin(rotY)*11, 2, Math.cos(rotY)*11); compGroup.add(sprite);
        };
        addLetter('С', Math.PI, '#ef4444'); addLetter('Ю', 0, '#1e293b'); addLetter('В', Math.PI/2, '#1e293b'); addLetter('З', -Math.PI/2, '#1e293b');
        compGroup.position.set(-60, 0, 60); 
        return compGroup;
    }
    scene.add(createCompass());

    // ГРУППЫ СЛОЕВ
    const groups = { target: new THREE.Group(), parcels: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group(), labels: new THREE.Group() };
    for (let k in groups) scene.add(groups[k]);

    // ХЕЛПЕРЫ ГЕОМЕТРИИ
    const createShape = (polyRings) => {
        const shape = new THREE.Shape();
        if (!polyRings || !polyRings[0] || polyRings[0].length < 3) return shape;
        const outer = polyRings[0];
        shape.moveTo(outer[0].x, -outer[0].y);
        for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x, -outer[i].y);
        for(let i=1; i<polyRings.length; i++) {
            if (!polyRings[i] || polyRings[i].length < 3) continue;
            const hole = new THREE.Path();
            hole.moveTo(polyRings[i][0].x, -polyRings[i][0].y);
            for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, -polyRings[i][j].y);
            shape.holes.push(hole);
        }
        return shape;
    };

    const getCentroid = (points) => {
        if (!points || points.length === 0) return {x:0, z:0};
        let cx=0, cy=0; points.forEach(p => { cx+=p.x; cy+= -p.y; });
        return { x: cx/points.length, z: cy/points.length };
    };

    // ТЕКСТОВЫЕ МЕТКИ
    const createLabel = (name, id, areaText, isSmall = false) => {
        const canvas = document.createElement("canvas");
        // Динамическая ширина для длинных текстов (например ЗОУИТ)
        const ctxMeasure = canvas.getContext("2d");
        ctxMeasure.font = "bold 56px sans-serif";
        const textWidth = ctxMeasure.measureText(name || "Объект").width;
        
        canvas.width = isSmall ? 512 : Math.max(1024, textWidth + 100); 
        canvas.height = isSmall ? 256 : 256;
        const ctx = canvas.getContext("2d");
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath(); ctx.roundRect(10, 10, canvas.width-20, canvas.height-20, 15); ctx.fill();
        ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 4; ctx.stroke();
        
        ctx.textAlign = "center";
        const centerX = canvas.width / 2;
        
        if (isSmall) {
            ctx.fillStyle = "#1e293b"; ctx.font = "bold 36px sans-serif"; ctx.fillText(name, centerX, 80, 480);
            ctx.fillStyle = "#3b82f6"; ctx.font = "bold 28px monospace"; ctx.fillText(id, centerX, 140, 480);
            if (areaText) { ctx.fillStyle = "#ef4444"; ctx.font = "bold 26px sans-serif"; ctx.fillText(areaText, centerX, 200, 480); }
        } else {
            ctx.fillStyle = "#1e293b"; ctx.font = "bold 56px sans-serif"; ctx.fillText(name || "Объект", centerX, 90, canvas.width - 40);
            ctx.fillStyle = "#3b82f6"; ctx.font = "bold 44px monospace"; ctx.fillText(id || "", centerX, 155, canvas.width - 40);
            if (areaText) { ctx.fillStyle = "#64748b"; ctx.font = "38px sans-serif"; ctx.fillText(areaText, centerX, 210, canvas.width - 40); }
        }
        
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        sprite.scale.set((canvas.width / 1024) * 16, 4, 1); // Масштабируем пропорционально ширине
        return sprite;
    };

    // КОЛЫШЕК ДЛЯ ПУСТЫХ ОБЪЕКТОВ
    const createStakeWithSign = (id, position) => {
        const group = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
        stick.position.y = 2; stick.castShadow = true; group.add(stick);
        
        const board = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
        board.position.set(0, 3.5, 0.1); board.castShadow = true; group.add(board);
        
        const lbl = createLabel("ОКС (Связан)", id, "Нет данных", true);
        lbl.position.set(0, 3.5, 0.25); lbl.scale.set(3.8, 1.9, 1); group.add(lbl);

        group.position.set(position.x, 0, position.z);
        return group;
    };

    // УМНЫЙ ГЕНЕРАТОР ЗДАНИЙ 
    const createBuildingModel = (shape, height, style, isMiniature = false) => {
    const building = new THREE.Group();
    const pts = shape.getPoints();
    if (pts.length < 3) return building;

    // --- ЦОКОЛЬ ---
    const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
    const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: style.base, roughness: 0.8 }));
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = 0.3;
    building.add(baseMesh);

    // --- СТЕНЫ ---
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: style.wall, roughness: 0.85 }));
    walls.rotation.x = -Math.PI / 2;
    walls.position.y = 0.6;
    if (!isMiniature) { walls.castShadow = true; walls.receiveShadow = true; }
    building.add(walls);

    // --- КРЫША ---
    const roofY = 0.6 + height;

    if (style.hippedRoof) {
        // Вычисляем центр и радиус из точек shape
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        cx /= pts.length; cy /= pts.length;
        let maxR = 0;
        pts.forEach(p => { const d = Math.hypot(p.x - cx, p.y - cy); if (d > maxR) maxR = d; });

        const roofGeo = new THREE.ConeGeometry(maxR * 1.05, Math.max(3, height * 0.5), Math.max(4, pts.length));
        const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: style.roof, roughness: 0.7 }));
        roofMesh.position.set(cx, roofY + Math.max(3, height * 0.5) / 2, -cy);
        if (!isMiniature) roofMesh.castShadow = true;
        building.add(roofMesh);
    } else {
        if (style.parapet) {
            const parapetGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false });
            const parapet = new THREE.Mesh(parapetGeo, new THREE.MeshStandardMaterial({ color: style.roof, roughness: 0.7 }));
            parapet.rotation.x = -Math.PI / 2;
            parapet.position.y = roofY;
            building.add(parapet);
        }
        const flatRoofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
        const flatRoof = new THREE.Mesh(flatRoofGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 }));
        flatRoof.rotation.x = -Math.PI / 2;
        flatRoof.position.y = roofY + (style.parapet ? 0.7 : 0);
        building.add(flatRoof);
    }

    // --- КРЕСТ (медицина) ---
    if (style.addon === 'cross') {
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        cx /= pts.length; cy /= pts.length;
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const crossGroup = new THREE.Group();
        crossGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, 0.8), crossMat));
        crossGroup.add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.8), crossMat));
        crossGroup.position.set(cx, roofY + 4, -cy);
        building.add(crossGroup);
    }

    // ============================================================
    // --- ОКНА (ИСПРАВЛЕННЫЙ АЛГОРИТМ) ---
    // Здание строится как ExtrudeGeometry по оси Y (глубина = высота),
    // затем поворачивается rotation.x = -PI/2.
    // Значит: в системе координат GROUP здания:
    //   shape.x  -> мировой X
    //   shape.y  -> мировой -Z (после поворота)
    //   depth    -> мировой Y (высота)
    //
    // Окна строим прямо в пространстве GROUP, обходя рёбра shape.
    // ============================================================
    if (style.winType !== 'none' && style.win && !isMiniature) {
        let winW, winH, winStep;
        switch (style.winType) {
            case 'dense':   winW = 1.1; winH = 1.6; winStep = 1.8;  break;
            case 'ribbon':  winW = 3.5; winH = 1.4; winStep = 4.2;  break;
            case 'large':   winW = 2.8; winH = 2.2; winStep = 3.8;  break;
            case 'minimal': winW = 1.2; winH = 1.5; winStep = 3.0;  break;
            default:        winW = 1.4; winH = 1.7; winStep = 2.4;  break; // standard
        }

        const winMat = new THREE.MeshStandardMaterial({
            color: style.win,
            roughness: 0.05,
            metalness: 0.6,
            transparent: true,
            opacity: 0.85
        });

        const floors = Math.max(1, Math.round(height / 3.5));
        const floorH = height / floors;

        // Обходим рёбра контура shape (pts — массив Vector2)
        for (let i = 0; i < pts.length - 1; i++) {
            const ax = pts[i].x,   az = -pts[i].y;    // 3D X,Z первой точки
            const bx = pts[i+1].x, bz = -pts[i+1].y;  // 3D X,Z второй точки

            const edgeDX = bx - ax;
            const edgeDZ = bz - az;
            const edgeLen = Math.sqrt(edgeDX * edgeDX + edgeDZ * edgeDZ);
            if (edgeLen < winStep * 1.5) continue; // Слишком короткое ребро

            // Единичный вектор вдоль ребра
            const ux = edgeDX / edgeLen;
            const uz = edgeDZ / edgeLen;

            // Нормаль к стене (наружу, в плоскости XZ)
            // Для CCW-полигона нормаль наружу: (-uz, 0, ux)... но порядок обхода
            // может быть разным, поэтому просто делаем небольшой офсет наружу
            const nx = -uz;
            const nz = ux;

            // Угол поворота окна вокруг Y, чтобы лежать на плоскости стены
            const wallAngle = Math.atan2(edgeDX, edgeDZ);

            const count = Math.floor((edgeLen - winStep * 0.5) / winStep);
            if (count <= 0) continue;
            const totalWidth = count * winStep;
            const startOffset = (edgeLen - totalWidth) / 2 + winStep / 2;

            for (let f = 0; f < floors; f++) {
                // Центр окна по высоте на данном этаже
                const winY = 0.6 + f * floorH + floorH * 0.55;

                for (let w = 0; w < count; w++) {
                    const t = startOffset + w * winStep;

                    // Позиция центра окна вдоль ребра
                    const wx = ax + ux * t + nx * 0.05; // 0.05 — офсет от стены
                    const wz = az + uz * t + nz * 0.05;

                    const winMesh = new THREE.Mesh(
                        new THREE.PlaneGeometry(winW, winH),
                        winMat
                    );
                    winMesh.position.set(wx, winY, wz);
                    winMesh.rotation.y = wallAngle;
                    building.add(winMesh);
                }
            }
        }
    }

    return building;
};


// ============================================================
// ГЕНЕРАТОР ЦВЕТОВ И ТРАВЫ ДЛЯ УЧАСТКОВ
// ============================================================
const createFlower = (x, z, scale = 1) => {
    const group = new THREE.Group();

    // Стебель
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.9 });
    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 1.0 * scale, 5),
        stemMat
    );
    stem.position.y = 0.5 * scale;
    group.add(stem);

    // Листья
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9, side: THREE.DoubleSide });
    [-1, 1].forEach(side => {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * scale, 0.25 * scale), leafMat);
        leaf.position.set(side * 0.2 * scale, 0.4 * scale, 0);
        leaf.rotation.z = side * 0.6;
        leaf.rotation.y = Math.random() * Math.PI;
        group.add(leaf);
    });

    // Лепестки (5 штук)
    const petalColors = [0xf43f5e, 0xfbbf24, 0xa78bfa, 0xfb7185, 0xf97316, 0x34d399];
    const petalColor = petalColors[Math.floor(Math.random() * petalColors.length)];
    const petalMat = new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.6, side: THREE.DoubleSide });
    const petalCount = 5;
    for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.PlaneGeometry(0.35 * scale, 0.2 * scale), petalMat);
        petal.position.set(
            Math.cos(angle) * 0.28 * scale,
            1.02 * scale,
            Math.sin(angle) * 0.28 * scale
        );
        petal.rotation.x = -Math.PI / 2;
        petal.rotation.z = angle;
        group.add(petal);
    }

    // Сердцевина
    const centerMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.5 });
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 8, 8), centerMat);
    center.position.y = 1.03 * scale;
    group.add(center);

    group.position.set(x, 0.1, z);
    // Случайный поворот для естественности
    group.rotation.y = Math.random() * Math.PI * 2;
    return group;
};

// Простая трава (пучок)
const createGrassTuft = (x, z) => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.4 + Math.random() * 0.3), mat);
        blade.position.set(
            (Math.random() - 0.5) * 0.3,
            0.2,
            (Math.random() - 0.5) * 0.3
        );
        blade.rotation.y = Math.random() * Math.PI;
        blade.rotation.z = (Math.random() - 0.5) * 0.5;
        group.add(blade);
    }
    group.position.set(x, 0.05, z);
    return group;
};

// Функция: засеять участок цветами по полигону
const seedParcelWithFlowers = (polyRing, groupTarget) => {
    if (!polyRing || polyRing.length < 3) return;

    // Вычисляем bounding box полигона
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    polyRing.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (-p.y < minZ) minZ = -p.y;
        if (-p.y > maxZ) maxZ = -p.y;
    });

    const width  = maxX - minX;
    const depth  = maxZ - minZ;
    const area   = width * depth;

    // Адаптивная плотность: не больше 40 цветков
    const targetFlowers = Math.min(40, Math
\<Streaming stoppped because the conversation grew too long for this model\>

    // ====================================================================
    // ПОСТРОЕНИЕ ОБЪЕКТОВ ИЗ ДАННЫХ
    // ====================================================================

    // 1. ЦЕЛЕВОЙ ОБЪЕКТ
    data.target.forEach(t => {
        const color = (t.meta && t.meta.isParcel) ? 0x22c55e : 0xef4444;
        t.polygons.forEach(poly => {
            if (!poly || !poly[0]) return;
            if (t.type === "Line") {
                const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 1.5, -p.y));
                if (vecPoints.length > 1) {
                    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vecPoints, false, "chordal"), 64, 0.6, 8, false), new THREE.MeshStandardMaterial({ color: color }));
                    tube.castShadow = true; groups.target.add(tube);
                }
            } else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: color, opacity: 0.8, transparent: true }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4;
                    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x7f1d1d, linewidth: 2 }));
                    mesh.add(edges); mesh.castShadow = true; groups.target.add(mesh);
                }
            }
        });
        if(t.meta && t.polygons[0]) {
            const c = getCentroid(t.polygons[0][0]);
            const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area);
            lbl.position.set(c.x, 12, c.z); groups.labels.add(lbl);
        }
    });

    // 2. ЗЕМЕЛЬНЫЕ УЧАСТКИ
    data.parcels.forEach(p => {
        p.polygons.forEach(poly => {
            const shape = createShape(poly);
            if(shape.getPoints().length > 2) {
                const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xa8d5ba, roughness: 0.8 }));
                mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.1;
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x166534 }));
                mesh.add(edges); mesh.receiveShadow = true; groups.parcels.add(mesh);
            }
            const c = getCentroid(poly[0]);
            const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);
            lbl.position.set(c.x, 6, c.z); groups.labels.add(lbl);
        });
    });

    // 3. ЗДАНИЯ (ОКС)
    let linkedObjectsCount = 0; 
    data.buildings.forEach(b => {
        const style = getBuildingStyle(b.meta.rawText);

        if (b.meta.isSpatial) {
            b.polygons.forEach(poly => {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    groups.buildings.add(createBuildingModel(shape, b.meta.height, style));
                    const c = getCentroid(poly[0]);
                    const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);
                    lbl.position.set(c.x, b.meta.height + 8, c.z); groups.labels.add(lbl);
                }
            });
        } else {
            // Расстановка парящих объектов по кругу
            const radius = 25 + (linkedObjectsCount % 2) * 8; 
            const angle = (linkedObjectsCount * Math.PI * 2) / 6; 
            const posX = Math.cos(angle) * radius;
            const posZ = Math.sin(angle) * radius;
            
            if (b.meta.hasExtendedData) {
                const floatGroup = new THREE.Group();
                const dummyShape = new THREE.Shape();
                dummyShape.moveTo(-5, -5); dummyShape.lineTo(5, -5); dummyShape.lineTo(5, 5); dummyShape.lineTo(-5, 5);
                const miniModel = createBuildingModel(dummyShape, b.meta.height, style, true);
                miniModel.scale.set(0.4, 0.4, 0.4); 
                floatGroup.add(miniModel);

                const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 15), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 }));
                laser.position.y = -7.5; floatGroup.add(laser);

                const lbl = createLabel(b.meta.name, b.meta.id, "Парящая модель", true);
                lbl.position.y = (b.meta.height * 0.4) + 6; floatGroup.add(lbl);

                floatGroup.position.set(posX, 15, posZ);
                floatGroup.userData = { baseY: 15, offset: linkedObjectsCount };
                animateables.push(floatGroup);
                groups.buildings.add(floatGroup);
            } else {
                groups.buildings.add(createStakeWithSign(b.meta.id, { x: posX, z: posZ }));
            }
            linkedObjectsCount++;
        }
    });

    // 4. СООРУЖЕНИЯ
    data.structures.forEach(s => {
        s.polygons.forEach(poly => {
            if(!poly || !poly[0] || poly[0].length < 2) return;
            if(s.type === "Line") {
                if(s.meta.isGas && !s.meta.isUnderground) {
                    const pipeH = 3;
                    const pts = poly[0].map(pt => new THREE.Vector3(pt.x, pipeH, -pt.y));
                    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, s.meta.diameter, 8, false), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 }));
                    pipe.castShadow = true; groups.structures.add(pipe);
                    
                    pts.forEach((pt, i) => {
                        if(i % 2 === 0) {
                            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, pipeH), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
                            pole.position.set(pt.x, pipeH/2, pt.z); pole.castShadow = true; groups.structures.add(pole);
                        }
                    });
                    const midPt = pts[Math.floor(pts.length/2)];
                    const lbl = createLabel("Газопровод", s.meta.id, "Ø " + s.meta.diameter + "м");
                    lbl.position.set(midPt.x, pipeH + 4, midPt.z); groups.labels.add(lbl);
                }
                else if(s.meta.isElectric) {
                    const poleH = 10;
                    const pts = poly[0].map(pt => new THREE.Vector3(pt.x, poleH, -pt.y));
                    pts.forEach((pt, index) => {
                        const poleGroup = new THREE.Group();
                        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, poleH), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
                        pole.position.y = poleH/2; pole.castShadow = true; poleGroup.add(pole);
                        const cross = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
                        cross.position.y = poleH - 0.5;
                        if (index < pts.length - 1) cross.rotation.y = Math.atan2(pts[index+1].x - pt.x, pts[index+1].z - pt.z);
                        else if (index > 0) cross.rotation.y = Math.atan2(pt.x - pts[index-1].x, pt.z - pts[index-1].z);
                        poleGroup.add(cross); poleGroup.position.set(pt.x, 0, pt.z); groups.structures.add(poleGroup);
                    });
                    
                    const wireMat = new THREE.LineBasicMaterial({ color: 0x111827 });
                    for(let i=0; i<pts.length-1; i++) {
                        const p1 = pts[i].clone(); p1.y -= 0.5; const p2 = pts[i+1].clone(); p2.y -= 0.5;
                        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5); mid.y -= 1.5;
                        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
                        groups.structures.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)), wireMat));
                    }
                    const midPt = pts[Math.floor(pts.length/2)];
                    const lbl = createLabel("ЛЭП", s.meta.id, s.meta.voltage);
                    lbl.position.set(midPt.x, poleH + 5, midPt.z); groups.labels.add(lbl);
                }
                else {
                    const yOff = s.meta.isUnderground ? -1 : 1;
                    const pts = poly[0].map(pt => new THREE.Vector3(pt.x, yOff, -pt.y));
                    groups.structures.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, s.meta.diameter, 12, false), new THREE.MeshStandardMaterial({ color: 0x3b82f6 })));
                }
            } else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5; mesh.castShadow = true; groups.structures.add(mesh);
                    const c = getCentroid(poly[0]);
                    const lbl = createLabel(s.meta.name, s.meta.id, ""); lbl.position.set(c.x, 5, c.z); groups.labels.add(lbl);
                }
            }
        });
    });

    // 5. ЗОУИТ
    // ИСПРАВЛЕНИЕ: Теперь ЗОУИТ-Полигоны, содержащие "газ" или "электр", корректно красятся!
    data.zouits.forEach(z => {
        const isGas = z.meta.isGas;
        const isPower = z.meta.isElectric;
        const color = isGas ? 0xfbbf24 : (isPower ? 0xa855f7 : 0x3b82f6); // Желтый / Фиолетовый / Синий
        const labelText = z.meta.name || (isGas ? "Охранная зона газа" : (isPower ? "Охранная зона ЛЭП" : "ЗОУИТ"));

        z.polygons.forEach(poly => {
            if(!poly || !poly[0] || poly[0].length < 2) return;
            
            if (z.type === "Line") {
                const pts = poly[0].map(p => new THREE.Vector3(p.x, isPower ? 5 : 2, -p.y));
                const zone = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, isPower ? 6 : 4, 16, false), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false }));
                groups.zouit.add(zone);
                
                const midPt = pts[Math.floor(pts.length/2)];
                const lbl = createLabel(labelText, z.meta.id, "");
                lbl.position.set(midPt.x, isPower ? 14 : 8, midPt.z); groups.labels.add(lbl);
            } else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const h = isPower ? 15 : (isGas ? 4 : 6); // Разная высота зон
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15, depthWrite: false }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = h/2; groups.zouit.add(mesh);
                    
                    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 }));
                    mesh.add(edges);

                    // ИСПРАВЛЕНИЕ: Метка ставится на ближайшей к центру точке, а не в центроиде!
                    let closestPt = poly[0][0];
                    let minDist = Infinity;
                    poly[0].forEach(p => {
                        const dist = p.x*p.x + p.y*p.y;
                        if(dist < minDist) { minDist = dist; closestPt = p; }
                    });

                    const lbl = createLabel(labelText, z.meta.id, ""); 
                    lbl.position.set(closestPt.x, h + 3, -closestPt.y); 
                    groups.labels.add(lbl);
                }
            }
        });
    });

    // УПРАВЛЕНИЕ СЛОЯМИ
    document.getElementById("t-target").onchange = (e) => groups.target.visible = e.target.checked;
    document.getElementById("t-parcels").onchange = (e) => groups.parcels.visible = e.target.checked;
    document.getElementById("t-buildings").onchange = (e) => groups.buildings.visible = e.target.checked;
    document.getElementById("t-structures").onchange = (e) => groups.structures.visible = e.target.checked;
    document.getElementById("t-zouit").onchange = (e) => groups.zouit.visible = e.target.checked;
    document.getElementById("t-labels").onchange = (e) => groups.labels.visible = e.target.checked;

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.getElementById("loading").style.display = "none";

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        
        // Анимация парящих миниатюр
        const time = performance.now() * 0.002;
        animateables.forEach(obj => {
            obj.position.y = obj.userData.baseY + Math.sin(time + obj.userData.offset) * 1.5;
        });

        renderer.render(scene, camera);
    }
    animate();

} catch (err) {
    document.getElementById("loading").innerHTML = "<div style='color:#fca5a5; font-size:14px;'><b>Ошибка построения 3D сцены:</b><br>" + err.message + "</div>";
    console.error("3D Engine Error:", err);
}
</script>
</body>
</html>`;

            iframe.srcdoc = srcDocContent;
            modal.appendChild(iframe);
            document.body.appendChild(modal);
            
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    modal.remove();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

        } catch (error) {
            console.error("Ошибка генерации 3D:", error);
            if (typeof showNotification === 'function') {
                showNotification("Ошибка генерации 3D сцены: " + error.message, "error");
            }
        } finally {
            if (typeof hideLoader === 'function') hideLoader();
        }
    }, 100);
};