import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../database/database.service';

@Injectable({ providedIn: 'root' })
export class MockDataService {
  private db = inject(DatabaseService);

  private mockProducts = [
    { sifra: '1001', barcode: '8606101000019', naziv: 'Coca Cola 0.5l', cena: 95, grupa: 'Bezalkoholna pića', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1002', barcode: '8606101000026', naziv: 'Smoki 100g', cena: 65, grupa: 'Grickalice', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1003', barcode: '8606101000033', naziv: 'Mleko 1l', cena: 150, grupa: 'Mlečni proizvodi', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1004', barcode: '8606101000040', naziv: 'Hleb beli 500g', cena: 70, grupa: 'Pekarski proizvodi', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1005', barcode: '8606101000057', naziv: 'Jogurt 1.5l', cena: 180, grupa: 'Mlečni proizvodi', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1006', barcode: '8606101000064', naziv: 'Kafa Grand 200g', cena: 420, grupa: 'Topli napici', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1007', barcode: '8606101000071', naziv: 'Čips Chipsy 150g', cena: 155, grupa: 'Grickalice', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1008', barcode: '8606101000088', naziv: 'Kečap 500ml', cena: 230, grupa: 'Začini', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1009', barcode: '8606101000095', naziv: 'Voda Rosa 1.5l', cena: 65, grupa: 'Bezalkoholna pića', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1010', barcode: '8606101000101', naziv: 'Plazma keks 300g', cena: 210, grupa: 'Slatkiši', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1011', barcode: '8606101000118', naziv: 'Pivo Jelen 0.5l', cena: 85, grupa: 'Alkoholna pića', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1012', barcode: '8606101000125', naziv: 'Kisela pavlaka 400ml', cena: 120, grupa: 'Mlečni proizvodi', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1013', barcode: '8606101000132', naziv: 'Sir trapist 1kg', cena: 890, grupa: 'Mlečni proizvodi', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1014', barcode: '8606101000149', naziv: 'Salama 100g', cena: 190, grupa: 'Mesne prerađevine', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1015', barcode: '8606101000156', naziv: 'Jaja 10 kom', cena: 280, grupa: 'Mlečni proizvodi', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1016', barcode: '8606101000163', naziv: 'Brašno T-500 1kg', cena: 75, grupa: 'Osnovne namirnice', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1017', barcode: '8606101000170', naziv: 'Šećer 1kg', cena: 95, grupa: 'Osnovne namirnice', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1018', barcode: '8606101000187', naziv: 'Ulje 1l', cena: 190, grupa: 'Osnovne namirnice', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1019', barcode: '8606101000194', naziv: 'So 1kg', cena: 55, grupa: 'Začini', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1020', barcode: '8606101000200', naziv: 'Deterdžent za sudove 1l', cena: 340, grupa: 'Hemija', jedinicaMere: 'kom', source: 'ACIS' as const },
    { sifra: '1021', barcode: '8606101000217', naziv: 'Toalet papir 10 rol', cena: 220, grupa: 'Higijena', jedinicaMere: 'pak', source: 'MANUAL' as const },
    { sifra: '1022', barcode: '8606101000224', naziv: 'Sapun tečni 500ml', cena: 180, grupa: 'Higijena', jedinicaMere: 'kom', source: 'MANUAL' as const },
    { sifra: '1023', barcode: '8606101000231', naziv: 'Maramice vlažne 80kom', cena: 160, grupa: 'Higijena', jedinicaMere: 'pak', source: 'MANUAL' as const },
    { sifra: '1024', barcode: '8606101000248', naziv: 'Crni luk 1kg', cena: 90, grupa: 'Povrće', jedinicaMere: 'kg', source: 'MANUAL' as const },
    { sifra: '1025', barcode: '8606101000255', naziv: 'Krompir 5kg', cena: 350, grupa: 'Povrće', jedinicaMere: 'vrc', source: 'MANUAL' as const },
    { sifra: '1026', barcode: '8606101000262', naziv: 'Paradajz 1kg', cena: 250, grupa: 'Povrće', jedinicaMere: 'kg', source: 'MANUAL' as const },
    { sifra: '1027', barcode: '8606101000279', naziv: 'Banane 1kg', cena: 180, grupa: 'Voće', jedinicaMere: 'kg', source: 'MANUAL' as const },
    { sifra: '1028', barcode: '8606101000286', naziv: 'Jabuke 1kg', cena: 130, grupa: 'Voće', jedinicaMere: 'kg', source: 'MANUAL' as const },
    { sifra: '1029', barcode: '8606101000293', naziv: 'Piletina file 1kg', cena: 780, grupa: 'Sveže meso', jedinicaMere: 'kg', source: 'MANUAL' as const },
    { sifra: '1030', barcode: '8606101000309', naziv: 'Čokolada Milka 100g', cena: 230, grupa: 'Slatkiši', jedinicaMere: 'kom', source: 'ACIS' as const },
  ];

  async seedProducts(): Promise<number> {
    const existing = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM products');
    if (existing[0]?.count > 0) return existing[0].count;

    let count = 0;
    for (const p of this.mockProducts) {
      await this.db.insertProduct({
        ...p,
        active: true,
      });
      count++;
    }
    return count;
  }

  getMockProducts() {
    return this.mockProducts;
  }

  generateMockCSV(): string {
    const header = 'sifra,naziv,barcode,cena,grupa,jedinicaMere';
    const rows = this.mockProducts
      .filter(p => p.source === 'ACIS')
      .map(p => `${p.sifra},${p.naziv},${p.barcode},${p.cena},${p.grupa},${p.jedinicaMere}`);
    return [header, ...rows].join('\n');
  }
}
