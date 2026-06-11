import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { Product } from '../models/product.model';
import { DatabaseService } from '../database/database.service';

interface ProductState {
  products: Product[];
  selectedProduct: Product | null;
  loading: boolean;
  searchQuery: string;
  totalCount: number;
  currentPage: number;
}

const initialState: ProductState = {
  products: [],
  selectedProduct: null,
  loading: false,
  searchQuery: '',
  totalCount: 0,
  currentPage: 0,
};

const PAGE_SIZE = 50;

export const ProductStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ products, searchQuery, totalCount }) => ({
    filteredProducts: computed(() => products()),
    productCount: computed(() => totalCount()),
    hasMore: computed(() => products().length < totalCount()),
  })),
  withMethods((store, db = inject(DatabaseService)) => ({
    async loadProducts(page: number = 0): Promise<void> {
      patchState(store, { loading: true });
      const products = await db.getAllProducts();
      const count = products.length;
      patchState(store, { products, totalCount: count, currentPage: 0, loading: false, searchQuery: '' });
    },

    async searchProducts(query: string, page: number = 0): Promise<void> {
      patchState(store, { searchQuery: query, loading: true });
      const offset = page * PAGE_SIZE;
      const [products, count] = await Promise.all([
        db.searchProducts(query, PAGE_SIZE, offset),
        db.searchProductCount(query),
      ]);
      patchState(store, { products, totalCount: count, currentPage: page, loading: false });
    },

    async searchProductsResult(query: string): Promise<Product[]> {
      return db.searchProducts(query, 5, 0);
    },

    async loadMore(): Promise<void> {
      const query = store.searchQuery();
      const nextPage = store.currentPage() + 1;
      const offset = nextPage * PAGE_SIZE;
      const more = await db.searchProducts(query, PAGE_SIZE, offset);
      patchState(store, { products: [...store.products(), ...more], currentPage: nextPage });
    },

    async getProductById(id: number): Promise<Product | null> {
      return db.getProductById(id);
    },

    async findProductByBarcode(barcode: string): Promise<Product | null> {
      return db.findProductByBarcode(barcode);
    },

    async findProductByAnyCode(code: string): Promise<Product | null> {
      return db.findProductByAnyCode(code);
    },

    async findProductBySifra(sifra: string): Promise<Product | null> {
      return db.findProductBySifra(sifra);
    },

    selectProduct(product: Product | null): void {
      patchState(store, { selectedProduct: product });
    },

    async addProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
      const id = await db.insertProduct(product);
      return id;
    },

    async updateProduct(id: number, changes: Partial<Product>): Promise<void> {
      await db.updateProduct(id, changes);
      const query = store.searchQuery();
      await this.searchProducts(query);
    },

    async deleteProduct(id: number): Promise<void> {
      await db.softDeleteProduct(id);
      const query = store.searchQuery();
      await this.searchProducts(query);
    },

    setSearchQuery(query: string): void {
      patchState(store, { searchQuery: query });
    },
  }))
);
