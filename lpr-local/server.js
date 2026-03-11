const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { exec, execFile } = require('child_process');
const os = require('os');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

const app = express();

// Larger limit for video uploads
const upload = multer({ dest: 'uploads/', limits: { fileSize: 500 * 1024 * 1024 } });

const PORT = process.env.PORT || 3099;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const PARKING_APP_URL = process.env.PARKING_APP_URL || 'http://localhost:3002';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const TESSDATA_PREFIX = process.env.TESSDATA_PREFIX ||
  (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'scoop', 'apps', 'tesseract', 'current', 'tessdata') : '/usr/share/tesseract-ocr/5/tessdata');

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Active processing jobs (sessionId -> { status, progress, total })
const jobs = {};

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

['uploads', 'frames'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// ─── Tesseract OCR ────────────────────────────────────────────────────────────

function runTesseract(imagePath) {
  return new Promise((resolve) => {
    const fwdPath = imagePath.replace(/\\/g, '/');
    const env = { ...process.env, TESSDATA_PREFIX: TESSDATA_PREFIX.replace(/\\/g, '/') };
    const tryCmd = (psm, cb) => {
      exec(`tesseract "${fwdPath}" stdout --psm ${psm} -l eng`, { env, timeout: 15000 }, (err, stdout) => {
        cb(err ? '' : (stdout || '').trim());
      });
    };
    tryCmd(11, out => { if (out) return resolve(out); tryCmd(6, out2 => resolve(out2)); });
  });
}

function extractPlate(ocrText) {
  const lines = ocrText.split('\n').map(l => l.toUpperCase().replace(/[^A-Z0-9]/g, '').trim()).filter(Boolean);
  for (const line of lines) {
    for (const token of line.split(/\s+/)) {
      if (token.length >= 2 && token.length <= 8 && /[A-Z]/.test(token) && /[0-9]/.test(token)) return token;
    }
  }
  for (const line of lines) {
    const t = line.replace(/\s/g, '');
    if (t.length >= 3 && t.length <= 8 && /^[A-Z0-9]+$/.test(t)) return t;
  }
  return null;
}

async function analyzePlateOCR(imagePath) {
  const ocrText = await runTesseract(imagePath);
  const plate = extractPlate(ocrText);
  return {
    plate: plate || null,
    confidence: plate ? 0.88 : 0.1,
    ocr_raw: ocrText,
    notes: ocrText ? `OCR: ${ocrText.replace(/\n/g, ' ').trim()}` : 'No text detected',
  };
}

// ─── Claude Vision (comparison AI) ───────────────────────────────────────────

async function analyzeWithClaude(imagePath) {
  try {
    const imageData = fs.readFileSync(imagePath);
    const base64 = imageData.toString('base64');

    // Detect mime type from extension
    const ext = path.extname(imagePath).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `You are a license plate recognition expert. Examine this image carefully.

Look for any license plate — it may be on a car, truck, or other vehicle.

Reply ONLY with a JSON object, no other text:
{"plate":"ABC123","confidence":0.95,"make":"Toyota","model":"Camry","color":"White","notes":"plate visible on rear of vehicle"}

If no plate is visible:
{"plate":null,"confidence":0,"make":null,"model":null,"color":null,"notes":"reason here"}

Rules:
- plate: uppercase letters and digits only, no spaces or dashes, null if not readable
- confidence: 0.0 to 1.0 — how confident you are the plate is correct
- make/model/color: vehicle details if visible, null otherwise`,
          },
        ],
      }],
    });

    const text = (response.content[0]?.text || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { plate: null, confidence: 0, make: null, model: null, color: null, notes: `Unparseable response: ${text.slice(0, 100)}` };
  } catch (err) {
    return { plate: null, confidence: 0, make: null, model: null, color: null, notes: `Claude error: ${err.message}` };
  }
}

// ─── FFmpeg frame extraction ──────────────────────────────────────────────────

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    const fwd = videoPath.replace(/\\/g, '/');
    exec(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${fwd}"`, { timeout: 10000 }, (err, stdout) => {
      resolve(err ? null : parseFloat(stdout.trim()) || null);
    });
  });
}

// Extract frames at `fps` rate from video, save to framesDir
// Returns array of { framePath, timestampSec }
function extractFrames(videoPath, framesDir, fps = 2) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    const fwd = videoPath.replace(/\\/g, '/');
    const outPattern = path.join(framesDir, 'frame_%05d.jpg').replace(/\\/g, '/');
    const cmd = `ffmpeg -i "${fwd}" -vf "fps=${fps}" -q:v 2 "${outPattern}" -y`;
    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err && !fs.readdirSync(framesDir).length) return reject(new Error(`ffmpeg failed: ${stderr.slice(0, 300)}`));
      const files = fs.readdirSync(framesDir)
        .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
        .sort();
      const frames = files.map((f, i) => ({
        framePath: path.join(framesDir, f),
        timestampSec: i / fps,
        frameIndex: i,
      }));
      resolve(frames);
    });
  });
}

// ─── Core video analysis pipeline ────────────────────────────────────────────

// We call Claude only on frames where Tesseract found a plate OR every N frames
// to keep API costs reasonable. Strategy:
//   - Tesseract: every frame
//   - Claude: frames where tesseract found a plate + every 5th frame (for discovery)
const CLAUDE_EVERY_N = 5;

async function processVideo(sessionId, videoPath, fps = 2) {
  const framesDir = path.join(__dirname, 'frames', `session_${sessionId}`);

  try {
    jobs[sessionId] = { status: 'extracting_frames', progress: 0, total: 0 };
    db.updateSession(sessionId, { status: 'processing' });

    const duration = await getVideoDuration(videoPath);
    if (duration) db.updateSession(sessionId, { duration_sec: duration });

    // Extract frames
    const frames = await extractFrames(videoPath, framesDir, fps);
    jobs[sessionId] = { status: 'analyzing', progress: 0, total: frames.length };
    db.updateSession(sessionId, { frame_count: frames.length });

    // Process each frame
    for (let i = 0; i < frames.length; i++) {
      const { framePath, timestampSec, frameIndex } = frames[i];
      jobs[sessionId].progress = i + 1;
      jobs[sessionId].currentTimestamp = timestampSec.toFixed(1);

      // 1. Tesseract OCR
      const tess = await analyzePlateOCR(framePath);

      // 2. Claude — call if Tesseract found something OR it's every Nth frame
      const callClaude = !!tess.plate || (i % CLAUDE_EVERY_N === 0);
      let claudeResult = { plate: null, confidence: 0, make: null, model: null, color: null, notes: null };
      if (callClaude) {
        claudeResult = await analyzeWithClaude(framePath);
      }

      // 3. Agreement analysis
      const tp = tess.plate;
      const cp = claudeResult.plate;
      let platesMatch = null;
      let consensusPlate = null;

      if (tp && cp) {
        platesMatch = tp === cp;
        // Both agree → use that. They differ → pick higher confidence one
        consensusPlate = platesMatch ? tp : (tess.confidence >= claudeResult.confidence ? tp : cp);
      } else if (tp) {
        consensusPlate = tp;
      } else if (cp) {
        consensusPlate = cp;
      }

      db.insertFrame({
        session_id: sessionId,
        frame_index: frameIndex,
        timestamp_sec: timestampSec,
        frame_path: framePath,
        tesseract_plate: tp,
        tesseract_confidence: tess.confidence,
        tesseract_ocr_raw: tess.ocr_raw,
        tesseract_notes: tess.notes,
        claude_plate: cp,
        claude_confidence: claudeResult.confidence,
        claude_make: claudeResult.make,
        claude_model: claudeResult.model,
        claude_color: claudeResult.color,
        claude_notes: claudeResult.notes,
        claude_called: callClaude,
        plates_match: platesMatch,
        consensus_plate: consensusPlate,
      });
    }

    // Build plate summary
    const summary = db.buildSummary(sessionId);
    db.updateSession(sessionId, { status: 'complete', completed_at: new Date().toISOString(), notes: `Found ${summary.length} unique plate(s)` });
    jobs[sessionId] = { status: 'complete', progress: frames.length, total: frames.length, plateCount: summary.length };

  } catch (err) {
    db.updateSession(sessionId, { status: 'error', notes: err.message });
    jobs[sessionId] = { status: 'error', error: err.message };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /analyze-video — upload and start processing a video
app.post('/analyze-video', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
  const fps = parseFloat(req.query.fps || '2');
  const sessionId = db.insertSession({
    filename: req.file.path,
    original_name: req.file.originalname,
    fps_sampled: fps,
  });
  // Start async processing — don't await
  processVideo(sessionId, req.file.path, fps);
  res.json({ session_id: sessionId, message: 'Processing started', status_url: `/job/${sessionId}` });
});

// GET /job/:id — poll processing status
app.get('/job/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const job = jobs[id] || {};
  const session = db.getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    session_id: id,
    status: session.status,
    job: job,
    progress_pct: job.total ? Math.round((job.progress / job.total) * 100) : 0,
  });
});

// GET /report/:id — full analysis report as JSON
app.get('/report/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const session = db.getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const frames = db.getFrames(id);
  const summary = db.getSummary(id);
  const stats = db.getStats(id);

  // Agreement rate
  const agreementRate = stats.both_agree + stats.disagreements > 0
    ? Math.round((stats.both_agree / (stats.both_agree + stats.disagreements)) * 100)
    : null;

  res.json({
    session,
    stats: { ...stats, agreement_rate_pct: agreementRate },
    unique_plates: summary,
    frames: frames.map(f => ({
      frame: f.frame_index,
      time_sec: f.timestamp_sec,
      tesseract: { plate: f.tesseract_plate, confidence: f.tesseract_confidence, ocr_raw: f.tesseract_ocr_raw },
      claude: f.claude_called ? { plate: f.claude_plate, confidence: f.claude_confidence, make: f.claude_make, model: f.claude_model, color: f.claude_color, notes: f.claude_notes } : null,
      agreement: f.plates_match === 1 ? 'match' : f.plates_match === 0 ? 'differ' : 'n/a',
      consensus: f.consensus_plate,
    })),
  });
});

// GET /report/:id/csv — download CSV
app.get('/report/:id/csv', (req, res) => {
  const id = parseInt(req.params.id);
  const session = db.getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const frames = db.getFrames(id);
  const rows = [
    ['frame_index','timestamp_sec','tesseract_plate','tesseract_confidence','claude_plate','claude_confidence','claude_make','claude_model','claude_color','agreement','consensus_plate'],
    ...frames.map(f => [
      f.frame_index, f.timestamp_sec,
      f.tesseract_plate || '', f.tesseract_confidence || 0,
      f.claude_plate || '', f.claude_confidence || 0,
      f.claude_make || '', f.claude_model || '', f.claude_color || '',
      f.plates_match === 1 ? 'match' : f.plates_match === 0 ? 'differ' : 'n/a',
      f.consensus_plate || '',
    ]),
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="lpr_session_${id}.csv"`);
  res.send(csv);
});

// GET /report/:id/db — download the SQLite database file
app.get('/report/:id/db', (req, res) => {
  const dbPath = path.join(__dirname, 'detections.db');
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'No database yet' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="lpr_detections.db"');
  res.sendFile(dbPath);
});

// GET /sessions — list all video sessions
app.get('/sessions', (req, res) => {
  res.json(db.getAllSessions());
});

// ─── Single image routes (kept from before) ───────────────────────────────────

app.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    const tess = await analyzePlateOCR(path.resolve(req.file.path));
    const claude = await analyzeWithClaude(path.resolve(req.file.path));
    fs.unlinkSync(req.file.path);
    const tp = tess.plate, cp = claude.plate;
    const match = tp && cp ? tp === cp : null;
    const consensus = tp && cp ? (match ? tp : (tess.confidence >= claude.confidence ? tp : cp)) : (tp || cp || null);
    let parkingResult = null;
    if (consensus && req.query.forward === '1') parkingResult = await forwardToParkingApp({ plate: consensus, confidence: Math.max(tess.confidence, claude.confidence) });
    res.json({ tesseract: tess, claude, consensus, agreement: match, engine: 'tesseract+claude', parking_result: parkingResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/analyze-base64', async (req, res) => {
  const { image, camera_id, forward } = req.body;
  if (!image) return res.status(400).json({ error: 'No image data' });
  try {
    const base64 = image.replace(/^data:image\/[a-z+]+;base64,/, '');
    const tmpFile = path.join(os.tmpdir(), `lpr_${Date.now()}.jpg`);
    fs.writeFileSync(tmpFile, Buffer.from(base64, 'base64'));
    const tess = await analyzePlateOCR(tmpFile);
    const claude = await analyzeWithClaude(tmpFile);
    fs.unlink(tmpFile, () => {});
    const tp = tess.plate, cp = claude.plate;
    const match = tp && cp ? tp === cp : null;
    const consensus = tp && cp ? (match ? tp : (tess.confidence >= claude.confidence ? tp : cp)) : (tp || cp || null);
    let parkingResult = null;
    if (consensus && forward) parkingResult = await forwardToParkingApp({ plate: consensus, confidence: Math.max(tess.confidence || 0, claude.confidence || 0), camera_id });
    res.json({ tesseract: tess, claude, consensus, agreement: match, engine: 'tesseract+claude', parking_result: parkingResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Forward to parking-app ───────────────────────────────────────────────────

function forwardToParkingApp(result) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ plate: result.plate, make: result.make, model: result.model, color: result.color, confidence: result.confidence, camera_id: result.camera_id || 'local-lpr' });
    const url = new URL(`${PARKING_APP_URL}/api/lpr`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', () => resolve({ error: 'Could not reach parking app' }));
    req.write(body); req.end();
  });
}

// GET /models — engines status
app.get('/models', async (req, res) => {
  const tesseractOk = await new Promise(resolve => {
    exec('tesseract --version', { env: { ...process.env, TESSDATA_PREFIX } }, err => resolve(!err));
  });
  res.json({ engines: { tesseract: tesseractOk, claude: !!ANTHROPIC_API_KEY }, models: ['tesseract+claude (recommended)', 'tesseract-only'], current_model: 'tesseract+claude' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/report-ui/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'report.html')));

app.listen(PORT, () => {
  console.log(`\n🎯 Local LPR Detector v2 running at http://localhost:${PORT}`);
  console.log(`   Engines: Tesseract OCR + Claude Vision (${anthropic ? '✓' : '✗'})`);
  console.log(`   Video: POST /analyze-video (mp4, avi, mov, mkv)`);
  console.log(`   Reports: GET /report/:id  GET /report/:id/csv  GET /report/:id/db\n`);
});
