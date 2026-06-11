import { Component, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { ProductStore } from '../../stores/product.store';

@Component({
  selector: 'app-catalog',
  templateUrl: './catalog.page.html',
  styleUrls: ['./catalog.page.scss'],
  standalone: false,
})
export class CatalogPage {
  store = inject(ProductStore);
  searchText = '';

  constructor(private alertCtrl: AlertController) {
    this.store.searchProducts('');
  }

  onSearch(query: string) {
    this.store.searchProducts(query);
  }

  loadMore(event: any) {
    this.store.loadMore().then(() => event?.target?.complete());
  }

  async addProduct() {
    const alert = await this.alertCtrl.create({
      header: 'Novi artikal',
      inputs: [
        { name: 'sifra', placeholder: 'Šifra', type: 'text' },
        { name: 'barcode', placeholder: 'Barkod', type: 'text' },
        { name: 'naziv', placeholder: 'Naziv', type: 'text' },
        { name: 'cena', placeholder: 'Cena', type: 'number' },
        { name: 'grupa', placeholder: 'Grupa', type: 'text' },
        { name: 'jedinicaMere', placeholder: 'Jedinica mere', type: 'text' },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Dodaj',
          handler: (data) => {
            if (data.naziv && data.sifra) {
              this.store.addProduct({
                sifra: data.sifra,
                barcode: data.barcode || '',
                naziv: data.naziv,
                cena: data.cena ? Number(data.cena) : undefined,
                grupa: data.grupa || undefined,
                jedinicaMere: data.jedinicaMere || undefined,
                source: 'MANUAL',
                active: true,
              });
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async editProduct(product: any) {
    const alert = await this.alertCtrl.create({
      header: 'Izmeni artikal',
      inputs: [
        { name: 'sifra', value: product.sifra, placeholder: 'Šifra' },
        { name: 'barcode', value: product.barcode, placeholder: 'Barkod' },
        { name: 'naziv', value: product.naziv, placeholder: 'Naziv' },
        { name: 'cena', value: product.cena?.toString() ?? '', placeholder: 'Cena', type: 'number' },
        { name: 'grupa', value: product.grupa ?? '', placeholder: 'Grupa' },
        { name: 'jedinicaMere', value: product.jedinicaMere ?? '', placeholder: 'Jedinica mere' },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Sačuvaj',
          handler: (data) => {
            if (data.naziv && data.sifra) {
              this.store.updateProduct(product.id, {
                sifra: data.sifra,
                barcode: data.barcode || '',
                naziv: data.naziv,
                cena: data.cena ? Number(data.cena) : undefined,
                grupa: data.grupa || undefined,
                jedinicaMere: data.jedinicaMere || undefined,
              });
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async deleteProduct(product: any) {
    const alert = await this.alertCtrl.create({
      header: 'Potvrda',
      message: `Obrisati "${product.naziv}"?`,
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Da',
          handler: () => this.store.deleteProduct(product.id),
        },
      ],
    });
    await alert.present();
  }
}
