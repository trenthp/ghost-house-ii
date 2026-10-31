import { loadHouse, saveHouse, shareUrl, isDemo } from './config.js';
import { distanceMeters, bearingDeg, formatDistance, watchPosition } from './geo.js';
import { OrientationTracker, cameraHeading } from './orientation.js';
import { GhostScene } from './scene.js';
import { SpookyAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const ui = {
  video: $('camera'), canvas: $('scene'), hud: $('hud'), status: $('status'),
  radar: $('radar'), arrow: $('arrow'), distance: $('distance'),
  score: $('score'), gps: $('gps'), hint: $('hint'),
  intro: $('intro'), houseLabel: $('house-label'), start: $('start'),
  setup: $('setup'),
};

const demo = isDemo();
let house = loadHouse();
let haunted = false;
let banished = 0;

const orientation = new OrientationTracker();
const audio = new SpookyAudio();
const ghosts = new GhostScene(ui.canvas);

// ---------- Intro ----------
function refreshIntro() {
  if (demo) {
    ui.houseLabel.textContent = 'Demo mode — the ghosts are everywhere.';
    ui.start.disabled = false;
  } else if (house) {
    ui.houseLabel.textContent = `🏚️ Haunting: ${house.name}`;
    ui.start.disabled = false;
  } else {
    ui.houseLabel.textContent = 'No haunted house chosen yet. Set one up first.';
    ui.start.disabled = true;
  }
}
refreshIntro();

ui.start.addEventListener('click', async () => {
  // Everything that needs a user gesture happens before the first await.
  audio.init();
  const motion = orientation.requestPermission();
  const cam = startCamera();

  ui.intro.hidden = true;
  ui.hud.hidden = false;

  orientation.start();
  orientation.enableDrag(ui.canvas);
  await Promise.all([motion, cam]);
  if (demo) {
    setHaunted(true, { distance: 8, bearing: null, count: 5 });
    ui.status.textContent = 'Demo mode: you stand on haunted ground.';
  } else {
    startGeo();
  }
  setTimeout(() => {
    if (!orientation.hasSensor) showHint('No motion sensor — drag to look around.');
    else if (!orientation.aligned) showHint('No compass — ghosts gather wherever you look.');
  }, 2500);
});

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    ui.video.srcObject = stream;
    await ui.video.play().catch(() => {});
  } catch (e) {
    console.warn('Camera unavailable', e);
    showHint('Camera blocked — you’ll see ghosts against the dark.');
  }
}

// ---------- Geofence ----------
function startGeo() {
  ui.status.textContent = 'Listening for the spirits… (finding your location)';
  watchPosition(onPosition, (err) => {
    ui.status.textContent = err.code === 1
      ? 'Location blocked — the ghosts can’t find you. Allow location and reload.'
      : 'Can’t get a GPS fix. Try stepping outside.';
  });
}

let lastFix = null;
function onPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  const distance = distanceMeters(latitude, longitude, house.lat, house.lng);
  const bearing = bearingDeg(latitude, longitude, house.lat, house.lng);
  lastFix = { distance, bearing };

  // Give GPS the benefit of the doubt, with hysteresis so the ghosts don't flicker at the edge.
  const effective = Math.max(0, distance - Math.min(accuracy, 30) * 0.5);
  const enterAt = house.radius;
  const leaveAt = house.radius * 1.25 + 5;
  const inside = haunted ? effective <= leaveAt : effective <= enterAt;

  ui.gps.textContent = `GPS ±${formatDistance(accuracy)}`;
  const closeness = Math.max(0, 1 - distance / house.radius);
  setHaunted(inside, {
    distance,
    bearing: orientation.aligned ? bearing : null,
    count: 2 + Math.round(4 * closeness),
  });

  if (inside) {
    ui.status.textContent = `You stand on the grounds of ${house.name}…`;
    ui.radar.hidden = true;
  } else {
    ui.status.textContent = `The spirits are quiet. ${capitalize(house.name)} is ${formatDistance(distance)} away.`;
    ui.radar.hidden = false;
    ui.distance.textContent = formatDistance(distance);
  }
}

function setHaunted(value, opts) {
  if (value && !haunted) navigator.vibrate?.([80, 60, 160]);
  haunted = value;
  ghosts.setHaunting({ haunted: value, ...opts });
  audio.setIntensity(value ? 1 : 0);
}

// ---------- Interaction ----------
let down = null;
ui.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
ui.canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved < 10) ghosts.tap(e.clientX, e.clientY);
});

ghosts.events.banish = (g) => {
  banished++;
  ui.score.textContent = `👻 ${banished} banished`;
  audio.shriek(g.pan(ghosts.camera));
  navigator.vibrate?.(40);
};
ghosts.events.swoop = (g) => {
  audio.wooo(g.pan(ghosts.camera));
  navigator.vibrate?.([30, 40, 30]);
};

// Ghosts drift around wailing on their own now and then
setInterval(() => {
  const near = ghosts.ghosts.filter((g) => g.state === 'alive');
  if (near.length && Math.random() < 0.5) {
    audio.wooo(near[Math.floor(Math.random() * near.length)].pan(ghosts.camera));
  }
}, 7000);

let hintTimer;
function showHint(text) {
  ui.hint.textContent = text;
  ui.hint.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { ui.hint.hidden = true; }, 6000);
}

// ---------- Render loop ----------
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  orientation.apply(ghosts.camera);
  ghosts.update(dt, now / 1000);
  ghosts.render();
  document.documentElement.style.setProperty('--haunt', ghosts.level.toFixed(3));

  if (!ui.radar.hidden && lastFix) {
    if (orientation.aligned) {
      ui.arrow.hidden = false;
      // Arrow glyph points right (east) by default; rotate so it points at the house.
      const rel = lastFix.bearing - cameraHeading(ghosts.camera) - 90;
      ui.arrow.style.transform = `rotate(${rel}deg)`;
    } else {
      ui.arrow.hidden = true;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Setup ----------
const f = { name: $('f-name'), lat: $('f-lat'), lng: $('f-lng'), radius: $('f-radius') };
function fillSetup(h) {
  if (!h) return;
  f.name.value = h.name === 'the haunted house' ? '' : h.name;
  f.lat.value = h.lat.toFixed(6);
  f.lng.value = h.lng.toFixed(6);
  f.radius.value = h.radius;
  $('r-val').textContent = h.radius;
}
function showShare(h) {
  $('share').hidden = false;
  $('share-url').value = shareUrl(h);
}

$('open-setup').addEventListener('click', () => {
  fillSetup(house);
  if (house) showShare(house);
  ui.intro.hidden = true;
  ui.setup.hidden = false;
});
$('close-setup').addEventListener('click', () => {
  ui.setup.hidden = true;
  ui.intro.hidden = false;
  refreshIntro();
});
f.radius.addEventListener('input', () => { $('r-val').textContent = f.radius.value; });

$('use-here').addEventListener('click', () => {
  const s = $('here-status');
  s.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    (p) => {
      f.lat.value = p.coords.latitude.toFixed(6);
      f.lng.value = p.coords.longitude.toFixed(6);
      s.textContent = `Got it (±${formatDistance(p.coords.accuracy)}). Save to haunt this spot.`;
    },
    (e) => { s.textContent = `Couldn’t get location: ${e.message}`; },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
});

$('save').addEventListener('click', () => {
  const lat = parseFloat(f.lat.value), lng = parseFloat(f.lng.value);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    $('here-status').textContent = 'Enter a valid latitude and longitude.';
    return;
  }
  house = saveHouse({ lat, lng, radius: +f.radius.value, name: f.name.value });
  showShare(house);
  $('here-status').textContent = `Saved. ${capitalize(house.name)} is now haunted.`;
});

$('copy').addEventListener('click', async () => {
  const url = $('share-url').value;
  try {
    if (navigator.share) await navigator.share({ title: 'Ghost House', text: 'Come find the ghosts…', url });
    else { await navigator.clipboard.writeText(url); $('copy').textContent = 'Copied!'; }
  } catch { /* user cancelled */ }
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
