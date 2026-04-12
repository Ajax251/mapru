// Конфигурация Трекера
const TRACKER_CFG_KEY = 'iss_tracker_cfg';
let tCfg = JSON.parse(localStorage.getItem(TRACKER_CFG_KEY)) || { satOn: false, planesOn: false };
const saveTrackerCfg = () => localStorage.setItem(TRACKER_CFG_KEY, JSON.stringify(tCfg));

// Элементы UI
const btnSat = document.getElementById('btn-sat-toggle');
const btnPlane = document.getElementById('btn-plane-toggle');
const labelsLayer = document.getElementById('tracker-labels-layer');
const activeDomLabels = {}; // Пул DOM-элементов

const DEG_TO_RAD = Math.PI / 180;
const R_EARTH = 63.71;

// ====== ЛОГИКА СПУТНИКОВ ======
let topSatellites = [];
const SATS_TARGETS = ['TIANGONG', 'HUBBLE', 'TERRA', 'AQUA', 'SUOMI NPP', 'NOAA 20', 'LANDSAT 8', 'METEOR-M', 'STARLINK'];

async function fetchTopSatellites() {
    if (topSatellites.length > 0) return;
    try {
        const [st, sc] = await Promise.all([
            fetch('https://celestrak.org/NORAD/elements/stations.txt').then(r => r.text()),
            fetch('https://celestrak.org/NORAD/elements/science.txt').then(r => r.text())
        ]);
        const lines = (st + '\n' + sc).split('\n');
        for (let i = 0; i < lines.length; i += 3) {
            const name = lines[i]?.trim();
            if (name && SATS_TARGETS.some(t => name.includes(t)) && !name.includes('ISS')) {
                const rec = satellite.twoline2satrec(lines[i+1].trim(), lines[i+2].trim());
                topSatellites.push({ id: 'sat_' + i, name: name, rec: rec });
            }
        }
        console.log(`Загружено ${topSatellites.length} спутников.`);
    } catch(e) { 
        console.warn("Ошибка загрузки TLE спутников"); 
    }
}

// ====== ЛОГИКА САМОЛЕТОВ ======
let livePlanes = {};
let planesFetchInterval = null;

async function fetchPlanes() {
    if (!tCfg.planesOn || !window.MKS_STATE) return;
    const lat = window.MKS_STATE.lat; 
    const lon = window.MKS_STATE.lon;
    if (!lat || !lon) return;

    // Квадрат видимости ~800-1000км от МКС (чтобы не тянуть весь мир)
    const bounds = 8; 
    try {
        const res = await fetch(`https://opensky-network.org/api/states/all?lamin=${lat-bounds}&lomin=${lon-bounds}&lamax=${lat+bounds}&lomax=${lon+bounds}`);
        const data = await res.json();
        const now = Date.now();
        if (data && data.states) {
            data.states.forEach(s => {
                // s[0] icao24, s[1] callsign, s[5] lon, s[6] lat, s[7] baro_altitude, s[9] velocity (m/s), s[10] true_track (deg)
                if (s[5] !== null && s[6] !== null && s[9] !== null) { 
                    livePlanes[s[0]] = { 
                        callsign: (s[1]||'UNK').trim(), 
                        lon: s[5], lat: s[6], 
                        alt: (s[7]||10000)/1000, 
                        vel: s[9], head: s[10]||0, 
                        lastTime: now 
                    };
                }
            });
        }
        // Очистка старых самолетов, которые давно не обновлялись
        Object.keys(livePlanes).forEach(id => { 
            if (now - livePlanes[id].lastTime > 60000) delete livePlanes[id]; 
        });
    } catch(e) {
        // Игнорируем ошибки сети/лимитов OpenSky
    }
}

// ====== ИНИЦИАЛИЗАЦИЯ КНОПОК ======
if (tCfg.satOn) { btnSat.classList.add('active'); fetchTopSatellites(); }
btnSat.addEventListener('click', () => {
    tCfg.satOn = !tCfg.satOn; saveTrackerCfg();
    if (tCfg.satOn) { 
        btnSat.classList.add('active'); 
        fetchTopSatellites(); 
    } else { 
        btnSat.classList.remove('active'); 
        clearLabels('type-sat'); 
    }
});

if (tCfg.planesOn) { 
    btnPlane.classList.add('active'); 
    fetchPlanes(); 
    planesFetchInterval = setInterval(fetchPlanes, 15000); 
}
btnPlane.addEventListener('click', () => {
    tCfg.planesOn = !tCfg.planesOn; saveTrackerCfg();
    if (tCfg.planesOn) { 
        btnPlane.classList.add('active'); 
        fetchPlanes(); 
        planesFetchInterval = setInterval(fetchPlanes, 15000); 
    } else { 
        btnPlane.classList.remove('active'); 
        clearInterval(planesFetchInterval);
        clearLabels('type-plane'); 
    }
});

// ====== ПОМОЩНИКИ РЕНДЕРИНГА ======

function getDomLabel(id, text, typeClass) {
    if (!activeDomLabels[id]) {
        const el = document.createElement('div');
        el.className = `marker-label ${typeClass}`;
        el.textContent = text;
        labelsLayer.appendChild(el);
        activeDomLabels[id] = el;
    }
    return activeDomLabels[id];
}

function clearLabels(typeClass) {
    Object.keys(activeDomLabels).forEach(id => {
        if (activeDomLabels[id].classList.contains(typeClass)) {
            activeDomLabels[id].style.opacity = '0';
        }
    });
}

// Математика Three.js для позиций (копия логики из основного скрипта)
function getVector3(lat, lon, altKm, gmstRad) {
    const THREE = window.MKS_STATE.THREE;
    const lonRad = (lon * DEG_TO_RAD) + gmstRad; 
    const latRad = lat * DEG_TO_RAD; 
    const r = R_EARTH + (altKm / 100);
    return new THREE.Vector3(
        r * Math.cos(latRad) * Math.cos(lonRad), 
        r * Math.sin(latRad), 
        -r * Math.cos(latRad) * Math.sin(lonRad)
    );
}

// Проверка перекрытия объекта планетой (чтобы не рисовать метку сквозь Землю)
function isOccludedByEarth(posWorld, cameraPos) {
    const THREE = window.MKS_STATE.THREE;
    const dir = new THREE.Vector3().subVectors(posWorld, cameraPos);
    const distToObj = dir.length();
    dir.normalize();
    
    // Пересекается ли вектор взгляда со сферой Земли (радиус R_EARTH)
    const b = 2 * cameraPos.dot(dir);
    const c = cameraPos.lengthSq() - (R_EARTH * R_EARTH);
    const delta = b*b - 4*c;
    
    if (delta > 0) {
        const t = (-b - Math.sqrt(delta)) / 2;
        if (t > 0 && t < distToObj) return true; // Перекрыто Землей
    }
    return false;
}

// ====== ГЛАВНЫЙ ЦИКЛ ОБНОВЛЕНИЯ (Вызывается из requestAnimationFrame) ======

window.MKS_TrackerUpdate = function() {
    const STATE = window.MKS_STATE;
    if (!STATE || !STATE.camera || !STATE.THREE) return;

    // Показываем метки только в режиме свободной камеры
    if (STATE.currentCam !== 'free') {
        Object.values(activeDomLabels).forEach(el => el.style.opacity = '0');
        return;
    }

    const halfW = window.innerWidth / 2; 
    const halfH = window.innerHeight / 2;
    const camPos = STATE.camera.position.clone();
    
    const currentFrameIds = new Set(); 

    // 1. ОТРИСОВКА СПУТНИКОВ
    if (tCfg.satOn) {
        topSatellites.forEach(sat => {
            const pv = satellite.propagate(sat.rec, STATE.date);
            if (pv && pv.position) {
                const posGd = satellite.eciToGeodetic(pv.position, satellite.gstime(STATE.date));
                const pos = getVector3(satellite.degreesLat(posGd.latitude), satellite.degreesLong(posGd.longitude), posGd.height, STATE.gmstRad);
                
                currentFrameIds.add(sat.id);
                updateLabelPosition(sat.id, sat.name, 'type-sat', pos, camPos, STATE.camera, halfW, halfH);
            }
        });
    }

    // 2. ОТРИСОВКА САМОЛЕТОВ (с экстраполяцией движения)
    if (tCfg.planesOn) {
        const now = Date.now();
        Object.keys(livePlanes).forEach(id => {
            const p = livePlanes[id];
            
            // Экстраполируем координаты по курсу и скорости (самолеты движутся плавно каждый кадр)
            const dtS = (now - p.lastTime) / 1000;
            const bearing = p.head * DEG_TO_RAD;
            // 111320 метров = ~1 градус широты
            const latSpeed = (p.vel * Math.cos(bearing)) / 111320;
            const lonSpeed = (p.vel * Math.sin(bearing)) / (111320 * Math.cos(p.lat * DEG_TO_RAD));
            
            const curLat = p.lat + latSpeed * dtS;
            const curLon = p.lon + lonSpeed * dtS;
            
            const pos = getVector3(curLat, curLon, p.alt, STATE.gmstRad);
            
            // Если самолет слишком далеко от МКС (более 2500км), не рисуем
            if (camPos.distanceTo(pos) < 250) { 
                currentFrameIds.add(id);
                updateLabelPosition(id, `✈ ${p.callsign}`, 'type-plane', pos, camPos, STATE.camera, halfW, halfH);
            }
        });
    }

    // Скрываем метки, которых нет в текущем кадре
    Object.keys(activeDomLabels).forEach(id => {
        if (!currentFrameIds.has(id)) activeDomLabels[id].style.opacity = '0';
    });
};

function updateLabelPosition(id, text, typeClass, posWorld, camPos, camera, halfW, halfH) {
    const el = getDomLabel(id, text, typeClass);
    
    // Проверка окклюзии Землей
    if (isOccludedByEarth(posWorld, camPos)) {
        el.style.opacity = '0'; 
        return;
    }
    
    // Проекция 3D в 2D экран
    const tempV = posWorld.clone().project(camera);
    
    // Если объект за спиной камеры (z > 1.0) или сильно за пределами экрана
    if (tempV.z > 1.0 || tempV.x < -1.1 || tempV.x > 1.1 || tempV.y < -1.1 || tempV.y > 1.1) {
        el.style.opacity = '0';
    } else {
        el.style.opacity = '1';
        el.style.transform = `translate(-50%, -100%) translate(${tempV.x * halfW + halfW}px, ${-tempV.y * halfH + halfH - 15}px)`;
    }
}