const Database = require('better-sqlite3');
const db = new Database('products.db');

const result = db.prepare("SELECT COUNT(DISTINCT ab.ARTIKAL_ID) as cnt FROM ARTIKAL_BARKOD ab WHERE ab.BARKOD IS NOT NULL AND ab.BARKOD != ''").get();
console.log('Products with at least one barcode in ARTIKAL_BARKOD:', result.cnt);

const multi = db.prepare("SELECT ARTIKAL_ID, COUNT(*) as cnt FROM ARTIKAL_BARKOD WHERE BARKOD IS NOT NULL AND BARKOD != '' GROUP BY ARTIKAL_ID HAVING cnt > 1").all();
console.log('Products with multiple barcodes:', multi.length);

const podr = db.prepare("SELECT PODRAZUMVENA_VREDNOST, COUNT(*) as cnt FROM ARTIKAL_BARKOD WHERE BARKOD IS NOT NULL AND BARKOD != '' GROUP BY PODRAZUMVENA_VREDNOST").all();
podr.forEach(r => console.log('PODRAZUMVENA_VREDNOST=' + r.PODRAZUMVENA_VREDNOST + ': ' + r.cnt));

const sample = db.prepare("SELECT a.ID, a.NAZIV, ab.BARKOD, ab.PODRAZUMVENA_VREDNOST FROM ARTIKAL a INNER JOIN ARTIKAL_BARKOD ab ON a.ID = ab.ARTIKAL_ID WHERE ab.BARKOD IS NOT NULL AND ab.BARKOD != '' AND ab.PODRAZUMVENA_VREDNOST = 1 LIMIT 10").all();
console.log('\nExamples with PODRAZUMVENA_VREDNOST=1 (default barcode):');
sample.forEach(r => console.log('  ID=' + r.ID, r.NAZIV.substring(0, 50), '->', r.BARKOD));

// Check what OSNOVNI_BARKOD looks like in ARTIKAL table
const artBarcode = db.prepare("SELECT ID, OSNOVNI_BARKOD, NAZIV FROM ARTIKAL WHERE OSNOVNI_BARKOD IS NOT NULL AND OSNOVNI_BARKOD != '' LIMIT 5").all();
console.log('\nARTIKAL.OSNOVNI_BARKOD non-null examples:');
artBarcode.forEach(r => console.log('  ID=' + r.ID, r.NAZIV.substring(0, 50), '->', r.OSNOVNI_BARKOD));

// Do join: get product IDs + their barcodes
const join = db.prepare("SELECT a.ID as artikal_id, a.NAZIV, a.SIFRA, a.JEDINICA_MERE_ID, a.ARTIKAL_GRUPA_ID, ab.BARKOD FROM ARTIKAL a LEFT JOIN ARTIKAL_BARKOD ab ON a.ID = ab.ARTIKAL_ID AND ab.PODRAZUMVENA_VREDNOST = 1 AND ab.BARKOD IS NOT NULL AND ab.BARKOD != '' LIMIT 10").all();
console.log('\nJoin sample (left join with default barcode):');
join.forEach(r => console.log('  ID=' + r.artikal_id, r.NAZIV.substring(0, 40), '|', r.SIFRA, '| barcode:', r.BARKOD || 'null'));

db.close();
