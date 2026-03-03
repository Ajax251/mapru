window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");
    setTimeout(() => {
        try {
            // ====================================================================
            // 1. НАСТРОЙКА ПРОЕКЦИИ И ПОИСК ЦЕНТРА
            // ====================================================================
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = {
                target: [], parcels: [], buildings: [], structures: [], zouits: []
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

            // ====================================================================
            // 2. УМНЫЙ АНАЛИЗАТОР СВОЙСТВ
            // ====================================================================
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
                    meta.floors = parseInt(o.floors) || (meta.isResidential ? 2 : 1);
                    meta.height = meta.floors * 3.5;
                    meta.buildingType = meta.isResidential ? 'residential' : 'commercial';
                }
                else if (category === 'structure' || category === 'zouit') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('кв') || text.includes('воздушн');
                    meta.isTelecom = text.includes('связ') || text.includes('оптик');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && (meta.isGas || meta.isWater));
                    meta.diameter = parseFloat(o.diameter) || 0.3;
                    meta.voltage = o.voltage || o.params_voltage || '10кВ';
                }
                else if (category === 'parcel') {
                    meta.isParcel = true;
                    if (meta.name === 'Объект' || meta.name === meta.id) meta.name = 'Земельный участок';
                }
                return meta;
            };
            const processFeatureArray = (featuresArray, type) => {
                const result = [];
                (featuresArray || []).forEach(f => {
                    if (!f.geometry || !f.geometry.coordinates) return;
                    const meta = analyzeFeature(f, type);
                    let ringsList = [];
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

            // ====================================================================
            // 4. СОЗДАНИЕ UI (Модальное окно + Iframe)
            // ====================================================================
            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = modalId;
            Object.assign(modal.style, {
                position: 'fixed', top: '2.5%', left: '2.5%', width: '95%', height: '95%',
                backgroundColor: '#ffffff', borderRadius: '16px', zIndex: '20000',
                boxShadow: '0 25px 80px rgba(99, 102, 241, 0.3)', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', border: '1px solid #c7d2fe', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            });
            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '15px 25px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontWeight: '600', fontSize: '16px', fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
            });
            header.innerHTML = '<span><i class="fas fa-cube" style="margin-right:10px;"></i> 3D Визуализация</span>';
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '10px';
            const createWinBtn = (symbol, hoverBg) => {
                const btn = document.createElement('button');
                btn.innerHTML = symbol;
                Object.assign(btn.style, {
                    background: 'rgba(255,255,255,0.2)', border: 'none', color: '#ffffff', fontSize: '18px',
                    cursor: 'pointer', lineHeight: '1', width: '36px', height: '36px',
                    borderRadius: '8px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(10px)'
                });
                btn.onmouseenter = () => { btn.style.background = hoverBg; btn.style.transform = 'scale(1.1)'; };
                btn.onmouseleave = () => { btn.style.background = 'rgba(255,255,255,0.2)'; btn.style.transform = 'scale(1)'; };
                return btn;
            };
            const minBtn = createWinBtn('&minus;', 'rgba(255,255,255,0.4)');
            const closeBtn = createWinBtn('&times;', 'rgba(239, 68, 68, 0.8)');
            closeBtn.style.fontSize = '22px';
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', flexGrow: '1', background: '#1e1b4b' });
            let isMinimized = false;
            minBtn.onclick = () => {
                if (!isMinimized) {
                    modal.style.width = '320px'; modal.style.height = '50px';
                    modal.style.top = 'auto'; modal.style.bottom = '20px'; modal.style.left = '20px';
                    modal.style.borderRadius = '12px';
                    iframe.style.display = 'none';
                    minBtn.innerHTML = '&#10064;';
                } else {
                    modal.style.width = '95%'; modal.style.height = '95%';
                    modal.style.top = '2.5%'; modal.style.left = '2.5%'; modal.style.bottom = 'auto';
                    modal.style.borderRadius = '16px';
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
            const srcDocContent = '<!DOCTYPE html>' +
                '<html lang="ru">' +
                '<head>' +
                '<meta charset="UTF-8">' +
                '<style>' +
                'body { margin: 0; overflow: hidden; background: linear-gradient(180deg, #1e1b4b 0%, #312e81 100%); font-family: "Segoe UI", system-ui, sans-serif; }' +
                '#ui-panel {' +
                'position: absolute; top: 20px; right: 20px;' +
                'background: rgba(255, 255, 255, 0.95); padding: 20px;' +
                'border-radius: 16px; box-shadow: 0 8px 32px rgba(99, 102, 241, 0.25);' +
                'backdrop-filter: blur(20px); width: 280px; z-index: 100; pointer-events: auto;' +
                'border: 1px solid rgba(255,255,255,0.3);' +
                '}' +
                'h3 { margin-top: 0; margin-bottom: 18px; color: #1e1b4b; font-size: 17px; border-bottom: 3px solid #6366f1; padding-bottom: 10px; font-weight: 700; }' +
                '.layer-control { display: flex; align-items: center; margin-bottom: 12px; cursor: pointer; padding: 8px 12px; border-radius: 10px; transition: all 0.2s; }' +
                '.layer-control:hover { background: rgba(99, 102, 241, 0.1); }' +
                '.layer-control input { margin-right: 12px; cursor: pointer; width: 18px; height: 18px; accent-color: #6366f1; }' +
                '.layer-control label { cursor: pointer; font-size: 14px; color: #374151; font-weight: 600; }' +
                '.color-box { width: 18px; height: 18px; display: inline-block; margin-right: 10px; border-radius: 5px; border: 2px solid rgba(0,0,0,0.15); flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }' +
                '.info-text {' +
                'position: absolute; bottom: 20px; left: 20px;' +
                'background: rgba(30, 27, 75, 0.85); color: white;' +
                'padding: 14px 20px; border-radius: 12px;' +
                'font-size: 13px; pointer-events: none; backdrop-filter: blur(10px);' +
                'font-weight: 500; border: 1px solid rgba(99, 102, 241, 0.3);' +
                'box-shadow: 0 4px 20px rgba(99, 102, 241, 0.2);' +
                '}' +
                '#loading {' +
                'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);' +
                'color: white; font-size: 18px; font-weight: 600;' +
                'background: rgba(99, 102, 241, 0.9); padding: 20px 40px; border-radius: 12px;' +
                '}' +
                '</style>' +
                '<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>' +
                '<script type="importmap">' +
                '{"imports": {' +
                '"three": "https://unpkg.com/three@0.160.0/build/three.module.js",' +
                '"three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"' +
                '}}' +
                '<\/script>' +
                '</head>' +
                '<body>' +
                '<div id="ui-panel">' +
                '<h3><i class="fas fa-layer-group" style="margin-right:8px;"></i>Слои сцены</h3>' +
                '<div class="layer-control"><input type="checkbox" id="t-target" checked><div class="color-box" style="background: #22c55e;"></div><label for="t-target">Целевой объект</label></div>' +
                '<div class="layer-control"><input type="checkbox" id="t-parcels" checked><div class="color-box" style="background: #86efac;"></div><label for="t-parcels">Земельные участки</label></div>' +
                '<div class="layer-control"><input type="checkbox" id="t-buildings" checked><div class="color-box" style="background: #e0e7ff;"></div><label for="t-buildings">Здания (ОКС)</label></div>' +
                '<div class="layer-control"><input type="checkbox" id="t-structures" checked><div class="color-box" style="background: #6366f1;"></div><label for="t-structures">Сооружения / Сети</label></div>' +
                '<div class="layer-control"><input type="checkbox" id="t-zouit" checked><div class="color-box" style="background: #fbbf24; opacity: 0.7;"></div><label for="t-zouit">ЗОУИТ</label></div>' +
                '<div class="layer-control" style="margin-top: 15px; border-top: 2px solid #e0e7ff; padding-top: 15px;"><input type="checkbox" id="t-labels" checked><div class="color-box" style="background: #fff; border: 2px solid #6366f1;"></div><label for="t-labels">Подписи объектов</label></div>' +
                '</div>' +
                '<div class="info-text">' +
                '<i class="fas fa-mouse" style="margin-right:8px;"></i>ЛКМ: вращение | ПКМ: панорама | Колесо: масштаб' +
                '</div>' +
                '<div id="loading">Загрузка 3D сцены...</div>' +
                '<script type="module">' +
                'import * as THREE from "three";' +
                'import { OrbitControls } from "three/addons/controls/OrbitControls.js";' +
                'const data = ' + JSON.stringify(allLocalFeatures) + ';' +
                '' +
                '// СЦЕНА' +
                'const scene = new THREE.Scene();' +
                'scene.background = new THREE.Color(0x1e1b4b);' +
                'scene.fog = new THREE.FogExp2(0x1e1b4b, 0.008);' +
                '' +
                '// КАМЕРА' +
                'const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);' +
                'camera.position.set(80, 70, 100);' +
                '' +
                '// РЕНДЕРЕР' +
                'const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });' +
                'renderer.setSize(window.innerWidth, window.innerHeight);' +
                'renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));' +
                'renderer.shadowMap.enabled = true;' +
                'renderer.shadowMap.type = THREE.PCFSoftShadowMap;' +
                'renderer.toneMapping = THREE.ACESFilmicToneMapping;' +
                'renderer.toneMappingExposure = 1.1;' +
                'document.body.appendChild(renderer.domElement);' +
                '' +
                '// КОНТРОЛЫ' +
                'const controls = new OrbitControls(camera, renderer.domElement);' +
                'controls.enableDamping = true;' +
                'controls.dampingFactor = 0.08;' +
                'controls.maxPolarAngle = Math.PI / 2 + 0.2;' +
                'controls.minDistance = 15;' +
                'controls.maxDistance = 500;' +
                'controls.target.set(0, 0, 0);' +
                '' +
                '// ОСВЕЩЕНИЕ' +
                'const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);' +
                'scene.add(ambientLight);' +
                '' +
                'const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.5);' +
                'sunLight.position.set(150, 200, 100);' +
                'sunLight.castShadow = true;' +
                'sunLight.shadow.mapSize.width = 4096;' +
                'sunLight.shadow.mapSize.height = 4096;' +
                'sunLight.shadow.camera.top = 300; sunLight.shadow.camera.bottom = -300;' +
                'sunLight.shadow.camera.left = -300; sunLight.shadow.camera.right = 300;' +
                'sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 800;' +
                'sunLight.shadow.bias = -0.0002;' +
                'scene.add(sunLight);' +
                '' +
                'const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x312e81, 0.6);' +
                'scene.add(hemiLight);' +
                '' +
                '// ПОЛ С ГЕКСАГОНАЛЬНЫМ ПАТТЕРНОМ (СОТЫ)' +
                'const createHexagonFloor = () => {' +
                'const floorGroup = new THREE.Group();' +
                'const hexSize = 8;' +
                'const floorSize = 1500;' +
                'const hexHeight = Math.sqrt(3) * hexSize;' +
                '' +
                '// Основной цвет пола - светлый индиго' +
                'const baseColor = 0x6366f1;' +
                'const highlightColor = 0x818cf8;' +
                '' +
                'for (let x = -floorSize/2; x < floorSize/2; x += hexSize * 1.75) {' +
                'for (let z = -floorSize/2; z < floorSize/2; z += hexHeight) {' +
                'const offset = (Math.floor((x + floorSize/2) / (hexSize * 1.75)) % 2) * (hexHeight / 2);' +
                'const xPos = x;' +
                'const zPos = z + offset;' +
                '' +
                '// Создаём шестиугольник' +
                'const hexShape = new THREE.Shape();' +
                'for (let i = 0; i < 6; i++) {' +
                'const angle = (i * Math.PI) / 3;' +
                'const hx = Math.cos(angle) * hexSize;' +
                'const hz = Math.sin(angle) * hexSize;' +
                'if (i === 0) hexShape.moveTo(hx, hz);' +
                'else hexShape.lineTo(hx, hz);' +
                '}' +
                'hexShape.closePath();' +
                '' +
                '// Чередование цветов для эффекта сот' +
                'const isHighlighted = (Math.floor((xPos + floorSize/2) / (hexSize * 1.75)) + Math.floor((zPos + floorSize/2) / hexHeight)) % 3 === 0;' +
                'const hexColor = isHighlighted ? highlightColor : baseColor;' +
                'const hexOpacity = isHighlighted ? 0.7 : 0.5;' +
                '' +
                'const hexGeo = new THREE.ExtrudeGeometry(hexShape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.2, bevelSegments: 2 });' +
                'const hexMat = new THREE.MeshStandardMaterial({' +
                'color: hexColor,' +
                'roughness: 0.6,' +
                'metalness: 0.3,' +
                'transparent: true,' +
                'opacity: hexOpacity' +
                '});' +
                'const hexMesh = new THREE.Mesh(hexGeo, hexMat);' +
                'hexMesh.rotation.x = Math.PI / 2;' +
                'hexMesh.position.set(xPos, 0.15, zPos);' +
                'hexMesh.receiveShadow = true;' +
                'floorGroup.add(hexMesh);' +
                '}' +
                '}' +
                '' +
                '// Добавляем свечение по краям' +
                'const edgeGeo = new THREE.RingGeometry(floorSize/2 - 5, floorSize/2, 64);' +
                'const edgeMat = new THREE.MeshBasicMaterial({ color: 0xa5b4fc, transparent: true, opacity: 0.4, side: THREE.DoubleSide });' +
                'const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);' +
                'edgeMesh.rotation.x = Math.PI / 2;' +
                'edgeMesh.position.y = 0.2;' +
                'floorGroup.add(edgeMesh);' +
                '' +
                'scene.add(floorGroup);' +
                '};' +
                'createHexagonFloor();' +
                '' +
                '// КОМПАС' +
                'const drawCompass = () => {' +
                'const compassGroup = new THREE.Group();' +
                'const createLetter = (letter, rotY, isMain) => {' +
                'const canvas = document.createElement("canvas");' +
                'canvas.width = 256; canvas.height = 256;' +
                'const ctx = canvas.getContext("2d");' +
                'ctx.shadowColor = "rgba(0,0,0,0.5)";' +
                'ctx.shadowBlur = 8;' +
                'ctx.font = "bold " + (isMain ? "180px" : "140px") + " Arial";' +
                'ctx.fillStyle = isMain ? "#ef4444" : "#6366f1";' +
                'ctx.textAlign = "center"; ctx.textBaseline = "middle";' +
                'ctx.fillText(letter, 128, 128);' +
                'const texture = new THREE.CanvasTexture(canvas);' +
                'const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));' +
                'sprite.scale.set(25, 25, 1);' +
                'sprite.position.set(Math.sin(rotY) * 30, 5, Math.cos(rotY) * 30);' +
                'compassGroup.add(sprite);' +
                '};' +
                'createLetter("С", Math.PI, true);' +
                'createLetter("Ю", 0, false);' +
                'createLetter("В", Math.PI/2, false);' +
                'createLetter("З", -Math.PI/2, false);' +
                'const center = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1, 32), new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.5, roughness: 0.3 }));' +
                'center.position.y = 1; center.castShadow = true; compassGroup.add(center);' +
                'compassGroup.position.set(-100, 0, 100);' +
                'scene.add(compassGroup);' +
                '};' +
                'drawCompass();' +
                '' +
                '// ГРУППЫ ОБЪЕКТОВ' +
                'const groups = {' +
                'target: new THREE.Group(), parcels: new THREE.Group(),' +
                'buildings: new THREE.Group(), structures: new THREE.Group(),' +
                'zouit: new THREE.Group(), labels: new THREE.Group()' +
                '};' +
                'for (let k in groups) {' +
                'groups[k].visible = true;' +
                'scene.add(groups[k]);' +
                '}' +
                '' +
                '// ФУНКЦИЯ СОЗДАНИЯ ФОРМЫ' +
                'const createShape = (polyRings) => {' +
                'const shape = new THREE.Shape();' +
                'const outer = polyRings[0];' +
                'shape.moveTo(outer[0].x, -outer[0].y);' +
                'for(let i=1; i<outer.length; i++) shape.lineTo(outer[i].x, -outer[i].y);' +
                'for(let i=1; i<polyRings.length; i++) {' +
                'const hole = new THREE.Path();' +
                'hole.moveTo(polyRings[i][0].x, -polyRings[i][0].y);' +
                'for(let j=1; j<polyRings[i].length; j++) hole.lineTo(polyRings[i][j].x, -polyRings[i][j].y);' +
                'shape.holes.push(hole);' +
                '}' +
                'return shape;' +
                '};' +
                '' +
                '// ЦЕНТРОИД' +
                'const getCentroid = (points) => {' +
                'let cx=0, cy=0; points.forEach(p => { cx+=p.x; cy+= -p.y; });' +
                'return { x: cx/points.length, z: cy/points.length };' +
                '};' +
                '' +
                '// УЛУЧШЕННЫЕ ПОДПИСИ' +
                'const createLabel = (name, id, areaText) => {' +
                'const canvas = document.createElement("canvas");' +
                'canvas.width = 1024;' +
                'canvas.height = 320;' +
                'const ctx = canvas.getContext("2d");' +
                '' +
                '// Градиентный фон с тенью' +
                'const gradient = ctx.createLinearGradient(0, 0, 0, 320);' +
                'gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");' +
                'gradient.addColorStop(1, "rgba(241, 245, 255, 0.95)");' +
                '' +
                'ctx.fillStyle = gradient;' +
                'ctx.beginPath();' +
                'ctx.roundRect(15, 15, 994, 290, 25);' +
                'ctx.fill();' +
                '' +
                '// Обводка с градиентом' +
                'const borderGrad = ctx.createLinearGradient(0, 0, 1024, 0);' +
                'borderGrad.addColorStop(0, "#6366f1");' +
                'borderGrad.addColorStop(0.5, "#8b5cf6");' +
                'borderGrad.addColorStop(1, "#6366f1");' +
                'ctx.strokeStyle = borderGrad;' +
                'ctx.lineWidth = 5;' +
                'ctx.stroke();' +
                '' +
                '// Тень' +
                'ctx.shadowColor = "rgba(99, 102, 241, 0.4)";' +
                'ctx.shadowBlur = 12;' +
                'ctx.shadowOffsetX = 4;' +
                'ctx.shadowOffsetY = 4;' +
                '' +
                'ctx.textAlign = "center";' +
                '' +
                '// Название' +
                'ctx.fillStyle = "#1e1b4b";' +
                'ctx.font = "bold 52px Segoe UI, Arial, sans-serif";' +
                'ctx.fillText(name || "Объект", 512, 90, 980);' +
                '' +
                '// Кадастровый номер' +
                'ctx.fillStyle = "#6366f1";' +
                'ctx.font = "bold 40px Consolas, monospace";' +
                'ctx.fillText(id || "", 512, 165, 980);' +
                '' +
                '// Площадь' +
                'if (areaText) {' +
                'ctx.fillStyle = "#475569";' +
                'ctx.font = "bold 36px Segoe UI, sans-serif";' +
                'ctx.fillText(areaText, 512, 240, 980);' +
                '}' +
                '' +
                'const texture = new THREE.CanvasTexture(canvas);' +
                'texture.anisotropy = 16;' +
                'const sprite = new THREE.Sprite(new THREE.SpriteMaterial({' +
                'map: texture, depthTest: false, transparent: true, opacity: 1.0' +
                '}));' +
                'sprite.scale.set(20, 6.25, 1);' +
                'return sprite;' +
                '};' +
                '' +
                '// КРАСИВЫЙ ДОМ С ОКНАМИ И ДВЕРЬЮ' +
                'const createBuilding = (shape, height, meta) => {' +
                'const buildingGroup = new THREE.Group();' +
                '' +
                '// Основной корпус' +
                'const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 3 });' +
                'const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7, metalness: 0.1 });' +
                'const walls = new THREE.Mesh(wallGeo, wallMat);' +
                'walls.rotation.x = Math.PI / 2;' +
                'walls.position.y = height / 2 + 0.5;' +
                'walls.castShadow = true;' +
                'walls.receiveShadow = true;' +
                'buildingGroup.add(walls);' +
                '' +
                '// Плинтус' +
                'const plinthGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false });' +
                'const plinthMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });' +
                'const plinth = new THREE.Mesh(plinthGeo, plinthMat);' +
                'plinth.rotation.x = Math.PI / 2;' +
                'plinth.position.y = 0.4;' +
                'buildingGroup.add(plinth);' +
                '' +
                '// Карниз' +
                'const corniceGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.3 });' +
                'const corniceMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });' +
                'const cornice = new THREE.Mesh(corniceGeo, corniceMat);' +
                'cornice.rotation.x = Math.PI / 2;' +
                'cornice.position.y = height + 0.5;' +
                'buildingGroup.add(cornice);' +
                '' +
                '// Крыша' +
                'const roofShape = shape.clone();' +
                'const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.5, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.5, bevelThickness: 0.5 });' +
                'const roofMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.9, metalness: 0.2 });' +
                'const roof = new THREE.Mesh(roofGeo, roofMat);' +
                'roof.rotation.x = Math.PI / 2;' +
                'roof.position.y = height + 1.5;' +
                'roof.castShadow = true;' +
                'buildingGroup.add(roof);' +
                '' +
                '// Окна (добавляем на стены)' +
                'const windowWidth = 2.5;' +
                'const windowHeight = 3;' +
                'const floors = meta.floors || 2;' +
                '' +
                'for(let f = 0; f < floors; f++) {' +
                'const windowY = 3 + f * 3.5;' +
                'const windowGeo = new THREE.BoxGeometry(windowWidth, windowHeight, 0.3);' +
                'const windowMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.2, metalness: 0.8, emissive: 0x1e40af, emissiveIntensity: 0.3 });' +
                '' +
                '// Добавляем окна по периметру (упрощённо)' +
                'const window1 = new THREE.Mesh(windowGeo, windowMat);' +
                'window1.position.set(5, windowY, 0);' +
                'buildingGroup.add(window1);' +
                '' +
                'const window2 = new THREE.Mesh(windowGeo, windowMat);' +
                'window2.position.set(-5, windowY, 0);' +
                'buildingGroup.add(window2);' +
                '}' +
                '' +
                '// Дверь' +
                'const doorGeo = new THREE.BoxGeometry(2.5, 4, 0.2);' +
                'const doorMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });' +
                'const door = new THREE.Mesh(doorGeo, doorMat);' +
                'door.position.set(0, 2.5, 0);' +
                'buildingGroup.add(door);' +
                '' +
                '// Дверная коробка' +
                'const frameGeo = new THREE.BoxGeometry(3, 4.5, 0.1);' +
                'const frameMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });' +
                'const frame = new THREE.Mesh(frameGeo, frameMat);' +
                'frame.position.set(0, 2.5, 0.15);' +
                'buildingGroup.add(frame);' +
                '' +
                'return buildingGroup;' +
                '};' +
                '' +
                '// ЭЛЕКТРООПОРЫ С ПРОВОДАМИ' +
                'const createElectricPole = (position, height) => {' +
                'const poleGroup = new THREE.Group();' +
                '' +
                '// Столб' +
                'const poleGeo = new THREE.CylinderGeometry(0.3, 0.4, height, 12);' +
                'const poleMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });' +
                'const pole = new THREE.Mesh(poleGeo, poleMat);' +
                'pole.position.y = height / 2;' +
                'pole.castShadow = true;' +
                'pole.receiveShadow = true;' +
                'poleGroup.add(pole);' +
                '' +
                '// Основание' +
                'const baseGeo = new THREE.CylinderGeometry(0.5, 0.6, 1, 12);' +
                'const baseMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.8 });' +
                'const base = new THREE.Mesh(baseGeo, baseMat);' +
                'base.position.y = 0.5;' +
                'poleGroup.add(base);' +
                '' +
                '// Траверса' +
                'const crossArmGeo = new THREE.BoxGeometry(5, 0.3, 0.3);' +
                'const crossArm = new THREE.Mesh(crossArmGeo, poleMat);' +
                'crossArm.position.set(0, height - 1.5, 0);' +
                'poleGroup.add(crossArm);' +
                '' +
                '// Изоляторы' +
                'for(let i = -2; i <= 2; i++) {' +
                'const insulatorGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.4, 8);' +
                'const insulatorMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.5 });' +
                'const insulator = new THREE.Mesh(insulatorGeo, insulatorMat);' +
                'insulator.position.set(i * 1.2, height - 1.2, 0);' +
                'poleGroup.add(insulator);' +
                '}' +
                '' +
                '// Трансформатор (для некоторых опор)' +
                'if (Math.random() > 0.6) {' +
                'const transGeo = new THREE.BoxGeometry(1.5, 2, 1);' +
                'const transMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.6 });' +
                'const transformer = new THREE.Mesh(transGeo, transMat);' +
                'transformer.position.set(0, height - 4, 0.8);' +
                'poleGroup.add(transformer);' +
                '}' +
                '' +
                'poleGroup.position.set(position.x, 0, position.z);' +
                'return poleGroup;' +
                '};' +
                '' +
                '// ГАЗОПРОВОД НА ОПОРАХ' +
                'const createGasPipeline = (vecPoints, diameter) => {' +
                'const pipelineGroup = new THREE.Group();' +
                '' +
                '// Труба' +
                'const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.05);' +
                'const pipeGeo = new THREE.TubeGeometry(curve, 100, diameter, 16, false);' +
                'const pipeMat = new THREE.MeshStandardMaterial({' +
                'color: 0xfbbf24,' +
                'metalness: 0.7,' +
                'roughness: 0.3' +
                '});' +
                'const pipe = new THREE.Mesh(pipeGeo, pipeMat);' +
                'pipe.castShadow = true;' +
                'pipe.receiveShadow = true;' +
                'pipelineGroup.add(pipe);' +
                '' +
                '// Фланцы/соединения' +
                'for(let i = 0; i < vecPoints.length; i += 10) {' +
                'const pt = vecPoints[i];' +
                'const flangeGeo = new THREE.TorusGeometry(diameter + 0.15, 0.1, 8, 24);' +
                'const flangeMat = new THREE.MeshStandardMaterial({ color: 0x92400e, metalness: 0.8, roughness: 0.4 });' +
                'const flange = new THREE.Mesh(flangeGeo, flangeMat);' +
                'flange.position.copy(pt);' +
                'flange.rotation.x = Math.PI / 2;' +
                'pipelineGroup.add(flange);' +
                '}' +
                '' +
                '// Опоры каждые 15 метров' +
                'const supportSpacing = 15;' +
                'for(let i = 0; i < vecPoints.length; i++) {' +
                'if (i % Math.max(1, Math.floor(vecPoints.length / 8)) === 0) {' +
                'const pt = vecPoints[i];' +
                'const supportHeight = pt.y;' +
                '' +
                '// Вертикальная опора' +
                'const supportGeo = new THREE.CylinderGeometry(0.2, 0.3, supportHeight, 8);' +
                'const supportMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.7 });' +
                'const support = new THREE.Mesh(supportGeo, supportMat);' +
                'support.position.set(pt.x, supportHeight / 2, pt.z);' +
                'support.castShadow = true;' +
                'pipelineGroup.add(support);' +
                '' +
                '// Хомут крепления' +
                'const clampGeo = new THREE.TorusGeometry(diameter + 0.1, 0.08, 8, 16);' +
                'const clampMat = new THREE.MeshStandardMaterial({ color: 0x451a03, metalness: 0.6 });' +
                'const clamp = new THREE.Mesh(clampGeo, clampMat);' +
                'clamp.position.set(pt.x, pt.y, pt.z);' +
                'clamp.rotation.x = Math.PI / 2;' +
                'pipelineGroup.add(clamp);' +
                '}' +
                '}' +
                '' +
                '// Вентили' +
                'for(let i = 0; i < vecPoints.length; i += 20) {' +
                'const pt = vecPoints[i];' +
                'const valveGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);' +
                'const valveMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.5 });' +
                'const valve = new THREE.Mesh(valveGeo, valveMat);' +
                'valve.position.set(pt.x, pt.y + diameter + 0.4, pt.z);' +
                'valve.rotation.x = Math.PI / 2;' +
                'pipelineGroup.add(valve);' +
                '' +
                '// Ручка вентиля' +
                'const handleGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);' +
                'const handle = new THREE.Mesh(handleGeo, valveMat);' +
                'handle.position.set(pt.x, pt.y + diameter + 0.7, pt.z);' +
                'pipelineGroup.add(handle);' +
                '}' +
                '' +
                'return pipelineGroup;' +
                '};' +
                '' +
                '// ОТРИСОВКА ЦЕЛЕВЫХ ОБЪЕКТОВ' +
                'data.target.forEach(t => {' +
                'const isTargetParcel = t.meta && t.meta.isParcel;' +
                'const targetColor = isTargetParcel ? 0x22c55e : 0xef4444;' +
                'const lineColor = isTargetParcel ? 0x14532d : 0x7f1d1d;' +
                '' +
                't.polygons.forEach(poly => {' +
                'if (t.type === "Line") {' +
                'const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 1, -p.y));' +
                'const path = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.01);' +
                'const tube = new THREE.Mesh(' +
                'new THREE.TubeGeometry(path, 50, 1, 12, false),' +
                'new THREE.MeshStandardMaterial({ color: targetColor, metalness: 0.4, roughness: 0.5 })' +
                ');' +
                'tube.castShadow = true;' +
                'groups.target.add(tube);' +
                '} else {' +
                'const shape = createShape(poly);' +
                'const mesh = new THREE.Mesh(' +
                'new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5 }),' +
                'new THREE.MeshStandardMaterial({ color: targetColor, roughness: 0.6, metalness: 0.2 })' +
                ');' +
                'mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5;' +
                'mesh.castShadow = true; mesh.receiveShadow = true;' +
                'const edges = new THREE.LineSegments(' +
                'new THREE.EdgesGeometry(mesh.geometry),' +
                'new THREE.LineBasicMaterial({ color: lineColor, linewidth: 3 })' +
                ');' +
                'mesh.add(edges);' +
                'groups.target.add(mesh);' +
                '}' +
                '});' +
                '' +
                'if(t.meta && t.polygons[0]) {' +
                'const c = getCentroid(t.polygons[0][0]);' +
                'const lbl = createLabel(t.meta.name, t.meta.id, t.meta.area);' +
                'lbl.position.set(c.x, 15, c.z);' +
                'groups.labels.add(lbl);' +
                '}' +
                '});' +
                '' +
                '// ЗЕМЕЛЬНЫЕ УЧАСТКИ' +
                'data.parcels.forEach(p => {' +
                'p.polygons.forEach(poly => {' +
                'const shape = createShape(poly);' +
                'const mesh = new THREE.Mesh(' +
                'new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3 }),' +
                'new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.8, metalness: 0.1 })' +
                ');' +
                'mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.4;' +
                'mesh.castShadow = true; mesh.receiveShadow = true;' +
                'const edges = new THREE.LineSegments(' +
                'new THREE.EdgesGeometry(mesh.geometry),' +
                'new THREE.LineBasicMaterial({ color: 0x14532d, linewidth: 2 })' +
                ');' +
                'mesh.add(edges);' +
                'groups.parcels.add(mesh);' +
                'const c = getCentroid(poly[0]);' +
                'const lbl = createLabel(p.meta.name, p.meta.id, p.meta.area);' +
                'lbl.position.set(c.x, 10, c.z);' +
                'groups.labels.add(lbl);' +
                '});' +
                '});' +
                '' +
                '// ЗДАНИЯ' +
                'data.buildings.forEach(b => {' +
                'b.polygons.forEach(poly => {' +
                'const shape = createShape(poly);' +
                'const h = b.meta.height || 7;' +
                'const building = createBuilding(shape, h, b.meta);' +
                'groups.buildings.add(building);' +
                'const c = getCentroid(poly[0]);' +
                'const lbl = createLabel(b.meta.name, b.meta.id, b.meta.area);' +
                'lbl.position.set(c.x, h + 10, c.z);' +
                'groups.labels.add(lbl);' +
                '});' +
                '});' +
                '' +
                '// СООРУЖЕНИЯ' +
                'data.structures.forEach(s => {' +
                'let color = 0x94a3b8;' +
                'let isElectric = s.meta.isElectric;' +
                'let isGas = s.meta.isGas;' +
                'let isWater = s.meta.isWater;' +
                'let isUnderground = s.meta.isUnderground;' +
                '' +
                'if(isGas) color = 0xfbbf24;' +
                'if(isWater) color = 0x3b82f6;' +
                'if(isElectric) color = 0x1e40af;' +
                '' +
                's.polygons.forEach(poly => {' +
                'if(s.type === "Line") {' +
                'const vecPoints = poly[0].map(pt => new THREE.Vector3(pt.x, pt.y || 2, -pt.y));' +
                '' +
                'if(isElectric) {' +
                '// ЭЛЕКТРОЛИНИИ С ОПОРАМИ' +
                'const poleHeight = 12;' +
                'const poleCount = Math.max(3, Math.floor(vecPoints.length / 4));' +
                '' +
                'for(let i = 0; i < poleCount; i++) {' +
                'const idx = Math.floor((i / (poleCount - 1)) * (vecPoints.length - 1));' +
                'const pt = vecPoints[idx];' +
                'const pole = createElectricPole(pt, poleHeight);' +
                'groups.structures.add(pole);' +
                '}' +
                '' +
                '// Провода с провисанием' +
                'const wirePoints = vecPoints.map((pt, i) => {' +
                'const sag = Math.sin((i / vecPoints.length) * Math.PI) * 2;' +
                'return new THREE.Vector3(pt.x, poleHeight - 2 - sag, pt.z);' +
                '});' +
                '' +
                'const wireCurve = new THREE.CatmullRomCurve3(wirePoints, false, "catmullrom", 0.1);' +
                'const wireGeo = new THREE.TubeGeometry(wireCurve, 100, 0.1, 8, false);' +
                'const wireMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.9, roughness: 0.2 });' +
                'const wire = new THREE.Mesh(wireGeo, wireMat);' +
                'groups.structures.add(wire);' +
                '' +
                '// Вторая линия проводов' +
                'const wirePoints2 = vecPoints.map((pt, i) => {' +
                'const sag = Math.sin((i / vecPoints.length) * Math.PI) * 2;' +
                'return new THREE.Vector3(pt.x, poleHeight - 3 - sag, pt.z);' +
                '});' +
                'const wireCurve2 = new THREE.CatmullRomCurve3(wirePoints2, false, "catmullrom", 0.1);' +
                'const wire2 = new THREE.Mesh(new THREE.TubeGeometry(wireCurve2, 100, 0.1, 8, false), wireMat);' +
                'groups.structures.add(wire2);' +
                '' +
                'const midPt = vecPoints[Math.floor(vecPoints.length/2)];' +
                'if(midPt) {' +
                'const lbl = createLabel("ЛЭП " + (s.meta.voltage || "10кВ"), s.meta.id, "");' +
                'lbl.position.set(midPt.x, poleHeight + 5, midPt.z);' +
                'groups.labels.add(lbl);' +
                '}' +
                '} else if(isGas && !isUnderground) {' +
                '// ГАЗОПРОВОД НА ОПОРАХ' +
                'const pipeline = createGasPipeline(vecPoints, s.meta.diameter || 0.4);' +
                'groups.structures.add(pipeline);' +
                '' +
                'const midPt = vecPoints[Math.floor(vecPoints.length/2)];' +
                'if(midPt) {' +
                'const lbl = createLabel("Газопровод", s.meta.id, "Ø " + (s.meta.diameter || 0.4).toFixed(1) + "м");' +
                'lbl.position.set(midPt.x, midPt.y + 6, midPt.z);' +
                'groups.labels.add(lbl);' +
                '}' +
                '} else {' +
                '// ПОДЗЕМНЫЕ ИЛИ ПРОСТЫЕ ТРУБЫ' +
                'const yOffset = isUnderground ? -1 : 1;' +
                'const curve = new THREE.CatmullRomCurve3(vecPoints.map(p => new THREE.Vector3(p.x, yOffset, p.z)), false, "catmullrom", 0.05);' +
                'const tubeGeo = new THREE.TubeGeometry(curve, 50, s.meta.diameter || 0.3, 12, false);' +
                'const tubeMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.5, roughness: 0.5 });' +
                'const tube = new THREE.Mesh(tubeGeo, tubeMat);' +
                'tube.castShadow = true;' +
                'groups.structures.add(tube);' +
                '' +
                'const midPt = vecPoints[Math.floor(vecPoints.length/2)];' +
                'if(midPt) {' +
                'const lbl = createLabel(s.meta.name, s.meta.id, s.meta.area);' +
                'lbl.position.set(midPt.x, midPt.y + 5, midPt.z);' +
                'groups.labels.add(lbl);' +
                '}' +
                '}' +
                '} else {' +
                'const shape = createShape(poly);' +
                'const mesh = new THREE.Mesh(' +
                'new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true }),' +
                'new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 })' +
                ');' +
                'mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.5;' +
                'mesh.castShadow = true; mesh.receiveShadow = true;' +
                'groups.structures.add(mesh);' +
                '}' +
                '});' +
                '});' +
                '' +
                '// ЗОУИТ' +
                'data.zouits.forEach(z => {' +
                'let isGas = z.meta.isGas;' +
                'let isElectric = z.meta.isElectric;' +
                '' +
                'if(isGas) {' +
                'z.polygons.forEach(poly => {' +
                'if (z.type === "Line") {' +
                'const vecPoints = poly[0].map(p => new THREE.Vector3(p.x, 3, -p.y));' +
                'const curve = new THREE.CatmullRomCurve3(vecPoints, false, "catmullrom", 0.02);' +
                '' +
                'const tunnelGeo = new THREE.TubeGeometry(curve, 100, 5, 16, false, false, true);' +
                'const tunnelMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });' +
                'const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);' +
                'groups.zouit.add(tunnel);' +
                '' +
                'const innerGeo = new THREE.TubeGeometry(curve, 100, 5, 16, false, false, true);' +
                'const innerMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.25, wireframe: true, side: THREE.DoubleSide });' +
                'const inner = new THREE.Mesh(innerGeo, innerMat);' +
                'groups.zouit.add(inner);' +
                '} else {' +
                'const shape = createShape(poly);' +
                'const mesh = new THREE.Mesh(' +
                'new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false }),' +
                'new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })' +
                ');' +
                'mesh.rotation.x = Math.PI / 2; mesh.position.y = 5;' +
                'groups.zouit.add(mesh);' +
                '}' +
                'const c = getCentroid(poly[0]);' +
                'const lbl = createLabel("ЗОУИТ Газ", z.meta.id, "Радиус: 5м");' +
                'lbl.position.set(c.x, 12, c.z);' +
                'groups.labels.add(lbl);' +
                '});' +
                '} else if(isElectric) {' +
                'z.polygons.forEach(poly => {' +
                'const shape = createShape(poly);' +
                'const mesh = new THREE.Mesh(' +
                'new THREE.ExtrudeGeometry(shape, { depth: 15, bevelEnabled: false }),' +
                'new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })' +
                ');' +
                'mesh.rotation.x = Math.PI / 2; mesh.position.y = 7.5;' +
                'groups.zouit.add(mesh);' +
                '' +
                'const edges = new THREE.LineSegments(' +
                'new THREE.EdgesGeometry(new THREE.ExtrudeGeometry(shape, { depth: 0.2 })),' +
                'new THREE.LineBasicMaterial({ color: 0x9333ea, transparent: true, opacity: 0.6 })' +
                ');' +
                'edges.rotation.x = Math.PI / 2;' +
                'edges.position.y = 7.5;' +
                'groups.zouit.add(edges);' +
                '' +
                'const c = getCentroid(poly[0]);' +
                'const lbl = createLabel("ЗОУИТ ЛЭП", z.meta.id, "Высота: 15м");' +
                'lbl.position.set(c.x, 16, c.z);' +
                'groups.labels.add(lbl);' +
                '});' +
                '} else {' +
                'z.polygons.forEach(poly => {' +
                'const shape = createShape(poly);' +
                'const mesh = new THREE.Mesh(' +
                'new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false }),' +
                'new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })' +
                ');' +
                'mesh.rotation.x = Math.PI / 2; mesh.position.y = 6;' +
                'groups.zouit.add(mesh);' +
                'const c = getCentroid(poly[0]);' +
                'const lbl = createLabel("ЗОУИТ", z.meta.id, "");' +
                'lbl.position.set(c.x, 12, c.z);' +
                'groups.labels.add(lbl);' +
                '});' +
                '}' +
                '});' +
                '' +
                '// УПРАВЛЕНИЕ СЛОЯМИ' +
                'document.getElementById("t-target").onchange = (e) => groups.target.visible = e.target.checked;' +
                'document.getElementById("t-parcels").onchange = (e) => groups.parcels.visible = e.target.checked;' +
                'document.getElementById("t-buildings").onchange = (e) => groups.buildings.visible = e.target.checked;' +
                'document.getElementById("t-structures").onchange = (e) => groups.structures.visible = e.target.checked;' +
                'document.getElementById("t-zouit").onchange = (e) => groups.zouit.visible = e.target.checked;' +
                'document.getElementById("t-labels").onchange = (e) => groups.labels.visible = e.target.checked;' +
                '' +
                '// RESIZE' +
                'window.addEventListener("resize", () => {' +
                'camera.aspect = window.innerWidth / window.innerHeight;' +
                'camera.updateProjectionMatrix();' +
                'renderer.setSize(window.innerWidth, window.innerHeight);' +
                '});' +
                '' +
                '// СКРЫТЬ ЗАГРУЗКУ' +
                'document.getElementById("loading").style.display = "none";' +
                '' +
                '// АНИМАЦИЯ' +
                'function animate() {' +
                'requestAnimationFrame(animate);' +
                'controls.update();' +
                'renderer.render(scene, camera);' +
                '}' +
                'animate();' +
                '<\/script>' +
                '</body>' +
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