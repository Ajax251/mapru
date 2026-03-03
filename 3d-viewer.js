window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");

    setTimeout(() => {
        try {
            // 1. НАСТРОЙКА ПРОЕКЦИИ И ПОИСК ЦЕНТРА
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            const allLocalFeatures = {
                target: [], parcels: [], buildings: [], structures: [], zouits: []
            };

            // Функция конвертации [Lat, Lon] (координаты карты) в метры EPSG:3857
            const to3857 = (yandexCoord) => {
                const trueLat = yandexCoord[0] + (window.mapOffsetY * 0.000008983);
                const trueLon = yandexCoord[1] + (window.mapOffsetX * 0.000008983);
                return window.proj4("EPSG:4326", destSc, [trueLon, trueLat]); // [X, Y]
            };

            // Вычисляем центр (origin) по целевому объекту, чтобы сместить всю сцену в [0,0,0]
            if (!window.quickReportTargetObjects || window.quickReportTargetObjects.length === 0) {
                throw new Error("Нет исходного объекта для построения сцены.");
            }

            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates();
                const rings = (obj.geometry.getType() === 'Polygon') ? coords : [coords];
                rings.forEach(ring => {
                    ring.forEach(c => {
                        const pt = to3857(c);
                        minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
                        minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
                    });
                });
            });

            const originX = (minX + maxX) / 2;
            const originY = (minY + maxY) / 2;

            // 2. УМНЫЙ АНАЛИЗАТОР СВОЙСТВ (Парсинг текста из ЕГРН)
            const analyzeFeature = (f, category) => {
                const p = f.properties || {};
                const o = p.options || {};
                // Собираем весь текст в кучу для поиска ключевых слов
                const text = `${p.descr || ''} ${o.name || ''} ${o.params_name || ''} ${o.purpose || ''} ${o.params_purpose || ''} ${o.building_name || ''} ${o.name_by_doc || ''} ${o.content_restrict_encumbrances || ''}`.toLowerCase();
                
                let meta = { name: o.name || o.params_name || o.name_by_doc || p.descr || 'Объект' };

                if (category === 'building') {
                    meta.isResidential = text.includes('жило') || text.includes('дом') || text.includes('квартир');
                    meta.isIndustrial = text.includes('гараж') || text.includes('склад') || text.includes('цех') || text.includes('производ');
                    meta.floors = parseInt(o.floors);
                    if (isNaN(meta.floors)) meta.floors = meta.isResidential ? 1 : 1; // По умолчанию
                    meta.height = meta.floors * 3.5; // 3.5 метра на этаж
                    meta.year = o.year || o.build_year || '';
                } 
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('кабель') || text.includes('вл ') || text.includes('кв');
                    meta.isTelecom = text.includes('связ') || text.includes('оптик');
                    meta.isRoad = text.includes('дорог') || text.includes('шоссе');
                    
                    // Флаг линейности для ЗОУИТ (чтобы рисовать туннелем)
                    meta.isLinearZone = meta.isGas || meta.isWater || meta.isElectric || meta.isTelecom || text.includes('трубопровод') || text.includes('линия');

                    meta.isUnderground = text.includes('подзем');
                    meta.isAboveground = text.includes('надзем') || text.includes('назем');
                    
                    // Логика по умолчанию, если прямо не указано
                    if (!meta.isUnderground && !meta.isAboveground) {
                        if (meta.isGas) meta.isUnderground = true; // Газ чаще под землей
                        if (meta.isWater) meta.isUnderground = true; // Вода под землей
                        if (meta.isElectric) meta.isAboveground = true; // ЛЭП над землей
                    }
                    meta.diameter = parseFloat(o.diameter) || 0.5; // Диаметр трубы
                }
                return meta;
            };

            // Вспомогательная функция сборки геометрии
            const processFeatureArray = (featuresArray, type) => {
                const result = [];
                (featuresArray || []).forEach(f => {
                    if (!f.geometry || !f.geometry.coordinates) return;
                    
                    const meta = analyzeFeature(f, type);
                    
                    let ringsList = [];
                    if (f.geometry.type === 'Polygon') ringsList = [f.geometry.coordinates];
                    else if (f.geometry.type === 'MultiPolygon') ringsList = f.geometry.coordinates;
                    else if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
                        ringsList = f.geometry.type === 'LineString' ? [[f.geometry.coordinates]] : f.geometry.coordinates.map(c => [c]);
                    }
                    
                    const localPolys = ringsList.map(poly => {
                        return poly.map(ring => ring.map(c => {
                            // API отдает в 3857. Вычитаем центр сцены.
                            return { x: c[0] - originX, y: c[1] - originY };
                        }));
                    });

                    result.push({
                        id: f.properties?.descr || Math.random().toString(),
                        type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon',
                        polygons: localPolys,
                        meta: meta
                    });
                });
                return result;
            };

            // 3. ОБРАБОТКА ДАННЫХ
            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates();
                const isPoly = obj.geometry.getType() === 'Polygon';
                const rings = isPoly ? coords : [coords];
                const localPoly = rings.map(ring => ring.map(c => {
                    const pt = to3857(c);
                    return { x: pt[0] - originX, y: pt[1] - originY };
                }));
                allLocalFeatures.target.push({ type: isPoly ? 'Polygon' : 'Line', polygons: [localPoly] });
            });

            allLocalFeatures.parcels = processFeatureArray(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFeatureArray(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFeatureArray(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFeatureArray(window.zouitFeaturesData, 'zouit');

            // 4. СОЗДАНИЕ UI (Модальное окно + Iframe)
            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '2.5%', left: '2.5%', width: '95%', height: '95%',
                backgroundColor: '#ffffff', borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid #cbd5e1'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '12px 20px', background: 'linear-gradient(90deg, #0f172a, #1e293b)',
                color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: 'bold', fontSize: '16px', fontFamily: 'system-ui, sans-serif',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            });
            header.innerHTML = `<span><i class="fas fa-cube" style="color:#8b5cf6; margin-right:8px; filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.5));"></i> 3D Визуализация территории</span>`;
            
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            Object.assign(closeBtn.style, {
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
                color: '#94a3b8', fontSize: '28px', cursor: 'pointer', lineHeight: '1', 
                padding: '0 12px', borderRadius: '8px', transition: 'all 0.2s',
                backdropFilter: 'blur(4px)'
            });
            closeBtn.onmouseenter = () => {
                closeBtn.style.color = 'white';
                closeBtn.style.background = 'rgba(255,255,255,0.2)';
            };
            closeBtn.onmouseleave = () => {
                closeBtn.style.color = '#94a3b8';
                closeBtn.style.background = 'rgba(255,255,255,0.1)';
            };
            closeBtn.onclick = () => modal.remove();
            
            header.appendChild(closeBtn);
            modal.appendChild(header);

            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#0f172a' });
            
            // ====================================================================
            // THREE.JS HTML КОНТЕНТ ДЛЯ IFRAME (Современная графика)
            // ====================================================================
            const srcDocContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; overflow: hidden; background: #0f172a; font-family: 'Segoe UI', system-ui, sans-serif; }
        #ui-panel { 
            position: absolute; top: 20px; right: 20px; 
            background: rgba(15, 23, 42, 0.85); 
            padding: 24px; 
            border-radius: 16px; 
            box-shadow: 0 8px 32px rgba(0,0,0,0.4); 
            backdrop-filter: blur(12px); 
            pointer-events: auto; 
            width: 240px; 
            border: 1px solid rgba(255,255,255,0.1);
            color: #e2e8f0;
        }
        h3 { 
            margin-top: 0; 
            margin-bottom: 20px; 
            color: #f8fafc; 
            font-size: 16px; 
            border-bottom: 2px solid #8b5cf6; 
            padding-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .layer-toggle { 
            display: flex; 
            align-items: center; 
            margin-bottom: 14px; 
            cursor: pointer; 
            font-size: 13px; 
            color: #cbd5e1; 
            font-weight: 500;
            transition: color 0.2s;
            padding: 6px;
            border-radius: 8px;
        }
        .layer-toggle:hover {
            background: rgba(255,255,255,0.05);
            color: #f8fafc;
        }
        .layer-toggle input { 
            margin-right: 12px; 
            width: 18px; 
            height: 18px; 
            accent-color: #8b5cf6; 
            cursor: pointer;
        }
        .color-box { 
            width: 18px; 
            height: 18px; 
            border-radius: 6px; 
            margin-right: 12px; 
            border: 1px solid rgba(255,255,255,0.2); 
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
            flex-shrink: 0;
        }
        #help { 
            position: absolute; 
            bottom: 24px; 
            left: 24px; 
            background: rgba(15, 23, 42, 0.9); 
            color: #f8fafc; 
            padding: 16px 24px; 
            border-radius: 12px; 
            font-size: 13px; 
            pointer-events: none; 
            border: 1px solid rgba(255,255,255,0.1); 
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            line-height: 1.6;
            backdrop-filter: blur(8px);
        }
        #loading { 
            position: absolute; 
            top:50%; 
            left:50%; 
            transform: translate(-50%, -50%); 
            font-size: 20px; 
            color: #f8fafc; 
            font-weight: 600; 
            background: rgba(15, 23, 42, 0.9); 
            padding: 24px 48px; 
            border-radius: 12px; 
            box-shadow: 0 20px 60px rgba(0,0,0,0.5); 
            transition: opacity 0.5s;
            border: 1px solid rgba(139, 92, 246, 0.3);
            backdrop-filter: blur(10px);
        }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(139, 92, 246, 0.3);
            border-radius: 50%;
            border-top-color: #8b5cf6;
            animation: spin 1s ease-in-out infinite;
            margin-right: 12px;
            vertical-align: middle;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
    <script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
            }
        }
    <\/script>
</head>
<body>
    <div id="loading"><span class="spinner"></span> Генерация 3D мира...</div>
    <div id="ui-panel">
        <h3>Слои визуализации</h3>
        <label class="layer-toggle"><input type="checkbox" id="t-target" checked><div class="color-box" style="background:#ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);"></div> Целевой объект</label>
        <label class="layer-toggle"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background:#4ade80;"></div> Земельные участки</label>
        <label class="layer-toggle"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background:#fcd34d; box-shadow: 0 0 8px rgba(252, 211, 77, 0.4);"></div> Здания</label>
        <label class="layer-toggle"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background:#3b82f6; box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);"></div> Инженерные сети</label>
        <label class="layer-toggle"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background:linear-gradient(135deg, #fbbf24 50%, #a855f7 50%); opacity: 0.9;"></div> Охранные зоны</label>
        <label class="layer-toggle"><input type="checkbox" id="t-effects" checked><div class="color-box" style="background:radial-gradient(circle, #fff 0%, transparent 70%);"></div> Атмосферные эффекты</label>
    </div>
    <div id="help">
        <b style="color:#8b5cf6;">ЛКМ</b> — Вращение<br>
        <b style="color:#8b5cf6;">ПКМ</b> — Панорамирование<br>
        <b style="color:#8b5cf6;">Колесо</b> — Масштаб<br>
        <span style="color:#94a3b8; font-size: 11px; margin-top: 8px; display: block;">Наведите на здание для информации</span>
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

        // Получаем данные, переданные из основного окна
        const data = ${JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c')};
        
        // 1. ИНИЦИАЛИЗАЦИЯ СЦЕНЫ
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);
        scene.fog = new THREE.FogExp2(0x87CEEB, 0.0015);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.set(100, 200, 200);

        const renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            logarithmicDepthBuffer: true,
            powerPreference: "high-performance"
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.2;
        controls.minDistance = 10;
        controls.maxDistance = 2000;

        // 2. ПРОЦЕДУРНЫЕ ТЕКСТУРЫ
        const TextureGenerator = {
            createGrass: () => {
                const canvas = document.createElement('canvas');
                canvas.width = 1024;
                canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                
                // База
                ctx.fillStyle = '#22c55e';
                ctx.fillRect(0, 0, 1024, 1024);
                
                // Детали (трава)
                for(let i=0; i<20000; i++) {
                    const x = Math.random() * 1024;
                    const y = Math.random() * 1024;
                    const size = Math.random() * 3 + 1;
                    ctx.fillStyle = Math.random() > 0.5 ? '#16a34a' : '#86efac';
                    ctx.fillRect(x, y, size, size);
                }
                
                // Добавим шум
                const imageData = ctx.getImageData(0, 0, 1024, 1024);
                const data = imageData.data;
                for(let i=0; i<data.length; i+=4) {
                    const noise = (Math.random() - 0.5) * 20;
                    data[i] = Math.max(0, Math.min(255, data[i] + noise));
                    data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
                    data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
                }
                ctx.putImageData(imageData, 0, 0);
                
                const texture = new THREE.CanvasTexture(canvas);
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(50, 50);
                return texture;
            },
            
            createConcrete: () => {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = '#94a3b8';
                ctx.fillRect(0, 0, 512, 512);
                
                // Трещины и шероховатости
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = 1;
                for(let i=0; i<50; i++) {
                    ctx.globalAlpha = Math.random() * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(Math.random()*512, Math.random()*512);
                    ctx.lineTo(Math.random()*512, Math.random()*512);
                    ctx.stroke();
                }
                
                const texture = new THREE.CanvasTexture(canvas);
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(4, 4);
                return texture;
            },
            
            createMetal: (color) => {
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 256;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 256, 256);
                
                // Металлический шум
                for(let i=0; i<5000; i++) {
                    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
                    ctx.fillRect(Math.random()*256, Math.random()*256, 2, 2);
                }
                
                const texture = new THREE.CanvasTexture(canvas);
                return texture;
            }
        };

        // 3. УЛУЧШЕННОЕ ОСВЕЩЕНИЕ (PBR)
        RectAreaLightUniformsLib.init();
        
        // Гемисферное освещение (небо/земля)
        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x362d1d, 0.6);
        scene.add(hemiLight);
        
        // Основное солнце (Directional)
        const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
        sunLight.position.set(300, 400, 200);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 1000;
        sunLight.shadow.camera.left = -500;
        sunLight.shadow.camera.right = 500;
        sunLight.shadow.camera.top = 500;
        sunLight.shadow.camera.bottom = -500;
        sunLight.shadow.bias = -0.0001;
        sunLight.shadow.normalBias = 0.02;
        scene.add(sunLight);
        
        // Атмосферный свет (Ambient)
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        scene.add(ambientLight);

        // 4. БАЗОВАЯ ПОВЕРХНОСТЬ (Земля с текстурой)
        const groundGeo = new THREE.PlaneGeometry(5000, 5000, 64, 64);
        
        // Добавляем неровности к земле
        const posAttribute = groundGeo.attributes.position;
        for(let i=0; i<posAttribute.count; i++) {
            const x = posAttribute.getX(i);
            const y = posAttribute.getY(i);
            // Шум для неровностей
            const noise = Math.sin(x * 0.01) * Math.cos(y * 0.01) * 0.5 + Math.random() * 0.2;
            posAttribute.setZ(i, noise);
        }
        groundGeo.computeVertexNormals();
        
        const groundMat = new THREE.MeshStandardMaterial({ 
            map: TextureGenerator.createGrass(),
            color: 0xffffff,
            roughness: 1,
            metalness: 0,
            displacementScale: 0.5
        });
        
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        
        // Сетка с лучшей видимостью
        const grid = new THREE.GridHelper(5000, 100, 0x1e293b, 0x334155);
        grid.material.opacity = 0.1;
        grid.material.transparent = true;
        grid.position.y = 0.1;
        scene.add(grid);

        // 5. КОМПАС (Роза ветров) с лучшим дизайном
        const drawCompass = () => {
            const compassGroup = new THREE.Group();
            
            // Материал для стрелки
            const arrowMat = new THREE.MeshStandardMaterial({ 
                color: 0xef4444, 
                metalness: 0.6, 
                roughness: 0.4,
                emissive: 0xef4444,
                emissiveIntensity: 0.2
            });
            
            const createPointer = (color, rotY, letter, isMain = false) => {
                const shape = new THREE.Shape();
                const size = isMain ? 30 : 20;
                shape.moveTo(0, 0); 
                shape.lineTo(4, 0); 
                shape.lineTo(0, size); 
                shape.lineTo(-4, 0);
                
                const geo = new THREE.ExtrudeGeometry(shape, { 
                    depth: 0.5, 
                    bevelEnabled: true, 
                    bevelSize: 0.5, 
                    bevelThickness: 0.5,
                    bevelSegments: 4
                });
                const mesh = new THREE.Mesh(geo, isMain ? arrowMat : new THREE.MeshStandardMaterial({color: color}));
                mesh.rotation.x = -Math.PI / 2;
                mesh.rotation.z = rotY;
                mesh.position.y = 0.5;
                mesh.castShadow = true;
                compassGroup.add(mesh);

                // Буквы
                const canvas = document.createElement('canvas'); 
                canvas.width = 128; 
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.arc(64, 64, 60, 0, Math.PI*2);
                ctx.fill();
                
                ctx.font = `Bold ${isMain ? '80px' : '60px'} sans-serif`; 
                ctx.fillStyle = isMain ? '#ef4444' : '#1e293b'; 
                ctx.textAlign = 'center'; 
                ctx.textBaseline = 'middle';
                ctx.fillText(letter, 64, 64);
                
                const texture = new THREE.CanvasTexture(canvas);
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
                sprite.scale.set(isMain ? 40 : 30, isMain ? 40 : 30, 1);
                
                const offset = isMain ? 50 : 35;
                sprite.position.set(Math.sin(rotY) * offset, 2, Math.cos(rotY) * offset);
                compassGroup.add(sprite);
            };
            
            createPointer(0xef4444, Math.PI, 'С', true);
            createPointer(0x1e293b, 0, 'Ю');
            createPointer(0x1e293b, Math.PI/2, 'В');
            createPointer(0x1e293b, -Math.PI/2, 'З');
            
            // Центральная точка
            const centerGeo = new THREE.CylinderGeometry(6, 6, 1, 32);
            const centerMat = new THREE.MeshStandardMaterial({ 
                color: 0x334155, 
                metalness: 0.8, 
                roughness: 0.2 
            });
            const center = new THREE.Mesh(centerGeo, centerMat);
            center.position.y = 0.5;
            center.castShadow = true;
            compassGroup.add(center);
            
            // Кольцо
            const ringGeo = new THREE.TorusGeometry(45, 1, 8, 64);
            const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.6 }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.1;
            compassGroup.add(ring);
            
            compassGroup.position.set(-150, 0, 150);
            scene.add(compassGroup);
        };
        drawCompass();

        // 6. ГРУППЫ
        const groups = { 
            target: new THREE.Group(), 
            parcels: new THREE.Group(), 
            buildings: new THREE.Group(), 
            structures: new THREE.Group(), 
            zouit: new THREE.Group(),
            effects: new THREE.Group()
        };
        for (let k in groups) scene.add(groups[k]);

        // 7. ГЕНЕРАТОРЫ ГЕОМЕТРИИ (PBR)
        
        // Создание формы с дырками
        const createShapeFromPolygon = (polyRings) => {
            const shape = new THREE.Shape();
            const outer = polyRings[0];
            shape.moveTo(outer[0].x, -outer[0].y);
            for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x, -outer[i].y);
            
            for(let i=1; i<polyRings.length; i++) {
                const hole = new THREE.Path();
                hole.moveTo(polyRings[i][0].x, -polyRings[i][0].y);
                for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, -polyRings[i][j].y);
                shape.holes.push(hole);
            }
            return shape;
        };

        // Генерация трубы с материалами
        const buildPipe = (pointsArray, radius, color, isUnderground, type = 'default', opacity = 1) => {
            const group = new THREE.Group();
            
            let yOffset = isUnderground ? -3 : 3;
            
            const vecPoints = pointsArray.map(p => new THREE.Vector3(p.x, yOffset, -p.y));
            const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05);
            
            // Материал в зависимости от типа
            let material;
            if (type === 'gas') {
                material = new THREE.MeshStandardMaterial({
                    color: color,
                    metalness: 0.8,
                    roughness: 0.3,
                    emissive: color,
                    emissiveIntensity: 0.1
                });
            } else if (type === 'water') {
                material = new THREE.MeshStandardMaterial({
                    color: color,
                    metalness: 0.4,
                    roughness: 0.7,
                    clearcoat: 0.5,
                    clearcoatRoughness: 0.1
                });
            } else if (type === 'electric') {
                material = new THREE.MeshStandardMaterial({
                    color: color,
                    metalness: 0.1,
                    roughness: 0.9
                });
            } else {
                material = new THREE.MeshStandardMaterial({
                    color: color,
                    metalness: 0.6,
                    roughness: 0.4
                });
            }
            
            if (opacity < 1) {
                material.transparent = true;
                material.opacity = opacity;
                material.depthWrite = false;
                material.side = THREE.DoubleSide;
            }
            
            const tubeGeo = new THREE.TubeGeometry(path, Math.max(20, vecPoints.length * 5), radius, 16, false);
            const tube = new THREE.Mesh(tubeGeo, material);
            
            if (opacity === 1) {
                tube.castShadow = !isUnderground;
                tube.receiveShadow = true;
            }
            
            group.add(tube);
            
            // Опоры для надземных
            if (!isUnderground && opacity === 1 && type !== 'electric') {
                const supportMat = new THREE.MeshStandardMaterial({ 
                    color: 0x475569, 
                    metalness: 0.5, 
                    roughness: 0.6 
                });
                
                vecPoints.forEach((pt, idx) => {
                    if (idx % 2 === 0) { // Не на каждой точке
                        const support = new THREE.Mesh(
                            new THREE.CylinderGeometry(radius*0.9, radius*0.9, yOffset, 8),
                            supportMat
                        );
                        support.position.set(pt.x, yOffset/2, pt.z);
                        support.castShadow = true;
                        group.add(support);
                        
                        // Фундамент
                        const foundation = new THREE.Mesh(
                            new THREE.CylinderGeometry(radius*1.5, radius*1.5, 0.5, 8),
                            new THREE.MeshStandardMaterial({color: 0x1e293b})
                        );
                        foundation.position.set(pt.x, -0.25, pt.z);
                        foundation.receiveShadow = true;
                        group.add(foundation);
                    }
                });
            }
            
            return group;
        };

        // Генерация здания с деталями (окна, крыша)
        const buildHouse = (shape, height, isResidential, year) => {
            const group = new THREE.Group();
            
            // Стены с текстурой
            const wallTexture = TextureGenerator.createConcrete();
            const wallMat = new THREE.MeshStandardMaterial({ 
                map: wallTexture,
                color: isResidential ? 0xfef3c7 : 0xd1d5db,
                roughness: 0.9,
                metalness: 0.1
            });
            
            const wallGeo = new THREE.ExtrudeGeometry(shape, { 
                depth: height, 
                bevelEnabled: false,
                steps: 1
            });
            const walls = new THREE.Mesh(wallGeo, wallMat);
            walls.rotation.x = Math.PI / 2;
            walls.position.y = height / 2;
            walls.castShadow = true;
            walls.receiveShadow = true;
            group.add(walls);
            
            // Окна (эмиссивные плоскости)
            const windowMat = new THREE.MeshStandardMaterial({
                color: 0xfffaed,
                emissive: 0xfffaed,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            
            // Добавляем окна на случайных позициях
            const bounds = new THREE.Box3().setFromObject(walls);
            const size = bounds.getSize(new THREE.Vector3());
            
            for(let i=0; i<Math.floor(height/3); i++) {
                for(let j=0; j<3; j++) {
                    const windowGeo = new THREE.PlaneGeometry(2, 2);
                    const win = new THREE.Mesh(windowGeo, windowMat);
                    
                    // Позиционируем на стенах
                    const angle = (j / 3) * Math.PI * 2;
                    const radius = Math.min(size.x, size.z) / 2;
                    win.position.set(
                        Math.cos(angle) * radius,
                        3 + i * 3,
                        Math.sin(angle) * radius
                    );
                    win.lookAt(0, win.position.y, 0);
                    win.rotateY(Math.PI/2);
                    
                    group.add(win);
                }
            }
            
            // Крыша
            const roofMat = new THREE.MeshStandardMaterial({ 
                color: isResidential ? 0x7f1d1d : 0x334155,
                metalness: 0.3,
                roughness: 0.8
            });
            
            const roofGeo = new THREE.ExtrudeGeometry(shape, { 
                depth: 0.3, 
                bevelEnabled: true, 
                bevelSize: 0.2, 
                bevelThickness: 0.2,
                bevelSegments: 3
            });
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.rotation.x = Math.PI / 2;
            roof.position.y = height + 0.15;
            roof.castShadow = true;
            group.add(roof);
            
            // Дверь
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x451a03 });
            const doorGeo = new THREE.BoxGeometry(2, 2.5, 0.2);
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(0, 1.25, size.z/2 + 0.1);
            group.add(door);
            
            return group;
        };

        // Деревья для участков
        const createTree = (x, z) => {
            const group = new THREE.Group();
            
            // Ствол
            const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 2, 6);
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 1 });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1;
            trunk.castShadow = true;
            group.add(trunk);
            
            // Крона (несколько сфер)
            const foliageMat = new THREE.MeshStandardMaterial({ 
                color: 0x15803d, 
                roughness: 0.8,
                transparent: true,
                opacity: 0.9
            });
            
            const crown1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), foliageMat);
            crown1.position.y = 2.5;
            crown1.castShadow = true;
            group.add(crown1);
            
            const crown2 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), foliageMat);
            crown2.position.set(0.8, 2.2, 0.8);
            crown2.castShadow = true;
            group.add(crown2);
            
            group.position.set(x, 0, z);
            return group;
        };

        // 8. ОТРИСОВКА ДАННЫХ
        
        // Исходный объект (Красная подсветка)
        data.target.forEach(t => {
            t.polygons.forEach(poly => {
                if (t.type === 'Line') {
                    const pipe = buildPipe(poly[0], 0.5, 0xff0000, false, 'default', 0.8);
                    const glow = buildPipe(poly[0], 0.8, 0xff0000, false, 'default', 0.3);
                    groups.target.add(glow);
                    groups.target.add(pipe);
                } else {
                    const shape = createShapeFromPolygon(poly);
                    const mat = new THREE.MeshStandardMaterial({ 
                        color: 0xff0000, 
                        transparent: true, 
                        opacity: 0.3,
                        emissive: 0xff0000,
                        emissiveIntensity: 0.2,
                        depthWrite: false
                    });
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), 
                        mat
                    );
                    mesh.rotation.x = Math.PI / 2; 
                    mesh.position.y = 0.3;
                    
                    // Контур
                    const edges = new THREE.LineSegments(
                        new THREE.EdgesGeometry(mesh.geometry), 
                        new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
                    );
                    mesh.add(edges);
                    groups.target.add(mesh);
                }
            });
        });

        // Участки с деревьями
        data.parcels.forEach(p => {
            p.polygons.forEach(poly => {
                const shape = createShapeFromPolygon(poly);
                const mat = new THREE.MeshStandardMaterial({ 
                    map: TextureGenerator.createGrass(),
                    color: 0xffffff,
                    roughness: 1,
                    metalness: 0
                });
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), 
                    mat
                );
                mesh.rotation.x = Math.PI / 2; 
                mesh.position.y = 0.1;
                mesh.receiveShadow = true;
                
                // Граница
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(mesh.geometry), 
                    new THREE.LineBasicMaterial({ color: 0x16a34a, opacity: 0.5, transparent: true })
                );
                mesh.add(edges);
                groups.parcels.add(mesh);
                
                // Добавляем деревья (случайно по площади)
                const bounds = new THREE.Box3().setFromObject(mesh);
                const size = bounds.getSize(new THREE.Vector3());
                const center = bounds.getCenter(new THREE.Vector3());
                
                for(let i=0; i<5; i++) {
                    const x = center.x + (Math.random() - 0.5) * size.x * 0.8;
                    const z = center.z + (Math.random() - 0.5) * size.z * 0.8;
                    groups.parcels.add(createTree(x, z));
                }
            });
        });

        // Здания
        data.buildings.forEach(b => {
            b.polygons.forEach(poly => {
                const shape = createShapeFromPolygon(poly);
                const house = buildHouse(shape, b.meta.height, b.meta.isResidential, b.meta.year);
                groups.buildings.add(house);
            });
        });

        // Сооружения (трубы)
        data.structures.forEach(s => {
            let color, radius, type;
            if (s.meta.isGas) { 
                color = 0xfbbf24; 
                radius = s.meta.diameter || 0.4; 
                type = 'gas';
            }
            else if (s.meta.isWater) { 
                color = 0x3b82f6; 
                radius = s.meta.diameter || 0.5; 
                type = 'water';
            }
            else if (s.meta.isElectric) { 
                color = 0x1e293b; 
                radius = 0.15; 
                type = 'electric';
            }
            else if (s.meta.isTelecom) { 
                color = 0x10b981; 
                radius = 0.1; 
                type = 'telecom';
            }
            else { 
                color = 0x94a3b8; 
                radius = 0.3; 
                type = 'default';
            }

            s.polygons.forEach(poly => {
                const points = poly[0];
                const pipe = buildPipe(points, radius, color, s.meta.isUnderground, type);
                groups.structures.add(pipe);
            });
        });

        // ЗОУИТ (Современные зоны)
        data.zouits.forEach(z => {
            let color = 0xa855f7;
            if (z.meta.isGas) color = 0xfbbf24;
            else if (z.meta.isWater) color = 0x3b82f6;
            else if (z.meta.isElectric) color = 0xef4444;

            z.polygons.forEach(poly => {
                if (z.meta.isLinearZone) {
                    // Туннель с градиентом
                    const tunnel = buildPipe(poly[0], 2.5, color, false, 'default', 0.2);
                    
                    // Добавляем "светящиеся" кольца
                    const ringMat = new THREE.MeshBasicMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: 0.4,
                        side: THREE.DoubleSide
                    });
                    
                    for(let i=0; i<poly[0].length-1; i++) {
                        const ringGeo = new THREE.RingGeometry(2.5, 3, 16);
                        const ring = new THREE.Mesh(ringGeo, ringMat);
                        ring.rotation.x = Math.PI / 2;
                        ring.position.set(
                            (poly[0][i].x + poly[0][i+1].x)/2,
                            3,
                            -(poly[0][i].y + poly[0][i+1].y)/2
                        );
                        groups.zouit.add(ring);
                    }
                    
                    groups.zouit.add(tunnel);
                } else {
                    // Объемная зона с объемным светом
                    const shape = createShapeFromPolygon(poly);
                    const mat = new THREE.MeshPhysicalMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: 0.15,
                        emissive: color,
                        emissiveIntensity: 0.2,
                        transmission: 0.1,
                        thickness: 5,
                        roughness: 0.1,
                        metalness: 0.1,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 25, bevelEnabled: false }), 
                        mat
                    );
                    mesh.rotation.x = Math.PI / 2; 
                    mesh.position.y = 12.5;
                    groups.zouit.add(mesh);
                    
                    // "Светящаяся" рамка снизу
                    const lineMat = new THREE.LineBasicMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: 0.6 
                    });
                    // Создаем линию по контуру
                    const points = poly[0].map(p => new THREE.Vector3(p.x, 0.1, -p.y));
                    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMat);
                    groups.zouit.add(line);
                }
            });
        });

        // Атмосферные частицы (пыль/дождь)
        const createParticles = () => {
            const count = 1000;
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(count * 3);
            
            for(let i=0; i<count; i++) {
                positions[i*3] = (Math.random() - 0.5) * 2000;
                positions[i*3+1] = Math.random() * 200;
                positions[i*3+2] = (Math.random() - 0.5) * 2000;
            }
            
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const mat = new THREE.PointsMaterial({
                color: 0xffffff,
                size: 2,
                transparent: true,
                opacity: 0.4,
                sizeAttenuation: true
            });
            
            const particles = new THREE.Points(geo, mat);
            groups.effects.add(particles);
            
            // Анимация частиц
            let time = 0;
            return () => {
                time += 0.001;
                const positions = particles.geometry.attributes.position.array;
                for(let i=0; i<count; i++) {
                    positions[i*3+1] -= 0.5; // Падение
                    if (positions[i*3+1] < 0) positions[i*3+1] = 200;
                    positions[i*3] += Math.sin(time + i) * 0.1; // Ветер
                }
                particles.geometry.attributes.position.needsUpdate = true;
                particles.rotation.y = time * 0.05;
            };
        };

        const animateParticles = createParticles();

        // Убираем лоадер
        document.getElementById('loading').style.opacity = '0';
        setTimeout(() => document.getElementById('loading').remove(), 500);

        // Обработчики интерфейса
        document.getElementById('t-target').onchange = (e) => groups.target.visible = e.target.checked;
        document.getElementById('t-parcels').onchange = (e) => groups.parcels.visible = e.target.checked;
        document.getElementById('t-buildings').onchange = (e) => groups.buildings.visible = e.target.checked;
        document.getElementById('t-structures').onchange = (e) => groups.structures.visible = e.target.checked;
        document.getElementById('t-zouit').onchange = (e) => groups.zouit.visible = e.target.checked;
        document.getElementById('t-effects').onchange = (e) => groups.effects.visible = e.target.checked;

        // Raycaster для подсветки при наведении
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let hoveredObj = null;

        window.addEventListener('mousemove', (event) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });

        // Анимация и рендер
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        function animate() {
            requestAnimationFrame(animate);
            
            controls.update();
            
            // Анимация частиц
            if (groups.effects.visible) animateParticles();
            
            // Подсветка при наведении
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            
            if (intersects.length > 0) {
                const obj = intersects[0].object;
                if (obj !== hoveredObj && obj.userData !== undefined) {
                    if (hoveredObj && hoveredObj.material.emissive) {
                        hoveredObj.material.emissiveIntensity = 0;
                    }
                    hoveredObj = obj;
                    if (hoveredObj.material.emissive) {
                        hoveredObj.material.emissiveIntensity = 0.3;
                    }
                    document.body.style.cursor = 'pointer';
                }
            } else {
                if (hoveredObj && hoveredObj.material.emissive) {
                    hoveredObj.material.emissiveIntensity = 0;
                }
                hoveredObj = null;
                document.body.style.cursor = 'default';
            }
            
            renderer.render(scene, camera);
        }
        animate();
    <\/script>
</body>
</html>`;

            iframe.srcdoc = srcDocContent;
            modal.appendChild(iframe);
            document.body.appendChild(modal);

            // Закрытие по Escape
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    modal.remove();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

        } catch (error) {
            console.error("Ошибка генерации 3D:", error);
            if (typeof showNotification === 'function') {
                showNotification("Ошибка генерации 3D сцены: " + error.message, "error");
            }
        } finally {
            if (typeof hideLoader === 'function') hideLoader();
        }
    }, 100);
};