window.__schemaDataLoaded = false;

function startSchemaWorkflow(lat, lon, targetPolygon) {
	if (!targetPolygon) return;

	let detectedQuarter = currentQuarterNumber || '';
	let detectedSettlement = '';
	let detectedMunicipality = '';
	let detectedTerrZone = '';
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
			if (cat === 36315 || catName.includes('Зоны') || descr.toLowerCase().includes('зона')) {
				detectedTerrZone = name || descr;
			}
		}
	});

	if (!detectedTerrZone) {
		detectedTerrZone = findTerrZoneLocally(targetPolygon.geometry.getCoordinates()[0][0]) || '';
	}

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

	const sLineColor = localStorage.getItem('sch_lineColor') || '#FF0000';
	const sLineWidth = localStorage.getItem('sch_lineWidth') || '3';
	const sFillColor = localStorage.getItem('sch_fillColor') || '#FFA500';
	const sFillOpacity = localStorage.getItem('sch_fillOpacity') || '20';
	const sShowPoints = localStorage.getItem('sch_showPoints') !== 'false';
	const sPointColor = localStorage.getItem('sch_pointColor') || '#FF0000';
	const sSkipLoad = window.__schemaDataLoaded;
	const sLoadZouit = localStorage.getItem('sch_loadZouit') !== 'false';
	const sZouitNearby = localStorage.getItem('sch_zouitNearby') === 'true';
	const sLoadNearby = localStorage.getItem('sch_loadNearby') !== 'false';
	const sNearbyRadius = localStorage.getItem('sch_nearbyRadius') || '200';
	const sScaleText = localStorage.getItem('sch_scaleText') || '';

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
	const sShowZuLabel = localStorage.getItem('sch_showZuLabel') !== 'false';

	modal.innerHTML = `        <div style="background: #ffffff; padding: 25px; width: 80%; max-width: 800px; max-height: 90vh; overflow-y: auto; text-align: left; font-size: 13px; box-sizing: border-box; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: Arial, sans-serif;">             <h3 style="margin: 0 0 15px 0; text-align: center; color: #1e3a8a; font-size: 18px; font-weight: bold;">Настройки Схемы СРЗУ</h3>                          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">                 <div>                     <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">                         <div style="display: flex; flex-direction: column; gap: 3px;">                             <label style="color: #555;">Цвет контура:</label>                             <input type="color" id="sch_lineColor" value="${sLineColor}" style="width: 100%; height: 28px; border-radius: 4px; border:none; cursor:pointer;">                         </div>                         <div style="display: flex; flex-direction: column; gap: 3px;">                             <label style="color: #555;">Толщина: <span id="sch_lineWidth_val">${sLineWidth}</span>px</label>                             <input type="range" id="sch_lineWidth" min="1" max="10" value="${sLineWidth}">                         </div>                         <div style="display: flex; flex-direction: column; gap: 3px;">                             <label style="color: #555;">Цвет заливки:</label>                             <input type="color" id="sch_fillColor" value="${sFillColor}" style="width: 100%; height: 28px; border-radius: 4px; border:none; cursor:pointer;">                         </div>                         <div style="display: flex; flex-direction: column; gap: 3px;">                             <label style="color: #555;">Заливка: <span id="sch_fillOpacity_val">${sFillOpacity}</span>%</label>                             <input type="range" id="sch_fillOpacity" min="0" max="100" value="${sFillOpacity}">                         </div>                     </div>                      <div style="border-top: 1px solid #ddd; margin: 10px 0;"></div>                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">                         <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-weight: bold;">                             <input type="checkbox" id="sch_showPoints" ${sShowPoints ? 'checked' : ''}> Точки (н1, н2...)                         </label>                         <div style="display: flex; align-items: center; gap: 6px;">                             <label style="color: #555;">Цвет:</label>                             <input type="color" id="sch_pointColor" value="${sPointColor}" style="width: 40px; height: 24px; border:none; cursor:pointer;">                         </div>                     </div>                     <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; margin-bottom: 12px; color: #333;">                         <input type="checkbox" id="sch_autoSort" checked> Автоустановка точек (СЗ -> по часовой)                     </label>                      <div style="border-top: 1px solid #ddd; margin: 10px 0;"></div>                      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">                         <label style="font-weight: bold; color: #1e3a8a; font-size: 14px; margin-bottom: 4px;">Страницы отчета</label>                         <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                             <input type="checkbox" id="sch_includePzz" ${sIncludePzz ? 'checked' : ''}> Схема ПЗЗ (загрузка .rst растра)                         </label>                         <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                             <input type="checkbox" id="sch_includeSat" ${sIncludeSat ? 'checked' : ''}> Схема на спутнике                         </label>                         <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                             <input type="checkbox" id="sch_includeParts" ${sIncludeParts ? 'checked' : ''}> Схема частей ЗУ (чертеж размеров сторон)                         </label>                     </div>                      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">                         <label style="font-weight: bold; color: #1e3a8a; font-size: 14px; margin-bottom: 4px;">Индивидуальные настройки страниц</label>                         <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                             <input type="checkbox" id="sch_showZuLabel" ${sShowZuLabel ? 'checked' : ''}> Название ЗУ с выноской                         </label>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="font-size: 0.8rem; color: #475569;">Цвет контура ПЗЗ:</label>                             <input type="color" id="sch_pzzLineColor" value="${sPzzLineColor}" style="width: 50px; height: 24px; border: none; cursor: pointer; border-radius: 4px;">                         </div>                         <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.8rem;">                             <input type="checkbox" id="sch_pzzShowPoints" ${sPzzShowPoints ? 'checked' : ''}> Отображать точки на ПЗЗ                         </label>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="font-size: 0.8rem; color: #475569;">Цвет контура спутника:</label>                             <input type="color" id="sch_satLineColor" value="${sSatLineColor}" style="width: 50px; height: 24px; border: none; cursor: pointer; border-radius: 4px;">                         </div>                         <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.8rem;">                             <input type="checkbox" id="sch_satShowPoints" ${sSatShowPoints ? 'checked' : ''}> Отображать точки на спутнике                         </label>                     </div>                 </div>                  <div>                     <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px;">                         <h4 style="margin: 0 0 4px 0; color: #0f172a; font-size: 14px;">Атрибуты схемы</h4>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="color: #555; white-space: nowrap; width: 100px;">Документ утв.:</label>                             <input type="text" id="sch_approvalDoc" value="${sApprovalDoc}" placeholder="" style="flex:1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;">                         </div>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="color: #555; white-space: nowrap; width: 100px;">Поселение:</label>                             <input type="text" id="sch_municipality" value="${sMunicipality}" placeholder="" style="flex:1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;">                         </div>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="color: #555; white-space: nowrap; width: 100px;">Нас. пункт:</label>                             <input type="text" id="sch_settlement" value="${sSettlement}" placeholder="" style="flex:1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;">                         </div>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="color: #555; white-space: nowrap; width: 100px;">Квартал:</label>                             <input type="text" id="sch_quarter" value="${sQuarter}" placeholder="" style="flex:1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;">                         </div>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="color: #555; white-space: nowrap; width: 100px;">Усл. номер ЗУ:</label>                             <input type="text" id="sch_zuName" value="${sZuName}" placeholder="" style="flex:1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;">                         </div>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="color: #555; white-space: nowrap; width: 100px;">Терр. зона:</label>                             <input type="text" id="sch_terrZone" value="${sTerrZone}" placeholder="" style="flex:1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;">                         </div>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                             <label style="color: #555; white-space: nowrap; width: 100px;">Масштаб подп.:</label>                             <input type="text" id="sch_scaleText" value="${sScaleText}" placeholder="" style="flex:1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px;">                         </div>                     </div>                      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 12px;">                         <h4 style="margin: 0 0 4px 0; color: #0f172a; font-size: 14px;">Масштабирование карт</h4>                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px;">                             <label style="color: #334155; font-size: 0.85rem;">Режим:</label>                             <select id="sch_zoomMode" style="padding: 4px 6px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.85rem;">                                 <option value="constant" ${sZoomMode === 'constant' ? 'selected' : ''}>Постоянный масштаб</option>                                 <option value="individual" ${sZoomMode === 'individual' ? 'selected' : ''}>Индивидуальный масштаб</option>                             </select>                         </div>                         <div id="sch_offsets_container" style="display: flex; flex-direction: column; gap: 6px;">                             <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                                 <label style="color: #334155; font-size: 0.85rem;">Смещение ПЗЗ:</label>                                 <select id="sch_pzzOffset" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.85rem;">                                     <option value="-3" ${sPzzOffset === -3 ? 'selected' : ''}>-3 (отдалить)</option>                                     <option value="-2" ${sPzzOffset === -2 ? 'selected' : ''}>-2 (отдалить)</option>                                     <option value="-1" ${sPzzOffset === -1 ? 'selected' : ''}>-1 (отдалить)</option>                                     <option value="0" ${sPzzOffset === 0 ? 'selected' : ''}>0 (без изменений)</option>                                     <option value="1" ${sPzzOffset === 1 ? 'selected' : ''}>+1 (приблизить)</option>                                     <option value="2" ${sPzzOffset === 2 ? 'selected' : ''}>+2 (приблизить)</option>                                     <option value="3" ${sPzzOffset === 3 ? 'selected' : ''}>+3 (приблизить)</option>                                 </select>                             </div>                             <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                                 <label style="color: #334155; font-size: 0.85rem;">Смещение спутника:</label>                                 <select id="sch_satOffset" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.85rem;">                                     <option value="-3" ${sSatOffset === -3 ? 'selected' : ''}>-3 (отдалить)</option>                                     <option value="-2" ${sSatOffset === -2 ? 'selected' : ''}>-2 (отдалить)</option>                                     <option value="-1" ${sSatOffset === -1 ? 'selected' : ''}>-1 (отдалить)</option>                                     <option value="0" ${sSatOffset === 0 ? 'selected' : ''}>0 (без изменений)</option>                                     <option value="1" ${sSatOffset === 1 ? 'selected' : ''}>+1 (приблизить)</option>                                     <option value="2" ${sSatOffset === 2 ? 'selected' : ''}>+2 (приблизить)</option>                                     <option value="3" ${sSatOffset === 3 ? 'selected' : ''}>+3 (приблизить)</option>                                 </select>                             </div>                         </div>                     </div>                      <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 12px;">                         <h4 style="margin: 0 0 4px 0; color: #0f172a; font-size: 14px;">Поиск данных окружения</h4>                         <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                             <input type="checkbox" id="sch_skipLoad" ${sSkipLoad ? 'checked' : ''}> Не загружать объекты повторно                         </label>                         <div id="sch_data_options" style="display: flex; flex-direction: column; gap: 6px;">                             <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                                 <input type="checkbox" id="sch_loadZouit" ${sLoadZouit ? 'checked' : ''}> Загружать ЗОУИТ                             </label>                             <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                                 <input type="checkbox" id="sch_zouitNearby" ${sZouitNearby ? 'checked' : ''}> ЗОУИТ рядом (буфер 50м от bbox)                             </label>                             <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">                                 <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">                                     <input type="checkbox" id="sch_loadNearby" ${sLoadNearby ? 'checked' : ''}> Участки рядом, м:                                 </label>                                 <input type="number" id="sch_nearbyRadius" value="${sNearbyRadius}" min="10" max="1000" style="width: 70px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px;">                             </div>                         </div>                     </div>                 </div>             </div>              <div style="border-top: 1px solid #ddd; margin: 15px 0 10px 0;"></div>             <div style="display: flex; gap: 8px; margin-bottom: 12px;">                 <button id="sch_export_json_btn" class="btn-ui" style="flex: 1; padding: 8px; font-size: 11px; background: #6c757d; cursor: pointer; color: white; border: none; border-radius: 4px;">Экспорт JSON</button>                 <button id="sch_import_json_btn" class="btn-ui" style="flex: 1; padding: 8px; font-size: 11px; background: #6c757d; cursor: pointer; color: white; border: none; border-radius: 4px;">Импорт JSON</button>                 <input type="file" id="sch_import_file_input" accept=".json" style="display: none;">             </div>              <div style="border-top: 1px solid #ddd; margin: 10px 0;"></div>              <div class="buttons" style="display: flex; gap: 8px; margin-top: 15px;">                 <button id="sch_apply_btn" class="apply-btn" style="flex: 1; padding: 10px; font-weight: bold;"><i class="fas fa-check"></i> Сформировать схему</button>                 <button id="sch_cancel_btn" class="cancel-btn" style="flex: 1; padding: 10px; font-weight: bold;"><i class="fas fa-times"></i> Отмена</button>             </div>         </div>    `;

	document.body.appendChild(modal);

	const zoomModeSelect = modal.querySelector('#sch_zoomMode');
	const offsetsDiv = modal.querySelector('#sch_offsets_container');
	const toggleOffsets = () => {
		offsetsDiv.style.display = zoomModeSelect.value === 'individual' ? 'flex' : 'none';
	};
	zoomModeSelect.addEventListener('change', toggleOffsets);
	toggleOffsets();

	const skipLoadCheckbox = modal.querySelector('#sch_skipLoad');
	const dataOptionsDiv = modal.querySelector('#sch_data_options');

	const toggleDataOptions = () => {
		if (skipLoadCheckbox.checked) {
			dataOptionsDiv.style.opacity = '0.4';
			dataOptionsDiv.style.pointerEvents = 'none';
		} else {
			dataOptionsDiv.style.opacity = '1';
			dataOptionsDiv.style.pointerEvents = 'auto';
		}
	};
	skipLoadCheckbox.addEventListener('change', toggleDataOptions);
	toggleDataOptions();

	modal.querySelector('#sch_lineWidth').addEventListener('input', e => modal.querySelector('#sch_lineWidth_val').textContent = e.target.value);
	modal.querySelector('#sch_fillOpacity').addEventListener('input', e => modal.querySelector('#sch_fillOpacity_val').textContent = e.target.value);

	modal.querySelector('#sch_export_json_btn').onclick = () => {
		const config = {
			lineColor: modal.querySelector('#sch_lineColor').value,
			lineWidth: parseInt(modal.querySelector('#sch_lineWidth').value, 10),
			fillColor: modal.querySelector('#sch_fillColor').value,
			fillOpacity: parseInt(modal.querySelector('#sch_fillOpacity').value, 10),
			showPoints: modal.querySelector('#sch_showPoints').checked,
			pointColor: modal.querySelector('#sch_pointColor').value,
			autoSort: modal.querySelector('#sch_autoSort').checked,
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
			showZuLabel: modal.querySelector('#sch_showZuLabel').checked,
			zouitNearby: modal.querySelector('#sch_zouitNearby').checked
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
				if (config.autoSort !== undefined) modal.querySelector('#sch_autoSort').checked = config.autoSort;
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
				if (config.showZuLabel !== undefined) modal.querySelector('#sch_showZuLabel').checked = config.showZuLabel;
				if (config.zouitNearby !== undefined) modal.querySelector('#sch_zouitNearby').checked = config.zouitNearby;
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
			lineWidth: parseInt(modal.querySelector('#sch_lineWidth').value),
			fillColor: modal.querySelector('#sch_fillColor').value,
			fillOpacity: parseInt(modal.querySelector('#sch_fillOpacity').value) / 100,
			showPoints: modal.querySelector('#sch_showPoints').checked,
			pointColor: modal.querySelector('#sch_pointColor').value,
			autoSort: modal.querySelector('#sch_autoSort').checked,
			skipLoad: modal.querySelector('#sch_skipLoad').checked,
			loadZouit: modal.querySelector('#sch_loadZouit').checked,
			zouitNearby: modal.querySelector('#sch_zouitNearby').checked,
			loadNearby: modal.querySelector('#sch_loadNearby').checked,
			nearbyRadius: parseInt(modal.querySelector('#sch_nearbyRadius').value) || 200,
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
			showZuLabel: modal.querySelector('#sch_showZuLabel').checked
		};

		localStorage.setItem('sch_lineColor', config.lineColor);
		localStorage.setItem('sch_lineWidth', config.lineWidth);
		localStorage.setItem('sch_fillColor', config.fillColor);
		localStorage.setItem('sch_fillOpacity', config.fillOpacity * 100);
		localStorage.setItem('sch_showPoints', config.showPoints);
		localStorage.setItem('sch_pointColor', config.pointColor);
		localStorage.setItem('sch_loadZouit', config.loadZouit);
		localStorage.setItem('sch_zouitNearby', config.zouitNearby ? 'true' : 'false');
		localStorage.setItem('sch_loadNearby', config.loadNearby);
		localStorage.setItem('sch_nearbyRadius', config.nearbyRadius);
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
		localStorage.setItem('sch_showZuLabel', config.showZuLabel);

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

	const originalMode = localStorage.getItem('mapMode') || 'map';
	const originalCenter = map.getCenter();
	const originalZoom = map.getZoom();
	const originalRasterVisible = rasterOverlay ? rasterOverlay.options.get('visible') : false;

	const origStrokeColor = targetPolygon.options.get('strokeColor');
	const origStrokeWidth = targetPolygon.options.get('strokeWidth');
	const origFillColor = targetPolygon.options.get('fillColor');

	try {
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

		showLoader('Создание снимка карты КПТ...');
		const tempLabelsCP = addSchemaTemporaryLabels(centerGeo, 'cp', config);
		await new Promise(r => setTimeout(r, 300));
		const mapImageBase64 = await takeMapScreenshotForSchema(config.quarter, config.settlement);
		tempLabelsCP.forEach(obj => map.geoObjects.remove(obj));

		let pzzImageBase64 = null;
		let rasterLoadedSuccessfully = false;

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

				targetPolygon.options.set({
					strokeColor: config.pzzLineColor,
					fillColor: '#00000000'
				});

				const pointsVisibilityState = [];
				if (!config.pzzShowPoints) {
					map.geoObjects.each(o => {
						if (o instanceof ymaps.Placemark && o.properties.get('isSchemaPoint')) {
							pointsVisibilityState.push({ obj: o, visible: o.options.get('visible') });
							o.options.set('visible', false);
						}
					});
				}

				const tempLabelsPZZ = addSchemaTemporaryLabels(centerGeo, 'pzz', config);
				await new Promise(r => setTimeout(r, 2000));
				pzzImageBase64 = await takeMapScreenshotForSchema(config.quarter, config.settlement);

				tempLabelsPZZ.forEach(obj => map.geoObjects.remove(obj));
				rasterOverlay.options.set('visible', false);

				if (!config.pzzShowPoints) {
					pointsVisibilityState.forEach(item => item.obj.options.set('visible', item.visible));
				}
			}
		}

		let satelliteImageBase64 = null;

		if (config.includeSat) {
			showLoader('Переключение на спутник...');
			setMapMode('google-hyb');

			let satZoom = originalZoom;
			if (config.zoomMode === 'individual') {
				satZoom = originalZoom + config.satOffset;
			}
			map.setZoom(satZoom);

			targetPolygon.options.set({
				strokeColor: config.satLineColor,
				fillColor: '#00000000'
			});

			const satStyle = document.createElement('style');
			satStyle.id = 'sat-contrast-style';
			satStyle.innerHTML = `                .custom-placemark {                     color: #ffffff !important;                     text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 4px #000 !important;                 }            `;
			document.head.appendChild(satStyle);

			const hiddenZouits = [];
			polygons.forEach(p => {
				if (p.options && (p.properties.get('isZouit') || p.properties.get('featureData')?.properties?.category === 36940)) {
					if (p.options.get('visible') !== false) {
						p.options.set('visible', false);
						hiddenZouits.push(p);
					}
				}
			});

			const pointsVisibilityState = [];
			if (!config.satShowPoints) {
				map.geoObjects.each(o => {
					if (o instanceof ymaps.Placemark && o.properties.get('isSchemaPoint')) {
						pointsVisibilityState.push({ obj: o, visible: o.options.get('visible') });
						o.options.set('visible', false);
					}
				});
			}

			const tempLabelsSat = addSchemaTemporaryLabels(centerGeo, 'satellite', config);
			await new Promise(r => setTimeout(r, 3500));
			satelliteImageBase64 = await takeMapScreenshotForSchema(config.quarter, config.settlement);

			tempLabelsSat.forEach(obj => map.geoObjects.remove(obj));
			hiddenZouits.forEach(p => p.options.set('visible', true));
			satStyle.remove();

			if (!config.satShowPoints) {
				pointsVisibilityState.forEach(item => item.obj.options.set('visible', item.visible));
			}
		}

		let partsImageBase64 = null;

		if (config.includeParts) {
			showLoader('Отрисовка чертежа контура...');
			partsImageBase64 = generatePartsSchemaImage(targetPolygon, config);
		}

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

		const geomStats = calculatePreciseGeometry(targetPolygon);
		const areaStr = Math.round(geomStats.area).toLocaleString('ru-RU');

		const imgLegendPoly = generateLegendPolygonImage(config.lineColor, config.fillColor, config.fillOpacity);
		const imgLegendPoint = generateLegendPointImage(config.pointColor);

		openSchemaDocumentWindow(
			mapImageBase64, pzzImageBase64, satelliteImageBase64, partsImageBase64,
			mskCoordsTable, areaStr, config.terrZone, imgLegendPoly, imgLegendPoint, config
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
	const isSat = mapType === 'satellite';
	const bounds = map.getBounds();
	if (!bounds) return tempObjects;

	const latDelta = bounds[1][0] - bounds[0][0];
	const lonDelta = bounds[1][1] - bounds[0][1];

	const styleBase = isSat
		? 'color: #ffffff; text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 3px #000, 0 0 6px #000, 0 0 9px #000; font-family: "Times New Roman", Times, serif;'
		: 'text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff; font-family: "Times New Roman", Times, serif;';

	if (config.municipality) {
		const mStyle = isSat
			? styleBase + ' font-size: 23px; font-weight: bold; font-style: italic;'
			: styleBase + ' font-size: 23px; font-weight: bold; font-style: italic; color: #2E7D32;';
		const mLayout = ymaps.templateLayoutFactory.createClass(`<div style="${mStyle}">${config.municipality}</div>`);
		const p = new ymaps.Placemark([centerGeo[0] + latDelta * 0.22, centerGeo[1]], {}, { iconLayout: mLayout, zIndex: 1200 });
		map.geoObjects.add(p);
		tempObjects.push(p);
	}

	if (config.quarter) {
		const qStyle = isSat
			? styleBase + ' font-size: 21px; font-weight: bold;'
			: styleBase + ' font-size: 21px; font-weight: bold; color: #1d4ed8;';
		const qLayout = ymaps.templateLayoutFactory.createClass(`<div style="${qStyle}">${config.quarter}</div>`);
		const p = new ymaps.Placemark([centerGeo[0], centerGeo[1] - lonDelta * 0.25], {}, { iconLayout: qLayout, zIndex: 1200 });
		map.geoObjects.add(p);
		tempObjects.push(p);
	}

	if (config.settlement) {
		const sStyle = isSat
			? styleBase + ' font-size: 21px; font-style: italic;'
			: styleBase + ' font-size: 21px; font-style: italic; color: #000000;';
		const sLayout = ymaps.templateLayoutFactory.createClass(`<div style="${sStyle}">${config.settlement}</div>`);
		const p = new ymaps.Placemark([centerGeo[0] - latDelta * 0.22, centerGeo[1] + lonDelta * 0.22], {}, { iconLayout: sLayout, zIndex: 1200 });
		map.geoObjects.add(p);
		tempObjects.push(p);
	}

	if (config.terrZone && mapType !== 'satellite') {
		const tStyle = styleBase + ' font-size: 18px; font-weight: bold; color: #002a5c;';
		const tLayout = ymaps.templateLayoutFactory.createClass(`<div style="${tStyle}">${config.terrZone}</div>`);
		const p = new ymaps.Placemark([centerGeo[0] - latDelta * 0.18, centerGeo[1] - lonDelta * 0.2], {}, { iconLayout: tLayout, zIndex: 1200 });
		map.geoObjects.add(p);
		tempObjects.push(p);
	}

	if (config.showZuLabel && config.zuName) {
		let labelText = config.zuName;
		if (config.quarter && !labelText.includes(config.quarter)) {
			labelText = ":" + labelText;
		}
		const zuTextColor = isSat ? '#ffffff' : '#ff3b30';
		const zuBg = isSat ? 'rgba(0,0,0,0.6)' : '#ffffff';
		const zuBorder = isSat ? '#ffffff' : '#ff3b30';
		const zStyle = `font-family: "Times New Roman", Times, serif; font-size: 26px; font-weight: bold; line-height: 1; color: ${zuTextColor}; background: ${zuBg}; border: 2px solid ${zuBorder}; border-radius: 5px; padding: 3px 9px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.45);`;
		const zLayout = ymaps.templateLayoutFactory.createClass(`<div style="${zStyle}">${labelText}</div>`);
		const labelPoint = [centerGeo[0] + latDelta * 0.15, centerGeo[1] - lonDelta * 0.2];
		const p = new ymaps.Placemark(labelPoint, {}, { iconLayout: zLayout, iconOffset: [0, -14], zIndex: 1210 });
		map.geoObjects.add(p);
		tempObjects.push(p);

		const lineColor = isSat ? '#ffffff' : '#ff3b30';
		const lineHalo = new ymaps.Polyline([labelPoint, centerGeo], {}, {
			strokeColor: isSat ? '#000000' : '#ffffff',
			strokeWidth: 6,
			zIndex: 1204,
			interactivityModel: 'default#transparent'
		});
		map.geoObjects.add(lineHalo);
		tempObjects.push(lineHalo);

		const line = new ymaps.Polyline([labelPoint, centerGeo], {}, {
			strokeColor: lineColor,
			strokeWidth: 3,
			zIndex: 1205,
			interactivityModel: 'default#transparent'
		});
		map.geoObjects.add(line);
		tempObjects.push(line);
	}

	return tempObjects;
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
				const dotLayout = ymaps.templateLayoutFactory.createClass(
					`<div style="width: 11px; height: 11px; background-color: ${config.pointColor}; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 4px rgba(0,0,0,0.7);"></div>`
				);
				const textLayout = ymaps.templateLayoutFactory.createClass(
					`<div style="color: ${config.pointColor}; font-size: 17px; font-weight: bold; font-family: Arial; text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 0 4px #fff;">${pointName}</div>`
				);

				const dot = new ymaps.Placemark(c, {}, { iconLayout: dotLayout, iconOffset: [-5.5, -5.5], zIndex: 1140 });
				const label = new ymaps.Placemark(c, {}, { iconLayout: textLayout, iconOffset: [9, -13], zIndex: 1150 });

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

	const centerGeo = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
	return { mskCoordsTable, centerGeo };
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
				} catch(e) {}
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
		scale: 1.5,
		width: mapElement.clientWidth,
		height: mapElement.clientHeight,
		scrollX: 0,
		scrollY: 0,
		ignoreElements: (el) => typeof el.className === 'string' && (el.className.includes('-copyright') || el.className.includes('-gototech'))
	});

	return canvas.toDataURL('image/png');
}

function generateLegendPolygonImage(strokeColor, fillColor, opacity) {
	const scale = 4;
	const canvas = document.createElement('canvas');
	canvas.width = 32 * scale;
	canvas.height = 32 * scale;
	const ctx = canvas.getContext('2d');

	const legendOpacity = Math.min(1, Math.max(opacity || 0, 0.4));
	ctx.globalAlpha = legendOpacity;
	ctx.fillStyle = fillColor;
	ctx.fillRect(3 * scale, 3 * scale, 26 * scale, 26 * scale);

	ctx.globalAlpha = 1.0;
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = 3.5 * scale;
	ctx.strokeRect(3 * scale, 3 * scale, 26 * scale, 26 * scale);

	return canvas.toDataURL('image/png');
}

function generateLegendPointImage(color) {
	const scale = 4;
	const canvas = document.createElement('canvas');
	canvas.width = 46 * scale;
	canvas.height = 32 * scale;
	const ctx = canvas.getContext('2d');
	ctx.lineJoin = 'round';

	ctx.beginPath();
	ctx.arc(11 * scale, 16 * scale, 7 * scale, 0, 2 * Math.PI);
	ctx.fillStyle = color;
	ctx.fill();
	ctx.strokeStyle = '#FFFFFF';
	ctx.lineWidth = 1.5 * scale;
	ctx.stroke();

	ctx.font = `bold ${15 * scale}px Arial`;
	ctx.textBaseline = 'middle';
	ctx.strokeStyle = '#FFFFFF';
	ctx.lineWidth = 3 * scale;
	ctx.strokeText('н1', 22 * scale, 17 * scale);
	ctx.fillStyle = color;
	ctx.fillText('н1', 22 * scale, 17 * scale);

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

	window.__partsGridStep = gridStep;

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
		ctx.fillStyle = '#000000';
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

	return canvas.toDataURL('image/png');
}

function openSchemaDocumentWindow(mapImage, pzzImage, satelliteImage, partsImage, coordsTable, areaStr, terrZoneName, imgLegendPoly, imgLegendPoint, config) {
	const sAl1 = localStorage.getItem('sch_al1') || '';
	const sAl2 = localStorage.getItem('sch_al2') || '';
	const sAl3 = localStorage.getItem('sch_al3') || '';
	const partsGridStep = window.__partsGridStep || 5;

	const coordsRows = coordsTable.map(c => `        <tr>             <td style="border:1px solid #000; padding:4px; text-align:center;" contenteditable="true">${c.point}</td>             <td style="border:1px solid #000; padding:4px; text-align:center;" contenteditable="true">${c.x}</td>             <td style="border:1px solid #000; padding:4px; text-align:center;" contenteditable="true">${c.y}</td>         </tr>    `).join('');

	const htmlContent = `<!DOCTYPE html> <html lang="ru"> <head>     <meta charset="UTF-8">     <title>Схема СРЗУ - Печать</title>     <script src="https://unpkg.com/docx@7.8.2/build/index.js"></script>     <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>     <style>         body { font-family: "Times New Roman", Times, serif; font-size: 11pt; background: #e9ecef; margin: 0; padding: 20px; }         .page { background: white; width: 210mm; min-height: 297mm; padding: 15mm 20mm; margin: 0 auto 20px auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; }         .header-text { text-align: right; margin-bottom: 20px; line-height: 1.2; font-size: 11pt; }         .auth-line { width: 330px; border: none; border-bottom: 1px solid black; background: transparent; font-family: inherit; font-size: inherit; text-align: center; margin-bottom: 4px; outline: none; }         .scale-input { border: none; background: transparent; font-family: inherit; font-size: 12pt; font-weight: bold; text-align: center; outline: none; width: 100%; margin-top: 5px; }         .title { text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 20px; text-transform: uppercase; line-height: 1.3; }         table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10.5pt; }         th, td { border: 1px solid #000; padding: 5px 6px; text-align: left; }         th { background-color: #e6f2ff; text-align: center; font-weight: bold; }         .map-frame { width: 100%; height: 380px; border: 1.5px solid #000; box-sizing: border-box; display: flex; justify-content: center; align-items: center; overflow: hidden; background: #fafafa; }         .map-frame img { width: 100%; height: 100%; object-fit: contain; }                  .legend-box { margin-top: 15px; font-size: 11pt; }         .legend-row { display: flex; align-items: center; margin-top: 7px; }         .legend-row img.poly { margin-right: 12px; height: 22px; width: auto; }         .legend-row img.point { margin-right: 12px; height: 24px; width: auto; }         .badge-bar { display: flex; justify-content: center; gap: 15px; margin-top: 15px; }         .badge { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 6px 14px; font-size: 10pt; font-weight: bold; color: #334155; display: flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }          .btn-panel { position: fixed; top: 20px; left: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 9999; }         .btn-ui { padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 10pt; cursor: pointer; transition: 0.2s; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }         .btn-ui:hover { background: #2563eb; transform: translateY(-1px); }         .btn-save { background: #10b981; }         .btn-save:hover { background: #059669; }         .btn-html { background: #f59e0b; }         .btn-html:hover { background: #d97706; }          @media print {             body { background: white; padding: 0; }             .page { box-shadow: none; margin: 0; padding: 15mm; width: 100%; }             .btn-panel { display: none !important; }         }     </style> </head> <body>      <div class="btn-panel">         <button class="btn-ui" onclick="window.print()"><i class="fas fa-print"></i> Печать в PDF</button>         <button class="btn-ui btn-html" onclick="saveAsHtml()"><i class="fas fa-file-code"></i> Сохранить HTML</button>         <button class="btn-ui btn-save" id="btnExportWord"><i class="fas fa-file-word"></i> Скачать DOCX</button>     </div>      <div class="page">         <div class="header-text">             <b>Утверждена</b><br>             <input type="text" id="authLine1" class="auth-line" placeholder="" value="${sAl1}"><br>             <input type="text" id="authLine2" class="auth-line" placeholder="" value="${sAl2}"><br>             <input type="text" id="authLine3" class="auth-line" value="${sAl3}"><br>             <span style="font-size: 8pt; color: #555;">(наименование документа об утверждении, включая наименование органов гос. власти или органов местного самоуправления)</span><br>             от _____________ № _____         </div>          <div class="title">             Схема расположения земельного участка или земельных участков на кадастровом плане территории         </div>          <table>             <tr><td colspan="3" contenteditable="true"><b>Условный номер земельного участка:</b> ${config.quarter}:${config.zuName}</td></tr>             <tr><td colspan="3" contenteditable="true"><b>Площадь земельного участка:</b> ${areaStr} кв.м</td></tr>             <tr><td colspan="3" contenteditable="true"><b>Территориальная зона:</b> ${config.terrZone || 'Не установлена'}</td></tr>             <tr>                 <th rowspan="2" style="width: 40%;" contenteditable="true">Обозначение характерных точек границ</th>                 <th colspan="2">Координаты в местной системе координат, м</th>             </tr>             <tr><th contenteditable="true">X</th><th contenteditable="true">Y</th></tr>             ${coordsRows}         </table>          <div class="map-frame">             <img src="${mapImage}" alt="">         </div>         <div style="text-align: center;"><input type="text" id="scaleText" class="scale-input" value="${config.scaleText}"></div>          <div class="legend-box">             <b contenteditable="true">Условные обозначения:</b>             <div class="legend-row">                 <img class="poly" src="${imgLegendPoly}" alt=""> <span contenteditable="true">- образуемый земельный участок</span>             </div>             <div class="legend-row">                 <img class="point" src="${imgLegendPoint}" alt=""> <span contenteditable="true">- обозначение характерной точки границы образуемого земельного участка</span>             </div>         </div>     </div>      ${(config.includePzz || config.includeSat) ? `
		<div class="page">
		${config.includePzz ? `            <div class="title" style="font-size: 12pt; margin-bottom: 10px;">                 Схема расположения образуемого земельного участка на карте градостроительного зонирования ${config.municipality || ''}             </div>             <div class="map-frame" style="height: 380px; margin-bottom: 25px;">                 ${pzzImage ?`<img src="${pzzImage}" alt="">`:`<div style="padding: 40px; text-align: center; color: #777; font-style: italic; border: 1px dashed #999; width:100%; box-sizing:border-box;">Растр ПЗЗ (.rst) для квартала ${config.quarter} не найден в облаке. Снимок пропущен.</div>`}             </div>         ` : ''}

		${config.includeSat ? `            <div class="title" style="font-size: 12pt; margin-bottom: 10px; ${config.includePzz ? 'margin-top: 20px;' : ''}">                 Схема расположения образуемого земельного участка на спутниковой карте             </div>             <div class="map-frame" style="height: 380px;">                 <img src="${satelliteImage}" alt="">             </div>        ` : ''}
		</div>
		`: ''}      ${config.includeParts ?`
		<div class="page">
		<div class="title" style="font-size: 13pt;">
		Схема частей образуемого земельного участка
		</div>

		<div class="map-frame" style="height: 580px; border: 1px solid #e2e8f0; background: #ffffff;">
		<img src="${partsImage}" style="object-fit: contain;">
		</div>

		<div class="badge-bar">
		<div class="badge"> Сетка: ${partsGridStep} м</div>
		</div>
		</div>
		` : ''}      <script>         const al1 = document.getElementById('authLine1');         const al2 = document.getElementById('authLine2');         const al3 = document.getElementById('authLine3');                  const saveLines = () => {             localStorage.setItem('sch_al1', al1.value);             localStorage.setItem('sch_al2', al2.value);             localStorage.setItem('sch_al3', al3.value);         };          if(al1) al1.addEventListener('input', saveLines);         if(al2) al2.addEventListener('input', saveLines);         if(al3) al3.addEventListener('input', saveLines);          function getImageDimensions(base64Str) {             return new Promise(function(resolve) {                 var img = new Image();                 img.onload = function() {                     resolve({ w: img.naturalWidth, h: img.naturalHeight });                 };                 img.src = base64Str;             });         }          function saveAsHtml() {             var html = "<!DOCTYPE html><html>" + document.documentElement.innerHTML + "</html>";             var blob = new Blob([html], {type: "text/html;charset=utf-8"});             saveAs(blob, "Схема_расположения.html");         }          document.getElementById('btnExportWord').addEventListener('click', async function() {             var mapImgData = "${mapImage}";             var mapDims = await getImageDimensions(mapImgData);             var mapHeight = Math.round(500 * (mapDims.h / mapDims.w));              var pzzImgData = "${pzzImage || ''}";             var pzzHeight = 320;             if (pzzImgData) {                 var pzzDims = await getImageDimensions(pzzImgData);                 pzzHeight = Math.round(500 * (pzzDims.h / pzzDims.w));             }              var satImgData = "${satelliteImage || ''}";             var satHeight = 320;             if (satImgData) {                 var satDims = await getImageDimensions(satImgData);                 satHeight = Math.round(500 * (satDims.h / satDims.w));             }              var partsImgData = "${partsImage || ''}";             var partsHeight = 420;             if (partsImgData) {                 var partsDims = await getImageDimensions(partsImgData);                 partsHeight = Math.round(500 * (partsDims.h / partsDims.w));             }              const coords = ${JSON.stringify(coordsTable)};             const sqImgData = "${imgLegendPoly}";             const circImgData = "${imgLegendPoint}";                          const docRows = [                 new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Условный номер земельного участка: ${config.quarter}:${config.zuName}", size: 22 })] })], columnSpan: 3 })] }),                 new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Площадь земельного участка: ${areaStr} кв.м", size: 22 })] })], columnSpan: 3 })] }),                 new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Территориальная зона: ${config.terrZone || 'Не установлена'}", size: 22 })] })], columnSpan: 3 })] }),                 new docx.TableRow({                     children: [                         new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Обозначение характерных точек границ", size: 22 })] })], rowSpan: 2, verticalAlign: docx.VerticalAlign.CENTER, width: { size: 40, type: docx.WidthType.PERCENTAGE } }),                         new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Координаты в местной системе координат, м", size: 22 })] })], columnSpan: 2 }),                     ]                 }),                 new docx.TableRow({                     children: [                         new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "X", size: 22, bold: true })] })] }),                         new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Y", size: 22, bold: true })] })] }),                     ]                 })             ];              coords.forEach(c => {                 docRows.push(new docx.TableRow({                     children: [                         new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.point, size: 22 })] })] }),                         new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.x, size: 22 })] })], width: { size: 30, type: docx.WidthType.PERCENTAGE } }),                         new docx.TableCell({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: c.y, size: 22 })] })], width: { size: 30, type: docx.WidthType.PERCENTAGE } }),                     ]                 }));             });              const formatLine = (val) => val.trim().length > 0 ? val : "                                                                            ";              const sections = [{                 properties: { page: { size: { width: docx.convertMillimetersToTwip(210), height: docx.convertMillimetersToTwip(297) }, margin: { top: 1134, right: 850, bottom: 1134, left: 1700 } } },                 children: [                     new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "Утверждена", bold: true, size: 22 })] }),                     new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: formatLine(al1.value), size: 22, underline: { type: "single" } })] }),                     new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: formatLine(al2.value), size: 22, underline: { type: "single" } })] }),                     new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: formatLine(al3.value), size: 22, underline: { type: "single" } })] }),                     new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "(наименование документа об утверждении, включая наименование органов гос. власти или органов местного самоуправления)", size: 16, color: "555555" })] }),                     new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, spacing: { after: 300 }, children: [                         new docx.TextRun({ text: "от _____________ № _____ ", size: 22, bold: true })                     ]}),                     new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [                         new docx.TextRun({ text: "Схема расположения земельного участка или земельных участков на кадастровом плане территории", size: 26, bold: true })                     ]}),                     new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: docRows }),                     new docx.Paragraph({                         alignment: docx.AlignmentType.CENTER,                         spacing: { before: 200, after: 100 },                         children: [                             new docx.ImageRun({                                 data: mapImgData.split(',')[1],                                 transformation: { width: 500, height: mapHeight }                             })                         ]                     }),                     new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [                         new docx.TextRun({ text: document.getElementById('scaleText').value, size: 22, bold: true })                     ]}),                     new docx.Paragraph({ spacing: { after: 100 }, children: [new docx.TextRun({ text: "Условные обозначения:", size: 22, bold: true })] }),                     new docx.Paragraph({ spacing: { after: 80 }, children: [                         new docx.ImageRun({ data: sqImgData.split(',')[1], transformation: { width: 22, height: 22 } }),                         new docx.TextRun({ text: "  - образуемый земельный участок", size: 20 })                     ]}),                     new docx.Paragraph({ spacing: { after: 80 }, children: [                         new docx.ImageRun({ data: circImgData.split(',')[1], transformation: { width: 31, height: 22 } }),                         new docx.TextRun({ text: "  - обозначение характерной точки границы образуемого земельного участка", size: 20 })                     ]})                 ]             }];              if (${config.includePzz || config.includeSat}) {                 const s2Children = [];                 if (${config.includePzz}) {                     s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { before: 100, after: 100 }, children: [                         new docx.TextRun({ text: "Схема расположения образуемого земельного участка на карте градостроительного зонирования", size: 24, bold: true })                     ]}));                     if (pzzImgData) {                         s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [                             new docx.ImageRun({ data: pzzImgData.split(',')[1], transformation: { width: 500, height: pzzHeight } })                         ]}));                     } else {                         s2Children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 200 }, children: [                             new docx.TextRun({ text: "[Растр ПЗЗ не найден в облаке]", size: 20, italic: true })                         ]}));                     }                 }               



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
                            new docx.TextRun({ text: "Сетка: ${partsGridStep} м", size: 20, bold: true })
                        ]})
                    ]
                });
            }

            const doc = new docx.Document({ sections: sections });
            docx.Packer.toBlob(doc).then(blob => {
                saveAs(blob, "Схема_расположения.docx");
            }).catch(e => alert("Ошибка создания DOCX: " + e));
        });
    </script> </body> </html>`;

	const win = window.open('', '_blank');
	win.document.write(htmlContent);
	win.document.close();
}



