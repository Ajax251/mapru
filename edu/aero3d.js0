import * as THREE from 'three';

// Константы для Web Mercator проекции
const R_EARTH_M = 6378137;
const MAP_ZOOM = 13;

export class PilotSimulator {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isActive = false;
        
        // Сцена, камера, рендерер
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Небесно-голубой
        this.scene.fog = new THREE.Fog(0x87CEEB, 5000, 25000); // Дымка скрывает края карты
        
        this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);
        
        // Освещение
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        this.scene.add(hemiLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1000, 5000, 2000);
        this.scene.add(dirLight);

        // Переменные для обзора из кабины
        this.lookYaw = 0;
        this.lookPitch = 0;
        this.isDragging = false;
        
        // Внутренняя физика самолета (для красивого крена)
        this.currentRoll = 0;
        this.targetRoll = 0;
        this.lastHdg = null;

        // Менеджер тайлов земли
        this.tiles = {};
        this.tileGroup = new THREE.Group();
        this.scene.add(this.tileGroup);
        this.textureLoader = new THREE.TextureLoader();
        this.textureLoader.setCrossOrigin('anonymous');
        
        // Простые облака
        this.createClouds();

        // Управление мышью (осмотр из кабины)
        this.setupControls();

        // Изменение размера
        window.addEventListener('resize', () => { if(this.isActive) this.resize(); });
    }

    createClouds() {
        this.cloudsGroup = new THREE.Group();
        const cloudGeo = new THREE.PlaneGeometry(2000, 2000);
        // Простой процедурный материал для облаков (чтобы не грузить текстуры)
        const cloudMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.4, 
            depthWrite: false, side: THREE.DoubleSide
        });

        for(let i=0; i<40; i++) {
            const mesh = new THREE.Mesh(cloudGeo, cloudMat);
            mesh.position.set(
                (Math.random() - 0.5) * 40000,
                3000 + Math.random() * 4000, // Высота облаков 3000 - 7000м
                (Math.random() - 0.5) * 40000
            );
            mesh.rotation.x = Math.PI / 2; // Лежат горизонтально
            this.cloudsGroup.add(mesh);
        }
        this.scene.add(this.cloudsGroup);
    }

    setupControls() {
        this.container.addEventListener('mousedown', () => this.isDragging = true);
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            // Плавный возврат камеры в центр (прямо по курсу)
            this.lookYaw = 0; this.lookPitch = 0;
        });
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.isActive) return;
            this.lookYaw -= e.movementX * 0.005;
            this.lookPitch -= e.movementY * 0.005;
            this.lookPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.lookPitch));
        });
    }

    // Вспомогательная: перевод Lat/Lon в Web Mercator метры
    latLonToMercator(lat, lon) {
        const x = R_EARTH_M * lon * Math.PI / 180;
        const y = R_EARTH_M * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
        return { x, y };
    }

    // Перевод координат в индексы тайлов
    getTileCoords(lat, lon, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor(n * ((lon + 180) / 360));
        const latRad = lat * Math.PI / 180;
        const y = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI)) / 2);
        return { tx: x, ty: y };
    }

    updateData(lat, lon, alt, head, vel, vrate) {
        if (!this.isActive) return;

        // Расчет абсолютной позиции самолета в Mercator
        const planeMerc = this.latLonToMercator(lat, lon);
        
        // Обновление тайлов карты (сетка 5x5 вокруг самолета)
        const { tx, ty } = this.getTileCoords(lat, lon, MAP_ZOOM);
        const range = 2; // 5x5
        
        const currentTiles = new Set();
        const tileSizeMercator = (2 * Math.PI * R_EARTH_M) / Math.pow(2, MAP_ZOOM);

        for (let ix = -range; ix <= range; ix++) {
            for (let iy = -range; iy <= range; iy++) {
                const cx = tx + ix;
                const cy = ty + iy;
                const key = `${MAP_ZOOM}_${cx}_${cy}`;
                currentTiles.add(key);

                if (!this.tiles[key]) {
                    // Создаем новый тайл земли
                    const geo = new THREE.PlaneGeometry(tileSizeMercator, tileSizeMercator);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x555555 });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2; // Кладем плашмя
                    
                    this.tileGroup.add(mesh);
                    this.tiles[key] = { mesh };

                    // Подгружаем текстуру Google Hybrid
                    const url = `https://mt1.google.com/vt/lyrs=y&hl=ru&x=${cx}&y=${cy}&z=${MAP_ZOOM}`;
                    this.textureLoader.load(url, (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        mat.map = tex;
                        mat.color.set(0xffffff);
                        mat.needsUpdate = true;
                    });
                }

                // Высчитываем центр тайла в координатах Mercator
                const tileMercX = (cx / Math.pow(2, MAP_ZOOM)) * (2*Math.PI*R_EARTH_M) - Math.PI*R_EARTH_M + tileSizeMercator/2;
                const tileMercY = Math.PI*R_EARTH_M - (cy / Math.pow(2, MAP_ZOOM)) * (2*Math.PI*R_EARTH_M) - tileSizeMercator/2;

                // Перемещаем тайл относительно самолета (самолет всегда в x=0, z=0)
                this.tiles[key].mesh.position.set(tileMercX - planeMerc.x, 0, -(tileMercY - planeMerc.y));
            }
        }

        // Удаляем старые тайлы, оставшиеся позади
        for (let key in this.tiles) {
            if (!currentTiles.has(key)) {
                this.tileGroup.remove(this.tiles[key].mesh);
                if (this.tiles[key].mesh.material.map) this.tiles[key].mesh.material.map.dispose();
                this.tiles[key].mesh.material.dispose();
                this.tiles[key].mesh.geometry.dispose();
                delete this.tiles[key];
            }
        }

        // Управление камерой
        this.camera.position.set(0, alt, 0); // Высота самолета в метрах

        // Расчет красивого крена (наклона при повороте)
        if (this.lastHdg !== null) {
            let deltaHdg = head - this.lastHdg;
            if (deltaHdg > 180) deltaHdg -= 360;
            if (deltaHdg < -180) deltaHdg += 360;
            // Чем быстрее меняется курс, тем сильнее крен (ограничен 35 градусами)
            this.targetRoll = Math.max(-0.6, Math.min(0.6, -deltaHdg * 0.1)); 
        }
        this.lastHdg = head;
        // Плавная интерполяция крена
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 0.05);

        // Тангаж на основе вертикальной скорости
        const pitchRaw = Math.atan2(vrate, vel / 3.6);
        const pitch = THREE.MathUtils.lerp(0, pitchRaw, 0.1); // Сглаживание

        const planeYaw = -head * (Math.PI / 180);

        // Применяем вращения: Сначала курс самолета, затем взгляд пользователя, затем крены
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

        // Анимация облаков (имитация полета)
        const dtVel = (vel / 3.6) * 0.016; // примерное смещение за кадр
        this.cloudsGroup.children.forEach(c => {
            // Двигаем облака навстречу самолету по курсу
            c.position.x -= Math.sin(planeYaw) * dtVel;
            c.position.z -= Math.cos(planeYaw) * dtVel;
            // Бесконечный цикл облаков (оборачиваем, если улетели далеко)
            if (c.position.distanceTo(this.camera.position) > 25000) {
                c.position.x += Math.sin(planeYaw) * 40000 + (Math.random()-0.5)*10000;
                c.position.z += Math.cos(planeYaw) * 40000 + (Math.random()-0.5)*10000;
            }
        });

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
        this.lastHdg = null; // Сброс расчетов крена
    }

    stop() {
        this.isActive = false;
    }
}