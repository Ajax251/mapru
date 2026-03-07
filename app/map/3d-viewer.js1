window.open3DVisualization = function () {
    setTimeout(() => {
        try {
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels:[], buildings: [], structures: [], zouits: [], intersections:[] };

            // Чтение сохраненной темы
            const savedTheme = localStorage.getItem('3d_viewer_theme') || 'light';

            const cleanAddress = (rawAddress) => {
                if (!rawAddress) return '';
                let clean = rawAddress
                    .replace(/Российская Федерация[,\s]*/gi, '')
                    .replace(/Республика Татарстан[,\s]*/gi, '')
                    .trim();
                if (clean.length > 0) clean = clean.charAt(0).toUpperCase() + clean.slice(1);
                return clean;
            };

            const to3857 = (yandexCoord) => {
                if (!yandexCoord || typeof yandexCoord[0] !== 'number') return [0, 0];
                const trueLat = yandexCoord[0] + (window.mapOffsetY * 0.000008983);
                const trueLon = yandexCoord[1] + (window.mapOffsetX * 0.000008983);
                return window.proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            };

            if (!window.quickReportTargetObjects || window.quickReportTargetObjects.length === 0) {
                if (typeof showNotification === 'function') {
                    showNotification("Нет объектов для 3D. Выберите объекты на карте.", "warning");
                }
                return;
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
                let rawName = o.name || o.params_name || o.building_name || o.name_by_doc || o.type_zone || '';
                let name = window.isGlobalMapMode ? cleanAddress(rawName) : rawName;
                
                const text = (descr + ' ' + name + ' ' + purpose).toLowerCase();
                
                let meta = {
                    id: o.cad_num || o.cad_number || o.reg_numb_border || descr || 'Без номера',
                    name: name || purpose || (window.isGlobalMapMode ? cleanAddress(descr) : descr) || 'Объект',
                    rawText: text,
                    area: o.build_record_area || o.area || o.specified_area || o.declared_area || o.land_record_area || '',
                    hasExtendedData: !!(purpose || name || o.build_record_area || o.year_built || o.floors),
                    isParcel: false,
                    isSpatial: p._isSpatial !== false,
                    // Расширенные поля для детального Hint
                    floors: o.floors || '',
                    year: o.year_built || o.params_year_built || '',
                    material: o.materials || ''
                };

                if (meta.area && !isNaN(parseFloat(meta.area))) {
                    meta.area = parseFloat(meta.area).toLocaleString('ru-RU') + ' м²';
                } else if (o.params_extension) {
                    meta.area = o.params_extension + ' м (длина)';
                } else if (o.content_restrict_encumbrances) {
                     meta.area = "Ограничение"; 
                }

                if (category === 'building') {
                    let defaultFloors = 1;
                    if (text.includes('многоквартир') || text.includes('мкд')) defaultFloors = 9;
                    else if (text.includes('жило') || text.includes('дом')) defaultFloors = 2;
                    else if (text.includes('школ') || text.includes('больниц')) defaultFloors = 3;
                    meta.floorsNumeric = parseInt(o.floors) || defaultFloors;
                    meta.height = meta.floorsNumeric * 3.5;
                } else if (category === 'structure' || category === 'zouit') {
                    meta.isSewer = text.includes('канализ') || text.includes('канал') || text.includes('сток');
                    meta.isGas = text.includes('газ');
                    meta.isHeat = text.includes('тепло');
                    meta.isWater = (text.includes('водо') || text.includes('вод')) && !meta.isSewer;
                    // Расширенная проверка на электричество
                    meta.isElectric = text.includes('электро') || text.includes('электр') || text.includes('лэп') || text.includes('лп ') || text.includes('вл ') || text.includes('вкл ') || text.includes('воздушн');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (meta.isWater || meta.isSewer));
                    meta.diameter = parseFloat(o.diameter) || (meta.isGas ? 0.3 : (meta.isHeat ? 0.4 : (meta.isSewer ? 0.5 : 0.35)));
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
                    let ringsList =[];
                    if (f.geometry.type === 'Polygon') ringsList = [f.geometry.coordinates];
                    else if (f.geometry.type === 'MultiPolygon') ringsList = f.geometry.coordinates;
                    else if (f.geometry.type.includes('Line')) {
                        ringsList = f.geometry.type === 'LineString' ? [[f.geometry.coordinates]] : f.geometry.coordinates.map(c => [c]);
                    }
                    const localPolys = ringsList.map(poly => poly.map(ring => ring.map(c => {
                        if (!c || typeof c[0] !== 'number') return { x: 0, y: 0 };
                        return { x: c[0] - originX, y: c[1] - originY };
                    })));
                    result.push({ type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon', polygons: localPolys, meta: meta });
                });
                return result;
            };

            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates();
                const type = obj.geometry.getType();
                const isTargetParcel = obj.properties.get('isParcelInQuarter') || obj.properties.get('isFoundInArea') || (obj.properties.get('featureData') && obj.properties.get('featureData').properties.category === 36368);
                let rings =[];
                if (type === 'Point') rings = [[coords]];
                else if (type === 'LineString') rings = [coords];
                else if (type === 'Polygon') rings = coords;
                else if (type === 'MultiPolygon') rings = coords.flat();
                const localPoly = rings.map(ring => ring.map(c => {
                    const pt = to3857(c); return { x: pt[0] - originX, y: pt[1] - originY };
                }));
                let titleName = obj.properties.get('cadastralNumber') || 'Целевой объект';
                allLocalFeatures.target.push({
                    type: (type === 'Polygon' || type === 'MultiPolygon') ? 'Polygon' : 'Line',
                    polygons: [localPoly],
                    meta: { isParcel: isTargetParcel, name: titleName, id: '', isSpatial: true }
                });
            });

            allLocalFeatures.parcels = processFeatureArray(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFeatureArray(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFeatureArray(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFeatureArray(window.zouitFeaturesData, 'zouit');

            // Расчет наложений для подсветки
            if (window.turf && window.parcelFeaturesData && window.parcelFeaturesData.length > 1) {
                const localPolysForTurf =[];
                window.parcelFeaturesData.forEach((f) => {
                    if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
                        let ringsList = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
                        ringsList.forEach(poly => {
                            let localRings = poly.map(ring => ring.map(c => {
                                const pt = to3857(c); return [pt[0] - originX, pt[1] - originY];
                            }));
                            // Замыкаем кольца для turf
                            localRings = localRings.map(ring => {
                                if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
                                    ring.push([...ring[0]]);
                                }
                                return ring;
                            });
                            if (localRings[0].length >= 4) {
                                try { localPolysForTurf.push(window.turf.polygon(localRings)); } catch (e) { }
                            }
                        });
                    }
                });
                for (let i = 0; i < localPolysForTurf.length; i++) {
                    for (let j = i + 1; j < localPolysForTurf.length; j++) {
                        try {
                            const intersection = window.turf.intersect(window.turf.featureCollection([localPolysForTurf[i], localPolysForTurf[j]]));
                            if (intersection && intersection.geometry) {
                                let iRingsList = intersection.geometry.type === 'Polygon' ?[intersection.geometry.coordinates] : intersection.geometry.coordinates;
                                iRingsList.forEach(poly => {
                                    const formattedPoly = poly.map(ring => ring.map(c => ({ x: c[0], y: c[1] })));
                                    allLocalFeatures.intersections.push({ type: 'Polygon', polygons: [formattedPoly], meta: { name: 'Наложение', id: 'Конфликт границ' } });
                                });
                            }
                        } catch (e) { }
                    }
                }
            }

            const safeDataString = JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            // Цвета модального окна
            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '2.5%', left: '2.5%', width: '95%', height: '95%',
                backgroundColor: savedTheme === 'dark' ? '#0f172a' : '#ffffff',
                borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 25px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid rgba(128,128,128,0.2)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });

            // Заголовок модального окна
            const header = document.createElement('div');
            header.className = 'modal-header';
            const headerBg = savedTheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
            const headerColor = savedTheme === 'dark' ? '#f8fafc' : '#1e293b';
            
            Object.assign(header.style, {
                padding: '12px 20px', background: headerBg, backdropFilter: 'blur(10px)',
                color: headerColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '15px', fontFamily: 'system-ui, -apple-system, sans-serif',
                borderBottom: '1px solid rgba(128,128,128,0.1)'
            });
            header.innerHTML = '<span style="display:flex;align-items:center;"><i class="fas fa-cube" style="color:#3b82f6;font-size:18px;margin-right:10px;"></i> Кадастровая Карта 3D</span>';

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex'; btnContainer.style.gap = '8px';

            const createWinBtn = (iconClass, hoverColor, action) => {
                const btn = document.createElement('button');
                btn.innerHTML = '<i class="' + iconClass + '"></i>';
                Object.assign(btn.style, {
                    background: 'rgba(128,128,128,0.1)', border: 'none', color: 'inherit', fontSize: '14px',
                    cursor: 'pointer', width: '30px', height: '30px', borderRadius: '6px', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                btn.onmouseenter = () => { btn.style.background = hoverColor; btn.style.color = '#fff'; };
                btn.onmouseleave = () => { btn.style.background = 'rgba(128,128,128,0.1)'; btn.style.color = 'inherit'; };
                if(action) btn.onclick = action;
                return btn;
            };

            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1' });

            const themeBtn = createWinBtn(savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon', '#f59e0b', () => {
                const newTheme = modal.dataset.theme === 'dark' ? 'light' : 'dark';
                modal.dataset.theme = newTheme;
                localStorage.setItem('3d_viewer_theme', newTheme);
                
                modal.style.backgroundColor = newTheme === 'dark' ? '#0f172a' : '#ffffff';
                header.style.background = newTheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
                header.style.color = newTheme === 'dark' ? '#f8fafc' : '#1e293b';
                themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

                iframe.contentWindow.postMessage({ type: 'setTheme', theme: newTheme }, '*');
            });
            modal.dataset.theme = savedTheme;

            let isMinimized = false;
            const minBtn = createWinBtn('fas fa-compress-alt', '#3b82f6', () => {
                if (!isMinimized) {
                    modal.style.width = '340px'; modal.style.height = '54px';
                    modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px';
                    iframe.style.display = 'none'; minBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
                } else {
                    modal.style.width = '95%'; modal.style.height = '95%';
                    modal.style.top = '2.5%'; modal.style.left = '2.5%'; modal.style.bottom = 'auto';
                    setTimeout(() => iframe.style.display = 'block', 300);
                    minBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
                }
                isMinimized = !isMinimized;
            });
            const closeBtn = createWinBtn('fas fa-times', '#ef4444', () => { window.isGlobalMapMode = false; modal.remove(); });

            btnContainer.appendChild(themeBtn);
            btnContainer.appendChild(minBtn);
            btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer); modal.appendChild(header);

            const srcDocContent = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
    :root {
        --bg-color: #f8fafc;
        --text-color: #1e293b;
        --text-muted: #64748b;
        --panel-bg: rgba(255, 255, 255, 0.95);
        --tooltip-bg: rgba(255, 255, 255, 0.95);
        --border-color: rgba(0,0,0,0.1);
        --shadow-color: rgba(0,0,0,0.15);
        --btn-bg: rgba(255, 255, 255, 0.95);
        --btn-text: #3b82f6;
    }
    
    [data-theme="dark"] {
        --bg-color: #0f172a;
        --text-color: #f8fafc;
        --text-muted: #94a3b8;
        --panel-bg: rgba(15, 23, 42, 0.85);
        --tooltip-bg: rgba(15, 23, 42, 0.9);
        --border-color: rgba(255,255,255,0.15);
        --shadow-color: rgba(0,0,0,0.5);
        --btn-bg: rgba(15, 23, 42, 0.85);
        --btn-text: #60a5fa;
    }

    body { margin: 0; overflow: hidden; background: var(--bg-color); font-family: 'Inter', system-ui, sans-serif; user-select: none; transition: background 0.3s; }
    canvas { display: block; outline: none; }
    
    #labels-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; z-index: 10; }
    
    .poi-label {
        position: absolute; display: flex; align-items: center; gap: 6px;
        transform: translate(-50%, -50%);
        will-change: transform, opacity; transition: opacity 0.3s ease;
        pointer-events: auto; /* Важно для ховера и клика */
        cursor: pointer;
    }
    .poi-dot {
        width: 12px; height: 12px; border-radius: 50%;
        box-shadow: 0 2px 4px var(--shadow-color), inset 0 0 4px rgba(255,255,255,0.8);
        border: 2px solid #ffffff; flex-shrink: 0;
    }
    .poi-text {
        color: var(--text-color); font-size: 12px; font-weight: 700; letter-spacing: 0.3px;
        text-shadow: -1px -1px 0 var(--bg-color), 1px -1px 0 var(--bg-color), -1px 1px 0 var(--bg-color), 1px 1px 0 var(--bg-color), 0 2px 4px var(--shadow-color);
        white-space: nowrap; opacity: 0; transition: opacity 0.3s ease;
    }
    .poi-label.show-text .poi-text { opacity: 1; }
    
    #hover-tooltip {
        position: absolute; pointer-events: none; opacity: 0; z-index: 100;
        background: var(--tooltip-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--border-color); box-shadow: 0 10px 30px var(--shadow-color);
        padding: 14px 18px; border-radius: 12px; color: var(--text-muted); font-size: 13px;
        transform: translate(15px, 15px); transition: opacity 0.2s ease; max-width: 320px; line-height: 1.5;
    }
    #hover-tooltip .tt-title { display: block; font-size: 15px; font-weight: 800; color: var(--text-color); margin-bottom: 4px; }
    #hover-tooltip .tt-id { display: block; font-family: monospace; color: var(--text-muted); font-size: 12px; margin-bottom: 6px; }
    #hover-tooltip .tt-area { display: inline-block; margin-top: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 12px; }

    #ui-toggle-btn {
        display: none; position: absolute; top: 15px; right: 15px; width: 44px; height: 44px;
        background: var(--btn-bg); border: 1px solid var(--border-color); border-radius: 12px;
        box-shadow: 0 4px 12px var(--shadow-color); cursor: pointer; z-index: 30; font-size: 20px; color: var(--btn-text);
        align-items: center; justify-content: center; backdrop-filter: blur(10px);
    }
    #close-ui-btn { display: none; position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 26px; color: var(--text-muted); cursor: pointer; line-height: 1; padding: 0; }

    #ui-panel {
        position: absolute; top: 20px; right: 20px; width: 260px; max-height: 85vh; overflow-y: auto; z-index: 20;
        background: var(--panel-bg); backdrop-filter: blur(16px);
        border: 1px solid var(--border-color); border-radius: 16px; padding: 20px;
        color: var(--text-color); box-shadow: 0 10px 40px var(--shadow-color); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    h3 { margin: 0 0 15px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); border-bottom: 1px solid var(--border-color); padding-bottom: 10px; }
    
    .layer-control { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; }
    .layer-control input { margin-right: 12px; accent-color: #3b82f6; cursor: pointer; width: 16px; height: 16px; }
    .layer-control label { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-color); }
    .color-box { width: 12px; height: 12px; border-radius: 3px; margin-right: 10px; border: 1px solid var(--border-color); }
    
    .export-btn { width: 100%; margin-top: 15px; padding: 10px; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; transition: box-shadow 0.2s; }
    .export-btn:hover { box-shadow: 0 4px 12px rgba(16,185,129,0.35); }
    
    #home-btn {
        position: absolute; bottom: 20px; right: 20px; z-index: 20; width: 44px; height: 44px;
        background: var(--btn-bg); backdrop-filter: blur(10px); border: 1px solid var(--border-color);
        border-radius: 12px; color: var(--btn-text); font-size: 20px; cursor: pointer; box-shadow: 0 4px 12px var(--shadow-color); transition: all 0.2s; display: flex; align-items: center; justify-content: center;
    }
    #home-btn:hover { transform: scale(1.05); filter: brightness(1.1); }
    
    .info-text { position: absolute; bottom: 20px; left: 20px; color: var(--text-muted); font-size: 12px; pointer-events: none; z-index: 10; font-weight: 500; text-shadow: 0 1px 2px var(--bg-color); }

    @media (max-width: 768px) {
        #ui-toggle-btn { display: flex; }
        #close-ui-btn { display: block; }
        #ui-panel { top: 0; right: 0; width: 280px; height: 100vh; max-height: 100vh; border-radius: 0; transform: translateX(120%); border: none; box-shadow: -5px 0 20px rgba(0,0,0,0.1); }
        #ui-panel.open { transform: translateX(0); }
        #home-btn { bottom: 20px; right: 20px; }
        .info-text { display: none; }
    }
</style>
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"></script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
</head>
<body data-theme="${savedTheme}">
<div id="labels-layer"></div>
<div id="hover-tooltip"></div>

<button id="ui-toggle-btn" title="Слои">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
</button>

<button id="home-btn" title="Сбросить вид">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
</button>
<div class="info-text">ЛКМ: Перемещение | ПКМ: Вращение | <b>Двойной клик</b>: Полет к объекту</div>

<div id="ui-panel">
  <button id="close-ui-btn" title="Закрыть">&times;</button>
  <h3>Слои сцены</h3>
  <div id="layers-container"></div>
  <div style="margin-top:15px;border-top:1px solid var(--border-color);padding-top:15px;">
    <button id="export-html-btn" class="export-btn">Сохранить в HTML</button>
  </div>
</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Логика UI
const uiPanel = document.getElementById("ui-panel");
document.getElementById("ui-toggle-btn").onclick = () => uiPanel.classList.toggle("open");
document.getElementById("close-ui-btn").onclick = () => uiPanel.classList.remove("open");

// Обработка смены темы
let currentTheme = "${savedTheme}";
window.addEventListener('message', (e) => {
    if(e.data && e.data.type === 'setTheme') {
        currentTheme = e.data.theme;
        document.body.dataset.theme = currentTheme;
        updateSceneTheme();
    }
});

let scene, gridHelper, dirLight, ambientLight, ground;

try {
    const data = ${safeDataString};
    const animateables = [];["target","parcels","intersections","buildings","structures","zouits"].forEach(function(key) {
        if (data[key]) data[key].forEach(function(item, idx) { item.uid = key + "_" + idx; });
    });

    const getShortCad = function(id) { if (!id) return ""; var parts = id.split(":"); return ":" + parts[parts.length - 1]; };
    const getNetShort = function(m) { if (m.isGas) return "Газ"; if (m.isWater) return "Вода"; if (m.isHeat) return "Тепло"; if (m.isElectric) return "ЛЭП"; if (m.isSewer) return "Канал."; return "Сеть"; };
    const getZouitShort = function(m) { if (m.isGas) return "ОЗ Газ"; if (m.isWater) return "ОЗ Вода"; if (m.isHeat) return "ОЗ Тепло"; if (m.isElectric) return "ОЗ ЛЭП"; if (m.isSewer) return "ОЗ Кан."; return "ЗОУИТ"; };

    // Функция цвета ЗОУИТ, синхронизированная с основной картой
    const getZouitColorHex = function(text) {
        if (!text) return 0x9400D3; // Темно-фиолетовый
        text = text.toLowerCase();
        if (text.includes('электро') || text.includes('электр') || text.includes('лэп') || text.includes('лп ') || text.includes('вл ') || text.includes('вкл ') || text.includes('воздушн')) return 0xFF0000;
        if (text.includes('газ')) return 0xFFBF00;
        if (text.includes('тепло')) return 0xef4444; 
        if (text.includes('водо') || text.includes('вод')) return 0x3b82f6;
        if (text.includes('канализ') || text.includes('сток')) return 0x6b7280;
        return 0x9400D3;
    };

    const INFRA_COLORS = { gas: 0xf59e0b, water: 0x3b82f6, heat: 0xef4444, electric: 0xff0000, sewer: 0x6b7280, def: 0x8b5cf6 };
    const getInfraColor = function(m) { if (m.isGas) return INFRA_COLORS.gas; if (m.isWater) return INFRA_COLORS.water; if (m.isHeat) return INFRA_COLORS.heat; if (m.isElectric) return INFRA_COLORS.electric; if (m.isSewer) return INFRA_COLORS.sewer; return INFRA_COLORS.def; };
    const getInfraHex = function(m) { return "#" + new THREE.Color(getInfraColor(m)).getHexString(); };
    const getInfraName = function(m) { if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name; if (m.isGas) return "Газопровод"; if (m.isWater) return "Водопровод"; if (m.isHeat) return "Теплотрасса"; if (m.isElectric) return "ЛЭП"; if (m.isSewer) return "Канализация"; return "Сооружение"; };
    const getZouitName = function(m) { if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name; if (m.isGas) return "Охр. зона газа"; if (m.isWater) return "Охр. зона водопровода"; if (m.isHeat) return "Охр. зона теплосети"; if (m.isElectric) return "Охр. зона ЛЭП"; if (m.isSewer) return "Охр. зона канализации"; return "ЗОУИТ"; };

    const PARCEL_PALETTE =[0x4ade80, 0x34d399, 0xa3e635, 0x2dd4bf, 0x86efac, 0x6ee7b7, 0xbef264, 0x5eead4, 0x67e8f9, 0x38bdf8, 0xa78bfa, 0xfbbf24, 0xf0abfc, 0xfb7185, 0x22d3ee];
    const darken = function(hex, f) { f = f || 0.7; var c = new THREE.Color(hex); c.r*=f; c.g*=f; c.b*=f; return c; };

    // -- ИНИЦИАЛИЗАЦИЯ SCENE & RENDERER --
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.5, 3000);
    camera.position.set(50, 80, 120);
    
    // Управление а-ля Google Earth
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05; controls.maxPolarAngle = Math.PI/2 - 0.02;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
    };
    controls.screenSpacePanning = false; // Важно для перемещения вдоль земли
    controls.target.set(0, 0, 0);

    const initialCamPos = new THREE.Vector3(50, 80, 120);
    const initialTarget = new THREE.Vector3(0, 0, 0);
    document.getElementById("home-btn").onclick = function() { camera.position.copy(initialCamPos); controls.target.copy(initialTarget); controls.update(); };

    // Освещение
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(150, 250, 100); dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -250; dirLight.shadow.camera.right = 250;
    dirLight.shadow.camera.top = 250; dirLight.shadow.camera.bottom = -250;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Земля (Светлая по умолчанию)
    function createGroundTexture(){
        var cv=document.createElement("canvas");cv.width=512;cv.height=512;var ctx=cv.getContext("2d");
        ctx.fillStyle="#ffffff";ctx.fillRect(0,0,512,512); 
        ctx.fillStyle="#f8f9fa";ctx.fillRect(0,0,256,256);ctx.fillRect(256,256,256,256);
        var t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.RepeatWrapping;t.repeat.set(100,100);return t;
    }
    const groundMat = new THREE.MeshStandardMaterial({map:createGroundTexture(), roughness:1.0, color: 0xf0f2f5});
    ground = new THREE.Mesh(new THREE.PlaneGeometry(3000,3000), groundMat);
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
    
    gridHelper = new THREE.GridHelper(3000, 150, 0x000000, 0x000000);
    gridHelper.position.y = 0.01; scene.add(gridHelper);

    window.updateSceneTheme = function() {
        if(currentTheme === 'dark') {
            scene.background = new THREE.Color(0x0f172a);
            scene.fog = new THREE.FogExp2(0x0f172a, 0.0015);
            ambientLight.intensity = 0.4;
            dirLight.intensity = 1.5;
            gridHelper.material.color.setHex(0x334155); 
            ground.material.color.setHex(0x1e293b); 
        } else {
            scene.background = new THREE.Color(0xe0f2fe);
            scene.fog = new THREE.FogExp2(0xe0f2fe, 0.0015);
            ambientLight.intensity = 0.7;
            dirLight.intensity = 2.0;
            // Не сбрасываем цвет пола в белую тему жестко, если пользователь выбрал свой цвет.
            // Но если это первый запуск, то будет светлый
        }
    }
    updateSceneTheme();

    function createCompass(){
        var cg=new THREE.Group();
        cg.add(new THREE.Mesh(new THREE.CylinderGeometry(8,8,0.5,32),new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.4, metalness:0.3})).translateY(0.25));
        var aN=new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0xef4444}));
        aN.position.y=0.6;aN.rotation.y=Math.PI;cg.add(aN);
        var aS=new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0x94a3b8}));
        aS.position.y=0.6;cg.add(aS);
        var addL=function(text,rotY,color){
            var cv=document.createElement("canvas");cv.width=128;cv.height=128;
            var ctx=cv.getContext("2d");ctx.font="bold 80px sans-serif";ctx.fillStyle=color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,64,64);
            var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv)}));
            sp.scale.set(6,6,1);sp.position.set(Math.sin(rotY)*11,2.5,Math.cos(rotY)*11);cg.add(sp);
        };
        addL("С",Math.PI,"#ef4444");addL("Ю",0,"#1e293b");addL("В",Math.PI/2,"#1e293b");addL("З",-Math.PI/2,"#1e293b");
        cg.position.set(-60,0.5,60);return cg;
    }
    scene.add(createCompass());

    const plantGeos = { stem: new THREE.CylinderGeometry(0.04, 0.06, 1.0, 4), leaf: new THREE.PlaneGeometry(0.5, 0.25), petal: new THREE.PlaneGeometry(0.35, 0.2), center: new THREE.SphereGeometry(0.18, 6, 6), grass: new THREE.PlaneGeometry(0.08, 0.6) };
    const plantMats = { stem: new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.9 }), leaf: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9, side: THREE.DoubleSide }), center: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.5 }), grass: new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 1, side: THREE.DoubleSide }), petals:[0xf43f5e,0xfbbf24,0xa78bfa,0xfb7185,0xf97316,0x34d399].map(function(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }); }) };
    const createFlower = function(x, z, scale, baseY) {
        scale = scale || 1; baseY = baseY || 0.2; var g = new THREE.Group();
        var stem = new THREE.Mesh(plantGeos.stem, plantMats.stem); stem.position.y = 0.5*scale; stem.scale.set(scale,scale,scale); stem.castShadow = true; g.add(stem);[-1,1].forEach(function(side) { var leaf = new THREE.Mesh(plantGeos.leaf, plantMats.leaf); leaf.position.set(side*0.2*scale, 0.4*scale, 0); leaf.rotation.z = side*0.6; leaf.rotation.y = Math.random()*Math.PI; leaf.scale.set(scale,scale,scale); leaf.castShadow = true; g.add(leaf); });
        var pm = plantMats.petals[Math.floor(Math.random()*plantMats.petals.length)];
        for (var i=0;i<5;i++) { var a=(i/5)*Math.PI*2; var p=new THREE.Mesh(plantGeos.petal, pm); p.position.set(Math.cos(a)*0.28*scale, 1.02*scale, Math.sin(a)*0.28*scale); p.rotation.x=-Math.PI/2; p.rotation.z=a; p.scale.set(scale,scale,scale); p.castShadow=true; g.add(p); }
        var ctr = new THREE.Mesh(plantGeos.center, plantMats.center); ctr.position.y = 1.03*scale; ctr.scale.set(scale,scale,scale); g.add(ctr);
        g.position.set(x, baseY, z); g.rotation.y = Math.random()*Math.PI*2; return g;
    };
    const createGrassTuft = function(x, z, baseY) {
        baseY = baseY || 0.2; var g = new THREE.Group();
        for (var i=0;i<4;i++) { var b=new THREE.Mesh(plantGeos.grass, plantMats.grass); var hs=0.9+Math.random()*0.8; b.scale.set(1.2,hs,1.2); b.position.set((Math.random()-0.5)*0.3, 0.3*hs, (Math.random()-0.5)*0.3); b.rotation.y=Math.random()*Math.PI; b.rotation.z=(Math.random()-0.5)*0.5; b.castShadow=true; g.add(b); }
        g.position.set(x, baseY, z); return g;
    };
    const seedParcelWithFlowers = function(polyRing, groupTarget, baseY) {
        baseY = baseY || 0.2; if (!polyRing||polyRing.length<3) return;
        var mnX=Infinity,mxX=-Infinity,mnZ=Infinity,mxZ=-Infinity;
        polyRing.forEach(function(p){mnX=Math.min(mnX,p.x);mxX=Math.max(mxX,p.x);mnZ=Math.min(mnZ,-p.y);mxZ=Math.max(mxZ,-p.y);});
        var area=(mxX-mnX)*(mxZ-mnZ); var target=Math.min(25,Math.floor(area/25));
        var pip=function(x,z,poly){var ins=false;for(var i=0,j=poly.length-1;i<poly.length;j=i++){var xi=poly[i].x,zi=-poly[i].y,xj=poly[j].x,zj=-poly[j].y;if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi))ins=!ins;}return ins;};
        var placed=0,att=0;
        while(placed<target&&att<target*3){
            att++;var x=mnX+Math.random()*(mxX-mnX),z=mnZ+Math.random()*(mxZ-mnZ);
            if(pip(x,z,polyRing)){groupTarget.add(Math.random()>0.65?createFlower(x,z,0.4+Math.random()*0.4,baseY):createGrassTuft(x,z,baseY));placed++;}
        }
    };

    const BUILDING_DICT = {
        education:{keys:["школ","детск","сад","учебн","институт"],wall:0xfce4c8,base:0x8b6f47,roof:0x5c4033,win:0x93c5fd,winType:"ribbon",parapet:true},
        medical:{keys:["больниц","поликлиник","мед","здрав","госпитал"],wall:0xf0f4f8,base:0x8294a8,roof:0x94a3b8,win:0x7dd3fc,winType:"standard",parapet:true,addon:"cross"},
        mkd:{keys:["многоквартирный","мкд","общежити","квартир"],wall:0xe2e8f0,base:0x64748b,roof:0x475569,win:0x7db8f0,winType:"dense",parapet:true},
        priv:{keys:["жилой дом","индивидуальн","частн","дачн"],wall:0xf0dcc8,base:0x7a6352,roof:0x8b4513,win:0x93c5fd,winType:"standard",parapet:false,hippedRoof:true},
        commercial:{keys:["магазин","торгов","офис","бизнес","тц"],wall:0xe0e7ff,base:0x4f46e5,roof:0x312e81,win:0x60a5fa,winType:"large",parapet:true},
        industrial:{keys:["склад","цех","завод","промышлен","гараж"],wall:0x94a3b8,base:0x475569,roof:0x334155,win:null,winType:"none",parapet:false},
        def:{wall:0xf8fafc,base:0x94a3b8,roof:0x64748b,win:0x93c5fd,winType:"standard",parapet:true}
    };
    function getBuildingStyle(rawText) {
        var keys = Object.keys(BUILDING_DICT);
        for (var i=0;i<keys.length;i++) { var cfg = BUILDING_DICT[keys[i]]; if (cfg.keys && cfg.keys.some(function(k){return rawText.includes(k);})) return cfg; }
        return BUILDING_DICT.def;
    }

    var windowMaterialCache = {};
    function getWindowMaterial(style) {
        if (style.winType==="none"||!style.win) return new THREE.MeshStandardMaterial({color:style.wall,roughness:0.9});
        var ck=style.wall+"_"+style.winType;
        if (windowMaterialCache[ck]) return windowMaterialCache[ck];
        var cv=document.createElement("canvas");cv.width=256;cv.height=256;var ctx=cv.getContext("2d");
        ctx.fillStyle="#"+new THREE.Color(style.wall).getHexString();ctx.fillRect(0,0,256,256);
        var wW=120,wH=160;
        if(style.winType==="dense"){wW=160;wH=180;}else if(style.winType==="ribbon"){wW=220;wH=100;}else if(style.winType==="large"){wW=180;wH=200;}
        var sX=(256-wW)/2,sY=(256-wH)/2;
        ctx.fillStyle="#"+new THREE.Color(style.win).getHexString();ctx.fillRect(sX,sY,wW,wH);
        ctx.strokeStyle="#1e293b";ctx.lineWidth=8;ctx.strokeRect(sX,sY,wW,wH);
        var tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
        tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;
        var tsX=style.winType==="dense"?3:(style.winType==="ribbon"?5:4);
        tex.repeat.set(1/tsX,1/3.5);
        var mat=new THREE.MeshStandardMaterial({map:tex, roughness:0.2, metalness:0.6, envMapIntensity:1.5});
        windowMaterialCache[ck]=mat;return mat;
    }

    const createBuildingModel=function(shape,height,style,isMini){
        isMini = isMini || false;
        var b=new THREE.Group();var pts=shape.getPoints();if(pts.length<3)return b;
        var baseGeo=new THREE.ExtrudeGeometry(shape,{depth:0.5,bevelEnabled:false});
        var base=new THREE.Mesh(baseGeo,new THREE.MeshStandardMaterial({color:style.base}));
        base.rotation.x=-Math.PI/2;base.position.y=0;b.add(base);
        var roofMat=new THREE.MeshStandardMaterial({color:style.roof});
        var wallMat=isMini?new THREE.MeshStandardMaterial({color:style.wall}):getWindowMaterial(style);
        var wallGeo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});
        var walls=new THREE.Mesh(wallGeo,[roofMat,wallMat]);
        walls.rotation.x=-Math.PI/2;walls.position.y=0.5;
        if(!isMini){walls.castShadow=true;walls.receiveShadow=true;}
        b.add(walls);
        if(style.hippedRoof){
            var mx=Infinity,Mx=-Infinity,my=Infinity,My=-Infinity;
            pts.forEach(function(p){mx=Math.min(mx,p.x);Mx=Math.max(Mx,p.x);my=Math.min(my,p.y);My=Math.max(My,p.y);});
            var w=Mx-mx,d=My-my,ccx=(mx+Mx)/2,ccy=(my+My)/2;
            var rH=Math.max(3,height*0.5),rD=Math.sqrt(w*w+d*d)*0.72;
            var rGeo=new THREE.ConeGeometry(rD,rH,4);rGeo.rotateY(Math.PI/4);
            var roof=new THREE.Mesh(rGeo,new THREE.MeshStandardMaterial({color:style.roof}));
            roof.position.set(ccx,0.5+height+rH/2,-ccy);roof.scale.set(w/rD,1,d/rD);
            if(!isMini)roof.castShadow=true;b.add(roof);
        }else{
            if(style.parapet){
                var par=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.8,bevelEnabled:true,bevelSize:0.2,bevelThickness:0.2}),new THREE.MeshStandardMaterial({color:style.roof}));
                par.rotation.x=-Math.PI/2;par.position.y=0.5+height;b.add(par);
            }
            var fr=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.1,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0x334155}));
            fr.rotation.x=-Math.PI/2;fr.position.y=0.5+height+(style.parapet?0.8:0);b.add(fr);
        }
        if(style.addon==="cross"){
            var cc=getCentroid(pts);var cGrp=new THREE.Group();var mat=new THREE.MeshBasicMaterial({color:0xef4444});
            cGrp.add(new THREE.Mesh(new THREE.BoxGeometry(1,4,1),mat));cGrp.add(new THREE.Mesh(new THREE.BoxGeometry(4,1,1),mat));
            cGrp.position.set(cc.x,0.5+height+4,cc.z);b.add(cGrp);
        }
        b.userData.wallMesh = walls;
        return b;
    };

    const createStake=function(position){
        var g=new THREE.Group();
        var stick=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.15,5),new THREE.MeshStandardMaterial({color:0x8b5a2b,roughness:0.9}));
        stick.position.y=2.5;stick.castShadow=true;g.add(stick);
        var cap=new THREE.Mesh(new THREE.SphereGeometry(0.3,8,8),new THREE.MeshStandardMaterial({color:0xef4444,roughness:0.3,metalness:0.2}));
        cap.position.y=5.1;g.add(cap);
        g.position.set(position.x,0,position.z);
        g.userData.wallMesh = stick;
        return g;
    };

    // -- ФУНКЦИЯ ПОЛЕТА К ОБЪЕКТУ --
    let flyAnimation = null;
    function flyToMesh(targetMesh) {
        if (!targetMesh) return;
        targetMesh.geometry.computeBoundingBox();
        let center = new THREE.Vector3(); 
        targetMesh.geometry.boundingBox.getCenter(center);
        targetMesh.localToWorld(center);
        
        let startTarget = controls.target.clone();
        let startCam = camera.position.clone();
        let dir = new THREE.Vector3().subVectors(startCam, center).normalize();
        if (dir.lengthSq() === 0) dir.set(0, 0.5, 1).normalize();
        let endCam = center.clone().add(dir.multiplyScalar(80)); 
        endCam.y = Math.max(endCam.y, 25);
        
        let startTime = performance.now();
        flyAnimation = function() {
            let t = Math.min((performance.now() - startTime) / 1000, 1);
            let ease = 1 - Math.pow(1 - t, 3); // EaseOutCubic
            controls.target.lerpVectors(startTarget, center, ease);
            camera.position.lerpVectors(startCam, endCam, ease);
            if (t < 1) requestAnimationFrame(flyAnimation); else flyAnimation = null;
        };
        flyAnimation();
    }

    // -- СИСТЕМА МЕТОК (HTML Overlay) --
    const labelsLayer = document.getElementById("labels-layer");
    const tooltip = document.getElementById("hover-tooltip");
    const labelsData =[];

    const buildTooltipHTML = function(category, mData) {
        let extra = "";
        if (mData.floors) extra += "<div><b>Этажность:</b> " + mData.floors + "</div>";
        if (mData.year) extra += "<div><b>Год постройки:</b> " + mData.year + "</div>";
        if (mData.material) extra += "<div><b>Материал:</b> " + mData.material + "</div>";
        
        return "<span class=\\"tt-title\\">" + category + "</span>" +
               (mData.id ? "<span class=\\"tt-id\\">" + mData.id + "</span>" : "") +
               (mData.name && mData.name !== "Объект" ? "<div>" + mData.name + "</div>" : "") +
               extra +
               (mData.area ? "<div class=\\"tt-area\\">" + mData.area + "</div>" : "");
    };

    const addLabel = function(pos3D, priority, categoryName, shortId, meta, colorHex, meshRef = null) {
        const el = document.createElement("div");
        el.className = "poi-label";
        el.innerHTML = "<div class=\\"poi-dot\\" style=\\"background-color: "+colorHex+"\\"></div><div class=\\"poi-text\\">"+categoryName+" "+shortId+"</div>";
        
        el.addEventListener("mouseenter", (e) => {
            tooltip.innerHTML = buildTooltipHTML(categoryName, meta);
            tooltip.style.opacity = "1";
            tooltip.style.left = (e.clientX + 15) + "px";
            tooltip.style.top = (e.clientY + 15) + "px";
            el.style.zIndex = "9999"; 
        });
        el.addEventListener("mousemove", (e) => {
            tooltip.style.left = (e.clientX + 15) + "px";
            tooltip.style.top = (e.clientY + 15) + "px";
        });
        el.addEventListener("mouseleave", () => {
            tooltip.style.opacity = "0";
            el.style.zIndex = "";
        });
        el.addEventListener("click", () => {
            if (meshRef) flyToMesh(meshRef);
        });

        labelsLayer.appendChild(el);
        labelsData.push({ el: el, pos: pos3D, priority: priority, visible: true, groupData: meta });
    };

    // -- ГРУППЫ И ОТРИСОВКА --
    const sceneGroups={target:new THREE.Group(),parcels:new THREE.Group(),intersections:new THREE.Group(),buildings:new THREE.Group(),structures:new THREE.Group(),zouit:new THREE.Group()};
    Object.values(sceneGroups).forEach(function(g){scene.add(g);});

    const interactables =[];
    const attachMeta = function(mesh, meta, category) {
        if (!mesh) return; 
        mesh.userData = { meta: meta, category: category };
        if (Array.isArray(mesh.material)) {
            mesh.userData.origEmissive = mesh.material.map(function(m) { return m.emissive ? m.emissive.getHex() : 0x000000; });
        } else if (mesh.material) {
            mesh.userData.origEmissive = mesh.material.emissive ? mesh.material.emissive.getHex() : 0x000000;
        } else {
            mesh.userData.origEmissive = 0x000000;
        }
        interactables.push(mesh);
    };

    const createShape=function(polyRings){
        var shape=new THREE.Shape();
        if(!polyRings||!polyRings[0]||polyRings[0].length<3)return shape;
        shape.moveTo(polyRings[0][0].x,polyRings[0][0].y);
        for(var i=1;i<polyRings[0].length;i++)shape.lineTo(polyRings[0][i].x,polyRings[0][i].y);
        for(var i=1;i<polyRings.length;i++){
            if(!polyRings[i]||polyRings[i].length<3)continue;
            var hole=new THREE.Path();hole.moveTo(polyRings[i][0].x,polyRings[i][0].y);
            for(var j=1;j<polyRings[i].length;j++)hole.lineTo(polyRings[i][j].x,polyRings[i][j].y);
            shape.holes.push(hole);
        }
        return shape;
    };
    const getCentroid=function(pts){if(!pts||!pts.length)return{x:0,y:0,z:0};var cx=0,cy=0;pts.forEach(function(p){cx+=p.x;cy+=p.y;});return new THREE.Vector3(cx/pts.length,0,-cy/pts.length);};

    // СБОР SPATIAL ID для ДЕДУПЛИКАЦИИ
    const spatialIds = new Set();["target", "parcels", "buildings", "structures", "zouits"].forEach(key => {
        if (data[key]) {
            data[key].forEach(item => {
                if(item.meta && item.meta.isSpatial && item.meta.id) spatialIds.add(item.meta.id);
            });
        }
    });

    data.target.forEach(function(t){
        var color=(t.meta&&t.meta.isParcel)?0x10b981:0xef4444;
        t.polygons.forEach(function(poly){
            if(!poly||!poly[0])return;
            if(t.type==="Line"){
                var vp=poly[0].map(function(p){return new THREE.Vector3(p.x,1.5,-p.y);});
                if(vp.length>1){
                    var tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp,false,"chordal"),64,0.6,8,false),new THREE.MeshStandardMaterial({color:color}));
                    tube.castShadow=true; sceneGroups.target.add(tube);
                    attachMeta(tube, t.meta, "Целевой объект (Линия)");
                }
            }else{
                var shape=createShape(poly);
                if(shape.getPoints().length>2){
                    var depth=0.8;
                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:depth,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:color,opacity:0.6,transparent:true}));
                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x991b1b,linewidth:2})));
                    mesh.castShadow=true; sceneGroups.target.add(mesh);
                    seedParcelWithFlowers(poly[0], sceneGroups.target, depth);
                    attachMeta(mesh, t.meta, "Целевой объект");
                    var c = getCentroid(poly[0]); c.y = depth + 2;
                    addLabel(c, 10, "Цель", "", t.meta, "#ef4444", mesh);
                }
            }
        });
    });

    data.parcels.forEach(function(p,index){
        var yOff=index*0.015;var depth=0.2;
        var pHex=PARCEL_PALETTE[index%PARCEL_PALETTE.length];
        var pColor=new THREE.Color(pHex);
        var eColor=darken(pHex);
        p.polygons.forEach(function(poly){
            var shape=createShape(poly);
            if(shape.getPoints().length>2){
                var mat=new THREE.MeshStandardMaterial({color:pColor,roughness:0.85,metalness:0.05,transparent:true,opacity:0.4});
                var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:depth,bevelEnabled:false}),mat);
                mesh.rotation.x=-Math.PI/2;mesh.position.y=yOff;
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:eColor})));
                mesh.receiveShadow=true; sceneGroups.parcels.add(mesh);
                seedParcelWithFlowers(poly[0], sceneGroups.parcels, yOff + depth);
                attachMeta(mesh, p.meta, "Земельный участок");
                var c = getCentroid(poly[0]); c.y = yOff + depth + 1;
                addLabel(c, 5, "ЗУ", getShortCad(p.meta.id), p.meta, "#" + pColor.getHexString(), mesh);
            }
        });
    });

    data.intersections.forEach(function(iObj){
        iObj.polygons.forEach(function(poly){
            var shape=createShape(poly);
            if(shape.getPoints().length>2){
                var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.5,bevelEnabled:false}),new THREE.MeshBasicMaterial({color:0xdc2626,transparent:true,opacity:0.6,depthWrite:false}));
                mesh.rotation.x=-Math.PI/2;mesh.position.y=1.0;
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x991b1b,linewidth:3})));
                sceneGroups.intersections.add(mesh);
            }
        });
    });

    var linkedCount=0;
    data.buildings.forEach(function(b){
        var style=getBuildingStyle(b.meta.rawText);
        if(b.meta.isSpatial){
            b.polygons.forEach(function(poly){
                var shape=createShape(poly);
                if(shape.getPoints().length>2){
                    var bModel = createBuildingModel(shape,b.meta.height,style);
                    sceneGroups.buildings.add(bModel);
                    attachMeta(bModel.userData.wallMesh, b.meta, "ОКС (Здание)");
                    var c = getCentroid(poly[0]); c.y = b.meta.height + 4;
                    addLabel(c, 8, "ОКС", getShortCad(b.meta.id), b.meta, "#3b82f6", bModel.userData.wallMesh);
                }
            });
        } else {
            // ДЕДУПЛИКАЦИЯ
            if (spatialIds.has(b.meta.id)) return;

            var radius=25+(linkedCount%2)*8;
            var angle=(linkedCount*Math.PI*2)/6;
            var posX=Math.cos(angle)*radius,posZ=Math.sin(angle)*radius;
            if(b.meta.hasExtendedData){
                var ds=new THREE.Shape();ds.moveTo(-5,-5);ds.lineTo(5,-5);ds.lineTo(5,5);ds.lineTo(-5,5);
                var mm=createBuildingModel(ds,b.meta.height,style,true);
                mm.scale.set(0.4,0.4,0.4);
                var laser=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,15),new THREE.MeshBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.3}));
                laser.position.y=-7.5; mm.add(laser);
                mm.position.set(posX,15,posZ); mm.userData={baseY:15,offset:linkedCount};
                animateables.push(mm); sceneGroups.buildings.add(mm);
                attachMeta(mm.userData.wallMesh, b.meta, "ОКС (Привязка)");
                addLabel(new THREE.Vector3(posX, 15+(b.meta.height*0.4)+2, posZ), 7, "ОКС", getShortCad(b.meta.id), b.meta, "#3b82f6", mm.userData.wallMesh);
            } else {
                var st = createStake({x:posX,z:posZ});
                sceneGroups.buildings.add(st);
                attachMeta(st.userData.wallMesh, b.meta, "ОКС (Без координат)");
                addLabel(new THREE.Vector3(posX, 7, posZ), 4, "ОКС (Без коорд.)", getShortCad(b.meta.id), b.meta, "#3b82f6", st.userData.wallMesh);
            }
            linkedCount++;
        }
    });

    data.structures.forEach(function(s){
        var infraColor=getInfraColor(s.meta);
        var infraHex=getInfraHex(s.meta);
        var infraName=getInfraName(s.meta);
        s.polygons.forEach(function(poly){
            if(!poly||!poly[0]||poly[0].length<2)return;
            var midPt=null; var drawH=5; var targetMesh=null;
            if(s.type==="Line"){
                if((s.meta.isGas||s.meta.isHeat)&&!s.meta.isUnderground){
                    drawH=3;
                    var pts=poly[0].map(function(pt){return new THREE.Vector3(pt.x,drawH,-pt.y);});
                    var pipe=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,s.meta.diameter,8,false),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.4,metalness:0.5}));
                    pipe.castShadow=true; sceneGroups.structures.add(pipe); attachMeta(pipe, s.meta, infraName);
                    pts.forEach(function(pt,i){
                        if(i%2===0){
                            var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,drawH),new THREE.MeshStandardMaterial({color:0x94a3b8}));
                            pole.position.set(pt.x,drawH/2,pt.z);pole.castShadow=true; sceneGroups.structures.add(pole);
                        }
                    });
                    midPt=pts[Math.floor(pts.length/2)];
                    targetMesh = pipe;
                } else if(s.meta.isElectric){
                    drawH=10;
                    var pts2=poly[0].map(function(pt){return new THREE.Vector3(pt.x,drawH,-pt.y);});
                    pts2.forEach(function(pt,idx){
                        var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,drawH),new THREE.MeshStandardMaterial({color:0x5c4033}));
                        pole.position.set(pt.x, drawH/2, pt.z);pole.castShadow=true; sceneGroups.structures.add(pole); attachMeta(pole, s.meta, infraName);
                        var cross=new THREE.Mesh(new THREE.BoxGeometry(3,0.2,0.2),new THREE.MeshStandardMaterial({color:0x5c4033}));
                        cross.position.set(pt.x, drawH-0.5, pt.z);
                        if(idx<pts2.length-1)cross.rotation.y=Math.atan2(pts2[idx+1].x-pt.x,pts2[idx+1].z-pt.z);
                        else if(idx>0)cross.rotation.y=Math.atan2(pt.x-pts2[idx-1].x,pt.z-pts2[idx-1].z);
                        sceneGroups.structures.add(cross);
                        if(idx === Math.floor(pts2.length/2)) targetMesh = pole;
                    });
                    var wireMat=new THREE.LineBasicMaterial({color:0x8b5cf6});
                    for(var wi=0;wi<pts2.length-1;wi++){
                        var p1=pts2[wi].clone();p1.y-=0.5;var p2=pts2[wi+1].clone();p2.y-=0.5;
                        var mid=new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5);mid.y-=1.5;
                        sceneGroups.structures.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(p1,mid,p2).getPoints(20)),wireMat));
                    }
                    midPt=pts2[Math.floor(pts2.length/2)];
                } else {
                    var yPos=s.meta.isUnderground?-1:1;
                    drawH=s.meta.isUnderground?3:5;
                    var pts3=poly[0].map(function(pt){return new THREE.Vector3(pt.x,yPos,-pt.y);});
                    if(pts3.length>1){
                        var uPipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3,false,"chordal"),50,s.meta.diameter,12,false),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.5,metalness:0.1}));
                        sceneGroups.structures.add(uPipe); attachMeta(uPipe, s.meta, infraName);
                        midPt=pts3[Math.floor(pts3.length/2)];
                        targetMesh = uPipe;
                    }
                }
            } else {
                var shape=createShape(poly);
                if(shape.getPoints().length>2){
                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.7}));
                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;mesh.castShadow=true; sceneGroups.structures.add(mesh);
                    attachMeta(mesh, s.meta, infraName);
                    var c=getCentroid(poly[0]);
                    midPt={x:c.x,y:5,z:c.z};
                    targetMesh = mesh;
                }
            }
            if(midPt){
                addLabel(midPt, 3, getNetShort(s.meta), getShortCad(s.meta.id), s.meta, infraHex, targetMesh);
            }
        });
    });

    data.zouits.forEach(function(z){
        var textForColor = z.meta.rawText;
        var color = getZouitColorHex(textForColor);
        var labelHex = "#" + new THREE.Color(color).getHexString();
        var labelText = getZouitName(z.meta);
        
        z.polygons.forEach(function(poly){
            if(!poly||!poly[0]||poly[0].length<2)return;
            var midPt=null, h=5;
            
            if(z.type==="Line"){
                h = z.meta.isElectric ? 20 : (z.meta.isGas ? 6 : 8);
                var pts=poly[0].map(function(p){return new THREE.Vector3(p.x,h/2,-p.y);});
                var zone=new THREE.Mesh(
                    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,z.meta.isElectric?6:4,16,false),
                    new THREE.MeshPhysicalMaterial({color:color, transmission: 0.5, transparent:true, opacity:0.6, depthWrite:false, side: THREE.DoubleSide})
                );
                sceneGroups.zouit.add(zone);
                attachMeta(zone, z.meta, getZouitShort(z.meta)); 
                midPt=pts[Math.floor(pts.length/2)];
            } else {
                var shape=createShape(poly);
                if(shape.getPoints().length>2){
                    h = z.meta.isElectric ? 25 : (z.meta.isGas ? 6 : (z.meta.isHeat ? 8 : 10)); 
                    var mesh=new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}),
                        new THREE.MeshPhysicalMaterial({color:color, transmission: 0.5, transparent:true, opacity:0.4, depthWrite:false, side: THREE.DoubleSide})
                    );
                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;sceneGroups.zouit.add(mesh);
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:color, linewidth: 2, transparent:true, opacity:0.9})));
                    attachMeta(mesh, z.meta, getZouitShort(z.meta)); 
                    var c=getCentroid(poly[0]);
                    midPt={x:c.x,y:h+5,z:c.z};
                }
            }
            if(midPt){
                addLabel(midPt, 2, getZouitShort(z.meta), getShortCad(z.meta.id), z.meta, labelHex, sceneGroups.zouit.children[sceneGroups.zouit.children.length-1]);
            }
        });
    });

    // -- ИНТЕРФЕЙС И СЛОИ --
    var uiContainer = document.getElementById("layers-container");
    var addLayerUi = function(name, color, groupRef) {
        var el = document.createElement("div"); el.className = "layer-control";
        el.innerHTML = "<input type=\\"checkbox\\" checked id=\\"cb-"+name+"\\"><div class=\\"color-box\\" style=\\"background:"+color+"\\"></div><label for=\\"cb-"+name+"\\">"+name+"</label>";
        el.querySelector("input").onchange = function(e) {
            groupRef.visible = e.target.checked;
            labelsData.forEach(function(l) {
                if(l.groupData && groupRef.children.length>0) {
                    l.el.style.display = e.target.checked ? "" : "none";
                }
            });
        };
        uiContainer.appendChild(el);
    };
    addLayerUi("Целевой объект", "#ef4444", sceneGroups.target);
    addLayerUi("Участки (ЗУ)", "#10b981", sceneGroups.parcels);
    addLayerUi("Наложения", "#dc2626", sceneGroups.intersections);
    addLayerUi("Здания (ОКС)", "#3b82f6", sceneGroups.buildings);
    addLayerUi("Инфраструктура", "#f59e0b", sceneGroups.structures);
    addLayerUi("ЗОУИТ", "#8b5cf6", sceneGroups.zouit);
    
    // Выбор цвета земли
    var groundControl = document.createElement("div"); 
    groundControl.className = "layer-control";
    groundControl.style.marginTop = "15px";
    groundControl.style.borderTop = "1px solid var(--border-color)";
    groundControl.style.paddingTop = "15px";
    groundControl.innerHTML = '<label style="margin-right:10px;font-size:13px;font-weight:600;">Цвет подложки:</label><input type="color" id="ground-color-picker" value="#f0f2f5" style="border:none;width:24px;height:24px;cursor:pointer;background:none;padding:0;">';
    uiContainer.appendChild(groundControl);

    document.getElementById("ground-color-picker").addEventListener("input", function(e) {
        ground.material.color.setHex(parseInt(e.target.value.replace('#','0x')));
    });

    // -- ИНТЕРАКТИВ (Hover Tooltip & Raycast для 3D) --
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredMesh = null;

    window.addEventListener("mousemove", function(e) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(interactables, false);
        
        if (hits.length > 0) {
            let hit = hits[0].object;
            if (hoveredMesh !== hit) {
                if (hoveredMesh) {
                    if(Array.isArray(hoveredMesh.material)) { hoveredMesh.material.forEach(function(m,i){if(m.emissive)m.emissive.setHex(hoveredMesh.userData.origEmissive[i]);}); }
                    else if(hoveredMesh.material.emissive) { hoveredMesh.material.emissive.setHex(hoveredMesh.userData.origEmissive); }
                }
                hoveredMesh = hit;
                const highlightColor = currentTheme === 'dark' ? 0x64748b : 0xbababa;
                if(Array.isArray(hoveredMesh.material)) { hoveredMesh.material.forEach(function(m){if(m.emissive)m.emissive.setHex(highlightColor);}); }
                else if(hoveredMesh.material.emissive) { hoveredMesh.material.emissive.setHex(highlightColor); }
                
                document.body.style.cursor = "pointer";
                let mData = hoveredMesh.userData.meta;
                tooltip.innerHTML = buildTooltipHTML(hoveredMesh.userData.category, mData);
                tooltip.style.opacity = "1";
            }
            tooltip.style.left = (e.clientX + 15) + "px";
            tooltip.style.top = (e.clientY + 15) + "px";
        } else {
            if (hoveredMesh) {
                if(Array.isArray(hoveredMesh.material)) { hoveredMesh.material.forEach(function(m,i){if(m.emissive)m.emissive.setHex(hoveredMesh.userData.origEmissive[i]);}); }
                else if(hoveredMesh.material.emissive) { hoveredMesh.material.emissive.setHex(hoveredMesh.userData.origEmissive); }
                hoveredMesh = null; document.body.style.cursor = "default"; tooltip.style.opacity = "0";
            }
        }
    });

    window.addEventListener("dblclick", function() {
        if (hoveredMesh) flyToMesh(hoveredMesh);
    });

    var exportBtn=document.getElementById("export-html-btn");
    if(exportBtn){
        exportBtn.onclick=function(){
            var cloneDoc=document.documentElement.cloneNode(true);
            cloneDoc.querySelectorAll("canvas").forEach(function(c){c.remove();});
            var lc=cloneDoc.querySelector("#ui-panel");if(lc)lc.remove();
            var toggBtn = cloneDoc.querySelector("#ui-toggle-btn"); if(toggBtn) toggBtn.remove();
            var finalHtml="<!DOCTYPE html>\\n<html lang=\\"ru\\">\\n"+cloneDoc.innerHTML+"\\n</html>";
            var blob=new Blob([finalHtml],{type:"text/html;charset=utf-8"});
            var url=URL.createObjectURL(blob);
            var a=document.createElement("a");a.href=url;
            a.download="3D_Cadastral_"+new Date().toISOString().slice(0,10)+".html";
            document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
        };
    }

    window.addEventListener("resize", function() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    const tempVec = new THREE.Vector3();
    function updateLabels() {
        let hw = window.innerWidth / 2, hh = window.innerHeight / 2;
        let visibleLabels =[];
        
        for (let i=0; i<labelsData.length; i++) {
            let l = labelsData[i];
            if (!l.el.parentElement || l.el.style.display === "none") continue;
            
            let dist = camera.position.distanceTo(l.pos);
            if (dist > 800 && l.priority < 8) { l.el.style.opacity = "0"; l.el.style.pointerEvents = "none"; continue; }
            
            tempVec.copy(l.pos).project(camera);
            if (tempVec.z > 1) { l.el.style.opacity = "0"; l.el.style.pointerEvents = "none"; continue; }
            
            let x = (tempVec.x * hw) + hw; let y = -(tempVec.y * hh) + hh;
            l.el.style.transform = "translate(-50%, -50%) translate3d(" + x + "px, " + y + "px, 0)";
            // Метки теперь всегда кликабельны, если видимы
            if (!l.el.style.zIndex || l.el.style.zIndex !== "9999") l.el.style.zIndex = Math.round(1000 - dist);
            
            if (dist < 200 || l.priority > 7) l.el.classList.add("show-text"); else l.el.classList.remove("show-text");
            
            l.box2D = { left: x - 15, right: x + (l.el.classList.contains("show-text") ? 100 : 15), top: y - 15, bottom: y + 15 };
            visibleLabels.push(l);
        }
        
        visibleLabels.sort(function(a, b) { return b.priority - a.priority; });
        let activeBoxes =[];
        
        for (let i = 0; i < visibleLabels.length; i++) {
            let current = visibleLabels[i];
            let isOverlapping = false;
            
            for (let j = 0; j < activeBoxes.length; j++) {
                let accepted = activeBoxes[j];
                if (current.box2D.left < accepted.right && current.box2D.right > accepted.left && current.box2D.top < accepted.bottom && current.box2D.bottom > accepted.top) {
                    isOverlapping = true; break;
                }
            }
            
            if (isOverlapping && current.priority < 10) {
                current.el.style.opacity = "0";
                current.el.style.pointerEvents = "none";
            } else {
                current.el.style.opacity = "1";
                current.el.style.pointerEvents = "auto";
                activeBoxes.push(current.box2D);
            }
        }
    }

    function animate(){
        requestAnimationFrame(animate);
        controls.update();
        var time=performance.now()*0.002;
        animateables.forEach(function(obj){
            obj.position.y=obj.userData.baseY+Math.sin(time+obj.userData.offset)*1.5;
        });
        updateLabels();
        renderer.render(scene,camera);
    }
    animate();

} catch(err) {
    document.body.innerHTML += "<div style='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);padding:24px;border-radius:12px;color:#fca5a5;font-size:14px;z-index:1000;max-width:500px;'><b>Ошибка:</b><br>" + err.message + "<br><small>" + (err.stack||"") + "</small></div>";
}
<\/script>
</body>
</html>`;

            iframe.srcdoc = srcDocContent;
            modal.appendChild(iframe);
            document.body.appendChild(modal);

            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    window.isGlobalMapMode = false;
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