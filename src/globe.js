import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import nightMapUrl from './assets/earth-night.jpg';
import dayMapUrl from './assets/earth-blue-marble.jpg';
import moonMapUrl from './assets/moon.jpg';

// Color map for feelings/moods
const FEELING_COLORS = {
  Hopeful: 0xffb347,     // Warm amber / gold
  Peaceful: 0x10b981,    // Emerald calm
  Calm: 0x06b6d4,        // Cyan tranquility
  Struggling: 0xa855f7,  // Soft violet
  Overwhelmed: 0xf43f5e, // Rose / pink
  Grateful: 0x3b82f6,    // True blue
  default: 0x00f0ff      // Glowing electric cyan
};

export class GlobeScene {
  constructor(containerElement, onPinClickCallback) {
    this.container = containerElement;
    this.onPinClick = onPinClickCallback;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 250);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 450;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;

    this.globeRadius = 80;
    this.pinsGroup = new THREE.Group();
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.pinsGroup);
    this.scene.add(this.celestialGroup);

    this.pinMeshes = [];
    this.starMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.targetCameraPos = null;
    this.targetLookAt = null;

    this.textureLoader = new THREE.TextureLoader();
    this.nightTexture = this.textureLoader.load(nightMapUrl);
    this.dayTexture = this.textureLoader.load(dayMapUrl);
    this.moonTexture = this.textureLoader.load(moonMapUrl);

    this.initLights();
    this.initRealtimeEarthMesh();
    this.initStarfield();
    this.initCelestialSky();
    this.initEvents();

    this.animate = this.animate.bind(this);
    this.animate();
  }

  getSunDirection() {
    const now = new Date();
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const solarLongitude = ((12 - utcHours) / 24) * 360;
    const rad = (solarLongitude * Math.PI) / 180;

    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10)) * (Math.PI / 180);

    const sunX = Math.cos(declination) * Math.sin(rad);
    const sunY = Math.sin(declination);
    const sunZ = Math.cos(declination) * Math.cos(rad);

    return new THREE.Vector3(sunX, sunY, sunZ).normalize();
  }

  initLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5ea, 1.4);
    const sunDir = this.getSunDirection();
    this.sunLight.position.copy(sunDir.clone().multiplyScalar(220));
    this.scene.add(this.sunLight);
  }

  initRealtimeEarthMesh() {
    const geometry = new THREE.SphereGeometry(this.globeRadius, 64, 64);

    this.earthShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: this.dayTexture },
        nightTexture: { value: this.nightTexture },
        sunDirection: { value: this.getSunDirection() }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 norm = normalize(vWorldPosition);
          float sunDot = dot(norm, sunDirection);
          float dayFactor = smoothstep(-0.15, 0.2, sunDot);

          vec4 dayColor = texture2D(dayTexture, vUv);
          vec4 nightColor = texture2D(nightTexture, vUv);

          vec3 composite = mix(nightColor.rgb * 1.35, dayColor.rgb, dayFactor);
          gl_FragColor = vec4(composite, 1.0);
        }
      `
    });

    this.globeMesh = new THREE.Mesh(geometry, this.earthShaderMaterial);
    this.scene.add(this.globeMesh);

    const atmosphereGeo = new THREE.SphereGeometry(this.globeRadius * 1.018, 48, 48);
    this.atmosphereMat = new THREE.MeshBasicMaterial({
      color: 0x4fa8d8,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide
    });
    this.atmosphereMesh = new THREE.Mesh(atmosphereGeo, this.atmosphereMat);
    this.scene.add(this.atmosphereMesh);
  }

  initStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1400;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      const radius = 320 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i + 2] = radius * Math.cos(phi);
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8,
      transparent: true,
      opacity: 0.85
    });

    this.starfield = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.starfield);
  }

  initCelestialSky() {
    const moonGeo = new THREE.SphereGeometry(12, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({
      map: this.moonTexture,
      roughness: 0.85
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.position.set(160, 90, -110);
    this.moonMesh.userData = { isCelestial: true, type: 'moon', id: 'entry_moon_1' };
    this.celestialGroup.add(this.moonMesh);
  }

  latLngToVector3(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  }

  renderEntries(entries) {
    while (this.pinsGroup.children.length > 0) {
      this.pinsGroup.remove(this.pinsGroup.children[0]);
    }
    this.pinMeshes = [];

    for (let i = this.celestialGroup.children.length - 1; i >= 0; i--) {
      const child = this.celestialGroup.children[i];
      if (child !== this.moonMesh) {
        this.celestialGroup.remove(child);
      }
    }
    this.starMeshes = [];

    entries.forEach((entry, index) => {
      const pinColor = FEELING_COLORS[entry.feeling] || FEELING_COLORS.default;

      if (entry.destination === 'earth' && entry.lat != null && entry.lng != null) {
        const pinGroup = new THREE.Group();
        const basePos = this.latLngToVector3(entry.lat, entry.lng, this.globeRadius);

        pinGroup.position.copy(basePos);
        pinGroup.lookAt(new THREE.Vector3(0, 0, 0));

        const beaconGeo = new THREE.SphereGeometry(1.6, 16, 16);
        const beaconMat = new THREE.MeshBasicMaterial({ color: pinColor });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(0, 0, -1.8);
        pinGroup.add(beaconMesh);

        const haloGeo = new THREE.RingGeometry(1.2, 3.2, 24);
        const haloMat = new THREE.MeshBasicMaterial({
          color: pinColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65
        });
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        haloMesh.position.set(0, 0, -1.6);
        pinGroup.add(haloMesh);

        const stemGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.5, 8);
        const stemMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const stemMesh = new THREE.Mesh(stemGeo, stemMat);
        stemMesh.rotation.x = Math.PI / 2;
        stemMesh.position.set(0, 0, -1.0);
        pinGroup.add(stemMesh);

        pinGroup.userData = {
          entryId: entry.id,
          pulseMesh: haloMesh,
          pulseOffset: index * 0.85,
          timestamp: entry.timestamp
        };

        this.pinsGroup.add(pinGroup);
        this.pinMeshes.push(pinGroup);
      } else if (entry.destination === 'shooting-star') {
        const starGroup = new THREE.Group();
        const pos = entry.starPosition || { x: -130, y: 100, z: -90 };
        starGroup.position.set(pos.x, pos.y, pos.z);

        const starCoreGeo = new THREE.OctahedronGeometry(2.8);
        const starCoreMat = new THREE.MeshBasicMaterial({ color: pinColor });
        const starCore = new THREE.Mesh(starCoreGeo, starCoreMat);
        starGroup.add(starCore);

        const sparkleGeo = new THREE.RingGeometry(3, 4.5, 16);
        const sparkleMat = new THREE.MeshBasicMaterial({
          color: pinColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7
        });
        const sparkleMesh = new THREE.Mesh(sparkleGeo, sparkleMat);
        starGroup.add(sparkleMesh);

        starGroup.userData = {
          entryId: entry.id,
          isCelestial: true,
          pulseMesh: sparkleMesh,
          pulseOffset: index * 1.1,
          timestamp: entry.timestamp
        };

        this.celestialGroup.add(starGroup);
        this.starMeshes.push(starGroup);
      }
    });
  }

  // --- Zoom Smoothly to Moon ---
  zoomToMoon() {
    this.controls.autoRotate = false;
    const moonPos = this.moonMesh.position;
    // Set target look-at to Moon center
    this.targetLookAt = moonPos.clone();
    // Position camera just in front of Moon
    const offset = new THREE.Vector3(25, 15, 35);
    this.targetCameraPos = moonPos.clone().add(offset);
  }

  // --- Focus on Earth Lat/Lng ---
  focusOnCoordinates(lat, lng) {
    this.controls.autoRotate = false;
    const pinPos = this.latLngToVector3(lat, lng, this.globeRadius);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.targetCameraPos = pinPos.clone().normalize().multiplyScalar(170);
  }

  resetCameraFocus() {
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.targetCameraPos = new THREE.Vector3(0, 0, 250);
    this.controls.autoRotate = true;
  }

  setRecencyFilter(filter) {
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const allMeshes = [...this.pinMeshes, ...this.starMeshes];

    allMeshes.forEach((mesh) => {
      if (filter === 'all') {
        mesh.visible = true;
      } else {
        const time = new Date(mesh.userData.timestamp).getTime();
        mesh.visible = time >= oneDayAgo;
      }
    });
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    let startX = 0;
    let startY = 0;

    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
    });

    this.renderer.domElement.addEventListener('pointerup', (e) => {
      const diff = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (diff < 5) {
        this.handleClick(e);
      }
    });
  }

  handleClick(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const clickableTargets = [...this.pinMeshes, ...this.starMeshes, this.moonMesh];
    const intersects = this.raycaster.intersectObjects(clickableTargets, true);

    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target && !target.userData?.entryId && !target.userData?.id) {
        target = target.parent;
      }
      if (target && target.userData) {
        this.controls.autoRotate = false;
        const entryId = target.userData.entryId || target.userData.id;

        // If user clicked the Moon, zoom camera right to it!
        if (target.userData.type === 'moon' || target === this.moonMesh) {
          this.zoomToMoon();
        }

        if (this.onPinClick) {
          this.onPinClick(entryId);
        }
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    // Smooth camera interpolation toward target
    if (this.targetCameraPos) {
      this.camera.position.lerp(this.targetCameraPos, 0.05);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 1.0) {
        this.targetCameraPos = null;
      }
    }
    if (this.targetLookAt) {
      this.controls.target.lerp(this.targetLookAt, 0.05);
      if (this.controls.target.distanceTo(this.targetLookAt) < 0.5) {
        this.targetLookAt = null;
      }
    }

    this.controls.update();

    const sunDir = this.getSunDirection();
    if (this.earthShaderMaterial) {
      this.earthShaderMaterial.uniforms.sunDirection.value.copy(sunDir);
    }
    if (this.sunLight) {
      this.sunLight.position.copy(sunDir.clone().multiplyScalar(220));
    }

    const time = Date.now() * 0.002;
    const allPulsing = [...this.pinMeshes, ...this.starMeshes];
    allPulsing.forEach((mesh) => {
      if (mesh.userData?.pulseMesh) {
        const scale = 1 + Math.sin(time + mesh.userData.pulseOffset) * 0.3;
        mesh.userData.pulseMesh.scale.set(scale, scale, scale);
      }
    });

    if (this.moonMesh) {
      this.moonMesh.rotation.y += 0.003;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
