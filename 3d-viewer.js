window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");

    setTimeout(() => {
        try {
            // 1. НАСТРОЙКА ПРОЕКЦИИ И ПОИСК ЦЕНТРА
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            const allLocalFeatures = {
                target: [], parcels:[], buildings: [], structures: [], zouits:[]
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

            // Обработка целевого объекта (проверяем, является ли он ЗУ)
            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates();
                const isPoly = obj.geometry.getType() === 'Polygon';
                
                // Проверяем, участок ли это
                const isTargetParcel = obj.properties.get('isParcelInQuarter') || 
                                       obj.properties.get('isFoundInArea') || 
                                       (obj.properties.get('featureData') && obj.properties.get('featureData').properties.category === 36368);

                const rings = isPoly ? coords : [coords];
                const localPoly = rings.map(ring => ring.map(c => {
                    const pt = to3857(c);
                    return { x: pt[0] - originX, y: pt[1] - originY };
                }));

                allLocalFeatures.target.push({ 
                    type: isPoly ? 'Polygon' : 'Line', 
                    polygons: [localPoly],
                    meta: { isParcel: isTargetParcel }
                });
            });

            allLocalFeatures.parcels = processFeatureArray(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFeatureArray(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFeatureArray(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFeatureArray(window.zouitFeaturesData, 'zouit');

            // 4. СОЗДАНИЕ UI
            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '2.5%', left: '2.5%', width: '95%', height: '95%',
                backgroundColor: '#ffffff', borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid #cbd5e1', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });

            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '12px 20px', background: 'linear-gradient(90deg, #0f172a, #1e293b)',
                color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: 'bold', fontSize: '16px', fontFamily: 'system-ui, sans-serif',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)', cursor: 'default'
            });
            header.innerHTML = '<span><i class="fas fa-cube" style="color:#8b5cf6; margin-right:8px;"></i> 3D Визуализация территории</span>';
            
            // Контейнер для кнопок управления окном
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '8px';

            const createWinBtn = (symbol, hoverColor) => {
                const btn = document.createElement('button');
                btn.innerHTML = symbol;
                Object.assign(btn.style, {
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
                    color: '#94a3b8', fontSize: '20px', cursor: 'pointer', lineHeight: '1', 
                    padding: '4px 12px', borderRadius: '8px', transition: 'all 0.2s',
                    backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                btn.onmouseenter = () => { btn.style.color = 'white'; btn.style.background = hoverColor; };
                btn.onmouseleave = () => { btn.style.color = '#94a3b8'; btn.style.background = 'rgba(255,255,255,0.1)'; };
                return btn;
            };

            const minBtn = createWinBtn('&minus;', 'rgba(59, 130, 246, 0.8)');
            const closeBtn = createWinBtn('&times;', 'rgba(239, 68, 68, 0.8)');
            closeBtn.style.fontSize = '24px';
            
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#87CEEB' });

            let isMinimized = false;
            minBtn.onclick = () => {
                if(!isMinimized) {
                    modal.style.width = '350px';
                    modal.style.height = '48px';
                    modal.style.top = 'auto';
                    modal.style.bottom = '20px';
                    modal.style.left = '20px';
                    iframe.style.display = 'none';
                    minBtn.innerHTML = '&#10064;'; // Знак развертывания
                } else {
                    modal.style.width = '95%';
                    modal.style.height = '95%';
                    modal.style.top = '2.5%';
                    modal.style.left = '2.5%';
                    modal.style.bottom = 'auto';
                    setTimeout(() => iframe.style.display = 'block', 300); // Возвращаем после анимации
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
        body { margin: 0; overflow: hidden; background: #87CEEB; font-family: 'Segoe UI', system-ui, sans-serif; }
        #ui-panel { 
            position: absolute; top: 20px; right: 20px; 
            background: rgba(15, 23, 42, 0.85); padding: 20px; 
            border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); 
            backdrop-filter: blur(12px); width: 220px; border: 1px solid rgba(255,255,255,0.1);
            color: #e2e8f0;
        }
        h3 { margin-top: 0; margin-bottom: 15px; color: #f8fafc; font-size: 15px; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .layer-toggle { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; font-size: 13px; font-weight: 500; transition: color 0.2s; }
        .layer-toggle:hover { color: #fff; }
        .layer-toggle input { margin-right: 10px; width: 16px; height: 16px; accent-color: #8b5cf6; cursor: pointer; }
        .color-box { width: 16px; height: 16px; border-radius: 4px; margin-right: 10px; flex-shrink: 0; box-shadow: inset 0 1px 2px rgba(0,0,0,0.3); }
        
        #time-display {
            position: absolute; top: 20px; left: 20px;
            background: rgba(15, 23, 42, 0.7); color: #fbbf24;
            padding: 8px 16px; border-radius: 8px; font-size: 18px; font-weight: bold;
            border: 1px solid rgba(251, 191, 36, 0.3); backdrop-filter: blur(4px);
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
    <div id="time-display">Солнце...</div>
    <div id="ui-panel">
        <h3>Слои и настройки</h3>
        <label class="layer-toggle"><input type="checkbox" id="t-target" checked><div class="color-box" style="background:#10b981;"></div> Исходный объект</label>
        <label class="layer-toggle"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background:#4ade80;"></div> Земельные участки</label>
        <label class="layer-toggle"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background:#fcd34d;"></div> Здания</label>
        <label class="layer-toggle"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background:#3b82f6;"></div> Инженерные сети</label>
        <label class="layer-toggle"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background:#a855f7;"></div> Охранные зоны</label>
        <label class="layer-toggle"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background:#fff; border: 1px solid #000;"></div> Подписи объектов</label>
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        const data = ${JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c')};
        
        // 1. СЦЕНА
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.set(100, 200, 200);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2 + 0.1;

        // 2. СВЕТ И СОЛНЦЕ (По времени)
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        scene.add(hemiLight);

        const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far = 2000;
        const d = 500;
        sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
        scene.add(sunLight);

        // Визуальное солнце
        const sunGeo = new THREE.SphereGeometry(30, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe87c });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        scene.add(sunMesh);

        // Расчет положения солнца
        const updateSun = () => {
            const now = new Date();
            const hours = now.getHours();
            const mins = now.getMinutes();
            const decimalTime = hours + mins / 60;
            
            document.getElementById('time-display').innerText = \`Время: \${String(hours).padStart(2,'0')}:\${String(mins).padStart(2,'0')}\`;

            // Условный световой день с 6:00 до 18:00
            // 6:00 - Восток (+X), 12:00 - Юг (+Z), 18:00 - Запад (-X)
            let azimuth, elevation, intensity, bgColor;

            if (decimalTime >= 6 && decimalTime <= 19) {
                // День
                const progress = (decimalTime - 6) / 13; // 0 to 1
                azimuth = (Math.PI / 2) - (progress * Math.PI); // От PI/2 до -PI/2
                elevation = Math.sin(progress * Math.PI) * (Math.PI / 3); // Дуга вверх до 60 град
                intensity = 1.5;
                
                if (progress < 0.2 || progress > 0.8) {
                    bgColor = new THREE.Color(0xffa07a); // Рассвет/Закат
                    sunMat.color.setHex(0xff7e00);
                } else {
                    bgColor = new THREE.Color(0x87CEEB); // День
                    sunMat.color.setHex(0xffe87c);
                }
            } else {
                // Ночь (Луна)
                azimuth = Math.PI; 
                elevation = Math.PI / 4;
                intensity = 0.2;
                bgColor = new THREE.Color(0x0a1128);
                sunMat.color.setHex(0xa0b0c0);
                document.getElementById('time-display').innerText += " (Ночь)";
            }

            scene.background = bgColor;
            sunLight.intensity = intensity;

            const radius = 800;
            sunLight.position.x = Math.sin(azimuth) * Math.cos(elevation) * radius;
            sunLight.position.y = Math.sin(elevation) * radius;
            sunLight.position.z = Math.cos(azimuth) * Math.cos(elevation) * radius;
            
            sunMesh.position.copy(sunLight.position);
        };
        updateSun();

        // 3. ЗЕМЛЯ И СЕТКА
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(5000, 5000),
            new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 1 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        
        const grid = new THREE.GridHelper(5000, 100, 0x1e293b, 0x334155);
        grid.material.opacity = 0.15; grid.material.transparent = true; grid.position.y = 0.1;
        scene.add(grid);

        // 4. КОМПАС (ТОЛЬКО БУКВЫ С ТЕНЬЮ)
        const drawCompass = () => {
            const compassGroup = new THREE.Group();
            
            const createLetter = (letter, rotY, isMain) => {
                const canvas = document.createElement('canvas'); 
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                
                // Настраиваем тень-свечение вокруг текста
                ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                ctx.font = \`Bold \${isMain ? '90px' : '70px'} Arial\`; 
                ctx.fillStyle = isMain ? '#ef4444' : '#1e293b'; 
                ctx.textAlign = 'center'; 
                ctx.textBaseline = 'middle';
                
                // Рисуем текст дважды для плотности
                ctx.fillText(letter, 64, 64);
                ctx.fillText(letter, 64, 64);
                
                const texture = new THREE.CanvasTexture(canvas);
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
                sprite.scale.set(40, 40, 1);
                
                const offset = 60;
                sprite.position.set(Math.sin(rotY) * offset, 2, Math.cos(rotY) * offset);
                compassGroup.add(sprite);
            };
            
            createLetter('С', Math.PI, true);  // Север (-Z)
            createLetter('Ю', 0, false);       // Юг (+Z)
            createLetter('В', Math.PI/2, false); // Восток (+X)
            createLetter('З', -Math.PI/2, false); // Запад (-X)
            
            compassGroup.position.set(-150, 0, 150);
            scene.add(compassGroup);
        };
        drawCompass();

        // 5. ГЕНЕРАТОР ПОДПИСЕЙ (СПРАЙТЫ)
        const createLabel = (name, id, areaText) => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.beginPath();
            ctx.roundRect(10, 10, 492, 160, 15);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.textAlign = 'center';
            
            // Имя
            ctx.font = 'bold 36px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(name || 'Объект', 256, 60, 470);
            
            // ID
            ctx.font = '28px monospace';
            ctx.fillStyle = '#93c5fd'; // Голубой
            ctx.fillText(id || '', 256, 110, 470);
            
            // Площадь
            if (areaText) {
                ctx.font = '22px sans-serif';
                ctx.fillStyle = '#a7f3d0'; // Светло-зеленый
                ctx.fillText(areaText, 256, 150, 470);
            }

            const texture = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
            sprite.scale.set(60, 21, 1);
            return sprite;
        };

        // 6. ОТРИСОВКА ДАННЫХ
        const groups = { 
            target: new THREE.Group(), parcels: new THREE.Group(), 
            buildings: new THREE.Group(), structures: new THREE.Group(), 
            zouit: new THREE.Group(), labels: new THREE.Group()
        };
        for (let k in groups) scene.add(groups[k]);

        const createShape = (polyRings) => {
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

        // Центр масс для ярлыков
        const getCentroid = (points) => {
            let cx=0, cy=0;
            points.forEach(p => { cx+=p.x; cy+= -p.y; });
            return { x: cx/points.length, z: cy/points.length };
        };

        // Исходный объект (Зеленый если ЗУ, Красный если другой)
        data.target.forEach(t => {
            const isTargetParcel = t.meta && t.meta.isParcel;
            const targetColor = isTargetParcel ? 0x10b981 : 0xff0000; // Зеленый или Красный

            t.polygons.forEach(poly => {
                if (t.type === 'Line') {
                    // Рисуем трубу для линии
                    const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 3, -p.y));
                    const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05);
                    const tube = new THREE.Mesh(
                        new THREE.TubeGeometry(path, 50, 0.8, 16, false),
                        new THREE.MeshStandardMaterial({ color: targetColor, emissive: targetColor, emissiveIntensity: 0.5 })
                    );
                    groups.target.add(tube);
                } else {
                    const shape = createShape(poly);
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), 
                        new THREE.MeshStandardMaterial({ 
                            color: targetColor, transparent: true, opacity: 0.4,
                            emissive: targetColor, emissiveIntensity: 0.3
                        })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4;
                    const edges = new THREE.LineSegments(
                        new THREE.EdgesGeometry(mesh.geometry), 
                        new THREE.LineBasicMaterial({ color: targetColor, linewidth: 3 })
                    );
                    mesh.add(edges);
                    groups.target.add(mesh);
                }
            });
        });

        // Участки
        data.parcels.forEach(p => {
            p.polygons.forEach(poly => {
                const shape = createShape(poly);
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false }), 
                    new THREE.MeshStandardMaterial({ color: 0xa7f3d0, roughness: 1 })
                );
                mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.1;
                mesh.receiveShadow = true;
                groups.parcels.add(mesh);

                const c = getCentroid(poly[0]);
                const lbl = createLabel('Земельный участок', p.meta.id, p.meta.area);
                lbl.position.set(c.x, 8, c.z);
                groups.labels.add(lbl);
            });
        });

        // Здания
        data.buildings.forEach(b => {
            b.polygons.forEach(poly => {
                const shape = createShape(poly);
                const h = b.meta.height || 4;
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), 
                    new THREE.MeshStandardMaterial({ color: b.meta.isResidential ? 0xfef3c7 : 0xe2e8f0 })
                );
                mesh.rotation.x = Math.PI / 2; mesh.position.y = h;
                mesh.castShadow = true; mesh.receiveShadow = true;
                groups.buildings.add(mesh);

                const c = getCentroid(poly[0]);
                const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);
                lbl.position.set(c.x, h + 15, c.z);
                groups.labels.add(lbl);
            });
        });

        // Сооружения
        data.structures.forEach(s => {
            let color = 0x94a3b8;
            if(s.meta.isGas) color = 0xfbbf24;
            if(s.meta.isWater) color = 0x3b82f6;
            
            s.polygons.forEach(poly => {
                const vecPoints = poly[0].map(pt => new THREE.Vector3(pt.x, s.meta.isUnderground ? -2 : 3, -pt.y));
                const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05);
                const tube = new THREE.Mesh(
                    new THREE.TubeGeometry(path, Math.max(20, vecPoints.length * 5), s.meta.diameter || 0.4, 16, false),
                    new THREE.MeshStandardMaterial({ color: color })
                );
                tube.castShadow = !s.meta.isUnderground;
                groups.structures.add(tube);

                const midPt = vecPoints[Math.floor(vecPoints.length/2)];
                if(midPt) {
                    const lbl = createLabel(s.meta.name, s.meta.id, s.meta.area);
                    lbl.position.set(midPt.x, midPt.y + 12, midPt.z);
                    groups.labels.add(lbl);
                }
            });
        });

        // ЗОУИТ
        data.zouits.forEach(z => {
            let color = 0xa855f7;
            z.polygons.forEach(poly => {
                const shape = createShape(poly);
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 15, bevelEnabled: false }), 
                    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })
                );
                mesh.rotation.x = Math.PI / 2; mesh.position.y = 7.5;
                groups.zouit.add(mesh);

                const c = getCentroid(poly[0]);
                const lbl = createLabel('ЗОУИТ: ' + z.meta.name, z.meta.id, z.meta.area);
                lbl.position.set(c.x, 25, c.z);
                groups.labels.add(lbl);
            });
        });

        // UI Toggles
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