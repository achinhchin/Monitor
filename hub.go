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
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	dayLenMs    = 20 * 60 * 1000 // 10 min day + 10 min night
	seasonLenMs = 60 * 60 * 1000 // one season per hour
	yearLenMs   = 4 * seasonLenMs

	writeWait   = 10 * time.Second
	pongWait    = 30 * time.Second // connection dropped if nothing heard for this long
	pingEvery   = 10 * time.Second
	maxMsgBytes = 1 << 20
	sendBuffer  = 64
)

var seasonNames = []string{"spring", "summer", "autumn", "winter"}

// ───────────────────────────── data model ─────────────────────────────

type Note struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Content  string  `json:"content"`
	Enabled  bool    `json:"enabled"`
	X        float64 `json:"x"` // fractions of the monitor viewport (0..1)
	Y        float64 `json:"y"`
	W        float64 `json:"w"`
	H        float64 `json:"h"`
	FontSize float64 `json:"fontSize"` // monitor css px
	Z        int     `json:"z"`
	Created  int64   `json:"created"`
	Updated  int64   `json:"updated"`
}

type NotePatch struct {
	Title    *string  `json:"title"`
	Content  *string  `json:"content"`
	Enabled  *bool    `json:"enabled"`
	X        *float64 `json:"x"`
	Y        *float64 `json:"y"`
	W        *float64 `json:"w"`
	H        *float64 `json:"h"`
	FontSize *float64 `json:"fontSize"`
}

type Env struct {
	DayMs         float64 `json:"dayMs"`
	SeasonMs      float64 `json:"seasonMs"`
	TimePaused    bool    `json:"timePaused"`
	Speed         float64 `json:"speed"`
	SeasonLocked  bool    `json:"seasonLocked"`
	RainMode      string  `json:"rainMode"` // auto | on | off
	RainIntensity float64 `json:"rainIntensity"`
	Volume        float64 `json:"volume"`
	Muted         bool    `json:"muted"`
	ShowHud       bool    `json:"showHud"`

	AutoRaining   bool    `json:"autoRaining"`
	AutoIntensity float64 `json:"autoIntensity"`
	AutoTimerMs   float64 `json:"autoTimerMs"` // virtual ms until auto rain toggles
}

type EnvPatch struct {
	TimePaused    *bool    `json:"timePaused"`
	Speed         *float64 `json:"speed"`
	SeasonLocked  *bool    `json:"seasonLocked"`
	Season        *int     `json:"season"`
	Hour          *float64 `json:"hour"`
	RainMode      *string  `json:"rainMode"`
	RainIntensity *float64 `json:"rainIntensity"`
	Volume        *float64 `json:"volume"`
	Muted         *bool    `json:"muted"`
	ShowHud       *bool    `json:"showHud"`
	RerollRain    *bool    `json:"rerollRain"`
}

type EnvView struct {
	Env
	DayLenMs       int     `json:"dayLenMs"`
	SeasonLenMs    int     `json:"seasonLenMs"`
	Phase          float64 `json:"phase"` // 0 sunrise, .5 sunset
	IsDay          bool    `json:"isDay"`
	Hour           float64 `json:"hour"`
	Season         int     `json:"season"`
	SeasonName     string  `json:"seasonName"`
	SeasonProgress float64 `json:"seasonProgress"`
	Raining        bool    `json:"raining"`
	Intensity      float64 `json:"intensity"`
	ServerTime     int64   `json:"serverTime"`
}

type Screen struct {
	W   float64 `json:"w"`
	H   float64 `json:"h"`
	DPR float64 `json:"dpr"`
}

type ClientInfo struct {
	ID     string  `json:"id"`
	Role   string  `json:"role"`
	Addr   string  `json:"addr"`
	UA     string  `json:"ua"`
	Since  int64   `json:"since"`
	Screen *Screen `json:"screen,omitempty"`
	FPS    float64 `json:"fps,omitempty"`
	Audio  bool    `json:"audio"`
}

type Client struct {
	info ClientInfo
	conn *websocket.Conn
	send chan []byte
}

type persisted struct {
	Notes []*Note `json:"notes"`
	Env   Env     `json:"env"`
}

// ───────────────────────────── hub ─────────────────────────────

type Hub struct {
	mu       sync.Mutex
	clients  map[string]*Client
	notes    map[string]*Note
	env      Env
	dataPath string
	dirty    bool
	quit     chan struct{}
	upgrader websocket.Upgrader
}

func NewHub(dataPath string) *Hub {
	h := &Hub{
		clients:  map[string]*Client{},
		notes:    map[string]*Note{},
		dataPath: dataPath,
		quit:     make(chan struct{}),
		env: Env{
			Speed:         1,
			RainMode:      "auto",
			RainIntensity: 0.6,
			Volume:        0.6,
			ShowHud:       true,
			DayMs:         dayLenMs * 0.12,
			AutoTimerMs:   randRange(2, 6) * 60_000,
		},
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin:     func(*http.Request) bool { return true },
		},
	}
	h.load()
	return h
}

func (h *Hub) load() {
	b, err := os.ReadFile(h.dataPath)
	if err != nil {
		return
	}
	var p persisted
	if err := json.Unmarshal(b, &p); err != nil {
		log.Printf("state file unreadable, starting fresh: %v", err)
		return
	}
	for _, n := range p.Notes {
		if n != nil && n.ID != "" {
			clampNote(n)
			h.notes[n.ID] = n
		}
	}
	if p.Env.Speed > 0 {
		h.env = p.Env
	}
	log.Printf("loaded %d notes from %s", len(h.notes), h.dataPath)
}

func (h *Hub) save() {
	h.mu.Lock()
	p := persisted{Notes: h.sortedNotes(), Env: h.env}
	h.dirty = false
	h.mu.Unlock()

	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(h.dataPath), 0o755)
	tmp := h.dataPath + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err == nil {
		_ = os.Rename(tmp, h.dataPath)
	}
}

// Run advances the virtual clock, rolls the rain dice, broadcasts the
// environment once a second and flushes state to disk.
func (h *Hub) Run() {
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	last := time.Now()
	n := 0
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
				h.broadcastEnvLocked()
			}
			saveNow := h.dirty || n%120 == 0 // notes changed, or every 30s for the clock
			h.mu.Unlock()

			if saveNow && n%8 == 0 {
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
		_ = c.conn.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutdown"),
			time.Now().Add(time.Second))
		_ = c.conn.Close()
	}
	h.mu.Unlock()
}

func (h *Hub) advance(dt float64) {
	e := &h.env
	if e.TimePaused {
		return
	}
	v := dt * e.Speed
	e.DayMs = math.Mod(e.DayMs+v, dayLenMs)
	if !e.SeasonLocked {
		e.SeasonMs = math.Mod(e.SeasonMs+v, yearLenMs)
	}
	e.AutoTimerMs -= v
	if e.AutoTimerMs <= 0 {
		h.rollRain(!e.AutoRaining)
	}
}

func (h *Hub) rollRain(raining bool) {
	e := &h.env
	e.AutoRaining = raining
	if raining {
		e.AutoIntensity = randRange(0.3, 1)
		e.AutoTimerMs = randRange(1.5, 5) * 60_000
	} else {
		e.AutoTimerMs = randRange(3, 12) * 60_000
	}
}

func (h *Hub) envView() EnvView {
	e := h.env
	phase := e.DayMs / dayLenMs
	season := int(e.SeasonMs/seasonLenMs) % 4
	v := EnvView{
		Env:            e,
		DayLenMs:       dayLenMs,
		SeasonLenMs:    seasonLenMs,
		Phase:          phase,
		IsDay:          phase < 0.5,
		Hour:           math.Mod(6+phase*24, 24),
		Season:         season,
		SeasonName:     seasonNames[season],
		SeasonProgress: math.Mod(e.SeasonMs, seasonLenMs) / seasonLenMs,
		ServerTime:     time.Now().UnixMilli(),
	}
	switch e.RainMode {
	case "on":
		v.Raining, v.Intensity = true, e.RainIntensity
	case "off":
		v.Raining = false
	default:
		v.Raining, v.Intensity = e.AutoRaining, e.AutoIntensity
	}
	if !v.Raining {
		v.Intensity = 0
	}
	return v
}

func (h *Hub) applyEnv(p EnvPatch) {
	e := &h.env
	if p.TimePaused != nil {
		e.TimePaused = *p.TimePaused
	}
	if p.Speed != nil {
		e.Speed = clamp(*p.Speed, 0.1, 600)
	}
	if p.SeasonLocked != nil {
		e.SeasonLocked = *p.SeasonLocked
	}
	if p.Season != nil {
		s := ((*p.Season % 4) + 4) % 4
		e.SeasonMs = float64(s)*seasonLenMs + seasonLenMs*0.02
	}
	if p.Hour != nil {
		hr := math.Mod(*p.Hour, 24)
		e.DayMs = math.Mod((hr-6)/24+1, 1) * dayLenMs
	}
	if p.RainMode != nil {
		switch *p.RainMode {
		case "auto", "on", "off":
			e.RainMode = *p.RainMode
		}
	}
	if p.RainIntensity != nil {
		e.RainIntensity = clamp(*p.RainIntensity, 0.05, 1)
	}
	if p.Volume != nil {
		e.Volume = clamp(*p.Volume, 0, 1)
	}
	if p.Muted != nil {
		e.Muted = *p.Muted
	}
	if p.ShowHud != nil {
		e.ShowHud = *p.ShowHud
	}
	if p.RerollRain != nil && *p.RerollRain {
		h.rollRain(!e.AutoRaining)
	}
	h.dirty = true
}

// ───────────────────────────── websocket ─────────────────────────────

type inbound struct {
	Type   string          `json:"type"`
	ID     string          `json:"id"`
	Patch  json.RawMessage `json:"patch"`
	Screen *Screen         `json:"screen"`
	FPS    float64         `json:"fps"`
	Audio  *bool           `json:"audio"`
	Title  string          `json:"title"`
	Body   string          `json:"content"`
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	role := r.URL.Query().Get("role")
	if role != "control" && role != "monitor" {
		http.Error(w, "role must be control or monitor", http.StatusBadRequest)
		return
	}
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &Client{
		conn: conn,
		send: make(chan []byte, sendBuffer),
		info: ClientInfo{
			ID:    newID(),
			Role:  role,
			Addr:  r.RemoteAddr,
			UA:    r.UserAgent(),
			Since: time.Now().UnixMilli(),
		},
	}

	h.mu.Lock()
	if role == "monitor" { // single monitor: newest wins, older ones are kicked
		kick := mustJSON(map[string]any{"type": "kicked", "reason": "another monitor connected"})
		for id, o := range h.clients {
			if o.info.Role == "monitor" {
				h.sendLocked(o, kick)
				delete(h.clients, id)
				close(o.send) // writePump flushes the kick, then sends close
				log.Printf("x monitor %s replaced", id)
			}
		}
	}
	h.clients[c.info.ID] = c
	welcome := mustJSON(map[string]any{
		"type":    "welcome",
		"id":      c.info.ID,
		"role":    role,
		"notes":   h.sortedNotes(),
		"env":     h.envView(),
		"clients": h.clientList(),
	})
	c.send <- welcome
	h.broadcastClientsLocked()
	h.mu.Unlock()
	log.Printf("+ %s %s (%s)", role, c.info.ID, c.info.Addr)

	go h.writePump(c)
	h.readPump(c)
}

func (h *Hub) readPump(c *Client) {
	defer h.remove(c)
	c.conn.SetReadLimit(maxMsgBytes)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return // timeout, close frame or broken pipe → cleanup in remove()
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		var m inbound
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		h.handle(c, m)
	}
}

func (h *Hub) writePump(c *Client) {
	ping := time.NewTicker(pingEvery)
	defer func() {
		ping.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ping.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// remove drops a client from the hub and releases its resources. Safe to
// call more than once.
func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c.info.ID]; ok {
		delete(h.clients, c.info.ID)
		close(c.send) // ends writePump, which closes the socket
		h.broadcastClientsLocked()
		log.Printf("- %s %s", c.info.Role, c.info.ID)
	}
	h.mu.Unlock()
	_ = c.conn.Close()
}

func (h *Hub) handle(c *Client, m inbound) {
	h.mu.Lock()
	defer h.mu.Unlock()

	switch m.Type {
	case "ping":
		h.sendLocked(c, mustJSON(map[string]any{"type": "pong", "t": time.Now().UnixMilli()}))

	case "screen":
		if m.Screen != nil && m.Screen.W > 0 && m.Screen.H > 0 {
			c.info.Screen = m.Screen
			h.broadcastClientsLocked()
		}

	case "stats":
		c.info.FPS = m.FPS
		if m.Audio != nil {
			c.info.Audio = *m.Audio
		}
		h.broadcastClientsLocked()

	case "note.create":
		if c.info.Role != "control" {
			return
		}
		now := time.Now().UnixMilli()
		n := &Note{
			ID: newID(), Title: m.Title, Content: m.Body, Enabled: true,
			W: 0.26, H: 0.3, FontSize: 16, Z: h.maxZ() + 1,
			Created: now, Updated: now,
		}
		if n.Title == "" {
			n.Title = "Untitled"
		}
		n.X, n.Y = 1-n.W-0.015, 1-n.H-0.025 // bottom right
		h.notes[n.ID] = n
		h.dirty = true
		h.broadcastLocked(mustJSON(map[string]any{"type": "note.upsert", "note": n, "by": c.info.ID, "created": true}))

	case "note.update":
		if c.info.Role != "control" {
			return
		}
		n, ok := h.notes[m.ID]
		if !ok {
			return
		}
		var p NotePatch
		if json.Unmarshal(m.Patch, &p) != nil {
			return
		}
		applyNote(n, p)
		n.Updated = time.Now().UnixMilli()
		h.dirty = true
		h.broadcastLocked(mustJSON(map[string]any{"type": "note.upsert", "note": n, "by": c.info.ID}))

	case "note.front":
		if n, ok := h.notes[m.ID]; ok && c.info.Role == "control" {
			n.Z = h.maxZ() + 1
			h.dirty = true
			h.broadcastLocked(mustJSON(map[string]any{"type": "note.upsert", "note": n, "by": c.info.ID}))
		}

	case "note.delete":
		if _, ok := h.notes[m.ID]; ok && c.info.Role == "control" {
			delete(h.notes, m.ID)
			h.dirty = true
			h.broadcastLocked(mustJSON(map[string]any{"type": "note.remove", "id": m.ID, "by": c.info.ID}))
		}

	case "env.set":
		if c.info.Role != "control" {
			return
		}
		var p EnvPatch
		if json.Unmarshal(m.Patch, &p) != nil {
			return
		}
		h.applyEnv(p)
		h.broadcastEnvLocked()
	}
}

// ───────────────────────────── broadcast helpers (hold h.mu) ─────────────────────────────

func (h *Hub) sendLocked(c *Client, msg []byte) {
	select {
	case c.send <- msg:
	default:
		// client cannot keep up: drop it, the read pump will clean up
		go c.conn.Close()
	}
}

func (h *Hub) broadcastLocked(msg []byte) {
	for _, c := range h.clients {
		h.sendLocked(c, msg)
	}
}

func (h *Hub) broadcastEnvLocked() {
	h.broadcastLocked(mustJSON(map[string]any{"type": "env", "env": h.envView()}))
}

func (h *Hub) broadcastClientsLocked() {
	msg := mustJSON(map[string]any{"type": "clients", "clients": h.clientList()})
	for _, c := range h.clients {
		if c.info.Role == "control" {
			h.sendLocked(c, msg)
		}
	}
}

func (h *Hub) clientList() []ClientInfo {
	out := make([]ClientInfo, 0, len(h.clients))
	for _, c := range h.clients {
		out = append(out, c.info)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Since < out[j].Since })
	return out
}

func (h *Hub) sortedNotes() []*Note {
	out := make([]*Note, 0, len(h.notes))
	for _, n := range h.notes {
		out = append(out, n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created < out[j].Created })
	return out
}

func (h *Hub) maxZ() int {
	z := 0
	for _, n := range h.notes {
		if n.Z > z {
			z = n.Z
		}
	}
	return z
}

// ───────────────────────────── utils ─────────────────────────────

func applyNote(n *Note, p NotePatch) {
	if p.Title != nil {
		n.Title = *p.Title
	}
	if p.Content != nil {
		n.Content = *p.Content
	}
	if p.Enabled != nil {
		n.Enabled = *p.Enabled
	}
	if p.W != nil {
		n.W = *p.W
	}
	if p.H != nil {
		n.H = *p.H
	}
	if p.X != nil {
		n.X = *p.X
	}
	if p.Y != nil {
		n.Y = *p.Y
	}
	if p.FontSize != nil {
		n.FontSize = *p.FontSize
	}
	clampNote(n)
}

func clampNote(n *Note) {
	n.W = clamp(n.W, 0.02, 1)
	n.H = clamp(n.H, 0.02, 1)
	n.X = clamp(n.X, 0, 1-n.W)
	n.Y = clamp(n.Y, 0, 1-n.H)
	if n.FontSize == 0 {
		n.FontSize = 16
	}
	n.FontSize = clamp(n.FontSize, 6, 120)
}

func clamp(v, lo, hi float64) float64 {
	if math.IsNaN(v) {
		return lo
	}
	return math.Max(lo, math.Min(hi, v))
}

func randRange(a, b float64) float64 { return a + mrand.Float64()*(b-a) }

func newID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
