import * as THREE from 'three';
import { cameraHeading } from './orientation.js';

const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vY;
  void main() {
    vec3 p = position;
    float skirt = smoothstep(0.35, -0.8, p.y);       // 0 on the head, 1 at the hem
    float ang = atan(p.z, p.x);
    p.y += skirt * 0.12 * sin(ang * 7.0 + uTime * 3.0 + uSeed);
    p.x += skirt * 0.10 * sin(uTime * 1.7 + p.y * 4.0 + uSeed);
    p.z += skirt * 0.06 * cos(uTime * 1.3 + p.y * 3.0);
    vY = position.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vY;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.0);
    float hem = smoothstep(-0.85, 0.15, vY);
    float a = (0.45 + 0.55 * rim) * hem * uOpacity;
    gl_FragColor = vec4(uColor * (0.85 + 0.5 * rim), a);
  }
`;

function makeResources() {
  // Lathe profile: dome head flowing into an open, flared sheet.
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * 0.5 + 0.001, 0.5 + Math.cos(a) * 0.5));
  }
  pts.push(new THREE.Vector2(0.52, 0.1), new THREE.Vector2(0.57, -0.4), new THREE.Vector2(0.64, -0.85));
  const bodyGeo = new THREE.LatheGeometry(pts, 56);
  bodyGeo.rotateY(Math.PI); // lathe seam starts at +Z (the face); turn it to the back

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(c);

  return { bodyGeo, glowTex, featureGeo: new THREE.SphereGeometry(1, 16, 12) };
}

class Ghost {
  constructor(res, home) {
    this.color = new THREE.Color().setHSL(rand(0.3, 0.5), 0.5, 0.88);
    this.group = new THREE.Group();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: rand(0, 10) },
        uOpacity: { value: 0 },
        uColor: { value: this.color },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.body = new THREE.Mesh(res.bodyGeo, this.mat);
    this.body.userData.ghost = this;
    this.body.renderOrder = 2;
    this.group.add(this.body);

    this.faceMat = new THREE.MeshBasicMaterial({ color: 0x07020c, transparent: true, opacity: 0 });
    const feature = (x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(res.featureGeo, this.faceMat);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.renderOrder = 3;
      this.group.add(m);
      return m;
    };
    feature(-0.16, 0.74, 0.41, 0.07, 0.1, 0.04);
    feature(0.16, 0.74, 0.41, 0.07, 0.1, 0.04);
    this.mouth = feature(0, 0.48, 0.5, 0.08, 0.11, 0.04);

    this.glowMat = new THREE.SpriteMaterial({
      map: res.glowTex, color: this.color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(3.2); glow.position.y = 0.3; glow.renderOrder = 1;
    this.group.add(glow);

    this.home = home.clone();
    this.size = rand(0.9, 1.4);
    this.group.scale.setScalar(this.size);
    this.phase = rand(0, 100);
    this.state = 'appearing';
    this.opacity = 0;
    this.swoopT = -1;                 // <0 = not swooping
    this.swoopTimer = rand(5, 14);
    this.banishT = 0;
    this.group.position.copy(home);
  }

  update(dt, t, camera, events) {
    const tt = t + this.phase;
    this.mat.uniforms.uTime.value = tt;
    const pos = this.group.position;

    if (this.state === 'banished') {
      this.banishT += dt;
      this.group.rotateY(dt * (8 + this.banishT * 30));
      this.group.scale.multiplyScalar(1 + dt * 2.5);
      pos.y += dt * 2.5;
      this.opacity = Math.max(0, 1 - this.banishT * 1.6);
      if (this.opacity === 0) this.state = 'dead';
      this._applyOpacity();
      return;
    }

    // Lazy drift around the home spot
    const target = new THREE.Vector3(
      this.home.x + Math.sin(tt * 0.31) * 1.3,
      this.home.y + Math.sin(tt * 0.9) * 0.35,
      this.home.z + Math.cos(tt * 0.23) * 1.3,
    );

    // Occasionally swoop at the viewer — only if they can see it
    if (this.state === 'alive') {
      this.swoopTimer -= dt;
      if (this.swoopTimer <= 0 && this.swoopT < 0) {
        if (this.inView(camera, 0.85)) {
          this.swoopT = 0;
          events.swoop(this);
        }
        this.swoopTimer = rand(8, 18);
      }
    }
    if (this.swoopT >= 0) {
      this.swoopT += dt;
      const s = this.swoopT < 0.7 ? this.swoopT / 0.7 : this.swoopT < 1.3 ? 1 : 1 - (this.swoopT - 1.3) / 1.5;
      if (s <= 0 && this.swoopT > 1.3) this.swoopT = -1;
      const dir = target.clone().sub(camera.position).normalize();
      const close = camera.position.clone().addScaledVector(dir, 2.2);
      target.lerp(close, easeInOut(clamp(s, 0, 1)) * 0.85);
      this.mouth.scale.y = 0.11 + 0.08 * clamp(s, 0, 1);
    }
    pos.lerp(target, 1 - Math.exp(-dt * 3));

    // Face the viewer, with a little sway
    this.group.lookAt(camera.position.x, pos.y, camera.position.z);
    this.group.rotateZ(Math.sin(tt * 1.1) * 0.12);

    if (this.state === 'appearing') {
      this.opacity = Math.min(1, this.opacity + dt / 1.6);
      if (this.opacity === 1) this.state = 'alive';
    } else if (this.state === 'leaving') {
      this.opacity = Math.max(0, this.opacity - dt / 1.4);
      if (this.opacity === 0) this.state = 'dead';
    }
    // Flicker
    this._applyOpacity(0.88 + 0.12 * Math.sin(tt * 7.3) * Math.sin(tt * 2.1));
  }

  _applyOpacity(flicker = 1) {
    const o = this.opacity * flicker;
    this.mat.uniforms.uOpacity.value = o;
    this.faceMat.opacity = o * 0.95;
    this.glowMat.opacity = o * 0.35;
  }

  inView(camera, minDot) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const d = this.group.position.clone().sub(camera.position).normalize();
    return f.dot(d) > minDot;
  }

  /** -1 (left) .. 1 (right) relative to the camera, for stereo panning */
  pan(camera) {
    const p = this.group.position.clone().applyMatrix4(camera.matrixWorldInverse);
    return clamp(p.x / Math.max(1, -p.z), -1, 1);
  }

  dispose() {
    this.mat.dispose(); this.faceMat.dispose(); this.glowMat.dispose();
  }
}

const easeInOut = (x) => x * x * (3 - 2 * x);

export class GhostScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 200);
    this.res = makeResources();
    this.ghosts = [];
    this.haunted = false;
    this.targetCount = 0;
    this.spawnTimer = 0.5;
    this.anchor = { bearing: null, distance: 8 };
    this.level = 0; // smoothed haunt level, 0..1
    this.events = { swoop: () => {}, banish: () => {} };
    this.raycaster = new THREE.Raycaster();
    this._makeWisps();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _makeWisps() {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = rand(2.5, 16);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand(-1.5, 4);
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.wispMat = new THREE.PointsMaterial({
      map: this.res.glowTex, color: 0xb8ffd0, size: 0.22, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.wisps = new THREE.Points(geo, this.wispMat);
    this.scene.add(this.wisps);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * haunted: inside the geofence
   * count: how many ghosts to keep around
   * bearing: compass bearing to the house (null if no compass)
   * distance: meters to the house center
   */
  setHaunting({ haunted, count = 3, bearing = null, distance = 8 }) {
    this.haunted = haunted;
    this.targetCount = haunted ? count : 0;
    this.anchor = { bearing, distance };
    if (!haunted) for (const g of this.ghosts) if (g.state !== 'banished') g.state = 'leaving';
  }

  _spawnPoint() {
    const { bearing, distance } = this.anchor;
    const heading = cameraHeading(this.camera);
    // Mostly gather toward the house; sometimes appear right where the viewer is looking.
    const towardHouse = bearing != null && distance > 6 && Math.random() < 0.65;
    const b = (towardHouse ? bearing + rand(-35, 35) : heading + rand(-40, 40)) * DEG;
    const d = clamp(distance, 4, 12) + rand(-1.5, 2);
    return new THREE.Vector3(Math.sin(b) * d, rand(-0.6, 2.2), -Math.cos(b) * d);
  }

  update(dt, t) {
    this.camera.updateMatrixWorld();
    this.level += ((this.haunted ? 1 : 0) - this.level) * (1 - Math.exp(-dt * 0.8));
    this.wispMat.opacity = this.level * 0.7;
    this.wisps.rotation.y += dt * 0.03;
    this.wisps.position.y = Math.sin(t * 0.2) * 0.4;

    const living = this.ghosts.filter((g) => g.state === 'appearing' || g.state === 'alive').length;
    if (this.haunted && living < this.targetCount) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const g = new Ghost(this.res, this._spawnPoint());
        this.ghosts.push(g);
        this.scene.add(g.group);
        this.spawnTimer = rand(1.2, 3);
      }
    }

    for (const g of this.ghosts) g.update(dt, t, this.camera, this.events);
    this.ghosts = this.ghosts.filter((g) => {
      if (g.state !== 'dead') return true;
      this.scene.remove(g.group);
      g.dispose();
      return false;
    });
  }

  /** Returns true if a ghost was hit. */
  tap(clientX, clientY) {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.ghosts.filter((g) => g.state === 'alive' || g.state === 'appearing').map((g) => g.body),
      false,
    );
    if (!hits.length) return false;
    const g = hits[0].object.userData.ghost;
    g.state = 'banished';
    g.swoopT = -1;
    this.spawnTimer = Math.max(this.spawnTimer, rand(2.5, 5)); // a short reprieve
    this.events.banish(g);
    return true;
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
