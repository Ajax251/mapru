console.log("%c[Schema Generator] Загружена версия 2.18 ", "color: #0078D4; font-weight: bold; font-size: 13px; background: #e6f0fa; padding: 4px 8px; border-radius: 4px;");
window.__schemaDataLoaded = false;



function startSchemaWorkflow(lat, lon, targetPolygon) {
    if (!targetPolygon) return;

    let detectedQuarter = currentQuarterNumber || '';
    let detectedSettlement = '';
    let detectedMunicipality = '';
    let detectedTerrZone = ''; // Ошибочное автозаполнение ЗОУИТ удалено
    let detectedZuName = '';

    const cn = targetPolygon.properties.get('cadastralNumber') || '';
    if (cn) {
        const parts = cn.split(':');
        if (parts.length >= 3) {
            detectedQuarter = parts.slice(0, 3).join(':');
            detectedZuName = cn.replace(detectedQuarter, '');
            if (detectedZuName.startsWith(':')) {
                detectedZuName = detectedZuName.substring(1);
            }
        } else {
            detectedZuName = cn;
        }
    }
    if (!detectedZuName) detectedZuName = '';

    polygons.forEach(p => {
        if (p instanceof ymaps.Polygon || p instanceof ymaps.Placemark) {
            const fd = p.properties.get('featureData');
            const cat = fd?.properties?.category;
            const catName = fd?.properties?.categoryName || '';
            const descr = p.properties.get('descr') || p.properties.get('label') || fd?.properties?.descr || '';
            const name = p.properties.get('name') || fd?.properties?.options?.name_by_doc || fd?.properties?.options?.name || '';
            
            if (cat === 36278 || catName.includes('Муниципальные') || descr.toLowerCase().includes('поселение') || name.toLowerCase().includes('поселение')) {
                detectedMunicipality = name || descr;
            }
            if (cat === 36281 || catName.includes('Населенные') || descr.toLowerCase().includes('с.') || descr.toLowerCase().includes('д.') || descr.toLowerCase().includes('г.')) {
                detectedSettlement = name || descr;
            }
        }
    });

    openSchemaSettingsModal(lat, lon, targetPolygon, {
        quarter: detectedQuarter,
        settlement: detectedSettlement,
        municipality: detectedMunicipality,
        terrZone: detectedTerrZone,
        zuName: detectedZuName
    });
}

function openSchemaSettingsModal(lat, lon, targetPolygon, detectedData) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.backdropFilter = 'blur(4px)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '15000';

    // Загрузка сохраненных настроек
    const sLineColor = localStorage.getItem('sch_lineColor') || '#FF0000';
    const sLineWidth = localStorage.getItem('sch_lineWidth') || '3';
    const sFillColor = localStorage.getItem('sch_fillColor') || '#FFA500';
    const sFillOpacity = localStorage.getItem('sch_fillOpacity') || '20';
    const sShowPoints = localStorage.getItem('sch_showPoints') !== 'false';
    const sPointColor = localStorage.getItem('sch_pointColor') || '#FF0000';
    const sPointFontSize = localStorage.getItem('sch_pointFontSize') || '18';
    const sSkipLoad = window.__schemaDataLoaded;
    const sLoadZouit = localStorage.getItem('sch_loadZouit') !== 'false';
    const sZouitNearby = localStorage.getItem('sch_zouitNearby') === 'true';
    const sLoadNearby = localStorage.getItem('sch_loadNearby') !== 'false';
    const sNearbyRadius = localStorage.getItem('sch_nearbyRadius') || '200';
    const sScaleText = localStorage.getItem('sch_scaleText') || '';

    // Опции отображения слоев по страницам
    const sCptShowZu = localStorage.getItem('sch_cptShowZu') !== 'false';
    const sCptShowZouit = localStorage.getItem('sch_cptShowZouit') !== 'false';
    const sCptZuNameMode = localStorage.getItem('sch_cptZuNameMode') || 'inside';

    const sPzzShowZu = localStorage.getItem('sch_pzzShowZu') !== 'false';
    const sPzzShowZouit = localStorage.getItem('sch_pzzShowZouit') !== 'false';
    const sPzzZuNameMode = localStorage.getItem('sch_pzzZuNameMode') || 'inside';

    const sSatShowZu = localStorage.getItem('sch_satShowZu') !== 'false';
    const sSatShowZouit = localStorage.getItem('sch_satShowZouit') !== 'false';
    const sSatZuNameMode = localStorage.getItem('sch_satZuNameMode') || 'inside';

    // Текстовые атрибуты
    const sQuarter = detectedData.quarter || localStorage.getItem('sch_quarter') || '';
    const sSettlement = detectedData.settlement || localStorage.getItem('sch_settlement') || '';
    const sMunicipality = detectedData.municipality || localStorage.getItem('sch_municipality') || '';
    const sTerrZone = detectedData.terrZone || localStorage.getItem('sch_terrZone') || '';
    const sZuName = detectedData.zuName || localStorage.getItem('sch_zuName') || 'ЗУ1';
    const sApprovalDoc = localStorage.getItem('sch_approvalDoc') || '';

    const sIncludePzz = localStorage.getItem('sch_includePzz') !== 'false';
    const sIncludeSat = localStorage.getItem('sch_includeSat') !== 'false';
    const sIncludeParts = localStorage.getItem('sch_includeParts') !== 'false';

    const sZoomMode = localStorage.getItem('sch_zoomMode') || 'individual';
    const sPzzOffset = parseInt(localStorage.getItem('sch_pzzOffset') || '0', 10);
    const sSatOffset = parseInt(localStorage.getItem('sch_satOffset') || '0', 10);

    const sPzzLineColor = localStorage.getItem('sch_pzzLineColor') || '#FF0000';
    const sPzzShowPoints = localStorage.getItem('sch_pzzShowPoints') !== 'false';
    const sSatLineColor = localStorage.getItem('sch_satLineColor') || '#FFFFFF';
    const sSatShowPoints = localStorage.getItem('sch_satShowPoints') !== 'false';

    modal.innerHTML = `
        <div style="background: #ffffff; padding: 25px; width: 90%; max-width: 950px; max-height: 90vh; overflow-y: auto; text-align: left; font-size: 13px; box-sizing: border-box; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: Arial, sans-serif;">
            <h3 style="margin: 0 0 15px 0; text-align: center; color: #1e3a8a; font-size: 18px; font-weight: bold;">Настройки Схемы СРЗУ</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                <!-- Столбец 1: Оформление контуров и точек -->
                <div>
                    <h4 style="margin: 0 0 10px 0; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">Стили контура</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <div style="display: flex; flex-direction: column; gap: 3px;">
                            <label style="color: #555;">Цвет контура:</label>
                            <input type="color" id="sch_lineColor" value="${sLineColor}" style="width: 100%; height: 28px; border-radius: 4px; border:none; cursor:pointer;">
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 3px;">
                            <label style="color: #555;">Толщина: <span id="sch_lineWidth_val">${sLineWidth}</span>px</label>
                            <input type="range" id="sch_lineWidth" min="1" max="10" value="${sLineWidth}" style="width: 100%;">
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 3px;">
                            <label style="color: #555;">Цвет заливки:</label>
                            <input type="color" id="sch_fillColor" value="${sFillColor}" style="width: 100%; height: 28px; border-radius: 4px; border:none; cursor:pointer;">
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 3px;">
                            <label style="color: #555;">Заливка: <span id="sch_fillOpacity_val">${sFillOpacity}</span>%</label>
                            <input type="range" id="sch_fillOpacity" min="0" max="100" value="${sFillOpacity}" style="width: 100%;">
                        </div>
                    </div>

                    <h4 style="margin: 15px 0 10px 0; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">Характерные точки</h4>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-weight: bold;">
                            <input type="checkbox" id="sch_showPoints" ${sShowPoints ? 'checked' : ''}> Точки (н1, н2...)
                        </label>
                        <input type="color" id="sch_pointColor" value="${sPointColor}" style="width: 40px; height: 24px; border:none; cursor:pointer;">
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px;">
                        <label style="color: #555;">Размер шрифта точек (px):</label>
                        <input type="number" id="sch_pointFontSize" min="8" max="72" value="${sPointFontSize}" style="width: 100%; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    </div>
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; margin-bottom: 12px; color: #333;">
                        <input type="checkbox" id="sch_autoSort" checked> Автоустановка точек (СЗ -> по часовой)
                    </label>
                </div>

                <!-- Столбец 2: Настройки по листам (Сноски и выноски удалены) -->
                <div>
                    <h4 style="margin: 0 0 10px 0; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">Настройки по листам</h4>
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 10px; font-size: 0.85rem;">
                        <div>
                            <strong>Лист КПТ:</strong>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 3px;">
                                <div style="display: flex; gap: 10px;">
                                    <label style="cursor:pointer;"><input type="checkbox" id="sch_cptShowZu" ${sCptShowZu ? 'checked' : ''}> ЗУ</label>
                                    <label style="cursor:pointer;"><input type="checkbox" id="sch_cptShowZouit" ${sCptShowZouit ? 'checked' : ''}> ЗОУИТ</label>
                                </div>
                                <select id="sch_cptZuNameMode" style="padding: 2px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                    <option value="off" ${sCptZuNameMode === 'off' ? 'selected' : ''}>Название: Выкл</option>
                                    <option value="inside" ${sCptZuNameMode === 'inside' ? 'selected' : ''}>Название: Внутри</option>
                                    <option value="callout" ${sCptZuNameMode === 'callout' ? 'selected' : ''}>Название: Выноска</option>
                                </select>
                            </div>
                        </div>
                        <div style="border-top: 1px solid #eee; padding-top: 6px;">
                            <strong>Лист ПЗЗ:</strong>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 3px;">
                                <div style="display: flex; gap: 10px;">
                                    <label style="cursor:pointer;"><input type="checkbox" id="sch_pzzShowZu" ${sPzzShowZu ? 'checked' : ''}> ЗУ</label>
                                    <label style="cursor:pointer;"><input type="checkbox" id="sch_pzzShowZouit" ${sPzzShowZouit ? 'checked' : ''}> ЗОУИТ</label>
                                </div>
                                <select id="sch_pzzZuNameMode" style="padding: 2px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                    <option value="off" ${sPzzZuNameMode === 'off' ? 'selected' : ''}>Название: Выкл</option>
                                    <option value="inside" ${sPzzZuNameMode === 'inside' ? 'selected' : ''}>Название: Внутри</option>
                                    <option value="callout" ${sPzzZuNameMode === 'callout' ? 'selected' : ''}>Название: Выноска</option>
                                </select>
                            </div>
                        </div>
                        <div style="border-top: 1px solid #eee; padding-top: 6px;">
                            <strong>Лист Спутник:</strong>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 3px;">
                                <div style="display: flex; gap: 10px;">
                                    <label style="cursor:pointer;"><input type="checkbox" id="sch_satShowZu" ${sSatShowZu ? 'checked' : ''}> ЗУ</label>
                                    <label style="cursor:pointer;"><input type="checkbox" id="sch_satShowZouit" ${sSatShowZouit ? 'checked' : ''}> ЗОУИТ</label>
                                </div>
                                <select id="sch_satZuNameMode" style="padding: 2px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                    <option value="off" ${sSatZuNameMode === 'off' ? 'selected' : ''}>Название: Выкл</option>
                                    <option value="inside" ${sSatZuNameMode === 'inside' ? 'selected' : ''}>Название: Внутри</option>
                                    <option value="callout" ${sSatZuNameMode === 'callout' ? 'selected' : ''}>Название: Выноска</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Столбец 3: Данные, Масштабирование и Поиск -->
                <div>
                    <h4 style="margin: 0 0 10px 0; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">Атрибуты и страницы</h4>
                    <div style="display: flex; flex-direction: column; gap: 5px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="color:#555; width: 80px;">Док. утв.:</label>
                            <input type="text" id="sch_approvalDoc" value="${sApprovalDoc}" style="flex:1; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="color:#555; width: 80px;">Поселение:</label>
                            <input type="text" id="sch_municipality" value="${sMunicipality}" style="flex:1; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="color:#555; width: 80px;">Нас. пункт:</label>
                            <input type="text" id="sch_settlement" value="${sSettlement}" style="flex:1; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="color:#555; width: 80px;">Квартал:</label>
                            <input type="text" id="sch_quarter" value="${sQuarter}" style="flex:1; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="color:#555; width: 80px;">Номер ЗУ:</label>
                            <input type="text" id="sch_zuName" value="${sZuName}" style="flex:1; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="color:#555; width: 80px;">Терр. зона:</label>
                            <input type="text" id="sch_terrZone" value="${sTerrZone}" style="flex:1; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="color:#555; width: 80px;">Масштаб под.:</label>
                            <input type="text" id="sch_scaleText" value="${sScaleText}" style="flex:1; padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 0.85rem;">
                        <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;"><input type="checkbox" id="sch_includePzz" ${sIncludePzz ? 'checked' : ''}> Схема ПЗЗ (.rst)</label>
                        <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;"><input type="checkbox" id="sch_includeSat" ${sIncludeSat ? 'checked' : ''}> Схема на спутнике</label>
                        <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;"><input type="checkbox" id="sch_includeParts" ${sIncludeParts ? 'checked' : ''}> Чертеж размеров сторон</label>
                    </div>

                    <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
                        <h4 style="margin: 0 0 2px 0; color: #0f172a; font-size: 13px;">Масштабирование карт</h4>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                            <label style="font-size: 0.8rem; color: #475569;">Режим:</label>
                            <select id="sch_zoomMode" style="padding: 3px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                <option value="constant" ${sZoomMode === 'constant' ? 'selected' : ''}>Постоянный</option>
                                <option value="individual" ${sZoomMode === 'individual' ? 'selected' : ''}>Индивидуальный</option>
                            </select>
                        </div>
                        <div id="sch_offsets_container" style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                                <label style="font-size: 0.8rem; color: #475569;">Смещение ПЗЗ:</label>
                                <select id="sch_pzzOffset" style="padding: 2px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                    <option value="-3" ${sPzzOffset === -3 ? 'selected' : ''}>-3 (отдалить)</option>
                                    <option value="-2" ${sPzzOffset === -2 ? 'selected' : ''}>-2 (отдалить)</option>
                                    <option value="-1" ${sPzzOffset === -1 ? 'selected' : ''}>-1 (отдалить)</option>
                                    <option value="0" ${sPzzOffset === 0 ? 'selected' : ''}>0 (без изм.)</option>
                                    <option value="1" ${sPzzOffset === 1 ? 'selected' : ''}>+1 (приблизить)</option>
                                    <option value="2" ${sPzzOffset === 2 ? 'selected' : ''}>+2 (приблизить)</option>
                                    <option value="3" ${sPzzOffset === 3 ? 'selected' : ''}>+3 (приблизить)</option>
                                </select>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                                <label style="font-size: 0.8rem; color: #475569;">Смещение спутника:</label>
                                <select id="sch_satOffset" style="padding: 2px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                    <option value="-3" ${sSatOffset === -3 ? 'selected' : ''}>-3 (отдалить)</option>
                                    <option value="-2" ${sSatOffset === -2 ? 'selected' : ''}>-2 (отдалить)</option>
                                    <option value="-1" ${sSatOffset === -1 ? 'selected' : ''}>-1 (отдалить)</option>
                                    <option value="0" ${sSatOffset === 0 ? 'selected' : ''}>0 (без изм.)</option>
                                    <option value="1" ${sSatOffset === 1 ? 'selected' : ''}>+1 (приблизить)</option>
                                    <option value="2" ${sSatOffset === 2 ? 'selected' : ''}>+2 (приблизить)</option>
                                    <option value="3" ${sSatOffset === 3 ? 'selected' : ''}>+3 (приблизить)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Раздел: Интерактивный поиск данных окружения -->
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 15px;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: bold; color: #1e3a8a;">
                        <input type="checkbox" id="sch_skipLoad" ${sSkipLoad ? 'checked' : ''}> Не загружать объекты повторно (быстрая перерисовка)
                    </label>
                    <div id="sch_load_options" style="display: ${sSkipLoad ? 'none' : 'flex'}; gap: 15px; align-items: center;">
                        <label style="cursor: pointer;"><input type="checkbox" id="sch_loadZouit" ${sLoadZouit ? 'checked' : ''}> Запрашивать ЗОУИТ</label>
                        <label style="cursor: pointer;"><input type="checkbox" id="sch_zouitNearby" ${sZouitNearby ? 'checked' : ''}> В буфере 10м</label>
                        <label style="cursor: pointer;"><input type="checkbox" id="sch_loadNearby" ${sLoadNearby ? 'checked' : ''}> Искать соседние ЗУ</label>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <label style="color:#555;">Радиус (м):</label>
                            <input type="number" id="sch_nearbyRadius" value="${sNearbyRadius}" style="width: 60px; padding: 3px; border: 1px solid #ccc; border-radius: 4px;">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Блок Дополнительных Индивидуальных Опций Оформления -->
            <div style="background: #fff; border: 1px dashed #cbd5e1; padding: 10px; border-radius: 8px; display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px; font-size: 0.85rem;">
                <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
                    <span>Цвет контура ПЗЗ:</span>
                    <input type="color" id="sch_pzzLineColor" value="${sPzzLineColor}" style="width: 40px; height: 24px; border: none; cursor: pointer; border-radius: 4px;">
                </div>
                <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <input type="checkbox" id="sch_pzzShowPoints" ${sPzzShowPoints ? 'checked' : ''}> Точки на ПЗЗ
                </label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>Цвет контура спутника:</span>
                    <input type="color" id="sch_satLineColor" value="${sSatLineColor}" style="width: 40px; height: 24px; border: none; cursor: pointer; border-radius: 4px;">
                </div>
                <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <input type="checkbox" id="sch_satShowPoints" ${sSatShowPoints ? 'checked' : ''}> Точки на спутнике
                </label>
            </div>

            <div style="border-top: 1px solid #ddd; margin: 15px 0 10px 0;"></div>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button id="sch_export_json_btn" class="btn-ui" style="flex: 1; padding: 8px; font-size: 11px; background: #6c757d; cursor: pointer; color: white; border: none; border-radius: 4px;">Экспорт JSON</button>
                <button id="sch_import_json_btn" class="btn-ui" style="flex: 1; padding: 8px; font-size: 11px; background: #6c757d; cursor: pointer; color: white; border: none; border-radius: 4px;">Импорт JSON</button>
                <input type="file" id="sch_import_file_input" accept=".json" style="display: none;">
            </div>

            <div style="border-top: 1px solid #ddd; margin: 10px 0;"></div>

            <div class="buttons" style="display: flex; gap: 8px; margin-top: 15px;">
                <button id="sch_apply_btn" class="apply-btn" style="flex: 1; padding: 10px; font-weight: bold;"><i class="fas fa-check"></i> Сформировать схему</button>
                <button id="sch_cancel_btn" class="cancel-btn" style="flex: 1; padding: 10px; font-weight: bold;"><i class="fas fa-times"></i> Отмена</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const zoomModeSelect = modal.querySelector('#sch_zoomMode');
    const offsetsDiv = modal.querySelector('#sch_offsets_container');
    const toggleOffsets = () => {
        offsetsDiv.style.display = zoomModeSelect.value === 'individual' ? 'flex' : 'none';
    };
    zoomModeSelect.addEventListener('change', toggleOffsets);
    toggleOffsets();

    const skipLoadCheckbox = modal.querySelector('#sch_skipLoad');
    const dataOptionsDiv = modal.querySelector('#sch_load_options');

    const toggleDataOptions = () => {
        if (skipLoadCheckbox.checked) {
            dataOptionsDiv.style.display = 'none';
        } else {
            dataOptionsDiv.style.display = 'flex';
        }
    };
    skipLoadCheckbox.addEventListener('change', toggleDataOptions);
    toggleDataOptions();

    // Обновление числовых подписей слайдеров в реальном времени
    modal.querySelector('#sch_lineWidth').addEventListener('input', e => modal.querySelector('#sch_lineWidth_val').textContent = e.target.value);
    modal.querySelector('#sch_fillOpacity').addEventListener('input', e => modal.querySelector('#sch_fillOpacity_val').textContent = e.target.value);
    modal.querySelector('#sch_pointFontSize').addEventListener('input', e => modal.querySelector('#sch_pointFontSize_val').textContent = e.target.value);

    // Функция экспорта конфигурации
    modal.querySelector('#sch_export_json_btn').onclick = () => {
        const config = {
            lineColor: modal.querySelector('#sch_lineColor').value,
            lineWidth: parseInt(modal.querySelector('#sch_lineWidth').value, 10),
            fillColor: modal.querySelector('#sch_fillColor').value,
            fillOpacity: parseInt(modal.querySelector('#sch_fillOpacity').value, 10),
            showPoints: modal.querySelector('#sch_showPoints').checked,
            pointColor: modal.querySelector('#sch_pointColor').value,
            pointFontSize: parseInt(modal.querySelector('#sch_pointFontSize').value, 10),
            autoSort: modal.querySelector('#sch_autoSort').checked,
            
            cptShowZu: modal.querySelector('#sch_cptShowZu').checked,
            cptShowZouit: modal.querySelector('#sch_cptShowZouit').checked,
            cptZuNameMode: modal.querySelector('#sch_cptZuNameMode').value,
            pzzShowZu: modal.querySelector('#sch_pzzShowZu').checked,
            pzzShowZouit: modal.querySelector('#sch_pzzShowZouit').checked,
            pzzZuNameMode: modal.querySelector('#sch_pzzZuNameMode').value,
            satShowZu: modal.querySelector('#sch_satShowZu').checked,
            satShowZouit: modal.querySelector('#sch_satShowZouit').checked,
            satZuNameMode: modal.querySelector('#sch_satZuNameMode').value,

            quarter: modal.querySelector('#sch_quarter').value.trim(),
            settlement: modal.querySelector('#sch_settlement').value.trim(),
            municipality: modal.querySelector('#sch_municipality').value.trim(),
            terrZone: modal.querySelector('#sch_terrZone').value.trim(),
            zuName: modal.querySelector('#sch_zuName').value.trim(),
            approvalDoc: modal.querySelector('#sch_approvalDoc').value.trim(),
            scaleText: modal.querySelector('#sch_scaleText').value.trim(),
            includePzz: modal.querySelector('#sch_includePzz').checked,
            includeSat: modal.querySelector('#sch_includeSat').checked,
            includeParts: modal.querySelector('#sch_includeParts').checked,
            zoomMode: zoomModeSelect.value,
            pzzOffset: parseInt(modal.querySelector('#sch_pzzOffset').value, 10),
            satOffset: parseInt(modal.querySelector('#sch_satOffset').value, 10),
            pzzLineColor: modal.querySelector('#sch_pzzLineColor').value,
            pzzShowPoints: modal.querySelector('#sch_pzzShowPoints').checked,
            satLineColor: modal.querySelector('#sch_satLineColor').value,
            satShowPoints: modal.querySelector('#sch_satShowPoints').checked,
            loadZouit: modal.querySelector('#sch_loadZouit').checked,
            zouitNearby: modal.querySelector('#sch_zouitNearby').checked,
            loadNearby: modal.querySelector('#sch_loadNearby').checked,
            nearbyRadius: parseInt(modal.querySelector('#sch_nearbyRadius').value, 10)
        };
        const jsonString = JSON.stringify(config, null, 2);
        const blob = new Blob([jsonString], {type: "application/json;charset=utf-8"});
        saveAs(blob, "настройки_схемы.json");
    };

    const fileInput = modal.querySelector('#sch_import_file_input');
    modal.querySelector('#sch_import_json_btn').onclick = () => {
        fileInput.click();
    };

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target.result);
                if (config.lineColor) modal.querySelector('#sch_lineColor').value = config.lineColor;
                if (config.lineWidth) {
                    modal.querySelector('#sch_lineWidth').value = config.lineWidth;
                    modal.querySelector('#sch_lineWidth_val').textContent = config.lineWidth;
                }
                if (config.fillColor) modal.querySelector('#sch_fillColor').value = config.fillColor;
                if (config.fillOpacity !== undefined) {
                    modal.querySelector('#sch_fillOpacity').value = config.fillOpacity;
                    modal.querySelector('#sch_fillOpacity_val').textContent = config.fillOpacity;
                }
                if (config.showPoints !== undefined) modal.querySelector('#sch_showPoints').checked = config.showPoints;
                if (config.pointColor) modal.querySelector('#sch_pointColor').value = config.pointColor;
                if (config.pointFontSize !== undefined) {
                    modal.querySelector('#sch_pointFontSize').value = config.pointFontSize;
                    modal.querySelector('#sch_pointFontSize_val').textContent = config.pointFontSize;
                }
                if (config.autoSort !== undefined) modal.querySelector('#sch_autoSort').checked = config.autoSort;

                if (config.cptShowZu !== undefined) modal.querySelector('#sch_cptShowZu').checked = config.cptShowZu;
                if (config.cptShowZouit !== undefined) modal.querySelector('#sch_cptShowZouit').checked = config.cptShowZouit;
                if (config.cptZuNameMode !== undefined) modal.querySelector('#sch_cptZuNameMode').value = config.cptZuNameMode;
                if (config.pzzShowZu !== undefined) modal.querySelector('#sch_pzzShowZu').checked = config.pzzShowZu;
                if (config.pzzShowZouit !== undefined) modal.querySelector('#sch_pzzShowZouit').checked = config.pzzShowZouit;
                if (config.pzzZuNameMode !== undefined) modal.querySelector('#sch_pzzZuNameMode').value = config.pzzZuNameMode;
                if (config.satShowZu !== undefined) modal.querySelector('#sch_satShowZu').checked = config.satShowZu;
                if (config.satShowZouit !== undefined) modal.querySelector('#sch_satShowZouit').checked = config.satShowZouit;
                if (config.satZuNameMode !== undefined) modal.querySelector('#sch_satZuNameMode').value = config.satZuNameMode;

                if (config.quarter !== undefined) modal.querySelector('#sch_quarter').value = config.quarter;
                if (config.settlement !== undefined) modal.querySelector('#sch_settlement').value = config.settlement;
                if (config.municipality !== undefined) modal.querySelector('#sch_municipality').value = config.municipality;
                if (config.terrZone !== undefined) modal.querySelector('#sch_terrZone').value = config.terrZone;
                if (config.zuName !== undefined) modal.querySelector('#sch_zuName').value = config.zuName;
                if (config.approvalDoc !== undefined) modal.querySelector('#sch_approvalDoc').value = config.approvalDoc;
                if (config.scaleText !== undefined) modal.querySelector('#sch_scaleText').value = config.scaleText;
                if (config.includePzz !== undefined) modal.querySelector('#sch_includePzz').checked = config.includePzz;
                if (config.includeSat !== undefined) modal.querySelector('#sch_includeSat').checked = config.includeSat;
                if (config.includeParts !== undefined) modal.querySelector('#sch_includeParts').checked = config.includeParts;
                if (config.zoomMode) {
                    zoomModeSelect.value = config.zoomMode;
                    toggleOffsets();
                }
                if (config.pzzOffset !== undefined) modal.querySelector('#sch_pzzOffset').value = config.pzzOffset;
                if (config.satOffset !== undefined) modal.querySelector('#sch_satOffset').value = config.satOffset;
                if (config.pzzLineColor) modal.querySelector('#sch_pzzLineColor').value = config.pzzLineColor;
                if (config.pzzShowPoints !== undefined) modal.querySelector('#sch_pzzShowPoints').checked = config.pzzShowPoints;
                if (config.satLineColor) modal.querySelector('#sch_satLineColor').value = config.satLineColor;
                if (config.satShowPoints !== undefined) modal.querySelector('#sch_satShowPoints').checked = config.satShowPoints;
                if (config.loadZouit !== undefined) modal.querySelector('#sch_loadZouit').checked = config.loadZouit;
                if (config.zouitNearby !== undefined) modal.querySelector('#sch_zouitNearby').checked = config.zouitNearby;
                if (config.loadNearby !== undefined) modal.querySelector('#sch_loadNearby').checked = config.loadNearby;
                if (config.nearbyRadius !== undefined) modal.querySelector('#sch_nearbyRadius').value = config.nearbyRadius;

                showNotification("Настройки успешно загружены из JSON", "success");
            } catch (err) {
                showNotification("Ошибка чтения JSON файла", "error");
            }
        };
        reader.readAsText(file);
    };

    const closeModal = () => document.body.removeChild(modal);
    modal.querySelector('#sch_cancel_btn').onclick = closeModal;

    modal.querySelector('#sch_apply_btn').onclick = () => {
        const config = {
            lineColor: modal.querySelector('#sch_lineColor').value,
            lineWidth: parseInt(modal.querySelector('#sch_lineWidth').value, 10),
            fillColor: modal.querySelector('#sch_fillColor').value,
            fillOpacity: parseInt(modal.querySelector('#sch_fillOpacity').value, 10) / 100,
            showPoints: modal.querySelector('#sch_showPoints').checked,
            pointColor: modal.querySelector('#sch_pointColor').value,
            pointFontSize: parseInt(modal.querySelector('#sch_pointFontSize').value, 10),
            autoSort: modal.querySelector('#sch_autoSort').checked,
            skipLoad: modal.querySelector('#sch_skipLoad').checked,
            loadZouit: modal.querySelector('#sch_loadZouit').checked,
            zouitNearby: modal.querySelector('#sch_zouitNearby').checked,
            loadNearby: modal.querySelector('#sch_loadNearby').checked,
            nearbyRadius: parseInt(modal.querySelector('#sch_nearbyRadius').value, 10) || 200,

            cptShowZu: modal.querySelector('#sch_cptShowZu').checked,
            cptShowZouit: modal.querySelector('#sch_cptShowZouit').checked,
            cptZuNameMode: modal.querySelector('#sch_cptZuNameMode').value,
            pzzShowZu: modal.querySelector('#sch_pzzShowZu').checked,
            pzzShowZouit: modal.querySelector('#sch_pzzShowZouit').checked,
            pzzZuNameMode: modal.querySelector('#sch_pzzZuNameMode').value,
            satShowZu: modal.querySelector('#sch_satShowZu').checked,
            satShowZouit: modal.querySelector('#sch_satShowZouit').checked,
            satZuNameMode: modal.querySelector('#sch_satZuNameMode').value,

            quarter: modal.querySelector('#sch_quarter').value.trim(),
            settlement: modal.querySelector('#sch_settlement').value.trim(),
            municipality: modal.querySelector('#sch_municipality').value.trim(),
            terrZone: modal.querySelector('#sch_terrZone').value.trim(),
            zuName: modal.querySelector('#sch_zuName').value.trim(),
            approvalDoc: modal.querySelector('#sch_approvalDoc').value.trim(),
            scaleText: modal.querySelector('#sch_scaleText').value.trim(),
            includePzz: modal.querySelector('#sch_includePzz').checked,
            includeSat: modal.querySelector('#sch_includeSat').checked,
            includeParts: modal.querySelector('#sch_includeParts').checked,
            zoomMode: zoomModeSelect.value,
            pzzOffset: parseInt(modal.querySelector('#sch_pzzOffset').value, 10),
            satOffset: parseInt(modal.querySelector('#sch_satOffset').value, 10),
            pzzLineColor: modal.querySelector('#sch_pzzLineColor').value,
            pzzShowPoints: modal.querySelector('#sch_pzzShowPoints').checked,
            satLineColor: modal.querySelector('#sch_satLineColor').value,
            satShowPoints: modal.querySelector('#sch_satShowPoints').checked
        };

        // Сохранение в локальное хранилище
        localStorage.setItem('sch_lineColor', config.lineColor);
        localStorage.setItem('sch_lineWidth', config.lineWidth);
        localStorage.setItem('sch_fillColor', config.fillColor);
        localStorage.setItem('sch_fillOpacity', config.fillOpacity * 100);
        localStorage.setItem('sch_showPoints', config.showPoints);
        localStorage.setItem('sch_pointColor', config.pointColor);
        localStorage.setItem('sch_pointFontSize', config.pointFontSize);
        localStorage.setItem('sch_loadZouit', config.loadZouit);
        localStorage.setItem('sch_zouitNearby', config.zouitNearby ? 'true' : 'false');
        localStorage.setItem('sch_loadNearby', config.loadNearby);
        localStorage.setItem('sch_nearbyRadius', config.nearbyRadius);

        localStorage.setItem('sch_cptShowZu', config.cptShowZu);
        localStorage.setItem('sch_cptShowZouit', config.cptShowZouit);
        localStorage.setItem('sch_cptZuNameMode', config.cptZuNameMode);
        localStorage.setItem('sch_pzzShowZu', config.pzzShowZu);
        localStorage.setItem('sch_pzzShowZouit', config.pzzShowZouit);
        localStorage.setItem('sch_pzzZuNameMode', config.pzzZuNameMode);
        localStorage.setItem('sch_satShowZu', config.satShowZu);
        localStorage.setItem('sch_satShowZouit', config.satShowZouit);
        localStorage.setItem('sch_satZuNameMode', config.satZuNameMode);

        localStorage.setItem('sch_quarter', config.quarter);
        localStorage.setItem('sch_settlement', config.settlement);
        localStorage.setItem('sch_municipality', config.municipality);
        localStorage.setItem('sch_terrZone', config.terrZone);
        localStorage.setItem('sch_zuName', config.zuName);
        localStorage.setItem('sch_approvalDoc', config.approvalDoc);
        localStorage.setItem('sch_scaleText', config.scaleText);
        localStorage.setItem('sch_includePzz', config.includePzz);
        localStorage.setItem('sch_includeSat', config.includeSat);
        localStorage.setItem('sch_includeParts', config.includeParts);
        localStorage.setItem('sch_zoomMode', config.zoomMode);
        localStorage.setItem('sch_pzzOffset', config.pzzOffset);
        localStorage.setItem('sch_satOffset', config.satOffset);
        localStorage.setItem('sch_pzzLineColor', config.pzzLineColor);
        localStorage.setItem('sch_pzzShowPoints', config.pzzShowPoints);
        localStorage.setItem('sch_satLineColor', config.satLineColor);
        localStorage.setItem('sch_satShowPoints', config.satShowPoints);

        closeModal();
        executeSchemaGeneration(lat, lon, targetPolygon, config);
    };
}

async function silentLoadRasterForSchema(quarterNumber) {
    if (rasterOverlay) return true;
    const quarterSafe = quarterNumber.replace(/:/g, '_');
    const filename = `${quarterSafe}.rst`;
    try {
        const response = await fetch(`${STORAGE_API_URL}/nspd/${filename}`);
        if (!response.ok) return false;
        const zipBlob = await response.blob();
        await processImportedZipBlob(zipBlob);
        return true;
    } catch (e) {
        return false;
    }
}

async function executeSchemaGeneration(lat, lon, targetPolygon, config) {
    showLoader('Подготовка Схемы КПТ (1/4)...');

    // Очистка старых шаблонов позиций во избежание конфликтов и сдвигов
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sch_tpl_')) {
            localStorage.removeItem(key);
        }
    }

    const originalMode = localStorage.getItem('mapMode') || 'map';
    const originalCenter = map.getCenter();
    const originalZoom = map.getZoom();
    const originalRasterVisible = rasterOverlay ? rasterOverlay.options.get('visible') : false;

    const origStrokeColor = targetPolygon.options.get('strokeColor');
    const origStrokeWidth = targetPolygon.options.get('strokeWidth');
    const origFillColor = targetPolygon.options.get('fillColor');

    const originalVisibilities = new Map();
    const saveOriginalVisibilities = () => {
        originalVisibilities.clear();
        polygons.forEach(p => {
            if (p.options) {
                originalVisibilities.set(p, p.options.get('visible'));
            }
        });
        parcelPlacemarks.forEach(pm => {
            if (pm.options) {
                originalVisibilities.set(pm, pm.options.get('visible'));
            }
        });
    };

    const restoreOriginalVisibilities = () => {
        originalVisibilities.forEach((vis, p) => {
            if (p.options) {
                p.options.set('visible', vis);
            }
        });
    };

    const setLayerVisibilityForPage = (pageConfig) => {
        polygons.forEach(p => {
            if (p === targetPolygon) {
                p.options.set('visible', true);
                return;
            }

            const categoryName = (p.properties.get('featureData')?.properties?.categoryName || '').toLowerCase();
            const categoryId = p.properties.get('featureData')?.properties?.category;

            const isZouit = p.properties.get('isZouit') || 
                            categoryId === 36940 ||
                            categoryName.includes('зоуит') ||
                            categoryName.includes('ограничен');

            const isZu = p.properties.get('isParcelInQuarter') || 
                         p.properties.get('isFoundInArea') || 
                         !!p.properties.get('cadastralNumber') ||
                         categoryName.includes('участ') ||
                         categoryId === 36275;

            if (p instanceof ymaps.Polygon) {
                if (isZu) {
                    p.options.set('visible', pageConfig.showZu);
                } else if (isZouit) {
                    p.options.set('visible', pageConfig.showZouit);
                }
            } else if (p instanceof ymaps.Placemark) {
                if (isZu) {
                    p.options.set('visible', pageConfig.showZu);
                } else if (isZouit) {
                    p.options.set('visible', pageConfig.showZouit);
                }
            }
        });

        parcelPlacemarks.forEach(pm => {
            pm.options.set('visible', pageConfig.showZu && map.getZoom() > 14);
        });
    };

    try {
        saveOriginalVisibilities();

        const fillHex = Math.round(config.fillOpacity * 255).toString(16).padStart(2, '0');
        targetPolygon.options.set({
            strokeColor: config.lineColor,
            strokeWidth: config.lineWidth,
            fillColor: config.fillOpacity > 0 ? `${config.fillColor}${fillHex}` : '#00000000',
            zIndex: 1000
        });

        let rings = targetPolygon.geometry.getCoordinates().map(ring => ring.slice());
        rings = rings.map(ring => {
            const firstPt = ring[0];
            const lastPt = ring[ring.length - 1];
            if (Math.abs(firstPt[0] - lastPt[0]) < 1e-7 && Math.abs(firstPt[1] - lastPt[1]) < 1e-7) {
                ring.pop();
            }
            if (config.autoSort) return sortPointsClockwiseNW(ring);
            return ring;
        });

        const pointsToRemove = [];
        polygons.forEach(p => {
            if (p instanceof ymaps.Placemark && p.properties.get('isSchemaPoint')) pointsToRemove.push(p);
        });
        pointsToRemove.forEach(p => { map.geoObjects.remove(p); polygons = polygons.filter(poly => poly !== p); });

        const { mskCoordsTable, centerGeo } = processAndDrawSchemaPoints(rings, targetPolygon, config);

        if (!config.skipLoad) {
            showLoader('Поиск окружения и ЗОУИТ...');
            await loadEnvironmentData(centerGeo, targetPolygon, config);
            window.__schemaDataLoaded = true;
        }

        await new Promise(r => setTimeout(r, 600));

        // --- ЛИСТ 1: СХЕМА КПТ ---
        showLoader('Создание снимка карты КПТ...');
        map.setCenter(centerGeo); 
        setLayerVisibilityForPage({ showZu: config.cptShowZu, showZouit: config.cptShowZouit });
        
        const bounds = map.getBounds();
        const latDelta = bounds[1][0] - bounds[0][0];
        const lonDelta = bounds[1][1] - bounds[0][1];

        // 1. Рассчитываем процентные координаты меток для HTML-слоя
        const labelsData = calculateLabelsData(centerGeo, config);

        // 2. Если условный номер в режиме выноски, рисуем линию-указатель на карте (будет впечена в растр)
        let tempCalloutLine = null;
        if (config.cptZuNameMode === 'callout' && config.zuName) {
            const labelPoint = [centerGeo[0] + latDelta * 0.12, centerGeo[1] - lonDelta * 0.14];
            tempCalloutLine = new ymaps.Polyline([labelPoint, centerGeo], {}, {
                strokeColor: config.calloutLineColor || '#ff3b30',
                strokeWidth: 2.5,
                zIndex: 1205,
                interactivityModel: 'default#transparent'
            });
            map.geoObjects.add(tempCalloutLine);
        }
        
        await new Promise(r => setTimeout(r, 500));
        const mapImageBase64 = await takeMapScreenshotForSchema(config.quarter, config.settlement);
        
        if (tempCalloutLine) map.geoObjects.remove(tempCalloutLine);

        let pzzImageBase64 = null;
        let rasterLoadedSuccessfully = false;

        // --- ЛИСТ 2: СХЕМА ПЗЗ ---
        if (config.includePzz) {
            showLoader('Подготовка ПЗЗ растра...');
            rasterLoadedSuccessfully = await silentLoadRasterForSchema(config.quarter);
            if (rasterLoadedSuccessfully && rasterOverlay) {
                rasterOverlay.options.set('visible', true);
                
                let pzzZoom = originalZoom;
                if (config.zoomMode === 'individual') {
                    pzzZoom = originalZoom + config.pzzOffset;
                }
                map.setZoom(pzzZoom);
                map.setCenter(centerGeo); 

                setLayerVisibilityForPage({ showZu: config.pzzShowZu, showZouit: config.pzzShowZouit });

                targetPolygon.options.set({
                    strokeColor: config.pzzLineColor,
                    fillColor: '#00000000'
                });

                const pzzPointsToRemove = [];
                if (!config.pzzShowPoints) {
                    polygons.forEach(p => {
                        if (p instanceof ymaps.Placemark && p.properties.get('isSchemaPoint')) {
                            pzzPointsToRemove.push(p);
                            p.options.set('visible', false);
                        }
                    });
                }

                if (config.pzzZuNameMode === 'callout' && config.zuName) {
                    const labelPoint = [centerGeo[0] + latDelta * 0.12, centerGeo[1] - lonDelta * 0.14];
                    tempCalloutLine = new ymaps.Polyline([labelPoint, centerGeo], {}, {
                        strokeColor: config.calloutLineColor || '#ff3b30',
                        strokeWidth: 2.5,
                        zIndex: 1205,
                        interactivityModel: 'default#transparent'
                    });
                    map.geoObjects.add(tempCalloutLine);
                }

                await new Promise(r => setTimeout(r, 2000));
                pzzImageBase64 = await takeMapScreenshotForSchema(config.quarter, config.settlement);
                
                if (tempCalloutLine) map.geoObjects.remove(tempCalloutLine);
                rasterOverlay.options.set('visible', false);

                if (!config.pzzShowPoints) {
                    pzzPointsToRemove.forEach(p => p.options.set('visible', true));
                }
            }
        }

        let satelliteImageBase64 = null;

        // --- ЛИСТ 3: СХЕМА НА СПУТНИКЕ ---
        if (config.includeSat) {
            showLoader('Переключение на спутник...');
            setMapMode('google-hyb');

            let satZoom = originalZoom;
            if (config.zoomMode === 'individual') {
                satZoom = originalZoom + config.satOffset;
            }
            map.setZoom(satZoom);
            map.setCenter(centerGeo); 

            setLayerVisibilityForPage({ showZu: config.satShowZu, showZouit: config.satShowZouit });

            targetPolygon.options.set({
                strokeColor: config.satLineColor,
                fillColor: '#00000000'
            });

            const satStyle = document.createElement('style');
            satStyle.id = 'sat-contrast-style';
            satStyle.innerHTML = `
                .custom-placemark {
                    color: #ffffff !important;
                    text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 4px #000 !important;
                }
            `;
            document.head.appendChild(satStyle);

            const satPointsToRemove = [];
            if (!config.satShowPoints) {
                map.geoObjects.each(o => {
                    if (o instanceof ymaps.Placemark && o.properties.get('isSchemaPoint')) {
                        satPointsToRemove.push(o);
                        o.options.set('visible', false);
                    }
                });
            }

            if (config.satZuNameMode === 'callout' && config.zuName) {
                const labelPoint = [centerGeo[0] + latDelta * 0.12, centerGeo[1] - lonDelta * 0.14];
                tempCalloutLine = new ymaps.Polyline([labelPoint, centerGeo], {}, {
                    strokeColor: config.calloutLineColor || '#ff3b30',
                    strokeWidth: 2.5,
                    zIndex: 1205,
                    interactivityModel: 'default#transparent'
                });
                map.geoObjects.add(tempCalloutLine);
            }

            await new Promise(r => setTimeout(r, 3500));
            satelliteImageBase64 = await takeMapScreenshotForSchema(config.quarter, config.settlement);

            if (tempCalloutLine) map.geoObjects.remove(tempCalloutLine);
            satStyle.remove();

            if (!config.satShowPoints) {
                satPointsToRemove.forEach(item => item.options.set('visible', true));
            }
        }

        let partsImageBase64 = null;
        let partsGridStep = 5;
        let partsHeight = 76.7;

        if (config.includeParts) {
            showLoader('Отрисовка чертежа контура...');
            const partsData = generatePartsSchemaImage(targetPolygon, config);
            if (partsData && typeof partsData === 'object' && partsData.image) {
                partsImageBase64 = partsData.image;
                partsGridStep = partsData.gridStep;
                partsHeight = partsData.heightMeters;
            } else {
                partsImageBase64 = partsData;
            }
        }

        window.partsGridStep = partsGridStep;
        window.partsHeight = partsHeight;
        config.partsGridStep = partsGridStep;
        config.partsHeight = partsHeight;

        showLoader('Сброс камеры и подложек...');
        setMapMode(originalMode);
        map.setCenter(originalCenter, originalZoom);
        if (rasterOverlay) {
            rasterOverlay.options.set('visible', originalRasterVisible);
        }

        targetPolygon.options.set({
            strokeColor: origStrokeColor,
            strokeWidth: origStrokeWidth,
            fillColor: origFillColor
        });

        restoreOriginalVisibilities();

        const geomStats = calculatePreciseGeometry(targetPolygon);
        const areaStr = Math.round(geomStats.area).toLocaleString('ru-RU');

        const imgLegendPoly = generateLegendPolygonImage(config.lineColor, config.fillColor, config.fillOpacity);
        const imgLegendPoint = generateLegendPointImage(config.pointColor);

        openSchemaDocumentWindow(
            mapImageBase64, pzzImageBase64, satelliteImageBase64, partsImageBase64,
            mskCoordsTable, areaStr, config.terrZone, imgLegendPoly, imgLegendPoint, labelsData, config,
            partsGridStep, partsHeight
        );
        showNotification('Схема успешно сформирована', 'success');

    } catch (error) {
        showNotification(`Ошибка генерации: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

function addSchemaTemporaryLabels(centerGeo, mapType, config) {
    const tempObjects = [];
    const bounds = map.getBounds();
    if (!bounds) return tempObjects;

    const latDelta = bounds[1][0] - bounds[0][0];
    const lonDelta = bounds[1][1] - bounds[0][1];

    const bgHex = config.calloutBgColor || '#ffffff';
    const bgAlpha = parseFloat(config.calloutBgOpacity !== undefined ? config.calloutBgOpacity : 90) / 100;
    
    const hexToRgba = (hex, alpha) => {
        let c = hex.substring(1);
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const r = parseInt(c.substring(0,2), 16);
        const g = parseInt(c.substring(2,4), 16);
        const b = parseInt(c.substring(4,6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    const calloutBgRgba = hexToRgba(bgHex, bgAlpha);
    
    // Принудительно устанавливаем крупный размер шрифта для схемы (минимальный порог 32px)
    const calloutFontSize = Math.max(32, config.calloutFontSize || 32);
    const calloutFontColor = config.calloutFontColor || '#333333';

    // Вспомогательная функция для расчета точной ширины блока в пикселях.
    // Это критически важно для html2canvas, который ломает "width: max-content" на картах.
    const getWidth = (text, size) => Math.ceil((text.length * (size * 0.65)) + 40);

    // Базовый стиль без свойства width (ширина будет задана индивидуально для каждого блока)
    const styleBase = `position: absolute !important; overflow: visible !important; background: ${calloutBgRgba}; border: 2px solid ${config.calloutLineColor || '#ff3b30'}; padding: 6px 14px; border-radius: 8px; box-shadow: 0 3px 8px rgba(0,0,0,0.2); color: ${calloutFontColor}; font-family: "Times New Roman", Times, serif; white-space: nowrap !important; display: inline-block !important;`;

    if (config.municipality) {
        const size = Math.round(calloutFontSize * 1.1);
        const w = getWidth(config.municipality, size);
        const mStyle = styleBase + ` font-size: ${size}px; font-weight: bold; font-style: italic; width: ${w}px !important;`;
        const mLayout = ymaps.templateLayoutFactory.createClass(`<div style="${mStyle}">${config.municipality}</div>`);
        const p = new ymaps.Placemark([centerGeo[0] + latDelta * 0.22, centerGeo[1]], {}, { iconLayout: mLayout, zIndex: 1200 });
        map.geoObjects.add(p);
        tempObjects.push(p);
    }

    if (config.quarter) {
        const size = calloutFontSize;
        const w = getWidth(config.quarter, size);
        const qStyle = styleBase + ` font-size: ${size}px; font-weight: bold; width: ${w}px !important;`;
        const qLayout = ymaps.templateLayoutFactory.createClass(`<div style="${qStyle}">${config.quarter}</div>`);
        const p = new ymaps.Placemark([centerGeo[0], centerGeo[1] - lonDelta * 0.25], {}, { iconLayout: qLayout, zIndex: 1200 });
        map.geoObjects.add(p);
        tempObjects.push(p);
    }

    if (config.settlement) {
        const size = calloutFontSize;
        const w = getWidth(config.settlement, size);
        const sStyle = styleBase + ` font-size: ${size}px; font-style: italic; width: ${w}px !important;`;
        const sLayout = ymaps.templateLayoutFactory.createClass(`<div style="${sStyle}">${config.settlement}</div>`);
        const p = new ymaps.Placemark([centerGeo[0] - latDelta * 0.22, centerGeo[1] + lonDelta * 0.22], {}, { iconLayout: sLayout, zIndex: 1200 });
        map.geoObjects.add(p);
        tempObjects.push(p);
    }

    if (config.terrZone && mapType !== 'satellite') {
        const size = Math.round(calloutFontSize * 0.9);
        const w = getWidth(config.terrZone, size);
        const tStyle = styleBase + ` font-size: ${size}px; font-weight: bold; width: ${w}px !important;`;
        const tLayout = ymaps.templateLayoutFactory.createClass(`<div style="${tStyle}">${config.terrZone}</div>`);
        const p = new ymaps.Placemark([centerGeo[0] - latDelta * 0.18, centerGeo[1] - lonDelta * 0.2], {}, { iconLayout: tLayout, zIndex: 1200 });
        map.geoObjects.add(p);
        tempObjects.push(p);
    }

    // Выбор режима отрисовки обозначения ЗУ
    let zuNameMode = 'inside';
    if (mapType === 'cp') zuNameMode = config.cptZuNameMode || 'inside';
    else if (mapType === 'pzz') zuNameMode = config.pzzZuNameMode || 'inside';
    else if (mapType === 'satellite') zuNameMode = config.satZuNameMode || 'inside';

    if (zuNameMode !== 'off' && config.zuName) {
        let labelText = config.zuName;
        if (config.quarter && !labelText.includes(config.quarter)) {
            labelText = ":" + labelText;
        }

        const size = calloutFontSize;
        const w = getWidth(labelText, size);

        if (zuNameMode === 'inside') {
            const zStyle = `position: absolute !important; overflow: visible !important; transform: translate(-50%, -50%); color: ${calloutFontColor}; font-size: ${size}px; font-weight: bold; text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 0 6px #fff; font-family: Arial, sans-serif; white-space: nowrap !important; display: inline-block !important; width: ${w}px !important; text-align: center;`;
            const zLayout = ymaps.templateLayoutFactory.createClass(`<div style="${zStyle}">${labelText}</div>`);
            const p = new ymaps.Placemark(centerGeo, {}, { iconLayout: zLayout, zIndex: 1210 });
            map.geoObjects.add(p);
            tempObjects.push(p);
        } else if (zuNameMode === 'callout') {
            const zLayout = ymaps.templateLayoutFactory.createClass(
                `<div style="position: absolute !important; overflow: visible !important; transform: translate(-50%, -50%); ${styleBase} width: ${w}px !important;">${labelText}</div>`
            );
            const labelPoint = [centerGeo[0] + latDelta * 0.12, centerGeo[1] - lonDelta * 0.14];
            const p = new ymaps.Placemark(labelPoint, {}, { iconLayout: zLayout, zIndex: 1210 });
            map.geoObjects.add(p);
            tempObjects.push(p);

            const lineColor = config.calloutLineColor || '#ff3b30';
            const line = new ymaps.Polyline([labelPoint, centerGeo], {}, {
                strokeColor: lineColor,
                strokeWidth: 2.5,
                zIndex: 1205,
                interactivityModel: 'default#transparent'
            });
            map.geoObjects.add(line);
            tempObjects.push(line);
        }
    }

    return tempObjects;
}

function addSchemaCompass(config) {
    if (!config.showCompass) return null;

    const bounds = map.getBounds();
    if (!bounds) return null;

    const top = bounds[1][0];
    const right = bounds[1][1];
    const deltaLat = bounds[1][0] - bounds[0][0];
    const deltaLon = bounds[1][1] - bounds[0][1];

    const compassPos = [top - deltaLat * 0.08, right - deltaLon * 0.08];

    const compassLayout = ymaps.templateLayoutFactory.createClass(
        `<div style="position: absolute; width: 40px; height: 40px; transform: translate(-20px, -20px); background: rgba(255,255,255,0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid ${config.calloutLineColor || '#ff3b30'}; box-shadow: 0 2px 6px rgba(0,0,0,0.15); pointer-events: none;">
            <svg viewBox="0 0 100 100" style="width: 28px; height: 28px;">
                <polygon points="50,10 40,50 50,42" fill="${config.calloutLineColor || '#ff3b30'}" />
                <polygon points="50,10 60,50 50,42" fill="#b3b3b3" />
                <polygon points="50,90 40,50 50,58" fill="#555555" />
                <polygon points="50,90 60,50 50,58" fill="#cccccc" />
                <text x="50" y="28" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="${config.calloutLineColor || '#ff3b30'}" text-anchor="middle" dominant-baseline="central">С</text>
            </svg>
        </div>`
    );

    const compass = new ymaps.Placemark(compassPos, {}, { iconLayout: compassLayout, zIndex: 1300 });
    map.geoObjects.add(compass);
    return compass;
}

function sortPointsClockwiseNW(coords) {
    if (coords.length < 3) return coords;
    let sumLat = 0, sumLon = 0;
    coords.forEach(c => { sumLat += c[0]; sumLon += c[1]; });
    const center = [sumLat / coords.length, sumLon / coords.length];

    const pointsWithAngle = coords.map(c => {
        const dLat = c[0] - center[0]; 
        const dLon = c[1] - center[1]; 
        let angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return { coord: c, angle: angle };
    });

    pointsWithAngle.sort((a, b) => a.angle - b.angle);

    let nwIndex = 0;
    let minDiff = Infinity;
    pointsWithAngle.forEach((p, i) => {
        let diff = Math.abs(p.angle - 315);
        if (diff > 180) diff = 360 - diff; 
        if (diff < minDiff) { minDiff = diff; nwIndex = i; }
    });

    const sortedCoords = [];
    for (let i = 0; i < pointsWithAngle.length; i++) {
        const idx = (nwIndex + i) % pointsWithAngle.length;
        sortedCoords.push(pointsWithAngle[idx].coord);
    }
    return sortedCoords;
}

function processAndDrawSchemaPoints(rings, polygon, config) {
    const destSc = localStorage.getItem('savedDefaultMskSystem') || 'EPSG:6331602';
    const destSystem = COORDINATE_SYSTEMS.find(s => s.value === destSc);
    let mskOffsetX = 0, mskOffsetY = 0;

    if (localStorage.getItem('autoLoadMskOffset') !== 'false' && destSystem) {
        mskOffsetX = destSystem.offsetX || 0; mskOffsetY = destSystem.offsetY || 0;
    } else {
        mskOffsetX = parseFloat((localStorage.getItem('savedMskOffsetX') || '0').replace(',', '.')) || 0;
        mskOffsetY = parseFloat((localStorage.getItem('savedMskOffsetY') || '0').replace(',', '.')) || 0;
    }
    if (destSystem && destSystem.def) proj4.defs(destSc, destSystem.def);

    let mskCoordsTable = [];
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    let globalPointIndex = 1;

    // Гарантируем крупный шрифт точек (минимальный порог 26px для схемы)
    const ptFontSize = Math.max(26, config.pointFontSize || 26);

    rings.forEach((coords) => {
        let firstPointOfRing = null;
        for (let i = 0; i < coords.length; i++) {
            const c = coords[i];
            minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]);
            minLon = Math.min(minLon, c[1]); maxLon = Math.max(maxLon, c[1]);

            const trueLat = c[0] + (mapOffsetY * 0.000008983);
            const trueLon = c[1] + (mapOffsetX * 0.000008983);
            let x_msk = 0, y_msk = 0;
            if (destSystem) {
                const mskPoint = proj4("EPSG:4326", destSc, [trueLon, trueLat]);
                y_msk = mskPoint[0] + mskOffsetY;
                x_msk = mskPoint[1] + mskOffsetX;
            } else {
                x_msk = trueLon; y_msk = trueLat;
            }

            const pointName = `н${globalPointIndex}`;
            const tableEntry = { point: pointName, x: x_msk.toFixed(2), y: y_msk.toFixed(2) };
            mskCoordsTable.push(tableEntry);

            if (i === 0) firstPointOfRing = tableEntry;

            if (config.showPoints) {
                // Сделали кружок точки крупнее и заметнее на схеме (12px)
                const dotLayout = ymaps.templateLayoutFactory.createClass(
                    `<div style="width: 12px; height: 12px; background-color: ${config.pointColor}; border-radius: 50%; border: 1.5px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`
                );
                
                // Добавлена жесткая ширина 90px во избежание переноса номеров точек в html2canvas
                const textLayout = ymaps.templateLayoutFactory.createClass(
                    `<div style="position: absolute !important; overflow: visible !important; color: ${config.pointColor}; font-size: ${ptFontSize}px; font-weight: bold; font-family: Arial; text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff; white-space: nowrap !important; display: inline-block !important; width: 90px !important; text-align: left;">${pointName}</div>`
                );

                const dot = new ymaps.Placemark(c, {}, { iconLayout: dotLayout, iconOffset: [-6, -6], zIndex: 1140 });
                const label = new ymaps.Placemark(c, {}, { iconLayout: textLayout, iconOffset: [12, -14], zIndex: 1150 });
                
                dot.properties.set({ 'isSchemaPoint': true, 'relatedPolygon': polygon });
                label.properties.set({ 'isSchemaPoint': true, 'relatedPolygon': polygon });
                
                map.geoObjects.add(dot); map.geoObjects.add(label);
                polygons.push(dot); polygons.push(label);
            }
            globalPointIndex++;
        }
        
        if (firstPointOfRing) {
            mskCoordsTable.push({ ...firstPointOfRing });
        }
    });

      let centerGeo = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
    try {
        if (typeof turf !== 'undefined' && polygon) {
            const coords = polygon.geometry.getCoordinates()[0];
            const turfCoords = coords.map(c => [c[1], c[0]]);
            const first = turfCoords[0];
            const last = turfCoords[turfCoords.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
                turfCoords.push([...first]);
            }
            const turfPoly = turf.polygon([turfCoords]);
            
            // Если центр описанного прямоугольника (BBox) лежит снаружи полигона (L-образный, U-образный участок)
            const bboxCenterPt = turf.point([centerGeo[1], centerGeo[0]]);
            if (!turf.booleanPointInPolygon(bboxCenterPt, turfPoly)) {
                // Вычисляем точку, которая гарантированно лежит внутри границ полигона
                const internalPtFeature = turf.pointOnFeature(turfPoly);
                const internalCoords = internalPtFeature.geometry.coordinates;
                centerGeo = [internalCoords[1], internalCoords[0]];
                console.log("[Schema] Центр BBox находится снаружи. Вычислена внутренняя точка Turf:", centerGeo);
            }
        }
    } catch (e) {
        console.error("Ошибка расчета внутренней точки Turf.js:", e);
    }

    return { mskCoordsTable, centerGeo };
}


// Функция расчета процентных координат относительно контейнера карты
function calculateLabelsData(centerGeo, config) {
    const labelsData = [];
    const bounds = map.getBounds();
    if (!bounds) return labelsData;

    const latDelta = bounds[1][0] - bounds[0][0];
    const lonDelta = bounds[1][1] - bounds[0][1];

    const mapElement = document.getElementById('map');
    const mapRect = mapElement.getBoundingClientRect();
    const projection = map.options.get('projection');
    const zoom = map.getZoom();

    const getRelativePct = (geoCoords) => {
        const globalPx = projection.toGlobalPixels(geoCoords, zoom);
        const pagePx = map.converter.globalToPage(globalPx);
        const relX = pagePx[0] - mapRect.left;
        const relY = pagePx[1] - mapRect.top;
        return {
            x: (relX / mapRect.width) * 100,
            y: (relY / mapRect.height) * 100
        };
    };

    if (config.municipality) {
        const pct = getRelativePct([centerGeo[0] + latDelta * 0.22, centerGeo[1]]);
        labelsData.push({ text: config.municipality, type: 'municipality', pctX: pct.x, pctY: pct.y });
    }
    if (config.quarter) {
        const pct = getRelativePct([centerGeo[0], centerGeo[1] - lonDelta * 0.25]);
        labelsData.push({ text: config.quarter, type: 'quarter', pctX: pct.x, pctY: pct.y });
    }
    if (config.settlement) {
        const pct = getRelativePct([centerGeo[0] - latDelta * 0.22, centerGeo[1] + lonDelta * 0.22]);
        labelsData.push({ text: config.settlement, type: 'settlement', pctX: pct.x, pctY: pct.y });
    }
    if (config.terrZone) {
        const pct = getRelativePct([centerGeo[0] - latDelta * 0.18, centerGeo[1] - lonDelta * 0.2]);
        labelsData.push({ text: config.terrZone, type: 'terrZone', pctX: pct.x, pctY: pct.y });
    }
    if (config.zuName) {
        let labelText = config.zuName;
        if (config.quarter && !labelText.includes(config.quarter)) {
            labelText = ":" + labelText;
        }
        const pctInside = getRelativePct(centerGeo);
        const pctCallout = getRelativePct([centerGeo[0] + latDelta * 0.12, centerGeo[1] - lonDelta * 0.14]);
        
        labelsData.push({ 
            text: labelText, 
            type: 'zuName', 
            pctX_inside: pctInside.x, 
            pctY_inside: pctInside.y,
            pctX_callout: pctCallout.x,
            pctY_callout: pctCallout.y
        });
    }

    return labelsData;
}

function generateInteractiveLabelsHtml(labelsData, pageType, config, calloutBgRgba, calloutFontSize, calloutFontColor) {
    return labelsData.map(l => {
        if (pageType === 'satellite' && l.type === 'terrZone') return '';
        
        let text = l.text;
        let showLabel = true;
        let zuNameMode = 'inside';
        
        if (pageType === 'cp') zuNameMode = config.cptZuNameMode || 'inside';
        else if (pageType === 'pzz') zuNameMode = config.pzzZuNameMode || 'inside';
        else if (pageType === 'satellite') zuNameMode = config.satZuNameMode || 'inside';

        if (l.type === 'zuName' && zuNameMode === 'off') {
            showLabel = false;
        }

        if (!showLabel) return '';

        // Принудительно устанавливаем крупный размер шрифта для схемы (минимальный порог 28px)
        const baseFontSize = Math.max(28, config.calloutFontSize || 28);
        let fontSize = baseFontSize;
        if (l.type === 'municipality') fontSize = Math.round(baseFontSize * 1.1);
        if (l.type === 'terrZone') fontSize = Math.round(baseFontSize * 0.9);

        // По умолчанию фон у меток ВЫКЛЮЧЕН только на основной схеме (КПТ)
        const isNoBg = (pageType === 'cp');

        // Цвет выноски по умолчанию: белый для спутника, красный для остальных (КПТ и ПЗЗ)
        let defaultLineColor = '#ff3b30';
        if (pageType === 'satellite') {
            defaultLineColor = '#ffffff';
        } else if (config.calloutLineColor) {
            defaultLineColor = config.calloutLineColor;
        }

        // Если фон отключен по умолчанию, делаем шрифт такого же цвета, как линия выноски
        const finalFontColor = isNoBg ? defaultLineColor : calloutFontColor;

        let pctX = l.pctX;
        let pctY = l.pctY;
        if (l.type === 'zuName') {
            if (zuNameMode === 'inside') {
                pctX = l.pctX_inside;
                pctY = l.pctY_inside;
            } else if (zuNameMode === 'callout') {
                pctX = l.pctX_callout;
                pctY = l.pctY_callout;
            }
        }

        // Метки имеют активную выноску по умолчанию, кроме имени строго внутри полигона
        const hasCalloutClass = (l.type !== 'zuName' || zuNameMode === 'callout') ? 'has-callout' : '';

        // ВЫЧИСЛЕНИЕ ШИРИНЫ ДЛЯ ИНТЕРАКТИВНОЙ МЕТКИ (Предотвращает перенос строк в html2canvas)
        const w = Math.ceil((text.length * (fontSize * 0.65)) + 40);

        return `
            <div class="interactive-label ${isNoBg ? 'no-bg' : ''} ${hasCalloutClass}" 
                 style="left: ${pctX}%; top: ${pctY}%;" 
                 data-type="${l.type}" 
                 data-anchor-x="${l.pctX_inside}" 
                 data-anchor-y="${l.pctY_inside}" 
                 data-default-color="${defaultLineColor}">
                <span contenteditable="true" class="label-text" title="Двойной клик — изменить текст, зажать — перетащить" style="font-size: ${fontSize}px; background: ${calloutBgRgba}; border: 1.5px solid ${config.calloutLineColor || '#ff3b30'}; color: ${finalFontColor}; white-space: nowrap !important; display: inline-block !important; width: ${w}px !important; text-align: center;">${text}</span>
                <div class="label-controls">
                    <button class="ctrl-btn size-up" data-tooltip="Увеличить шрифт">+</button>
                    <button class="ctrl-btn size-down" data-tooltip="Уменьшить шрифт">-</button>
                    <input type="color" class="color-picker" data-tooltip="Цвет шрифта" value="${finalFontColor}">
                    <button class="ctrl-btn toggle-bg" data-tooltip="Фон/Граница"><i class="fas ${isNoBg ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
                    <button class="ctrl-btn toggle-callout" data-tooltip="Вкл/Выкл выноску"><i class="fas fa-slash"></i></button>
                    <button class="ctrl-btn delete-lbl" data-tooltip="Удалить метку">&times;</button>
                </div>
            </div>
        `;
    }).join('');
}



function addVisibleZouitLabelsForSchema() {
    const addedLabels = [];
    const bounds = map.getBounds();
    if (!bounds) return addedLabels;

    const screenBbox = [
        Math.min(bounds[0][1], bounds[1][1]), Math.min(bounds[0][0], bounds[1][0]),
        Math.max(bounds[0][1], bounds[1][1]), Math.max(bounds[0][0], bounds[1][0])
    ];
    const screenPoly = turf.bboxPolygon(screenBbox);
    const drawnZouitLabels = new Set();

    polygons.forEach(obj => {
        if (obj instanceof ymaps.Polygon && (obj.properties.get('isZouit') || obj.properties.get('featureData')?.properties?.category === 36940)) {
            const regNum = obj.properties.get('cadastralNumber');
            const featureData = obj.properties.get('featureData');
            const name = obj.properties.get('name') || featureData?.properties?.options?.name_by_doc || '';
            if (!regNum) return;

            const fullName = name ? `${regNum} - ${name}` : regNum;
            if (drawnZouitLabels.has(fullName)) return;

            try {
                const rings = obj.geometry.getCoordinates();
                const geoJsonCoords = rings.map(ring => ring.map(c => [c[1], c[0]]));
                const turfPoly = turf.polygon(geoJsonCoords);

                const intersection = turf.intersect(turf.featureCollection([turfPoly, screenPoly]));
                if (!intersection) return;

                let pointToLabel;
                try {
                     pointToLabel = turf.centerOfMass(intersection);
                } catch(e) {
                     pointToLabel = turf.centroid(intersection);
                }

                if (pointToLabel && pointToLabel.geometry) {
                    const coords = [pointToLabel.geometry.coordinates[1], pointToLabel.geometry.coordinates[0]];

                    const strokeColor = obj.options.get('strokeColor');
                    let preset = 'islands#orangeStretchyIcon';
                    if (strokeColor && strokeColor.toUpperCase().includes('FF0000')) preset = 'islands#redStretchyIcon';
                    else if (strokeColor && (strokeColor.toUpperCase().includes('FFBF00') || strokeColor.toUpperCase().includes('FFA500'))) preset = 'islands#yellowStretchyIcon';

                    const label = new ymaps.Placemark(coords, {
                        iconContent: fullName
                    }, {
                        preset: preset,
                        zIndex: 1500
                    });

                    map.geoObjects.add(label);
                    polygons.push(label);
                    addedLabels.push(label);
                    drawnZouitLabels.add(fullName);
                }
            } catch(e) {
                console.error("Ошибка при расчете центра ЗОУИТ для схемы:", e);
            }
        }
    });

    return addedLabels;
}

async function loadEnvironmentData(centerGeo, polygon, config) {
    const trueLat = centerGeo[0] + (mapOffsetY * 0.000008983);
    const trueLon = centerGeo[1] + (mapOffsetX * 0.000008983);
    const centerPoint = proj4("EPSG:4326", "EPSG:3857", [trueLon, trueLat]);
    
    const oldBounds = map.getBounds();
    try {
        if (config.loadNearby) {
            const halfSize = config.nearbyRadius; 
            const box3857 = [
                [centerPoint[0] - halfSize, centerPoint[1] - halfSize], [centerPoint[0] + halfSize, centerPoint[1] - halfSize],
                [centerPoint[0] + halfSize, centerPoint[1] + halfSize], [centerPoint[0] - halfSize, centerPoint[1] + halfSize],
                [centerPoint[0] - halfSize, centerPoint[1] - halfSize]
            ];
            const parcels = await searchParcelsByArea(box3857);
            if (parcels && parcels.length > 0) await drawFoundParcels(parcels, false);
        }

        const promises = [
            searchFeaturesByGeometry(polygon, 36369),
            searchFeaturesByGeometry(polygon, 36383)
        ];

        if (config.loadZouit) {
            let zouitSearchObj = polygon;
            if (config.zouitNearby) {
                const rings = polygon.geometry.getCoordinates();
                const turfRings = rings.map(ring => ring.map(c => [c[1], c[0]]));
                const turfPoly = turf.polygon(turfRings);
                const bbox = turf.bbox(turfPoly);
                const bboxPoly = turf.bboxPolygon(bbox);
                const buffered = turf.buffer(bboxPoly, 50, { units: 'meters' });
                const ymapsCoords = buffered.geometry.coordinates.map(ring => ring.map(c => [c[1], c[0]]));
                zouitSearchObj = new ymaps.Polygon(ymapsCoords);
            }
            promises.push(searchFeaturesByGeometry(zouitSearchObj, 36940));
        } else {
            promises.push(Promise.resolve([]));
        }

        const [oks, structs, zouits] = await Promise.all(promises);

        if (oks && oks.length > 0) await processAndDrawBuildings(oks);
        if (structs && structs.length > 0) await processAndDrawStructures(structs);
        if (zouits && zouits.length > 0) await processAndDrawZouits(zouits);
        
    } catch (e) {
    } finally {
        map.setBounds(oldBounds, {duration: 0});
    }
}

async function fetchTerrZoneName(centerGeo) {
    const trueLat = centerGeo[0] + (mapOffsetY * 0.000008983);
    const trueLon = centerGeo[1] + (mapOffsetX * 0.000008983);
    const res = await searchContainingObjectByPoint(trueLat, trueLon, 36315);
    if (res && res.features && res.features.length > 0) {
        const props = res.features[0].properties || {};
        const opts = props.options || {};
        const regNum = opts.reg_numb_border || props.descr || '';
        const name = opts.name_by_doc || opts.type_zone || 'Территориальная зона';
        const fullName = regNum ? `${regNum} - ${name}` : name;
        
        const tzLabel = new ymaps.Placemark([centerGeo[0] + 0.0002, centerGeo[1]], { iconContent: `ТЗ: ${fullName}` }, { preset: 'islands#blueStretchyIcon', zIndex: 1200 });
        map.geoObjects.add(tzLabel); polygons.push(tzLabel);
        return fullName;
    }
    return "Не установлена";
}

function findTerrZoneLocally(centerGeo) {
    if (!centerGeo) return null;
    const p = turf.point([centerGeo[1], centerGeo[0]]);
    for (const obj of polygons) {
        if (obj instanceof ymaps.Polygon && obj.properties.get('featureData')) {
            const fd = obj.properties.get('featureData');
            if (fd.properties?.category === 36315 || fd.properties?.categoryName === 'Территориальные зоны') {
                try {
                    const coords = obj.geometry.getCoordinates()[0];
                    const turfPoly = turf.polygon([coords.map(c => [c[1], c[0]])]);
                    if (turf.booleanPointInPolygon(p, turfPoly)) {
                        const props = fd.properties || {};
                        const opts = props.options || {};
                        const regNum = opts.reg_numb_border || props.descr || '';
                        const name = opts.name_by_doc || opts.type_zone || 'Территориальная зона';
                        return regNum ? `${regNum} - ${name}` : name;
                    }
                } catch (e) {}
            }
        }
    }
    return null;
}

async function takeMapScreenshotForSchema(quarter, settlement) {
    const mapElement = document.getElementById('map');
    const canvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: mapElement.clientWidth,
        height: mapElement.clientHeight,
        scrollX: 0,
        scrollY: 0,
        ignoreElements: (element) => {
            if (typeof element.className === 'string') {
                return element.className.includes('-copyright') || 
                       element.className.includes('-gototech') || 
                       element.className.includes('-gotoymaps');
            }
            return false;
        }
    });
    return canvas.toDataURL('image/png'); 
}

function generateLegendPolygonImage(strokeColor, fillColor, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = 30; canvas.height = 30;
    const ctx = canvas.getContext('2d');
    
    ctx.globalAlpha = opacity;
    ctx.fillStyle = fillColor;
    ctx.fillRect(2, 2, 26, 26);
    
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 26, 26);

    return canvas.toDataURL('image/png');
}

function generateLegendPointImage(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(10, 15, 6, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText('н1', 20, 16);

    return canvas.toDataURL('image/png');
}

function generatePartsSchemaImage(targetPolygon, config) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    const padding = 60;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const coords = targetPolygon.geometry.getCoordinates()[0];
    if (!coords || coords.length < 3) return canvas.toDataURL('image/png');

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    coords.forEach(c => {
        minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]);
        minLon = Math.min(minLon, c[1]); maxLon = Math.max(maxLon, c[1]);
    });

    const centerLat = (minLat + maxLat) / 2;
    const latScale = 111132.95 - 559.82 * Math.cos(2 * centerLat * Math.PI / 180);
    const lonScale = 111412.84 * Math.cos(centerLat * Math.PI / 180);

    const localPoints = coords.map(c => {
        return {
            x: (c[1] - minLon) * lonScale,
            y: (c[0] - minLat) * latScale
        };
    });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    localPoints.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });

    const widthMeters = maxX - minX;
    const heightMeters = maxY - minY;

    const scaleX = (canvas.width - padding * 2) / (widthMeters || 1);
    const scaleY = (canvas.height - padding * 2) / (heightMeters || 1);
    const scale = Math.min(scaleX, scaleY);

    let gridStep = 5;
    if (widthMeters > 50) gridStep = 10;
    if (widthMeters > 150) gridStep = 20;
    if (widthMeters > 500) gridStep = 100;

    const startGridX = Math.floor(minX / gridStep) * gridStep;
    const endGridX = Math.ceil(maxX / gridStep) * gridStep;
    const startGridY = Math.floor(minY / gridStep) * gridStep;
    const endGridY = Math.ceil(maxY / gridStep) * gridStep;

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let gx = startGridX; gx <= endGridX; gx += gridStep) {
        const cx = (canvas.width / 2) + (gx - (minX + maxX) / 2) * scale;
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke();
    }
    for (let gy = startGridY; gy <= endGridY; gy += gridStep) {
        const cy = (canvas.height / 2) - (gy - (minY + maxY) / 2) * scale;
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy); ctx.stroke();
    }

    const drawPoints = localPoints.map(p => {
        const cx = (canvas.width / 2) + (p.x - (minX + maxX) / 2) * scale;
        const cy = (canvas.height / 2) - (p.y - (minY + maxY) / 2) * scale;
        return { x: cx, y: cy };
    });

    ctx.beginPath();
    ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
    for (let i = 1; i < drawPoints.length; i++) {
        ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 59, 48, 0.1)'; 
    ctx.fill();
    ctx.strokeStyle = '#ff3b30'; 
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const isClosed = Math.abs(drawPoints[0].x - drawPoints[drawPoints.length-1].x) < 1e-3 && Math.abs(drawPoints[0].y - drawPoints[drawPoints.length-1].y) < 1e-3;
    const drawLimit = isClosed ? drawPoints.length - 1 : drawPoints.length;

    drawPoints.forEach((p, idx) => {
        if (idx >= drawLimit) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });

    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';

    for (let i = 0; i < drawPoints.length - 1; i++) {
        const p1 = drawPoints[i];
        const p2 = drawPoints[i+1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const lp1 = localPoints[i];
        const lp2 = localPoints[i+1];
        const distance = Math.sqrt((lp1.x - lp2.x)**2 + (lp1.y - lp2.y)**2);

        let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
            angle += Math.PI;
        }

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        
        const labelText = `${distance.toFixed(2)} м`;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText(labelText, 0, -4);
        ctx.fillText(labelText, 0, -4);
        ctx.restore();
    }

    let dynamicZuName = config.zuName;
    if (config.quarter && !dynamicZuName.includes(config.quarter)) {
        dynamicZuName = `${config.quarter}:${dynamicZuName}`;
    }

    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ff3b30';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeText(dynamicZuName, canvas.width/2, canvas.height/2);
    ctx.fillText(dynamicZuName, canvas.width/2, canvas.height/2);

    return {
        image: canvas.toDataURL('image/png'),
        gridStep: gridStep,
        heightMeters: parseFloat(heightMeters.toFixed(1))
    };
}

function openSchemaDocumentWindow(mapImage, pzzImage, satelliteImage, partsImage, coordsTable, areaStr, terrZoneName, imgLegendPoly, imgLegendPoint, labelsData, config, partsGridStep = 5, partsHeight = 76.7) {
    const sAl1 = localStorage.getItem('sch_al1') || '';
    const sAl2 = localStorage.getItem('sch_al2') || '';
    const sAl3 = localStorage.getItem('sch_al3') || '';

    function splitApprovalDoc(docText) {
        if (!docText) return ['', '', ''];
        const words = docText.split(' ');
        const lines = ['', '', ''];
        let lineIdx = 0;
        words.forEach(word => {
            if (lineIdx < 2 && (lines[lineIdx] + ' ' + word).length > 45) {
                lineIdx++;
            }
            lines[lineIdx] = (lines[lineIdx] + ' ' + word).trim();
        });
        return lines;
    }

    const docLines = splitApprovalDoc(config.approvalDoc);
    const val1 = sAl1 || docLines[0];
    const val2 = sAl2 || docLines[1];
    const val3 = sAl3 || docLines[2];

    const coordsRows = coordsTable.map(c => `
        <tr>
            <td style="border:1px solid #000; padding:4px; text-align:center;" contenteditable="true">${c.point}</td>
            <td style="border:1px solid #000; padding:4px; text-align:center;" contenteditable="true">${c.x}</td>
            <td style="border:1px solid #000; padding:4px; text-align:center;" contenteditable="true">${c.y}</td>
        </tr>
    `).join('');

    const bgHex = config.calloutBgColor || '#ffffff';
    const bgAlpha = parseFloat(config.calloutBgOpacity !== undefined ? config.calloutBgOpacity : 90) / 100;
    
    const hexToRgba = (hex, alpha) => {
        let c = hex.substring(1);
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const r = parseInt(c.substring(0,2), 16);
        const g = parseInt(c.substring(2,4), 16);
        const b = parseInt(c.substring(2,4), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    const calloutBgRgba = hexToRgba(bgHex, bgAlpha);
    const calloutFontSize = Math.max(24, config.calloutFontSize || 24);
    const calloutFontColor = config.calloutFontColor || '#333333';

    const cptLabelsHtml = generateInteractiveLabelsHtml(labelsData, 'cp', config, calloutBgRgba, calloutFontSize, calloutFontColor);
    const pzzLabelsHtml = config.includePzz ? generateInteractiveLabelsHtml(labelsData, 'pzz', config, calloutBgRgba, calloutFontSize, calloutFontColor) : '';
    const satLabelsHtml = config.includeSat ? generateInteractiveLabelsHtml(labelsData, 'satellite', config, calloutBgRgba, calloutFontSize, calloutFontColor) : '';

    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Схема СРЗУ - Печать</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://unpkg.com/docx@7.8.2/build/index.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
    <style>
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; background: #e9ecef; margin: 0; padding: 20px; }
        .page { background: white; width: 210mm; min-height: 297mm; padding: 15mm 20mm; margin: 0 auto 20px auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; }
        .header-text { text-align: right; margin-bottom: 20px; line-height: 1.2; font-size: 11pt; }
        .auth-line { width: 330px; border: none; border-bottom: 1px solid black; background: transparent; font-family: inherit; font-size: inherit; text-align: center; margin-bottom: 4px; outline: none; }
        .scale-input { border: none; background: transparent; font-family: inherit; font-size: 12pt; font-weight: bold; text-align: center; outline: none; width: 100%; margin-top: 5px; }
        .title { text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 20px; text-transform: uppercase; line-height: 1.3; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10.5pt; }
        th, td { border: 1px solid #000; padding: 5px 6px; text-align: left; }
        th { background-color: #e6f2ff; text-align: center; font-weight: bold; }
        
        .map-frame { width: 100%; height: 380px; border: 1.5px solid #000; box-sizing: border-box; display: flex; justify-content: center; align-items: center; overflow: hidden; background: #fafafa; position: relative; }
        .map-frame img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
        
        .badge-bar { display: flex; justify-content: center; gap: 15px; margin-top: 15px; }
        .badge { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 6px 14px; font-size: 10pt; font-weight: bold; color: #334155; display: flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }

        .btn-panel { position: fixed; top: 20px; left: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 9999; }
        .btn-ui { padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 10pt; cursor: pointer; transition: 0.2s; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .btn-ui:hover { background: #2563eb; transform: translateY(-1px); }
        .btn-save { background: #10b981; }
        .btn-save:hover { background: #059669; }
        .btn-html { background: #f59e0b; }
        .btn-html:hover { background: #d97706; }

        .interactive-label {
            position: absolute;
            transform: translate(-50%, -50%);
            cursor: move;
            user-select: none;
            z-index: 10;
            display: inline-block;
            font-family: "Times New Roman", Times, serif;
        }
        .interactive-label .label-text {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            white-space: nowrap;
            outline: none;
        }
        
        .interactive-label.no-bg .label-text {
            background: transparent !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        
        .interactive-label .label-controls {
            position: absolute;
            left: 100%;
            top: 0;
            margin-left: 5px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
            background: rgba(255,255,255,0.9);
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 2px;
        }
        .interactive-label:hover .label-controls {
            opacity: 1;
            pointer-events: auto;
        }
        .ctrl-btn {
            width: 20px;
            height: 20px;
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            border: 1px solid #ccc;
            background: #fff;
            border-radius: 3px;
        }
        .ctrl-btn:hover {
            background: #eee;
        }
        
        .color-picker {
            width: 20px;
            height: 20px;
            padding: 0;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
            background: none;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }
        .color-picker:hover {
            border-color: #3b82f6;
        }

        @media print {
            body { background: white; padding: 0; }
            .page { box-shadow: none; margin: 0; padding: 15mm; width: 100%; }
            .btn-panel { display: none !important; }
            .label-controls { display: none !important; }
            .interactive-label .label-text {
                border-color: ${config.calloutLineColor || '#ff3b30'} !important;
            }
            .interactive-label.no-bg .label-text {
                border-color: transparent !important;
            }
        }
    </style>
</head>
<body>

    <div class="btn-panel">
        <button class="btn-ui" onclick="window.print()"><i class="fas fa-print"></i> Печать в PDF</button>
        <button class="btn-ui btn-html" onclick="saveAsHtml()"><i class="fas fa-file-code"></i> Сохранить HTML</button>
        <button class="btn-ui btn-save" id="btnExportWord"><i class="fas fa-file-word"></i> Скачать DOCX</button>
    </div>

    <div class="page">
        <div class="header-text">
            <b>Утверждена</b><br>
            <input type="text" id="authLine1" class="auth-line" placeholder="" value="${val1}"><br>
            <input type="text" id="authLine2" class="auth-line" placeholder="" value="${val2}"><br>
            <input type="text" id="authLine3" class="auth-line" value="${val3}"><br>
            <span style="font-size: 8pt; color: #555;">(наименование документа об утверждении, включая наименование органов гос. власти или органов местного самоуправления)</span><br>
            от _____________ № _____
        </div>

        <div class="title">
            Схема расположения земельного участка или земельных участков на кадастровом плане территории
        </div>

        <table>
            <tr><td colspan="3" contenteditable="true"><b>Условный номер земельного участка:</b> ${config.quarter}:${config.zuName}</td></tr>
            <tr><td colspan="3" contenteditable="true"><b>Площадь земельного участка:</b> ${areaStr} кв.м</td></tr>
            <tr><td colspan="3" contenteditable="true"><b>Территориальная зона:</b> ${config.terrZone || 'Не установлена'}</td></tr>
            <tr>
                <th rowspan="2" style="width: 40%;" contenteditable="true">Обозначение характерных точек границ</th>
                <th colspan="2">Координаты в местной системе координат, м</th>
            </tr>
            <tr><th contenteditable="true">X</th><th contenteditable="true">Y</th></tr>
            ${coordsRows}
        </table>

        <div class="map-frame" data-page-type="cp">
            <img src="${mapImage}" alt="">
            <svg class="callout-svg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5;"></svg>
            ${cptLabelsHtml}
        </div>
        <div style="text-align: center;"><input type="text" id="scaleText" class="scale-input" value="${config.scaleText}"></div>

        <div style="margin-top: 15px; font-size: 10pt;">
            <b contenteditable="true">Условные обозначения:</b>
            <div style="display: flex; align-items: center; margin-top: 5px;">
                <img src="${imgLegendPoly}" style="margin-right: 10px; height: 16px;"> <span contenteditable="true">- образуемый земельный участок</span>
            </div>
            <div style="display: flex; align-items: center; margin-top: 5px;">
                <img src="${imgLegendPoint}" style="margin-right: 10px; height: 16px;"> <span contenteditable="true">- обозначение характерной точки границы образуемого земельного участка</span>
            </div>
        </div>
    </div>

    ${(config.includePzz || config.includeSat) ? `
    <div class="page">
        ${config.includePzz ? `
            <div class="title" style="font-size: 12pt; margin-bottom: 10px;">
                Схема расположения образуемого земельного участка на карте градостроительного зонирования ${config.municipality || ''}
            </div>
            <div class="map-frame" data-page-type="pzz" style="height: 380px; margin-bottom: 25px;">
                ${pzzImage ? `<img src="${pzzImage}" alt=""><svg class="callout-svg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5;"></svg>${pzzLabelsHtml}` : `<div style="padding: 40px; text-align: center; color: #777; font-style: italic; border: 1px dashed #999; width:100%; box-sizing:border-box;">Растр ПЗЗ (.rst) для квартала ${config.quarter} не найден в облаке. Снимок пропущен.</div>`}
            </div>
        ` : ''}

        ${config.includeSat ? `
            <div class="title" style="font-size: 12pt; margin-bottom: 10px; ${config.includePzz ? 'margin-top: 20px;' : ''}">
                Схема расположения образуемого земельного участка на спутниковой карте
            </div>
            <div class="map-frame" data-page-type="satellite" style="height: 380px;">
                <img src="${satelliteImage}" alt="">
                <svg class="callout-svg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5;"></svg>
                ${satLabelsHtml}
            </div>
        ` : ''}
    </div>
    ` : ''}

    ${config.includeParts ? `
    <div class="page">
        <div class="title" style="font-size: 13pt;">
            Схема частей образуемого земельного участка
        </div>
        
        <div class="map-frame" style="height: 580px; border: 1px solid #e2e8f0; background: #ffffff;">
            <img src="${partsImage}" style="object-fit: contain;">
        </div>

        <div class="badge-bar">
            <div class="badge"> Сетка: ${partsGridStep} м</div>
            <div class="badge"> Высота: ${partsHeight} м</div>
        </div>
    </div>
    ` : ''}

    <script>
        const al1 = document.getElementById('authLine1');
        const al2 = document.getElementById('authLine2');
        const al3 = document.getElementById('authLine3');
        
        const saveLines = () => {
            localStorage.setItem('sch_al1', al1.value);
            localStorage.setItem('sch_al2', al2.value);
            localStorage.setItem('sch_al3', al3.value);
        };

        if(al1) al1.addEventListener('input', saveLines);
        if(al2) al2.addEventListener('input', saveLines);
        if(al3) al3.addEventListener('input', saveLines);

        function getImageDimensions(base64Str) {
            return new Promise(function(resolve) {
                var img = new Image();
                img.onload = function() {
                    resolve({ w: img.naturalWidth, h: img.naturalHeight });
                };
                img.src = base64Str;
            });
        }

        function saveAsHtml() {
            var html = "<!DOCTYPE html><html>" + document.documentElement.innerHTML + "</html>";
            var blob = new Blob([html], {type: "text/html;charset=utf-8"});
            saveAs(blob, "Схема_расположения.html");
        }

        // Функция перерисовки выносок для конкретной карты
        function updatePageCallouts(frame) {
            const svg = frame.querySelector('.callout-svg');
            if (!svg) return;
            
            svg.innerHTML = '';
            const frameRect = frame.getBoundingClientRect();
            
            frame.querySelectorAll('.interactive-label.has-callout').forEach(label => {
                const anchorX_pct = parseFloat(label.dataset.anchorX);
                const anchorY_pct = parseFloat(label.dataset.anchorY);
                if (isNaN(anchorX_pct) || isNaN(anchorY_pct)) return;
                
                const labelRect = label.getBoundingClientRect();
                
                // Рассчитываем точный геометрический центр текстовой метки в процентах
                const labelX_pct = ((labelRect.left + labelRect.width / 2 - frameRect.left) / frameRect.width) * 100;
                const labelY_pct = ((labelRect.top + labelRect.height / 2 - frameRect.top) / frameRect.height) * 100;
                
                // Переводим смещение из процентов обратно в пиксели для точного расчета зазора
                const dx_px = (labelX_pct - anchorX_pct) * (frameRect.width / 100);
                const dy_px = (labelY_pct - anchorY_pct) * (frameRect.height / 100);
                const dist_px = Math.sqrt(dx_px * dx_px + dy_px * dy_px);

                // Вычисляем точный зазор на основе угла наклона линии, чтобы она упиралась ровно в границы рамки
                const angle = Math.abs(Math.atan2(dy_px, dx_px));
                const isHorizontal = angle < Math.PI / 4 || angle > 3 * Math.PI / 4;
                const gap = isHorizontal ? (labelRect.width / 2 + 6) : (labelRect.height / 2 + 6);

                // Рисуем линию только если метка отодвинута дальше рассчитанного зазора
                if (dist_px > gap) {
                    const ratio = (dist_px - gap) / dist_px;
                    const endX_pct = anchorX_pct + (labelX_pct - anchorX_pct) * ratio;
                    const endY_pct = anchorY_pct + (labelY_pct - anchorY_pct) * ratio;

                    const span = label.querySelector('.label-text');
                    const spanColor = span.style.color ? span.style.color.trim().toLowerCase() : '';
                    
                    // По умолчанию цвет выноски берется из data-default-color
                    let lineColor = label.dataset.defaultColor || '#ff3b30';
                    
                    // Если цвет текста был изменен пользователем вручную (не равен дефолтному темно-серому)
                    if (spanColor && spanColor !== '#333333' && spanColor !== 'rgb(51, 51, 51)') {
                        lineColor = spanColor;
                    }
                    
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', \`\${anchorX_pct}%\`);
                    line.setAttribute('y1', \`\${anchorY_pct}%\`);
                    line.setAttribute('x2', \`\${endX_pct}%\`);
                    line.setAttribute('y2', \`\${endY_pct}%\`);
                    line.setAttribute('stroke', lineColor);
                    line.setAttribute('stroke-width', '2');
                    
                    // Делаем выноску на спутнике штрих-пунктирной для читаемости
                    if (label.dataset.defaultColor === '#ffffff') {
                        line.setAttribute('stroke-dasharray', '5,3');
                    }
                    
                    svg.appendChild(line);
                }
            });
        }

        function updateAllCallouts() {
            document.querySelectorAll('.map-frame').forEach(frame => {
                updatePageCallouts(frame);
            });
        }

      // Логика перемещения, масштабирования и управления живыми метками на страницах
        document.querySelectorAll('.interactive-label').forEach(label => {
            let isDragging = false;
            let startX, startY;
            let startLeft, startTop;
            let hideTimeout; // Индивидуальный таймаут скрытия для каждой метки

            const span = label.querySelector('.label-text');
            const controls = label.querySelector('.label-controls');
            const colorPicker = label.querySelector('.color-picker');

            // --- УПРАВЛЕНИЕ ОТОБРАЖЕНИЕМ ПАНЕЛИ С ЗАДЕРЖКОЙ ---
            const showControls = () => {
                clearTimeout(hideTimeout);
                label.classList.add('show-controls');
            };

            const hideControlsWithDelay = () => {
                clearTimeout(hideTimeout);
                hideTimeout = setTimeout(() => {
                    label.classList.remove('show-controls');
                }, 1000); // 1 секунда задержки перед скрытием
            };

            label.addEventListener('mouseenter', showControls);
            label.addEventListener('mouseleave', hideControlsWithDelay);
            controls.addEventListener('mouseenter', showControls);
            controls.addEventListener('mouseleave', hideControlsWithDelay);

            // --- ПЕРЕТАСКИВАНИЕ ---
            label.addEventListener('mousedown', (e) => {
                if (e.target.closest('.ctrl-btn') || e.target.closest('.color-picker') || (e.target === span && document.activeElement === span)) return;
                
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                startLeft = parseFloat(label.style.left);
                startTop = parseFloat(label.style.top);
                
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const parentRect = label.parentElement.getBoundingClientRect();
                
                const dx = ((e.clientX - startX) / parentRect.width) * 100;
                const dy = ((e.clientY - startY) / parentRect.height) * 100;
                
                label.style.left = (startLeft + dx) + '%';
                label.style.top = (startTop + dy) + '%';
                
                // Обновляем линии при движении метки
                updatePageCallouts(label.parentElement);
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });

            span.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                span.focus();
            });

            // --- КНОПКИ УПРАВЛЕНИЯ ---
            label.querySelector('.size-up').onclick = (ev) => {
                ev.stopPropagation();
                const currentSize = parseInt(window.getComputedStyle(span).fontSize);
                const newSize = currentSize + 2;
                span.style.fontSize = newSize + 'px';
                
                // Пересчитываем ширину контейнера под новый размер шрифта для исключения переносов
                const textLength = span.textContent.length;
                const newWidth = Math.ceil((textLength * (newSize * 0.65)) + 40);
                span.style.width = newWidth + 'px';
                
                updatePageCallouts(label.parentElement);
            };

            label.querySelector('.size-down').onclick = (ev) => {
                ev.stopPropagation();
                const currentSize = parseInt(window.getComputedStyle(span).fontSize);
                const newSize = Math.max(10, currentSize - 2);
                span.style.fontSize = newSize + 'px';
                
                // Пересчитываем ширину контейнера под новый размер шрифта
                const textLength = span.textContent.length;
                const newWidth = Math.ceil((textLength * (newSize * 0.65)) + 40);
                span.style.width = newWidth + 'px';
                
                updatePageCallouts(label.parentElement);
            };

            if (colorPicker) {
                colorPicker.addEventListener('input', (ev) => {
                    span.style.color = ev.target.value;
                    updatePageCallouts(label.parentElement);
                });
                colorPicker.addEventListener('mousedown', (ev) => {
                    ev.stopPropagation();
                });
            }

            label.querySelector('.toggle-bg').onclick = (ev) => {
                ev.stopPropagation();
                label.classList.toggle('no-bg');
                const icon = label.querySelector('.toggle-bg i');
                if (label.classList.contains('no-bg')) {
                    icon.className = 'fas fa-eye';
                } else {
                    icon.className = 'fas fa-eye-slash';
                }
            };

            // Вкл/Выкл выноску
            label.querySelector('.toggle-callout').onclick = (ev) => {
                ev.stopPropagation();
                label.classList.toggle('has-callout');
                updatePageCallouts(label.parentElement);
            };

            label.querySelector('.delete-lbl').onclick = (ev) => {
                ev.stopPropagation();
                label.remove();
                updatePageCallouts(label.parentElement);
            };
        });

        // Первичная отрисовка выносок при загрузке
        updateAllCallouts();

        // Динамический пересчет линий при изменении масштаба/размеров окна
        window.addEventListener('resize', updateAllCallouts);

        document.getElementById('btnExportWord').addEventListener('click', async function() {
            var mapImgData = "${mapImage}";
            var mapDims = await getImageDimensions(mapImgData);
            var mapHeight = Math.round(500 * (mapDims.h / mapDims.w));

            var pzzImgData = "${pzzImage || ''}";
            var pzzHeight = 320;
            if (pzzImgData) {
                var pzzDims = await getImageDimensions(pzzImgData);
                pzzHeight = Math.round(500 * (pzzDims.h / pzzDims.w));
            }

            var satImgData = "${satelliteImage || ''}";
            var satHeight = 320;
            if (satImgData) {
                var satDims = await getImageDimensions(satImgData);
                satHeight = Math.round(500 * (satDims.h / satDims.w));
            }

            var partsImgData = "${partsImage || ''}";
            var partsHeight = 420;
            if (partsImgData) {
                var partsDims = await getImageDimensions(partsImgData);
                partsHeight = Math.round(500 * (partsDims.h / partsDims.w));
            }

            const coords = ${JSON.stringify(coordsTable)};
            const sqImgData = "${imgLegendPoly}";
            const circImgData = "${imgLegendPoint}";
            
            const docRows = [
                new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Условный номер земельного участка: ${config.quarter}:${config.zuName}", size: 22 })] })], columnSpan: 3 })] }),
                new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Площадь земельного участка: ${areaStr} кв.м", size: 22 })] })], columnSpan: 3 })] }),
                new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Территориальная зона: ${config.terrZone || 'Не установлена'}", size: 22 })] })], columnSpan: 3 })] }),
                new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Обозначение характерных точек границ", size: 22 })] })], rowSpan: 2, verticalAlign: docx.VerticalAlign.CENTER, width: { size: 40, type: docx.WidthType.PERCENTAGE } }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Координаты в местной системе координат, м", size: 22 })] })], columnSpan: 2 }),
                    ]
                }),
                new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "X", size: 22, bold: true })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Y", size: 22, bold: true })] })] }),
                    ]
                })
            ];

            coords.forEach(c => {
                docRows.push(new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.point, size: 22 })] })] }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.x, size: 22 })] })], width: { size: 30, type: docx.WidthType.PERCENTAGE } }),
                        new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.y, size: 22 })] })], width: { size: 30, type: docx.WidthType.PERCENTAGE } }),
                    ]
                }));
            });

            const formatLine = (val) => val.trim().length > 0 ? val : "                                                                            ";

            const sections = [{
                properties: { page: { size: { width: docx.convertMillimetersToTwip(210), height: docx.convertMillimetersToTwip(297) }, margin: { top: 1134, right: 850, bottom: 1134, left: 1700 } } },
                children: [
                    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "Утверждена", bold: true, size: 22 })] }),
                    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: formatLine(al1.value), size: 22, underline: { type: "single" } })] }),
                    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: formatLine(al2.value), size: 22, underline: { type: "single" } })] }),
                    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: formatLine(al3.value), size: 22, underline: { type: "single" } })] }),
                    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "(наименование документа об утверждении, включая наименование органов гос. власти или органов местного самоуправления)", size: 16, color: "555555" })] }),
                    new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, spacing: { after: 300 }, children: [
                        new docx.TextRun({ text: "от _____________ № _____ ", size: 22, bold: true })
                    ]}),
                    new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                        new docx.TextRun({ text: "Схема расположения земельного участка или земельных участков на кадастровом плане территории", size: 26, bold: true })
                    ]}),
                    new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: docRows }),
                    new docx.Paragraph({
                        alignment: docx.AlignmentType.CENTER,
                        spacing: { before: 200, after: 100 },
                        children: [
                            new docx.ImageRun({
                                data: mapImgData.split(',')[1],
                                transformation: { width: 500, height: mapHeight }
                            })
                        ]
                    }),
                    new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                        new docx.TextRun({ text: document.getElementById('scaleText').value, size: 22, bold: true })
                    ]}),
                    new docx.Paragraph({ spacing: { after: 100 }, children: [new docx.TextRun({ text: "Условные обозначения:", size: 22, bold: true })] }),
                    new docx.Paragraph({ spacing: { after: 50 }, children: [
                        new docx.ImageRun({ data: sqImgData.split(',')[1], transformation: { width: 18, height: 18 } }),
                        new docx.TextRun({ text: "  - образуемый земельный участок", size: 20 })
                    ]}),
                    new docx.Paragraph({ spacing: { after: 50 }, children: [
                        new docx.ImageRun({ data: circImgData.split(',')[1], transformation: { width: 24, height: 18 } }),
                        new docx.TextRun({ text: "  - обозначение характерной точки границы образуемого земельного участка", size: 20 })
                    ]})
                ]
            }];

            if (${config.includePzz || config.includeSat}) {
                const s2Children = [];
                if (${config.includePzz}) {
                    s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { before: 100, after: 100 }, children: [
                        new docx.TextRun({ text: "Схема расположения образуемого земельного участка на карте градостроительного зонирования", size: 24, bold: true })
                    ]}));
                    if (pzzImgData) {
                        s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                            new docx.ImageRun({ data: pzzImgData.split(',')[1], transformation: { width: 500, height: pzzHeight } })
                        ]}));
                    } else {
                        s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                            new docx.TextRun({ text: "[Растр ПЗЗ не найден в облаке]", size: 20, italic: true })
                        ]}));
                    }
                }
                if (${config.includeSat}) {
                    s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { before: 100, after: 100 }, children: [
                        new docx.TextRun({ text: "Схема расположения образуемого земельного участка на спутниковой карте", size: 24, bold: true })
                    ]}));
                    s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [
                        new docx.ImageRun({ data: satImgData.split(',')[1], transformation: { width: 500, height: satHeight } })
                    ]}));
                }
                sections.push({
                    properties: { page: { size: { width: docx.convertMillimetersToTwip(210), height: docx.convertMillimetersToTwip(297) }, margin: { top: 1134, right: 850, bottom: 1134, left: 1700 } } },
                    children: s2Children
                });
            }

            if (${config.includeParts}) {
                sections.push({
                    properties: { page: { size: { width: docx.convertMillimetersToTwip(210), height: docx.convertMillimetersToTwip(297) }, margin: { top: 1134, right: 850, bottom: 1134, left: 1700 } } },
                    children: [
                        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                            new docx.TextRun({ text: "Схема частей образуемого земельного участка", size: 26, bold: true })
                        ]}),
                        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [
                            new docx.ImageRun({ data: partsImgData.split(',')[1], transformation: { width: 500, height: partsHeight } })
                        ]}),
                        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [
                            new docx.TextRun({ text: "Сетка: ${partsGridStep} м   |   Высота: ${partsHeight} м", size: 20, bold: true })
                        ]})
                    ]
                });
            }

            const doc = new docx.Document({ sections: sections });
            docx.Packer.toBlob(doc).then(blob => {
                saveAs(blob, "Схема_расположения.docx");
            }).catch(e => alert("Ошибка создания DOCX: " + e));
        });
    </script>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(htmlContent);
    win.document.close();
}


function addSchemaGrid(config) {
    const tempObjects = [];
    if (!config.showGrid) return tempObjects;

    const bounds = map.getBounds();
    if (!bounds) return tempObjects;

    const minLat = bounds[0][0];
    const minLon = bounds[0][1];
    const maxLat = bounds[1][0];
    const maxLon = bounds[1][1];

    const deltaLat = maxLat - minLat;
    const deltaLon = maxLon - minLon;

    const destSc = localStorage.getItem('savedDefaultMskSystem') || 'EPSG:6331602';
    const destSystem = COORDINATE_SYSTEMS.find(s => s.value === destSc);
    if (!destSystem) return tempObjects;

    let mskOffsetX = 0, mskOffsetY = 0;
    if (localStorage.getItem('autoLoadMskOffset') !== 'false') {
        mskOffsetX = destSystem.offsetX || 0;
        mskOffsetY = destSystem.offsetY || 0;
    } else {
        mskOffsetX = parseFloat((localStorage.getItem('savedMskOffsetX') || '0').replace(',', '.')) || 0;
        mskOffsetY = parseFloat((localStorage.getItem('savedMskOffsetY') || '0').replace(',', '.')) || 0;
    }
    proj4.defs(destSc, destSystem.def);

    const bl_true = [minLon + (mapOffsetX * 0.000008983), minLat + (mapOffsetY * 0.000008983)];
    const tr_true = [maxLon + (mapOffsetX * 0.000008983), maxLat + (mapOffsetY * 0.000008983)];

    const bl_msk = proj4("EPSG:4326", destSc, bl_true);
    const tr_msk = proj4("EPSG:4326", destSc, tr_true);

    const minX = Math.min(bl_msk[1] + mskOffsetX, tr_msk[1] + mskOffsetX);
    const maxX = Math.max(bl_msk[1] + mskOffsetX, tr_msk[1] + mskOffsetX);
    const minY = Math.min(bl_msk[0] + mskOffsetY, tr_msk[0] + mskOffsetY);
    const maxY = Math.max(bl_msk[0] + mskOffsetY, tr_msk[0] + mskOffsetY);

    const deltaX = maxX - minX;
    const deltaY = maxY - minY;
    const maxDim = Math.max(deltaX, deltaY);

    let step = 100;
    if (maxDim < 100) step = 25;
    else if (maxDim < 250) step = 50;
    else if (maxDim < 500) step = 100;
    else if (maxDim < 1000) step = 250;
    else step = 500;

    const startX = Math.ceil(minX / step) * step;
    const endX = Math.floor(maxX / step) * step;
    const startY = Math.ceil(minY / step) * step;
    const endY = Math.floor(maxY / step) * step;

    const crossLayout = ymaps.templateLayoutFactory.createClass(
        `<div style="position: absolute; width: 14px; height: 14px; transform: translate(-7px, -7px); color: #000000; font-family: Arial, sans-serif; font-size: 16px; text-align: center; line-height: 14px; pointer-events: none; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;">+</div>`
    );
    const labelLayout = ymaps.templateLayoutFactory.createClass(
        `<div style="font-family: Arial, sans-serif; font-size: 9px; color: #555555; background: rgba(255, 255, 255, 0.75); padding: 1px 3px; border-radius: 2px; white-space: nowrap; pointer-events: none; border: 1px solid #bbb; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">$[properties.text]</div>`
    );

    // Отрисовка значений по горизонтальной оси (координаты X)
    for (let x = startX; x <= endX; x += step) {
        const midY = (minY + maxY) / 2;
        const correctedX = x - mskOffsetX;
        const correctedY = midY - mskOffsetY;
        const geoPoint = proj4(destSc, "EPSG:4326", [correctedY, correctedX]);
        const lat = geoPoint[1] - (mapOffsetY * 0.000008983);

        const leftPt = [lat, minLon + deltaLon * 0.02];
        const rightPt = [lat, maxLon - deltaLon * 0.14];

        const lblLeft = new ymaps.Placemark(leftPt, { text: `X:${x.toFixed(0)}` }, { iconLayout: labelLayout, zIndex: 1200 });
        const lblRight = new ymaps.Placemark(rightPt, { text: `X:${x.toFixed(0)}` }, { iconLayout: labelLayout, zIndex: 1200 });
        map.geoObjects.add(lblLeft); map.geoObjects.add(lblRight);
        tempObjects.push(lblLeft); tempObjects.push(lblRight);
    }

    // Отрисовка значений по вертикальной оси (координаты Y)
    for (let y = startY; y <= endY; y += step) {
        const midX = (minX + maxX) / 2;
        const correctedX = midX - mskOffsetX;
        const correctedY = y - mskOffsetY;
        const geoPoint = proj4(destSc, "EPSG:4326", [correctedY, correctedX]);
        const lon = geoPoint[0] - (mapOffsetX * 0.000008983);

        const bottomPt = [minLat + deltaLat * 0.02, lon];
        const topPt = [maxLat - deltaLat * 0.06, lon];

        const lblBottom = new ymaps.Placemark(bottomPt, { text: `Y:${y.toFixed(0)}` }, { iconLayout: labelLayout, zIndex: 1200 });
        const lblTop = new ymaps.Placemark(topPt, { text: `Y:${y.toFixed(0)}` }, { iconLayout: labelLayout, zIndex: 1200 });
        map.geoObjects.add(lblBottom); map.geoObjects.add(lblTop);
        tempObjects.push(lblBottom); tempObjects.push(lblTop);
    }

    // Отрисовка координатных крестов
    for (let x = startX; x <= endX; x += step) {
        for (let y = startY; y <= endY; y += step) {
            const correctedX = x - mskOffsetX;
            const correctedY = y - mskOffsetY;
            const geoPoint = proj4(destSc, "EPSG:4326", [correctedY, correctedX]);
            const lat = geoPoint[1] - (mapOffsetY * 0.000008983);
            const lon = geoPoint[0] - (mapOffsetX * 0.000008983);

            const cross = new ymaps.Placemark([lat, lon], {}, { iconLayout: crossLayout, zIndex: 1100 });
            map.geoObjects.add(cross);
            tempObjects.push(cross);
        }
    }

    return tempObjects;
}

async function executeMskConversion() {
    const sourceText = document.getElementById('msk-coords-input').value.trim();
    const sourceSc = document.getElementById('msk-select').value;
    const mode = 'proj'; 
    const offsetXRaw = document.getElementById('mskOffsetX').value.replace(',', '.');
    const offsetYRaw = document.getElementById('mskOffsetY').value.replace(',', '.');
    const offsetX = parseFloat(offsetXRaw) || 0;
    const offsetY = parseFloat(offsetYRaw) || 0;

    console.log(`[executeMskConversion] Смещения для конвертации: X=${offsetX}, Y=${offsetY} (исходные: "${document.getElementById('mskOffsetX').value}", "${document.getElementById('mskOffsetY').value}")`);
    
    if (!sourceText) {
        showNotification('Введите координаты для конвертации', 'warning');
        return;
    }

    showLoader('Конвертация...');
    
    try {
        let finalResultText = '';

        if (mode === 'proj') {
            const sourceDef = COORDINATE_SYSTEMS.find(s => s.value === sourceSc)?.def;
            if (!sourceDef) throw new Error(`Определение для ${sourceSc} не найдено в sk.js`);
            proj4.defs(sourceSc, sourceDef);

            const lines = sourceText.split('\n');
            const results = lines.map(line => {
                if (line.trim() === '') return '';
                const parts = line.trim().split(/\s+/).map(p => p.replace(',', '.')); 
                if (parts.length !== 2) return "Ошибка: 2 координаты в строке";
                
                const y_input = parseFloat(parts[0]); 
                const x_input = parseFloat(parts[1]); 
                if (isNaN(x_input) || isNaN(y_input)) return "Ошибка: некорректные числа";

                const convertedPoint = proj4(sourceSc, 'EPSG:3857', [x_input, y_input]);
                const finalX = convertedPoint[0] + offsetX;
                const finalY = convertedPoint[1] + offsetY;
                return `${finalX.toFixed(4)}\t${finalY.toFixed(4)}`;
            });
            finalResultText = results.join('\n');

        } else { 
            const response = await fetch('https://cc-psi-livid.vercel.app/api/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceText, sourceSc, destSc: 'EPSG:3857' })
            });
            const result = await response.json();
            if (!response.ok || (result.error && result.error.length > 0)) {
                throw new Error(result.error || `Сервер вернул ошибку ${response.status}`);
            }
            if (!result.destText) throw new Error('Ответ сервера не содержит координат.');

            if (offsetX !== 0 || offsetY !== 0) {
                const lines = result.destText.replace(/\r/g, '').split('\n');
                const shiftedLines = lines.map(line => {
                    if (line.trim() === '') return '';
                    const parts = line.trim().split(/\s+/).map(p => p.replace(',', '.'));
                    if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
                        const x_api = parseFloat(parts[0]) + offsetX;
                        const y_api = parseFloat(parts[1]) + offsetY;
                        return `${x_api.toFixed(4)}\t${y_api.toFixed(4)}`;
                    }
                    return line;
                });
                finalResultText = shiftedLines.join('\n');
            } else {
                finalResultText = result.destText.replace(/\r/g, '');
            }
        }
        
        coordsInput.value = finalResultText;
        findAndConvert();
        
        const modal = document.getElementById('msk-converter-modal');
        if (modal) modal.remove();

    } catch (error) {
        showNotification(`Ошибка: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}
