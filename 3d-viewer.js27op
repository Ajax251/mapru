window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");
    setTimeout(() => {
        try {
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

            const CLIP_RADIUS = 250;

            const simplifyRing = (ring, maxPoints) => {
                if (!ring || ring.length <= maxPoints) return ring;
                const step = Math.ceil(ring.length / maxPoints);
                const result = [];
                for (let i = 0; i < ring.length; i += step) result.push(ring[i]);
                if (result[result.length - 1] !== ring[ring.length - 1]) result.push(ring[ring.length - 1]);
                return result;
            };

            const intersectSegmentCircle = (inside, outside, r) => {
                const dx = outside.x - inside.x, dy = outside.y - inside.y;
                const a = dx * dx + dy * dy;
                if (a < 0.0001) return { x: inside.x, y: inside.y };
                const b = 2 * (inside.x * dx + inside.y * dy);
                const c = inside.x * inside.x + inside.y * inside.y - r * r;
                const disc = b * b - 4 * a * c;
                if (disc < 0) return { x: (inside.x + outside.x) / 2, y: (inside.y + outside.y) / 2 };
                const sqrtD = Math.sqrt(disc);
                let t = (-b - sqrtD) / (2 * a);
                if (t < 0 || t > 1) t = (-b + sqrtD) / (2 * a);
                t = Math.max(0, Math.min(1, t));
                return { x: inside.x + dx * t, y: inside.y + dy * t };
            };

            const clipToRadius = (ring, radius) => {
                if (!ring || ring.length < 2) return ring;
                const rSq = radius * radius;
                let hasInside = false, hasOutside = false;
                for (let i = 0; i < ring.length; i++) {
                    if (ring[i].x * ring[i].x + ring[i].y * ring[i].y <= rSq) hasInside = true;
                    else hasOutside = true;
                    if (hasInside && hasOutside) break;
                }
                if (!hasOutside) return ring;
                if (!hasInside) {
                    let minDist = Infinity, minIdx = 0;
                    for (let i = 0; i < ring.length; i++) {
                        const d = ring[i].x * ring[i].x + ring[i].y * ring[i].y;
                        if (d < minDist) { minDist = d; minIdx = i; }
                    }
                    const count = Math.min(30, ring.length);
                    const startIdx = Math.max(0, minIdx - Math.floor(count / 2));
                    const result = [];
                    for (let i = 0; i < count && (startIdx + i) < ring.length; i++) result.push(ring[startIdx + i]);
                    return result.length >= 2 ? result : null;
                }
                const result = [];
                for (let i = 0; i < ring.length; i++) {
                    const curr = ring[i], prev = ring[(i - 1 + ring.length) % ring.length];
                    const currIn = (curr.x * curr.x + curr.y * curr.y) <= rSq;
                    const prevIn = (prev.x * prev.x + prev.y * prev.y) <= rSq;
                    if (currIn) {
                        if (!prevIn) result.push(intersectSegmentCircle(curr, prev, radius));
                        result.push(curr);
                    } else if (prevIn) {
                        result.push(intersectSegmentCircle(prev, curr, radius));
                    }
                }
                return result.length >= 2 ? result : null;
            };

            const analyzeFeature = (f, category) => {
                const p = f.properties || {}, o = p.options || {};
                const descr = p.descr || '', purpose = o.purpose || o.params_purpose || '';
                const name = o.name_by_doc || o.name || o.params_name || o.building_name || '';
                const text = (descr + ' ' + name + ' ' + purpose).toLowerCase();
                let meta = {
                    id: o.cad_num || o.cad_number || o.reg_numb_border || descr || '',
                    name: name || purpose || descr || 'Объект', rawText: text,
                    area: o.build_record_area || o.area || o.specified_area || o.declared_area || o.land_record_area || '',
                    hasExtendedData: !!(purpose || name || o.build_record_area || o.year_built || o.floors),
                    isParcel: false, isSpatial: p._isSpatial !== false,
                };
                if (meta.area && !isNaN(parseFloat(meta.area))) meta.area = parseFloat(meta.area).toLocaleString('ru-RU') + ' м²';
                else if (o.params_extension) meta.area = o.params_extension + ' м (длина)';
                if (category === 'building') {
                    let df = 1;
                    if (text.includes('многоквартир') || text.includes('мкд')) df = 9;
                    else if (text.includes('жило') || text.includes('дом')) df = 2;
                    else if (text.includes('школ') || text.includes('больниц')) df = 3;
                    meta.floors = parseInt(o.floors) || df;
                    meta.height = meta.floors * 3.5;
                } else if (category === 'structure' || category === 'zouit' || category === 'target') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('воздушн');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && meta.isWater);
                    meta.diameter = parseFloat(o.diameter) || (meta.isGas ? 0.3 : 0.4);
                }
                if (category === 'parcel') {
                    meta.isParcel = true;
                    if (meta.name === 'Объект' || meta.name === meta.id) meta.name = 'Земельный участок';
                }
                return meta;
            };

            const processFeatureArray = (featuresArray, type) => {
                const result = [];
                const doClip = (type === 'structure' || type === 'zouit');
                (featuresArray || []).forEach(f => {
                    const meta = analyzeFeature(f, type);
                    if (!meta.isSpatial) { result.push({ type: 'Point', polygons: [], meta }); return; }
                    if (!f.geometry || !f.geometry.coordinates) return;
                    let ringsList = [];
                    if (f.geometry.type === 'Polygon') ringsList = [f.geometry.coordinates];
                    else if (f.geometry.type === 'MultiPolygon') ringsList = f.geometry.coordinates;
                    else if (f.geometry.type.includes('Line')) {
                        ringsList = f.geometry.type === 'LineString' ? [[f.geometry.coordinates]] : f.geometry.coordinates.map(c => [c]);
                    }
                    const localPolys = [];
                    ringsList.forEach(poly => {
                        const rings = [];
                        poly.forEach((ring, ri) => {
                            let pts = ring.map(c => (!c || typeof c[0] !== 'number') ? { x: 0, y: 0 } : { x: c[0] - originX, y: c[1] - originY });
                            pts = simplifyRing(pts, 200);
                            if (doClip && ri === 0) pts = clipToRadius(pts, CLIP_RADIUS);
                            if (pts && pts.length >= 2) rings.push(pts);
                        });
                        if (rings.length > 0) localPolys.push(rings);
                    });
                    if (localPolys.length === 0) return;
                    result.push({ type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon', polygons: localPolys, meta });
                });
                return result;
            };

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
                if (featureData && featureData.properties && featureData.properties.options) {
                    const o = featureData.properties.options;
                    tName = o.name_by_doc || o.name || o.reg_numb_border || tName;
                } else if (typeof pseudoFeature.options === 'object' && pseudoFeature.options.address) tName = pseudoFeature.options.address;
                const meta = analyzeFeature(pseudoFeature, logicCategory);
                meta.name = "Целевой: " + tName;
                meta.isSpatial = true;
                let rings = [];
                if (type === 'Point') rings = [[coords]];
                else if (type === 'LineString') rings = [coords];
                else if (type === 'Polygon') rings = coords;
                else if (type === 'MultiPolygon') rings = coords.flat();
                const doClip = logicCategory === 'zouit';
                const localPoly = [];
                rings.forEach(ring => {
                    let pts = ring.map(c => { const pt = to3857(c); return { x: pt[0] - originX, y: pt[1] - originY }; });
                    pts = simplifyRing(pts, 200);
                    if (doClip) pts = clipToRadius(pts, CLIP_RADIUS);
                    if (pts && pts.length >= 2) localPoly.push(pts);
                });
                if (localPoly.length === 0) return;
                allLocalFeatures.target.push({
                    type: (type === 'Polygon' || type === 'MultiPolygon') ? 'Polygon' : 'Line',
                    polygons: [localPoly], meta
                });
            });

            allLocalFeatures.parcels = processFeatureArray(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFeatureArray(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFeatureArray(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFeatureArray(window.zouitFeaturesData, 'zouit');

            const safeDataString = JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '2.5%', left: '2.5%', width: '95%', height: '95%',
                backgroundColor: '#fff', borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 25px 80px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid #cbd5e1'
            });
            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '12px 20px', background: '#fff', color: '#1e293b',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '16px', fontFamily: 'system-ui, sans-serif',
                borderBottom: '1px solid #e2e8f0'
            });
            header.innerHTML = '<span style="display:flex;align-items:center;"><i class="fas fa-cube" style="color:#3b82f6;font-size:20px;margin-right:10px;"></i> Кадастровая 3D Модель</span>';
            const btnC = document.createElement('div');
            btnC.style.display = 'flex'; btnC.style.gap = '8px';
            const mkBtn = (ic, hc) => {
                const b = document.createElement('button');
                b.innerHTML = `<i class="${ic}"></i>`;
                Object.assign(b.style, { background: '#f1f5f9', border: 'none', color: '#64748b', fontSize: '14px', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' });
                b.onmouseenter = () => { b.style.background = hc; b.style.color = '#fff'; };
                b.onmouseleave = () => { b.style.background = '#f1f5f9'; b.style.color = '#64748b'; };
                return b;
            };
            const minBtn = mkBtn('fas fa-minus', '#3b82f6');
            const closeBtn = mkBtn('fas fa-times', '#ef4444');
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#87CEEB' });
            let isMin = false;
            minBtn.onclick = () => {
                if (!isMin) { modal.style.width = '320px'; modal.style.height = '56px'; modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px'; modal.style.borderRadius = '12px'; iframe.style.display = 'none'; minBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>'; }
                else { modal.style.width = '95%'; modal.style.height = '95%'; modal.style.top = '2.5%'; modal.style.left = '2.5%'; modal.style.bottom = 'auto'; modal.style.borderRadius = '16px'; setTimeout(() => iframe.style.display = 'block', 300); minBtn.innerHTML = '<i class="fas fa-minus"></i>'; }
                isMin = !isMin;
            };
            closeBtn.onclick = () => modal.remove();
            btnC.appendChild(minBtn); btnC.appendChild(closeBtn);
            header.appendChild(btnC); modal.appendChild(header);

            const srcDocContent = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
body{margin:0;overflow:hidden;background:#87CEEB;font-family:"Segoe UI",system-ui,sans-serif}
#ui-panel{position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.95);padding:20px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);backdrop-filter:blur(10px);width:260px;z-index:100;border:1px solid #e2e8f0}
h3{margin-top:0;margin-bottom:15px;color:#1e293b;font-size:16px;border-bottom:2px solid #3b82f6;padding-bottom:8px;font-weight:600}
.lc{display:flex;align-items:center;margin-bottom:10px;cursor:pointer;padding:4px;border-radius:6px;transition:background .2s}
.lc:hover{background:#f1f5f9}
.lc input{margin-right:12px;cursor:pointer;width:16px;height:16px;accent-color:#3b82f6}
.lc label{cursor:pointer;font-size:13px;color:#334155;font-weight:500}
.cb{width:14px;height:14px;display:inline-block;margin-right:10px;border-radius:3px;border:1px solid rgba(0,0,0,0.2);flex-shrink:0}
.info-text{position:absolute;bottom:20px;right:20px;background:rgba(255,255,255,0.9);color:#333;padding:10px 15px;border-radius:8px;font-size:12px;font-weight:600;pointer-events:none;box-shadow:0 4px 15px rgba(0,0,0,0.1)}
#loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:16px;font-weight:600;background:rgba(59,130,246,0.9);padding:15px 30px;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.2)}
</style>
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>
<script type="importmap">
{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}
<\/script>
</head>
<body>
<div id="ui-panel">
<h3>Слои сцены</h3>
<div class="lc"><input type="checkbox" id="t-target" checked><div class="cb" style="background:#ef4444"></div><label for="t-target">Целевой объект</label></div>
<div class="lc"><input type="checkbox" id="t-parcels" checked><div class="cb" style="background:#a8d5ba"></div><label for="t-parcels">Земельные участки</label></div>
<div class="lc"><input type="checkbox" id="t-buildings" checked><div class="cb" style="background:#f1f5f9"></div><label for="t-buildings">Здания (ОКС)</label></div>
<div class="lc"><input type="checkbox" id="t-structures" checked><div class="cb" style="background:#fbbf24"></div><label for="t-structures">Инженерия / Сети</label></div>
<div class="lc"><input type="checkbox" id="t-zouit" checked><div class="cb" style="background:rgba(168,85,247,0.4)"></div><label for="t-zouit">ЗОУИТ</label></div>
<div class="lc" style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px"><input type="checkbox" id="t-labels" checked><div class="cb" style="background:#fff;border:2px solid #3b82f6"></div><label for="t-labels">Подписи объектов</label></div>
</div>
<div class="info-text">ЛКМ: вращение | ПКМ: панорама | Колесо: масштаб</div>
<div id="loading">Построение 3D...</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

try {
const data = ${safeDataString};
const animateables = [];

const BUILDING_DICT = {
    education:{keys:['школ','детск','сад','учебн','институт','образоват','ясли'],wall:0xfcd34d,base:0x92400e,roof:0x1e293b,win:0x93c5fd,winType:'ribbon',parapet:true},
    medical:{keys:['больниц','поликлиник','мед','здрав','госпитал','фап','амбулатор'],wall:0xffffff,base:0x94a3b8,roof:0xcbd5e1,win:0x7dd3fc,winType:'standard',parapet:true,addon:'cross'},
    mkd:{keys:['многоквартирный','мкд','общежити','квартир'],wall:0xe2e8f0,base:0x475569,roof:0x334155,win:0x3b82f6,winType:'dense',parapet:true},
    private:{keys:['жилой дом','индивидуальн','частн','дачн','садов'],wall:0xfde68a,base:0x78350f,roof:0x7f1d1d,win:0x60a5fa,winType:'standard',parapet:false,hippedRoof:true},
    commercial:{keys:['магазин','торгов','офис','бизнес','тц','трц','коммерч','центр'],wall:0x6ee7b7,base:0x064e3b,roof:0x1f2937,win:0x1e3a8a,winType:'large',parapet:true},
    industrial:{keys:['склад','цех','завод','производств','промышлен','гараж','ангар'],wall:0x94a3b8,base:0x334155,roof:0x475569,win:null,winType:'none',parapet:false},
    default:{wall:0xf1f5f9,base:0x64748b,roof:0x334155,win:0x93c5fd,winType:'minimal',parapet:true}
};
function getBuildingStyle(t){for(const[,c]of Object.entries(BUILDING_DICT)){if(c.keys&&c.keys.some(k=>t.includes(k)))return c;}return BUILDING_DICT.default;}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);
scene.fog = new THREE.FogExp2(0xdbeafe, 0.003);

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

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.4));
const sun = new THREE.DirectionalLight(0xfff8e7, 1.2);
sun.position.set(100, 150, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(1000, 200, 0xcbd5e1, 0xe2e8f0);
grid.position.y = 0.05;
scene.add(grid);

// КОМПАС
const cg = new THREE.Group();
const compassBase = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 })
);
compassBase.position.y = 0.25;
cg.add(compassBase);

const arrowGeo = new THREE.ConeGeometry(2, 10, 4);
arrowGeo.translate(0, 5, 0);
arrowGeo.rotateX(Math.PI / 2);
const aN = new THREE.Mesh(arrowGeo, new THREE.MeshStandardMaterial({ color: 0xef4444 }));
aN.position.y = 0.6;
aN.rotation.y = Math.PI;
cg.add(aN);
const aS = new THREE.Mesh(arrowGeo.clone(), new THREE.MeshStandardMaterial({ color: 0xffffff }));
aS.position.y = 0.6;
cg.add(aS);

const addL = (t, r, c) => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const x = cv.getContext('2d'); x.font = 'bold 80px sans-serif'; x.fillStyle = c;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 64, 64);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv) }));
    s.scale.set(6, 6, 1);
    s.position.set(Math.sin(r) * 11, 2, Math.cos(r) * 11);
    cg.add(s);
};
addL('С', Math.PI, '#ef4444');
addL('Ю', 0, '#1e293b');
addL('В', Math.PI / 2, '#1e293b');
addL('З', -Math.PI / 2, '#1e293b');
cg.position.set(-60, 0, 60);
scene.add(cg);

const groups = {
    target: new THREE.Group(), parcels: new THREE.Group(),
    buildings: new THREE.Group(), structures: new THREE.Group(),
    zouit: new THREE.Group(), labels: new THREE.Group()
};
for (let k in groups) scene.add(groups[k]);

// ==========================================
// ХЕЛПЕРЫ
// ==========================================
const createShape = (polyRings) => {
    const shape = new THREE.Shape();
    if (!polyRings || !polyRings[0] || polyRings[0].length < 3) return shape;
    const o = polyRings[0];
    shape.moveTo(o[0].x, -o[0].y);
    for (let i = 1; i < o.length; i++) shape.lineTo(o[i].x, -o[i].y);
    for (let i = 1; i < polyRings.length; i++) {
        if (!polyRings[i] || polyRings[i].length < 3) continue;
        const h = new THREE.Path();
        h.moveTo(polyRings[i][0].x, -polyRings[i][0].y);
        for (let j = 1; j < polyRings[i].length; j++) h.lineTo(polyRings[i][j].x, -polyRings[i][j].y);
        shape.holes.push(h);
    }
    return shape;
};

const getCentroid = (pts) => {
    if (!pts || !pts.length) return { x: 0, z: 0 };
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p.x; cy += -p.y; });
    return { x: cx / pts.length, z: cy / pts.length };
};

const ptsToVec3 = (pts, h) => pts.map(p => new THREE.Vector3(p.x, h || 0, -p.y));

const extractCenterline = (pts, yH) => {
    if (!pts || pts.length < 3) return ptsToVec3(pts || [], yH || 0);
    const len = pts.length;
    const step = Math.max(1, Math.floor(len / 60));
    let maxD = 0, pA = pts[0], pB = pts[1];
    for (let i = 0; i < len; i += step) {
        for (let j = i + step; j < len; j += step) {
            const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
            const d = dx * dx + dy * dy;
            if (d > maxD) { maxD = d; pA = pts[i]; pB = pts[j]; }
        }
    }
    const axLen = Math.sqrt(maxD);
    if (axLen < 0.01) return [new THREE.Vector3(pA.x, yH || 0, -pA.y)];
    const uX = (pB.x - pA.x) / axLen, uY = (pB.y - pA.y) / axLen;
    const nX = -uY, nY = uX;
    const s1 = [], s2 = [];
    for (let i = 0; i < len; i++) {
        const dx = pts[i].x - pA.x, dy = pts[i].y - pA.y;
        const along = dx * uX + dy * uY;
        (dx * nX + dy * nY >= 0 ? s1 : s2).push({ along, x: pts[i].x, y: pts[i].y });
    }
    if (!s1.length || !s2.length) return ptsToVec3(pts, yH || 0);
    s1.sort((a, b) => a.along - b.along);
    s2.sort((a, b) => a.along - b.along);
    const aMin = Math.min(s1[0].along, s2[0].along);
    const aMax = Math.max(s1[s1.length - 1].along, s2[s2.length - 1].along);
    const total = aMax - aMin;
    const numSeg = Math.max(2, Math.min(30, Math.round(total / 4)));
    const result = [];
    let i1 = 0, i2 = 0;
    for (let i = 0; i <= numSeg; i++) {
        const t = aMin + (total * i / numSeg);
        while (i1 < s1.length - 1 && s1[i1 + 1].along <= t) i1++;
        while (i2 < s2.length - 1 && s2[i2 + 1].along <= t) i2++;
        result.push(new THREE.Vector3((s1[i1].x + s2[i2].x) / 2, yH || 0, -(s1[i1].y + s2[i2].y) / 2));
    }
    const clean = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const p = clean[clean.length - 1], c = result[i];
        if ((c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z) > 0.1) clean.push(c);
    }
    return clean.length >= 2 ? clean : result;
};

const getClosestPoint = (ring) => {
    if (!ring || !ring.length) return { x: 0, y: 0 };
    let b = ring[0], bd = b.x * b.x + b.y * b.y;
    for (let i = 1; i < ring.length; i++) {
        const d = ring[i].x * ring[i].x + ring[i].y * ring[i].y;
        if (d < bd) { bd = d; b = ring[i]; }
    }
    return b;
};

const createLabel = (name, id, area, small) => {
    const cv = document.createElement("canvas");
    const m = cv.getContext("2d");
    m.font = "bold 56px sans-serif";
    const tw = m.measureText(name || "Объект").width;
    cv.width = small ? 512 : Math.max(800, tw + 150);
    cv.height = 256;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath(); ctx.roundRect(10, 10, cv.width - 20, 236, 15); ctx.fill();
    ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 4; ctx.stroke();
    ctx.textAlign = "center";
    const cx = cv.width / 2;
    if (small) {
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 36px sans-serif"; ctx.fillText(name, cx, 80, 480);
        ctx.fillStyle = "#3b82f6"; ctx.font = "bold 28px monospace"; ctx.fillText(id, cx, 140, 480);
        if (area) { ctx.fillStyle = "#ef4444"; ctx.font = "bold 26px sans-serif"; ctx.fillText(area, cx, 200, 480); }
    } else {
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 48px sans-serif"; ctx.fillText(name || "Объект", cx, 90, cv.width - 40);
        ctx.fillStyle = "#3b82f6"; ctx.font = "bold 40px monospace"; ctx.fillText(id || "", cx, 160, cv.width - 40);
        if (area) { ctx.fillStyle = "#64748b"; ctx.font = "34px sans-serif"; ctx.fillText(area, cx, 215, cv.width - 40); }
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
    sp.scale.set((cv.width / 1024) * 20, 5, 1);
    return sp;
};

const createStake = (id, pos) => {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    stick.position.y = 2; stick.castShadow = true; g.add(stick);
    const board = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
    board.position.set(0, 3.5, 0.1); board.castShadow = true; g.add(board);
    const l = createLabel("ОКС", id, "Нет координат", true);
    l.position.set(0, 3.5, 0.25); l.scale.set(3.8, 1.9, 1); g.add(l);
    g.position.set(pos.x, 0, pos.z);
    return g;
};

const createBuilding = (shape, height, style, mini) => {
    const b = new THREE.Group();
    const pts = shape.getPoints();
    if (pts.length < 3) return b;

    const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: style.base }));
    base.rotation.x = Math.PI / 2; base.position.y = 0.25; b.add(base);

    const walls = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: style.wall, roughness: 0.9 }));
    walls.rotation.x = Math.PI / 2; walls.position.y = height / 2 + 0.5;
    if (!mini) { walls.castShadow = true; walls.receiveShadow = true; }
    b.add(walls);

    if (style.hippedRoof && pts.length === 5) {
        const w = Math.abs(pts[0].x - pts[1].x) + 1, l = Math.abs(pts[1].y - pts[2].y) + 1;
        const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, l) * 0.7, 3, 4), new THREE.MeshStandardMaterial({ color: style.roof }));
        r.position.set((pts[0].x + pts[1].x) / 2, height + 2, -(pts[1].y + pts[2].y) / 2);
        r.rotation.y = Math.PI / 4;
        if (!mini) r.castShadow = true;
        b.add(r);
    } else {
        if (style.parapet) {
            const p = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2 }), new THREE.MeshStandardMaterial({ color: style.roof }));
            p.rotation.x = Math.PI / 2; p.position.y = height + 0.8; b.add(p);
        }
        const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        fr.rotation.x = Math.PI / 2; fr.position.y = height + (style.parapet ? 0.9 : 0.6); b.add(fr);
    }

    if (style.addon === 'cross') {
        const cr = new THREE.Group();
        const mt = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        cr.add(new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), mt));
        cr.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1), mt));
        cr.position.set((pts[0].x + pts[2].x) / 2, height + 4, -(pts[0].y + pts[2].y) / 2);
        b.add(cr);
    }

    if (style.winType !== 'none' && style.win) {
        let wW = 1.5, wH = 1.8, wS = 1.5;
        if (style.winType === 'dense') { wW = 1.2; wS = 0.8; }
        if (style.winType === 'ribbon') { wW = 4; wS = 0.5; }
        if (style.winType === 'large') { wW = 3; wH = 2.5; wS = 1; }
        const wMt = new THREE.MeshStandardMaterial({ color: style.win, roughness: 0.1, metalness: 0.8 });
        const wG = new THREE.PlaneGeometry(wW, wH);
        const fl = Math.max(1, Math.floor(height / 3.5));
        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = new THREE.Vector3(pts[i].x, 0, -pts[i].y);
            const p2 = new THREE.Vector3(pts[i + 1].x, 0, -pts[i + 1].y);
            const dir = new THREE.Vector3().subVectors(p2, p1);
            const ln = dir.length(); dir.normalize();
            const nm = new THREE.Vector3(-dir.z, 0, dir.x);
            const cnt = Math.floor(ln / (wW + wS));
            if (cnt > 0) {
                const pad = (ln - (cnt * wW + (cnt - 1) * wS)) / 2;
                for (let f = 0; f < fl; f++) {
                    const yP = 1.1 + f * 3.5 + 1.75;
                    for (let w = 0; w < cnt; w++) {
                        const off = pad + wW / 2 + w * (wW + wS);
                        const wx = p1.x + dir.x * off, wz = p1.z + dir.z * off;
                        const m = new THREE.Mesh(wG, wMt);
                        m.position.set(wx + nm.x * 0.05, yP, wz + nm.z * 0.05);
                        m.lookAt(new THREE.Vector3(wx + nm.x * 2, yP, wz + nm.z * 2));
                        b.add(m);
                    }
                }
            }
        }
    }
    return b;
};

// ==========================================
// ГАЗОПРОВОД: труба на опорах + туннель ЗОУИТ
// ==========================================
function buildGasPipeline(pts3D, group, labelGroup, meta) {
    const pipeH = 3;
    const curvePoints = pts3D.map(p => new THREE.Vector3(p.x, pipeH, p.z));
    if (curvePoints.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'chordal');

    // Труба жёлтая
    const pipe = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 64, 0.4, 16, false),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 })
    );
    pipe.castShadow = true;
    group.add(pipe);

    // Опоры равномерно
    const supportPts = curve.getPoints(Math.max(4, Math.floor(curvePoints.length * 1.5)));
    const supportStep = Math.max(1, Math.floor(supportPts.length / 12));
    for (let i = 0; i < supportPts.length; i += supportStep) {
        const pt = supportPts[i];
        const support = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, pt.y),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
        );
        support.position.set(pt.x, pt.y / 2, pt.z);
        support.castShadow = true;
        group.add(support);
    }

    // Туннель ЗОУИТ
    const zouitTunnel = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 64, 4, 16, false),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.25, depthWrite: false })
    );
    group.add(zouitTunnel);

    // Табличка
    const midPt = curvePoints[Math.floor(curvePoints.length / 2)];
    const lbl = createLabel(meta.name || "Газопровод (ЗОУИТ)", meta.id, "");
    lbl.position.set(midPt.x, pipeH + 6, midPt.z);
    labelGroup.add(lbl);
}

// ==========================================
// ЛЭП: столбы + провисающие провода + коридор ЗОУИТ
// ==========================================
function buildPowerLine(pts3D, group, labelGroup, meta) {
    const poleHeight = 15;
    if (pts3D.length < 2) return;

    // Столбы
    pts3D.forEach((pt, index) => {
        const poleGroup = new THREE.Group();

        // Столб
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.5, poleHeight, 12),
            new THREE.MeshStandardMaterial({ color: 0x5c4033 })
        );
        pole.position.y = poleHeight / 2;
        pole.castShadow = true;
        poleGroup.add(pole);

        // Траверса
        const crossArm = new THREE.Mesh(
            new THREE.BoxGeometry(5, 0.3, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x475569 })
        );
        crossArm.position.y = poleHeight - 1;
        if (index < pts3D.length - 1) {
            crossArm.rotation.y = Math.atan2(pts3D[index + 1].x - pt.x, pts3D[index + 1].z - pt.z);
        } else if (index > 0) {
            crossArm.rotation.y = Math.atan2(pt.x - pts3D[index - 1].x, pt.z - pts3D[index - 1].z);
        }
        poleGroup.add(crossArm);

        // Изоляторы
        const armAngle = crossArm.rotation.y;
        [-2, 0, 2].forEach(offset => {
            const insulator = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8),
                new THREE.MeshStandardMaterial({ color: 0x60a5fa })
            );
            insulator.position.set(
                Math.sin(armAngle) * offset,
                poleHeight - 0.5,
                Math.cos(armAngle) * offset
            );
            poleGroup.add(insulator);
        });

        poleGroup.position.set(pt.x, 0, pt.z);
        group.add(poleGroup);
    });

    // Провода с провисанием (3 линии)
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1e293b });
    for (let i = 0; i < pts3D.length - 1; i++) {
        const p1 = pts3D[i], p2 = pts3D[i + 1];
        const dx = p2.x - p1.x, dz = p2.z - p1.z;
        const segLen = Math.sqrt(dx * dx + dz * dz);
        if (segLen < 0.1) continue;
        const perpX = -dz / segLen, perpZ = dx / segLen;

        [-2, 0, 2].forEach(wireOffset => {
            const wp1 = new THREE.Vector3(p1.x + perpX * wireOffset, poleHeight - 1, p1.z + perpZ * wireOffset);
            const wp2 = new THREE.Vector3(p2.x + perpX * wireOffset, poleHeight - 1, p2.z + perpZ * wireOffset);
            const mid = new THREE.Vector3().addVectors(wp1, wp2).multiplyScalar(0.5);
            mid.y -= 3;
            const wireCurve = new THREE.QuadraticBezierCurve3(wp1, mid, wp2);
            group.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(wireCurve.getPoints(20)),
                wireMat
            ));
        });
    }

    // Коридор ЗОУИТ
    const corridorPts = pts3D.map(p => new THREE.Vector3(p.x, poleHeight / 2, p.z));
    if (corridorPts.length >= 2) {
        const corridorCurve = new THREE.CatmullRomCurve3(corridorPts, false, 'chordal');
        const zouitCorridor = new THREE.Mesh(
            new THREE.TubeGeometry(corridorCurve, 64, 8, 16, false),
            new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.2, depthWrite: false })
        );
        group.add(zouitCorridor);
    }

    // Табличка
    const midPt = pts3D[Math.floor(pts3D.length / 2)];
    const lbl = createLabel(meta.name || "ЛЭП (ЗОУИТ)", meta.id, "");
    lbl.position.set(midPt.x, poleHeight + 6, midPt.z);
    labelGroup.add(lbl);
}

// ====================================================================
// ПОСТРОЕНИЕ ОБЪЕКТОВ
// ====================================================================

// 1. ЦЕЛЕВОЙ
data.target.forEach(t => {
    if (t.meta.isGas || t.meta.isElectric) {
        t.polygons.forEach(poly => {
            if (!poly || !poly[0] || poly[0].length < 2) return;
            const pts3D = t.type === "Line" ? ptsToVec3(poly[0], 0) : extractCenterline(poly[0], 0);
            if (pts3D.length < 2) return;
            if (t.meta.isGas) buildGasPipeline(pts3D, groups.target, groups.labels, t.meta);
            else buildPowerLine(pts3D, groups.target, groups.labels, t.meta);
        });
    } else {
        const color = t.meta.isParcel ? 0x22c55e : 0xef4444;
        t.polygons.forEach(poly => {
            if (!poly || !poly[0]) return;
            if (t.type === "Line") {
                const vp = ptsToVec3(poly[0], 1.5);
                if (vp.length > 1) {
                    const tube = new THREE.Mesh(
                        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp, false, "chordal"), 64, 0.6, 8, false),
                        new THREE.MeshStandardMaterial({ color })
                    );
                    tube.castShadow = true;
                    groups.target.add(tube);
                }
            } else {
                const shape = createShape(poly);
                if (shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }),
                        new THREE.MeshStandardMaterial({ color, opacity: 0.8, transparent: true })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4;
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x7f1d1d })));
                    mesh.castShadow = true;
                    groups.target.add(mesh);
                }
            }
        });
        if (t.polygons[0] && t.polygons[0][0]) {
            const c = getCentroid(t.polygons[0][0]);
            const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area);
            lbl.position.set(c.x, 12, c.z);
            groups.labels.add(lbl);
        }
    }
});

// 2. УЧАСТКИ
data.parcels.forEach(p => {
    p.polygons.forEach(poly => {
        const shape = createShape(poly);
        if (shape.getPoints().length > 2) {
            const mesh = new THREE.Mesh(
                new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }),
                new THREE.MeshStandardMaterial({ color: 0xa8d5ba, roughness: 0.8 })
            );
            mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.1;
            mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x166534 })));
            mesh.receiveShadow = true;
            groups.parcels.add(mesh);
        }
        if (poly[0]) {
            const c = getCentroid(poly[0]);
            const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);
            lbl.position.set(c.x, 6, c.z);
            groups.labels.add(lbl);
        }
    });
});

// 3. ЗДАНИЯ
let lnkCnt = 0;
data.buildings.forEach(b => {
    const style = getBuildingStyle(b.meta.rawText);
    if (b.meta.isSpatial) {
        b.polygons.forEach(poly => {
            const shape = createShape(poly);
            if (shape.getPoints().length > 2) {
                groups.buildings.add(createBuilding(shape, b.meta.height, style));
                if (poly[0]) {
                    const c = getCentroid(poly[0]);
                    const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);
                    lbl.position.set(c.x, b.meta.height + 8, c.z);
                    groups.labels.add(lbl);
                }
            }
        });
    } else {
        const r = 25 + (lnkCnt % 2) * 8;
        const a = (lnkCnt * Math.PI * 2) / 6;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        if (b.meta.hasExtendedData) {
            const fg = new THREE.Group();
            const ds = new THREE.Shape();
            ds.moveTo(-5, -5); ds.lineTo(5, -5); ds.lineTo(5, 5); ds.lineTo(-5, 5);
            const miniModel = createBuilding(ds, b.meta.height, style, true);
            miniModel.scale.set(0.4, 0.4, 0.4);
            fg.add(miniModel);
            const laser = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 15),
                new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 })
            );
            laser.position.y = -7.5;
            fg.add(laser);
            const lbl = createLabel(b.meta.name, b.meta.id, "Парящая", true);
            lbl.position.y = b.meta.height * 0.4 + 6;
            fg.add(lbl);
            fg.position.set(px, 15, pz);
            fg.userData = { baseY: 15, offset: lnkCnt };
            animateables.push(fg);
            groups.buildings.add(fg);
        } else {
            groups.buildings.add(createStake(b.meta.id, { x: px, z: pz }));
        }
        lnkCnt++;
    }
});

// 4. СООРУЖЕНИЯ
data.structures.forEach(s => {
    s.polygons.forEach(poly => {
        if (!poly || !poly[0] || poly[0].length < 2) return;
        const pts3D = s.type === "Line" ? ptsToVec3(poly[0], 0) : extractCenterline(poly[0], 0);
        if (pts3D.length < 2) return;

        if (s.meta.isGas && !s.meta.isUnderground) {
            buildGasPipeline(pts3D, groups.structures, groups.labels, s.meta);
        } else if (s.meta.isElectric) {
            buildPowerLine(pts3D, groups.structures, groups.labels, s.meta);
        } else {
            const yO = s.meta.isUnderground ? -1 : 1;
            pts3D.forEach(p => p.y = yO);
            groups.structures.add(new THREE.Mesh(
                new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3D), 50, s.meta.diameter, 12, false),
                new THREE.MeshStandardMaterial({ color: 0x3b82f6 })
            ));
            const mp = pts3D[Math.floor(pts3D.length / 2)];
            const lbl = createLabel(s.meta.name || "Сооружение", s.meta.id, "");
            lbl.position.set(mp.x, 5, mp.z);
            groups.labels.add(lbl);
        }
    });
});

// 5. ЗОУИТ
data.zouits.forEach(z => {
    const isGas = z.meta.isGas;
    const isPow = z.meta.isElectric;

    z.polygons.forEach(poly => {
        if (!poly || !poly[0] || poly[0].length < 2) return;

        if (isGas || isPow) {
            let pts3D;
            if (z.type === "Line") {
                pts3D = ptsToVec3(poly[0], 0);
            } else {
                pts3D = extractCenterline(poly[0], 0);
            }
            if (pts3D.length < 2) return;

            if (isGas) {
                buildGasPipeline(pts3D, groups.zouit, groups.labels, z.meta);
            } else {
                buildPowerLine(pts3D, groups.zouit, groups.labels, z.meta);
            }
        } else {
            // Площадной ЗОУИТ
            const shape = createShape(poly);
            if (shape.getPoints().length > 2) {
                const h = 6;
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }),
                    new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.15, depthWrite: false })
                );
                mesh.rotation.x = Math.PI / 2;
                mesh.position.y = h / 2;
                mesh.add(new THREE.LineSegments(
                    new THREE.EdgesGeometry(mesh.geometry),
                    new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 })
                ));
                groups.zouit.add(mesh);
                const cp = getClosestPoint(poly[0]);
                const lbl = createLabel(z.meta.name, z.meta.id, "");
                lbl.position.set(cp.x, h + 3, -cp.y);
                groups.labels.add(lbl);
            }
        }
    });
});

// СЛОИ
document.getElementById("t-target").onchange = e => groups.target.visible = e.target.checked;
document.getElementById("t-parcels").onchange = e => groups.parcels.visible = e.target.checked;
document.getElementById("t-buildings").onchange = e => groups.buildings.visible = e.target.checked;
document.getElementById("t-structures").onchange = e => groups.structures.visible = e.target.checked;
document.getElementById("t-zouit").onchange = e => groups.zouit.visible = e.target.checked;
document.getElementById("t-labels").onchange = e => groups.labels.visible = e.target.checked;

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById("loading").style.display = "none";

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const time = performance.now() * 0.002;
    animateables.forEach(o => { o.position.y = o.userData.baseY + Math.sin(time + o.userData.offset) * 1.5; });
    renderer.render(scene, camera);
}
animate();

} catch (err) {
    document.getElementById("loading").innerHTML = "<div style='color:#fca5a5;font-size:14px'><b>Ошибка:</b><br>" + err.message + "</div>";
    console.error("3D Error:", err);
}
<\/script>
</body>
</html>`;

            iframe.srcdoc = srcDocContent;
            modal.appendChild(iframe);
            document.body.appendChild(modal);
            const escH = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escH); } };
            document.addEventListener('keydown', escH);

        } catch (error) {
            console.error("Ошибка генерации 3D:", error);
            if (typeof showNotification === 'function') showNotification("Ошибка: " + error.message, "error");
        } finally {
            if (typeof hideLoader === 'function') hideLoader();
        }
    }, 100);
};