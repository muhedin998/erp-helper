import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { ShoppingList, ShoppingListItem, ShoppingListItemView } from '../models/shopping-list.model';
import { DatabaseService } from '../database/database.service';

interface ShoppingListState {
  activeList: ShoppingList | null;
  items: ShoppingListItemView[];
  allLists: ShoppingList[];
  history: { date: string; lists: ShoppingList[] }[];
  loading: boolean;
}

const initialState: ShoppingListState = {
  activeList: null,
  items: [],
  allLists: [],
  history: [],
  loading: false,
};

export const ShoppingListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ activeList, items }) => ({
    itemCount: computed(() => items().length),
    totalQuantity: computed(() => items().reduce((sum, i) => sum + i.quantity, 0)),
    totalPrice: computed(() => items().reduce((sum, i) => sum + (i.cena ?? 0) * i.quantity, 0)),
    checkedCount: computed(() => items().filter(i => i.checked).length),
    purchaseProgress: computed(() => {
      const total = items().length;
      if (total === 0) return 0;
      return Math.round((items().filter(i => i.checked).length / total) * 100);
    }),
    isDraft: computed(() => activeList()?.status === 'DRAFT'),
    unboughtItems: computed(() => items().filter(i => i.purchasedQuantity < i.quantity)),
    hasUnbought: computed(() => items().some(i => i.purchasedQuantity < i.quantity)),
    sortedItems: computed(() => {
      const all = items();
      if (activeList()?.status !== 'PURCHASED') return all;
      const unbought = all.filter(i => i.purchasedQuantity < i.quantity);
      const bought = all.filter(i => i.purchasedQuantity >= i.quantity);
      return [...unbought, ...bought];
    }),
  })),
  withMethods((store, db = inject(DatabaseService)) => ({
    async loadAllLists(): Promise<void> {
      patchState(store, { loading: true });
      const allLists = await db.getAllShoppingLists();
      patchState(store, { allLists, loading: false });
    },

    async loadHistory(): Promise<void> {
      patchState(store, { loading: true });
      const history = await db.getShoppingListsByDate();
      patchState(store, { history, loading: false });
    },

    async setActiveList(listId: string | null): Promise<void> {
      if (!listId) {
        patchState(store, { activeList: null, items: [] });
        return;
      }
      patchState(store, { loading: true });
      const list = await db.getShoppingList(listId);
      if (!list) {
        patchState(store, { activeList: null, items: [], loading: false });
        return;
      }
      const items = await db.getShoppingListItemsView(listId);
      patchState(store, { activeList: list, items, loading: false });
    },

    async createList(naziv: string): Promise<ShoppingList> {
      const list = await db.createShoppingList(naziv);
      await this.loadAllLists();
      await this.loadHistory();
      await this.setActiveList(list.id);
      return list;
    },

    async finishList(): Promise<void> {
      const list = store.activeList();
      if (!list) return;
      await db.updateShoppingListStatus(list.id, 'READY_FOR_PURCHASE');
      await this.setActiveList(list.id);
      await this.loadAllLists();
      await this.loadHistory();
    },

    async markAsPurchased(): Promise<void> {
      const list = store.activeList();
      if (!list) return;
      await db.updateShoppingListStatus(list.id, 'PURCHASED');
      await this.setActiveList(list.id);
      await this.loadAllLists();
      await this.loadHistory();
    },

    async cloneList(sourceId: string, customName?: string): Promise<ShoppingList> {
      const source = await db.getShoppingList(sourceId);
      if (!source) throw new Error('Source list not found');
      const newName = customName || `${source.naziv} (kopija)`;
      const list = await db.cloneShoppingList(sourceId, newName);
      await this.loadAllLists();
      await this.loadHistory();
      return list;
    },

    async cloneUnboughtItems(sourceId: string, customName?: string): Promise<ShoppingList> {
      const source = await db.getShoppingList(sourceId);
      if (!source) throw new Error('Source list not found');
      const newName = customName || `${source.naziv} (nekupljeno)`;
      const list = await db.cloneUnboughtItems(sourceId, newName);
      await this.loadAllLists();
      await this.loadHistory();
      return list;
    },

    async deleteList(id: string): Promise<void> {
      await db.deleteShoppingList(id);
      if (store.activeList()?.id === id) {
        patchState(store, { activeList: null, items: [] });
      }
      await this.loadAllLists();
      await this.loadHistory();
    },

    async updateListNote(note: string): Promise<void> {
      const list = store.activeList();
      if (!list) return;
      await db.updateShoppingListNote(list.id, note);
      await this.setActiveList(list.id);
    },

    async addItemToActiveList(productId: number, quantity: number = 1, scannedCode: string = ''): Promise<void> {
      const list = store.activeList();
      if (!list) return;
      await db.addItemToList(list.id, productId, quantity, scannedCode);
      await this.setActiveList(list.id);
    },

    async removeItem(itemId: string): Promise<void> {
      await db.removeItemFromList(itemId);
      const list = store.activeList();
      if (list) await this.setActiveList(list.id);
    },

    async updateItemQuantity(itemId: string, quantity: number): Promise<void> {
      if (quantity <= 0) {
        await this.removeItem(itemId);
        return;
      }
      await db.updateItemQuantity(itemId, quantity);
      const list = store.activeList();
      if (list) await this.setActiveList(list.id);
    },

    async toggleChecked(itemId: string, checked: boolean): Promise<void> {
      await db.toggleItemChecked(itemId, checked);
      const list = store.activeList();
      if (list) {
        const items = await db.getShoppingListItemsView(list.id);
        patchState(store, { items });
      }
    },

    async updatePurchasedQuantity(itemId: string, purchasedQty: number): Promise<void> {
      await db.updatePurchasedQuantity(itemId, purchasedQty);
      const list = store.activeList();
      if (list) {
        const items = await db.getShoppingListItemsView(list.id);
        patchState(store, { items });
      }
    },
  }))
);
