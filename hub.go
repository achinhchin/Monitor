package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	mrand "math/rand/v2"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait   = 10 * time.Second
	pongWait    = 30 * time.Second
	pingEvery   = 10 * time.Second
	maxMsgBytes = 1 << 20
	sendBuffer  = 128
	minute      = 60_000.0
)

var (
	seasonNames = []string{"spring", "summer", "autumn", "winter"}
	scenes      = map[string]bool{"meadow": true, "forest": true, "mountain": true, "beach": true, "city": true}
	knobDefs    = map[string]float64{"animals": .5, "rain": .5, "wind": .5, "volume": .6}
	screenIDRe  = regexp.MustCompile(`^[\w-]{1,40}$`)
)

type Layout struct {
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	W  float64 `json:"w"`
	H  float64 `json:"h"`
	On bool    `json:"on"`
}

type Clock struct {
	Mode     string `json:"mode"`    // clock | timer | countdown | alarm
	Display  string `json:"display"` // digital | analog
	Style    string `json:"style"`
	Duration int64  `json:"duration"` // countdown ms
	Running  bool   `json:"running"`  // timer/countdown running, alarm armed
	StartAt  int64  `json:"startAt"`
	Acc      int64  `json:"acc"`
	Alarm    string `json:"alarm"` // HH:MM server local time
	Ringing  bool   `json:"ringing"`
	RingAt   int64  `json:"ringAt"`
	Fired    string `json:"fired"`
}

type Item struct {
	ID       string             `json:"id"`
	Kind     string             `json:"kind"` // note | clock
	Title    string             `json:"title"`
	Content  string             `json:"content"`
	Font     string             `json:"font"`
	FontSize float64            `json:"fontSize"`
	Z        int                `json:"z"`
	Clock    *Clock             `json:"clock,omitempty"`
	L        map[string]*Layout `json:"layouts"`
	Created  int64              `json:"created"`
}

type Battery struct {
	Level    float64 `json:"level"`
	Charging bool    `json:"charging"`
}

type Screen struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Scene    string   `json:"scene"`
	FpsCap   int      `json:"fpsCap"` // 0 = display refresh rate
	W        float64  `json:"w"`
	H        float64  `json:"h"`
	DPR      float64  `json:"dpr"`
	Online   bool     `json:"online"`
	FPS      float64  `json:"fps"`
	Audio    bool     `json:"audio"`
	Battery  *Battery `json:"battery"`
	LastSeen int64    `json:"lastSeen"`
}

type Weather struct {
	State     string  `json:"state"` // clear | cloudy | rain | storm
	Intensity float64 `json:"intensity"`
	Cloud     float64 `json:"cloud"`
	Left      float64 `json:"left"` // virtual ms until next change
}

type Env struct {
	DayMs        float64            `json:"dayMs"`
	YearMs       float64            `json:"yearMs"`
	DayMin       float64            `json:"dayMin"`
	NightMin     float64            `json:"nightMin"`
	SeasonMin    [4]float64         `json:"seasonMin"`
	Paused       bool               `json:"paused"`
	Speed        float64            `json:"speed"`
	SeasonLocked bool               `json:"seasonLocked"`
	WeatherMode  string             `json:"weatherMode"` // auto | clear | cloudy | rain | storm
	Knobs        map[string]float64 `json:"knobs"`
	Muted        bool               `json:"muted"`
	ShowHud      bool               `json:"showHud"`
	W            Weather            `json:"w"`
}

type Client struct {
	id, role, screen string
	conn             *websocket.Conn
	send             chan []byte
}

type persisted struct {
	Items   []*Item   `json:"items"`
	Screens []*Screen `json:"screens"`
	Env     Env       `json:"env"`
}

type Hub struct {
	mu       sync.Mutex
	clients  map[string]*Client
	items    map[string]*Item
	screens  map[string]*Screen
	env      Env
	dataPath string
	dirty    bool
	quit     chan struct{}
	up       websocket.Upgrader
}

func NewHub(dataPath string) *Hub {
	h := &Hub{
		clients: map[string]*Client{}, items: map[string]*Item{}, screens: map[string]*Screen{},
		dataPath: dataPath, quit: make(chan struct{}),
		env: Env{DayMin: 10, NightMin: 10, SeasonMin: [4]float64{60, 60, 60, 60}, Speed: 1, WeatherMode: "auto",
			ShowHud: true, Knobs: map[string]float64{}, W: Weather{State: "clear", Cloud: .3, Left: 5 * minute}},
		up: websocket.Upgrader{ReadBufferSize: 4096, WriteBufferSize: 4096, CheckOrigin: func(*http.Request) bool { return true }},
	}
	h.env.DayMs = h.cycle() * .06
	h.load()
	for k, v := range knobDefs {
		if _, ok := h.env.Knobs[k]; !ok {
			h.env.Knobs[k] = v
		}
	}
	return h
}

func (h *Hub) load() {
	b, err := os.ReadFile(h.dataPath)
	if err != nil {
		return
	}
	var p persisted
	if err := json.Unmarshal(b, &p); err != nil {
		log.Printf("state unreadable, starting fresh: %v", err)
		return
	}
	for _, it := range p.Items {
		if it != nil && it.ID != "" {
			fixItem(it)
			h.items[it.ID] = it
		}
	}
	for _, s := range p.Screens {
		if s != nil && s.ID != "" {
			s.Online = false
			h.screens[s.ID] = s
		}
	}
	if p.Env.Speed > 0 {
		h.env = p.Env
		if h.env.Knobs == nil {
			h.env.Knobs = map[string]float64{}
		}
		fixEnv(&h.env)
	}
	log.Printf("loaded %d items, %d screens", len(h.items), len(h.screens))
}

func (h *Hub) save() {
	h.mu.Lock()
	p := persisted{Items: h.sortedItems(), Screens: h.screenList(), Env: h.env}
	b, err := json.MarshalIndent(p, "", " ")
	h.dirty = false
	h.mu.Unlock()
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(h.dataPath), 0o755)
	if os.WriteFile(h.dataPath+".tmp", b, 0o644) == nil {
		_ = os.Rename(h.dataPath+".tmp", h.dataPath)
	}
}

func (h *Hub) Run() {
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	last, n := time.Now(), 0
	for {
		select {
		case <-h.quit:
			return
		case now := <-tick.C:
			dt := float64(now.Sub(last).Milliseconds())
			last = now
			n++
			h.mu.Lock()
			h.advance(dt)
			if n%4 == 0 {
				h.checkClocks(now)
				h.bcast(h.envMsg())
			}
			save := h.dirty || n%120 == 0
			h.mu.Unlock()
			if save && n%8 == 0 {
				h.save()
			}
		}
	}
}

func (h *Hub) Shutdown() {
	close(h.quit)
	h.save()
	h.mu.Lock()
	for _, c := range h.clients {
		_ = c.conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseGoingAway, "shutdown"), time.Now().Add(time.Second))
		_ = c.conn.Close()
	}
	h.mu.Unlock()
}

// ── time & weather ──

func (h *Hub) cycle() float64 { return (h.env.DayMin + h.env.NightMin) * minute }
func (h *Hub) year() float64 {
	s := 0.0
	for _, m := range h.env.SeasonMin {
		s += m
	}
	return s * minute
}

// phase: 0 sunrise, .5 sunset, day and night halves stretched to their own lengths
func (h *Hub) phase() float64 {
	dl, t := h.env.DayMin*minute, h.env.DayMs
	if t < dl {
		return .5 * t / dl
	}
	return .5 + .5*(t-dl)/(h.env.NightMin*minute)
}
func (h *Hub) setPhase(p float64) {
	p = math.Mod(p+1, 1)
	if p < .5 {
		h.env.DayMs = p * 2 * h.env.DayMin * minute
	} else {
		h.env.DayMs = (h.env.DayMin + (p-.5)*2*h.env.NightMin) * minute
	}
}
func (h *Hub) season() (int, float64) {
	t := h.env.YearMs
	for i, m := range h.env.SeasonMin {
		if l := m * minute; t < l {
			return i, t / l
		} else {
			t -= l
		}
	}
	return 3, 1
}
func (h *Hub) setSeason(i int, prog float64) {
	t := 0.0
	for j := 0; j < i; j++ {
		t += h.env.SeasonMin[j] * minute
	}
	h.env.YearMs = t + prog*h.env.SeasonMin[i]*minute
}

func (h *Hub) advance(dt float64) {
	e := &h.env
	if e.Paused {
		return
	}
	v := dt * e.Speed
	e.DayMs = math.Mod(e.DayMs+v, h.cycle())
	if !e.SeasonLocked {
		e.YearMs = math.Mod(e.YearMs+v, h.year())
	}
	if e.W.Left -= v; e.W.Left <= 0 {
		h.nextWeather()
	}
}

// Markov weather: clear → cloudy → rain ⇄ storm, rain knob biases toward wet
func (h *Hub) nextWeather() {
	w, k := &h.env.W, h.env.Knobs["rain"]
	next := "cloudy"
	switch w.State {
	case "cloudy":
		if mrand.Float64() < .1+.8*k {
			next = "rain"
		} else {
			next = "clear"
		}
	case "rain":
		if r := mrand.Float64(); r < .35*k {
			next = "storm"
		} else if r < .6 {
			next = "cloudy"
		} else {
			next = "clear"
		}
	case "storm":
		next = "rain"
	}
	w.State = next
	switch next {
	case "clear":
		w.Cloud, w.Intensity, w.Left = rr(.05, .45), 0, rr(4, 14)*(1.6-k)*minute
	case "cloudy":
		w.Cloud, w.Intensity, w.Left = rr(.55, .85), 0, rr(2, 7)*minute
	case "rain":
		w.Cloud, w.Intensity, w.Left = rr(.8, .95), rr(.3, .75), rr(2, 6)*(.5+k)*minute
	case "storm":
		w.Cloud, w.Intensity, w.Left = 1, rr(.8, 1), rr(1, 3)*minute
	}
}

func (h *Hub) envView() map[string]any {
	e := h.env
	p := h.phase()
	si, sp := h.season()
	w := e.W
	switch e.WeatherMode {
	case "clear":
		w = Weather{State: "clear", Cloud: .2}
	case "cloudy":
		w = Weather{State: "cloudy", Cloud: .75}
	case "rain":
		w = Weather{State: "rain", Cloud: .9, Intensity: .6}
	case "storm":
		w = Weather{State: "storm", Cloud: 1, Intensity: 1}
	}
	return map[string]any{
		"env": e, "phase": p, "isDay": p < .5, "hour": math.Mod(6+p*24, 24),
		"season": si, "seasonName": seasonNames[si], "seasonProgress": sp, "seasonLeftMs": (1 - sp) * e.SeasonMin[si] * minute,
		"weather": w, "cycleMs": h.cycle(), "serverTime": time.Now().UnixMilli(), "knobDefs": knobDefs,
	}
}

func (h *Hub) envMsg() []byte { return mustJSON(map[string]any{"type": "env", "env": h.envView()}) }

func (h *Hub) applyEnv(raw json.RawMessage) {
	var sp struct {
		Season *int     `json:"season"`
		Hour   *float64 `json:"hour"`
		Reroll bool     `json:"reroll"`
	}
	if json.Unmarshal(raw, &sp) != nil {
		return
	}
	p0 := h.phase()
	s0, sp0 := h.season()
	w := h.env.W
	_ = json.Unmarshal(raw, &h.env)
	h.env.W = w
	fixEnv(&h.env)
	h.setPhase(p0)
	h.setSeason(s0, sp0)
	if sp.Season != nil {
		h.setSeason(((*sp.Season%4)+4)%4, .02)
	}
	if sp.Hour != nil {
		h.setPhase((*sp.Hour - 6) / 24)
	}
	if sp.Reroll {
		h.nextWeather()
	}
	h.dirty = true
}

func fixEnv(e *Env) {
	e.DayMin, e.NightMin = clamp(e.DayMin, .5, 720), clamp(e.NightMin, .5, 720)
	for i := range e.SeasonMin {
		e.SeasonMin[i] = clamp(e.SeasonMin[i], 1, 10080)
	}
	e.Speed = clamp(e.Speed, .1, 600)
	for k, v := range e.Knobs {
		e.Knobs[k] = clamp(v, 0, 1)
	}
	switch e.WeatherMode {
	case "auto", "clear", "cloudy", "rain", "storm":
	default:
		e.WeatherMode = "auto"
	}
}

// ── clocks ──

func (h *Hub) checkClocks(now time.Time) {
	ms := now.UnixMilli()
	for _, it := range h.items {
		c := it.Clock
		if c == nil {
			continue
		}
		changed := false
		if c.Mode == "countdown" && c.Running && c.Acc+ms-c.StartAt >= c.Duration {
			c.Running, c.Acc, c.Ringing, c.RingAt, changed = false, c.Duration, true, ms, true
		}
		if key := now.Format("2006-01-02 ") + c.Alarm; c.Mode == "alarm" && c.Running && now.Format("15:04") == c.Alarm && c.Fired != key {
			c.Fired, c.Ringing, c.RingAt, changed = key, true, ms, true
		}
		if c.Ringing && ms-c.RingAt > 3*60_000 {
			c.Ringing, changed = false, true
		}
		if changed {
			h.dirty = true
			h.bcast(itemMsg(it, ""))
		}
	}
}

func clockAct(c *Clock, act string) {
	now := time.Now().UnixMilli()
	switch act {
	case "start":
		if c.Mode == "countdown" && c.Acc >= c.Duration {
			c.Acc = 0
		}
		if !c.Running {
			c.Running, c.StartAt = true, now
		}
	case "pause":
		if c.Running && c.Mode != "alarm" {
			c.Acc += now - c.StartAt
		}
		c.Running = false
	case "reset":
		c.Acc, c.StartAt = 0, now
		if c.Mode != "alarm" {
			c.Running = false
		}
	}
	c.Ringing = false
}

// ── websocket ──

type inbound struct {
	Type   string          `json:"type"`
	ID     string          `json:"id"`
	Screen string          `json:"screen"`
	Kind   string          `json:"kind"`
	Act    string          `json:"act"`
	Patch  json.RawMessage `json:"patch"`
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	role, sid := q.Get("role"), q.Get("screen")
	if role != "control" && !(role == "monitor" && screenIDRe.MatchString(sid)) {
		http.Error(w, "role=control or role=monitor&screen=<id>", http.StatusBadRequest)
		return
	}
	conn, err := h.up.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &Client{id: newID(), role: role, screen: sid, conn: conn, send: make(chan []byte, sendBuffer)}

	h.mu.Lock()
	if role == "monitor" {
		for id, o := range h.clients { // one live connection per screen id: newest wins
			if o.screen == sid {
				h.sendLocked(o, mustJSON(map[string]any{"type": "kicked"}))
				delete(h.clients, id)
				close(o.send)
			}
		}
		s := h.screens[sid]
		if s == nil {
			s = &Screen{ID: sid, Name: sid, Scene: "meadow"}
			h.screens[sid] = s
			for _, it := range h.items {
				it.L[sid] = defLayout(it.Kind)
			}
		}
		s.Online, s.LastSeen = true, time.Now().UnixMilli()
		h.dirty = true
	}
	h.clients[c.id] = c
	c.send <- mustJSON(map[string]any{"type": "welcome", "id": c.id, "items": h.sortedItems(), "screens": h.screenList(), "env": h.envView()})
	h.bcastScreens()
	h.mu.Unlock()
	log.Printf("+ %s %s %s", role, sid, r.RemoteAddr)

	go h.writePump(c)
	h.readPump(c)
}

func (h *Hub) readPump(c *Client) {
	defer h.remove(c)
	c.conn.SetReadLimit(maxMsgBytes)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { return c.conn.SetReadDeadline(time.Now().Add(pongWait)) })
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		var m inbound
		if json.Unmarshal(data, &m) == nil {
			h.handle(c, m)
		}
	}
}

func (h *Hub) writePump(c *Client) {
	ping := time.NewTicker(pingEvery)
	defer func() { ping.Stop(); _ = c.conn.Close() }()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if c.conn.WriteMessage(websocket.TextMessage, msg) != nil {
				return
			}
		case <-ping.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if c.conn.WriteMessage(websocket.PingMessage, nil) != nil {
				return
			}
		}
	}
}

func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c.id]; ok {
		delete(h.clients, c.id)
		close(c.send)
		if s := h.screens[c.screen]; s != nil && c.role == "monitor" {
			s.Online, s.LastSeen = false, time.Now().UnixMilli()
			h.bcastScreens()
		}
		log.Printf("- %s %s", c.role, c.screen)
	}
	h.mu.Unlock()
	_ = c.conn.Close()
}

func (h *Hub) handle(c *Client, m inbound) {
	h.mu.Lock()
	defer h.mu.Unlock()
	ctl := c.role == "control"
	it := h.items[m.ID]

	switch {
	case m.Type == "ping":
		h.sendLocked(c, []byte(`{"type":"pong"}`))

	case m.Type == "stats" && c.role == "monitor":
		if s := h.screens[c.screen]; s != nil {
			name, scene, fc := s.Name, s.Scene, s.FpsCap
			_ = json.Unmarshal(m.Patch, s) // w,h,dpr,fps,audio,battery
			s.ID, s.Name, s.Scene, s.FpsCap, s.Online, s.LastSeen = c.screen, name, scene, fc, true, time.Now().UnixMilli()
			h.bcastScreens()
		}

	case !ctl:
		return

	case m.Type == "item.create":
		it = &Item{ID: newID(), Kind: "note", Title: "Note", Content: "# Hello\n\nWrite **markdown** here.", Font: "blex", FontSize: 16,
			Z: h.maxZ() + 1, Created: time.Now().UnixMilli(), L: map[string]*Layout{}}
		if m.Kind == "clock" {
			it.Kind, it.Title, it.Content, it.FontSize = "clock", "Clock", "", 28
			it.Clock = &Clock{Mode: "clock", Display: "digital", Style: "glass", Duration: 5 * 60_000, Alarm: "07:00"}
		}
		for sid := range h.screens {
			it.L[sid] = defLayout(it.Kind)
		}
		h.items[it.ID] = it
		h.dirty = true
		h.bcast(itemMsg(it, c.id))

	case m.Type == "env.set":
		h.applyEnv(m.Patch)
		h.bcast(h.envMsg())
	case m.Type == "screen.update":
		if s := h.screens[m.Screen]; s != nil && ctl {
			var p struct {
				Name   *string `json:"name"`
				Scene  *string `json:"scene"`
				FpsCap *int    `json:"fpsCap"`
			}
			_ = json.Unmarshal(m.Patch, &p)
			if p.Name != nil && *p.Name != "" {
				s.Name = *p.Name
			}
			if p.Scene != nil && scenes[*p.Scene] {
				s.Scene = *p.Scene
			}
			if p.FpsCap != nil {
				s.FpsCap = max(0, min(240, *p.FpsCap))
			}
			h.dirty = true
			h.bcastScreens()
		}
	case m.Type == "screen.delete":
		if s := h.screens[m.Screen]; s != nil && ctl && !s.Online {
			delete(h.screens, s.ID)
			for _, it := range h.items {
				delete(it.L, s.ID)
			}
			h.dirty = true
			h.bcastScreens()
		}

	case it == nil:
		return

	case m.Type == "item.update":
		id, kind, l, clk := it.ID, it.Kind, it.L, it.Clock
		_ = json.Unmarshal(m.Patch, it)
		it.ID, it.Kind, it.L = id, kind, l
		if kind == "clock" && it.Clock == nil {
			it.Clock = clk
		}
		fixItem(it)
		h.dirty = true
		h.bcast(itemMsg(it, c.id))

	case m.Type == "clock.act" && it.Clock != nil:
		clockAct(it.Clock, m.Act)
		h.dirty = true
		h.bcast(itemMsg(it, c.id))

	case m.Type == "layout.set":
		sids := []string{m.Screen}
		if m.Screen == "*" {
			sids = sids[:0]
			for sid := range h.screens {
				sids = append(sids, sid)
			}
		}
		for _, sid := range sids {
			if l := it.L[sid]; l != nil {
				_ = json.Unmarshal(m.Patch, l)
				clampLayout(l)
			}
		}
		h.dirty = true
		h.bcast(itemMsg(it, c.id))

	case m.Type == "item.front":
		it.Z = h.maxZ() + 1
		h.bcast(itemMsg(it, c.id))

	case m.Type == "item.delete":
		delete(h.items, it.ID)
		h.dirty = true
		h.bcast(mustJSON(map[string]any{"type": "item.remove", "id": it.ID}))
	}

}

// ── helpers (hold h.mu) ──

func (h *Hub) sendLocked(c *Client, msg []byte) {
	select {
	case c.send <- msg:
	default:
		go c.conn.Close() // too slow: drop, readPump cleans up
	}
}
func (h *Hub) bcast(msg []byte) {
	for _, c := range h.clients {
		h.sendLocked(c, msg)
	}
}
func (h *Hub) bcastScreens() {
	h.bcast(mustJSON(map[string]any{"type": "screens", "screens": h.screenList()}))
}

func (h *Hub) screenList() []*Screen {
	out := make([]*Screen, 0, len(h.screens))
	for _, s := range h.screens {
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
func (h *Hub) sortedItems() []*Item {
	out := make([]*Item, 0, len(h.items))
	for _, it := range h.items {
		out = append(out, it)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created < out[j].Created })
	return out
}
func (h *Hub) maxZ() int {
	z := 0
	for _, it := range h.items {
		z = max(z, it.Z)
	}
	return z
}

func itemMsg(it *Item, by string) []byte {
	return mustJSON(map[string]any{"type": "item.upsert", "item": it, "by": by})
}

func defLayout(kind string) *Layout {
	if kind == "clock" {
		return &Layout{X: .985 - .2, Y: .08, W: .2, H: .16, On: true}
	}
	return &Layout{X: .985 - .26, Y: .975 - .3, W: .26, H: .3, On: true}
}

func fixItem(it *Item) {
	if it.L == nil {
		it.L = map[string]*Layout{}
	}
	for _, l := range it.L {
		clampLayout(l)
	}
	if it.FontSize == 0 {
		it.FontSize = 16
	}
	it.FontSize = clamp(it.FontSize, 6, 200)
	if c := it.Clock; c != nil {
		c.Duration = int64(clamp(float64(c.Duration), 1000, 100*3600_000))
	}
}

func clampLayout(l *Layout) {
	l.W, l.H = clamp(l.W, .02, 1), clamp(l.H, .02, 1)
	l.X, l.Y = clamp(l.X, 0, 1-l.W), clamp(l.Y, 0, 1-l.H)
}

func clamp(v, lo, hi float64) float64 {
	if math.IsNaN(v) {
		return lo
	}
	return math.Max(lo, math.Min(hi, v))
}
func rr(a, b float64) float64 { return a + mrand.Float64()*(b-a) }
func newID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }
