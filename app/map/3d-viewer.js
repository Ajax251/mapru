
window.open3DVisualization = function () {
    setTimeout(() => {
        try {
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels: [], buildings: [], structures: [], zouits: [], intersections: [] };

            // Чтение сохраненных настроек (исправлена проверка на NaN для сохранения 0% прозрачности)
            const savedTheme = localStorage.getItem('3d_viewer_theme') || 'light';
            const savedGroundColor = localStorage.getItem('3d_ground_color') || '#e2e8f0';
            const savedGroundTex = 'gsat';
            const rawOpacity = parseFloat(localStorage.getItem('3d_parcel_opacity'));
            const savedParcelOpacity = isNaN(rawOpacity) ? 0.45 : rawOpacity;

            // Читаем смещения для Google/KML и определяем, активен ли слой Google/OSM
            const kmlOffsetX = parseFloat(localStorage.getItem('kmlMapOffsetX')) || 0;
            const kmlOffsetY = parseFloat(localStorage.getItem('kmlMapOffsetY')) || 0;

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

                let trueLat = yandexCoord[0];
                let trueLon = yandexCoord[1];

                const mapMode2D = localStorage.getItem('mapMode') || 'map';
                const isGoogle2D = ['google-sat', 'google-hyb', 'osm'].includes(mapMode2D);

                if (isGoogle2D) {
                    trueLat -= (kmlOffsetY * 0.000008983);
                    trueLon -= (kmlOffsetX * 0.000008983);
                }

                trueLat += ((window.mapOffsetY || 0) * 0.000008983);
                trueLon += ((window.mapOffsetX || 0) * 0.000008983);

                return window.proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            };

            const hasAnyFeatures = (window.quickReportTargetObjects && window.quickReportTargetObjects.length > 0) ||
                (window.parcelFeaturesData && window.parcelFeaturesData.length > 0) ||
                (window.buildingFeaturesData && window.buildingFeaturesData.length > 0) ||
                (window.structureFeaturesData && window.structureFeaturesData.length > 0) ||
                (window.zouitFeaturesData && window.zouitFeaturesData.length > 0);

            if (!hasAnyFeatures) {
                if (typeof showNotification === 'function') showNotification("Нет объектов для 3D. Выберите объекты на карте.", "warning");
                return;
            }

            let originX, originY;
            if (window.map3DCenter && typeof window.map3DCenter[0] === 'number') {
                const ptCenter = to3857(window.map3DCenter);
                originX = ptCenter[0];
                originY = ptCenter[1];
            } else {
                (window.quickReportTargetObjects || []).forEach(obj => {
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
                originX = (minX + maxX) / 2;
                originY = (minY + maxY) / 2;
            }

            const mapLatRad = Math.atan(Math.sinh(originY / 6378137.0));
            const mercatorScale = 1 / Math.cos(mapLatRad);

            const analyzeFeature = (f, category) => {
                const p = f.properties || {};
                const o = p.options || {};
                const descr = p.descr || '';
                const purpose = o.purpose || o.params_purpose || '';

                let rawName = o.building_name || o.name_by_doc || o.params_name || o.name || o.type_zone || '';
                if (!rawName || rawName === 'Сооружение' || rawName === 'Здание') {
                    rawName = purpose || descr;
                }
                let name = window.isGlobalMapMode ? cleanAddress(rawName) : rawName;
                const text = (descr + ' ' + name + ' ' + purpose).toLowerCase();

                let meta = {
                    id: o.cad_num || o.cad_number || o.reg_numb_border || descr || 'Без номера',
                    name: name || 'Объект',
                    address: cleanAddress(o.readable_address || o.address_readable_address || ''),
                    rawText: text,
                    hasExtendedData: !!(purpose || name || o.build_record_area || o.year_built || o.floors),
                    isParcel: false,
                    isSpatial: p._isSpatial !== false,
                    isProcedural: false,
                    floors: o.floors || '',
                    year: o.year_built || o.params_year_built || '',
                    material: o.materials || '',
                    extent: o.params_extension || ''
                };

                let rawAreaVal = o.build_record_area || o.area || o.specified_area || o.declared_area || o.land_record_area || '';
                meta.rawArea = parseFloat(String(rawAreaVal).replace(/[\s\xA0]/g, '').replace(',', '.'));

                if (meta.rawArea && !isNaN(meta.rawArea)) {
                    meta.area = meta.rawArea.toLocaleString('ru-RU') + ' м²';
                } else if (o.content_restrict_encumbrances) {
                    meta.area = "Ограничение";
                } else {
                    meta.area = '';
                }

                if (category === 'building') {
                    let defaultFloors = 1;
                    if (text.includes('многоквартир') || text.includes('мкд')) defaultFloors = 9;
                    else if (text.includes('жило') || text.includes('дом') || text.includes('ижс')) defaultFloors = 2;
                    else if (text.includes('школ') || text.includes('больниц') || text.includes('административ') || text.includes('тц')) defaultFloors = 3;
                    meta.floorsNumeric = parseInt(o.floors) || defaultFloors;
                    meta.height = (meta.floorsNumeric * 3.4) * mercatorScale;
                } else if (category === 'structure' || category === 'zouit') {
                    meta.isSewer = text.includes('канализ') || text.includes('канал') || text.includes('сток') || text.includes('коллектор');
                    meta.isGas = text.includes('газ');
                    meta.isHeat = text.includes('тепло') || text.includes('пар');
                    meta.isWater = (text.includes('водо') || text.includes('вод') || text.includes('скважин')) && !meta.isSewer;
                    meta.isElectric = text.includes('электро') || text.includes('электр') || text.includes('лэп') || text.includes('лп ') || text.includes('вл ') || text.includes('вкл ') || text.includes('квл') || text.includes('воздушн') || text.includes('кабельн') || text.includes('тп') || text.includes('ктп');
                    meta.isUnderground = text.includes('подзем') || text.includes('кабельн') || (!text.includes('надзем') && !text.includes('воздушн') && (meta.isWater || meta.isSewer));
                    meta.diameter = parseFloat(o.diameter) || (meta.isGas ? 0.32 : (meta.isHeat ? 0.42 : (meta.isSewer ? 0.5 : 0.35)));
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
                    } else if (f.geometry.type === 'Point') {
                        ringsList = [[[f.geometry.coordinates]]];
                    }

                    const localPolys = ringsList.map(poly => poly.map(ring => ring.map(c => {
                        if (!c || typeof c[0] !== 'number') return { x: 0, y: 0 };
                        return { x: c[0] - originX, y: c[1] - originY };
                    })));

                    let geomType = f.geometry.type.includes('Line') ? 'Line' : 'Polygon';
                    if (f.geometry.type === 'Point') geomType = 'Point';

                    if (geomType === 'Line') {
                        let len3857 = 0;
                        const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
                        lines.forEach(line => {
                            for (let i = 0; i < line.length - 1; i++) {
                                let dx = line[i + 1][0] - line[i][0];
                                let dy = line[i + 1][1] - line[i][1];
                                len3857 += Math.sqrt(dx * dx + dy * dy);
                            }
                        });
                        meta.length = len3857 / mercatorScale;
                    }

                    result.push({ type: geomType, polygons: localPolys, meta: meta });
                });
                return result;
            };

            (window.quickReportTargetObjects || []).forEach(obj => {
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

                let egrnArea = '';
                let fData = obj.properties.get('featureData');
                if (fData && fData.properties && fData.properties.options) {
                    let opts = fData.properties.options;
                    let rawAreaVal = opts.build_record_area || opts.area || opts.specified_area || opts.declared_area || opts.land_record_area || '';
                    if (rawAreaVal) {
                        let parsed = parseFloat(String(rawAreaVal).replace(/[\s\xA0]/g, '').replace(',', '.'));
                        if (!isNaN(parsed)) egrnArea = parsed.toLocaleString('ru-RU');
                    }
                }

                let calcArea = 0;
                let calcLength = 0;
                try {
                    if (typeof calculatePreciseGeometry === 'function') {
                        const stats = calculatePreciseGeometry(obj);
                        calcArea = stats.area;
                        calcLength = stats.perimeter;
                    }
                } catch (e) {
                    console.error("Ошибка расчета геометрии в МСК для 3D:", e);
                }

                let areaStr = '';
                if (type.includes('Line')) {
                    areaStr = `Протяженность: ${calcLength.toFixed(2)} м`;
                } else {
                    if (egrnArea) {
                        areaStr = `ЕГРН: ${egrnArea} м²`;
                        if (calcArea > 0) areaStr += `<br>По координатам: ${Math.round(calcArea).toLocaleString('ru-RU')} м²`;
                    } else if (calcArea > 0) {
                        areaStr = `Площадь (расчет): ${Math.round(calcArea).toLocaleString('ru-RU')} м²`;
                    }
                }

                allLocalFeatures.target.push({
                    type: (type === 'Polygon' || type === 'MultiPolygon') ? 'Polygon' : 'Line',
                    polygons: [localPoly],
                    meta: { isParcel: isTargetParcel, name: titleName, id: titleName, isSpatial: true, area: areaStr }
                });
            });

            allLocalFeatures.parcels = processFeatureArray(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFeatureArray(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFeatureArray(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFeatureArray(window.zouitFeaturesData, 'zouit');

            const isPointInPolyEditor = function (pt, poly) {
                let inside = false;
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    let xi = poly[i].x, yi = poly[i].y;
                    let xj = poly[j].x, yj = poly[j].y;
                    let intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
            };

            const getBBoxCenter = function (pts) {
                let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
                pts.forEach(p => { mx = Math.min(mx, p.x); Mx = Math.max(Mx, p.x); my = Math.min(my, p.y); My = Math.max(My, p.y); });
                return { x: (mx + Mx) / 2, y: (my + My) / 2 };
            };

            let parcelMap = new Map();
            allLocalFeatures.parcels.forEach(p => {
                if (p.meta && p.meta.id) parcelMap.set(p.meta.id, p);
            });

            let proceduralByParcel = new Map();

            allLocalFeatures.buildings.forEach(b => {
                if ((b.type === 'Point' || !b.meta.isSpatial) && b.meta.rawArea) {
                    let footprintArea = b.meta.rawArea / (b.meta.floorsNumeric || 1);
                    if (isNaN(footprintArea) || footprintArea <= 5) return;

                    let pt = (b.type === 'Point' && b.polygons[0]?.[0]?.[0]) ? b.polygons[0][0][0] : null;
                    let parentCn = null;
                    let parentPoly = null;
                    let targetObj = allLocalFeatures.target.length > 0 ? allLocalFeatures.target[0] : null;

                    if (pt && targetObj && targetObj.type === 'Polygon' && targetObj.polygons[0]?.[0]) {
                        if (isPointInPolyEditor(pt, targetObj.polygons[0][0])) {
                            parentCn = targetObj.meta.id || 'target';
                            parentPoly = targetObj.polygons[0][0];
                        }
                    }

                    if (!parentPoly && pt) {
                        for (let parcel of allLocalFeatures.parcels) {
                            if (parcel.polygons[0]?.[0] && isPointInPolyEditor(pt, parcel.polygons[0][0])) {
                                parentCn = parcel.meta.id;
                                parentPoly = parcel.polygons[0][0];
                                break;
                            }
                        }
                    }

                    if (!parentPoly && targetObj && targetObj.type === 'Polygon' && targetObj.meta.isParcel && targetObj.polygons[0]?.[0]) {
                        parentCn = targetObj.meta.id || 'target';
                        parentPoly = targetObj.polygons[0][0];
                    }

                    if (!parentPoly) {
                        let bCnMatch = b.meta.id.match(/^(\d{2}:\d{2}:\d{6,7}:\d+)/);
                        if (bCnMatch && parcelMap.has(bCnMatch[1])) {
                            parentCn = bCnMatch[1];
                            parentPoly = parcelMap.get(parentCn).polygons[0][0];
                        }
                    }

                    if (!parentPoly && targetObj && targetObj.type === 'Polygon' && targetObj.polygons[0]?.[0]) {
                        parentCn = targetObj.meta.id || 'target';
                        parentPoly = targetObj.polygons[0][0];
                    }

                    if (parentPoly) {
                        b._parentPoly = parentPoly;
                        b._footprintArea = footprintArea;
                        if (!proceduralByParcel.has(parentCn)) proceduralByParcel.set(parentCn, []);
                        proceduralByParcel.get(parentCn).push(b);
                    }
                }
            });

            proceduralByParcel.forEach((buildingsGroup) => {
                let parentPoly = buildingsGroup[0]._parentPoly;
                let angle = 0;
                let maxLenSq = 0;
                for (let i = 0; i < parentPoly.length - 1; i++) {
                    let dx = parentPoly[i + 1].x - parentPoly[i].x;
                    let dy = parentPoly[i + 1].y - parentPoly[i].y;
                    let lenSq = dx * dx + dy * dy;
                    if (lenSq > maxLenSq) { maxLenSq = lenSq; angle = Math.atan2(dy, dx); }
                }

                let dirX = Math.cos(angle);
                let dirY = Math.sin(angle);
                let center = getBBoxCenter(parentPoly);

                let totalLength = 0;
                const gap = 3 * mercatorScale;

                buildingsGroup.forEach(b => {
                    let ratio = 1.25;
                    if (b.meta.rawText.includes('многоквартир') || b.meta.rawText.includes('мкд') || b.meta.rawText.includes('школ')) ratio = 2.5;
                    else if (b.meta.rawText.includes('гараж') || b.meta.rawText.includes('склад') || b.meta.rawText.includes('цех')) ratio = 2.0;

                    let trueWidth = Math.sqrt(b._footprintArea / ratio);
                    let trueLength = trueWidth * ratio;

                    b._scaledW = trueWidth * mercatorScale;
                    b._scaledL = trueLength * mercatorScale;
                    totalLength += b._scaledL;
                });

                totalLength += gap * (buildingsGroup.length - 1);
                let currentX = center.x - dirX * (totalLength / 2);
                let currentY = center.y - dirY * (totalLength / 2);

                buildingsGroup.forEach(b => {
                    let bCenterX = currentX + dirX * (b._scaledL / 2);
                    let bCenterY = currentY + dirY * (b._scaledL / 2);

                    let halfW = b._scaledW / 2;
                    let halfL = b._scaledL / 2;

                    let rect = [
                        { x: -halfL, y: -halfW }, { x: halfL, y: -halfW },
                        { x: halfL, y: halfW }, { x: -halfL, y: halfW }
                    ];

                    let rotatedPoly = rect.map(p => ({
                        x: bCenterX + (p.x * dirX - p.y * dirY),
                        y: bCenterY + (p.x * dirY + p.y * dirX)
                    }));
                    rotatedPoly.push(rotatedPoly[0]);

                    b.type = 'Polygon';
                    b.polygons = [[rotatedPoly]];
                    b.meta.isProcedural = true;
                    b.meta.isSpatial = true;

                    currentX += dirX * (b._scaledL + gap);
                    currentY += dirY * (b._scaledL + gap);

                    delete b._parentPoly;
                    delete b._footprintArea;
                    delete b._scaledW;
                    delete b._scaledL;
                });
            });

            if (window.turf && allLocalFeatures.target && allLocalFeatures.target.length > 0) {
                const createTurfPolys = (featureArray, idPrefix) => {
                    const result = [];
                    (featureArray || []).forEach((f, idx) => {
                        if (f.type === 'Polygon') {
                            f.polygons.forEach((polyRings) => {
                                try {
                                    let turfRings = polyRings.map(ring => ring.map(p => [p.x, p.y]));
                                    turfRings = turfRings.map(r => {
                                        if (r.length > 0 && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) {
                                            r.push([...r[0]]);
                                        }
                                        return r;
                                    }).filter(r => r.length >= 4);

                                    if (turfRings.length > 0) {
                                        const poly = window.turf.rewind(window.turf.polygon(turfRings), { reverse: false });
                                        result.push({
                                            poly: poly,
                                            id: f.meta.id || (idPrefix + idx),
                                            name: f.meta.name
                                        });
                                    }
                                } catch (e) { }
                            });
                        }
                    });
                    return result;
                };

                const targetTurf = createTurfPolys(allLocalFeatures.target, 'target');
                const objectsToCheck = [
                    ...createTurfPolys(allLocalFeatures.parcels, 'ЗУ ')
                ];

                targetTurf.forEach(target => {
                    const targetArea = window.turf.area(target.poly);

                    objectsToCheck.forEach(obj => {
                        if (target.id === obj.id || target.name === obj.id || target.name === obj.name) return;

                        try {
                            const intersection = window.turf.intersect(window.turf.featureCollection([target.poly, obj.poly]));
                            if (intersection && intersection.geometry) {

                                const intersectionArea = window.turf.area(intersection);
                                const objArea = window.turf.area(obj.poly);

                                if (Math.abs(intersectionArea - objArea) < 0.5 && Math.abs(intersectionArea - targetArea) < 0.5) {
                                    return;
                                }

                                const fixedIntersection = window.turf.rewind(intersection, { reverse: false });

                                let geoms = [];
                                if (fixedIntersection.geometry.type === 'Polygon') geoms = [fixedIntersection.geometry.coordinates];
                                else if (fixedIntersection.geometry.type === 'MultiPolygon') geoms = fixedIntersection.geometry.coordinates;

                                geoms.forEach(poly => {
                                    if (poly[0] && poly[0].length >= 4) {
                                        let planarArea = 0;
                                        const pts = poly[0];
                                        for (let i = 0; i < pts.length - 1; i++) {
                                            planarArea += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
                                        }
                                        planarArea = Math.abs(planarArea) / 2;

                                        if (planarArea > 0.1) {
                                            const realAreaM2 = planarArea / (mercatorScale * mercatorScale);
                                            const formattedPoly = poly.map(ring => ring.map(c => ({ x: c[0], y: c[1] })));
                                            allLocalFeatures.intersections.push({
                                                type: 'Polygon',
                                                polygons: [formattedPoly],
                                                meta: {
                                                    name: 'Наложение на ' + obj.id,
                                                    id: 'Наложение ' + (allLocalFeatures.intersections.length + 1),
                                                    isSpatial: true,
                                                    area: 'Площадь наложения: ' + realAreaM2.toFixed(2) + ' м²',
                                                    parent1: target.id || target.name,
                                                    parent2: obj.id
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        } catch (e) { }
                    });
                });
            }

            const safeDataString = JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '10px', left: '10px', right: '10px', bottom: '10px',
                width: 'auto', height: 'auto',
                backgroundColor: savedTheme === 'dark' ? '#0f172a' : '#ffffff',
                borderRadius: '14px', zIndex: '20000',
                boxShadow: '0 25px 80px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid rgba(128,128,128,0.25)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });

            const header = document.createElement('div');
            header.className = 'modal-header';
            const headerBg = savedTheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
            const headerColor = savedTheme === 'dark' ? '#f8fafc' : '#1e293b';

            Object.assign(header.style, {
                padding: '12px 20px', background: headerBg, backdropFilter: 'blur(12px)',
                color: headerColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '15px', fontFamily: 'system-ui, -apple-system, sans-serif',
                borderBottom: '1px solid rgba(128,128,128,0.12)'
            });
            header.innerHTML = '<span style="display:flex;align-items:center;"><i class="fas fa-cubes" style="color:#3b82f6;font-size:18px;margin-right:10px;"></i> Кадастровая Карта 3D</span>';

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex'; btnContainer.style.gap = '8px';

            const createWinBtn = (iconClass, hoverColor, action) => {
                const btn = document.createElement('button');
                btn.innerHTML = '<i class="' + iconClass + '"></i>';
                Object.assign(btn.style, {
                    background: 'rgba(128,128,128,0.1)', border: 'none', color: 'inherit', fontSize: '14px',
                    cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                btn.onmouseenter = () => { btn.style.background = hoverColor; btn.style.color = '#fff'; };
                btn.onmouseleave = () => { btn.style.background = 'rgba(128,128,128,0.1)'; btn.style.color = 'inherit'; };
                if (action) btn.onclick = action;
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

                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'setTheme', theme: newTheme }, '*');
                }
            });
            modal.dataset.theme = savedTheme;

            let isMinimized = false;
            const minBtn = createWinBtn('fas fa-compress-alt', '#3b82f6', () => {
                if (!isMinimized) {
                    modal.style.width = '340px'; modal.style.height = '54px';
                    modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px';
                    iframe.style.display = 'none'; minBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
                } else {
                    modal.style.width = 'auto'; modal.style.height = 'auto';
                    modal.style.top = '10px'; modal.style.left = '10px'; modal.style.right = '10px'; modal.style.bottom = '10px';
                    setTimeout(() => iframe.style.display = 'block', 300);
                    minBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
                }
                isMinimized = !isMinimized;
            });

            const closeBtn = createWinBtn('fas fa-times', '#ef4444', null);

            btnContainer.appendChild(themeBtn);
            btnContainer.appendChild(minBtn);
            btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer);
            modal.appendChild(header);

            const srcDocContent = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
    :root {
        --bg-color: #f8fafc;
        --text-color: #1e293b;
        --text-muted: #64748b;
        --panel-bg: rgba(255, 255, 255, 0.92);
        --tooltip-bg: rgba(255, 255, 255, 0.96);
        --border-color: rgba(0,0,0,0.1);
        --shadow-color: rgba(0,0,0,0.15);
        --btn-bg: rgba(255, 255, 255, 0.92);
        --btn-text: #2563eb;
        --scroll-thumb: #cbd5e1;
    }
    [data-theme="dark"] {
        --bg-color: #0b1120;
        --text-color: #f8fafc;
        --text-muted: #94a3b8;
        --panel-bg: rgba(15, 23, 42, 0.88);
        --tooltip-bg: rgba(15, 23, 42, 0.95);
        --border-color: rgba(255,255,255,0.14);
        --shadow-color: rgba(0,0,0,0.55);
        --btn-bg: rgba(15, 23, 42, 0.88);
        --btn-text: #60a5fa;
        --scroll-thumb: #475569;
    }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 4px; }

    body { margin: 0; overflow: hidden; background: var(--bg-color); font-family: 'Inter', system-ui, sans-serif; user-select: none; transition: background 0.3s; }
    canvas { display: block; outline: none; }
    
    #labels-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; z-index: 10; }
    
    .poi-label {
        position: absolute; display: flex; align-items: center; gap: 6px;
        transform: translate(-50%, -50%);
        will-change: transform, opacity; transition: opacity 0.25s ease;
        pointer-events: auto; cursor: pointer;
    }
    .poi-dot {
        width: 12px; height: 12px; border-radius: 50%;
        box-shadow: 0 2px 6px var(--shadow-color), inset 0 0 4px rgba(255,255,255,0.8);
        border: 2px solid #ffffff; flex-shrink: 0; transition: transform 0.2s, box-shadow 0.2s;
    }
    .poi-label:hover .poi-dot { transform: scale(1.35); box-shadow: 0 0 10px currentColor; }
    .poi-text {
        color: var(--text-color); font-size: 12px; font-weight: 700; letter-spacing: 0.3px;
        background: var(--panel-bg); padding: 2px 7px; border-radius: 6px;
        border: 1px solid var(--border-color); box-shadow: 0 2px 6px var(--shadow-color);
        white-space: nowrap; opacity: 0; transition: opacity 0.25s ease; pointer-events: none;
    }
    .poi-label.show-text .poi-text { opacity: 1; }
    
    #hover-tooltip {
        position: absolute; pointer-events: none; opacity: 0; z-index: 100;
        background: var(--tooltip-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--border-color); box-shadow: 0 12px 32px var(--shadow-color);
        padding: 14px 18px; border-radius: 12px; color: var(--text-muted); font-size: 13px;
        transform: translate(15px, 15px); transition: opacity 0.15s ease; max-width: 330px; line-height: 1.5;
    }
    #hover-tooltip .tt-title { display: block; font-size: 14px; font-weight: 800; color: var(--text-color); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px; }
    #hover-tooltip .tt-id { display: block; font-family: monospace; color: var(--btn-text); font-size: 12.5px; font-weight: 700; margin-bottom: 6px; }
    #hover-tooltip .tt-area { display: inline-block; margin-top: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 3px 9px; border-radius: 6px; font-weight: 700; font-size: 12px; }

    #ui-toggle-btn {
        display: flex; position: absolute; top: 15px; right: 15px; width: 44px; height: 44px;
        background: var(--btn-bg); border: 1px solid var(--border-color); border-radius: 12px;
        box-shadow: 0 4px 12px var(--shadow-color); cursor: pointer; z-index: 30; font-size: 20px; color: var(--btn-text);
        align-items: center; justify-content: center; backdrop-filter: blur(10px); transition: transform 0.2s;
    }
    #ui-toggle-btn:hover { transform: scale(1.05); }
    #close-ui-btn { position: absolute; top: 15px; right: 15px; background: rgba(128,128,128,0.15); border: none; border-radius: 8px; width: 30px; height: 30px; font-size: 20px; color: var(--text-color); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;}
    #close-ui-btn:hover { background: rgba(128,128,128,0.3); }

    #ui-panel {
        position: absolute; top: 20px; right: 20px; width: 285px; max-height: 85vh; overflow-y: auto; z-index: 20;
        background: var(--panel-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--border-color); border-radius: 16px; padding: 20px;
        color: var(--text-color); box-shadow: 0 12px 40px var(--shadow-color); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #ui-panel.hidden { transform: translateX(120%); } 
    
    h3 { margin: 0 0 15px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); border-bottom: 1px solid var(--border-color); padding-bottom: 10px; display: flex; align-items: center; justify-content: space-between;}
    
    .layer-control { display: flex; align-items: center; cursor: pointer; margin-bottom: 0; padding: 3px 0; }
    .layer-control input { margin-right: 10px; accent-color: #3b82f6; cursor: pointer; width: 16px; height: 16px; }
    .layer-control label { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-color); }
    .color-box { width: 12px; height: 12px; border-radius: 4px; margin-right: 10px; border: 1px solid var(--border-color); flex-shrink: 0; }
    
    .export-btn { width: 100%; margin-top: 15px; padding: 11px; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .export-btn:hover { box-shadow: 0 4px 14px rgba(16,185,129,0.4); transform: translateY(-1px); }
    
    #home-btn {
        position: absolute; bottom: 20px; right: 20px; z-index: 20; width: 44px; height: 44px;
        background: var(--btn-bg); backdrop-filter: blur(10px); border: 1px solid var(--border-color);
        border-radius: 12px; color: var(--btn-text); font-size: 20px; cursor: pointer; box-shadow: 0 4px 12px var(--shadow-color); transition: all 0.2s; display: flex; align-items: center; justify-content: center;
    }
    #home-btn:hover { transform: scale(1.06); filter: brightness(1.1); }
    
    #exit-isolation-btn {
        display: none; position: absolute; top: 15px; left: 50%; transform: translateX(-50%);
        background: #ef4444; color: white; border: none; padding: 10px 22px; border-radius: 10px;
        font-weight: 600; font-size: 14px; cursor: pointer; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.45);
        z-index: 100; transition: transform 0.2s, background 0.2s;
    }
    #exit-isolation-btn:hover { background: #dc2626; transform: translateX(-50%) scale(1.05); }

    .info-text { position: absolute; bottom: 20px; left: 20px; color: var(--text-muted); font-size: 12px; pointer-events: none; z-index: 10; font-weight: 500; background: var(--panel-bg); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color); backdrop-filter: blur(6px); }

    @media (max-width: 768px) {
        #ui-panel { top: 0; right: 0; height: 100vh; max-height: 100vh; border-radius: 0; border: none; box-shadow: -5px 0 20px rgba(0,0,0,0.1); }
        .info-text { display: none; }
    }

    #cube-loader-wrapper {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: var(--bg-color); z-index: 99999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        transition: opacity 0.5s ease, visibility 0.5s;
    }
    .cube-spinner {
        width: 60px; height: 60px; position: relative;
        transform-style: preserve-3d; animation: spinCube 2.5s infinite linear;
    }
    .cube-face {
        position: absolute; width: 60px; height: 60px;
        border: 2px solid var(--btn-text); background: rgba(59, 130, 246, 0.15);
        box-shadow: inset 0 0 15px rgba(59, 130, 246, 0.3), 0 0 10px rgba(59, 130, 246, 0.2);
    }
    .cf-front  { transform: translateZ(30px); }
    .cf-back   { transform: rotateY(180deg) translateZ(30px); }
    .cf-left   { transform: rotateY(-90deg) translateZ(30px); }
    .cf-right  { transform: rotateY(90deg) translateZ(30px); }
    .cf-top    { transform: rotateX(90deg) translateZ(30px); }
    .cf-bottom { transform: rotateX(-90deg) translateZ(30px); }
    @keyframes spinCube {
        0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
        100% { transform: rotateX(360deg) rotateY(720deg) rotateZ(360deg); }
    }
    .cube-text {
        margin-top: 40px; color: var(--btn-text); font-weight: 700;
        font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase;
        animation: pulseText 1.5s infinite ease-in-out;
    }
    @keyframes pulseText { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; text-shadow: 0 0 10px rgba(59, 130, 246, 0.5); } }

    #camera-alt-display {
        position: absolute; top: 20px; left: 80px; z-index: 50;
        background: var(--panel-bg); backdrop-filter: blur(10px);
        padding: 8px 16px; border-radius: 10px; border: 1px solid var(--border-color);
        color: var(--text-color); font-weight: 600; font-size: 13px;
        box-shadow: 0 4px 12px var(--shadow-color);
        display: flex; align-items: center; gap: 8px; pointer-events: none;
    }
    #zoom-slider-container {
        position: absolute; left: 20px; top: 50%; transform: translateY(-50%);
        z-index: 20; display: flex; flex-direction: column; align-items: center; gap: 6px;
    }
    #zoom-slider-track {
        background: var(--panel-bg); backdrop-filter: blur(10px);
        border: 1px solid var(--border-color); border-radius: 12px;
        padding: 10px 6px; box-shadow: 0 4px 12px var(--shadow-color);
        display: flex; flex-direction: column; align-items: center; gap: 4px;
    }
    .zoom-btn {
        width: 32px; height: 32px; border: none; border-radius: 8px;
        background: var(--btn-bg); color: var(--btn-text); font-size: 18px; font-weight: 700;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--border-color); transition: background 0.2s;
    }
    .zoom-btn:hover { background: var(--border-color); }
    .zoom-btn:active { transform: scale(0.95); }
    
    #zoom-slider {
        -webkit-appearance: none; appearance: none;
        writing-mode: vertical-lr; direction: rtl;
        width: 6px; height: 160px;
        background: transparent; cursor: pointer;
    }
    #zoom-slider::-webkit-slider-runnable-track {
        width: 6px; height: 160px; background: var(--border-color); border-radius: 3px;
    }
    #zoom-slider::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 18px; height: 18px; border-radius: 50%;
        background: var(--btn-text); border: 2px solid #fff;
        box-shadow: 0 2px 6px var(--shadow-color);
        margin-left: -6px; cursor: grab;
    }
    #zoom-slider::-moz-range-track {
        width: 6px; height: 160px; background: var(--border-color); border-radius: 3px;
    }
    #zoom-slider::-moz-range-thumb {
        width: 18px; height: 18px; border-radius: 50%;
        background: var(--btn-text); border: 2px solid #fff;
        box-shadow: 0 2px 6px var(--shadow-color); cursor: grab;
    }
</style>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"></script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
</head>
<body data-theme="${savedTheme}">
<div id="cube-loader-wrapper">
    <div class="cube-spinner">
        <div class="cube-face cf-front"></div><div class="cube-face cf-back"></div>
        <div class="cube-face cf-left"></div><div class="cube-face cf-right"></div>
        <div class="cube-face cf-top"></div><div class="cube-face cf-bottom"></div>
    </div>
    <div class="cube-text">Генерация 3D мира...</div>
</div>

<div id="camera-alt-display">
    <i class="fas fa-satellite" style="color: var(--btn-text);"></i>
    <span id="alt-value">0 м</span>
</div>

<div id="labels-layer"></div>
<div id="hover-tooltip"></div>

<button id="exit-isolation-btn"><i class="fas fa-times" style="margin-right: 8px;"></i>Закрыть режим наложения</button>

<button id="ui-toggle-btn" title="Слои" style="display: none;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
</button>

<div id="zoom-slider-container">
    <div id="zoom-slider-track">
        <button class="zoom-btn" id="zoom-in-btn">+</button>
        <input type="range" id="zoom-slider" min="0" max="1" step="0.005" value="0.5">
        <button class="zoom-btn" id="zoom-out-btn">−</button>
    </div>
</div>

<button id="home-btn" title="Сбросить вид">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
</button>
<div class="info-text">ЛКМ: Перемещение | ПКМ: Вращение | Двойной клик / Клик по метке: Полет к объекту</div>

<div id="ui-panel">
  <button id="close-ui-btn" title="Закрыть">&times;</button>
  <h3>Слои и объекты</h3>
  <div id="layers-container"></div>
  <div class="export-block" style="margin-top:15px;border-top:1px solid var(--border-color);padding-top:15px;">
    <button id="export-html-btn" class="export-btn"><i class="fas fa-download" style="margin-right:6px;"></i>Сохранить в HTML</button>
  </div>
</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const uiPanel = document.getElementById("ui-panel");
const toggleBtn = document.getElementById("ui-toggle-btn");

toggleBtn.onclick = () => { uiPanel.classList.remove("hidden"); toggleBtn.style.display = "none"; };
document.getElementById("close-ui-btn").onclick = () => { uiPanel.classList.add("hidden"); toggleBtn.style.display = "flex"; };

let currentTheme = "${savedTheme}";
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'setTheme') {
        currentTheme = e.data.theme;
        document.body.dataset.theme = currentTheme;
        updateSceneTheme();
    }
});

let scene, dirLight, hemiLight, ambientLight, ground, skyDomeMesh;
const syncVisibility = [];
const windowMaterialCache = {};

try {
    const data = ${safeDataString};
    const animateables = [];
    const pulseMaterials = [];

    ["target", "parcels", "intersections", "buildings", "structures", "zouits"].forEach(function (key) {
        if (data[key]) data[key].forEach(function (item, idx) { item.uid = key + "_" + idx; });
    });

    const getShortCad = function (id) { if (!id) return ""; var parts = id.split(":"); return ":" + parts[parts.length - 1]; };
    const getNetShort = function (m) { if (m.isGas) return "Газ"; if (m.isWater) return "Вода"; if (m.isHeat) return "Тепло"; if (m.isElectric) return "ЛЭП"; if (m.isSewer) return "Канал."; return "Сеть"; };
    const getZouitShort = function (m) { if (m.isGas) return "ОЗ Газ"; if (m.isWater) return "ОЗ Вода"; if (m.isHeat) return "ОЗ Тепло"; if (m.isElectric) return "ОЗ ЛЭП"; if (m.isSewer) return "ОЗ Кан."; return "ЗОУИТ"; };

    const getZouitColorHex = function (text) {
        if (!text) return 0x9333ea;
        text = text.toLowerCase();
        if (text.includes('электро') || text.includes('электр') || text.includes('лэп') || text.includes('лп ') || text.includes('вл ') || text.includes('вкл ') || text.includes('воздушн')) return 0xef4444;
        if (text.includes('газ')) return 0xf59e0b;
        if (text.includes('тепло')) return 0xf97316;
        if (text.includes('водо') || text.includes('вод')) return 0x3b82f6;
        if (text.includes('канализ') || text.includes('сток')) return 0x64748b;
        return 0x10b981;
    };

    const INFRA_COLORS = { gas: 0xfbbf24, water: 0x2563eb, heat: 0xea580c, electric: 0xdc2626, sewer: 0x57534e, def: 0x8b5cf6 };
    const getInfraColor = function (m) { if (m.isGas) return INFRA_COLORS.gas; if (m.isWater) return INFRA_COLORS.water; if (m.isHeat) return INFRA_COLORS.heat; if (m.isElectric) return INFRA_COLORS.electric; if (m.isSewer) return INFRA_COLORS.sewer; return INFRA_COLORS.def; };
    const getInfraHex = function (m) { return "#" + new THREE.Color(getInfraColor(m)).getHexString(); };
    const getInfraName = function (m) { if (m.name && m.name !== "Объект" && m.name.length > 2) return m.name; if (m.isGas) return "Газопровод"; if (m.isWater) return "Водопровод"; if (m.isHeat) return "Теплотрасса"; if (m.isElectric) return "ЛЭП"; if (m.isSewer) return "Канализация"; return "Сооружение"; };

    const PARCEL_PALETTE = [0x4ade80, 0x34d399, 0xa3e635, 0x2dd4bf, 0x86efac, 0x6ee7b7, 0xbef264, 0x5eead4, 0x38bdf8, 0xa78bfa, 0xfbbf24];
    const darken = function (hex, f) { f = f || 0.65; var c = new THREE.Color(hex); c.r *= f; c.g *= f; c.b *= f; return c; };

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: "high-performance", logarithmicDepthBuffer: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xdbeafe, 0.00018);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 4, 22000);
    camera.position.set(60, 95, 140);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.maxDistance = 8000;
    controls.minDistance = 12;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.screenSpacePanning = false;
    controls.enableZoom = false;
    controls.target.set(0, 0, 0);

    const initialCamPos = new THREE.Vector3(60, 95, 140);
    const initialTarget = new THREE.Vector3(0, 0, 0);
    document.getElementById("home-btn").onclick = function () {
        camera.position.copy(initialCamPos);
        controls.target.copy(initialTarget);
        controls.update();
        updateSliderFromCamera();
    };

    // Единая система управления зумом (мышь, тачпад, слайдер и pinch-to-zoom)
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomState = { currentDistance: 140, minDist: controls.minDistance, maxDist: controls.maxDistance };

    const updateSliderFromCamera = () => {
        if (!zoomSlider) return;
        const dist = camera.position.distanceTo(controls.target);
        const logMin = Math.log(zoomState.minDist);
        const logMax = Math.log(zoomState.maxDist);
        const logCur = Math.log(Math.max(zoomState.minDist, Math.min(zoomState.maxDist, dist)));
        zoomSlider.value = 1 - (logCur - logMin) / (logMax - logMin);
    };

    const applyZoom = (newDist) => {
        newDist = Math.max(zoomState.minDist, Math.min(zoomState.maxDist, newDist));
        zoomState.currentDistance = newDist;
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(dir, newDist);
        updateSliderFromCamera();
    };

    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        let delta = e.deltaY;
        if (e.deltaMode === 0) delta = delta / 100;
        delta = Math.max(-3, Math.min(3, delta));
        const currentDist = camera.position.distanceTo(controls.target);
        applyZoom(currentDist * (1 + delta * 0.08));
    }, { passive: false });

    let pinchStartDistance = 0;
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].pageX - e.touches[1].pageX;
            const dy = e.touches[0].pageY - e.touches[1].pageY;
            pinchStartDistance = Math.hypot(dx, dy);
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].pageX - e.touches[1].pageX;
            const dy = e.touches[0].pageY - e.touches[1].pageY;
            const currentPinchDistance = Math.hypot(dx, dy);
            let delta = Math.max(-3, Math.min(3, (pinchStartDistance - currentPinchDistance) * 0.15));
            pinchStartDistance = currentPinchDistance;
            const currentDist = camera.position.distanceTo(controls.target);
            applyZoom(currentDist * (1 + delta * 0.08));
        }
    }, { passive: false });

    zoomSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const logMin = Math.log(zoomState.minDist);
        const logMax = Math.log(zoomState.maxDist);
        applyZoom(Math.exp(logMin + (1 - val) * (logMax - logMin)));
    });

    zoomInBtn.onclick = () => applyZoom(camera.position.distanceTo(controls.target) * 0.85);
    zoomOutBtn.onclick = () => applyZoom(camera.position.distanceTo(controls.target) * 1.15);

    // Освещение и купол неба
    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x86efac, 0.65);
    hemiLight.position.set(0, 500, 0);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    dirLight.position.set(220, 360, 200);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -550;
    dirLight.shadow.camera.right = 550;
    dirLight.shadow.camera.top = 550;
    dirLight.shadow.camera.bottom = -550;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 1500;
    dirLight.shadow.bias = -0.0008;
    dirLight.shadow.normalBias = 0.04;
    scene.add(dirLight);

    function createSkyDomeTexture(isDark) {
        const cv = document.createElement('canvas');
        cv.width = 32; cv.height = 512;
        const ctx = cv.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        if (isDark) {
            grad.addColorStop(0.0, '#020617');
            grad.addColorStop(0.45, '#0f172a');
            grad.addColorStop(0.52, '#1e293b');
            grad.addColorStop(1.0, '#090d16');
        } else {
            grad.addColorStop(0.0, '#38bdf8');
            grad.addColorStop(0.38, '#bae6fd');
            grad.addColorStop(0.50, '#f0f9ff');
            grad.addColorStop(1.0, '#cbd5e1');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 512);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    const skyGeo = new THREE.SphereGeometry(15000, 32, 24);
    const skyMat = new THREE.MeshBasicMaterial({ map: createSkyDomeTexture(currentTheme === 'dark'), side: THREE.BackSide, fog: false, depthWrite: false });
    skyDomeMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyDomeMesh);

    function createGroundTexture(type, hexColor) {
        if (type === 'solid') return null;
        var size = 1024;
        var cv = document.createElement("canvas");
        cv.width = size; cv.height = size;
        var ctx = cv.getContext("2d");
        ctx.fillStyle = hexColor;
        ctx.fillRect(0, 0, size, size);
        
        // Легкий природный микрошум
        for (let i = 0; i < 3500; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)";
            ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
        }

        if (type === 'grid') {
            var step = size / 10;
            ctx.lineWidth = 2;
            var isDark = currentTheme === 'dark';
            ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
            ctx.beginPath();
            for (var i = 0; i <= size; i += step) {
                ctx.moveTo(i, 0); ctx.lineTo(i, size);
                ctx.moveTo(0, i); ctx.lineTo(size, i);
            }
            ctx.stroke();
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, size, size);
        } else if (type === 'checker') {
            var half = size / 2;
            ctx.fillStyle = currentTheme === 'dark' ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
            ctx.fillRect(0, 0, half, half);
            ctx.fillRect(half, half, half, half);
        }
        var t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        var repeat = type === 'grid' ? 1500 : 2500;
        t.repeat.set(repeat, repeat);
        return t;
    }

    let currentGroundColor = "${savedGroundColor}";
    let currentGroundTex = "${savedGroundTex}";
    let currentParcelOpacity = ${savedParcelOpacity};
    const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.02, color: currentGroundColor });
    if (!['solid', 'ymap', 'ysat', 'yhyb'].includes(currentGroundTex)) {
        groundMat.map = createGroundTexture(currentGroundTex, currentGroundColor);
    }
    ground = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;

    if (['ymap', 'ysat', 'yhyb'].includes(currentGroundTex)) {
        ground.visible = false;
    }
    scene.add(ground);

    const mapTilesGroup = new THREE.Group();
    mapTilesGroup.position.y = -0.4;
    scene.add(mapTilesGroup);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    window.loadMapTiles = function (type) {
        while (mapTilesGroup.children.length > 0) {
            const child = mapTilesGroup.children[0];
            mapTilesGroup.remove(child);
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
            child.geometry.dispose();
        }

        if (!['osm', 'gsat', 'ghyb'].includes(type)) {
            mapTilesGroup.visible = false;
            return;
        }
        mapTilesGroup.visible = true;

        const z = 18;
        const E = 20037508.342789244;
        const tileSize = (2 * E) / Math.pow(2, z);

        const oX = ${originX};
        const oY = ${originY};

        const tX = Math.floor((oX + E) / tileSize);
        const tY = Math.floor((E - oY) / tileSize);

        const halfGrid = 6;

        for (let i = -halfGrid; i <= halfGrid; i++) {
            for (let j = -halfGrid; j <= halfGrid; j++) {
                const currentTx = tX + i;
                const currentTy = tY + j;

                const minX = -E + currentTx * tileSize;
                const maxX = -E + (currentTx + 1) * tileSize;
                const minY = E - (currentTy + 1) * tileSize;
                const maxY = E - currentTy * tileSize;

                const tileWidth = maxX - minX;
                const tileHeight = maxY - minY;

                const posX = (maxX + minX) / 2 - oX;
                const posZ = -((maxY + minY) / 2 - oY);

                const planeGeo = new THREE.PlaneGeometry(tileWidth, tileHeight);
                planeGeo.rotateX(-Math.PI / 2);

                let url = '';
                const isLocalFile = window.location.protocol === 'file:';

                if (type === 'osm') url = 'https://tile.openstreetmap.org/' + z + '/' + currentTx + '/' + currentTy + '.png';
                if (type === 'gsat') {
                    url = isLocalFile
                        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + currentTy + '/' + currentTx
                        : 'https://mt1.google.com/vt/lyrs=s&x=' + currentTx + '&y=' + currentTy + '&z=' + z;
                }
                if (type === 'ghyb') {
                    url = isLocalFile
                        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + currentTy + '/' + currentTx
                        : 'https://mt1.google.com/vt/lyrs=y&x=' + currentTx + '&y=' + currentTy + '&z=' + z;
                }

                const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.0 });
                textureLoader.load(url,
                    (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
                        mat.map = tex;
                        mat.needsUpdate = true;
                    },
                    undefined,
                    () => { }
                );

                const mesh = new THREE.Mesh(planeGeo, mat);
                mesh.position.set(posX, 0, posZ);
                mesh.receiveShadow = true;
                mapTilesGroup.add(mesh);
            }
        }
    };

    if (['osm', 'gsat', 'ghyb'].includes(currentGroundTex)) {
        window.loadMapTiles(currentGroundTex);
    }

    function createCompass() {
        const cg = new THREE.Group();
        const ringGeo = new THREE.TorusGeometry(8, 0.45, 16, 64);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.5;
        ring.castShadow = true;
        cg.add(ring);

        const dialGeo = new THREE.CylinderGeometry(7.8, 7.8, 0.25, 32);
        dialGeo.translate(0, 0.12, 0);
        const dialMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8, metalness: 0.1 });
        const dial = new THREE.Mesh(dialGeo, dialMat);
        dial.receiveShadow = true;
        cg.add(dial);

        const pin = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.15 }));
        pin.position.y = 0.75;
        cg.add(pin);

        const coneGeo = new THREE.ConeGeometry(1.5, 6.5, 4);
        coneGeo.translate(0, 3.25, 0);
        coneGeo.rotateX(Math.PI / 2);

        const aN = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.35, roughness: 0.35 }));
        aN.position.y = 0.6; aN.rotation.y = Math.PI; aN.scale.y = 0.3; aN.castShadow = true;
        cg.add(aN);

        const aS = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.35, roughness: 0.35 }));
        aS.position.y = 0.6; aS.scale.y = 0.3; aS.castShadow = true;
        cg.add(aS);

        const addL = (text, rotY, color) => {
            const cv = document.createElement('canvas');
            cv.width = 128; cv.height = 128;
            const ctx = cv.getContext('2d');
            ctx.font = 'bold 75px system-ui, sans-serif';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = "rgba(0,0,0,0.25)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            ctx.fillText(text, 64, 64);
            const tex = new THREE.CanvasTexture(cv);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
            sp.scale.set(4.5, 4.5, 1);
            sp.position.set(Math.sin(rotY) * 5.5, 0.8, Math.cos(rotY) * 5.5);
            cg.add(sp);
        };
        addL('С', Math.PI, '#ef4444');
        addL('Ю', 0, '#3b82f6');
        addL('В', Math.PI / 2, '#475569');
        addL('З', -Math.PI / 2, '#475569');
        cg.position.set(-65, 0.5, 65);
        return cg;
    }
    scene.add(createCompass());

    window.updateSceneTheme = function () {
        const isDark = currentTheme === 'dark';
        if (isDark) {
            scene.background = new THREE.Color(0x0b1120);
            scene.fog.color.setHex(0x0f172a);
            ambientLight.intensity = 0.35;
            hemiLight.intensity = 0.4;
            dirLight.intensity = 1.35;
            dirLight.color.setHex(0xbfdbfe);
        } else {
            scene.background = new THREE.Color(0xdbeafe);
            scene.fog.color.setHex(0xdbeafe);
            ambientLight.intensity = 0.55;
            hemiLight.intensity = 0.65;
            dirLight.intensity = 2.15;
            dirLight.color.setHex(0xfffbeb);
        }

        if (skyDomeMesh) {
            if (skyDomeMesh.material.map) skyDomeMesh.material.map.dispose();
            skyDomeMesh.material.map = createSkyDomeTexture(isDark);
            skyDomeMesh.material.needsUpdate = true;
        }

        // Включаем теплый свет в окнах в темном режиме
        Object.values(windowMaterialCache).forEach(mat => {
            if (mat && mat.emissive) {
                mat.emissive.setHex(isDark ? 0x3b2810 : 0x000000);
                mat.emissiveIntensity = isDark ? 0.55 : 0.0;
            }
        });

        const isMapTile = ['osm', 'gsat', 'ghyb'].includes(currentGroundTex);
        if (isMapTile) {
            ground.visible = false;
        } else {
            ground.visible = true;
            ground.material.color.setHex(parseInt(currentGroundColor.replace('#', '0x')));
            if (currentGroundTex !== 'solid') {
                ground.material.map = createGroundTexture(currentGroundTex, currentGroundColor);
            } else {
                ground.material.map = null;
            }
            ground.material.needsUpdate = true;
        }
    };
    updateSceneTheme();

    // --- БОГАТАЯ ФЛОРА И ЛАНДШАФТ (Деревья, сосны, кусты, цветы, трава) ---
    const plantGeos = {
        stem: new THREE.CylinderGeometry(0.04, 0.06, 1.0, 5),
        leaf: new THREE.PlaneGeometry(0.5, 0.25),
        petal: new THREE.PlaneGeometry(0.35, 0.2),
        center: new THREE.SphereGeometry(0.18, 6, 6),
        grass: new THREE.PlaneGeometry(0.09, 0.65),
        trunk: new THREE.CylinderGeometry(0.16, 0.28, 2.2, 7),
        crownSphere: new THREE.DodecahedronGeometry(1.35, 1),
        pineCone: new THREE.ConeGeometry(1.4, 2.5, 7),
        bushSphere: new THREE.DodecahedronGeometry(0.65, 1)
    };
    const plantMats = {
        stem: new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.9 }),
        leaf: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9, side: THREE.DoubleSide }),
        center: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.5 }),
        grass: new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.95, side: THREE.DoubleSide }),
        trunk: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.95 }),
        crown1: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.85, flatShading: true }),
        crown2: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85, flatShading: true }),
        pine: new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.85, flatShading: true }),
        petals: [0xf43f5e, 0xfbbf24, 0xa78bfa, 0xfb7185, 0xf97316, 0x38bdf8].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }))
    };

    const createFlower = function (x, z, scale, baseY) {
        scale = scale || 1; baseY = baseY || 0.2;
        var g = new THREE.Group();
        var stem = new THREE.Mesh(plantGeos.stem, plantMats.stem);
        stem.position.y = 0.5 * scale; stem.scale.set(scale, scale, scale); g.add(stem);
        [-1, 1].forEach(function (side) {
            var leaf = new THREE.Mesh(plantGeos.leaf, plantMats.leaf);
            leaf.position.set(side * 0.2 * scale, 0.4 * scale, 0);
            leaf.rotation.z = side * 0.6; leaf.rotation.y = Math.random() * Math.PI;
            leaf.scale.set(scale, scale, scale); g.add(leaf);
        });
        var pm = plantMats.petals[Math.floor(Math.random() * plantMats.petals.length)];
        for (var i = 0; i < 5; i++) {
            var a = (i / 5) * Math.PI * 2;
            var p = new THREE.Mesh(plantGeos.petal, pm);
            p.position.set(Math.cos(a) * 0.28 * scale, 1.02 * scale, Math.sin(a) * 0.28 * scale);
            p.rotation.x = -Math.PI / 2; p.rotation.z = a; p.scale.set(scale, scale, scale); g.add(p);
        }
        var ctr = new THREE.Mesh(plantGeos.center, plantMats.center);
        ctr.position.y = 1.03 * scale; ctr.scale.set(scale, scale, scale); g.add(ctr);
        g.position.set(x, baseY, z); g.rotation.y = Math.random() * Math.PI * 2;
        return g;
    };

    const createGrassTuft = function (x, z, baseY) {
        baseY = baseY || 0.2;
        var g = new THREE.Group();
        for (var i = 0; i < 4; i++) {
            var b = new THREE.Mesh(plantGeos.grass, plantMats.grass);
            var hs = 0.85 + Math.random() * 0.75;
            b.scale.set(1.1, hs, 1.1);
            b.position.set((Math.random() - 0.5) * 0.3, 0.3 * hs, (Math.random() - 0.5) * 0.3);
            b.rotation.y = Math.random() * Math.PI;
            b.rotation.z = (Math.random() - 0.5) * 0.45;
            g.add(b);
        }
        g.position.set(x, baseY, z);
        return g;
    };

    const createTree = function (x, z, scale, baseY) {
        scale = scale || 1; baseY = baseY || 0.2;
        const g = new THREE.Group();
        const isPine = Math.random() > 0.55;
        const trunk = new THREE.Mesh(plantGeos.trunk, plantMats.trunk);
        trunk.position.y = 1.1;
        trunk.castShadow = true;
        g.add(trunk);

        if (isPine) {
            for (let l = 0; l < 3; l++) {
                const cone = new THREE.Mesh(plantGeos.pineCone, plantMats.pine);
                const s = 1 - l * 0.24;
                cone.scale.set(s, s, s);
                cone.position.y = 2.1 + l * 1.15;
                cone.castShadow = true;
                cone.receiveShadow = true;
                g.add(cone);
            }
        } else {
            const cMat = Math.random() > 0.5 ? plantMats.crown1 : plantMats.crown2;
            const mainCrown = new THREE.Mesh(plantGeos.crownSphere, cMat);
            mainCrown.position.y = 2.7;
            mainCrown.castShadow = true;
            mainCrown.receiveShadow = true;
            g.add(mainCrown);

            for (let k = 0; k < 2; k++) {
                const sub = new THREE.Mesh(plantGeos.crownSphere, cMat);
                sub.scale.setScalar(0.68);
                sub.position.set((k === 0 ? 0.65 : -0.65), 2.35 + k * 0.35, (Math.random() - 0.5) * 0.7);
                sub.castShadow = true;
                g.add(sub);
            }
        }
        g.scale.setScalar(scale);
        g.position.set(x, baseY, z);
        g.rotation.y = Math.random() * Math.PI * 2;
        return g;
    };

    const createBush = function (x, z, scale, baseY) {
        scale = scale || 1; baseY = baseY || 0.2;
        const g = new THREE.Group();
        const mat = Math.random() > 0.5 ? plantMats.crown1 : plantMats.crown2;
        for (let i = 0; i < 3; i++) {
            const b = new THREE.Mesh(plantGeos.bushSphere, mat);
            const s = 0.7 + Math.random() * 0.45;
            b.scale.set(s, s * 0.8, s);
            b.position.set((Math.random() - 0.5) * 0.6, 0.35 * s, (Math.random() - 0.5) * 0.6);
            b.castShadow = true;
            g.add(b);
        }
        g.scale.setScalar(scale);
        g.position.set(x, baseY, z);
        return g;
    };

    const seedParcelWithFlowers = function (polyRing, groupTarget, baseY) {
        baseY = baseY || 0.2;
        if (!polyRing || polyRing.length < 3) return;
        var mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
        polyRing.forEach(function (p) { mnX = Math.min(mnX, p.x); mxX = Math.max(mxX, p.x); mnZ = Math.min(mnZ, -p.y); mxZ = Math.max(mxZ, -p.y); });
        var area = (mxX - mnX) * (mxZ - mnZ);
        var target = Math.min(28, Math.floor(area / 32));
        var pip = function (x, z, poly) {
            var ins = false;
            for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                var xi = poly[i].x, zi = -poly[i].y, xj = poly[j].x, zj = -poly[j].y;
                if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins;
            }
            return ins;
        };
        var placed = 0, att = 0;
        while (placed < target && att < target * 3) {
            att++;
            var x = mnX + Math.random() * (mxX - mnX), z = mnZ + Math.random() * (mxZ - mnZ);
            if (pip(x, z, polyRing)) {
                var rnd = Math.random();
                if (rnd > 0.86 && area > 180) {
                    groupTarget.add(createTree(x, z, 0.65 + Math.random() * 0.45, baseY));
                } else if (rnd > 0.72) {
                    groupTarget.add(createBush(x, z, 0.75 + Math.random() * 0.4, baseY));
                } else if (rnd > 0.45) {
                    groupTarget.add(createFlower(x, z, 0.4 + Math.random() * 0.35, baseY));
                } else {
                    groupTarget.add(createGrassTuft(x, z, baseY));
                }
                placed++;
            }
        }
    };

    const BUILDING_DICT = {
        education: { keys: ["школ", "детск", "сад", "учебн", "институт", "колледж"], wall: 0xfef3c7, base: 0x78350f, roof: 0x9a3412, win: 0x93c5fd, winType: "ribbon", parapet: true, rooftopDetails: true },
        medical: { keys: ["больниц", "поликлиник", "мед", "здрав", "госпитал", "амбулатор"], wall: 0xf8fafc, base: 0x64748b, roof: 0x475569, win: 0x7dd3fc, winType: "standard", parapet: true, addon: "cross", rooftopDetails: true },
        mkd: { keys: ["многоквартирный", "мкд", "общежити", "квартир", "жилой комплекс"], wall: 0xe2e8f0, base: 0x475569, roof: 0x334155, win: 0x60a5fa, winType: "dense", parapet: true, rooftopDetails: true },
        priv: { keys: ["жилой дом", "индивидуальн", "частн", "дачн", "садов", "коттедж", "ижс", "баня"], wall: 0xfde68a, base: 0x5c4033, roof: 0x7f1d1d, win: 0x93c5fd, winType: "wood", parapet: false, hippedRoof: true, chimney: true },
        commercial: { keys: ["магазин", "торгов", "офис", "бизнес", "тц", "административ", "банк", "кафе"], wall: 0xe0e7ff, base: 0x312e81, roof: 0x1e1b4b, win: 0x38bdf8, winType: "large", parapet: true, rooftopDetails: true },
        industrial: { keys: ["склад", "цех", "завод", "промышлен", "гараж", "ангар", "мастерск", "производств", "котельн"], wall: 0xcbd5e1, base: 0x334155, roof: 0x1e293b, win: 0x64748b, winType: "industrial", parapet: true, industrialRoof: true },
        def: { wall: 0xf1f5f9, base: 0x64748b, roof: 0x475569, win: 0x93c5fd, winType: "standard", parapet: true, rooftopDetails: true }
    };

    function getBuildingStyle(rawText) {
        var keys = Object.keys(BUILDING_DICT);
        for (var i = 0; i < keys.length; i++) {
            var cfg = BUILDING_DICT[keys[i]];
            if (cfg.keys && cfg.keys.some(function (k) { return rawText.includes(k); })) return cfg;
        }
        return BUILDING_DICT.def;
    }

    function getWindowMaterial(style) {
        var ck = style.wall + "_" + style.winType;
        if (windowMaterialCache[ck]) return windowMaterialCache[ck];

        var cv = document.createElement("canvas");
        cv.width = 512; cv.height = 512;
        var ctx = cv.getContext("2d");
        var wallHex = "#" + new THREE.Color(style.wall).getHexString();
        ctx.fillStyle = wallHex;
        ctx.fillRect(0, 0, 512, 512);

        if (style.winType === "wood") {
            // Горизонтальная расшивка под деревянный брус / сайдинг
            ctx.strokeStyle = "rgba(120, 53, 15, 0.16)";
            ctx.lineWidth = 4;
            for (var y = 0; y < 512; y += 32) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
            }
        } else if (style.winType === "industrial") {
            // Вертикальный металлический профлист
            ctx.fillStyle = "rgba(0,0,0,0.06)";
            for (var x = 0; x < 512; x += 32) {
                ctx.fillRect(x, 0, 12, 512);
            }
        } else {
            // Межэтажный архитектурный пояс
            ctx.fillStyle = "rgba(0,0,0,0.08)";
            ctx.fillRect(0, 0, 512, 22);
            ctx.fillRect(0, 490, 512, 22);
        }

        if (style.win) {
            var wW = 220, wH = 280;
            if (style.winType === "dense") { wW = 290; wH = 310; }
            else if (style.winType === "ribbon") { wW = 430; wH = 220; }
            else if (style.winType === "large") { wW = 380; wH = 380; }
            else if (style.winType === "industrial") { wW = 360; wH = 110; }

            var sX = (512 - wW) / 2, sY = (512 - wH) / 2;

            // Ниша окна и отлив
            ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
            ctx.fillRect(sX - 8, sY - 8, wW + 16, wH + 20);

            // Стеклопакет с диагональным бликом
            var winGrad = ctx.createLinearGradient(sX, sY, sX + wW, sY + wH);
            var winColor = "#" + new THREE.Color(style.win).getHexString();
            winGrad.addColorStop(0, winColor);
            winGrad.addColorStop(0.5, "#e0f2fe");
            winGrad.addColorStop(1, winColor);
            ctx.fillStyle = winGrad;
            ctx.fillRect(sX, sY, wW, wH);

            // Оконная рама и переплеты
            ctx.strokeStyle = style.winType === "wood" ? "#78350f" : "#1e293b";
            ctx.lineWidth = 12;
            ctx.strokeRect(sX, sY, wW, wH);

            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(sX + wW / 2, sY); ctx.lineTo(sX + wW / 2, sY + wH);
            if (style.winType !== "industrial") {
                ctx.moveTo(sX, sY + wH * 0.38); ctx.lineTo(sX + wW, sY + wH * 0.38);
            }
            ctx.stroke();
        }

        var tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        var tsX = style.winType === "dense" ? 3.2 : (style.winType === "ribbon" ? 4.8 : 3.8);
        tex.repeat.set(1 / tsX, 1 / (3.4 * ${mercatorScale}));

        var isDark = currentTheme === 'dark';
        var mat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: style.winType === "large" ? 0.2 : 0.45,
            metalness: style.winType === "large" ? 0.65 : 0.25,
            emissive: new THREE.Color(isDark ? 0x3b2810 : 0x000000),
            emissiveIntensity: isDark ? 0.55 : 0.0
        });
        windowMaterialCache[ck] = mat;
        return mat;
    }
    
    
    

    const getShapeCenterAndSize = function (shape) {
        var pts = shape.getPoints();
        var mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
        pts.forEach(function (p) {
            mnX = Math.min(mnX, p.x); mxX = Math.max(mxX, p.x);
            mnY = Math.min(mnY, p.y); mxY = Math.max(mxY, p.y);
        });
        return {
            cx: (mnX + mxX) / 2,
            cy: (mnY + mxY) / 2,
            w: mxX - mnX,
            d: mxY - mnY
        };
    };

    const createBuildingModel = function (shape, height, style, isMini, isProcedural = false) {
        isMini = isMini || false;
        var b = new THREE.Group();
        var pts = shape.getPoints();
        if (pts.length < 3) return b;

        var bInfo = getShapeCenterAndSize(shape);
        var minSide = Math.min(bInfo.w, bInfo.d);

        // 1. Усиленный цоколь (фундамент) с небольшим расширением
        var baseGeo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.65,
            bevelEnabled: !isProcedural && !isMini,
            bevelSize: 0.12,
            bevelThickness: 0.12,
            bevelSegments: 1
        });
        var baseMat = new THREE.MeshStandardMaterial({
            color: isProcedural ? 0x2563eb : style.base,
            roughness: 0.85,
            metalness: 0.1,
            transparent: isProcedural,
            opacity: isProcedural ? 0.5 : 1
        });
        var base = new THREE.Mesh(baseGeo, baseMat);
        base.rotation.x = -Math.PI / 2;
        base.position.y = 0.9;
        if (!isMini && !isProcedural) { base.castShadow = true; base.receiveShadow = true; }
        b.add(base);

        // 2. Основные стены здания
        var wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });

        if (isProcedural) {
            // Красивый голографический CAD-стиль для условных зданий без координат
            var procMat = new THREE.MeshPhysicalMaterial({
                color: 0x3b82f6,
                transmission: 0.35,
                transparent: true,
                opacity: 0.62,
                roughness: 0.15,
                metalness: 0.3,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
            var walls = new THREE.Mesh(wallGeo, procMat);
            walls.rotation.x = -Math.PI / 2;
            walls.position.y = 1.5;
            var edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(wallGeo),
                new THREE.LineBasicMaterial({ color: 0x93c5fd, opacity: 0.9, transparent: true })
            );
            walls.add(edges);
            b.add(walls);
        } else {
            var roofMat = new THREE.MeshStandardMaterial({ color: style.roof, roughness: 0.75, metalness: 0.15 });
            var wallMat = isMini ? new THREE.MeshStandardMaterial({ color: style.wall, roughness: 0.7 }) : getWindowMaterial(style);
            var walls = new THREE.Mesh(wallGeo, [roofMat, wallMat]);
            walls.rotation.x = -Math.PI / 2;
            walls.position.y = 1.5;
            if (!isMini) {
                walls.castShadow = true;
                walls.receiveShadow = true;
                // Тонкая архитектурная контурная линия для четкости граней
                var wallEdges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(wallGeo, 25),
                    new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.18 })
                );
                walls.add(wallEdges);
            }
            b.add(walls);

            var topY = 1.5 + height;

            // 3. Оформление крыши в зависимости от назначения здания
            if (style.hippedRoof) {
                // Многоярусная скатная крыша с карнизным свесом для частных домов (ИЖС)
                var roofLevels = 3;
                for (var rl = 0; rl < roofLevels; rl++) {
                    var rGeo = new THREE.ExtrudeGeometry(shape, {
                        depth: 0.55,
                        bevelEnabled: true,
                        bevelSize: 0.35 - rl * 0.22,
                        bevelThickness: 0.45,
                        bevelSegments: 2
                    });
                    var roofMesh = new THREE.Mesh(rGeo, roofMat);
                    roofMesh.rotation.x = -Math.PI / 2;
                    roofMesh.position.y = topY + rl * 0.55;
                    if (!isMini) { roofMesh.castShadow = true; roofMesh.receiveShadow = true; }
                    b.add(roofMesh);
                }
                // Печная/каминная труба на крыше частного дома
                if (style.chimney && !isMini && minSide > 4) {
                    var chim = new THREE.Mesh(
                        new THREE.BoxGeometry(0.75, 2.2, 0.75),
                        new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.9 })
                    );
                    chim.position.set(bInfo.cx + minSide * 0.18, topY + 1.6, -bInfo.cy);
                    chim.castShadow = true;
                    b.add(chim);
                }
            } else {
                // Плоская кровля с парапетом и кровельным покрытием
                if (style.parapet) {
                    var par = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 0.75, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 1 }),
                        roofMat
                    );
                    par.rotation.x = -Math.PI / 2;
                    par.position.y = topY;
                    if (!isMini) par.castShadow = true;
                    b.add(par);
                }
                var flatRoof = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false }),
                    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
                );
                flatRoof.rotation.x = -Math.PI / 2;
                flatRoof.position.y = topY + (style.parapet ? 0.65 : 0);
                b.add(flatRoof);

                // Детали на плоских крышах (лифтовые шахты, вентблоки, медицинские кресты, трубы)
                if (!isMini && minSide > 7) {
                    var rTopY = topY + (style.parapet ? 0.8 : 0.15);

                    if (style.addon === "cross") {
                        // Медицинский крест для больниц и поликлиник
                        var crossMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.35 });
                        var c1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.8), crossMat);
                        var c2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 2.6), crossMat);
                        c1.position.set(bInfo.cx, rTopY + 0.3, -bInfo.cy);
                        c2.position.set(bInfo.cx, rTopY + 0.3, -bInfo.cy);
                        b.add(c1); b.add(c2);
                    } else if (style.industrialRoof) {
                        // Промышленные вентиляционные трубы и климатические блоки
                        var metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.65, roughness: 0.35 });
                        for (var pIdx = -1; pIdx <= 1; pIdx += 2) {
                            var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.2, 12), metalMat);
                            pipe.position.set(bInfo.cx + pIdx * (minSide * 0.2), rTopY + 1.6, -bInfo.cy);
                            pipe.castShadow = true;
                            b.add(pipe);
                        }
                    } else if (style.rooftopDetails) {
                        // Будка выхода на кровлю / машинное отделение лифта и блоки кондиционирования
                        var hvacMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6, metalness: 0.3 });
                        var boxW = Math.min(3.5, minSide * 0.28);
                        var elevatorBox = new THREE.Mesh(new THREE.BoxGeometry(boxW, 2.1, boxW * 1.2), hvacMat);
                        elevatorBox.position.set(bInfo.cx, rTopY + 1.05, -bInfo.cy);
                        elevatorBox.castShadow = true;
                        b.add(elevatorBox);

                        if (minSide > 12) {
                            var vent = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), hvacMat);
                            vent.position.set(bInfo.cx - boxW * 1.2, rTopY + 0.55, -bInfo.cy + boxW * 0.5);
                            vent.castShadow = true;
                            b.add(vent);
                        }
                    }
                }
            }
        }
        return b;
    };

    const createStake = function (position) {
        var g = new THREE.Group();
        var stick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.16, 5.2, 12),
            new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 })
        );
        stick.position.y = 2.6; stick.castShadow = true; g.add(stick);

        var ring = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.8, 12),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
        );
        ring.position.y = 4.2; g.add(ring);

        var cap = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.25, metalness: 0.3, emissive: 0x7f1d1d, emissiveIntensity: 0.3 })
        );
        cap.position.y = 5.3; g.add(cap);
        g.position.set(position.x, 0, position.z);
        return g;
    };

    let flyAnimation = null;
    const exitIsolationBtn = document.getElementById('exit-isolation-btn');

    function enterIsolationMode(targetObj) {
        exitIsolationBtn.style.display = 'block';

        let p1Id = targetObj.userData.meta.parent1;
        let p2Id = targetObj.userData.meta.parent2;

        Object.values(sceneGroups).forEach(grp => {
            grp.children.forEach(c => c.visible = false);
        });
        labelsData.forEach(l => l.el.style.display = "none");

        let box = new THREE.Box3();
        let foundParents = false;

        ['target', 'parcels', 'buildings'].forEach(groupName => {
            sceneGroups[groupName].children.forEach(pGrp => {
                if (pGrp.userData && pGrp.userData.meta) {
                    let mId = pGrp.userData.meta.id;
                    let mName = pGrp.userData.meta.name;

                    if (mId === p1Id || mId === p2Id || mName === p1Id || mName === p2Id) {
                        pGrp.visible = true;
                        let pBox = new THREE.Box3().setFromObject(pGrp);
                        box.union(pBox);
                        foundParents = true;
                    }
                }
            });
        });

        targetObj.visible = true;
        if (!foundParents) {
            box.setFromObject(targetObj);
        }

        labelsData.forEach(l => {
            if (l.groupData) {
                let lId = l.groupData.id;
                let lName = l.groupData.name;
                if (lId === p1Id || lId === p2Id || lName === p1Id || lName === p2Id || lId === targetObj.userData.meta.id) {
                    l.el.style.display = "";
                }
            }
        });

        if (box.isEmpty()) return;
        let center = new THREE.Vector3(); box.getCenter(center);
        let startTarget = controls.target.clone();
        let startCam = camera.position.clone();
        let dir = new THREE.Vector3().subVectors(startCam, center).normalize();
        if (dir.lengthSq() === 0) dir.set(0, 0.5, 1).normalize();

        let size = new THREE.Vector3(); box.getSize(size);
        let maxDim = Math.max(size.x, size.y, size.z, 40);

        let endCam = center.clone().add(dir.multiplyScalar(maxDim * 2.0));
        endCam.y = Math.max(endCam.y, maxDim * 1.5);

        let startTime = performance.now();
        flyAnimation = function () {
            let t = Math.min((performance.now() - startTime) / 1000, 1);
            let ease = 1 - Math.pow(1 - t, 3);
            controls.target.lerpVectors(startTarget, center, ease);
            camera.position.lerpVectors(startCam, endCam, ease);
            if (t < 1) requestAnimationFrame(flyAnimation); else flyAnimation = null;
        };
        flyAnimation();
    }

    exitIsolationBtn.onclick = function () {
        this.style.display = 'none';
        syncVisibility.forEach(f => f());
    };

    function flyToMesh(targetObj) {
        if (!targetObj) return;
        let box = new THREE.Box3();
        box.setFromObject(targetObj);

        if (box.isEmpty()) return;
        let center = new THREE.Vector3(); box.getCenter(center);
        let startTarget = controls.target.clone();
        let startCam = camera.position.clone();
        let dir = new THREE.Vector3().subVectors(startCam, center).normalize();
        if (dir.lengthSq() === 0) dir.set(0, 0.5, 1).normalize();

        let size = new THREE.Vector3(); box.getSize(size);
        let maxDim = Math.max(size.x, size.y, size.z, 40);

        let endCam = center.clone().add(dir.multiplyScalar(maxDim * 2.4));
        endCam.y = Math.max(endCam.y, maxDim * 1.45);

        let startTime = performance.now();
        flyAnimation = function () {
            let t = Math.min((performance.now() - startTime) / 1000, 1);
            let ease = 1 - Math.pow(1 - t, 3);
            controls.target.lerpVectors(startTarget, center, ease);
            camera.position.lerpVectors(startCam, endCam, ease);
            if (t < 1) requestAnimationFrame(flyAnimation); else flyAnimation = null;
        };
        flyAnimation();
    }

    const labelsLayer = document.getElementById("labels-layer");
    const tooltip = document.getElementById("hover-tooltip");
    const labelsData = [];

    const buildTooltipHTML = function (category, mData) {
        let extra = "";
        if (mData.address) extra += "<div style='margin-bottom:6px; line-height:1.25; font-size:12px;'><span style='color:var(--text-muted); font-size:11px; display:block; font-weight:normal; margin-bottom:2px;'>Адрес:</span>" + mData.address + "</div>";
        if (mData.floors) extra += "<div><b>Этажность:</b> " + mData.floors + "</div>";
        if (mData.year) extra += "<div><b>Год постройки:</b> " + mData.year + "</div>";
        if (mData.material) extra += "<div><b>Материал стен:</b> " + mData.material + "</div>";
        if (mData.extent) extra += "<div><b>Протяженность:</b> " + mData.extent + " м</div>";
        if (mData.isProcedural) extra += "<div style='color:#60a5fa; font-size:11px; margin-top:4px;'><b>Объект без координат</b> (условная 3D-проекция)</div>";
        if (mData.parent1 && mData.parent2) extra += "<div style='margin-top:6px; font-size:11px; border-top:1px solid var(--border-color); padding-top:4px;'>Пересечение объектов:<br>• " + mData.parent1 + "<br>• " + mData.parent2 + "</div>";

        return "<span class='tt-title'>" + category + "</span>" +
            (mData.id ? "<span class='tt-id'>" + mData.id + "</span>" : "") +
            (mData.name && mData.name !== "Объект" && mData.name !== mData.id ? "<div style='margin-bottom:6px; line-height:1.25; font-weight:600;'><span style='color: var(--text-muted); font-size: 11px; display: block; font-weight: normal; margin-bottom: 2px;'>Наименование / Назначение:</span>" + mData.name + "</div>" : "") +
            extra +
            (mData.area ? "<div class='tt-area'>" + mData.area + "</div>" : "");
    };

    const addLabel = function (pos3D, priority, categoryName, shortId, meta, colorHex, meshRef = null) {
        const el = document.createElement("div");
        el.className = "poi-label";
        const labelTitle = (categoryName + " " + shortId).trim() || meta.id || "Объект";
        el.innerHTML = "<div class='poi-dot' style='background-color: " + colorHex + "; color: " + colorHex + "'></div><div class='poi-text'>" + labelTitle + "</div>";

        el.addEventListener("mouseenter", (e) => {
            tooltip.innerHTML = buildTooltipHTML(categoryName || "Целевой объект", meta);
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
            if (meshRef) {
                if (categoryName === "Наложение") enterIsolationMode(meshRef);
                else flyToMesh(meshRef);
            }
        });

        labelsLayer.appendChild(el);
        labelsData.push({ el: el, pos: pos3D, priority: priority, visible: true, groupData: meta });
    };

    const sceneGroups = { target: new THREE.Group(), parcels: new THREE.Group(), intersections: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group() };
    Object.values(sceneGroups).forEach(function (g) { scene.add(g); });

    const interactables = [];
    const attachMeta = function (obj, meta, category) {
        if (!obj) return;
        obj.userData = { meta: meta, category: category };
        obj.traverse(function (child) {
            if (child.isMesh || child.isLine || child.isLineSegments) {
                child.userData.parentMetaObj = obj;
                if (Array.isArray(child.material)) {
                    child.userData.origEmissive = child.material.map(m => m.emissive ? m.emissive.getHex() : 0x000000);
                } else if (child.material) {
                    child.userData.origEmissive = child.material.emissive ? child.material.emissive.getHex() : 0x000000;
                } else {
                    child.userData.origEmissive = 0x000000;
                }
                interactables.push(child);
            }
        });
    };

    const createShape = function (polyRings) {
        var shape = new THREE.Shape();
        if (!polyRings || !polyRings[0] || polyRings[0].length < 3) return shape;
        shape.moveTo(polyRings[0][0].x, polyRings[0][0].y);
        for (var i = 1; i < polyRings[0].length; i++) shape.lineTo(polyRings[0][i].x, polyRings[0][i].y);
        for (var i = 1; i < polyRings.length; i++) {
            if (!polyRings[i] || polyRings[i].length < 3) continue;
            var hole = new THREE.Path();
            hole.moveTo(polyRings[i][0].x, polyRings[i][0].y);
            for (var j = 1; j < polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, polyRings[i][j].y);
            shape.holes.push(hole);
        }
        return shape;
    };
    const getCentroid = function (pts) {
        if (!pts || !pts.length) return { x: 0, y: 0, z: 0 };
        var cx = 0, cy = 0;
        pts.forEach(function (p) { cx += p.x; cy += p.y; });
        return new THREE.Vector3(cx / pts.length, 0, -cy / pts.length);
    };

    const spatialIds = new Set();
    ["target", "parcels", "buildings", "structures", "zouits"].forEach(key => {
        if (data[key]) {
            data[key].forEach(item => {
                if (item.meta && item.meta.isSpatial && !item.meta.isProcedural && item.meta.id) spatialIds.add(item.meta.id);
            });
        }
    });

    // --- 1. ОТРИСОВКА ЦЕЛЕВОГО ОБЪЕКТА ---
    data.target.forEach(function (t) {
        var color = (t.meta && t.meta.isParcel) ? 0x10b981 : 0x3b82f6;
        t.polygons.forEach(function (poly) {
            if (!poly || !poly[0]) return;
            var tGrp = new THREE.Group();
            if (t.type === "Line") {
                var vp = poly[0].map(function (p) { return new THREE.Vector3(p.x, 1.5, -p.y); });
                if (vp.length > 1) {
                    var tube = new THREE.Mesh(
                        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp, false, "chordal"), 64, 0.65, 12, false),
                        new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.4 })
                    );
                    tube.castShadow = true; tGrp.add(tube);
                    attachMeta(tGrp, t.meta, "Целевой объект (Линия)");
                    sceneGroups.target.add(tGrp);

                    var midPt = vp[Math.floor(vp.length / 2)];
                    addLabel(new THREE.Vector3(midPt.x, 3.8, midPt.z), 10, "Целевая", "Линия", t.meta, "#" + color.toString(16).padStart(6, '0'), tGrp);
                }
            } else {
                var shape = createShape(poly);
                if (shape.getPoints().length > 2) {
                    var depth = 0.22;
                    var mat = new THREE.MeshStandardMaterial({
                        color: color, opacity: 0.58, transparent: true,
                        roughness: 0.6, metalness: 0.1,
                        depthWrite: false,
                        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
                    });
                    var mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false }), mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.y = 0.12;
                    var edgeColor = (t.meta && t.meta.isParcel) ? 0x059669 : 0x1d4ed8;
                    var borderMat = new THREE.LineBasicMaterial({ color: edgeColor, linewidth: 2, transparent: true, opacity: 0.95 });
                    pulseMaterials.push(borderMat);
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), borderMat));
                    tGrp.add(mesh);

                    seedParcelWithFlowers(poly[0], tGrp, 0.35);
                    attachMeta(tGrp, t.meta, "Целевой объект");
                    sceneGroups.target.add(tGrp);
                    var c = getCentroid(poly[0]); c.y = depth + 2.2;
                    addLabel(c, 10, "Целевой", getShortCad(t.meta.id), t.meta, "#" + color.toString(16).padStart(6, '0'), tGrp);
                }
            }
        });
    });

    // --- 2. ОТРИСОВКА ЗЕМЕЛЬНЫХ УЧАСТКОВ (ЗУ) И ПРОИЗВОЛЬНЫХ ФИГУР ---
    data.parcels.forEach(function (p, index) {
        try {
            var safeId = String(p.meta.id || '').toLowerCase();
            var isLine = p.type === 'Line';
            var isArbitrary = isLine || !safeId.includes(':') || safeId.includes('объект') || safeId.includes('полигон') || safeId.includes('линия');

            var yOff = 0.3 + (index * 0.008);
            var depth = 0.16;
            var pHex = isArbitrary ? 0x818cf8 : PARCEL_PALETTE[index % PARCEL_PALETTE.length];
            var pColor = new THREE.Color(pHex);
            var eColor = darken(pHex, 0.6);

            p.polygons.forEach(function (poly) {
                if (!poly || !poly[0]) return;
                var pGrp = new THREE.Group();

                if (isLine) {
                    var vp = poly[0].map(function (pt) { return new THREE.Vector3(pt.x, yOff + 0.5, -pt.y); });
                    if (vp.length > 1) {
                        var path = new THREE.CurvePath();
                        for (var i = 0; i < vp.length - 1; i++) {
                            path.add(new THREE.LineCurve3(vp[i], vp[i + 1]));
                        }
                        var tube = new THREE.Mesh(
                            new THREE.TubeGeometry(path, vp.length * 4, 0.45, 10, false),
                            new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.35, metalness: 0.2 })
                        );
                        tube.castShadow = true;
                        pGrp.add(tube);

                        var lenStr = p.meta.length ? (p.meta.length.toFixed(2) + " м") : "";
                        p.meta.area = "Протяженность: " + lenStr;
                        var labelText = (p.meta.name && p.meta.name !== 'Объект') ? p.meta.name : "Линия";

                        attachMeta(pGrp, p.meta, "Произвольный линейный объект");
                        sceneGroups.parcels.add(pGrp);

                        var midPt = vp[Math.floor(vp.length / 2)];
                        addLabel(new THREE.Vector3(midPt.x, yOff + 2.5, midPt.z), 6, "Объект", labelText, p.meta, "#818cf8", pGrp);
                    }
                } else {
                    var shape = createShape(poly);
                    var pts = shape.getPoints();

                    if (pts.length > 2) {
                        var mat = new THREE.MeshStandardMaterial({
                            color: pColor, roughness: 0.8, metalness: 0.05, transparent: true, opacity: isArbitrary ? 0.6 : currentParcelOpacity,
                            depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
                        });

                        var extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false });
                        var mesh = new THREE.Mesh(extrudeGeo, mat);

                        mesh.rotation.x = -Math.PI / 2; mesh.position.y = yOff;
                        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: eColor, linewidth: isArbitrary ? 2 : 1 })));
                        pGrp.add(mesh);

                        if (!isArbitrary) seedParcelWithFlowers(poly[0], pGrp, yOff + depth);

                        if (isArbitrary && (!p.meta.area || p.meta.area === '')) {
                            var calcA = 0;
                            var polyPts = poly[0];
                            for (var i = 0; i < polyPts.length - 1; i++) {
                                calcA += polyPts[i].x * polyPts[i + 1].y - polyPts[i + 1].x * polyPts[i].y;
                            }
                            calcA += polyPts[polyPts.length - 1].x * polyPts[0].y - polyPts[0].x * polyPts[polyPts.length - 1].y;
                            calcA = Math.abs(calcA) / 2;
                            calcA = calcA / (${mercatorScale} * ${mercatorScale});
                            p.meta.area = "Площадь: " + Math.round(calcA).toLocaleString('ru-RU') + " м²";
                        }

                        var catName = isArbitrary ? "Произвольный площадной объект" : "Земельный участок";
                        attachMeta(pGrp, p.meta, catName);
                        sceneGroups.parcels.add(pGrp);

                        var c = getCentroid(poly[0]); c.y = yOff + depth + 1.2;
                        var shortTitle = isArbitrary ? ((p.meta.name && p.meta.name !== 'Объект') ? p.meta.name : "Контур") : getShortCad(p.meta.id);
                        addLabel(c, isArbitrary ? 6 : 5, isArbitrary ? "Объект" : "ЗУ", shortTitle, p.meta, "#" + pColor.getHexString(), pGrp);
                    }
                }
            });
        } catch (err) {
            console.error("[3D-Viewer] Ошибка при обработке участка:", err);
        }
    });

    // --- 3. ОТРИСОВКА НАЛОЖЕНИЙ (ПЕРЕСЕЧЕНИЙ ГРАНИЦ) ---
    data.intersections.forEach(function (iObj) {
        iObj.polygons.forEach(function (poly) {
            var shape = createShape(poly);
            if (shape.getPoints().length > 2) {
                var iGrp = new THREE.Group();
                var interMat = new THREE.MeshStandardMaterial({
                    color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.4,
                    transparent: true, opacity: 0.68, depthWrite: false,
                    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
                });
                pulseMaterials.push(interMat);
                var mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }), interMat);
                mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.85;
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xfef08a, linewidth: 2 })));
                iGrp.add(mesh);
                attachMeta(iGrp, iObj.meta, "Наложение границ");
                sceneGroups.intersections.add(iGrp);

                var c = getCentroid(poly[0]); c.y = 2.4;
                addLabel(c, 9, "Наложение", iObj.meta.id.replace("Наложение", "").trim(), iObj.meta, "#dc2626", iGrp);
            }
        });
    });

    // --- 4. ОТРИСОВКА ЗДАНИЙ (ОКС) ---
    var linkedCount = 0;
    data.buildings.forEach(function (b) {
        var style = getBuildingStyle(b.meta.rawText);
        if (b.meta.isSpatial) {
            b.polygons.forEach(function (poly) {
                var shape = createShape(poly);
                if (shape.getPoints().length > 2) {
                    var bModel = createBuildingModel(shape, b.meta.height, style, false, b.meta.isProcedural);
                    attachMeta(bModel, b.meta, b.meta.isProcedural ? "ОКС (Условный)" : "ОКС (Здание)");
                    sceneGroups.buildings.add(bModel);
                    var c = getCentroid(poly[0]); c.y = b.meta.height + 4.2;
                    addLabel(c, 8, "ОКС", getShortCad(b.meta.id), b.meta, "#3b82f6", bModel);
                }
            });
        } else {
            if (spatialIds.has(b.meta.id)) return;
            var radius = 25 + (linkedCount % 2) * 8;
            var angle = (linkedCount * Math.PI * 2) / 6;
            var posX = Math.cos(angle) * radius, posZ = Math.sin(angle) * radius;
            if (b.meta.hasExtendedData) {
                var ds = new THREE.Shape(); ds.moveTo(-5, -5); ds.lineTo(5, -5); ds.lineTo(5, 5); ds.lineTo(-5, 5);
                var mm = createBuildingModel(ds, b.meta.height, style, true, false);
                mm.scale.set(0.4, 0.4, 0.4);
                var laser = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 15), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.35 }));
                laser.position.y = -7.5; mm.add(laser);
                mm.position.set(posX, 15, posZ); mm.userData = { baseY: 15, offset: linkedCount };
                animateables.push(mm);
                attachMeta(mm, b.meta, "ОКС (Привязка к кварталу)");
                sceneGroups.buildings.add(mm);
                addLabel(new THREE.Vector3(posX, 15 + (b.meta.height * 0.4) + 2, posZ), 7, "ОКС", getShortCad(b.meta.id), b.meta, "#3b82f6", mm);
            } else {
                var st = createStake({ x: posX, z: posZ });
                attachMeta(st, b.meta, "ОКС (Без координат)");
                sceneGroups.buildings.add(st);
                addLabel(new THREE.Vector3(posX, 7, posZ), 4, "ОКС (Без коорд.)", getShortCad(b.meta.id), b.meta, "#3b82f6", st);
            }
            linkedCount++;
        }
    });

    // --- 5. ОТРИСОВКА ИНЖЕНЕРНЫХ СЕТЕЙ И СООРУЖЕНИЙ (ЛЭП, ГАЗ, ТЕПЛО, ВОДА) ---
    data.structures.forEach(function (s) {
        var infraColor = getInfraColor(s.meta);
        var infraHex = getInfraHex(s.meta);
        var infraName = getInfraName(s.meta);
        s.polygons.forEach(function (poly) {
            if (!poly || !poly[0] || poly[0].length < 2) return;
            var sGrp = new THREE.Group();
            var midPt = null; var drawH = 5;

            if (s.type === "Line") {
                if ((s.meta.isGas || s.meta.isHeat) && !s.meta.isUnderground) {
                    // Надземный газопровод / теплотрасса на Т-образных металлических опорах с фланцами
                    drawH = 3.2;
                    var pts = poly[0].map(function (pt) { return new THREE.Vector3(pt.x, drawH, -pt.y); });
                    var curve = new THREE.CatmullRomCurve3(pts, false, "chordal");
                    var pipeMat = new THREE.MeshStandardMaterial({ color: infraColor, roughness: 0.32, metalness: 0.65 });
                    var supportMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.6 });
                    var flangeMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.8 });

                    var pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, s.meta.diameter, 12, false), pipeMat);
                    pipe.castShadow = true; sGrp.add(pipe);

                    pts.forEach(function (pt, i) {
                        // Фланцевое кольцо на узлах трубы
                        var flange = new THREE.Mesh(new THREE.CylinderGeometry(s.meta.diameter * 1.35, s.meta.diameter * 1.35, 0.25, 12), flangeMat);
                        flange.position.copy(pt);
                        if (i < pts.length - 1) flange.lookAt(pts[i + 1]);
                        flange.rotateX(Math.PI / 2);
                        sGrp.add(flange);

                        // Опора с бетонным основанием и поперечной балкой
                        var stand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, drawH, 8), supportMat);
                        stand.position.set(pt.x, drawH / 2, pt.z); stand.castShadow = true; sGrp.add(stand);

                        var tBar = new THREE.Mesh(new THREE.BoxGeometry(s.meta.diameter * 3.2, 0.18, 0.25), supportMat);
                        tBar.position.set(pt.x, drawH - s.meta.diameter, pt.z);
                        if (i < pts.length - 1) tBar.rotation.y = Math.atan2(pts[i + 1].x - pt.x, pts[i + 1].z - pt.z);
                        sGrp.add(tBar);

                        var basePad = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 }));
                        basePad.position.set(pt.x, 0.15, pt.z);
                        sGrp.add(basePad);
                    });
                    midPt = pts[Math.floor(pts.length / 2)];
                } else if (s.meta.isElectric) {
                    // Реалистичная воздушная линия электропередач (ЛЭП) с траверсами, изоляторами и 3 фазами проводов
                    drawH = 7.5;
                    var pts2 = poly[0].map(function (pt) { return new THREE.Vector3(pt.x, drawH, -pt.y); });
                    var poleMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85, metalness: 0.1 });
                    var armMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.7 });
                    var insMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.2 });

                    var poleRotations = [];
                    pts2.forEach(function (pt, idx) {
                        var rotY = 0;
                        if (idx < pts2.length - 1) rotY = Math.atan2(pts2[idx + 1].x - pt.x, pts2[idx + 1].z - pt.z);
                        else if (idx > 0) rotY = Math.atan2(pt.x - pts2[idx - 1].x, pt.z - pts2[idx - 1].z);
                        poleRotations.push(rotY);

                        var pGroup = new THREE.Group();
                        pGroup.position.set(pt.x, 0, pt.z);
                        pGroup.rotation.y = rotY;

                        // Бетонный/деревянный столб и фундаментная гильза
                        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, drawH, 10), poleMat);
                        pole.position.y = drawH / 2; pole.castShadow = true; pGroup.add(pole);

                        var collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.95 }));
                        collar.position.y = 0.45; pGroup.add(collar);

                        // Верхняя и нижняя стальные траверсы с керамическими изоляторами
                        [drawH - 0.6, drawH - 1.8].forEach(function (armY, aIdx) {
                            var armW = aIdx === 0 ? 3.6 : 2.4;
                            var cross = new THREE.Mesh(new THREE.BoxGeometry(armW, 0.16, 0.16), armMat);
                            cross.position.y = armY; cross.castShadow = true; pGroup.add(cross);

                            var offsets = aIdx === 0 ? [-1.6, 0, 1.6] : [-1.0, 1.0];
                            offsets.forEach(function (ox) {
                                var ins = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.42, 8), insMat);
                                ins.position.set(ox, armY + 0.22, 0);
                                pGroup.add(ins);
                            });
                        });

                        sGrp.add(pGroup);
                    });

                    // 3-фазные провода с естественным физическим провисанием
                    var wireMat = new THREE.LineBasicMaterial({ color: 0x1e293b, linewidth: 1.5 });
                    var phaseOffsets = [-1.6, 0, 1.6];
                    for (var wi = 0; wi < pts2.length - 1; wi++) {
                        var p1 = pts2[wi], p2 = pts2[wi + 1];
                        var r1 = poleRotations[wi], r2 = poleRotations[wi + 1];
                        var spanDist = p1.distanceTo(p2);
                        var sag = Math.min(2.8, Math.max(0.7, spanDist * 0.045));

                        phaseOffsets.forEach(function (phOff) {
                            var startPt = new THREE.Vector3(
                                p1.x + Math.cos(r1) * phOff,
                                drawH - 0.35,
                                p1.z - Math.sin(r1) * phOff
                            );
                            var endPt = new THREE.Vector3(
                                p2.x + Math.cos(r2) * phOff,
                                drawH - 0.35,
                                p2.z - Math.sin(r2) * phOff
                            );
                            var mid = new THREE.Vector3().addVectors(startPt, endPt).multiplyScalar(0.5);
                            mid.y -= sag;

                            var wireGeo = new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(startPt, mid, endPt).getPoints(22));
                            sGrp.add(new THREE.Line(wireGeo, wireMat));
                        });
                    }
                    midPt = pts2[Math.floor(pts2.length / 2)];
                } else {
                    // Подземные коммуникации (водопровод, канализация) с поворотными колодцами (люками)
                    var yPos = s.meta.isUnderground ? -0.8 : 1.1;
                    var pts3 = poly[0].map(function (pt) { return new THREE.Vector3(pt.x, yPos, -pt.y); });
                    if (pts3.length > 1) {
                        var uPipe = new THREE.Mesh(
                            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3, false, "chordal"), 60, s.meta.diameter, 12, false),
                            new THREE.MeshStandardMaterial({ color: infraColor, roughness: 0.45, metalness: 0.35, transparent: s.meta.isUnderground, opacity: s.meta.isUnderground ? 0.85 : 1 })
                        );
                        sGrp.add(uPipe);

                        // Чугунные люки и шахты колодцев на поверхности земли для подземных сетей
                        if (s.meta.isUnderground) {
                            var manholeMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 });
                            pts3.forEach(function (pt, idx) {
                                if (idx === 0 || idx === pts3.length - 1 || idx % 3 === 0) {
                                    var shaft = new THREE.Mesh(
                                        new THREE.CylinderGeometry(0.45, 0.45, Math.abs(yPos) + 0.35, 12),
                                        new THREE.MeshStandardMaterial({ color: infraColor, transparent: true, opacity: 0.45 })
                                    );
                                    shaft.position.set(pt.x, yPos / 2 + 0.15, pt.z);
                                    sGrp.add(shaft);

                                    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 0.12, 16), manholeMat);
                                    lid.position.set(pt.x, 0.36, pt.z);
                                    sGrp.add(lid);
                                }
                            });
                        }
                        midPt = pts3[Math.floor(pts3.length / 2)].clone();
                        midPt.y = 2.5;
                    }
                }
            } else {
                // Площадные инженерные сооружения (ТП, КТП, ГРП, насосные станции)
                var shape = createShape(poly);
                if (shape.getPoints().length > 2) {
                    var subH = 2.8;
                    var mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: subH, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1 }),
                        new THREE.MeshStandardMaterial({ color: infraColor, roughness: 0.55, metalness: 0.3 })
                    );
                    mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.9; mesh.castShadow = true; sGrp.add(mesh);
                    var c = getCentroid(poly[0]);
                    midPt = { x: c.x, y: subH + 2.5, z: c.z };
                }
            }
            if (sGrp.children.length > 0) {
                attachMeta(sGrp, s.meta, infraName);
                sceneGroups.structures.add(sGrp);
                if (midPt) addLabel(midPt, 3, getNetShort(s.meta), getShortCad(s.meta.id), s.meta, infraHex, sGrp);
            }
        });
    });

    // --- 6. ОТРИСОВКА ОХРАННЫХ ЗОН (ЗОУИТ) ---
    data.zouits.forEach(function (z) {
        var textForColor = z.meta.rawText;
        var color = getZouitColorHex(textForColor);
        var labelHex = "#" + new THREE.Color(color).getHexString();
        var zFightingOffset = Math.random() * 0.45;

        z.polygons.forEach(function (poly) {
            if (!poly || !poly[0] || poly[0].length < 2) return;
            var zGrp = new THREE.Group();
            var midPt = null, h = 5;

            if (z.type === "Line") {
                h = z.meta.isElectric ? 5 : (z.meta.isGas ? 6 : 8);
                h += zFightingOffset;

                var pts = poly[0].map(function (p) { return new THREE.Vector3(p.x, h / 2, -p.y); });
                var zone = new THREE.Mesh(
                    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, z.meta.isElectric ? 6 : 4, 16, false),
                    new THREE.MeshPhysicalMaterial({ color: color, transmission: 0.45, transparent: true, opacity: 0.38, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide })
                );
                zGrp.add(zone);
                midPt = pts[Math.floor(pts.length / 2)];
            } else {
                var shape = createShape(poly);
                if (shape.getPoints().length > 2) {
                    h = z.meta.isElectric ? 4.5 : (z.meta.isGas ? 5.5 : (z.meta.isHeat ? 6.5 : 8.0));
                    h += zFightingOffset;

                    var extGeo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
                    var mesh = new THREE.Mesh(
                        extGeo,
                        new THREE.MeshPhysicalMaterial({ color: color, transmission: 0.5, transparent: true, opacity: 0.28, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide })
                    );
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.y = 0.8 + (zFightingOffset * 0.1);

                    zGrp.add(mesh);
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(extGeo), new THREE.LineBasicMaterial({ color: color, linewidth: 2, transparent: true, opacity: 0.85 })));
                    var c = getCentroid(poly[0]);
                    midPt = { x: c.x, y: h + 3.5, z: c.z };
                }
            }
            if (zGrp.children.length > 0) {
                attachMeta(zGrp, z.meta, getZouitShort(z.meta));
                sceneGroups.zouit.add(zGrp);
                if (midPt) addLabel(midPt, 2, getZouitShort(z.meta), getShortCad(z.meta.id), z.meta, labelHex, zGrp);
            }
        });
    });

    // --- ПАНЕЛЬ СЛОЕВ И ИНТЕРФЕЙС ---
    var uiContainer = document.getElementById("layers-container");

    var addLayerUi = function (name, color, groupRef, dataArray) {
        if (!dataArray || dataArray.length === 0) return;

        var isDefaultVisible = (name !== "Наложения");
        groupRef.visible = isDefaultVisible;
        groupRef.children.forEach(function (child) { child.visible = isDefaultVisible; });

        if (!isDefaultVisible) {
            labelsData.forEach(function (l) {
                if (l.groupData && dataArray.some(d => d.meta.id === l.groupData.id && d.meta.rawText === l.groupData.rawText)) {
                    l.el.style.display = "none";
                }
            });
        }

        var groupContainer = document.createElement("div");
        groupContainer.style.marginBottom = "8px";

        var header = document.createElement("div");
        header.className = "layer-control";

        var cbAll = document.createElement("input");
        cbAll.type = "checkbox";
        cbAll.checked = isDefaultVisible;

        var colorBox = document.createElement("div");
        colorBox.className = "color-box";
        colorBox.style.background = color;

        var label = document.createElement("label");
        label.textContent = name + " (" + dataArray.length + ")";
        label.style.flexGrow = "1";

        var expandBtn = document.createElement("button");
        expandBtn.innerHTML = "▼";
        expandBtn.style.cssText = "background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:12px; padding:4px 8px; border-radius:4px;";
        expandBtn.onmouseover = function () { this.style.background = "var(--border-color)"; };
        expandBtn.onmouseout = function () { this.style.background = "none"; };

        header.appendChild(cbAll);
        header.appendChild(colorBox);
        header.appendChild(label);

        if (name === "Здания (ОКС)") {
            var toggleProcBtn = document.createElement("button");
            toggleProcBtn.innerHTML = '<i class="fas fa-magic"></i>';
            toggleProcBtn.title = "Скрыть/Показать условные (сгенерированные) ОКС";
            toggleProcBtn.style.cssText = "background:none; border:none; color:#8b5cf6; cursor:pointer; font-size:13px; padding:2px 6px; border-radius:4px; margin-left: auto;";
            let procVisible = true;

            toggleProcBtn.onmouseover = function () { this.style.background = "var(--border-color)"; };
            toggleProcBtn.onmouseout = function () { this.style.background = "none"; };

            toggleProcBtn.onclick = function (e) {
                e.stopPropagation();
                procVisible = !procVisible;
                toggleProcBtn.style.opacity = procVisible ? "1" : "0.3";
                groupRef.children.forEach(function (child) {
                    if (child.userData && child.userData.meta && child.userData.meta.isProcedural) {
                        child.visible = procVisible && cbAll.checked;
                    }
                });
                labelsData.forEach(function (l) {
                    if (l.groupData && l.groupData.isProcedural) {
                        l.el.style.display = (procVisible && cbAll.checked) ? "" : "none";
                    }
                });
            };
            header.appendChild(toggleProcBtn);
        }

        var hasUniqueItems = false;
        var uniqueItems = {};

        dataArray.forEach(function (item) {
            var id = item.meta.id || "Без номера";
            if (!uniqueItems[id]) uniqueItems[id] = [];
            uniqueItems[id].push(item);
        });
        if (Object.keys(uniqueItems).length > 0) {
            hasUniqueItems = true;
            header.appendChild(expandBtn);
        }

        groupContainer.appendChild(header);

        var subList = document.createElement("div");
        subList.style.cssText = "margin-left: 28px; display: none; flex-direction: column; gap: 6px; margin-top: 8px; margin-bottom: 12px; max-height: 200px; overflow-y: auto; padding-right: 4px;";

        var itemCheckboxes = [];

        if (hasUniqueItems) {
            Object.keys(uniqueItems).forEach(function (id) {
                var subItem = document.createElement("div");
                subItem.style.cssText = "display: flex; align-items: flex-start; font-size: 12px; color: var(--text-color); gap: 8px;";

                var cb = document.createElement("input");
                cb.type = "checkbox";
                cb.checked = isDefaultVisible;
                cb.dataset.id = id;
                cb.style.margin = "2px 0 0 0"; cb.style.width = "14px"; cb.style.height = "14px";
                itemCheckboxes.push(cb);

                var subLabel = document.createElement("span");

                let iconHtml = "";
                let itemMeta = uniqueItems[id][0].meta;
                if (itemMeta.isProcedural) {
                    iconHtml = '<i class="fas fa-magic" title="Сгенерировано (условные границы)" style="color:#8b5cf6; font-size:11px; margin-right:5px;"></i>';
                } else if (itemMeta.isSpatial && name !== "Участки (ЗУ)" && name !== "Наложения" && name !== "Целевой объект") {
                    iconHtml = '<i class="fas fa-crosshairs" title="Реальные координаты" style="color:#10b981; font-size:11px; margin-right:5px;"></i>';
                }

                subLabel.innerHTML = iconHtml + id;
                subLabel.style.cursor = "pointer";
                subLabel.style.wordBreak = "break-all";
                subLabel.title = itemMeta.name;

                subLabel.onmouseover = function () { this.style.color = "var(--btn-text)"; };
                subLabel.onmouseout = function () { this.style.color = "var(--text-color)"; };

                subItem.appendChild(cb);
                subItem.appendChild(subLabel);
                subList.appendChild(subItem);

                cb.addEventListener("change", function (e) {
                    var isVisible = e.target.checked;
                    groupRef.children.forEach(function (child) {
                        if (child.userData && child.userData.meta && child.userData.meta.id === id) {
                            child.visible = isVisible;
                        }
                    });
                    labelsData.forEach(function (l) {
                        if (l.groupData && l.groupData.id === id) {
                            l.el.style.display = isVisible ? "" : "none";
                        }
                    });
                    var allChecked = itemCheckboxes.every(c => c.checked);
                    var someChecked = itemCheckboxes.some(c => c.checked);
                    cbAll.checked = allChecked;
                    cbAll.indeterminate = someChecked && !allChecked;
                    groupRef.visible = someChecked;
                });

                subLabel.addEventListener("click", function () {
                    var targetMesh = groupRef.children.find(c => c.userData && c.userData.meta && c.userData.meta.id === id);
                    if (targetMesh) {
                        if (name === "Наложения") enterIsolationMode(targetMesh);
                        else flyToMesh(targetMesh);
                    }
                });
            });

            expandBtn.addEventListener("click", function () {
                var isOpen = subList.style.display === "flex";
                subList.style.display = isOpen ? "none" : "flex";
                expandBtn.innerHTML = isOpen ? "▼" : "▲";
            });
            groupContainer.appendChild(subList);
        }

        syncVisibility.push(() => {
            var isVisibleAll = cbAll.checked;
            if (hasUniqueItems) {
                itemCheckboxes.forEach(cb => {
                    var isVis = cb.checked;
                    var id = cb.dataset.id;
                    groupRef.children.forEach(child => {
                        if (child.userData && child.userData.meta && child.userData.meta.id === id) child.visible = isVis;
                    });
                    labelsData.forEach(l => {
                        if (l.groupData && l.groupData.id === id) l.el.style.display = isVis ? "" : "none";
                    });
                });
                groupRef.visible = itemCheckboxes.some(c => c.checked);
            } else {
                groupRef.visible = isVisibleAll;
                groupRef.children.forEach(child => child.visible = isVisibleAll);
                labelsData.forEach(l => {
                    if (l.groupData && dataArray.some(d => d.meta.id === l.groupData.id)) l.el.style.display = isVisibleAll ? "" : "none";
                });
            }
        });

        cbAll.addEventListener("change", function (e) {
            var isVisible = e.target.checked;
            itemCheckboxes.forEach(function (cb) { cb.checked = isVisible; });
            groupRef.visible = isVisible;
            groupRef.children.forEach(function (child) { child.visible = isVisible; });

            labelsData.forEach(function (l) {
                if (l.groupData && dataArray.some(d => d.meta.id === l.groupData.id && d.meta.rawText === l.groupData.rawText)) {
                    l.el.style.display = isVisible ? "" : "none";
                }
            });
        });

        uiContainer.appendChild(groupContainer);
    };

    addLayerUi("Целевой объект", "#3b82f6", sceneGroups.target, data.target);
    addLayerUi("Участки (ЗУ)", "#10b981", sceneGroups.parcels, data.parcels);
    addLayerUi("Наложения", "#dc2626", sceneGroups.intersections, data.intersections);
    addLayerUi("Здания (ОКС)", "#3b82f6", sceneGroups.buildings, data.buildings);
    addLayerUi("Инфраструктура", "#f59e0b", sceneGroups.structures, data.structures);
    addLayerUi("ЗОУИТ", "#8b5cf6", sceneGroups.zouit, data.zouits);

    var groundControl = document.createElement("div");
    groundControl.style.cssText = "margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px; display: flex; flex-direction: column; gap: 12px;";
    groundControl.innerHTML = \`
        <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size:13px;font-weight:600;">Подложка:</label>
            <input type="color" id="ground-color-picker" value="\${currentGroundColor}" style="border:none;width:24px;height:24px;cursor:pointer;background:none;padding:0;">
            <select id="ground-texture-picker" style="padding:4px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:12px; outline:none; max-width: 150px;">
                <option value="grid" \${currentGroundTex === 'grid' ? 'selected' : ''}>Сетка</option>
                <option value="checker" \${currentGroundTex === 'checker' ? 'selected' : ''}>Шахматы</option>
                <option value="solid" \${currentGroundTex === 'solid' ? 'selected' : ''}>Сплошной</option>
                <optgroup label="Спутник / Карты">
                    <option value="gsat" \${currentGroundTex === 'gsat' ? 'selected' : ''}>Спутник</option>
                    <option value="ghyb" \${currentGroundTex === 'ghyb' ? 'selected' : ''}>Гибрид</option>
                    <option value="osm" \${currentGroundTex === 'osm' ? 'selected' : ''}>Схема OSM</option>
                </optgroup>
            </select>
        </div>
        <div style="width: 100%;">
            <label style="font-size:12px;font-weight:600;display:flex;justify-content:space-between;color:var(--text-muted);">
                Заливка ЗУ: <span id="parcel-opacity-val">${Math.round(savedParcelOpacity * 100)}%</span>
            </label>
            <input type="range" id="parcel-opacity-slider" min="0" max="1" step="0.05" value="${savedParcelOpacity}" style="width:100%; accent-color:#10b981; cursor:pointer; margin-top:4px;">
        </div>
    \`;
    uiContainer.appendChild(groundControl);

    document.getElementById("parcel-opacity-slider").addEventListener("input", function (e) {
        const val = parseFloat(e.target.value);
        document.getElementById("parcel-opacity-val").innerText = Math.round(val * 100) + "%";
        currentParcelOpacity = val;

        if (sceneGroups && sceneGroups.parcels) {
            sceneGroups.parcels.children.forEach(group => {
                group.children.forEach(child => {
                    if (child.isMesh && child.material) child.material.opacity = val;
                });
            });
        }
        window.parent.postMessage({ type: 'setParcelOpacity', opacity: val }, '*');
    });

    const applyGroundSettings = () => {
        const newColor = document.getElementById("ground-color-picker").value;
        const newTex = document.getElementById("ground-texture-picker").value;
        window.parent.postMessage({ type: 'saveGroundSettings', color: newColor, tex: newTex }, '*');

        currentGroundColor = newColor;
        currentGroundTex = newTex;

        const isMapTile = ['osm', 'gsat', 'ghyb'].includes(newTex);

        if (isMapTile) {
            ground.visible = false;
        } else {
            ground.visible = true;
            ground.material.color.setHex(parseInt(newColor.replace('#', '0x')));
            if (newTex === 'solid') {
                ground.material.map = null;
            } else {
                ground.material.map = createGroundTexture(newTex, newColor);
            }
            ground.material.needsUpdate = true;
        }

        if (typeof window.loadMapTiles === 'function') {
            window.loadMapTiles(newTex);
        }
    };

    document.getElementById("ground-color-picker").addEventListener("input", applyGroundSettings);
    document.getElementById("ground-texture-picker").addEventListener("change", applyGroundSettings);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredMesh = null;

    const setHighlight = (obj, isHover) => {
        obj.traverse(function (child) {
            if (child.userData.origEmissive !== undefined) {
                const highlightColor = 0x3b82f6;
                const applyEmission = (mat, origVal) => {
                    if (mat && mat.emissive) {
                        mat.emissive.setHex(isHover ? highlightColor : (currentTheme === 'dark' && windowMaterialCache[Object.keys(windowMaterialCache).find(k => windowMaterialCache[k] === mat)] ? 0x3b2810 : origVal));
                    }
                };
                if (Array.isArray(child.material)) {
                    child.material.forEach((m, i) => { applyEmission(m, child.userData.origEmissive[i]); });
                } else {
                    applyEmission(child.material, child.userData.origEmissive);
                }
            }
        });
    };

    window.addEventListener("mousemove", function (e) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const hits = raycaster.intersectObjects(interactables, false);
        let validHit = null;
        for (let i = 0; i < hits.length; i++) {
            let obj = hits[i].object;
            let isVisible = true;
            while (obj) {
                if (obj.visible === false) { isVisible = false; break; }
                obj = obj.parent;
            }
            if (isVisible) { validHit = hits[i]; break; }
        }

        if (validHit) {
            let hitMesh = validHit.object;
            let parentObj = hitMesh.userData.parentMetaObj || hitMesh;

            if (hoveredMesh !== parentObj) {
                if (hoveredMesh) setHighlight(hoveredMesh, false);
                hoveredMesh = parentObj;
                setHighlight(hoveredMesh, true);

                document.body.style.cursor = "pointer";
                let mData = hoveredMesh.userData.meta;
                tooltip.innerHTML = buildTooltipHTML(hoveredMesh.userData.category, mData);
                tooltip.style.opacity = "1";
            }
            tooltip.style.left = (e.clientX + 15) + "px";
            tooltip.style.top = (e.clientY + 15) + "px";
        } else {
            if (hoveredMesh) {
                setHighlight(hoveredMesh, false);
                hoveredMesh = null;
                document.body.style.cursor = "default";
                tooltip.style.opacity = "0";
            }
        }
    });

    window.addEventListener("dblclick", function () {
        if (hoveredMesh) flyToMesh(hoveredMesh);
    });

    var exportBtn = document.getElementById("export-html-btn");
    if (exportBtn) {
        exportBtn.onclick = function () { window.parent.postMessage({ type: 'export3DHtml' }, '*'); };
    }

    window.addEventListener("resize", function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const tempVec = new THREE.Vector3();
    function updateLabels() {
        let hw = window.innerWidth / 2, hh = window.innerHeight / 2;
        let visibleLabels = [];

        for (let i = 0; i < labelsData.length; i++) {
            let l = labelsData[i];
            if (!l.el.parentElement || l.el.style.display === "none") continue;

            let dist = camera.position.distanceTo(l.pos);
            if (dist > 850 && l.priority < 8) { l.el.style.opacity = "0"; l.el.style.pointerEvents = "none"; continue; }

            tempVec.copy(l.pos).project(camera);
            if (tempVec.z > 1) { l.el.style.opacity = "0"; l.el.style.pointerEvents = "none"; continue; }

            let x = (tempVec.x * hw) + hw; let y = -(tempVec.y * hh) + hh;
            l.el.style.transform = "translate(-50%, -50%) translate3d(" + x + "px, " + y + "px, 0)";
            if (!l.el.style.zIndex || l.el.style.zIndex !== "9999") l.el.style.zIndex = Math.round(1000 - dist);

            if (dist < 220 || l.priority > 7) l.el.classList.add("show-text"); else l.el.classList.remove("show-text");

            l.box2D = { left: x - 15, right: x + (l.el.classList.contains("show-text") ? 105 : 15), top: y - 15, bottom: y + 15 };
            visibleLabels.push(l);
        }

        visibleLabels.sort(function (a, b) { return b.priority - a.priority; });
        let activeBoxes = [];

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

    const altValueEl = document.getElementById("alt-value");

    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        if (typeof updateSliderFromCamera === 'function') updateSliderFromCamera();

        if (altValueEl) {
            let alt = Math.max(1, camera.position.y);
            if (alt < 1000) {
                altValueEl.textContent = "Высота: " + Math.round(alt) + " м";
            } else {
                altValueEl.textContent = "Высота: " + (alt / 1000).toFixed(2) + " км";
            }
        }

        var time = performance.now() * 0.0025;
        animateables.forEach(function (obj) {
            if (obj.userData.baseY !== undefined) {
                obj.position.y = obj.userData.baseY + Math.sin(time + obj.userData.offset) * 1.5;
            }
        });

        // Мягкая пульсация акцентов (контур целевого участка и зоны наложения)
        pulseMaterials.forEach(function (mat) {
            if (mat.emissiveIntensity !== undefined) {
                mat.emissiveIntensity = 0.3 + Math.sin(time * 2.0) * 0.2;
            }
        });

        updateLabels();
        renderer.render(scene, camera);
    }

    const loaderWrapper = document.getElementById('cube-loader-wrapper');
    if (loaderWrapper) {
        loaderWrapper.style.opacity = '0';
        setTimeout(() => { loaderWrapper.style.visibility = 'hidden'; }, 500);
    }

    animate();

} catch (err) {
    document.body.innerHTML += "<div style='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);padding:24px;border-radius:12px;color:#fca5a5;font-size:14px;z-index:1000;max-width:500px;'><b>Ошибка:</b><br>" + err.message + "<br><small>" + (err.stack || "") + "</small></div>";
}
<\/script>
</body>
</html>`;

            iframe.srcdoc = srcDocContent;
            modal.appendChild(iframe);
            document.body.appendChild(modal);

            const messageHandler = (e) => {
                if (e.data && e.data.type === 'saveGroundSettings') {
                    localStorage.setItem('3d_ground_color', e.data.color);
                    localStorage.setItem('3d_ground_texture', e.data.tex);
                }
                if (e.data && e.data.type === 'setTheme') {
                    const newTheme = e.data.theme;
                    localStorage.setItem('3d_viewer_theme', newTheme);
                    modal.dataset.theme = newTheme;
                    modal.style.backgroundColor = newTheme === 'dark' ? '#0f172a' : '#ffffff';
                    header.style.background = newTheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
                    header.style.color = newTheme === 'dark' ? '#f8fafc' : '#1e293b';
                    themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
                }

                if (e.data && e.data.type === 'setParcelOpacity') {
                    localStorage.setItem('3d_parcel_opacity', e.data.opacity);
                }

                if (e.data && e.data.type === 'export3DHtml') {
                    const latestTheme = localStorage.getItem('3d_viewer_theme') || 'light';
                    const latestColor = localStorage.getItem('3d_ground_color') || '#e2e8f0';
                    const latestTex = 'gsat';
                    const rawLatestOpacity = parseFloat(localStorage.getItem('3d_parcel_opacity'));
                    const latestParcelOpacity = isNaN(rawLatestOpacity) ? 0.45 : rawLatestOpacity;

                    let exportStr = srcDocContent;

                    exportStr = exportStr.replace(/<div class="export-block"[^>]*>[\s\S]*?<\/div>/, '');

                    exportStr = exportStr.replace(`let currentTheme = "${savedTheme}";`, `let currentTheme = "${latestTheme}";`);
                    exportStr = exportStr.replace(`let currentGroundColor = "${savedGroundColor}";`, `let currentGroundColor = "${latestColor}";`);
                    exportStr = exportStr.replace(`let currentGroundTex = "${savedGroundTex}";`, `let currentGroundTex = "${latestTex}";`);
                    exportStr = exportStr.replace(`body data-theme="${savedTheme}"`, `body data-theme="${latestTheme}"`);

                    exportStr = exportStr.replace(`let currentParcelOpacity = ${savedParcelOpacity};`, `let currentParcelOpacity = ${latestParcelOpacity};`);
                    exportStr = exportStr.replace(`value="${savedParcelOpacity}"`, `value="${latestParcelOpacity}"`);
                    exportStr = exportStr.replace(`>${Math.round(savedParcelOpacity * 100)}%<`, `>${Math.round(latestParcelOpacity * 100)}%<`);

                    const blob = new Blob([exportStr], { type: "text/html;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "3D_Cadastral_" + new Date().toISOString().slice(0, 10) + ".html";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    if (typeof showNotification === 'function') {
                        showNotification("Интерактивный HTML сохранен", "success");
                    }
                }
            };
            window.addEventListener('message', messageHandler);

            const cleanupAndClose = () => {
                window.isGlobalMapMode = false;
                modal.remove();
                window.removeEventListener('message', messageHandler);
                document.removeEventListener('keydown', escHandler);
            };

            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanupAndClose();
                }
            };

            closeBtn.onclick = cleanupAndClose;
            document.addEventListener('keydown', escHandler);

        } catch (error) {
            if (typeof showNotification === 'function') {
                showNotification("Ошибка генерации 3D сцены: " + error.message, "error");
            }
        }
    }, 100);
};    