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
const SATS_TARGETS = ['TIANGONG', 'HUBBLE', 'TERRA', 'AQUA', 'SUOMI NPP', 'NOAA 20', 'LANDSAT', 'METEOR', 'STARLINK'];

async function fetchTopSatellites() {
    if (topSatellites.length > 0) return;
    try {
        const [st, sc] = await Promise.all([
            fetch('https://celestrak.org/NORAD/elements/stations.txt').then(r => r.text()),
            fetch('https://celestrak.org/NORAD/elements/science.txt').then(r => r.text())
        ]);
        
        // Надежное разбиение строк с учетом и Windows, и Linux форматов
        const lines = (st + '\n' + sc).split(/\r?\n/); 
        
        for (let i = 0; i < lines.length; i++) {
            const name = lines[i].trim();
            if (name.length > 2 && SATS_TARGETS.some(t => name.toUpperCase().includes(t)) && !name.toUpperCase().includes('ISS')) {
                try {
                    // Берем следующие две строки для этого спутника
                    const tle1 = lines[i+1].trim();
                    const tle2 = lines[i+2].trim();
                    const rec = satellite.twoline2satrec(tle1, tle2);
                    
                    // Избегаем дубликатов
                    if (!topSatellites.find(s => s.name === name)) {
                        topSatellites.push({ id: 'sat_' + i, name: name, rec: rec });
                    }
                } catch(e) {
                    // Если конкретный TLE битый, просто пропускаем
                }
            }
        }
        console.log(`[Трейкер] Загружено ${topSatellites.length} орбитальных аппаратов.`);
    } catch(e) { 
        console.warn("[Трейкер] Ошибка загрузки TLE спутников", e); 
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

    // Зона обзора
    const bounds = 8; 
    
 
    const proxyUrl = `https://planes-alpha.vercel.app/api?lamin=${lat-bounds}&lomin=${lon-bounds}&lamax=${lat+bounds}&lomax=${lon+bounds}`;

    try {
        const res = await fetch(proxyUrl);
        
        if (!res.ok) {
            console.warn(`[Трейкер] Ошибка прокси-сервера Vercel: ${res.status}`);
            return;
        }

        const data = await res.json();
        const now = Date.now();
        
        if (data && data.states) {
            data.states.forEach(s => {
                // s[0] icao, s[1] callsign, s[5] lon, s[6] lat, s[7] baro_alt, s[9] vel, s[10] head
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
            console.log(`[Трейкер] Авиатрафик обновлен. Видимых бортов: ${Object.keys(livePlanes).length}`);
        }
        
        Object.keys(livePlanes).forEach(id => { 
            if (now - livePlanes[id].lastTime > 65000) delete livePlanes[id]; 
        });

    } catch(e) {
        console.warn("[Трейкер] Сетевая ошибка при обновлении самолетов:", e.message);
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
    planesFetchInterval = setInterval(fetchPlanes, 30000); // 30 сек чтобы не получить бан по IP
}
btnPlane.addEventListener('click', () => {
    tCfg.planesOn = !tCfg.planesOn; saveTrackerCfg();
    if (tCfg.planesOn) { 
        btnPlane.classList.add('active'); 
        fetchPlanes(); 
        planesFetchInterval = setInterval(fetchPlanes, 30000); 
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

// Математика проверки нахождения за горизонтом (Окклюзия Землей)
function isOccludedByEarth(posWorld, cameraPos) {
    const THREE = window.MKS_STATE.THREE;
    const dir = new THREE.Vector3().subVectors(posWorld, cameraPos);
    const distToObj = dir.length();
    dir.normalize();
    
    const b = 2 * cameraPos.dot(dir);
    const c = cameraPos.lengthSq() - (R_EARTH * R_EARTH);
    const delta = b*b - 4*c;
    
    if (delta > 0) {
        const t = (-b - Math.sqrt(delta)) / 2;
        if (t > 0 && t < distToObj) return true;
    }
    return false;
}

// ====== ГЛАВНЫЙ ЦИКЛ ОБНОВЛЕНИЯ (Вызывается из основного файла 60 раз в секунду) ======
window.MKS_TrackerUpdate = function() {
    const STATE = window.MKS_STATE;
    if (!STATE || !STATE.camera || !STATE.THREE) return;

    if (STATE.currentCam !== 'free') {
        Object.values(activeDomLabels).forEach(el => el.style.opacity = '0');
        return;
    }

    const halfW = window.innerWidth / 2; 
    const halfH = window.innerHeight / 2;
    const camPos = STATE.camera.position.clone();
    
    const currentFrameIds = new Set(); 

    // 1. СПУТНИКИ
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

    // 2. САМОЛЕТЫ
    if (tCfg.planesOn) {
        const now = Date.now();
        Object.keys(livePlanes).forEach(id => {
            const p = livePlanes[id];
            
            // Плавная экстраполяция координат по скорости (вектор движения)
            const dtS = (now - p.lastTime) / 1000;
            const bearing = p.head * DEG_TO_RAD;
            const latSpeed = (p.vel * Math.cos(bearing)) / 111320;
            const lonSpeed = (p.vel * Math.sin(bearing)) / (111320 * Math.cos(p.lat * DEG_TO_RAD));
            
            const curLat = p.lat + latSpeed * dtS;
            const curLon = p.lon + lonSpeed * dtS;
            
            const pos = getVector3(curLat, curLon, p.alt, STATE.gmstRad);
            
            // Если борт далеко (больше ~2000 км от камеры), не рисуем его
            if (camPos.distanceTo(pos) < 200) { 
                currentFrameIds.add(id);
                updateLabelPosition(id, `✈ ${p.callsign}`, 'type-plane', pos, camPos, STATE.camera, halfW, halfH);
            }
        });
    }

    // Скрываем все метки, которые не попали в видимость текущего кадра
    Object.keys(activeDomLabels).forEach(id => {
        if (!currentFrameIds.has(id)) activeDomLabels[id].style.opacity = '0';
    });
};

function updateLabelPosition(id, text, typeClass, posWorld, camPos, camera, halfW, halfH) {
    const el = getDomLabel(id, text, typeClass);
    
    // Скрываем, если спряталось за Землей
    if (isOccludedByEarth(posWorld, camPos)) {
        el.style.opacity = '0'; 
        return;
    }
    
    const tempV = posWorld.clone().project(camera);
    
    // Проверка попадания в область видимости экрана (и не сзади камеры)
    if (tempV.z > 1.0 || tempV.x < -1.1 || tempV.x > 1.1 || tempV.y < -1.1 || tempV.y > 1.1) {
        el.style.opacity = '0';
    } else {
        el.style.opacity = '1';
        el.style.transform = `translate(-50%, -100%) translate(${tempV.x * halfW + halfW}px, ${-tempV.y * halfH + halfH - 15}px)`;
    }
}