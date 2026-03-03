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

            // ====================================================================
            // РАДИУС ОБРЕЗКИ И УТИЛИТЫ
            // ====================================================================
            const CLIP_RADIUS = 250; // метров от центра сцены

            // Прореживание: оставляем каждую N-ю точку, сохраняя первую и последнюю
            const simplifyRing = (ring, maxPoints) => {
                if (!ring || ring.length <= maxPoints) return ring;
                const step = Math.ceil(ring.length / maxPoints);
                const result = [];
                for (let i = 0; i < ring.length; i += step) {
                    result.push(ring[i]);
                }
                // Гарантируем что последняя точка есть (замкнутость)
                if (result[result.length - 1] !== ring[ring.length - 1]) {
                    result.push(ring[ring.length - 1]);
                }
                return result;
            };

            // Пересечение отрезка [p1,p2] с окружностью радиуса r (центр в 0,0)
            // Возвращает точку на окружности между inside и outside
            const intersectSegmentCircle = (inside, outside, r) => {
                const dx = outside.x - inside.x;
                const dy = outside.y - inside.y;
                const a = dx * dx + dy * dy;
                if (a < 0.0001) return { x: inside.x, y: inside.y };
                const b = 2 * (inside.x * dx + inside.y * dy);
                const c = inside.x * inside.x + inside.y * inside.y - r * r;
                const disc = b * b - 4 * a * c;
                if (disc < 0) return { x: (inside.x + outside.x) / 2, y: (inside.y + outside.y) / 2 };
                // Берём корень ближайший к inside (t от 0 до 1)
                const sqrtD = Math.sqrt(disc);
                const t1 = (-b - sqrtD) / (2 * a);
                const t2 = (-b + sqrtD) / (2 * a);
                let t = t1;
                if (t < 0 || t > 1) t = t2;
                if (t < 0) t = 0;
                if (t > 1) t = 1;
                return { x: inside.x + dx * t, y: inside.y + dy * t };
            };

            // Обрезка массива точек по кругу
            // Для линейных объектов — возвращает цепочку точек внутри круга
            // Для полигонов — возвращает обрезанный контур
            const clipToRadius = (ring, radius) => {
                if (!ring || ring.length < 2) return ring;
                const rSq = radius * radius;

                // Проверяем есть ли точки внутри
                let hasInside = false, hasOutside = false;
                for (let i = 0; i < ring.length; i++) {
                    const d = ring[i].x * ring[i].x + ring[i].y * ring[i].y;
                    if (d <= rSq) hasInside = true;
                    else hasOutside = true;
                    if (hasInside && hasOutside) break;
                }

                // Все внутри — возвращаем как есть
                if (!hasOutside) return ring;

                // Ни одной точки внутри — проверяем, пересекает ли контур круг
                if (!hasInside) {
                    // Ищем хотя бы одно пересечение ребра с окружностью
                    for (let i = 0; i < ring.length - 1; i++) {
                        const p1 = ring[i], p2 = ring[i + 1];
                        // Быстрая проверка: если обе точки по одну сторону — пропускаем
                        const d1 = Math.sqrt(p1.x * p1.x + p1.y * p1.y);
                        const d2 = Math.sqrt(p2.x * p2.x + p2.y * p2.y);
                        const segLen = Math.sqrt((p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y));
                        // Если сумма расстояний > длины отрезка + 2r, точно не пересекает
                        if (d1 + d2 > segLen + 2 * radius) continue;
                        // Расстояние от центра до отрезка
                        const dx = p2.x - p1.x, dy = p2.y - p1.y;
                        const crossVal = Math.abs(p1.x * dy - p1.y * dx) / segLen;
                        if (crossVal < radius) {
                            // Есть пересечение — но объект далеко, просто показываем ближайшую часть
                            // Находим ближайшую точку контура к центру и берём окрестность
                            return clipNearestPortion(ring, radius);
                        }
                    }
                    return null; // Объект вообще не пересекает зону видимости
                }

                // Смешанный случай: часть точек внутри, часть снаружи
                const result = [];
                for (let i = 0; i < ring.length; i++) {
                    const curr = ring[i];
                    const prev = ring[(i - 1 + ring.length) % ring.length];
                    const currIn = (curr.x * curr.x + curr.y * curr.y) <= rSq;
                    const prevIn = (prev.x * prev.x + prev.y * prev.y) <= rSq;

                    if (currIn) {
                        if (!prevIn) {
                            // Входим в круг — добавляем точку пересечения
                            result.push(intersectSegmentCircle(curr, prev, radius));
                        }
                        result.push(curr);
                    } else {
                        if (prevIn) {
                            // Выходим из круга — добавляем точку пересечения
                            result.push(intersectSegmentCircle(prev, curr, radius));
                        }
                    }
                }

                return result.length >= 2 ? result : null;
            };

            // Для объектов полностью за пределами круга — находим ближайшую часть
            const clipNearestPortion = (ring, radius) => {
                // Находим ближайшую точку к центру
                let minDist = Infinity, minIdx = 0;
                for (let i = 0; i < ring.length; i++) {
                    const d = ring[i].x * ring[i].x + ring[i].y * ring[i].y;
                    if (d < minDist) { minDist = d; minIdx = i; }
                }
                // Берём 20 точек вокруг ближайшей
                const count = Math.min(20, ring.length);
                const startIdx = Math.max(0, minIdx - Math.floor(count / 2));
                const result = [];
                for (let i = 0; i < count && (startIdx + i) < ring.length; i++) {
                    result.push(ring[startIdx + i]);
                }
                return result.length >= 2 ? result : null;
            };

            // ====================================================================
            // АНАЛИЗАТОР СВОЙСТВ
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

                    const localPolys = [];
                    ringsList.forEach(poly => {
                        const rings = [];
                        poly.forEach((ring, ringIdx) => {
                            let pts = ring.map(c => {
                                if (!c || typeof c[0] !== 'number') return { x: 0, y: 0 };
                                return { x: c[0] - originX, y: c[1] - originY };
                            });

                            // Прореживаем длинные кольца
                            pts = simplifyRing(pts, 200);

                            // Обрезаем только внешнее кольцо протяжённых объектов
                            if (doClip && ringIdx === 0) {
                                pts = clipToRadius(pts, CLIP_RADIUS);
                            }

                            if (pts && pts.length >= 2) rings.push(pts);
                        });
                        if (rings.length > 0) localPolys.push(rings);
                    });

                    if (localPolys.length === 0) return;

                    result.push({
                        type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon',
                        polygons: localPolys,
                        meta: meta
                    });
                });
                return result;
            };

            // Целевые объекты
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
                } else if (typeof pseudoFeature.options === 'object' && pseudoFeature.options.address) {
                    tName = pseudoFeature.options.address;
                }

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
                    let pts = ring.map(c => {
                        const pt = to3857(c);
                        return { x: pt[0] - originX, y: pt[1] - originY };
                    });
                    pts = simplifyRing(pts, 200);
                    if (doClip) pts = clipToRadius(pts, CLIP_RADIUS);
                    if (pts && pts.length >= 2) localPoly.push(pts);
                });

                if (localPoly.length === 0) return;

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

            // DEBUG: логируем что получилось
            console.log('[3D] target:', allLocalFeatures.target.length,
                'parcels:', allLocalFeatures.parcels.length,
                'buildings:', allLocalFeatures.buildings.length,
                'structures:', allLocalFeatures.structures.length,
                'zouits:', allLocalFeatures.zouits.length);
            allLocalFeatures.zouits.forEach((z, i) => {
                const totalPts = z.polygons.reduce((s, p) => s + p.reduce((s2, r) => s2 + r.length, 0), 0);
                console.log('[3D] ZOUIT #' + i + ':', z.meta.name, '| pts:', totalPts, '| type:', z.type);
            });

            const safeDataString = JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

            // ====================================================================
            // UI
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
                Object.assign(btn.style, { background: bgColor, border: 'none', color: '#64748b', fontSize: '14px', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '6px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' });
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
                    modal.style.borderRadius = '12px'; iframe.style.display = 'none';
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
            btnContainer.appendChild(minBtn); btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer); modal.appendChild(header);

            // ====================================================================
            // THREE.JS
            // ====================================================================
            const srcDocContent = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
body { margin: 0; overflow: hidden; background: #87CEEB; font-family: "Segoe UI", system-ui, sans-serif; }
#ui-panel { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.95); padding: 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); backdrop-filter: blur(10px); width: 260px; z-index: 100; border: 1px solid #e2e8f0; }
h3 { margin-top: 0; margin-bottom: 15px; color: #1e293b; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; font-weight: 600; }
.layer-control { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; padding: 4px; border-radius: 6px; transition: background 0.2s; }
.layer-control:hover { background: #f1f5f9; }
.layer-control input { margin-right: 12px; cursor: pointer; width: 16px; height: 16px; accent-color: #3b82f6; }
.layer-control label { cursor: pointer; font-size: 13px; color: #334155; font-weight: 500; }
.color-box { width: 14px; height: 14px; display: inline-block; margin-right: 10px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0; }
.info-text { position: absolute; bottom: 20px; right: 20px; background: rgba(255,255,255,0.9); color: #333; padding: 10px 15px; border-radius: 8px; font-size: 12px; font-weight: 600; pointer-events: none; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
.legend-item { display: flex; align-items: center; font-size: 11px; margin-top: 5px; color: #64748b; }
#loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 16px; font-weight: 600; background: rgba(59,130,246,0.9); padding: 15px 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); text-align: center; }
#debug-info { position: absolute; bottom: 60px; left: 20px; background: rgba(0,0,0,0.7); color: #0f0; padding: 8px 12px; border-radius: 6px; font-size: 11px; font-family: monospace; z-index: 200; }
</style>
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>
<script type="importmap">
{"imports": {
  "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
}}
<\/script>
</head>
<body>
<div id="ui-panel">
    <h3>Слои сцены</h3>
    <div class="layer-control"><input type="checkbox" id="t-target" checked><div class="color-box" style="background: #ef4444;"></div><label for="t-target">Целевой объект</label></div>
    <div class="layer-control"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background: #a8d5ba;"></div><label for="t-parcels">Земельные участки</label></div>
    <div class="layer-control"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background: #f1f5f9;"></div><label for="t-buildings">Здания (ОКС)</label></div>
    <div class="layer-control"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background: #fbbf24;"></div><label for="t-structures">Инженерия / Сети</label></div>
    <div class="layer-control"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background: rgba(168,85,247,0.4);"></div><label for="t-zouit">ЗОУИТ</label></div>
    <div class="layer-control" style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px;"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background: #fff; border: 2px solid #3b82f6;"></div><label for="t-labels">Подписи объектов</label></div>
    <div style="margin-top: 15px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px; color: #1e293b;">Связанные объекты (без координат):</div>
        <div class="legend-item"><div class="color-box" style="background: #fcd34d; border-radius: 50%; width: 10px; height: 10px;"></div> Парящие модели</div>
        <div class="legend-item"><div class="color-box" style="background: #8b5cf6; width: 4px; height: 12px; margin-left:3px; margin-right:11px;"></div> Колышки</div>
    </div>
</div>
<div class="info-text">ЛКМ: вращение | ПКМ: панорама | Колесо: масштаб</div>
<div id="loading">Построение 3D...</div>
<div id="debug-info"></div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

try {
    const data = ${safeDataString};
    const animateables = [];
    const dbg = document.getElementById("debug-info");
    let dbgText = "";
    const log = (msg) => { dbgText += msg + "\\n"; dbg.innerText = dbgText; console.log("[3D]", msg); };

    log("Data: T=" + data.target.length + " P=" + data.parcels.length + " B=" + data.buildings.length + " S=" + data.structures.length + " Z=" + data.zouits.length);

    const BUILDING_DICT = {
        education: { keys: ['школ','детск','сад','учебн','институт','образоват','ясли'], wall: 0xfcd34d, base: 0x92400e, roof: 0x1e293b, win: 0x93c5fd, winType: 'ribbon', parapet: true },
        medical: { keys: ['больниц','поликлиник','мед','здрав','госпитал','фап','амбулатор'], wall: 0xffffff, base: 0x94a3b8, roof: 0xcbd5e1, win: 0x7dd3fc, winType: 'standard', parapet: true, addon: 'cross' },
        mkd: { keys: ['многоквартирный','мкд','общежити','квартир'], wall: 0xe2e8f0, base: 0x475569, roof: 0x334155, win: 0x3b82f6, winType: 'dense', parapet: true },
        private: { keys: ['жилой дом','индивидуальн','частн','дачн','садов'], wall: 0xfde68a, base: 0x78350f, roof: 0x7f1d1d, win: 0x60a5fa, winType: 'standard', parapet: false, hippedRoof: true },
        commercial: { keys: ['магазин','торгов','офис','бизнес','тц','трц','коммерч','центр'], wall: 0x6ee7b7, base: 0x064e3b, roof: 0x1f2937, win: 0x1e3a8a, winType: 'large', parapet: true },
        industrial: { keys: ['склад','цех','завод','производств','промышлен','гараж','ангар'], wall: 0x94a3b8, base: 0x334155, roof: 0x475569, win: null, winType: 'none', parapet: false },
        default: { wall: 0xf1f5f9, base: 0x64748b, roof: 0x334155, win: 0x93c5fd, winType: 'minimal', parapet: true }
    };

    function getBuildingStyle(t) {
        for (const [, c] of Object.entries(BUILDING_DICT)) { if (c.keys && c.keys.some(k => t.includes(k))) return c; }
        return BUILDING_DICT.default;
    }

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
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.4));
    const sun = new THREE.DirectionalLight(0xfff8e7, 1.2);
    sun.position.set(100, 150, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
    sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
    sun.shadow.bias = -0.0005; scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    scene.add(Object.assign(new THREE.GridHelper(1000, 200, 0xcbd5e1, 0xe2e8f0), { position: { x: 0, y: 0.05, z: 0 } }));

    // Компас
    const cg = new THREE.Group();
    cg.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(8,8,0.5,32), new THREE.MeshStandardMaterial({color:0x334155})), {position:{x:0,y:0.25,z:0}}));
    const aN = new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2), new THREE.MeshStandardMaterial({color:0xef4444}));
    aN.position.y=0.6; aN.rotation.y=Math.PI; cg.add(aN);
    cg.add(Object.assign(new THREE.Mesh(new THREE.ConeGeometry(2,10,4).translate(0,5,0).rotateX(Math.PI/2), new THREE.MeshStandardMaterial({color:0xffffff})), {position:{x:0,y:0.6,z:0}}));
    const addL=(t,r,c)=>{const cv=document.createElement('canvas');cv.width=128;cv.height=128;const x=cv.getContext('2d');x.font='bold 80px sans-serif';x.fillStyle=c;x.textAlign='center';x.textBaseline='middle';x.fillText(t,64,64);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv)}));s.scale.set(6,6,1);s.position.set(Math.sin(r)*11,2,Math.cos(r)*11);cg.add(s);};
    addL('С',Math.PI,'#ef4444');addL('Ю',0,'#1e293b');addL('В',Math.PI/2,'#1e293b');addL('З',-Math.PI/2,'#1e293b');
    cg.position.set(-60,0,60); scene.add(cg);

    const groups = { target: new THREE.Group(), parcels: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group(), labels: new THREE.Group() };
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
            const hole = new THREE.Path();
            hole.moveTo(polyRings[i][0].x, -polyRings[i][0].y);
            for (let j = 1; j < polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, -polyRings[i][j].y);
            shape.holes.push(hole);
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

    // Осевая линия из полигона (быстрый алгоритм на обрезанных данных)
    const extractCenterline = (pts, yH) => {
        if (!pts || pts.length < 3) return ptsToVec3(pts || [], yH || 0);

        // Ось: две самые далёкие точки (на обрезанных данных максимум ~200 точек)
        let maxD = 0, pA = pts[0], pB = pts[1];
        const len = pts.length;
        // Сэмплируем для ускорения
        const step = Math.max(1, Math.floor(len / 60));
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

        const side1 = [], side2 = [];
        for (let i = 0; i < len; i++) {
            const dx = pts[i].x - pA.x, dy = pts[i].y - pA.y;
            const along = dx * uX + dy * uY;
            const across = dx * nX + dy * nY;
            (across >= 0 ? side1 : side2).push({ along, x: pts[i].x, y: pts[i].y });
        }

        if (!side1.length || !side2.length) return ptsToVec3(pts, yH || 0);

        side1.sort((a, b) => a.along - b.along);
        side2.sort((a, b) => a.along - b.along);

        const aMin = Math.min(side1[0].along, side2[0].along);
        const aMax = Math.max(side1[side1.length - 1].along, side2[side2.length - 1].along);
        const total = aMax - aMin;
        const numSeg = Math.max(2, Math.min(30, Math.round(total / 4)));

        const result = [];
        let i1 = 0, i2 = 0;
        for (let i = 0; i <= numSeg; i++) {
            const t = aMin + (total * i / numSeg);
            while (i1 < side1.length - 1 && side1[i1 + 1].along <= t) i1++;
            while (i2 < side2.length - 1 && side2[i2 + 1].along <= t) i2++;
            const s1 = side1[i1], s2 = side2[i2];
            result.push(new THREE.Vector3((s1.x + s2.x) / 2, yH || 0, -(s1.y + s2.y) / 2));
        }

        // Дедупликация
        const clean = [result[0]];
        for (let i = 1; i < result.length; i++) {
            const p = clean[clean.length - 1], c = result[i];
            if ((c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z) > 0.1) clean.push(c);
        }
        return clean.length >= 2 ? clean : result;
    };

    const getClosestPoint = (ring) => {
        if (!ring || !ring.length) return { x: 0, y: 0 };
        let best = ring[0], bd = best.x * best.x + best.y * best.y;
        for (let i = 1; i < ring.length; i++) { const d = ring[i].x * ring[i].x + ring[i].y * ring[i].y; if (d < bd) { bd = d; best = ring[i]; } }
        return best;
    };

    const createLabel = (name, id, areaText, isSmall) => {
        const canvas = document.createElement("canvas");
        const ctxM = canvas.getContext("2d");
        ctxM.font = "bold 56px sans-serif";
        const tw = ctxM.measureText(name || "Объект").width;
        canvas.width = isSmall ? 512 : Math.max(800, tw + 150);
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath(); ctx.roundRect(10, 10, canvas.width - 20, 236, 15); ctx.fill();
        ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 4; ctx.stroke();
        ctx.textAlign = "center";
        const cx = canvas.width / 2;
        if (isSmall) {
            ctx.fillStyle = "#1e293b"; ctx.font = "bold 36px sans-serif"; ctx.fillText(name, cx, 80, 480);
            ctx.fillStyle = "#3b82f6"; ctx.font = "bold 28px monospace"; ctx.fillText(id, cx, 140, 480);
            if (areaText) { ctx.fillStyle = "#ef4444"; ctx.font = "bold 26px sans-serif"; ctx.fillText(areaText, cx, 200, 480); }
        } else {
            ctx.fillStyle = "#1e293b"; ctx.font = "bold 48px sans-serif"; ctx.fillText(name || "Объект", cx, 90, canvas.width - 40);
            ctx.fillStyle = "#3b82f6"; ctx.font = "bold 40px monospace"; ctx.fillText(id || "", cx, 160, canvas.width - 40);
            if (areaText) { ctx.fillStyle = "#64748b"; ctx.font = "34px sans-serif"; ctx.fillText(areaText, cx, 215, canvas.width - 40); }
        }
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        sprite.scale.set((canvas.width / 1024) * 20, 5, 1);
        return sprite;
    };

    const createStake = (id, pos) => {
        const g = new THREE.Group();
        g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x8b5a2b })), { position: { x: 0, y: 2, z: 0 }, castShadow: true }));
        g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0xf8fafc })), { position: { x: 0, y: 3.5, z: 0.1 }, castShadow: true }));
        const lbl = createLabel("ОКС", id, "Нет координат", true); lbl.position.set(0, 3.5, 0.25); lbl.scale.set(3.8, 1.9, 1); g.add(lbl);
        g.position.set(pos.x, 0, pos.z); return g;
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
            r.position.set((pts[0].x + pts[1].x) / 2, height + 2, -(pts[1].y + pts[2].y) / 2); r.rotation.y = Math.PI / 4;
            if (!mini) r.castShadow = true; b.add(r);
        } else {
            if (style.parapet) { const p = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2 }), new THREE.MeshStandardMaterial({ color: style.roof })); p.rotation.x = Math.PI / 2; p.position.y = height + 0.8; b.add(p); }
            const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
            fr.rotation.x = Math.PI / 2; fr.position.y = height + (style.parapet ? 0.9 : 0.6); b.add(fr);
        }

        if (style.addon === 'cross') {
            const cr = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            cr.add(new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), m)); cr.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1), m));
            cr.position.set((pts[0].x + pts[2].x) / 2, height + 4, -(pts[0].y + pts[2].y) / 2); b.add(cr);
        }

        if (style.winType !== 'none' && style.win) {
            let wW = 1.5, wH = 1.8, wS = 1.5;
            if (style.winType === 'dense') { wW = 1.2; wS = 0.8; } if (style.winType === 'ribbon') { wW = 4; wS = 0.5; } if (style.winType === 'large') { wW = 3; wH = 2.5; wS = 1; }
            const wMat = new THREE.MeshStandardMaterial({ color: style.win, roughness: 0.1, metalness: 0.8 });
            const wGeo = new THREE.PlaneGeometry(wW, wH);
            const floors = Math.max(1, Math.floor(height / 3.5));
            for (let i = 0; i < pts.length - 1; i++) {
                const p1 = new THREE.Vector3(pts[i].x, 0, -pts[i].y), p2 = new THREE.Vector3(pts[i + 1].x, 0, -pts[i + 1].y);
                const dir = new THREE.Vector3().subVectors(p2, p1); const len = dir.length(); dir.normalize();
                const norm = new THREE.Vector3(-dir.z, 0, dir.x);
                const cnt = Math.floor(len / (wW + wS));
                if (cnt > 0) {
                    const pad = (len - (cnt * wW + (cnt - 1) * wS)) / 2;
                    for (let f = 0; f < floors; f++) { const yP = 1.1 + f * 3.5 + 1.75; for (let w = 0; w < cnt; w++) { const off = pad + wW / 2 + w * (wW + wS); const wx = p1.x + dir.x * off, wz = p1.z + dir.z * off; const m = new THREE.Mesh(wGeo, wMat); m.position.set(wx + norm.x * 0.05, yP, wz + norm.z * 0.05); m.lookAt(new THREE.Vector3(wx + norm.x * 2, yP, wz + norm.z * 2)); b.add(m); } }
                }
            }
        }
        return b;
    };

    // ====================================================================
    // ПОСТРОЕНИЕ
    // ====================================================================

    // 1. ЦЕЛЕВОЙ
    data.target.forEach(t => {
        log("Target: " + t.meta.name + " polys=" + t.polygons.length + " type=" + t.type + " gas=" + t.meta.isGas + " elec=" + t.meta.isElectric);
        if (t.meta.isGas || t.meta.isElectric) {
            const isPow = t.meta.isElectric, color = isPow ? 0xa855f7 : 0xfbbf24, h = isPow ? 5 : 2, rad = isPow ? 6 : 4;
            t.polygons.forEach(poly => {
                if (!poly || !poly[0] || poly[0].length < 2) return;
                const pts3D = t.type === "Line" ? ptsToVec3(poly[0], h) : extractCenterline(poly[0], h);
                if (pts3D.length > 1) groups.target.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3D), 64, rad, 16, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false })));
            });
            if (t.polygons[0] && t.polygons[0][0]) { const cp = getClosestPoint(t.polygons[0][0]); const lbl = createLabel(t.meta.name, t.meta.id, ""); lbl.position.set(cp.x, isPow ? 14 : 10, -cp.y); groups.labels.add(lbl); }
        } else {
            const color = t.meta.isParcel ? 0x22c55e : 0xef4444;
            t.polygons.forEach(poly => {
                if (!poly || !poly[0]) return;
                if (t.type === "Line") { const vp = ptsToVec3(poly[0], 1.5); if (vp.length > 1) { const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp, false, "chordal"), 64, 0.6, 8, false), new THREE.MeshStandardMaterial({ color })); tube.castShadow = true; groups.target.add(tube); } }
                else { const shape = createShape(poly); if (shape.getPoints().length > 2) { const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color, opacity: 0.8, transparent: true })); mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4; mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x7f1d1d }))); mesh.castShadow = true; groups.target.add(mesh); } }
            });
            if (t.polygons[0] && t.polygons[0][0]) { const c = getCentroid(t.polygons[0][0]); const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area); lbl.position.set(c.x, 12, c.z); groups.labels.add(lbl); }
        }
    });

    // 2. УЧАСТКИ
    data.parcels.forEach(p => {
        p.polygons.forEach(poly => {
            const shape = createShape(poly);
            if (shape.getPoints().length > 2) { const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xa8d5ba, roughness: 0.8 })); mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.1; mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x166534 }))); mesh.receiveShadow = true; groups.parcels.add(mesh); }
            if (poly[0]) { const c = getCentroid(poly[0]); const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area); lbl.position.set(c.x, 6, c.z); groups.labels.add(lbl); }
        });
    });

    // 3. ЗДАНИЯ
    let lnkCnt = 0;
    data.buildings.forEach(b => {
        const style = getBuildingStyle(b.meta.rawText);
        if (b.meta.isSpatial) {
            b.polygons.forEach(poly => { const shape = createShape(poly); if (shape.getPoints().length > 2) { groups.buildings.add(createBuilding(shape, b.meta.height, style)); if (poly[0]) { const c = getCentroid(poly[0]); const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area); lbl.position.set(c.x, b.meta.height + 8, c.z); groups.labels.add(lbl); } } });
        } else {
            const r = 25 + (lnkCnt % 2) * 8, a = (lnkCnt * Math.PI * 2) / 6, px = Math.cos(a) * r, pz = Math.sin(a) * r;
            if (b.meta.hasExtendedData) {
                const fg = new THREE.Group(); const ds = new THREE.Shape(); ds.moveTo(-5, -5); ds.lineTo(5, -5); ds.lineTo(5, 5); ds.lineTo(-5, 5);
                const mm = createBuilding(ds, b.meta.height, style, true); mm.scale.set(0.4, 0.4, 0.4); fg.add(mm);
                fg.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 15), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 })), { position: { x: 0, y: -7.5, z: 0 } }));
                const lbl = createLabel(b.meta.name, b.meta.id, "Парящая", true); lbl.position.y = b.meta.height * 0.4 + 6; fg.add(lbl);
                fg.position.set(px, 15, pz); fg.userData = { baseY: 15, offset: lnkCnt }; animateables.push(fg); groups.buildings.add(fg);
            } else { groups.buildings.add(createStake(b.meta.id, { x: px, z: pz })); }
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
                const pH = 3; pts3D.forEach(p => p.y = pH);
                groups.structures.add(Object.assign(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3D), 64, s.meta.diameter, 8, false), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 })), { castShadow: true }));
                for (let i = 0; i < pts3D.length; i += 2) { const pt = pts3D[i]; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, pH), new THREE.MeshStandardMaterial({ color: 0x94a3b8 })); pole.position.set(pt.x, pH / 2, pt.z); pole.castShadow = true; groups.structures.add(pole); }
                const mp = pts3D[Math.floor(pts3D.length / 2)]; const lbl = createLabel("Газопровод", s.meta.id, "Ø" + s.meta.diameter + "м"); lbl.position.set(mp.x, pH + 4, mp.z); groups.labels.add(lbl);
            } else if (s.meta.isElectric) {
                const pH = 10; pts3D.forEach(p => p.y = pH);
                pts3D.forEach((pt, idx) => {
                    const pg = new THREE.Group();
                    pg.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, pH), new THREE.MeshStandardMaterial({ color: 0x5c4033 })), { position: { x: 0, y: pH / 2, z: 0 }, castShadow: true }));
                    const cr = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x5c4033 })); cr.position.y = pH - 0.5;
                    if (idx < pts3D.length - 1) cr.rotation.y = Math.atan2(pts3D[idx + 1].x - pt.x, pts3D[idx + 1].z - pt.z);
                    pg.add(cr); pg.position.set(pt.x, 0, pt.z); groups.structures.add(pg);
                });
                const wm = new THREE.LineBasicMaterial({ color: 0x111827 });
                for (let i = 0; i < pts3D.length - 1; i++) { const p1 = pts3D[i].clone(); p1.y -= 0.5; const p2 = pts3D[i + 1].clone(); p2.y -= 0.5; const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5); mid.y -= 1.5; groups.structures.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(p1, mid, p2).getPoints(20)), wm)); }
                const mp = pts3D[Math.floor(pts3D.length / 2)]; const lbl = createLabel("ЛЭП", s.meta.id, ""); lbl.position.set(mp.x, pH + 5, mp.z); groups.labels.add(lbl);
            } else {
                const yO = s.meta.isUnderground ? -1 : 1; pts3D.forEach(p => p.y = yO);
                groups.structures.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3D), 50, s.meta.diameter, 12, false), new THREE.MeshStandardMaterial({ color: 0x3b82f6 })));
            }
        });
    });

    // 5. ЗОУИТ
    log("Processing " + data.zouits.length + " ZOUITs...");
    data.zouits.forEach((z, zi) => {
        const isGas = z.meta.isGas, isPow = z.meta.isElectric;
        const color = isGas ? 0xfbbf24 : (isPow ? 0xa855f7 : 0x3b82f6);
        log("ZOUIT #" + zi + ": " + z.meta.name + " type=" + z.type + " gas=" + isGas + " pow=" + isPow + " polys=" + z.polygons.length);

        z.polygons.forEach((poly, pi) => {
            if (!poly || !poly[0] || poly[0].length < 2) { log("  poly " + pi + ": SKIP (empty)"); return; }
            log("  poly " + pi + ": " + poly[0].length + " pts, type=" + z.type);

            if (isGas || isPow) {
                const h = isPow ? 5 : 2, rad = isPow ? 6 : 4;
                let pts3D;
                if (z.type === "Line") {
                    pts3D = ptsToVec3(poly[0], h);
                } else {
                    pts3D = extractCenterline(poly[0], h);
                }
                log("  centerline pts: " + pts3D.length);

                if (pts3D.length > 1) {
                    const curve = new THREE.CatmullRomCurve3(pts3D);
                    // Туннель ЗОУИТ
                    groups.zouit.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, rad, 16, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false })));
                    // Труба/провод внутри
                    if (isGas) groups.zouit.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.4, 8, false), new THREE.MeshStandardMaterial({ color: 0xfbbf24 })));
                    else groups.zouit.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.1, 4, false), new THREE.MeshStandardMaterial({ color: 0x111827 })));
                    log("  -> tube added!");
                }
                const cp = getClosestPoint(poly[0]);
                const lbl = createLabel(z.meta.name, z.meta.id, ""); lbl.position.set(cp.x, isPow ? 14 : 8, -cp.y); groups.labels.add(lbl);
            } else {
                // Площадной ЗОУИТ
                const shape = createShape(poly);
                const shPts = shape.getPoints();
                log("  shape pts: " + shPts.length);
                if (shPts.length > 2) {
                    const h = 6;
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, depthWrite: false }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = h / 2;
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })));
                    groups.zouit.add(mesh);
                    log("  -> area mesh added!");
                    const cp = getClosestPoint(poly[0]); const lbl = createLabel(z.meta.name, z.meta.id, ""); lbl.position.set(cp.x, h + 3, -cp.y); groups.labels.add(lbl);
                }
            }
        });
    });

    log("Scene built. ZOUIT children: " + groups.zouit.children.length);

    // СЛОИ
    document.getElementById("t-target").onchange = e => groups.target.visible = e.target.checked;
    document.getElementById("t-parcels").onchange = e => groups.parcels.visible = e.target.checked;
    document.getElementById("t-buildings").onchange = e => groups.buildings.visible = e.target.checked;
    document.getElementById("t-structures").onchange = e => groups.structures.visible = e.target.checked;
    document.getElementById("t-zouit").onchange = e => groups.zouit.visible = e.target.checked;
    document.getElementById("t-labels").onchange = e => groups.labels.visible = e.target.checked;

    window.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    document.getElementById("loading").style.display = "none";

    // Скрываем дебаг через 10 сек
    setTimeout(() => { dbg.style.display = "none"; }, 10000);

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        const time = performance.now() * 0.002;
        animateables.forEach(o => { o.position.y = o.userData.baseY + Math.sin(time + o.userData.offset) * 1.5; });
        renderer.render(scene, camera);
    }
    animate();

} catch (err) {
    document.getElementById("loading").innerHTML = "<div style='color:#fca5a5;font-size:14px;'><b>Ошибка:</b><br>" + err.message + "<br><pre>" + err.stack + "</pre></div>";
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