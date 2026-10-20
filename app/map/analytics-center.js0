/**
 * Модуль: Аналитический центр базы данных
  */

(function () {
    const ANALYTICS_CENTER_VERSION = "2.15";
    console.log(`[Analytics Center] Загружена версия ${ANALYTICS_CENTER_VERSION}`);

    const MAPRUAPP_AI_URL = "https://mapruapp.ru/ai/api/v1/chat/completions";
    const AI_MODEL_NAME = "gemini-3.5-flash-lite";
    const BACKEND_QUERY_URL = "https://mapruapp.ru/api/analytics/query";
    const SAFE_MAP_OBJECT_LIMIT = 200;

    let analyticsModal = null;
    let currentChartInstances = [];
    let lastQueryResults = null;
    let activeTab = 'summary';
    let treemapMetric = 'area'; // 'area' | 'cost'
    let tableSearchTerm = '';
    let tableSortField = 'default';
    let resizeObserver = null;

    // Внедрение улучшенных стилей интерфейса
    function injectAnalyticsStyles() {
        if (document.getElementById('analytics-center-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'analytics-center-inline-styles';
        style.textContent = `
            @keyframes acFadeIn {
                from { opacity: 0; transform: scale(0.98) translateY(8px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes acPulseGlow {
                0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.25); }
                50% { box-shadow: 0 0 0 6px rgba(37, 99, 235, 0); }
            }

            #analytics-center-overlay {
                position: fixed; inset: 0;
                background: rgba(15, 23, 42, 0.72);
                backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: #0f172a;
                user-select: none;
            }

            /* Кастомный скроллбар */
            #analytics-center-overlay ::-webkit-scrollbar,
            .ac-card-overlay ::-webkit-scrollbar {
                width: 6px; height: 6px;
            }
            #analytics-center-overlay ::-webkit-scrollbar-track,
            .ac-card-overlay ::-webkit-scrollbar-track {
                background: #f1f5f9; border-radius: 4px;
            }
            #analytics-center-overlay ::-webkit-scrollbar-thumb,
            .ac-card-overlay ::-webkit-scrollbar-thumb {
                background: #cbd5e1; border-radius: 4px;
            }
            #analytics-center-overlay ::-webkit-scrollbar-thumb:hover,
            .ac-card-overlay ::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
            }

            .ac-window {
                width: 97vw; height: 96vh; max-width: 1920px;
                background: #f8fafc; border-radius: 20px;
                box-shadow: 0 25px 70px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.15);
                display: flex; flex-direction: column; overflow: hidden;
                animation: acFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }

            /* Шапка */
            .ac-header {
                padding: 12px 24px;
                background: linear-gradient(90deg, #ffffff 0%, #f8fafc 100%);
                border-bottom: 1px solid #e2e8f0;
                display: flex; align-items: center; justify-content: space-between;
                flex-shrink: 0; gap: 15px;
            }
            .ac-header-title {
                display: flex; align-items: center; gap: 12px;
                font-weight: 800; color: #0f172a; font-size: 1.2rem; letter-spacing: -0.02em;
            }
            .ac-header-icon {
                width: 40px; height: 40px;
                background: linear-gradient(135deg, #2563eb 0%, #0284c7 100%);
                color: #fff; border-radius: 12px;
                display: flex; align-items: center; justify-content: center;
                font-size: 1.15rem;
                box-shadow: 0 6px 14px rgba(37, 99, 235, 0.28);
            }
            .ac-version-badge {
                font-size: 0.7rem; font-weight: 700; color: #0369a1;
                background: #e0f2fe; border: 1px solid #bae6fd;
                padding: 2px 8px; border-radius: 999px; letter-spacing: 0.03em;
            }

            /* Основная сетка */
            .ac-body {
                flex: 1; display: grid; grid-template-columns: 375px 1fr;
                overflow: hidden; background: #f1f5f9;
            }

            /* Левая панель фильтров */
            .ac-sidebar {
                background: #ffffff; border-right: 1px solid #e2e8f0;
                display: flex; flex-direction: column;
                overflow-y: auto; padding: 16px; gap: 12px; box-sizing: border-box;
            }

            /* ИИ Блок */
            .ac-ai-box {
                background: linear-gradient(135deg, #eff6ff 0%, #eef2ff 50%, #f0fdf4 100%);
                border: 1px solid #bfdbfe; border-radius: 14px; padding: 14px;
                display: flex; flex-direction: column; gap: 9px;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.06);
                position: relative; overflow: hidden;
            }
            .ac-ai-box h4 {
                margin: 0; color: #1e3a8a; font-size: 0.86rem; font-weight: 800;
                display: flex; align-items: center; gap: 7px;
            }
            .ac-ai-input {
                width: 100%; height: 60px; padding: 9px 11px;
                border-radius: 10px; border: 1px solid #cbd5e1;
                font-size: 0.83rem; resize: none; box-sizing: border-box;
                outline: none; font-family: inherit; background: rgba(255,255,255,0.9);
                transition: all 0.2s ease; color: #0f172a;
            }
            .ac-ai-input:focus {
                background: #ffffff; border-color: #2563eb;
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
            }
            .ac-btn-ai {
                padding: 8px 14px;
                background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
                color: #fff; border: none; border-radius: 9px;
                font-size: 0.82rem; font-weight: 700; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 7px;
                box-shadow: 0 4px 10px rgba(37, 99, 235, 0.22);
                transition: all 0.2s ease;
            }
            .ac-btn-ai:hover:not(:disabled) {
                transform: translateY(-1px);
                box-shadow: 0 6px 14px rgba(37, 99, 235, 0.32);
                filter: brightness(1.05);
            }
            .ac-btn-ai:disabled { opacity: 0.65; cursor: not-allowed; }

            /* Группы фильтров */
            .ac-filter-group {
                background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
                padding: 13px; display: flex; flex-direction: column; gap: 10px;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .ac-filter-group:hover {
                border-color: #cbd5e1;
                box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
            }
            .ac-filter-title {
                font-size: 0.74rem; font-weight: 800; color: #475569;
                text-transform: uppercase; letter-spacing: 0.05em;
                display: flex; align-items: center; gap: 6px;
            }
            .ac-filter-title i { color: #0284c7; font-size: 0.8rem; }

            .ac-form-row {
                display: flex; flex-direction: column; gap: 4px;
                font-size: 0.8rem; color: #334155; font-weight: 500;
            }
            .ac-input-text, .ac-select {
                width: 100%; padding: 7px 10px; border-radius: 8px;
                border: 1px solid #cbd5e1; font-size: 0.83rem; color: #0f172a;
                outline: none; box-sizing: border-box; background: #f8fafc;
                transition: all 0.18s ease;
            }
            .ac-input-text:focus, .ac-select:focus {
                background: #ffffff; border-color: #0284c7;
                box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.14);
            }
            .ac-range-row {
                display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
            }

            /* Стилизованные чекбоксы-пилюли */
            .ac-checkbox-grid {
                display: grid; grid-template-columns: 1fr 1fr; gap: 7px;
            }
            .ac-checkbox-pill {
                display: flex; align-items: center; gap: 7px;
                padding: 6px 9px; border-radius: 8px;
                border: 1px solid #e2e8f0; background: #f8fafc;
                font-size: 0.8rem; font-weight: 600; color: #334155;
                cursor: pointer; transition: all 0.15s ease;
            }
            .ac-checkbox-pill:hover { background: #f1f5f9; border-color: #cbd5e1; }
            .ac-checkbox-pill input { accent-color: #0284c7; width: 15px; height: 15px; cursor: pointer; margin: 0; }

            /* Кнопки запуска и сброса */
            .ac-sidebar-footer {
                display: flex; gap: 8px; margin-top: 2px; position: sticky; bottom: 0;
                background: linear-gradient(180deg, rgba(255,255,255,0) 0%, #ffffff 20%);
                padding-top: 8px;
            }
            .ac-btn-run {
                flex: 1; padding: 11px 14px;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white; border: none; border-radius: 10px;
                font-weight: 700; font-size: 0.9rem; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 8px;
                box-shadow: 0 6px 16px rgba(16, 185, 129, 0.28);
                transition: all 0.2s ease;
            }
            .ac-btn-run:hover {
                transform: translateY(-1px);
                box-shadow: 0 8px 20px rgba(16, 185, 129, 0.36);
                filter: brightness(1.04);
            }
            .ac-btn-reset {
                padding: 11px 13px; background: #f1f5f9; color: #475569;
                border: 1px solid #cbd5e1; border-radius: 10px;
                font-weight: 600; font-size: 0.85rem; cursor: pointer;
                transition: all 0.2s ease;
            }
            .ac-btn-reset:hover { background: #e2e8f0; color: #0f172a; }

            /* Правая рабочая область */
            .ac-main {
                display: flex; flex-direction: column; overflow: hidden;
                padding: 14px 18px; gap: 12px;
            }
            .ac-tabs-bar {
                display: flex; justify-content: space-between; align-items: center;
                background: #ffffff; padding: 7px 12px; border-radius: 14px;
                border: 1px solid #e2e8f0; flex-shrink: 0;
                box-shadow: 0 2px 6px rgba(15, 23, 42, 0.02);
                flex-wrap: wrap; gap: 8px;
            }
            .ac-tabs { display: flex; gap: 5px; flex-wrap: wrap; }
            .ac-tab-btn {
                padding: 8px 14px; border: none; background: transparent;
                font-weight: 600; font-size: 0.83rem; color: #64748b;
                border-radius: 9px; cursor: pointer;
                display: flex; align-items: center; gap: 7px;
                transition: all 0.18s ease;
            }
            .ac-tab-btn:hover { background: #f1f5f9; color: #0f172a; }
            .ac-tab-btn.active {
                background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
                color: #0369a1; font-weight: 700;
                box-shadow: inset 0 0 0 1px #bae6fd;
            }

            .ac-actions { display: flex; gap: 8px; }
            .ac-action-btn {
                padding: 7px 13px; background: #ffffff;
                border: 1px solid #cbd5e1; border-radius: 8px;
                font-size: 0.8rem; font-weight: 700; color: #334155;
                cursor: pointer; display: flex; align-items: center; gap: 6px;
                transition: all 0.18s ease;
            }
            .ac-action-btn:hover {
                background: #f8fafc; border-color: #94a3b8;
                transform: translateY(-1px);
                box-shadow: 0 3px 8px rgba(15, 23, 42, 0.06);
            }

            /* Контейнер контента */
            .ac-content-view {
                flex: 1; overflow-y: auto; position: relative;
                background: #ffffff; border-radius: 16px;
                border: 1px solid #e2e8f0; padding: 16px; box-sizing: border-box;
                box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
            }

            /* KPI Карточки */
            .ac-kpi-grid {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
                gap: 14px; margin-bottom: 16px;
            }
            .ac-kpi-card {
                padding: 14px 16px; border-radius: 14px;
                background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                border: 1px solid #e2e8f0;
                display: flex; align-items: flex-start; justify-content: space-between;
                gap: 12px; transition: all 0.2s ease;
                box-shadow: 0 2px 6px rgba(15, 23, 42, 0.02);
            }
            .ac-kpi-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
                border-color: #cbd5e1;
            }
            .ac-kpi-info span {
                font-size: 0.72rem; font-weight: 700; color: #64748b;
                text-transform: uppercase; letter-spacing: 0.04em;
            }
            .ac-kpi-info strong {
                display: block; font-size: 1.35rem; font-weight: 800;
                color: #0f172a; margin-top: 4px; letter-spacing: -0.02em;
            }
            .ac-kpi-sub {
                font-size: 0.73rem; color: #64748b; margin-top: 5px; font-weight: 500;
            }
            .ac-kpi-icon {
                width: 42px; height: 42px; border-radius: 11px;
                display: flex; align-items: center; justify-content: center;
                font-size: 1.15rem; flex-shrink: 0;
            }

            /* Полоса аналитических инсайтов */
            .ac-insights-bar {
                display: flex; flex-wrap: wrap; gap: 10px;
                padding: 10px 14px; background: #f8fafc;
                border: 1px solid #e2e8f0; border-radius: 12px;
                margin-bottom: 16px; align-items: center;
            }
            .ac-insight-pill {
                font-size: 0.78rem; color: #334155; background: #ffffff;
                border: 1px solid #e2e8f0; padding: 5px 11px; border-radius: 999px;
                display: inline-flex; align-items: center; gap: 6px; font-weight: 600;
            }

            /* Сетка графиков */
            .ac-charts-grid {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(430px, 1fr));
                gap: 16px;
            }
            .ac-charts-grid-3 {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
                gap: 16px;
            }
            .ac-chart-card {
                background: #ffffff; border: 1px solid #e2e8f0;
                border-radius: 14px; padding: 12px;
                box-shadow: 0 2px 8px rgba(15, 23, 42, 0.02);
                display: flex; flex-direction: column;
            }
            .ac-chart-container {
                height: 315px; width: 100%;
            }

            /* Таблица и панель инструментов */
            .ac-table-toolbar {
                margin-bottom: 10px; padding: 8px 12px;
                background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
                display: flex; justify-content: space-between; align-items: center;
                flex-wrap: wrap; gap: 10px;
            }
            .ac-table {
                width: 100%; border-collapse: separate; border-spacing: 0;
                font-size: 0.82rem; text-align: left;
            }
            .ac-table th {
                position: sticky; top: 0; background: #f1f5f9;
                padding: 10px 12px; border-bottom: 2px solid #cbd5e1;
                color: #334155; font-weight: 700; z-index: 2;
                font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.03em;
            }
            .ac-table td {
                padding: 9px 12px; border-bottom: 1px solid #f1f5f9;
                color: #1e293b; vertical-align: middle;
            }
            .ac-table-row-clickable { cursor: pointer; transition: background 0.12s ease; }
            .ac-table-row-clickable:nth-child(even) td { background: #fafaf9; }
            .ac-table-row-clickable:hover td { background: #eff6ff !important; }

            .ac-badge-type {
                display: inline-block; padding: 2px 8px; border-radius: 6px;
                font-size: 0.72rem; font-weight: 700;
            }
            .ac-badge-zu { background: #dcfce7; color: #15803d; }
            .ac-badge-oks { background: #e0f2fe; color: #0369a1; }
            .ac-badge-str { background: #ffedd5; color: #c2410c; }

            .ac-close-btn {
                width: 36px; height: 36px; border-radius: 10px;
                background: #f1f5f9; border: none; font-size: 1.4rem;
                color: #64748b; cursor: pointer; display: flex;
                align-items: center; justify-content: center;
                transition: all 0.18s ease;
            }
            .ac-close-btn:hover { background: #fee2e2; color: #ef4444; }

            .ac-zoom-btn {
                padding: 5px 9px; background: #eff6ff; border: 1px solid #bfdbfe;
                border-radius: 6px; color: #1d4ed8; font-weight: 600;
                cursor: pointer; font-size: 0.76rem; transition: all 0.15s ease;
            }
            .ac-zoom-btn:hover { background: #2563eb; color: #ffffff; border-color: #2563eb; }

            /* Карточка выбранного объекта */
            .ac-card-overlay {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65);
                z-index: 1000005; display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .ac-card-window {
                background: #ffffff; width: 960px; max-width: 95vw; max-height: 90vh;
                border-radius: 20px; box-shadow: 0 25px 70px rgba(0, 0, 0, 0.4);
                display: flex; flex-direction: column; overflow: hidden;
                border: 1px solid #cbd5e1;
                animation: acFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .ac-card-header {
                padding: 16px 22px; background: linear-gradient(90deg, #f8fafc 0%, #ffffff 100%);
                border-bottom: 1px solid #e2e8f0;
                display: flex; align-items: center; justify-content: space-between;
            }
            .ac-card-body {
                display: grid; grid-template-columns: 1.25fr 1fr; gap: 20px;
                padding: 20px; overflow-y: auto;
            }
            .ac-card-prop-table {
                width: 100%; border-collapse: collapse; font-size: 0.84rem;
            }
            .ac-card-prop-table td {
                padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top;
            }
            .ac-card-prop-table tr:hover td { background: #f8fafc; }
            .ac-card-prop-table td:first-child {
                color: #64748b; font-weight: 600; width: 40%;
            }
            .ac-card-prop-table td:last-child {
                color: #0f172a; font-weight: 600; word-break: break-word;
            }
            .ac-card-right-panel {
                display: flex; flex-direction: column; gap: 12px;
            }
            .ac-streetview-box {
                width: 100%; height: 280px; background: #0f172a;
                border-radius: 12px; overflow: hidden;
                border: 1px solid #cbd5e1; position: relative;
                box-shadow: inset 0 2px 6px rgba(0,0,0,0.2);
            }
            .ac-card-btn {
                padding: 10px 14px; border-radius: 10px; font-size: 0.85rem;
                font-weight: 700; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 8px;
                border: none; transition: all 0.2s ease;
            }
            .ac-card-btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
            .ac-btn-egrn {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: #fff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
            }

            /* Модальное окно подтверждения большого объема */
            .ac-confirm-dialog-overlay {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65);
                z-index: 1000000; display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(4px);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .ac-confirm-dialog {
                background: #ffffff; width: 450px; max-width: 90vw;
                border-radius: 18px; padding: 24px;
                box-shadow: 0 25px 50px rgba(0,0,0,0.3);
                border: 1px solid #e2e8f0; text-align: center;
                animation: acFadeIn 0.2s ease;
            }
            .ac-confirm-icon {
                width: 52px; height: 52px; border-radius: 50%;
                background: #fef3c7; color: #d97706;
                display: flex; align-items: center; justify-content: center;
                font-size: 1.5rem; margin: 0 auto 14px auto;
            }
        `;
        document.head.appendChild(style);
    }

    // Безопасное экранирование HTML
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Безопасное получение карты
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

    // Автоопределение префикса региона из МСК
    function getDefaultCadastralPrefix() {
        try {
            const mskVal = localStorage.getItem('savedDefaultMskSystem') || '';
            const m = mskVal.match(/633(\d{2})/);
            if (m) return `${m[1]}:`;
            const mskText = (typeof COORDINATE_SYSTEMS !== 'undefined')
                ? (COORDINATE_SYSTEMS.find(s => s.value === mskVal)?.text || '') : '';
            const m2 = mskText.match(/МСК[ -]?(\d{2})/i);
            if (m2) return `${m2[1]}:`;
        } catch (e) {}
        return '01:';
    }

    // Проверка наличия контура у объекта
    function hasRealBoundaries(f) {
        if (!f || !f.geometry || !f.geometry.coordinates) return false;
        const c = f.geometry.coordinates;
        if (!Array.isArray(c) || c.length === 0) return false;
        if (f.geometry.type === 'Point') return false;
        if (f.geometry.type === 'Polygon') return Array.isArray(c[0]) && c[0].length >= 3;
        if (f.geometry.type === 'MultiPolygon') return Array.isArray(c[0]) && Array.isArray(c[0][0]) && c[0][0].length >= 3;
        if (f.geometry.type === 'LineString') return c.length >= 2;
        return true;
    }

    // Проверка: является ли участок декларированным
    function isDeclaredParcel(f) {
        if (!f || f._layer_type !== 'zu') return false;
        const o = f.properties?.options || {};
        const isVerified = o.specified_area || o.land_record_area_verified;
        const hasDeclaredField = o.declared_area || o.land_record_area_declaration || o.land_record_area;
        return !isVerified && !!hasDeclaredField;
    }
    
    // Надежное извлечение кадастрового номера из объекта (Feature)
    function extractCadastralNumber(f) {
        if (!f) return '';
        const p = f.properties || {};
        const o = p.options || {};
        
        const candidates = [
            o.cad_num,
            o.cad_number,
            p.descr,
            o.reg_numb_border,
            p.label,
            typeof f.id === 'string' && f.id.includes(':') ? f.id : null
        ];

        for (const c of candidates) {
            if (c && typeof c === 'string' && c.includes(':') && !c.startsWith('Полигон_') && !c.startsWith('Линия_') && c !== 'Объект') {
                return c.trim();
            }
        }

        return o.cad_num || o.cad_number || p.descr || o.reg_numb_border || (typeof f.id === 'string' ? f.id : '') || '';
    }

    // Получение числового значения площади объекта
    function getNumericArea(f) {
        if (!f) return 0;
        const o = f.properties?.options || {};
        const val = parseFloat(o.specified_area || o.build_record_area || o.declared_area || o.land_record_area || o.params_extension || f.area || 0);
        return isFinite(val) && val > 0 ? val : 0;
    }

    // Получение числового значения стоимости объекта
    function getNumericCost(f) {
        if (!f) return 0;
        const o = f.properties?.options || {};
        const val = parseFloat(o.cost_value || 0);
        return isFinite(val) && val > 0 ? val : 0;
    }

    // Получение даты сведений
    function getFeatureDate(f) {
        if (!f) return { regDate: null, dbDate: null };
        const p = f.properties || {};
        const o = p.options || {};
        const regDateRaw = o.land_record_reg_date ||
                           o.build_record_registration_date ||
                           o.registration_date ||
                           p.updated_date;
        const dbDateRaw = f.db_date || f.updated_date;

        const format = (d) => {
            if (!d || d === '-') return null;
            const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
            return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d);
        };

        return {
            regDate: format(regDateRaw),
            dbDate: format(dbDateRaw)
        };
    }

  // Дополнительный клиентский расчет аналитики по выборке
    function computeClientStats(features) {
        let withGeom = 0;
        let withoutGeom = 0;
        let zuSpecified = 0;
        let zuDeclared = 0;
        let oksWithGeom = 0;
        let oksWithoutGeom = 0;
        const vriCounts = {};
        const upksList = [];
        const scatterData = [];

        features.forEach(f => {
            const o = f.properties?.options || {};
            const hasGeom = hasRealBoundaries(f);
            if (hasGeom) withGeom++;
            else withoutGeom++;

            if (f._layer_type === 'zu') {
                if (isDeclaredParcel(f)) zuDeclared++;
                else zuSpecified++;
            } else if (f._layer_type === 'oks' || f._layer_type === 'structure') {
                if (hasGeom) oksWithGeom++;
                else oksWithoutGeom++;
            }

            const vriRaw = (o.permitted_use_established_by_document || o.purpose || o.params_purpose || '').trim();
            if (vriRaw && vriRaw !== '-' && vriRaw !== 'null') {
                const shortVri = vriRaw.length > 48 ? vriRaw.slice(0, 45) + '...' : vriRaw;
                vriCounts[shortVri] = (vriCounts[shortVri] || 0) + 1;
            }

            const area = getNumericArea(f);
            const cost = getNumericCost(f);
            if (area > 0 && cost > 0) {
                const upks = cost / area;
                if (upks > 1 && upks < 5000000) {
                    upksList.push(upks);
                }
                if (scatterData.length < 1500) {
                    scatterData.push({
                        value: [Math.round(area), Math.round(cost)],
                        id: f.id,
                        type: f._layer_type,
                        raw: f
                    });
                }
            }
        });

        upksList.sort((a, b) => a - b);
        const medianUpks = upksList.length > 0
            ? upksList[Math.floor(upksList.length / 2)]
            : 0;
        const minUpks = upksList.length > 0 ? upksList[0] : 0;
        const maxUpks = upksList.length > 0 ? upksList[upksList.length - 1] : 0;

        const topVri = Object.entries(vriCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        return {
            withGeom,
            withoutGeom,
            zuSpecified,
            zuDeclared,
            oksWithGeom,
            oksWithoutGeom,
            topVri,
            medianUpks,
            minUpks,
            maxUpks,
            scatterData
        };
    }

    // Преобразование координат центра объекта из 3857 в WGS84
    function getFeatureCenterWgs(feature) {
        if (!feature || !feature.geometry) return null;
        let x = 0, y = 0, count = 0;
        const extractPoints = (coords) => {
            if (!Array.isArray(coords)) return;
            if (typeof coords[0] === 'number') {
                x += coords[0]; y += coords[1]; count++;
            } else {
                coords.forEach(extractPoints);
            }
        };
        extractPoints(feature.geometry.coordinates);
        if (count === 0) return null;
        x /= count; y /= count;

        const lon = (x / 6378137.0) * (180.0 / Math.PI);
        const lat = (Math.atan(Math.exp(y / 6378137.0)) * 2 - Math.PI / 2) * (180.0 / Math.PI);
        return { lat, lon };
    }

    // Преобразование геометрии в координаты Яндекс Карт
    function convertFeatureToYandexCoords(feature) {
        if (!feature || !feature.geometry || !feature.geometry.coordinates) return [];
        const mapOffsetY = parseFloat(localStorage.getItem('mapOffsetY')) || -1;
        const mapOffsetX = parseFloat(localStorage.getItem('mapOffsetX')) || -4.5;

        const toYandexPoint = (c) => {
            const is3857 = Math.abs(c[0]) > 200 || Math.abs(c[1]) > 200;
            let wgs = c;
            if (is3857 && typeof proj4 !== 'undefined') {
                wgs = proj4('EPSG:3857', 'EPSG:4326', c);
            }
            const lat = wgs[1] - (mapOffsetY * 0.000008983);
            const lon = wgs[0] - (mapOffsetX * 0.000008983);
            return [lat, lon];
        };

        const geom = feature.geometry;
        if (geom.type === 'Polygon') {
            return geom.coordinates.map(ring => ring.map(toYandexPoint));
        } else if (geom.type === 'MultiPolygon') {
            return geom.coordinates.flatMap(poly => poly.map(ring => ring.map(toYandexPoint)));
        } else if (geom.type === 'LineString') {
            return [geom.coordinates.map(toYandexPoint)];
        }
        return [];
    }

    // Загрузка библиотек
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
    
    
 

    // Сбор объектов карты без привязки к window (прямой доступ к массивам index.html)
    function getMapObjectsAsFeatures() {
        const features = [];
        const seen = new Set();

        const addFeature = (f, defaultType) => {
            if (!f) return;
            const p = f.properties || {};
            const o = p.options || {};
            const cn = extractCadastralNumber(f) || 'Объект';
            
            const key = (cn && cn !== 'Объект') ? cn : (p._exportId || `${defaultType}_${Math.random()}`);
            if (seen.has(key)) return;
            seen.add(key);

            let layerType = defaultType;
            const cat = p.category;
            const catName = (p.categoryName || '').toLowerCase();
            if (cat === 36369 || catName.includes('здани') || o.build_record_area || (o.cad_num && o.purpose)) {
                layerType = 'oks';
            } else if (cat === 36383 || catName.includes('сооружен') || o.params_extension) {
                layerType = 'structure';
            } else if (cat === 36940 || cat === 36315 || cat === 36281 || cat === 36278 || cat === 36314 || catName.includes('зон') || p._zone_type) {
                layerType = 'zones';
            } else if (cat === 36368 || catName.includes('земельн') || o.land_record_type || o.specified_area || o.declared_area) {
                layerType = 'zu';
            }

            features.push({
                id: cn,
                _layer_type: layerType,
                properties: p,
                geometry: f.geometry || null,
                area: getNumericArea(f),
                cost: getNumericCost(f),
                db_date: f.db_date || p.updated_date || new Date().toISOString().slice(0, 10)
            });
        };

        // 1. Опрос глобальных массивов index.html
        const zuArray = (typeof parcelFeaturesData !== 'undefined' && Array.isArray(parcelFeaturesData)) ? parcelFeaturesData : (window.parcelFeaturesData || []);
        const oksArray = (typeof buildingFeaturesData !== 'undefined' && Array.isArray(buildingFeaturesData)) ? buildingFeaturesData : (window.buildingFeaturesData || []);
        const strArray = (typeof structureFeaturesData !== 'undefined' && Array.isArray(structureFeaturesData)) ? structureFeaturesData : (window.structureFeaturesData || []);
        const zouitArray = (typeof zouitFeaturesData !== 'undefined' && Array.isArray(zouitFeaturesData)) ? zouitFeaturesData : (window.zouitFeaturesData || []);

        zuArray.forEach(f => addFeature(f, 'zu'));
        oksArray.forEach(f => addFeature(f, 'oks'));
        strArray.forEach(f => addFeature(f, 'structure'));
        zouitArray.forEach(f => addFeature(f, 'zones'));

        // 2. Опрос векторных объектов polygons на карте
        const polyArray = (typeof polygons !== 'undefined' && Array.isArray(polygons)) ? polygons : (window.polygons || []);
        polyArray.forEach(obj => {
            if (!obj || !obj.properties) return;
            const p = obj.properties;
            if (p.get('isQuarterBoundary') || p.get('isSearchShape') || p.get('isVertexPoint')) return;

            let fd = p.get('featureData');
            const cn = p.get('cadastralNumber');

            let defaultType = 'zu';
            if (p.get('isBuilding')) defaultType = 'oks';
            else if (p.get('isStructure')) defaultType = 'structure';
            else if (p.get('isZouit')) defaultType = 'zones';

            if (fd) {
                addFeature(fd, defaultType);
            } else if (cn || obj instanceof ymaps.Polygon || obj instanceof ymaps.Polyline) {
                const stats = (typeof calculatePreciseGeometry === 'function') ? calculatePreciseGeometry(obj) : { area: 0, perimeter: 0 };
                addFeature({
                    type: "Feature",
                    id: cn || 'Объект',
                    geometry: obj.geometry ? { type: obj.geometry.getType(), coordinates: obj.geometry.getCoordinates() } : null,
                    properties: {
                        descr: cn || 'Объект',
                        options: {
                            cad_num: cn || 'Объект',
                            readable_address: p.get('address') || 'Нанесен на карту',
                            specified_area: stats.area || null,
                            params_extension: stats.perimeter || null
                        }
                    }
                }, defaultType);
            }
        });

        return features;
    }

    // Автоопределение наиболее часто встречающегося района/квартала (например, "01:02")
    function detectPopularCadastralPrefix(features) {
        if (!features || !features.length) return '';
        const counts = {};
        features.forEach(f => {
            const cn = extractCadastralNumber(f);
            const m = cn.match(/\b(\d{1,2}:\d{1,2})\b/);
            if (m) {
                counts[m[1]] = (counts[m[1]] || 0) + 1;
            }
        });
        let best = '';
        let max = 0;
        for (const k in counts) {
            if (counts[k] > max) {
                max = counts[k];
                best = k;
            }
        }
        return best; 
    }
  

    // Расчет сводной статистики (summary) из массива объектов карты
    function generateSummaryFromFeatures(features) {
        let count_zu = 0, count_oks = 0, count_str = 0, count_zones = 0;
        let total_area = 0, total_cost = 0;
        let cost_count = 0, cost_upks_sum = 0;
        const ownership_dist = {};
        const floors_dist = {};
        const materials_dist = {};
        const cost_brackets = {
            'До 1 млн ₽': 0,
            '1 - 3 млн ₽': 0,
            '3 - 5 млн ₽': 0,
            '5 - 10 млн ₽': 0,
            '10 - 20 млн ₽': 0,
            '20+ млн ₽': 0
        };

        features.forEach(f => {
            const o = f.properties?.options || {};
            if (f._layer_type === 'zu') count_zu++;
            else if (f._layer_type === 'oks') count_oks++;
            else if (f._layer_type === 'structure') count_str++;
            else if (f._layer_type === 'zones') count_zones++;

            const area = getNumericArea(f);
            const cost = getNumericCost(f);

            total_area += area;
            if (cost > 0) {
                total_cost += cost;
                if (area > 0) {
                    cost_upks_sum += (cost / area);
                    cost_count++;
                }
                if (cost < 1e6) cost_brackets['До 1 млн ₽']++;
                else if (cost < 3e6) cost_brackets['1 - 3 млн ₽']++;
                else if (cost < 5e6) cost_brackets['3 - 5 млн ₽']++;
                else if (cost < 1e7) cost_brackets['5 - 10 млн ₽']++;
                else if (cost < 2e7) cost_brackets['10 - 20 млн ₽']++;
                else cost_brackets['20+ млн ₽']++;
            }

            const own = (o.ownership_type || 'Не указано').trim();
            ownership_dist[own] = (ownership_dist[own] || 0) + 1;

            const fl = parseInt(o.floors, 10);
            if (fl && fl > 0 && fl <= 50) {
                floors_dist[fl] = (floors_dist[fl] || 0) + 1;
            }

            const mat = (o.materials || '').trim();
            if (mat && mat !== '-' && mat !== 'null') {
                materials_dist[mat] = (materials_dist[mat] || 0) + 1;
            }
        });

        return {
            total_count: features.length,
            count_zu,
            count_oks,
            count_str,
            count_zones,
            total_area,
            total_cost,
            avg_upks: cost_count > 0 ? (cost_upks_sum / cost_count) : 0,
            ownership_dist,
            floors_dist,
            cost_brackets,
            materials_dist,
            is_limit_reached: false
        };
    }

  function filterMapFeatures(allFeatures, payload) {
        const filters = payload.filters || {};
        const tables = payload.tables || ['zu', 'oks', 'structure', 'zones'];

        return allFeatures.filter(f => {
            if (!tables.includes(f._layer_type)) return false;

            const p = f.properties || {};
            const o = p.options || {};
            const objCad = extractCadastralNumber(f).toLowerCase();

            // Если задана маска номера (например, 01:02)
            if (filters.cad_num) {
                const searchCad = filters.cad_num.toLowerCase().replace(/:+$/, '');
                if (/^\d{1,2}:/.test(objCad)) {
                    if (!objCad.includes(searchCad)) return false;
                }
            }

            if (filters.address) {
                const searchAddr = filters.address.toLowerCase();
                const objAddr = String(o.readable_address || o.address_readable_address || '').toLowerCase();
                if (filters.exact_match) {
                    if (!objAddr.includes(searchAddr)) return false;
                } else {
                    const terms = searchAddr.split(/\s+/).filter(Boolean);
                    for (const term of terms) {
                        if (!objAddr.includes(term)) return false;
                    }
                }
            }

            if (filters.ownership) {
                const objOwn = (o.ownership_type || '').toLowerCase();
                if (!objOwn.includes(filters.ownership.toLowerCase())) return false;
            }

            if (filters.right_type) {
                const objRight = (o.right_type || '').toLowerCase();
                if (!objRight.includes(filters.right_type.toLowerCase())) return false;
            }

            if (filters.status) {
                const objStatus = (o.status || '').toLowerCase();
                if (!objStatus.includes(filters.status.toLowerCase())) return false;
            }

            if (filters.zu_area_type && f._layer_type === 'zu') {
                if (filters.zu_area_type === 'specified' && !hasRealBoundaries(f)) return false;
                if (filters.zu_area_type === 'declared' && !isDeclaredParcel(f)) return false;
            }

            if (filters.zu_category && f._layer_type === 'zu') {
                const cat = (o.land_record_category_type || '').toLowerCase();
                if (!cat.includes(filters.zu_category.toLowerCase())) return false;
            }

            if (filters.zu_vri && f._layer_type === 'zu') {
                const vri = (o.permitted_use_established_by_document || '').toLowerCase();
                if (!vri.includes(filters.zu_vri.toLowerCase())) return false;
            }

            if (filters.oks_kind && f._layer_type === 'oks') {
                const kind = (o.build_record_type_value || o.purpose || '').toLowerCase();
                if (!kind.includes(filters.oks_kind.toLowerCase())) return false;
            }

            if (filters.oks_purpose && f._layer_type === 'oks') {
                const purp = (o.purpose || '').toLowerCase();
                if (!purp.includes(filters.oks_purpose.toLowerCase())) return false;
            }

            if (filters.oks_name && f._layer_type === 'oks') {
                const name = (o.name || o.building_name || o.params_name || '').toLowerCase();
                if (!name.includes(filters.oks_name.toLowerCase())) return false;
            }

            const floors = parseInt(o.floors, 10);
            if (filters.floors_min !== undefined && (!floors || floors < filters.floors_min)) return false;
            if (filters.floors_max !== undefined && (!floors || floors > filters.floors_max)) return false;

            const area = getNumericArea(f);
            if (filters.area_min !== undefined && area < filters.area_min) return false;
            if (filters.area_max !== undefined && area > filters.area_max) return false;

            const cost = getNumericCost(f);
            if (filters.cost_min !== undefined && cost < filters.cost_min) return false;
            if (filters.cost_max !== undefined && cost > filters.cost_max) return false;

            if (filters.materials && f._layer_type === 'oks') {
                const mat = (o.materials || '').toLowerCase();
                if (!mat.includes(filters.materials.toLowerCase())) return false;
            }

            return true;
        });
    }

    async function runAnalyticsQuery(lat, lon) {
        const spatialType = document.getElementById('ac-spatial-type')?.value;

        // Режим: "Объекты на карте" — сразу локальный расчет без запросов к серверу БД
        if (spatialType === 'map_objects') {
            const rawMapFeatures = getMapObjectsAsFeatures();
            if (!rawMapFeatures.length) {
                const container = document.getElementById('ac-content-view');
                container.innerHTML = `
                    <div style="text-align: center; padding-top: 110px; color: #d97706;">
                        <i class="fas fa-layer-group" style="font-size: 2.8rem; margin-bottom: 12px; color: #f59e0b;"></i>
                        <div style="font-weight: 800; font-size: 1.15rem; color: #0f172a;">На карте нет загруженных объектов</div>
                        <div style="font-size: 0.9rem; color: #64748b; margin-top: 6px;">
                            Загрузите участки на карту или выберите гео-зону «Текущий экран карты» / «По всей базе»
                        </div>
                    </div>
                `;
                return;
            }

            const payload = collectFilterPayload(lat, lon, true);
            const filtered = filterMapFeatures(rawMapFeatures, payload || { tables: ['zu', 'oks', 'structure', 'zones'], filters: {} });

            lastQueryResults = {
                summary: generateSummaryFromFeatures(filtered),
                features: filtered
            };
            lastQueryResults._clientStats = computeClientStats(filtered);

            renderActiveTabContent();
            return;
        }

        // Остальные режимы — запрос на бэкенд
        const payload = collectFilterPayload(lat, lon);
        if (!payload) return;

        const container = document.getElementById('ac-content-view');
        container.innerHTML = `
            <div style="text-align: center; padding-top: 120px; color: #2563eb;">
                <i class="fas fa-circle-notch fa-spin" style="font-size: 2.8rem; margin-bottom: 14px;"></i>
                <div style="font-weight: 800; font-size: 1.15rem; color: #0f172a;">Анализ базы данных и расчет показателей...</div>
                <div style="font-size: 0.85rem; color: #64748b; margin-top: 6px;">Выполняется агрегация геоданных и атрибутов</div>
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
            lastQueryResults._clientStats = computeClientStats(lastQueryResults.features || []);

            renderActiveTabContent();
        } catch (err) {
            container.innerHTML = `
                <div style="text-align: center; padding-top: 110px; color: #ef4444;">
                    <i class="fas fa-triangle-exclamation" style="font-size: 2.8rem; margin-bottom: 12px;"></i>
                    <div style="font-weight: 800; font-size: 1.15rem;">Не удалось выполнить запрос к аналитическому ядру</div>
                    <div style="font-size: 0.9rem; color: #64748b; margin-top: 6px;">${escapeHtml(err.message)}</div>
                </div>
            `;
        }
    }

    // Открытие Аналитического центра
  window.openAnalyticsCenter = async function (lat, lon) {
        injectAnalyticsStyles();
        await ensureEcharts();

        if (analyticsModal) {
            analyticsModal.style.display = 'flex';
            setTimeout(() => currentChartInstances.forEach(c => c.resize()), 50);
            return;
        }

        
       // Автоопределение района по объектам карты
        const mapFeatures = getMapObjectsAsFeatures();
        const popularDistrict = detectPopularCadastralPrefix(mapFeatures);
        const initialCadValue = popularDistrict ? popularDistrict : (getDefaultCadastralPrefix() + '01:');

        analyticsModal = document.createElement('div');
        analyticsModal.id = 'analytics-center-overlay';

        analyticsModal.innerHTML = `
            <div class="ac-window">
                <div class="ac-header">
                    <div class="ac-header-title">
                        <!-- Заменена иконка на fa-chart-pie -->
                        <div class="ac-header-icon"><i class="fas fa-chart-pie"></i></div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span>Аналитический центр недвижимости</span>
                                <span class="ac-version-badge">v${ANALYTICS_CENTER_VERSION}</span>
                            </div>
                            <div style="font-size:0.75rem; font-weight:500; color:#64748b;">Система пространственного и кадастрового анализа</div>
                        </div>
                    </div>
                    <button class="ac-close-btn" id="ac-close-btn" title="Закрыть окно">&times;</button>
                </div>
                
                <div class="ac-body">
                    <!-- Сайдбар параметров -->
                    <div class="ac-sidebar">

                        <!-- Пространственный охват -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title"><i class="fas fa-globe"></i> Пространственный охват</span>
                            <div class="ac-form-row">
                                <label>Гео-зона поиска:</label>
                                <select id="ac-spatial-type" class="ac-select">
                                    <option value="map_objects" selected>Объекты на карте</option>
                                    <option value="viewport">Текущий экран карты</option>
                                    <option value="radius">В радиусе от точки клика</option>
                                    <option value="all">По всей базе (требуется район)</option>
                                </select>
                            </div>
                            <div class="ac-form-row" id="ac-radius-wrap" style="display: none;">
                                <label>Радиус поиска (метров):</label>
                                <input type="number" id="ac-radius-val" class="ac-input-text" value="1000" min="50" step="50">
                            </div>
                        </div>

                        <!-- Кадастровый номер и текстовый поиск -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title"><i class="fas fa-hashtag"></i> Кадастровый номер и адрес</span>
                            <div class="ac-form-row">
                                <label>Кадастровый номер или маска (мин. 4 цифры):</label>
                                <input type="text" id="ac-cadnum-search" class="ac-input-text" value="${initialCadValue}" placeholder="01:02 или 01:02:010101">
                            </div>
                            <div class="ac-form-row">
                                <label>Поиск по адресу / ориентиру:</label>
                                <input type="text" id="ac-address-search" class="ac-input-text" placeholder="Улица, поселок, СНТ...">
                            </div>
                            <div style="font-size: 0.78rem; margin-top: 2px;">
                                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #475569;">
                                    <input type="checkbox" id="ac-exact-match" style="accent-color:#0284c7;">
                                    <span>Точное совпадение фразы</span>
                                </label>
                            </div>
                        </div>

                        <!-- Типы объектов -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title"><i class="fas fa-layer-group"></i> Типы объектов</span>
                            <div class="ac-checkbox-grid">
                                <label class="ac-checkbox-pill"><input type="checkbox" id="ac-type-zu" checked> Участки (ЗУ)</label>
                                <label class="ac-checkbox-pill"><input type="checkbox" id="ac-type-oks" checked> Здания (ОКС)</label>
                                <label class="ac-checkbox-pill"><input type="checkbox" id="ac-type-str"> Сооружения</label>
                                <label class="ac-checkbox-pill"><input type="checkbox" id="ac-type-zones"> Зоны / Границы</label>
                            </div>
                        </div>

                        <!-- Права и статус -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title"><i class="fas fa-scale-balanced"></i> Права и статус</span>
                            <div class="ac-form-row">
                                <label>Форма собственности:</label>
                                <select id="ac-ownership-type" class="ac-select">
                                    <option value="">(Любая)</option>
                                    <option value="Частная">Частная</option>
                                    <option value="Муниципальная">Муниципальная</option>
                                    <option value="Государственная">Государственная</option>
                                </select>
                            </div>
                            <div class="ac-form-row">
                                <label>Вид права:</label>
                                <input type="text" id="ac-right-type" class="ac-input-text" placeholder="Собственность, Аренда...">
                            </div>
                            <div class="ac-form-row">
                                <label>Статус записи:</label>
                                <select id="ac-status-val" class="ac-select">
                                    <option value="">(Любой)</option>
                                    <option value="Ранее учтенный">Ранее учтенный</option>
                                    <option value="Учтенный">Учтенный</option>
                                    <option value="Временный">Временный</option>
                                </select>
                            </div>
                        </div>

                        <!-- Параметры участков (ЗУ) -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title"><i class="fas fa-vector-square"></i> Параметры участков (ЗУ)</span>
                            <div class="ac-form-row">
                                <label>Характер площади (межевание):</label>
                                <select id="ac-zu-area-type" class="ac-select">
                                    <option value="">(Все участки)</option>
                                    <option value="specified">Уточненная (с границами)</option>
                                    <option value="declared">Декларированная (без границ)</option>
                                </select>
                            </div>
                            <div class="ac-form-row">
                                <label>Категория земель:</label>
                                <select id="ac-zu-category" class="ac-select">
                                    <option value="">(Любая категория)</option>
                                    <option value="Земли населенных пунктов">Земли населенных пунктов</option>
                                    <option value="Земли сельскохозяйственного назначения">Земли сельхозназначения</option>
                                    <option value="Земли промышленности">Земли промышленности и транспорта</option>
                                    <option value="Земли лесного фонда">Земли лесного фонда</option>
                                    <option value="Земли водного фонда">Земли водного фонда</option>
                                </select>
                            </div>
                            <div class="ac-form-row">
                                <label>Разрешенное использование (ВРИ):</label>
                                <input type="text" id="ac-zu-vri" class="ac-input-text" placeholder="ИЖС, ЛПХ, магазин, сквер...">
                            </div>
                        </div>

                        <!-- Параметры зданий (ОКС) -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title"><i class="fas fa-building"></i> Параметры зданий (ОКС)</span>
                            <div class="ac-form-row">
                                <label>Вид объекта:</label>
                                <select id="ac-oks-kind" class="ac-select">
                                    <option value="">(Любой)</option>
                                    <option value="Здание">Здание</option>
                                    <option value="Помещение">Помещение</option>
                                    <option value="Сооружение">Сооружение</option>
                                </select>
                            </div>
                            <div class="ac-form-row">
                                <label>Назначение здания:</label>
                                <input type="text" id="ac-oks-purpose" class="ac-input-text" placeholder="Жилой дом, Нежилое, МКД...">
                            </div>
                            <div class="ac-form-row">
                                <label>Наименование:</label>
                                <input type="text" id="ac-oks-name" class="ac-input-text" placeholder="Школа, склад, гараж...">
                            </div>
                            <div class="ac-form-row">
                                <label>Этажность:</label>
                                <div class="ac-range-row">
                                    <input type="number" id="ac-floors-min" class="ac-input-text" placeholder="От эт." min="1">
                                    <input type="number" id="ac-floors-max" class="ac-input-text" placeholder="До эт." min="1">
                                </div>
                            </div>
                            <div class="ac-form-row">
                                <label>Материал стен:</label>
                                <input type="text" id="ac-materials" class="ac-input-text" placeholder="Кирпич, дерево, монолит...">
                            </div>
                        </div>

                        <!-- Площадь и стоимость -->
                        <div class="ac-filter-group">
                            <span class="ac-filter-title"><i class="fas fa-ruble-sign"></i> Площадь и стоимость</span>
                            <div class="ac-form-row">
                                <label>Площадь (м²):</label>
                                <div class="ac-range-row">
                                    <input type="number" id="ac-area-min" class="ac-input-text" placeholder="От м²">
                                    <input type="number" id="ac-area-max" class="ac-input-text" placeholder="До м²">
                                </div>
                            </div>
                            <div class="ac-form-row">
                                <label>Кадастровая стоимость (₽):</label>
                                <div class="ac-range-row">
                                    <input type="number" id="ac-cost-min" class="ac-input-text" placeholder="От руб.">
                                    <input type="number" id="ac-cost-max" class="ac-input-text" placeholder="До руб.">
                                </div>
                            </div>
                        </div>

                        <!-- Блок ИИ перемещен в самый низ -->
                        <div class="ac-ai-box" style="flex-shrink: 0; margin-top: 4px;">
                            <h4><i class="fas fa-sparkles" style="color: #2563eb;"></i> ИИ-Аналитик (Запрос на русском)</h4>
                            <textarea id="ac-ai-text" class="ac-ai-input" placeholder=""></textarea>
                            <button id="ac-ai-submit" class="ac-btn-ai">
                                <i class="fas fa-wand-magic-sparkles"></i> Сформировать фильтр ИИ
                            </button>
                        </div>

                        <div class="ac-sidebar-footer">
                            <button id="ac-btn-execute" class="ac-btn-run">
                                <i class="fas fa-bolt"></i> Сформировать
                            </button>
                            <button id="ac-btn-reset" class="ac-btn-reset" title="Сбросить все критерии">
                                <i class="fas fa-rotate-left"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Рабочая область -->
                    <div class="ac-main">
                        <div class="ac-tabs-bar">
                            <div class="ac-tabs">
                                <button class="ac-tab-btn active" data-tab="summary"><i class="fas fa-chart-pie"></i> Сводка и KPI</button>
                                <button class="ac-tab-btn" data-tab="charts"><i class="fas fa-chart-column"></i> Распределения и аналитика</button>
                                <button class="ac-tab-btn" data-tab="treemap"><i class="fas fa-table-cells-large"></i> Плиточная карта</button>
                                <button class="ac-tab-btn" data-tab="table"><i class="fas fa-list-check"></i> Реестр объектов</button>
                            </div>
                            <div class="ac-actions">
                                <button class="ac-action-btn" id="ac-btn-map" title="Отобразить найденную выборку на карте">
                                    <i class="fas fa-map-location-dot" style="color:#0284c7;"></i> На карту
                                </button>
                                <button class="ac-action-btn" id="ac-btn-xlsx" title="Скачать таблицу в Excel">
                                    <i class="fas fa-file-excel" style="color:#16a34a;"></i> Excel
                                </button>
                                <button class="ac-action-btn" id="ac-btn-geojson" title="Скачать GeoJSON">
                                    <i class="fas fa-file-code" style="color:#ea580c;"></i> GeoJSON
                                </button>
                            </div>
                        </div>

                        <div class="ac-content-view" id="ac-content-view">
                            <div style="text-align: center; color: #94a3b8; padding-top: 120px;">
                                <i class="fas fa-database" style="font-size: 3.2rem; margin-bottom: 14px; color: #cbd5e1;"></i>
                                <div style="font-size: 1.1rem; font-weight: 700; color: #475569;">Задайте критерии поиска или отправьте текстовый запрос ИИ</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(analyticsModal);

        // Автоматический ресайз графиков при изменении размера контейнера
        const contentViewEl = document.getElementById('ac-content-view');
        if (typeof ResizeObserver !== 'undefined' && contentViewEl) {
            resizeObserver = new ResizeObserver(() => {
                currentChartInstances.forEach(c => {
                    try { c.resize(); } catch (e) {}
                });
            });
            resizeObserver.observe(contentViewEl);
        }

        // Закрытие по крестику
        analyticsModal.querySelector('#ac-close-btn').onclick = () => {
            analyticsModal.style.display = 'none';
        };

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
        document.getElementById('ac-btn-reset').onclick = () => resetAllFilters(initialPrefix, lat, lon);
        document.getElementById('ac-ai-submit').onclick = processAiQuery;
        document.getElementById('ac-btn-map').onclick = showResultsOnMainMap;
        document.getElementById('ac-btn-xlsx').onclick = exportToExcel;
        document.getElementById('ac-btn-geojson').onclick = exportToGeoJSON;

        runAnalyticsQuery(lat, lon);
    };

    // Сброс всех фильтров
  // Сброс всех фильтров
    function resetAllFilters(defaultCadValue, lat, lon) {
        document.getElementById('ac-ai-text').value = '';
        document.getElementById('ac-spatial-type').value = 'map_objects';
        document.getElementById('ac-radius-wrap').style.display = 'none';
        document.getElementById('ac-cadnum-search').value = defaultCadValue;
        document.getElementById('ac-address-search').value = '';
        document.getElementById('ac-exact-match').checked = false;
        document.getElementById('ac-type-zu').checked = true;
        document.getElementById('ac-type-oks').checked = true;
        document.getElementById('ac-type-str').checked = false;
        document.getElementById('ac-type-zones').checked = false;
        document.getElementById('ac-ownership-type').value = '';
        document.getElementById('ac-right-type').value = '';
        document.getElementById('ac-status-val').value = '';
        document.getElementById('ac-zu-area-type').value = '';
        document.getElementById('ac-zu-category').value = '';
        document.getElementById('ac-zu-vri').value = '';
        document.getElementById('ac-oks-kind').value = '';
        document.getElementById('ac-oks-purpose').value = '';
        document.getElementById('ac-oks-name').value = '';
        document.getElementById('ac-floors-min').value = '';
        document.getElementById('ac-floors-max').value = '';
        document.getElementById('ac-materials').value = '';
        document.getElementById('ac-area-min').value = '';
        document.getElementById('ac-area-max').value = '';
        document.getElementById('ac-cost-min').value = '';
        document.getElementById('ac-cost-max').value = '';
        tableSearchTerm = '';
        tableSortField = 'default';
        runAnalyticsQuery(lat, lon);
    }

    // Сбор параметров фильтрации
    function collectFilterPayload(clickLat, clickLon, isMapObjectsMode = false) {
        const spatialType = document.getElementById('ac-spatial-type').value;
        const cad = document.getElementById('ac-cadnum-search').value.trim();

        const hasValidCadPrefix = /^\d{2}:\d{2}/.test(cad);

        if (!isMapObjectsMode && !hasValidCadPrefix && spatialType === 'all') {
            const defPrefix = getDefaultCadastralPrefix();
            alert(`Для выборки по всей базе необходимо указать как минимум код региона и района (например: ${defPrefix}01:).`);
            document.getElementById('ac-cadnum-search').focus();
            return null;
        }

        const payload = {
            tables: [],
            filters: {
                exact_match: document.getElementById('ac-exact-match').checked
            }
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

        if (cad) payload.filters.cad_num = cad;

        const addr = document.getElementById('ac-address-search').value.trim();
        if (addr) payload.filters.address = addr;

        const own = document.getElementById('ac-ownership-type').value;
        if (own) payload.filters.ownership = own;

        const right = document.getElementById('ac-right-type').value.trim();
        if (right) payload.filters.right_type = right;

        const status = document.getElementById('ac-status-val').value;
        if (status) payload.filters.status = status;

        const zuAreaType = document.getElementById('ac-zu-area-type').value;
        if (zuAreaType) payload.filters.zu_area_type = zuAreaType;

        const zuCat = document.getElementById('ac-zu-category').value;
        if (zuCat) payload.filters.zu_category = zuCat;

        const zuVri = document.getElementById('ac-zu-vri').value.trim();
        if (zuVri) payload.filters.zu_vri = zuVri;

        const oksKind = document.getElementById('ac-oks-kind').value;
        if (oksKind) payload.filters.oks_kind = oksKind;

        const oksPurpose = document.getElementById('ac-oks-purpose').value.trim();
        if (oksPurpose) payload.filters.oks_purpose = oksPurpose;

        const oksName = document.getElementById('ac-oks-name').value.trim();
        if (oksName) payload.filters.oks_name = oksName;

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

        return payload;
    }

   

    // ИИ-парсер запроса
    async function processAiQuery() {
        const inputEl = document.getElementById('ac-ai-text');
        const queryText = inputEl.value.trim();
        if (!queryText) return;

        const submitBtn = document.getElementById('ac-ai-submit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Преобразование запроса...';

        const systemPrompt = `
Ты — аналитический транслятор естественного языка в структурированный фильтр базы данных объектов недвижимости.
Пользователь передаст запрос на русском языке. Верни ТОЛЬКО валидный JSON без комментариев и markdown-тегов:
{
  "address": "строка адреса или пусто",
  "cad_num": "кадастровый номер или маска (мин. 4 цифры) или пусто",
  "floors_min": число или null,
  "floors_max": число или null,
  "area_min": число или null,
  "area_max": число или null,
  "cost_min": число или null,
  "cost_max": число или null,
  "materials": "материал стен или пусто",
  "purpose": "назначение здания или пусто",
  "zu_vri": "разрешенное использование участка или пусто",
  "ownership": "Частная, Муниципальная, Государственная или пусто",
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

            if (parsed.address !== undefined) document.getElementById('ac-address-search').value = parsed.address || '';
            if (parsed.cad_num) document.getElementById('ac-cadnum-search').value = parsed.cad_num;
            if (parsed.floors_min !== undefined) document.getElementById('ac-floors-min').value = parsed.floors_min || '';
            if (parsed.floors_max !== undefined) document.getElementById('ac-floors-max').value = parsed.floors_max || '';
            if (parsed.area_min !== undefined) document.getElementById('ac-area-min').value = parsed.area_min || '';
            if (parsed.area_max !== undefined) document.getElementById('ac-area-max').value = parsed.area_max || '';
            if (parsed.cost_min !== undefined) document.getElementById('ac-cost-min').value = parsed.cost_min || '';
            if (parsed.cost_max !== undefined) document.getElementById('ac-cost-max').value = parsed.cost_max || '';
            if (parsed.materials !== undefined) document.getElementById('ac-materials').value = parsed.materials || '';
            if (parsed.purpose !== undefined) document.getElementById('ac-oks-purpose').value = parsed.purpose || '';
            if (parsed.zu_vri !== undefined) document.getElementById('ac-zu-vri').value = parsed.zu_vri || '';
            if (parsed.ownership !== undefined) document.getElementById('ac-ownership-type').value = parsed.ownership || '';

            if (Array.isArray(parsed.types) && parsed.types.length > 0) {
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
            submitBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Сформировать фильтр ИИ';
        }
    }

    // Отображение активной вкладки
    function renderActiveTabContent() {
        const container = document.getElementById('ac-content-view');
        if (!container) return;

        currentChartInstances.forEach(c => c.dispose());
        currentChartInstances = [];

        if (!lastQueryResults || !lastQueryResults.summary) {
            container.innerHTML = '<div style="padding:50px;text-align:center;color:#64748b;font-weight:600;">Нет данных для отображения</div>';
            return;
        }

        const s = lastQueryResults.summary;
        const features = lastQueryResults.features || [];
        const cs = lastQueryResults._clientStats || computeClientStats(features);

        const geomPercent = features.length > 0 ? Math.round((cs.withGeom / features.length) * 100) : 0;
        const totalZu = cs.zuSpecified + cs.zuDeclared;
        const zuSpecPercent = totalZu > 0 ? Math.round((cs.zuSpecified / totalZu) * 100) : 0;

        if (activeTab === 'summary') {
            container.innerHTML = `
                <div class="ac-kpi-grid">
                    <div class="ac-kpi-card">
                        <div class="ac-kpi-info">
                            <span>Всего объектов</span>
                            <strong>${(s.total_count || 0).toLocaleString('ru-RU')}</strong>
                            <div class="ac-kpi-sub">ЗУ: ${s.count_zu || 0} • ОКС: ${s.count_oks || 0}</div>
                        </div>
                        <div class="ac-kpi-icon" style="background:#eff6ff; color:#2563eb;"><i class="fas fa-cubes"></i></div>
                    </div>

                    <div class="ac-kpi-card">
                        <div class="ac-kpi-info">
                            <span>Суммарная площадь</span>
                            <strong>${Math.round(s.total_area || 0).toLocaleString('ru-RU')} м²</strong>
                            <div class="ac-kpi-sub">≈ ${((s.total_area || 0) / 10000).toFixed(2)} га</div>
                        </div>
                        <div class="ac-kpi-icon" style="background:#ecfdf5; color:#10b981;"><i class="fas fa-ruler-combined"></i></div>
                    </div>

                    <div class="ac-kpi-card">
                        <div class="ac-kpi-info">
                            <span>Кадастровая стоимость</span>
                            <strong>${Math.round(s.total_cost || 0).toLocaleString('ru-RU')} ₽</strong>
                            <div class="ac-kpi-sub">Суммарная база оценки</div>
                        </div>
                        <div class="ac-kpi-icon" style="background:#fffbeb; color:#d97706;"><i class="fas fa-sack-dollar"></i></div>
                    </div>

                    <div class="ac-kpi-card">
                        <div class="ac-kpi-info">
                            <span>УПКС (Средний / Медиана)</span>
                            <strong>${Math.round(s.avg_upks || 0).toLocaleString('ru-RU')} ₽/м²</strong>
                            <div class="ac-kpi-sub">Медиана: ${Math.round(cs.medianUpks).toLocaleString('ru-RU')} ₽/м²</div>
                        </div>
                        <div class="ac-kpi-icon" style="background:#f5f3ff; color:#7c3aed;"><i class="fas fa-scale-unbalanced"></i></div>
                    </div>

                    <div class="ac-kpi-card">
                        <div class="ac-kpi-info">
                            <span>Координаты и межевание</span>
                            <strong>${geomPercent}% с границами</strong>
                            <div class="ac-kpi-sub">Межевание ЗУ: ${zuSpecPercent}% (${cs.zuSpecified} из ${totalZu})</div>
                        </div>
                        <div class="ac-kpi-icon" style="background:#ecfeff; color:#0891b2;"><i class="fas fa-draw-polygon"></i></div>
                    </div>
                </div>

                <div class="ac-insights-bar">
                    <span style="font-size:0.78rem; font-weight:800; color:#0284c7; text-transform:uppercase;">
                        <i class="fas fa-lightbulb"></i> Экспресс-аналитика:
                    </span>
                    <span class="ac-insight-pill">Мин. УПКС: <b>${Math.round(cs.minUpks).toLocaleString('ru-RU')} ₽/м²</b></span>
                    <span class="ac-insight-pill">Макс. УПКС: <b>${Math.round(cs.maxUpks).toLocaleString('ru-RU')} ₽/м²</b></span>
                    <span class="ac-insight-pill">С контуром: <b style="color:#16a34a;">${cs.withGeom}</b> / Без контура: <b style="color:#dc2626;">${cs.withoutGeom}</b></span>
                    <span class="ac-insight-pill">Декларированных ЗУ: <b style="color:#d97706;">${cs.zuDeclared}</b></span>
                </div>

                <div class="ac-charts-grid-3">
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-types"></div></div>
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-ownership"></div></div>
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-geom-quality"></div></div>
                </div>
            `;

            // 1. Состав выборки по типам
            const chart1 = echarts.init(document.getElementById('ac-chart-types'));
            chart1.setOption({
                title: { text: 'Состав выборки по типам объектов', left: 'center', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> ({d}%)' },
                legend: { bottom: 0, textStyle: { fontSize: 11 } },
                series: [{
                    type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'],
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    data: [
                        { name: 'Земельные участки', value: s.count_zu || 0, itemStyle: { color: '#10b981' } },
                        { name: 'Здания (ОКС)', value: s.count_oks || 0, itemStyle: { color: '#0284c7' } },
                        { name: 'Сооружения', value: s.count_str || 0, itemStyle: { color: '#f97316' } },
                        { name: 'Зоны и границы', value: s.count_zones || 0, itemStyle: { color: '#8b5cf6' } }
                    ].filter(d => d.value > 0)
                }]
            });
            currentChartInstances.push(chart1);

            // 2. Формы собственности
            const ownData = Object.entries(s.ownership_dist || {}).map(([name, value]) => ({ name, value }));
            const chart2 = echarts.init(document.getElementById('ac-chart-ownership'));
            chart2.setOption({
                title: { text: 'Распределение по формам собственности', left: 'center', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> ({d}%)' },
                legend: { bottom: 0, textStyle: { fontSize: 11 } },
                color: ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#94a3b8'],
                series: [{
                    type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'],
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    data: ownData.length ? ownData : [{ name: 'Не указано', value: features.length }]
                }]
            });
            currentChartInstances.push(chart2);

            // 3. Качество геоданных и межевания (НОВЫЙ ГРАФИК)
          // 3. Качество геоданных и межевания
            const chart3 = echarts.init(document.getElementById('ac-chart-geom-quality'));
            chart3.setOption({
                title: { text: 'Качество границ и межевания', left: 'center', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: { trigger: 'item', formatter: '{b}: <b>{c} шт.</b> ({d}%)' },
                legend: { bottom: 0, textStyle: { fontSize: 11 } },
                series: [{
                    type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'],
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    data: [
                        { name: 'Уточненные ЗУ', value: cs.zuSpecified, itemStyle: { color: '#059669' } },
                        { name: 'Декларированные ЗУ', value: cs.zuDeclared, itemStyle: { color: '#ef4444' } },
                        { name: 'ОКС / Сооружения с контуром', value: cs.oksWithGeom, itemStyle: { color: '#0284c7' } },
                        { name: 'ОКС без контура', value: cs.oksWithoutGeom, itemStyle: { color: '#cbd5e1' } }
                    ].filter(d => d.value > 0)
                }]
            });
            currentChartInstances.push(chart3);

        } else if (activeTab === 'charts') {
            container.innerHTML = `
                <div class="ac-charts-grid">
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-floors"></div></div>
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-cost-brackets"></div></div>
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-materials"></div></div>
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-years"></div></div>
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-vri"></div></div>
                    <div class="ac-chart-card"><div class="ac-chart-container" id="ac-chart-scatter"></div></div>
                </div>
            `;

            // 1. Этажность
            const cFloors = echarts.init(document.getElementById('ac-chart-floors'));
            const floorsEntries = Object.entries(s.floors_dist || {}).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
            cFloors.setOption({
                title: { text: 'Распределение зданий по этажности', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: { trigger: 'axis' },
                grid: { left: '10%', right: '5%', bottom: '15%', top: '18%' },
                xAxis: { type: 'category', data: floorsEntries.map(e => e[0] + ' эт.') },
                yAxis: { type: 'value', minInterval: 1 },
                series: [{
                    type: 'bar',
                    data: floorsEntries.map(e => e[1]),
                    barMaxWidth: 36,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#38bdf8' },
                            { offset: 1, color: '#0284c7' }
                        ]),
                        borderRadius: [5, 5, 0, 0]
                    }
                }]
            });
            currentChartInstances.push(cFloors);

            // 2. Ценовые диапазоны
            const cCost = echarts.init(document.getElementById('ac-chart-cost-brackets'));
            const costEntries = Object.entries(s.cost_brackets || {});
            cCost.setOption({
                title: { text: 'Ценовые диапазоны (кадастровая стоимость)', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: { trigger: 'axis' },
                grid: { left: '10%', right: '5%', bottom: '20%', top: '18%' },
                xAxis: { type: 'category', data: costEntries.map(e => e[0]), axisLabel: { interval: 0, rotate: 14, fontSize: 11 } },
                yAxis: { type: 'value', minInterval: 1 },
                series: [{
                    type: 'bar',
                    data: costEntries.map(e => e[1]),
                    barMaxWidth: 38,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#34d399' },
                            { offset: 1, color: '#059669' }
                        ]),
                        borderRadius: [5, 5, 0, 0]
                    }
                }]
            });
            currentChartInstances.push(cCost);

            // 3. Материалы стен
            const cMat = echarts.init(document.getElementById('ac-chart-materials'));
            const matEntries = Object.entries(s.materials_dist || {}).slice(0, 7);
            cMat.setOption({
                title: { text: 'Основные материалы наружных стен', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> ({d}%)' },
                series: [{
                    type: 'pie', radius: ['35%', '65%'],
                    itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
                    data: matEntries.map(e => ({ name: e[0], value: e[1] }))
                }]
            });
            currentChartInstances.push(cMat);

            // 4. Года постройки: Хронологический ряд с динамическим зумом
            const cYears = echarts.init(document.getElementById('ac-chart-years'));
            const yearCounts = {};
            features.forEach(f => {
                const y = parseInt(f.properties?.options?.year_built || f.properties?.options?.params_year_built, 10);
                if (y && y >= 1850 && y <= 2035) {
                    yearCounts[y] = (yearCounts[y] || 0) + 1;
                }
            });

            const uniqueYears = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
            let xYears = [];
            let yYearsCount = [];

            if (uniqueYears.length > 0) {
                const minYear = uniqueYears[0];
                const maxYear = uniqueYears[uniqueYears.length - 1];
                for (let y = minYear; y <= maxYear; y++) {
                    xYears.push(y);
                    yYearsCount.push(yearCounts[y] || 0);
                }
            }

            cYears.setOption({
                title: { text: 'Динамика застройки по годам ввода', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: {
                    trigger: 'axis',
                    formatter: (params) => {
                        const item = params[0];
                        return item ? `<b>${item.name} год</b><br>Построено зданий: <b>${item.value} шт.</b>` : '';
                    }
                },
                grid: { left: '8%', right: '5%', bottom: '22%', top: '18%' },
                xAxis: { type: 'category', data: xYears, axisLabel: { color: '#64748b', fontSize: 10 } },
                yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f1f5f9' } } },
                dataZoom: [
                    { type: 'inside', xAxisIndex: 0 },
                    { type: 'slider', xAxisIndex: 0, bottom: 4, height: 18, borderColor: '#cbd5e1', fillerColor: 'rgba(99, 102, 241, 0.2)', handleSize: '80%' }
                ],
                series: [{
                    type: 'bar',
                    data: yYearsCount,
                    barMaxWidth: 14,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#8b5cf6' },
                            { offset: 1, color: '#6366f1' }
                        ]),
                        borderRadius: [3, 3, 0, 0]
                    }
                }]
            });
            currentChartInstances.push(cYears);

            // 5. ТОП-10 Видов разрешенного использования / назначений (НОВЫЙ ГРАФИК)
            const cVri = echarts.init(document.getElementById('ac-chart-vri'));
            const vriReversed = [...cs.topVri].reverse();
            cVri.setOption({
                title: { text: 'ТОП-10 видов использования и назначения', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                grid: { left: '38%', right: '8%', bottom: '10%', top: '16%' },
                xAxis: { type: 'value', minInterval: 1 },
                yAxis: {
                    type: 'category',
                    data: vriReversed.map(item => item[0]),
                    axisLabel: { fontSize: 10, color: '#334155', width: 150, overflow: 'truncate' }
                },
                series: [{
                    type: 'bar',
                    data: vriReversed.map(item => item[1]),
                    barMaxWidth: 20,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                            { offset: 0, color: '#0ea5e9' },
                            { offset: 1, color: '#2563eb' }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    }
                }]
            });
            currentChartInstances.push(cVri);

            // 6. Диаграмма рассеяния: Площадь vs Кадастровая стоимость (НОВЫЙ ГРАФИК)
            const cScatter = echarts.init(document.getElementById('ac-chart-scatter'));
            cScatter.setOption({
                title: { text: 'Корреляция: Площадь vs Стоимость (клик — паспорт)', textStyle: { fontSize: 13, fontWeight: 700, color: '#1e293b' } },
                tooltip: {
                    trigger: 'item',
                    formatter: (p) => {
                        const d = p.data;
                        if (!d) return '';
                        const upks = d.value[0] > 0 ? Math.round(d.value[1] / d.value[0]) : 0;
                        return `<b>${d.id}</b><br/>Площадь: <b>${d.value[0].toLocaleString('ru-RU')} м²</b><br/>Стоимость: <b>${d.value[1].toLocaleString('ru-RU')} ₽</b><br/>УПКС: <b>${upks.toLocaleString('ru-RU')} ₽/м²</b>`;
                    }
                },
                grid: { left: '14%', right: '8%', bottom: '18%', top: '18%' },
                xAxis: {
                    type: 'value', name: 'Площадь (м²)', nameLocation: 'middle', nameGap: 25,
                    splitLine: { lineStyle: { color: '#f1f5f9' } },
                    axisLabel: { fontSize: 10 }
                },
                yAxis: {
                    type: 'value', name: 'Стоимость (₽)',
                    splitLine: { lineStyle: { color: '#f1f5f9' } },
                    axisLabel: {
                        fontSize: 10,
                        formatter: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v)
                    }
                },
                dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'inside', yAxisIndex: 0 }],
                series: [{
                    type: 'scatter',
                    symbolSize: 9,
                    data: cs.scatterData,
                    itemStyle: {
                        color: (params) => params.data?.type === 'zu' ? 'rgba(16, 185, 129, 0.75)' : 'rgba(37, 99, 235, 0.75)',
                        borderColor: '#ffffff',
                        borderWidth: 1
                    }
                }]
            });
            cScatter.on('click', (params) => {
                if (params.data?.raw) openObjectDetailCard(params.data.raw);
            });
            currentChartInstances.push(cScatter);

        } else if (activeTab === 'treemap') {
            container.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:0.85rem; font-weight:700; color:#334155;">
                        Иерархическая карта объектов (размер блока пропорционален выбранному показателю)
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button id="ac-tree-mode-area" class="ac-action-btn" style="${treemapMetric === 'area' ? 'background:#eff6ff; border-color:#3b82f6; color:#1d4ed8;' : ''}">
                            <i class="fas fa-ruler-combined"></i> По площади (м²)
                        </button>
                        <button id="ac-tree-mode-cost" class="ac-action-btn" style="${treemapMetric === 'cost' ? 'background:#eff6ff; border-color:#3b82f6; color:#1d4ed8;' : ''}">
                            <i class="fas fa-ruble-sign"></i> По стоимости (₽)
                        </button>
                    </div>
                </div>
                <div id="ac-chart-treemap" style="width: 100%; height: calc(100% - 45px);"></div>
            `;

            document.getElementById('ac-tree-mode-area').onclick = () => {
                treemapMetric = 'area';
                renderActiveTabContent();
            };
            document.getElementById('ac-tree-mode-cost').onclick = () => {
                treemapMetric = 'cost';
                renderActiveTabContent();
            };

            const cTree = echarts.init(document.getElementById('ac-chart-treemap'));
            const palette = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4f46e5', '#0d9488', '#ea580c'];

            const treeData = features.map((f, idx) => {
                const area = getNumericArea(f);
                const cost = getNumericCost(f);
                const val = treemapMetric === 'cost' ? Math.round(cost) : Math.round(area);
                return {
                    name: f.id,
                    value: val,
                    areaVal: Math.round(area),
                    costVal: Math.round(cost),
                    raw: f,
                    itemStyle: { color: palette[idx % palette.length] }
                };
            }).filter(i => i.value > 0);

            const unitSuffix = treemapMetric === 'cost' ? '₽' : 'м²';

            cTree.setOption({
                tooltip: {
                    trigger: 'item',
                    confine: true,
                    padding: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    borderColor: '#cbd5e1',
                    borderWidth: 1,
                    extraCssText: 'box-shadow: 0 12px 32px rgba(15,23,42,0.22); border-radius: 10px; max-width: 340px; white-space: normal; line-height: 1.45;',
                    formatter: (info) => {
                        const raw = info.data?.raw;
                        if (!raw) return '';
                        const o = raw.properties?.options || {};
                        const addr = escapeHtml(o.readable_address || o.address_readable_address || 'Адрес не указан');
                        const cost = info.data.costVal ? `${info.data.costVal.toLocaleString('ru-RU')} ₽` : '-';
                        return `
                            <div style="font-size: 12px; color: #0f172a;">
                                <div style="font-weight: 800; font-size: 13px; color: #0284c7; margin-bottom: 4px;">${escapeHtml(raw.id)}</div>
                                <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">${addr}</div>
                                <div style="display: flex; justify-content: space-between; gap: 10px; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 5px;">
                                    <span>Площадь: <b>${(info.data.areaVal || 0).toLocaleString('ru-RU')} м²</b></span>
                                    <span>Стоимость: <b>${cost}</b></span>
                                </div>
                                <div style="font-size: 10px; color: #10b981; font-weight: 700; margin-top: 6px; text-align: center;">Кликните для открытия паспорта</div>
                            </div>
                        `;
                    }
                },
                series: [{
                    type: 'treemap',
                    width: '100%', height: '100%', top: 0, bottom: 0, left: 0, right: 0,
                    roam: false, nodeClick: false,
                    breadcrumb: { show: false },
                    itemStyle: {
                        borderColor: 'rgba(255,255,255,0.95)',
                        borderWidth: 1.5,
                        gapWidth: 1.5,
                        borderRadius: 4
                    },
                    label: {
                        show: true,
                        formatter: (p) => `${p.name}\n${Number(p.value).toLocaleString('ru-RU')} ${unitSuffix}`,
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#ffffff'
                    },
                    data: treeData
                }]
            });

            cTree.on('click', (params) => {
                if (params.data?.raw) openObjectDetailCard(params.data.raw);
            });

            currentChartInstances.push(cTree);

        } else if (activeTab === 'table') {
            renderTableTab(container, features, s);
        }
    }

    // Отрисовка вкладки Реестра с быстрым поиском и сортировкой
    function renderTableTab(container, allFeatures, s) {
        const BATCH_SIZE = 120;
        let renderedCount = 0;
        const isLimit = s.is_limit_reached || allFeatures.length >= 3000;

        const limitWarningBadge = isLimit
            ? `<span style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 3px 9px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
                   <i class="fas fa-triangle-exclamation"></i> Лимит выборки (3 000). Уточните фильтр.
               </span>`
            : '';

        container.innerHTML = `
            <div class="ac-table-toolbar">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.82rem; font-weight: 700; color: #334155;">
                        Показано: <b id="ac-table-rendered-count" style="color: #0284c7;">0</b> из <b id="ac-table-filtered-total">${allFeatures.length.toLocaleString('ru-RU')}</b>
                    </span>
                    ${limitWarningBadge}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <input type="text" id="ac-table-quick-search" class="ac-input-text" style="width: 230px; padding: 5px 10px;" placeholder="Быстрый фильтр по таблице..." value="${escapeHtml(tableSearchTerm)}">
                    <select id="ac-table-sort" class="ac-select" style="width: 195px; padding: 5px 10px;">
                        <option value="default" ${tableSortField === 'default' ? 'selected' : ''}>Сортировка: по умолчанию</option>
                        <option value="cost_desc" ${tableSortField === 'cost_desc' ? 'selected' : ''}>Стоимость: по убыванию</option>
                        <option value="cost_asc" ${tableSortField === 'cost_asc' ? 'selected' : ''}>Стоимость: по возрастанию</option>
                        <option value="area_desc" ${tableSortField === 'area_desc' ? 'selected' : ''}>Площадь: по убыванию</option>
                        <option value="area_asc" ${tableSortField === 'area_asc' ? 'selected' : ''}>Площадь: по возрастанию</option>
                    </select>
                </div>
            </div>
            <div id="ac-table-scroll-wrap" style="overflow-x: auto; overflow-y: auto; max-height: calc(100% - 54px);">
                <table class="ac-table">
                    <thead>
                        <tr>
                            <th style="width: 45px;">№</th>
                            <th style="width: 205px;">Кадастровый номер</th>
                            <th style="width: 85px;">Тип</th>
                            <th>Адрес / ВРИ и Назначение</th>
                            <th style="width: 115px;">Площадь</th>
                            <th style="width: 145px;">Стоимость / УПКС</th>
                            <th style="width: 135px;">Дата сведений</th>
                            <th style="width: 48px;"></th>
                        </tr>
                    </thead>
                    <tbody id="ac-table-body"></tbody>
                </table>
            </div>
        `;

        const tbody = document.getElementById('ac-table-body');
        const countEl = document.getElementById('ac-table-rendered-count');
        const totalEl = document.getElementById('ac-table-filtered-total');
        const scrollWrap = document.getElementById('ac-table-scroll-wrap');
        const quickSearchInput = document.getElementById('ac-table-quick-search');
        const sortSelect = document.getElementById('ac-table-sort');

        let filteredFeatures = [];

        function applyClientFilterAndSort() {
            const q = tableSearchTerm.trim().toLowerCase();
            const terms = q ? q.split(/\s+/).filter(Boolean) : [];

            filteredFeatures = allFeatures.filter(f => {
                if (terms.length === 0) return true;

                const o = f.properties?.options || {};
                const p = f.properties || {};
                const idStr = String(f.id || p.descr || o.cad_num || '');
                const addrStr = String(o.readable_address || o.address_readable_address || '');
                const vriStr = String(o.permitted_use_established_by_document || o.purpose || o.params_purpose || o.name || o.building_name || '');
                
                const fullSearchStr = `${idStr} ${addrStr} ${vriStr}`.toLowerCase();

                // Условие "И": каждое введенное слово через пробел должно присутствовать в строке
                return terms.every(term => fullSearchStr.includes(term));
            });

            if (tableSortField === 'cost_desc') {
                filteredFeatures.sort((a, b) => getNumericCost(b) - getNumericCost(a));
            } else if (tableSortField === 'cost_asc') {
                filteredFeatures.sort((a, b) => getNumericCost(a) - getNumericCost(b));
            } else if (tableSortField === 'area_desc') {
                filteredFeatures.sort((a, b) => getNumericArea(b) - getNumericArea(a));
            } else if (tableSortField === 'area_asc') {
                filteredFeatures.sort((a, b) => getNumericArea(a) - getNumericArea(b));
            }

            tbody.innerHTML = '';
            renderedCount = 0;
            totalEl.textContent = filteredFeatures.length.toLocaleString('ru-RU');
            renderRowsBatch();
        }

        function renderRowsBatch() {
            const nextLimit = Math.min(renderedCount + BATCH_SIZE, filteredFeatures.length);
            const fragment = document.createDocumentFragment();

            for (let i = renderedCount; i < nextLimit; i++) {
                const f = filteredFeatures[i];
                const p = f.properties || {};
                const o = p.options || {};
                const addr = escapeHtml(o.readable_address || o.address_readable_address || 'Адрес не указан');
                const subPurpose = escapeHtml(o.permitted_use_established_by_document || o.purpose || o.params_purpose || '');
                const rawArea = o.specified_area || o.build_record_area || o.params_extension || f.area || '-';
                const numArea = getNumericArea(f);
                const numCost = getNumericCost(f);
                const costStr = numCost > 0 ? numCost.toLocaleString('ru-RU') + ' ₽' : '-';
                const upksStr = (numCost > 0 && numArea > 0) ? `${Math.round(numCost / numArea).toLocaleString('ru-RU')} ₽/м²` : '';

                const badgeClass = f._layer_type === 'zu' ? 'ac-badge-zu' : (f._layer_type === 'oks' ? 'ac-badge-oks' : 'ac-badge-str');
                const typeName = f._layer_type === 'zu' ? 'Участок' : (f._layer_type === 'oks' ? 'Здание' : 'Сооружение');
                const hasGeom = hasRealBoundaries(f);
                const isDecl = isDeclaredParcel(f);

                const dateObj = getFeatureDate(f);
                let dateHtml = '-';
                if (dateObj.regDate && dateObj.dbDate) {
                    dateHtml = `<div>${escapeHtml(dateObj.regDate)}</div><div style="font-size:0.72rem; color:#64748b;" title="Дата записи в БД">БД: ${escapeHtml(dateObj.dbDate)}</div>`;
                } else if (dateObj.dbDate) {
                    dateHtml = `<div style="font-size:0.74rem; color:#64748b;">БД: ${escapeHtml(dateObj.dbDate)}</div>`;
                } else if (dateObj.regDate) {
                    dateHtml = `<div>${escapeHtml(dateObj.regDate)}</div>`;
                }

                const areaHtml = isDecl
                    ? `<span style="color: #dc2626; font-weight: 700;" title="Декларированная площадь (границы не установлены)">${escapeHtml(rawArea)} м²</span>`
                    : `<span>${rawArea !== '-' ? escapeHtml(rawArea) + ' м²' : '-'}</span>`;

                const actionHtml = hasGeom
                    ? `<button class="ac-zoom-btn" data-fid="${escapeHtml(f.id)}" title="Перейти к объекту на карте">
                           <i class="fas fa-location-crosshairs"></i>
                       </button>`
                    : `<span style="color: #cbd5e1; font-weight: bold;" title="Границы не установлены">—</span>`;

                const tr = document.createElement('tr');
                tr.className = 'ac-table-row-clickable';
                tr.innerHTML = `
                    <td style="color: #64748b; font-weight: 600;">${i + 1}</td>
                    <td style="font-weight: 700; color: #0284c7;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span>${escapeHtml(f.id)}</span>
                            ${hasGeom ? '<span title="Границы определены" style="color:#10b981;font-size:0.75rem;"><i class="fas fa-draw-polygon"></i></span>' : ''}
                        </div>
                    </td>
                    <td><span class="ac-badge-type ${badgeClass}">${typeName}</span></td>
                    <td>
                        <div style="font-weight: 500; color: #0f172a;">${addr}</div>
                        ${subPurpose ? `<div style="font-size: 0.73rem; color: #64748b; margin-top: 2px;">${subPurpose}</div>` : ''}
                    </td>
                    <td style="font-weight: 600;">${areaHtml}</td>
                    <td>
                        <div style="font-weight: 700; color: #0f172a;">${costStr}</div>
                        ${upksStr ? `<div style="font-size: 0.72rem; color: #64748b;">${upksStr}</div>` : ''}
                    </td>
                    <td style="color: #1e293b; line-height: 1.25;">${dateHtml}</td>
                    <td>${actionHtml}</td>
                `;

                tr.onclick = (e) => {
                    if (e.target.closest('.ac-zoom-btn')) return;
                    openObjectDetailCard(f);
                };

                const zoomBtn = tr.querySelector('.ac-zoom-btn');
                if (zoomBtn) {
                    zoomBtn.onclick = (e) => {
                        e.stopPropagation();
                        focusSingleFeatureOnMainMap(f);
                    };
                }

                fragment.appendChild(tr);
            }

            tbody.appendChild(fragment);
            renderedCount = nextLimit;
            countEl.textContent = renderedCount.toLocaleString('ru-RU');
        }

        quickSearchInput.oninput = (e) => {
            tableSearchTerm = e.target.value;
            applyClientFilterAndSort();
        };

        sortSelect.onchange = (e) => {
            tableSortField = e.target.value;
            applyClientFilterAndSort();
        };

        scrollWrap.addEventListener('scroll', () => {
            if (renderedCount < filteredFeatures.length) {
                if (scrollWrap.scrollTop + scrollWrap.clientHeight >= scrollWrap.scrollHeight - 140) {
                    renderRowsBatch();
                }
            }
        });

        applyClientFilterAndSort();
    }

    // Открытие детальной карточки объекта с панорамой Google Улиц и кнопкой перехода
    function openObjectDetailCard(feature) {
        const existingCard = document.getElementById('ac-object-card-overlay');
        if (existingCard) existingCard.remove();

        const p = feature.properties || {};
        const o = p.options || {};
        const cn = feature.id || p.descr || 'Без номера';
        const typeName = feature._layer_type === 'zu' ? 'Земельный участок' : (feature._layer_type === 'oks' ? 'Здание (ОКС)' : 'Сооружение');
        const hasGeom = hasRealBoundaries(feature);

        const center = getFeatureCenterWgs(feature);
        const streetViewUrl = center
            ? `https://maps.google.com/maps?layer=c&cbll=${center.lat},${center.lon}&cbp=12,0,0,0,0&output=svembed`
            : null;

        const cardOverlay = document.createElement('div');
        cardOverlay.id = 'ac-object-card-overlay';
        cardOverlay.className = 'ac-card-overlay';

        let propRows = '';
        const addRow = (label, val) => {
            if (val !== null && val !== undefined && String(val).trim() !== '' && String(val).trim() !== '-' && String(val).trim() !== 'null') {
                propRows += `<tr><td>${escapeHtml(label)}:</td><td>${escapeHtml(val)}</td></tr>`;
            }
        };

        const areaNum = getNumericArea(feature);
        const costNum = getNumericCost(feature);
        const calcUpks = (areaNum > 0 && costNum > 0) ? `${Math.round(costNum / areaNum).toLocaleString('ru-RU')} ₽/м²` : null;

        addRow('Кадастровый номер', cn);
        addRow('Тип объекта', typeName);
        const dateInfo = getFeatureDate(feature);
        if (dateInfo.regDate) addRow('Дата внесения сведений', dateInfo.regDate);
        if (dateInfo.dbDate) addRow('Дата записи в базу данных', dateInfo.dbDate);
        addRow('Адрес', o.readable_address || o.address_readable_address);
        addRow('Площадь / Протяженность', o.specified_area || o.build_record_area || o.params_extension || feature.area);
        addRow('Характер границ', hasGeom ? 'Границы установлены (координаты в базе)' : 'Без координат границ (декларированный)');
        addRow('Кадастровая стоимость', o.cost_value ? `${Number(o.cost_value).toLocaleString('ru-RU')} ₽` : null);
        addRow('УПКС', o.cost_index ? `${Number(o.cost_index).toLocaleString('ru-RU')} ₽/м²` : calcUpks);
        addRow('Форма собственности', o.ownership_type);
        addRow('Вид права', o.right_type);
        addRow('Статус записи', o.status);
        addRow('Назначение', o.purpose || o.params_purpose);
        addRow('Наименование', o.name || o.building_name || o.params_name);
        addRow('Этажность', o.floors);
        addRow('Материал стен', o.materials);
        addRow('Год постройки', o.year_built || o.params_year_built);
        addRow('Категория земель', o.land_record_category_type);
        addRow('Разрешенное использование', o.permitted_use_established_by_document);

        const zoomBtnHtml = hasGeom
            ? `<button class="ac-card-btn" id="ac-card-btn-zoom" style="background:linear-gradient(135deg, #0284c7, #2563eb); color:#fff; box-shadow:0 4px 12px rgba(2,132,199,0.25);">
                   <i class="fas fa-location-crosshairs"></i> Показать контур на карте
               </button>`
            : '';

        cardOverlay.innerHTML = `
            <div class="ac-card-window">
                <div class="ac-card-header">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <span style="font-weight:800; font-size:1.15rem; color:#0f172a;">${escapeHtml(cn)}</span>
                        <button id="ac-copy-cn-btn" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:3px 8px; font-size:0.74rem; font-weight:600; color:#334155; cursor:pointer;" title="Скопировать номер">
                            <i class="fas fa-copy"></i> Копировать
                        </button>
                        <span style="background:#e0f2fe; color:#0369a1; font-size:0.75rem; font-weight:700; padding:3px 9px; border-radius:6px;">${typeName}</span>
                    </div>
                    <button class="ac-close-btn" id="ac-card-close">&times;</button>
                </div>
                <div class="ac-card-body">
                    <div style="overflow-y:auto; max-height:480px; padding-right:8px;">
                        <table class="ac-card-prop-table">
                            <tbody>${propRows}</tbody>
                        </table>
                    </div>

                    <div class="ac-card-right-panel">
                        <div class="ac-streetview-box">
                            ${streetViewUrl
                                ? `<iframe src="${streetViewUrl}" style="width:100%;height:100%;border:none;" allowfullscreen></iframe>`
                                : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:0.85rem;">Координаты для панорамы не определены</div>`
                            }
                        </div>
                        <button class="ac-card-btn ac-btn-egrn" id="ac-card-btn-egrn">
                            <i class="fas fa-file-shield"></i> Проверить актуальные данные (ЕГРН)
                        </button>
                        ${zoomBtnHtml}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(cardOverlay);

        const closeCard = () => cardOverlay.remove();
        cardOverlay.querySelector('#ac-card-close').onclick = closeCard;
        cardOverlay.onclick = (e) => {
            if (e.target === cardOverlay) closeCard();
        };

        const copyBtn = cardOverlay.querySelector('#ac-copy-cn-btn');
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(cn);
                copyBtn.innerHTML = '<i class="fas fa-check" style="color:#16a34a;"></i> Скопировано';
                setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Копировать'; }, 1500);
            } catch (e) {}
        };

        cardOverlay.querySelector('#ac-card-btn-egrn').onclick = async () => {
            try { await navigator.clipboard.writeText(cn); } catch (err) {}
            window.open('egrn.html', '_blank');
        };

        const zoomBtn = cardOverlay.querySelector('#ac-card-btn-zoom');
        if (zoomBtn) {
            zoomBtn.onclick = () => {
                closeCard();
                focusSingleFeatureOnMainMap(feature);
            };
        }
    }

    // Фокус на конкретном одном объекте из таблицы
    function focusSingleFeatureOnMainMap(feature) {
        const activeMap = getActiveMap();
        if (!feature || !activeMap) return;

        if (analyticsModal) {
            analyticsModal.style.display = 'none';
        }

        if (feature._layer_type === 'zu' && typeof processAndDrawParcels === 'function') {
            processAndDrawParcels([feature], 'areaSearch', true);
        } else if (feature._layer_type === 'oks' && typeof processAndDrawBuildings === 'function') {
            processAndDrawBuildings([feature]);
        } else if (feature._layer_type === 'structure' && typeof processAndDrawStructures === 'function') {
            processAndDrawStructures([feature]);
        }

        const yandexRings = convertFeatureToYandexCoords(feature);
        if (yandexRings && yandexRings.length > 0) {
            let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
            yandexRings.forEach(ring => {
                ring.forEach(pt => {
                    minLat = Math.min(minLat, pt[0]);
                    maxLat = Math.max(maxLat, pt[0]);
                    minLon = Math.min(minLon, pt[1]);
                    maxLon = Math.max(maxLon, pt[1]);
                });
            });

            if (isFinite(minLat)) {
                const latPad = Math.max((maxLat - minLat) * 0.35, 0.0008);
                const lonPad = Math.max((maxLon - minLon) * 0.35, 0.0008);
                const viewBounds = [
                    [minLat - latPad, minLon - lonPad],
                    [maxLat + latPad, maxLon + lonPad]
                ];
                activeMap.setBounds(viewBounds, { checkZoomRange: true, duration: 400 });
            }
        }

        setTimeout(() => {
            const targetPolygon = (typeof polygons !== 'undefined' ? polygons : []).find(p =>
                p.properties && (p.properties.get('cadastralNumber') === feature.id || p.properties.get('descr') === feature.id)
            );
            if (targetPolygon && targetPolygon.options) {
                const oldFill = targetPolygon.options.get('fillColor');
                const oldStroke = targetPolygon.options.get('strokeColor');
                const oldWidth = targetPolygon.options.get('strokeWidth');

                targetPolygon.options.set({
                    fillColor: '#FFFF00A6',
                    strokeColor: '#FF0000',
                    strokeWidth: 4
                });

                setTimeout(() => {
                    targetPolygon.options.set({
                        fillColor: oldFill,
                        strokeColor: oldStroke,
                        strokeWidth: oldWidth
                    });
                }, 2000);
            }
        }, 200);

        if (typeof showNotification === 'function') {
            showNotification(`Фокус на объекте: ${feature.id}`, 'success');
        }
    }

    // Перенос выборки на главную карту
    function showResultsOnMainMap() {
        const activeMap = getActiveMap();
        if (!lastQueryResults?.features?.length || !activeMap) {
            alert('Нет объектов для переноса на карту или карта не готова');
            return;
        }

        const allFeatures = lastQueryResults.features;
        const totalCount = allFeatures.length;

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

    // Диалог подтверждения объема
    function promptLargeVolumeConfirmation(totalCount, callback) {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'ac-confirm-dialog-overlay';

        dialogOverlay.innerHTML = `
            <div class="ac-confirm-dialog">
                <div class="ac-confirm-icon">
                    <i class="fas fa-triangle-exclamation"></i>
                </div>
                <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 1.2rem; font-weight: 800;">Большой объем геоданных</h3>
                <div style="font-size: 0.95rem; font-weight: 700; color: #0284c7; margin-bottom: 8px;">
                    Найдено объектов: ${totalCount.toLocaleString('ru-RU')} шт.
                </div>
                <p style="font-size: 0.85rem; color: #64748b; margin: 0 0 18px 0; line-height: 1.45;">
                    Отрисовка более ${SAFE_MAP_OBJECT_LIMIT} полигонов одновременно может снизить плавность карты. Как поступить?
                </p>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="ac-confirm-first" style="padding: 11px; border-radius: 10px; border: none; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 700; cursor: pointer;">
                        Нанести первые ${SAFE_MAP_OBJECT_LIMIT} объектов (Рекомендуется)
                    </button>
                    <button id="ac-confirm-all" style="padding: 10px; border-radius: 10px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; font-weight: 600; cursor: pointer;">
                        Нанести весь объем (${totalCount.toLocaleString('ru-RU')} шт.)
                    </button>
                    <button id="ac-confirm-cancel" style="padding: 8px; border-radius: 10px; border: none; background: transparent; color: #ef4444; font-weight: 700; cursor: pointer;">
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

    // Выполнение отрисовки выборки
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
            analyticsModal.style.display = 'none';
        }

        if (typeof showNotification === 'function') {
            showNotification(`На карту нанесено объектов: ${countDrawn}`, 'success');
        }
    }

    // Выгрузка в Excel (с исправлением дат и автошириной колонок)
    async function exportToExcel() {
        if (!lastQueryResults?.features?.length) {
            alert('Нет данных для выгрузки в Excel');
            return;
        }
        await ensureXlsx();

        const headers = [
            "Кадастровый номер",
            "Тип объекта",
            "Адрес",
            "Площадь / Длина",
            "Кадастровая стоимость (₽)",
            "УПКС (₽/м²)",
            "Дата регистрации",
            "Дата обновления БД",
            "Наличие границ",
            "ВРИ / Назначение",
            "Форма собственности",
            "Вид права",
            "Статус",
            "Этажность",
            "Материал стен",
            "Год постройки"
        ];
        const rows = [headers];

        lastQueryResults.features.forEach(f => {
            const o = f.properties?.options || {};
            const dateObj = getFeatureDate(f);
            const areaVal = getNumericArea(f);
            const costVal = getNumericCost(f);
            const upksVal = (areaVal > 0 && costVal > 0) ? Math.round(costVal / areaVal) : (o.cost_index || '');

            rows.push([
                f.id || '',
                f._layer_type === 'zu' ? 'Земельный участок' : (f._layer_type === 'oks' ? 'Здание' : 'Сооружение'),
                o.readable_address || o.address_readable_address || '',
                areaVal || o.specified_area || o.build_record_area || '',
                costVal || '',
                upksVal,
                dateObj.regDate || '',
                dateObj.dbDate || '',
                hasRealBoundaries(f) ? 'Да' : 'Нет',
                o.permitted_use_established_by_document || o.purpose || '',
                o.ownership_type || '',
                o.right_type || '',
                o.status || '',
                o.floors || '',
                o.materials || '',
                o.year_built || o.params_year_built || ''
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            { wch: 22 }, { wch: 18 }, { wch: 45 }, { wch: 15 },
            { wch: 20 }, { wch: 15 }, { wch: 16 }, { wch: 16 },
            { wch: 14 }, { wch: 35 }, { wch: 18 }, { wch: 20 },
            { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 14 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, "Аналитическая выборка");
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