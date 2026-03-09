/**
 * Модуль генерации Схемы расположения земельного участка (СРЗУ на КПТ)
 */

async function generateSchemaDocument(lat, lon, targetPolygon) {
    if (!(targetPolygon instanceof ymaps.Polygon)) {
        showNotification('Для Схемы необходим площадной объект (полигон)', 'warning');
        return;
    }

    showLoader('Подготовка данных для Схемы (1/4)...');
    try {
        // 1. ОФОРМЛЕНИЕ ЦЕЛЕВОГО ПОЛИГОНА
        targetPolygon.options.set({
            strokeColor: '#FF0000',
            strokeWidth: 3,
            fillColor: '#FFA500',
            fillOpacity: 0.2, // 20% заливка оранжевым
            zIndex: 1000
        });

        // 2. ПОЛУЧЕНИЕ КООРДИНАТ И НУМЕРАЦИЯ ТОЧЕК (н1, н2...)
        const { mskCoordsTable, centerGeo } = await setupPointsAndGetCoords(targetPolygon);

        // 3. ПОИСК СОСЕДЕЙ (200 метров)
        showLoader('Поиск окружения (200м) (2/4)...');
        await fetchAndDrawNeighbors200m(centerGeo);

        // 4. ПОИСК ОКС, СООРУЖЕНИЙ И ЗОУИТ
        showLoader('Поиск ОКС и ЗОУИТ (3/4)...');
        await fetchAndDrawIntersections(targetPolygon);

        // 5. ПОИСК ТЕРРИТОРИАЛЬНОЙ ЗОНЫ
        showLoader('Определение территориальной зоны (4/4)...');
        const terrZoneName = await fetchAndDrawTerrZone(centerGeo);

        // 6. НАСТРОЙКА КАРТЫ И СКРИНШОТ
        showLoader('Создание снимка карты...');
        const mapImageBase64 = await takeMapScreenshotForSchema(targetPolygon);

        // 7. РАСЧЕТ ПЛОЩАДИ
        const geomStats = calculatePreciseGeometry(targetPolygon);
        const areaStr = Math.round(geomStats.area).toLocaleString('ru-RU');

        // 8. ГЕНЕРАЦИЯ И ОТКРЫТИЕ HTML/DOCX ДОКУМЕНТА
        openSchemaDocumentWindow(mapImageBase64, mskCoordsTable, areaStr, terrZoneName);

        showNotification('Схема успешно сформирована', 'success');

    } catch (error) {
        console.error("Ошибка при генерации схемы:", error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Расставляет точки н1, н2... и собирает координаты в МСК
 */
async function setupPointsAndGetCoords(polygon) {
    const coordinates = polygon.geometry.getCoordinates()[0]; // Внешний контур
    if (!coordinates || coordinates.length < 3) throw new Error("Некорректный полигон");

    // Удаляем старые точки, если они есть
    const pointsToRemove = [];
    polygons.forEach(p => {
        if (p instanceof ymaps.Placemark && p.properties.get('isVertexPoint') && p.properties.get('relatedPolygon') === polygon) {
            pointsToRemove.push(p);
        }
    });
    pointsToRemove.forEach(p => {
        map.geoObjects.remove(p);
        polygons = polygons.filter(poly => poly !== p);
    });

    // Настройка МСК (берем из глобальных настроек программы)
    const destSc = localStorage.getItem('savedDefaultMskSystem') || 'EPSG:6331602';
    const destSystem = COORDINATE_SYSTEMS.find(s => s.value === destSc);
    let mskOffsetX = 0, mskOffsetY = 0;

    if (localStorage.getItem('autoLoadMskOffset') !== 'false' && destSystem) {
        mskOffsetX = destSystem.offsetX || 0;
        mskOffsetY = destSystem.offsetY || 0;
    } else {
        mskOffsetX = parseFloat((localStorage.getItem('savedMskOffsetX') || '0').replace(',', '.')) || 0;
        mskOffsetY = parseFloat((localStorage.getItem('savedMskOffsetY') || '0').replace(',', '.')) || 0;
    }
    if (destSystem && destSystem.def) proj4.defs(destSc, destSystem.def);

    const isClosed = Math.abs(coordinates[0][0] - coordinates[coordinates.length - 1][0]) < 1e-7;
    const numPoints = isClosed ? coordinates.length - 1 : coordinates.length;
    
    let mskCoordsTable = [];
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

    for (let i = 0; i < numPoints; i++) {
        const currentCoord = coordinates[i];
        
        // Для центроида
        minLat = Math.min(minLat, currentCoord[0]); maxLat = Math.max(maxLat, currentCoord[0]);
        minLon = Math.min(minLon, currentCoord[1]); maxLon = Math.max(maxLon, currentCoord[1]);

        // Перевод в WGS84 (истинный) и затем в МСК
        const trueLat = currentCoord[0] + (mapOffsetY * 0.000008983);
        const trueLon = currentCoord[1] + (mapOffsetX * 0.000008983);
        
        let x_msk = 0, y_msk = 0;
        if (destSystem) {
            const mskPoint = proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            y_msk = mskPoint[0] + mskOffsetY;
            x_msk = mskPoint[1] + mskOffsetX;
        }

        mskCoordsTable.push({
            point: `н${i + 1}`,
            x: x_msk.toFixed(2),
            y: y_msk.toFixed(2)
        });

        // Отрисовка маркеров (как в show-numbered-points-btn)
        const halfSize = numberedDotSize / 2;
        const redDotMarker = new ymaps.Placemark(currentCoord, { dotSize: numberedDotSize }, {
            iconLayout: redDotLayout, iconOffset: [-halfSize, -halfSize], zIndex: 1140
        });
        
        const textLabelMarker = new ymaps.Placemark(currentCoord, {
            iconContent: `н${i + 1}`, fontSize: numberedPointSize
        }, {
            iconLayout: numberedPointLayout, iconOffset: [15, -15], zIndex: 1150
        });

        redDotMarker.properties.set({ 'isVertexPoint': true, 'relatedPolygon': polygon });
        textLabelMarker.properties.set({ 'isVertexPoint': true, 'relatedPolygon': polygon });
        
        map.geoObjects.add(redDotMarker); map.geoObjects.add(textLabelMarker);
        polygons.push(redDotMarker); polygons.push(textLabelMarker);
    }
    
    polygon.properties.set('numberedPointsVisible', true);

    const centerGeo = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
    return { mskCoordsTable, centerGeo };
}

/**
 * Ищет соседние ЗУ в радиусе 200м
 */
async function fetchAndDrawNeighbors200m(centerGeo) {
    const trueLat = centerGeo[0] + (mapOffsetY * 0.000008983);
    const trueLon = centerGeo[1] + (mapOffsetX * 0.000008983);
    const centerPoint = proj4("EPSG:4326", "EPSG:3857", [trueLon, trueLat]);
    
    const halfSize = 200; // 200 метров от центра
    const squareCoordsEPSG3857 = [
        [centerPoint[0] - halfSize, centerPoint[1] - halfSize],
        [centerPoint[0] + halfSize, centerPoint[1] - halfSize],
        [centerPoint[0] + halfSize, centerPoint[1] + halfSize],
        [centerPoint[0] - halfSize, centerPoint[1] + halfSize],
        [centerPoint[0] - halfSize, centerPoint[1] - halfSize]
    ];

    const foundFeatures = await searchParcelsByArea(squareCoordsEPSG3857);
    if (foundFeatures && foundFeatures.length > 0) {
        // Отрисовываем, НО не сдвигаем карту (bounds)
        const oldBounds = map.getBounds();
        await drawFoundParcels(foundFeatures, false);
        map.setBounds(oldBounds); // Возвращаем карту на место
    }
}

/**
 * Ищет ОКС, сооружения и ЗОУИТ под целевым полигоном
 */
async function fetchAndDrawIntersections(polygon) {
    const [oks, structs, zouits] = await Promise.all([
        searchFeaturesByGeometry(polygon, 36369),
        searchFeaturesByGeometry(polygon, 36383),
        searchFeaturesByGeometry(polygon, 36940)
    ]);
    
    const oldBounds = map.getBounds();
    if (oks && oks.length > 0) await processAndDrawBuildings(oks);
    if (structs && structs.length > 0) await processAndDrawStructures(structs);
    if (zouits && zouits.length > 0) await processAndDrawZouits(zouits);
    map.setBounds(oldBounds);
}

/**
 * Ищет терр. зону в центре полигона и ставит метку
 */
async function fetchAndDrawTerrZone(centerGeo) {
    const trueLat = centerGeo[0] + (mapOffsetY * 0.000008983);
    const trueLon = centerGeo[1] + (mapOffsetX * 0.000008983);
    
    const res = await searchContainingObjectByPoint(trueLat, trueLon, 36315);
    if (res.features && res.features.length > 0) {
        const f = res.features[0];
        const name = f.properties?.options?.name_by_doc || f.properties?.options?.type_zone || 'Территориальная зона';
        
        // Создаем текстовую метку рядом с участком
        const tzLabel = new ymaps.Placemark([centerGeo[0] + 0.0002, centerGeo[1]], {
            iconContent: `ТЗ: ${name}`
        }, {
            preset: 'islands#blueStretchyIcon', zIndex: 1200
        });
        map.geoObjects.add(tzLabel);
        polygons.push(tzLabel);
        return name;
    }
    return "Не установлена";
}

/**
 * Подготавливает карту, центрирует и делает скриншот
 */
async function takeMapScreenshotForSchema(polygon) {
    // 1. Устанавливаем границы карты: полигон + отступ ~100 метров (для наглядности)
    const bounds = polygon.geometry.getBounds();
    const latMargin = (bounds[1][0] - bounds[0][0]) * 1.5 || 0.001;
    const lonMargin = (bounds[1][1] - bounds[0][1]) * 1.5 || 0.001;
    map.setBounds([
        [bounds[0][0] - latMargin, bounds[0][1] - lonMargin],
        [bounds[1][0] + latMargin, bounds[1][1] + lonMargin]
    ], { duration: 0 });

    // Прячем лишний UI
    const widgets = document.querySelectorAll('.widget, .map-mode-switcher, .input-container, .mobile-menu-btn, .camera-height-label, .map-legend, .raster-controls-panel, .bottom-dashboard, .custom-context-menu');
    widgets.forEach(w => { if (w) w.style.display = 'none'; });

    // Ждем прогрузки тайлов
    await new Promise(r => setTimeout(r, 1500));

    const mapElement = document.getElementById('map');
    const canvas = await html2canvas(mapElement, {
        useCORS: true, allowTaint: true, logging: false,
        width: mapElement.clientWidth, height: mapElement.clientHeight, scrollX: 0, scrollY: 0,
        ignoreElements: (el) => typeof el.className === 'string' && (el.className.includes('-copyright') || el.className.includes('-gototech'))
    });

    // Возвращаем UI
    widgets.forEach(w => { if (w) w.style.display = ''; });

    return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Формирует и открывает HTML-документ
 */
function openSchemaDocumentWindow(imageBase64, coordsTable, areaStr, terrZoneName) {
    // Картинки для легенды (Base64)
    const squareImage = "data:image/jpeg;base64,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";
    const circleImage = "data:image/jpeg;base64,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";

    const coordsRows = coordsTable.map(c => `
        <tr>
            <td style="border:1px solid #000; padding:4px; text-align:center;">${c.point}</td>
            <td style="border:1px solid #000; padding:4px; text-align:center;">${c.x}</td>
            <td style="border:1px solid #000; padding:4px; text-align:center;">${c.y}</td>
        </tr>
    `).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Схема расположения земельного участка</title>
    <!-- Подключаем библиотеку docx и FileSaver для генерации Word внутри окна -->
    <script src="https://unpkg.com/docx@7.8.2/build/index.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
    <style>
        body { font-family: "Times New Roman", Times, serif; font-size: 14pt; background: #e9ecef; margin: 0; padding: 20px; }
        .page { background: white; width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; }
        .header-text { text-align: right; margin-bottom: 20px; line-height: 1.2; }
        .header-text textarea { width: 300px; height: 100px; font-family: inherit; font-size: inherit; text-align: right; border: 1px dashed #ccc; padding: 5px; resize: none;}
        .title { text-align: center; font-weight: bold; font-size: 16pt; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid black; padding: 6px; text-align: left; }
        .coords-table th, .coords-table td { text-align: center; }
        .map-img { width: 100%; max-height: 400px; object-fit: contain; border: 1px solid #000; margin-bottom: 15px; }
        .legend-item { display: flex; align-items: center; margin-bottom: 8px; font-size: 12pt;}
        .legend-item img { margin-right: 10px; width: 20px; height: 20px; }
        
        .floating-bar { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; }
        .floating-bar button { padding: 10px 15px; font-size: 14px; cursor: pointer; border: none; border-radius: 5px; color: white; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: 0.2s;}
        .btn-print { background: #3b82f6; } .btn-print:hover { background: #2563eb; }
        .btn-docx { background: #10b981; } .btn-docx:hover { background: #059669; }
        .btn-html { background: #f59e0b; } .btn-html:hover { background: #d97706; }
        
        @media print {
            body { background: none; padding: 0; }
            .page { box-shadow: none; margin: 0; padding: 0; width: 100%; }
            .floating-bar { display: none; }
            .header-text textarea { border: none; overflow: hidden; height: auto; }
        }
    </style>
</head>
<body>

    <div class="floating-bar">
        <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> Печать (А4)</button>
        <button class="btn-html" onclick="saveAsHtml()"><i class="fas fa-file-code"></i> Сохранить HTML</button>
        <button class="btn-docx" onclick="generateDocx()"><i class="fas fa-file-word"></i> Скачать DOCX</button>
    </div>

    <div class="page" id="documentContent">
        <div class="header-text">
            <b>Утверждена</b><br>
            <textarea id="authText">Постановлением * 
* района 
*</textarea><br>
            <span style="font-size: 10pt;">(наименование документа об утверждении, включая наименование<br>
            органов государственной власти или органов местного<br>
            самоуправления, принявших решение об утверждении<br>
            или подписавших соглашение о перераспределении<br>
            земельных участков)</span><br><br>
            от _____________ № _____
        </div>

        <div class="title">
            Схема расположения земельного участка или земельных участков на кадастровом плане территории
        </div>

        <table>
            <tr>
                <td colspan="3"><b>Условный номер земельного участка:</b> ЗУ1</td>
            </tr>
            <tr>
                <td colspan="3"><b>Площадь земельного участка:</b> ${areaStr} кв.м.</td>
            </tr>
            <tr>
                <td colspan="3"><b>Территориальная зона:</b> ${terrZoneName}</td>
            </tr>
            <tr class="coords-table">
                <td rowspan="2" style="width: 40%; vertical-align: middle;"><b>Обозначение характерных точек границ</b></td>
                <td colspan="2"><b>Координаты в местной системе координат, м</b></td>
            </tr>
            <tr class="coords-table">
                <td><b>X</b></td>
                <td><b>Y</b></td>
            </tr>
            ${coordsRows}
        </table>

        <div style="text-align: center; margin: 15px 0;">
            <img src="${imageBase64}" class="map-img" alt="Карта СРЗУ">
            <div><b>Масштаб 1:500</b></div>
        </div>

        <div style="margin-top: 20px;">
            <b>Условные обозначения:</b>
            <div class="legend-item" style="margin-top: 10px;">
                <img src="${squareImage}" alt="Полигон"> - образуемый земельный участок
            </div>
            <div class="legend-item">
                <img src="${circleImage}" alt="Точка"> - обозначение характерной точки границы образуемого земельного участка
            </div>
        </div>
    </div>

    <script>
        // Восстановление текста из localStorage
        const authTextArea = document.getElementById('authText');
        const savedText = localStorage.getItem('schemaAuthorityText');
        if (savedText) authTextArea.value = savedText;
        
        authTextArea.addEventListener('input', function() {
            localStorage.setItem('schemaAuthorityText', this.value);
            // Авторесайз
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        
        // Триггер авторесайза при загрузке
        authTextArea.dispatchEvent(new Event('input'));

        function saveAsHtml() {
            const html = "<!DOCTYPE html><html>" + document.documentElement.innerHTML + "</html>";
            const blob = new Blob([html], {type: "text/html;charset=utf-8"});
            saveAs(blob, "Схема_СРЗУ.html");
        }

        function generateDocx() {
            const coords = ${JSON.stringify(coordsTable)};
            const authorityLines = authTextArea.value.split('\\n');
            const sqImgData = "${squareImage}";
            const circImgData = "${circleImage}";

            const docRows = [
                new docx.TableRow({
                    children: [
                        new docx.TableCell({
                            children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Условный номер земельного участка: ЗУ1", size: 24 })] })],
                            columnSpan: 3,
                        }),
                    ],
                }),
                new docx.TableRow({
                    children: [
                        new docx.TableCell({
                            children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Площадь земельного участка: ${areaStr} кв.м", size: 24 })] })],
                            columnSpan: 3,
                        }),
                    ],
                }),
                new docx.TableRow({
                    children: [
                        new docx.TableCell({
                            children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Обозначение характерных точек границ", size: 24 })] })],
                            rowSpan: 2, verticalAlign: docx.VerticalAlign.CENTER, width: { size: 40, type: docx.WidthType.PERCENTAGE },
                        }),
                        new docx.TableCell({
                            children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Координаты в местной системе координат, м", size: 24 })] })],
                            columnSpan: 2,
                        }),
                    ],
                }),
                new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "X", size: 24 })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Y", size: 24 })] })] }),
                    ],
                })
            ];

            coords.forEach(c => {
                docRows.push(new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.point, size: 24 })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.x, size: 24 })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.y, size: 24 })] })] }),
                    ]
                }));
            });

            const authParagraphs = authorityLines.map(line => 
                new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: line, size: 24, underline: {} })] })
            );

            const doc = new docx.Document({
                sections: [{
                    properties: { page: { size: { width: docx.convertMillimetersToTwip(210), height: docx.convertMillimetersToTwip(297) }, margin: { top: 1134, right: 850, bottom: 1134, left: 1700 } } },
                    children: [
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "Утверждена", bold: true, size: 24 })] }),
                        ...authParagraphs,
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "(наименование документа об утверждении, включая наименование", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "органов государственной власти или органов местного", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "самоуправления, принявших решение об утверждении", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "или подписавших соглашение о перераспределении", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, spacing: { after: 200 }, children: [new docx.TextRun({ text: "земельных участков)", size: 18 })] }),
                        new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, spacing: { after: 400 }, children: [
                            new docx.TextRun({ text: "от ", size: 24, bold: true }),
                            new docx.TextRun({ text: "_____________ ", size: 24, bold: true, underline: {} }),
                            new docx.TextRun({ text: "№ ", size: 24, bold: true }),
                            new docx.TextRun({ text: "_____", size: 24, bold: true, underline: {} })
                        ]}),
                        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                            new docx.TextRun({ text: "Схема расположения земельного участка или земельных участков на кадастровом плане территории", size: 28, bold: true })
                        ]}),
                        new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: docRows }),
                        // ВАЖНО: Картинку карты в DOCX не вставляем напрямую через base64 если она тяжелая, но можно попробовать.
                        // Если скриншот нужен в ворде, раскомментируйте код ниже и конвертируйте mapImageBase64 в Uint8Array.
                        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [
                            new docx.TextRun({ text: "Масштаб 1:500", size: 24, bold: true })
                        ]}),
                        new docx.Paragraph({ spacing: { after: 100 }, children: [new docx.TextRun({ text: "Условные обозначения:", size: 24, bold: true })] }),
                        new docx.Paragraph({ spacing: { after: 100 }, children: [
                            new docx.ImageRun({ data: sqImgData.split(',')[1], transformation: { width: 20, height: 20 } }),
                            new docx.TextRun({ text: " - образуемый земельный участок", size: 24 })
                        ]}),
                        new docx.Paragraph({ spacing: { after: 100 }, children: [
                            new docx.ImageRun({ data: circImgData.split(',')[1], transformation: { width: 25, height: 25 } }),
                            new docx.TextRun({ text: " - обозначение характерной точки границы образуемого земельного участка", size: 24 })
                        ]})
                    ]
                }]
            });

            docx.Packer.toBlob(doc).then(blob => {
                saveAs(blob, "Схема_расположения.docx");
            }).catch(e => alert("Ошибка создания DOCX: " + e));
        }
    </script>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(htmlContent);
    win.document.close();
}