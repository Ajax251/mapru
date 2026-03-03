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
                    meta.floors = parseInt(o.floors) || (meta.isResidential ? 1 : 1);
                    meta.height = meta.floors * 3.5; 
                } 
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('кв') || text.includes('воздушн');
                    meta.isTelecom = text.includes('связ') || text.includes('оптик');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (meta.isGas || meta.isWater));
                    meta.diameter = parseFloat(o.diameter) || 0.3;
                    meta.voltage = o.voltage || o.params_voltage || '';
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
            header.innerHTML = '<span><i class="fas fa-cube" style="color:#3b82f6; margin-right:8px;"></i> 3D визуализация</span>';
            
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
            // THREE.JS HTML КОНТЕНТ ДЛЯ IFRAME (Безопасная конкатенация)
            // ====================================================================
            const srcDocContent = '<!DOCTYPE html>\n' +
'<html lang="ru">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <style>\n' +
'        body { margin: 0; overflow: hidden; background-color: #87CEEB; font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; }\n' +
'        #ui-panel { \n' +
'            position: absolute; top: 20px; right: 20px; \n' +
'            background: rgba(255, 255, 255, 0.95); padding: 20px; \n' +
'            border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); \n' +
'            backdrop-filter: blur(10px); width: 250px; z-index: 100; pointer-events: auto;\n' +
'        }\n' +
'        h3 { margin-top: 0; margin-bottom: 15px; color: #1e293b; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }\n' +
'        .layer-control { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; }\n' +
'        .layer-control input { margin-right: 10px; cursor: pointer; width: 16px; height: 16px; accent-color: #3b82f6; }\n' +
'        .layer-control label { cursor: pointer; font-size: 14px; color: #334155; font-weight: 500; }\n' +
'        .color-box { width: 16px; height: 16px; display: inline-block; margin-right: 8px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0;}\n' +
'        .info-text { \n' +
'            position: absolute; bottom: 20px; left: 20px; \n' +
'            background: rgba(0, 0, 0, 0.7); color: white; \n' +
'            padding: 12px 18px; border-radius: 8px; \n' +
'            font-size: 13px; pointer-events: none; backdrop-filter: blur(4px);\n' +
'            font-weight: 500;\n' +
'        }\n' +
'    </style>\n' +
'    <script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>\n' +
'    <script type="importmap">\n' +
'        {\n' +
'            "imports": {\n' +
'                "three": "https://unpkg.com/three@0.160.0/build/three.module.js",\n' +
'                "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"\n' +
'            }\n' +
'        }\n' +
'    <\/script>\n' +
'</head>\n' +
'<body>\n' +
'    <div id="ui-panel">\n' +
'        <h3>Слои 3D сцены</h3>\n' +
'        <div class="layer-control"><input type="checkbox" id="t-target" checked><div class="color-box" style="background: #22c55e;"></div><label for="t-target">Целевой объект</label></div>\n' +
'        <div class="layer-control"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background: #a8d5ba;"></div><label for="t-parcels">Земельные участки</label></div>\n' +
'        <div class="layer-control"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background: #e2e8f0;"></div><label for="t-buildings">Здания (ОКС)</label></div>\n' +
'        <div class="layer-control"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background: #3b82f6;"></div><label for="t-structures">Сооружения / Сети</label></div>\n' +
'        <div class="layer-control"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background: #fbbf24; opacity: 0.6;"></div><label for="t-zouit">ЗОУИТ</label></div>\n' +
'        <div class="layer-control" style="margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 10px;"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background: #fff; border: 1px solid #94a3b8;"></div><label for="t-labels">Показать подписи</label></div>\n' +
'    </div>\n' +
'    <div class="info-text">\n' +
'        ЛКМ: вращение | ПКМ: панорама | Колесико: масштаб\n' +
'    </div>\n' +
'    <script type="module">\n' +
'        import * as THREE from "three";\n' +
'        import { OrbitControls } from "three/addons/controls/OrbitControls.js";\n' +
'        const data = ' + JSON.stringify(allLocalFeatures) + ';\n' +
'        \n' +
'        const scene = new THREE.Scene();\n' +
'        scene.background = new THREE.Color(0x87CEEB);\n' +
'        scene.fog = new THREE.Fog(0x87CEEB, 80, 300);\n' +
'        \n' +
'        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);\n' +
'        camera.position.set(60, 50, 70);\n' +
'\n' +
'        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });\n' +
'        renderer.setSize(window.innerWidth, window.innerHeight);\n' +
'        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));\n' +
'        renderer.shadowMap.enabled = true;\n' +
'        renderer.shadowMap.type = THREE.PCFSoftShadowMap;\n' +
'        document.body.appendChild(renderer.domElement);\n' +
'\n' +
'        const controls = new OrbitControls(camera, renderer.domElement);\n' +
'        controls.enableDamping = true;\n' +
'        controls.dampingFactor = 0.05;\n' +
'        controls.maxPolarAngle = Math.PI / 2 + 0.15;\n' +
'        controls.minDistance = 10;\n' +
'        controls.maxDistance = 400;\n' +
'\n' +
'        // Улучшенное освещение\n' +
'        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);\n' +
'        scene.add(ambientLight);\n' +
'\n' +
'        const sunLight = new THREE.DirectionalLight(0xfffaed, 1.2);\n' +
'        sunLight.position.set(100, 100, 50);\n' +
'        sunLight.castShadow = true;\n' +
'        sunLight.shadow.mapSize.width = 4096;\n' +
'        sunLight.shadow.mapSize.height = 4096;\n' +
'        sunLight.shadow.camera.top = 200; sunLight.shadow.camera.bottom = -100;\n' +
'        sunLight.shadow.camera.left = -200; sunLight.shadow.camera.right = 200;\n' +
'        sunLight.shadow.camera.near = 0.5; sunLight.shadow.camera.far = 500;\n' +
'        sunLight.shadow.bias = -0.0001;\n' +
'        scene.add(sunLight);\n' +
'\n' +
'        // Пол\n' +
'        const ground = new THREE.Mesh(\n' +
'            new THREE.PlaneGeometry(2000, 2000),\n' +
'            new THREE.MeshStandardMaterial({ color: 0xe8e6d9, roughness: 1, metalness: 0 })\n' +
'        );\n' +
'        ground.rotation.x = -Math.PI / 2;\n' +
'        ground.receiveShadow = true;\n' +
'        scene.add(ground);\n' +
'\n' +
'        // Сетка с лучшей видимостью\n' +
'        const grid = new THREE.GridHelper(2000, 200, 0x000000, 0x000000);\n' +
'        grid.material.opacity = 0.15; grid.material.transparent = true; grid.position.y = 0.02;\n' +
'        scene.add(grid);\n' +
'\n' +
'        // Компас\n' +
'        const drawCompass = () => {\n' +
'            const compassGroup = new THREE.Group();\n' +
'            const createLetter = (letter, rotY, isMain) => {\n' +
'                const canvas = document.createElement("canvas"); \n' +
'                canvas.width = 256; canvas.height = 256;\n' +
'                const ctx = canvas.getContext("2d");\n' +
'                ctx.shadowColor = "rgba(0,0,0,0.5)";\n' +
'                ctx.shadowBlur = 4;\n' +
'                ctx.shadowOffsetX = 2;\n' +
'                ctx.shadowOffsetY = 2;\n' +
'                ctx.font = "bold " + (isMain ? "180px" : "140px") + " Arial"; \n' +
'                ctx.fillStyle = isMain ? "#dc2626" : "#1e293b";\n' +
'                ctx.textAlign = "center"; ctx.textBaseline = "middle";\n' +
'                ctx.fillText(letter, 128, 128);\n' +
'                const texture = new THREE.CanvasTexture(canvas);\n' +
'                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));\n' +
'                sprite.scale.set(20, 20, 1);\n' +
'                sprite.position.set(Math.sin(rotY) * 25, 3, Math.cos(rotY) * 25);\n' +
'                compassGroup.add(sprite);\n' +
'            };\n' +
'            createLetter("С", Math.PI, true);\n' +
'            createLetter("Ю", 0, false);\n' +
'            createLetter("В", Math.PI/2, false);\n' +
'            createLetter("З", -Math.PI/2, false);\n' +
'            const center = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));\n' +
'            center.position.y = 0.5; center.castShadow = true; compassGroup.add(center);\n' +
'            compassGroup.position.set(-80, 0, 80);\n' +
'            scene.add(compassGroup);\n' +
'        };\n' +
'        drawCompass();\n' +
'\n' +
'        const groups = { \n' +
'            target: new THREE.Group(), parcels: new THREE.Group(), \n' +
'            buildings: new THREE.Group(), structures: new THREE.Group(), \n' +
'            zouit: new THREE.Group(), labels: new THREE.Group()\n' +
'        };\n' +
'        for (let k in groups) scene.add(groups[k]);\n' +
'\n' +
'        const createShape = (polyRings) => {\n' +
'            const shape = new THREE.Shape();\n' +
'            const outer = polyRings[0];\n' +
'            shape.moveTo(outer[0].x, -outer[0].y);\n' +
'            for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x, -outer[i].y);\n' +
'            for(let i=1; i<polyRings.length; i++) {\n' +
'                const hole = new THREE.Path();\n' +
'                hole.moveTo(polyRings[i][0].x, -polyRings[i][0].y);\n' +
'                for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, -polyRings[i][j].y);\n' +
'                shape.holes.push(hole);\n' +
'            }\n' +
'            return shape;\n' +
'        };\n' +
'\n' +
'        const getCentroid = (points) => {\n' +
'            let cx=0, cy=0; points.forEach(p => { cx+=p.x; cy+= -p.y; });\n' +
'            return { x: cx/points.length, z: cy/points.length };\n' +
'        };\n' +
'\n' +
'        // УЛУЧШЕННЫЕ ПОДПИСИ\n' +
'        const createLabel = (name, id, areaText) => {\n' +
'            const canvas = document.createElement("canvas");\n' +
'            canvas.width = 800;\n' +
'            canvas.height = 240;\n' +
'            const ctx = canvas.getContext("2d");\n' +
'            \n' +
'            // Градиентный фон\n' +
'            const gradient = ctx.createLinearGradient(0, 0, 0, 240);\n' +
'            gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");\n' +
'            gradient.addColorStop(1, "rgba(255, 255, 255, 0.95)");\n' +
'            \n' +
'            ctx.fillStyle = gradient;\n' +
'            ctx.beginPath();\n' +
'            ctx.roundRect(10, 10, 780, 220, 20);\n' +
'            ctx.fill();\n' +
'            \n' +
'            // Обводка\n' +
'            ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";\n' +
'            ctx.lineWidth = 4;\n' +
'            ctx.stroke();\n' +
'            \n' +
'            // Тень текста\n' +
'            ctx.shadowColor = "rgba(0, 0, 0, 0.4)";\n' +
'            ctx.shadowBlur = 6;\n' +
'            ctx.shadowOffsetX = 3;\n' +
'            ctx.shadowOffsetY = 3;\n' +
'            \n' +
'            ctx.textAlign = "center";\n' +
'            \n' +
'            // Название (крупный шрифт)\n' +
'            ctx.fillStyle = "#0f172a";\n' +
'            ctx.font = "bold 42px Segoe UI, Arial, sans-serif";\n' +
'            ctx.fillText(name || "Объект", 400, 70, 760);\n' +
'            \n' +
'            // Кадастровый номер\n' +
'            ctx.fillStyle = "#2563eb";\n' +
'            ctx.font = "34px monospace";\n' +
'            ctx.fillText(id || "", 400, 120, 760);\n' +
'            \n' +
'            // Площадь\n' +
'            if (areaText) {\n' +
'                ctx.fillStyle = "#475569";\n' +
'                ctx.font = "30px Segoe UI, sans-serif";\n' +
'                ctx.fillText(areaText, 400, 170, 760);\n' +
'            }\n' +
'            \n' +
'            const texture = new THREE.CanvasTexture(canvas);\n' +
'            texture.anisotropy = 16;\n' +
'            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ \n' +
'                map: texture, \n' + 
'                depthTest: false, \n' +
'                transparent: true,\n' +
'                opacity: 1.0\n' +
'            }));\n' +
'            sprite.scale.set(16, 4.8, 1);\n' +
'            return sprite;\n' +
'        };\n' +
'\n' +
'        // Отрисовка целевых объектов\n' +
'        data.target.forEach(t => {\n' +
'            const isTargetParcel = t.meta && t.meta.isParcel;\n' +
'            const targetColor = isTargetParcel ? 0x22c55e : 0xef4444;\n' +
'            const lineColor = isTargetParcel ? 0x14532d : 0x7f1d1d;\n' +
'            \n' +
'            t.polygons.forEach(poly => {\n' +
'                if (t.type === "Line") {\n' +
'                    const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 0.5, -p.y));\n' +
'                    const path = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.01);\n' +
'                    const tube = new THREE.Mesh(\n' +
'                        new THREE.TubeGeometry(path, 50, 0.5, 8, false),\n' +
'                        new THREE.MeshStandardMaterial({ color: targetColor })\n' +
'                    );\n' +
'                    tube.castShadow = true;\n' +
'                    groups.target.add(tube);\n' +
'                } else {\n' +
'                    const shape = createShape(poly);\n' +
'                    const mesh = new THREE.Mesh(\n' +
'                        new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), \n' +
'                        new THREE.MeshStandardMaterial({ color: targetColor, roughness: 0.7 })\n' +
'                    );\n' +
'                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.6;\n' +
'                    mesh.castShadow = true; mesh.receiveShadow = true;\n' +
'                    const edges = new THREE.LineSegments(\n' +
'                        new THREE.EdgesGeometry(mesh.geometry), \n' +
'                        new THREE.LineBasicMaterial({ color: lineColor, linewidth: 3 })\n' +
'                    );\n' +
'                    mesh.add(edges);\n' +
'                    groups.target.add(mesh);\n' +
'                }\n' +
'            });\n' +
'            \n' +
'            if(t.meta && t.polygons[0]) {\n' +
'                const c = getCentroid(t.polygons[0][0]);\n' +
'                const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area);\n' +
'                lbl.position.set(c.x, 12, c.z);\n' +
'                groups.labels.add(lbl);\n' +
'            }\n' +
'        });\n' +
'\n' +
'        // Земельные участки\n' +
'        data.parcels.forEach(p => {\n' +
'            p.polygons.forEach(poly => {\n' +
'                const shape = createShape(poly);\n' +
'                const mesh = new THREE.Mesh(\n' +
'                    new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), \n' +
'                    new THREE.MeshStandardMaterial({ color: 0xd9f99d, roughness: 0.9 })\n' +
'                );\n' +
'                mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5;\n' +
'                mesh.castShadow = true; mesh.receiveShadow = true;\n' +
'                const edges = new THREE.LineSegments(\n' +
'                    new THREE.EdgesGeometry(mesh.geometry), \n' +
'                    new THREE.LineBasicMaterial({ color: 0x4d7c0f, linewidth: 2 })\n' +
'                );\n' +
'                mesh.add(edges);\n' +
'                groups.parcels.add(mesh);\n' +
'                const c = getCentroid(poly[0]);\n' +
'                const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);\n' +
'                lbl.position.set(c.x, 8, c.z);\n' +
'                groups.labels.add(lbl);\n' +
'            });\n' +
'        });\n' +
'\n' +
'        // Здания\n' +
'        data.buildings.forEach(b => {\n' +
'            b.polygons.forEach(poly => {\n' +
'                const shape = createShape(poly);\n' +
'                const h = b.meta.height || 4;\n' +
'                const group = new THREE.Group();\n' +
'                const walls = new THREE.Mesh(\n' +
'                    new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), \n' +
'                    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 })\n' +
'                );\n' +
'                walls.rotation.x = Math.PI / 2; walls.position.y = h + 0.5;\n' +
'                walls.castShadow = true; walls.receiveShadow = true;\n' +
'                group.add(walls);\n' +
'                const roof = new THREE.Mesh(\n' +
'                    new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.3, bevelThickness: 1 }), \n' +
'                    new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.9 })\n' +
'                );\n' +
'                roof.rotation.x = Math.PI / 2; roof.position.y = h + 1.5;\n' +
'                roof.castShadow = true;\n' +
'                group.add(roof);\n' +
'                groups.buildings.add(group);\n' +
'                const c = getCentroid(poly[0]);\n' +
'                const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);\n' +
'                lbl.position.set(c.x, h + 8, c.z);\n' +
'                groups.labels.add(lbl);\n' +
'            });\n' +
'        });\n' +
'\n' +
'        // СООРУЖЕНИЯ (Газ, Вода, Электричество)\n' +
'        data.structures.forEach(s => {\n' +
'            let color = 0x94a3b8;\n' +
'            let isElectric = s.meta.isElectric;\n' +
'            let isGas = s.meta.isGas;\n' +
'            let isWater = s.meta.isWater;\n' +
'            let isUnderground = s.meta.isUnderground;\n' +
'            \n' +
'            if(isGas) color = 0xfbbf24;\n' +
'            if(isWater) color = 0x3b82f6;\n' +
'            if(isElectric) color = 0x1e40af;\n' +
'            \n' +
'            s.polygons.forEach(poly => {\n' +
'                if(s.type === "Line") {\n' +
'                    const yOffset = isUnderground ? -1.5 : (isElectric ? 8 : 2);\n' +
'                    const vecPoints = poly[0].map(pt => new THREE.Vector3(pt.x, yOffset, -pt.y));\n' +
'                    \n' +
'                    if(isElectric) {\n' +
'                        // ВИЗУАЛИЗАЦИЯ ЭЛЕКТРОСЕТЕЙ НА ОПОРАХ\n' +
'                        const poleHeight = 10;\n' +
'                        const poleRadius = 0.25;\n' +
'                        const segmentLength = 30;\n' +
'                        \n' +
'                        // Создаем опоры через каждые N метров\n' +
'                        for(let i = 0; i < vecPoints.length; i += Math.ceil(vecPoints.length / 3)) {\n' +
'                            const pt = vecPoints[i];\n' +
'                            \n' + 
'                            // Опора (столб)\n' +
'                            const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius * 1.2, poleHeight, 12);\n' +
'                            const poleMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });\n' +
'                            const pole = new THREE.Mesh(poleGeo, poleMat);\n' +
'                            pole.position.set(pt.x, poleHeight/2, pt.z);\n' +
'                            pole.castShadow = true;\n' +
'                            pole.receiveShadow = true;\n' +
'                            \n' +
'                            // Траверса (поперечина)\n' +
'                            const crossArmGeo = new THREE.BoxGeometry(4, 0.2, 0.2);\n' +
'                            const crossArm = new THREE.Mesh(crossArmGeo, poleMat);\n' +
'                            crossArm.position.set(0, poleHeight - 1, 0);\n' +
'                            pole.add(crossArm);\n' +
'                            \n' +
'                            // Изоляторы\n' +
'                            for(let j = -1; j <= 1; j+=2) {\n' +
'                                const insulatorGeo = new THREE.SphereGeometry(0.15, 8, 8);\n' +
'                                const insulatorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });\n' +
'                                const insulator = new THREE.Mesh(insulatorGeo, insulatorMat);\n' +
'                                insulator.position.set(j * 1.5, 0.3, 0);\n' +
'                                crossArm.add(insulator);\n' +
'                            }\n' +
'                            \n' +
'                            groups.structures.add(pole);\n' +
'                        }\n' +
'                        \n' +
'                        // Провода между опорами\n' +
'                        const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.1);\n' +
'                        const tubeGeo = new THREE.TubeGeometry(curve, 100, 0.08, 8, false);\n' +
'                        const tubeMat = new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.8, roughness: 0.2 });\n' +
'                        const wire = new THREE.Mesh(tubeGeo, tubeMat);\n' +
'                        wire.position.y = poleHeight - 2;\n' +
'                        groups.structures.add(wire);\n' +
'                        \n' +
'                        // Подписи для ЛЭП\n' +
'                        const midPt = vecPoints[Math.floor(vecPoints.length/2)];\n' +
'                        if(midPt) {\n' +
'                            const lbl = createLabel("ЛЭП " + (s.meta.voltage || ""), s.meta.id, s.meta.area);\n' +
'                            lbl.position.set(midPt.x, poleHeight + 3, midPt.z);\n' +
'                            groups.labels.add(lbl);\n' +
'                        }\n' +
'                    } else if(isGas && !isUnderground) {\n' +
'                        // НАДЗЕМНЫЙ ГАЗОПРОВОД С ОПОРАМИ\n' +
'                        const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.05);\n' +
'                        const tubeGeo = new THREE.TubeGeometry(curve, 50, s.meta.diameter || 0.3, 12, false);\n' +
'                        const tubeMat = new THREE.MeshStandardMaterial({ \n' +
'                            color: color, \n' +
'                            metalness: 0.6, \n' +
'                            roughness: 0.4 \n' +
'                        });\n' +
'                        const pipe = new THREE.Mesh(tubeGeo, tubeMat);\n' +
'                        pipe.castShadow = true;\n' +
'                        pipe.receiveShadow = true;\n' +
'                        \n' +
'                        // Опоры для газопровода\n' +
'                        vecPoints.forEach((pt, idx) => {\n' +
'                            if (idx % 2 === 0) {\n' +
'                                const supportGeo = new THREE.CylinderGeometry(0.15, 0.2, pt.y - 0.5, 8);\n' +
'                                const supportMat = new THREE.MeshStandardMaterial({ color: 0x78716c });\n' +
'                                const support = new THREE.Mesh(supportGeo, supportMat);\n' +
'                                support.position.set(pt.x, (pt.y - 0.5)/2, pt.z);\n' +
'                                support.castShadow = true;\n' +
'                                groups.structures.add(support);\n' +
'                            }\n' +
'                        });\n' +
'                        \n' +
'                        groups.structures.add(pipe);\n' +
'                        \n' +
'                        // Подпись\n' +
'                        const midPt = vecPoints[Math.floor(vecPoints.length/2)];\n' +
'                        if(midPt) {\n' +
'                            const lbl = createLabel("Газопровод", s.meta.id, s.meta.area);\n' +
'                            lbl.position.set(midPt.x, midPt.y + 4, midPt.z);\n' +
'                            groups.labels.add(lbl);\n' +
'                        }\n' +
'                    } else {\n' +
'                        // ПОДЗЕМНЫЕ ИЛИ ПРОСТЫЕ ТРУБЫ\n' +
'                        const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.05);\n' +
'                        const tubeGeo = new THREE.TubeGeometry(curve, 50, s.meta.diameter || 0.3, 8, false);\n' +
'                        const tubeMat = new THREE.MeshStandardMaterial({ \n' +
'                            color: color, \n' +
'                            metalness: 0.3, \n' +
'                            roughness: 0.6 \n' +
'                        });\n' +
'                        const tube = new THREE.Mesh(tubeGeo, tubeMat);\n' +
'                        tube.castShadow = true;\n' +
'                        groups.structures.add(tube);\n' +
'                        \n' +
'                        // Подпись\n' +
'                        const midPt = vecPoints[Math.floor(vecPoints.length/2)];\n' +
'                        if(midPt) {\n' +
'                            const lbl = createLabel(s.meta.name, s.meta.id, s.meta.area);\n' +
'                            lbl.position.set(midPt.x, midPt.y + 3, midPt.z);\n' +
'                            groups.labels.add(lbl);\n' +
'                        }\n' +
'                    }\n' +
'                } else {\n' +
'                    // Полигональные сооружения\n' +
'                    const shape = createShape(poly);\n' +
'                    const mesh = new THREE.Mesh(\n' +
'                        new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), \n' +
'                        new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 })\n' +
'                    );\n' +
'                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5;\n' +
'                    mesh.castShadow = true; mesh.receiveShadow = true;\n' +
'                    groups.structures.add(mesh);\n' +
'                }\n' +
'            });\n' +
'        });\n' +
'\n' +
'        // ЗОУИТ (ОХРАННЫЕ ЗОНЫ)\n' +
'        data.zouits.forEach(z => {\n' +
'            let isGas = z.meta.isGas;\n' +
'            let isElectric = z.meta.isElectric;\n' +
'            let isWater = z.meta.isWater;\n' +
'            \n' +
'            if(isGas) {\n' +
'                // КРАСИВЫЕ ТУННЕЛИ ДЛЯ ГАЗОПРОВОДОВ\n' +
'                z.polygons.forEach(poly => {\n' +
'                    if (z.type === "Line") {\n' +
'                        const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 1.5, -p.y));\n' +
'                        const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.02);\n' +
'                        \n' +
'                        // Основной туннель (охранная зона)\n' +
'                        const tunnelGeo = new THREE.TubeGeometry(curve, 100, 3.5, 16, false, false, true);\n' +
'                        const tunnelMat = new THREE.MeshBasicMaterial({ \n' +
'                            color: 0xfbbf24, \n' +
'                            transparent: true, \n' +
'                            opacity: 0.15, \n' +
'                            side: THREE.DoubleSide,\n' +
'                            depthWrite: false,\n' +
'                            blending: THREE.AdditiveBlending\n' +
'                        });\n' +
'                        const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);\n' +
'                        groups.zouit.add(tunnel);\n' +
'                        \n' +
'                        // Внутренний контур (граница зоны)\n' +
'                        const innerGeo = new THREE.TubeGeometry(curve, 100, 3.5, 16, false, false, true);\n' +
'                        const innerMat = new THREE.MeshBasicMaterial({ \n' +
'                            color: 0xf59e0b, \n' +
'                            transparent: true, \n' +
'                            opacity: 0.3, \n' +
'                            wireframe: true,\n' +
'                            side: THREE.DoubleSide\n' +
'                        });\n' +
'                        const inner = new THREE.Mesh(innerGeo, innerMat);\n' +
'                        groups.zouit.add(inner);\n' +
'                        \n' +
'                        // Центральная линия (сам газопровод)\n' +
'                        const centerGeo = new THREE.TubeGeometry(curve, 100, 0.2, 8, false);\n' +
'                        const centerMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.2 });\n' +
'                        const center = new THREE.Mesh(centerGeo, centerMat);\n' +
'                        groups.zouit.add(center);\n' +
'                    } else {\n' +
'                        // Полигональная зона\n' +
'                        const shape = createShape(poly);\n' +
'                        const mesh = new THREE.Mesh(\n' +
'                            new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false }), \n' +
'                            new THREE.MeshBasicMaterial({ \n' +
'                                color: 0xfbbf24, \n' +
'                                transparent: true, \n' +
'                                opacity: 0.2, \n' +
'                                side: THREE.DoubleSide,\n' +
'                                depthWrite: false\n' +
'                            })\n' +
'                        );\n' +
'                        mesh.rotation.x = Math.PI / 2; \n' +
'                        mesh.position.y = 4;\n' +
'                        groups.zouit.add(mesh);\n' +
'                    }\n' +
'                    \n' +
'                    // Подпись ЗОУИТ\n' +
'                    const c = getCentroid(poly[0]);\n' +
'                    const lbl = createLabel("ЗОУИТ Газ", z.meta.id, "Радиус: 3.5м");\n' +
'                    lbl.position.set(c.x, 8, c.z);\n' +
'                    groups.labels.add(lbl);\n' +
'                });\n' +
'            } else if(isElectric) {\n' +
'                // ЗОУИТ ЭЛЕКТРОСЕТЕЙ\n' +
'                z.polygons.forEach(poly => {\n' +
'                    const shape = createShape(poly);\n' +
'                    const mesh = new THREE.Mesh(\n' +
'                        new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false }), \n' +
'                        new THREE.MeshBasicMaterial({ \n' +
'                            color: 0xa855f7, \n' +
'                            transparent: true, \n' +
'                            opacity: 0.18, \n' +
'                            side: THREE.DoubleSide,\n' +
'                            depthWrite: false,\n' +
'                            blending: THREE.AdditiveBlending\n' +
'                        })\n' +
'                    );\n' +
'                    mesh.rotation.x = Math.PI / 2; \n' +
'                    mesh.position.y = 6;\n' +
'                    groups.zouit.add(mesh);\n' +
'                    \n' +
'                    // Контур\n' +
'                    const edges = new THREE.LineSegments(\n' +
'                        new THREE.EdgesGeometry(new THREE.ExtrudeGeometry(shape, { depth: 0.1 })),\n' +
'                        new THREE.LineBasicMaterial({ color: 0x9333ea, transparent: true, opacity: 0.5 })\n' +
'                    );\n' +
'                    edges.rotation.x = Math.PI / 2;\n' +
'                    edges.position.y = 6;\n' +
'                    groups.zouit.add(edges);\n' +
'                    \n' +
'                    const c = getCentroid(poly[0]);\n' +
'                    const lbl = createLabel("ЗОУИТ ЛЭП", z.meta.id, "Высота: 12м");\n' +
'                    lbl.position.set(c.x, 12, c.z);\n' +
'                    groups.labels.add(lbl);\n' +
'                });\n' +
'            } else {\n' +
'                // Другие ЗОУИТ\n' +
'                z.polygons.forEach(poly => {\n' +
'                    const shape = createShape(poly);\n' +
'                    const mesh = new THREE.Mesh(\n' +
'                        new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false }), \n' +
'                        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })\n' +
'                    );\n' +
'                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 5;\n' +
'                    groups.zouit.add(mesh);\n' +
'                    \n' +
'                    const c = getCentroid(poly[0]);\n' +
'                    const lbl = createLabel("ЗОУИТ", z.meta.id, "");\n' +
'                    lbl.position.set(c.x, 10, c.z);\n' +
'                    groups.labels.add(lbl);\n' +
'                });\n' +
'            }\n' +
'        });\n' +
'\n' +
'        // Управление слоями\n' +
'        document.getElementById("t-target").onchange = (e) => groups.target.visible = e.target.checked;\n' +
'        document.getElementById("t-parcels").onchange = (e) => groups.parcels.visible = e.target.checked;\n' +
'        document.getElementById("t-buildings").onchange = (e) => groups.buildings.visible = e.target.checked;\n' +
'        document.getElementById("t-structures").onchange = (e) => groups.structures.visible = e.target.checked;\n' +
'        document.getElementById("t-zouit").onchange = (e) => groups.zouit.visible = e.target.checked;\n' +
'        document.getElementById("t-labels").onchange = (e) => groups.labels.visible = e.target.checked;\n' +
'\n' +
'        window.addEventListener("resize", () => {\n' +
'            camera.aspect = window.innerWidth / window.innerHeight;\n' +
'            camera.updateProjectionMatrix();\n' +
'            renderer.setSize(window.innerWidth, window.innerHeight);\n' +
'        });\n' +
'\n' +
'        function animate() {\n' +
'            requestAnimationFrame(animate);\n' +
'            controls.update();\n' +
'            renderer.render(scene, camera);\n' +
'        }\n' +
'        animate();\n' +
'    <\/script>\n' +
'</body>\n' +
'</html>';

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