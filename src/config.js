// Hard-code a house here if you want it baked into the deployed site, e.g.
// export const DEFAULT_HOUSE = { lat: 42.5195, lng: -70.8967, radius: 40, name: 'The Old Manor' };
export const DEFAULT_HOUSE = null;

const KEY = 'ghost-house:house';

// Priority: URL params (?lat=&lng=&r=&name=) > saved on this device > DEFAULT_HOUSE
export function loadHouse() {
  const p = new URLSearchParams(location.search);
  const lat = parseFloat(p.get('lat'));
  const lng = parseFloat(p.get('lng'));
  if (isFinite(lat) && isFinite(lng)) {
    return normalize({ lat, lng, radius: parseFloat(p.get('r')), name: p.get('name') });
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && isFinite(saved.lat) && isFinite(saved.lng)) return normalize(saved);
  } catch { /* storage unavailable */ }
  return DEFAULT_HOUSE ? normalize(DEFAULT_HOUSE) : null;
}

export function saveHouse(house) {
  const h = normalize(house);
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* ignore */ }
  return h;
}

export function shareUrl(house) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('lat', house.lat.toFixed(6));
  u.searchParams.set('lng', house.lng.toFixed(6));
  u.searchParams.set('r', String(house.radius));
  if (house.name) u.searchParams.set('name', house.name);
  return u.toString();
}

export const isDemo = () => new URLSearchParams(location.search).has('demo');

function normalize(h) {
  const radius = isFinite(h.radius) && h.radius > 0 ? Math.round(h.radius) : 40;
  const name = (h.name || '').trim().slice(0, 40) || 'the haunted house';
  return { lat: +h.lat, lng: +h.lng, radius, name };
}
