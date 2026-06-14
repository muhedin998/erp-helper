import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import * as pako from 'pako';

export interface SyncResult {
  success: boolean;
  productCount: number;
  isDelta?: boolean;
  deactivatedCount?: number;
  error?: string;
  errorDetails?: string;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private db = inject(DatabaseService);

  private readonly SERVER_URL_KEY = 'sync_server_url';
  private readonly LAST_SYNC_KEY = 'sync_last_at';

  /** Get the saved sync server URL from db_meta. */
  async getServerUrl(): Promise<string> {
    return (await this.db.getMeta(this.SERVER_URL_KEY)) || '';
  }

  /** Save the sync server URL to db_meta. */
  async setServerUrl(url: string): Promise<void> {
    await this.db.setMeta(this.SERVER_URL_KEY, url.replace(/\/+$/, ''));
  }

  /** Get the timestamp of the last successful sync (ISO string). */
  async getLastSyncAt(): Promise<string> {
    return (await this.db.getMeta(this.LAST_SYNC_KEY)) || '';
  }

  /** Save the timestamp of the last successful sync. */
  async setLastSyncAt(iso: string): Promise<void> {
    await this.db.setMeta(this.LAST_SYNC_KEY, iso);
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
   * Sync products from the REST server.
   *
   * - First sync (no lastSyncAt): full download (wipe + insert all).
   * - Subsequent syncs: delta download (only changed products since last sync).
   *
   * Pipeline:
   * 1. GET /api/sync/products[?since=TIMESTAMP] → gzipped compact JSON
   * 2. pako.inflate → JSON.parse → map to Product objects
   * 3. Upsert into local DB (INSERT OR REPLACE)
   * 4. Handle deactivated products (DELETE by IDs)
   * 5. Save new lastSyncAt from X-Server-Time header
   */
  async syncProducts(
    url: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<SyncResult> {
    const baseUrl = url.replace(/\/+$/, '');
    const lastSyncAt = await this.getLastSyncAt();
    const isDelta = !!lastSyncAt;

    // ── Build URL ──────────────────────────────────────────────────────
    let fetchUrl = `${baseUrl}/api/sync/products`;
    if (isDelta) {
      fetchUrl += `?since=${encodeURIComponent(lastSyncAt)}`;
    }

    // ── Step 1: Download gzipped products ─────────────────────────────
    onProgress?.(0, 1);

    let response: Response;
    try {
      response = await fetch(fetchUrl);
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

    // ── Step 2: Read response body ────────────────────────────────────
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

    // ── Step 3: Decompress gzip ───────────────────────────────────────
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

    // ── Step 4: Parse compact JSON ────────────────────────────────────
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

    // ── Step 5: Map to Product objects ────────────────────────────────
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

    // ── Step 6: Parse deactivated IDs ─────────────────────────────────
    const deactivatedHeader = response.headers.get('X-Deactivated-IDs');
    const deactivatedIds: number[] = deactivatedHeader
      ? deactivatedHeader.split(',').map(Number).filter(n => n > 0)
      : [];

    // ── Step 7: Write to database ─────────────────────────────────────
    try {
      if (isDelta) {
        // Delta: upsert changed products (INSERT OR REPLACE), delete deactivated
        if (products.length > 0) {
          await this.db.batchInsertProducts(products, (done, total) => {
            onProgress?.(done, total);
          });
        }
        if (deactivatedIds.length > 0) {
          await this.db.deleteProductsByIds(deactivatedIds);
        }
      } else {
        // Full sync: wipe all ACIS and re-insert
        await this.db.deleteAllAcProducts();

        const syncProgress = (done: number, total: number) => {
          onProgress?.(done, total);
        };

        await this.db.batchInsertProducts(products, syncProgress);
      }
    } catch (e: any) {
      return {
        success: false,
        productCount: 0,
        error: 'Greška pri upisu u bazu',
        errorDetails: e?.message || String(e),
      };
    }

    // ── Step 8: Save lastSyncAt ───────────────────────────────────────
    const serverTime = response.headers.get('X-Server-Time');
    if (serverTime) {
      await this.setLastSyncAt(serverTime);
    }

    onProgress?.(products.length, products.length);
    return {
      success: true,
      productCount: products.length,
      isDelta,
      deactivatedCount: deactivatedIds.length,
    };
  }
}
