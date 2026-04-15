import * as THREE from 'three';

const R_EARTH_M = 6378137;

export class PilotSimulator {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isActive = false;
        
        // Настройки карты
        this.mapZoom = 11; // Начальный зум (баланс между деталями и горизонтом)
        this.gridRange = 4; // Сетка 9x9 тайлов вокруг самолета
        
        // Сцена, камера, рендерер
        this.scene = new THREE.Scene();
        const skyColor = new THREE.Color(0x7ec0ee); // Цвет ясного неба
        this.scene.background = skyColor;
        this.scene.fog = new THREE.Fog(skyColor, 10000, 50000); // Динамический туман
        
        this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);
        
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
        this.scene.add(hemiLight);

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
        this.textureLoader = new THREE.TextureLoader();
        this.textureLoader.setCrossOrigin('anonymous');

        this.setupControls();
        window.addEventListener('resize', () => { if(this.isActive) this.resize(); });
    }

    setupControls() {
        // Управление обзором (мышь)
        this.container.addEventListener('mousedown', () => this.isDragging = true);
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.lookYaw = 0; this.lookPitch = 0;
        });
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.isActive) return;
            this.lookYaw -= e.movementX * 0.003;
            this.lookPitch -= e.movementY * 0.003;
            this.lookPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.lookPitch));
        });

        // Управление ЗУМОМ карты (колесико мыши)
        this.container.addEventListener('wheel', (e) => {
            if (!this.isActive) return;
            // Крутим вниз - отдаляем (меньше зум), Крутим вверх - приближаем (больше зум = больше скорость)
            const zoomDelta = e.deltaY > 0 ? -1 : 1;
            this.mapZoom = Math.max(9, Math.min(14, this.mapZoom + zoomDelta));
            
            // Принудительно очищаем старые тайлы, чтобы они мгновенно перерисовались в новом зуме
            for (let key in this.tiles) {
                this.tileGroup.remove(this.tiles[key].mesh);
                if (this.tiles[key].mesh.material.map) this.tiles[key].mesh.material.map.dispose();
                this.tiles[key].mesh.material.dispose();
                this.tiles[key].mesh.geometry.dispose();
            }
            this.tiles = {};
        });
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

    updateData(lat, lon, alt, head, vel, vrate) {
        if (!this.isActive) return;

        const planeMerc = this.latLonToMercator(lat, lon);
        const { tx, ty } = this.getTileCoords(lat, lon, this.mapZoom);
        
        const currentTiles = new Set();
        const tileSizeMercator = (2 * Math.PI * R_EARTH_M) / Math.pow(2, this.mapZoom);

        // Генерация сетки земли вокруг самолета
        for (let ix = -this.gridRange; ix <= this.gridRange; ix++) {
            for (let iy = -this.gridRange; iy <= this.gridRange; iy++) {
                const cx = tx + ix;
                const cy = ty + iy;
                const key = `${this.mapZoom}_${cx}_${cy}`;
                currentTiles.add(key);

                if (!this.tiles[key]) {
                    const geo = new THREE.PlaneGeometry(tileSizeMercator, tileSizeMercator);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x555555 }); // Серый фон пока грузится
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    
                    this.tileGroup.add(mesh);
                    this.tiles[key] = { mesh };

                    const url = `https://mt1.google.com/vt/lyrs=s,h&hl=ru&x=${cx}&y=${cy}&z=${this.mapZoom}`;
                    this.textureLoader.load(url, (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
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

        // Удаление старых тайлов
        for (let key in this.tiles) {
            if (!currentTiles.has(key)) {
                this.tileGroup.remove(this.tiles[key].mesh);
                if (this.tiles[key].mesh.material.map) this.tiles[key].mesh.material.map.dispose();
                this.tiles[key].mesh.material.dispose();
                this.tiles[key].mesh.geometry.dispose();
                delete this.tiles[key];
            }
        }

        // --- МАГИЯ ВИЗУАЛА: ТУМАН И ВЫСОТА ---
        // 1. Настраиваем туман так, чтобы он всегда скрывал края карты при любом зуме
        const visibleEdge = this.gridRange * tileSizeMercator;
        this.scene.fog.near = visibleEdge * 0.4; // Туман начинается с середины сетки
        this.scene.fog.far = visibleEdge * 0.95; // И полностью скрывает землю на краю

        // 2. Иллюзия скорости от Зума (Чем больше зум, тем "ближе" мы к земле визуально)
        // Если лететь на 10км в реальности, земля еле ползет. Сжимаем высоту для симулятора.
        const zoomSpeedFactor = Math.pow(2, this.mapZoom - 10); // Чем выше зум, тем больше делитель
        const visualAlt = Math.max(200, alt / zoomSpeedFactor); 
        this.camera.position.set(0, visualAlt, 0);

        // --- ФИЗИКА КАМЕРЫ (Крен и Тангаж) ---
        if (this.lastHdg !== null) {
            let deltaHdg = head - this.lastHdg;
            if (deltaHdg > 180) deltaHdg -= 360;
            if (deltaHdg < -180) deltaHdg += 360;
            this.targetRoll = Math.max(-0.6, Math.min(0.6, -deltaHdg * 0.1)); 
        }
        this.lastHdg = head;
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 0.05);

        const pitchRaw = Math.atan2(vrate, vel / 3.6);
        const pitch = THREE.MathUtils.lerp(0, pitchRaw, 0.1);

        const planeYaw = -head * (Math.PI / 180);

        this.camera.rotation.order = 'YXZ';
        if (!this.isDragging) {
            this.lookYaw = THREE.MathUtils.lerp(this.lookYaw, 0, 0.05);
            this.lookPitch = THREE.MathUtils.lerp(this.lookPitch, 0, 0.05);
        }
        
        this.camera.rotation.set(
            pitch + this.lookPitch, 
            planeYaw + this.lookYaw, 
            this.currentRoll
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