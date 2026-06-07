import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { Product } from '../models/product.model';
import { DatabaseService } from '../database/database.service';

interface ProductState {
  products: Product[];
  selectedProduct: Product | null;
  loading: boolean;
  searchQuery: string;
}

const initialState: ProductState = {
  products: [],
  selectedProduct: null,
  loading: false,
  searchQuery: '',
};

export const ProductStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ products, searchQuery }) => ({
    filteredProducts: computed(() => {
      const query = searchQuery().toLowerCase().trim();
      if (!query) return products();
      return products().filter(
        p => p.naziv.toLowerCase().includes(query) ||
             p.sifra.toLowerCase().includes(query) ||
             p.barcode.toLowerCase().includes(query)
      );
    }),
    productCount: computed(() => products().length),
  })),
  withMethods((store, db = inject(DatabaseService)) => ({
    async loadProducts(): Promise<void> {
      patchState(store, { loading: true });
      const products = await db.getAllProducts();
      patchState(store, { products, loading: false });
    },

    async searchProducts(query: string): Promise<void> {
      patchState(store, { searchQuery: query, loading: true });
      const products = await db.searchProducts(query);
      patchState(store, { products, loading: false });
    },

    async getProductById(id: number): Promise<Product | null> {
      return db.getProductById(id);
    },

    async findProductByBarcode(barcode: string): Promise<Product | null> {
      return db.findProductByBarcode(barcode);
    },

    async findProductBySifra(sifra: string): Promise<Product | null> {
      return db.findProductBySifra(sifra);
    },

    selectProduct(product: Product | null): void {
      patchState(store, { selectedProduct: product });
    },

    async addProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
      const id = await db.insertProduct(product);
      await this.loadProducts();
      return id;
    },

    async updateProduct(id: number, changes: Partial<Product>): Promise<void> {
      await db.updateProduct(id, changes);
      await this.loadProducts();
    },

    async deleteProduct(id: number): Promise<void> {
      await db.softDeleteProduct(id);
      await this.loadProducts();
    },

    setSearchQuery(query: string): void {
      patchState(store, { searchQuery: query });
    },
  }))
);
