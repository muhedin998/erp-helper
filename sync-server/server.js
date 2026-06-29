const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { parse } = require('csv-parse/sync');

// ── Config ──────────────────────────────────────────────────────────────
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('ERROR: config.json not found. Copy config.json.example and edit it.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const PORT = config.server?.port || 8765;
const SOURCE = config.source || 'file';

// ── Product cache (loaded once, refreshed on demand) ────────────────────
let products = [];
let loadedAt = null;

// ── Source: File ────────────────────────────────────────────────────────
function loadFromFile() {
  const cfg = config.file;
  if (!cfg?.path) throw new Error('file.path not set in config.json');
  if (!fs.existsSync(cfg.path)) throw new Error(`File not found: ${cfg.path}`);

  const ext = path.extname(cfg.path).toLowerCase();
  const raw = fs.readFileSync(cfg.path, cfg.encoding || 'utf-8');

  if (ext === '.csv') {
    const delimiter = cfg.csv?.delimiter || ';';
    const records = parse(raw, { delimiter, columns: true, skip_empty_lines: true, trim: true });
    const col = cfg.csv?.columns || {};
    products = records.map((r, i) => mapRow(r, i, col));
  } else if (ext === '.json') {
    const arr = JSON.parse(raw);
    const col = cfg.json?.columns || {};
    products = arr.map((r, i) => mapRow(r, i, col));
  } else {
    throw new Error(`Unsupported file format: ${ext}. Use .csv or .json`);
  }

  loadedAt = new Date();
  console.log(`[file] Loaded ${products.length} products from ${cfg.path}`);
}

function mapRow(row, index, colMap) {
  const get = (key) => {
    const colName = colMap[key];
    if (!colName) return undefined;
    const val = row[colName];
    return val === '' || val === undefined ? undefined : val;
  };

  const rawId = get('id');
  const id = rawId != null ? Number(rawId) : index + 1;

  return {
    id,
    sifra: String(get('sifra') || id),
    barcode: String(get('barcode') || ''),
    naziv: String(get('naziv') || ''),
    cena: get('cena') != null ? Number(get('cena')) : null,
    grupa: get('grupa') || null,
    jedinicaMere: get('jedinicaMere') || null,
    active: get('active') === '0' || get('active') === 'false' ? 0 : 1,
    createdAt: '2000-01-01T00:00:00.000000',
    updatedAt: '2000-01-01T00:00:00.000000',
  };
}

// ── Source: Firebird ────────────────────────────────────────────────────
let firebirdPool = null;

function getFirebird() {
  if (!firebirdPool) firebirdPool = require('node-firebird');
  return firebirdPool;
}

function getFirebirdOptions() {
  const fb = config.firebird;
  return {
    host: fb.host || 'localhost',
    port: fb.port || 3050,
    database: fb.database,
    user: fb.user || 'SYSDBA',
    password: fb.password || 'masterkey',
  };
}

function loadFromFirebird() {
  return new Promise((resolve, reject) => {
    const fb = getFirebird();
    const opts = getFirebirdOptions();
    const query = config.firebird.query;

    if (!opts.database) return reject(new Error('firebird.database not set in config'));
    if (!query) return reject(new Error('firebird.query not set in config'));

    fb.attach(opts, (err, db) => {
      if (err) return reject(new Error(`Firebird connect failed: ${err.message}`));

      db.query(query, [], (err, result) => {
        if (err) {
          db.detach();
          return reject(new Error(`Firebird query failed: ${err.message}`));
        }

        products = (result || []).map(r => ({
          id: r.ID ?? r.id ?? 0,
          sifra: String(r.SIFRA ?? r.sifra ?? ''),
          barcode: String(r.BARCODE ?? r.barcode ?? ''),
          naziv: String(r.NAZIV ?? r.naziv ?? ''),
          cena: r.CENA ?? r.cena ?? null,
          grupa: r.GRUPA ?? r.grupa ?? null,
          jedinicaMere: r.JEDINICA_MERE ?? r.jedinica_mere ?? null,
          active: (r.AKTIVAN ?? r.aktivan ?? 1) === 1 ? 1 : 0,
          createdAt: r.CREATED_AT ?? r.created_at ?? '2000-01-01T00:00:00',
          updatedAt: r.UPDATED_AT ?? r.updated_at ?? '2000-01-01T00:00:00',
        }));

        db.detach();
        loadedAt = new Date();
        console.log(`[firebird] Loaded ${products.length} products`);
        resolve();
      });
    });
  });
}

// ── Load (dispatch) ─────────────────────────────────────────────────────
async function loadProducts() {
  if (SOURCE === 'firebird') {
    await loadFromFirebird();
  } else {
    loadFromFile();
  }
}

// ── Compact format (matches app's CompactProduct) ──────────────────────
function compact(p) {
  return {
    id: p.id,
    s: p.sifra,
    b: p.barcode,
    n: p.naziv,
    c: p.cena,
    g: p.grupa,
    j: p.jedinicaMere,
    src: 'ACIS',
    a: p.active ? 1 : 0,
    ca: p.createdAt,
    ua: p.updatedAt,
  };
}

// ── Express ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    productCount: products.length,
    serverVersion: '1.0.0',
    source: SOURCE,
    loadedAt: loadedAt?.toISOString() || null,
  });
});

// Product count
app.get('/api/sync/products/count', (req, res) => {
  res.json({ count: products.length });
});

// Products (full or delta)
app.get('/api/sync/products', (req, res) => {
  const since = req.query.since;
  let result = products;
  let deactivated = [];

  if (since) {
    // Delta: return products updated since given timestamp
    const sinceDate = new Date(since);
    result = products.filter(p => new Date(p.updatedAt) > sinceDate);
    deactivated = products
      .filter(p => p.active === 0 && new Date(p.updatedAt) > sinceDate)
      .map(p => p.id);
  }

  const compactData = result.filter(p => p.active === 1).map(compact);
  const json = JSON.stringify(compactData);
  const gzipped = zlib.gzipSync(json);

  res.set('Content-Type', 'application/json');
  res.set('Content-Encoding', 'gzip');
  res.set('X-Server-Time', new Date().toISOString());
  if (deactivated.length) {
    res.set('X-Deactivated-IDs', deactivated.join(','));
  }
  res.send(gzipped);
});

// ── Reload endpoint (manual refresh without restart) ────────────────────
app.post('/api/reload', async (req, res) => {
  try {
    await loadProducts();
    res.json({ ok: true, count: products.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────────
async function start() {
  console.log(`[server] Source: ${SOURCE}`);
  try {
    await loadProducts();
    console.log(`[server] ${products.length} products ready`);
  } catch (e) {
    console.error(`[server] ERROR loading products: ${e.message}`);
    console.error('[server] Server will start anyway — fix config and POST /api/reload');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Latko sync server running on http://0.0.0.0:${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/api/health`);
  });
}

start();
