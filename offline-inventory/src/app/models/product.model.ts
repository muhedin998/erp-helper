export interface Product {
  id: number;
  sifra: string;
  barcode: string;
  naziv: string;
  cena?: number;
  grupa?: string;
  jedinicaMere?: string;
  source: 'ACIS' | 'MANUAL';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
