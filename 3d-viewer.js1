// ============================================================================
// 3D VIEWER MODULE (Связь с Three.js и анализ данных ЕГРН)
// ============================================================================

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
                padding: '12px 20px', background: 'linear-gradient(90deg, #1e293b, #334155)',
                color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: 'bold', fontSize: '16px', fontFamily: 'sans-serif'
            });
            header.innerHTML = `<span><i class="fas fa-cube" style="color:#a78bfa; margin-right:8px;"></i> 3D Визуализация объекта и территории</span>`;
            
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            Object.assign(closeBtn.style, {
                background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '28px',
                cursor: 'pointer', lineHeight: '1', padding: '0 10px', transition: 'color 0.2s'
            });
            closeBtn.onmouseenter = () => closeBtn.style.color = 'white';
            closeBtn.onmouseleave = () => closeBtn.style.color = '#94a3b8';
            closeBtn.onclick = () => modal.remove();
            
            header.appendChild(closeBtn);
            modal.appendChild(header);

            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#e0f2fe' });
            
            // ====================================================================
            // THREE.JS HTML КОНТЕНТ ДЛЯ IFRAME
            // ====================================================================
            const srcDocContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; overflow: hidden; background: #87CEEB; font-family: 'Segoe UI', Tahoma, sans-serif; }
        #ui-panel { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.95); padding: 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); backdrop-filter: blur(10px); pointer-events: auto; width: 220px; }
        h3 { margin-top: 0; margin-bottom: 15px; color: #1e293b; font-size: 15px; border-bottom: 2px solid #8b5cf6; padding-bottom: 8px;}
        .layer-toggle { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; font-size: 13px; color: #334155; font-weight: 500;}
        .layer-toggle input { margin-right: 10px; width: 16px; height: 16px; accent-color: #8b5cf6; cursor: pointer;}
        .color-box { width: 16px; height: 16px; border-radius: 4px; margin-right: 10px; border: 1px solid rgba(0,0,0,0.1); box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);}
        #help { position: absolute; bottom: 20px; left: 20px; background: rgba(15, 23, 42, 0.8); color: #f8fafc; padding: 12px 20px; border-radius: 8px; font-size: 13px; pointer-events: none; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(0,0,0,0.3);}
        #loading { position: absolute; top:50%; left:50%; transform: translate(-50%, -50%); font-size: 20px; color: #1e293b; font-weight: bold; background: white; padding: 20px 40px; border-radius: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transition: opacity 0.5s;}
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
    <div id="loading">Создание 3D мира...</div>
    <div id="ui-panel">
        <h3>Управление слоями</h3>
        <label class="layer-toggle"><input type="checkbox" id="t-target" checked><div class="color-box" style="background:#ef4444;"></div> Исходный объект</label>
        <label class="layer-toggle"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background:#86efac;"></div> Земля</label>
        <label class="layer-toggle"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background:#fcd34d;"></div> Здания / Дома</label>
        <label class="layer-toggle"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background:#3b82f6;"></div> Сети / Трубы</label>
        <label class="layer-toggle"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background:linear-gradient(135deg, #fbbf24 50%, #c084fc 50%); opacity: 0.7;"></div> Охранные зоны</label>
    </div>
    <div id="help">
        <b style="color:#fbbf24;">ЛКМ</b> - Вращение камеры<br>
        <b style="color:#fbbf24;">ПКМ</b> - Перемещение по карте<br>
        <b style="color:#fbbf24;">Колесико</b> - Приблизить / Отдалить
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // Получаем данные, переданные из основного окна
        const data = ${JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c')};
        
        // 1. ИНИЦИАЛИЗАЦИЯ СЦЕНЫ
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB); // Красивое голубое небо
        scene.fog = new THREE.FogExp2(0x87CEEB, 0.002); // Атмосферная дымка

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
        camera.position.set(0, 150, 200);

        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.15; // Позволяет заглянуть под землю для труб

        // 2. ОСВЕЩЕНИЕ (Солнце)
        scene.add(new THREE.AmbientLight(0xffffff, 0.5)); // Мягкий рассеянный свет
        
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2); // Яркое солнце
        sunLight.position.set(200, 300, 100); // Солнце с юго-востока
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096; // Высокое качество теней
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 1000;
        const d = 300;
        sunLight.shadow.camera.left = -d;
        sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d;
        sunLight.shadow.camera.bottom = -d;
        sunLight.shadow.bias = -0.0005;
        scene.add(sunLight);

        // 3. БАЗОВАЯ ПОВЕРХНОСТЬ (Земля)
        // Делаем землю слегка прозрачной, чтобы видеть подземные трубы
        const groundGeo = new THREE.PlaneGeometry(5000, 5000);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: 0xe2e8f0, 
            roughness: 1, 
            metalness: 0,
            transparent: true,
            opacity: 0.85,
            depthWrite: false // Чтобы сетка и компас рисовались поверх прозрачной земли
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        
        const grid = new THREE.GridHelper(5000, 250, 0x000000, 0x000000);
        grid.material.opacity = 0.05; grid.material.transparent = true;
        scene.add(grid);

        // 4. КРАСИВЫЙ КОМПАС (Роза ветров)
        const drawCompass = () => {
            const compassGroup = new THREE.Group();
            const createPointer = (color, rotY, letter, letColor) => {
                const shape = new THREE.Shape();
                shape.moveTo(0, 0); shape.lineTo(3, 0); shape.lineTo(0, 25); shape.lineTo(-3, 0);
                const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
                const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color }));
                mesh.rotation.x = -Math.PI / 2;
                mesh.rotation.z = rotY;
                mesh.position.y = 0.5;
                compassGroup.add(mesh);

                // Буква
                const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.font = 'Bold 40px sans-serif'; ctx.fillStyle = letColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(letter, 32, 32);
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
                sprite.scale.set(15, 15, 1);
                
                // Рассчитываем позицию буквы (Y в Web-картах - это Север. В ThreeJS мы кладем Y на -Z)
                const offset = 35;
                sprite.position.set(Math.sin(rotY) * offset, 2, Math.cos(rotY) * offset);
                compassGroup.add(sprite);
            };
            // Внимание: В EPSG:3857 ось Y направлена на Север. 
            // При переносе в 3D: X -> X, Y -> -Z. Значит Север это -Z.
            createPointer(0xef4444, Math.PI, 'С', '#ef4444'); // Красный на Север (-Z)
            createPointer(0x64748b, 0, 'Ю', '#1e293b'); // Юг (+Z)
            createPointer(0x64748b, Math.PI/2, 'В', '#1e293b'); // Восток (+X)
            createPointer(0x64748b, -Math.PI/2, 'З', '#1e293b'); // Запад (-X)
            
            // Центр компаса
            const center = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1.2, 32), new THREE.MeshStandardMaterial({color: 0x334155}));
            compassGroup.add(center);
            
            // Смещаем компас в левый нижний угол сцены для красоты
            compassGroup.position.set(-100, 0, 100);
            scene.add(compassGroup);
        };
        drawCompass();

        // 5. ГРУППЫ СЛОЕВ
        const groups = { target: new THREE.Group(), parcels: new THREE.Group(), buildings: new THREE.Group(), structures: new THREE.Group(), zouit: new THREE.Group() };
        for (let k in groups) scene.add(groups[k]);

        // ==========================================================
        // ГЕНЕРАТОРЫ ГЕОМЕТРИИ
        // ==========================================================

        // Полигон с дырками в Three.js Shape
        const createShapeFromPolygon = (polyRings) => {
            const shape = new THREE.Shape();
            const outer = polyRings[0];
            shape.moveTo(outer[0].x, -outer[0].y); // Y карты переводим в -Z сцены
            for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x, -outer[i].y);
            
            // Дырки
            for(let i=1; i<polyRings.length; i++) {
                const hole = new THREE.Path();
                hole.moveTo(polyRings[i][0].x, -polyRings[i][0].y);
                for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, -polyRings[i][j].y);
                shape.holes.push(hole);
            }
            return shape;
        };

        // Генерация Трубы (для сетей и туннельных ЗОУИТ)
        const buildPipe = (pointsArray, radius, color, isUnderground, opacity = 1) => {
            const group = new THREE.Group();
            
            // Опускаем под землю или поднимаем на опоры в зависимости от типа
            // Для подземных делаем -2м, для надземных +3м, для ЗОУИТ-туннелей +2м
            let yOffset = 3;
            if (isUnderground) yOffset = -2;
            else if (opacity < 1) yOffset = 2; // ЗОУИТ чуть ниже опор

            const vecPoints = pointsArray.map(p => new THREE.Vector3(p.x, yOffset, -p.y));
            
            // Создаем плавную кривую через точки
            const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05); 
            
            const tubeGeo = new THREE.TubeGeometry(path, Math.max(20, vecPoints.length * 5), radius, 12, false);
            
            const materialParams = { color: color };
            if (opacity < 1) {
                materialParams.transparent = true;
                materialParams.opacity = opacity;
                materialParams.depthWrite = false; // Чтобы прозрачные объекты корректно накладывались
                materialParams.side = THREE.DoubleSide;
            } else {
                materialParams.metalness = 0.4;
                materialParams.roughness = 0.5;
            }

            const tube = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial(materialParams));
            
            // Тени только для непрозрачных объектов
            if (opacity === 1) tube.castShadow = !isUnderground;
            
            group.add(tube);

            // Опоры только для надземных НЕПРОЗРАЧНЫХ труб
            if (!isUnderground && opacity === 1) {
                const supportMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
                vecPoints.forEach(pt => {
                    const support = new THREE.Mesh(new THREE.CylinderGeometry(radius*0.8, radius*0.8, yOffset), supportMat);
                    support.position.set(pt.x, yOffset/2, pt.z);
                    support.castShadow = true;
                    group.add(support);
                });
            }
            return group;
        };

        // Генерация Дома (с крышей)
        const buildHouse = (shape, height, isResidential) => {
            const group = new THREE.Group();
            
            // Стены
            const wallColor = isResidential ? 0xfef3c7 : 0xe2e8f0; // Теплый для жилых, серый для нежилых
            const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
            const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.8 }));
            walls.rotation.x = Math.PI / 2;
            walls.position.y = height;
            walls.castShadow = true; walls.receiveShadow = true;
            group.add(walls);

            // Имитация крыши (чуть шире стен)
            const roofColor = isResidential ? 0x991b1b : 0x64748b; // Бордовый или темный шифер
            const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.3, bevelThickness: 0.3 });
            const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9 }));
            roof.rotation.x = Math.PI / 2;
            roof.position.y = height + 0.5;
            roof.castShadow = true;
            group.add(roof);

            return group;
        };

        // ==========================================================
        // ОТРИСОВКА ДАННЫХ
        // ==========================================================

        // 1. Исходный объект (Красная обводка/площадь)
        data.target.forEach(t => {
            t.polygons.forEach(poly => {
                if (t.type === 'Line') {
                    const pipe = buildPipe(poly[0], 0.4, 0xff0000, false);
                    groups.target.add(pipe);
                } else {
                    const shape = createShapeFromPolygon(poly);
                    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 }));
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.3;
                    
                    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 }));
                    mesh.add(edges);
                    groups.target.add(mesh);
                }
            });
        });

        // 2. Земельные участки (Лужайки)
        data.parcels.forEach(p => {
            p.polygons.forEach(poly => {
                const shape = createShapeFromPolygon(poly);
                // Ярко-зеленый цвет травы
                const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 1.0 }));
                mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.1;
                mesh.receiveShadow = true;
                
                // Тонкая зеленая рамка
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x16a34a }));
                mesh.add(edges);
                groups.parcels.add(mesh);
            });
        });

        // 3. Здания (Умная генерация)
        data.buildings.forEach(b => {
            b.polygons.forEach(poly => {
                const shape = createShapeFromPolygon(poly);
                const house = buildHouse(shape, b.meta.height, b.meta.isResidential);
                groups.buildings.add(house);
            });
        });

        // 4. Сооружения (Трубы и ЛЭП)
        data.structures.forEach(s => {
            let color = 0x94a3b8; // Серый по умолчанию
            let radius = 0.3;
            if (s.meta.isGas) { color = 0xfbbf24; radius = 0.4; } // Газ желтый
            else if (s.meta.isWater) { color = 0x3b82f6; radius = 0.5; } // Вода синяя
            else if (s.meta.isElectric) { color = 0x1e293b; radius = 0.15; } // Кабель тонкий черный
            else if (s.meta.isTelecom) { color = 0x10b981; radius = 0.1; } // Связь тонкая зеленая

            s.polygons.forEach(poly => {
                // Берем внешний контур как линию для генерации трубы
                // (если полигон очень узкий, это сработает как линия)
                // Если это честный LineString, берем его точки.
                // Если Polygon - берем внешний контур poly[0].
                
                // Для реалистичности берем внешний контур как осевую линию
                // Это упрощение для визуализации (по центру полигона было бы сложнее)
                const points = poly[0];
                
                const pipe = buildPipe(points, radius, color, s.meta.isUnderground);
                groups.structures.add(pipe);
            });
        });

        // 5. ЗОУИТ (Туннели или Объемные зоны)
        data.zouits.forEach(z => {
            let color = 0xc084fc; // Фиолетовый по умолчанию
            if (z.meta.isGas) color = 0xfbbf24;
            else if (z.meta.isWater) color = 0x3b82f6;
            else if (z.meta.isElectric) color = 0xef4444; // ЛЭП красная зона

            z.polygons.forEach(poly => {
                if (z.meta.isLinearZone) {
                    // ЕСЛИ ЭТО ЛИНЕЙНАЯ ЗОНА (ГАЗ, ЛЭП) -> РИСУЕМ КАК ТУННЕЛЬ
                    // Строим "туннель" из внешнего контура.
                    // Радиус туннеля делаем 2 метра для наглядности
                    const tunnel = buildPipe(poly[0], 2.0, color, false, 0.25);
                    groups.zouit.add(tunnel);
                } else {
                    // ЕСЛИ ЭТО ПЛОЩАДНАЯ ЗОНА -> РИСУЕМ КАК ЭКСТРУЗИЮ (СТЕНЫ ВВЕРХ)
                    const shape = createShapeFromPolygon(poly);
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 20, bevelEnabled: false }), // Высота зоны 20м
                        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 20; // Ставим на землю
                    groups.zouit.add(mesh);
                }
            });
        });

        // Убираем лоадер
        document.getElementById('loading').style.opacity = '0';
        setTimeout(() => document.getElementById('loading').remove(), 500);

        // Обработчики интерфейса
        document.getElementById('t-target').onchange = (e) => groups.target.visible = e.target.checked;
        document.getElementById('t-parcels').onchange = (e) => groups.parcels.visible = e.target.checked;
        document.getElementById('t-buildings').onchange = (e) => groups.buildings.visible = e.target.checked;
        document.getElementById('t-structures').onchange = (e) => groups.structures.visible = e.target.checked;
        document.getElementById('t-zouit').onchange = (e) => groups.zouit.visible = e.target.checked;

        // Анимация и рендер
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
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