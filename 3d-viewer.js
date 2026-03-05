window.open3DVisualization = function () {
    setTimeout(() => {
        try {
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels: [], buildings: [], structures: [], zouits: [], intersections:[] };
            
            const to3857 = (yandexCoord) => {
                if (!yandexCoord || typeof yandexCoord[0] !== 'number') return[0, 0];
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
                let rings =[];
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
                (featuresArray ||[]).forEach(f => {
                    const meta = analyzeFeature(f, type);
                    
                    if (!meta.isSpatial) {
                        result.push({ type: 'Point', polygons:[], meta: meta });
                        return;
                    }

                    if (!f.geometry || !f.geometry.coordinates) return;
                    let ringsList = [];
                    if (f.geometry.type === 'Polygon') ringsList =[f.geometry.coordinates];
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
                let rings =[];
                if (type === 'Point') rings = [[coords]];
                else if (type === 'LineString') rings =[coords];
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

            const srcDocContent = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
body { margin: 0; overflow: hidden; background: #87CEEB; font-family: "Segoe UI", system-ui, sans-serif; }
#ui-toggle-btn { display: none; position: absolute; top: 15px; right: 15px; background: rgba(255,255,255,0.95); border: 1px solid #cbd5e1; border-radius: 8px; width: 44px; height: 44px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 101; cursor: pointer; align-items: center; justify-content: center; }
#ui-toggle-btn svg { width: 20px; height: 20px; }
#ui-panel { position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); backdrop-filter: blur(10px); width: 260px; max-height: 85vh; overflow-y: auto; z-index: 100; border: 1px solid #e2e8f0; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s; }
#close-ui-btn { display: none; position: absolute; top: 15px; right: 20px; background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b; }
h3 { margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; font-weight: 600; padding-right: 25px; }

/* Tree view styles */
.layer-item { margin-bottom: 6px; }
.layer-header { display: flex; align-items: center; }
.caret { cursor: pointer; user-select: none; margin-right: 6px; font-size: 12px; color: #64748b; display: inline-block; width: 14px; text-align: center; transition: transform 0.2s; }
.caret::before { content: "▶"; }
.caret-down::before { content: "▼"; }
.nested { display: none; margin: 4px 0 4px 24px; padding: 0; list-style: none; border-left: 1px solid #cbd5e1; }
.active { display: block; }
.nested li { display: flex; align-items: center; margin-bottom: 4px; padding-left: 8px; }
.nested li label { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
.layer-control { display: flex; align-items: center; cursor: pointer; padding: 3px; border-radius: 6px; transition: background 0.2s; }
.layer-control:hover { background: #f1f5f9; }
.layer-control input { margin-right: 10px; cursor: pointer; width: 15px; height: 15px; accent-color: #3b82f6; }
.layer-control label { cursor: pointer; font-size: 13px; color: #334155; font-weight: 500; }
.color-box { width: 14px; height: 14px; display: inline-block; margin-right: 10px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0; }

/* Textures UI styles */
.sec-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 15px 0 8px; }
.tbtn { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 2px solid #e2e8f0; border-radius: 8px; background: #f8fafc; cursor: pointer; font-size: 12.5px; color: #334155; text-align: left; width: 100%; transition: all 0.1s; }
.tbtn:hover { border-color: #93c5fd; background: #eff6ff; }
.tbtn.active { border-color: #3b82f6; background: #dbeafe; font-weight: 700; color: #1d4ed8; }
.sw { width: 18px; height: 18px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); flex-shrink: 0; }

.info-text { position: absolute; bottom: 20px; left: 20px; background: rgba(255,255,255,0.9); color: #333; padding: 10px 15px; border-radius: 8px; font-size: 12px; font-weight: 600; pointer-events: none; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-left: 4px solid #3b82f6;}
.export-btn { width: 100%; margin-top: 15px; padding: 10px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
.export-btn:hover { background: #059669; box-shadow: 0 4px 12px rgba(16,185,129,0.3); }

#ui-panel::-webkit-scrollbar { width: 6px; }
#ui-panel::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
#ui-panel::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

@media (max-width: 768px) { #ui-toggle-btn { display: flex; } #ui-panel { right: 0; top: 0; height: 100vh; width: 280px; border-radius: 0; max-height: 100vh; box-shadow: -5px 0 30px rgba(0,0,0,0.3); } #ui-panel.hidden { transform: translateX(120%); opacity: 0; pointer-events: none; } #close-ui-btn { display: block; } .info-text { display: none; } }
</style>
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"></script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<button id="ui-toggle-btn"><svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 12 12 17 22 12"></polyline><polyline points="2 17 12 22 22 17"></polyline></svg></button>
<div id="ui-panel" class="hidden">
    <button id="close-ui-btn">&times;</button>
    <h3>Слои сцены</h3>
    <div id="layers-container"></div>
    <div class="layer-control" style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
        <span style="width:20px;display:inline-block;"></span>
        <input type="checkbox" id="t-labels" checked>
        <div class="color-box" style="background: #fff; border: 2px solid #3b82f6;"></div>
        <label for="t-labels">Подписи объектов</label>
    </div>
    
    <div style="margin-top: 15px; border-top: 1px solid #e2e8f0;">
        <div class="sec-title">Оформление пола</div>
        <div id="tex-btns" style="display: flex; flex-direction: column; gap: 5px;"></div>
    </div>

    <div style="margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        <button id="export-html-btn" class="export-btn">
            Сохранить в HTML
        </button>
    </div>
</div>
<div class="info-text">ЛКМ: Вращение | ПКМ: Перемещение<br><b>2x клик по табличке:</b> Быстрый фокус</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const uiPanel = document.getElementById('ui-panel');
const uiToggleBtn = document.getElementById('ui-toggle-btn');
const closeUiBtn = document.getElementById('close-ui-btn');

if (window.innerWidth > 768) { uiPanel.classList.remove('hidden'); }
uiToggleBtn.onclick = () => uiPanel.classList.toggle('hidden');
closeUiBtn.onclick = () => uiPanel.classList.add('hidden');

try {
    const data = ${safeDataString};
    const animateables = []; 
    
    // Раздаем уникальные ID всем объектам данных
    ['target', 'parcels', 'intersections', 'buildings', 'structures', 'zouits'].forEach(key => {
        if(data[key]) data[key].forEach((item, idx) => { item.uid = key + '_' + idx; });
    });

    const TYPE_COLORS = { target: '#ef4444', parcel: '#7cb342', building: '#2563eb', structure: '#f59e0b', zouit: '#9333ea' };

    // === ТЕКСТУРЫ ПОЛА (ГЕНЕРАТОР) ===
    function mkTex(fn, size = 512, repeat = 100) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        fn(c.getContext('2d'), size);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        return t;
    }

    const gen = {
        grass: () => mkTex((ctx, s) => {
            const img = ctx.createImageData(s, s);
            for (let i = 0; i < img.data.length; i += 4) {
                const n = Math.random();
                img.data[i]   = (32  + n * 20) | 0; img.data[i+1] = (90  + n * 48) | 0;
                img.data[i+2] = (18  + n * 14) | 0; img.data[i+3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            for (let i = 0; i < 35; i++) {
                ctx.fillStyle = \`rgba(15,55,8,\${0.05+Math.random()*0.1})\`;
                ctx.beginPath(); ctx.ellipse(Math.random()*s, Math.random()*s, 15+Math.random()*35, 10+Math.random()*20, Math.random()*Math.PI, 0, Math.PI*2); ctx.fill();
            }
        }),
        asphalt: () => mkTex((ctx, s) => {
            ctx.fillStyle = '#363434'; ctx.fillRect(0, 0, s, s);
            const img = ctx.getImageData(0, 0, s, s);
            for (let i = 0; i < img.data.length; i += 4) {
                const n = (Math.random()*22)|0; img.data[i] += n; img.data[i+1] += n; img.data[i+2] += n;
            }
            ctx.putImageData(img, 0, 0);
            ctx.strokeStyle = 'rgba(12,10,10,0.75)'; ctx.lineWidth = 1.2;
            for (let i = 0; i < 8; i++) {
                let cx = Math.random()*s, cy = Math.random()*s;
                ctx.beginPath(); ctx.moveTo(cx, cy);
                for (let j = 0; j < 5; j++) { cx += (Math.random()-0.5)*55; cy += (Math.random()-0.5)*55; ctx.lineTo(cx, cy); }
                ctx.stroke();
            }
        }),
        concrete: () => mkTex((ctx, s) => {
            ctx.fillStyle = '#babab2'; ctx.fillRect(0, 0, s, s);
            const img = ctx.getImageData(0, 0, s, s);
            for (let i = 0; i < img.data.length; i += 4) {
                const n = ((Math.random()*28)-14)|0;
                img.data[i] = Math.min(255,Math.max(0,img.data[i]+n)); img.data[i+1] = Math.min(255,Math.max(0,img.data[i+1]+n)); img.data[i+2] = Math.min(255,Math.max(0,img.data[i+2]+n-3));
            }
            ctx.putImageData(img, 0, 0);
            ctx.strokeStyle = 'rgba(70,68,62,0.5)'; ctx.lineWidth = 3; const ps = 128;
            for (let x = 0; x <= s; x += ps) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,s); ctx.stroke(); }
            for (let y = 0; y <= s; y += ps) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(s,y); ctx.stroke(); }
        }),
        sand: () => mkTex((ctx, s) => {
            const img = ctx.createImageData(s, s);
            for (let i = 0; i < img.data.length; i += 4) {
                const n = Math.random();
                img.data[i] = (208+n*28)|0; img.data[i+1] = (175+n*22)|0; img.data[i+2] = (92+n*20)|0; img.data[i+3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            ctx.strokeStyle = 'rgba(175,142,62,0.18)'; ctx.lineWidth = 1.5;
            for (let y = 0; y < s; y += 14) {
                ctx.beginPath();
                for (let x = 0; x <= s; x += 6) { const wy = y + Math.sin(x * 0.07) * 3.5; x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy); }
                ctx.stroke();
            }
        }),
        snow: () => mkTex((ctx, s) => {
            ctx.fillStyle = '#edf2ff'; ctx.fillRect(0, 0, s, s);
            for (let i = 0; i < 2800; i++) {
                const v = (218+Math.random()*32)|0;
                ctx.fillStyle = \`rgba(\${v},\${v},255,\${0.28+Math.random()*0.55})\`;
                ctx.beginPath(); ctx.arc(Math.random()*s, Math.random()*s, Math.random()*2.8, 0, Math.PI*2); ctx.fill();
            }
        })
    };

    const texList = [
        { id:'grass',   label:'🌿 Газон / трава',  sw:'#4a7c3f', r:1.0,  m:0 },
        { id:'asphalt', label:'🛣️ Асфальт',         sw:'#383636', r:0.95, m:0.04 },
        { id:'concrete',label:'🏗️ Плиты',           sw:'#b5b5ae', r:0.85, m:0 },
        { id:'sand',    label:'🏜️ Песок',            sw:'#d4b070', r:1.0,  m:0 },
        { id:'snow',    label:'❄️ Снег',             sw:'#edf2ff', r:0.8,  m:0 }
    ];

    // === ИНИЦИАЛИЗАЦИЯ СЦЕНЫ И RENDERER ===
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(40, 60, 100);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI / 2 - 0.02; 
    controls.target.set(0, 0, 0);

    // === НЕБО И ОСВЕЩЕНИЕ (ЯСНЫЙ ДЕНЬ) ===
    scene.fog = new THREE.FogExp2(0xb3e5fc, 0.0025);

    // Градиентная сфера неба
    const sc = document.createElement('canvas'); sc.width = 4; sc.height = 512;
    const sctx = sc.getContext('2d'); const sGrad = sctx.createLinearGradient(0, 0, 0, 512);
    [[0,'#1565c0'],[0.42,'#42a5f5'],[1,'#b3e5fc']].forEach(([s, c]) => sGrad.addColorStop(s, c));
    sctx.fillStyle = sGrad; sctx.fillRect(0, 0, 4, 512);
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), side: THREE.BackSide }));
    scene.add(skyMesh);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x4a7040, 0.5));
    
    const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
    sunLight.position.set(100, 150, 80); sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.top = 200; sunLight.shadow.camera.bottom = -200;
    sunLight.shadow.camera.left = -200; sunLight.shadow.camera.right = 200;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    // Видимое солнце с гало
    const sunGroup = new THREE.Group(); sunGroup.position.set(100, 150, 80);
    sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff176 })));
    const glowCvs = document.createElement('canvas'); glowCvs.width = glowCvs.height = 256;
    const glowCtx = glowCvs.getContext('2d'); const gGrad = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gGrad.addColorStop(0, 'rgba(255,250,180,0.95)'); gGrad.addColorStop(0.2, 'rgba(255,235,80,0.45)'); gGrad.addColorStop(0.55,'rgba(255,200,30,0.12)'); gGrad.addColorStop(1, 'rgba(0,0,0,0)');
    glowCtx.fillStyle = gGrad; glowCtx.fillRect(0, 0, 256, 256);
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCvs), transparent: true, depthWrite: false }));
    glowSprite.scale.set(72, 72, 1); sunGroup.add(glowSprite); scene.add(sunGroup);

    // === ПОВЕРХНОСТЬ ЗЕМЛИ ===
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    let groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x888 }));
    groundMesh.rotation.x = -Math.PI / 2; groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const grid = new THREE.GridHelper(2000, 200, 0x94a3b8, 0xcbd5e1);
    grid.position.y = 0.05; grid.material.transparent = true; grid.material.opacity = 0.25;
    scene.add(grid);

    function applyTex(cfg) {
        if (!gen[cfg.id]) return;
        const tex = gen[cfg.id]();
        groundMesh.material.dispose();
        groundMesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: cfg.r, metalness: cfg.m });
        grid.visible = cfg.id !== 'snow';
    }

    // === ГРУППЫ СЛОЕВ ===
    const groups = { target: new THREE.Group(), parcels: new THREE.Group(), intersections: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group() };
    const labelGroups = { target: new THREE.Group(), parcels: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group() };
    const masterLabelsGroup = new THREE.Group();
    for (let k in groups) scene.add(groups[k]);
    for (let k in labelGroups) masterLabelsGroup.add(labelGroups[k]);
    scene.add(masterLabelsGroup);

    // === ГЕОМЕТРИЯ ===
    const createShape = (polyRings) => {
        const shape = new THREE.Shape();
        if (!polyRings || !polyRings[0] || polyRings[0].length < 3) return shape;
        shape.moveTo(polyRings[0][0].x, polyRings[0][0].y);
        for(let i=1; i<polyRings[0].length; i++) shape.lineTo(polyRings[0][i].x, polyRings[0][i].y);
        for(let i=1; i<polyRings.length; i++) {
            if (!polyRings[i] || polyRings[i].length < 3) continue;
            const hole = new THREE.Path(); hole.moveTo(polyRings[i][0].x, polyRings[i][0].y);
            for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, polyRings[i][j].y);
            shape.holes.push(hole);
        }
        return shape;
    };

    const getCentroid = (points) => {
        if (!points || points.length === 0) return {x:0, z:0};
        let cx=0, cy=0; points.forEach(p => { cx+=p.x; cy+= p.y; });
        return { x: cx/points.length, z: -cy/points.length };
    };

    const createLabel = (name, id, areaText, isSmall = false, themeColor = '#3b82f6') => {
        const canvas = document.createElement("canvas");
        const ctxMeasure = canvas.getContext("2d"); ctxMeasure.font = "bold 56px sans-serif";
        const textWidth = ctxMeasure.measureText(name || "Объект").width;
        canvas.width = isSmall ? 512 : Math.max(1024, textWidth + 100); canvas.height = 256;
        const ctx = canvas.getContext("2d");
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath(); ctx.roundRect(10, 10, canvas.width-20, canvas.height-20, 15); ctx.fill();
        ctx.strokeStyle = themeColor; ctx.lineWidth = 6; ctx.stroke();
        
        ctx.textAlign = "center"; const centerX = canvas.width / 2;
        if (isSmall) {
            ctx.fillStyle = "#1e293b"; ctx.font = "bold 36px sans-serif"; ctx.fillText(name, centerX, 80, 480);
            ctx.fillStyle = themeColor; ctx.font = "bold 28px monospace"; ctx.fillText(id, centerX, 140, 480); 
            if (areaText) { ctx.fillStyle = "#ef4444"; ctx.font = "bold 26px sans-serif"; ctx.fillText(areaText, centerX, 200, 480); }
        } else {
            ctx.fillStyle = "#1e293b"; ctx.font = "bold 56px sans-serif"; ctx.fillText(name || "Объект", centerX, 90, canvas.width - 40);
            ctx.fillStyle = themeColor; ctx.font = "bold 44px monospace"; ctx.fillText(id || "", centerX, 155, canvas.width - 40);
            if (areaText) { ctx.fillStyle = "#64748b"; ctx.font = "38px sans-serif"; ctx.fillText(areaText, centerX, 210, canvas.width - 40); }
        }
        
        const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
        const targetScreenHeight = isSmall ? 0.04 : 0.06; 
        const aspect = canvas.width / canvas.height;
        sprite.scale.set(aspect * targetScreenHeight, targetScreenHeight, 1);
        sprite.center.set(0.5, 0);
        return sprite;
    };

    // === СТИЛИ ЗДАНИЙ И ОКНА ===
    const BUILDING_DICT = {
        education: { keys:['школ','детск','сад','учебн','институт','образоват'], wall: 0xfcd34d, base: 0x92400e, roof: 0x1e293b, win: 0x93c5fd, winType: 'ribbon', parapet: true },
        medical: { keys:['больниц','поликлиник','мед','здрав','госпитал'], wall: 0xffffff, base: 0x94a3b8, roof: 0xcbd5e1, win: 0x7dd3fc, winType: 'standard', parapet: true },
        mkd: { keys:['многоквартирный','мкд','общежити'], wall: 0x94a3b8, base: 0x475569, roof: 0x334155, win: 0x60a5fa, winType: 'dense', parapet: true },
        private: { keys:['жилой дом','индивидуальн','частн','дачн'], wall: 0xfde68a, base: 0x78350f, roof: 0x7f1d1d, win: 0x93c5fd, winType: 'standard', parapet: false, hippedRoof: true },
        commercial: { keys:['магазин','торгов','офис','бизнес','тц'], wall: 0x6ee7b7, base: 0x064e3b, roof: 0x1f2937, win: 0x1e3a8a, winType: 'large', parapet: true },
        industrial: { keys:['склад','цех','завод','производств','гараж'], wall: 0x64748b, base: 0x334155, roof: 0x475569, win: null, winType: 'none', parapet: false },
        default: { wall: 0xf1f5f9, base: 0x64748b, roof: 0x334155, win: 0x93c5fd, winType: 'standard', parapet: true }
    };

    function getBuildingStyle(rawText) {
        for (const [type, config] of Object.entries(BUILDING_DICT)) {
            if (config.keys && config.keys.some(k => rawText.includes(k))) return config;
        }
        return BUILDING_DICT.default;
    }

    const windowMaterialCache = {};
    function getWindowMaterial(style) {
        if (style.winType === 'none' || !style.win) return new THREE.MeshStandardMaterial({ color: style.wall, roughness: 0.9 });
        const cacheKey = style.wall + '_' + style.winType;
        if (windowMaterialCache[cacheKey]) return windowMaterialCache[cacheKey];

        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#' + new THREE.Color(style.wall).getHexString(); ctx.fillRect(0, 0, 256, 256);

        let winW = 120, winH = 160;
        if (style.winType === 'dense') { winW = 160; winH = 180; }
        else if (style.winType === 'ribbon') { winW = 220; winH = 100; }
        else if (style.winType === 'large') { winW = 180; winH = 200; }

        const startX = (256 - winW) / 2, startY = (256 - winH) / 2;
        ctx.fillStyle = '#' + new THREE.Color(style.win).getHexString(); ctx.fillRect(startX, startY, winW, winH);
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8; ctx.strokeRect(startX, startY, winW, winH); // Без решеток

        const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const tileSizeX = style.winType === 'dense' ? 3 : (style.winType === 'ribbon' ? 5 : 4); 
        tex.repeat.set(1 / tileSizeX, 1 / 3.5);

        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
        windowMaterialCache[cacheKey] = mat; return mat;
    }

    const createBuildingModel = (shape, height, style) => {
        const building = new THREE.Group();
        const pts = shape.getPoints(); if(pts.length < 3) return building;

        const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: style.base }));
        base.rotation.x = -Math.PI / 2; base.position.y = 0; building.add(base);

        const roofMat = new THREE.MeshStandardMaterial({ color: style.roof });
        const walls = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }), [roofMat, getWindowMaterial(style)]);
        walls.rotation.x = -Math.PI / 2; walls.position.y = 0.5; walls.castShadow = true; walls.receiveShadow = true; building.add(walls);

        if (style.hippedRoof) { 
            let mx = Infinity, Mx = -Infinity, my = Infinity, My = -Infinity;
            pts.forEach(p => { mx=Math.min(mx, p.x); Mx=Math.max(Mx, p.x); my=Math.min(my, p.y); My=Math.max(My, p.y); });
            const w = Mx - mx, d = My - my, cx = (mx + Mx)/2, cy = (my + My)/2;
            const roofH = Math.max(3, height * 0.5); const roofBaseDim = Math.sqrt(w*w + d*d) * 0.72;
            const roofGeo = new THREE.ConeGeometry(roofBaseDim, roofH, 4); roofGeo.rotateY(Math.PI / 4);
            const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.set(cx, 0.5 + height + roofH / 2, -cy);
            roof.scale.set(w / roofBaseDim, 1, d / roofBaseDim); roof.castShadow = true; building.add(roof);
        } else {
            if (style.parapet) {
                const parapet = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2 }), roofMat);
                parapet.rotation.x = -Math.PI / 2; parapet.position.y = 0.5 + height; building.add(parapet);
            }
            const flatRoof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
            flatRoof.rotation.x = -Math.PI / 2; flatRoof.position.y = 0.5 + height + (style.parapet ? 0.8 : 0); building.add(flatRoof);
        }
        return building;
    };

    const addToGroups = (gDest, lDest, item, mesh, lbl) => {
        mesh.userData.uid = item.uid; gDest.add(mesh);
        if (lbl && lDest) { lbl.userData.uid = item.uid; lDest.add(lbl); }
    };

    // Отрисовка
    data.target.forEach(t => {
        const color = (t.meta && t.meta.isParcel) ? 0x7cb342 : 0xef4444;
        const group = new THREE.Group();
        t.polygons.forEach(poly => {
            if (!poly || !poly[0]) return;
            if (t.type === "Line") {
                const pts = poly[0].map(p => new THREE.Vector3(p.x, 1.5, -p.y));
                if (pts.length > 1) { const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "chordal"), 64, 0.6, 8, false), new THREE.MeshStandardMaterial({ color: color })); tube.castShadow = true; group.add(tube); }
            } else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: color, opacity: 0.8, transparent: true }));
                    mesh.rotation.x = -Math.PI / 2; mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x7f1d1d, linewidth: 2 })));
                    mesh.castShadow = true; group.add(mesh);
                }
            }
        });
        const c = t.polygons[0] ? getCentroid(t.polygons[0][0]) : {x:0, z:0};
        const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area, false, TYPE_COLORS.target); lbl.position.set(c.x, 10, c.z);
        addToGroups(groups.target, labelGroups.target, t, group, lbl);
    });

    data.parcels.forEach((p, i) => {
        const group = new THREE.Group(); const yOff = i * 0.015;
        p.polygons.forEach(poly => {
            const shape = createShape(poly);
            if(shape.getPoints().length > 2) {
                // Полупрозрачный светло-зеленый цвет для участков, чтобы видеть текстуру пола
                const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x7cb342, transparent: true, opacity: 0.65, roughness: 1 }));
                mesh.rotation.x = -Math.PI / 2; mesh.position.y = yOff + 0.08;
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x4a822b, linewidth: 2 })));
                mesh.receiveShadow = true; group.add(mesh);
            }
        });
        const c = p.polygons[0] ? getCentroid(p.polygons[0][0]) : {x:0, z:0};
        const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area, false, TYPE_COLORS.parcel); lbl.position.set(c.x, 2 + yOff, c.z); 
        addToGroups(groups.parcels, labelGroups.parcels, p, group, lbl);
    });

    data.intersections.forEach(iObj => {
        const intGroup = new THREE.Group();
        iObj.polygons.forEach(poly => {
            const shape = createShape(poly);
            if(shape.getPoints().length > 2) {
                const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.7, depthWrite: false }));
                mesh.rotation.x = -Math.PI / 2; mesh.position.y = 1.0;
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x991b1b, linewidth: 3 }))); intGroup.add(mesh);
            }
        });
        addToGroups(groups.intersections, null, iObj, intGroup, null);
    });

    data.buildings.forEach(b => {
        const bGroup = new THREE.Group(); const style = getBuildingStyle(b.meta.rawText); let lbl = null;
        if (b.meta.isSpatial) {
            b.polygons.forEach(poly => {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    bGroup.add(createBuildingModel(shape, b.meta.height, style));
                    const c = getCentroid(poly[0]);
                    lbl = createLabel(b.meta.name, b.meta.id, b.meta.area, false, TYPE_COLORS.building); lbl.position.set(c.x, b.meta.height + 4, c.z); 
                }
            });
        }
        addToGroups(groups.buildings, labelGroups.buildings, b, bGroup, lbl);
    });

    data.structures.forEach(s => {
        const sGroup = new THREE.Group(); let lbl = null;
        s.polygons.forEach(poly => {
            if(!poly || !poly[0] || poly[0].length < 2) return;
            if(s.type === "Line") {
                const pts = poly[0].map(pt => new THREE.Vector3(pt.x, s.meta.isUnderground ? -1 : 1, -pt.y));
                sGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, s.meta.diameter, 12, false), new THREE.MeshStandardMaterial({ color: s.meta.isGas ? 0xfbbf24 : 0x3b82f6 })));
            } else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
                    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = true; sGroup.add(mesh);
                    const c = getCentroid(poly[0]); lbl = createLabel(s.meta.name, s.meta.id, "", false, TYPE_COLORS.structure); lbl.position.set(c.x, 3, c.z); 
                }
            }
        });
        addToGroups(groups.structures, labelGroups.structures, s, sGroup, lbl);
    });

    data.zouits.forEach(z => {
        const zGroup = new THREE.Group(); let lbl = null;
        const color = z.meta.isGas ? 0xfbbf24 : (z.meta.isElectric ? 0xa855f7 : 0x3b82f6); 
        const labelText = z.meta.name || (z.meta.isGas ? "Охранная зона газа" : (z.meta.isElectric ? "Охранная зона ЛЭП" : "ЗОУИТ"));
        z.polygons.forEach(poly => {
            if(!poly || !poly[0] || poly[0].length < 2) return;
            if (z.type === "Line") {
                const pts = poly[0].map(p => new THREE.Vector3(p.x, 2, -p.y));
                zGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 4, 16, false), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false })));
            } else {
                const shape = createShape(poly);
                if(shape.getPoints().length > 2) {
                    const h = 4; 
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15, depthWrite: false }));
                    mesh.rotation.x = -Math.PI / 2; zGroup.add(mesh);
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 })));
                    lbl = createLabel(labelText, z.meta.id, "", false, TYPE_COLORS.zouit); lbl.position.set(poly[0][0].x, h + 3, -poly[0][0].y); 
                }
            }
        });
        addToGroups(groups.zouit, labelGroups.zouit, z, zGroup, lbl);
    });

    // === UI ЛОГИКА ===
    const buildLayersUI = () => {
        const container = document.getElementById('layers-container');
        const createLayer = (id, label, color, groupRef, labelGroupRef, items) => {
            if (!items || items.length === 0) return;
            const wrapper = document.createElement('div'); wrapper.className = 'layer-item';
            const header = document.createElement('div'); header.className = 'layer-header layer-control';
            let caretHtml = items.length > 1 ? '<span class="caret"></span>' : '<span style="width:20px;display:inline-block;"></span>';
            header.innerHTML = \`\${caretHtml}<input type="checkbox" id="main-\${id}" checked><div class="color-box" style="background: \${color};"></div><label for="main-\${id}">\${label}</label>\`;
            wrapper.appendChild(header);

            const mainCheckbox = header.querySelector('input');
            mainCheckbox.onchange = (e) => {
                if(groupRef) groupRef.visible = e.target.checked;
                if(labelGroupRef) labelGroupRef.visible = e.target.checked;
                if (ul) ul.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
            };

            let ul = null; const caret = header.querySelector('.caret');
            if (caret && items.length > 1) {
                ul = document.createElement('ul'); ul.className = 'nested';
                items.forEach((item) => {
                    const li = document.createElement('li'); li.className = 'layer-control';
                    li.innerHTML = \`<input type="checkbox" id="child-\${item.uid}" checked><label title="\${item.meta.id}" for="child-\${item.uid}">\${item.meta.name || item.meta.id || 'Объект'}</label>\`;
                    ul.appendChild(li);
                    li.querySelector('input').onchange = (e) => {
                        const isChecked = e.target.checked;
                        if(groupRef) groupRef.children.forEach(c => { if(c.userData.uid === item.uid) c.visible = isChecked; });
                        if(labelGroupRef) labelGroupRef.children.forEach(c => { if(c.userData.uid === item.uid) c.visible = isChecked; });
                        mainCheckbox.checked = Array.from(ul.querySelectorAll('input')).some(cb => cb.checked);
                        if(groupRef) groupRef.visible = true; if(labelGroupRef) labelGroupRef.visible = true;
                    };
                });
                wrapper.appendChild(ul);
                caret.onclick = () => { ul.classList.toggle('active'); caret.classList.toggle('caret-down'); };
            }
            container.appendChild(wrapper);
        };

        createLayer('target', 'Целевой объект', '#ef4444', groups.target, labelGroups.target, data.target);
        createLayer('parcels', 'Земельные участки', '#7cb342', groups.parcels, labelGroups.parcels, data.parcels);
        createLayer('intersections', 'Наложения участков', '#dc2626', groups.intersections, null, data.intersections);
        createLayer('buildings', 'Здания (ОКС)', '#f1f5f9', groups.buildings, labelGroups.buildings, data.buildings);
        createLayer('structures', 'Инженерия / Сети', '#fbbf24', groups.structures, labelGroups.structures, data.structures);
        createLayer('zouit', 'ЗОУИТ', '#a855f7', groups.zouit, labelGroups.zouit, data.zouits);
    };

    buildLayersUI();
    document.getElementById("t-labels").onchange = (e) => { masterLabelsGroup.visible = e.target.checked; };

    // Кнопки текстур
    const texCont = document.getElementById('tex-btns');
    texList.forEach((cfg, i) => {
        const btn = document.createElement('button');
        btn.className = 'tbtn' + (i === 0 ? ' active' : '');
        btn.innerHTML = \`<div class="sw" style="background:\${cfg.sw}"></div>\${cfg.label}\`;
        btn.onclick = () => {
            texCont.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); applyTex(cfg);
        };
        texCont.appendChild(btn);
    });
    applyTex(texList[0]); // Газон по умолчанию

    // === НАВИГАЦИЯ И ВЗАИМОДЕЙСТВИЕ ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('dblclick', (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const sprites = []; masterLabelsGroup.traverse(child => { if (child.isSprite && child.visible) sprites.push(child); });
        const intersects = raycaster.intersectObjects(sprites);
        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const targetPoint = new THREE.Vector3(hit.position.x, 0, hit.position.z);
            const currentDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
            controls.target.copy(targetPoint);
            camera.position.copy(targetPoint).add(currentDir.multiplyScalar(45));
            camera.position.y = Math.max(camera.position.y, 10);
        }
    });

    document.getElementById('export-html-btn').onclick = () => {
        const cloneDoc = document.documentElement.cloneNode(true);
        const canvases = cloneDoc.querySelectorAll('canvas');
        canvases.forEach(c => c.remove());
        const finalHtmlStr = '<!DOCTYPE html>\\n<html lang="ru">\\n' + cloneDoc.innerHTML + '\\n</html>';
        const blob = new Blob([finalHtmlStr], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = '3D_Кадастровая_модель_' + new Date().toISOString().slice(0, 10) + '.html';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

} catch (err) {
    document.body.innerHTML += "<div style='position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); padding:20px; border-radius:8px; color:#fca5a5; font-size:14px; z-index:1000;'><b>Ошибка построения 3D сцены:</b><br>" + err.message + "</div>";
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
            if (typeof showNotification === 'function') {
                showNotification("Ошибка генерации 3D сцены: " + error.message, "error");
            }
        }
    }, 100);
};