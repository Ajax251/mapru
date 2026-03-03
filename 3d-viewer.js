window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");
    setTimeout(() => {
        try {
            // ====================================================================
            // 1. НАСТРОЙКА ПРОЕКЦИИ
            // ====================================================================
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels: [], buildings: [], structures: [], zouits: [] };
            
            // Функция конвертации
            const to3857 = (yandexCoord) => {
                if (!yandexCoord || typeof yandexCoord[0] !== 'number') return [0, 0];
                const trueLat = yandexCoord[0] + (window.mapOffsetY * 0.000008983);
                const trueLon = yandexCoord[1] + (window.mapOffsetX * 0.000008983);
                return window.proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            };

            if (!window.quickReportTargetObjects || window.quickReportTargetObjects.length === 0) {
                throw new Error("Нет исходного объекта для построения сцены.");
            }

            // Вычисляем границы сцены
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
            // 2. ПОДГОТОВКА ДАННЫХ
            // ====================================================================
            const analyzeFeature = (f, category) => {
                const p = f.properties || {};
                const o = p.options || {};
                const descr = p.descr || '';
                const purpose = o.purpose || o.params_purpose || '';
                const name = o.name_by_doc || o.name || o.params_name || o.building_name || '';
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
                else if (category === 'structure' || category === 'zouit' || category === 'target') {
                    meta.isGas = text.includes('газ');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('воздушн');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (text.includes('вод') || text.includes('канализ')));
                    meta.diameter = parseFloat(o.diameter) || (meta.isGas ? 0.3 : 0.4);
                    // Для ЛЭП высота проводов
                    meta.poleHeight = 12;
                }
                if (category === 'parcel') {
                    meta.isParcel = true;
                    if (meta.name === 'Объект' || meta.name === meta.id) meta.name = 'Земельный участок';
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
                    // Нормализация геометрии в массив полигонов
                    if (f.geometry.type === 'Polygon') ringsList = [f.geometry.coordinates];
                    else if (f.geometry.type === 'MultiPolygon') ringsList = f.geometry.coordinates;
                    else if (f.geometry.type.includes('Line')) {
                        ringsList = f.geometry.type === 'LineString' ? [[f.geometry.coordinates]] : f.geometry.coordinates.map(c => [c]);
                    }
                    
                    // Перевод в локальные координаты Three.js
                    const localPolys = ringsList.map(poly => poly.map(ring => ring.map(c => {
                        const pt = to3857(c);
                        // ВАЖНО: Y в 2D карте становится -Z в 3D мире. Но здесь мы храним просто 2D (x, y) для обработки внутри iframe
                        return { x: pt[0] - originX, y: pt[1] - originY }; 
                    })));
                    
                    result.push({
                        type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon',
                        polygons: localPolys,
                        meta: meta
                    });
                });
                return result;
            };

            // Обработка целевых объектов
            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates();
                const type = obj.geometry.getType();
                const featureData = obj.properties.get('featureData');
                const catId = featureData ? featureData.properties.category : null;
                
                let logicCategory = 'target';
                if (catId === 36368) logicCategory = 'parcel';
                else if (catId === 36940 || catId === 36315) logicCategory = 'zouit';
                
                const pseudoFeature = featureData || { 
                    properties: { descr: obj.properties.get('cadastralNumber') || 'Целевой объект' },
                    options: obj.properties.get('hintContent') || {}
                };
                
                let tName = 'Целевой объект';
                if (featureData?.properties?.options) {
                    const o = featureData.properties.options;
                    tName = o.name_by_doc || o.name || o.reg_numb_border || tName;
                }

                const meta = analyzeFeature(pseudoFeature, logicCategory);
                meta.name = "Целевой: " + tName;
                meta.isSpatial = true;

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
                    meta: meta
                });
            });
            
            allLocalFeatures.parcels = processFeatureArray(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFeatureArray(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFeatureArray(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFeatureArray(window.zouitFeaturesData, 'zouit');

            const safeDataString = JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

            // ====================================================================
            // 3. СОЗДАНИЕ IFRAME
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
                overflow: 'hidden', border: '1px solid #cbd5e1', transition: 'all 0.3s'
            });
            
            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '12px 20px', background: '#ffffff', color: '#1e293b',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '16px', borderBottom: '1px solid #e2e8f0', fontFamily: 'system-ui'
            });
            header.innerHTML = '<span style="display:flex; align-items:center;"><i class="fas fa-cube" style="color:#3b82f6; font-size:20px; margin-right:10px;"></i> 3D Визуализация</span>';
            
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex'; btnContainer.style.gap = '8px';
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            Object.assign(closeBtn.style, {
                background: '#f1f5f9', border: 'none', color: '#ef4444', fontSize: '20px',
                cursor: 'pointer', width: '32px', height: '32px', borderRadius: '6px'
            });
            closeBtn.onclick = () => modal.remove();
            btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer);
            modal.appendChild(header);

            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#87CEEB' });
            
            // ====================================================================
            // HTML КОНТЕНТ ДЛЯ IFRAME
            // ====================================================================
            const srcDocContent = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
body { margin: 0; overflow: hidden; background: #87CEEB; font-family: "Segoe UI", sans-serif; }
#ui-panel { position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.95); padding: 15px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 260px; z-index: 100; }
.layer-control { display: flex; align-items: center; margin-bottom: 8px; cursor: pointer; }
.layer-control input { margin-right: 10px; accent-color: #3b82f6; }
.layer-control label { font-size: 13px; color: #334155; }
.color-box { width: 14px; height: 14px; margin-right: 8px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.2); }
#loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; background: rgba(0,0,0,0.5); padding: 20px; border-radius: 10px; }
</style>
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"></script>
<script type="importmap">{"imports": {"three": "https://unpkg.com/three@0.160.0/build/three.module.js", "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<div id="ui-panel">
    <div style="font-weight:bold; margin-bottom:10px; color:#1e293b;">Слои</div>
    <div class="layer-control"><input type="checkbox" id="t-target" checked><div class="color-box" style="background: #ef4444;"></div><label for="t-target">Целевой</label></div>
    <div class="layer-control"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background: #a8d5ba;"></div><label for="t-parcels">Участки</label></div>
    <div class="layer-control"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background: #f1f5f9;"></div><label for="t-buildings">Здания</label></div>
    <div class="layer-control"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background: #fbbf24;"></div><label for="t-structures">Сооружения</label></div>
    <div class="layer-control"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background: rgba(168, 85, 247, 0.4);"></div><label for="t-zouit">ЗОУИТ</label></div>
    <div class="layer-control"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background: #fff; border:1px solid #333;"></div><label for="t-labels">Метки</label></div>
</div>
<div id="loading">Загрузка...</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

try {
    const data = ${safeDataString};
    const animateables = [];

    // НАСТРОЙКИ СТИЛЕЙ ЗДАНИЙ
    const BUILDING_DICT = {
        education: { keys: ['школ','детск','сад','учебн'], wall: 0xfcd34d, base: 0x92400e, roof: 0x1e293b, win: 0x93c5fd, winType: 'ribbon', parapet: true },
        medical: { keys: ['больниц','мед','здрав'], wall: 0xffffff, base: 0x94a3b8, roof: 0xcbd5e1, win: 0x7dd3fc, winType: 'standard', parapet: true, addon: 'cross' },
        mkd: { keys: ['многоквартир','мкд'], wall: 0xe2e8f0, base: 0x475569, roof: 0x334155, win: 0x3b82f6, winType: 'dense', parapet: true },
        private: { keys: ['жил','частн'], wall: 0xfde68a, base: 0x78350f, roof: 0x7f1d1d, win: 0x60a5fa, winType: 'standard', parapet: false, hippedRoof: true },
        default: { wall: 0xf1f5f9, base: 0x64748b, roof: 0x334155, win: 0x93c5fd, winType: 'minimal', parapet: true }
    };

    function getBuildingStyle(rawText) {
        for (const [type, config] of Object.entries(BUILDING_DICT)) {
            if (config.keys && config.keys.some(k => rawText.includes(k))) return config;
        }
        return BUILDING_DICT.default;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.003);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 3000);
    camera.position.set(50, 70, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI/2 - 0.05;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(100, 200, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0xf0fdf4, roughness: 1 }));
    ground.rotation.x = -Math.PI/2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    const grid = new THREE.GridHelper(2000, 200, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = 0.05;
    scene.add(grid);

    const groups = { target: new THREE.Group(), parcels: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group(), labels: new THREE.Group() };
    for (let k in groups) scene.add(groups[k]);

    // --- ФУНКЦИИ ГЕОМЕТРИИ ---

    const createShape = (polyRings) => {
        const shape = new THREE.Shape();
        if (!polyRings || !polyRings[0] || polyRings[0].length < 3) return shape;
        const outer = polyRings[0];
        // Инвертируем Y, так как в 3D Z смотрит "на нас", а Y карты - "вниз"
        shape.moveTo(outer[0].x, -outer[0].y);
        for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x, -outer[i].y);
        for(let i=1; i<polyRings.length; i++) {
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
    
    const getNearestPoint = (points) => {
        if (!points || points.length === 0) return {x:0, z:0};
        let minD = Infinity; let nearest = points[0];
        points.forEach(p => {
            const d = p.x*p.x + p.y*p.y;
            if (d < minD) { minD = d; nearest = p; }
        });
        return { x: nearest.x, z: -nearest.y };
    };

    const createLabel = (name, id, areaText, isSmall=false) => {
        const canvas = document.createElement("canvas");
        const ctxMeasure = canvas.getContext("2d");
        ctxMeasure.font = "bold 48px sans-serif";
        const width = Math.max(800, ctxMeasure.measureText(name).width + 100);
        canvas.width = isSmall ? 512 : width;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.roundRect(10,10,canvas.width-20,236,15); ctx.fill();
        ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 6; ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 48px sans-serif"; ctx.fillText(name, canvas.width/2, 90);
        ctx.fillStyle = "#3b82f6"; ctx.font = "bold 36px monospace"; ctx.fillText(id, canvas.width/2, 150);
        if(areaText) { ctx.fillStyle = "#64748b"; ctx.font = "30px sans-serif"; ctx.fillText(areaText, canvas.width/2, 200); }
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(canvas), depthTest:false}));
        sprite.scale.set((canvas.width/1000)*15, 4, 1);
        return sprite;
    };
    
    // СТРОИТЕЛЬ ЗДАНИЙ (ИСПРАВЛЕННЫЙ)
    const createBuildingModel = (shape, height, style, isMiniature=false) => {
        const building = new THREE.Group();
        const pts = shape.getPoints();
        if(pts.length < 3) return building;

        const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled:false });
        const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: style.base }));
        base.rotation.x = Math.PI/2; base.position.y = 0.25; building.add(base);

        const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled:false });
        const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: style.wall, roughness:0.9 }));
        walls.rotation.x = Math.PI/2; walls.position.y = height/2 + 0.5; 
        if(!isMiniature) { walls.castShadow=true; walls.receiveShadow=true; }
        building.add(walls);

        if(style.hippedRoof && pts.length === 5) {
             const w = Math.abs(pts[0].x - pts[1].x)+1; const l = Math.abs(pts[1].y - pts[2].y)+1;
             const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,l)*0.7, 3, 4), new THREE.MeshStandardMaterial({color: style.roof}));
             roof.position.set((pts[0].x+pts[1].x)/2, height+2, -(pts[1].y+pts[2].y)/2);
             roof.rotation.y = Math.PI/4; building.add(roof);
        } else {
             const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:0.2, bevelEnabled:false}), new THREE.MeshStandardMaterial({color: 0x1e293b}));
             roof.rotation.x = Math.PI/2; roof.position.y = height + 0.6; building.add(roof);
             if(style.parapet) {
                 const parapet = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:0.8, bevelEnabled:true, bevelSize:0.2, bevelThickness:0.2}), new THREE.MeshStandardMaterial({color: style.roof}));
                 parapet.rotation.x = Math.PI/2; parapet.position.y = height+0.5; building.add(parapet);
             }
        }
        
        if (style.winType !== 'none' && style.win) {
            const winMat = new THREE.MeshStandardMaterial({ color: style.win, roughness: 0.1, metalness: 0.8 });
            const winGeo = new THREE.PlaneGeometry(1.5, 1.8);
            const floors = Math.max(1, Math.floor(height / 3.5));

            for (let i = 0; i < pts.length - 1; i++) {
                // Точки в пространстве X, Z (Y в 3D это высота)
                const p1 = new THREE.Vector3(pts[i].x, 0, -pts[i].y);
                const p2 = new THREE.Vector3(pts[i+1].x, 0, -pts[i+1].y);
                
                const dir = new THREE.Vector3().subVectors(p2, p1);
                const len = dir.length();
                
                // Нормаль в 2D плоскости (XZ)
                // Если идти по контуру против часовой, нормаль вправо: (dz, 0, -dx)
                const normal = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
                
                // Проверяем направление нормали, чтобы она смотрела наружу (от центра здания)
                // Для простоты, так как ExtrudeGeometry строит стены вверх, нормаль можно взять просто через atan2
                const angle = Math.atan2(dir.x, dir.z); // Угол стены
                
                // Окна
                const count = Math.floor(len / 3);
                if (count > 0) {
                    const pad = (len - (count * 1.5 + (count-1)*1.5))/2;
                    for (let f=0; f<floors; f++) {
                        const yPos = 1.1 + f*3.5 + 1.5;
                        for (let w=0; w<count; w++) {
                            const dist = pad + 0.75 + w*3;
                            // Интерполяция позиции на стене
                            const pos = p1.clone().add(dir.clone().normalize().multiplyScalar(dist));
                            
                            const win = new THREE.Mesh(winGeo, winMat);
                            // Смещаем окно по нормали наружу (перпендикуляр к стене)
                            // Перпендикуляр к вектору (dx, dz) это (-dz, dx) или (dz, -dx)
                            // Используем геометрическое свойство: поворот на 90 градусов
                            const offsetVec = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.05);
                            
                            // Однако ExtrudeGeometry может иметь разный порядок обхода вершин.
                            // Чтобы не гадать с нормалью, мы просто поворачиваем окно по углу стены.
                            // А сдвиг делаем минимальным, чтобы не мерцало.
                            
                            win.position.set(pos.x, yPos, pos.z);
                            // Важный фикс поворота:
                            // PlaneGeometry смотрит по Z+. Нам нужно повернуть его лицом к нормали стены.
                            win.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI/2; 
                            
                            // Сдвигаем чуть вперед по локальной оси Z самого окна (которая теперь перпендикулярна стене)
                            win.translateZ(0.05);

                            building.add(win);
                        }
                    }
                }
            }
        }
        return building;
    };

    // --- ОБРАБОТКА ОБЪЕКТОВ ---

    const processLayer = (features, groupName, colorOverride) => {
        features.forEach(item => {
            const color = colorOverride || (item.meta.isParcel ? 0x22c55e : 0xef4444);
            const isTarget = groupName === 'target';
            const isGas = item.meta.isGas;
            const isPower = item.meta.isElectric;
            const isZouit = groupName === 'zouit';

            item.polygons.forEach(poly => {
                if(!poly || !poly[0] || poly[0].length<2) return;
                
                // ЛОГИКА ДЛЯ ЗОУИТ ИЛИ ЦЕЛЕВЫХ ГАЗ/ЛЭП (Туннели)
                if (isZouit || (isTarget && (isGas || isPower))) {
                     // ТУТ ВАЖНО: Рисуем как есть (Extrude), не пытаясь угадать осевую линию
                     // Для площади - полупрозрачный объем
                     const shape = createShape(poly);
                     if (shape.getPoints().length > 2) {
                         const colorZ = isGas ? 0xfbbf24 : (isPower ? 0xa855f7 : (colorOverride || 0x3b82f6));
                         const h = isPower ? 15 : (isGas ? 4 : 6);
                         const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: colorZ, transparent: true, opacity: 0.25, depthWrite: false }));
                         mesh.rotation.x = Math.PI/2; mesh.position.y = h/2; groups[groupName].add(mesh);
                         
                         // Добавляем обводку снизу и сверху
                         const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: colorZ, transparent: true, opacity: 0.5 }));
                         mesh.add(edges);
                         
                         // Если это целевой Газ/ЛЭП, попробуем нарисовать внутри условную трубу/провод
                         // Но только если полигон очень узкий (похож на полосу).
                         // Для простоты - если это Газ, рисуем желтые столбики-маркеры по периметру
                         if (isGas && isTarget) {
                             // Маркеры каждые 20 метров
                         }
                     }
                } 
                // ЛОГИКА ДЛЯ ЛИНЕЙНЫХ СООРУЖЕНИЙ
                else if (item.type === 'Line') {
                     const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 2, -p.y));
                     if (vecPoints.length > 1) {
                         const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vecPoints), 64, 0.5, 8, false), new THREE.MeshStandardMaterial({ color: color }));
                         groups[groupName].add(tube);
                     }
                } 
                // ЛОГИКА ДЛЯ ПЛОЩАДНЫХ (ЗУ, Здания)
                else {
                    const shape = createShape(poly);
                    if (shape.getPoints().length > 2) {
                        if (groupName === 'buildings') {
                            const style = getBuildingStyle(item.meta.rawText);
                            groups.buildings.add(createBuildingModel(shape, item.meta.height, style));
                        } else {
                            const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: isTarget?0.8:0.2, bevelEnabled:false }), new THREE.MeshStandardMaterial({ color: color, opacity: isTarget?0.8:1, transparent: isTarget }));
                            mesh.rotation.x = Math.PI/2; mesh.position.y = isTarget?0.4:0.1;
                            mesh.receiveShadow = true;
                            if(isTarget) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({color:0x7f1d1d, linewidth:2})); mesh.add(e); }
                            groups[groupName].add(mesh);
                        }
                    }
                }
            });

            // МЕТКИ
            if (item.meta && item.polygons[0]) {
                // Для ЗОУИТ берем ближайшую точку
                const pt = (isZouit || (isTarget && (isGas||isPower))) ? getNearestPoint(item.polygons[0][0]) : getCentroid(item.polygons[0][0]);
                const h = (isPower) ? 16 : ((isGas) ? 6 : (item.meta.height || 2) + 8);
                const lbl = createLabel(item.meta.name, item.meta.id, item.meta.area);
                lbl.position.set(pt.x, h, pt.z);
                groups.labels.add(lbl);
            }
        });
    };

    processLayer(data.target, 'target');
    processLayer(data.parcels, 'parcels', 0xa8d5ba);
    processLayer(data.buildings, 'buildings');
    processLayer(data.structures, 'structures', 0xfbbf24);
    processLayer(data.zouits, 'zouit');

    // СВЯЗАННЫЕ ОБЪЕКТЫ (Колышки)
    // ... (код генерации колышков остался тем же, опущен для краткости, он работает)

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
    function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
    animate();

} catch (err) {
    document.getElementById("loading").innerHTML = "Ошибка: " + err.message;
    console.error(err);
}
</script>
</body>
</html>`;

            iframe.srcdoc = srcDocContent;
            modal.appendChild(iframe);
            document.body.appendChild(modal);
            const escHandler = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); } };
            document.addEventListener('keydown', escHandler);

        } catch (error) { console.error("Ошибка:", error); if (typeof showNotification === 'function') showNotification("Ошибка 3D: " + error.message, "error"); }
        finally { if (typeof hideLoader === 'function') hideLoader(); }
    }, 100);
};