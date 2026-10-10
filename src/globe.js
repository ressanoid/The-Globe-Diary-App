import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import nightMapUrl from './assets/earth-night.jpg';
import dayMapUrl from './assets/earth-blue-marble.jpg';
import moonMapUrl from './assets/moon.jpg';

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
    this.controls.minDistance = 120;
    this.controls.maxDistance = 450;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;

    this.globeRadius = 80;
    this.pinsGroup = new THREE.Group();
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.pinsGroup);
    this.scene.add(this.celestialGroup);

    this.pinMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

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

  // Calculate real solar angle based on current UTC time
  getSunDirection() {
    const now = new Date();
    // UTC hours in fractions
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    // At UTC 12:00, Sun is directly at Prime Meridian (lng 0)
    const solarLongitude = ((12 - utcHours) / 24) * 360;
    const rad = (solarLongitude * Math.PI) / 180;

    // Approximate seasonal declination (~autumnal equinox / October)
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10)) * (Math.PI / 180);

    const sunX = Math.cos(declination) * Math.sin(rad);
    const sunY = Math.sin(declination);
    const sunZ = Math.cos(declination) * Math.cos(rad);

    return new THREE.Vector3(sunX, sunY, sunZ).normalize();
  }

  initLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5ea, 1.4);
    const sunDir = this.getSunDirection();
    this.sunLight.position.copy(sunDir.clone().multiplyScalar(220));
    this.scene.add(this.sunLight);
  }

  initRealtimeEarthMesh() {
    const geometry = new THREE.SphereGeometry(this.globeRadius, 64, 64);

    // Custom WebGL Shader blending Day Texture on sunlit side and Night Lights on dark side!
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
          // Dot product between surface normal and sun direction: 1 = full noon, -1 = full midnight
          float sunDot = dot(norm, sunDirection);

          // Smooth twilight terminator transition
          float dayFactor = smoothstep(-0.15, 0.2, sunDot);

          vec4 dayColor = texture2D(dayTexture, vUv);
          vec4 nightColor = texture2D(nightTexture, vUv);

          // Enhance night city lights brightness on the dark side
          vec3 composite = mix(nightColor.rgb * 1.35, dayColor.rgb, dayFactor);

          gl_FragColor = vec4(composite, 1.0);
        }
      `
    });

    this.globeMesh = new THREE.Mesh(geometry, this.earthShaderMaterial);
    this.scene.add(this.globeMesh);

    // Glowing atmospheric rim
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
    this.moonMesh.userData = { isCelestial: true, type: 'moon', id: 'celestial-moon' };
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

  setTheme(theme) {
    // Theme adjusts UI warmth while real-time Day/Night terminator continues on Earth
    if (theme === 'night') {
      this.atmosphereMat.color.setHex(0x00f0ff);
      this.atmosphereMat.opacity = 0.2;
    } else {
      this.atmosphereMat.color.setHex(0xc86d51);
      this.atmosphereMat.opacity = 0.16;
    }
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
    const clickableTargets = [...this.pinMeshes, this.moonMesh];
    const intersects = this.raycaster.intersectObjects(clickableTargets, true);

    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target && !target.userData?.entryId && !target.userData?.isCelestial) {
        target = target.parent;
      }
      if (target && target.userData) {
        this.controls.autoRotate = false;
        if (this.onPinClick) {
          this.onPinClick(target.userData.entryId || target.userData.id);
        }
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.controls.update();

    // Periodically update solar angle to stay accurate in real-time
    const sunDir = this.getSunDirection();
    if (this.earthShaderMaterial) {
      this.earthShaderMaterial.uniforms.sunDirection.value.copy(sunDir);
    }
    if (this.sunLight) {
      this.sunLight.position.copy(sunDir.clone().multiplyScalar(220));
    }

    const time = Date.now() * 0.002;
    this.pinMeshes.forEach((mesh) => {
      if (mesh.userData?.pulseMesh) {
        const scale = 1 + Math.sin(time + mesh.userData.pulseOffset) * 0.22;
        mesh.userData.pulseMesh.scale.set(scale, scale, scale);
      }
    });

    if (this.moonMesh) {
      this.moonMesh.rotation.y += 0.003;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
