export interface ShoppingList {
  id: string;
  naziv: string;
  createdAt: string;
  completedAt?: string;
  status: 'DRAFT' | 'READY_FOR_PURCHASE' | 'PURCHASED';
  note?: string;
}

export interface ShoppingListItem {
  id: string;
  listId: string;
  productId: number;
  quantity: number;
  purchasedQuantity: number;
  checked: boolean;
  scannedCode: string;
}

export interface ShoppingListItemView {
  id: string;
  listId: string;
  productId: number;
  sifra: string;
  barcode: string;
  naziv: string;
  cena?: number;
  quantity: number;
  purchasedQuantity: number;
  checked: boolean;
  scannedCode: string;
}
