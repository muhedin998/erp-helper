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
      await CapacitorSQLite.createConnection({ database: this.dbName, readonly: false });
    } catch (e: any) {
      console.error('createConnection failed:', e?.message || e);
      throw e;
    }

    try {
      await CapacitorSQLite.open({ database: this.dbName, readonly: false });
    } catch (e: any) {
      console.error('open failed:', e?.message || e);
      throw e;
    }

    await this.createTables();
    this.initialized = true;
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
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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
          FOREIGN KEY (listId) REFERENCES shopping_lists(id) ON DELETE CASCADE,
          FOREIGN KEY (productId) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_list_items(listId);
        CREATE INDEX IF NOT EXISTS idx_shopping_items_product ON shopping_list_items(productId);
      `,
    });
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
    return (ret.values ?? []) as T[];
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
    sql += ' ORDER BY naziv ASC';
    return this.query<Product>(sql);
  }

  async getProductById(id: number): Promise<Product | null> {
    const results = await this.query<Product>('SELECT * FROM products WHERE id = ?', [id]);
    return results.length ? results[0] : null;
  }

  async findProductByBarcode(barcode: string): Promise<Product | null> {
    const results = await this.query<Product>('SELECT * FROM products WHERE barcode = ? AND active = 1 LIMIT 1', [barcode]);
    return results.length ? results[0] : null;
  }

  async findProductBySifra(sifra: string): Promise<Product | null> {
    const results = await this.query<Product>('SELECT * FROM products WHERE sifra = ? AND active = 1 LIMIT 1', [sifra]);
    return results.length ? results[0] : null;
  }

  async searchProducts(searchTerm: string): Promise<Product[]> {
    const q = searchTerm.trim();
    if (!q) return this.getAllProducts();
    const like = `%${q}%`;
    return this.query<Product>(
      'SELECT * FROM products WHERE active = 1 AND (naziv LIKE ? OR sifra LIKE ? OR barcode LIKE ?) ORDER BY naziv ASC',
      [like, like, like]
    );
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

  async addItemToList(listId: string, productId: number, quantity: number = 1): Promise<void> {
    const existing = await this.findItemInList(listId, productId);
    if (existing) {
      await this.run('UPDATE shopping_list_items SET quantity = ? WHERE id = ?', [existing.quantity + quantity, existing.id]);
      return;
    }
    const id = uuidv4();
    await this.run(
      'INSERT INTO shopping_list_items (id, listId, productId, quantity, purchasedQuantity, checked) VALUES (?, ?, ?, ?, 0, 0)',
      [id, listId, productId, quantity]
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
