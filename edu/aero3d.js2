import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const R_EARTH_M = 6378137;

export class PilotSimulator {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isActive = false;
        
        this.mapZoom = 11;
        this.gridRange = 4; // 9x9 тайлов
        this.mapType = 'y'; // Спутник, гибрид, схема
        this.timeMode = 'real'; // real, day, night
        this.cameraDir = 1; // 1 = Вперед, -1 = Назад
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Для четкости текстур на расстоянии получаем макс. анизотропию
        this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.container.appendChild(this.renderer.domElement);
        
        // --- ОСВЕЩЕНИЕ И АТМОСФЕРА ---
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(this.hemiLight);
        
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
        this.scene.add(this.sunLight);

        // Линзовые блики Солнца
        const lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(this.createFlareTexture(), 500, 0, new THREE.Color(0xffffff)));
        this.sunLight.add(lensflare);

        this.scene.fog = new THREE.Fog(0x7ec0ee, 10000, 45000);

        // --- ЗВЕЗДЫ ---
        this.starsGroup = new THREE.Group();
        this.createStars();
        this.scene.add(this.starsGroup);

        // --- ЛУНА ---
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        const tMoon = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg');
        this.moon = new THREE.Mesh(
            new THREE.SphereGeometry(1500, 32, 32),
            new THREE.MeshStandardMaterial({ map: tMoon, roughness: 1.0, metalness: 0.0 })
        );
        this.scene.add(this.moon);

        // Переменные для обзора из кабины
        this.lookYaw = 0;
        this.lookPitch = 0;
        this.isDragging = false;
        
        this.currentRoll = 0;
        this.targetRoll = 0;
        this.lastHdg = null;

        // Менеджер тайлов земли
        this.tiles = {};
        this.tileGroup = new THREE.Group();
        this.scene.add(this.tileGroup);
        this.textureLoader = textureLoader;

        this.setupControls();
        window.addEventListener('resize', () => { if(this.isActive) this.resize(); });
    }

    createFlareTexture() {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512; const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(256,256,0,256,256,256);
        g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.1,'rgba(255,240,200,0.8)');
        g.addColorStop(0.4,'rgba(255,140,40,0.1)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0,0,512,512); return new THREE.CanvasTexture(c);
    }

    createStars() {
        const bgStarsGeo = new THREE.BufferGeometry();
        const bgStarsPos = [];
        const bgStarsColors = [];
        for (let i = 0; i < 2000; i++) {
            const raRad = Math.random() * Math.PI * 2;
            const decRad = Math.asin((Math.random() * 2) - 1);
            const r = 40000 + Math.random() * 5000;
            bgStarsPos.push(r * Math.cos(decRad) * Math.cos(raRad), r * Math.sin(decRad), -r * Math.cos(decRad) * Math.sin(raRad));
            const c = 0.5 + Math.random() * 0.5;
            bgStarsColors.push(c, c, c + Math.random() * 0.2);
        }
        bgStarsGeo.setAttribute('position', new THREE.Float32BufferAttribute(bgStarsPos, 3));
        bgStarsGeo.setAttribute('color', new THREE.Float32BufferAttribute(bgStarsColors, 3));
        const bgStarsMat = new THREE.PointsMaterial({ size: 60, vertexColors: true, transparent: true, opacity: 0.8, sizeAttenuation: true, depthWrite: false });
        this.starsGroup.add(new THREE.Points(bgStarsGeo, bgStarsMat));
    }

    setupControls() {
        this.container.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.isDragging = true;
            // Двойной клик или клик на колесико - сброс взгляда в центр
            if (e.button === 1 || e.detail === 2) {
                this.lookYaw = 0; this.lookPitch = 0;
            }
        });
        window.addEventListener('mouseup', () => this.isDragging = false);
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.isActive) return;
            // Взгляд остается на месте, не возвращается в ноль
            this.lookYaw -= e.movementX * 0.003;
            this.lookPitch -= e.movementY * 0.003;
            this.lookPitch = Math.max(-Math.PI/1.5, Math.min(Math.PI/1.5, this.lookPitch));
        });

        this.container.addEventListener('wheel', (e) => {
            if (!this.isActive) return;
            const zoomDelta = e.deltaY > 0 ? -1 : 1;
            this.mapZoom = Math.max(8, Math.min(14, this.mapZoom + zoomDelta));
            this.clearTiles();
        });
    }

    clearTiles() {
        for (let key in this.tiles) {
            this.tileGroup.remove(this.tiles[key].mesh);
            if (this.tiles[key].mesh.material.map) this.tiles[key].mesh.material.map.dispose();
            this.tiles[key].mesh.material.dispose();
            this.tiles[key].mesh.geometry.dispose();
        }
        this.tiles = {};
    }

    setMapType(type) {
        this.mapType = type;
        this.clearTiles();
    }

    setTimeMode(mode) {
        this.timeMode = mode;
    }

    setCameraDirection(dir) {
        this.cameraDir = dir;
        this.lookYaw = 0; this.lookPitch = 0; // Сброс взгляда при смене камеры
    }

    latLonToMercator(lat, lon) {
        const x = R_EARTH_M * lon * Math.PI / 180;
        const y = R_EARTH_M * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
        return { x, y };
    }

    getTileCoords(lat, lon, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor(n * ((lon + 180) / 360));
        const latRad = lat * Math.PI / 180;
        const y = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI)) / 2);
        return { tx: x, ty: y };
    }

    updateEnvironment(lat, lon) {
        let date = new Date();
        if (this.timeMode === 'day') date = new Date("2024-06-21T12:00:00Z"); // Имитация зенита
        if (this.timeMode === 'night') date = new Date("2024-12-21T00:00:00Z"); // Имитация полуночи

        if (window.Astronomy) {
            const obs = new window.Astronomy.Observer(lat, lon, 0);
            
            // Расчет Солнца
            const sunEq = window.Astronomy.Equator('Sun', date, obs, true, true);
            const sunHor = window.Astronomy.Horizon(date, obs, sunEq.ra, sunEq.dec, 'normal');
            
            const sunAlt = sunHor.altitude * (Math.PI / 180);
            const sunAz = (-sunHor.azimuth + 180) * (Math.PI / 180); // Корректировка азимута для 3D
            const sunDist = 30000;

            this.sunLight.position.set(
                sunDist * Math.cos(sunAlt) * Math.sin(sunAz),
                sunDist * Math.sin(sunAlt),
                sunDist * Math.cos(sunAlt) * Math.cos(sunAz)
            );

            // Расчет Луны
            const moonEq = window.Astronomy.Equator('Moon', date, obs, true, true);
            const moonHor = window.Astronomy.Horizon(date, obs, moonEq.ra, moonEq.dec, 'normal');
            
            const moonAlt = moonHor.altitude * (Math.PI / 180);
            const moonAz = (-moonHor.azimuth + 180) * (Math.PI / 180);
            const moonDist = 25000;

            this.moon.position.set(
                moonDist * Math.cos(moonAlt) * Math.sin(moonAz),
                moonDist * Math.sin(moonAlt),
                moonDist * Math.cos(moonAlt) * Math.cos(moonAz)
            );
            this.moon.lookAt(0,0,0);

            // Смена цвета неба (День/Закат/Ночь)
            const t = Math.max(0, Math.min(1, (sunAlt + 0.1) / 0.3)); 
            const skyColor = new THREE.Color().lerpColors(new THREE.Color(0x02040a), new THREE.Color(0x7ec0ee), t);
            // Добавляем рыжий оттенок на закате
            if (t > 0 && t < 1) skyColor.lerp(new THREE.Color(0xff8844), 1 - Math.abs(t - 0.5)*2);

            this.scene.background = skyColor;
            this.scene.fog.color = skyColor;
            
            this.hemiLight.intensity = 0.1 + (t * 0.5);
            this.sunLight.intensity = Math.max(0, t * 3.0);
            this.starsGroup.visible = t < 0.5;
        }
    }

    updateData(lat, lon, alt, head, vel, vrate) {
        if (!this.isActive) return;

        this.updateEnvironment(lat, lon);

        const planeMerc = this.latLonToMercator(lat, lon);
        const { tx, ty } = this.getTileCoords(lat, lon, this.mapZoom);
        
        const currentTiles = new Set();
        const tileSizeMercator = (2 * Math.PI * R_EARTH_M) / Math.pow(2, this.mapZoom);

        for (let ix = -this.gridRange; ix <= this.gridRange; ix++) {
            for (let iy = -this.gridRange; iy <= this.gridRange; iy++) {
                const cx = tx + ix;
                const cy = ty + iy;
                const key = `${this.mapZoom}_${this.mapType}_${cx}_${cy}`;
                currentTiles.add(key);

                if (!this.tiles[key]) {
                    const geo = new THREE.PlaneGeometry(tileSizeMercator, tileSizeMercator);
                    const mat = new THREE.MeshLambertMaterial({ color: 0x333333 });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    
                    this.tileGroup.add(mesh);
                    this.tiles[key] = { mesh };

                    const url = `https://mt1.google.com/vt/lyrs=${this.mapType}&hl=ru&x=${cx}&y=${cy}&z=${this.mapZoom}`;
                    this.textureLoader.load(url, (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        tex.anisotropy = this.maxAnisotropy; // Делает карту четкой вдаль!
                        mat.map = tex;
                        mat.color.set(0xffffff);
                        mat.needsUpdate = true;
                    });
                }

                const tileMercX = (cx / Math.pow(2, this.mapZoom)) * (2*Math.PI*R_EARTH_M) - Math.PI*R_EARTH_M + tileSizeMercator/2;
                const tileMercY = Math.PI*R_EARTH_M - (cy / Math.pow(2, this.mapZoom)) * (2*Math.PI*R_EARTH_M) - tileSizeMercator/2;

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
        this.scene.fog.near = visibleEdge * 0.3;
        this.scene.fog.far = visibleEdge * 0.9;

        const zoomSpeedFactor = Math.pow(2, this.mapZoom - 10);
        const visualAlt = Math.max(200, alt / zoomSpeedFactor); 
        this.camera.position.set(0, visualAlt, 0);

        if (this.lastHdg !== null) {
            let deltaHdg = head - this.lastHdg;
            if (deltaHdg > 180) deltaHdg -= 360;
            if (deltaHdg < -180) deltaHdg += 360;
            this.targetRoll = Math.max(-0.6, Math.min(0.6, -deltaHdg * 0.1)); 
        }
        this.lastHdg = head;
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 0.05);

        // Расчет направления
        const isRear = this.cameraDir === -1;
        const rawPlaneYaw = -head * (Math.PI / 180);
        const planeYaw = isRear ? rawPlaneYaw + Math.PI : rawPlaneYaw;
        
        const pitchRaw = Math.atan2(vrate, vel / 3.6);
        const pitch = THREE.MathUtils.lerp(0, pitchRaw, 0.1);

        this.camera.rotation.order = 'YXZ';
        
        // Базовый наклон камеры немного вниз (Меньше неба)
        const basePitchOffset = -0.15; // примерно -8.5 градусов

        this.camera.rotation.set(
            (isRear ? -pitch : pitch) + basePitchOffset + this.lookPitch, 
            planeYaw + this.lookYaw, 
            isRear ? -this.currentRoll : this.currentRoll
        );

        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    start() {
        this.isActive = true;
        this.resize();
        this.lastHdg = null;
    }

    stop() {
        this.isActive = false;
    }
}