import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const R_EARTH_M = 6378137;

export class PilotSimulator {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.isActive = false;

        this.mapZoom = 13;           // ← было 11 → резче карта
        this.gridRange = 5;          // ← было 4 → больше видимых тайлов
        this.mapType = 'y';
        this.timeMode = 'real';
        this.cameraDir = 1;
        this.hudEnabled = true;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(65, 1, 1, 600000);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            logarithmicDepthBuffer: true,
            powerPreference: 'high-performance',
            precision: 'highp',           // ← максимальная точность шейдеров
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = false;
        this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

        this.container.appendChild(this.renderer.domElement);

        // --- POST-PROCESSING (bloom + FXAA) ---
        this.composer = null;
        this._initComposer();

        // --- ОСВЕЩЕНИЕ ---
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(this.hemiLight);
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
        this.scene.add(this.sunLight);

        // Линзовые блики
        const lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(this._createFlareTexture(), 700, 0, new THREE.Color(1, 0.95, 0.85)));
        lensflare.addElement(new LensflareElement(this._createFlareRing(), 200, 0.3));
        lensflare.addElement(new LensflareElement(this._createFlareRing(), 80, 0.6));
        this.sunLight.add(lensflare);

        // Плавный туман
        this.scene.fog = new THREE.FogExp2(0x8ab4d4, 0.000012);

        // --- НЕБО ---
        this._createSky();

        // --- ЗВЁЗДЫ ---
        this.starsGroup = new THREE.Group();
        this._createStars();
        this.scene.add(this.starsGroup);

        // --- ЛУНА ---
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        const tMoon = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg');
        this.moon = new THREE.Mesh(
            new THREE.SphereGeometry(1800, 32, 32),
            new THREE.MeshStandardMaterial({ map: tMoon, roughness: 1.0, metalness: 0.0, emissive: new THREE.Color(0x111008), emissiveIntensity: 0.3 })
        );
        this.scene.add(this.moon);

        // --- ОБЛАКА (процедурные) ---
        this._createClouds();

        // Переменные движения
        this.lookYaw = 0; this.lookPitch = 0; this.isDragging = false;
        this.currentRoll = 0; this.targetRoll = 0; this.lastHdg = null;
        this.smoothLat = null; this.smoothLon = null; this.smoothAlt = null;

        // Тайлы
        this.tiles = {};
        this.tileGroup = new THREE.Group();
        this.scene.add(this.tileGroup);
        this.textureLoader = textureLoader;

        // Очередь загрузки тайлов (приоритет ближних)
        this._loadQueue = [];
        this._loading = 0;
        this._maxConcurrent = 8;  // ← параллельная загрузка тайлов

        this._setupControls();
        window.addEventListener('resize', () => { if (this.isActive) this.resize(); });
    }

    // ─── Постобработка ───────────────────────────────────────────────────────
    _initComposer() {
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 600;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Лёгкий bloom только для солнца/луны
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.95);
        this.composer.addPass(this.bloomPass);

        // FXAA — сглаживание без потери чёткости карты
        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
        this.composer.addPass(this.fxaaPass);
    }

    // ─── Текстуры бликов ─────────────────────────────────────────────────────
    _createFlareTexture() {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.08, 'rgba(255,240,190,0.9)');
        g.addColorStop(0.3, 'rgba(255,150,50,0.15)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
        return new THREE.CanvasTexture(c);
    }
    _createFlareRing() {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const ctx = c.getContext('2d');
        ctx.strokeStyle = 'rgba(255,220,120,0.6)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(64, 64, 50, 0, Math.PI * 2); ctx.stroke();
        return new THREE.CanvasTexture(c);
    }

    // ─── Небо ────────────────────────────────────────────────────────────────
    _createSky() {
        this.skyUniforms = {
            topColor: { value: new THREE.Color(0x0055cc) },
            midColor: { value: new THREE.Color(0x5599ee) },
            bottomColor: { value: new THREE.Color(0xaaccff) },
            sunPosition: { value: new THREE.Vector3() },
            sunsetIntensity: { value: 0.0 },
            time: { value: 0.0 }
        };

        const skyGeo = new THREE.SphereGeometry(250000, 32, 20);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: this.skyUniforms,
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = wp.xyz;
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 midColor;
                uniform vec3 bottomColor;
                uniform vec3 sunPosition;
                uniform float sunsetIntensity;
                uniform float time;
                varying vec3 vWorldPosition;
                varying vec2 vUv;

                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
                float noise(vec2 p) {
                    vec2 i = floor(p), f = fract(p);
                    f = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
                }

                void main() {
                    vec3 viewDir = normalize(vWorldPosition);
                    vec3 sunDir = normalize(sunPosition);
                    float h = viewDir.y;

                    // Трёхзонный градиент (зенит / средина / горизонт)
                    vec3 skyColor;
                    if (h > 0.0) {
                        skyColor = mix(midColor, topColor, pow(h, 0.5));
                    } else {
                        skyColor = mix(midColor, bottomColor, pow(-h * 2.0, 0.4));
                    }

                    // Солнечный ореол
                    float sunDot = dot(viewDir, sunDir);
                    float halo = pow(max(0.0, sunDot), 32.0) * 0.6;
                    vec3 sunsetClr = vec3(1.0, 0.45, 0.1);
                    skyColor += sunsetClr * halo * sunsetIntensity;
                    skyColor += vec3(1.0, 0.9, 0.7) * pow(max(0.0, sunDot), 200.0) * 2.0;

                    gl_FragColor = vec4(skyColor, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false
        });

        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyDome);
    }

    // ─── Звёзды ──────────────────────────────────────────────────────────────
    _createStars() {
        const geo = new THREE.BufferGeometry();
        const pos = [], colors = [], sizes = [];
        for (let i = 0; i < 8000; i++) {
            const ra = Math.random() * Math.PI * 2;
            const dec = Math.asin(Math.random() * 2 - 1);
            const r = 120000 + Math.random() * 5000;
            pos.push(r * Math.cos(dec) * Math.cos(ra), r * Math.sin(dec), -r * Math.cos(dec) * Math.sin(ra));
            const c = 0.6 + Math.random() * 0.4;
            const tint = Math.random();
            colors.push(c, c * (tint > 0.7 ? 0.85 : 1.0), c * (tint < 0.3 ? 0.8 : 1.0) + 0.2);
            sizes.push(80 + Math.random() * 200);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 150, vertexColors: true, transparent: true, opacity: 1.0,
            sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.starsGroup.add(new THREE.Points(geo, mat));
    }

    // ─── Облака ──────────────────────────────────────────────────────────────
    _createClouds() {
        this.cloudGroup = new THREE.Group();
        const cloudTex = this._createCloudTexture();
        const mat = new THREE.MeshBasicMaterial({
            map: cloudTex, transparent: true, opacity: 0.55,
            depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending
        });

        for (let i = 0; i < 80; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 5000 + Math.random() * 35000;
            const scale = 2000 + Math.random() * 6000;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale * 0.35), mat.clone());
            mesh.position.set(Math.cos(angle) * dist, 600 + Math.random() * 800, Math.sin(angle) * dist);
            mesh.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.15;
            mesh.rotation.z = Math.random() * Math.PI;
            this.cloudGroup.add(mesh);
        }
        this.scene.add(this.cloudGroup);
    }

    _createCloudTexture() {
        const size = 256;
        const c = document.createElement('canvas'); c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        // Мягкий эллипсоид облака
        const gx = ctx.createRadialGradient(128, 80, 5, 128, 80, 120);
        gx.addColorStop(0, 'rgba(255,255,255,0.95)');
        gx.addColorStop(0.3, 'rgba(255,255,255,0.7)');
        gx.addColorStop(0.7, 'rgba(240,245,255,0.2)');
        gx.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gx;
        ctx.ellipse(128, 80, 110, 65, 0, 0, Math.PI * 2);
        ctx.fill();
        return new THREE.CanvasTexture(c);
    }

    // ─── Управление ──────────────────────────────────────────────────────────
    _setupControls() {
        let lastX = 0, lastY = 0;
        this.container.addEventListener('mousedown', (e) => {
            if (e.button === 0) { this.isDragging = true; lastX = e.clientX; lastY = e.clientY; }
            if (e.button === 1) { e.preventDefault(); this.lookYaw = 0; this.lookPitch = 0; }
        });
        window.addEventListener('mouseup', () => this.isDragging = false);
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.isActive) return;
            const dx = e.clientX - lastX; const dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            this.lookYaw   -= dx * 0.0025;
            this.lookPitch -= dy * 0.0025;
            this.lookPitch = Math.max(-Math.PI / 1.5, Math.min(Math.PI / 1.5, this.lookPitch));
        });

        // Тач
        let lastTouchX = 0, lastTouchY = 0;
        this.container.addEventListener('touchstart', (e) => { lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; });
        this.container.addEventListener('touchmove', (e) => {
            if (!this.isActive) return;
            const dx = e.touches[0].clientX - lastTouchX; const dy = e.touches[0].clientY - lastTouchY;
            lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
            this.lookYaw   -= dx * 0.003;
            this.lookPitch -= dy * 0.003;
            this.lookPitch = Math.max(-Math.PI / 1.5, Math.min(Math.PI / 1.5, this.lookPitch));
        });

        this.container.addEventListener('wheel', (e) => {
            if (!this.isActive) return;
            const delta = e.deltaY > 0 ? -1 : 1;
            this.mapZoom = Math.max(10, Math.min(16, this.mapZoom + delta));
            this.clearTiles();
        });

        // Двойной клик — сброс взгляда
        this.container.addEventListener('dblclick', () => { this.lookYaw = 0; this.lookPitch = 0; });
    }

    // ─── Тайлы ───────────────────────────────────────────────────────────────
    clearTiles() {
        for (let key in this.tiles) {
            this.tileGroup.remove(this.tiles[key].mesh);
            if (this.tiles[key].mesh.material.map) this.tiles[key].mesh.material.map.dispose();
            this.tiles[key].mesh.material.dispose();
            this.tiles[key].mesh.geometry.dispose();
        }
        this.tiles = {};
        this._loadQueue = [];
    }

    _enqueueTile(url, mat, dist) {
        this._loadQueue.push({ url, mat, dist });
        this._loadQueue.sort((a, b) => a.dist - b.dist);
        this._processQueue();
    }

    _processQueue() {
        while (this._loading < this._maxConcurrent && this._loadQueue.length > 0) {
            const { url, mat } = this._loadQueue.shift();
            this._loading++;
            this.textureLoader.load(url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = this.maxAnisotropy;
                tex.minFilter = THREE.LinearMipmapLinearFilter; // ← мипмапы = чёткость вдали
                tex.magFilter = THREE.LinearFilter;
                tex.generateMipmaps = true;
                mat.map = tex;
                mat.color.set(0xffffff);
                mat.needsUpdate = true;
                this._loading--;
                this._processQueue();
            }, undefined, () => {
                this._loading--;
                this._processQueue();
            });
        }
    }

    // ─── Сеттеры ─────────────────────────────────────────────────────────────
    setHudState(v) { this.hudEnabled = v; }
    setMapType(t) { this.mapType = t; this.clearTiles(); }
    setTimeMode(m) { this.timeMode = m; }
    setCameraDirection(d) { this.cameraDir = d; this.lookYaw = 0; this.lookPitch = 0; }

    // ─── Утилиты ─────────────────────────────────────────────────────────────
    latLonToMercator(lat, lon) {
        return {
            x: R_EARTH_M * lon * Math.PI / 180,
            y: R_EARTH_M * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
        };
    }

    getTileCoords(lat, lon, zoom) {
        const n = Math.pow(2, zoom);
        const latRad = lat * Math.PI / 180;
        return {
            tx: Math.floor(n * ((lon + 180) / 360)),
            ty: Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2)
        };
    }

    // ─── Окружение (небо / свет) ──────────────────────────────────────────────
    updateEnvironment(lat, lon) {
        let date = new Date();
        if (this.timeMode === 'day')   date = new Date('2024-06-21T12:00:00Z');
        if (this.timeMode === 'night') date = new Date('2024-12-21T00:00:00Z');

        if (window.Astronomy) {
            const obs = new window.Astronomy.Observer(lat, lon, 0);

            // Солнце
            const sunEq  = window.Astronomy.Equator('Sun', date, obs, true, true);
            const sunHor = window.Astronomy.Horizon(date, obs, sunEq.ra, sunEq.dec, 'normal');
            const sunAlt = sunHor.altitude * (Math.PI / 180);
            const sunAz  = (-sunHor.azimuth + 180) * (Math.PI / 180);
            const sd = 160000;
            this.sunLight.position.set(
                sd * Math.cos(sunAlt) * Math.sin(sunAz),
                sd * Math.sin(sunAlt),
                sd * Math.cos(sunAlt) * Math.cos(sunAz)
            );
            this.skyUniforms.sunPosition.value.copy(this.sunLight.position);

            // Луна
            const moonEq  = window.Astronomy.Equator('Moon', date, obs, true, true);
            const moonHor = window.Astronomy.Horizon(date, obs, moonEq.ra, moonEq.dec, 'normal');
            const mAlt = moonHor.altitude * (Math.PI / 180);
            const mAz  = (-moonHor.azimuth + 180) * (Math.PI / 180);
            const md = 100000;
            this.moon.position.set(
                md * Math.cos(mAlt) * Math.sin(mAz),
                md * Math.sin(mAlt),
                md * Math.cos(mAlt) * Math.cos(mAz)
            );
            this.moon.lookAt(0, 0, 0);

            // t: 1 = полдень, 0 = закат, -1 = полночь
            const t = Math.max(-1, Math.min(1, sunAlt / 0.25));
            const isNight = t < -0.15;

            let topColor, midColor, bottomColor, fogColor;
            let sunsetIntensity = 0;

            if (t >= 0) {
                // День
                topColor    = new THREE.Color().lerpColors(new THREE.Color(0x1a3a7a), new THREE.Color(0x0055cc), t);
                midColor    = new THREE.Color().lerpColors(new THREE.Color(0x5577cc), new THREE.Color(0x4488ff), t);
                bottomColor = new THREE.Color().lerpColors(new THREE.Color(0xffaa66), new THREE.Color(0x99ccff), t);
                fogColor    = new THREE.Color().lerpColors(new THREE.Color(0xcc8855), new THREE.Color(0x8ab4d4), t);
                sunsetIntensity = 1.0 - t;
            } else {
                // Ночь
                const nf = Math.min(1, Math.abs(t) * 1.5);
                topColor    = new THREE.Color().lerpColors(new THREE.Color(0x0a1a50), new THREE.Color(0x02040e), nf);
                midColor    = new THREE.Color().lerpColors(new THREE.Color(0x1a2a60), new THREE.Color(0x030815), nf);
                bottomColor = new THREE.Color().lerpColors(new THREE.Color(0xff8833), new THREE.Color(0x051020), nf);
                fogColor    = new THREE.Color().lerpColors(new THREE.Color(0x334466), new THREE.Color(0x050a18), nf);
                sunsetIntensity = 1.0 - nf;
            }

            // ПНВ
            if (isNight && this.hudEnabled) {
                this.hemiLight.color.setHex(0x22ff44);
                this.hemiLight.groundColor.setHex(0x002200);
                this.hemiLight.intensity = 2.0;
                this.sunLight.intensity = 0;
                fogColor    = new THREE.Color(0x041a04);
                bottomColor = fogColor.clone();
                topColor    = new THREE.Color(0x020c02);
                midColor    = new THREE.Color(0x031203);
                this.container.classList.add('night-vision');
            } else {
                this.hemiLight.color.setHex(0xffffff);
                this.hemiLight.groundColor.setHex(0x334455);
                this.hemiLight.intensity = 0.1 + Math.max(0, t) * 0.6;
                this.sunLight.intensity  = Math.max(0.05, t * 3.2);
                this.container.classList.remove('night-vision');
            }

            this.skyUniforms.topColor.value.copy(topColor);
            this.skyUniforms.midColor.value.copy(midColor);
            this.skyUniforms.bottomColor.value.copy(bottomColor);
            this.skyUniforms.sunsetIntensity.value = sunsetIntensity;
            this.scene.fog.color.copy(fogColor);

            // Яркость звёзд
            this.starsGroup.traverse(c => {
                if (c.isPoints) c.material.opacity = Math.max(0, (-t) * 1.4);
            });
        }
    }

    // ─── Главный update ───────────────────────────────────────────────────────
    updateData(lat, lon, alt, head, vel, vrate) {
        if (!this.isActive) return;

        // Плавная интерполяция позиции (убирает рывки при обновлении данных)
        if (this.smoothLat === null) { this.smoothLat = lat; this.smoothLon = lon; this.smoothAlt = alt; }
        this.smoothLat = THREE.MathUtils.lerp(this.smoothLat, lat, 0.04);
        this.smoothLon = THREE.MathUtils.lerp(this.smoothLon, lon, 0.04);
        this.smoothAlt = THREE.MathUtils.lerp(this.smoothAlt, alt, 0.04);

        this.updateEnvironment(lat, lon);

        const planeMerc = this.latLonToMercator(this.smoothLat, this.smoothLon);
        const { tx, ty } = this.getTileCoords(this.smoothLat, this.smoothLon, this.mapZoom);
        const tileSizeMercator = (2 * Math.PI * R_EARTH_M) / Math.pow(2, this.mapZoom);

        const currentTiles = new Set();
        for (let ix = -this.gridRange; ix <= this.gridRange; ix++) {
            for (let iy = -this.gridRange; iy <= this.gridRange; iy++) {
                const cx = tx + ix;
                const cy = ty + iy;
                const key = `${this.mapZoom}_${this.mapType}_${cx}_${cy}`;
                currentTiles.add(key);

                if (!this.tiles[key]) {
                    const geo = new THREE.PlaneGeometry(tileSizeMercator, tileSizeMercator);
                    // Плейсхолдер тёмно-серый с лёгкой синевой (похоже на воду/рельеф)
                    const mat = new THREE.MeshLambertMaterial({ color: 0x2a3040 });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.receiveShadow = false;
                    this.tileGroup.add(mesh);
                    this.tiles[key] = { mesh };

                    // Расстояние до центра для приоритизации загрузки
                    const dist = Math.sqrt(ix * ix + iy * iy);
                    const url = `https://mt1.google.com/vt/lyrs=${this.mapType}&hl=ru&x=${cx}&y=${cy}&z=${this.mapZoom}&scale=2`;
                    this._enqueueTile(url, mat, dist);
                }

                const tileMercX = (cx / Math.pow(2, this.mapZoom)) * (2 * Math.PI * R_EARTH_M) - Math.PI * R_EARTH_M + tileSizeMercator / 2;
                const tileMercY = Math.PI * R_EARTH_M - (cy / Math.pow(2, this.mapZoom)) * (2 * Math.PI * R_EARTH_M) - tileSizeMercator / 2;
                this.tiles[key].mesh.position.set(tileMercX - planeMerc.x, 0, -(tileMercY - planeMerc.y));
            }
        }

        // Удаляем дальние тайлы
        for (let key in this.tiles) {
            if (!currentTiles.has(key)) {
                this.tileGroup.remove(this.tiles[key].mesh);
                if (this.tiles[key].mesh.material.map) this.tiles[key].mesh.material.map.dispose();
                this.tiles[key].mesh.material.dispose();
                this.tiles[key].mesh.geometry.dispose();
                delete this.tiles[key];
            }
        }

        // Туман — показываем чуть дальше тайлов, чтобы края плавно скрывались
        const visibleEdge = this.gridRange * tileSizeMercator;
        this.scene.fog.near = visibleEdge * 0.55;
        this.scene.fog.far  = visibleEdge * 1.0;

        // ─── Позиция камеры ───
        const zoomFactor = Math.pow(2, this.mapZoom - 10);
        const visualAlt  = Math.max(150, this.smoothAlt / zoomFactor);
        this.camera.position.set(0, visualAlt, 0);

        // ─── Крен (Roll) ──────
        if (this.lastHdg !== null) {
            let dH = head - this.lastHdg;
            if (dH > 180) dH -= 360; if (dH < -180) dH += 360;
            this.targetRoll = Math.max(-0.55, Math.min(0.55, -dH * 0.12));
        }
        this.lastHdg     = head;
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 0.04);

        // ─── Вращение камеры ──
        const isRear    = this.cameraDir === -1;
        const planeYaw  = (isRear ? -head * Math.PI / 180 + Math.PI : -head * Math.PI / 180);
        const pitchRaw  = Math.atan2(vrate, vel / 3.6);
        const pitch     = THREE.MathUtils.lerp(0, pitchRaw, 0.08);
        const basePitch = -0.12;

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(
            (isRear ? -pitch : pitch) + basePitch + this.lookPitch,
            planeYaw + this.lookYaw,
            isRear ? -this.currentRoll : this.currentRoll
        );

        // Купол неба + облака следуют за камерой
        this.skyDome.position.copy(this.camera.position);
        this.cloudGroup.position.copy(this.camera.position);

        // Медленное вращение облаков (дрейф)
        this.cloudGroup.rotation.y += 0.00003;

        this.composer.render();
    }

    // ─── Ресайз ──────────────────────────────────────────────────────────────
    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        if (this.fxaaPass) this.fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
    }

    start() {
        this.isActive  = true;
        this.smoothLat = null;
        this.smoothLon = null;
        this.smoothAlt = null;
        this.lastHdg   = null;
        this.resize();
    }

    stop() { this.isActive = false; }
}
