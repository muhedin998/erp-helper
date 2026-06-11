import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Product } from '../models/product.model';
import * as pako from 'pako';

export interface SeedResult {
  success: boolean;
  productCount: number;
  error?: string;
  errorDetails?: string;
}

@Injectable({ providedIn: 'root' })
export class SeedDataService {
  private db = inject(DatabaseService);
  private lastError: string | null = null;
  private lastErrorDetails: string | null = null;

  getLastError(): string | null { return this.lastError; }
  getLastErrorDetails(): string | null { return this.lastErrorDetails; }

  async seedIfEmpty(onProgress?: (done: number, total: number) => void): Promise<SeedResult> {
    // Source of truth: the schema_version meta marker, written ONLY after a
    // verified-complete seed in batchInsertProducts. This avoids the previous
    // "if any ACIS row exists, assume we're done" bug that left partial seeds
    // (e.g. from the old per-row insert loop dying on mobile Safari) wedged
    // in the DB forever.
    let alreadySeeded = false;
    try {
      alreadySeeded = await this.db.isFullySeeded();
    } catch (e) {
      console.warn('seedIfEmpty: isFullySeeded check failed, will attempt seed:', e);
    }

    if (alreadySeeded) {
      let existingCount = 0;
      try {
        const countResult = await this.db.query<{ count: number }>("SELECT COUNT(*) as count FROM products WHERE source = 'ACIS'");
        existingCount = countResult[0]?.count ?? 0;
      } catch {}
      return { success: true, productCount: existingCount };
    }

    const result = await this.loadSeedProducts();
    if (!result.success) {
      this.lastError = result.error!;
      this.lastErrorDetails = result.errorDetails!;
      return result;
    }

    if (result.productCount === 0) {
      return { success: true, productCount: 0 }; // no products to seed — empty catalog
    }

    try {
      await this.db.batchInsertProducts(result.products!, onProgress);
    } catch (e: any) {
      this.lastError = 'Failed to insert seed products into database';
      this.lastErrorDetails = e?.message || String(e);
      console.error('seedIfEmpty: batch insert failed:', e);
      return { success: false, productCount: 0, error: this.lastError, errorDetails: this.lastErrorDetails || undefined };
    }

    let finalCount = 0;
    try {
      const finalResult = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM products');
      finalCount = finalResult[0]?.count ?? result.productCount;
    } catch {}

    console.log(`Seed complete: ${finalCount} products in catalog`);
    return { success: true, productCount: finalCount };
  }

  private async loadSeedProducts(): Promise<SeedResult & { products?: (Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id: number; createdAt: string; updatedAt: string })[] }> {
    try {
      // Fetch gzip-compressed JSON (~1.6 MB) instead of raw SQLite (~10.7 MB)
      // The gzipped JSON is much more reliable over self-signed HTTPS on iOS Safari
      const response = await fetch('assets/seed-products.json.gz');
      if (!response.ok) {
        const msg = `seed-products.json.gz fetch returned HTTP ${response.status}`;
        console.error(msg);
        return {
          success: false, productCount: 0,
          error: 'Ne mogu da učitam katalog.',
          errorDetails: `${msg}. Pokušajte da osvežite stranicu ili proverite konekciju.`
        };
      }

      let compressed: Uint8Array;
      try {
        const buffer = await response.arrayBuffer();
        compressed = new Uint8Array(buffer);
      } catch (abErr: any) {
        return {
          success: false, productCount: 0,
          error: 'Ne mogu da pročitam katalog.',
          errorDetails: `arrayBuffer() failed: ${abErr?.message || abErr}.`
        };
      }

      // Decompress gzip
      let json: string;
      try {
        const decompressed = pako.inflate(compressed, { to: 'string' });
        json = decompressed as string;
      } catch (gzErr: any) {
        return {
          success: false, productCount: 0,
          error: 'Greška pri dekompresiji kataloga.',
          errorDetails: `${gzErr?.message || gzErr}`
        };
      }

      // Parse JSON (compact format with short field names)
      interface CompactProduct {
        id: number; s: string; b: string; n: string;
        c: number | null; g: string | null; j: string | null;
        src: string; a: number;
        ca: string; ua: string;
      }

      let rawProducts: CompactProduct[];
      try {
        rawProducts = JSON.parse(json);
      } catch (jsonErr: any) {
        return {
          success: false, productCount: 0,
          error: 'Greška pri parsiranju kataloga.',
          errorDetails: `${jsonErr?.message || jsonErr}`
        };
      }

      if (!rawProducts.length) {
        return { success: false, productCount: 0, error: 'Katalog je prazan.', errorDetails: 'JSON loaded but no products found.' };
      }

      const products = rawProducts.map(p => ({
        id: p.id,
        sifra: p.s || '',
        barcode: p.b || '',
        naziv: p.n || '',
        cena: p.c ?? undefined,
        grupa: p.g ?? undefined,
        jedinicaMere: p.j ?? undefined,
        source: p.src as 'ACIS' | 'MANUAL',
        active: p.a === 1,
        createdAt: p.ca || '2000-01-01T00:00:00.000000',
        updatedAt: p.ua || '2000-01-01T00:00:00.000000',
      }));

      console.log(`Loaded ${products.length} products from compressed JSON`);
      return { success: true, productCount: products.length, products };
    } catch (e: any) {
      console.error('Failed to load seed products:', e);
      return {
        success: false, productCount: 0,
        error: 'Greška pri učitavanju kataloga.',
        errorDetails: `${e?.name || 'Error'}: ${e?.message || e}`
      };
    }
  }
}
