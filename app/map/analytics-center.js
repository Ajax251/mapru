const ANALYTICS_CENTER_VERSION = "1.06";
console.log(`[Analytics Center] Загружена версия ${ANALYTICS_CENTER_VERSION}`);

// Безопасное получение инстанса карты в обход DOM-элемента <div id="map">
function getActiveMap() {
    if (window.yandexMap && typeof window.yandexMap.getBounds === 'function') {
        return window.yandexMap;
    }
    try {
        if (typeof map !== 'undefined' && map && typeof map.getBounds === 'function') {
            return map;
        }
    } catch (e) {}
    return null;
}

// Автоопределение префикса региона и района по выбранной МСК или текущему кварталу карты
function getDefaultCadastralPrefix() {
    try {
        if (typeof currentQuarterNumber !== 'undefined' && currentQuarterNumber) {
            const parts = currentQuarterNumber.split(':');
            if (parts.length >= 2) return `${parts[0]}:${parts[1]}:`;
        }
        const mskVal = localStorage.getItem('savedDefaultMskSystem') || '';
        const m = mskVal.match(/633(\d{2})/);
        if (m) return `${m[1]}:`;
        const mskText = (typeof COORDINATE_SYSTEMS !== 'undefined')
            ? (COORDINATE_SYSTEMS.find(s => s.value === mskVal)?.text || '') : '';
        const m2 = mskText.match(/МСК[ -]?(\d{2})/i);
        if (m2) return `${m2[1]}:`;
    } catch (e) {}
    return '16:';
}

/**
 * Модуль: Аналитический центр базы данных недвижимости
 * Включает:
 *  - Диалоговое окно размером 98% экрана
 *  - ИИ-ассистент формирования поисковых запросов через https://mapruapp.ru
 *  - Защита от перегрузки карты: подтверждение и выбор режима при выборке > 200 объектов
 *  - Пространственный и атрибутивный поиск по локальной БД SQLite
 *  - Интерактивную аналитику и графики ECharts
 *  - Экспорт в Excel (XLSX), GeoJSON и графический снимок (PNG)
 */

(function () {
    const MAPRUAPP_AI_URL = "https://mapruapp.ru/ai/api/v1/chat/completions";
    const AI_MODEL_NAME = "gemini-3.5-flash-lite";
    const BACKEND_QUERY_URL = "https://mapruapp.ru/api/analytics/query";
    const SAFE_MAP_OBJECT_LIMIT = 200;

    let analyticsModal = null;
    let currentChartInstances = [];
    let lastQueryResults = null;
    let activeTab = 'summary';

    // Внедрение стилей интерфейса
    function injectAnalyticsStyles() {
        if (document.getElementById('analytics-center-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'analytics-center-inline-styles';
        style.textContent = `
            #analytics-center-overlay {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            .ac-window {
                width: 98vw; height: 98vh; background: #f8fafc; border-radius: 16px;
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.1);
                display: flex; flex-direction: column; overflow: hidden;
            }
            .ac-header {
                padding: 12px 20px; background: #ffffff; border-bottom: 1px solid #e2e8f0;
                display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; gap: 15px;
            }
            .ac-header-title {
                display: flex; align-items: center; gap: 12px; font-weight: 800; color: #0f172a; font-size: 1.25rem;
            }
            .ac-header-title i {
                width: 38px; height: 38px; background: linear-gradient(135deg, #0284c7, #2563eb);
                color: #fff; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
            }
            .ac-body {
                flex: 1; display: grid; grid-template-columns: 360px 1fr; overflow: hidden; background: #f1f5f9;
            }
            .ac-sidebar {
                background: #ffffff; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column;
                overflow-y: auto; padding: 16px; gap: 14px; box-sizing: border-box;
            }
            .ac-ai-box {
                background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
                border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;
            }
            .ac-ai-box h4 {
                margin: 0; color: #1e40af; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;
            }
            .ac-ai-input {
                width: 100%; height: 60px; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1;
                font-size: 0.85rem; resize: none; box-sizing: border-box; outline: none; font-family: inherit;
            }
            .ac-ai-input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15); }
            .ac-btn-ai {
                padding: 7px 12px; background: linear-gradient(135deg, #2563eb, #1d4ed8);
                color: #fff; border: none; border-radius: 7px; font-size: 0.82rem; font-weight: 700;
                cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
            }
            .ac-btn-ai:hover { filter: brightness(1.08); }
            .ac-filter-group {
                background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px;
            }
            .ac-filter-title {
                font-size: 0.8rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;
            }
            .ac-form-row {
                display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; color: #334155;
            }
            .ac-input-text, .ac-select {
                width: 100%; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.85rem;
                outline: none; box-sizing: border-box; background: #fff;
            }
            .ac-input-text:focus, .ac-select:focus { border-color: #0284c7; }
            .ac-range-row {
                display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
            }
            .ac-checkbox-grid {
                display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.82rem;
            }
            .ac-checkbox-grid label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
            .ac-btn-run {
                padding: 10px; background: linear-gradient(135deg, #10b981, #059669); color: white;
                border: none; border-radius: 8px; font-weight: 700; font-size: 0.95rem; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 10px rgba(16,185,129,0.25);
            }
            .ac-btn-run:hover { filter: brightness(1.05); }
            .ac-main {
                display: flex; flex-direction: column; overflow: hidden; padding: 14px 18px; gap: 12px;
            }
            .ac-tabs-bar {
                display: flex; justify-content: space-between; align-items: center; background: #ffffff;
                padding: 6px 12px; border-radius: 10px; border: 1px solid #e2e8f0; flex-shrink: 0;
            }
            .ac-tabs { display: flex; gap: 4px; }
            .ac-tab-btn {
                padding: 7px 14px; border: none; background: transparent; font-weight: 600; font-size: 0.85rem;
                color: #64748b; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;
            }
            .ac-tab-btn:hover { background: #f1f5f9; color: #0f172a; }
            .ac-tab-btn.active { background: #e0f2fe; color: #0369a1; font-weight: 700; }
            .ac-actions { display: flex; gap: 8px; }
            .ac-action-btn {
                padding: 6px 12px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px;
                font-size: 0.82rem; font-weight: 600; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 6px;
            }
            .ac-action-btn:hover { background: #f8fafc; border-color: #94a3b8; }
            .ac-content-view {
                flex: 1; overflow-y: auto; position: relative; background: #ffffff; border-radius: 12px;
                border: 1px solid #e2e8f0; padding: 14px; box-sizing: border-box;
            }
            .ac-kpi-grid {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px;
            }
            .ac-kpi-card {
                padding: 12px 14px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0;
            }
            .ac-kpi-card span { font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
            .ac-kpi-card strong { display: block; font-size: 1.25rem; color: #0f172a; margin-top: 3px; }
            .ac-charts-grid {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 14px;
            }
            .ac-chart-container {
                height: 310px; background: #ffffff; border: 1px solid #f1f5f9; border-radius: 8px; padding: 8px;
            }
            .ac-table {
                width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;
            }
            .ac-table th {
                position: sticky; top: 0; background: #f1f5f9; padding: 8px 10px; border-bottom: 2px solid #cbd5e1;
                color: #334155; font-weight: 700; z-index: 2;
            }
            .ac-table td {
                padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b;
            }
            .ac-table tr:hover td { background: #f8fafc; }
            .ac-close-btn {
                background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; line-height: 1;
            }
            .ac-close-btn:hover { color: #ef4444; }
            .ac-zoom-btn {
                padding: 3px 8px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px;
                color: #1d4ed8; font-weight: 600; cursor: pointer; font-size: 0.75rem;
            }
            .ac-zoom-btn:hover { background: #2563eb; color: #ffffff; }

            /* Модальное окно подтверждения большого объема */
            .ac-confirm-dialog-overlay {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6);
                z-index: 1000000; display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(4px);
            }
            .ac-confirm-dialog {
                background: #ffffff; width: 440px; max-width: 90vw; border-radius: 14px; padding: 22px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.25); border: 1px solid #e2e8f0; text-align: center;
            }
            .ac-confirm-icon {
                width: 48px; height: 48px; border-radius: 50%; background: #fef3c7; color: #d97706;
                display: flex; align-items: center; justify-content: center; font-size: 1.4rem; margin: 0 auto 12px auto;
            }
        `;
        document.head.appendChild(style);
    }

    // Загрузка библиотеки ECharts
    async function ensureEcharts() {
        if (typeof echarts === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js";
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
    }

    // Загрузка библиотеки XLSX
    async function ensureXlsx() {
        if (typeof XLSX === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
    }

    // Открытие основного окна
    window.openAnalyticsCenter = async function (lat, lon) {
        injectAnalyticsStyles();
        await ensureEcharts();

        if (analyticsModal) analyticsModal.remove();

        analyticsModal = document.createElement('div');
        analyticsModal.id = 'analytics-center-overlay';

        analyticsModal.innerHTML = `
            <div class="ac-window">
                <div class="ac-header">
                    <div class="ac-header-title">
                        <i class="fas fa-chart-line"></i>
                        <span>Аналитический центр базы данных</span>
                    </div>
                    <button class="ac-close-btn" id="ac-close-btn">&times;</button>
                </div>
                
                <div class="ac-body">
                    <!-- Панель управления и фильтров -->
                    <div class="ac-sidebar">
                        <!-- Блок ИИ-Ассистента -->
                        <div class="ac-ai-box">
                            <h4><i class="fas fa-robot" style="color: #2563eb;"></i> ИИ-Аналитик (Запрос на русском)</h4>
                            <textarea id="ac-ai-text" class="ac-ai-input" placeholder="Опишите нужные объекты естественным языком..."></textarea>
                            <button id="ac-ai-submit" class="ac-btn-ai">
                                <i class="fas fa-magic"></i> Сформировать фильтр ИИ
                            </button>
                        </div>

                        <!-- Основные фильтры -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title">Пространственный охват</span>
                            <div class="ac-form-row">
                                <label>Гео-зона:</label>
                                <select id="ac-spatial-type" class="ac-select">
                                    <option value="viewport" selected>Текущий экран карты</option>
                                    <option value="radius" ${lat && lon ? 'selected' : ''}>В радиусе от точки клика</option>
                                    <option value="all">По всей базе (требуется фильтр)</option>
                                </select>
                            </div>
                            <div class="ac-form-row" id="ac-radius-wrap" style="${lat && lon ? '' : 'display: none;'}">
                                <label>Радиус поиска (метров):</label>
                                <input type="number" id="ac-radius-val" class="ac-input-text" value="1000" min="50" step="50">
                            </div>
                        </div>

                        <div class="ac-filter-group">
                            <span class="ac-filter-title">Поиск по атрибутам</span>
                            <div class="ac-form-row">
                                <label>Поиск по адресу / тексту:</label>
                                <input type="text" id="ac-address-search" class="ac-input-text" placeholder="Улица, поселок или ориентир...">
                            </div>
                            <div class="ac-form-row">
                                <label>Кадастровый номер или маска:</label>
                                <input type="text" id="ac-cadnum-search" class="ac-input-text" value="${getDefaultCadastralPrefix()}">
                            </div>
                        </div>

                        <div class="ac-filter-group">
                            <span class="ac-filter-title">Типы объектов</span>
                            <div class="ac-checkbox-grid">
                                <label><input type="checkbox" id="ac-type-zu" checked> Участки (ЗУ)</label>
                                <label><input type="checkbox" id="ac-type-oks" checked> Здания (ОКС)</label>
                                <label><input type="checkbox" id="ac-type-str"> Сооружения</label>
                                <label><input type="checkbox" id="ac-type-zones"> Границы и зоны</label>
                            </div>
                        </div>

                        <div class="ac-filter-group">
                            <span class="ac-filter-title">Параметры зданий и участков</span>
                            <div class="ac-form-row">
                                <label>Этажность (ОКС):</label>
                                <div class="ac-range-row">
                                    <input type="number" id="ac-floors-min" class="ac-input-text" placeholder="От этажей" min="1">
                                    <input type="number" id="ac-floors-max" class="ac-input-text" placeholder="До этажей" min="1">
                                </div>
                            </div>
                            <div class="ac-form-row">
                                <label>Площадь (м²):</label>
                                <div class="ac-range-row">
                                    <input type="number" id="ac-area-min" class="ac-input-text" placeholder="От">
                                    <input type="number" id="ac-area-max" class="ac-input-text" placeholder="До">
                                </div>
                            </div>
                            <div class="ac-form-row">
                                <label>Кадастровая стоимость (руб):</label>
                                <div class="ac-range-row">
                                    <input type="number" id="ac-cost-min" class="ac-input-text" placeholder="От руб.">
                                    <input type="number" id="ac-cost-max" class="ac-input-text" placeholder="До руб.">
                                </div>
                            </div>
                            <div class="ac-form-row">
                                <label>Материал стен (для зданий):</label>
                                <input type="text" id="ac-materials" class="ac-input-text" placeholder="Кирпич, дерево, бетон...">
                            </div>
                            <div class="ac-form-row">
                                <label>Назначение / ВРИ:</label>
                                <input type="text" id="ac-purpose" class="ac-input-text" placeholder="Жилое, торговое, ИЖС...">
                            </div>
                        </div>

                        <button id="ac-btn-execute" class="ac-btn-run">
                            <i class="fas fa-search"></i> Сформировать анализ
                        </button>
                    </div>

                    <!-- Рабочая область отображения результатов -->
                    <div class="ac-main">
                        <div class="ac-tabs-bar">
                            <div class="ac-tabs">
                                <button class="ac-tab-btn active" data-tab="summary"><i class="fas fa-tachometer-alt"></i> Сводка и KPI</button>
                                <button class="ac-tab-btn" data-tab="charts"><i class="fas fa-chart-pie"></i> Графика и распределения</button>
                                <button class="ac-tab-btn" data-tab="treemap"><i class="fas fa-th-large"></i> Плиточная структура</button>
                                <button class="ac-tab-btn" data-tab="table"><i class="fas fa-table"></i> Реестр объектов</button>
                            </div>
                            <div class="ac-actions">
                                <button class="ac-action-btn" id="ac-btn-map" title="Отобразить найденную выборку на карте">
                                    <i class="fas fa-map-marked-alt" style="color:#0284c7;"></i> На карту
                                </button>
                                <button class="ac-action-btn" id="ac-btn-xlsx" title="Скачать таблицу в Excel">
                                    <i class="fas fa-file-excel" style="color:#107c10;"></i> Excel
                                </button>
                                <button class="ac-action-btn" id="ac-btn-geojson" title="Скачать GeoJSON">
                                    <i class="fas fa-file-code" style="color:#f59e0b;"></i> GeoJSON
                                </button>
                            </div>
                        </div>

                        <div class="ac-content-view" id="ac-content-view">
                            <div style="text-align: center; color: #94a3b8; padding-top: 100px;">
                                <i class="fas fa-database" style="font-size: 3rem; margin-bottom: 12px; color: #cbd5e1;"></i>
                                <div style="font-size: 1.1rem; font-weight: 600;">Задайте критерии поиска или отправьте текстовый запрос ИИ</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(analyticsModal);

        const close = () => {
            currentChartInstances.forEach(c => c.dispose());
            currentChartInstances = [];
            analyticsModal.remove();
            analyticsModal = null;
        };

        analyticsModal.querySelector('#ac-close-btn').onclick = close;
        analyticsModal.onclick = (e) => { if (e.target === analyticsModal) close(); };

        const spatialSelect = document.getElementById('ac-spatial-type');
        const radiusWrap = document.getElementById('ac-radius-wrap');
        spatialSelect.onchange = () => {
            radiusWrap.style.display = spatialSelect.value === 'radius' ? 'flex' : 'none';
        };

        analyticsModal.querySelectorAll('.ac-tab-btn').forEach(btn => {
            btn.onclick = () => {
                analyticsModal.querySelectorAll('.ac-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeTab = btn.dataset.tab;
                renderActiveTabContent();
            };
        });

        document.getElementById('ac-btn-execute').onclick = () => runAnalyticsQuery(lat, lon);
        document.getElementById('ac-ai-submit').onclick = processAiQuery;
        document.getElementById('ac-btn-map').onclick = showResultsOnMainMap;
        document.getElementById('ac-btn-xlsx').onclick = exportToExcel;
        document.getElementById('ac-btn-geojson').onclick = exportToGeoJSON;

        // Автозапуск первичного анализа
        runAnalyticsQuery(lat, lon);
    };

    // Сбор параметров запроса с валидацией безопасности
    function collectFilterPayload(clickLat, clickLon) {
        const spatialType = document.getElementById('ac-spatial-type').value;
        const payload = {
            tables: [],
            filters: {}
        };

        if (document.getElementById('ac-type-zu').checked) payload.tables.push('zu');
        if (document.getElementById('ac-type-oks').checked) payload.tables.push('oks');
        if (document.getElementById('ac-type-str').checked) payload.tables.push('structure');
        if (document.getElementById('ac-type-zones').checked) payload.tables.push('zones');

       if (spatialType === 'viewport') {
    const activeMap = getActiveMap();
    if (activeMap) {
        const bounds = activeMap.getBounds();
        if (bounds && bounds[0] && bounds[1]) {
            payload.spatial = {
                type: 'bbox',
                min_lat: bounds[0][0], min_lon: bounds[0][1],
                max_lat: bounds[1][0], max_lon: bounds[1][1]
            };
        }
    } else {
        alert('Карта еще не инициализирована');
        return null;
    }
} else if (spatialType === 'radius' && clickLat && clickLon) {
            payload.spatial = {
                type: 'circle',
                lat: clickLat,
                lon: clickLon,
                radius: parseFloat(document.getElementById('ac-radius-val').value) || 1000
            };
        }

        const addr = document.getElementById('ac-address-search').value.trim();
        if (addr) payload.filters.address = addr;

        const cad = document.getElementById('ac-cadnum-search').value.trim();
        if (cad) payload.filters.cad_num = cad;

        const fMin = document.getElementById('ac-floors-min').value;
        if (fMin) payload.filters.floors_min = parseInt(fMin, 10);
        const fMax = document.getElementById('ac-floors-max').value;
        if (fMax) payload.filters.floors_max = parseInt(fMax, 10);

        const aMin = document.getElementById('ac-area-min').value;
        if (aMin) payload.filters.area_min = parseFloat(aMin);
        const aMax = document.getElementById('ac-area-max').value;
        if (aMax) payload.filters.area_max = parseFloat(aMax);

        const cMin = document.getElementById('ac-cost-min').value;
        if (cMin) payload.filters.cost_min = parseFloat(cMin);
        const cMax = document.getElementById('ac-cost-max').value;
        if (cMax) payload.filters.cost_max = parseFloat(cMax);

        const mat = document.getElementById('ac-materials').value.trim();
        if (mat) payload.filters.materials = mat;

        const purp = document.getElementById('ac-purpose').value.trim();
        if (purp) payload.filters.purpose = purp;

        // Защита: если выбрана «вся база», требуем хотя бы один конкретный фильтр
     // Проверка корректности параметров для режима «По всей базе»
if (spatialType === 'all') {
    const cad = payload.filters.cad_num || '';
    // Проверяем наличие префикса региона и района (например: 16:56 или 16:56:)
    const hasValidCadPrefix = /^\d{2}:\d{1,2}:?/.test(cad);
    const hasOtherFilters = addr || fMin || fMax || aMin || aMax || cMin || cMax || mat || purp;

    if (!hasValidCadPrefix && !hasOtherFilters) {
        const suggested = getDefaultCadastralPrefix();
        alert(`Для выборки по всей базе необходимо указать как минимум префикс региона и района (например: ${suggested} или ${suggested}010101) либо задать адрес/параметры.`);
        return null;
    }
}

        return payload;
    }

    // Выполнение запроса
    async function runAnalyticsQuery(lat, lon) {
        const payload = collectFilterPayload(lat, lon);
        if (!payload) return;

        const container = document.getElementById('ac-content-view');
        container.innerHTML = `
            <div style="text-align: center; padding-top: 100px; color: #2563eb;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
                <div style="font-weight: 700; font-size: 1.1rem;">Анализ базы данных и расчет показателей...</div>
            </div>
        `;

        try {
            const resp = await fetch(BACKEND_QUERY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error(`Ошибка сервера: ${resp.status}`);
            lastQueryResults = await resp.json();

            renderActiveTabContent();
        } catch (err) {
            container.innerHTML = `
                <div style="text-align: center; padding-top: 100px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
                    <div style="font-weight: 700; font-size: 1.1rem;">Не удалось выполнить запрос к аналитическому ядру</div>
                    <div style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">${err.message}</div>
                </div>
            `;
        }
    }

    // Запрос к ИИ для распознавания естественного языка
    async function processAiQuery() {
        const inputEl = document.getElementById('ac-ai-text');
        const queryText = inputEl.value.trim();
        if (!queryText) return;

        const submitBtn = document.getElementById('ac-ai-submit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Преобразование запроса...';

        const systemPrompt = `
Ты — аналитический транслятор естественного языка в структурированный фильтр базы данных объектов недвижимости.
Пользователь передаст запрос на русском языке. Верни ТОЛЬКО валидный JSON без комментариев и markdown-тегов со следующими ключами:
{
  "address": "строка для поиска по адресу или пусто",
  "cad_num": "кадастровый номер или маска или пусто",
  "floors_min": число или null,
  "floors_max": число или null,
  "area_min": число или null,
  "area_max": число или null,
  "cost_min": число или null,
  "cost_max": число или null,
  "materials": "материал стен или пусто",
  "purpose": "назначение или вид использования или пусто",
  "types": ["zu", "oks", "structure", "zones"]
}
`;

        try {
            const resp = await fetch(MAPRUAPP_AI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: AI_MODEL_NAME,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: queryText }
                    ],
                    max_tokens: 1024
                })
            });

            if (!resp.ok) throw new Error("Шлюз ИИ не ответил.");
            const data = await resp.json();
            const textResponse = data.choices?.[0]?.message?.content || "";
            const cleanJson = textResponse.replace(/^```json\s*|\s*```$/g, '').trim();
            const parsed = JSON.parse(cleanJson);

            if (parsed.address) document.getElementById('ac-address-search').value = parsed.address;
            if (parsed.cad_num) document.getElementById('ac-cadnum-search').value = parsed.cad_num;
            if (parsed.floors_min) document.getElementById('ac-floors-min').value = parsed.floors_min;
            if (parsed.floors_max) document.getElementById('ac-floors-max').value = parsed.floors_max;
            if (parsed.area_min) document.getElementById('ac-area-min').value = parsed.area_min;
            if (parsed.area_max) document.getElementById('ac-area-max').value = parsed.area_max;
            if (parsed.cost_min) document.getElementById('ac-cost-min').value = parsed.cost_min;
            if (parsed.cost_max) document.getElementById('ac-cost-max').value = parsed.cost_max;
            if (parsed.materials) document.getElementById('ac-materials').value = parsed.materials;
            if (parsed.purpose) document.getElementById('ac-purpose').value = parsed.purpose;

            if (Array.isArray(parsed.types)) {
                document.getElementById('ac-type-zu').checked = parsed.types.includes('zu');
                document.getElementById('ac-type-oks').checked = parsed.types.includes('oks');
                document.getElementById('ac-type-str').checked = parsed.types.includes('structure');
                document.getElementById('ac-type-zones').checked = parsed.types.includes('zones');
            }

            runAnalyticsQuery();
        } catch (err) {
            alert("ИИ не смог распознать критерии: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-magic"></i> Сформировать фильтр ИИ';
        }
    }

    // Рендеринг активной вкладки
    function renderActiveTabContent() {
        const container = document.getElementById('ac-content-view');
        if (!container) return;

        currentChartInstances.forEach(c => c.dispose());
        currentChartInstances = [];

        if (!lastQueryResults || !lastQueryResults.summary) {
            container.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;">Нет данных для отображения</div>';
            return;
        }

        const s = lastQueryResults.summary;
        const features = lastQueryResults.features || [];

        if (activeTab === 'summary') {
            container.innerHTML = `
                <div class="ac-kpi-grid">
                    <div class="ac-kpi-card" style="border-left: 4px solid #3b82f6;">
                        <span>Всего объектов</span>
                        <strong>${s.total_count.toLocaleString('ru-RU')}</strong>
                    </div>
                    <div class="ac-kpi-card" style="border-left: 4px solid #10b981;">
                        <span>Суммарная площадь</span>
                        <strong>${Math.round(s.total_area).toLocaleString('ru-RU')} м²</strong>
                    </div>
                    <div class="ac-kpi-card" style="border-left: 4px solid #f59e0b;">
                        <span>Кадастровая стоимость</span>
                        <strong>${Math.round(s.total_cost).toLocaleString('ru-RU')} ₽</strong>
                    </div>
                    <div class="ac-kpi-card" style="border-left: 4px solid #8b5cf6;">
                        <span>Средний УПКС</span>
                        <strong>${Math.round(s.avg_upks).toLocaleString('ru-RU')} ₽/м²</strong>
                    </div>
                </div>

                <div class="ac-charts-grid">
                    <div class="ac-chart-container" id="ac-chart-types"></div>
                    <div class="ac-chart-container" id="ac-chart-ownership"></div>
                </div>
            `;

            const chart1 = echarts.init(document.getElementById('ac-chart-types'));
            chart1.setOption({
                title: { text: 'Состав выборки по типам', left: 'center', textStyle: { fontSize: 13, color: '#334155' } },
                tooltip: { trigger: 'item' },
                series: [{
                    type: 'pie', radius: ['40%', '70%'],
                    data: [
                        { name: 'Земельные участки', value: s.count_zu || 0, itemStyle: { color: '#16a34a' } },
                        { name: 'Здания (ОКС)', value: s.count_oks || 0, itemStyle: { color: '#0284c7' } },
                        { name: 'Сооружения', value: s.count_str || 0, itemStyle: { color: '#ea580c' } },
                        { name: 'Зоны и границы', value: s.count_zones || 0, itemStyle: { color: '#9333ea' } }
                    ]
                }]
            });
            currentChartInstances.push(chart1);

            const ownData = Object.entries(s.ownership_dist || {}).map(([name, value]) => ({ name, value }));
            const chart2 = echarts.init(document.getElementById('ac-chart-ownership'));
            chart2.setOption({
                title: { text: 'Формы собственности', left: 'center', textStyle: { fontSize: 13, color: '#334155' } },
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: '65%', data: ownData }]
            });
            currentChartInstances.push(chart2);

        } else if (activeTab === 'charts') {
            container.innerHTML = `
                <div class="ac-charts-grid">
                    <div class="ac-chart-container" id="ac-chart-floors"></div>
                    <div class="ac-chart-container" id="ac-chart-cost-brackets"></div>
                    <div class="ac-chart-container" id="ac-chart-materials"></div>
                    <div class="ac-chart-container" id="ac-chart-years"></div>
                </div>
            `;

            const cFloors = echarts.init(document.getElementById('ac-chart-floors'));
            const floorsEntries = Object.entries(s.floors_dist || {});
            cFloors.setOption({
                title: { text: 'Распределение зданий по этажности', textStyle: { fontSize: 13 } },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: floorsEntries.map(e => e[0] + ' эт.') },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: floorsEntries.map(e => e[1]), itemStyle: { color: '#0284c7', borderRadius: [4, 4, 0, 0] } }]
            });
            currentChartInstances.push(cFloors);

            const cCost = echarts.init(document.getElementById('ac-chart-cost-brackets'));
            const costEntries = Object.entries(s.cost_brackets || {});
            cCost.setOption({
                title: { text: 'Ценовые диапазоны (кадастровая стоимость)', textStyle: { fontSize: 13 } },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: costEntries.map(e => e[0]), axisLabel: { interval: 0, rotate: 15 } },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: costEntries.map(e => e[1]), itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } }]
            });
            currentChartInstances.push(cCost);

            const cMat = echarts.init(document.getElementById('ac-chart-materials'));
            const matEntries = Object.entries(s.materials_dist || {}).slice(0, 6);
            cMat.setOption({
                title: { text: 'Основные материалы наружных стен', textStyle: { fontSize: 13 } },
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: '60%', data: matEntries.map(e => ({ name: e[0], value: e[1] })) }]
            });
            currentChartInstances.push(cMat);

            const cYears = echarts.init(document.getElementById('ac-chart-years'));
            const yearEntries = Object.entries(s.years_dist || {});
            cYears.setOption({
                title: { text: 'Периоды постройки зданий', textStyle: { fontSize: 13 } },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: yearEntries.map(e => e[0]) },
                yAxis: { type: 'value' },
                series: [{ type: 'line', smooth: true, data: yearEntries.map(e => e[1]), areaStyle: { color: 'rgba(139, 92, 246, 0.2)' }, itemStyle: { color: '#8b5cf6' } }]
            });
            currentChartInstances.push(cYears);

        } else if (activeTab === 'treemap') {
            container.innerHTML = `<div id="ac-chart-treemap" style="width: 100%; height: 100%;"></div>`;
            const cTree = echarts.init(document.getElementById('ac-chart-treemap'));

            const treeData = features.map(f => {
                const p = f.properties || {};
                const o = p.options || {};
                const area = parseFloat(o.specified_area || o.build_record_area || o.declared_area || f.area || 1);
                return {
                    name: f.id,
                    value: Math.round(area),
                    raw: f
                };
            }).filter(i => i.value > 0);

            cTree.setOption({
                title: { text: 'Плиточная структура объектов (размер = площадь, м²)', textStyle: { fontSize: 14 } },
                tooltip: {
                    formatter: (info) => {
                        const raw = info.data?.raw;
                        if (!raw) return '';
                        const o = raw.properties?.options || {};
                        return `<b>${raw.id}</b><br>Адрес: ${o.readable_address || 'Не указан'}<br>Площадь: ${info.value} м²`;
                    }
                },
                series: [{
                    type: 'treemap', width: '100%', height: '90%', top: 35,
                    data: treeData,
                    breadcrumb: { show: false }
                }]
            });
            currentChartInstances.push(cTree);

        } else if (activeTab === 'table') {
            const BATCH_SIZE = 100;
            let renderedCount = 0;

            container.innerHTML = `
                <div style="margin-bottom: 8px; font-weight: 600; color: #475569; display: flex; justify-content: space-between; align-items: center;">
                    <span>Показано: <b id="ac-table-rendered-count" style="color: #0284c7;">0</b> из ${features.length.toLocaleString('ru-RU')}</span>
                    <span style="font-size: 0.78rem; color: #94a3b8; font-weight: normal;">Прокручивайте вниз для отображения всех объектов</span>
                </div>
                <div id="ac-table-scroll-wrap" style="overflow-x: auto; overflow-y: auto; max-height: calc(100% - 35px);">
                    <table class="ac-table">
                        <thead>
                            <tr>
                                <th style="width: 45px;">№</th>
                                <th style="width: 220px;">Кадастровый номер</th>
                                <th style="width: 80px;">Тип</th>
                                <th>Адрес / Местоположение</th>
                                <th style="width: 120px;">Параметр</th>
                                <th style="width: 130px;">Стоимость</th>
                            </tr>
                        </thead>
                        <tbody id="ac-table-body"></tbody>
                    </table>
                </div>
            `;

            const tbody = document.getElementById('ac-table-body');
            const countEl = document.getElementById('ac-table-rendered-count');
            const scrollWrap = document.getElementById('ac-table-scroll-wrap');

            function renderRowsBatch() {
                const nextLimit = Math.min(renderedCount + BATCH_SIZE, features.length);
                const fragment = document.createDocumentFragment();

                for (let i = renderedCount; i < nextLimit; i++) {
                    const f = features[i];
                    const p = f.properties || {};
                    const o = p.options || {};
                    const addr = o.readable_address || o.address_readable_address || 'Адрес не указан';
                    const area = o.specified_area || o.build_record_area || o.params_extension || f.area || '-';
                    const cost = o.cost_value ? Number(o.cost_value).toLocaleString('ru-RU') + ' ₽' : '-';
                    const typeName = f._layer_type === 'zu' ? 'ЗУ' : (f._layer_type === 'oks' ? 'Здание' : 'Сооружение');

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="color: #64748b;">${i + 1}</td>
                        <td style="font-weight: 700; color: #0284c7;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span>${f.id}</span>
                                <button class="ac-zoom-btn" data-fid="${f.id}" title="Перейти к объекту на карте">
                                    <i class="fas fa-crosshairs"></i>
                                </button>
                            </div>
                        </td>
                        <td>${typeName}</td>
                        <td>${addr}</td>
                        <td>${area}</td>
                        <td>${cost}</td>
                    `;

                    tr.querySelector('.ac-zoom-btn').onclick = () => {
                        focusSingleFeatureOnMainMap(f);
                    };

                    fragment.appendChild(tr);
                }

                tbody.appendChild(fragment);
                renderedCount = nextLimit;
                countEl.textContent = renderedCount.toLocaleString('ru-RU');
            }

            // Первая порция строк
            renderRowsBatch();

            // Динамическая подгрузка при скролле вниз
            scrollWrap.addEventListener('scroll', () => {
                if (renderedCount < features.length) {
                    if (scrollWrap.scrollTop + scrollWrap.clientHeight >= scrollWrap.scrollHeight - 120) {
                        renderRowsBatch();
                    }
                }
            });
        }
    }

    // Фокус на конкретном одном объекте из таблицы
    function focusSingleFeatureOnMainMap(feature) {
    const activeMap = getActiveMap();
    if (!feature || !activeMap) return;
        if (analyticsModal) {
            analyticsModal.remove();
            analyticsModal = null;
        }

        if (feature._layer_type === 'zu' && typeof processAndDrawParcels === 'function') {
            processAndDrawParcels([feature], 'areaSearch', false);
        } else if (typeof processAndDrawBuildings === 'function') {
            processAndDrawBuildings([feature]);
        }

        if (typeof showNotification === 'function') {
            showNotification(`Фокус на объекте: ${feature.id}`, 'success');
        }
    }

    // Отрисовка выборки объектов на главной карте с модальным подтверждением при > 200 объектов
   function showResultsOnMainMap() {
    const activeMap = getActiveMap();
    if (!lastQueryResults?.features?.length || !activeMap) {
        alert('Нет объектов для переноса на карту или карта не готова');
        return;
    }

        const allFeatures = lastQueryResults.features;
        const totalCount = allFeatures.length;

        // Если объектов больше 200 — спрашиваем подтверждение
        if (totalCount > SAFE_MAP_OBJECT_LIMIT) {
            promptLargeVolumeConfirmation(totalCount, (choice) => {
                if (choice === 'cancel') return;

                const featuresToRender = (choice === 'all') 
                    ? allFeatures 
                    : allFeatures.slice(0, SAFE_MAP_OBJECT_LIMIT);

                executeDrawOnMap(featuresToRender, choice === 'limit' ? SAFE_MAP_OBJECT_LIMIT : totalCount);
            });
        } else {
            executeDrawOnMap(allFeatures, totalCount);
        }
    }

    // Диалог подтверждения большого объема
    function promptLargeVolumeConfirmation(totalCount, callback) {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'ac-confirm-dialog-overlay';

        dialogOverlay.innerHTML = `
            <div class="ac-confirm-dialog">
                <div class="ac-confirm-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 1.2rem;">Большой объем данных</h3>
                <div style="font-size: 0.95rem; font-weight: 700; color: #0284c7; margin-bottom: 8px;">
                    Найдено объектов: ${totalCount.toLocaleString('ru-RU')} шт.
                </div>
                <p style="font-size: 0.85rem; color: #64748b; margin: 0 0 18px 0; line-height: 1.4;">
                    Отображение более 200 сложных контуров одновременно может существенно снизить скорость работы браузера. Выберите вариант:
                </p>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="ac-confirm-first" style="padding: 10px; border-radius: 8px; border: none; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer;">
                        Нанести первые 200 объектов (Рекомендуется)
                    </button>
                    <button id="ac-confirm-all" style="padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; font-weight: 600; cursor: pointer;">
                        Нанести весь объем (${totalCount} шт.)
                    </button>
                    <button id="ac-confirm-cancel" style="padding: 8px; border-radius: 8px; border: none; background: transparent; color: #ef4444; font-weight: 600; cursor: pointer;">
                        Отмена
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(dialogOverlay);

        const closeDialog = (choice) => {
            dialogOverlay.remove();
            callback(choice);
        };

        dialogOverlay.querySelector('#ac-confirm-first').onclick = () => closeDialog('limit');
        dialogOverlay.querySelector('#ac-confirm-all').onclick = () => closeDialog('all');
        dialogOverlay.querySelector('#ac-confirm-cancel').onclick = () => closeDialog('cancel');
    }

    // Выполнение фактической отрисовки
    function executeDrawOnMap(features, countDrawn) {
        if (typeof processAndDrawParcels === 'function') {
            const zu = features.filter(f => f._layer_type === 'zu');
            const oks = features.filter(f => f._layer_type === 'oks');
            const str = features.filter(f => f._layer_type === 'structure');

            if (zu.length > 0) processAndDrawParcels(zu, 'areaSearch', false);
            if (oks.length > 0 && typeof processAndDrawBuildings === 'function') processAndDrawBuildings(oks);
            if (str.length > 0 && typeof processAndDrawStructures === 'function') processAndDrawStructures(str);
        }

        if (analyticsModal) {
            analyticsModal.remove();
            analyticsModal = null;
        }

        if (typeof showNotification === 'function') {
            showNotification(`На карту нанесено объектов: ${countDrawn}`, 'success');
        }
    }

    // Выгрузка в Excel
    async function exportToExcel() {
        if (!lastQueryResults?.features?.length) {
            alert('Нет данных для выгрузки в Excel');
            return;
        }
        await ensureXlsx();

        const headers = ["Кадастровый / Учетный номер", "Тип", "Адрес", "Площадь/Длина", "Кадастровая стоимость", "ВРИ / Назначение", "Собственность", "Этажность", "Материал стен"];
        const rows = [headers];

        lastQueryResults.features.forEach(f => {
            const o = f.properties?.options || {};
            rows.push([
                f.id,
                f._layer_type || 'Объект',
                o.readable_address || o.address_readable_address || '',
                o.specified_area || o.build_record_area || o.params_extension || f.area || '',
                o.cost_value || '',
                o.permitted_use_established_by_document || o.purpose || '',
                o.ownership_type || '',
                o.floors || '',
                o.materials || ''
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "Выборка");
        XLSX.writeFile(wb, `Аналитическая_выборка_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    // Выгрузка в GeoJSON
    function exportToGeoJSON() {
        if (!lastQueryResults?.features?.length) {
            alert('Нет объектов для экспорта');
            return;
        }
        const fc = {
            type: "FeatureCollection",
            features: lastQueryResults.features
        };
        const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/json" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Аналитические_объекты_${new Date().toISOString().slice(0, 10)}.geojson`;
        a.click();
    }
})();