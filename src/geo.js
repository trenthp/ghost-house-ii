const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Compass bearing from point 1 to point 2, degrees clockwise from north.
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const imperial = /^en-(US|LR|MM)$/i.test(navigator.language || '');

export function formatDistance(m) {
  if (imperial) {
    const ft = m * 3.28084;
    return ft < 1000 ? `${Math.round(ft / 10) * 10} ft` : `${(m / 1609.34).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function watchPosition(onPos, onErr) {
  if (!('geolocation' in navigator)) {
    onErr(new Error('Geolocation not supported'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(onPos, onErr, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 20000,
  });
  return () => navigator.geolocation.clearWatch(id);
}
