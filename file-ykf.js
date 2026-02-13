async function drawAllObjectsToCanvas(mainObject, otherObjects, showPoints = true, underlyingParcels = [], options = {}) {
    const canvasWidth = 800;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const padding = 40;

    const { transparent = false, drawMain = true } = options;

    const destSc = localStorage.getItem('savedDefaultMskSystem') || 'EPSG:6331602';
    const destSystem = COORDINATE_SYSTEMS.find(s => s.value === destSc);
    if (!destSystem) throw new Error(`Определение для ${destSc} не найдено.`);

    const mskName = destSystem.text || 'МСК';

    const isAutoLoadEnabled = (localStorage.getItem('autoLoadMskOffset') !== 'false');
    const mskOffsetX = isAutoLoadEnabled ? (destSystem.offsetX || 0) : (parseFloat((localStorage.getItem('savedMskOffsetX') || '0').replace(',', '.')) || 0);
    const mskOffsetY = isAutoLoadEnabled ? (destSystem.offsetY || 0) : (parseFloat((localStorage.getItem('savedMskOffsetY') || '0').replace(',', '.')) || 0);

    const underlyingCadNumbers = new Set((underlyingParcels || []).map(f => f.properties.descr));

    const processObject = (obj) => {
        if (!obj) {
            return null;
        }

        let cadNum, type, color, geometry, isYmapsObject = false;

        if (obj instanceof ymaps.Polygon) {
            isYmapsObject = true;
            geometry = obj.geometry.getCoordinates();
        } else if (obj.type === 'Feature' && obj.geometry) {
            geometry = obj.geometry.type === 'Polygon' ? [obj.geometry.coordinates] : obj.geometry.coordinates;
        } else {
            return null;
        }

        const featureData = isYmapsObject ? obj.properties.get('featureData') : obj;
        const props = (featureData && featureData.properties) ? featureData.properties : {};
        const opts = props.options || {};

        const isBuilding = (isYmapsObject ? obj.properties.get('isBuilding') : false) || props.categoryName === 'Здания' || props._report_type === 'building';
        const isStructure = (isYmapsObject ? obj.properties.get('isStructure') : false) || props.categoryName === 'Сооружения' || props._report_type === 'structure';
        const isZouit = (isYmapsObject ? obj.properties.get('isZouit') : false) || props.categoryName === 'Зоны с особыми условиями использования территорий' || props._report_type === 'zouit';

        if (isBuilding) {
            type = 'Здание';
            color = polygonStyle.buildingsColor;
        } else if (isStructure) {
            type = 'Сооружение';
            color = polygonStyle.structuresColor;
        } else if (isZouit) {
            type = 'ЗОУИТ';
            color = getZouitColor(opts.name_by_doc || props.descr);
        } else {
            type = 'ЗУ';
            const isPolygonDeclared = isYmapsObject ? isDeclared(obj) : isDeclared({ properties: { get: (key) => key === 'featureData' ? featureData : undefined } });
            color = isPolygonDeclared ? polygonStyle.declaredParcelsColor : polygonStyle.parcelsColor;
        }

        cadNum = opts.cad_num || opts.cad_number || opts.reg_numb_border || props.descr || 'Объект';
        if (underlyingCadNumbers.has(cadNum)) {
            color = '#FFA500';
        }

        const projectedRings = [];
        geometry.forEach(ringOrPolygon => {
            const ring = Array.isArray(ringOrPolygon[0][0]) ? ringOrPolygon[0] : ringOrPolygon;
            projectedRings.push(ring.map(coord => {
                if (isYmapsObject) {
                    const trueLat = coord[0] + (mapOffsetY * 0.000008983);
                    const trueLon = coord[1] + (mapOffsetX * 0.000008983);
                    return { projected: proj4('EPSG:4326', 'EPSG:3857', [trueLon, trueLat]), original: [trueLat, trueLon] };
                } else {
                    return { projected: coord, original: proj4('EPSG:3857', 'EPSG:4326', coord).reverse() };
                }
            }));
        });

        return { name: cadNum, type, color, projectedRings, isZouit };
    };

    const mainObjectInfo = processObject(mainObject);
    const otherObjectsInfo = otherObjects.map(processObject).filter(Boolean);
    const objectDrawInfo = [mainObjectInfo, ...otherObjectsInfo].filter(Boolean);

    let bboxCoords = [];
    if (mainObjectInfo && mainObjectInfo.projectedRings) {
        mainObjectInfo.projectedRings.forEach(ring => ring.forEach(p => bboxCoords.push(p.projected)));
    }

    if (bboxCoords.length === 0) { return { image: null, coordsTable: '' }; }

    const minX = Math.min(...bboxCoords.map(p => p[0]));
    const maxX = Math.max(...bboxCoords.map(p => p[0]));
    const minY = Math.min(...bboxCoords.map(p => p[1]));
    const maxY = Math.max(...bboxCoords.map(p => p[1]));

    const projectedWidth = maxX - minX;
    const projectedHeight = maxY - minY;

    const effectiveWidth = projectedWidth > 0 ? projectedWidth : 1;

    const scale = (canvasWidth - padding * 2) / effectiveWidth;
    canvas.width = canvasWidth;
    canvas.height = projectedHeight * scale + padding * 2;

    const cOffsetX = (canvas.width - projectedWidth * scale) / 2;
    const cOffsetY = (canvas.height - projectedHeight * scale) / 2;

    if (transparent) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let allTablesHtml = '';
    const drawnLabelBounds = [];

    objectDrawInfo.forEach((info, idx) => {
        const isMain = idx === 0;
        if (isMain && !drawMain) return;

        const { projectedRings, color, name, type, isZouit } = info;
        let pointCounterForObject = 1;
        let currentObjectTableBody = '';

        projectedRings.forEach(ring => {
            ctx.beginPath();
            let canvasPoints = [];

            ring.forEach((pointData, index) => {
                const { projected, original } = pointData;
                const x = cOffsetX + (projected[0] - minX) * scale;
                const y = canvas.height - (cOffsetY + (projected[1] - minY) * scale);

                canvasPoints.push({ x, y });

                if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);

                const mskCoords = convertWgs84ToMskWithOffset([[original[1], original[0]]], destSc, destSystem.def, mskOffsetX, mskOffsetY).split('\t');

                if (showPoints) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(x - 2, y - 2, 4, 4);
                    ctx.font = '10px Arial';
                    ctx.fillText(`${pointCounterForObject}`, x + 5, y - 5);
                    currentObjectTableBody += `<tr><td>${pointCounterForObject}</td><td>${mskCoords[0]}</td><td>${mskCoords[1]}</td></tr>`;
                } else {
                    currentObjectTableBody += `<tr><td>${mskCoords[0]}</td><td>${mskCoords[1]}</td></tr>`;
                }
                pointCounterForObject++;
            });

            ctx.closePath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;

            if (isZouit) {
                ctx.setLineDash([5, 3]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.stroke();
            ctx.fillStyle = `${color}33`;
            ctx.fill();

            ctx.setLineDash([]);

            if (name && name !== 'Объект') {
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const textMetrics = ctx.measureText(name);
                const labelWidth = textMetrics.width + 10;
                const labelHeight = 12 + 10;
                const labelPadH = 5;
                const labelPadV = 4;

                const isOverlapping = (x, y) => {
                    const newLabelBox = { left: x - labelWidth / 2, right: x + labelWidth / 2, top: y - labelHeight / 2, bottom: y + labelHeight / 2 };
                    for (const box of drawnLabelBounds) {
                        if (newLabelBox.left < box.right && newLabelBox.right > box.left && newLabelBox.top < box.bottom && newLabelBox.bottom > box.top) return true;
                    }
                    return false;
                };

                const visiblePoints = canvasPoints.filter(p => p.x >= 0 && p.x <= canvas.width && p.y >= 0 && p.y <= canvas.height);
                if (visiblePoints.length === 0) return;

                const visMinX = Math.min(...visiblePoints.map(p => p.x));
                const visMaxX = Math.max(...visiblePoints.map(p => p.x));
                const visMinY = Math.min(...visiblePoints.map(p => p.y));
                const visMaxY = Math.max(...visiblePoints.map(p => p.y));
                const centerX = (visMinX + visMaxX) / 2;
                const centerY = (visMinY + visMaxY) / 2;

                const isSkinny = (visMaxX - visMinX < labelWidth) || (visMaxY - visMinY < labelHeight);
                const centerIsOffscreen = centerX < padding || centerX > canvas.width - padding || centerY < padding || centerY > canvas.height - padding;

                let finalX, finalY;
                let anchorPoint = { x: centerX, y: centerY };
                let needsLeaderLine = isSkinny || centerIsOffscreen;

                if (!needsLeaderLine) {
                    const offsets = [{ x: 0, y: 0 }, { x: 0, y: -20 }, { x: 0, y: 20 }, { x: -30, y: 0 }, { x: 30, y: 0 }];
                    for (const offset of offsets) {
                        if (!isOverlapping(centerX + offset.x, centerY + offset.y)) {
                            finalX = centerX + offset.x;
                            finalY = centerY + offset.y;
                            break;
                        }
                    }
                    if (finalX === undefined) {
                        needsLeaderLine = true;
                    }
                }

                if (needsLeaderLine) {
                    let closestVisiblePoint = visiblePoints[0];
                    let minDistanceSq = Infinity;
                    visiblePoints.forEach(p => {
                        const distSq = Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2);
                        if (distSq < minDistanceSq) {
                            minDistanceSq = distSq;
                            closestVisiblePoint = p;
                        }
                    });
                    anchorPoint = closestVisiblePoint;

                    const targetX = anchorPoint.x > canvas.width / 2 ? canvas.width - padding : padding;
                    const targetY = anchorPoint.y > canvas.height / 2 ? canvas.height - padding : padding;

                    for (let i = 0; i < 5; i++) {
                        let testX = targetX + (i % 2 === 0 ? i * 15 : -i * 15);
                        let testY = targetY;
                        if (!isOverlapping(testX, testY)) {
                            finalX = testX;
                            finalY = testY;
                            break;
                        }
                    }
                }

                if (finalX !== undefined) {
                    if (needsLeaderLine) {
                        ctx.beginPath();
                        ctx.moveTo(anchorPoint.x, anchorPoint.y);
                        ctx.lineTo(finalX, finalY);
                        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }

                    // Белый фон под меткой
                    const bgX = finalX - labelWidth / 2 - labelPadH;
                    const bgY = finalY - labelHeight / 2 - labelPadV;
                    const bgW = labelWidth + labelPadH * 2;
                    const bgH = labelHeight + labelPadV * 2;

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([]);

                    // Скруглённый прямоугольник
                    const radius = 4;
                    ctx.beginPath();
                    ctx.moveTo(bgX + radius, bgY);
                    ctx.lineTo(bgX + bgW - radius, bgY);
                    ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + radius);
                    ctx.lineTo(bgX + bgW, bgY + bgH - radius);
                    ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - radius, bgY + bgH);
                    ctx.lineTo(bgX + radius, bgY + bgH);
                    ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - radius);
                    ctx.lineTo(bgX, bgY + radius);
                    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();

                    // Цветной текст поверх белого фона
                    ctx.fillStyle = color;
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(name, finalX, finalY);

                    let boxX = finalX;
                    drawnLabelBounds.push({
                        left: boxX - labelWidth / 2 - labelPadH,
                        right: boxX + labelWidth / 2 + labelPadH,
                        top: finalY - labelHeight / 2 - labelPadV,
                        bottom: finalY + labelHeight / 2 + labelPadV
                    });
                }
            }
        });

        if (currentObjectTableBody && !isZouit) {
            const tableHeaders = showPoints
                ? `<thead><tr><th class="point-col">Номер точки</th><th>X (${mskName})</th><th>Y (${mskName})</th></tr></thead>`
                : `<thead><tr><th>X (${mskName})</th><th>Y (${mskName})</th></tr></thead>`;

            allTablesHtml += `
                <div class="section-title">Каталог координат: ${name} (${type})</div>
                <table>
                    ${tableHeaders}
                    <tbody>${currentObjectTableBody}</tbody>
                </table>`;
        }
    });

    return { image: canvas.toDataURL('image/png'), coordsTable: allTablesHtml };
}

async function generateConsolidatedReport(targetObject) {
    const delay = ms => new Promise(res => setTimeout(res, ms));
    showLoader("Формирование отчета...");

    try {
        if (!targetObject || !(targetObject instanceof ymaps.Polygon)) {
            throw new Error('Объект для формирования отчета не является полигоном.');
        }

        const targetPolygon = targetObject;
        const isRealObject = targetPolygon.properties.get('isParcelInQuarter') || targetPolygon.properties.get('isFoundInArea') || targetPolygon.properties.get('isParcelFromSingleSearch');
        const isManualObject = targetPolygon.properties.get('isManuallyDrawn');

        let mainObjectData;
        let underlyingParcelsResults = [];
        let oksIntersectionResults = [];
        let linkedOksResults = [];
        let mainObjectAreaInMeters;

        if (isRealObject) {
            const featureData = targetPolygon.properties.get('featureData');
            if (!featureData) throw new Error('Не удалось получить исходные данные из выбранного объекта.');

            const opts = featureData.properties.options || {};
            mainObjectData = {
                cadastralNumber: featureData.properties.descr, address: opts.readable_address, areaText: getAreaText(opts),
                category: opts.land_record_category_type, vri: opts.permitted_use_established_by_document,
                cost: parseFloat(opts.cost_value), ownershipType: opts.ownership_type, rightType: opts.right_type
            };

            const coordsForArea = targetPolygon.geometry.getCoordinates()[0];
            const turfPolyForArea = turf.polygon([coordsForArea.map(c => [c[1], c[0]])]);
            mainObjectAreaInMeters = turf.area(turfPolyForArea);

            showLoader('Поиск наложений с ЗУ...');
            const boundsForSearch = targetPolygon.geometry.getBounds();
            const bufferedBoundsForSearch = [
                [boundsForSearch[0][0] - 0.00005, boundsForSearch[0][1] - 0.00005],
                [boundsForSearch[1][0] + 0.00005, boundsForSearch[1][1] + 0.00005]
            ];
            const searchPolygonForApi = [
                [bufferedBoundsForSearch[0][1], bufferedBoundsForSearch[0][0]], [bufferedBoundsForSearch[1][1], bufferedBoundsForSearch[0][0]],
                [bufferedBoundsForSearch[1][1], bufferedBoundsForSearch[1][0]], [bufferedBoundsForSearch[0][1], bufferedBoundsForSearch[1][0]],
                [bufferedBoundsForSearch[0][1], bufferedBoundsForSearch[0][0]]
            ].map(coord => proj4("EPSG:4326", "EPSG:3857", coord));

            const fetchedCandidateFeatures = await searchParcelsByArea(searchPolygonForApi);

            if (fetchedCandidateFeatures.length > 0) {
                let searchTurfPoly = turf.polygon([coordsForArea.map(c => [c[1], c[0]])]);
                const bufferedSearchPoly = turf.buffer(searchTurfPoly, -0.005, { units: 'meters' });
                if (bufferedSearchPoly) searchTurfPoly = bufferedSearchPoly;

                fetchedCandidateFeatures.forEach(feature => {
                    if (feature.properties.descr === mainObjectData.cadastralNumber) return;
                    if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.type !== 'Polygon') return;

                    const featureWgsCoordsWithOffset = feature.geometry.coordinates[0].map(coord3857 => {
                        const wgsCoord = proj4('EPSG:3857', 'EPSG:4326', coord3857);
                        return [wgsCoord[0] - (mapOffsetX * 0.000008983), wgsCoord[1] - (mapOffsetY * 0.000008983)];
                    });
                    const targetTurfPoly = turf.polygon([featureWgsCoordsWithOffset]);

                    const intersectionGeometry = turf.intersect(turf.featureCollection([searchTurfPoly, targetTurfPoly]));

                    if (intersectionGeometry) {
                        const intersectionArea = turf.area(intersectionGeometry);
                        if (intersectionArea > 0.01) {
                            const percentage = (intersectionArea / mainObjectAreaInMeters) * 100;
                            underlyingParcelsResults.push({ feature, intersectionArea, percentage });
                        }
                    }
                });
            }
            linkedOksResults = await fetchLinkedOks(mainObjectData.cadastralNumber);

        } else if (isManualObject) {
            const coords = targetPolygon.geometry.getCoordinates()[0];
            const unbufferedTurfPoly = turf.polygon([coords.map(c => [c[1], c[0]])]);
            mainObjectAreaInMeters = turf.area(unbufferedTurfPoly);

            mainObjectData = {
                cadastralNumber: 'Созданный объект', address: 'Координаты указаны вручную',
                areaText: `${Math.round(mainObjectAreaInMeters).toLocaleString('ru-RU')} м² (примерно по географическим координатам)`,
            };

            showLoader('Загрузка участков в области...');
            const bounds = targetPolygon.geometry.getBounds();
            const bufferedBounds = [
                [bounds[0][0] - 0.00005, bounds[0][1] - 0.00005],
                [bounds[1][0] + 0.00005, bounds[1][1] + 0.00005]
            ];
            const searchPolygonForApi = [
                [bufferedBounds[0][1], bufferedBounds[0][0]], [bufferedBounds[1][1], bufferedBounds[0][0]],
                [bufferedBounds[1][1], bufferedBounds[1][0]], [bufferedBounds[0][1], bufferedBounds[1][0]],
                [bufferedBounds[0][1], bufferedBounds[0][0]]
            ].map(coord => proj4("EPSG:4326", "EPSG:3857", coord));

            const fetchedCandidateFeatures = await searchParcelsByArea(searchPolygonForApi);

            if (fetchedCandidateFeatures.length > 0) {
                showLoader('Поиск наложений...');

                let searchTurfPoly = turf.polygon([coords.map(c => [c[1], c[0]])]);
                const bufferedSearchPoly = turf.buffer(searchTurfPoly, -0.005, { units: 'meters' });
                if (bufferedSearchPoly) searchTurfPoly = bufferedSearchPoly;

                fetchedCandidateFeatures.forEach(feature => {
                    if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.type !== 'Polygon') return;

                    const featureWgsCoordsWithOffset = feature.geometry.coordinates[0].map(coord3857 => {
                        const wgsCoord = proj4('EPSG:3857', 'EPSG:4326', coord3857);
                        return [wgsCoord[0] - (mapOffsetX * 0.000008983), wgsCoord[1] - (mapOffsetY * 0.000008983)];
                    });
                    const targetTurfPoly = turf.polygon([featureWgsCoordsWithOffset]);

                    const intersectionGeometry = turf.intersect(turf.featureCollection([searchTurfPoly, targetTurfPoly]));

                    if (intersectionGeometry) {
                        const intersectionArea = turf.area(intersectionGeometry);
                        if (intersectionArea > 0.01) {
                            const percentage = (intersectionArea / mainObjectAreaInMeters) * 100;
                            underlyingParcelsResults.push({ feature, intersectionArea, percentage });
                        }
                    }
                });
            }
            await delay(100);
        } else {
            throw new Error('Не удалось определить тип выбранного объекта.');
        }

        const bounds = targetPolygon.geometry.getBounds();
        if (!bounds) throw new Error('Не удалось определить границы объекта для поиска.');

        const centerLat = (bounds[0][0] + bounds[1][0]) / 2;
        const centerLon = (bounds[0][1] + bounds[1][1]) / 2;

        const oksResults = await searchFeaturesByGeometry(targetPolygon, 36369);

        if (oksResults.length > 0) {
            showLoader('Анализ наложений с ОКС...');
            const searchCoords = targetPolygon.geometry.getCoordinates()[0];
            const searchTurfPoly = turf.polygon([searchCoords.map(c => [c[1], c[0]])]);

            oksResults.forEach(feature => {
                if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.type !== 'Polygon') return;

                const featureWgsCoordsWithOffset = feature.geometry.coordinates[0].map(coord3857 => {
                    const wgsCoord = proj4('EPSG:3857', 'EPSG:4326', coord3857);
                    return [wgsCoord[0] - (mapOffsetX * 0.000008983), wgsCoord[1] - (mapOffsetY * 0.000008983)];
                });
                const targetTurfPoly = turf.polygon([featureWgsCoordsWithOffset]);

                const intersectionGeometry = turf.intersect(turf.featureCollection([searchTurfPoly, targetTurfPoly]));

                if (intersectionGeometry) {
                    const intersectionArea = turf.area(intersectionGeometry);
                    if (intersectionArea > 0.01) {
                        const percentage = (intersectionArea / mainObjectAreaInMeters) * 100;
                        oksIntersectionResults.push({ feature, intersectionArea, percentage });
                    }
                }
            });
        }

        await delay(100);
        const structuresResults = await searchFeaturesByGeometry(targetPolygon, 36383);
        await delay(100);
        const zouitResults = await searchFeaturesByGeometry(targetPolygon, 36940);
        await delay(100);

        const terrZoneResults = await searchContainingObjectByPoint(centerLat, centerLon, 36315, targetPolygon);
        await delay(100);
        const settlementsResults = await searchContainingObjectByPoint(centerLat, centerLon, 36281, targetPolygon);
        await delay(100);
        const municipalResults = await searchContainingObjectByPoint(centerLat, centerLon, 36278, targetPolygon);
        await delay(100);
        const forestryResults = await searchContainingObjectByPoint(centerLat, centerLon, 36314, targetPolygon);

        oksResults.forEach(f => f.properties._report_type = 'building');
        structuresResults.forEach(f => f.properties._report_type = 'structure');
        const mainSchemeOtherObjects = [...oksResults, ...structuresResults];

        const underlyingParcelsForDrawing = underlyingParcelsResults.map(item => item.feature);
        const { image: mainSchemeWithPoints, coordsTable } = await drawAllObjectsToCanvas(targetPolygon, mainSchemeOtherObjects, true);
        const { image: mainSchemeWithoutPoints } = await drawAllObjectsToCanvas(targetPolygon, mainSchemeOtherObjects, false);

        let parcelsSchemeWithPoints = null;
        let parcelsSchemeWithoutPoints = null;
        if (underlyingParcelsResults.length > 0) {
            const { image: imageParcelsWithPoints } = await drawAllObjectsToCanvas(targetPolygon, underlyingParcelsForDrawing, true, underlyingParcelsForDrawing);
            parcelsSchemeWithPoints = imageParcelsWithPoints;
            const { image: imageParcelsWithoutPoints } = await drawAllObjectsToCanvas(targetPolygon, underlyingParcelsForDrawing, false, underlyingParcelsForDrawing);
            parcelsSchemeWithoutPoints = imageParcelsWithoutPoints;
        }

        let oksSchemeWithPoints = null;
        let oksSchemeWithoutPoints = null;
        if (oksIntersectionResults.length > 0) {
            const oksForDrawing = oksIntersectionResults.map(item => item.feature);
            oksForDrawing.forEach(f => f.properties._report_type = 'building');
            const { image: imageOksWithPoints } = await drawAllObjectsToCanvas(targetPolygon, oksForDrawing, true);
            oksSchemeWithPoints = imageOksWithPoints;
            const { image: imageOksWithoutPoints } = await drawAllObjectsToCanvas(targetPolygon, oksForDrawing, false);
            oksSchemeWithoutPoints = imageOksWithoutPoints;
        }

        let zouitScheme = null;
        if (zouitResults.length > 0) {
            const zouitsForDrawing = zouitResults.map(f => {
                const clone = JSON.parse(JSON.stringify(f));
                if (!clone.properties) clone.properties = {};
                clone.properties._report_type = 'zouit';
                return clone;
            });

            const { image } = await drawAllObjectsToCanvas(targetPolygon, zouitsForDrawing, false, [], { transparent: true, drawMain: false });
            zouitScheme = image;
        }

        const { html, scriptContent } = buildReportHtml(
            mainObjectData, linkedOksResults, oksIntersectionResults, structuresResults, zouitResults,
            underlyingParcelsResults, terrZoneResults, settlementsResults, municipalResults, forestryResults,
            mainSchemeWithPoints, mainSchemeWithoutPoints,
            parcelsSchemeWithPoints, parcelsSchemeWithoutPoints,
            oksSchemeWithPoints, oksSchemeWithoutPoints,
            coordsTable,
            zouitScheme
        );

        const reportWindow = window.open('', '_blank');
        if (reportWindow) {
            reportWindow.document.write(html);
            const scriptEl = reportWindow.document.createElement('script');
            scriptEl.textContent = scriptContent;
            reportWindow.document.body.appendChild(scriptEl);
            reportWindow.document.close();
        } else {
            throw new Error('Не удалось открыть новое окно. Возможно, оно заблокировано браузером.');
        }

    } catch (error) {
        console.error("Ошибка при формировании сводного отчета:", error);
        showNotification(error.message, 'error', 'exclamation-circle', 5000);
    } finally {
        hideLoader();
    }
}

function buildReportHtml(mainObjectData, linkedOksResults, oksIntersectionResults, structuresResults, zouitResults, underlyingParcelsResults, terrZoneResults, settlementsResults, municipalResults, forestryResults, schemeImageWithPoints, schemeImageWithoutPoints, parcelsSchemeWithPoints, parcelsSchemeWithoutPoints, oksSchemeWithPoints, oksSchemeWithoutPoints, coordsTableHtml, zouitSchemeImage) {
    const reportDate = new Date().toLocaleDateString('ru-RU');

    const generateMainInfoRows = () => {
        let rows = '';
        const dataMap = {
            'Кадастровый номер': mainObjectData.cadastralNumber, 'Адрес': mainObjectData.address,
            'Площадь': mainObjectData.areaText, 'Категория земель': mainObjectData.category,
            'Разрешенное использование': mainObjectData.vri,
            'Кадастровая стоимость': mainObjectData.cost ? `${mainObjectData.cost.toLocaleString('ru-RU')} руб.` : null,
            'Форма собственности': mainObjectData.ownershipType, 'Тип права': mainObjectData.rightType
        };
        for (const [key, value] of Object.entries(dataMap)) {
            if (value) rows += `<tr><td>${key}</td><td>${value}</td></tr>`;
        }
        return rows;
    };

    const generateResultTable = (title, resultObject, headers, rowGenerator, tableClass = '') => {
        const items = (resultObject && (resultObject.items || resultObject.features)) || (Array.isArray(resultObject) ? resultObject : []);
        const isFullyContained = (resultObject && typeof resultObject.isFullyContained === 'boolean') ? resultObject.isFullyContained : true;
        let tableHtml = `<div class="section-title">${title}</div>`;
        if (items.length > 0 && !isFullyContained) {
            tableHtml += '<p style="text-align: center; font-style: italic; font-size: 9pt; margin: -5px 0 10px 0;">Примечание: объект может находиться на территории нескольких зон. Отображена только зона в центре объекта.</p>';
        }
        if (!items || items.length === 0) {
            return tableHtml + '<p style="text-align: center; margin: 10px 0;">Объекты не найдены.</p>';
        }
        tableHtml += `<table class="${tableClass}"><thead><tr>`;
        headers.forEach(h => tableHtml += `<th>${h}</th>`);
        tableHtml += '</tr></thead><tbody>';
        items.forEach(item => tableHtml += rowGenerator(item));
        tableHtml += '</tbody></table>';
        return tableHtml;
    };

    const oksIntersectionRowGenerator = (item) => {
        const f = item.feature;
        const o = f.properties.options;
        const intersectionAreaFormatted = item.intersectionArea.toFixed(2);
        const percentageFormatted = item.percentage.toFixed(2);

        return `<tr>
                    <td>${o.cad_num || '-'}</td>
                    <td>${o.purpose || o.building_name || '-'}</td>
                    <td>${o.year_built || '-'}</td>
                    <td>${o.floors || '-'}</td>
                    <td>${intersectionAreaFormatted}</td>
                    <td>${percentageFormatted} %</td>
                </tr>`;
    };

    const underlyingParcelRowGenerator = (item) => {
        const f = item.feature;
        const intersectionAreaFormatted = item.intersectionArea.toFixed(2);
        const percentageFormatted = item.percentage.toFixed(2);

        return `<tr>
                    <td>${f.properties.descr || '-'}</td>
                    <td>${f.properties.options.readable_address || '-'}</td>
                    <td>${getAreaText(f.properties.options) || '-'}</td>
                    <td>${intersectionAreaFormatted}</td>
                    <td>${percentageFormatted} %</td>
                </tr>`;
    };

    const linkedOksRowGenerator = (cn) => `<tr><td>${cn}</td></tr>`;
    const structuresRowGenerator = (f) => { const o = f.properties.options; const l = (o.params_extension && isFinite(parseFloat(o.params_extension))) ? `${parseFloat(o.params_extension).toLocaleString('ru-RU')} м.` : '-'; return `<tr><td>${o.cad_number || '-'}</td><td>${o.params_name || '-'}</td><td>${l}</td><td>${o.params_purpose || '-'}</td></tr>`; };
    const zouitRowGenerator = (f) => { const o = f.properties.options; return `<tr><td>${o.reg_numb_border || '-'}</td><td>${o.name_by_doc || '-'}</td><td>${o.content_restrict_encumbrances || '-'}</td></tr>`; };
    const terrZoneRowGenerator = (f) => { const o = f.properties.options; return `<tr><td>${o.reg_numb_border || '-'}</td><td>${o.name_by_doc || '-'}</td><td>${o.registration_date || '-'}</td></tr>`; };
    const settlementsRowGenerator = (f) => { const p = f.properties; const o = p.options || {}; return `<tr><td>${p.label || '-'}</td><td>${o.name || '-'}</td></tr>`; };
    const municipalRowGenerator = (f) => { const p = f.properties; return `<tr><td>${p.label || '-'}</td><td>${p.descr || '-'}</td></tr>`; };
    const forestryRowGenerator = (f) => { const o = f.properties.options; return `<tr><td>${o.reg_numb_border || '-'}</td><td>${o.name_by_doc || '-'}</td><td>${o.registration_date || '-'}</td></tr>`; };

    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Отчет: ${mainObjectData.cadastralNumber}</title><link rel="icon" href="img/report.png">
<style>
    body { font-family: 'Liberation Serif', 'Times New Roman', Times, serif; margin: 0; background: #e9ecef; color: #212224; font-size: 11pt; line-height: 1.5; }
    .page { background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.1); margin: 20px auto; padding: 20mm; box-sizing: border-box; width: 210mm; max-width: 98%; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0 20px 0; table-layout: fixed; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: center; vertical-align: middle; word-break: break-word; }
    th { background-color: #eaf0ff; color: #002a5c; font-weight: bold; }
    tbody tr:nth-child(even) { background-color: #f8f9fa; }
    .main-info-table{table-layout: auto;}
    .main-info-table td{text-align: left;}
    .main-info-table td:first-child{width: 35%; font-weight: bold; background-color: #f4f8ff;}
    .parcels-table, .oks-table { table-layout: fixed; }
    .parcels-table td, .oks-table td { text-align: left; }
    .parcels-table th:nth-child(1) { width: 18%; } .parcels-table th:nth-child(2) { width: 42%; }
    .parcels-table th:nth-child(3) { width: 12%; } .parcels-table th:nth-child(4) { width: 14%; }
    .parcels-table th:nth-child(5) { width: 14%; }
    .oks-table th:nth-child(1) { width: 25%; } .oks-table th:nth-child(2) { width: 25%; }
    .oks-table th:nth-child(3) { width: 10%; } .oks-table th:nth-child(4) { width: 10%; }
    .oks-table th:nth-child(5) { width: 15%; } .oks-table th:nth-child(6) { width: 15%; }
    .zouit-table td{text-align: left;}
    .zouit-table th:nth-child(1),.zouit-table td:nth-child(1){width: 25%;}
    .zouit-table th:nth-child(2),.zouit-table td:nth-child(2){width: 30%;}
    .header { text-align: center; margin-bottom: 30px; padding-top: 15px; border-top: 4px solid #003366; }
    .header h3 { font-size: 16pt; color: #002a5c; margin: 10px 0 5px 0; font-weight: 600; letter-spacing: 0.5px; }
    .header h4 { font-size: 11pt; font-weight: normal; color: #555; margin: 0; font-style: italic; }
    .section-title { text-align: center; font-weight: bold; margin: 35px 0 15px 0; font-size: 12pt; page-break-after: avoid; color: #002a5c; border-bottom: 1px solid #d6e4ff; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .scheme-container { text-align: center; margin-top: 25px; page-break-inside: avoid; }
    .scheme-wrapper { position: relative; display: inline-block; width: 100%; max-width: 800px; border: 1px solid #ccc; }
    .scheme-wrapper img { width: 100%; height: auto; display: block; }
    .scheme-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    #togglePointsBtn, #toggleZouitBtn { display: inline-block; margin: 20px 5px 0; padding: 8px 16px; font-family: 'Liberation Serif', 'Times New Roman', serif; font-size: 10pt; cursor: pointer; border-radius: 5px; border: 1px solid #003366; background-color: #eaf0ff; color: #002a5c; transition: background-color 0.2s; }
    #togglePointsBtn:hover, #toggleZouitBtn:hover { background-color: #d6e4ff; }
    .points-hidden .scheme-with-points, .points-visible .scheme-without-points, .points-hidden .point-col, .points-hidden .coords-table-container { display: none; }
    @media print { body { background: none; } .page { box-shadow: none; border: none; margin: 0; padding: 15mm; width: 100%; } #togglePointsBtn, #toggleZouitBtn { display: none; } }
</style>
</head>
<body class="points-hidden"><div class="page">
    <div class="header">
        <h3>Отчет по объекту недвижимости</h3>
        <h4>сформирован ${reportDate}</h4>
    </div>
    <div class="section-title">Сведения об исходном объекте</div>
    <table class="main-info-table">${generateMainInfoRows()}</table>
    ${generateResultTable(`Пересекаемые земельные участки (погрешность ~ 0.005 кв.м.)`, underlyingParcelsResults, ['Кадастровый номер', 'Адрес', 'Площадь ЗУ', 'Площадь наложения, м²', 'Процент от объекта, %'], underlyingParcelRowGenerator, 'parcels-table')}
    ${parcelsSchemeWithoutPoints ? `<div class="scheme-container"><div class="section-title">Схема пересекаемых ЗУ</div><div class="scheme-wrapper"><img src="${parcelsSchemeWithoutPoints}" class="scheme-without-points" alt="Схема пересечений"><img src="${parcelsSchemeWithPoints}" class="scheme-with-points" alt="Схема пересечений с точками"></div></div>` : ''}
    
    ${generateResultTable('1. Связанные ОКС по сведениям ЕГРН', linkedOksResults, ['Кадастровый номер'], linkedOksRowGenerator)}
    
    ${generateResultTable('2. Объекты капитального строительства на объекте', oksIntersectionResults, ['Кадастровый номер', 'Назначение', 'Год', 'Этаж', 'Площадь наложения, м²', 'Процент от объекта, %'], oksIntersectionRowGenerator, 'oks-table')}
    ${oksSchemeWithoutPoints ? `<div class="scheme-container"><div class="section-title">Схема пересекаемых ОКС</div><div class="scheme-wrapper"><img src="${oksSchemeWithoutPoints}" class="scheme-without-points" alt="Схема пересечений ОКС"><img src="${oksSchemeWithPoints}" class="scheme-with-points" alt="Схема пересечений ОКС с точками"></div></div>` : ''}

    ${generateResultTable('3. Сооружения на объекте', structuresResults, ['Кадастровый номер', 'Наименование', 'Протяженность', 'Назначение'], structuresRowGenerator)}
    ${generateResultTable('4. Зоны с особыми условиями использования территории (ЗОУИТ)', zouitResults, ['Рег. номер', 'Наименование', 'Ограничения'], zouitRowGenerator, 'zouit-table')}
    ${generateResultTable('5. Территориальные зоны (в центре объекта)', terrZoneResults, ['Рег. номер', 'Наименование', 'Дата рег.'], terrZoneRowGenerator)}
    ${generateResultTable('6. Населенные пункты', settlementsResults, ['Тип', 'Наименование'], settlementsRowGenerator)}
    ${generateResultTable('7. Муниципальные образования', municipalResults, ['Наименование', 'Описание'], municipalRowGenerator)}
    ${generateResultTable('8. Лесничества', forestryResults, ['Рег. номер', 'Наименование', 'Дата рег.'], forestryRowGenerator)}
    
    <div class="scheme-container">
        <div class="section-title">Общая схема расположения объектов</div>
        <div class="scheme-wrapper">
            <img src="${schemeImageWithoutPoints}" class="scheme-without-points" alt="Схема расположения">
            <img src="${schemeImageWithPoints}" class="scheme-with-points" alt="Схема расположения с точками">
            ${zouitSchemeImage ? `<img src="${zouitSchemeImage}" class="scheme-overlay" id="zouitOverlay" style="display: none;" alt="ЗОУИТ">` : ''}
        </div>
    </div>
    <div style="text-align: center;">
        <button onclick="togglePoints()" id="togglePointsBtn">Показать точки</button>
        ${zouitSchemeImage ? `<button onclick="toggleZouit()" id="toggleZouitBtn">Показать ЗОУИТ</button>` : ''}
    </div>
    <div class="coords-table-container">${coordsTableHtml}</div>
</div>
</body></html>`;

    const scriptContent = `
        function togglePoints(){
            const body = document.body;
            const btn = document.getElementById('togglePointsBtn');
            body.classList.toggle('points-hidden');
            body.classList.toggle('points-visible');
            if (body.classList.contains('points-visible')) { btn.textContent = 'Скрыть точки'; } else { btn.textContent = 'Показать точки'; }
        }
        function toggleZouit(){
            const overlay = document.getElementById('zouitOverlay');
            const btn = document.getElementById('toggleZouitBtn');
            if (overlay.style.display === 'none') {
                overlay.style.display = 'block';
                btn.textContent = 'Скрыть ЗОУИТ';
            } else {
                overlay.style.display = 'none';
                btn.textContent = 'Показать ЗОУИТ';
            }
        }
    `;

    return { html, scriptContent };
}