# Project Structure

A Go server on **port 3000** serves two web apps and one WebSocket hub:
- **Control** (`/control/`) runs on any number of devices, at any screen size. It manages screens, notes and clocks, their per-screen layouts, time, seasons, weather and knobs.
- **Monitor** (`/monitor/?screen=<id>`) can run on many screens at once. Each one draws a Ghibli-style animated scene (meadow, forest, mountain, beach or city) with creatures, sound, and the notes and clocks placed for that screen.

The server owns all shared state. Monitors render it; controls send intents. The creatures, particles and random details are simulated locally on each monitor, so screens show the same "overview" of time, season and weather without being pixel-identical.

```
main.go            flags, http/https prompt, routes, go:embed web/, graceful shutdown
hub.go             state: items, screens, env · virtual clock · Markov weather · clock alarms · WS hub
store.go           SQLite persistence (modernc.org/sqlite, pure Go / no cgo)
data/monitor.db    runtime database (gitignored)
certs/             cert.pem + key.pem for https (gitignored)
web/               embedded into the binary (rebuild after editing!)
  index.html       landing page
  shared/
    link.js        Link(role, handlers, query): reconnecting WS + 6s liveness watchdog; renderMarkdown(); escapeHTML()
    fonts.js       FONTS {id:[label, css stack]}, FONT_CSS (Google Fonts URL), CLOCK_STYLES, fontCss(id)
    fonts.css      local Blex Mono → bundled IBM Plex Mono (var(--mono))
    marked.min.js, purify.min.js, fonts/*.woff2   vendored
  control/         index.html · style.css (responsive: 3 → 2 → 1 columns at 1200/760px) · app.js
  monitor/
    grain.js       WebGL film grain: new clumpy noise + dust each 24fps film frame, overlay-blended (CSS fallback if no WebGL)
    world.js       U utils, SEASONS palettes, SKY keyframes, class World (engine), pastel shade(), sunbeams
    scenes.js      World helpers (blades/grass/flowers/hit) + SCENES {meadow, forest, mountain, beach, city}
    life.js        SP species table + class Life (creature AI, taps) + DRAW per species
    audio.js       class Ambience: beds per scene, weather, pad, animal calls, alarm
    app.js         glue: Link, items (notes/clocks), render loop, adaptive quality, battery, fullscreen, taps
```

## Run
```
go build -o monitor . && ./monitor         # asks 1) HTTP 2) HTTPS
./monitor -mode http|https -addr :3000 -cert ./certs/cert.pem -key ./certs/key.pem -db ./data/monitor.db
```
Open `/monitor/?screen=living-room` on each display; without `?screen`, an id is generated and kept in localStorage. Control lives at `/control/`.

## Persistence (store.go)
The database is SQLite in WAL mode with a single connection. It has three tables:
- `items(id, kind, created, data)`
- `screens(id, name, scene, data)`
- `kv(k, v)`, where `k='env'` holds the Env row

The `data` and `v` columns hold the JSON of the Go structs, so fields can be queried with `json_extract`. The hub marks state dirty on every change. `save()` takes a snapshot under the lock and then writes it outside the lock in one transaction: about every 2s while there are changes, every 30s for the running clock, and on shutdown. When the database is empty on startup, a legacy `-data` state.json is imported once and renamed to `*.imported`.

## Data model (hub.go)
- `Screen{id,name,scene,fpsCap,w,h,dpr,online,fps,audio,battery,lastSeen}` is created the first time a monitor connects with that id. Monitors report their size, fps, audio state and battery through `stats`. A second connection with the same screen id **kicks the older one**; different ids coexist.
- `Item{id,kind:"note"|"clock",title,content,font,fontSize,z,clock?,layouts{screenId: Layout}}`
  - `Layout{x,y,w,h,on}` stores fractions of that screen's viewport. Every item has one layout per screen: notes default to the bottom right, clocks to the top right.
  - `Clock{mode: clock|timer|countdown|alarm, display: digital|analog, style, duration, running, startAt, acc, alarm "HH:MM", ringing, ringAt, fired}`. Elapsed time is `acc + (running ? now-startAt : 0)`, using server epoch ms; monitors correct for clock skew with `serverTime`. For an alarm, `running` means armed.
  - `checkClocks` runs every second: a finished countdown or a matching alarm time (in **server local time**) sets `ringing`, which clears itself after 3 minutes or when dismissed.
- `Env{dayMs, yearMs, dayMin, nightMin, seasonMin[4], paused, speed, seasonLocked, weatherMode, knobs{animals,rain,wind,volume,grain}, muted, showHud, w}`
  - The day cycle is `dayMin + nightMin` minutes. The phase is stretched so 0 is sunrise and .5 is sunset, which makes day and night last different lengths. Seasons use `seasonMin[i]` each. Changing any of these lengths keeps the current phase and season position.
  - Weather `w{state, intensity, cloud, left}` is a Markov chain running on virtual time: clear → cloudy → rain ⇄ storm. The `rain` knob biases it toward wet weather. Setting `weatherMode` to anything other than auto fixes the weather.
  - `knobDefs` holds the knob defaults and is sent to clients for the ↺ reset buttons.
- The env view is broadcast every 1s and after every change. It includes the derived fields `phase, isDay, hour, season, seasonProgress, seasonLeftMs, weather (effective), cycleMs, serverTime, knobDefs`.

## WebSocket protocol (`/ws?role=control` | `/ws?role=monitor&screen=<id>`)
Client → server (`type`, fields):
| type | fields | who |
|---|---|---|
| `ping` | – | both |
| `stats` | `patch:{w,h,dpr,fps,audio,battery}` | monitor |
| `item.create` | `kind` | control |
| `item.update` | `id, patch` (JSON merge into the Item; the `clock` sub-object merges too) | control |
| `item.front` / `item.delete` | `id` | control |
| `layout.set` | `id, screen` (`"*"` = all screens), `patch:{x,y,w,h,on}` | control |
| `clock.act` | `id, act: start\|pause\|reset\|dismiss` | control |
| `env.set` | `patch`: any Env field, plus `season` (jump), `hour` (jump), `reroll` | control |
| `screen.update` | `screen, patch:{name,scene,fpsCap}` | control |
| `screen.delete` | `screen` (offline only; also drops its layouts) | control |

Server → client: `welcome{id,items,screens,env}`, `item.upsert{item,by}`, `item.remove{id}`, `env{env}`, `screens{screens}`, `kicked`, `pong`.

Cleanup works like before. The server uses a 30s read deadline and pings every 10s; on an error it runs `remove()`, which closes the send channel and marks the screen offline. A client whose send buffer is full gets dropped. Clients reconnect with backoff after 6s of silence, and `Link.stop()` runs on `pagehide` and when kicked.

## Monitor engine (world.js)
- **Performance**:
  - The sky and the static landscape are drawn into two offscreen caches, which are rebuilt only when the quantized light, season, weather or size changes (at most every 350ms) and crossfade over 800ms.
  - Each frame draws those two caches plus the dynamic parts: sun/moon sprites, pre-tinted cloud sprites, water, grass, hero trees, creatures and particles.
  - Paths are batched per color, `ctx.filter` and `shadowBlur` are never used, and the canvas is opaque (`alpha:false`).
  - Grain, vignette and lightning flashes are CSS layers.
  - In `app.js`, the frame cost is measured. Render resolution drops in steps from 1 to 0.5 when a frame costs more than 55% of the frame budget, and glass blur is disabled (`body.lite`) below 0.75. The per-screen `fpsCap` skips frames; otherwise the loop runs at the display's refresh rate (120/144Hz+). A frame measured about 1ms of JS at 1440p.
- `state()` extrapolates the server clock locally and eases the phase, palette, cloud cover, rain and storm toward the target, so jumps from the control animate smoothly. It returns `st{t,dt,hour,day,light,night,golden,cloud,rain,storm,snow,wind,sky[3],pal,si,blend,kn,W,H,k}`.
- `SEASONS` holds colors plus weights (`snow, bare, petals, leaves, fireflies, pollen, flowers, bloom`) that are crossfaded in the last 8% of a season. The weights drive tree looks, particles and creature activity.
- `shade(color, depth)` applies aerial perspective, golden hour, overcast and night tint, then a pastel pass (slight desaturation and a milky lift). `col/pc/hx` are memoized per cache build.
- Drawing helpers: `ridge/ry/fillRidge/vgrad/tree(type: round|pine|palm|poplar|bloom)/house`, `blades/grass/flowers` (scenes.js).
- Particles (rain, snow, petals, leaves, fireflies, pollen) and ripples; lightning adds a bolt, a CSS flash and thunder.
- Taps: `world.tap(x,y)` tries creatures first (`life.tap`), then scene objects (`scene.tap`), then a generic reaction (burst, ripple, startle nearby animals, chime).

## Scenes (scenes.js)
Each scene object has `horizon, fireflies?, amb, life{species: baseCount}` and implements:
- `init(S, rng)`: deterministic geometry. It sets `gt(x)`/`gb` (the ground band creatures walk in), `floor`, `perches[]`, and `water{ell|rect, surf}`.
- `build(g,S,rng,st)`: the static layer, cached.
- `fg(g,S,st)`: the dynamic layer each frame.
- `front?` (grass in front of creatures), `emit?` (where leaves and petals fall from), and `tap?(S,x,y)` (returns true when handled).

Interactive objects:
- **meadow**: hero tree (shakes, leaves fall, birds flush out), lake (ripples, fish come and jump).
- **forest**: mushrooms (bounce, spores, spirits gather), big trunks (knock, leaves fall, birds flush out).
- **mountain**: waterfall (mist and splash), lone tree, peaks (echo, birds take off).
- **beach**: palms (rustle), sea (fish jump, sometimes a whale spouts), shore (wave foam).
- **city**: windows (toggle their light, `S.ver++` rebuilds the cache), lamps (flicker), clock tower (bells), tram (bell).

## Creatures (life.js)
- In `SP[species]`, `hab` is g (ground), a (air), w (water) or p (perch), alongside `size`, `sh` (shadow), `h` (height), `sp` [walk, run] px/s, `cols`, `fear`, `prey`, `friends`, `call` (a sound name), `tap` (list of possible reactions), `mate`, `hop`, `burrow`, `flock`, `lands`, `glide`, `circle`, `flutter`, and `act(st)`, which gives activity by time of day, weather and season. Every prey's `fear` list automatically includes its predators.
- **Population**: `census()` runs every second and targets `round(base × animals knob × 2 × act(st))` for each species. Animals enter from the screen edges, fly in or fade in, and leave by walking off, flying away or hiding in a burrow.
- **Social tick** (every 0.3s):
  - flee from a threat (burrowers may hide);
  - predators stalk and pounce on ground prey, while air hunters dive — rabbits, marmots and squirrels for hawks, fish for gulls, with a 25–30% catch chance and the prey vanishing gently;
  - mates court with ♥, then walk together, and in spring or summer a baby may follow its parent and grow up;
  - friends greet each other with ♪ or !.
- **Air**: steering toward a target, flock alignment, landing on the ground or on perches, and taking off when scared. Hawks circle; butterflies flutter.
- **Water**: fish swim and jump (splash and ripples) and come to lures. The whale cycles deep → surf (spout) → tail.
- **Taps**: each tap picks a random reaction from `tap`. Over-tapping (more than 3 taps in 5s) makes the animal flee. Reactions are `flee, fly, hop, look, heart, roll, spin, hide, rattle, jump, spout`, plus call sounds.
- **Motion**:
  - Speed eases in and out (`a.v`), and facing turns smoothly (`a.face`, which shows as a narrowing sprite mid-turn).
  - Head pose eases (`a.hd`: -.35 alert, 0 up, 1 grazing).
  - The gait phase `a.an` advances by distance divided by the species `stride`, so feet never slide.
  - `quad()` is the rig for four-legged animals (deer, fox, dog, cat): legs with a knee solved by 2-bone IK, a 4-beat walk (the foot is on the ground 60% of the cycle), a faster run (45%), body bob, a curved neck and a tail callback.
  - Rabbits hop with squash and stretch. Birds flap in bursts and glide, and tilt with their vertical speed. Fish swim with a wave that travels along the body.
  - All animals blink and breathe.
- **Drawing**: `DRAW[sp](g,a,st,C,S)` draws in local units, facing +x with feet at y=0. The transform adds direction, scale, spin, jump and roll. Emotes float above the animal's head.

## Audio (audio.js)
- `BEDS[scene]` sets the levels of the noise beds (wind, waves, city, leaves, water). Rain, rumble, pad chords (per season), chimes, crickets and raindrops are added on top.
- `call(name, pan, vol)` synthesizes the animal and object sounds: chirp, coo, gull, screech, hoot, croak, meow, bark, bleat, yip, squeak, whistle, rattle, click, splash, whale, thunder, rustle, boing, knock, bell, echo, wave, chime, alarm. Each is panned to the source's x position and capped at 40 voices.
- `start()` needs a user gesture, except in kiosk mode with `--autoplay-policy=no-user-gesture-required`.

## Monitor app.js
- **Screen id**: `?screen=` or localStorage.
- **Items**: `upsert` renders the item only if `layouts[SID].on`. A note is glass-styled markdown. A clock is digital (auto-fit with container units) or analog (SVG, monotonic hand angles, a progress arc for countdowns, an alarm hand) in one of the styles `glass|minimal|paper|neon|retro|mono|pastel`, with a font from `FONTS`. Text scales with `--sc = min(W,H)/800`. Ringing clocks shake and chime.
- **Other**: the battery (`navigator.getBattery`) shows at the top right and goes to the control. The page goes fullscreen automatically on load or the first gesture, unless the user exited it. There is also a wake lock, cursor auto-hide, and night-adaptive CSS variables.

## Control app.js
- **Screens card**: select, rename, scene, fps cap, copy link, forget, open a new one.
- **Items card**: add a note or clock, and toggle visibility on the selected screen.
- **Editor**: title, font, size, and markdown split/edit/preview. For clocks: mode, display, style chips, duration, alarm and armed, start/pause/reset/stop, and a live readout.
- **Layout card**: works on the selected screen. It has fast/fine/size pads (hold to repeat), px inputs, snaps, "all screens", and the ⛶ virtual screen (drag to move, drag the corner to resize, arrow keys).
- **Environment card**: time slider and presets, pause/speed, day and night minutes, season jumps, lock and lengths, weather mode and 🎲, **knobs** (drag, wheel or arrow keys; double-click or ↺ resets to the default), mute, HUD.
- **Status card**: season and time countdowns, the next weather change, and each screen's size, fps, sound and battery.

## Editing tips
- Rebuild after editing `web/`, because the files are embedded.
- **New scene**: add an object to `SCENES`, a `BEDS` entry in audio.js, the name to the `scenes` map in hub.go, and an `<option>` in the control.
- **New species**: add an `SP` entry and a `DRAW` function, then list the species in a scene's `life`.
- **New env field**: add it to `Env` and `fixEnv` in hub.go and to the control's UI and `setEnv`, then read it from `st.kn` or `env.env` on the monitor.
