window.open3DVisualization = function () {
    setTimeout(() => {
        try {
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels: [], buildings:[], structures: [], zouits: [], intersections:[] };

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
                let rawName = o.name || o.params_name || o.building_name || o.name_by_doc || '';
                let name = window.isGlobalMapMode ? cleanAddress(rawName) : rawName;
                const text = (descr + ' ' + name + ' ' + purpose).toLowerCase();
                let meta = {
                    id: o.cad_num || o.cad_number || o.reg_numb_border || descr || '',
                    name: name || purpose || (window.isGlobalMapMode ? cleanAddress(descr) : descr) || 'Объект',
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
                } else if (category === 'structure' || category === 'zouit') {
                    meta.isSewer = text.includes('канализ') || text.includes('канал') || text.includes('сток');
                    meta.isGas = text.includes('газ');
                    meta.isHeat = text.includes('тепло');
                    meta.isWater = (text.includes('водо') || text.includes('вод')) && !meta.isSewer;
                    meta.isElectric = text.includes('электро') || text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('воздушн');
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

            if (window.turf && window.parcelFeaturesData && window.parcelFeaturesData.length > 1) {
                const localPolysForTurf =[];
                window.parcelFeaturesData.forEach((f) => {
                    if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
                        let ringsList = f.geometry.type === 'Polygon' ?[f.geometry.coordinates] : f.geometry.coordinates;
                        ringsList.forEach(poly => {
                            let localRings = poly.map(ring => ring.map(c => {
                                const pt = to3857(c); return [pt[0] - originX, pt[1] - originY];
                            }));
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
                                let iRingsList = intersection.geometry.type === 'Polygon' ? [intersection.geometry.coordinates] : intersection.geometry.coordinates;
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

            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '2.5%', left: '2.5%', width: '95%', height: '95%',
                backgroundColor: '#0f172a', borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 25px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '12px 20px', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)',
                color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '15px', fontFamily: 'system-ui, -apple-system, sans-serif',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            });
            header.innerHTML = '<span style="display:flex;align-items:center;"><i class="fas fa-cube" style="color:#60a5fa;font-size:18px;margin-right:10px;"></i> Цифровой Двойник 3D</span>';

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex'; btnContainer.style.gap = '8px';

            const createWinBtn = (iconClass, hoverColor) => {
                const btn = document.createElement('button');
                btn.innerHTML = '<i class="' + iconClass + '"></i>';
                Object.assign(btn.style, {
                    background: 'rgba(255,255,255,0.05)', border: 'none', color: '#cbd5e1', fontSize: '14px',
                    cursor: 'pointer', width: '30px', height: '30px', borderRadius: '6px', transition: 'all 0.2s'
                });
                btn.onmouseenter = () => { btn.style.background = hoverColor; btn.style.color = '#fff'; };
                btn.onmouseleave = () => { btn.style.background = 'rgba(255,255,255,0.05)'; btn.style.color = '#cbd5e1'; };
                return btn;
            };

            const minBtn = createWinBtn('fas fa-compress-alt', 'rgba(255,255,255,0.15)');
            const closeBtn = createWinBtn('fas fa-times', '#ef4444');

            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#0f172a' });

            let isMinimized = false;
            minBtn.onclick = () => {
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
            };
            closeBtn.onclick = () => { window.isGlobalMapMode = false; modal.remove(); };

            btnContainer.appendChild(minBtn); btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer); modal.appendChild(header);

            const srcDocContent = '<!DOCTYPE html>\n' +
'<html lang="ru">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<style>\n' +
'body { margin: 0; overflow: hidden; background: #0f172a; font-family: "Segoe UI", system-ui, sans-serif; user-select: none; }\n' +
'canvas { display: block; outline: none; }\n' +
'#labels-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; z-index: 10; }\n' +
'.poi-label { position: absolute; display: flex; align-items: center; gap: 6px; transform: translate(-50%, -50%); will-change: transform, opacity; transition: opacity 0.3s ease; }\n' +
'.poi-dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.8), inset 0 0 4px rgba(255,255,255,0.6); border: 2px solid rgba(255,255,255,0.95); flex-shrink: 0; }\n' +
'.poi-text { color: #f8fafc; font-size: 12px; font-weight: 600; letter-spacing: 0.3px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 3px 6px rgba(0,0,0,0.8); white-space: nowrap; opacity: 0; transition: opacity 0.3s ease; }\n' +
'.poi-label.show-text .poi-text { opacity: 1; }\n' +
'#hover-tooltip { position: absolute; pointer-events: none; opacity: 0; z-index: 100; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 30px rgba(0,0,0,0.5); padding: 14px 18px; border-radius: 12px; color: #f8fafc; font-size: 13px; transform: translate(15px, 15px); transition: opacity 0.2s ease; max-width: 320px; line-height: 1.5; }\n' +
'#hover-tooltip .tt-title { display: block; font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; }\n' +
'#hover-tooltip .tt-id { display: block; font-family: monospace; color: #94a3b8; font-size: 12px; margin-bottom: 6px; }\n' +
'#hover-tooltip .tt-area { display: inline-block; margin-top: 6px; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px; }\n' +
'#ui-panel { position: absolute; top: 20px; right: 20px; width: 260px; max-height: 85vh; overflow-y: auto; z-index: 20; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px; color: #e2e8f0; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }\n' +
'h3 { margin: 0 0 15px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }\n' +
'.layer-control { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; }\n' +
'.layer-control input { margin-right: 12px; accent-color: #3b82f6; cursor: pointer; width: 16px; height: 16px; }\n' +
'.layer-control label { cursor: pointer; font-size: 13px; font-weight: 500; }\n' +
'.color-box { width: 12px; height: 12px; border-radius: 3px; margin-right: 10px; }\n' +
'.export-btn { width: 100%; margin-top: 15px; padding: 10px; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; }\n' +
'.export-btn:hover { box-shadow: 0 4px 12px rgba(16,185,129,0.35); }\n' +
'#home-btn { position: absolute; bottom: 20px; right: 20px; z-index: 20; width: 44px; height: 44px; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: #f8fafc; font-size: 20px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.2s; display: flex; align-items: center; justify-content: center; }\n' +
'#home-btn:hover { background: #3b82f6; transform: scale(1.05); }\n' +
'.info-text { position: absolute; bottom: 20px; left: 20px; color: #94a3b8; font-size: 12px; pointer-events: none; z-index: 10; text-shadow: 0 1px 2px #000; }\n' +
'</style>\n' +
'<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>\n' +
'<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}<\/script>\n' +
'</head>\n' +
'<body>\n' +
'<div id="labels-layer"></div>\n' +
'<div id="hover-tooltip"></div>\n' +
'<button id="home-btn" title="Сбросить вид">&#8962;</button>\n' +
'<div class="info-text">ЛКМ: Вращение | ПКМ: Перемещение | <b>Двойной клик</b>: Полет к объекту</div>\n' +
'<div id="ui-panel">\n' +
'  <h3>Слои сцены</h3>\n' +
'  <div id="layers-container"></div>\n' +
'  <div style="margin-top:15px;border-top:1px solid rgba(255,255,255,0.1);padding-top:15px;">\n' +
'    <button id="export-html-btn" class="export-btn">Сохранить в HTML</button>\n' +
'  </div>\n' +
'</div>\n' +
'<script type="module">\n' +
'import * as THREE from "three";\n' +
'import { OrbitControls } from "three/addons/controls/OrbitControls.js";\n' +
'\n' +
'try {\n' +
'    const data = ' + safeDataString + ';\n' +
'    const animateables =[];\n' +
'\n' +
'    ["target","parcels","intersections","buildings","structures","zouits"].forEach(function(key) {\n' +
'        if (data[key]) data[key].forEach(function(item, idx) { item.uid = key + "_" + idx; });\n' +
'    });\n' +
'\n' +
'    const getShortCad = function(id) { if (!id) return ""; var parts = id.split(":"); return ":" + parts[parts.length - 1]; };\n' +
'    const getNetShort = function(m) { if (m.isGas) return "Газ"; if (m.isWater) return "Вода"; if (m.isHeat) return "Тепло"; if (m.isElectric) return "ЛЭП"; if (m.isSewer) return "Канал."; return "Сеть"; };\n' +
'    const getZouitShort = function(m) { if (m.isGas) return "ОЗ Газ"; if (m.isWater) return "ОЗ Вода"; if (m.isHeat) return "ОЗ Тепло"; if (m.isElectric) return "ОЗ ЛЭП"; if (m.isSewer) return "ОЗ Кан."; return "ЗОУИТ"; };\n' +
'\n' +
'    const INFRA_COLORS = { gas: 0xf59e0b, water: 0x3b82f6, heat: 0xef4444, electric: 0x8b5cf6, sewer: 0x6b7280, def: 0x94a3b8 };\n' +
'    const getInfraColor = function(m) { if (m.isGas) return INFRA_COLORS.gas; if (m.isWater) return INFRA_COLORS.water; if (m.isHeat) return INFRA_COLORS.heat; if (m.isElectric) return INFRA_COLORS.electric; if (m.isSewer) return INFRA_COLORS.sewer; return INFRA_COLORS.def; };\n' +
'    const getInfraHex = function(m) { return "#" + new THREE.Color(getInfraColor(m)).getHexString(); };\n' +
'    const getInfraName = function(m) { if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name; if (m.isGas) return "Газопровод"; if (m.isWater) return "Водопровод"; if (m.isHeat) return "Теплотрасса"; if (m.isElectric) return "ЛЭП"; if (m.isSewer) return "Канализация"; return "Сооружение"; };\n' +
'    const getZouitName = function(m) { if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name; if (m.isGas) return "Охр. зона газа"; if (m.isWater) return "Охр. зона водопровода"; if (m.isHeat) return "Охр. зона теплосети"; if (m.isElectric) return "Охр. зона ЛЭП"; if (m.isSewer) return "Охр. зона канализации"; return "ЗОУИТ"; };\n' +
'\n' +
'    const PARCEL_PALETTE =[0x4ade80, 0x34d399, 0xa3e635, 0x2dd4bf, 0x86efac, 0x6ee7b7, 0xbef264, 0x5eead4, 0x67e8f9, 0x38bdf8, 0xa78bfa, 0xfbbf24, 0xf0abfc, 0xfb7185, 0x22d3ee];\n' +
'    const darken = function(hex, f) { f = f || 0.55; var c = new THREE.Color(hex); c.r*=f; c.g*=f; c.b*=f; return c; };\n' +
'\n' +
'    // -- ИНИЦИАЛИЗАЦИЯ SCENE & RENDERER --\n' +
'    const canvas = document.createElement("canvas");\n' +
'    document.body.appendChild(canvas);\n' +
'    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });\n' +
'    renderer.setSize(window.innerWidth, window.innerHeight);\n' +
'    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));\n' +
'    renderer.toneMapping = THREE.ACESFilmicToneMapping;\n' +
'    renderer.toneMappingExposure = 1.0;\n' +
'    renderer.shadowMap.enabled = true;\n' +
'    renderer.shadowMap.type = THREE.PCFSoftShadowMap;\n' +
'\n' +
'    const scene = new THREE.Scene();\n' +
'    scene.background = new THREE.Color(0x0f172a);\n' +
'    scene.fog = new THREE.FogExp2(0x0f172a, 0.0015);\n' +
'\n' +
'    const pmremGenerator = new THREE.PMREMGenerator(renderer);\n' +
'    pmremGenerator.compileEquirectangularShader();\n' +
'    const envCanvas = document.createElement("canvas"); envCanvas.width = 512; envCanvas.height = 256;\n' +
'    const envCtx = envCanvas.getContext("2d");\n' +
'    const grd = envCtx.createLinearGradient(0,0,0,256);\n' +
'    grd.addColorStop(0, "#1e3a8a"); grd.addColorStop(0.5, "#bae6fd"); grd.addColorStop(0.51, "#475569"); grd.addColorStop(1, "#1e293b");\n' +
'    envCtx.fillStyle = grd; envCtx.fillRect(0,0,512,256);\n' +
'    const envTex = new THREE.CanvasTexture(envCanvas);\n' +
'    envTex.colorSpace = THREE.SRGBColorSpace;\n' +
'    scene.environment = pmremGenerator.fromEquirectangular(envTex).texture;\n' +
'\n' +
'    const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.5, 3000);\n' +
'    camera.position.set(50, 80, 120);\n' +
'    const controls = new OrbitControls(camera, renderer.domElement);\n' +
'    controls.enableDamping = true; controls.dampingFactor = 0.05; controls.maxPolarAngle = Math.PI/2 - 0.05;\n' +
'    controls.target.set(0, 0, 0);\n' +
'\n' +
'    const initialCamPos = new THREE.Vector3(50, 80, 120);\n' +
'    const initialTarget = new THREE.Vector3(0, 0, 0);\n' +
'    document.getElementById("home-btn").onclick = function() { camera.position.copy(initialCamPos); controls.target.copy(initialTarget); controls.update(); };\n' +
'\n' +
'    scene.add(new THREE.AmbientLight(0xffffff, 0.6));\n' +
'    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.5);\n' +
'    dirLight.position.set(150, 200, 100); dirLight.castShadow = true;\n' +
'    dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;\n' +
'    dirLight.shadow.camera.left = -200; dirLight.shadow.camera.right = 200;\n' +
'    dirLight.shadow.camera.top = 200; dirLight.shadow.camera.bottom = -200;\n' +
'    dirLight.shadow.bias = -0.0005;\n' +
'    scene.add(dirLight);\n' +
'\n' +
'    function createGroundTexture(){\n' +
'        var cv=document.createElement("canvas");cv.width=512;cv.height=512;var ctx=cv.getContext("2d");\n' +
'        ctx.fillStyle="#1e293b";ctx.fillRect(0,0,512,512);\n' +
'        ctx.fillStyle="#1c2536";ctx.fillRect(0,0,256,256);ctx.fillRect(256,256,256,256);\n' +
'        for(var i=0;i<200;i++){ctx.fillStyle="rgba(0,0,0,"+(Math.random()*0.1)+")";ctx.fillRect(Math.random()*512,Math.random()*512,Math.random()*6+2,Math.random()*6+2);}\n' +
'        var t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.RepeatWrapping;t.repeat.set(100,100);return t;\n' +
'    }\n' +
'    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000,2000), new THREE.MeshStandardMaterial({map:createGroundTexture(), roughness:1.0}));\n' +
'    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);\n' +
'    const gridHelper = new THREE.GridHelper(2000, 100, 0x334155, 0x1e293b);\n' +
'    gridHelper.position.y = 0.01; scene.add(gridHelper);\n' +
'\n' +
'    function createCompass(){\n' +
'        var cg=new THREE.Group();\n' +
'        cg.add(new THREE.Mesh(new THREE.CylinderGeometry(8,8,0.5,32),new THREE.MeshStandardMaterial({color:0x0f172a, roughness:0.4, metalness:0.8})).translateY(0.25));\n' +
'        var aN=new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0xef4444}));\n' +
'        aN.position.y=0.6;aN.rotation.y=Math.PI;cg.add(aN);\n' +
'        var aS=new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0x94a3b8}));\n' +
'        aS.position.y=0.6;cg.add(aS);\n' +
'        var addL=function(text,rotY,color){\n' +
'            var cv=document.createElement("canvas");cv.width=128;cv.height=128;\n' +
'            var ctx=cv.getContext("2d");ctx.font="bold 80px sans-serif";ctx.fillStyle=color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,64,64);\n' +
'            var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv)}));\n' +
'            sp.scale.set(6,6,1);sp.position.set(Math.sin(rotY)*11,2.5,Math.cos(rotY)*11);cg.add(sp);\n' +
'        };\n' +
'        addL("С",Math.PI,"#ef4444");addL("Ю",0,"#f8fafc");addL("В",Math.PI/2,"#f8fafc");addL("З",-Math.PI/2,"#f8fafc");\n' +
'        cg.position.set(-60,0.5,60);return cg;\n' +
'    }\n' +
'    scene.add(createCompass());\n' +
'\n' +
'    // -- ПРОЦЕДУРНЫЕ ЦВЕТЫ И ТРАВА --\n' +
'    const plantGeos = {\n' +
'        stem: new THREE.CylinderGeometry(0.04, 0.06, 1.0, 4),\n' +
'        leaf: new THREE.PlaneGeometry(0.5, 0.25),\n' +
'        petal: new THREE.PlaneGeometry(0.35, 0.2),\n' +
'        center: new THREE.SphereGeometry(0.18, 6, 6),\n' +
'        grass: new THREE.PlaneGeometry(0.08, 0.6)\n' +
'    };\n' +
'    const plantMats = {\n' +
'        stem: new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.9 }),\n' +
'        leaf: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9, side: THREE.DoubleSide }),\n' +
'        center: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.5 }),\n' +
'        grass: new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 1, side: THREE.DoubleSide }),\n' +
'        petals:[0xf43f5e,0xfbbf24,0xa78bfa,0xfb7185,0xf97316,0x34d399].map(function(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }); })\n' +
'    };\n' +
'    const createFlower = function(x, z, scale, baseY) {\n' +
'        scale = scale || 1; baseY = baseY || 0.2;\n' +
'        var g = new THREE.Group();\n' +
'        var stem = new THREE.Mesh(plantGeos.stem, plantMats.stem);\n' +
'        stem.position.y = 0.5*scale; stem.scale.set(scale,scale,scale); stem.castShadow = true; g.add(stem);\n' +
'        [-1,1].forEach(function(side) {\n' +
'            var leaf = new THREE.Mesh(plantGeos.leaf, plantMats.leaf);\n' +
'            leaf.position.set(side*0.2*scale, 0.4*scale, 0); leaf.rotation.z = side*0.6; leaf.rotation.y = Math.random()*Math.PI;\n' +
'            leaf.scale.set(scale,scale,scale); leaf.castShadow = true; g.add(leaf);\n' +
'        });\n' +
'        var pm = plantMats.petals[Math.floor(Math.random()*plantMats.petals.length)];\n' +
'        for (var i=0;i<5;i++) {\n' +
'            var a=(i/5)*Math.PI*2;\n' +
'            var p=new THREE.Mesh(plantGeos.petal, pm);\n' +
'            p.position.set(Math.cos(a)*0.28*scale, 1.02*scale, Math.sin(a)*0.28*scale);\n' +
'            p.rotation.x=-Math.PI/2; p.rotation.z=a; p.scale.set(scale,scale,scale); p.castShadow=true; g.add(p);\n' +
'        }\n' +
'        var ctr = new THREE.Mesh(plantGeos.center, plantMats.center);\n' +
'        ctr.position.y = 1.03*scale; ctr.scale.set(scale,scale,scale); g.add(ctr);\n' +
'        g.position.set(x, baseY, z); g.rotation.y = Math.random()*Math.PI*2;\n' +
'        return g;\n' +
'    };\n' +
'    const createGrassTuft = function(x, z, baseY) {\n' +
'        baseY = baseY || 0.2;\n' +
'        var g = new THREE.Group();\n' +
'        for (var i=0;i<4;i++) {\n' +
'            var b=new THREE.Mesh(plantGeos.grass, plantMats.grass);\n' +
'            var hs=0.9+Math.random()*0.8;\n' +
'            b.scale.set(1.2,hs,1.2);\n' +
'            b.position.set((Math.random()-0.5)*0.3, 0.3*hs, (Math.random()-0.5)*0.3);\n' +
'            b.rotation.y=Math.random()*Math.PI; b.rotation.z=(Math.random()-0.5)*0.5; b.castShadow=true; g.add(b);\n' +
'        }\n' +
'        g.position.set(x, baseY, z); return g;\n' +
'    };\n' +
'    const seedParcelWithFlowers = function(polyRing, groupTarget, baseY) {\n' +
'        baseY = baseY || 0.2;\n' +
'        if (!polyRing||polyRing.length<3) return;\n' +
'        var mnX=Infinity,mxX=-Infinity,mnZ=Infinity,mxZ=-Infinity;\n' +
'        polyRing.forEach(function(p){mnX=Math.min(mnX,p.x);mxX=Math.max(mxX,p.x);mnZ=Math.min(mnZ,-p.y);mxZ=Math.max(mxZ,-p.y);});\n' +
'        var area=(mxX-mnX)*(mxZ-mnZ);\n' +
'        var target=Math.min(25,Math.floor(area/25));\n' +
'        var pip=function(x,z,poly){var ins=false;for(var i=0,j=poly.length-1;i<poly.length;j=i++){var xi=poly[i].x,zi=-poly[i].y,xj=poly[j].x,zj=-poly[j].y;if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi))ins=!ins;}return ins;};\n' +
'        var placed=0,att=0;\n' +
'        while(placed<target&&att<target*3){\n' +
'            att++;var x=mnX+Math.random()*(mxX-mnX),z=mnZ+Math.random()*(mxZ-mnZ);\n' +
'            if(pip(x,z,polyRing)){groupTarget.add(Math.random()>0.65?createFlower(x,z,0.4+Math.random()*0.4,baseY):createGrassTuft(x,z,baseY));placed++;}\n' +
'        }\n' +
'    };\n' +
'\n' +
'    // -- ГЕНЕРАЦИЯ ЗДАНИЙ (Со сложными окнами) --\n' +
'    const BUILDING_DICT = {\n' +
'        education:{keys:["школ","детск","сад","учебн","институт","образоват","ясли"],wall:0xfce4c8,base:0x8b6f47,roof:0x5c4033,win:0x93c5fd,winType:"ribbon",parapet:true},\n' +
'        medical:{keys:["больниц","поликлиник","мед","здрав","госпитал","фап","амбулатор"],wall:0xf0f4f8,base:0x8294a8,roof:0x94a3b8,win:0x7dd3fc,winType:"standard",parapet:true,addon:"cross"},\n' +
'        mkd:{keys:["многоквартирный","мкд","общежити","квартир"],wall:0xd6cfc7,base:0x6b5e54,roof:0x4a4240,win:0x7db8f0,winType:"dense",parapet:true},\n' +
'        priv:{keys:["жилой дом","индивидуальн","частн","дачн","садов"],wall:0xf0dcc8,base:0x7a6352,roof:0x8b4513,win:0x93c5fd,winType:"standard",parapet:false,hippedRoof:true},\n' +
'        commercial:{keys:["магазин","торгов","офис","бизнес","тц","трц","коммерч"],wall:0xd4e4e0,base:0x4a635d,roof:0x2f4f4f,win:0x60a5fa,winType:"large",parapet:true},\n' +
'        industrial:{keys:["склад","цех","завод","производств","промышлен","гараж","ангар"],wall:0xb0b8c0,base:0x505860,roof:0x3a4048,win:null,winType:"none",parapet:false},\n' +
'        def:{wall:0xe8e0d8,base:0x7a7068,roof:0x4a4440,win:0x93c5fd,winType:"standard",parapet:true}\n' +
'    };\n' +
'    function getBuildingStyle(rawText) {\n' +
'        var keys = Object.keys(BUILDING_DICT);\n' +
'        for (var i=0;i<keys.length;i++) {\n' +
'            var cfg = BUILDING_DICT[keys[i]];\n' +
'            if (cfg.keys && cfg.keys.some(function(k){return rawText.includes(k);})) return cfg;\n' +
'        }\n' +
'        return BUILDING_DICT.def;\n' +
'    }\n' +
'\n' +
'    var windowMaterialCache = {};\n' +
'    function getWindowMaterial(style) {\n' +
'        if (style.winType==="none"||!style.win) return new THREE.MeshStandardMaterial({color:style.wall,roughness:0.9});\n' +
'        var ck=style.wall+"_"+style.winType;\n' +
'        if (windowMaterialCache[ck]) return windowMaterialCache[ck];\n' +
'        var cv=document.createElement("canvas");cv.width=256;cv.height=256;var ctx=cv.getContext("2d");\n' +
'        ctx.fillStyle="#"+new THREE.Color(style.wall).getHexString();ctx.fillRect(0,0,256,256);\n' +
'        var wW=120,wH=160;\n' +
'        if(style.winType==="dense"){wW=160;wH=180;}else if(style.winType==="ribbon"){wW=220;wH=100;}else if(style.winType==="large"){wW=180;wH=200;}\n' +
'        var sX=(256-wW)/2,sY=(256-wH)/2;\n' +
'        ctx.fillStyle="#"+new THREE.Color(style.win).getHexString();ctx.fillRect(sX,sY,wW,wH);\n' +
'        ctx.strokeStyle="#1e293b";ctx.lineWidth=8;ctx.strokeRect(sX,sY,wW,wH);\n' +
'        var tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;\n' +
'        tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;\n' +
'        var tsX=style.winType==="dense"?3:(style.winType==="ribbon"?5:4);\n' +
'        tex.repeat.set(1/tsX,1/3.5);\n' +
'        // PBR Material для реалистичных окон (отражают небо)\n' +
'        var mat=new THREE.MeshStandardMaterial({map:tex, roughness:0.2, metalness:0.8, envMapIntensity:1.5});\n' +
'        windowMaterialCache[ck]=mat;return mat;\n' +
'    }\n' +
'\n' +
'    const createBuildingModel=function(shape,height,style,isMini){\n' +
'        isMini = isMini || false;\n' +
'        var b=new THREE.Group();var pts=shape.getPoints();if(pts.length<3)return b;\n' +
'        var baseGeo=new THREE.ExtrudeGeometry(shape,{depth:0.5,bevelEnabled:false});\n' +
'        var base=new THREE.Mesh(baseGeo,new THREE.MeshStandardMaterial({color:style.base}));\n' +
'        base.rotation.x=-Math.PI/2;base.position.y=0;b.add(base);\n' +
'        var roofMat=new THREE.MeshStandardMaterial({color:style.roof});\n' +
'        var wallMat=isMini?new THREE.MeshStandardMaterial({color:style.wall}):getWindowMaterial(style);\n' +
'        var wallGeo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});\n' +
'        var walls=new THREE.Mesh(wallGeo,[roofMat,wallMat]);\n' +
'        walls.rotation.x=-Math.PI/2;walls.position.y=0.5;\n' +
'        if(!isMini){walls.castShadow=true;walls.receiveShadow=true;}\n' +
'        b.add(walls);\n' +
'        if(style.hippedRoof){\n' +
'            var mx=Infinity,Mx=-Infinity,my=Infinity,My=-Infinity;\n' +
'            pts.forEach(function(p){mx=Math.min(mx,p.x);Mx=Math.max(Mx,p.x);my=Math.min(my,p.y);My=Math.max(My,p.y);});\n' +
'            var w=Mx-mx,d=My-my,ccx=(mx+Mx)/2,ccy=(my+My)/2;\n' +
'            var rH=Math.max(3,height*0.5),rD=Math.sqrt(w*w+d*d)*0.72;\n' +
'            var rGeo=new THREE.ConeGeometry(rD,rH,4);rGeo.rotateY(Math.PI/4);\n' +
'            var roof=new THREE.Mesh(rGeo,new THREE.MeshStandardMaterial({color:style.roof}));\n' +
'            roof.position.set(ccx,0.5+height+rH/2,-ccy);roof.scale.set(w/rD,1,d/rD);\n' +
'            if(!isMini)roof.castShadow=true;b.add(roof);\n' +
'        }else{\n' +
'            if(style.parapet){\n' +
'                var par=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.8,bevelEnabled:true,bevelSize:0.2,bevelThickness:0.2}),new THREE.MeshStandardMaterial({color:style.roof}));\n' +
'                par.rotation.x=-Math.PI/2;par.position.y=0.5+height;b.add(par);\n' +
'            }\n' +
'            var fr=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.1,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0x1e293b}));\n' +
'            fr.rotation.x=-Math.PI/2;fr.position.y=0.5+height+(style.parapet?0.8:0);b.add(fr);\n' +
'        }\n' +
'        if(style.addon==="cross"){\n' +
'            var cc=getCentroid(pts);var cGrp=new THREE.Group();var mat=new THREE.MeshBasicMaterial({color:0xef4444});\n' +
'            cGrp.add(new THREE.Mesh(new THREE.BoxGeometry(1,4,1),mat));cGrp.add(new THREE.Mesh(new THREE.BoxGeometry(4,1,1),mat));\n' +
'            cGrp.position.set(cc.x,0.5+height+4,cc.z);b.add(cGrp);\n' +
'        }\n' +
'        // Возвращаем walls для интерактивности (чтобы при наведении светились только стены)\n' +
'        b.userData.wallMesh = walls;\n' +
'        return b;\n' +
'    };\n' +
'\n' +
'    const createStake=function(position){\n' +
'        var g=new THREE.Group();\n' +
'        var stick=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.15,5),new THREE.MeshStandardMaterial({color:0x8b5a2b,roughness:0.9}));\n' +
'        stick.position.y=2.5;stick.castShadow=true;g.add(stick);\n' +
'        var cap=new THREE.Mesh(new THREE.SphereGeometry(0.3,8,8),new THREE.MeshStandardMaterial({color:0xef4444,roughness:0.3,metalness:0.2}));\n' +
'        cap.position.y=5.1;g.add(cap);\n' +
'        g.position.set(position.x,0,position.z);\n' +
'        g.userData.wallMesh = stick; // Для подсветки при наведении\n' +
'        return g;\n' +
'    };\n' +
'\n' +
'    // -- СИСТЕМА МЕТОК (HTML Overlay) --\n' +
'    const labelsLayer = document.getElementById("labels-layer");\n' +
'    const labelsData =[];\n' +
'    const addLabel = function(pos3D, priority, categoryName, shortId, fullObj, colorHex) {\n' +
'        const el = document.createElement("div");\n' +
'        el.className = "poi-label";\n' +
'        el.innerHTML = "<div class=\\"poi-dot\\" style=\\"background-color: "+colorHex+"\\"></div><div class=\\"poi-text\\">"+categoryName+" "+shortId+"</div>";\n' +
'        labelsLayer.appendChild(el);\n' +
'        labelsData.push({ el: el, pos: pos3D, priority: priority, visible: true, groupData: fullObj });\n' +
'    };\n' +
'\n' +
'    // -- ГРУППЫ И ОТРИСОВКА --\n' +
'    const sceneGroups={target:new THREE.Group(),parcels:new THREE.Group(),intersections:new THREE.Group(),buildings:new THREE.Group(),structures:new THREE.Group(),zouit:new THREE.Group()};\n' +
'    Object.values(sceneGroups).forEach(function(g){scene.add(g);});\n' +
'\n' +
'    const interactables =[];\n' +
'    const attachMeta = function(mesh, meta, category) {\n' +
'        mesh.userData = { meta: meta, category: category };\n' +
'        if (Array.isArray(mesh.material)) {\n' +
'            mesh.userData.origEmissive = mesh.material.map(function(m) { return m.emissive ? m.emissive.getHex() : 0x000000; });\n' +
'        } else {\n' +
'            mesh.userData.origEmissive = mesh.material.emissive ? mesh.material.emissive.getHex() : 0x000000;\n' +
'        }\n' +
'        interactables.push(mesh);\n' +
'    };\n' +
'\n' +
'    const createShape=function(polyRings){\n' +
'        var shape=new THREE.Shape();\n' +
'        if(!polyRings||!polyRings[0]||polyRings[0].length<3)return shape;\n' +
'        shape.moveTo(polyRings[0][0].x,polyRings[0][0].y);\n' +
'        for(var i=1;i<polyRings[0].length;i++)shape.lineTo(polyRings[0][i].x,polyRings[0][i].y);\n' +
'        for(var i=1;i<polyRings.length;i++){\n' +
'            if(!polyRings[i]||polyRings[i].length<3)continue;\n' +
'            var hole=new THREE.Path();hole.moveTo(polyRings[i][0].x,polyRings[i][0].y);\n' +
'            for(var j=1;j<polyRings[i].length;j++)hole.lineTo(polyRings[i][j].x,polyRings[i][j].y);\n' +
'            shape.holes.push(hole);\n' +
'        }\n' +
'        return shape;\n' +
'    };\n' +
'    const getCentroid=function(pts){if(!pts||!pts.length)return{x:0,y:0,z:0};var cx=0,cy=0;pts.forEach(function(p){cx+=p.x;cy+=p.y;});return new THREE.Vector3(cx/pts.length,0,-cy/pts.length);};\n' +
'\n' +
'    data.target.forEach(function(t){\n' +
'        var color=(t.meta&&t.meta.isParcel)?0x4ade80:0xef4444;\n' +
'        t.polygons.forEach(function(poly){\n' +
'            if(!poly||!poly[0])return;\n' +
'            if(t.type==="Line"){\n' +
'                var vp=poly[0].map(function(p){return new THREE.Vector3(p.x,1.5,-p.y);});\n' +
'                if(vp.length>1){\n' +
'                    var tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp,false,"chordal"),64,0.6,8,false),new THREE.MeshStandardMaterial({color:color}));\n' +
'                    tube.castShadow=true; sceneGroups.target.add(tube);\n' +
'                    attachMeta(tube, t.meta, "Целевой объект (Линия)");\n' +
'                }\n' +
'            }else{\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    var depth=0.8;\n' +
'                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:depth,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:color,opacity:0.8,transparent:true}));\n' +
'                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;\n' +
'                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x7f1d1d,linewidth:2})));\n' +
'                    mesh.castShadow=true; sceneGroups.target.add(mesh);\n' +
'                    seedParcelWithFlowers(poly[0], sceneGroups.target, depth);\n' +
'                    attachMeta(mesh, t.meta, "Целевой объект");\n' +
'                    var c = getCentroid(poly[0]); c.y = depth + 2;\n' +
'                    addLabel(c, 10, "Цель", "", t.meta, "#ef4444");\n' +
'                }\n' +
'            }\n' +
'        });\n' +
'    });\n' +
'\n' +
'    data.parcels.forEach(function(p,index){\n' +
'        var yOff=index*0.015;var depth=0.2;\n' +
'        var pHex=PARCEL_PALETTE[index%PARCEL_PALETTE.length];\n' +
'        var pColor=new THREE.Color(pHex);\n' +
'        var eColor=darken(pHex);\n' +
'        p.polygons.forEach(function(poly){\n' +
'            var shape=createShape(poly);\n' +
'            if(shape.getPoints().length>2){\n' +
'                var mat=new THREE.MeshStandardMaterial({color:pColor,roughness:0.85,metalness:0.05,transparent:true,opacity:0.6});\n' +
'                var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:depth,bevelEnabled:false}),mat);\n' +
'                mesh.rotation.x=-Math.PI/2;mesh.position.y=yOff;\n' +
'                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:eColor})));\n' +
'                mesh.receiveShadow=true; sceneGroups.parcels.add(mesh);\n' +
'                seedParcelWithFlowers(poly[0], sceneGroups.parcels, yOff + depth);\n' +
'                attachMeta(mesh, p.meta, "Земельный участок");\n' +
'                var c = getCentroid(poly[0]); c.y = yOff + depth + 1;\n' +
'                addLabel(c, 5, "ЗУ", getShortCad(p.meta.id), p.meta, "#" + pColor.getHexString());\n' +
'            }\n' +
'        });\n' +
'    });\n' +
'\n' +
'    data.intersections.forEach(function(iObj){\n' +
'        iObj.polygons.forEach(function(poly){\n' +
'            var shape=createShape(poly);\n' +
'            if(shape.getPoints().length>2){\n' +
'                var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.5,bevelEnabled:false}),new THREE.MeshBasicMaterial({color:0xdc2626,transparent:true,opacity:0.7,depthWrite:false}));\n' +
'                mesh.rotation.x=-Math.PI/2;mesh.position.y=1.0;\n' +
'                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x991b1b,linewidth:3})));\n' +
'                sceneGroups.intersections.add(mesh);\n' +
'            }\n' +
'        });\n' +
'    });\n' +
'\n' +
'    var linkedCount=0;\n' +
'    data.buildings.forEach(function(b){\n' +
'        var style=getBuildingStyle(b.meta.rawText);\n' +
'        if(b.meta.isSpatial){\n' +
'            b.polygons.forEach(function(poly){\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    var bModel = createBuildingModel(shape,b.meta.height,style);\n' +
'                    sceneGroups.buildings.add(bModel);\n' +
'                    attachMeta(bModel.userData.wallMesh, b.meta, "ОКС (Здание)");\n' +
'                    var c = getCentroid(poly[0]); c.y = b.meta.height + 4;\n' +
'                    addLabel(c, 8, "ОКС", getShortCad(b.meta.id), b.meta, "#3b82f6");\n' +
'                }\n' +
'            });\n' +
'        } else {\n' +
'            var radius=25+(linkedCount%2)*8;\n' +
'            var angle=(linkedCount*Math.PI*2)/6;\n' +
'            var posX=Math.cos(angle)*radius,posZ=Math.sin(angle)*radius;\n' +
'            if(b.meta.hasExtendedData){\n' +
'                var ds=new THREE.Shape();ds.moveTo(-5,-5);ds.lineTo(5,-5);ds.lineTo(5,5);ds.lineTo(-5,5);\n' +
'                var mm=createBuildingModel(ds,b.meta.height,style,true);\n' +
'                mm.scale.set(0.4,0.4,0.4);\n' +
'                var laser=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,15),new THREE.MeshBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.3}));\n' +
'                laser.position.y=-7.5; mm.add(laser);\n' +
'                mm.position.set(posX,15,posZ); mm.userData={baseY:15,offset:linkedCount};\n' +
'                animateables.push(mm); sceneGroups.buildings.add(mm);\n' +
'                attachMeta(mm.userData.wallMesh, b.meta, "ОКС (Привязка)");\n' +
'                addLabel(new THREE.Vector3(posX, 15+(b.meta.height*0.4)+2, posZ), 7, "ОКС", getShortCad(b.meta.id), b.meta, "#3b82f6");\n' +
'            } else {\n' +
'                var st = createStake({x:posX,z:posZ});\n' +
'                sceneGroups.buildings.add(st);\n' +
'                attachMeta(st.userData.wallMesh, b.meta, "ОКС (Без координат)");\n' +
'                addLabel(new THREE.Vector3(posX, 7, posZ), 4, "ОКС (Без коорд.)", getShortCad(b.meta.id), b.meta, "#3b82f6");\n' +
'            }\n' +
'            linkedCount++;\n' +
'        }\n' +
'    });\n' +
'\n' +
'    data.structures.forEach(function(s){\n' +
'        var infraColor=getInfraColor(s.meta);\n' +
'        var infraHex=getInfraHex(s.meta);\n' +
'        var infraName=getInfraName(s.meta);\n' +
'        s.polygons.forEach(function(poly){\n' +
'            if(!poly||!poly[0]||poly[0].length<2)return;\n' +
'            var midPt=null; var drawH=5;\n' +
'            if(s.type==="Line"){\n' +
'                if((s.meta.isGas||s.meta.isHeat)&&!s.meta.isUnderground){\n' +
'                    drawH=3;\n' +
'                    var pts=poly[0].map(function(pt){return new THREE.Vector3(pt.x,drawH,-pt.y);});\n' +
'                    var pipe=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,s.meta.diameter,8,false),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.4,metalness:0.5}));\n' +
'                    pipe.castShadow=true; sceneGroups.structures.add(pipe); attachMeta(pipe, s.meta, infraName);\n' +
'                    pts.forEach(function(pt,i){\n' +
'                        if(i%2===0){\n' +
'                            var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,drawH),new THREE.MeshStandardMaterial({color:0x94a3b8}));\n' +
'                            pole.position.set(pt.x,drawH/2,pt.z);pole.castShadow=true; sceneGroups.structures.add(pole);\n' +
'                        }\n' +
'                    });\n' +
'                    midPt=pts[Math.floor(pts.length/2)];\n' +
'                } else if(s.meta.isElectric){\n' +
'                    drawH=10;\n' +
'                    var pts2=poly[0].map(function(pt){return new THREE.Vector3(pt.x,drawH,-pt.y);});\n' +
'                    pts2.forEach(function(pt,idx){\n' +
'                        var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,drawH),new THREE.MeshStandardMaterial({color:0x5c4033}));\n' +
'                        pole.position.set(pt.x, drawH/2, pt.z);pole.castShadow=true; sceneGroups.structures.add(pole); attachMeta(pole, s.meta, infraName);\n' +
'                        var cross=new THREE.Mesh(new THREE.BoxGeometry(3,0.2,0.2),new THREE.MeshStandardMaterial({color:0x5c4033}));\n' +
'                        cross.position.set(pt.x, drawH-0.5, pt.z);\n' +
'                        if(idx<pts2.length-1)cross.rotation.y=Math.atan2(pts2[idx+1].x-pt.x,pts2[idx+1].z-pt.z);\n' +
'                        else if(idx>0)cross.rotation.y=Math.atan2(pt.x-pts2[idx-1].x,pt.z-pts2[idx-1].z);\n' +
'                        sceneGroups.structures.add(cross);\n' +
'                    });\n' +
'                    var wireMat=new THREE.LineBasicMaterial({color:0x8b5cf6});\n' +
'                    for(var wi=0;wi<pts2.length-1;wi++){\n' +
'                        var p1=pts2[wi].clone();p1.y-=0.5;var p2=pts2[wi+1].clone();p2.y-=0.5;\n' +
'                        var mid=new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5);mid.y-=1.5;\n' +
'                        sceneGroups.structures.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(p1,mid,p2).getPoints(20)),wireMat));\n' +
'                    }\n' +
'                    midPt=pts2[Math.floor(pts2.length/2)];\n' +
'                } else {\n' +
'                    var yPos=s.meta.isUnderground?-1:1;\n' +
'                    drawH=s.meta.isUnderground?3:5;\n' +
'                    var pts3=poly[0].map(function(pt){return new THREE.Vector3(pt.x,yPos,-pt.y);});\n' +
'                    if(pts3.length>1){\n' +
'                        var uPipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3,false,"chordal"),50,s.meta.diameter,12,false),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.5,metalness:0.1}));\n' +
'                        sceneGroups.structures.add(uPipe); attachMeta(uPipe, s.meta, infraName);\n' +
'                        midPt=pts3[Math.floor(pts3.length/2)];\n' +
'                    }\n' +
'                }\n' +
'            } else {\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.7}));\n' +
'                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;mesh.castShadow=true; sceneGroups.structures.add(mesh);\n' +
'                    attachMeta(mesh, s.meta, infraName);\n' +
'                    var c=getCentroid(poly[0]);\n' +
'                    midPt={x:c.x,y:5,z:c.z};\n' +
'                }\n' +
'            }\n' +
'            if(midPt){\n' +
'                addLabel(midPt, 3, getNetShort(s.meta), getShortCad(s.meta.id), s.meta, infraHex);\n' +
'            }\n' +
'        });\n' +
'    });\n' +
'\n' +
'    data.zouits.forEach(function(z){\n' +
'        var color=getInfraColor(z.meta);\n' +
'        var labelHex=getInfraHex(z.meta);\n' +
'        var labelText=getZouitName(z.meta);\n' +
'        z.polygons.forEach(function(poly){\n' +
'            if(!poly||!poly[0]||poly[0].length<2)return;\n' +
'            var midPt=null,h=5;\n' +
'            if(z.type==="Line"){\n' +
'                h=z.meta.isElectric?14:8;\n' +
'                var pts=poly[0].map(function(p){return new THREE.Vector3(p.x,z.meta.isElectric?5:2,-p.y);});\n' +
'                var zone=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,z.meta.isElectric?6:4,16,false),new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:0.2,depthWrite:false}));\n' +
'                sceneGroups.zouit.add(zone);\n' +
'                midPt=pts[Math.floor(pts.length/2)];\n' +
'            } else {\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    h=z.meta.isElectric?15:(z.meta.isGas?4:(z.meta.isHeat?5:6));\n' +
'                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}),new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:0.15,depthWrite:false}));\n' +
'                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;sceneGroups.zouit.add(mesh);\n' +
'                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:color,transparent:true,opacity:0.5})));\n' +
'                    var c=getCentroid(poly[0]);\n' +
'                    midPt={x:c.x,y:h+3,z:c.z};\n' +
'                }\n' +
'            }\n' +
'            if(midPt){\n' +
'                addLabel(midPt, 2, getZouitShort(z.meta), getShortCad(z.meta.id), z.meta, labelHex);\n' +
'            }\n' +
'        });\n' +
'    });\n' +
'\n' +
'    // -- ИНТЕРФЕЙС И СЛОИ --\n' +
'    var uiContainer = document.getElementById("layers-container");\n' +
'    var addLayerUi = function(name, color, groupRef) {\n' +
'        var el = document.createElement("div"); el.className = "layer-control";\n' +
'        el.innerHTML = "<input type=\\"checkbox\\" checked id=\\"cb-"+name+"\\"><div class=\\"color-box\\" style=\\"background:"+color+"\\"></div><label for=\\"cb-"+name+"\\">"+name+"</label>";\n' +
'        el.querySelector("input").onchange = function(e) {\n' +
'            groupRef.visible = e.target.checked;\n' +
'            labelsData.forEach(function(l) {\n' +
'                // Простая фильтрация меток при отключении слоя: мы сверяем, входит ли объект в группу\n' +
'                if(l.groupData && groupRef.children.length>0) {\n' +
'                    l.el.style.display = e.target.checked ? "" : "none";\n' +
'                }\n' +
'            });\n' +
'        };\n' +
'        uiContainer.appendChild(el);\n' +
'    };\n' +
'    addLayerUi("Целевой объект", "#ef4444", sceneGroups.target);\n' +
'    addLayerUi("Участки (ЗУ)", "#10b981", sceneGroups.parcels);\n' +
'    addLayerUi("Наложения", "#dc2626", sceneGroups.intersections);\n' +
'    addLayerUi("Здания (ОКС)", "#3b82f6", sceneGroups.buildings);\n' +
'    addLayerUi("Инфраструктура", "#f59e0b", sceneGroups.structures);\n' +
'    addLayerUi("ЗОУИТ", "#8b5cf6", sceneGroups.zouit);\n' +
'\n' +
'    // -- ИНТЕРАКТИВ (Hover Tooltip & Raycast) --\n' +
'    const raycaster = new THREE.Raycaster();\n' +
'    const mouse = new THREE.Vector2();\n' +
'    const tooltip = document.getElementById("hover-tooltip");\n' +
'    let hoveredMesh = null;\n' +
'\n' +
'    window.addEventListener("mousemove", function(e) {\n' +
'        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;\n' +
'        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;\n' +
'        raycaster.setFromCamera(mouse, camera);\n' +
'        const hits = raycaster.intersectObjects(interactables, false);\n' +
'        \n' +
'        if (hits.length > 0) {\n' +
'            let hit = hits[0].object;\n' +
'            if (hoveredMesh !== hit) {\n' +
'                if (hoveredMesh) {\n' +
'                    if(Array.isArray(hoveredMesh.material)) { hoveredMesh.material.forEach(function(m,i){if(m.emissive)m.emissive.setHex(hoveredMesh.userData.origEmissive[i]);}); }\n' +
'                    else if(hoveredMesh.material.emissive) { hoveredMesh.material.emissive.setHex(hoveredMesh.userData.origEmissive); }\n' +
'                }\n' +
'                hoveredMesh = hit;\n' +
'                if(Array.isArray(hoveredMesh.material)) { hoveredMesh.material.forEach(function(m){if(m.emissive)m.emissive.setHex(0x334155);}); }\n' +
'                else if(hoveredMesh.material.emissive) { hoveredMesh.material.emissive.setHex(0x334155); }\n' +
'                \n' +
'                document.body.style.cursor = "pointer";\n' +
'                let mData = hoveredMesh.userData.meta;\n' +
'                tooltip.innerHTML = "<span class=\\"tt-title\\">" + hoveredMesh.userData.category + "</span>" +\n' +
'                                     (mData.id ? "<span class=\\"tt-id\\">" + mData.id + "</span>" : "") +\n' +
'                                     (mData.name && mData.name !== "Объект" ? "<div>" + mData.name + "</div>" : "") +\n' +
'                                     (mData.area ? "<div class=\\"tt-area\\">" + mData.area + "</div>" : "");\n' +
'                tooltip.style.opacity = "1";\n' +
'            }\n' +
'            tooltip.style.left = e.clientX + "px";\n' +
'            tooltip.style.top = e.clientY + "px";\n' +
'        } else {\n' +
'            if (hoveredMesh) {\n' +
'                if(Array.isArray(hoveredMesh.material)) { hoveredMesh.material.forEach(function(m,i){if(m.emissive)m.emissive.setHex(hoveredMesh.userData.origEmissive[i]);}); }\n' +
'                else if(hoveredMesh.material.emissive) { hoveredMesh.material.emissive.setHex(hoveredMesh.userData.origEmissive); }\n' +
'                hoveredMesh = null; document.body.style.cursor = "default"; tooltip.style.opacity = "0";\n' +
'            }\n' +
'        }\n' +
'    });\n' +
'\n' +
'    // -- КИНЕМАТОГРАФИЧНЫЙ ПОЛЕТ ПРИ ДВОЙНОМ КЛИКЕ --\n' +
'    let flyAnimation = null;\n' +
'    window.addEventListener("dblclick", function() {\n' +
'        if (hoveredMesh) {\n' +
'            hoveredMesh.geometry.computeBoundingBox();\n' +
'            let center = new THREE.Vector3(); hoveredMesh.geometry.boundingBox.getCenter(center);\n' +
'            hoveredMesh.localToWorld(center);\n' +
'            let startTarget = controls.target.clone();\n' +
'            let startCam = camera.position.clone();\n' +
'            let dir = new THREE.Vector3().subVectors(startCam, center).normalize();\n' +
'            let endCam = center.clone().add(dir.multiplyScalar(80)); endCam.y = Math.max(endCam.y, 25);\n' +
'            \n' +
'            let startTime = performance.now();\n' +
'            flyAnimation = function() {\n' +
'                let t = Math.min((performance.now() - startTime) / 1000, 1);\n' +
'                let ease = 1 - Math.pow(1 - t, 3); // EaseOutCubic\n' +
'                controls.target.lerpVectors(startTarget, center, ease);\n' +
'                camera.position.lerpVectors(startCam, endCam, ease);\n' +
'                if (t < 1) requestAnimationFrame(flyAnimation); else flyAnimation = null;\n' +
'            };\n' +
'            flyAnimation();\n' +
'        }\n' +
'    });\n' +
'\n' +
'    // -- ЭКСПОРТ HTML --\n' +
'    var exportBtn=document.getElementById("export-html-btn");\n' +
'    if(exportBtn){\n' +
'        exportBtn.onclick=function(){\n' +
'            var cloneDoc=document.documentElement.cloneNode(true);\n' +
'            cloneDoc.querySelectorAll("canvas").forEach(function(c){c.remove();});\n' +
'            var lc=cloneDoc.querySelector("#ui-panel");if(lc)lc.remove();\n' +
'            var finalHtml="<!DOCTYPE html>\\n<html lang=\\"ru\\">\\n"+cloneDoc.innerHTML+"\\n</html>";\n' +
'            var blob=new Blob([finalHtml],{type:"text/html;charset=utf-8"});\n' +
'            var url=URL.createObjectURL(blob);\n' +
'            var a=document.createElement("a");a.href=url;\n' +
'            a.download="3D_Cadastral_"+new Date().toISOString().slice(0,10)+".html";\n' +
'            document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);\n' +
'        };\n' +
'    }\n' +
'\n' +
'    window.addEventListener("resize", function() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });\n' +
'\n' +
'    // -- АЛГОРИТМ АНТИ-НАЛОЖЕНИЯ МЕТОК (LOD & COLLISION) --\n' +
'    const tempVec = new THREE.Vector3();\n' +
'    function updateLabels() {\n' +
'        let hw = window.innerWidth / 2, hh = window.innerHeight / 2;\n' +
'        let visibleLabels =[];\n' +
'        \n' +
'        for (let i=0; i<labelsData.length; i++) {\n' +
'            let l = labelsData[i];\n' +
'            if (!l.el.parentElement || l.el.style.display === "none") continue;\n' +
'            \n' +
'            let dist = camera.position.distanceTo(l.pos);\n' +
'            // Если объект слишком далеко и он не приоритетный - скрываем (LOD)\n' +
'            if (dist > 800 && l.priority < 8) { l.el.style.opacity = "0"; continue; }\n' +
'            \n' +
'            tempVec.copy(l.pos).project(camera);\n' +
'            if (tempVec.z > 1) { l.el.style.opacity = "0"; continue; } // Позади камеры\n' +
'            \n' +
'            let x = (tempVec.x * hw) + hw; let y = -(tempVec.y * hh) + hh;\n' +
'            l.el.style.transform = "translate(-50%, -50%) translate3d(" + x + "px, " + y + "px, 0)";\n' +
'            l.el.style.zIndex = Math.round(1000 - dist);\n' +
'            \n' +
'            // Показываем текст только вблизи\n' +
'            if (dist < 200 || l.priority > 7) l.el.classList.add("show-text"); else l.el.classList.remove("show-text");\n' +
'            \n' +
'            l.box2D = { left: x - 15, right: x + (l.el.classList.contains("show-text") ? 100 : 15), top: y - 15, bottom: y + 15 };\n' +
'            visibleLabels.push(l);\n' +
'        }\n' +
'        \n' +
'        visibleLabels.sort(function(a, b) { return b.priority - a.priority; });\n' +
'        let activeBoxes =[];\n' +
'        \n' +
'        for (let i = 0; i < visibleLabels.length; i++) {\n' +
'            let current = visibleLabels[i];\n' +
'            let isOverlapping = false;\n' +
'            \n' +
'            for (let j = 0; j < activeBoxes.length; j++) {\n' +
'                let accepted = activeBoxes[j];\n' +
'                if (current.box2D.left < accepted.right && current.box2D.right > accepted.left && current.box2D.top < accepted.bottom && current.box2D.bottom > accepted.top) {\n' +
'                    isOverlapping = true; break;\n' +
'                }\n' +
'            }\n' +
'            \n' +
'            // Метки-цели (10) никогда не скрываются. Остальные при коллизии - исчезают\n' +
'            if (isOverlapping && current.priority < 10) {\n' +
'                current.el.style.opacity = "0";\n' +
'                current.el.style.pointerEvents = "none";\n' +
'            } else {\n' +
'                current.el.style.opacity = "1";\n' +
'                current.el.style.pointerEvents = "auto";\n' +
'                activeBoxes.push(current.box2D);\n' +
'            }\n' +
'        }\n' +
'    }\n' +
'\n' +
'    function animate(){\n' +
'        requestAnimationFrame(animate);\n' +
'        controls.update();\n' +
'        var time=performance.now()*0.002;\n' +
'        animateables.forEach(function(obj){\n' +
'            obj.position.y=obj.userData.baseY+Math.sin(time+obj.userData.offset)*1.5;\n' +
'        });\n' +
'        updateLabels();\n' +
'        renderer.render(scene,camera);\n' +
'    }\n' +
'    animate();\n' +
'\n' +
'} catch(err) {\n' +
'    document.body.innerHTML += "<div style=\'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);padding:24px;border-radius:12px;color:#fca5a5;font-size:14px;z-index:1000;max-width:500px;\'><b>Ошибка:</b><br>" + err.message + "<br><small>" + (err.stack||"") + "</small></div>";\n' +
'}\n' +
'<\/script>\n' +
'</body>\n' +
'</html>';

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