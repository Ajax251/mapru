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

            // Безопасный расчет границ
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
                    meta.isResidential = text.includes('жило') || text.includes('дом') || text.includes('квартир');
                    meta.floors = parseInt(o.floors) || (meta.isResidential ? 2 : 1);
                    meta.height = meta.floors * 3.5;
                    meta.buildingType = meta.isResidential ? 'residential' : 'commercial';
                }
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('кв') || text.includes('воздушн');
                    meta.isTelecom = text.includes('связ') || text.includes('оптик');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (meta.isGas || meta.isWater));
                    meta.diameter = parseFloat(o.diameter) || 0.3;
                    meta.voltage = o.voltage || o.params_voltage || '10кВ';
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

            // Обработка целевого объекта
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

            // Безопасная сериализация JSON для вставки в HTML
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
                boxShadow: '0 25px 80px rgba(99, 102, 241, 0.3)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid #c7d2fe', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });
            
            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '15px 25px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '16px', fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
            });
            header.innerHTML = '<span><i class="fas fa-cube" style="margin-right:10px;"></i> 3D Визуализация</span>';
            
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '10px';
            const createWinBtn = (symbol, hoverBg) => {
                const btn = document.createElement('button');
                btn.innerHTML = symbol;
                Object.assign(btn.style, {
                    background: 'rgba(255,255,255,0.2)', border: 'none', color: '#ffffff', fontSize: '18px',
                    cursor: 'pointer', lineHeight: '1', width: '36px', height: '36px',
                    borderRadius: '8px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(10px)'
                });
                btn.onmouseenter = () => { btn.style.background = hoverBg; btn.style.transform = 'scale(1.1)'; };
                btn.onmouseleave = () => { btn.style.background = 'rgba(255,255,255,0.2)'; btn.style.transform = 'scale(1)'; };
                return btn;
            };
            
            const minBtn = createWinBtn('&minus;', 'rgba(255,255,255,0.4)');
            const closeBtn = createWinBtn('&times;', 'rgba(239, 68, 68, 0.8)');
            closeBtn.style.fontSize = '22px';
            
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#1e1b4b' });
            
            let isMinimized = false;
            minBtn.onclick = () => {
                if (!isMinimized) {
                    modal.style.width = '320px'; modal.style.height = '50px';
                    modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px';
                    modal.style.borderRadius = '12px';
                    iframe.style.display = 'none';
                    minBtn.innerHTML = '&#10064;';
                } else {
                    modal.style.width = '95%'; modal.style.height = '95%';
                    modal.style.top = '2.5%'; modal.style.left = '2.5%'; modal.style.bottom = 'auto';
                    modal.style.borderRadius = '16px';
                    setTimeout(() => iframe.style.display = 'block', 300);
                    minBtn.innerHTML = '&minus;';
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
body { margin: 0; overflow: hidden; background: linear-gradient(180deg, #1e1b4b 0%, #312e81 100%); font-family: "Segoe UI", system-ui, sans-serif; }
#ui-panel { position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 16px; box-shadow: 0 8px 32px rgba(99, 102, 241, 0.25); backdrop-filter: blur(20px); width: 280px; z-index: 100; pointer-events: auto; border: 1px solid rgba(255,255,255,0.3); }
h3 { margin-top: 0; margin-bottom: 18px; color: #1e1b4b; font-size: 17px; border-bottom: 3px solid #6366f1; padding-bottom: 10px; font-weight: 700; }
.layer-control { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; padding: 8px 12px; border-radius: 10px; transition: all 0.2s; }
.layer-control:hover { background: rgba(99, 102, 241, 0.1); }
.layer-control input { margin-right: 12px; cursor: pointer; width: 18px; height: 18px; accent-color: #6366f1; }
.layer-control label { cursor: pointer; font-size: 14px; color: #374151; font-weight: 600; }
.color-box { width: 18px; height: 18px; display: inline-block; margin-right: 10px; border-radius: 5px; border: 2px solid rgba(0,0,0,0.15); flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.info-text { position: absolute; bottom: 20px; left: 20px; background: rgba(30, 27, 75, 0.85); color: white; padding: 14px 20px; border-radius: 12px; font-size: 13px; pointer-events: none; backdrop-filter: blur(10px); font-weight: 500; border: 1px solid rgba(99, 102, 241, 0.3); box-shadow: 0 4px 20px rgba(99, 102, 241, 0.2); }
#loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 18px; font-weight: 600; background: rgba(99, 102, 241, 0.9); padding: 20px 40px; border-radius: 12px; text-align: center; }
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
    <div class="layer-control"><input type="checkbox" id="t-target" checked><div class="color-box" style="background: #22c55e;"></div><label for="t-target">Целевой объект</label></div>
    <div class="layer-control"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background: #86efac;"></div><label for="t-parcels">Земельные участки</label></div>
    <div class="layer-control"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background: #e0e7ff;"></div><label for="t-buildings">Здания (ОКС)</label></div>
    <div class="layer-control"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background: #6366f1;"></div><label for="t-structures">Сооружения / Сети</label></div>
    <div class="layer-control"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background: #fbbf24; opacity: 0.7;"></div><label for="t-zouit">ЗОУИТ</label></div>
    <div class="layer-control" style="margin-top: 15px; border-top: 2px solid #e0e7ff; padding-top: 15px;"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background: #fff; border: 2px solid #6366f1;"></div><label for="t-labels">Подписи объектов</label></div>
</div>
<div class="info-text">ЛКМ: вращение | ПКМ: панорама | Колесо: масштаб</div>
<div id="loading">Инициализация движка...</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

try {
    const data = ${safeDataString};
    document.getElementById("loading").textContent = "Построение геометрии...";

    // СЦЕНА
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1b4b);
    scene.fog = new THREE.FogExp2(0x1e1b4b, 0.008);

    // КАМЕРА
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(80, 70, 100);

    // РЕНДЕРЕР
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);

    // КОНТРОЛЫ
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.2;
    controls.minDistance = 15;
    controls.maxDistance = 500;
    controls.target.set(0, 0, 0);

    // ОСВЕЩЕНИЕ
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
    sunLight.position.set(150, 200, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.top = 300; sunLight.shadow.camera.bottom = -300;
    sunLight.shadow.camera.left = -300; sunLight.shadow.camera.right = 300;
    sunLight.shadow.camera.far = 800;
    scene.add(sunLight);
    scene.add(new THREE.HemisphereLight(0x87CEEB, 0x312e81, 0.6));

    // ПОЛ С ГЕКСАГОНАЛЬНЫМ ПАТТЕРНОМ
    const createHexagonFloor = () => {
        const floorGroup = new THREE.Group();
        const hexSize = 8; const floorSize = 1500; const hexHeight = Math.sqrt(3) * hexSize;
        const baseColor = 0x6366f1; const highlightColor = 0x818cf8;
        
        for (let x = -floorSize/2; x < floorSize/2; x += hexSize * 1.75) {
            for (let z = -floorSize/2; z < floorSize/2; z += hexHeight) {
                const offset = (Math.floor((x + floorSize/2) / (hexSize * 1.75)) % 2) * (hexHeight / 2);
                const xPos = x; const zPos = z + offset;
                const hexShape = new THREE.Shape();
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI) / 3;
                    const hx = Math.cos(angle) * hexSize;
                    const hz = Math.sin(angle) * hexSize;
                    if (i === 0) hexShape.moveTo(hx, hz); else hexShape.lineTo(hx, hz);
                }
                hexShape.closePath();
                const isHighlighted = (Math.floor((xPos + floorSize/2) / (hexSize * 1.75)) + Math.floor((zPos + floorSize/2) / hexHeight)) % 3 === 0;
                const hexGeo = new THREE.ExtrudeGeometry(hexShape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.2, bevelSegments: 2 });
                const hexMat = new THREE.MeshStandardMaterial({ color: isHighlighted ? highlightColor : baseColor, roughness: 0.6, metalness: 0.3, transparent: true, opacity: isHighlighted ? 0.7 : 0.5 });
                const hexMesh = new THREE.Mesh(hexGeo, hexMat);
                hexMesh.rotation.x = Math.PI / 2; hexMesh.position.set(xPos, 0.15, zPos);
                hexMesh.receiveShadow = true;
                floorGroup.add(hexMesh);
            }
        }
        scene.add(floorGroup);
    };
    createHexagonFloor();

    // ГРУППЫ ОБЪЕКТОВ
    const groups = { target: new THREE.Group(), parcels: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group(), labels: new THREE.Group() };
    for (let k in groups) scene.add(groups[k]);

    // БЕЗОПАСНАЯ ФУНКЦИЯ СОЗДАНИЯ ФОРМЫ
    const createShape = (polyRings) => {
        const shape = new THREE.Shape();
        if (!polyRings || !polyRings[0] || polyRings[0].length === 0) return shape;
        const outer = polyRings[0];
        shape.moveTo(outer[0].x || 0, -(outer[0].y || 0));
        for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x || 0, -(outer[i].y || 0));
        
        for(let i=1; i<polyRings.length; i++) {
            if (!polyRings[i] || polyRings[i].length === 0) continue;
            const hole = new THREE.Path();
            hole.moveTo(polyRings[i][0].x || 0, -(polyRings[i][0].y || 0));
            for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x || 0, -(polyRings[i][j].y || 0));
            shape.holes.push(hole);
        }
        return shape;
    };

    const getCentroid = (points) => {
        if (!points || points.length === 0) return {x:0, z:0};
        let cx=0, cy=0; points.forEach(p => { cx+=(p.x||0); cy+= -(p.y||0); });
        return { x: cx/points.length, z: cy/points.length };
    };

    const createLabel = (name, id, areaText) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024; canvas.height = 320;
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, 0, 320);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
        gradient.addColorStop(1, "rgba(241, 245, 255, 0.95)");
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.roundRect(15, 15, 994, 290, 25); ctx.fill();
        ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 5; ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillStyle = "#1e1b4b"; ctx.font = "bold 52px sans-serif"; ctx.fillText(name || "Объект", 512, 90, 980);
        ctx.fillStyle = "#6366f1"; ctx.font = "bold 40px monospace"; ctx.fillText(id || "", 512, 165, 980);
        if (areaText) { ctx.fillStyle = "#475569"; ctx.font = "bold 36px sans-serif"; ctx.fillText(areaText, 512, 240, 980); }
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
        sprite.scale.set(20, 6.25, 1);
        return sprite;
    };

    // ДОМ С ОКНАМИ
    const createBuilding = (shape, height, meta) => {
        const buildingGroup = new THREE.Group();
        if (shape.getPoints().length < 3) return buildingGroup; // Защита
        const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 3 });
        const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 }));
        walls.rotation.x = Math.PI / 2; walls.position.y = height / 2 + 0.5;
        walls.castShadow = true; walls.receiveShadow = true;
        buildingGroup.add(walls);
        
        const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.5, bevelThickness: 0.5 });
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x991b1b }));
        roof.rotation.x = Math.PI / 2; roof.position.y = height + 1.5; roof.castShadow = true;
        buildingGroup.add(roof);
        return buildingGroup;
    };

    // ЦЕЛЕВЫЕ ОБЪЕКТЫ
    data.target.forEach(t => {
        const isTargetParcel = t.meta && t.meta.isParcel;
        const targetColor = isTargetParcel ? 0x22c55e : 0xef4444;
        t.polygons.forEach(poly => {
            if (!poly || !poly[0]) return;
            if (t.type === "Line") {
                const vecPoints = poly[0].map(p => new THREE.Vector3(p.x||0, 1, -(p.y||0)));
                if (vecPoints.length > 1) { // Защита CatmullRomCurve3
                    const path = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.01);
                    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 50, 1, 12, false), new THREE.MeshStandardMaterial({ color: targetColor }));
                    tube.castShadow = true; groups.target.add(tube);
                }
            } else {
                const shape = createShape(poly);
                if (shape.getPoints().length > 2) { // Защита ExtrudeGeometry
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true }), new THREE.MeshStandardMaterial({ color: targetColor }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5; mesh.castShadow = true; mesh.receiveShadow = true;
                    groups.target.add(mesh);
                }
            }
        });
        if(t.meta && t.polygons[0]) {
            const c = getCentroid(t.polygons[0][0]);
            const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area);
            lbl.position.set(c.x, 15, c.z); groups.labels.add(lbl);
        }
    });

    // УЧАСТКИ
    data.parcels.forEach(p => {
        p.polygons.forEach(poly => {
            const shape = createShape(poly);
            if (shape.getPoints().length > 2) {
                const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true }), new THREE.MeshStandardMaterial({ color: 0x86efac }));
                mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4;
                groups.parcels.add(mesh);
            }
            const c = getCentroid(poly[0]);
            const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);
            lbl.position.set(c.x, 10, c.z); groups.labels.add(lbl);
        });
    });

    // ОКС
    data.buildings.forEach(b => {
        b.polygons.forEach(poly => {
            const shape = createShape(poly);
            if (shape.getPoints().length > 2) {
                const h = b.meta.height || 7;
                groups.buildings.add(createBuilding(shape, h, b.meta));
            }
            const c = getCentroid(poly[0]);
            const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);
            lbl.position.set(c.x, (b.meta.height || 7) + 10, c.z); groups.labels.add(lbl);
        });
    });

    // СООРУЖЕНИЯ
    data.structures.forEach(s => {
        let color = s.meta.isGas ? 0xfbbf24 : (s.meta.isWater ? 0x3b82f6 : (s.meta.isElectric ? 0x1e40af : 0x94a3b8));
        s.polygons.forEach(poly => {
            if(!poly || !poly[0]) return;
            if(s.type === "Line") {
                const vecPoints = poly[0].map(pt => new THREE.Vector3(pt.x||0, 2, -(pt.y||0))); // ИСПРАВЛЕНА ОСЬ Y
                if (vecPoints.length > 1) {
                    const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.05);
                    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 50, s.meta.diameter || 0.3, 12, false), new THREE.MeshStandardMaterial({ color: color }));
                    groups.structures.add(tube);
                }
            } else {
                const shape = createShape(poly);
                if (shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true }), new THREE.MeshStandardMaterial({ color: color }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5;
                    groups.structures.add(mesh);
                }
            }
        });
    });

    // ЗОУИТ
    data.zouits.forEach(z => {
        z.polygons.forEach(poly => {
            if(!poly || !poly[0]) return;
            if (z.type === "Line") {
                const vecPoints = poly[0].map(p => new THREE.Vector3(p.x||0, 3, -(p.y||0)));
                if (vecPoints.length > 1) {
                    const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.02);
                    const tunnel = new THREE.Mesh(new THREE.TubeGeometry(curve, 100, 5, 16, false, false, true), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.15 }));
                    groups.zouit.add(tunnel);
                }
            } else {
                const shape = createShape(poly);
                if (shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.2 }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 6;
                    groups.zouit.add(mesh);
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
        renderer.render(scene, camera);
    }
    animate();

} catch (err) {
    document.getElementById("loading").innerHTML = "<div style='color:#f87171'><b>Критическая ошибка 3D:</b><br>" + err.message + "</div>";
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