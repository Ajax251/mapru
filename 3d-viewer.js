window.open3DVisualization = function () {
    if (typeof showLoader === 'function') showLoader("Анализ данных и генерация 3D сцены...");
    setTimeout(() => {
        try {
            const destSc = 'EPSG:3857';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const allLocalFeatures = { target: [], parcels: [], buildings: [], structures: [], zouits: [] };

            const to3857 = (yandexCoord) => {
                if (!yandexCoord || typeof yandexCoord[0] !== 'number') return [0, 0];
                const trueLat = yandexCoord[0] + (window.mapOffsetY * 0.000008983);
                const trueLon = yandexCoord[1] + (window.mapOffsetX * 0.000008983);
                return window.proj4("EPSG:4326", destSc, [trueLon, trueLat]);
            };

            if (!window.quickReportTargetObjects || window.quickReportTargetObjects.length === 0) throw new Error("Нет исходного объекта.");

            window.quickReportTargetObjects.forEach(obj => {
                if (!obj || !obj.geometry) return;
                const coords = obj.geometry.getCoordinates();
                const type = obj.geometry.getType();
                let rings = [];
                if (type === 'Point') rings = [[coords]];
                else if (type === 'LineString') rings = [coords];
                else if (type === 'Polygon') rings = coords;
                else if (type === 'MultiPolygon') rings = coords.flat();
                rings.forEach(ring => ring.forEach(c => {
                    const pt = to3857(c);
                    if (!isNaN(pt[0]) && !isNaN(pt[1])) {
                        minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
                        minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
                    }
                }));
            });

            if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
            const originX = (minX + maxX) / 2, originY = (minY + maxY) / 2;
            const CLIP_RADIUS = 250;

            const simplifyRing = (ring, maxPts) => {
                if (!ring || ring.length <= maxPts) return ring;
                const step = Math.ceil(ring.length / maxPts);
                const r = [];
                for (let i = 0; i < ring.length; i += step) r.push(ring[i]);
                if (r[r.length - 1] !== ring[ring.length - 1]) r.push(ring[ring.length - 1]);
                return r;
            };

            const intersectSC = (ins, out, r) => {
                const dx = out.x - ins.x, dy = out.y - ins.y, a = dx*dx + dy*dy;
                if (a < 1e-4) return { x: ins.x, y: ins.y };
                const b = 2*(ins.x*dx + ins.y*dy), c = ins.x*ins.x + ins.y*ins.y - r*r;
                const disc = b*b - 4*a*c;
                if (disc < 0) return { x: (ins.x+out.x)/2, y: (ins.y+out.y)/2 };
                let t = (-b - Math.sqrt(disc)) / (2*a);
                if (t < 0 || t > 1) t = (-b + Math.sqrt(disc)) / (2*a);
                t = Math.max(0, Math.min(1, t));
                return { x: ins.x + dx*t, y: ins.y + dy*t };
            };

            const clipToRadius = (ring, radius) => {
                if (!ring || ring.length < 2) return ring;
                const rSq = radius * radius;
                let hasIn = false, hasOut = false;
                for (let i = 0; i < ring.length; i++) {
                    if (ring[i].x*ring[i].x + ring[i].y*ring[i].y <= rSq) hasIn = true; else hasOut = true;
                    if (hasIn && hasOut) break;
                }
                if (!hasOut) return ring;
                if (!hasIn) {
                    let mD = Infinity, mI = 0;
                    for (let i = 0; i < ring.length; i++) { const d = ring[i].x*ring[i].x + ring[i].y*ring[i].y; if (d < mD) { mD = d; mI = i; } }
                    const cnt = Math.min(30, ring.length), si = Math.max(0, mI - Math.floor(cnt/2)), r = [];
                    for (let i = 0; i < cnt && (si+i) < ring.length; i++) r.push(ring[si+i]);
                    return r.length >= 2 ? r : null;
                }
                const result = [];
                for (let i = 0; i < ring.length; i++) {
                    const curr = ring[i], prev = ring[(i-1+ring.length) % ring.length];
                    const cIn = curr.x*curr.x + curr.y*curr.y <= rSq;
                    const pIn = prev.x*prev.x + prev.y*prev.y <= rSq;
                    if (cIn) { if (!pIn) result.push(intersectSC(curr, prev, radius)); result.push(curr); }
                    else if (pIn) result.push(intersectSC(prev, curr, radius));
                }
                return result.length >= 2 ? result : null;
            };

            const analyzeFeature = (f, cat) => {
                const p = f.properties || {}, o = p.options || {};
                const descr = p.descr || '', purpose = o.purpose || o.params_purpose || '';
                const name = o.name_by_doc || o.name || o.params_name || o.building_name || '';
                const text = (descr + ' ' + name + ' ' + purpose).toLowerCase();
                let meta = {
                    id: o.cad_num || o.cad_number || o.reg_numb_border || descr || '',
                    name: name || purpose || descr || 'Объект', rawText: text,
                    area: o.build_record_area || o.area || o.specified_area || o.declared_area || o.land_record_area || '',
                    hasExtendedData: !!(purpose || name || o.build_record_area || o.year_built || o.floors),
                    isParcel: false, isSpatial: p._isSpatial !== false,
                };
                if (meta.area && !isNaN(parseFloat(meta.area))) meta.area = parseFloat(meta.area).toLocaleString('ru-RU') + ' м²';
                else if (o.params_extension) meta.area = o.params_extension + ' м (длина)';
                if (cat === 'building') {
                    let df = 1;
                    if (text.includes('многоквартир') || text.includes('мкд')) df = 9;
                    else if (text.includes('жило') || text.includes('дом')) df = 2;
                    else if (text.includes('школ') || text.includes('больниц')) df = 3;
                    meta.floors = parseInt(o.floors) || df; meta.height = meta.floors * 3.5;
                } else if (cat === 'structure' || cat === 'zouit' || cat === 'target') {
                    meta.isGas = text.includes('газ');
                    meta.isWater = text.includes('вод') || text.includes('канализ') || text.includes('сток');
                    meta.isElectric = text.includes('электр') || text.includes('лэп') || text.includes('вл ') || text.includes('воздушн');
                    meta.isUnderground = text.includes('подзем') || (!text.includes('надзем') && meta.isWater);
                    meta.diameter = parseFloat(o.diameter) || (meta.isGas ? 0.3 : 0.4);
                }
                if (cat === 'parcel') { meta.isParcel = true; if (meta.name === 'Объект' || meta.name === meta.id) meta.name = 'Земельный участок'; }
                return meta;
            };

            const processFA = (arr, type) => {
                const result = [], doClip = (type === 'structure' || type === 'zouit');
                (arr || []).forEach(f => {
                    const meta = analyzeFeature(f, type);
                    if (!meta.isSpatial) { result.push({ type: 'Point', polygons: [], meta }); return; }
                    if (!f.geometry || !f.geometry.coordinates) return;
                    let rl = [];
                    if (f.geometry.type === 'Polygon') rl = [f.geometry.coordinates];
                    else if (f.geometry.type === 'MultiPolygon') rl = f.geometry.coordinates;
                    else if (f.geometry.type.includes('Line')) rl = f.geometry.type === 'LineString' ? [[f.geometry.coordinates]] : f.geometry.coordinates.map(c => [c]);
                    const lp = [];
                    rl.forEach(poly => {
                        const rings = [];
                        poly.forEach((ring, ri) => {
                            let pts = ring.map(c => (!c || typeof c[0] !== 'number') ? {x:0,y:0} : {x: c[0]-originX, y: c[1]-originY});
                            pts = simplifyRing(pts, 200);
                            if (doClip && ri === 0) pts = clipToRadius(pts, CLIP_RADIUS);
                            if (pts && pts.length >= 2) rings.push(pts);
                        });
                        if (rings.length > 0) lp.push(rings);
                    });
                    if (lp.length === 0) return;
                    result.push({ type: f.geometry.type.includes('Line') ? 'Line' : 'Polygon', polygons: lp, meta });
                });
                return result;
            };

            window.quickReportTargetObjects.forEach(obj => {
                const coords = obj.geometry.getCoordinates(), type = obj.geometry.getType();
                const fd = obj.properties.get('featureData'), catId = fd ? fd.properties.category : null;
                let lc = 'target';
                if (catId === 36368) lc = 'parcel'; else if (catId === 36940 || catId === 36315) lc = 'zouit';
                const pf = fd || { properties: { descr: obj.properties.get('cadastralNumber') || 'Целевой объект' }, options: obj.properties.get('hintContent') || {} };
                let tN = 'Целевой объект';
                if (fd && fd.properties && fd.properties.options) { const o = fd.properties.options; tN = o.name_by_doc || o.name || o.reg_numb_border || tN; }
                else if (typeof pf.options === 'object' && pf.options.address) tN = pf.options.address;
                const meta = analyzeFeature(pf, lc); meta.name = "Целевой: " + tN; meta.isSpatial = true;
                let rings = [];
                if (type === 'Point') rings = [[coords]]; else if (type === 'LineString') rings = [coords];
                else if (type === 'Polygon') rings = coords; else if (type === 'MultiPolygon') rings = coords.flat();
                const doClip = lc === 'zouit', lp = [];
                rings.forEach(ring => {
                    let pts = ring.map(c => { const pt = to3857(c); return {x: pt[0]-originX, y: pt[1]-originY}; });
                    pts = simplifyRing(pts, 200);
                    if (doClip) pts = clipToRadius(pts, CLIP_RADIUS);
                    if (pts && pts.length >= 2) lp.push(pts);
                });
                if (lp.length === 0) return;
                allLocalFeatures.target.push({ type: (type === 'Polygon' || type === 'MultiPolygon') ? 'Polygon' : 'Line', polygons: [lp], meta });
            });

            allLocalFeatures.parcels = processFA(window.parcelFeaturesData, 'parcel');
            allLocalFeatures.buildings = processFA(window.buildingFeaturesData, 'building');
            allLocalFeatures.structures = processFA(window.structureFeaturesData, 'structure');
            allLocalFeatures.zouits = processFA(window.zouitFeaturesData, 'zouit');

            const safeDataString = JSON.stringify(allLocalFeatures).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

            const modalId = 'modal-3d-view-advanced';
            let modal = document.getElementById(modalId); if (modal) modal.remove();
            modal = document.createElement('div'); modal.id = modalId;
            Object.assign(modal.style, { position:'fixed',top:'2.5%',left:'2.5%',width:'95%',height:'95%',backgroundColor:'#fff',borderRadius:'16px',zIndex:'20000',boxShadow:'0 25px 80px rgba(0,0,0,0.4)',display:'flex',flexDirection:'column',overflow:'hidden',border:'1px solid #cbd5e1' });
            const header = document.createElement('div');
            Object.assign(header.style, { padding:'12px 20px',background:'#fff',color:'#1e293b',display:'flex',justifyContent:'space-between',alignItems:'center',fontWeight:'600',fontSize:'16px',fontFamily:'system-ui,sans-serif',borderBottom:'1px solid #e2e8f0' });
            header.innerHTML = '<span style="display:flex;align-items:center"><i class="fas fa-cube" style="color:#3b82f6;font-size:20px;margin-right:10px"></i> Кадастровая 3D Модель</span>';
            const btnC = document.createElement('div'); btnC.style.display = 'flex'; btnC.style.gap = '8px';
            const mkBtn = (ic, hc) => { const b = document.createElement('button'); b.innerHTML = '<i class="'+ic+'"></i>'; Object.assign(b.style,{background:'#f1f5f9',border:'none',color:'#64748b',fontSize:'14px',cursor:'pointer',width:'32px',height:'32px',borderRadius:'6px',display:'flex',alignItems:'center',justifyContent:'center'}); b.onmouseenter=()=>{b.style.background=hc;b.style.color='#fff';}; b.onmouseleave=()=>{b.style.background='#f1f5f9';b.style.color='#64748b';}; return b; };
            const minBtn = mkBtn('fas fa-minus','#3b82f6'), closeBtn = mkBtn('fas fa-times','#ef4444');
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, {width:'100%',height:'100%',border:'none',flexGrow:'1',background:'#87CEEB'});
            let isMin = false;
            minBtn.onclick = () => { if(!isMin){modal.style.width='320px';modal.style.height='56px';modal.style.top='auto';modal.style.bottom='20px';modal.style.left='20px';modal.style.borderRadius='12px';iframe.style.display='none';minBtn.innerHTML='<i class="fas fa-expand-arrows-alt"></i>';}else{modal.style.width='95%';modal.style.height='95%';modal.style.top='2.5%';modal.style.left='2.5%';modal.style.bottom='auto';modal.style.borderRadius='16px';setTimeout(()=>iframe.style.display='block',300);minBtn.innerHTML='<i class="fas fa-minus"></i>';} isMin=!isMin; };
            closeBtn.onclick = () => modal.remove();
            btnC.appendChild(minBtn); btnC.appendChild(closeBtn); header.appendChild(btnC); modal.appendChild(header);

            const srcDocContent = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8">
<style>
body{margin:0;overflow:hidden;background:#87CEEB;font-family:"Segoe UI",system-ui,sans-serif}
#ui-panel{position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.95);padding:20px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);backdrop-filter:blur(10px);width:260px;z-index:100;border:1px solid #e2e8f0}
h3{margin-top:0;margin-bottom:15px;color:#1e293b;font-size:16px;border-bottom:2px solid #3b82f6;padding-bottom:8px;font-weight:600}
.lc{display:flex;align-items:center;margin-bottom:10px;cursor:pointer;padding:4px;border-radius:6px;transition:background .2s}.lc:hover{background:#f1f5f9}
.lc input{margin-right:12px;cursor:pointer;width:16px;height:16px;accent-color:#3b82f6}
.lc label{cursor:pointer;font-size:13px;color:#334155;font-weight:500}
.cb{width:14px;height:14px;display:inline-block;margin-right:10px;border-radius:3px;border:1px solid rgba(0,0,0,0.2);flex-shrink:0}
.info-text{position:absolute;bottom:20px;right:20px;background:rgba(255,255,255,0.9);color:#333;padding:10px 15px;border-radius:8px;font-size:12px;font-weight:600;pointer-events:none}
#loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:16px;font-weight:600;background:rgba(59,130,246,0.9);padding:15px 30px;border-radius:8px}
</style>
<script async src="https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js"><\/script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}<\/script>
</head><body>
<div id="ui-panel">
<h3>Слои сцены</h3>
<div class="lc"><input type="checkbox" id="t-target" checked><div class="cb" style="background:#ef4444"></div><label for="t-target">Целевой объект</label></div>
<div class="lc"><input type="checkbox" id="t-parcels" checked><div class="cb" style="background:#a8d5ba"></div><label for="t-parcels">Земельные участки</label></div>
<div class="lc"><input type="checkbox" id="t-buildings" checked><div class="cb" style="background:#f1f5f9"></div><label for="t-buildings">Здания (ОКС)</label></div>
<div class="lc"><input type="checkbox" id="t-structures" checked><div class="cb" style="background:#fbbf24"></div><label for="t-structures">Инженерия / Сети</label></div>
<div class="lc"><input type="checkbox" id="t-zouit" checked><div class="cb" style="background:rgba(168,85,247,0.4)"></div><label for="t-zouit">ЗОУИТ</label></div>
<div class="lc" style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px"><input type="checkbox" id="t-labels" checked><div class="cb" style="background:#fff;border:2px solid #3b82f6"></div><label for="t-labels">Подписи</label></div>
</div>
<div class="info-text">ЛКМ: вращение | ПКМ: панорама | Колесо: масштаб</div>
<div id="loading">Построение 3D...</div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
try {
const data = ${safeDataString};
const animateables = [];

const BD = {
    education:{keys:['школ','детск','сад','учебн','институт','образоват','ясли'],wall:0xfcd34d,base:0x92400e,roof:0x1e293b,win:0x93c5fd,winType:'ribbon',parapet:true},
    medical:{keys:['больниц','поликлиник','мед','здрав','госпитал','фап','амбулатор'],wall:0xffffff,base:0x94a3b8,roof:0xcbd5e1,win:0x7dd3fc,winType:'standard',parapet:true,addon:'cross'},
    mkd:{keys:['многоквартирный','мкд','общежити','квартир'],wall:0xe2e8f0,base:0x475569,roof:0x334155,win:0x3b82f6,winType:'dense',parapet:true},
    private:{keys:['жилой дом','индивидуальн','частн','дачн','садов'],wall:0xfde68a,base:0x78350f,roof:0x7f1d1d,win:0x60a5fa,winType:'standard',parapet:false,hippedRoof:true},
    commercial:{keys:['магазин','торгов','офис','бизнес','тц','трц','коммерч','центр'],wall:0x6ee7b7,base:0x064e3b,roof:0x1f2937,win:0x1e3a8a,winType:'large',parapet:true},
    industrial:{keys:['склад','цех','завод','производств','промышлен','гараж','ангар'],wall:0x94a3b8,base:0x334155,roof:0x475569,win:null,winType:'none',parapet:false},
    default:{wall:0xf1f5f9,base:0x64748b,roof:0x334155,win:0x93c5fd,winType:'minimal',parapet:true}
};
function gBS(t){for(const[,c]of Object.entries(BD)){if(c.keys&&c.keys.some(k=>t.includes(k)))return c;}return BD.default;}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);
scene.fog = new THREE.FogExp2(0xdbeafe, 0.003);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 2000);
camera.position.set(40, 60, 100);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.05; controls.maxPolarAngle = Math.PI/2 - 0.02;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.4));
const sun = new THREE.DirectionalLight(0xfff8e7, 1.2);
sun.position.set(100,150,50); sun.castShadow = true;
sun.shadow.mapSize.set(4096,4096);
sun.shadow.camera.top=200;sun.shadow.camera.bottom=-200;sun.shadow.camera.left=-200;sun.shadow.camera.right=200;
sun.shadow.bias=-0.0005; scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000,1000), new THREE.MeshStandardMaterial({color:0xf8fafc,roughness:0.9}));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(1000,200,0xcbd5e1,0xe2e8f0); grid.position.y = 0.05; scene.add(grid);

// Компас
const cg = new THREE.Group();
const cb = new THREE.Mesh(new THREE.CylinderGeometry(8,8,0.5,32), new THREE.MeshStandardMaterial({color:0x334155}));
cb.position.y=0.25; cg.add(cb);
const ag = new THREE.ConeGeometry(2,10,4); ag.translate(0,5,0); ag.rotateX(Math.PI/2);
const aN = new THREE.Mesh(ag, new THREE.MeshStandardMaterial({color:0xef4444})); aN.position.y=0.6; aN.rotation.y=Math.PI; cg.add(aN);
const aS = new THREE.Mesh(ag.clone(), new THREE.MeshStandardMaterial({color:0xffffff})); aS.position.y=0.6; cg.add(aS);
const aL=(t,r,c)=>{const cv=document.createElement('canvas');cv.width=128;cv.height=128;const x=cv.getContext('2d');x.font='bold 80px sans-serif';x.fillStyle=c;x.textAlign='center';x.textBaseline='middle';x.fillText(t,64,64);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv)}));s.scale.set(6,6,1);s.position.set(Math.sin(r)*11,2,Math.cos(r)*11);cg.add(s);};
aL('С',Math.PI,'#ef4444');aL('Ю',0,'#1e293b');aL('В',Math.PI/2,'#1e293b');aL('З',-Math.PI/2,'#1e293b');
cg.position.set(-60,0,60); scene.add(cg);

const groups = {target:new THREE.Group(),parcels:new THREE.Group(),buildings:new THREE.Group(),structures:new THREE.Group(),zouit:new THREE.Group(),labels:new THREE.Group()};
for(let k in groups) scene.add(groups[k]);

// ==========================================
// БАЗОВЫЕ ХЕЛПЕРЫ (без extractCenterline!)
// ==========================================
const createShape = (pr) => {
    const s = new THREE.Shape();
    if(!pr||!pr[0]||pr[0].length<3) return s;
    const o=pr[0]; s.moveTo(o[0].x,-o[0].y);
    for(let i=1;i<o.length;i++) s.lineTo(o[i].x,-o[i].y);
    for(let i=1;i<pr.length;i++){if(!pr[i]||pr[i].length<3)continue;const h=new THREE.Path();h.moveTo(pr[i][0].x,-pr[i][0].y);for(let j=1;j<pr[i].length;j++)h.lineTo(pr[i][j].x,-pr[i][j].y);s.holes.push(h);}
    return s;
};
const getCentroid = (pts) => {
    if(!pts||!pts.length) return {x:0,z:0};
    let cx=0,cy=0; pts.forEach(p=>{cx+=p.x;cy+=-p.y;}); return {x:cx/pts.length,z:cy/pts.length};
};
// {x,y} -> Vector3(x, h, -y) — единственная правильная конвертация
const toV3 = (pts, h) => pts.map(p => new THREE.Vector3(p.x, h||0, -p.y));

// Прореживание массива Vector3 для столбов/опор (каждые N метров)
const spaceEvenly = (v3arr, spacing) => {
    if(v3arr.length <= 2) return v3arr;
    const result = [v3arr[0]];
    let accum = 0;
    for(let i=1;i<v3arr.length;i++){
        const dx=v3arr[i].x-v3arr[i-1].x, dz=v3arr[i].z-v3arr[i-1].z;
        accum += Math.sqrt(dx*dx+dz*dz);
        if(accum >= spacing){ result.push(v3arr[i]); accum = 0; }
    }
    if(result[result.length-1] !== v3arr[v3arr.length-1]) result.push(v3arr[v3arr.length-1]);
    return result;
};

const getClosestPt = (ring) => {
    if(!ring||!ring.length) return {x:0,y:0};
    let b=ring[0],bd=b.x*b.x+b.y*b.y;
    for(let i=1;i<ring.length;i++){const d=ring[i].x*ring[i].x+ring[i].y*ring[i].y;if(d<bd){bd=d;b=ring[i];}} return b;
};

const createLabel = (name,id,area,small) => {
    const cv=document.createElement("canvas"),m=cv.getContext("2d");m.font="bold 56px sans-serif";
    const tw=m.measureText(name||"Объект").width;
    cv.width=small?512:Math.max(800,tw+150);cv.height=256;const ctx=cv.getContext("2d");
    ctx.fillStyle="rgba(255,255,255,0.95)";ctx.beginPath();ctx.roundRect(10,10,cv.width-20,236,15);ctx.fill();
    ctx.strokeStyle="#3b82f6";ctx.lineWidth=4;ctx.stroke();ctx.textAlign="center";const cx=cv.width/2;
    if(small){ctx.fillStyle="#1e293b";ctx.font="bold 36px sans-serif";ctx.fillText(name,cx,80,480);ctx.fillStyle="#3b82f6";ctx.font="bold 28px monospace";ctx.fillText(id,cx,140,480);if(area){ctx.fillStyle="#ef4444";ctx.font="bold 26px sans-serif";ctx.fillText(area,cx,200,480);}}
    else{ctx.fillStyle="#1e293b";ctx.font="bold 48px sans-serif";ctx.fillText(name||"Объект",cx,90,cv.width-40);ctx.fillStyle="#3b82f6";ctx.font="bold 40px monospace";ctx.fillText(id||"",cx,160,cv.width-40);if(area){ctx.fillStyle="#64748b";ctx.font="34px sans-serif";ctx.fillText(area,cx,215,cv.width-40);}}
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),depthTest:false}));
    sp.scale.set((cv.width/1024)*20,5,1);return sp;
};

const createStake = (id,pos) => {
    const g=new THREE.Group();
    const st=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,4),new THREE.MeshStandardMaterial({color:0x8b5a2b}));st.position.y=2;st.castShadow=true;g.add(st);
    const bd=new THREE.Mesh(new THREE.BoxGeometry(4,2,0.2),new THREE.MeshStandardMaterial({color:0xf8fafc}));bd.position.set(0,3.5,0.1);bd.castShadow=true;g.add(bd);
    const l=createLabel("ОКС",id,"Нет координат",true);l.position.set(0,3.5,0.25);l.scale.set(3.8,1.9,1);g.add(l);
    g.position.set(pos.x,0,pos.z);return g;
};

const createBuilding = (shape,height,style,mini) => {
    const b=new THREE.Group(),pts=shape.getPoints();if(pts.length<3)return b;
    const base=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.5,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:style.base}));base.rotation.x=Math.PI/2;base.position.y=0.25;b.add(base);
    const walls=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:style.wall,roughness:0.9}));walls.rotation.x=Math.PI/2;walls.position.y=height/2+0.5;if(!mini){walls.castShadow=true;walls.receiveShadow=true;}b.add(walls);
    if(style.hippedRoof&&pts.length===5){const w=Math.abs(pts[0].x-pts[1].x)+1,l=Math.abs(pts[1].y-pts[2].y)+1;const r=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,l)*0.7,3,4),new THREE.MeshStandardMaterial({color:style.roof}));r.position.set((pts[0].x+pts[1].x)/2,height+2,-(pts[1].y+pts[2].y)/2);r.rotation.y=Math.PI/4;if(!mini)r.castShadow=true;b.add(r);}
    else{if(style.parapet){const p=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.8,bevelEnabled:true,bevelSize:0.2,bevelThickness:0.2}),new THREE.MeshStandardMaterial({color:style.roof}));p.rotation.x=Math.PI/2;p.position.y=height+0.8;b.add(p);}const fr=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:0.1,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0x1e293b}));fr.rotation.x=Math.PI/2;fr.position.y=height+(style.parapet?0.9:0.6);b.add(fr);}
    if(style.addon==='cross'){const cr=new THREE.Group(),mt=new THREE.MeshBasicMaterial({color:0xef4444});cr.add(new THREE.Mesh(new THREE.BoxGeometry(1,4,1),mt));cr.add(new THREE.Mesh(new THREE.BoxGeometry(4,1,1),mt));cr.position.set((pts[0].x+pts[2].x)/2,height+4,-(pts[0].y+pts[2].y)/2);b.add(cr);}
    if(style.winType!=='none'&&style.win){let wW=1.5,wH=1.8,wS=1.5;if(style.winType==='dense'){wW=1.2;wS=0.8;}if(style.winType==='ribbon'){wW=4;wS=0.5;}if(style.winType==='large'){wW=3;wH=2.5;wS=1;}const wM=new THREE.MeshStandardMaterial({color:style.win,roughness:0.1,metalness:0.8}),wG=new THREE.PlaneGeometry(wW,wH),fl=Math.max(1,Math.floor(height/3.5));for(let i=0;i<pts.length-1;i++){const p1=new THREE.Vector3(pts[i].x,0,-pts[i].y),p2=new THREE.Vector3(pts[i+1].x,0,-pts[i+1].y),dir=new THREE.Vector3().subVectors(p2,p1),ln=dir.length();dir.normalize();const nm=new THREE.Vector3(-dir.z,0,dir.x),cnt=Math.floor(ln/(wW+wS));if(cnt>0){const pad=(ln-(cnt*wW+(cnt-1)*wS))/2;for(let f=0;f<fl;f++){const yP=1.1+f*3.5+1.75;for(let w=0;w<cnt;w++){const off=pad+wW/2+w*(wW+wS),wx=p1.x+dir.x*off,wz=p1.z+dir.z*off,m=new THREE.Mesh(wG,wM);m.position.set(wx+nm.x*0.05,yP,wz+nm.z*0.05);m.lookAt(new THREE.Vector3(wx+nm.x*2,yP,wz+nm.z*2));b.add(m);}}}}}
    return b;
};

// ==========================================
// ГАЗОПРОВОД: контур ЗОУИТ + труба ПО КОНТУРУ (не по осевой!)
// ==========================================
function buildGasZouit(poly, group, labelGroup, meta, isLine) {
    const pipeH = 3;
    const outerRing = poly[0];
    if (!outerRing || outerRing.length < 2) return;

    // Конвертируем контур в Vector3
    const contourV3 = toV3(outerRing, 0);

    // 1. Полупрозрачный объём ЗОУИТ по реальному контуру полигона
    if (!isLine && outerRing.length >= 3) {
        const shape = createShape(poly);
        if (shape.getPoints().length > 2) {
            const mesh = new THREE.Mesh(
                new THREE.ExtrudeGeometry(shape, {depth:5, bevelEnabled:false}),
                new THREE.MeshBasicMaterial({color:0xfbbf24, transparent:true, opacity:0.2, depthWrite:false})
            );
            mesh.rotation.x = Math.PI/2; mesh.position.y = 2.5;
            mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({color:0xfbbf24,transparent:true,opacity:0.4})));
            group.add(mesh);
        }
    }

    // 2. Труба: идёт прямо по точкам контура (поднятым на pipeH)
    const pipePts = contourV3.map(p => new THREE.Vector3(p.x, pipeH, p.z));
    if (pipePts.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(pipePts, false, 'chordal');
        const pipe = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 64, 0.4, 16, false),
            new THREE.MeshStandardMaterial({color:0xfbbf24, roughness:0.4})
        );
        pipe.castShadow = true; group.add(pipe);

        // Опоры через каждые ~5м
        const poles = spaceEvenly(pipePts, 5);
        poles.forEach(pt => {
            const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,pipeH), new THREE.MeshStandardMaterial({color:0x94a3b8}));
            sup.position.set(pt.x, pipeH/2, pt.z); sup.castShadow = true; group.add(sup);
        });

        // Для линий добавляем туннель
        if (isLine) {
            group.add(new THREE.Mesh(
                new THREE.TubeGeometry(curve, 64, 4, 16, false),
                new THREE.MeshBasicMaterial({color:0xfbbf24, transparent:true, opacity:0.25, depthWrite:false})
            ));
        }
    }

    // 3. Табличка
    const c = getCentroid(outerRing);
    const lbl = createLabel(meta.name || "Газопровод (ЗОУИТ)", meta.id, "");
    lbl.position.set(c.x, pipeH + 6, c.z); labelGroup.add(lbl);
}

// ==========================================
// ЛЭП: контур ЗОУИТ + столбы ПО КОНТУРУ
// ==========================================
function buildPowerZouit(poly, group, labelGroup, meta, isLine) {
    const poleH = 15;
    const outerRing = poly[0];
    if (!outerRing || outerRing.length < 2) return;

    const contourV3 = toV3(outerRing, 0);

    // 1. Полупрозрачный объём ЗОУИТ
    if (!isLine && outerRing.length >= 3) {
        const shape = createShape(poly);
        if (shape.getPoints().length > 2) {
            const mesh = new THREE.Mesh(
                new THREE.ExtrudeGeometry(shape, {depth:12, bevelEnabled:false}),
                new THREE.MeshBasicMaterial({color:0xf472b6, transparent:true, opacity:0.15, depthWrite:false})
            );
            mesh.rotation.x = Math.PI/2; mesh.position.y = 6;
            mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({color:0xf472b6,transparent:true,opacity:0.3})));
            group.add(mesh);
        }
    }

    // 2. Столбы по контуру через ~15м
    const polePts = spaceEvenly(contourV3, 15);
    if (polePts.length >= 2) {
        polePts.forEach((pt, idx) => {
            const pg = new THREE.Group();
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.5,poleH,12), new THREE.MeshStandardMaterial({color:0x5c4033}));
            pole.position.y = poleH/2; pole.castShadow = true; pg.add(pole);
            const ca = new THREE.Mesh(new THREE.BoxGeometry(5,0.3,0.3), new THREE.MeshStandardMaterial({color:0x475569}));
            ca.position.y = poleH - 1;
            if(idx < polePts.length-1) ca.rotation.y = Math.atan2(polePts[idx+1].x-pt.x, polePts[idx+1].z-pt.z);
            else if(idx>0) ca.rotation.y = Math.atan2(pt.x-polePts[idx-1].x, pt.z-polePts[idx-1].z);
            pg.add(ca);
            const armA = ca.rotation.y;
            [-2,0,2].forEach(off => {
                const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.6,8), new THREE.MeshStandardMaterial({color:0x60a5fa}));
                ins.position.set(Math.sin(armA)*off, poleH-0.5, Math.cos(armA)*off); pg.add(ins);
            });
            pg.position.set(pt.x, 0, pt.z); group.add(pg);
        });

        // Провода между столбами
        const wM = new THREE.LineBasicMaterial({color:0x1e293b});
        for(let i=0;i<polePts.length-1;i++){
            const p1=polePts[i], p2=polePts[i+1];
            const dx=p2.x-p1.x, dz=p2.z-p1.z, sl=Math.sqrt(dx*dx+dz*dz);
            if(sl<0.1)continue;
            const px=-dz/sl, pz=dx/sl;
            [-2,0,2].forEach(wo => {
                const w1=new THREE.Vector3(p1.x+px*wo, poleH-1, p1.z+pz*wo);
                const w2=new THREE.Vector3(p2.x+px*wo, poleH-1, p2.z+pz*wo);
                const mid=new THREE.Vector3().addVectors(w1,w2).multiplyScalar(0.5); mid.y -= 3;
                group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(w1,mid,w2).getPoints(20)),wM));
            });
        }

        // Для линий — туннельный коридор
        if (isLine) {
            const cp = polePts.map(p => new THREE.Vector3(p.x, poleH/2, p.z));
            if(cp.length>=2) group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp,false,'chordal'),64,8,16,false), new THREE.MeshBasicMaterial({color:0xf472b6,transparent:true,opacity:0.2,depthWrite:false})));
        }
    }

    // 3. Табличка
    const c = getCentroid(outerRing);
    const lbl = createLabel(meta.name || "ЛЭП (ЗОУИТ)", meta.id, "");
    lbl.position.set(c.x, poleH + 6, c.z); labelGroup.add(lbl);
}

// ====================================================================
// ПОСТРОЕНИЕ
// ====================================================================
data.target.forEach(t => {
    if (t.meta.isGas || t.meta.isElectric) {
        t.polygons.forEach(poly => {
            if(!poly||!poly[0]||poly[0].length<2) return;
            const isLine = t.type === "Line";
            if(t.meta.isGas) buildGasZouit(poly, groups.target, groups.labels, t.meta, isLine);
            else buildPowerZouit(poly, groups.target, groups.labels, t.meta, isLine);
        });
    } else {
        const color = t.meta.isParcel ? 0x22c55e : 0xef4444;
        t.polygons.forEach(poly => {
            if(!poly||!poly[0]) return;
            if(t.type==="Line"){const vp=toV3(poly[0],1.5);if(vp.length>1){const tb=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp,false,"chordal"),64,0.6,8,false),new THREE.MeshStandardMaterial({color}));tb.castShadow=true;groups.target.add(tb);}}
            else{const sh=createShape(poly);if(sh.getPoints().length>2){const ms=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.8,bevelEnabled:false}),new THREE.MeshStandardMaterial({color,opacity:0.8,transparent:true}));ms.rotation.x=Math.PI/2;ms.position.y=0.4;ms.add(new THREE.LineSegments(new THREE.EdgesGeometry(ms.geometry),new THREE.LineBasicMaterial({color:0x7f1d1d})));ms.castShadow=true;groups.target.add(ms);}}
        });
        if(t.polygons[0]&&t.polygons[0][0]){const c=getCentroid(t.polygons[0][0]);const l=createLabel(t.meta.name,t.meta.id,t.meta.area);l.position.set(c.x,12,c.z);groups.labels.add(l);}
    }
});

data.parcels.forEach(p => {
    p.polygons.forEach(poly => {
        const sh=createShape(poly);if(sh.getPoints().length>2){const ms=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.2,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0xa8d5ba,roughness:0.8}));ms.rotation.x=Math.PI/2;ms.position.y=0.1;ms.add(new THREE.LineSegments(new THREE.EdgesGeometry(ms.geometry),new THREE.LineBasicMaterial({color:0x166534})));ms.receiveShadow=true;groups.parcels.add(ms);}
        if(poly[0]){const c=getCentroid(poly[0]);const l=createLabel(p.meta.name,p.meta.id,p.meta.area);l.position.set(c.x,6,c.z);groups.labels.add(l);}
    });
});

let lnk=0;
data.buildings.forEach(b => {
    const style=gBS(b.meta.rawText);
    if(b.meta.isSpatial){b.polygons.forEach(poly=>{const sh=createShape(poly);if(sh.getPoints().length>2){groups.buildings.add(createBuilding(sh,b.meta.height,style));if(poly[0]){const c=getCentroid(poly[0]);const l=createLabel(b.meta.name,b.meta.id,b.meta.area);l.position.set(c.x,b.meta.height+8,c.z);groups.labels.add(l);}}});}
    else{const r=25+(lnk%2)*8,a=(lnk*Math.PI*2)/6,px=Math.cos(a)*r,pz=Math.sin(a)*r;if(b.meta.hasExtendedData){const fg=new THREE.Group(),ds=new THREE.Shape();ds.moveTo(-5,-5);ds.lineTo(5,-5);ds.lineTo(5,5);ds.lineTo(-5,5);const mm=createBuilding(ds,b.meta.height,style,true);mm.scale.set(0.4,0.4,0.4);fg.add(mm);const ls=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,15),new THREE.MeshBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.3}));ls.position.y=-7.5;fg.add(ls);const l=createLabel(b.meta.name,b.meta.id,"Парящая",true);l.position.y=b.meta.height*0.4+6;fg.add(l);fg.position.set(px,15,pz);fg.userData={baseY:15,offset:lnk};animateables.push(fg);groups.buildings.add(fg);}else{groups.buildings.add(createStake(b.meta.id,{x:px,z:pz}));}lnk++;}
});

data.structures.forEach(s => {
    s.polygons.forEach(poly => {
        if(!poly||!poly[0]||poly[0].length<2) return;
        const isLine = s.type === "Line";
        if(s.meta.isGas && !s.meta.isUnderground){
            buildGasZouit(poly, groups.structures, groups.labels, s.meta, isLine);
        } else if(s.meta.isElectric){
            buildPowerZouit(poly, groups.structures, groups.labels, s.meta, isLine);
        } else {
            const v3 = toV3(poly[0], s.meta.isUnderground ? -1 : 1);
            if(v3.length >= 2){
                groups.structures.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v3),50,s.meta.diameter,12,false),new THREE.MeshStandardMaterial({color:0x3b82f6})));
                const mp=v3[Math.floor(v3.length/2)];const l=createLabel(s.meta.name||"Сооружение",s.meta.id,"");l.position.set(mp.x,5,mp.z);groups.labels.add(l);
            }
        }
    });
});

data.zouits.forEach(z => {
    z.polygons.forEach(poly => {
        if(!poly||!poly[0]||poly[0].length<2) return;
        const isLine = z.type === "Line";
        if(z.meta.isGas){
            buildGasZouit(poly, groups.zouit, groups.labels, z.meta, isLine);
        } else if(z.meta.isElectric){
            buildPowerZouit(poly, groups.zouit, groups.labels, z.meta, isLine);
        } else {
            const sh=createShape(poly);if(sh.getPoints().length>2){const h=6;const ms=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:h,bevelEnabled:false}),new THREE.MeshBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.15,depthWrite:false}));ms.rotation.x=Math.PI/2;ms.position.y=h/2;ms.add(new THREE.LineSegments(new THREE.EdgesGeometry(ms.geometry),new THREE.LineBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.5})));groups.zouit.add(ms);const cp=getClosestPt(poly[0]);const l=createLabel(z.meta.name,z.meta.id,"");l.position.set(cp.x,h+3,-cp.y);groups.labels.add(l);}
        }
    });
});

document.getElementById("t-target").onchange=e=>groups.target.visible=e.target.checked;
document.getElementById("t-parcels").onchange=e=>groups.parcels.visible=e.target.checked;
document.getElementById("t-buildings").onchange=e=>groups.buildings.visible=e.target.checked;
document.getElementById("t-structures").onchange=e=>groups.structures.visible=e.target.checked;
document.getElementById("t-zouit").onchange=e=>groups.zouit.visible=e.target.checked;
document.getElementById("t-labels").onchange=e=>groups.labels.visible=e.target.checked;
window.addEventListener("resize",()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
document.getElementById("loading").style.display="none";
function animate(){requestAnimationFrame(animate);controls.update();const t=performance.now()*0.002;animateables.forEach(o=>{o.position.y=o.userData.baseY+Math.sin(t+o.userData.offset)*1.5;});renderer.render(scene,camera);}
animate();
}catch(e){document.getElementById("loading").innerHTML="<div style='color:#fca5a5;font-size:14px'><b>Ошибка:</b><br>"+e.message+"</div>";console.error("3D:",e);}
<\/script></body></html>`;

            iframe.srcdoc = srcDocContent;
            modal.appendChild(iframe);
            document.body.appendChild(modal);
            const escH = e => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escH); } };
            document.addEventListener('keydown', escH);
        } catch (error) {
            console.error("Ошибка генерации 3D:", error);
            if (typeof showNotification === 'function') showNotification("Ошибка: " + error.message, "error");
        } finally {
            if (typeof hideLoader === 'function') hideLoader();
        }
    }, 100);
};