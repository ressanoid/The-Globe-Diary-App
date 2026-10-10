import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import nightMapUrl from './assets/earth-night.jpg';
import dayMapUrl from './assets/earth-blue-marble.jpg';

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
    this.controls.autoRotateSpeed = 0.35;

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

    this.initLights();
    this.initGlobeMesh();
    this.initStarfield();
    this.initCelestialSky();
    this.initEvents();

    this.animate = this.animate.bind(this);
    this.animate();
  }

  initLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff8e7, 1.1);
    this.sunLight.position.set(160, 90, 180);
    this.scene.add(this.sunLight);
  }

  initGlobeMesh() {
    const geometry = new THREE.SphereGeometry(this.globeRadius, 64, 64);
    this.globeMaterial = new THREE.MeshStandardMaterial({
      map: this.nightTexture,
      roughness: 0.65,
      metalness: 0.05
    });

    this.globeMesh = new THREE.Mesh(geometry, this.globeMaterial);
    this.scene.add(this.globeMesh);

    // Glowing atmospheric rim
    const atmosphereGeo = new THREE.SphereGeometry(this.globeRadius * 1.02, 48, 48);
    this.atmosphereMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide
    });
    this.atmosphereMesh = new THREE.Mesh(atmosphereGeo, this.atmosphereMat);
    this.scene.add(this.atmosphereMesh);
  }

  initStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1200;
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
      opacity: 0.75
    });

    this.starfield = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.starfield);
  }

  initCelestialSky() {
    // 3D Moon Mesh
    const moonGeo = new THREE.SphereGeometry(10, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xe0e6ed,
      roughness: 0.8
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.position.set(160, 90, -110);
    this.moonMesh.userData = { isCelestial: true, type: 'moon', id: 'celestial-moon' };
    this.celestialGroup.add(this.moonMesh);
  }

  // Convert GPS (lat, lng) to 3D Cartesian coordinates on sphere
  latLngToVector3(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  }

  // Update theme ambiance
  setTheme(theme) {
    const isNight = theme === 'night';
    this.globeMaterial.map = isNight ? this.nightTexture : this.dayTexture;
    this.globeMaterial.needsUpdate = true;

    if (isNight) {
      this.atmosphereMat.color.setHex(0x00f0ff);
      this.atmosphereMat.opacity = 0.16;
      this.starMat.opacity = 0.75;
      this.ambientLight.intensity = 0.85;
      this.sunLight.intensity = 1.1;
    } else {
      // Soft, gentle daytime lighting (not harsh or blown-out)
      this.atmosphereMat.color.setHex(0x5b7065);
      this.atmosphereMat.opacity = 0.08;
      this.starMat.opacity = 0.15;
      this.ambientLight.intensity = 0.95;
      this.sunLight.intensity = 0.9;
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

    const time = Date.now() * 0.002;
    this.pinMeshes.forEach((mesh) => {
      if (mesh.userData?.pulseMesh) {
        const scale = 1 + Math.sin(time + mesh.userData.pulseOffset) * 0.22;
        mesh.userData.pulseMesh.scale.set(scale, scale, scale);
      }
    });

    if (this.moonMesh) {
      this.moonMesh.rotation.y += 0.002;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
