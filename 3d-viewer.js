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
'<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"></script>\n' +
'<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>\n' +
'</head>\n' +
'<body>\n' +
'<button id="ui-toggle-btn"><svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 12 12 17 22 12"></polyline><polyline points="2 17 12 22 22 17"></polyline></svg></button>\n' +
'<button id="home-btn" title="Исходный вид">&#8962;</button>\n' +
'<div id="ui-panel">\n' +
' <button id="close-ui-btn">&times;</button>\n' +
' <h3>Слои сцены</h3>\n' +
' <div id="layers-container"></div>\n' +
' <div class="layer-control" style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px;">\n' +
' <span style="width:20px;display:inline-block;"></span>\n' +
' <input type="checkbox" id="t-labels" checked>\n' +
' <div class="color-box" style="background:#fff;border:2px solid #2563eb;"></div>\n' +
' <label for="t-labels">Подписи объектов</label>\n' +
' </div>\n' +
' <div style="margin-top:15px;border-top:1px solid #e2e8f0;padding-top:15px;">\n' +
' <button id="export-html-btn" class="export-btn">Сохранить в HTML</button>\n' +
' </div>\n' +
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
'// Получить последний сегмент кадастрового номера\n' +
'const getShortCad = (id) => {\n' +
' if (!id) return "";\n' +
' const parts = id.split(":");\n' +
' return ":" + parts[parts.length - 1];\n' +
'};\n' +
'\n' +
'// Короткое название сети\n' +
'const getNetShort = (m) => {\n' +
' if (m.isGas) return "Газ";\n' +
' if (m.isWater) return "Вода";\n' +
' if (m.isHeat) return "Тепло";\n' +
' if (m.isElectric) return "ЛЭП";\n' +
' if (m.isSewer) return "Канал.";\n' +
' return "Сеть";\n' +
'};\n' +
'\n' +
'// Короткое название ЗОУИТ\n' +
'const getZouitShort = (m) => {\n' +
' if (m.isGas) return "ОЗ Газ";\n' +
' if (m.isWater) return "ОЗ Вода";\n' +
' if (m.isHeat) return "ОЗ Тепло";\n' +
' if (m.isElectric) return "ОЗ ЛЭП";\n' +
' if (m.isSewer) return "ОЗ Кан.";\n' +
' return "ЗОУИТ";\n' +
'};\n' +
'\n' +
'const getInfraName = (m) => {\n' +
' if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name;\n' +
' if (m.isGas) return "Газопровод";\n' +
' if (m.isWater) return "Водопровод";\n' +
' if (m.isHeat) return "Теплотрасса";\n' +
' if (m.isElectric) return "ЛЭП";\n' +
' if (m.isSewer) return "Канализация";\n' +
' return "Сооружение";\n' +
'};\n' +
'\n' +
'const getZouitName = (m) => {\n' +
' if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name;\n' +
' if (m.isGas) return "Охр. зона газа";\n' +
' if (m.isWater) return "Охр. зона водопровода";\n' +
' if (m.isHeat) return "Охр. зона теплосети";\n' +
' if (m.isElectric) return "Охр. зона ЛЭП";\n' +
' if (m.isSewer) return "Охр. зона канализации";\n' +
' return "ЗОУИТ";\n' +
'};\n' +
'\n' +
'try {\n' +
' const data = ' + safeDataString + ';\n' +
' const animateables = [];\n' +
'\n' +
' ["target","parcels","intersections","buildings","structures","zouits"].forEach((key) => {\n' +
' if (data[key]) data[key].forEach((item, idx) => { item.uid = key + "_" + idx; });\n' +
' });\n' +
'\n' +
' const INFRA_COLORS = { gas: 0xf59e0b, water: 0x3b82f6, heat: 0xef4444, electric: 0x8b5cf6, sewer: 0x6b7280, def: 0x94a3b8 };\n' +
' const getInfraColor = (m) => {\n' +
' if (m.isGas) return INFRA_COLORS.gas;\n' +
' if (m.isWater) return INFRA_COLORS.water;\n' +
' if (m.isHeat) return INFRA_COLORS.heat;\n' +
' if (m.isElectric) return INFRA_COLORS.electric;\n' +
' if (m.isSewer) return INFRA_COLORS.sewer;\n' +
' return INFRA_COLORS.def;\n' +
' };\n' +
' const getInfraHex = (m) => "#" + new THREE.Color(getInfraColor(m)).getHexString();\n' +
'\n' +
' const PARCEL_PALETTE = [\n' +
' 0x4ade80, 0x34d399, 0xa3e635, 0x2dd4bf, 0x86efac,\n' +
' 0x6ee7b7, 0xbef264, 0x5eead4, 0x67e8f9, 0x38bdf8,\n' +
' 0xa78bfa, 0xfbbf24, 0xf0abfc, 0xfb7185, 0x22d3ee\n' +
' ];\n' +
' const darken = (hex, f = 0.55) => { const c = new THREE.Color(hex); c.r *= f; c.g *= f; c.b *= f; return c; };\n' +
'\n' +
' const plantGeos = {\n' +
' stem: new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8),\n' +
' leaf: new THREE.PlaneGeometry(0.5, 0.25, 4, 4),\n' +
' petal: new THREE.PlaneGeometry(0.35, 0.2, 4, 4),\n' +
' center: new THREE.SphereGeometry(0.18, 12, 12),\n' +
' grass: new THREE.PlaneGeometry(0.08, 0.6, 2, 4)\n' +
' };\n' +
' const plantMats = {\n' +
' stem: new THREE.MeshPhysicalMaterial({ color: 0x16a34a, roughness: 0.8, metalness: 0, clearcoat: 0.2 }),\n' +
' leaf: new THREE.MeshPhysicalMaterial({ color: 0x22c55e, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, clearcoat: 0.3 }),\n' +
' center: new THREE.MeshPhysicalMaterial({ color: 0xfef08a, roughness: 0.4, metalness: 0.1 }),\n' +
' grass: new THREE.MeshPhysicalMaterial({ color: 0x4ade80, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, clearcoat: 0.1 }),\n' +
' petals: [0xf43f5e,0xfbbf24,0xa78bfa,0xfb7185,0xf97316,0x34d399].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, clearcoat: 0.4 }))\n' +
' };\n' +
'\n' +
' const createFlower = (x, z, scale = 1, baseY = 0.2) => {\n' +
' const g = new THREE.Group();\n' +
' const stem = new THREE.Mesh(plantGeos.stem, plantMats.stem);\n' +
' stem.position.y = 0.5 * scale; stem.scale.set(scale, scale, scale); stem.castShadow = true; g.add(stem);\n' +
' [-1,1].forEach((side) => {\n' +
' const leaf = new THREE.Mesh(plantGeos.leaf, plantMats.leaf);\n' +
' leaf.position.set(side * 0.2 * scale, 0.4 * scale, 0); leaf.rotation.z = side * 0.6; leaf.rotation.y = Math.random() * Math.PI;\n' +
' leaf.scale.set(scale, scale, scale); leaf.castShadow = true; g.add(leaf);\n' +
' });\n' +
' const pm = plantMats.petals[Math.floor(Math.random() * plantMats.petals.length)];\n' +
' for (let i = 0; i < 5; i++) {\n' +
' const a = (i / 5) * Math.PI * 2;\n' +
' const p = new THREE.Mesh(plantGeos.petal, pm);\n' +
' p.position.set(Math.cos(a) * 0.28 * scale, 1.02 * scale, Math.sin(a) * 0.28 * scale);\n' +
' p.rotation.x = -Math.PI / 2; p.rotation.z = a; p.scale.set(scale, scale, scale); p.castShadow = true; g.add(p);\n' +
' }\n' +
' const ctr = new THREE.Mesh(plantGeos.center, plantMats.center);\n' +
' ctr.position.y = 1.03 * scale; ctr.scale.set(scale, scale, scale); g.add(ctr);\n' +
' g.position.set(x, baseY, z); g.rotation.y = Math.random() * Math.PI * 2;\n' +
' return g;\n' +
' };\n' +
'\n' +
' const createGrassTuft = (x, z, baseY = 0.2) => {\n' +
' const g = new THREE.Group();\n' +
' for (let i = 0; i < 4; i++) {\n' +
' const b = new THREE.Mesh(plantGeos.grass, plantMats.grass);\n' +
' const hs = 0.9 + Math.random() * 0.8;\n' +
' b.scale.set(1.2, hs, 1.2);\n' +
' b.position.set((Math.random() - 0.5) * 0.3, 0.3 * hs, (Math.random() - 0.5) * 0.3);\n' +
' b.rotation.y = Math.random() * Math.PI; b.rotation.z = (Math.random() - 0.5) * 0.5; b.castShadow = true; g.add(b);\n' +
' }\n' +
' g.position.set(x, baseY, z); return g;\n' +
' };\n' +
'\n' +
' const seedParcelWithFlowers = (polyRing, groupTarget, baseY = 0.2) => {\n' +
' if (!polyRing || polyRing.length < 3) return;\n' +
' let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;\n' +
' polyRing.forEach((p) => { mnX = Math.min(mnX, p.x); mxX = Math.max(mxX, p.x); mnZ = Math.min(mnZ, -p.y); mxZ = Math.max(mxZ, -p.y); });\n' +
' const area = (mxX - mnX) * (mxZ - mnZ);\n' +
' const target = Math.min(25, Math.floor(area / 25));\n' +
' const pip = (x, z, poly) => {\n' +
' let ins = false;\n' +
' for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {\n' +
' const xi = poly[i].x, zi = -poly[i].y, xj = poly[j].x, zj = -poly[j].y;\n' +
' if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins;\n' +
' }\n' +
' return ins;\n' +
' };\n' +
' let placed = 0, att = 0;\n' +
' while (placed < target && att < target * 3) {\n' +
' att++;\n' +
' const x = mnX + Math.random() * (mxX - mnX), z = mnZ + Math.random() * (mxZ - mnZ);\n' +
' if (pip(x, z, polyRing)) {\n' +
' groupTarget.add(Math.random() > 0.65 ? createFlower(x, z, 0.4 + Math.random() * 0.4, baseY) : createGrassTuft(x, z, baseY));\n' +
' placed++;\n' +
' }\n' +
' }\n' +
' };\n' +
'\n' +
' const BUILDING_DICT = {\n' +
' education: { keys: ["школ","детск","сад","учебн","институт","образоват","ясли"], wall: 0xfce4c8, base: 0x8b6f47, roof: 0x5c4033, win: 0x93c5fd, winType: "ribbon", parapet: true },\n' +
' medical: { keys: ["больниц","поликлиник","мед","здрав","госпитал","фап","амбулатор"], wall: 0xf0f4f8, base: 0x8294a8, roof: 0x94a3b8, win: 0x7dd3fc, winType: "standard", parapet: true, addon: "cross" },\n' +
' mkd: { keys: ["многоквартирный","мкд","общежити","квартир"], wall: 0xd6cfc7, base: 0x6b5e54, roof: 0x4a4240, win: 0x7db8f0, winType: "dense", parapet: true },\n' +
' priv: { keys: ["жилой дом","индивидуальн","частн","дачн","садов"], wall: 0xf0dcc8, base: 0x7a6352, roof: 0x8b4513, win: 0x93c5fd, winType: "standard", parapet: false, hippedRoof: true },\n' +
' commercial: { keys: ["магазин","торгов","офис","бизнес","тц","трц","коммерч"], wall: 0xd4e4e0, base: 0x4a635d, roof: 0x2f4f4f, win: 0x60a5fa, winType: "large", parapet: true },\n' +
' industrial: { keys: ["склад","цех","завод","производств","промышлен","гараж","ангар"], wall: 0xb0b8c0, base: 0x505860, roof: 0x3a4048, win: null, winType: "none", parapet: false },\n' +
' def: { wall: 0xe8e0d8, base: 0x7a7068, roof: 0x4a4440, win: 0x93c5fd, winType: "standard", parapet: true }\n' +
' };\n' +
' function getBuildingStyle(rawText) {\n' +
' const keys = Object.keys(BUILDING_DICT);\n' +
' for (const key of keys) {\n' +
' const cfg = BUILDING_DICT[key];\n' +
' if (cfg.keys.some((k) => rawText.includes(k))) return cfg;\n' +
' }\n' +
' return BUILDING_DICT.def;\n' +
' }\n' +
'\n' +
' const windowMaterialCache = {};\n' +
' function getWindowMaterial(style) {\n' +
' if (style.winType === "none" || !style.win) return new THREE.MeshPhysicalMaterial({ color: style.wall, roughness: 0.8, metalness: 0.1, clearcoat: 0.3 });\n' +
' const ck = style.wall + "_" + style.winType;\n' +
' if (windowMaterialCache[ck]) return windowMaterialCache[ck];\n' +
' const cv = document.createElement("canvas"); cv.width = 512; cv.height = 512; const ctx = cv.getContext("2d");\n' +
' ctx.fillStyle = "#" + new THREE.Color(style.wall).getHexString(); ctx.fillRect(0, 0, 512, 512);\n' +
' let wW = 240, wH = 320;\n' +
' if (style.winType === "dense") { wW = 320; wH = 360; } else if (style.winType === "ribbon") { wW = 440; wH = 200; } else if (style.winType === "large") { wW = 360; wH = 400; }\n' +
' const sX = (512 - wW) / 2, sY = (512 - wH) / 2;\n' +
' const grad = ctx.createLinearGradient(sX, sY, sX, sY + wH);\n' +
' grad.addColorStop(0, "#" + new THREE.Color(style.win).getHexString());\n' +
' grad.addColorStop(1, "#" + new THREE.Color(style.win).multiplyScalar(0.8).getHexString());\n' +
' ctx.fillStyle = grad; ctx.fillRect(sX, sY, wW, wH);\n' +
' ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 16; ctx.strokeRect(sX, sY, wW, wH);\n' +
' const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;\n' +
' tex.wrapS = tex.wrapT = THREE.RepeatWrapping;\n' +
' const tsX = style.winType === "dense" ? 3 : (style.winType === "ribbon" ? 5 : 4);\n' +
' tex.repeat.set(1 / tsX, 1 / 3.5);\n' +
' const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, metalness: 0.2, reflectivity: 0.6, clearcoat: 0.8 });\n' +
' windowMaterialCache[ck] = mat; return mat;\n' +
' }\n' +
'\n' +
' const scene = new THREE.Scene();\n' +
' const skyCanvas = document.createElement("canvas"); skyCanvas.width = 1; skyCanvas.height = 512;\n' +
' const skyCtx = skyCanvas.getContext("2d");\n' +
' const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);\n' +
' skyGrad.addColorStop(0, "#1e3a5f"); skyGrad.addColorStop(0.25, "#2563eb");\n' +
' skyGrad.addColorStop(0.5, "#60a5fa"); skyGrad.addColorStop(0.75, "#93c5fd"); skyGrad.addColorStop(1, "#e0f2fe");\n' +
' skyCtx.fillStyle = skyGrad; skyCtx.fillRect(0, 0, 1, 512);\n' +
' const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;\n' +
' scene.background = skyTex;\n' +
'\n' +
' const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);\n' +
' camera.position.set(40, 60, 100);\n' +
' const renderer = new THREE.WebGLRenderer({ antialias: true });\n' +
' renderer.setSize(window.innerWidth, window.innerHeight);\n' +
' renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));\n' +
' renderer.shadowMap.enabled = true;\n' +
' renderer.shadowMap.type = THREE.PCFSoftShadowMap;\n' +
' renderer.physicallyCorrectLights = true;\n' +
' renderer.outputColorSpace = THREE.SRGBColorSpace;\n' +
' document.body.appendChild(renderer.domElement);\n' +
'\n' +
' const controls = new OrbitControls(camera, renderer.domElement);\n' +
' controls.enableDamping = true; controls.dampingFactor = 0.05; controls.maxPolarAngle = Math.PI / 2 - 0.02;\n' +
' controls.target.set(0, 0, 0); controls.zoomSpeed = 2.5;\n' +
' const initialCamPos = new THREE.Vector3(40, 60, 100);\n' +
' const initialTarget = new THREE.Vector3(0, 0, 0);\n' +
' document.getElementById("home-btn").onclick = () => {\n' +
' camera.position.copy(initialCamPos);\n' +
' controls.target.copy(initialTarget);\n' +
' controls.update();\n' +
' };\n' +
'\n' +
' scene.add(new THREE.AmbientLight(0xffffff, 0.65));\n' +
' scene.add(new THREE.HemisphereLight(0xffffff, 0xd1d5db, 0.5));\n' +
' const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.5);\n' +
' sunLight.position.set(100, 150, 50); sunLight.castShadow = true;\n' +
' sunLight.shadow.mapSize.width = 4096; sunLight.shadow.mapSize.height = 4096;\n' +
' sunLight.shadow.camera.top = 150; sunLight.shadow.camera.bottom = -150;\n' +
' sunLight.shadow.camera.left = -150; sunLight.shadow.camera.right = 150;\n' +
' sunLight.shadow.bias = -0.0001; sunLight.shadow.normalBias = 0.05;\n' +
' scene.add(sunLight);\n' +
'\n' +
' function createGroundTexture() {\n' +
' const cv = document.createElement("canvas"); cv.width = 512; cv.height = 512; const ctx = cv.getContext("2d");\n' +
' ctx.fillStyle = "#eef2f7"; ctx.fillRect(0, 0, 512, 512);\n' +
' ctx.fillStyle = "#e4e9f0"; ctx.fillRect(0, 0, 256, 256); ctx.fillRect(256, 256, 256, 256);\n' +
' for (let i = 0; i < 200; i++) {\n' +
' ctx.fillStyle = "rgba(0,0,0," + (Math.random() * 0.03) + ")";\n' +
' ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 8 + 4, Math.random() * 8 + 4);\n' +
' }\n' +
' const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;\n' +
' t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(100, 100);\n' +
' return t;\n' +
' }\n' +
' const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhysicalMaterial({ map: createGroundTexture(), roughness: 0.9, metalness: 0, clearcoat: 0.1 }));\n' +
' ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);\n' +
' scene.add(new THREE.GridHelper(2000, 200, 0x94a3b8, 0xcbd5e1).translateY(0.05));\n' +
'\n' +
' function createCompass() {\n' +
' const cg = new THREE.Group();\n' +
' cg.add(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.5, 64), new THREE.MeshPhysicalMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.5, clearcoat: 0.8 })).translateY(0.25));\n' +
' const aN = new THREE.Mesh(new THREE.ConeGeometry(2, 10, 8).translate(0, 5, 0).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.2 }));\n' +
' aN.position.y = 0.6; aN.rotation.y = Math.PI; cg.add(aN);\n' +
' const aS = new THREE.Mesh(new THREE.ConeGeometry(2, 10, 8).translate(0, 5, 0).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.2 }));\n' +
' aS.position.y = 0.6; cg.add(aS);\n' +
' const addL = (text, rotY, color) => {\n' +
' const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;\n' +
' const ctx = cv.getContext("2d"); ctx.font = "bold 80px sans-serif"; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 64, 64);\n' +
' const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv) }));\n' +
' sp.scale.set(6, 6, 1); sp.position.set(Math.sin(rotY) * 11, 2.5, Math.cos(rotY) * 11); cg.add(sp);\n' +
' };\n' +
' addL("С", Math.PI, "#ef4444"); addL("Ю", 0, "#1e293b"); addL("В", Math.PI / 2, "#1e293b"); addL("З", -Math.PI / 2, "#1e293b");\n' +
' cg.position.set(-60, 0, 60); return cg;\n' +
' }\n' +
' scene.add(createCompass());\n' +
'\n' +
' const groups = { target: new THREE.Group(), parcels: new THREE.Group(), intersections: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group() };\n' +
' const labelGroups = { target: new THREE.Group(), parcels: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group() };\n' +
' const masterLabelsGroup = new THREE.Group();\n' +
' Object.keys(groups).forEach((k) => scene.add(groups[k]));\n' +
' Object.keys(labelGroups).forEach((k) => masterLabelsGroup.add(labelGroups[k]));\n' +
' scene.add(masterLabelsGroup);\n' +
'\n' +
' const createShape = (polyRings) => {\n' +
' const shape = new THREE.Shape();\n' +
' if (!polyRings || !polyRings[0] || polyRings[0].length < 3) return shape;\n' +
' shape.moveTo(polyRings[0][0].x, polyRings[0][0].y);\n' +
' for (let i = 1; i < polyRings[0].length; i++) shape.lineTo(polyRings[0][i].x, polyRings[0][i].y);\n' +
' for (let i = 1; i < polyRings.length; i++) {\n' +
' if (!polyRings[i] || polyRings[i].length < 3) continue;\n' +
' const hole = new THREE.Path(); hole.moveTo(polyRings[i][0].x, polyRings[i][0].y);\n' +
' for (let j = 1; j < polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, polyRings[i][j].y);\n' +
' shape.holes.push(hole);\n' +
' }\n' +
' return shape;\n' +
' };\n' +
'\n' +
' const getCentroid = (pts) => {\n' +
' if (!pts || !pts.length) return { x: 0, z: 0 };\n' +
' let cx = 0, cy = 0;\n' +
' pts.forEach((p) => { cx += p.x; cy += p.y; });\n' +
' return { x: cx / pts.length, z: -cy / pts.length };\n' +
' };\n' +
'\n' +
' class SceneLabel {\n' +
' constructor(options) {\n' +
' this.position = options.position || new THREE.Vector3();\n' +
' this.priority = options.priority || 1; // 3 high, 2 med, 1 low\n' +
' this.category = options.category || "def";\n' +
' this.color = options.color || 0xffffff;\n' +
' this.fullInfo = options.fullInfo || { title: "Объект", desc: "", area: "" };\n' +
' this.meshRef = options.meshRef || null;\n' +
' this.size = options.size || 1; // base screen size factor\n' +
' this.lodLevel = 0; // 0: marker, 1: short, 2: full\n' +
' this.opacity = 0;\n' +
' this.screenRect = new THREE.Box2(); // for collision\n' +
'\n' +
' // Marker sprite (small circle)\n' +
' this.markerSprite = this.createMarkerSprite();\n' +
' this.markerSprite.position.copy(this.position);\n' +
' this.markerSprite.userData.label = this;\n' +
'\n' +
' // Text sprite (short or full)\n' +
' this.textSprite = this.createTextSprite();\n' +
' this.textSprite.position.copy(this.position);\n' +
' this.textSprite.userData.label = this;\n' +
' }\n' +
'\n' +
' createMarkerSprite() {\n' +
' const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;\n' +
' const ctx = cv.getContext("2d");\n' +
' ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2);\n' +
' ctx.fillStyle = "#" + new THREE.Color(this.color).getHexString(); ctx.fill();\n' +
' ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4; ctx.stroke();\n' +
' ctx.fillStyle = "#ffffff"; ctx.font = "bold 40px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";\n' +
' ctx.fillText(this.category[0].toUpperCase(), 32, 32);\n' +
' const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;\n' +
' const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });\n' +
' const sp = new THREE.Sprite(mat);\n' +
' sp.scale.set(1, 1, 1); // will be adjusted\n' +
' return sp;\n' +
' }\n' +
'\n' +
' createTextSprite() {\n' +
' const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;\n' +
' const ctx = cv.getContext("2d");\n' +
' ctx.font = "bold 48px sans-serif"; ctx.fillStyle = "#" + new THREE.Color(this.color).getHexString();\n' +
' ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;\n' +
' ctx.textAlign = "left"; ctx.textBaseline = "middle";\n' +
' ctx.fillText(this.fullInfo.title, 20, 40);\n' +
' ctx.font = "36px sans-serif"; ctx.fillText(this.fullInfo.desc, 20, 80);\n' +
' ctx.font = "32px sans-serif"; ctx.fillStyle = "#059669"; ctx.fillText(this.fullInfo.area, 20, 110);\n' +
' const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;\n' +
' const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });\n' +
' const sp = new THREE.Sprite(mat);\n' +
' sp.scale.set(10, 2.5, 1); // initial, will be adjusted\n' +
' return sp;\n' +
' }\n' +
'\n' +
' updateLod(dist) {\n' +
' const farTh = IS_GLOBAL_MODE ? 150 : 120;\n' +
' const midTh = IS_GLOBAL_MODE ? 60 : 40;\n' +
' if (dist > farTh * this.priority) {\n' +
' this.lodLevel = 0;\n' +
' } else if (dist > midTh * this.priority) {\n' +
' this.lodLevel = 1;\n' +
' } else {\n' +
' this.lodLevel = 2;\n' +
' }\n' +
' this.opacity = THREE.MathUtils.clamp(1 - (dist / (farTh * this.priority)), 0, 1);\n' +
' }\n' +
'\n' +
' updateScale(camera) {\n' +
' const dist = camera.position.distanceTo(this.position);\n' +
' const scaleFactor = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (window.innerHeight / 2);\n' +
' const targetSize = this.size * (this.lodLevel === 0 ? 0.5 : (this.lodLevel === 1 ? 1 : 2));\n' +
' this.markerSprite.scale.set(targetSize * scaleFactor, targetSize * scaleFactor, 1);\n' +
' this.textSprite.scale.set(targetSize * 4 * scaleFactor, targetSize * scaleFactor, 1);\n' +
' }\n' +
'\n' +
' updateVisibility() {\n' +
' this.markerSprite.visible = this.lodLevel >= 0 && this.opacity > 0;\n' +
' this.textSprite.visible = this.lodLevel >= 1 && this.opacity > 0;\n' +
' this.markerSprite.material.opacity = this.opacity;\n' +
' this.textSprite.material.opacity = this.opacity;\n' +
' if (this.lodLevel === 1) {\n' +
' // Update text to short version\n' +
' this.textSprite.material.map.dispose();\n' +
' const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;\n' +
' const ctx = cv.getContext("2d");\n' +
' ctx.font = "bold 48px sans-serif"; ctx.fillStyle = "#" + new THREE.Color(this.color).getHexString();\n' +
' ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;\n' +
' ctx.textAlign = "left"; ctx.textBaseline = "middle";\n' +
' ctx.fillText(getShortCad(this.fullInfo.title), 20, 32);\n' +
' const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;\n' +
' this.textSprite.material.map = tex;\n' +
' }\n' +
' }\n' +
'\n' +
' getScreenRect(renderer, camera) {\n' +
' const vec = new THREE.Vector3();\n' +
' const pos = this.position.clone();\n' +
' pos.project(camera);\n' +
' const w = window.innerWidth / 2, h = window.innerHeight / 2;\n' +
' const x = (pos.x * w) + w, y = -(pos.y * h) + h;\n' +
' const s = this.textSprite.scale.x * 50; // approx pixel size\n' +
' this.screenRect.set(new THREE.Vector2(x - s / 2, y - s / 2), new THREE.Vector2(x + s / 2, y + s / 2));\n' +
' }\n' +
' }\n' +
'\n' +
' const sceneLabels = [];\n' +
'\n' +
' const createStake = (position) => {\n' +
' const g = new THREE.Group();\n' +
' const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5, 16), new THREE.MeshPhysicalMaterial({ color: 0x8b5a2b, roughness: 0.8, metalness: 0.1, clearcoat: 0.2 }));\n' +
' stick.position.y = 2.5; stick.castShadow = true; g.add(stick);\n' +
' const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshPhysicalMaterial({ color: 0xef4444, roughness: 0.2, metalness: 0.5, clearcoat: 0.8 }));\n' +
' cap.position.y = 5.1; g.add(cap);\n' +
' g.position.set(position.x, 0, position.z);\n' +
' return g;\n' +
' };\n' +
'\n' +
' const createBuildingModel = (shape, height, style, isMini = false) => {\n' +
' const b = new THREE.Group();\n' +
' const pts = shape.getPoints(); if (pts.length < 3) return b;\n' +
' const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });\n' +
' const base = new THREE.Mesh(baseGeo, new THREE.MeshPhysicalMaterial({ color: style.base, roughness: 0.7, metalness: 0.2, clearcoat: 0.4 }));\n' +
' base.rotation.x = -Math.PI / 2; base.position.y = 0; b.add(base);\n' +
' const roofMat = new THREE.MeshPhysicalMaterial({ color: style.roof, roughness: 0.6, metalness: 0.3, clearcoat: 0.5 });\n' +
' const wallMat = isMini ? new THREE.MeshPhysicalMaterial({ color: style.wall, roughness: 0.5, metalness: 0.1 }) : getWindowMaterial(style);\n' +
' const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });\n' +
' const walls = new THREE.Mesh(wallGeo, [roofMat, wallMat]);\n' +
' walls.rotation.x = -Math.PI / 2; walls.position.y = 0.5;\n' +
' if (!isMini) { walls.castShadow = true; walls.receiveShadow = true; }\n' +
' b.add(walls);\n' +
' if (style.hippedRoof) {\n' +
' let mx = Infinity, Mx = -Infinity, my = Infinity, My = -Infinity;\n' +
' pts.forEach((p) => { mx = Math.min(mx, p.x); Mx = Math.max(Mx, p.x); my = Math.min(my, p.y); My = Math.max(My, p.y); });\n' +
' const w = Mx - mx, d = My - my, ccx = (mx + Mx) / 2, ccy = (my + My) / 2;\n' +
' const rH = Math.max(3, height * 0.5), rD = Math.sqrt(w * w + d * d) * 0.72;\n' +
' const rGeo = new THREE.ConeGeometry(rD, rH, 8); rGeo.rotateY(Math.PI / 4);\n' +
' const roof = new THREE.Mesh(rGeo, roofMat);\n' +
' roof.position.set(ccx, 0.5 + height + rH / 2, -ccy); roof.scale.set(w / rD, 1, d / rD);\n' +
' if (!isMini) roof.castShadow = true; b.add(roof);\n' +
' } else {\n' +
' if (style.parapet) {\n' +
' const par = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2 }), roofMat);\n' +
' par.rotation.x = -Math.PI / 2; par.position.y = 0.5 + height; b.add(par);\n' +
' }\n' +
' const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }), new THREE.MeshPhysicalMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.5 }));\n' +
' fr.rotation.x = -Math.PI / 2; fr.position.y = 0.5 + height + (style.parapet ? 0.8 : 0); b.add(fr);\n' +
' }\n' +
' if (style.addon === "cross") {\n' +
' const cc = getCentroid(pts); const cGrp = new THREE.Group(); const mat = new THREE.MeshPhysicalMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.3 });\n' +
' cGrp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), mat));\n' +
' cGrp.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1), mat));\n' +
' cGrp.position.set(cc.x, 0.5 + height + 4, cc.z); b.add(cGrp);\n' +
' }\n' +
' return b;\n' +
' };\n' +
'\n' +
' const addToGroups = (gD, lD, item, meshObj, label) => {\n' +
' meshObj.userData.uid = item.uid; gD.add(meshObj);\n' +
' if (label) {\n' +
' lD.add(label.markerSprite);\n' +
' lD.add(label.textSprite);\n' +
' sceneLabels.push(label);\n' +
' }\n' +
' };\n' +
'\n' +
' // Рисование объектов\n' +
' data.target.forEach((t) => {\n' +
' if (IS_GLOBAL_MODE && t.meta.id === "Центр экрана") {\n' +
' const lbl = new SceneLabel({ position: new THREE.Vector3(0, 10, 0), priority: 3, category: "target", color: 0xef4444, fullInfo: { title: "Центр", desc: "", area: "" } });\n' +
' addToGroups(groups.target, labelGroups.target, t, new THREE.Group(), lbl);\n' +
' return;\n' +
' }\n' +
' const color = (t.meta && t.meta.isParcel) ? 0x4ade80 : 0xef4444;\n' +
' const tG = new THREE.Group();\n' +
' let centroid = { x: 0, z: 0 };\n' +
' t.polygons.forEach((poly) => {\n' +
' if (!poly || !poly[0]) return;\n' +
' if (t.type === "Line") {\n' +
' const vp = poly[0].map((p) => new THREE.Vector3(p.x, 1.5, -p.y));\n' +
' if (vp.length > 1) {\n' +
' const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp, false, "chordal"), 128, 0.6, 16, false), new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.5, metalness: 0.2, clearcoat: 0.4 }));\n' +
' tube.castShadow = true; tG.add(tube);\n' +
' }\n' +
' } else {\n' +
' const shape = createShape(poly);\n' +
' if (shape.getPoints().length > 2) {\n' +
' const depth = 0.8;\n' +
' const mat = new THREE.MeshPhysicalMaterial({ color: color, opacity: 0.8, transparent: true, roughness: 0.6, metalness: 0.1 });\n' +
' const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false }), mat);\n' +
' mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0;\n' +
' mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: darken(color, 0.7), linewidth: 2 })));\n' +
' mesh.castShadow = true; tG.add(mesh);\n' +
' seedParcelWithFlowers(poly[0], tG, depth);\n' +
' centroid = getCentroid(poly[0]);\n' +
' }\n' +
' }\n' +
' });\n' +
' const lbl = new SceneLabel({\n' +
' position: new THREE.Vector3(centroid.x, 12, centroid.z),\n' +
' priority: 3,\n' +
' category: "target",\n' +
' color: color,\n' +
' fullInfo: { title: t.meta.name, desc: t.meta.id, area: t.meta.area },\n' +
' meshRef: tG\n' +
' });\n' +
' addToGroups(groups.target, labelGroups.target, t, tG, lbl);\n' +
' });\n' +
'\n' +
' data.parcels.forEach((p, index) => {\n' +
' const pG = new THREE.Group();\n' +
' const yOff = index * 0.015; const depth = 0.2;\n' +
' const pHex = PARCEL_PALETTE[index % PARCEL_PALETTE.length];\n' +
' const pColor = new THREE.Color(pHex);\n' +
' const eColor = darken(pHex);\n' +
' let centroid = { x: 0, z: 0 };\n' +
' let parcelSize = 10;\n' +
' p.polygons.forEach((poly) => {\n' +
' const shape = createShape(poly);\n' +
' if (shape.getPoints().length > 2) {\n' +
' const mat = new THREE.MeshPhysicalMaterial({ color: pColor, roughness: 0.7, metalness: 0.05, clearcoat: 0.2 });\n' +
' const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false }), mat);\n' +
' mesh.rotation.x = -Math.PI / 2; mesh.position.y = yOff;\n' +
' mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: eColor })));\n' +
' mesh.receiveShadow = true; pG.add(mesh);\n' +
' seedParcelWithFlowers(poly[0], pG, yOff + depth);\n' +
' centroid = getCentroid(poly[0]);\n' +
' let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;\n' +
' poly[0].forEach((pt) => {\n' +
' mnX = Math.min(mnX, pt.x); mxX = Math.max(mxX, pt.x);\n' +
' mnZ = Math.min(mnZ, pt.y); mxZ = Math.max(mxZ, pt.y);\n' +
' });\n' +
' parcelSize = Math.max(mxX - mnX, mxZ - mnZ);\n' +
' }\n' +
' });\n' +
' const shortId = getShortCad(p.meta.id);\n' +
' const lbl = new SceneLabel({\n' +
' position: new THREE.Vector3(centroid.x, 3 + yOff, centroid.z),\n' +
' priority: 2,\n' +
' category: "parcel",\n' +
' color: pHex,\n' +
' fullInfo: { title: p.meta.id, desc: p.meta.name, area: p.meta.area },\n' +
' meshRef: pG,\n' +
' size: parcelSize / 10\n' +
' });\n' +
' addToGroups(groups.parcels, labelGroups.parcels, p, pG, lbl);\n' +
' });\n' +
'\n' +
' data.intersections.forEach((iObj) => {\n' +
' const iG = new THREE.Group();\n' +
' let centroid = { x: 0, z: 0 };\n' +
' iObj.polygons.forEach((poly) => {\n' +
' const shape = createShape(poly);\n' +
' if (shape.getPoints().length > 2) {\n' +
' const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.7, depthWrite: false }));\n' +
' mesh.rotation.x = -Math.PI / 2; mesh.position.y = 1.0;\n' +
' mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x991b1b, linewidth: 3 })));\n' +
' iG.add(mesh);\n' +
' centroid = getCentroid(poly[0]);\n' +
' }\n' +
' });\n' +
' const lbl = new SceneLabel({\n' +
' position: new THREE.Vector3(centroid.x, 5, centroid.z),\n' +
' priority: 3,\n' +
' category: "intersect",\n' +
' color: 0xdc2626,\n' +
' fullInfo: { title: "Наложение", desc: "Конфликт границ", area: "" },\n' +
' meshRef: iG\n' +
' });\n' +
' addToGroups(groups.intersections, labelGroups.target, iObj, iG, lbl);\n' +
' });\n' +
'\n' +
' let linkedCount = 0;\n' +
' data.buildings.forEach((b) => {\n' +
' const bG = new THREE.Group();\n' +
' const style = getBuildingStyle(b.meta.rawText);\n' +
' let centroid = { x: 0, z: 0 };\n' +
' let priority = b.meta.height > 15 ? 3 : 2;\n' +
' if (b.meta.isSpatial) {\n' +
' b.polygons.forEach((poly) => {\n' +
' const shape = createShape(poly);\n' +
' if (shape.getPoints().length > 2) {\n' +
' bG.add(createBuildingModel(shape, b.meta.height, style));\n' +
' centroid = getCentroid(poly[0]);\n' +
' }\n' +
' });\n' +
' } else {\n' +
' const radius = 25 + (linkedCount % 2) * 8;\n' +
' const angle = (linkedCount * Math.PI * 2) / 6;\n' +
' const posX = Math.cos(angle) * radius, posZ = Math.sin(angle) * radius;\n' +
' if (b.meta.hasExtendedData) {\n' +
' const ds = new THREE.Shape(); ds.moveTo(-5, -5); ds.lineTo(5, -5); ds.lineTo(5, 5); ds.lineTo(-5, 5);\n' +
' const mm = createBuildingModel(ds, b.meta.height, style, true);\n' +
' mm.scale.set(0.4, 0.4, 0.4); bG.add(mm);\n' +
' const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 15, 16), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 }));\n' +
' laser.position.y = -7.5; bG.add(laser);\n' +
' bG.position.set(posX, 15, posZ); bG.userData = { baseY: 15, offset: linkedCount };\n' +
' animateables.push(bG);\n' +
' centroid = { x: posX, z: posZ };\n' +
' } else {\n' +
' bG.add(createStake({ x: posX, z: posZ }));\n' +
' centroid = { x: posX, z: posZ };\n' +
' }\n' +
' linkedCount++;\n' +
' }\n' +
' const lbl = new SceneLabel({\n' +
' position: new THREE.Vector3(centroid.x, b.meta.height + 5, centroid.z),\n' +
' priority: priority,\n' +
' category: "building",\n' +
' color: 0x2563eb,\n' +
' fullInfo: { title: b.meta.id, desc: b.meta.name, area: b.meta.area },\n' +
' meshRef: bG\n' +
' });\n' +
' addToGroups(groups.buildings, labelGroups.buildings, b, bG, lbl);\n' +
' });\n' +
'\n' +
' data.structures.forEach((s) => {\n' +
' const sG = new THREE.Group();\n' +
' const infraColor = getInfraColor(s.meta);\n' +
' const infraHex = getInfraHex(s.meta);\n' +
' const infraName = getInfraName(s.meta);\n' +
' let centroid = { x: 0, z: 0 };\n' +
' s.polygons.forEach((poly) => {\n' +
' if (!poly || !poly[0] || poly[0].length < 2) return;\n' +
' let midPt = null, drawH = 5;\n' +
' if (s.type === "Line") {\n' +
' if ((s.meta.isGas || s.meta.isHeat) && !s.meta.isUnderground) {\n' +
' drawH = 3;\n' +
' const pts = poly[0].map((pt) => new THREE.Vector3(pt.x, drawH, -pt.y));\n' +
' const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 128, s.meta.diameter, 16, false), new THREE.MeshPhysicalMaterial({ color: infraColor, roughness: 0.3, metalness: 0.4, clearcoat: 0.6 }));\n' +
' pipe.castShadow = true; sG.add(pipe);\n' +
' pts.forEach((pt, i) => {\n' +
' if (i % 2 === 0) {\n' +
' const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, drawH, 16), new THREE.MeshPhysicalMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.3 }));\n' +
' pole.position.set(pt.x, drawH / 2, pt.z); pole.castShadow = true; sG.add(pole);\n' +
' }\n' +
' });\n' +
' midPt = pts[Math.floor(pts.length / 2)];\n' +
' } else if (s.meta.isElectric) {\n' +
' drawH = 10;\n' +
' const pts2 = poly[0].map((pt) => new THREE.Vector3(pt.x, drawH, -pt.y));\n' +
' pts2.forEach((pt, idx) => {\n' +
' const pG2 = new THREE.Group();\n' +
' const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, drawH, 16), new THREE.MeshPhysicalMaterial({ color: 0x5c4033, roughness: 0.6, metalness: 0.2 }));\n' +
' pole.position.y = drawH / 2; pole.castShadow = true; pG2.add(pole);\n' +
' const cross = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), new THREE.MeshPhysicalMaterial({ color: 0x5c4033, roughness: 0.6, metalness: 0.2 }));\n' +
' cross.position.y = drawH - 0.5;\n' +
' if (idx < pts2.length - 1) cross.rotation.y = Math.atan2(pts2[idx + 1].x - pt.x, pts2[idx + 1].z - pt.z);\n' +
' else if (idx > 0) cross.rotation.y = Math.atan2(pt.x - pts2[idx - 1].x, pt.z - pts2[idx - 1].z);\n' +
' pG2.add(cross); pG2.position.set(pt.x, 0, pt.z); sG.add(pG2);\n' +
' });\n' +
' const wireMat = new THREE.LineBasicMaterial({ color: 0x8b5cf6 });\n' +
' for (let wi = 0; wi < pts2.length - 1; wi++) {\n' +
' const p1 = pts2[wi].clone(); p1.y -= 0.5; const p2 = pts2[wi + 1].clone(); p2.y -= 0.5;\n' +
' const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5); mid.y -= 1.5;\n' +
' sG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(p1, mid, p2).getPoints(40)), wireMat));\n' +
' }\n' +
' midPt = pts2[Math.floor(pts2.length / 2)];\n' +
' } else {\n' +
' const yPos = s.meta.isUnderground ? -1 : 1;\n' +
' drawH = s.meta.isUnderground ? 3 : 5;\n' +
' const pts3 = poly[0].map((pt) => new THREE.Vector3(pt.x, yPos, -pt.y));\n' +
' if (pts3.length > 1) {\n' +
' sG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3, false, "chordal"), 100, s.meta.diameter, 24, false), new THREE.MeshPhysicalMaterial({ color: infraColor, roughness: 0.4, metalness: 0.3, clearcoat: 0.5 })));\n' +
' midPt = pts3[Math.floor(pts3.length / 2)];\n' +
' }\n' +
' }\n' +
' } else {\n' +
' const shape = createShape(poly);\n' +
' if (shape.getPoints().length > 2) {\n' +
' const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }), new THREE.MeshPhysicalMaterial({ color: infraColor, roughness: 0.6, metalness: 0.2, clearcoat: 0.3 }));\n' +
' mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0; mesh.castShadow = true; sG.add(mesh);\n' +
' const c = getCentroid(poly[0]);\n' +
' midPt = { x: c.x, y: 5, z: c.z };\n' +
' }\n' +
' }\n' +
' if (midPt) centroid = { x: midPt.x, z: midPt.z };\n' +
' });\n' +
' const lbl = new SceneLabel({\n' +
' position: new THREE.Vector3(centroid.x, drawH + 4, centroid.z),\n' +
' priority: 1,\n' +
' category: "structure",\n' +
' color: infraColor,\n' +
' fullInfo: { title: s.meta.id, desc: infraName, area: s.meta.area || "" },\n' +
' meshRef: sG\n' +
' });\n' +
' addToGroups(groups.structures, labelGroups.structures, s, sG, lbl);\n' +
' });\n' +
'\n' +
' data.zouits.forEach((z) => {\n' +
' const zG = new THREE.Group();\n' +
' const color = getInfraColor(z.meta);\n' +
' const labelText = getZouitName(z.meta);\n' +
' const labelHex = getInfraHex(z.meta);\n' +
' let centroid = { x: 0, z: 0 };\n' +
' z.polygons.forEach((poly) => {\n' +
' if (!poly || !poly[0] || poly[0].length < 2) return;\n' +
' let midPt = null, h = 5;\n' +
' if (z.type === "Line") {\n' +
' h = z.meta.isElectric ? 14 : 8;\n' +
' const pts = poly[0].map((p) => new THREE.Vector3(p.x, z.meta.isElectric ? 5 : 2, -p.y));\n' +
' const zone = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 128, z.meta.isElectric ? 6 : 4, 32, false), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false }));\n' +
' zG.add(zone);\n' +
' midPt = pts[Math.floor(pts.length / 2)];\n' +
' } else {\n' +
' const shape = createShape(poly);\n' +
' if (shape.getPoints().length > 2) {\n' +
' h = z.meta.isElectric ? 15 : (z.meta.isGas ? 4 : (z.meta.isHeat ? 5 : 6));\n' +
' const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15, depthWrite: false }));\n' +
' mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0; zG.add(mesh);\n' +
' mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 })));\n' +
' const c = getCentroid(poly[0]);\n' +
' midPt = { x: c.x, y: h + 3, z: c.z };\n' +
' }\n' +
' }\n' +
' if (midPt) centroid = { x: midPt.x, z: midPt.z };\n' +
' });\n' +
' const lbl = new SceneLabel({\n' +
' position: new THREE.Vector3(centroid.x, h, centroid.z),\n' +
' priority: 2,\n' +
' category: "zouit",\n' +
' color: color,\n' +
' fullInfo: { title: z.meta.id, desc: labelText, area: "" },\n' +
' meshRef: zG\n' +
' });\n' +
' addToGroups(groups.zouit, labelGroups.zouit, z, zG, lbl);\n' +
' });\n' +
'\n' +
' // UI слоёв\n' +
' const buildLayersUI = () => {\n' +
' const container = document.getElementById("layers-container");\n' +
' const createLayer = (id, label, color, groupRef, labelGroupRef, items) => {\n' +
' if (!items || !items.length) return;\n' +
' const wrapper = document.createElement("div"); wrapper.className = "layer-item";\n' +
' const hdr = document.createElement("div"); hdr.className = "layer-header layer-control";\n' +
' const caretHtml = items.length > 1 ? "<span class=\\'caret\\'></span>" : "<span style=\\'width:20px;display:inline-block;\\'></span>";\n' +
' hdr.innerHTML = caretHtml + "<input type=\\'checkbox\\' id=\\'main-" + id + "\\' checked><div class=\\'color-box\\' style=\\'background:" + color + "\\'></div><label for=\\'main-" + id + "\\'>" + label + "</label>";\n' +
' wrapper.appendChild(hdr);\n' +
' const mainCb = hdr.querySelector("input");\n' +
' let ul = null;\n' +
' mainCb.onchange = (e) => {\n' +
' if (groupRef) groupRef.visible = e.target.checked;\n' +
' if (labelGroupRef) labelGroupRef.visible = e.target.checked;\n' +
' if (ul) {\n' +
' ul.querySelectorAll("input[type=\\'checkbox\\']").forEach((cb) => { cb.checked = e.target.checked; });\n' +
' items.forEach((item) => {\n' +
' if (groupRef) groupRef.children.forEach((c) => { if (c.userData.uid === item.uid) c.visible = e.target.checked; });\n' +
' if (labelGroupRef) labelGroupRef.children.forEach((c) => { if (c.userData.uid === item.uid) c.visible = e.target.checked; });\n' +
' });\n' +
' }\n' +
' };\n' +
' const caret = hdr.querySelector(".caret");\n' +
' if (caret && items.length > 1) {\n' +
' ul = document.createElement("ul"); ul.className = "nested";\n' +
' items.forEach((item) => {\n' +
' const li = document.createElement("li"); li.className = "layer-control";\n' +
' const displayName = item.meta.id || item.meta.name || "Объект";\n' +
' li.innerHTML = "<input type=\\'checkbox\\' id=\\'child-" + item.uid + "\\' checked><label title=\\'" + item.meta.id + "\\' for=\\'child-" + item.uid + "\\'>" + displayName + "</label>";\n' +
' ul.appendChild(li);\n' +
' li.querySelector("input").onchange = (e) => {\n' +
' const chk = e.target.checked;\n' +
' if (groupRef) groupRef.children.forEach((c) => { if (c.userData.uid === item.uid) c.visible = chk; });\n' +
' if (labelGroupRef) labelGroupRef.children.forEach((c) => { if (c.userData.uid === item.uid) c.visible = chk; });\n' +
' const any = Array.from(ul.querySelectorAll("input")).some((cb) => cb.checked);\n' +
' mainCb.checked = any;\n' +
' if (groupRef) groupRef.visible = true;\n' +
' if (labelGroupRef) labelGroupRef.visible = true;\n' +
' };\n' +
' });\n' +
' wrapper.appendChild(ul);\n' +
' caret.onclick = () => { ul.classList.toggle("active"); caret.classList.toggle("caret-down"); };\n' +
' }\n' +
' container.appendChild(wrapper);\n' +
' };\n' +
' createLayer("target", "Целевой объект", "#ef4444", groups.target, labelGroups.target, data.target);\n' +
' createLayer("parcels", "Земельные участки", "#4ade80", groups.parcels, labelGroups.parcels, data.parcels);\n' +
' createLayer("intersections", "Наложения", "#dc2626", groups.intersections, labelGroups.target, data.intersections);\n' +
' createLayer("buildings", "Здания (ОКС)", "#2563eb", groups.buildings, labelGroups.buildings, data.buildings);\n' +
' createLayer("structures", "Инженерные сети", "#f59e0b", groups.structures, labelGroups.structures, data.structures);\n' +
' createLayer("zouit", "ЗОУИТ", "#8b5cf6", groups.zouit, labelGroups.zouit, data.zouits);\n' +
' };\n' +
' buildLayersUI();\n' +
' document.getElementById("t-labels").onchange = (e) => { masterLabelsGroup.visible = e.target.checked; };\n' +
'\n' +
' const raycaster = new THREE.Raycaster();\n' +
' const mouse = new THREE.Vector2();\n' +
' const tooltip = document.getElementById("hover-tooltip");\n' +
' let hoveredMesh = null;\n' +
' let hoveredLabel = null;\n' +
'\n' +
' window.addEventListener("dblclick", (event) => {\n' +
' mouse.x = (event.clientX / window.innerWidth) * 2 - 1;\n' +
' mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;\n' +
' raycaster.setFromCamera(mouse, camera);\n' +
' const intersects = raycaster.intersectObjects(scene.children, true);\n' +
' if (intersects.length > 0) {\n' +
' const hit = intersects[0].object;\n' +
' const tp = new THREE.Vector3(hit.position.x, 0, hit.position.z);\n' +
' const cd = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();\n' +
' controls.target.copy(tp); camera.position.copy(tp).add(cd.multiplyScalar(45));\n' +
' camera.position.y = Math.max(camera.position.y, 10);\n' +
' }\n' +
' });\n' +
'\n' +
' window.addEventListener("mousemove", (event) => {\n' +
' mouse.x = (event.clientX / window.innerWidth) * 2 - 1;\n' +
' mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;\n' +
' raycaster.setFromCamera(mouse, camera);\n' +
' const intersects = raycaster.intersectObjects(Object.values(groups).flatMap(g => g.children), true);\n' +
' if (intersects.length > 0) {\n' +
' const hit = intersects[0].object.parent || intersects[0].object;\n' +
' if (hit.userData.uid && hit !== hoveredMesh) {\n' +
' if (hoveredMesh) hoveredMesh.traverse((c) => { if (c.material) c.material.emissive?.set(0x000000); });\n' +
' hoveredMesh = hit;\n' +
' hit.traverse((c) => { if (c.material) c.material.emissive = new THREE.Color(0x2563eb); });\n' +
' const label = sceneLabels.find(l => l.meshRef === hit);\n' +
' if (label) {\n' +
' hoveredLabel = label;\n' +
' const info = label.fullInfo;\n' +
' tooltip.innerHTML = `<strong>${info.title}</strong>${info.desc}<span class="area">${info.area}</span>`;\n' +
' tooltip.style.opacity = "1";\n' +
' tooltip.style.transform = "translateY(0)";\n' +
' document.body.style.cursor = "pointer";\n' +
' }\n' +
' }\n' +
' tooltip.style.left = (event.clientX + 15) + "px";\n' +
' tooltip.style.top = (event.clientY + 15) + "px";\n' +
' } else {\n' +
' if (hoveredMesh) {\n' +
' hoveredMesh.traverse((c) => { if (c.material) c.material.emissive?.set(0x000000); });\n' +
' hoveredMesh = null;\n' +
' }\n' +
' if (hoveredLabel) {\n' +
' hoveredLabel = null;\n' +
' tooltip.style.opacity = "0";\n' +
' tooltip.style.transform = "translateY(10px)";\n' +
' document.body.style.cursor = "default";\n' +
' }\n' +
' }\n' +
' });\n' +
'\n' +
' // Экспорт\n' +
' const exportBtn = document.getElementById("export-html-btn");\n' +
' if (exportBtn) {\n' +
' exportBtn.onclick = () => {\n' +
' const cloneDoc = document.documentElement.cloneNode(true);\n' +
' cloneDoc.querySelectorAll("canvas").forEach((c) => c.remove());\n' +
' const lc = cloneDoc.querySelector("#layers-container"); if (lc) lc.innerHTML = "";\n' +
' const lcb = cloneDoc.querySelector("#t-labels"); if (lcb) lcb.checked = true;\n' +
' const eb = cloneDoc.querySelector("#export-html-btn"); if (eb && eb.parentElement) eb.parentElement.remove();\n' +
' const tt = cloneDoc.querySelector("#hover-tooltip"); if (tt) tt.remove();\n' +
' const finalHtml = "<!DOCTYPE html>\\n<html lang=\\"ru\\">\\n" + cloneDoc.innerHTML + "\\n</html>";\n' +
' const blob = new Blob([finalHtml], { type: "text/html;charset=utf-8" });\n' +
' const url = URL.createObjectURL(blob);\n' +
' const a = document.createElement("a"); a.href = url;\n' +
' a.download = "3D_Cadastral_" + new Date().toISOString().slice(0, 10) + ".html";\n' +
' document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);\n' +
' };\n' +
' }\n' +
'\n' +
' window.addEventListener("resize", () => {\n' +
' camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();\n' +
' renderer.setSize(window.innerWidth, window.innerHeight);\n' +
' });\n' +
'\n' +
' function animate() {\n' +
' requestAnimationFrame(animate);\n' +
' controls.update();\n' +
' const time = performance.now() * 0.002;\n' +
' animateables.forEach((obj) => {\n' +
' obj.position.y = obj.userData.baseY + Math.sin(time + obj.userData.offset) * 1.5;\n' +
' });\n' +
'\n' +
' // Update labels\n' +
' sceneLabels.sort((a, b) => b.priority - a.priority); // High priority first\n' +
' sceneLabels.forEach((label) => {\n' +
' const dist = camera.position.distanceTo(label.position);\n' +
' label.updateLod(dist);\n' +
' label.updateScale(camera);\n' +
' label.updateVisibility();\n' +
' label.getScreenRect(renderer, camera);\n' +
' });\n' +
'\n' +
' // Collision avoidance\n' +
' const visibleLabels = sceneLabels.filter(l => l.opacity > 0);\n' +
' visibleLabels.forEach((label, idx) => {\n' +
' let collision = false;\n' +
' for (let j = 0; j < idx; j++) {\n' +
' if (label.screenRect.intersectsBox(visibleLabels[j].screenRect)) {\n' +
' collision = true;\n' +
' break;\n' +
' }\n' +
' }\n' +
' if (collision) {\n' +
' label.markerSprite.visible = false;\n' +
' label.textSprite.visible = false;\n' +
' }\n' +
' });\n' +
'\n' +
' renderer.render(scene, camera);\n' +
' }\n' +
' animate();\n' +
'} catch (err) {\n' +
' document.body.innerHTML += "<div style=\\'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);padding:24px;border-radius:12px;color:#fca5a5;font-size:14px;z-index:1000;max-width:500px;\\'><b>Ошибка:</b><br>" + err.message + "<br><small>" + (err.stack || "") + "</small></div>";\n' +
'}\n' +
'</script>\n' +
'</body>\n' +
'</html>';
            iframe.srcdoc = srcDocContent;
        } catch (error) {
            if (typeof showNotification === 'function') {
                showNotification("Ошибка генерации 3D сцены: " + error.message, "error");
            }
        }
    }, 100);
};