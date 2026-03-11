const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'detections.db');

let db;

function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      duration_sec REAL,
      frame_count INTEGER DEFAULT 0,
      fps_sampled REAL DEFAULT 2,
      status TEXT DEFAULT 'processing',  -- processing | complete | error
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS frame_detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES video_sessions(id) ON DELETE CASCADE,
      frame_index INTEGER NOT NULL,
      timestamp_sec REAL NOT NULL,
      frame_path TEXT,

      -- Tesseract OCR results
      tesseract_plate TEXT,
      tesseract_confidence REAL,
      tesseract_ocr_raw TEXT,
      tesseract_notes TEXT,

      -- Claude AI results
      claude_plate TEXT,
      claude_confidence REAL,
      claude_make TEXT,
      claude_model TEXT,
      claude_color TEXT,
      claude_notes TEXT,
      claude_called INTEGER DEFAULT 0,  -- 1 if we actually called Claude for this frame

      -- Agreement
      plates_match INTEGER,        -- 1=match, 0=differ, NULL=not compared
      consensus_plate TEXT,        -- best agreed-upon plate

      detected_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plate_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES video_sessions(id) ON DELETE CASCADE,
      plate TEXT NOT NULL,
      seen_count INTEGER DEFAULT 1,
      first_seen_sec REAL,
      last_seen_sec REAL,
      best_tesseract_confidence REAL,
      best_claude_confidence REAL,
      source TEXT,   -- 'tesseract' | 'claude' | 'both'
      make TEXT,
      model TEXT,
      color TEXT
    );
  `);
  return db;
}

function insertSession(data) {
  const d = getDb();
  const r = d.prepare(`
    INSERT INTO video_sessions (filename, original_name, fps_sampled)
    VALUES (@filename, @original_name, @fps_sampled)
  `).run(data);
  return r.lastInsertRowid;
}

function updateSession(id, data) {
  const d = getDb();
  const sets = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  d.prepare(`UPDATE video_sessions SET ${sets} WHERE id = @id`).run({ ...data, id });
}

function insertFrame(data) {
  const d = getDb();
  const r = d.prepare(`
    INSERT INTO frame_detections
      (session_id, frame_index, timestamp_sec, frame_path,
       tesseract_plate, tesseract_confidence, tesseract_ocr_raw, tesseract_notes,
       claude_plate, claude_confidence, claude_make, claude_model, claude_color, claude_notes,
       claude_called, plates_match, consensus_plate)
    VALUES
      (@session_id, @frame_index, @timestamp_sec, @frame_path,
       @tesseract_plate, @tesseract_confidence, @tesseract_ocr_raw, @tesseract_notes,
       @claude_plate, @claude_confidence, @claude_make, @claude_model, @claude_color, @claude_notes,
       @claude_called, @plates_match, @consensus_plate)
  `).run({
    session_id: data.session_id,
    frame_index: data.frame_index,
    timestamp_sec: data.timestamp_sec,
    frame_path: data.frame_path || null,
    tesseract_plate: data.tesseract_plate || null,
    tesseract_confidence: data.tesseract_confidence || 0,
    tesseract_ocr_raw: data.tesseract_ocr_raw || null,
    tesseract_notes: data.tesseract_notes || null,
    claude_plate: data.claude_plate || null,
    claude_confidence: data.claude_confidence || 0,
    claude_make: data.claude_make || null,
    claude_model: data.claude_model || null,
    claude_color: data.claude_color || null,
    claude_notes: data.claude_notes || null,
    claude_called: data.claude_called ? 1 : 0,
    plates_match: data.plates_match != null ? (data.plates_match ? 1 : 0) : null,
    consensus_plate: data.consensus_plate || null,
  });
  return r.lastInsertRowid;
}

function buildSummary(sessionId) {
  const d = getDb();
  d.prepare('DELETE FROM plate_summary WHERE session_id = ?').run(sessionId);

  // Aggregate all plates seen per session
  const rows = d.prepare(`
    SELECT
      consensus_plate AS plate,
      COUNT(*) AS seen_count,
      MIN(timestamp_sec) AS first_seen_sec,
      MAX(timestamp_sec) AS last_seen_sec,
      MAX(tesseract_confidence) AS best_tesseract_confidence,
      MAX(claude_confidence) AS best_claude_confidence,
      MAX(claude_make) AS make,
      MAX(claude_model) AS model,
      MAX(claude_color) AS color,
      CASE
        WHEN MAX(claude_called) = 1 AND MIN(tesseract_plate) IS NOT NULL THEN 'both'
        WHEN MAX(claude_called) = 1 THEN 'claude'
        ELSE 'tesseract'
      END AS source
    FROM frame_detections
    WHERE session_id = ? AND consensus_plate IS NOT NULL
    GROUP BY consensus_plate
    ORDER BY seen_count DESC
  `).all(sessionId);

  const insert = d.prepare(`
    INSERT INTO plate_summary
      (session_id, plate, seen_count, first_seen_sec, last_seen_sec,
       best_tesseract_confidence, best_claude_confidence, source, make, model, color)
    VALUES
      (@session_id, @plate, @seen_count, @first_seen_sec, @last_seen_sec,
       @best_tesseract_confidence, @best_claude_confidence, @source, @make, @model, @color)
  `);

  for (const r of rows) insert.run({ session_id: sessionId, ...r });
  return rows;
}

function getSession(id) {
  return getDb().prepare('SELECT * FROM video_sessions WHERE id = ?').get(id);
}

function getAllSessions() {
  return getDb().prepare('SELECT * FROM video_sessions ORDER BY id DESC').all();
}

function getFrames(sessionId) {
  return getDb().prepare('SELECT * FROM frame_detections WHERE session_id = ? ORDER BY frame_index').all(sessionId);
}

function getSummary(sessionId) {
  return getDb().prepare('SELECT * FROM plate_summary WHERE session_id = ? ORDER BY seen_count DESC').all(sessionId);
}

function getStats(sessionId) {
  const d = getDb();
  return d.prepare(`
    SELECT
      COUNT(*) AS total_frames,
      COUNT(CASE WHEN tesseract_plate IS NOT NULL THEN 1 END) AS tesseract_detected,
      COUNT(CASE WHEN claude_plate IS NOT NULL THEN 1 END) AS claude_detected,
      COUNT(CASE WHEN plates_match = 1 THEN 1 END) AS both_agree,
      COUNT(CASE WHEN plates_match = 0 THEN 1 END) AS disagreements,
      COUNT(CASE WHEN claude_called = 1 THEN 1 END) AS claude_calls_made
    FROM frame_detections WHERE session_id = ?
  `).get(sessionId);
}

module.exports = { getDb, insertSession, updateSession, insertFrame, buildSummary, getSession, getAllSessions, getFrames, getSummary, getStats };
