import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, capSQLiteValues } from '@capacitor-community/sqlite';
import { Product } from '../models/product.model';
import { ShoppingList, ShoppingListItem } from '../models/shopping-list.model';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private dbName = 'offline_inventory';
  private initialized = false;
  private fts5Available = true;
  private readonly DB_VERSION = 3;

  async init(): Promise<void> {
    if (this.initialized) return;

    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      if (typeof customElements !== 'undefined') {
        await customElements.whenDefined('jeep-sqlite');
      }
      await CapacitorSQLite.initWebStore();
    }

    try {
      await CapacitorSQLite.createConnection({
        database: this.dbName,
        encrypted: false,
        mode: 'no-encryption',
        readonly: false,
      });
    } catch (e: any) {
      // On reconnect, connection may already exist — that's OK
      if (e?.message?.includes('already exists')) {
        console.warn('createConnection: connection already exists, reusing');
      } else {
        console.error('createConnection failed:', e?.message || e);
        throw e;
      }
    }

    try {
      await CapacitorSQLite.open({ database: this.dbName, readonly: false });
    } catch (e: any) {
      console.error('open failed:', e?.message || e);
      throw e;
    }

    await this.createTables();

    // Migrate if needed (old seed data may have incorrect/missing barcodes)
    await this.checkVersion();

    this.initialized = true;
  }

  private async checkVersion(): Promise<void> {
    const recorded = Number(await this.getMeta('schema_version')) || 0;
    if (recorded >= 2 && recorded < 3) {
      try {
        await CapacitorSQLite.execute({
          database: this.dbName,
          statements: `ALTER TABLE shopping_list_items ADD COLUMN scannedCode TEXT DEFAULT '';`,
        });
        console.log('[db] migrated shopping_list_items to v3 (added scannedCode)');
      } catch (e: any) {
        if (!e?.message?.includes('duplicate column')) {
          console.warn('[db] v3 migration skipped:', e?.message || e);
        }
      }
    }
  }

  async getMeta(key: string): Promise<string | null> {
    try {
      const ret = await CapacitorSQLite.query({
        database: this.dbName,
        statement: 'SELECT value FROM db_meta WHERE key = ? LIMIT 1',
        values: [key],
      });
      const rows = ret?.values ?? [];
      return rows.length ? (rows[0] as any).value ?? null : null;
    } catch {
      return null;
    }
  }

  async setMeta(key: string, value: string): Promise<void> {
    await CapacitorSQLite.run({
      database: this.dbName,
      statement: 'INSERT INTO db_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      values: [key, value],
    });
    await this.persist();
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async createTables(): Promise<void> {
    await CapacitorSQLite.execute({
      database: this.dbName,
      statements: `
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY,
          sifra TEXT NOT NULL,
          barcode TEXT NOT NULL DEFAULT '',
          naziv TEXT NOT NULL,
          cena REAL,
          grupa TEXT,
          jedinicaMere TEXT,
          source TEXT NOT NULL DEFAULT 'MANUAL',
          active INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        -- products_fts FTS5 table created conditionally below
        CREATE TABLE IF NOT EXISTS shopping_lists (
          id TEXT PRIMARY KEY,
          naziv TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          completedAt TEXT,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          note TEXT
        );
        CREATE TABLE IF NOT EXISTS shopping_list_items (
          id TEXT PRIMARY KEY,
          listId TEXT NOT NULL,
          productId INTEGER NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          purchasedQuantity INTEGER NOT NULL DEFAULT 0,
          checked INTEGER NOT NULL DEFAULT 0,
          scannedCode TEXT DEFAULT '',
          FOREIGN KEY (listId) REFERENCES shopping_lists(id) ON DELETE CASCADE,
          FOREIGN KEY (productId) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_list_items(listId);
        CREATE INDEX IF NOT EXISTS idx_shopping_items_product ON shopping_list_items(productId);
        CREATE INDEX IF NOT EXISTS idx_products_sifra ON products(sifra);
        CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
        CREATE TABLE IF NOT EXISTS db_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    });

    // FTS5 may not be available on all platforms (e.g. jeep-sqlite WASM on web)
    try {
      await CapacitorSQLite.execute({
        database: this.dbName,
        statements: `CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
          naziv, sifra, barcode,
          content='products',
          content_rowid='id'
        );`,
      });
      this.fts5Available = true;
    } catch {
      console.warn('FTS5 not available — falling back to LIKE-based search');
      this.fts5Available = false;
    }
  }

  async isPopulated(): Promise<boolean> {
    await this.ensureInit();
    const result = await this.query<{ count: number }>('SELECT COUNT(*) as count FROM products');
    return (result[0]?.count ?? 0) > 0;
  }

  async batchInsertProducts(
    products: (Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id: number; createdAt: string; updatedAt: string })[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    await this.ensureInit();

    const total = products.length;
    if (total === 0) return;

    const CHUNK_SIZE = 500;
    const stmt = `INSERT OR REPLACE INTO products (id, sifra, barcode, naziv, cena, grupa, jedinicaMere, source, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    let insertedTotal = 0;
    const chunkCount = Math.ceil(total / CHUNK_SIZE);
    const isNative = Capacitor.isNativePlatform();

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = products.slice(i, i + CHUNK_SIZE);
      const set = chunk.map(p => ({
        statement: stmt,
        values: [
          p.id, p.sifra, p.barcode, p.naziv,
          p.cena ?? null, p.grupa ?? null, p.jedinicaMere ?? null,
          p.source, p.active ? 1 : 0, p.createdAt, p.updatedAt,
        ],
      }));

      try {
        const ret = await CapacitorSQLite.executeSet({
          database: this.dbName,
          set,
          transaction: true,
        });
        insertedTotal += ret?.changes?.changes ?? 0;
      } catch (e: any) {
        console.error(`[seed] executeSet chunk ${i / CHUNK_SIZE + 1}/${chunkCount} failed:`, e?.message || e);
        if (!isNative) throw e;
        // On native, fall back to individual run() calls for this chunk
        console.log(`[seed] falling back to per-row insert for chunk ${i / CHUNK_SIZE + 1}`);
        for (const item of set) {
          try {
            await CapacitorSQLite.run({
              database: this.dbName,
              statement: item.statement,
              values: item.values,
            });
            insertedTotal++;
          } catch (rowErr: any) {
            console.warn(`[seed] row insert failed (id=${item.values[0]}):`, rowErr?.message);
          }
        }
      }
      onProgress?.(Math.min(i + CHUNK_SIZE, total), total);
      console.log(`[seed] chunk ${i / CHUNK_SIZE + 1}/${chunkCount} done (running total inserted=${insertedTotal})`);
    }

    await this.persist();

    // Verify completion — partial seeds must NOT be marked as a finished
    // migration. The count is taken straight from the canonical table.
    const acisRows = await this.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM products WHERE source = 'ACIS'"
    );
    const finalCount = acisRows[0]?.count ?? 0;
    const expectedAcis = products.filter(p => p.source === 'ACIS').length;
    if (finalCount < expectedAcis) {
      throw new Error(`Seeding incomplete: ${finalCount}/${expectedAcis} ACIS products in DB`);
    }
    console.log(`[seed] verified ${finalCount}/${expectedAcis} ACIS products in DB`);

    // Mark migration finished so seedIfEmpty()/checkVersion() recognise this DB
    // as fully seeded next launch.
    try {
      await this.setMeta('schema_version', String(this.DB_VERSION));
    } catch (e) {
      console.warn('[seed] failed to record schema_version meta:', e);
    }

    await this.rebuildFtsIfAvailable();
  }

  /** Returns true iff a previous seed has been recorded as fully complete. */
  async isFullySeeded(): Promise<boolean> {
    await this.ensureInit();
    const recorded = Number(await this.getMeta('schema_version')) || 0;
    return recorded >= this.DB_VERSION;
  }

  /** Wipes the seed-completion marker so the next seedIfEmpty() forces a re-seed. */
  async clearSeedMarker(): Promise<void> {
    await this.ensureInit();
    try {
      await CapacitorSQLite.run({
        database: this.dbName,
        statement: "DELETE FROM db_meta WHERE key = 'schema_version'",
        values: [],
      });
      await this.persist();
    } catch {}
  }

  get currentDbVersion(): number {
    return this.DB_VERSION;
  }

  async rebuildFtsIfAvailable(): Promise<void> {
    if (this.fts5Available) {
      await this.executeSQL("INSERT INTO products_fts(products_fts) VALUES('rebuild');");
    }
  }

  async run(statement: string, values: any[] = []): Promise<number> {
    await this.ensureInit();
    const ret = await CapacitorSQLite.run({ database: this.dbName, statement, values });
    await this.persist();
    return ret.changes?.changes ?? 0;
  }

  async query<T>(statement: string, values: any[] = []): Promise<T[]> {
    await this.ensureInit();
    const ret: capSQLiteValues = await CapacitorSQLite.query({ database: this.dbName, statement, values });
    let rows = ret.values ?? [];
    // iOS native plugin returns column metadata as the first element
    if (rows.length > 0 && (rows[0] as any)?.ios_columns) {
      rows = rows.slice(1);
    }
    return rows as T[];
  }

  async executeSQL(sql: string): Promise<void> {
    await this.ensureInit();
    await CapacitorSQLite.execute({ database: this.dbName, statements: sql });
    await this.persist();
  }

  private persistPromise: Promise<void> | null = null;

  private async persist(): Promise<void> {
    if (Capacitor.getPlatform() !== 'web') return;
    if (this.persistPromise) return this.persistPromise;
    this.persistPromise = CapacitorSQLite.saveToStore({ database: this.dbName }).finally(() => {
      this.persistPromise = null;
    });
    return this.persistPromise;
  }

  async getAllProducts(activeOnly: boolean = true): Promise<Product[]> {
    let sql = 'SELECT * FROM products';
    if (activeOnly) sql += ' WHERE active = 1';
    sql += ' ORDER BY naziv ASC LIMIT 200';
    return this.query<Product>(sql);
  }

  async getProductById(id: number): Promise<Product | null> {
    const results = await this.query<Product>('SELECT * FROM products WHERE id = ?', [id]);
    return results.length ? results[0] : null;
  }

  /** Returns plausible alternate forms of a scanned 1D code:
   *   - 12-digit UPC-A → also try '0' + code (some scanners decode UPC-A as EAN-13)
   *   - 13-digit EAN-13 with leading 0 → also try the 12-digit form (UPC-A)
   *   - 8-digit EAN-8 → returned as-is
   *   - other strings → returned as-is, no expansion
   */
  private barcodeVariants(code: string): string[] {
    const variants: string[] = [code];
    if (/^\d{12}$/.test(code))       variants.push('0' + code);
    else if (/^0\d{12}$/.test(code)) variants.push(code.slice(1));
    return variants;
  }

  async findProductByBarcode(barcode: string): Promise<Product | null> {
    // Use LIKE with space-padded matching to find barcodes within a space-separated list
    // This handles products that have multiple barcodes stored concatenated.
    const trimmed = barcode.trim();
    if (!trimmed) return null;
    for (const v of this.barcodeVariants(trimmed)) {
      const results = await this.query<Product>(
        `SELECT * FROM products WHERE ' ' || barcode || ' ' LIKE ? AND active = 1 LIMIT 1`,
        [`% ${v} %`]
      );
      if (results.length) return results[0];
    }
    return null;
  }

  async findProductByAnyCode(code: string): Promise<Product | null> {
    // Unified lookup: tries exact barcode/sifra first, then LIKE across both
    // NOTE: no active filter — scanned barcodes should always find their product
    const trimmed = code.trim();
    if (!trimmed) return null;

    // 1) Exact barcode match (handles space-separated multi-barcode + UPC-A/EAN-13 quirks)
    for (const v of this.barcodeVariants(trimmed)) {
      const results = await this.query<Product>(
        `SELECT * FROM products WHERE ' ' || barcode || ' ' LIKE ? LIMIT 1`,
        [`% ${v} %`]
      );
      if (results.length) return results[0];
    }

    // 2) Exact sifra match
    let results = await this.query<Product>('SELECT * FROM products WHERE sifra = ? LIMIT 1', [trimmed]);
    if (results.length) return results[0];

    // 3) LIKE across all fields
    const like = `%${trimmed}%`;
    results = await this.query<Product>(
      `SELECT * FROM products WHERE naziv LIKE ? OR sifra LIKE ? OR barcode LIKE ? LIMIT 1`,
      [like, like, like]
    );
    return results.length ? results[0] : null;
  }

  async findProductBySifra(sifra: string): Promise<Product | null> {
    const results = await this.query<Product>('SELECT * FROM products WHERE sifra = ? AND active = 1 LIMIT 1', [sifra]);
    return results.length ? results[0] : null;
  }

  async searchProducts(query: string, limit: number = 50, offset: number = 0): Promise<Product[]> {
    const q = query?.trim();
    if (!q) {
      return this.query<Product>('SELECT * FROM products WHERE active = 1 ORDER BY naziv ASC LIMIT ? OFFSET ?', [limit, offset]);
    }
    if (!this.fts5Available) {
      const like = `%${q}%`;
      return this.query<Product>(
        `SELECT * FROM products WHERE active = 1 AND (naziv LIKE ? OR sifra LIKE ? OR barcode LIKE ?) ORDER BY naziv ASC LIMIT ? OFFSET ?`,
        [like, like, like, limit, offset]
      );
    }
    const ftsQuery = q.split(/\s+/).map(t => `"${t}"*`).join(' ');
    return this.query<Product>(
      `SELECT p.* FROM products p INNER JOIN products_fts fts ON p.id = fts.rowid WHERE products_fts MATCH ? AND p.active = 1 ORDER BY rank LIMIT ? OFFSET ?`,
      [ftsQuery, limit, offset]
    );
  }

  async searchProductCount(query: string): Promise<number> {
    const q = query?.trim();
    if (!q) {
      const result = await this.query<{ count: number }>('SELECT COUNT(*) as count FROM products WHERE active = 1');
      return result[0]?.count ?? 0;
    }
    if (!this.fts5Available) {
      const like = `%${q}%`;
      const result = await this.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM products WHERE active = 1 AND (naziv LIKE ? OR sifra LIKE ? OR barcode LIKE ?)',
        [like, like, like]
      );
      return result[0]?.count ?? 0;
    }
    const ftsQuery = q.split(/\s+/).map(t => `"${t}"*`).join(' ');
    const result = await this.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM products p INNER JOIN products_fts fts ON p.id = fts.rowid WHERE products_fts MATCH ? AND p.active = 1`,
      [ftsQuery]
    );
    return result[0]?.count ?? 0;
  }

  async insertProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const now = new Date().toISOString();
    await this.run(
      `INSERT INTO products (sifra, barcode, naziv, cena, grupa, jedinicaMere, source, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [product.sifra, product.barcode, product.naziv, product.cena ?? null, product.grupa ?? null,
       product.jedinicaMere ?? null, product.source, now, now]
    );
    const result = await this.query<{ id: number }>('SELECT last_insert_rowid() as id');
    return result[0]?.id ?? 0;
  }

  async updateProduct(id: number, product: Partial<Product>): Promise<void> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];
    if (product.sifra !== undefined) { fields.push('sifra = ?'); values.push(product.sifra); }
    if (product.barcode !== undefined) { fields.push('barcode = ?'); values.push(product.barcode); }
    if (product.naziv !== undefined) { fields.push('naziv = ?'); values.push(product.naziv); }
    if (product.cena !== undefined) { fields.push('cena = ?'); values.push(product.cena); }
    if (product.grupa !== undefined) { fields.push('grupa = ?'); values.push(product.grupa); }
    if (product.jedinicaMere !== undefined) { fields.push('jedinicaMere = ?'); values.push(product.jedinicaMere); }
    if (fields.length === 0) return;
    fields.push('updatedAt = ?');
    values.push(now);
    values.push(id);
    await this.run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async softDeleteProduct(id: number): Promise<void> {
    const now = new Date().toISOString();
    await this.run('UPDATE products SET active = 0, updatedAt = ? WHERE id = ?', [now, id]);
  }

  async deleteAllAcProducts(): Promise<void> {
    await this.executeSQL("DELETE FROM products WHERE source = 'ACIS'");
  }

  async createShoppingList(naziv: string): Promise<ShoppingList> {
    const id = uuidv4();
    const now = new Date().toISOString();
    await this.run('INSERT INTO shopping_lists (id, naziv, createdAt, status) VALUES (?, ?, ?, ?)', [id, naziv, now, 'DRAFT']);
    return { id, naziv, createdAt: now, status: 'DRAFT' };
  }

  async getShoppingList(id: string): Promise<ShoppingList | null> {
    const results = await this.query<ShoppingList>('SELECT * FROM shopping_lists WHERE id = ?', [id]);
    return results.length ? results[0] : null;
  }

  async getAllShoppingLists(): Promise<ShoppingList[]> {
    return this.query<ShoppingList>('SELECT * FROM shopping_lists ORDER BY createdAt DESC');
  }

  async updateShoppingListStatus(id: string, status: ShoppingList['status']): Promise<void> {
    const now = new Date().toISOString();
    if (status === 'READY_FOR_PURCHASE' || status === 'PURCHASED') {
      await this.run('UPDATE shopping_lists SET status = ?, completedAt = ? WHERE id = ?', [status, now, id]);
    } else {
      await this.run('UPDATE shopping_lists SET status = ?, completedAt = NULL WHERE id = ?', [status, id]);
    }
  }

  async updateShoppingListNote(id: string, note: string): Promise<void> {
    await this.run('UPDATE shopping_lists SET note = ? WHERE id = ?', [note, id]);
  }

  async deleteShoppingList(id: string): Promise<void> {
    await this.run('DELETE FROM shopping_list_items WHERE listId = ?', [id]);
    await this.run('DELETE FROM shopping_lists WHERE id = ?', [id]);
  }

  async cloneShoppingList(sourceId: string, newName: string): Promise<ShoppingList> {
    const source = await this.getShoppingList(sourceId);
    if (!source) throw new Error('Source list not found');
    const newList = await this.createShoppingList(newName);
    const items = await this.getShoppingListItems(sourceId);
    for (const item of items) {
      await this.addItemToList(newList.id, item.productId, item.quantity);
    }
    return newList;
  }

  async getItemCountForList(listId: string): Promise<number> {
    const result = await this.query<{ count: number }>('SELECT COUNT(*) as count FROM shopping_list_items WHERE listId = ?', [listId]);
    return result[0]?.count ?? 0;
  }

  async getShoppingListItems(listId: string): Promise<ShoppingListItem[]> {
    return this.query<ShoppingListItem>('SELECT * FROM shopping_list_items WHERE listId = ? ORDER BY id ASC', [listId]);
  }

  async getShoppingListItemsView(listId: string): Promise<any[]> {
    return this.query<any>(
      `SELECT sli.*, p.sifra, p.barcode, p.naziv, p.cena
       FROM shopping_list_items sli INNER JOIN products p ON sli.productId = p.id
       WHERE sli.listId = ? ORDER BY sli.id ASC`,
      [listId]
    );
  }

  async findItemInList(listId: string, productId: number): Promise<ShoppingListItem | null> {
    const results = await this.query<ShoppingListItem>('SELECT * FROM shopping_list_items WHERE listId = ? AND productId = ?', [listId, productId]);
    return results.length ? results[0] : null;
  }

  async addItemToList(listId: string, productId: number, quantity: number = 1, scannedCode: string = ''): Promise<void> {
    const existing = await this.findItemInList(listId, productId);
    if (existing) {
      const newQty = existing.quantity + quantity;
      const code = scannedCode || existing.scannedCode;
      await this.run('UPDATE shopping_list_items SET quantity = ?, scannedCode = ? WHERE id = ?', [newQty, code, existing.id]);
      return;
    }
    const id = uuidv4();
    await this.run(
      'INSERT INTO shopping_list_items (id, listId, productId, quantity, purchasedQuantity, checked, scannedCode) VALUES (?, ?, ?, ?, 0, 0, ?)',
      [id, listId, productId, quantity, scannedCode]
    );
  }

  async removeItemFromList(itemId: string): Promise<void> {
    await this.run('DELETE FROM shopping_list_items WHERE id = ?', [itemId]);
  }

  async updateItemQuantity(itemId: string, quantity: number): Promise<void> {
    await this.run('UPDATE shopping_list_items SET quantity = ? WHERE id = ?', [quantity, itemId]);
  }

  async toggleItemChecked(itemId: string, checked: boolean): Promise<void> {
    await this.run('UPDATE shopping_list_items SET checked = ? WHERE id = ?', [checked ? 1 : 0, itemId]);
  }

  async updatePurchasedQuantity(itemId: string, quantity: number): Promise<void> {
    await this.run('UPDATE shopping_list_items SET purchasedQuantity = ? WHERE id = ?', [quantity, itemId]);
  }

  async getShoppingListsByDate(): Promise<{ date: string; lists: ShoppingList[] }[]> {
    const lists = await this.getAllShoppingLists();
    const grouped = new Map<string, ShoppingList[]>();
    for (const list of lists) {
      const date = list.createdAt.split('T')[0];
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date)!.push(list);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, lists]) => ({ date, lists }));
  }
}
