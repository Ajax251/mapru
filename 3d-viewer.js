window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");
    setTimeout(() => {
        try {
            // ====================================================================
            // 1. НАСТРОЙКА ПРОЕКЦИИ И ПОИСК ЦЕНТРА
            // ====================================================================
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = {
                target: [], parcels: [], buildings: [], structures: [], zouits: []
            };
            
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
                const text = (p.descr + ' ' + (o.name || '') + ' ' + (o.params_name || '') + ' ' + (o.purpose || '') + ' ' + (o.params_purpose || '') + ' ' + (o.building_name || '') + ' ' + (o.name_by_doc || '')).toLowerCase();
                
                let meta = {
                    id: o.cad_num || o.cad_number || o.reg_numb_border || p.descr || '',
                    name: o.name || o.params_name || o.name_by_doc || o.purpose || p.descr || 'Объект',
                    area: o.build_record_area || o.area || o.specified_area || o.declared_area || o.land_record_area || '',
                    isParcel: false
                };
                
                if (meta.area && !isNaN(parseFloat(meta.area))) {
                    meta.area = parseFloat(meta.area).toLocaleString('ru-RU') + ' м²';
                } else if (o.params_extension) {
                    meta.area = o.params_extension + ' м (длина)';
                }
                
                if (category === 'building') {
                    meta.floors = parseInt(o.floors) || (text.includes('жило') || text.includes('дом') ? 2 : 1);
                    meta.height = meta.floors * 3.5;
                }
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('воздушн');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && meta.isWater);
                    meta.diameter = parseFloat(o.diameter) || (meta.isGas ? 0.3 : 0.4);
                }
                else if (category === 'parcel') {
                    meta.isParcel = true;
                    if (meta.name === 'Объект' || meta.name === meta.id) meta.name = 'Земельный участок';
                }
                return meta;
            };

            const processFeatureArray = (featuresArray, type) => {
                const result = [];
                (featuresArray || []).forEach(f => {
                    if (!f.geometry || !f.geometry.coordinates) return;
                    const meta = analyzeFeature(f, type);
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
                    const pt = to3857(c);
                    return { x: pt[0] - originX, y: pt[1] - originY };
                }));
                
                allLocalFeatures.target.push({
                    type: (type === 'Polygon' || type === 'MultiPolygon') ? 'Polygon' : 'Line',
                    polygons: [localPoly],
                    meta: { isParcel: isTargetParcel, name: 'Целевой объект', id: obj.properties.get('cadastralNumber') || '' }
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
.info-text { position: absolute; bottom: 20px; left: 20px; background: rgba(0,0,0,0.6); color: white; padding: 10px 15px; border-radius: 8px; font-size: 12px; pointer-events: none; backdrop-filter: blur(5px); }
#loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 16px; font-weight: 600; background: rgba(59, 130, 246, 0.9); padding: 15px 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
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
</div>
<div class="info-text">ЛКМ: вращение | ПКМ: панорама | Колесо: масштаб</div>
<div id="loading">Построение 3D архитектуры...</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

try {
    const data = ${safeDataString};

    // СЦЕНА
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Небо
    scene.fog = new THREE.Fog(0x87CEEB, 60, 250); // Дымка

    // КАМЕРА
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(40, 50, 80);

    // РЕНДЕРЕР
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // КОНТРОЛЫ
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1; // Не даем сильно уйти под землю
    controls.target.set(0, 0, 0);

    // ОСВЕЩЕНИЕ
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.4));
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(50, 100, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.bias = -0.001;
    scene.add(sunLight);

    // ГЛЯНЦЕВЫЙ ПОЛ С СЕТКОЙ
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0xeef2ff, // Светлый индиго
        roughness: 0.15, // Блестящий
        metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(1000, 200, 0xa5b4fc, 0xe0e7ff);
    grid.position.y = 0.02;
    scene.add(grid);

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

    // КРАСИВЫЕ ТЕКСТОВЫЕ МЕТКИ
    const createLabel = (name, id, areaText) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024; canvas.height = 256;
        const ctx = canvas.getContext("2d");
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath(); ctx.roundRect(20, 20, 984, 216, 20); ctx.fill();
        ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 6; ctx.stroke();
        
        ctx.textAlign = "center";
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 56px sans-serif"; 
        ctx.fillText(name || "Объект", 512, 90, 960);
        ctx.fillStyle = "#3b82f6"; ctx.font = "bold 44px monospace"; 
        ctx.fillText(id || "", 512, 155, 960);
        if (areaText) { ctx.fillStyle = "#64748b"; ctx.font = "38px sans-serif"; ctx.fillText(areaText, 512, 210, 960); }
        
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        sprite.scale.set(16, 4, 1);
        return sprite;
    };

    // КРАСИВАЯ АРХИТЕКТУРА ЗДАНИЙ
    const createBuildingModel = (shape, height) => {
        const building = new THREE.Group();
        if(shape.getPoints().length < 3) return building;

        // Цоколь (темно-серый)
        const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
        const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x475569 }));
        base.rotation.x = Math.PI / 2; base.position.y = 0.25;
        building.add(base);

        // Основные стены фасада
        const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 }));
        walls.rotation.x = Math.PI / 2; walls.position.y = height/2 + 0.5;
        walls.castShadow = true; walls.receiveShadow = true;
        building.add(walls);

        // Крыша с парапетом
        const roofTrimGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2 });
        const roofTrim = new THREE.Mesh(roofTrimGeo, new THREE.MeshStandardMaterial({ color: 0x334155 }));
        roofTrim.rotation.x = Math.PI / 2; roofTrim.position.y = height + 0.5;
        roofTrim.castShadow = true;
        building.add(roofTrim);

        // Плоская кровля
        const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        roof.rotation.x = Math.PI / 2; roof.position.y = height + 0.8;
        building.add(roof);

        return building;
    };

    // ====================================================================
    // ПОСТРОЕНИЕ ОБЪЕКТОВ ИЗ ДАННЫХ
    // ====================================================================

    // 1. ЦЕЛЕВОЙ ОБЪЕКТ (Красный контур)
    data.target.forEach(t => {
        const color = (t.meta && t.meta.isParcel) ? 0x22c55e : 0xef4444;
        t.polygons.forEach(poly => {
            if (!poly || !poly[0]) return;
            if (t.type === "Line") {
                const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 1.5, -p.y));
                if (vecPoints.length > 1) {
                    const curve = new THREE.CatmullRomCurve3(vecPoints, false, "chordal");
                    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.6, 8, false), new THREE.MeshStandardMaterial({ color: color }));
                    tube.castShadow = true; groups.target.add(tube);
                }
            } else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    // Выдавливаем контур вверх
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: color, opacity: 0.8, transparent: true }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4;
                    // Добавляем обводку
                    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x7f1d1d, linewidth: 2 }));
                    mesh.add(edges);
                    mesh.castShadow = true; groups.target.add(mesh);
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
                mesh.add(edges);
                mesh.receiveShadow = true; groups.parcels.add(mesh);
            }
            const c = getCentroid(poly[0]);
            const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);
            lbl.position.set(c.x, 6, c.z); groups.labels.add(lbl);
        });
    });

    // 3. ЗДАНИЯ (ОКС)
    data.buildings.forEach(b => {
        b.polygons.forEach(poly => {
            const shape = createShape(poly);
            if(shape.getPoints().length > 2) {
                const h = b.meta.height || 6;
                groups.buildings.add(createBuildingModel(shape, h));
                const c = getCentroid(poly[0]);
                const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);
                lbl.position.set(c.x, h + 8, c.z); groups.labels.add(lbl);
            }
        });
    });

    // 4. СООРУЖЕНИЯ И СЕТИ (Инженерия)
    data.structures.forEach(s => {
        s.polygons.forEach(poly => {
            if(!poly || !poly[0] || poly[0].length < 2) return;
            
            // Если это Линия
            if(s.type === "Line") {
                // ГАЗ (Надземный, желтый)
                if(s.meta.isGas && !s.meta.isUnderground) {
                    const pipeH = 3;
                    const pts = poly[0].map(pt => new THREE.Vector3(pt.x, pipeH, -pt.y));
                    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, s.meta.diameter||0.3, 8, false), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 }));
                    pipe.castShadow = true; groups.structures.add(pipe);
                    
                    // Опоры для трубы
                    pts.forEach((pt, i) => {
                        if(i % 2 === 0) { // Каждая вторая точка
                            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, pipeH), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
                            pole.position.set(pt.x, pipeH/2, pt.z);
                            pole.castShadow = true; groups.structures.add(pole);
                        }
                    });
                    
                    const midPt = pts[Math.floor(pts.length/2)];
                    const lbl = createLabel("Газопровод", s.meta.id, "Ø " + (s.meta.diameter||0.3) + "м");
                    lbl.position.set(midPt.x, pipeH + 4, midPt.z); groups.labels.add(lbl);
                }
                // ЭЛЕКТРИЧЕСТВО (ЛЭП, опоры и провисающие провода)
                else if(s.meta.isElectric) {
                    const poleH = 10;
                    const pts = poly[0].map(pt => new THREE.Vector3(pt.x, poleH, -pt.y));
                    
                    // Ставим столбы
                    pts.forEach(pt => {
                        const poleGroup = new THREE.Group();
                        // Вертикальный столб
                        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, poleH), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
                        pole.position.y = poleH/2; pole.castShadow = true; poleGroup.add(pole);
                        // Траверса (перекладина)
                        const cross = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
                        cross.position.y = poleH - 0.5; poleGroup.add(cross);
                        
                        poleGroup.position.set(pt.x, 0, pt.z);
                        groups.structures.add(poleGroup);
                    });
                    
                    // Натягиваем провода с провисанием
                    const wireMat = new THREE.LineBasicMaterial({ color: 0x111827, linewidth: 2 });
                    for(let i=0; i<pts.length-1; i++) {
                        const p1 = pts[i].clone(); p1.y -= 0.5; // От краев траверсы
                        const p2 = pts[i+1].clone(); p2.y -= 0.5;
                        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
                        mid.y -= 1.5; // Величина провисания
                        
                        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
                        const wireGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
                        groups.structures.add(new THREE.Line(wireGeo, wireMat));
                    }
                    
                    const midPt = pts[Math.floor(pts.length/2)];
                    const lbl = createLabel("ЛЭП", s.meta.id, s.meta.voltage);
                    lbl.position.set(midPt.x, poleH + 4, midPt.z); groups.labels.add(lbl);
                }
                // ВОДОПРОВОД (Подземный, синий)
                else {
                    const pts = poly[0].map(pt => new THREE.Vector3(pt.x, -1, -pt.y)); // Под землей
                    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, s.meta.diameter||0.4, 8, false), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
                    groups.structures.add(pipe);
                    
                    const midPt = pts[Math.floor(pts.length/2)];
                    const lbl = createLabel("Водопровод/Сеть", s.meta.id, "Подземная");
                    lbl.position.set(midPt.x, 2, midPt.z); groups.labels.add(lbl);
                }
            } 
            // Площадные сооружения
            else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5; mesh.castShadow = true;
                    groups.structures.add(mesh);
                    const c = getCentroid(poly[0]);
                    const lbl = createLabel(s.meta.name, s.meta.id, "");
                    lbl.position.set(c.x, 5, c.z); groups.labels.add(lbl);
                }
            }
        });
    });

    // 5. ЗОУИТ (Охранные зоны)
    data.zouits.forEach(z => {
        z.polygons.forEach(poly => {
            if(!poly || !poly[0] || poly[0].length < 2) return;
            
            // Если ЗОУИТ привязан к линии (например Газ) - делаем трубу-зону
            if (z.type === "Line") {
                const isPower = z.meta.name.toLowerCase().includes('лэп') || z.meta.name.toLowerCase().includes('электр');
                const color = isPower ? 0xa855f7 : 0xfbbf24;
                
                const pts = poly[0].map(p => new THREE.Vector3(p.x, 2, -p.y));
                const zone = new THREE.Mesh(
                    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 4, 12, false), 
                    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false })
                );
                groups.zouit.add(zone);
                
                const midPt = pts[Math.floor(pts.length/2)];
                const lbl = createLabel("Охранная зона", z.meta.id, isPower ? "ЛЭП" : "Газ");
                lbl.position.set(midPt.x, 8, midPt.z); groups.labels.add(lbl);
            } 
            // Обычный площадной ЗОУИТ (полупрозрачная стена)
            else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const h = 8;
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), 
                        new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.15, depthWrite: false })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = h/2;
                    groups.zouit.add(mesh);
                    
                    // Верхняя грань контура
                    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape)), new THREE.LineBasicMaterial({ color: 0xa855f7 }));
                    edges.rotation.x = -Math.PI / 2; edges.position.y = h;
                    groups.zouit.add(edges);

                    const c = getCentroid(poly[0]);
                    const lbl = createLabel("ЗОУИТ", z.meta.id, "Охранная зона");
                    lbl.position.set(c.x, h + 3, c.z); groups.labels.add(lbl);
                }
            }
        });
    });

    // УПРАВЛЕНИЕ СЛОЯМИ ИЗ HTML
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