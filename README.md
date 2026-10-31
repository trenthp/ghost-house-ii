# Ghost House

A Halloween web-AR experience: ghosts appear in your phone's camera view **only when you're at one specific house**. Everywhere else, the spirits are quiet and an arrow points you toward the haunted house.

No app install, no build step — just static files.

## How it works

- **Geofence** — GPS (`watchPosition`) measures your distance to the house. Inside the radius, the haunting begins (with hysteresis so it doesn't flicker at the edge).
- **AR view** — the rear camera feed sits behind a transparent Three.js canvas. Device orientation drives the virtual camera; with a compass (Android `deviceorientationabsolute`, iOS `webkitCompassHeading`) the ghosts gather in the direction of the house.
- **Ghosts** — procedural shader ghosts with rippling hems drift, flicker, and occasionally swoop at you. Closer to the house = more ghosts (2–6). Tap one to banish it.
- **Sound** — synthesized ambient drone, wind, wails, and shrieks (Web Audio, no files). Haptics on supported phones.

## Choose the house

Pick one:

1. **In the app:** open *Set up the haunted house*, stand at the house, tap *Haunt where I'm standing*, save. Then share the generated link.
2. **Link:** `https://your-site/?lat=42.5195&lng=-70.8967&r=40&name=The%20Old%20Manor`
3. **Bake it in:** set `DEFAULT_HOUSE` in `src/config.js`.

Priority: URL params → saved on device → `DEFAULT_HOUSE`.

Add `?demo=1` to skip the geofence (ghosts everywhere) for testing.

## Run it

Camera, GPS, and motion sensors require **HTTPS** (or `localhost`).

- Local: `python3 -m http.server 8000` → http://localhost:8000/?demo=1 (desktop: drag to look around)
- Phone: deploy anywhere static over HTTPS — e.g. GitHub Pages (Settings → Pages → deploy from branch `main`, root).

## Tips

- GPS is ±5–20 m outdoors; use a radius of 30 m or more.
- On iOS, tap **Enter** and allow motion access when prompted.
- If the compass is unavailable, ghosts appear wherever you look.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css` | UI shell |
| `src/main.js` | App flow, geofence, HUD, setup |
| `src/scene.js` | Three.js ghosts, wisps, tap-to-banish |
| `src/orientation.js` | Device orientation → camera, compass alignment |
| `src/geo.js` | Distance, bearing, formatting |
| `src/audio.js` | Synthesized sounds |
| `src/config.js` | House config / sharing |
