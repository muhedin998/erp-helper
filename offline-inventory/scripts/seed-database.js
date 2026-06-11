const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const PRODUCTS_DB = path.join(__dirname, '..', '..', '..', 'products.db');
const OUTPUT_DB = path.join(__dirname, '..', 'src', 'assets', 'seed.db');

const source = new Database(PRODUCTS_DB, { readonly: true });

// Build lookup maps
const jedinicaMere = {};
source.prepare('SELECT ID, OZNAKA FROM JEDINICA_MERE').all().forEach(r => {
  jedinicaMere[r.ID] = r.OZNAKA;
});

const grupe = {};
source.prepare('SELECT ID, NAZIV FROM ARTIKAL_GRUPA').all().forEach(r => {
  grupe[r.ID] = r.NAZIV;
});

// Get all products with their barcodes (all default barcodes concatenated)
const rows = source.prepare(`
  SELECT 
    a.ID,
    a.SIFRA,
    COALESCE((
      SELECT GROUP_CONCAT(ab.BARKOD, ' ')
      FROM ARTIKAL_BARKOD ab
      WHERE ab.ARTIKAL_ID = a.ID
        AND (ab.PODRAZUMVENA_VREDNOST = 1 OR ab.PODRAZUMVENA_VREDNOST IS NULL)
        AND (ab.NE_KORISTI_SE IS NULL OR ab.NE_KORISTI_SE = 0)
        AND ab.BARKOD IS NOT NULL
        AND ab.BARKOD != ''
    ), '') as BARKOD,
    a.NAZIV,
    a.JEDINICA_MERE_ID,
    a.ARTIKAL_GRUPA_ID,
    a.ARTIKAL_AKTIVAN,
    a.DATUM_RADA,
    a.VREME_RADA
  FROM ARTIKAL a
  ORDER BY a.ID
`).all();

// No deduplication needed — GROUP_CONCAT gives one row per product
const products = rows;
const withBarcode = products.filter(p => p.BARKOD);
const active = products.filter(p => p.ARTIKAL_AKTIVAN === 0);

console.log(`Unique products: ${products.length}`);
console.log(`Products with barcode: ${withBarcode.length}`);
console.log(`Active products: ${active.length}`);

// Create output database
if (fs.existsSync(OUTPUT_DB)) fs.unlinkSync(OUTPUT_DB);
const dest = new Database(OUTPUT_DB);

dest.pragma('journal_mode = WAL');
dest.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sifra TEXT NOT NULL,
    barcode TEXT NOT NULL DEFAULT '',
    naziv TEXT NOT NULL,
    cena REAL,
    grupa TEXT,
    jedinicaMere TEXT,
    source TEXT NOT NULL DEFAULT 'ACIS',
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE products_fts USING fts5(
    naziv, sifra, barcode,
    content='products',
    content_rowid='id'
  );

  CREATE TABLE shopping_lists (
    id TEXT PRIMARY KEY,
    naziv TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    completedAt TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    note TEXT
  );

  CREATE TABLE shopping_list_items (
    id TEXT PRIMARY KEY,
    listId TEXT NOT NULL,
    productId INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    purchasedQuantity INTEGER NOT NULL DEFAULT 0,
    checked INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (listId) REFERENCES shopping_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (productId) REFERENCES products(id)
  );

  CREATE INDEX idx_shopping_items_list ON shopping_list_items(listId);
  CREATE INDEX idx_shopping_items_product ON shopping_list_items(productId);
  CREATE INDEX idx_products_sifra ON products(sifra);
  CREATE INDEX idx_products_barcode ON products(barcode);
`);

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s);
}

const insert = dest.prepare(`
  INSERT INTO products (id, sifra, barcode, naziv, cena, grupa, jedinicaMere, source, active, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, NULL, ?, ?, 'ACIS', ?, ?, ?)
`);

const insertAll = dest.transaction(() => {
  for (const p of products) {
    const naziv = esc(p.NAZIV || 'BEZ NAZIVA');
    const sifra = esc(p.SIFRA) || '';
    const barcode = esc(p.BARKOD) || '';
    const grupa = grupe[p.ARTIKAL_GRUPA_ID] || null;
    const jm = jedinicaMere[p.JEDINICA_MERE_ID] || null;
    const activeFlag = 1; // Always set ACIS products as active in our app
    const dateTime = p.DATUM_RADA && p.VREME_RADA
      ? `${p.DATUM_RADA}T${p.VREME_RADA}`
      : '2000-01-01T00:00:00.000000';
    insert.run(p.ID, sifra, barcode, naziv, grupa, jm, activeFlag, dateTime, dateTime);
  }
});

console.log('Inserting products...');
insertAll();
console.log(`Inserted ${products.length} products`);

// Rebuild FTS5 index
dest.exec("INSERT INTO products_fts(products_fts) VALUES('rebuild');");
console.log('FTS5 index rebuilt');

dest.close();
source.close();

const sizeMB = (fs.statSync(OUTPUT_DB).size / 1024 / 1024).toFixed(1);
console.log(`seed.db written: ${sizeMB} MB`);

// --- Generate compressed JSON for client-side loading ---
const JSON_OUTPUT = path.join(__dirname, '..', 'src', 'assets', 'seed-products.json.gz');
const jsonRows = new Database(OUTPUT_DB, { readonly: true }).prepare(
  'SELECT id, sifra, barcode, naziv, cena, grupa, jedinicaMere, source, active, createdAt, updatedAt FROM products ORDER BY id'
).all();

const jsonProducts = jsonRows.map(r => ({
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

fs.writeFileSync(JSON_OUTPUT, zlib.gzipSync(Buffer.from(JSON.stringify(jsonProducts))));
const gzSize = (fs.statSync(JSON_OUTPUT).size / 1024 / 1024).toFixed(2);
console.log(`seed-products.json.gz written: ${gzSize} MB (${jsonProducts.length} products)`);
