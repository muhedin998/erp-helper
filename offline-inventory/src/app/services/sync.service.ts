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

@Injectable({ providedIn: 'root' })
export class SyncService {
  private db = inject(DatabaseService);

  private readonly SERVER_URL_KEY = 'sync_server_url';
  private readonly LAST_SYNC_KEY = 'sync_last_at';
  private readonly LAST_IP_OCTETS_KEY = 'sync_last_ip_octets';

  async getServerUrl(): Promise<string> {
    return (await this.db.getMeta(this.SERVER_URL_KEY)) || '';
  }

  async setServerUrl(url: string): Promise<void> {
    await this.db.setMeta(this.SERVER_URL_KEY, url.replace(/\/+$/, ''));
  }

  async getLastSyncAt(): Promise<string> {
    return (await this.db.getMeta(this.LAST_SYNC_KEY)) || '';
  }

  async setLastSyncAt(iso: string): Promise<void> {
    await this.db.setMeta(this.LAST_SYNC_KEY, iso);
  }

  async getLastIpOctets(): Promise<[string, string] | null> {
    const raw = await this.db.getMeta(this.LAST_IP_OCTETS_KEY);
    if (!raw) return null;
    const parts = raw.split('.');
    return parts.length === 2 ? [parts[0], parts[1]] : null;
  }

  async setLastIpOctets(octet3: string, octet4: string): Promise<void> {
    await this.db.setMeta(this.LAST_IP_OCTETS_KEY, `${octet3}.${octet4}`);
  }

  async checkServer(url: string): Promise<{ ok: boolean; productCount?: number; error?: string }> {
    try {
      const baseUrl = url.replace(/\/+$/, '');
      console.log(`[sync] Checking server: ${baseUrl}/api/health`);
      const resp = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
      const data = await resp.json();
      console.log(`[sync] Server OK — ${data.productCount} products, v${data.serverVersion}`);
      return { ok: data.status === 'ok', productCount: data.productCount };
    } catch (e: any) {
      console.error(`[sync] Server check failed:`, e?.message || e);
      return { ok: false, error: e?.message || 'Nije moguće povezati se sa serverom' };
    }
  }

  async syncProducts(
    url: string,
    onProgress?: (done: number, total: number, stage?: string) => void,
  ): Promise<SyncResult> {
    const baseUrl = url.replace(/\/+$/, '');
    const lastSyncAt = await this.getLastSyncAt();
    const isDelta = !!lastSyncAt;
    const mode = isDelta ? 'DELTA' : 'FULL';

    console.log(`[sync] Starting ${mode} sync, server=${baseUrl}` + (isDelta ? `, since=${lastSyncAt}` : ''));

    // ── 1. Get expected count (full sync only, for progress bar) ─────
    let totalCount = 0;
    if (!isDelta) {
      try {
        const countResp = await fetch(`${baseUrl}/api/sync/products/count`);
        if (countResp.ok) {
          totalCount = (await countResp.json()).count || 0;
          console.log(`[sync] Server has ${totalCount} products`);
        }
      } catch { /* non-critical */ }
    }

    // ── 2. Download ──────────────────────────────────────────────────
    const fetchUrl = isDelta
      ? `${baseUrl}/api/sync/products?since=${encodeURIComponent(lastSyncAt)}`
      : `${baseUrl}/api/sync/products`;

    const t0 = performance.now();
    onProgress?.(0, totalCount || 1, 'Preuzimanje...');

    let response: Response;
    try {
      console.log(`[sync] Downloading from ${fetchUrl}`);
      response = await fetch(fetchUrl, {
        signal: AbortSignal.timeout(10 * 60 * 1000), // 10 min hard limit
      });
      if (!response.ok) {
        return { success: false, productCount: 0, error: 'Greška servera', errorDetails: `HTTP ${response.status}` };
      }
    } catch (e: any) {
      console.error(`[sync] Download failed:`, e?.message || e);
      return { success: false, productCount: 0, error: 'Nije moguće povezati se sa serverom', errorDetails: e?.message || String(e) };
    }

    const tDownload = performance.now();
    const contentLength = Number(response.headers.get('Content-Length') || 0);
    console.log(`[sync] Download done in ${((tDownload - t0) / 1000).toFixed(1)}s, ${(contentLength / 1024).toFixed(0)} KB`);

    // ── 3. Read body ─────────────────────────────────────────────────
    // Use ReadableStream reader instead of arrayBuffer() — iOS WKWebView can
    // silently hang on arrayBuffer() with large chunked (streaming) responses.
    onProgress?.(Math.round((totalCount || 47000) * 0.05), totalCount || 47000, 'Čitanje...');

    let compressed: Uint8Array;
    try {
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) {
            chunks.push(value);
            totalBytes += value.length;
          }
        }
        compressed = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          compressed.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        // Fallback for platforms without ReadableStream body
        compressed = new Uint8Array(await response.arrayBuffer());
      }
      console.log(`[sync] Read ${(compressed.length / 1024).toFixed(0)} KB`);
    } catch (e: any) {
      return { success: false, productCount: 0, error: 'Greška pri preuzimanju', errorDetails: e?.message || String(e) };
    }

    // ── 4. Decompress ────────────────────────────────────────────────
    onProgress?.(Math.round((totalCount || 47000) * 0.08), totalCount || 47000, 'Dekompresija...');

    let json: string;
    try {
      json = pako.inflate(compressed, { to: 'string' }) as string;
      console.log(`[sync] Decompressed: ${(json.length / 1024 / 1024).toFixed(1)} MB JSON`);
    } catch (gzErr: any) {
      // Platform (iOS/Android WebView) may have already decompressed the body
      console.warn(`[sync] gzip decompress failed, trying as plain text: ${gzErr?.message || gzErr}`);
      try {
        json = new TextDecoder().decode(compressed);
        // Validate it's actually JSON
        JSON.parse(json);
        console.log(`[sync] Using platform-decompressed body: ${(json.length / 1024 / 1024).toFixed(1)} MB`);
      } catch {
        return { success: false, productCount: 0, error: 'Greška pri dekompresiji', errorDetails: gzErr?.message || String(gzErr) };
      }
    }

    // ── 5. Parse JSON ────────────────────────────────────────────────
    onProgress?.(Math.round((totalCount || 47000) * 0.10), totalCount || 47000, 'Parsiranje...');

    let rawProducts: CompactProduct[];
    try {
      rawProducts = JSON.parse(json);
      console.log(`[sync] Parsed ${rawProducts.length} products`);
    } catch (e: any) {
      return { success: false, productCount: 0, error: 'Greška pri parsiranju', errorDetails: e?.message || String(e) };
    }

    if (!rawProducts.length && !isDelta) {
      return { success: false, productCount: 0, error: 'Server je vratio prazan katalog' };
    }

    const tParse = performance.now();
    console.log(`[sync] Parse+decompress in ${((tParse - tDownload) / 1000).toFixed(1)}s`);

    // ── 6. Map to Product objects ────────────────────────────────────
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

    // ── 7. Deactivated IDs ───────────────────────────────────────────
    const deactivatedIds: number[] = (response.headers.get('X-Deactivated-IDs') || '')
      .split(',').map(Number).filter(n => n > 0);

    // ── 8. Write to database ─────────────────────────────────────────
    try {
      if (isDelta) {
        console.log(`[sync] Delta upsert: ${products.length} products, ${deactivatedIds.length} to deactivate`);
        if (products.length > 0) {
          await this.db.batchInsertProducts(products, (done, total) => {
            onProgress?.(done, total, 'Upisivanje...');
          });
        }
        if (deactivatedIds.length > 0) {
          console.log(`[sync] Deleting ${deactivatedIds.length} deactivated products`);
          await this.db.deleteProductsByIds(deactivatedIds);
        }
      } else {
        // Full sync: upsert everything — INSERT OR REPLACE updates existing
        // products in place, avoiding FK constraint issues from deleting products
        // referenced by shopping list items.
        console.log(`[sync] Full sync: upserting ${products.length} products...`);
        await this.db.batchInsertProducts(products, (done, total) => {
          onProgress?.(done, total, `Upisivanje ${done}/${total}`);
        });
      }
    } catch (e: any) {
      console.error(`[sync] DB write failed:`, e?.message || e);
      return { success: false, productCount: 0, error: 'Greška pri upisu u bazu', errorDetails: e?.message || String(e) };
    }

    const tDb = performance.now();
    console.log(`[sync] DB write in ${((tDb - tParse) / 1000).toFixed(1)}s`);

    // ── 9. Save lastSyncAt ───────────────────────────────────────────
    const serverTime = response.headers.get('X-Server-Time');
    if (serverTime) {
      await this.setLastSyncAt(serverTime);
      console.log(`[sync] Saved lastSyncAt = ${serverTime}`);
    }

    const totalTime = (performance.now() - t0) / 1000;
    onProgress?.(totalCount || products.length, totalCount || products.length, 'Gotovo!');
    console.log(`[sync] ${mode} sync complete: ${products.length} products, ${deactivatedIds.length} deactivated, ${totalTime.toFixed(1)}s total`);

    return {
      success: true,
      productCount: products.length,
      isDelta,
      deactivatedCount: deactivatedIds.length,
    };
  }
}
