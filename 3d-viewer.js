window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");

    setTimeout(() => {
        try {
            // 1. НАСТРОЙКА ПРОЕКЦИИ И ПОИСК ЦЕНТРА
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            const allLocalFeatures = {
                target: [], parcels: [], buildings: [], structures:[], zouits:[]
            };

            const to3857 = (yandexCoord) => {
                const trueLat = yandexCoord[0] + (window.mapOffsetY * 0.000008983);
                const trueLon = yandexCoord[1] + (window.mapOffsetX * 0.000008983);
                return window.proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            };

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

            // 2. УМНЫЙ АНАЛИЗАТОР СВОЙСТВ
            const analyzeFeature = (f, category) => {
                const p = f.properties || {};
                const o = p.options || {};
                const text = `${p.descr || ''} ${o.name || ''} ${o.params_name || ''} ${o.purpose || ''} ${o.params_purpose || ''} ${o.building_name || ''} ${o.name_by_doc || ''}`.toLowerCase();
                
                let meta = { 
                    id: o.cad_num || o.cad_number || o.reg_numb_border || p.descr || '',
                    name: o.name || o.params_name || o.name_by_doc || o.purpose || p.descr || 'Объект',
                    area: o.build_record_area || o.area || o.specified_area || o.declared_area || o.land_record_area || '',
                    isParcel: false 
                };

                if (meta.area && !isNaN(parseFloat(meta.area))) {
                    meta.area = parseFloat(meta.area).toLocaleString('ru-RU') + ' м²';
                } else if (o.params_extension) {
                    meta.area = o.params_extension + ' м (длина)';
                }

                if (category === 'building') {
                    meta.isResidential = text.includes('жило') || text.includes('дом') || text.includes('квартир');
                    meta.floors = parseInt(o.floors) || (meta.isResidential ? 1 : 1);
                    meta.height = meta.floors * 3.5; 
                } 
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('кв');
                    meta.isTelecom = text.includes('связ') || text.includes('оптик');
                    meta.isLinearZone = meta.isGas || meta.isWater || meta.isElectric || meta.isTelecom || text.includes('трубопровод') || text.includes('линия');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (meta.isGas || meta.isWater));
                    meta.diameter = parseFloat(o.diameter) || 0.5;
                }
                else if (category === 'parcel') {
                    meta.isParcel = true;
                    meta.name = 'Земельный участок';
                }
                return meta;
            };

            const processFeatureArray = (featuresArray, type) => {
                const result = [];
                (featuresArray ||[]).forEach(f => {
                    if (!f.geometry || !f.geometry.coordinates) return;
                    const meta = analyzeFeature(f, type);
                    
                    let ringsList =[];
                    if (f.geometry.type === 'Polygon') ringsList = [f.geometry.coordinates];
                    else if (f.geometry.type === 'MultiPolygon') ringsList = f.geometry.coordinates;
                    else if (f.geometry.type.includes('Line')) {
                        ringsList = f.geometry.type === 'LineString' ? [[f.geometry.coordinates]] : f.geometry.coordinates.map(c => [c]);
                    }
                    
                    const localPolys = ringsList.map(poly => poly.map(ring => ring.map(c => {
                        return { x: c[0] - originX, y: c[1] - originY };
                    })));

                    result.push({
                        type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon',
                        polygons: localPolys,
                        meta: meta
                    });
                });
                return result;
            };

            // Обработка целевого объекта
            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates();
                const isPoly = obj.geometry.getType() === 'Polygon';
                const isTargetParcel = obj.properties.get('isParcelInQuarter') || obj.properties.get('isFoundInArea') || (obj.properties.get('featureData') && obj.properties.get('featureData').properties.category === 36368);
                const rings = isPoly ? coords : [coords];
                const localPoly = rings.map(ring => ring.map(c => {
                    const pt = to3857(c);
                    return { x: pt[0] - originX, y: pt[1] - originY };
                }));

                allLocalFeatures.target.push({ 
                    type: isPoly ? 'Polygon' : 'Line', 
                    polygons: [localPoly],
                    meta: { isParcel: isTargetParcel, name: 'Целевой объект', id: obj.properties.get('cadastralNumber') || '' }
                });
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
                backgroundColor: '#ffffff', borderRadius: '12px', zIndex: '20000',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid #cbd5e1', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                color: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: 'bold', fontSize: '15px', fontFamily: 'system-ui, sans-serif'
            });
            header.innerHTML = '<span><i class="fas fa-cube" style="color:#3b82f6; margin-right:8px;"></i> 3D Кадастровая визуализация</span>';
            
            // Кнопки управления окном
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '8px';

            const createWinBtn = (symbol, hoverBg, hoverColor) => {
                const btn = document.createElement('button');
                btn.innerHTML = symbol;
                Object.assign(btn.style, {
                    background: 'transparent', border: 'none', color: '#64748b', fontSize: '20px', 
                    cursor: 'pointer', lineHeight: '1', width: '32px', height: '32px', 
                    borderRadius: '6px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                btn.onmouseenter = () => { btn.style.background = hoverBg; btn.style.color = hoverColor; };
                btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.color = '#64748b'; };
                return btn;
            };

            const minBtn = createWinBtn('&minus;', '#e2e8f0', '#0f172a');
            const closeBtn = createWinBtn('&times;', '#fee2e2', '#dc2626');
            closeBtn.style.fontSize = '24px';
            
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#87CEEB' });

            let isMinimized = false;
            minBtn.onclick = () => {
                if(!isMinimized) {
                    modal.style.width = '300px'; modal.style.height = '45px';
                    modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px';
                    iframe.style.display = 'none';
                    minBtn.innerHTML = '&#10064;'; // Знак развертывания
                } else {
                    modal.style.width = '95%'; modal.style.height = '95%';
                    modal.style.top = '2.5%'; modal.style.left = '2.5%'; modal.style.bottom = 'auto';
                    setTimeout(() => iframe.style.display = 'block', 300);
                    minBtn.innerHTML = '&minus;';
                }
                isMinimized = !isMinimized;
            };

            closeBtn.onclick = () => modal.remove();

            btnContainer.appendChild(minBtn);
            btnContainer.appendChild(closeBtn);
            header.appendChild(btnContainer);
            modal.appendChild(header);
            
            // ====================================================================
            // THREE.JS HTML КОНТЕНТ ДЛЯ IFRAME
            // ====================================================================
            const srcDocContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; overflow: hidden; background-color: #87CEEB; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        #canvas-container { width: 100vw; height: 100vh; display: block; }
        
        #ui-panel { 
            position: absolute; top: 20px; right: 20px; 
            background: rgba(255, 255, 255, 0.95); padding: 20px; 
            border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); 
            backdrop-filter: blur(10px); width: 250px; z-index: 100; pointer-events: auto;
        }
        h3 { margin-top: 0; margin-bottom: 15px; color: #1e293b; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
        .layer-control { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; }
        .layer-control input { margin-right: 10px; cursor: pointer; width: 16px; height: 16px; accent-color: #3b82f6; }
        .layer-control label { cursor: pointer; font-size: 14px; color: #334155; font-weight: 500; }
        .color-box { width: 16px; height: 16px; display: inline-block; margin-right: 8px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0;}
        
        .info-text { 
            position: absolute; bottom: 20px; left: 20px; 
            background: rgba(0, 0, 0, 0.6); color: white; 
            padding: 10px 15px; border-radius: 8px; 
            font-size: 13px; pointer-events: none; backdrop-filter: blur(4px);
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
    <div id="canvas-container"></div>
    <div id="ui-panel">
        <h3>Слои 3D сцены</h3>
        <div class="layer-control"><input type="checkbox" id="t-target" checked><div class="color-box" style="background: #22c55e;"></div><label for="t-target">Целевой объект</label></div>
        <div class="layer-control"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background: #a8d5ba;"></div><label for="t-parcels">Земельные участки</label></div>
        <div class="layer-control"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background: #e2e8f0;"></div><label for="t-buildings">Здания (ОКС)</label></div>
        <div class="layer-control"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background: #3b82f6;"></div><label for="t-structures">Сооружения / Сети</label></div>
        <div class="layer-control"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background: rgba(168, 85, 247, 0.4);"></div><label for="t-zouit">ЗОУИТ</label></div>
        <div class="layer-control" style="margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 10px;"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background: #fff; border: 1px solid #94a3b8;"></div><label for="t-labels">Показать подписи</label></div>
    </div>
    <div class="info-text">
        🖱️ Левая кнопка: вращение | 🖱️ Правая кнопка: панорама | 🖱️ Колесико: масштаб
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        const data = ${JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c')};
        
        // 1. БАЗОВАЯ НАСТРОЙКА СЦЕНЫ
        const container = document.getElementById('canvas-container');
        const scene = new THREE.Scene();
        
        // Расчет солнца по времени (чтобы цвет неба и свет зависели от реальности)
        const now = new Date();
        const hours = now.getHours();
        const mins = now.getMinutes();
        const decimalTime = hours + mins / 60;
        
        let sunAzimuth, sunElevation, lightIntensity, bgColorHex;
        
        if (decimalTime >= 5 && decimalTime <= 21) {
            // День
            const progress = (decimalTime - 5) / 16; 
            sunAzimuth = (Math.PI / 2) - (progress * Math.PI); // Восток -> Юг -> Запад
            sunElevation = Math.sin(progress * Math.PI) * (Math.PI / 2.5); // Высота дуги
            lightIntensity = 1.3;
            if (progress < 0.1 || progress > 0.9) bgColorHex = 0xffa07a; // Рассвет/Закат
            else bgColorHex = 0x87CEEB; // Ясное небо
        } else {
            // Ночь
            sunAzimuth = Math.PI; sunElevation = Math.PI / 4; 
            lightIntensity = 0.2; bgColorHex = 0x0a1128;
        }

        scene.background = new THREE.Color(bgColorHex);
        scene.fog = new THREE.Fog(bgColorHex, 100, 400); // Легкая дымка на горизонте, как в примере

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
        camera.position.set(50, 40, 60);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.1; // Разрешаем смотреть чуть снизу

        // 2. ОСВЕЩЕНИЕ
        const ambientLight = new THREE.AmbientLight(0xffffff, decimalTime >= 5 && decimalTime <= 21 ? 0.5 : 0.1);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xfffaed, lightIntensity);
        const radius = 500;
        sunLight.position.set(
            Math.sin(sunAzimuth) * Math.cos(sunElevation) * radius,
            Math.sin(sunElevation) * radius,
            Math.cos(sunAzimuth) * Math.cos(sunElevation) * radius
        );
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.top = 200; sunLight.shadow.camera.bottom = -200;
        sunLight.shadow.camera.left = -200; sunLight.shadow.camera.right = 200;
        sunLight.shadow.camera.near = 10; sunLight.shadow.camera.far = 1000;
        sunLight.shadow.bias = -0.0005;
        scene.add(sunLight);

        // Визуальное солнце
        const sunMesh = new THREE.Mesh(
            new THREE.SphereGeometry(20, 32, 32),
            new THREE.MeshBasicMaterial({ color: (decimalTime >= 5 && decimalTime <= 21) ? 0xffe87c : 0xdddddd })
        );
        sunMesh.position.copy(sunLight.position);
        scene.add(sunMesh);

        // 3. БАЗОВАЯ ПОВЕРХНОСТЬ И СЕТКА
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(2000, 2000),
            new THREE.MeshStandardMaterial({ color: 0xe8e6d9, transparent: true, opacity: 0.8, depthWrite: false })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const grid = new THREE.GridHelper(2000, 200, 0x000000, 0x000000);
        grid.material.opacity = 0.1; grid.material.transparent = true; grid.position.y = 0.01;
        scene.add(grid);

        // 4. КРАСИВЫЙ КОМПАС (БЕЗ КРУГОВ, ТОЛЬКО БУКВЫ)
        const drawCompass = () => {
            const compassGroup = new THREE.Group();
            
            const createLetter = (letter, rotY, isMain) => {
                const canvas = document.createElement('canvas'); 
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                
                // Тень-ореол вокруг букв для читаемости
                ctx.shadowColor = 'rgba(255, 255, 255, 1)';
                ctx.shadowBlur = 8;
                ctx.font = 'bold ' + (isMain ? '90px' : '70px') + ' Arial'; 
                ctx.fillStyle = isMain ? '#dc2626' : '#334155'; // Красный для Севера, темно-серый для остальных
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                
                // Рисуем несколько раз для плотности
                ctx.fillText(letter, 64, 64); ctx.fillText(letter, 64, 64);
                
                const texture = new THREE.CanvasTexture(canvas);
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
                sprite.scale.set(15, 15, 1);
                sprite.position.set(Math.sin(rotY) * 20, 2, Math.cos(rotY) * 20);
                compassGroup.add(sprite);
            };
            
            createLetter('С', Math.PI, true);  
            createLetter('Ю', 0, false);       
            createLetter('В', Math.PI/2, false); 
            createLetter('З', -Math.PI/2, false); 
            
            // Центральный маркер
            const center = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
            center.position.y = 0.25; center.castShadow = true; compassGroup.add(center);
            
            compassGroup.position.set(-60, 0, 60); // Размещаем слева-снизу от центра
            scene.add(compassGroup);
        };
        drawCompass();

        // 5. ГРУППЫ СЛОЕВ
        const groups = { 
            target: new THREE.Group(), parcels: new THREE.Group(), 
            buildings: new THREE.Group(), structures: new THREE.Group(), 
            zouit: new THREE.Group(), labels: new THREE.Group()
        };
        for (let k in groups) scene.add(groups[k]);

        // 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ГЕНЕРАЦИИ
        const createShape = (polyRings) => {
            const shape = new THREE.Shape();
            const outer = polyRings[0];
            shape.moveTo(outer[0].x, -outer[0].y); // Отрицательный Y из-за специфики 2D -> 3D
            for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x, -outer[i].y);
            
            for(let i=1; i<polyRings.length; i++) {
                const hole = new THREE.Path();
                hole.moveTo(polyRings[i][0].x, -polyRings[i][0].y);
                for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, -polyRings[i][j].y);
                shape.holes.push(hole);
            }
            return shape;
        };

        const getCentroid = (points) => {
            let cx=0, cy=0; points.forEach(p => { cx+=p.x; cy+= -p.y; });
            return { x: cx/points.length, z: cy/points.length };
        };

        // Аккуратные маленькие таблички
        const createLabel = (name, id, areaText) => {
            const canvas = document.createElement('canvas');
            canvas.width = 600; canvas.height = 200; // Высокое разрешение
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath(); ctx.roundRect(10, 10, 580, 180, 16); ctx.fill();
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
            ctx.lineWidth = 4; ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 36px "Segoe UI", sans-serif';
            ctx.fillText(name || 'Объект', 300, 65, 560);
            
            ctx.fillStyle = '#2563eb';
            ctx.font = '32px monospace';
            ctx.fillText(id || '', 300, 115, 560);
            
            if (areaText) {
                ctx.fillStyle = '#64748b';
                ctx.font = '26px "Segoe UI", sans-serif';
                ctx.fillText(areaText, 300, 160, 560);
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
            sprite.scale.set(15, 5, 1); // Делаем их маленькими в 3D мире!
            return sprite;
        };

        // 7. ОТРИСОВКА ДАННЫХ В КАДАСТРОВОМ СТИЛЕ

        // ИСХОДНЫЙ ОБЪЕКТ
        data.target.forEach(t => {
            const isTargetParcel = t.meta && t.meta.isParcel;
            const targetColor = isTargetParcel ? 0x22c55e : 0xef4444; // Зеленый для ЗУ, Красный для других
            const lineColor = isTargetParcel ? 0x14532d : 0x7f1d1d;
            
            t.polygons.forEach(poly => {
                if (t.type === 'Line') {
                    const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 0.5, -p.y));
                    const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.01);
                    const tube = new THREE.Mesh(
                        new THREE.TubeGeometry(path, 50, 0.5, 8, false),
                        new THREE.MeshStandardMaterial({ color: targetColor })
                    );
                    tube.castShadow = true;
                    groups.target.add(tube);
                } else {
                    const shape = createShape(poly);
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), 
                        new THREE.MeshStandardMaterial({ color: targetColor, roughness: 0.7 })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.6; // Сидит на земле
                    mesh.castShadow = true; mesh.receiveShadow = true;
                    
                    const edges = new THREE.LineSegments(
                        new THREE.EdgesGeometry(mesh.geometry), 
                        new THREE.LineBasicMaterial({ color: lineColor, linewidth: 3 })
                    );
                    mesh.add(edges);
                    groups.target.add(mesh);
                }
            });
            
            if(t.meta && t.polygons[0]) {
                const c = getCentroid(t.polygons[0][0]);
                const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area);
                lbl.position.set(c.x, 5, c.z);
                groups.labels.add(lbl);
            }
        });

        // УЧАСТКИ
        data.parcels.forEach(p => {
            p.polygons.forEach(poly => {
                const shape = createShape(poly);
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), 
                    new THREE.MeshStandardMaterial({ color: 0xa8d5ba, roughness: 0.9 })
                );
                mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5;
                mesh.castShadow = true; mesh.receiveShadow = true;
                
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(mesh.geometry), 
                    new THREE.LineBasicMaterial({ color: 0x2e7d32, linewidth: 2 })
                );
                mesh.add(edges);
                groups.parcels.add(mesh);

                const c = getCentroid(poly[0]);
                const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);
                lbl.position.set(c.x, 4, c.z);
                groups.labels.add(lbl);
            });
        });

        // ЗДАНИЯ (ОКС)
        data.buildings.forEach(b => {
            b.polygons.forEach(poly => {
                const shape = createShape(poly);
                const h = b.meta.height || 4;
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), 
                    new THREE.MeshStandardMaterial({ color: b.meta.isResidential ? 0xe2e8f0 : 0xcbd5e1, roughness: 0.8 })
                );
                mesh.rotation.x = Math.PI / 2; mesh.position.y = h + 0.5; // Ставим поверх участка
                mesh.castShadow = true; mesh.receiveShadow = true;
                
                // Обводка дома
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(mesh.geometry), 
                    new THREE.LineBasicMaterial({ color: 0x94a3b8 })
                );
                mesh.add(edges);
                groups.buildings.add(mesh);

                const c = getCentroid(poly[0]);
                const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);
                lbl.position.set(c.x, h + 3, c.z);
                groups.labels.add(lbl);
            });
        });

        // СООРУЖЕНИЯ (Трубы)
        data.structures.forEach(s => {
            let color = 0x94a3b8;
            if(s.meta.isGas) color = 0xfbbf24;
            if(s.meta.isWater) color = 0x3b82f6;
            
            s.polygons.forEach(poly => {
                const yOffset = s.meta.isUnderground ? -1.5 : 2;
                const vecPoints = poly[0].map(pt => new THREE.Vector3(pt.x, yOffset, -pt.y));
                const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05);
                const tube = new THREE.Mesh(
                    new THREE.TubeGeometry(path, Math.max(10, vecPoints.length * 2), s.meta.diameter || 0.3, 8, false),
                    new THREE.MeshStandardMaterial({ color: color })
                );
                if (!s.meta.isUnderground) tube.castShadow = true;
                groups.structures.add(tube);

                const midPt = vecPoints[Math.floor(vecPoints.length/2)];
                if(midPt) {
                    const lbl = createLabel(s.meta.name, s.meta.id, s.meta.area);
                    lbl.position.set(midPt.x, midPt.y + 2, midPt.z);
                    groups.labels.add(lbl);
                }
            });
        });

        // ЗОУИТ
        data.zouits.forEach(z => {
            let color = 0xa855f7;
            if (z.meta.isGas) color = 0xfbbf24;
            if (z.meta.isWater) color = 0x3b82f6;
            
            z.polygons.forEach(poly => {
                if (z.meta.isLinearZone) {
                    const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 0.5, -p.y));
                    const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05);
                    const tunnel = new THREE.Mesh(
                        new THREE.TubeGeometry(path, 20, 3, 8, false),
                        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })
                    );
                    groups.zouit.add(tunnel);
                } else {
                    const shape = createShape(poly);
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false }), 
                        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 10;
                    groups.zouit.add(mesh);
                }

                const c = getCentroid(poly[0]);
                const lbl = createLabel('ЗОУИТ: ' + z.meta.name, z.meta.id, z.meta.area);
                lbl.position.set(c.x, 12, c.z);
                groups.labels.add(lbl);
            });
        });

        // Обработка галочек меню
        document.getElementById('t-target').onchange = (e) => groups.target.visible = e.target.checked;
        document.getElementById('t-parcels').onchange = (e) => groups.parcels.visible = e.target.checked;
        document.getElementById('t-buildings').onchange = (e) => groups.buildings.visible = e.target.checked;
        document.getElementById('t-structures').onchange = (e) => groups.structures.visible = e.target.checked;
        document.getElementById('t-zouit').onchange = (e) => groups.zouit.visible = e.target.checked;
        document.getElementById('t-labels').onchange = (e) => groups.labels.visible = e.target.checked;

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