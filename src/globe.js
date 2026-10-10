import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import nightMapUrl from './assets/earth-night.jpg';
import dayMapUrl from './assets/earth-blue-marble.jpg';
import moonMapUrl from './assets/moon.jpg';

const FEELING_COLORS = {
  Hopeful: 0xffb347,
  Peaceful: 0x10b981,
  Calm: 0x06b6d4,
  Struggling: 0xa855f7,
  Overwhelmed: 0xf43f5e,
  Grateful: 0x3b82f6,
  default: 0x00f0ff
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
      1400
    );
    this.camera.position.set(0, 0, 250);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 115;
    this.controls.maxDistance = 420;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;

    this.activeFocusTarget = 'earth';

    this.globeRadius = 80;
    this.moonRadius = 18;

    this.pinsGroup = new THREE.Group();
    this.celestialGroup = new THREE.Group();
    this.shootingStarsGroup = new THREE.Group();
    this.scene.add(this.pinsGroup);
    this.scene.add(this.celestialGroup);
    this.scene.add(this.shootingStarsGroup);

    this.pinMeshes = [];
    this.moonPinMeshes = [];
    this.starMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.targetCameraPos = null;
    this.targetLookAt = null;

    this.starsClusterCenter = new THREE.Vector3(-140, 110, -90);

    this.userCoords = { lat: 30.0444, lng: 31.2357 };
    this.detectUserLocation();

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

  detectUserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.userCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
        },
        () => {},
        { timeout: 8000 }
      );
    }
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
    this.globeMesh.rotation.y = -Math.PI / 2;
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
    this.moonGroup = new THREE.Group();
    this.moonPosition = new THREE.Vector3(180, 80, -120);
    this.moonGroup.position.copy(this.moonPosition);

    const moonGeo = new THREE.SphereGeometry(this.moonRadius, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({
      map: this.moonTexture,
      roughness: 0.85
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.userData = { isCelestial: true, type: 'moon', id: 'entry_moon_1' };
    this.moonGroup.add(this.moonMesh);

    const moonGlowGeo = new THREE.SphereGeometry(this.moonRadius * 1.05, 32, 32);
    const moonGlowMat = new THREE.MeshBasicMaterial({
      color: 0xfffbe6,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide
    });
    this.moonGlowMesh = new THREE.Mesh(moonGlowGeo, moonGlowMat);
    this.moonGroup.add(this.moonGlowMesh);

    this.celestialGroup.add(this.moonGroup);
  }

  latLngToVector3(lat, lng, radius) {
    const latRad = lat * (Math.PI / 180);
    const lngRad = lng * (Math.PI / 180);

    const x = radius * Math.cos(latRad) * Math.sin(lngRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.cos(lngRad);

    return new THREE.Vector3(x, y, z);
  }

  // Helper to create a perfectly aligned aerodynamic shooting star
  createAlignedShootingStar(color) {
    const group = new THREE.Group();

    // Direction vector of motion: moving along +X axis
    // 1. Brilliant Star Core at the head
    const headGeo = new THREE.SphereGeometry(2.0, 16, 16);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    group.add(headMesh);

    // 2. Surrounding Colored Aura
    const auraGeo = new THREE.SphereGeometry(3.0, 16, 16);
    const auraMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.65
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    group.add(auraMesh);

    // 3. Sleek Streamlined Tapering Tail trailing behind (-X axis)
    const tailLength = 26;
    const tailGeo = new THREE.ConeGeometry(2.4, tailLength, 16);
    const tailMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.45
    });
    const tailMesh = new THREE.Mesh(tailGeo, tailMat);
    // Align cone along X axis trailing behind the head
    tailMesh.rotation.z = Math.PI / 2;
    tailMesh.position.set(-tailLength / 2, 0, 0);
    group.add(tailMesh);

    // Rotate entire shooting star 30 degrees for dramatic celestial trajectory
    group.rotation.z = -Math.PI / 6;

    return { group, auraMesh };
  }

  renderEntries(entries) {
    // Clear groups
    while (this.pinsGroup.children.length > 0) {
      this.pinsGroup.remove(this.pinsGroup.children[0]);
    }
    this.pinMeshes = [];

    for (let i = this.moonGroup.children.length - 1; i >= 0; i--) {
      const child = this.moonGroup.children[i];
      if (child !== this.moonMesh && child !== this.moonGlowMesh) {
        this.moonGroup.remove(child);
      }
    }
    this.moonPinMeshes = [];

    while (this.shootingStarsGroup.children.length > 0) {
      this.shootingStarsGroup.remove(this.shootingStarsGroup.children[0]);
    }
    this.starMeshes = [];

    // --- City Density & Clustered Offsets ---
    // When multiple entries share a city (e.g. Cairo or Tokyo), offset them slightly
    // in a micro-spiral so pins never stack into a messy clump!
    const locationCounts = {};
    let moonWhisperIndex = 0;
    let starIndex = 0;

    entries.forEach((entry, index) => {
      const pinColor = FEELING_COLORS[entry.feeling] || FEELING_COLORS.default;

      if (entry.destination === 'earth' && entry.lat != null && entry.lng != null) {
        const locKey = `${entry.lat.toFixed(2)}_${entry.lng.toFixed(2)}`;
        const count = locationCounts[locKey] || 0;
        locationCounts[locKey] = count + 1;

        // Apply gentle micro-spiral offset for multiple entries in same city
        let offsetLat = entry.lat;
        let offsetLng = entry.lng;
        if (count > 0) {
          const angle = count * 1.8;
          const dist = 0.9 * Math.sqrt(count);
          offsetLat += Math.sin(angle) * dist;
          offsetLng += Math.cos(angle) * dist;
        }

        const pinGroup = new THREE.Group();
        const basePos = this.latLngToVector3(offsetLat, offsetLng, this.globeRadius);

        pinGroup.position.copy(basePos);
        pinGroup.lookAt(new THREE.Vector3(0, 0, 0));

        const beaconGeo = new THREE.SphereGeometry(1.7, 16, 16);
        const beaconMat = new THREE.MeshBasicMaterial({ color: pinColor });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(0, 0, -2.0);
        pinGroup.add(beaconMesh);

        const haloGeo = new THREE.RingGeometry(1.3, 3.2, 24);
        const haloMat = new THREE.MeshBasicMaterial({
          color: pinColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65
        });
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        haloMesh.position.set(0, 0, -1.8);
        pinGroup.add(haloMesh);

        const stemGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8);
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
      } else if (entry.destination === 'moon') {
        const moonPinGroup = new THREE.Group();
        const theta = (moonWhisperIndex * 1.618) * Math.PI * 2;
        const phi = Math.acos(0.2 + (moonWhisperIndex * 0.25) % 0.7);
        moonWhisperIndex++;

        const mx = this.moonRadius * Math.sin(phi) * Math.cos(theta);
        const my = this.moonRadius * Math.cos(phi);
        const mz = this.moonRadius * Math.sin(phi) * Math.sin(theta);

        moonPinGroup.position.set(mx, my, mz);
        moonPinGroup.lookAt(new THREE.Vector3(0, 0, 0));

        const moonBeaconGeo = new THREE.OctahedronGeometry(1.4);
        const moonBeaconMat = new THREE.MeshBasicMaterial({ color: pinColor });
        const moonBeacon = new THREE.Mesh(moonBeaconGeo, moonBeaconMat);
        moonPinGroup.add(moonBeacon);

        const mHaloGeo = new THREE.RingGeometry(1.0, 2.4, 16);
        const mHaloMat = new THREE.MeshBasicMaterial({
          color: 0xfffbe6,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75
        });
        const mHalo = new THREE.Mesh(mHaloGeo, mHaloMat);
        moonPinGroup.add(mHalo);

        moonPinGroup.userData = {
          entryId: entry.id,
          isMoonWhisper: true,
          pulseMesh: mHalo,
          pulseOffset: index * 0.9,
          timestamp: entry.timestamp
        };

        this.moonGroup.add(moonPinGroup);
        this.moonPinMeshes.push(moonPinGroup);
      } else if (entry.destination === 'shooting-star') {
        const { group: starGroup, auraMesh } = this.createAlignedShootingStar(pinColor);

        const offsetX = (starIndex % 4) * 45 - 65;
        const offsetY = Math.floor(starIndex / 4) * 35 - 20;
        const offsetZ = (starIndex % 2) * 25 - 12;
        starIndex++;

        const pos = entry.starPosition || {
          x: this.starsClusterCenter.x + offsetX,
          y: this.starsClusterCenter.y + offsetY,
          z: this.starsClusterCenter.z + offsetZ
        };
        starGroup.position.set(pos.x, pos.y, pos.z);

        starGroup.userData = {
          entryId: entry.id,
          isCelestial: true,
          pulseMesh: auraMesh,
          pulseOffset: index * 1.1,
          timestamp: entry.timestamp
        };

        this.shootingStarsGroup.add(starGroup);
        this.starMeshes.push(starGroup);
      }
    });
  }

  setFocusTarget(target) {
    this.activeFocusTarget = target;
    this.controls.autoRotate = false;

    if (target === 'moon') {
      this.controls.target.copy(this.moonPosition);
      this.controls.minDistance = 32;
      this.controls.maxDistance = 140;

      const offset = new THREE.Vector3(25, 15, 45);
      this.targetCameraPos = this.moonPosition.clone().add(offset);
      this.targetLookAt = this.moonPosition.clone();
    } else if (target === 'stars') {
      this.controls.target.copy(this.starsClusterCenter);
      this.controls.minDistance = 40;
      this.controls.maxDistance = 220;

      const offset = new THREE.Vector3(45, 25, 75);
      this.targetCameraPos = this.starsClusterCenter.clone().add(offset);
      this.targetLookAt = this.starsClusterCenter.clone();
    } else {
      this.controls.target.set(0, 0, 0);
      this.controls.minDistance = 115;
      this.controls.maxDistance = 420;

      this.targetLookAt = new THREE.Vector3(0, 0, 0);
      this.targetCameraPos = new THREE.Vector3(0, 0, 240);
    }
  }

  resetToUserLocation() {
    this.setFocusTarget('earth');
    this.controls.autoRotate = false;
    this.targetLookAt = new THREE.Vector3(0, 0, 0);

    const { lat, lng } = this.userCoords;
    const pinPos = this.latLngToVector3(lat, lng, this.globeRadius);
    this.targetCameraPos = pinPos.clone().normalize().multiplyScalar(180);
  }

  focusOnCoordinates(lat, lng) {
    this.setFocusTarget('earth');
    this.controls.autoRotate = false;
    const pinPos = this.latLngToVector3(lat, lng, this.globeRadius);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.targetCameraPos = pinPos.clone().normalize().multiplyScalar(170);
  }

  resetCameraFocus() {
    if (this.activeFocusTarget === 'moon') {
      this.setFocusTarget('moon');
    } else if (this.activeFocusTarget === 'stars') {
      this.setFocusTarget('stars');
    } else {
      this.targetLookAt = new THREE.Vector3(0, 0, 0);
      this.targetCameraPos = new THREE.Vector3(0, 0, 250);
      this.controls.autoRotate = true;
    }
  }

  setRecencyFilter(filter) {
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const allMeshes = [...this.pinMeshes, ...this.moonPinMeshes, ...this.starMeshes];

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
    const clickableTargets = [
      ...this.pinMeshes,
      ...this.moonPinMeshes,
      ...this.starMeshes,
      this.moonMesh
    ];
    const intersects = this.raycaster.intersectObjects(clickableTargets, true);

    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target && !target.userData?.entryId && !target.userData?.id) {
        target = target.parent;
      }
      if (target && target.userData) {
        this.controls.autoRotate = false;
        const entryId = target.userData.entryId || target.userData.id;

        if (target.userData.type === 'moon' || target === this.moonMesh) {
          this.setFocusTarget('moon');
          document.querySelectorAll('.target-btn').forEach((b) => {
            if (b.dataset.target === 'moon') b.classList.add('active');
            else b.classList.remove('active');
          });
        } else if (target.userData.isCelestial) {
          this.setFocusTarget('stars');
          document.querySelectorAll('.target-btn').forEach((b) => {
            if (b.dataset.target === 'stars') b.classList.add('active');
            else b.classList.remove('active');
          });
        }

        if (this.onPinClick) {
          this.onPinClick(entryId);
        }
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (this.targetCameraPos) {
      this.camera.position.lerp(this.targetCameraPos, 0.06);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 1.0) {
        this.targetCameraPos = null;
      }
    }
    if (this.targetLookAt) {
      this.controls.target.lerp(this.targetLookAt, 0.06);
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
    const allPulsing = [...this.pinMeshes, ...this.moonPinMeshes, ...this.starMeshes];
    allPulsing.forEach((mesh) => {
      if (mesh.userData?.pulseMesh) {
        const scale = 1 + Math.sin(time + mesh.userData.pulseOffset) * 0.3;
        mesh.userData.pulseMesh.scale.set(scale, scale, scale);
      }
    });

    if (this.moonMesh && this.activeFocusTarget !== 'moon') {
      this.moonMesh.rotation.y += 0.002;
    }

    // Glide shooting stars smoothly across orbit
    this.starMeshes.forEach((starMesh, idx) => {
      starMesh.position.y += Math.sin(time + idx) * 0.08;
    });

    this.renderer.render(this.scene, this.camera);
  }
}
