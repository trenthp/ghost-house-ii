import * as THREE from 'three';

const DEG = Math.PI / 180;
const Z = new THREE.Vector3(0, 0, 1);
const Q_BACK_CAMERA = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // look out the back of the device
const wrap = (a) => ((a % 360) + 360) % 360;
const angleLerp = (a, b, t) => wrap(a + ((((b - a) % 360) + 540) % 360 - 180) * t);

/**
 * Turns device orientation into a camera rotation.
 * World frame: -Z = north, +X = east, +Y = up (when a compass is available).
 * Falls back to drag-to-look on desktops.
 */
export class OrientationTracker {
  constructor() {
    this.alpha = 0; this.beta = 90; this.gamma = 0;
    this.offset = 0;          // added to alpha to reach true-north alignment
    this.hasSensor = false;
    this.absolute = false;    // Android: deviceorientationabsolute
    this.compass = false;     // iOS: webkitCompassHeading
    this.yaw = 0; this.pitch = 0; // drag fallback
    this._euler = new THREE.Euler();
    this._q = new THREE.Quaternion();
    this._q0 = new THREE.Quaternion();
  }

  /** Must be called from a user gesture (iOS). */
  requestPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().then((r) => r === 'granted').catch(() => false);
    }
    return Promise.resolve(!!DOE);
  }

  get aligned() { return this.absolute || this.compass; }

  start() {
    const handle = (e, isAbsolute) => {
      if (e.alpha == null) return;
      if (this.absolute && !isAbsolute) return; // prefer the absolute stream once we have it
      if (isAbsolute) this.absolute = true;
      this.alpha = e.alpha; this.beta = e.beta; this.gamma = e.gamma;
      this.hasSensor = true;
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
        const target = wrap(360 - e.webkitCompassHeading - e.alpha);
        this.offset = this.compass ? angleLerp(this.offset, target, 0.05) : target;
        this.compass = true;
      }
    };
    window.addEventListener('deviceorientationabsolute', (e) => handle(e, true));
    window.addEventListener('deviceorientation', (e) => handle(e, e.absolute === true));
  }

  enableDrag(el) {
    let last = null;
    el.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerup', () => { last = null; });
    window.addEventListener('pointermove', (e) => {
      if (!last || this.hasSensor) return;
      this.yaw += (e.clientX - last.x) * 0.25;
      this.pitch = Math.max(-80, Math.min(80, this.pitch + (e.clientY - last.y) * 0.25));
      last = { x: e.clientX, y: e.clientY };
    });
  }

  apply(camera) {
    if (!this.hasSensor) {
      camera.quaternion.setFromEuler(this._euler.set(this.pitch * DEG, this.yaw * DEG, 0, 'YXZ'));
      return;
    }
    const screen = ((window.screen.orientation && window.screen.orientation.angle) ?? window.orientation ?? 0) * DEG;
    this._euler.set(this.beta * DEG, (this.alpha + this.offset) * DEG, -this.gamma * DEG, 'YXZ');
    this._q.setFromEuler(this._euler).multiply(Q_BACK_CAMERA).multiply(this._q0.setFromAxisAngle(Z, -screen));
    camera.quaternion.slerp(this._q, 0.35); // light smoothing of sensor jitter
  }
}

/** Compass heading the camera is looking toward (deg, clockwise from north). */
export function cameraHeading(camera) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return wrap(Math.atan2(f.x, -f.z) / DEG);
}
