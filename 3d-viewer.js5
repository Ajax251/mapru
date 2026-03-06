window.open3DVisualization = function () {
    setTimeout(() => {
        try {
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels: [], buildings: [], structures: [], zouits: [], intersections: [] };

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
                const localPolysForTurf = [];
                window.parcelFeaturesData.forEach((f) => {
                    if (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
                        let ringsList = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
                        ringsList.forEach(poly => {
                            let localRings = poly.map(ring => ring.map(c => {
                                const pt = to3857(c);
                                return [pt[0] - originX, pt[1] - originY];
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
                backgroundColor: '#ffffff', borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 25px 80px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid rgba(37,99,235,0.2)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '12px 20px', background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '16px', fontFamily: 'system-ui, -apple-system, sans-serif',
            });
            header.innerHTML = '<span style="display:flex;align-items:center;"><i class="fas fa-cube" style="color:#93c5fd;font-size:20px;margin-right:10px;"></i> Кадастровая 3D Модель</span>';

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex'; btnContainer.style.gap = '8px';

            const createWinBtn = (iconClass, hoverColor, bgColor) => {
                bgColor = bgColor || 'rgba(255,255,255,0.15)';
                const btn = document.createElement('button');
                btn.innerHTML = '<i class="' + iconClass + '"></i>';
                Object.assign(btn.style, {
                    background: bgColor, border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: '14px',
                    cursor: 'pointer', width: '32px', height: '32px',
                    borderRadius: '6px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                btn.onmouseenter = () => { btn.style.background = hoverColor; btn.style.color = '#fff'; };
                btn.onmouseleave = () => { btn.style.background = bgColor; btn.style.color = 'rgba(255,255,255,0.85)'; };
                return btn;
            };

            const minBtn = createWinBtn('fas fa-minus', 'rgba(255,255,255,0.3)');
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
            closeBtn.onclick = () => { window.isGlobalMapMode = false; modal.remove(); };

            btnContainer.appendChild(minBtn);
            btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer);
            modal.appendChild(header);

            // Вспомогательная функция: последний сегмент кадастрового номера
            // "16:56:010130:103" -> ":103"
            const getShortCadNum = (id) => {
                if (!id) return '';
                const parts = id.split(':');
                return ':' + parts[parts.length - 1];
            };

            // Вспомогательная функция: короткое название типа сети
            const getNetworkShortName = (meta) => {
                if (meta.isGas) return 'Газ';
                if (meta.isWater) return 'Вода';
                if (meta.isHeat) return 'Тепло';
                if (meta.isElectric) return 'ЛЭП';
                if (meta.isSewer) return 'Канал.';
                return 'Сеть';
            };

            const getZouitShortName = (meta) => {
                if (meta.isGas) return 'ОЗ Газ';
                if (meta.isWater) return 'ОЗ Вода';
                if (meta.isHeat) return 'ОЗ Тепло';
                if (meta.isElectric) return 'ОЗ ЛЭП';
                if (meta.isSewer) return 'ОЗ Кан.';
                return 'ЗОУИТ';
            };

            const srcDocContent = '<!DOCTYPE html>\n' +
'<html lang="ru">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<style>\n' +
'body { margin: 0; overflow: hidden; background: #1e3a5f; font-family: "Segoe UI", system-ui, sans-serif; }\n' +
'#ui-toggle-btn { display: none; position: absolute; top: 15px; right: 15px; background: rgba(255,255,255,0.95); border: 1px solid #c7d9f1; border-radius: 10px; width: 44px; height: 44px; box-shadow: 0 4px 16px rgba(37,99,235,0.12); z-index: 101; cursor: pointer; align-items: center; justify-content: center; }\n' +
'#ui-panel { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.97); padding: 20px; border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); backdrop-filter: blur(12px); width: 270px; max-height: 85vh; overflow-y: auto; z-index: 100; border: 1px solid rgba(37,99,235,0.12); transition: transform 0.3s, opacity 0.3s; }\n' +
'#close-ui-btn { display: none; position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: #94a3b8; line-height: 1; }\n' +
'#close-ui-btn:hover { color: #ef4444; }\n' +
'h3 { margin: 0 0 15px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; font-weight: 700; letter-spacing: 0.3px; }\n' +
'.layer-item { margin-bottom: 6px; }\n' +
'.layer-header { display: flex; align-items: center; }\n' +
'.caret { cursor: pointer; user-select: none; margin-right: 6px; font-size: 12px; color: #64748b; display: inline-block; width: 14px; text-align: center; transition: transform 0.2s; }\n' +
'.caret::before { content: "\\25B6"; }\n' +
'.caret-down::before { content: "\\25BC"; }\n' +
'.nested { display: none; margin: 4px 0 4px 24px; padding: 0; list-style: none; border-left: 2px solid #e2e8f0; }\n' +
'.active { display: block; }\n' +
'.nested li { display: flex; align-items: center; margin-bottom: 4px; padding-left: 8px; }\n' +
'.nested li label { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }\n' +
'.layer-control { display: flex; align-items: center; cursor: pointer; padding: 4px; border-radius: 6px; transition: background 0.15s; }\n' +
'.layer-control:hover { background: #f0f7ff; }\n' +
'.layer-control input { margin-right: 10px; cursor: pointer; width: 15px; height: 15px; accent-color: #2563eb; }\n' +
'.layer-control label { cursor: pointer; font-size: 13px; color: #334155; font-weight: 500; }\n' +
'.color-box { width: 14px; height: 14px; display: inline-block; margin-right: 10px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15); flex-shrink: 0; }\n' +
'.info-text { position: absolute; bottom: 20px; left: 20px; background: rgba(255,255,255,0.97); color: #334155; padding: 14px 18px; border-radius: 10px; font-size: 13px; font-weight: 500; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-left: 4px solid #2563eb; z-index: 100; line-height: 1.6; }\n' +
'.export-btn { width: 100%; margin-top: 15px; padding: 10px; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; }\n' +
'.export-btn:hover { box-shadow: 0 4px 12px rgba(16,185,129,0.35); }\n' +
'#home-btn { position: absolute; bottom: 20px; right: 20px; width: 44px; height: 44px; background: rgba(255,255,255,0.95); border: 1px solid #c7d9f1; border-radius: 10px; box-shadow: 0 4px 16px rgba(37,99,235,0.12); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 101; font-size: 18px; color: #2563eb; }\n' +
'#home-btn:hover { background: #2563eb; color: #fff; }\n' +
'#hover-tooltip { position: absolute; background: rgba(255,255,255,0.98); border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); color: #1e293b; font-size: 13px; pointer-events: none; opacity: 0; transform: translateY(10px); transition: opacity 0.2s, transform 0.2s; z-index: 1000; max-width: 320px; line-height: 1.4; }\n' +
'#hover-tooltip strong { color: #2563eb; display: block; font-size: 15px; margin-bottom: 6px; }\n' +
'#hover-tooltip span.area { color: #059669; font-weight: bold; margin-top: 6px; display: block; font-size: 14px; }\n' +
'@media (max-width: 768px) { #ui-toggle-btn { display: flex; } #ui-panel { right: 0; top: 0; height: 100vh; width: 280px; border-radius: 0; max-height: 100vh; } #ui-panel.hidden { transform: translateX(120%); opacity: 0; pointer-events: none; } #close-ui-btn { display: block; } .info-text { display: none; } }\n' +
'</style>\n' +
'<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>\n' +
'<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}<\/script>\n' +
'</head>\n' +
'<body>\n' +
'<button id="ui-toggle-btn"><svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 12 12 17 22 12"></polyline><polyline points="2 17 12 22 22 17"></polyline></svg></button>\n' +
'<button id="home-btn" title="Исходный вид">&#8962;</button>\n' +
'<div id="ui-panel">\n' +
'  <button id="close-ui-btn">&times;</button>\n' +
'  <h3>Слои сцены</h3>\n' +
'  <div id="layers-container"></div>\n' +
'  <div class="layer-control" style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px;">\n' +
'    <span style="width:20px;display:inline-block;"></span>\n' +
'    <input type="checkbox" id="t-labels" checked>\n' +
'    <div class="color-box" style="background:#fff;border:2px solid #2563eb;"></div>\n' +
'    <label for="t-labels">Подписи объектов</label>\n' +
'  </div>\n' +
'  <div style="margin-top:15px;border-top:1px solid #e2e8f0;padding-top:15px;">\n' +
'    <button id="export-html-btn" class="export-btn">Сохранить в HTML</button>\n' +
'  </div>\n' +
'</div>\n' +
'<div class="info-text">ЛКМ: Вращение | ПКМ: Перемещение<br><b>Наведите курсор</b> для информации<br><b>2x клик:</b> Центрировать объект</div>\n' +
'<div id="hover-tooltip"></div>\n' +
'<script type="module">\n' +
'import * as THREE from "three";\n' +
'import { OrbitControls } from "three/addons/controls/OrbitControls.js";\n' +
'\n' +
'const uiPanel = document.getElementById("ui-panel");\n' +
'const uiToggleBtn = document.getElementById("ui-toggle-btn");\n' +
'const closeUiBtn = document.getElementById("close-ui-btn");\n' +
'if (window.innerWidth > 768) uiPanel.classList.remove("hidden");\n' +
'uiToggleBtn.onclick = () => uiPanel.classList.toggle("hidden");\n' +
'closeUiBtn.onclick = () => uiPanel.classList.add("hidden");\n' +
'\n' +
'const IS_GLOBAL_MODE = ' + (!!window.isGlobalMapMode) + ';\n' +
'\n' +
'// Получить последний сегмент кадастрового номера: "16:56:010130:103" -> ":103"\n' +
'const getShortCad = function(id) {\n' +
'    if (!id) return "";\n' +
'    var parts = id.split(":");\n' +
'    return ":" + parts[parts.length - 1];\n' +
'};\n' +
'\n' +
'// Короткое название сети\n' +
'const getNetShort = function(m) {\n' +
'    if (m.isGas) return "Газ";\n' +
'    if (m.isWater) return "Вода";\n' +
'    if (m.isHeat) return "Тепло";\n' +
'    if (m.isElectric) return "ЛЭП";\n' +
'    if (m.isSewer) return "Канал.";\n' +
'    return "Сеть";\n' +
'};\n' +
'\n' +
'// Короткое название ЗОУИТ\n' +
'const getZouitShort = function(m) {\n' +
'    if (m.isGas) return "ОЗ Газ";\n' +
'    if (m.isWater) return "ОЗ Вода";\n' +
'    if (m.isHeat) return "ОЗ Тепло";\n' +
'    if (m.isElectric) return "ОЗ ЛЭП";\n' +
'    if (m.isSewer) return "ОЗ Кан.";\n' +
'    return "ЗОУИТ";\n' +
'};\n' +
'\n' +
'try {\n' +
'    const data = ' + safeDataString + ';\n' +
'    const animateables = [];\n' +
'\n' +
'    ["target","parcels","intersections","buildings","structures","zouits"].forEach(function(key) {\n' +
'        if (data[key]) data[key].forEach(function(item, idx) { item.uid = key + "_" + idx; });\n' +
'    });\n' +
'\n' +
'    const INFRA_COLORS = { gas: 0xf59e0b, water: 0x3b82f6, heat: 0xef4444, electric: 0x8b5cf6, sewer: 0x6b7280, def: 0x94a3b8 };\n' +
'    const getInfraColor = function(m) {\n' +
'        if (m.isGas) return INFRA_COLORS.gas;\n' +
'        if (m.isWater) return INFRA_COLORS.water;\n' +
'        if (m.isHeat) return INFRA_COLORS.heat;\n' +
'        if (m.isElectric) return INFRA_COLORS.electric;\n' +
'        if (m.isSewer) return INFRA_COLORS.sewer;\n' +
'        return INFRA_COLORS.def;\n' +
'    };\n' +
'    const getInfraHex = function(m) { return "#" + new THREE.Color(getInfraColor(m)).getHexString(); };\n' +
'    const getInfraName = function(m) {\n' +
'        if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name;\n' +
'        if (m.isGas) return "Газопровод";\n' +
'        if (m.isWater) return "Водопровод";\n' +
'        if (m.isHeat) return "Теплотрасса";\n' +
'        if (m.isElectric) return "ЛЭП";\n' +
'        if (m.isSewer) return "Канализация";\n' +
'        return "Сооружение";\n' +
'    };\n' +
'    const getZouitName = function(m) {\n' +
'        if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name;\n' +
'        if (m.isGas) return "Охр. зона газа";\n' +
'        if (m.isWater) return "Охр. зона водопровода";\n' +
'        if (m.isHeat) return "Охр. зона теплосети";\n' +
'        if (m.isElectric) return "Охр. зона ЛЭП";\n' +
'        if (m.isSewer) return "Охр. зона канализации";\n' +
'        return "ЗОУИТ";\n' +
'    };\n' +
'\n' +
'    const PARCEL_PALETTE = [\n' +
'        0x4ade80, 0x34d399, 0xa3e635, 0x2dd4bf, 0x86efac,\n' +
'        0x6ee7b7, 0xbef264, 0x5eead4, 0x67e8f9, 0x38bdf8,\n' +
'        0xa78bfa, 0xfbbf24, 0xf0abfc, 0xfb7185, 0x22d3ee\n' +
'    ];\n' +
'    const darken = function(hex, f) { f = f || 0.55; var c = new THREE.Color(hex); c.r*=f; c.g*=f; c.b*=f; return c; };\n' +
'\n' +
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
'        petals: [0xf43f5e,0xfbbf24,0xa78bfa,0xfb7185,0xf97316,0x34d399].map(function(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }); })\n' +
'    };\n' +
'\n' +
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
'\n' +
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
'\n' +
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
'        var mat=new THREE.MeshStandardMaterial({map:tex,roughness:0.6});\n' +
'        windowMaterialCache[ck]=mat;return mat;\n' +
'    }\n' +
'\n' +
'    const scene = new THREE.Scene();\n' +
'    var skyCanvas=document.createElement("canvas");skyCanvas.width=1;skyCanvas.height=512;\n' +
'    var skyCtx=skyCanvas.getContext("2d");\n' +
'    var skyGrad=skyCtx.createLinearGradient(0,0,0,512);\n' +
'    skyGrad.addColorStop(0,"#1e3a5f");skyGrad.addColorStop(0.25,"#2563eb");\n' +
'    skyGrad.addColorStop(0.5,"#60a5fa");skyGrad.addColorStop(0.75,"#93c5fd");skyGrad.addColorStop(1,"#e0f2fe");\n' +
'    skyCtx.fillStyle=skyGrad;skyCtx.fillRect(0,0,1,512);\n' +
'    var skyTex=new THREE.CanvasTexture(skyCanvas);skyTex.colorSpace=THREE.SRGBColorSpace;\n' +
'    scene.background=skyTex;\n' +
'\n' +
'    const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 2000);\n' +
'    camera.position.set(40, 60, 100);\n' +
'    const renderer = new THREE.WebGLRenderer({ antialias: true });\n' +
'    renderer.setSize(window.innerWidth, window.innerHeight);\n' +
'    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));\n' +
'    renderer.shadowMap.enabled = true;\n' +
'    renderer.shadowMap.type = THREE.PCFSoftShadowMap;\n' +
'    document.body.appendChild(renderer.domElement);\n' +
'\n' +
'    const controls = new OrbitControls(camera, renderer.domElement);\n' +
'    controls.enableDamping=true;controls.dampingFactor=0.05;controls.maxPolarAngle=Math.PI/2-0.02;\n' +
'    controls.target.set(0,0,0);controls.zoomSpeed=2.5;\n' +
'    const initialCamPos = new THREE.Vector3(40, 60, 100);\n' +
'    const initialTarget = new THREE.Vector3(0, 0, 0);\n' +
'    document.getElementById("home-btn").onclick = function() {\n' +
'        camera.position.copy(initialCamPos);\n' +
'        controls.target.copy(initialTarget);\n' +
'        controls.update();\n' +
'    };\n' +
'\n' +
'    scene.add(new THREE.AmbientLight(0xffffff, 0.65));\n' +
'    scene.add(new THREE.HemisphereLight(0xffffff, 0xd1d5db, 0.5));\n' +
'    var sunLight=new THREE.DirectionalLight(0xfff8e7, 1.5);\n' +
'    sunLight.position.set(100,150,50);sunLight.castShadow=true;\n' +
'    sunLight.shadow.mapSize.width=2048;sunLight.shadow.mapSize.height=2048;\n' +
'    sunLight.shadow.camera.top=150;sunLight.shadow.camera.bottom=-150;\n' +
'    sunLight.shadow.camera.left=-150;sunLight.shadow.camera.right=150;\n' +
'    sunLight.shadow.bias=-0.0005;\n' +
'    scene.add(sunLight);\n' +
'\n' +
'    function createGroundTexture(){\n' +
'        var cv=document.createElement("canvas");cv.width=512;cv.height=512;var ctx=cv.getContext("2d");\n' +
'        ctx.fillStyle="#eef2f7";ctx.fillRect(0,0,512,512);\n' +
'        ctx.fillStyle="#e4e9f0";ctx.fillRect(0,0,256,256);ctx.fillRect(256,256,256,256);\n' +
'        for(var i=0;i<100;i++){ctx.fillStyle="rgba(0,0,0,"+(Math.random()*0.025)+")";ctx.fillRect(Math.random()*512,Math.random()*512,Math.random()*6+2,Math.random()*6+2);}\n' +
'        var t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.RepeatWrapping;t.repeat.set(100,100);return t;\n' +
'    }\n' +
'    var ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({map:createGroundTexture(),roughness:0.9}));\n' +
'    ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);\n' +
'    scene.add(new THREE.GridHelper(2000,200,0x94a3b8,0xcbd5e1).translateY(0.05));\n' +
'\n' +
'    function createCompass(){\n' +
'        var cg=new THREE.Group();\n' +
'        cg.add(new THREE.Mesh(new THREE.CylinderGeometry(8,8,0.5,32),new THREE.MeshStandardMaterial({color:0x1e293b,roughness:0.4,metalness:0.3})).translateY(0.25));\n' +
'        var aN=new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0xef4444}));\n' +
'        aN.position.y=0.6;aN.rotation.y=Math.PI;cg.add(aN);\n' +
'        var aS=new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0xe2e8f0}));\n' +
'        aS.position.y=0.6;cg.add(aS);\n' +
'        var addL=function(text,rotY,color){\n' +
'            var cv=document.createElement("canvas");cv.width=128;cv.height=128;\n' +
'            var ctx=cv.getContext("2d");ctx.font="bold 80px sans-serif";ctx.fillStyle=color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,64,64);\n' +
'            var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv)}));\n' +
'            sp.scale.set(6,6,1);sp.position.set(Math.sin(rotY)*11,2.5,Math.cos(rotY)*11);cg.add(sp);\n' +
'        };\n' +
'        addL("С",Math.PI,"#ef4444");addL("Ю",0,"#1e293b");addL("В",Math.PI/2,"#1e293b");addL("З",-Math.PI/2,"#1e293b");\n' +
'        cg.position.set(-60,0,60);return cg;\n' +
'    }\n' +
'    scene.add(createCompass());\n' +
'\n' +
'    const groups={target:new THREE.Group(),parcels:new THREE.Group(),intersections:new THREE.Group(),buildings:new THREE.Group(),structures:new THREE.Group(),zouit:new THREE.Group()};\n' +
'    const labelGroups={target:new THREE.Group(),parcels:new THREE.Group(),buildings:new THREE.Group(),structures:new THREE.Group(),zouit:new THREE.Group()};\n' +
'    const masterLabelsGroup=new THREE.Group();\n' +
'    var gk=Object.keys(groups);gk.forEach(function(k){scene.add(groups[k]);});\n' +
'    var lgk=Object.keys(labelGroups);lgk.forEach(function(k){masterLabelsGroup.add(labelGroups[k]);});\n' +
'    scene.add(masterLabelsGroup);\n' +
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
'\n' +
'    const getCentroid=function(pts){if(!pts||!pts.length)return{x:0,z:0};var cx=0,cy=0;pts.forEach(function(p){cx+=p.x;cy+=p.y;});return{x:cx/pts.length,z:-cy/pts.length};};\n' +
'\n' +
'    // ══════════════════════════════════════════════\n' +
'    // createLabel — БЕЗ template literals\n' +
'    // ══════════════════════════════════════════════\n' +
'    const createLabel = function(name, id, areaText, isSmall, themeColor) {\n' +
'        isSmall = isSmall || false;\n' +
'        themeColor = themeColor || "#2563eb";\n' +
'        var cv = document.createElement("canvas");\n' +
'        var ctx = cv.getContext("2d");\n' +
'\n' +
'        if (isSmall) {\n' +
'            var fontSize = 96;\n' +
'            ctx.font = "bold " + fontSize + "px sans-serif";\n' +
'            var textWidth = ctx.measureText(name).width;\n' +
'            cv.width = Math.max(300, textWidth + 80);\n' +
'            cv.height = 140;\n' +
'            ctx.clearRect(0, 0, cv.width, cv.height);\n' +
'            ctx.shadowColor = "rgba(0,0,0,0.35)";\n' +
'            ctx.shadowBlur = 18;\n' +
'            ctx.shadowOffsetY = 4;\n' +
'            ctx.fillStyle = "rgba(255,255,255,0.98)";\n' +
'            ctx.beginPath();\n' +
'            ctx.roundRect(8, 8, cv.width-16, cv.height-16, 32);\n' +
'            ctx.fill();\n' +
'            ctx.shadowColor = "transparent";\n' +
'            ctx.strokeStyle = themeColor;\n' +
'            ctx.lineWidth = 10;\n' +
'            ctx.beginPath();\n' +
'            ctx.roundRect(8, 8, cv.width-16, cv.height-16, 32);\n' +
'            ctx.stroke();\n' +
'            ctx.font = "bold " + fontSize + "px sans-serif";\n' +
'            ctx.textAlign = "center";\n' +
'            ctx.textBaseline = "middle";\n' +
'            ctx.fillStyle = "#1e293b";\n' +
'            ctx.fillText(name, cv.width/2, cv.height/2 + 4);\n' +
'        } else {\n' +
'            var titleSize = 52;\n' +
'            var idSize = 44;\n' +
'            var areaSize = 38;\n' +
'            ctx.font = "bold " + titleSize + "px sans-serif";\n' +
'            var twTitle = ctx.measureText(name || "Объект").width;\n' +
'            ctx.font = "bold " + idSize + "px monospace";\n' +
'            var twId = id ? ctx.measureText(id).width : 0;\n' +
'            ctx.font = areaSize + "px sans-serif";\n' +
'            var twArea = areaText ? ctx.measureText(areaText).width : 0;\n' +
'            var contentW = Math.max(twTitle, twId, twArea);\n' +
'            cv.width = Math.max(600, contentW + 80);\n' +
'            var lines = [name || "Объект", id, areaText].filter(Boolean);\n' +
'            var lineHeight = 72;\n' +
'            cv.height = lines.length * lineHeight + 50;\n' +
'            ctx.clearRect(0, 0, cv.width, cv.height);\n' +
'            ctx.shadowColor = "rgba(0,0,0,0.25)";\n' +
'            ctx.shadowBlur = 16;\n' +
'            ctx.shadowOffsetY = 4;\n' +
'            ctx.fillStyle = "rgba(255,255,255,0.95)";\n' +
'            ctx.beginPath();\n' +
'            ctx.roundRect(8, 8, cv.width-16, cv.height-16, 18);\n' +
'            ctx.fill();\n' +
'            ctx.shadowColor = "transparent";\n' +
'            ctx.fillStyle = themeColor;\n' +
'            ctx.beginPath();\n' +
'            ctx.roundRect(8, 8, cv.width-16, 14, [18,18,0,0]);\n' +
'            ctx.fill();\n' +
'            ctx.strokeStyle = themeColor;\n' +
'            ctx.lineWidth = 5;\n' +
'            ctx.beginPath();\n' +
'            ctx.roundRect(8, 8, cv.width-16, cv.height-16, 18);\n' +
'            ctx.stroke();\n' +
'            var cx2 = cv.width/2;\n' +
'            var currentY = 30 + lineHeight*0.5;\n' +
'            ctx.textAlign = "center";\n' +
'            ctx.textBaseline = "middle";\n' +
'            ctx.font = "bold " + titleSize + "px sans-serif";\n' +
'            ctx.fillStyle = "#1e293b";\n' +
'            ctx.fillText(name || "Объект", cx2, currentY, cv.width-40);\n' +
'            currentY += lineHeight;\n' +
'            if (id) {\n' +
'                ctx.font = "bold " + idSize + "px monospace";\n' +
'                ctx.fillStyle = themeColor;\n' +
'                ctx.fillText(id, cx2, currentY, cv.width-40);\n' +
'                currentY += lineHeight;\n' +
'            }\n' +
'            if (areaText) {\n' +
'                ctx.font = areaSize + "px sans-serif";\n' +
'                ctx.fillStyle = "#059669";\n' +
'                ctx.fillText(areaText, cx2, currentY, cv.width-40);\n' +
'            }\n' +
'        }\n' +
'\n' +
'        var tex = new THREE.CanvasTexture(cv);\n' +
'        tex.colorSpace = THREE.SRGBColorSpace;\n' +
'        tex.minFilter = THREE.LinearMipmapLinearFilter;\n' +
'        tex.generateMipmaps = true;\n' +
'\n' +
'        var sp = new THREE.Sprite(new THREE.SpriteMaterial({\n' +
'            map: tex,\n' +
'            depthTest: false,\n' +
'            sizeAttenuation: true,\n' +
'            transparent: true,\n' +
'            opacity: IS_GLOBAL_MODE ? 1.0 : 0.0\n' +
'        }));\n' +
'        var worldH = isSmall ? 6 : 10;\n' +
'        var asp = cv.width / cv.height;\n' +
'        sp.scale.set(asp * worldH, worldH, 1);\n' +
'        sp.center.set(0.5, 0);\n' +
'        sp.userData.isStandardLabel = !isSmall && !IS_GLOBAL_MODE;\n' +
'        return sp;\n' +
'    };\n' +
'\n' +
'    const createStake=function(position){\n' +
'        var g=new THREE.Group();\n' +
'        var stick=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.15,5),new THREE.MeshStandardMaterial({color:0x8b5a2b,roughness:0.9}));\n' +
'        stick.position.y=2.5;stick.castShadow=true;g.add(stick);\n' +
'        var cap=new THREE.Mesh(new THREE.SphereGeometry(0.3,8,8),new THREE.MeshStandardMaterial({color:0xef4444,roughness:0.3,metalness:0.2}));\n' +
'        cap.position.y=5.1;g.add(cap);\n' +
'        g.position.set(position.x,0,position.z);\n' +
'        return g;\n' +
'    };\n' +
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
'        return b;\n' +
'    };\n' +
'\n' +
'    const addToGroups=function(gD,lD,item,meshObj,lblObj){\n' +
'        meshObj.userData.uid=item.uid;gD.add(meshObj);\n' +
'        if(lblObj&&lD){lblObj.userData.uid=item.uid;lD.add(lblObj);}\n' +
'    };\n' +
'\n' +
'    // ══════ ОТРИСОВКА ══════\n' +
'\n' +
'    data.target.forEach(function(t){\n' +
'        if (IS_GLOBAL_MODE) {\n' +
'            if (t.meta && t.meta.id === "Центр экрана") {\n' +
'                var lbl = createLabel("Центр", "", "", true, "#ef4444");\n' +
'                lbl.position.set(0, 10, 0);\n' +
'                addToGroups(groups.target, labelGroups.target, t, new THREE.Group(), lbl);\n' +
'            }\n' +
'            return;\n' +
'        }\n' +
'        var color=(t.meta&&t.meta.isParcel)?0x4ade80:0xef4444;\n' +
'        var tG=new THREE.Group();\n' +
'        t.polygons.forEach(function(poly){\n' +
'            if(!poly||!poly[0])return;\n' +
'            if(t.type==="Line"){\n' +
'                var vp=poly[0].map(function(p){return new THREE.Vector3(p.x,1.5,-p.y);});\n' +
'                if(vp.length>1){\n' +
'                    var tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp,false,"chordal"),64,0.6,8,false),new THREE.MeshStandardMaterial({color:color}));\n' +
'                    tube.castShadow=true;tG.add(tube);\n' +
'                }\n' +
'            }else{\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    var depth=0.8;\n' +
'                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:depth,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:color,opacity:0.8,transparent:true}));\n' +
'                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;\n' +
'                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x7f1d1d,linewidth:2})));\n' +
'                    mesh.castShadow=true;tG.add(mesh);\n' +
'                    seedParcelWithFlowers(poly[0], tG, depth);\n' +
'                }\n' +
'            }\n' +
'        });\n' +
'        var lbl=null;\n' +
'        if(t.meta&&t.polygons[0]){\n' +
'            var c=getCentroid(t.polygons[0][0]);\n' +
'            lbl=createLabel(t.meta.name,t.meta.id,t.meta.area,false,"#ef4444");\n' +
'            lbl.position.set(c.x,12,c.z);\n' +
'        }\n' +
'        addToGroups(groups.target,labelGroups.target,t,tG,lbl);\n' +
'    });\n' +
'\n' +
'    data.parcels.forEach(function(p,index){\n' +
'        var pG=new THREE.Group();\n' +
'        var yOff=index*0.015;var depth=0.2;\n' +
'        var pHex=PARCEL_PALETTE[index%PARCEL_PALETTE.length];\n' +
'        var pColor=new THREE.Color(pHex);\n' +
'        var eColor=darken(pHex);\n' +
'        var lblColor="#"+pColor.getHexString();\n' +
'        p.polygons.forEach(function(poly){\n' +
'            var shape=createShape(poly);\n' +
'            if(shape.getPoints().length>2){\n' +
'                var mat=new THREE.MeshStandardMaterial({color:pColor,roughness:0.85,metalness:0.05});\n' +
'                var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:depth,bevelEnabled:false}),mat);\n' +
'                mesh.rotation.x=-Math.PI/2;mesh.position.y=yOff;\n' +
'                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:eColor})));\n' +
'                mesh.receiveShadow=true;pG.add(mesh);\n' +
'                seedParcelWithFlowers(poly[0], pG, yOff + depth);\n' +
'            }\n' +
'        });\n' +
'        var c=p.polygons[0]?getCentroid(p.polygons[0][0]):{x:0,z:0};\n' +
'        var lbl=null;\n' +
'        if (IS_GLOBAL_MODE) {\n' +
'            var pSize = 10;\n' +
'            if (p.polygons[0] && p.polygons[0][0]) {\n' +
'                var mnX=Infinity,mxXp=-Infinity,mnZp=Infinity,mxZp=-Infinity;\n' +
'                p.polygons[0][0].forEach(function(pt){\n' +
'                    mnX=Math.min(mnX,pt.x);mxXp=Math.max(mxXp,pt.x);\n' +
'                    mnZp=Math.min(mnZp,pt.y);mxZp=Math.max(mxZp,pt.y);\n' +
'                });\n' +
'                pSize = Math.max(mxXp-mnX, mxZp-mnZp);\n' +
'            }\n' +
'            // Глобальный режим: показываем последний сегмент кадастрового номера\n' +
'            var shortId = getShortCad(p.meta.id);\n' +
'            lbl = createLabel(shortId, "", "", true, lblColor);\n' +
'            lbl.position.set(c.x, 3 + yOff, c.z);\n' +
'            lbl.userData.fullInfo = { title: p.meta.id, desc: p.meta.name, area: p.meta.area };\n' +
'            lbl.userData.parcelSize = pSize;\n' +
'            lbl.userData.isLodLabel = true;\n' +
'        } else {\n' +
'            // Стандартный режим: полная табличка\n' +
'            lbl = createLabel(p.meta.name, p.meta.id, p.meta.area, false, lblColor);\n' +
'            lbl.position.set(c.x, 6 + yOff, c.z);\n' +
'        }\n' +
'        addToGroups(groups.parcels,labelGroups.parcels,p,pG,lbl);\n' +
'    });\n' +
'\n' +
'    data.intersections.forEach(function(iObj){\n' +
'        var iG=new THREE.Group();\n' +
'        iObj.polygons.forEach(function(poly){\n' +
'            var shape=createShape(poly);\n' +
'            if(shape.getPoints().length>2){\n' +
'                var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.5,bevelEnabled:false}),new THREE.MeshBasicMaterial({color:0xdc2626,transparent:true,opacity:0.7,depthWrite:false}));\n' +
'                mesh.rotation.x=-Math.PI/2;mesh.position.y=1.0;\n' +
'                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x991b1b,linewidth:3})));\n' +
'                iG.add(mesh);\n' +
'            }\n' +
'        });\n' +
'        addToGroups(groups.intersections,null,iObj,iG,null);\n' +
'    });\n' +
'\n' +
'    var linkedCount=0;\n' +
'    data.buildings.forEach(function(b){\n' +
'        var bG=new THREE.Group();\n' +
'        var style=getBuildingStyle(b.meta.rawText);\n' +
'        var lbl=null;\n' +
'        if(b.meta.isSpatial){\n' +
'            b.polygons.forEach(function(poly){\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    bG.add(createBuildingModel(shape,b.meta.height,style));\n' +
'                    var c=getCentroid(poly[0]);\n' +
'                    if (IS_GLOBAL_MODE) {\n' +
'                        // "ОКС :103"\n' +
'                        var bShortId = getShortCad(b.meta.id);\n' +
'                        var bLabel = "ОКС " + bShortId;\n' +
'                        lbl = createLabel(bLabel, "", "", true, "#2563eb");\n' +
'                        lbl.position.set(c.x, b.meta.height + 2, c.z);\n' +
'                        lbl.userData.fullInfo = { title: b.meta.id, desc: b.meta.name, area: b.meta.area };\n' +
'                    } else {\n' +
'                        lbl=createLabel(b.meta.name,b.meta.id,b.meta.area,false,"#2563eb");\n' +
'                        lbl.position.set(c.x,b.meta.height+6,c.z);\n' +
'                    }\n' +
'                }\n' +
'            });\n' +
'        } else {\n' +
'            var radius=25+(linkedCount%2)*8;\n' +
'            var angle=(linkedCount*Math.PI*2)/6;\n' +
'            var posX=Math.cos(angle)*radius,posZ=Math.sin(angle)*radius;\n' +
'            if(b.meta.hasExtendedData){\n' +
'                var ds=new THREE.Shape();ds.moveTo(-5,-5);ds.lineTo(5,-5);ds.lineTo(5,5);ds.lineTo(-5,5);\n' +
'                var mm=createBuildingModel(ds,b.meta.height,style,true);\n' +
'                mm.scale.set(0.4,0.4,0.4);bG.add(mm);\n' +
'                var laser=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,15),new THREE.MeshBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.3}));\n' +
'                laser.position.y=-7.5;bG.add(laser);\n' +
'                bG.position.set(posX,15,posZ);bG.userData={baseY:15,offset:linkedCount};\n' +
'                animateables.push(bG);\n' +
'                if (IS_GLOBAL_MODE) {\n' +
'                    var bShortId2 = getShortCad(b.meta.id);\n' +
'                    lbl = createLabel("ОКС " + bShortId2, "", "", true, "#2563eb");\n' +
'                } else {\n' +
'                    lbl=createLabel(b.meta.name,b.meta.id,"Привязка к ЗУ",true,"#2563eb");\n' +
'                }\n' +
'                lbl.position.set(posX,15+(b.meta.height*0.4)+4,posZ);\n' +
'            } else {\n' +
'                bG.add(createStake({x:posX,z:posZ}));\n' +
'                if (IS_GLOBAL_MODE) {\n' +
'                    var bShortId3 = getShortCad(b.meta.id);\n' +
'                    lbl = createLabel("ОКС " + bShortId3, "", "", true, "#2563eb");\n' +
'                } else {\n' +
'                    lbl=createLabel("ОКС (Связан)",b.meta.id,"Нет данных",true,"#2563eb");\n' +
'                }\n' +
'                lbl.position.set(posX,7,posZ);\n' +
'            }\n' +
'            linkedCount++;\n' +
'        }\n' +
'        addToGroups(groups.buildings,labelGroups.buildings,b,bG,lbl);\n' +
'    });\n' +
'\n' +
'    data.structures.forEach(function(s){\n' +
'        var sG=new THREE.Group();\n' +
'        var lbl=null;\n' +
'        var infraColor=getInfraColor(s.meta);\n' +
'        var infraHex=getInfraHex(s.meta);\n' +
'        var infraName=getInfraName(s.meta);\n' +
'\n' +
'        s.polygons.forEach(function(poly){\n' +
'            if(!poly||!poly[0]||poly[0].length<2)return;\n' +
'            var midPt=null;\n' +
'            var drawH=5;\n' +
'            if(s.type==="Line"){\n' +
'                if((s.meta.isGas||s.meta.isHeat)&&!s.meta.isUnderground){\n' +
'                    drawH=3;\n' +
'                    var pts=poly[0].map(function(pt){return new THREE.Vector3(pt.x,drawH,-pt.y);});\n' +
'                    var pipe=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,s.meta.diameter,8,false),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.4,metalness:0.1}));\n' +
'                    pipe.castShadow=true;sG.add(pipe);\n' +
'                    pts.forEach(function(pt,i){\n' +
'                        if(i%2===0){\n' +
'                            var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,drawH),new THREE.MeshStandardMaterial({color:0x94a3b8}));\n' +
'                            pole.position.set(pt.x,drawH/2,pt.z);pole.castShadow=true;sG.add(pole);\n' +
'                        }\n' +
'                    });\n' +
'                    midPt=pts[Math.floor(pts.length/2)];\n' +
'                } else if(s.meta.isElectric){\n' +
'                    drawH=10;\n' +
'                    var pts2=poly[0].map(function(pt){return new THREE.Vector3(pt.x,drawH,-pt.y);});\n' +
'                    pts2.forEach(function(pt,idx){\n' +
'                        var pG2=new THREE.Group();\n' +
'                        var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,drawH),new THREE.MeshStandardMaterial({color:0x5c4033}));\n' +
'                        pole.position.y=drawH/2;pole.castShadow=true;pG2.add(pole);\n' +
'                        var cross=new THREE.Mesh(new THREE.BoxGeometry(3,0.2,0.2),new THREE.MeshStandardMaterial({color:0x5c4033}));\n' +
'                        cross.position.y=drawH-0.5;\n' +
'                        if(idx<pts2.length-1)cross.rotation.y=Math.atan2(pts2[idx+1].x-pt.x,pts2[idx+1].z-pt.z);\n' +
'                        else if(idx>0)cross.rotation.y=Math.atan2(pt.x-pts2[idx-1].x,pt.z-pts2[idx-1].z);\n' +
'                        pG2.add(cross);pG2.position.set(pt.x,0,pt.z);sG.add(pG2);\n' +
'                    });\n' +
'                    var wireMat=new THREE.LineBasicMaterial({color:0x8b5cf6});\n' +
'                    for(var wi=0;wi<pts2.length-1;wi++){\n' +
'                        var p1=pts2[wi].clone();p1.y-=0.5;var p2=pts2[wi+1].clone();p2.y-=0.5;\n' +
'                        var mid=new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5);mid.y-=1.5;\n' +
'                        sG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(p1,mid,p2).getPoints(20)),wireMat));\n' +
'                    }\n' +
'                    midPt=pts2[Math.floor(pts2.length/2)];\n' +
'                } else {\n' +
'                    var yPos=s.meta.isUnderground?-1:1;\n' +
'                    drawH=s.meta.isUnderground?3:5;\n' +
'                    var pts3=poly[0].map(function(pt){return new THREE.Vector3(pt.x,yPos,-pt.y);});\n' +
'                    if(pts3.length>1){\n' +
'                        sG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3,false,"chordal"),50,s.meta.diameter,12,false),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.5,metalness:0.1})));\n' +
'                        midPt=pts3[Math.floor(pts3.length/2)];\n' +
'                    }\n' +
'                }\n' +
'            } else {\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:infraColor,roughness:0.7}));\n' +
'                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;mesh.castShadow=true;sG.add(mesh);\n' +
'                    var c=getCentroid(poly[0]);\n' +
'                    midPt={x:c.x,y:5,z:c.z};\n' +
'                }\n' +
'            }\n' +
'            if(midPt){\n' +
'                if (IS_GLOBAL_MODE) {\n' +
'                    // "Газ :103", "Вода :103" и т.д.\n' +
'                    var sShortId = getShortCad(s.meta.id);\n' +
'                    var sLabelText = getNetShort(s.meta) + (sShortId ? " " + sShortId : "");\n' +
'                    lbl = createLabel(sLabelText, "", "", true, infraHex);\n' +
'                    lbl.position.set(midPt.x, drawH+2, midPt.z);\n' +
'                    lbl.userData.fullInfo = { title: s.meta.id, desc: infraName, area: s.meta.area || "" };\n' +
'                } else {\n' +
'                    lbl=createLabel(infraName,s.meta.id,s.meta.area||"",false,infraHex);\n' +
'                    lbl.position.set(midPt.x,drawH+4,midPt.z);\n' +
'                }\n' +
'            }\n' +
'        });\n' +
'        addToGroups(groups.structures,labelGroups.structures,s,sG,lbl);\n' +
'    });\n' +
'\n' +
'    data.zouits.forEach(function(z){\n' +
'        var zG=new THREE.Group();\n' +
'        var lbl=null;\n' +
'        var color=getInfraColor(z.meta);\n' +
'        var labelText=getZouitName(z.meta);\n' +
'        var labelHex=getInfraHex(z.meta);\n' +
'\n' +
'        z.polygons.forEach(function(poly){\n' +
'            if(!poly||!poly[0]||poly[0].length<2)return;\n' +
'            var midPt=null,h=5;\n' +
'            if(z.type==="Line"){\n' +
'                h=z.meta.isElectric?14:8;\n' +
'                var pts=poly[0].map(function(p){return new THREE.Vector3(p.x,z.meta.isElectric?5:2,-p.y);});\n' +
'                var zone=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,z.meta.isElectric?6:4,16,false),new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:0.2,depthWrite:false}));\n' +
'                zG.add(zone);\n' +
'                midPt=pts[Math.floor(pts.length/2)];\n' +
'            } else {\n' +
'                var shape=createShape(poly);\n' +
'                if(shape.getPoints().length>2){\n' +
'                    h=z.meta.isElectric?15:(z.meta.isGas?4:(z.meta.isHeat?5:6));\n' +
'                    var mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}),new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:0.15,depthWrite:false}));\n' +
'                    mesh.rotation.x=-Math.PI/2;mesh.position.y=0;zG.add(mesh);\n' +
'                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:color,transparent:true,opacity:0.5})));\n' +
'                    var c=getCentroid(poly[0]);\n' +
'                    midPt={x:c.x,y:h+3,z:c.z};\n' +
'                }\n' +
'            }\n' +
'            if(midPt){\n' +
'                if (IS_GLOBAL_MODE) {\n' +
'                    // "ОЗ Газ :103", "ОЗ ЛЭП :103" и т.д.\n' +
'                    var zShortId = getShortCad(z.meta.id);\n' +
'                    var zLabelText = getZouitShort(z.meta) + (zShortId ? " " + zShortId : "");\n' +
'                    lbl = createLabel(zLabelText, "", "", true, labelHex);\n' +
'                    lbl.position.set(midPt.x, h+1, midPt.z);\n' +
'                    lbl.userData.fullInfo = { title: z.meta.id, desc: labelText, area: "" };\n' +
'                } else {\n' +
'                    lbl=createLabel(labelText,z.meta.id,"",false,labelHex);\n' +
'                    lbl.position.set(midPt.x,h,midPt.z);\n' +
'                }\n' +
'            }\n' +
'        });\n' +
'        addToGroups(groups.zouit,labelGroups.zouit,z,zG,lbl);\n' +
'    });\n' +
'\n' +
'    // ══════ UI ══════\n' +
'    var buildLayersUI=function(){\n' +
'        var container=document.getElementById("layers-container");\n' +
'        var createLayer=function(id,label,color,groupRef,labelGroupRef,items){\n' +
'            if(!items||!items.length)return;\n' +
'            var wrapper=document.createElement("div");wrapper.className="layer-item";\n' +
'            var hdr=document.createElement("div");hdr.className="layer-header layer-control";\n' +
'            var caretHtml=items.length>1?"<span class=\\"caret\\"></span>":"<span style=\\"width:20px;display:inline-block;\\"></span>";\n' +
'            hdr.innerHTML=caretHtml+"<input type=\\"checkbox\\" id=\\"main-"+id+"\\" checked><div class=\\"color-box\\" style=\\"background:"+color+"\\"></div><label for=\\"main-"+id+"\\">"+label+"</label>";\n' +
'            wrapper.appendChild(hdr);\n' +
'            var mainCb=hdr.querySelector("input");\n' +
'            var ul=null;\n' +
'            mainCb.onchange=function(e){\n' +
'                if(groupRef)groupRef.visible=e.target.checked;\n' +
'                if(labelGroupRef)labelGroupRef.visible=e.target.checked;\n' +
'                if(ul){\n' +
'                    ul.querySelectorAll("input[type=\\"checkbox\\"]").forEach(function(cb){cb.checked=e.target.checked;});\n' +
'                    items.forEach(function(item){\n' +
'                        if(groupRef)groupRef.children.forEach(function(c){if(c.userData.uid===item.uid)c.visible=e.target.checked;});\n' +
'                        if(labelGroupRef)labelGroupRef.children.forEach(function(c){if(c.userData.uid===item.uid)c.visible=e.target.checked;});\n' +
'                    });\n' +
'                }\n' +
'            };\n' +
'            var caret=hdr.querySelector(".caret");\n' +
'            if(caret&&items.length>1){\n' +
'                ul=document.createElement("ul");ul.className="nested";\n' +
'                items.forEach(function(item){\n' +
'                    var li=document.createElement("li");li.className="layer-control";\n' +
'                    // Показываем только кадастровый номер в списке\n' +
'                    var displayName = item.meta.id || item.meta.name || "Объект";\n' +
'                    li.innerHTML="<input type=\\"checkbox\\" id=\\"child-"+item.uid+"\\" checked><label title=\\""+item.meta.id+"\\" for=\\"child-"+item.uid+"\\">"+displayName+"</label>";\n' +
'                    ul.appendChild(li);\n' +
'                    li.querySelector("input").onchange=function(e){\n' +
'                        var chk=e.target.checked;\n' +
'                        if(groupRef)groupRef.children.forEach(function(c){if(c.userData.uid===item.uid)c.visible=chk;});\n' +
'                        if(labelGroupRef)labelGroupRef.children.forEach(function(c){if(c.userData.uid===item.uid)c.visible=chk;});\n' +
'                        var any=Array.from(ul.querySelectorAll("input")).some(function(cb){return cb.checked;});\n' +
'                        mainCb.checked=any;\n' +
'                        if(groupRef)groupRef.visible=true;\n' +
'                        if(labelGroupRef)labelGroupRef.visible=true;\n' +
'                    };\n' +
'                });\n' +
'                wrapper.appendChild(ul);\n' +
'                caret.onclick=function(){ul.classList.toggle("active");caret.classList.toggle("caret-down");};\n' +
'            }\n' +
'            container.appendChild(wrapper);\n' +
'        };\n' +
'        createLayer("target","Целевой объект","#ef4444",groups.target,labelGroups.target,data.target);\n' +
'        createLayer("parcels","Земельные участки","#4ade80",groups.parcels,labelGroups.parcels,data.parcels);\n' +
'        createLayer("intersections","Наложения","#dc2626",groups.intersections,null,data.intersections);\n' +
'        createLayer("buildings","Здания (ОКС)","#2563eb",groups.buildings,labelGroups.buildings,data.buildings);\n' +
'        createLayer("structures","Инженерные сети","#f59e0b",groups.structures,labelGroups.structures,data.structures);\n' +
'        createLayer("zouit","ЗОУИТ","#8b5cf6",groups.zouit,labelGroups.zouit,data.zouits);\n' +
'    };\n' +
'    buildLayersUI();\n' +
'    document.getElementById("t-labels").onchange=function(e){masterLabelsGroup.visible=e.target.checked;};\n' +
'\n' +
'    // ── Двойной клик для центрирования ──\n' +
'    var raycaster=new THREE.Raycaster();var mouse=new THREE.Vector2();\n' +
'    window.addEventListener("dblclick",function(event){\n' +
'        mouse.x=(event.clientX/window.innerWidth)*2-1;\n' +
'        mouse.y=-(event.clientY/window.innerHeight)*2+1;\n' +
'        raycaster.setFromCamera(mouse,camera);\n' +
'        var sprites=[];masterLabelsGroup.traverse(function(child){if(child.isSprite&&child.visible)sprites.push(child);});\n' +
'        var intersects=raycaster.intersectObjects(sprites);\n' +
'        if(intersects.length>0){\n' +
'            var hit=intersects[0].object;\n' +
'            var tp=new THREE.Vector3(hit.position.x,0,hit.position.z);\n' +
'            var cd=new THREE.Vector3().subVectors(camera.position,controls.target).normalize();\n' +
'            controls.target.copy(tp);camera.position.copy(tp).add(cd.multiplyScalar(45));\n' +
'            camera.position.y=Math.max(camera.position.y,10);\n' +
'        }\n' +
'    });\n' +
'\n' +
'    // ── Hover Tooltip (только глобальный режим) ──\n' +
'    var tooltip=document.getElementById("hover-tooltip");\n' +
'    var hoveredObject=null;\n' +
'    window.addEventListener("mousemove",function(event){\n' +
'        if(!IS_GLOBAL_MODE)return;\n' +
'        mouse.x=(event.clientX/window.innerWidth)*2-1;\n' +
'        mouse.y=-(event.clientY/window.innerHeight)*2+1;\n' +
'        raycaster.setFromCamera(mouse,camera);\n' +
'        var sprites2=[];masterLabelsGroup.traverse(function(child){if(child.isSprite&&child.visible)sprites2.push(child);});\n' +
'        var intersects2=raycaster.intersectObjects(sprites2);\n' +
'        if(intersects2.length>0){\n' +
'            var hit=intersects2[0].object;\n' +
'            if(hit.userData.fullInfo){\n' +
'                if(hoveredObject!==hit){\n' +
'                    hoveredObject=hit;\n' +
'                    var info=hit.userData.fullInfo;\n' +
'                    tooltip.innerHTML="<strong>"+info.title+"</strong>"+info.desc+"<span class=\\"area\\">"+info.area+"</span>";\n' +
'                    tooltip.style.opacity="1";\n' +
'                    tooltip.style.transform="translateY(0)";\n' +
'                    document.body.style.cursor="help";\n' +
'                }\n' +
'                tooltip.style.left=(event.clientX+15)+"px";\n' +
'                tooltip.style.top=(event.clientY+15)+"px";\n' +
'            }\n' +
'        } else {\n' +
'            if(hoveredObject){\n' +
'                hoveredObject=null;\n' +
'                tooltip.style.opacity="0";\n' +
'                tooltip.style.transform="translateY(10px)";\n' +
'                document.body.style.cursor="default";\n' +
'            }\n' +
'        }\n' +
'    });\n' +
'\n' +
'    // ── Экспорт HTML ──\n' +
'    var exportBtn=document.getElementById("export-html-btn");\n' +
'    if(exportBtn){\n' +
'        exportBtn.onclick=function(){\n' +
'            var cloneDoc=document.documentElement.cloneNode(true);\n' +
'            cloneDoc.querySelectorAll("canvas").forEach(function(c){c.remove();});\n' +
'            var lc=cloneDoc.querySelector("#layers-container");if(lc)lc.innerHTML="";\n' +
'            var lcb=cloneDoc.querySelector("#t-labels");if(lcb)lcb.checked=true;\n' +
'            var eb=cloneDoc.querySelector("#export-html-btn");if(eb&&eb.parentElement)eb.parentElement.remove();\n' +
'            var tt=cloneDoc.querySelector("#hover-tooltip");if(tt)tt.remove();\n' +
'            var finalHtml="<!DOCTYPE html>\\n<html lang=\\"ru\\">\\n"+cloneDoc.innerHTML+"\\n</html>";\n' +
'            var blob=new Blob([finalHtml],{type:"text/html;charset=utf-8"});\n' +
'            var url=URL.createObjectURL(blob);\n' +
'            var a=document.createElement("a");a.href=url;\n' +
'            a.download="3D_Cadastral_"+new Date().toISOString().slice(0,10)+".html";\n' +
'            document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);\n' +
'        };\n' +
'    }\n' +
'\n' +
'    window.addEventListener("resize",function(){\n' +
'        camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();\n' +
'        renderer.setSize(window.innerWidth,window.innerHeight);\n' +
'    });\n' +
'\n' +
'    // ══════ ANIMATE ══════\n' +
'    function animate(){\n' +
'        requestAnimationFrame(animate);\n' +
'        controls.update();\n' +
'        var time=performance.now()*0.002;\n' +
'        animateables.forEach(function(obj){\n' +
'            obj.position.y=obj.userData.baseY+Math.sin(time+obj.userData.offset)*1.5;\n' +
'        });\n' +
'\n' +
'        if (IS_GLOBAL_MODE) {\n' +
'            // LOD: глобальный режим — скрывать мелкие участки издалека\n' +
'            var camDist=camera.position.distanceTo(controls.target);\n' +
'            masterLabelsGroup.children.forEach(function(group){\n' +
'                group.children.forEach(function(lbl){\n' +
'                    if(lbl.userData.isLodLabel){\n' +
'                        lbl.visible=lbl.userData.parcelSize>(camDist*0.15)||camDist<60;\n' +
'                    }\n' +
'                });\n' +
'            });\n' +
'        } else {\n' +
'            // LOD: стандартный режим — таблички появляются при приближении\n' +
'            masterLabelsGroup.children.forEach(function(group){\n' +
'                group.children.forEach(function(lbl){\n' +
'                    if(!lbl.userData.isStandardLabel)return;\n' +
'                    var distToLabel=camera.position.distanceTo(lbl.position);\n' +
'                    var SHOW_DIST=80;\n' +
'                    var FADE_RANGE=20;\n' +
'                    var targetOpacity=0;\n' +
'                    if(distToLabel<SHOW_DIST){\n' +
'                        targetOpacity=Math.min(1,(SHOW_DIST-distToLabel)/FADE_RANGE);\n' +
'                    }\n' +
'                    var mat=lbl.material;\n' +
'                    if(mat){\n' +
'                        mat.opacity+=(targetOpacity-mat.opacity)*0.08;\n' +
'                        lbl.visible=mat.opacity>0.01;\n' +
'                    }\n' +
'                });\n' +
'            });\n' +
'        }\n' +
'\n' +
'        renderer.render(scene,camera);\n' +
'    }\n' +
'    animate();\n' +
'\n' +
'} catch(err) {\n' +
'    document.body.innerHTML += "<div style=\'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);padding:24px;border-radius:12px;color:#fca5a5;font-size:14px;z-index:1000;max-width:500px;\'><b>Ошибка:</b><br>" + err.message + "<br><small>" + (err.stack||"") + "</small></div>";\n' +
'}\n' +
'<\/script>\n' +
'</body>\n' +
'</html>';\n' +

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