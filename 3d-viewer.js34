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
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('кв');
                    meta.isTelecom = text.includes('связ') || text.includes('оптик');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (meta.isGas || meta.isWater));
                    meta.diameter = parseFloat(o.diameter) || 0.3;
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
            header.innerHTML = '<span><i class="fas fa-cube" style="color:#3b82f6; margin-right:8px;"></i> 3D Кадастровая визуализация</span>';
            
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
'            background: rgba(0, 0, 0, 0.6); color: white; \n' +
'            padding: 10px 15px; border-radius: 8px; \n' +
'            font-size: 13px; pointer-events: none; backdrop-filter: blur(4px);\n' +
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
'        \n' +
'        const now = new Date();\n' +
'        const hours = now.getHours();\n' +
'        const mins = now.getMinutes();\n' +
'        const decimalTime = hours + mins / 60;\n' +
'        \n' +
'        let sunAzimuth, sunElevation, lightIntensity, bgColorHex;\n' +
'        if (decimalTime >= 5 && decimalTime <= 21) {\n' +
'            const progress = (decimalTime - 5) / 16;\n' +
'            sunAzimuth = (Math.PI / 2) - (progress * Math.PI);\n' +
'            sunElevation = Math.sin(progress * Math.PI) * (Math.PI / 2.5);\n' +
'            lightIntensity = 1.4;\n' +
'            if (progress < 0.1 || progress > 0.9) bgColorHex = 0xffa07a;\n' +
'            else bgColorHex = 0x87CEEB;\n' +
'        } else {\n' +
'            sunAzimuth = Math.PI; sunElevation = Math.PI / 4;\n' +
'            lightIntensity = 0.2; bgColorHex = 0x0a1128;\n' +
'        }\n' +
'\n' +
'        scene.background = new THREE.Color(bgColorHex);\n' +
'        \n' +
'        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);\n' +
'        camera.position.set(50, 40, 60);\n' +
'\n' +
'        const renderer = new THREE.WebGLRenderer({ antialias: true });\n' +
'        renderer.setSize(window.innerWidth, window.innerHeight);\n' +
'        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));\n' +
'        renderer.shadowMap.enabled = true;\n' +
'        renderer.shadowMap.type = THREE.PCFSoftShadowMap;\n' +
'        document.body.appendChild(renderer.domElement);\n' +
'\n' +
'        const controls = new OrbitControls(camera, renderer.domElement);\n' +
'        controls.enableDamping = true;\n' +
'        controls.dampingFactor = 0.05;\n' +
'        controls.maxPolarAngle = Math.PI / 2 + 0.1;\n' +
'\n' +
'        const ambientLight = new THREE.AmbientLight(0xffffff, decimalTime >= 5 && decimalTime <= 21 ? 0.6 : 0.1);\n' +
'        scene.add(ambientLight);\n' +
'\n' +
'        const sunLight = new THREE.DirectionalLight(0xfffaed, lightIntensity);\n' +
'        const radius = 500;\n' +
'        sunLight.position.set(\n' +
'            Math.sin(sunAzimuth) * Math.cos(sunElevation) * radius,\n' +
'            Math.sin(sunElevation) * radius,\n' +
'            Math.cos(sunAzimuth) * Math.cos(sunElevation) * radius\n' +
'        );\n' +
'        sunLight.castShadow = true;\n' +
'        sunLight.shadow.mapSize.width = 2048;\n' +
'        sunLight.shadow.mapSize.height = 2048;\n' +
'        sunLight.shadow.camera.top = 200; sunLight.shadow.camera.bottom = -200;\n' +
'        sunLight.shadow.camera.left = -200; sunLight.shadow.camera.right = 200;\n' +
'        sunLight.shadow.camera.near = 10; sunLight.shadow.camera.far = 1000;\n' +
'        sunLight.shadow.bias = -0.0005;\n' +
'        scene.add(sunLight);\n' +
'\n' +
'        const sunMesh = new THREE.Mesh(\n' +
'            new THREE.SphereGeometry(20, 32, 32),\n' +
'            new THREE.MeshBasicMaterial({ color: (decimalTime >= 5 && decimalTime <= 21) ? 0xffe87c : 0xdddddd })\n' +
'        );\n' +
'        sunMesh.position.copy(sunLight.position);\n' +
'        scene.add(sunMesh);\n' +
'\n' +
'        const ground = new THREE.Mesh(\n' +
'            new THREE.PlaneGeometry(2000, 2000),\n' +
'            new THREE.MeshStandardMaterial({ color: 0xe8e6d9, transparent: true, opacity: 0.9, depthWrite: false })\n' +
'        );\n' +
'        ground.rotation.x = -Math.PI / 2;\n' +
'        ground.receiveShadow = true;\n' +
'        scene.add(ground);\n' +
'\n' +
'        const grid = new THREE.GridHelper(2000, 200, 0x000000, 0x000000);\n' +
'        grid.material.opacity = 0.08; grid.material.transparent = true; grid.position.y = 0.01;\n' +
'        scene.add(grid);\n' +
'\n' +
'        const drawCompass = () => {\n' +
'            const compassGroup = new THREE.Group();\n' +
'            const createLetter = (letter, rotY, isMain) => {\n' +
'                const canvas = document.createElement("canvas"); \n' +
'                canvas.width = 128; canvas.height = 128;\n' +
'                const ctx = canvas.getContext("2d");\n' +
'                ctx.shadowColor = "white";\n' +
'                ctx.shadowBlur = 8;\n' +
'                ctx.font = "bold " + (isMain ? "90px" : "70px") + " Arial"; \n' +
'                ctx.fillStyle = isMain ? "#dc2626" : "#334155";\n' +
'                ctx.textAlign = "center"; ctx.textBaseline = "middle";\n' +
'                ctx.fillText(letter, 64, 64); ctx.fillText(letter, 64, 64);\n' +
'                const texture = new THREE.CanvasTexture(canvas);\n' +
'                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));\n' +
'                sprite.scale.set(15, 15, 1);\n' +
'                sprite.position.set(Math.sin(rotY) * 20, 2, Math.cos(rotY) * 20);\n' +
'                compassGroup.add(sprite);\n' +
'            };\n' +
'            createLetter("С", Math.PI, true);\n' +
'            createLetter("Ю", 0, false);\n' +
'            createLetter("В", Math.PI/2, false);\n' +
'            createLetter("З", -Math.PI/2, false);\n' +
'            const center = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));\n' +
'            center.position.y = 0.25; center.castShadow = true; compassGroup.add(center);\n' +
'            compassGroup.position.set(-60, 0, 60);\n' +
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
'        const createLabel = (name, id, areaText) => {\n' +
'            const canvas = document.createElement("canvas");\n' +
'            canvas.width = 600; canvas.height = 180;\n' +
'            const ctx = canvas.getContext("2d");\n' +
'            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";\n' +
'            ctx.beginPath(); ctx.roundRect(10, 10, 580, 160, 16); ctx.fill();\n' +
'            ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";\n' +
'            ctx.lineWidth = 4; ctx.stroke();\n' +
'            ctx.textAlign = "center";\n' +
'            ctx.fillStyle = "#0f172a";\n' +
'            ctx.font = "bold 32px Segoe UI, sans-serif";\n' +
'            ctx.fillText(name || "Объект", 300, 55, 560);\n' +
'            ctx.fillStyle = "#2563eb";\n' +
'            ctx.font = "28px monospace";\n' +
'            ctx.fillText(id || "", 300, 105, 560);\n' +
'            if (areaText) {\n' +
'                ctx.fillStyle = "#64748b";\n' +
'                ctx.font = "24px Segoe UI, sans-serif";\n' +
'                ctx.fillText(areaText, 300, 145, 560);\n' +
'            }\n' +
'            const texture = new THREE.CanvasTexture(canvas);\n' +
'            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();\n' +
'            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));\n' +
'            sprite.scale.set(12, 3.6, 1);\n' +
'            return sprite;\n' +
'        };\n' +
'\n' +
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
'                lbl.position.set(c.x, 8, c.z);\n' +
'                groups.labels.add(lbl);\n' +
'            }\n' +
'        });\n' +
'\n' +
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
'                lbl.position.set(c.x, 5, c.z);\n' +
'                groups.labels.add(lbl);\n' +
'            });\n' +
'        });\n' +
'\n' +
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
'                lbl.position.set(c.x, h + 5, c.z);\n' +
'                groups.labels.add(lbl);\n' +
'            });\n' +
'        });\n' +
'\n' +
'        data.structures.forEach(s => {\n' +
'            let color = 0x94a3b8;\n' +
'            if(s.meta.isGas) color = 0xfbbf24;\n' +
'            if(s.meta.isWater) color = 0x3b82f6;\n' +
'            \n' +
'            s.polygons.forEach(poly => {\n' +
'                if(s.type === "Line") {\n' +
'                    const yOffset = s.meta.isUnderground ? -1.5 : 2;\n' +
'                    const vecPoints = poly[0].map(pt => new THREE.Vector3(pt.x, yOffset, -pt.y));\n' +
'                    const path = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.05);\n' +
'                    const tube = new THREE.Mesh(\n' +
'                        new THREE.TubeGeometry(path, Math.max(10, vecPoints.length * 2), s.meta.diameter || 0.3, 8, false),\n' +
'                        new THREE.MeshStandardMaterial({ color: color })\n' +
'                    );\n' +
'                    if (!s.meta.isUnderground) {\n' +
'                        tube.castShadow = true;\n' +
'                        vecPoints.forEach((pt, idx) => {\n' +
'                            if (idx % 2 === 0) {\n' +
'                                const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, yOffset), new THREE.MeshStandardMaterial({color:0x94a3b8}));\n' +
'                                pillar.position.set(pt.x, yOffset/2, pt.z);\n' +
'                                pillar.castShadow = true;\n' +
'                                groups.structures.add(pillar);\n' +
'                            }\n' +
'                        });\n' +
'                    }\n' +
'                    groups.structures.add(tube);\n' +
'                    const midPt = vecPoints[Math.floor(vecPoints.length/2)];\n' +
'                    if(midPt) {\n' +
'                        const lbl = createLabel(s.meta.name, s.meta.id, s.meta.area);\n' +
'                        lbl.position.set(midPt.x, midPt.y + 3, midPt.z);\n' +
'                        groups.labels.add(lbl);\n' +
'                    }\n' +
'                } else {\n' +
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
'        data.zouits.forEach(z => {\n' +
'            let color = 0xa855f7;\n' +
'            if (z.meta.isGas) color = 0xfbbf24;\n' +
'            if (z.meta.isWater) color = 0x3b82f6;\n' +
'            \n' +
'            z.polygons.forEach(poly => {\n' +
'                if (z.type === "Line" || z.meta.isLinearZone) {\n' +
'                    const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 1.5, -p.y));\n' +
'                    const path = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.05);\n' +
'                    const tunnel = new THREE.Mesh(\n' +
'                        new THREE.TubeGeometry(path, 30, 2.5, 12, false),\n' +
'                        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })\n' +
'                    );\n' +
'                    groups.zouit.add(tunnel);\n' +
'                } else {\n' +
'                    const shape = createShape(poly);\n' +
'                    const mesh = new THREE.Mesh(\n' +
'                        new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false }), \n' +
'                        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })\n' +
'                    );\n' +
'                    mesh.rotation.x = Math.PI / 2; mesh.position.y = 5;\n' +
'                    groups.zouit.add(mesh);\n' +
'                }\n' +
'\n' +
'                const c = getCentroid(poly[0]);\n' +
'                const lbl = createLabel("ЗОУИТ: " + z.meta.name, z.meta.id, z.meta.area);\n' +
'                lbl.position.set(c.x, 8, c.z);\n' +
'                groups.labels.add(lbl);\n' +
'            });\n' +
'        });\n' +
'\n' +
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