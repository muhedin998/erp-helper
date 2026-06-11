/**
 * Generate seed-products.json.gz from seed.db
 * 
 * This creates a compact, gzip-compressed JSON representation of all products
 * for efficient serving over HTTPS to mobile devices. The JSON is ~1.6 MB gzipped
 * vs 10.7 MB for the binary SQLite file.
 * 
 * Run: node scripts/generate-seed-json.js
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const SEED_DB = path.join(__dirname, '..', 'src', 'assets', 'seed.db');
const OUTPUT = path.join(__dirname, '..', 'src', 'assets', 'seed-products.json.gz');

if (!fs.existsSync(SEED_DB)) {
  console.error('seed.db not found at', SEED_DB);
  console.error('Run scripts/seed-database.js first.');
  process.exit(1);
}

const db = new Database(SEED_DB, { readonly: true });
const rows = db.prepare(
  'SELECT id, sifra, barcode, naziv, cena, grupa, jedinicaMere, source, active, createdAt, updatedAt FROM products ORDER BY id'
).all();

// Use compact field names to minimize JSON size
const products = rows.map(r => ({
  id: r.id,
  s: r.sifra || '',
  b: r.barcode || '',
  n: r.naziv || '',
  c: r.cena ?? null,
  g: r.grupa || null,
  j: r.jedinicaMere || null,
  src: r.source || 'ACIS',
  a: r.active ? 1 : 0,
  ca: r.createdAt || '2000-01-01T00:00:00.000000',
  ua: r.updatedAt || '2000-01-01T00:00:00.000000',
}));

const json = JSON.stringify(products);
const gzipped = zlib.gzipSync(Buffer.from(json));

fs.writeFileSync(OUTPUT, gzipped);

const rawMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
const gzMB = (gzipped.length / 1024 / 1024).toFixed(2);
console.log(`Exported ${products.length} products`);
console.log(`Raw JSON: ${rawMB} MB → Gzipped: ${gzMB} MB`);
console.log(`Written to ${OUTPUT}`);

db.close();
