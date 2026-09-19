package main

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite" // pure Go, no cgo
)

const schema = `
CREATE TABLE IF NOT EXISTS items   (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS screens (id TEXT PRIMARY KEY, name TEXT NOT NULL, scene TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv      (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pads    (item_id TEXT PRIMARY KEY, strokes TEXT NOT NULL);`

type Store struct{ db *sql.DB }

type row struct {
	id, a, b string
	n        int64
	data     []byte
}

// snapshot is taken under the hub lock, written to disk outside it
type snapshot struct {
	items, screens, pads []row
	env                  []byte
}

func OpenStore(path string) (*Store, error) {
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err = db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Empty() bool {
	var n int
	_ = s.db.QueryRow(`SELECT (SELECT COUNT(*) FROM items)+(SELECT COUNT(*) FROM screens)+(SELECT COUNT(*) FROM kv)`).Scan(&n)
	return n == 0
}

func (s *Store) Load() (p persisted, err error) {
	rows, err := s.db.Query(`SELECT data FROM items ORDER BY created`)
	if err != nil {
		return
	}
	for rows.Next() {
		var b []byte
		it := &Item{}
		if rows.Scan(&b) == nil && json.Unmarshal(b, it) == nil {
			p.Items = append(p.Items, it)
		}
	}
	rows.Close()
	if rows, err = s.db.Query(`SELECT data FROM screens`); err != nil {
		return
	}
	for rows.Next() {
		var b []byte
		sc := &Screen{}
		if rows.Scan(&b) == nil && json.Unmarshal(b, sc) == nil {
			p.Screens = append(p.Screens, sc)
		}
	}
	rows.Close()
	p.Pads = map[string][]Stroke{}
	if rows, err = s.db.Query(`SELECT item_id, strokes FROM pads`); err != nil {
		return
	}
	for rows.Next() {
		var id string
		var b []byte
		var st []Stroke
		if rows.Scan(&id, &b) == nil && json.Unmarshal(b, &st) == nil {
			p.Pads[id] = st
		}
	}
	rows.Close()
	var b []byte
	if s.db.QueryRow(`SELECT v FROM kv WHERE k='env'`).Scan(&b) == nil {
		_ = json.Unmarshal(b, &p.Env)
	}
	return p, nil
}

// Save replaces the stored state in one transaction.
func (s *Store) Save(sn snapshot) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, q := range []string{`DELETE FROM items`, `DELETE FROM screens`, `DELETE FROM pads`} {
		if _, err = tx.Exec(q); err != nil {
			return err
		}
	}
	for _, r := range sn.items {
		if _, err = tx.Exec(`INSERT INTO items(id,kind,created,data) VALUES(?,?,?,?)`, r.id, r.a, r.n, r.data); err != nil {
			return err
		}
	}
	for _, r := range sn.screens {
		if _, err = tx.Exec(`INSERT INTO screens(id,name,scene,data) VALUES(?,?,?,?)`, r.id, r.a, r.b, r.data); err != nil {
			return err
		}
	}
	for _, r := range sn.pads {
		if _, err = tx.Exec(`INSERT INTO pads(item_id,strokes) VALUES(?,?)`, r.id, r.data); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(`INSERT INTO kv(k,v) VALUES('env',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, sn.env); err != nil {
		return err
	}
	return tx.Commit()
}
