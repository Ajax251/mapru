window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");

    setTimeout(() => {
        try {
            // 1. НАСТРОЙКА ПРОЕКЦИИ И ПОИСК ЦЕНТРА
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            const allLocalFeatures = {
                target: [], parcels: [], buildings: [], structures: [], zouits:[]
            };

            const to3857 = (yandexCoord) => {
                const trueLat = yandexCoord[0] + (window.mapOffsetY * 0.000008983);
                const trueLon = yandexCoord[1] + (window.mapOffsetX * 0.000008983);
                return window.proj4("EPSG:4326", destSc,[trueLon, trueLat]);
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
                const text = (p.descr + ' ' + (o.name || '') + ' ' + (o.params_name || '') + ' ' + (o.purpose || '') + ' ' + (o.params_purpose || '') + ' ' + (o.building_name || '') + ' ' + (o.name_by_doc || '')).toLowerCase();
                
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
                    meta.isIndustrial = text.includes('гараж') || text.includes('склад') || text.includes('цех') || text.includes('производ');
                    meta.floors = parseInt(o.floors) || (meta.isResidential ? 1 : 1);
                    meta.height = meta.floors * 3.5; 
                    meta.year = o.year || o.build_year || '';
                } 
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('кв');
                    meta.isTelecom = text.includes('связ') || text.includes('оптик');
                    meta.isRoad = text.includes('дорог') || text.includes('шоссе');
                    meta.isLinearZone = meta.isGas || meta.isWater || meta.isElectric || meta.isTelecom || text.includes('трубопровод') || text.includes('линия');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (meta.isGas || meta.isWater));
                    meta.diameter = parseFloat(o.diameter) || 0.5;
                }
                else if (category === 'parcel') {
                    meta.isParcel = true;
                    if (meta.name === 'Объект' || meta.name === meta.id) meta.name = 'Земельный участок';
                }
                return meta;
            };

            const processFeatureArray = (featuresArray, type) => {
                const result =[];
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
                    meta: { isParcel: isTargetParcel, name: obj.properties.get('cadastralNumber') || 'Целевой объект' }
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
            
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '8px';

            const createWinBtn = (symbol, hoverBg, fontSize) => {
                const btn = document.createElement('button');
                btn.innerHTML = symbol;
                Object.assign(btn.style, {
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
                    color: '#94a3b8', fontSize: fontSize, cursor: 'pointer', lineHeight: '1', 
                    padding: '4px 12px', borderRadius: '8px', transition: 'all 0.2s',
                    backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
                btn.onmouseenter = () => { btn.style.color = 'white'; btn.style.background = hoverBg; };
                btn.onmouseleave = () => { btn.style.color = '#94a3b8'; btn.style.background = 'rgba(255,255,255,0.1)'; };
                return btn;
            };

            const minBtn = createWinBtn('&minus;', 'rgba(59, 130, 246, 0.8)', '20px');
            const closeBtn = createWinBtn('&times;', 'rgba(239, 68, 68, 0.8)', '24px');
            
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#87CEEB' });

            let isMinimized = false;
            minBtn.onclick = () => {
                if(!isMinimized) {
                    modal.style.width = '350px'; modal.style.height = '48px';
                    modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px';
                    iframe.style.display = 'none';
                    minBtn.innerHTML = '&#10064;'; 
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
        body { margin: 0; overflow: hidden; background: #87CEEB; font-family: 'Segoe UI', system-ui, sans-serif; }
        #ui-panel { 
            position: absolute; top: 20px; right: 20px; 
            background: rgba(15, 23, 42, 0.85); padding: 20px; 
            border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); 
            backdrop-filter: blur(12px); width: 220px; border: 1px solid rgba(255,255,255,0.1);
            color: #e2e8f0; pointer-events: auto;
        }
        h3 { margin-top: 0; margin-bottom: 15px; color: #f8fafc; font-size: 15px; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .layer-toggle { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; font-size: 13px; font-weight: 500; transition: color 0.2s; }
        .layer-toggle:hover { color: #fff; }
        .layer-toggle input { margin-right: 10px; width: 16px; height: 16px; accent-color: #8b5cf6; cursor: pointer; }
        .color-box { width: 16px; height: 16px; border-radius: 4px; margin-right: 10px; flex-shrink: 0; box-shadow: inset 0 1px 2px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); }
        #help { position: absolute; bottom: 20px; left: 20px; background: rgba(15,23,42,0.85); color: #f8fafc; padding: 12px 20px; border-radius: 8px; font-size: 12px; border: 1px solid rgba(255,255,255,0.1); line-height: 1.5; backdrop-filter: blur(8px); pointer-events: none;}
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
    <div id="ui-panel">
        <h3>Слои и настройки</h3>
        <label class="layer-toggle"><input type="checkbox" id="t-target" checked><div class="color-box" style="background:#10b981;"></div> Исходный объект</label>
        <label class="layer-toggle"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background:#d9f99d;"></div> Земельные участки</label>
        <label class="layer-toggle"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background:#fcd34d;"></div> Здания</label>
        <label class="layer-toggle"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background:#3b82f6;"></div> Инженерные сети</label>
        <label class="layer-toggle"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background:linear-gradient(135deg, #fbbf24 50%, #a855f7 50%); opacity: 0.9;"></div> Охранные зоны</label>
        <label class="layer-toggle"><input type="checkbox" id="t-effects" checked><div class="color-box" style="background:radial-gradient(circle, #fff 0%, transparent 70%);"></div> Атмосферные эффекты</label>
        <label class="layer-toggle"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background:#fff; border: 1px solid #000;"></div> Подписи объектов</label>
    </div>
    <div id="help">
        <b style="color:#8b5cf6;">ЛКМ</b> — Вращение<br>
        <b style="color:#8b5cf6;">ПКМ</b> — Панорамирование<br>
        <b style="color:#8b5cf6;">Колесо</b> — Масштаб<br>
        Наведите мышь на здание для подсветки
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        const data = ${JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c')};
        
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.set(100, 200, 200);

        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.1;

        // --- ПРОЦЕДУРНЫЕ ТЕКСТУРЫ ---
        const TextureGenerator = {
            createGrass: () => {
                const canvas = document.createElement('canvas');
                canvas.width = 1024; canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#22c55e'; ctx.fillRect(0, 0, 1024, 1024);
                for(let i=0; i<15000; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? '#16a34a' : '#86efac';
                    ctx.fillRect(Math.random() * 1024, Math.random() * 1024, Math.random() * 3 + 1, Math.random() * 3 + 1);
                }
                const texture = new THREE.CanvasTexture(canvas);
                texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(50, 50);
                return texture;
            },
            createConcrete: () => {
                const canvas = document.createElement('canvas');
                canvas.width = 512; canvas.height = 512;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#94a3b8'; ctx.fillRect(0, 0, 512, 512);
                ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
                for(let i=0; i<50; i++) {
                    ctx.globalAlpha = Math.random() * 0.3; ctx.beginPath();
                    ctx.moveTo(Math.random()*512, Math.random()*512); ctx.lineTo(Math.random()*512, Math.random()*512);
                    ctx.stroke();
                }
                const texture = new THREE.CanvasTexture(canvas);
                texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(4, 4);
                return texture;
            }
        };

        // --- ОСВЕЩЕНИЕ И СОЛНЦЕ ПО ВРЕМЕНИ КОМПЬЮТЕРА ---
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        scene.add(hemiLight);

        const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far = 2000;
        const d = 500;
        sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
        sunLight.shadow.bias = -0.0005;
        scene.add(sunLight);

        const sunMesh = new THREE.Mesh(
            new THREE.SphereGeometry(40, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0xffe87c })
        );
        scene.add(sunMesh);

        const updateSun = () => {
            const now = new Date();
            const hours = now.getHours();
            const mins = now.getMinutes();
            const decimalTime = hours + mins / 60;
            
            let azimuth, elevation, intensity, bgColor;

            if (decimalTime >= 6 && decimalTime <= 20) {
                const progress = (decimalTime - 6) / 14; 
                azimuth = (Math.PI / 2) - (progress * Math.PI); 
                elevation = Math.sin(progress * Math.PI) * (Math.PI / 3); 
                intensity = 1.5;
                if (progress < 0.15 || progress > 0.85) {
                    bgColor = new THREE.Color(0xffa07a); 
                    sunMesh.material.color.setHex(0xff7e00);
                } else {
                    bgColor = new THREE.Color(0x87CEEB); 
                    sunMesh.material.color.setHex(0xffe87c);
                }
            } else {
                azimuth = Math.PI; elevation = Math.PI / 4; 
                intensity = 0.2;
                bgColor = new THREE.Color(0x0a1128);
                sunMesh.material.color.setHex(0xa0b0c0);
            }

            scene.background = bgColor;
            sunLight.intensity = intensity;
            const radius = 800;
            sunLight.position.set(
                Math.sin(azimuth) * Math.cos(elevation) * radius,
                Math.sin(elevation) * radius,
                Math.cos(azimuth) * Math.cos(elevation) * radius
            );
            sunMesh.position.copy(sunLight.position);
        };
        updateSun(); // Вызываем один раз при старте

        // --- БАЗОВАЯ ПОВЕРХНОСТЬ ---
        const groundGeo = new THREE.PlaneGeometry(5000, 5000, 64, 64);
        const posAttribute = groundGeo.attributes.position;
        for(let i=0; i<posAttribute.count; i++) {
            const noise = Math.sin(posAttribute.getX(i) * 0.01) * Math.cos(posAttribute.getY(i) * 0.01) * 0.5 + Math.random() * 0.2;
            posAttribute.setZ(i, noise);
        }
        groundGeo.computeVertexNormals();
        const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ 
            map: TextureGenerator.createGrass(), color: 0xffffff, roughness: 1 
        }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        
        const grid = new THREE.GridHelper(5000, 100, 0x1e293b, 0x334155);
        grid.material.opacity = 0.1; grid.material.transparent = true; grid.position.y = 0.1;
        scene.add(grid);

        // --- КРАСИВЫЙ КОМПАС БЕЗ КРУГОВ ---
        const drawCompass = () => {
            const compassGroup = new THREE.Group();
            
            const createPointer = (color, rotY, isMain) => {
                const shape = new THREE.Shape();
                const size = isMain ? 30 : 20;
                shape.moveTo(0, 0); shape.lineTo(4, 0); shape.lineTo(0, size); shape.lineTo(-4, 0);
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.5, bevelSegments: 2 }),
                    new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.4 })
                );
                mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rotY; mesh.position.y = 0.5;
                mesh.castShadow = true;
                compassGroup.add(mesh);
            };
            
            const createLetter = (letter, rotY, isMain) => {
                const canvas = document.createElement('canvas'); 
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                
                ctx.shadowColor = 'white';
                ctx.shadowBlur = 12;
                ctx.font = 'bold ' + (isMain ? '90px' : '70px') + ' sans-serif'; 
                ctx.fillStyle = isMain ? '#ef4444' : '#1e293b'; 
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                
                // Двойная отрисовка для плотности
                ctx.fillText(letter, 64, 64); ctx.fillText(letter, 64, 64);
                
                const texture = new THREE.CanvasTexture(canvas);
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
                sprite.scale.set(30, 30, 1);
                sprite.position.set(Math.sin(rotY) * 45, 2, Math.cos(rotY) * 45);
                compassGroup.add(sprite);
            };
            
            createPointer(0xef4444, Math.PI, true); createLetter('С', Math.PI, true);
            createPointer(0x1e293b, 0, false);      createLetter('Ю', 0, false);
            createPointer(0x1e293b, Math.PI/2, false); createLetter('В', Math.PI/2, false);
            createPointer(0x1e293b, -Math.PI/2, false); createLetter('З', -Math.PI/2, false);
            
            const center = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1, 32), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 }));
            center.position.y = 0.5; center.castShadow = true; compassGroup.add(center);
            
            const ring = new THREE.Mesh(new THREE.TorusGeometry(35, 0.8, 8, 64), new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.6 }));
            ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; compassGroup.add(ring);
            
            compassGroup.position.set(-150, 0, 150);
            scene.add(compassGroup);
        };
        drawCompass();

        // --- ГЕНЕРАТОР МАЛЕНЬКИХ ЧЕТКИХ ПОДПИСЕЙ ---
        const createLabel = (name, id, areaText) => {
            const canvas = document.createElement('canvas');
            canvas.width = 512; canvas.height = 180; // Высокое разрешение канваса
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.beginPath(); ctx.roundRect(10, 10, 492, 160, 20); ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 4; ctx.stroke();

            ctx.textAlign = 'center';
            ctx.font = 'bold 36px sans-serif'; ctx.fillStyle = '#ffffff';
            ctx.fillText(name || 'Объект', 256, 60, 470);
            
            ctx.font = '28px monospace'; ctx.fillStyle = '#93c5fd';
            ctx.fillText(id || '', 256, 110, 470);
            
            if (areaText) {
                ctx.font = '22px sans-serif'; ctx.fillStyle = '#a7f3d0';
                ctx.fillText(areaText, 256, 150, 470);
            }

            const texture = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
            // Маленький масштаб в 3D мире при высоком разрешении текстуры = четкость
            sprite.scale.set(30, 10.5, 1); 
            return sprite;
        };

        const groups = { 
            target: new THREE.Group(), parcels: new THREE.Group(), 
            buildings: new THREE.Group(), structures: new THREE.Group(), 
            zouit: new THREE.Group(), labels: new THREE.Group(), effects: new THREE.Group()
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

        const getCentroid = (points) => {
            let cx=0, cy=0; points.forEach(p => { cx+=p.x; cy+= -p.y; });
            return { x: cx/points.length, z: cy/points.length };
        };

        // --- ОТРИСОВКА ЦЕЛЕВОГО ОБЪЕКТА ---
        data.target.forEach(t => {
            const isTargetParcel = t.meta && t.meta.isParcel;
            const targetColor = isTargetParcel ? 0x10b981 : 0xff0000; // Зеленый для ЗУ, Красный для остальных

            t.polygons.forEach(poly => {
                if (t.type === 'Line') {
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
                        new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), 
                        new THREE.MeshStandardMaterial({ 
                            color: targetColor, transparent: true, opacity: 0.5,
                            emissive: targetColor, emissiveIntensity: 0.4
                        })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.6;
                    const edges = new THREE.LineSegments(
                        new THREE.EdgesGeometry(mesh.geometry), 
                        new THREE.LineBasicMaterial({ color: targetColor, linewidth: 4 })
                    );
                    mesh.add(edges);
                    groups.target.add(mesh);
                }
            });
            
            if(t.meta && t.meta.name && t.polygons[0]) {
                const c = getCentroid(t.polygons[0][0]);
                const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area);
                lbl.position.set(c.x, 15, c.z);
                groups.labels.add(lbl);
            }
        });

        // --- УЧАСТКИ (Выделяются на фоне земли) ---
        data.parcels.forEach(p => {
            p.polygons.forEach(poly => {
                const shape = createShape(poly);
                const mesh = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }), 
                    new THREE.MeshStandardMaterial({ color: 0xd9f99d, roughness: 0.9 }) // Салатовый цвет, чтобы не сливаться
                );
                mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4;
                mesh.receiveShadow = true;
                
                // Темно-зеленая граница участка
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(mesh.geometry), 
                    new THREE.LineBasicMaterial({ color: 0x15803d, linewidth: 2 })
                );
                mesh.add(edges);
                groups.parcels.add(mesh);

                // Деревья
                const bounds = new THREE.Box3().setFromObject(mesh);
                const size = bounds.getSize(new THREE.Vector3());
                const center = bounds.getCenter(new THREE.Vector3());
                for(let i=0; i<3; i++) {
                    const trGroup = new THREE.Group();
                    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2, 6), new THREE.MeshStandardMaterial({ color: 0x451a03 }));
                    trunk.position.y = 1; trunk.castShadow = true; trGroup.add(trunk);
                    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
                    const cr1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), foliageMat);
                    cr1.position.y = 2.5; cr1.castShadow = true; trGroup.add(cr1);
                    trGroup.position.set(center.x + (Math.random()-0.5)*size.x*0.8, 0.4, center.z + (Math.random()-0.5)*size.z*0.8);
                    groups.parcels.add(trGroup);
                }

                const c = getCentroid(poly[0]);
                const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);
                lbl.position.set(c.x, 8, c.z);
                groups.labels.add(lbl);
            });
        });

        // --- ЗДАНИЯ ---
        const concreteTex = TextureGenerator.createConcrete();
        data.buildings.forEach(b => {
            b.polygons.forEach(poly => {
                const shape = createShape(poly);
                const h = b.meta.height || 4;
                
                const wallGroup = new THREE.Group();
                const walls = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), 
                    new THREE.MeshStandardMaterial({ map: concreteTex, color: b.meta.isResidential ? 0xfef3c7 : 0xe2e8f0, roughness: 0.9 })
                );
                walls.rotation.x = Math.PI / 2; walls.position.y = h;
                walls.castShadow = true; walls.receiveShadow = true;
                walls.userData = b.meta; // Для Raycaster
                wallGroup.add(walls);

                // Окна
                const winMat = new THREE.MeshStandardMaterial({ color: 0xfffaed, emissive: 0xfffaed, emissiveIntensity: 0.3, side: THREE.DoubleSide });
                const bounds = new THREE.Box3().setFromObject(walls);
                const size = bounds.getSize(new THREE.Vector3());
                for(let i=0; i<Math.floor(h/3); i++) {
                    for(let j=0; j<3; j++) {
                        const win = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), winMat);
                        const angle = (j / 3) * Math.PI * 2;
                        const radius = Math.min(size.x, size.z) / 2;
                        win.position.set(Math.cos(angle)*radius, 3+i*3, Math.sin(angle)*radius);
                        win.lookAt(0, win.position.y, 0); win.rotateY(Math.PI/2);
                        wallGroup.add(win);
                    }
                }

                // Крыша
                const roof = new THREE.Mesh(
                    new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.2 }), 
                    new THREE.MeshStandardMaterial({ color: b.meta.isResidential ? 0x7f1d1d : 0x334155 })
                );
                roof.rotation.x = Math.PI / 2; roof.position.y = h + 0.15; roof.castShadow = true;
                wallGroup.add(roof);

                groups.buildings.add(wallGroup);

                const c = getCentroid(poly[0]);
                const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);
                lbl.position.set(c.x, h + 10, c.z);
                groups.labels.add(lbl);
            });
        });

        // --- СООРУЖЕНИЯ ---
        data.structures.forEach(s => {
            let color = 0x94a3b8; let type = 'default';
            if(s.meta.isGas) { color = 0xfbbf24; type = 'gas'; }
            if(s.meta.isWater) { color = 0x3b82f6; type = 'water'; }
            
            s.polygons.forEach(poly => {
                const yOffset = s.meta.isUnderground ? -2 : 3;
                const vecPoints = poly[0].map(pt => new THREE.Vector3(pt.x, yOffset, -pt.y));
                const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05);
                const mat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.4 });
                const tube = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(20, vecPoints.length * 5), s.meta.diameter || 0.4, 16, false), mat);
                tube.castShadow = !s.meta.isUnderground; tube.receiveShadow = true;
                groups.structures.add(tube);

                if (!s.meta.isUnderground) {
                    vecPoints.forEach((pt, idx) => {
                        if (idx % 2 === 0) {
                            const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), new THREE.MeshStandardMaterial({ color: 0x475569 }));
                            sup.position.set(pt.x, 1.5, pt.z); sup.castShadow = true;
                            groups.structures.add(sup);
                        }
                    });
                }

                const midPt = vecPoints[Math.floor(vecPoints.length/2)];
                if(midPt) {
                    const lbl = createLabel(s.meta.name, s.meta.id, s.meta.area);
                    lbl.position.set(midPt.x, midPt.y + 8, midPt.z);
                    groups.labels.add(lbl);
                }
            });
        });

        // --- ЗОУИТ ---
        data.zouits.forEach(z => {
            let color = 0xa855f7;
            if (z.meta.isGas) color = 0xfbbf24;
            else if (z.meta.isWater) color = 0x3b82f6;
            else if (z.meta.isElectric) color = 0xef4444;

            z.polygons.forEach(poly => {
                if (z.meta.isLinearZone) {
                    const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 3, -p.y));
                    const path = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.05);
                    const tunnel = new THREE.Mesh(
                        new THREE.TubeGeometry(path, 50, 2.5, 16, false),
                        new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })
                    );
                    groups.zouit.add(tunnel);
                } else {
                    const shape = createShape(poly);
                    const mesh = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 25, bevelEnabled: false }), 
                        new THREE.MeshPhysicalMaterial({ color: color, transparent: true, opacity: 0.15, emissive: color, emissiveIntensity: 0.2, depthWrite: false, side: THREE.DoubleSide })
                    );
                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 12.5;
                    groups.zouit.add(mesh);
                    
                    const line = new THREE.LineLoop(
                        new THREE.BufferGeometry().setFromPoints(poly[0].map(p => new THREE.Vector3(p.x, 0.1, -p.y))), 
                        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
                    );
                    groups.zouit.add(line);
                }

                const c = getCentroid(poly[0]);
                const lbl = createLabel(z.meta.name, z.meta.id, z.meta.area);
                lbl.position.set(c.x, 26, c.z);
                groups.labels.add(lbl);
            });
        });

        // --- АТМОСФЕРНЫЕ ЭФФЕКТЫ (Пылинки) ---
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
            const particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, transparent: true, opacity: 0.4 }));
            groups.effects.add(particles);
            
            let time = 0;
            return () => {
                time += 0.001;
                const pos = particles.geometry.attributes.position.array;
                for(let i=0; i<count; i++) {
                    pos[i*3+1] -= 0.5; if (pos[i*3+1] < 0) pos[i*3+1] = 200;
                    pos[i*3] += Math.sin(time + i) * 0.1;
                }
                particles.geometry.attributes.position.needsUpdate = true;
            };
        };
        const animateParticles = createParticles();

        // --- ИНТЕРАКТИВ И РЕНДЕР ---
        document.getElementById('t-target').onchange = (e) => groups.target.visible = e.target.checked;
        document.getElementById('t-parcels').onchange = (e) => groups.parcels.visible = e.target.checked;
        document.getElementById('t-buildings').onchange = (e) => groups.buildings.visible = e.target.checked;
        document.getElementById('t-structures').onchange = (e) => groups.structures.visible = e.target.checked;
        document.getElementById('t-zouit').onchange = (e) => groups.zouit.visible = e.target.checked;
        document.getElementById('t-effects').onchange = (e) => groups.effects.visible = e.target.checked;
        document.getElementById('t-labels').onchange = (e) => groups.labels.visible = e.target.checked;

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let hoveredObj = null;

        window.addEventListener('mousemove', (event) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            if (groups.effects.visible) animateParticles();
            
            // Подсветка зданий
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(groups.buildings.children, true);
            if (intersects.length > 0) {
                const obj = intersects[0].object;
                if (obj !== hoveredObj && obj.userData) {
                    if (hoveredObj && hoveredObj.material.emissive) hoveredObj.material.emissiveIntensity = 0;
                    hoveredObj = obj;
                    if (hoveredObj.material.emissive) {
                        hoveredObj.material.emissive.setHex(0x8b5cf6);
                        hoveredObj.material.emissiveIntensity = 0.4;
                    }
                    document.body.style.cursor = 'pointer';
                }
            } else {
                if (hoveredObj && hoveredObj.material.emissive) hoveredObj.material.emissiveIntensity = 0;
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