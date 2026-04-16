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

        this.mapZoom = 13;
        this.gridRange = 5;
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
            precision: 'highp',
        });
        
        // Ограничиваем разрешение на мобилках для сохранения FPS и батареи
        const isMobile = window.innerWidth <= 768;
        this.renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.2) : Math.min(window.devicePixelRatio, 2.5));
        
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25; // Увеличена общая яркость сцены
        this.renderer.shadowMap.enabled = false;
        this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

        this.container.appendChild(this.renderer.domElement);

        this.composer = null;
        this._initComposer();

        // --- ОСВЕЩЕНИЕ ---
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        this.scene.add(this.hemiLight);
        
        this.sunLight = new THREE.DirectionalLight(0xffffff, 4.0);
        this.scene.add(this.sunLight);

        // --- КРАСИВЫЙ СОЛНЕЧНЫЙ БЛИК (LENS FLARE) ---
        const lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(this._createFlareCore(), 800, 0, new THREE.Color(1.0, 0.98, 0.9)));
        lensflare.addElement(new LensflareElement(this._createFlareRays(), 1000, 0, new THREE.Color(1.0, 0.9, 0.7)));
        lensflare.addElement(new LensflareElement(this._createFlareHexagon(), 60, 0.15, new THREE.Color(0.3, 0.5, 1.0), 0.4));
        lensflare.addElement(new LensflareElement(this._createFlareHexagon(), 40, 0.3, new THREE.Color(0.2, 1.0, 0.3), 0.3));
        lensflare.addElement(new LensflareElement(this._createFlareHexagon(), 90, 0.45, new THREE.Color(1.0, 0.4, 0.4), 0.5));
        lensflare.addElement(new LensflareElement(this._createFlareHexagon(), 120, 0.6, new THREE.Color(1.0, 0.8, 0.3), 0.2));
        lensflare.addElement(new LensflareElement(this._createFlareRing(), 250, 0.8, new THREE.Color(0.6, 0.8, 1.0), 0.15));
        this.sunLight.add(lensflare);

        this.scene.fog = new THREE.FogExp2(0x8ab4d4, 0.000012);

        this._createSky();
        
        this.starsGroup = new THREE.Group();
        this._createStars();
        this.scene.add(this.starsGroup);

        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        const tMoon = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg');
        this.moon = new THREE.Mesh(
            new THREE.SphereGeometry(1800, 32, 32),
            new THREE.MeshStandardMaterial({ map: tMoon, roughness: 1.0, metalness: 0.0, emissive: new THREE.Color(0x111008), emissiveIntensity: 0.5 })
        );
        this.scene.add(this.moon);

        this._createClouds();

        this.lookYaw = 0; this.lookPitch = 0; this.isDragging = false;
        this.currentRoll = 0; this.targetRoll = 0; this.lastHdg = null;
        this.smoothLat = null; this.smoothLon = null; this.smoothAlt = null;

        this.tiles = {};
        this.tileGroup = new THREE.Group();
        this.scene.add(this.tileGroup);
        this.textureLoader = textureLoader;

        this._loadQueue = [];
        this._loading = 0;
        this._maxConcurrent = 8;

        this._setupControls();
        window.addEventListener('resize', () => { if (this.isActive) this.resize(); });
    }

    _initComposer() {
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 600;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Уменьшаем разрешение текстуры блума на телефонах (x0.5)
        const isMobile = window.innerWidth <= 768;
        const bloomResX = isMobile ? w * 0.5 : w;
        const bloomResY = isMobile ? h * 0.5 : h;
        
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(bloomResX, bloomResY), 0.45, 0.7, 0.85);
        this.composer.addPass(this.bloomPass);

        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
        this.composer.addPass(this.fxaaPass);
    }

    // ─── ПРОЦЕДУРНЫЕ ТЕКСТУРЫ БЛИКОВ ─────────────────────────────────────────
    _createFlareCore() {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(0.1, 'rgba(255, 240, 200, 0.9)');
        g.addColorStop(0.4, 'rgba(255, 180, 80, 0.3)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
        return new THREE.CanvasTexture(c);
    }

    _createFlareRays() {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const ctx = c.getContext('2d');
        ctx.translate(256, 256);
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const length = 100 + Math.random() * 150;
            const alpha = 0.05 + Math.random() * 0.15;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
            ctx.lineWidth = 1 + Math.random() * 3;
            ctx.strokeStyle = `rgba(255, 240, 200, ${alpha})`;
            ctx.stroke();
        }
        return new THREE.CanvasTexture(c);
    }

    _createFlareHexagon() {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const ctx = c.getContext('2d');
        ctx.translate(64, 64);
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
            const angle = (i * Math.PI) / 3;
            const x = Math.cos(angle) * 50;
            const y = Math.sin(angle) * 50;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
        return new THREE.CanvasTexture(c);
    }

    _createFlareRing() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const ctx = c.getContext('2d');
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; 
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath(); ctx.arc(128, 128, 115, 0, Math.PI * 2); ctx.stroke();
        return new THREE.CanvasTexture(c);
    }

    // ─── НЕБО ────────────────────────────────────────────────────────────────
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

                void main() {
                    vec3 viewDir = normalize(vWorldPosition);
                    vec3 sunDir = normalize(sunPosition);
                    float h = viewDir.y;

                    vec3 skyColor;
                    if (h > 0.0) {
                        skyColor = mix(midColor, topColor, pow(h, 0.5));
                    } else {
                        skyColor = mix(midColor, bottomColor, pow(-h * 2.0, 0.4));
                    }

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

    // ─── ОБЛАКА ──────────────────────────────────────────────────────────────
    _createClouds() {
        this.cloudGroup = new THREE.Group();
        const cloudTex = this._createCloudTexture();
        this.cloudMaterial = new THREE.MeshBasicMaterial({
            map: cloudTex, transparent: true, opacity: 0.8,
            depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending
        });

        const cloudCount = window.innerWidth <= 768 ? 12 : 35; // На телефонах облаков меньше
        for (let i = 0; i < cloudCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 3000 + Math.random() * 30000;
            const scale = 3000 + Math.random() * 8000;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale * 0.5), this.cloudMaterial);
            mesh.position.set(Math.cos(angle) * dist, 500 + Math.random() * 1000, Math.sin(angle) * dist);
            
            mesh.lookAt(0, mesh.position.y, 0); 
            mesh.rotation.z = (Math.random() - 0.5) * 0.2;
            
            this.cloudGroup.add(mesh);
        }
        this.scene.add(this.cloudGroup);
    }

    _createCloudTexture() {
        const size = 512;
        const c = document.createElement('canvas'); c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        
        const drawPuff = (x, y, r) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            g.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
            g.addColorStop(0.8, 'rgba(240, 245, 255, 0.1)');
            g.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        };

        drawPuff(256, 256, 150);
        drawPuff(180, 280, 110);
        drawPuff(330, 270, 120);
        drawPuff(200, 200, 100);
        drawPuff(310, 210, 90);

        return new THREE.CanvasTexture(c);
    }

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
            this.lookYaw -= dx * 0.0025;
            this.lookPitch -= dy * 0.0025;
            this.lookPitch = Math.max(-Math.PI / 1.5, Math.min(Math.PI / 1.5, this.lookPitch));
        });

        let lastTouchX = 0, lastTouchY = 0;
        this.container.addEventListener('touchstart', (e) => { lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; });
        this.container.addEventListener('touchmove', (e) => {
            if (!this.isActive) return;
            const dx = e.touches[0].clientX - lastTouchX; const dy = e.touches[0].clientY - lastTouchY;
            lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
            this.lookYaw -= dx * 0.003;
            this.lookPitch -= dy * 0.003;
            this.lookPitch = Math.max(-Math.PI / 1.5, Math.min(Math.PI / 1.5, this.lookPitch));
        });

        this.container.addEventListener('wheel', (e) => {
            if (!this.isActive) return;
            const delta = e.deltaY > 0 ? -1 : 1;
            this.mapZoom = Math.max(10, Math.min(16, this.mapZoom + delta));
            this.clearTiles();
        });

        this.container.addEventListener('dblclick', () => { this.lookYaw = 0; this.lookPitch = 0; });
    }

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
                tex.minFilter = THREE.LinearMipmapLinearFilter;
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

    setHudState(v) { this.hudEnabled = v; }
    setMapType(t) { this.mapType = t; this.clearTiles(); }
    setTimeMode(m) { this.timeMode = m; }
    setCameraDirection(d) { this.cameraDir = d; this.lookYaw = 0; this.lookPitch = 0; }

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

    updateEnvironment(lat, lon) {
        let date = new Date();
        if (this.timeMode === 'day') date = new Date('2024-06-21T12:00:00Z');
        if (this.timeMode === 'night') date = new Date('2024-12-21T00:00:00Z');

        if (window.Astronomy) {
            const obs = new window.Astronomy.Observer(lat, lon, 0);

            const sunEq = window.Astronomy.Equator('Sun', date, obs, true, true);
            const sunHor = window.Astronomy.Horizon(date, obs, sunEq.ra, sunEq.dec, 'normal');
            const sunAlt = sunHor.altitude * (Math.PI / 180);
            const sunAz = (-sunHor.azimuth + 180) * (Math.PI / 180);
            const sd = 160000;
            this.sunLight.position.set(
                sd * Math.cos(sunAlt) * Math.sin(sunAz),
                sd * Math.sin(sunAlt),
                sd * Math.cos(sunAlt) * Math.cos(sunAz)
            );
            this.skyUniforms.sunPosition.value.copy(this.sunLight.position);

            const moonEq = window.Astronomy.Equator('Moon', date, obs, true, true);
            const moonHor = window.Astronomy.Horizon(date, obs, moonEq.ra, moonEq.dec, 'normal');
            const mAlt = moonHor.altitude * (Math.PI / 180);
            const mAz = (-moonHor.azimuth + 180) * (Math.PI / 180);
            const md = 100000;
            this.moon.position.set(
                md * Math.cos(mAlt) * Math.sin(mAz),
                md * Math.sin(mAlt),
                md * Math.cos(mAlt) * Math.cos(mAz)
            );
            this.moon.lookAt(0, 0, 0);

            const t = Math.max(-1, Math.min(1, sunAlt / 0.25));
            const isNight = t < -0.15;

            let topColor, midColor, bottomColor, fogColor;
            let sunsetIntensity = 0;

            if (t >= 0) {
                // ДЕНЬ
                topColor = new THREE.Color().lerpColors(new THREE.Color(0x1a3a7a), new THREE.Color(0x0055cc), t);
                midColor = new THREE.Color().lerpColors(new THREE.Color(0x5577cc), new THREE.Color(0x4488ff), t);
                bottomColor = new THREE.Color().lerpColors(new THREE.Color(0xffaa66), new THREE.Color(0x99ccff), t);
                fogColor = new THREE.Color().lerpColors(new THREE.Color(0xcc8855), new THREE.Color(0x8ab4d4), t);
                sunsetIntensity = 1.0 - t;
                
                this.cloudMaterial.opacity = 0.8 * Math.max(0, t);
            } else {
                // НОЧЬ
                const nf = Math.min(1, Math.abs(t) * 1.5);
                topColor = new THREE.Color().lerpColors(new THREE.Color(0x0a1a50), new THREE.Color(0x02040e), nf);
                midColor = new THREE.Color().lerpColors(new THREE.Color(0x1a2a60), new THREE.Color(0x030815), nf);
                bottomColor = new THREE.Color().lerpColors(new THREE.Color(0xff8833), new THREE.Color(0x051020), nf);
                fogColor = new THREE.Color().lerpColors(new THREE.Color(0x334466), new THREE.Color(0x050a18), nf);
                sunsetIntensity = 1.0 - nf;
                
                this.cloudMaterial.opacity = 0;
            }

            if (isNight && this.hudEnabled) {
                // РЕЖИМ ПНВ (Ночное видение)
                this.renderer.toneMappingExposure = 1.0;
                this.ambientLight.intensity = 0.5;
                this.ambientLight.color.setHex(0x22ff44);
                this.hemiLight.color.setHex(0x44ff66);
                this.hemiLight.groundColor.setHex(0x004400);
                this.hemiLight.intensity = 2.5; 
                this.sunLight.intensity = 0;
                fogColor = new THREE.Color(0x041a04);
                bottomColor = fogColor.clone();
                topColor = new THREE.Color(0x020c02);
                midColor = new THREE.Color(0x031203);
                this.container.classList.add('night-vision');
            } else {
                // ОБЫЧНЫЙ РЕЖИМ
                const isScheme = this.mapType === 'm';
                
                // Защита от пересвета: для белой схемы сильно снижаем экспозицию
                this.renderer.toneMappingExposure = isScheme ? 0.6 : 1.25; 
                
                this.ambientLight.intensity = isScheme ? 0.15 : 0.4;
                this.ambientLight.color.setHex(isNight ? 0xaaccff : 0xffffff); 
                this.hemiLight.color.setHex(0xffffff);
                this.hemiLight.groundColor.setHex(0x334455);
                
                this.hemiLight.intensity = isNight ? 0.6 : (isScheme ? 0.4 + Math.max(0, t) * 0.2 : 0.8 + Math.max(0, t) * 0.8);
                this.sunLight.intensity = isScheme ? Math.max(0.1, t * 0.5) : Math.max(0.1, t * 5.0);
                this.container.classList.remove('night-vision');
            }

            this.skyUniforms.topColor.value.copy(topColor);
            this.skyUniforms.midColor.value.copy(midColor);
            this.skyUniforms.bottomColor.value.copy(bottomColor);
            this.skyUniforms.sunsetIntensity.value = sunsetIntensity;
            this.scene.fog.color.copy(fogColor);

            this.starsGroup.traverse(c => {
                if (c.isPoints) c.material.opacity = Math.max(0, (-t) * 1.4);
            });
        }
    }

    updateData(lat, lon, alt, head, vel, vrate) {
        if (!this.isActive) return;

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
                    const mat = new THREE.MeshLambertMaterial({ color: 0x2a3040 });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.receiveShadow = false;
                    this.tileGroup.add(mesh);
                    this.tiles[key] = { mesh };

                    const dist = Math.sqrt(ix * ix + iy * iy);
                    const url = `https://mt1.google.com/vt/lyrs=${this.mapType}&hl=ru&x=${cx}&y=${cy}&z=${this.mapZoom}&scale=2`;
                    this._enqueueTile(url, mat, dist);
                }

                const tileMercX = (cx / Math.pow(2, this.mapZoom)) * (2 * Math.PI * R_EARTH_M) - Math.PI * R_EARTH_M + tileSizeMercator / 2;
                const tileMercY = Math.PI * R_EARTH_M - (cy / Math.pow(2, this.mapZoom)) * (2 * Math.PI * R_EARTH_M) - tileSizeMercator / 2;
                this.tiles[key].mesh.position.set(tileMercX - planeMerc.x, 0, -(tileMercY - planeMerc.y));
            }
        }

        for (let key in this.tiles) {
            if (!currentTiles.has(key)) {
                this.tileGroup.remove(this.tiles[key].mesh);
                if (this.tiles[key].mesh.material.map) this.tiles[key].mesh.material.map.dispose();
                this.tiles[key].mesh.material.dispose();
                this.tiles[key].mesh.geometry.dispose();
                delete this.tiles[key];
            }
        }

        const visibleEdge = this.gridRange * tileSizeMercator;
        this.scene.fog.near = visibleEdge * 0.55;
        this.scene.fog.far = visibleEdge * 1.0;

        const zoomFactor = Math.pow(2, this.mapZoom - 10);
        const visualAlt = Math.max(150, this.smoothAlt / zoomFactor);
        this.camera.position.set(0, visualAlt, 0);

        if (this.lastHdg !== null) {
            let dH = head - this.lastHdg;
            if (dH > 180) dH -= 360; if (dH < -180) dH += 360;
            this.targetRoll = Math.max(-0.55, Math.min(0.55, -dH * 0.12));
        }
        this.lastHdg = head;
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 0.04);

        const isRear = this.cameraDir === -1;
        const planeYaw = (isRear ? -head * Math.PI / 180 + Math.PI : -head * Math.PI / 180);
        const pitchRaw = Math.atan2(vrate, vel / 3.6);
        const pitch = THREE.MathUtils.lerp(0, pitchRaw, 0.08);
        const basePitch = -0.12;

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(
            (isRear ? -pitch : pitch) + basePitch + this.lookPitch,
            planeYaw + this.lookYaw,
            isRear ? -this.currentRoll : this.currentRoll
        );

        this.skyDome.position.copy(this.camera.position);
        this.cloudGroup.position.copy(this.camera.position);

        this.cloudGroup.rotation.y += 0.0002;

        this.composer.render();
    }

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
        this.isActive = true;
        this.smoothLat = null;
        this.smoothLon = null;
        this.smoothAlt = null;
        this.lastHdg = null;
        this.resize();
    }

    stop() { this.isActive = false; }
}