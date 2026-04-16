import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const R_EARTH_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;

export class PilotSimulator {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        
        // Создаем canvas для капель/снега на лету
        this.vfxCanvas = document.createElement('canvas');
        this.vfxCanvas.style.position = 'absolute';
        this.vfxCanvas.style.top = '0';
        this.vfxCanvas.style.left = '0';
        this.vfxCanvas.style.width = '100%';
        this.vfxCanvas.style.height = '100%';
        this.vfxCanvas.style.zIndex = '2';
        this.vfxCanvas.style.pointerEvents = 'none';
        this.container.appendChild(this.vfxCanvas);
        this.vfxCtx = this.vfxCanvas.getContext('2d');
        
        this.isActive = false;
        this.mapZoom = 13;
        this.gridRange = window.innerWidth <= 768 ? 3 : 5;
        this.mapType = 'y';
        this.timeMode = 'real';
        this.cameraDir = 1;
        this.hudEnabled = true;
        this.terrainEnabled = false;
        this.weatherVfxEnabled = false;
        
        this.currentWeatherCode = 0; 
        this.weatherParticles = [];
        this.engineSoundEnabled = false;
        this.audioCtx = null;
        this.engineMasterGain = null;
        this.engineBusGain = null;
        this.engineLowOsc = null;
        this.engineMidOsc = null;
        this.engineBuzzOsc = null;
        this.engineLowGain = null;
        this.engineMidGain = null;
        this.engineBuzzGain = null;
        this.engineNoiseSource = null;
        this.engineNoiseGain = null;
        this.engineAirFilter = null;
        this.engineToneFilter = null;
        this.enginePresenceFilter = null;
        this.engineCompressor = null;
        this.engineLfo = null;
        this.engineLfoGain = null;
        this.engineNoiseLfo = null;
        this.engineNoiseLfoGain = null;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(65, 1, 1, 600000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
        const isMobile = window.innerWidth <= 768;
        this.renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.2) : Math.min(window.devicePixelRatio, 2.0));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;
        this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.container.appendChild(this.renderer.domElement);

        this._initComposer();

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3); this.scene.add(this.ambientLight);
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0); this.scene.add(this.hemiLight);
        this.sunLight = new THREE.DirectionalLight(0xffffff, 4.0); this.scene.add(this.sunLight);

        this.scene.fog = new THREE.FogExp2(0x8ab4d4, 0.000012);
        this._createSky();
        this._createSunGlow();
        
        this.starsGroup = new THREE.Group(); this._createStars(); this.scene.add(this.starsGroup);
        this._createClouds();
        this._createCityLights();
        this._initWeather3D();

        const tl = new THREE.TextureLoader(); tl.setCrossOrigin('anonymous');
        this.textureLoader = tl;
        const tMoon = tl.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg');
        this.moon = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 32), new THREE.MeshStandardMaterial({ map: tMoon, roughness: 1.0, emissive: 0x111008, emissiveIntensity: 0.5 }));
        this.scene.add(this.moon);

        this.lookYaw = 0; this.lookPitch = 0; this.isDragging = false;
        this.currentRoll = 0; this.targetRoll = 0; this.lastHdg = null;
        this.smoothLat = null; this.smoothLon = null; this.smoothAlt = null;
        this.cameraBob = 0;

        this.tiles = {};
        this.tileGroup = new THREE.Group(); this.scene.add(this.tileGroup);
        this._loadQueue = []; this._loading = 0; this._maxConcurrent = 6;

        this._setupControls();
        window.addEventListener('resize', () => { if (this.isActive) this.resize(); });
    }

    _initComposer() {
        const w = this.container.clientWidth || 800; const h = this.container.clientHeight || 600;
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const isM = window.innerWidth <= 768;
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(isM ? w*0.5 : w, isM ? h*0.5 : h), 0.45, 0.7, 0.85);
        this.composer.addPass(this.bloomPass);
    }

    _createSky() {
        this.skyUniforms = { topColor: {value: new THREE.Color(0x0055cc)}, midColor: {value: new THREE.Color(0x5599ee)}, bottomColor: {value: new THREE.Color(0xaaccff)}, sunPosition: {value: new THREE.Vector3()}, sunsetIntensity: {value: 0.0} };
        const skyMat = new THREE.ShaderMaterial({
            uniforms: this.skyUniforms,
            vertexShader: `varying vec3 vWP; void main() { vWP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor; uniform vec3 sunPosition; uniform float sunsetIntensity; varying vec3 vWP; void main() { vec3 vd = normalize(vWP); vec3 sd = normalize(sunPosition); float h = vd.y; float hMix = smoothstep(-0.35, 0.7, h); vec3 sc = mix(bottomColor, midColor, hMix); sc = mix(sc, topColor, smoothstep(0.02, 0.95, max(h, 0.0))); float sDot = max(0.0, dot(vd, sd)); float horizonGlow = pow(1.0 - min(1.0, abs(h) * 1.7), 4.0); sc += vec3(0.28, 0.46, 0.8) * horizonGlow * 0.18; sc += vec3(1.0, 0.45, 0.1) * pow(sDot, 64.0) * 0.7 * sunsetIntensity; sc += vec3(1.0, 0.72, 0.36) * pow(sDot, 16.0) * (0.18 + sunsetIntensity * 0.1); sc += vec3(1.0, 0.94, 0.8) * pow(sDot, 700.0) * 2.6; gl_FragColor = vec4(sc, 1.0); }`,
            side: THREE.BackSide, depthWrite: false
        });
        this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(250000, 32, 20), skyMat);
        this.scene.add(this.skyDome);
    }

    _createSunGlow() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        grad.addColorStop(0, 'rgba(255,255,235,1)');
        grad.addColorStop(0.08, 'rgba(255,248,218,0.85)');
        grad.addColorStop(0.28, 'rgba(255,210,130,0.28)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);
        const tex = new THREE.CanvasTexture(canvas);
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;

        this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            color: 0xfff2cf,
            opacity: 0.9
        }));
        this.sunGlow.scale.setScalar(22000);
        this.sunGlow.renderOrder = 100;
        this.scene.add(this.sunGlow);
    }

    _createStars() {
        const geo = new THREE.BufferGeometry(); const pos = [], colors = [];
        for (let i=0; i<4000; i++) {
            const ra = Math.random()*Math.PI*2; const dec = Math.asin(Math.random()*2-1); const r = 120000 + Math.random()*5000;
            pos.push(r*Math.cos(dec)*Math.cos(ra), r*Math.sin(dec), -r*Math.cos(dec)*Math.sin(ra));
            const c = 0.6+Math.random()*0.4; colors.push(c, c, c+0.2);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
        this.starMaterial = new THREE.PointsMaterial({size: 150, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9});
        this.starsGroup.add(new THREE.Points(geo, this.starMaterial));
    }

    _createClouds() {
        this.cloudGroup = new THREE.Group();
        this.cloudsList = []; // Сохраняем объекты для управления их количеством

        const c = document.createElement('canvas'); c.width=256; c.height=256; const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(128,128,0,128,128,128); 
        // Уменьшаем альфу чтобы не было пересветов
        g.addColorStop(0,'rgba(255,255,255,0.35)'); 
        g.addColorStop(1,'rgba(255,255,255,0)');
        
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(128,128,128,0,Math.PI*2); ctx.fill();
        
        const tex = new THREE.CanvasTexture(c); 
        tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;

        this.cloudMat = new THREE.MeshBasicMaterial({map: tex, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending, color: 0xf5fbff});
        
        // Уменьшили размер самих облаков
        const geo = new THREE.PlaneGeometry(3000, 1800); 

        for(let i=0; i<28; i++) {
            const m = new THREE.Mesh(geo, this.cloudMat);
            const a = Math.random()*Math.PI*2, d = 3000+Math.random()*20000;
            const scale = 0.75 + Math.random() * 1.6;
            m.position.set(Math.cos(a)*d, 450+Math.random()*1400, Math.sin(a)*d); 
            m.scale.set(scale, scale * (0.75 + Math.random() * 0.4), 1);
            m.userData.drift = 0.00006 + Math.random() * 0.00018;
            m.lookAt(0,m.position.y,0);
            this.cloudGroup.add(m);
            this.cloudsList.push(m);
        }
        this.scene.add(this.cloudGroup);
    }

    _createCityLights() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,250,220,1)');
        grad.addColorStop(0.18, 'rgba(255,210,125,0.85)');
        grad.addColorStop(0.48, 'rgba(255,150,70,0.18)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(canvas);
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;

        this.cityLights = new THREE.Group();
        this.cityLightsSprites = [];
        for (let i = 0; i < 180; i++) {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tex,
                color: i % 4 === 0 ? 0xffcf90 : 0xfff0d0,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));
            const angle = Math.random() * Math.PI * 2;
            const dist = 3000 + Math.random() * 26000;
            sprite.position.set(Math.cos(angle) * dist, 30 + Math.random() * 180, Math.sin(angle) * dist);
            const scale = 80 + Math.random() * 200;
            sprite.scale.set(scale, scale, 1);
            sprite.userData.baseOpacity = 0.1 + Math.random() * 0.28;
            this.cityLights.add(sprite);
            this.cityLightsSprites.push(sprite);
        }
        this.scene.add(this.cityLights);
    }

    _initWeather3D() {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(3000 * 3);
        for(let i=0; i<3000*3; i++) pos[i] = (Math.random() - 0.5) * 2000;
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.weatherMat3D = new THREE.PointsMaterial({color: 0xffffff, size: 4, transparent: true, opacity: 0.0});
        this.weatherPoints3D = new THREE.Points(geo, this.weatherMat3D);
        this.scene.add(this.weatherPoints3D);
    }

    _setupControls() {
        let lx=0, ly=0;
        this.container.addEventListener('mousedown', (e) => { if(e.button===0){this.isDragging=true; lx=e.clientX; ly=e.clientY;} if(e.button===1){this.lookYaw=0;this.lookPitch=0;} });
        window.addEventListener('mouseup', () => this.isDragging=false);
        window.addEventListener('mousemove', (e) => { if(!this.isDragging||!this.isActive) return; this.lookYaw-=(e.clientX-lx)*0.0025; this.lookPitch-=(e.clientY-ly)*0.0025; lx=e.clientX; ly=e.clientY; this.lookPitch = Math.max(-1, Math.min(1, this.lookPitch)); });
        this.container.addEventListener('wheel', (e) => { if(!this.isActive) return; this.mapZoom = Math.max(10, Math.min(15, this.mapZoom + (e.deltaY>0?-1:1))); this.clearTiles(); });
        this.container.addEventListener('dblclick', () => { this.lookYaw=0; this.lookPitch=0; });
        let tx=0, ty=0;
        this.container.addEventListener('touchstart', (e) => { tx=e.touches[0].clientX; ty=e.touches[0].clientY; });
        this.container.addEventListener('touchmove', (e) => { if(!this.isActive) return; this.lookYaw-=(e.touches[0].clientX-tx)*0.003; this.lookPitch-=(e.touches[0].clientY-ty)*0.003; tx=e.touches[0].clientX; ty=e.touches[0].clientY; this.lookPitch = Math.max(-1, Math.min(1, this.lookPitch)); });
    }

    clearTiles() {
        for(let k in this.tiles) { this.tileGroup.remove(this.tiles[k].mesh); if(this.tiles[k].mesh.material.map) this.tiles[k].mesh.material.map.dispose(); this.tiles[k].mesh.material.dispose(); this.tiles[k].mesh.geometry.dispose(); }
        this.tiles = {}; this._loadQueue = [];
    }

    async _ensureAudio() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;
        if (!this.audioCtx) {
            this.audioCtx = new AudioCtx();

            this.engineMasterGain = this.audioCtx.createGain();
            this.engineMasterGain.gain.value = 0;
            this.engineBusGain = this.audioCtx.createGain();
            this.engineBusGain.gain.value = 0.9;

            this.engineLowOsc = this.audioCtx.createOscillator();
            this.engineLowOsc.type = 'sawtooth';
            this.engineLowOsc.frequency.value = 62;

            this.engineMidOsc = this.audioCtx.createOscillator();
            this.engineMidOsc.type = 'sawtooth';
            this.engineMidOsc.frequency.value = 124;

            this.engineBuzzOsc = this.audioCtx.createOscillator();
            this.engineBuzzOsc.type = 'triangle';
            this.engineBuzzOsc.frequency.value = 248;

            this.engineLowGain = this.audioCtx.createGain();
            this.engineLowGain.gain.value = 0.42;

            this.engineMidGain = this.audioCtx.createGain();
            this.engineMidGain.gain.value = 0.18;

            this.engineBuzzGain = this.audioCtx.createGain();
            this.engineBuzzGain.gain.value = 0.08;

            this.engineToneFilter = this.audioCtx.createBiquadFilter();
            this.engineToneFilter.type = 'lowpass';
            this.engineToneFilter.frequency.value = 520;
            this.engineToneFilter.Q.value = 0.6;

            this.enginePresenceFilter = this.audioCtx.createBiquadFilter();
            this.enginePresenceFilter.type = 'bandpass';
            this.enginePresenceFilter.frequency.value = 950;
            this.enginePresenceFilter.Q.value = 0.9;

            this.engineAirFilter = this.audioCtx.createBiquadFilter();
            this.engineAirFilter.type = 'bandpass';
            this.engineAirFilter.frequency.value = 700;
            this.engineAirFilter.Q.value = 0.45;

            this.engineNoiseGain = this.audioCtx.createGain();
            this.engineNoiseGain.gain.value = 0.05;

            this.engineCompressor = this.audioCtx.createDynamicsCompressor();
            this.engineCompressor.threshold.value = -20;
            this.engineCompressor.knee.value = 14;
            this.engineCompressor.ratio.value = 3.5;
            this.engineCompressor.attack.value = 0.01;
            this.engineCompressor.release.value = 0.18;

            this.engineLfo = this.audioCtx.createOscillator();
            this.engineLfo.type = 'sine';
            this.engineLfo.frequency.value = 5.5;

            this.engineLfoGain = this.audioCtx.createGain();
            this.engineLfoGain.gain.value = 8;

            this.engineNoiseLfo = this.audioCtx.createOscillator();
            this.engineNoiseLfo.type = 'sine';
            this.engineNoiseLfo.frequency.value = 0.65;

            this.engineNoiseLfoGain = this.audioCtx.createGain();
            this.engineNoiseLfoGain.gain.value = 0.018;

            const noiseBuffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * 2, this.audioCtx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) {
                noiseData[i] = (Math.random() * 2 - 1) * 0.9;
            }
            this.engineNoiseSource = this.audioCtx.createBufferSource();
            this.engineNoiseSource.buffer = noiseBuffer;
            this.engineNoiseSource.loop = true;

            this.engineLfo.connect(this.engineLfoGain);
            this.engineLfoGain.connect(this.engineMidOsc.detune);
            this.engineLfoGain.connect(this.engineBuzzOsc.detune);

            this.engineNoiseLfo.connect(this.engineNoiseLfoGain);
            this.engineNoiseLfoGain.connect(this.engineNoiseGain.gain);

            this.engineLowOsc.connect(this.engineLowGain);
            this.engineMidOsc.connect(this.engineMidGain);
            this.engineBuzzOsc.connect(this.engineBuzzGain);
            this.engineLowGain.connect(this.engineToneFilter);
            this.engineMidGain.connect(this.engineToneFilter);
            this.engineBuzzGain.connect(this.enginePresenceFilter);
            this.engineNoiseSource.connect(this.engineAirFilter);
            this.engineAirFilter.connect(this.engineNoiseGain);
            this.engineToneFilter.connect(this.engineBusGain);
            this.enginePresenceFilter.connect(this.engineBusGain);
            this.engineNoiseGain.connect(this.engineBusGain);
            this.engineBusGain.connect(this.engineCompressor);
            this.engineCompressor.connect(this.engineMasterGain);
            this.engineMasterGain.connect(this.audioCtx.destination);

            this.engineLowOsc.start();
            this.engineMidOsc.start();
            this.engineBuzzOsc.start();
            this.engineLfo.start();
            this.engineNoiseLfo.start();
            this.engineNoiseSource.start();
        }
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        return true;
    }

    async setEngineSound(enabled) {
        this.engineSoundEnabled = enabled;
        if (!enabled) {
            if (this.audioCtx && this.engineMasterGain) {
                this.engineMasterGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.18);
            }
            return;
        }

        const ready = await this._ensureAudio();
        if (!ready || !this.engineMasterGain) {
            this.engineSoundEnabled = false;
            return;
        }
        this.engineMasterGain.gain.setTargetAtTime(0.001, this.audioCtx.currentTime, 0.18);
    }

    _updateEngineSound(speed, verticalRate) {
        if (!this.engineSoundEnabled || !this.audioCtx || !this.engineMasterGain || !this.engineLowOsc || !this.engineMidOsc || !this.engineBuzzOsc) return;
        const now = this.audioCtx.currentTime;
        const speedFactor = Math.max(0, Math.min(1.35, speed / 860));
        const climbFactor = Math.max(-1, Math.min(1, verticalRate / 14));
        const thrustFactor = Math.max(0.75, Math.min(1.45, speedFactor + Math.max(0, climbFactor) * 0.18));
        const lowFreq = 54 + thrustFactor * 18;
        const midFreq = 108 + thrustFactor * 42;
        const buzzFreq = 235 + thrustFactor * 95;
        const toneCutoff = 340 + thrustFactor * 240;
        const presenceFreq = 820 + thrustFactor * 300;
        const airFreq = 520 + thrustFactor * 520;
        const airGain = 0.016 + speedFactor * 0.02;
        const gain = this.isActive ? 0.03 + thrustFactor * 0.026 : 0;

        this.engineLowOsc.frequency.setTargetAtTime(lowFreq, now, 0.24);
        this.engineMidOsc.frequency.setTargetAtTime(midFreq, now, 0.22);
        this.engineBuzzOsc.frequency.setTargetAtTime(buzzFreq, now, 0.18);
        this.engineToneFilter.frequency.setTargetAtTime(toneCutoff, now, 0.26);
        this.enginePresenceFilter.frequency.setTargetAtTime(presenceFreq, now, 0.2);
        this.engineAirFilter.frequency.setTargetAtTime(airFreq, now, 0.18);
        this.engineLowGain.gain.setTargetAtTime(0.34 + thrustFactor * 0.08, now, 0.3);
        this.engineMidGain.gain.setTargetAtTime(0.13 + thrustFactor * 0.05, now, 0.24);
        this.engineBuzzGain.gain.setTargetAtTime(0.04 + thrustFactor * 0.028, now, 0.18);
        this.engineNoiseGain.gain.setTargetAtTime(airGain, now, 0.16);
        this.engineLfo.frequency.setTargetAtTime(4.2 + thrustFactor * 1.8, now, 0.28);
        this.engineLfoGain.gain.setTargetAtTime(5 + thrustFactor * 6, now, 0.28);
        this.engineNoiseLfo.frequency.setTargetAtTime(0.45 + speedFactor * 0.55, now, 0.35);
        this.engineNoiseLfoGain.gain.setTargetAtTime(0.008 + speedFactor * 0.012, now, 0.3);
        this.engineMasterGain.gain.setTargetAtTime(gain, now, 0.24);
    }

    setHudState(v) { this.hudEnabled = v; }
    setMapType(t) { this.mapType = t; this.clearTiles(); }
    setTimeMode(m) { this.timeMode = m; }
    setCameraDirection(d) { this.cameraDir = d; this.lookYaw = 0; this.lookPitch = 0; }
    setTerrain(v) { this.terrainEnabled = v; this.clearTiles(); }
    setWeatherVfx(v) { this.weatherVfxEnabled = v; if(!v){ this.vfxCtx.clearRect(0,0,this.vfxCanvas.width,this.vfxCanvas.height); this.weatherMat3D.opacity=0; } }

    latLonToMercator(lat, lon) { return { x: R_EARTH_M * lon * DEG_TO_RAD, y: R_EARTH_M * Math.log(Math.tan(Math.PI/4 + lat * DEG_TO_RAD/2)) }; }
    getTileCoords(lat, lon, zoom) { const n = Math.pow(2, zoom), r = lat*DEG_TO_RAD; return { tx: Math.floor(n*((lon+180)/360)), ty: Math.floor(n*(1-(Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI))/2) }; }

    _enqueueTile(url, mat, dist, cx, cy, zoom, geo) {
        this._loadQueue.push({ url, mat, dist, cx, cy, zoom, geo });
        this._loadQueue.sort((a, b) => a.dist - b.dist);
        this._processQueue();
    }

    _processQueue() {
        if(this._loading >= this._maxConcurrent || this._loadQueue.length === 0) return;
        const task = this._loadQueue.shift(); this._loading++;
        
        this.textureLoader.load(task.url, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.maxAnisotropy;
            task.mat.map = tex; task.mat.color.set(0xffffff); task.mat.needsUpdate = true;
            
            if(this.terrainEnabled) {
                const demUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${task.zoom}/${task.cx}/${task.cy}.png`;
                const img = new Image(); img.crossOrigin = 'anonymous'; img.src = demUrl;
                img.onload = () => {
                    const c = document.createElement('canvas'); c.width=256; c.height=256; const ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0); const data = ctx.getImageData(0,0,256,256).data;
                    const pos = task.geo.attributes.position;
                    for(let i=0; i<pos.count; i++) {
                        const row = Math.floor(i / 33); const col = i % 33;
                        const px = Math.floor((col/32)*255); const py = Math.floor((row/32)*255);
                        const idx = (py*256 + px)*4;
                        const r = data[idx], g = data[idx+1], b = data[idx+2];
                        const h = (r * 256 + g + b / 256) - 32768;
                        pos.setZ(i, h * 1.5); 
                    }
                    task.geo.computeVertexNormals(); pos.needsUpdate = true;
                };
            }
            this._loading--; this._processQueue();
        }, undefined, () => { this._loading--; this._processQueue(); });
    }

    updateEnvironment(lat, lon) {
        let date = new Date();
        if(this.timeMode === 'day') date = new Date('2024-06-21T12:00:00Z');
        if(this.timeMode === 'night') date = new Date('2024-12-21T00:00:00Z');

        if(window.Astronomy) {
            const obs = new window.Astronomy.Observer(lat, lon, 0);
            const sunEq = window.Astronomy.Equator('Sun', date, obs, true, true);
            const sunHor = window.Astronomy.Horizon(date, obs, sunEq.ra, sunEq.dec, 'normal');
            const sunAlt = sunHor.altitude * DEG_TO_RAD; const sunAz = (-sunHor.azimuth+180) * DEG_TO_RAD;
            const sd = 160000; this.sunLight.position.set(sd*Math.cos(sunAlt)*Math.sin(sunAz), sd*Math.sin(sunAlt), sd*Math.cos(sunAlt)*Math.cos(sunAz));
            this.skyUniforms.sunPosition.value.copy(this.sunLight.position);
            this.sunGlow.position.copy(this.sunLight.position.clone().setLength(145000));

            const mEq = window.Astronomy.Equator('Moon', date, obs, true, true);
            const mHor = window.Astronomy.Horizon(date, obs, mEq.ra, mEq.dec, 'normal');
            const mAlt = mHor.altitude * DEG_TO_RAD; const mAz = (-mHor.azimuth+180) * DEG_TO_RAD;
            const md = 100000; this.moon.position.set(md*Math.cos(mAlt)*Math.sin(mAz), md*Math.sin(mAlt), md*Math.cos(mAlt)*Math.cos(mAz)); this.moon.lookAt(0,0,0);

            const t = Math.max(-1, Math.min(1, sunAlt/0.25)); const isNight = t < -0.15;
            let topC, midC, botC, fogC, sInt = 0;

            // --- Расчет густоты облачности по погоде ---
            let cloudFactor = 0.0;
            if (this.currentWeatherCode === 1 || this.currentWeatherCode === 2) cloudFactor = 0.3; // Малооблачно
            else if (this.currentWeatherCode === 3) cloudFactor = 0.6; // Облачно
            else if (this.currentWeatherCode >= 45) cloudFactor = 1.0; // Осадки, туман

            const activeClouds = Math.ceil(this.cloudsList.length * cloudFactor);
            for(let i=0; i<this.cloudsList.length; i++) {
                this.cloudsList[i].visible = (i < activeClouds);
            }

            if(t >= 0) {
                topC = new THREE.Color().lerpColors(new THREE.Color(0x1a3a7a), new THREE.Color(0x0055cc), t);
                midC = new THREE.Color().lerpColors(new THREE.Color(0x5577cc), new THREE.Color(0x4488ff), t);
                botC = new THREE.Color().lerpColors(new THREE.Color(0xffaa66), new THREE.Color(0x99ccff), t);
                fogC = new THREE.Color().lerpColors(new THREE.Color(0xcc8855), new THREE.Color(0x8ab4d4), t);
                sInt = 1.0 - t; 
                this.cloudMat.opacity = Math.min(1.0, cloudFactor * t); // Облака видны днем если они есть
                this.sunGlow.material.opacity = 0.34 + t * 0.18;
            } else {
                const nf = Math.min(1, Math.abs(t)*1.5);
                topC = new THREE.Color().lerpColors(new THREE.Color(0x0a1a50), new THREE.Color(0x02040e), nf);
                midC = new THREE.Color().lerpColors(new THREE.Color(0x1a2a60), new THREE.Color(0x030815), nf);
                botC = new THREE.Color().lerpColors(new THREE.Color(0xff8833), new THREE.Color(0x051020), nf);
                fogC = new THREE.Color().lerpColors(new THREE.Color(0x334466), new THREE.Color(0x050a18), nf);
                sInt = 1.0 - nf; 
                this.cloudMat.opacity = 0; // Ночью облака прячем
                this.sunGlow.material.opacity = Math.max(0.08, 0.28 - nf * 0.18);
            }

            let baseFogDensity = 0.000012;
            if (this.weatherVfxEnabled) {
                if ([45,48].includes(this.currentWeatherCode)) baseFogDensity = 0.0003; 
                else if ([51,53,55,61,63,65,71,73,75].includes(this.currentWeatherCode)) baseFogDensity = 0.00008; 
            }

            if(isNight && this.hudEnabled) {
                this.renderer.toneMappingExposure = 1.0; this.ambientLight.intensity = 0.5; this.ambientLight.color.setHex(0x22ff44);
                this.hemiLight.color.setHex(0x44ff66); this.hemiLight.groundColor.setHex(0x004400); this.hemiLight.intensity = 2.5; this.sunLight.intensity = 0;
                fogC = new THREE.Color(0x041a04); botC = fogC.clone(); topC = new THREE.Color(0x020c02); midC = new THREE.Color(0x031203);
                this.container.classList.add('night-vision');
            } else {
                const isSch = this.mapType === 'm';
                const daylight = Math.max(0, t);
                const mapExposure = isSch ? 0.68 : (this.timeMode === 'real' ? 0.88 - daylight * 0.12 : 0.96 - daylight * 0.08);
                this.renderer.toneMappingExposure = mapExposure;
                this.ambientLight.intensity = isSch ? 0.15 : 0.4; this.ambientLight.color.setHex(isNight?0xaaccff:0xffffff);
                this.hemiLight.color.setHex(0xffffff); this.hemiLight.groundColor.setHex(0x334455);
                this.hemiLight.intensity = isNight ? 0.6 : (isSch ? 0.4+t*0.2 : 0.8+t*0.8);
                this.sunLight.intensity = isSch ? Math.max(0.1, t*0.42) : Math.max(0.1, t*3.2);
                this.container.classList.remove('night-vision');
            }

            this.starMaterial.opacity = isNight ? 0.95 : Math.max(0.05, 0.45 - t * 0.35);
            this.starsGroup.rotation.y += 0.00008;
            this.cityLights.position.copy(this.camera.position);
            for (let i = 0; i < this.cityLightsSprites.length; i++) {
                const sprite = this.cityLightsSprites[i];
                sprite.material.opacity = isNight ? sprite.userData.baseOpacity : 0;
            }

            this.skyUniforms.topColor.value.copy(topC); this.skyUniforms.midColor.value.copy(midC); this.skyUniforms.bottomColor.value.copy(botC);
            this.skyUniforms.sunsetIntensity.value = sInt; 
            this.scene.fog.color.copy(fogC);
            this.scene.fog.density = baseFogDensity;
        }
    }

    _updateWeatherVFX(speed) {
        if (!this.weatherVfxEnabled) return;
        
        const w = this.vfxCanvas.width; const h = this.vfxCanvas.height;
        this.vfxCtx.clearRect(0, 0, w, h);

        const isRain = [51,53,55,61,63,65,67,80,81,82,95,96,99].includes(this.currentWeatherCode);
        const isSnow = [71,73,75,77,85,86].includes(this.currentWeatherCode);
        
        if (!isRain && !isSnow) { this.weatherMat3D.opacity = 0; return; }

        this.weatherMat3D.opacity = 0.68;
        this.weatherMat3D.size = isSnow ? 15 : 4;
        this.weatherPoints3D.position.copy(this.camera.position);
        this.weatherPoints3D.rotation.copy(this.camera.rotation);
        const positions = this.weatherPoints3D.geometry.attributes.position.array;
        const velZ = speed / 3.6; 
        
        for(let i=0; i<3000; i++) {
            positions[i*3+2] += velZ * 0.016 + (isRain ? 20 : 5);
            positions[i*3+1] -= isRain ? 20 : 5; 
            if(positions[i*3+2] > 1000) positions[i*3+2] = -1000;
            if(positions[i*3+1] < -1000) positions[i*3+1] = 1000;
        }
        this.weatherPoints3D.geometry.attributes.position.needsUpdate = true;

        this.vfxCtx.fillStyle = isSnow ? 'rgba(255,255,255,0.8)' : 'rgba(150,200,255,0.4)';
        while(this.weatherParticles.length < 50) {
            this.weatherParticles.push({ x: Math.random()*w, y: Math.random()*h, s: Math.random()*3+1, vy: Math.random()*5+(isRain?10:2), vx: (Math.random()-0.5)*2 });
        }
        for(let i=0; i<this.weatherParticles.length; i++) {
            let p = this.weatherParticles[i];
            this.vfxCtx.beginPath();
            if (isSnow) { this.vfxCtx.arc(p.x, p.y, p.s, 0, Math.PI*2); } 
            else { this.vfxCtx.ellipse(p.x, p.y, p.s*0.5, p.s*2, p.vx*0.1, 0, Math.PI*2); }
            this.vfxCtx.fill();
            p.y += p.vy; p.x += p.vx;
            if(p.y > h) { p.y = -10; p.x = Math.random()*w; }
        }
    }

    updateData(lat, lon, alt, head, vel, vrate) {
        if(!this.isActive) return;
        if(this.smoothLat === null) { this.smoothLat=lat; this.smoothLon=lon; this.smoothAlt=alt; }
        this.smoothLat = THREE.MathUtils.lerp(this.smoothLat, lat, 0.04);
        this.smoothLon = THREE.MathUtils.lerp(this.smoothLon, lon, 0.04);
        this.smoothAlt = THREE.MathUtils.lerp(this.smoothAlt, alt, 0.04);

        this.updateEnvironment(lat, lon);

        const planeMerc = this.latLonToMercator(this.smoothLat, this.smoothLon);
        const { tx, ty } = this.getTileCoords(this.smoothLat, this.smoothLon, this.mapZoom);
        const tSMerc = (2*Math.PI*R_EARTH_M) / Math.pow(2, this.mapZoom);
        const currentTiles = new Set();
        
        for(let ix=-this.gridRange; ix<=this.gridRange; ix++){
            for(let iy=-this.gridRange; iy<=this.gridRange; iy++){
                const cx=tx+ix, cy=ty+iy; const key = `${this.mapZoom}_${this.mapType}_${cx}_${cy}_${this.terrainEnabled}`;
                currentTiles.add(key);
                if(!this.tiles[key]){
                    const segs = this.terrainEnabled ? 32 : 1;
                    const geo = new THREE.PlaneGeometry(tSMerc, tSMerc, segs, segs);
                    const tileBaseColor = this.mapType === 'm' ? 0x1f2532 : 0xb8c4d2;
                    const mat = new THREE.MeshLambertMaterial({color: tileBaseColor});
                    const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = -Math.PI/2;
                    this.tileGroup.add(mesh); this.tiles[key] = {mesh};
                    const dist = Math.sqrt(ix*ix + iy*iy);
                    const url = `https://mt1.google.com/vt/lyrs=${this.mapType}&hl=ru&x=${cx}&y=${cy}&z=${this.mapZoom}&scale=2`;
                    this._enqueueTile(url, mat, dist, cx, cy, this.mapZoom, geo);
                }
                const tmX = (cx/Math.pow(2,this.mapZoom))*(2*Math.PI*R_EARTH_M)-Math.PI*R_EARTH_M+tSMerc/2;
                const tmY = Math.PI*R_EARTH_M-(cy/Math.pow(2,this.mapZoom))*(2*Math.PI*R_EARTH_M)-tSMerc/2;
                this.tiles[key].mesh.position.set(tmX-planeMerc.x, 0, -(tmY-planeMerc.y));
            }
        }
        for(let k in this.tiles){ if(!currentTiles.has(k)){ this.tileGroup.remove(this.tiles[k].mesh); if(this.tiles[k].mesh.material.map)this.tiles[k].mesh.material.map.dispose(); this.tiles[k].mesh.material.dispose(); this.tiles[k].mesh.geometry.dispose(); delete this.tiles[k]; } }

        if(this.scene.fog.density < 0.00002) { this.scene.fog.density = 0.000012; }

        const zF = Math.pow(2, this.mapZoom-10);
        const visAlt = Math.max(150, this.smoothAlt/zF);
        this.camera.position.set(0, visAlt, 0);

        if(this.lastHdg !== null){ let dH = head-this.lastHdg; if(dH>180)dH-=360; if(dH<-180)dH+=360; this.targetRoll=Math.max(-0.55,Math.min(0.55,-dH*0.12)); }
        this.lastHdg = head; this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 0.04);

        const isR = this.cameraDir === -1;
        const pY = isR ? -head*DEG_TO_RAD+Math.PI : -head*DEG_TO_RAD;
        const pR = Math.atan2(vrate, vel/3.6); const pitch = THREE.MathUtils.lerp(0, pR, 0.08);
        this.cameraBob += 0.02 + Math.min(0.06, vel / 40000);
        const bobY = Math.sin(this.cameraBob) * Math.min(28, Math.max(6, vel / 55));
        const bobX = Math.cos(this.cameraBob * 0.5) * Math.min(16, Math.max(2, vel / 110));

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set((isR?-pitch:pitch)-0.12+this.lookPitch, pY+this.lookYaw, isR?-this.currentRoll:this.currentRoll);
        this.camera.position.x = bobX;
        this.camera.position.y += bobY;
        this.skyDome.position.copy(this.camera.position); this.cloudGroup.position.copy(this.camera.position);
        this.cloudGroup.rotation.y += 0.0002;
        for (let i = 0; i < this.cloudsList.length; i++) {
            this.cloudsList[i].rotation.z = Math.sin(this.cameraBob + i) * 0.015;
        }

        this._updateEngineSound(vel, vrate);
        this._updateWeatherVFX(vel);
        this.composer.render();
    }

    resize() {
        const w = this.container.clientWidth; const h = this.container.clientHeight;
        this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
        this.renderer.setSize(w,h); this.composer.setSize(w,h);
        this.vfxCanvas.width = w; this.vfxCanvas.height = h;
    }
    start() { this.isActive=true; this.smoothLat=null; this.smoothLon=null; this.smoothAlt=null; this.lastHdg=null; if (this.engineSoundEnabled) this.setEngineSound(true); this.resize(); }
    stop() { this.isActive=false; if (this.audioCtx && this.engineMasterGain) this.engineMasterGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.2); }
}
