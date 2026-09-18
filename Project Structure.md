# Project Structure

A Go server on **port 3000** serves two web apps and one WebSocket hub:
- **Control** (`/control/`): edits markdown notes, positions them on the monitor, and forces season, time, rain and sound.
- **Monitor** (`/monitor/`): an animated pastel four-season landscape on a canvas, with ambient Web Audio and the notes drawn on top.

The server owns all state. Clients render it and send intents.

```
main.go            flags, http/https prompt, routes, embeds web/, graceful shutdown
hub.go             state (notes + env), virtual clock, auto rain, WS clients, persistence
go.mod / go.sum    only dep: github.com/gorilla/websocket
certs/             cert.pem + key.pem for https mode (not included)
data/state.json    created at runtime: notes + env, saved every ~2s when changed and every 30s for the clock
web/               embedded into the binary via go:embed (rebuild after editing!)
  index.html       landing page with links
  shared/
    link.js        Link class: reconnecting WS + liveness watchdog; renderMarkdown() (marked + DOMPurify); escapeHTML()
    fonts.css      "Blex Mono" stack: local BlexMono Nerd Font first, bundled IBM Plex Mono woff2 as fallback -> var(--mono)
    marked.min.js, purify.min.js, fonts/*.woff2   vendored, so it works offline
  control/
    index.html     layout: top status bar | notes list | editor (split/edit/preview) | position + environment + status cards | #modal virtual screen
    style.css      glass UI (backdrop-filter), light/dark via prefers-color-scheme
    app.js         all control logic (see below)
  monitor/
    index.html     <canvas id=sky>, #notes layer, #hud, #off (reconnecting badge), #sound (tap to enable audio)
    style.css      glass notes; night-adaptive colors come from CSS vars --nbg/--nfg/--ndim/--nline set by app.js
    scene.js       class Scene: canvas renderer
    audio.js       class Ambience: procedural Web Audio
    app.js         glue: Link <-> Scene/Ambience/notes DOM
```

## Run
```
go build -o monitor . && ./monitor            # asks: 1) HTTP  2) HTTPS
./monitor -mode http|https -addr :3000 -cert ./certs/cert.pem -key ./certs/key.pem -data ./data/state.json
```
Without a terminal (for example under systemd), the server uses https when the certs exist and http otherwise. At startup it prints the control and monitor URLs for every LAN IP.

## Time model (hub.go)
- `Env.DayMs` is the virtual ms in a 20-minute cycle: `phase = DayMs/dayLen`, where 0 is sunrise (06:00) and 0.5 is sunset (18:00). The day half and the night half are 10 minutes each.
- `Env.SeasonMs` covers a 4-hour year: `season = floor(SeasonMs/1h) % 4` (0 spring, 1 summer, 2 autumn, 3 winter).
- `Hub.Run` ticks every 250ms and advances both clocks by `dt*Speed` unless `TimePaused`. `SeasonLocked` freezes only the season.
- Auto rain runs on the same virtual clock. `AutoTimerMs` counts down, then `rollRain` toggles: dry for 3–12 min, rain for 1.5–5 min, intensity 0.3–1.
- `RainMode` can be auto, on or off. When it is on, `RainIntensity` sets the strength.
- `envView()` builds the broadcast object: the Env fields plus derived `phase, isDay, hour, season, seasonName, seasonProgress, raining, intensity, dayLenMs, seasonLenMs, serverTime`.
- The env is broadcast to everyone every 1s and immediately after `env.set`.

## Notes
`Note{id,title,content,enabled,x,y,w,h,fontSize,z,created,updated}`
- `x, y, w, h` are **fractions (0..1) of the monitor viewport**, so notes keep their layout on any screen size. `clampNote` keeps each note fully on screen.
- A new note is enabled and placed at the bottom right (`w=.26 h=.3`).
- `fontSize` is in monitor CSS px. `z` is the stacking order, raised by `note.front`.

## WebSocket protocol (`/ws?role=control|monitor`, JSON)
Client → server:
| type | fields | who |
|---|---|---|
| `ping` | – | both (every 4s) |
| `screen` | `screen:{w,h,dpr}` | monitor (on open and resize) |
| `stats` | `fps, audio` | monitor (every 3s) |
| `note.create` | `title, content` | control |
| `note.update` | `id, patch:{title?,content?,enabled?,x?,y?,w?,h?,fontSize?}` | control |
| `note.front` / `note.delete` | `id` | control |
| `env.set` | `patch:{timePaused?,speed?,seasonLocked?,season?(jump),hour?(jump 0-24),rainMode?,rainIntensity?,volume?,muted?,showHud?,rerollRain?}` | control |

Server → client:
| type | fields |
|---|---|
| `welcome` | `id, role, notes[], env, clients[]` (full snapshot on connect) |
| `note.upsert` | `note, by` (sender id), `created?` |
| `note.remove` | `id, by` |
| `env` | `env` (EnvView) |
| `clients` | `clients[]{id,role,addr,ua,since,screen?,fps,audio}` (sent to controls only) |
| `kicked` | `reason` (to the old monitor when a newer one connects) |
| `pong` | `t` |

## Single monitor rule
There can be any number of controls but only **one monitor**. When a new monitor connects, `ServeWS` sends every existing monitor `{"type":"kicked"}`, removes it from the hub and closes it; the newest one wins. The kicked page calls `link.stop()` (so it doesn't reconnect) and `amb.stop()`, then shows the `#kicked` overlay, whose "take over again" button reloads the page.

## Connection lifecycle and cleanup
- Server: `readPump` sets a 30s read deadline that is extended by any message or pong, and the write pump pings every 10s. On a timeout or error, `remove()` deletes the client, closes `send` (which stops `writePump`, and that closes the socket) and rebroadcasts `clients`. A client that is too slow (its 64-message `send` buffer is full) gets its connection closed. `Shutdown` sends close frames and saves state.
- Client (`link.js`): if nothing arrives for 6s (the server sends env every 1s), `drop()` clears the timers, detaches the handlers, closes the socket and reconnects with backoff. Messages sent while offline are queued (50 max, pings and stats excluded). `pagehide` stops everything.

## control/app.js
- `notes` Map, `sel` (the selected id), `env`, `clients`. `screen()` returns the most recently connected monitor's size, or 1920×1080 by default.
- `patch(id, p)` updates the note locally and sends `note.update`. Text edits are throttled to 120ms. Incoming upserts don't overwrite the field you have focused.
- Position controls: fast and fine arrow pads (hold to repeat). Steps are in **monitor px** (`#fastStep`, `#fineStep`) and are converted to fractions. There are x/y/w/h px inputs and snap buttons.
- The virtual screen (`#modal` → `#stage`) is a rectangle with the monitor's aspect ratio. Notes appear as `.vn` boxes: drag to move, drag the `.rz` corner to resize (sent every 30ms). Keyboard: arrows move, Shift moves fast, Alt resizes.
- The environment card maps its controls directly to `env.set`. `renderStatus()` shows the season countdown, time, weather, auto-rain timer, sound, control count, and each monitor's size, fps and audio state.

## monitor/scene.js (Scene)
- `setEnv(e)` stores the snapshot and a timestamp. `frame(now, dt)` extrapolates the clocks locally and **eases** the visible phase, palette and rain toward the target, so control jumps animate smoothly. It returns a state object `{hour, day, light, night, rain, snow, wind, pal, season}` that the audio uses.
- `PAL[4]` holds the season palettes: colors plus numeric weights (`bare, snow, petals, leaves, fireflies, pollen, snowfall, wind`). `lerpPal` crossfades them during the last 7% of a season, and the weights drive particle rates, so transitions are continuous.
- `SKY` holds keyframes by hour (top/mid/horizon colors). `shade()` darkens land colors for night and rain.
- Draw order: sky, stars, sun/moon + glow, clouds (drawn on a separate layer, then tinted with source-atop), 3 hills with mist bands, trees (pine or round, with bare branches and snow driven by the palette), a lake (mirrored hills, sun/moon reflection, shimmer), particles (rain, snow, petals, leaves, fireflies, pollen, lake ripples), fog, storm tint, lightning flash (`onThunder` callback), vignette, grain.
- In winter, precipitation falls as snow (`pal.snow`).
- Everything is built in `resize()`, which runs automatically when the canvas size changes. It doesn't use `ctx.filter`, because Safari doesn't support it; soft shapes come from `puff()` radial gradients.

## monitor/audio.js (Ambience)
- `start()` must follow a user gesture, unless the browser is a kiosk with an autoplay flag. The graph: master → compressor → out, plus a convolver reverb send.
- Continuous layers: rain (hp/lp pink noise), rumble, wind (bandpass sweep), and a 4-voice pad whose chords are per season (`CHORDS`).
- Random events in `update(st, dt)`: wind chimes (pentatonic), birds (daytime spring/summer), crickets (night, weighted by `fireflies`), droplet plinks while raining, thunder (triggered by the scene).
- Volume and mute come from the env. `stop()` closes the AudioContext on `pagehide`.

## monitor/app.js
- `upsert` keeps one `.note` div per enabled note, positioned with `%` left/top/width/height, a `z-index` and a markdown body (re-rendered only when the content changes). Disabled or removed notes fade out.
- It sends `screen` on open and on resize (debounced 200ms), and `stats` every 3s. It sets the night-adaptive CSS vars and the HUD clock twice a second.
- Other behavior: the cursor hides after 2.5s, double-click toggles fullscreen, and a wake lock keeps the screen on.

## Editing tips
- After changing anything in `web/`, rebuild the binary, because the files are embedded.
- To add a new env control: add a field to `Env` and `EnvPatch`, handle it in `applyEnv` (hub.go), add a UI element and handler to the control's `app.js`/`index.html`, then read `env.<field>` in the monitor's `setEnv`.
- To add a new note field: add it to `Note`, `NotePatch` and `applyNote`, then handle it in the control's editor and the monitor's `upsert`.
