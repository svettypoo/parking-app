const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 20 * 1024 * 1024 } });

const PORT = process.env.PORT || 3099;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const PARKING_APP_URL = process.env.PARKING_APP_URL || 'http://localhost:3002';

// Find Tesseract on Windows/Scoop
const TESSDATA_PREFIX = process.env.TESSDATA_PREFIX ||
  (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'scoop', 'apps', 'tesseract', 'current', 'tessdata') : '/usr/share/tesseract-ocr/5/tessdata');

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// --- Tesseract OCR (primary plate reader) ---
function runTesseract(imagePath) {
  return new Promise((resolve) => {
    // Use forward slashes — Tesseract on Windows accepts them fine
    const fwdPath = imagePath.replace(/\\/g, '/');
    const env = { ...process.env, TESSDATA_PREFIX: TESSDATA_PREFIX.replace(/\\/g, '/') };
    const tryCmd = (psm, cb) => {
      exec(`tesseract "${fwdPath}" stdout --psm ${psm} -l eng`, { env, timeout: 15000 }, (err, stdout) => {
        cb(err ? '' : (stdout || '').trim());
      });
    };
    tryCmd(11, (out) => {
      if (out) return resolve(out);
      tryCmd(6, (out2) => resolve(out2));
    });
  });
}

// Clean and validate plate text from OCR output
function extractPlate(ocrText) {
  // Strip non-alphanumeric
  const lines = ocrText.split('\n').map(l => l.toUpperCase().replace(/[^A-Z0-9]/g, '').trim()).filter(Boolean);
  // Prioritize tokens that look like plates: 2-8 chars with mix of letters and digits
  for (const line of lines) {
    for (const token of line.split(/\s+/)) {
      if (token.length >= 2 && token.length <= 8 && /[A-Z]/.test(token) && /[0-9]/.test(token)) {
        return token;
      }
    }
  }
  // Fallback: any 3-8 char alphanumeric token
  for (const line of lines) {
    const t = line.replace(/\s/g, '');
    if (t.length >= 3 && t.length <= 8 && /^[A-Z0-9]+$/.test(t)) return t;
  }
  return null;
}

// --- Ollama (vehicle description enrichment, text-only) ---
function ollamaChat(prompt) {
  const body = JSON.stringify({
    model: 'gemma3:1b',
    prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 100 },
  });
  return new Promise((resolve) => {
    const url = new URL(`${OLLAMA_HOST}/api/generate`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).response || ''); } catch { resolve(''); } });
    });
    req.on('error', () => resolve(''));
    req.setTimeout(10000, () => { req.destroy(); resolve(''); });
    req.write(body);
    req.end();
  });
}

// Main analysis function: Tesseract OCR + Ollama enrichment
async function analyzePlate(imagePath) {
  const ocrText = await runTesseract(imagePath);
  const plate = extractPlate(ocrText);
  const confidence = plate ? 0.88 : 0.1;

  let notes = ocrText ? `OCR: ${ocrText.replace(/\n/g, ' ').trim()}` : 'No text detected by OCR';

  // Use Ollama (text-only gemma3:1b) to validate/clean the plate if we got something
  let normalizedPlate = plate;
  if (plate) {
    const validation = await ollamaChat(
      `A license plate OCR scan returned this text: "${ocrText.replace(/\n/g, ' ').trim()}". ` +
      `The most likely plate number extracted is: "${plate}". ` +
      `Is this a valid-looking license plate? If the extracted plate looks correct, reply with just the plate in uppercase (letters and numbers only). ` +
      `If you can see a better plate number in the OCR text, reply with that instead. Keep it to 2-8 characters.`
    );
    const aiPlate = validation.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    if (aiPlate.length >= 2 && aiPlate.length <= 8) {
      normalizedPlate = aiPlate;
      notes += ` | AI validated: ${aiPlate}`;
    }
  }

  return { plate: normalizedPlate, confidence, make: null, model: null, color: null, notes, ocr_raw: ocrText };
}

// Forward detection to parking-app /api/lpr
function forwardToParkingApp(result) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      plate: result.plate,
      make: result.make,
      model: result.model,
      color: result.color,
      confidence: result.confidence,
      camera_id: result.camera_id || 'local-lpr',
    });
    const url = new URL(`${PARKING_APP_URL}/api/lpr`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', () => resolve({ error: 'Could not reach parking app' }));
    req.write(body);
    req.end();
  });
}

// POST /analyze — analyze uploaded image file
app.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    const result = await analyzePlate(path.resolve(req.file.path));
    fs.unlinkSync(req.file.path);

    let parkingResult = null;
    if (result.plate && req.query.forward === '1') {
      parkingResult = await forwardToParkingApp(result);
    }

    res.json({ ...result, engine: 'tesseract+ollama', parking_result: parkingResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /analyze-base64 — analyze base64 image (from webcam)
app.post('/analyze-base64', async (req, res) => {
  const { image, camera_id, forward } = req.body;
  if (!image) return res.status(400).json({ error: 'No image data' });
  try {
    // Save base64 to temp file for Tesseract
    const base64 = image.replace(/^data:image\/[a-z+]+;base64,/, '');
    const tmpFile = path.join(os.tmpdir(), `lpr_${Date.now()}.jpg`);
    fs.writeFileSync(tmpFile, Buffer.from(base64, 'base64'));

    const result = await analyzePlate(tmpFile);
    fs.unlink(tmpFile, () => {}); // cleanup async

    let parkingResult = null;
    if (result.plate && forward) {
      parkingResult = await forwardToParkingApp({ ...result, camera_id });
    }

    res.json({ ...result, engine: 'tesseract+ollama', parking_result: parkingResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /models — show available engines
app.get('/models', async (req, res) => {
  // Check if Tesseract works
  const tesseractOk = await new Promise(resolve => {
    exec('tesseract --version', { env: { ...process.env, TESSDATA_PREFIX } }, (err) => resolve(!err));
  });

  // Check Ollama
  let ollamaModels = [];
  await new Promise(resolve => {
    const url = new URL(`${OLLAMA_HOST}/api/tags`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(`${OLLAMA_HOST}/api/tags`, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { ollamaModels = JSON.parse(d).models?.map(m => m.name) || []; } catch { /**/ }
        resolve();
      });
    });
    req.on('error', resolve);
    req.setTimeout(3000, () => { req.destroy(); resolve(); });
  });

  res.json({
    engines: { tesseract: tesseractOk, ollama: ollamaModels.length > 0 },
    models: ['tesseract+ollama (recommended)', ...ollamaModels],
    current_model: 'tesseract+ollama',
    tessdata: TESSDATA_PREFIX,
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n🎯 Local LPR Detector running at http://localhost:${PORT}`);
  console.log(`   Engine: Tesseract OCR + Ollama AI validation`);
  console.log(`   Tessdata: ${TESSDATA_PREFIX}`);
  console.log(`   Ollama: ${OLLAMA_HOST}`);
  console.log(`   Parking App: ${PARKING_APP_URL}\n`);
});
