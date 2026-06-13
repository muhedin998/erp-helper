import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import * as pako from 'pako';

export interface SyncResult {
  success: boolean;
  productCount: number;
  error?: string;
  errorDetails?: string;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private db = inject(DatabaseService);

  private readonly SERVER_URL_KEY = 'sync_server_url';

  /** Get the saved sync server URL from db_meta. */
  async getServerUrl(): Promise<string> {
    return (await this.db.getMeta(this.SERVER_URL_KEY)) || '';
  }

  /** Save the sync server URL to db_meta. */
  async setServerUrl(url: string): Promise<void> {
    await this.db.setMeta(this.SERVER_URL_KEY, url.replace(/\/+$/, ''));
  }

  /** Quick health check — pings the server and returns status + product count. */
  async checkServer(url: string): Promise<{ ok: boolean; productCount?: number; error?: string }> {
    try {
      const baseUrl = url.replace(/\/+$/, '');
      const resp = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
      const data = await resp.json();
      return {
        ok: data.status === 'ok',
        productCount: data.productCount,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Nije moguće povezati se sa serverom' };
    }
  }

  /**
   * Full product sync from the REST server.
   *
   * Pipeline:
   * 1. GET /api/sync/products/count → total estimate for progress
   * 2. GET /api/sync/products → gzipped compact JSON
   * 3. pako.inflate → JSON.parse → map to Product objects
   * 4. Wipe existing ACIS products + batch insert
   */
  async syncProducts(
    url: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<SyncResult> {
    const baseUrl = url.replace(/\/+$/, '');

    // ── Step 1: Get count for progress estimation ──────────────────────
    let totalCount = 0;
    try {
      const countResp = await fetch(`${baseUrl}/api/sync/products/count`);
      if (countResp.ok) {
        const countData = await countResp.json();
        totalCount = countData.count || 0;
      }
    } catch {
      // non-critical — we'll show indeterminate progress
    }

    onProgress?.(0, totalCount || 100);

    // ── Step 2: Download gzipped products ─────────────────────────────
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/sync/products`);
      if (!response.ok) {
        return {
          success: false,
          productCount: 0,
          error: `Greška servera`,
          errorDetails: `HTTP ${response.status}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        productCount: 0,
        error: 'Nije moguće povezati se sa serverom',
        errorDetails: e?.message || String(e),
      };
    }

    // Report ~10% progress — download finished
    onProgress?.(Math.round((totalCount || 47500) * 0.1), totalCount || 47500);

    // ── Step 3: Read response body ────────────────────────────────────
    let compressed: Uint8Array;
    try {
      const buffer = await response.arrayBuffer();
      compressed = new Uint8Array(buffer);
    } catch (e: any) {
      return {
        success: false,
        productCount: 0,
        error: 'Greška pri preuzimanju podataka',
        errorDetails: e?.message || String(e),
      };
    }

    // ── Step 4: Decompress gzip ───────────────────────────────────────
    let json: string;
    try {
      json = pako.inflate(compressed, { to: 'string' }) as string;
    } catch (e: any) {
      return {
        success: false,
        productCount: 0,
        error: 'Greška pri dekompresiji',
        errorDetails: e?.message || String(e),
      };
    }

    // ── Step 5: Parse compact JSON ────────────────────────────────────
    interface CompactProduct {
      id: number;
      s: string;
      b: string;
      n: string;
      c: number | null;
      g: string | null;
      j: string | null;
      src: string;
      a: number;
      ca: string;
      ua: string;
    }

    let rawProducts: CompactProduct[];
    try {
      rawProducts = JSON.parse(json);
    } catch (e: any) {
      return {
        success: false,
        productCount: 0,
        error: 'Greška pri parsiranju podataka',
        errorDetails: e?.message || String(e),
      };
    }

    if (!rawProducts.length) {
      return { success: false, productCount: 0, error: 'Server je vratio prazan katalog' };
    }

    // ── Step 6: Map to full Product objects ───────────────────────────
    const products = rawProducts.map(p => ({
      id: p.id,
      sifra: p.s || '',
      barcode: p.b || '',
      naziv: p.n || '',
      cena: p.c ?? undefined,
      grupa: p.g ?? undefined,
      jedinicaMere: p.j ?? undefined,
      source: 'ACIS' as const,
      active: p.a === 1,
      createdAt: p.ca || '2000-01-01T00:00:00.000000',
      updatedAt: p.ua || '2000-01-01T00:00:00.000000',
    }));

    // ── Step 7: Wipe existing ACIS and batch insert ───────────────────
    try {
      await this.db.deleteAllAcProducts();

      const syncProgress = (done: number, total: number) => {
        // First 10% was download, remaining 90% is insert
        const pct = 10 + Math.round((done / total) * 90);
        onProgress?.(Math.round((pct / 100) * (totalCount || products.length)), totalCount || products.length);
      };

      await this.db.batchInsertProducts(products, syncProgress);
    } catch (e: any) {
      return {
        success: false,
        productCount: 0,
        error: 'Greška pri upisu u bazu',
        errorDetails: e?.message || String(e),
      };
    }

    onProgress?.(totalCount || products.length, totalCount || products.length);
    return { success: true, productCount: products.length };
  }
}
