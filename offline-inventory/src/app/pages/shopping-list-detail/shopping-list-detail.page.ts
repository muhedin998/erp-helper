import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { ShoppingListStore } from '../../stores/shopping-list.store';
import { ProductStore } from '../../stores/product.store';
import { BarcodeScannerService } from '../../services/barcode-scanner.service';
import { ExportService } from '../../services/export.service';

@Component({
  selector: 'app-shopping-list-detail',
  templateUrl: './shopping-list-detail.page.html',
  styleUrls: ['./shopping-list-detail.page.scss'],
  standalone: false,
})
export class ShoppingListDetailPage implements OnInit {
  route = inject(ActivatedRoute);
  store = inject(ShoppingListStore);
  productStore = inject(ProductStore);
  scanner = inject(BarcodeScannerService);
  exportService = inject(ExportService);

  showManualEntry = false;
  manualCode = '';
  listId = '';

  constructor(
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
  ) {}

  async ngOnInit() {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    await this.store.setActiveList(this.listId);
  }

  async scanBarcode() {
    console.log('[PAGE] scanBarcode called');
    const code = await this.scanner.startScan();
    console.log('[PAGE] scanBarcode result:', code);
    if (code) {
      console.log('[PAGE] processing barcode:', code);
      await this.processBarcode(code);
    } else if (!Capacitor.isNativePlatform()) {
      // Camera unavailable (HTTP on iOS, no permission, etc.)
      // Auto-show manual entry as fallback
      console.log('[PAGE] Camera not available, showing manual entry');
      this.showManualEntry = true;
      const toast = await this.toastCtrl.create({
        message: 'Kamera nije dostupna. Unesite barkod ručno ispod.',
        duration: 5000,
        color: 'warning',
        buttons: [{ text: 'OK', role: 'cancel' }],
      });
      await toast.present();
    } else {
      console.log('[PAGE] Native scan returned null (permission denied or cancelled)');
    }
  }

  async processManualCode() {
    if (!this.manualCode.trim()) return;
    await this.processCode(this.manualCode.trim());
    this.manualCode = '';
    this.showManualEntry = false;
  }

  private async processCode(code: string) {
    const product = await this.productStore.findProductByAnyCode(code);

    if (!product) {
      console.log('[PAGE] Product not found for code:', code);
      const toast = await this.toastCtrl.create({
        message: `Artikal nije pronađen za: ${code}`,
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    await this.store.addItemToActiveList(product.id);
    const toast = await this.toastCtrl.create({
      message: `Dodato: ${product.naziv}`,
      duration: 1500,
      color: 'success',
    });
    await toast.present();
  }

  async processBarcode(code: string) {
    await this.processCode(code);
  }

  async editItem(item: any) {
    const alert = await this.alertCtrl.create({
      header: 'Količina',
      inputs: [
        {
          name: 'quantity',
          type: 'number',
          placeholder: 'Količina',
          value: item.quantity,
          min: 1,
        },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Sačuvaj',
          handler: (data) => {
            const qty = Number(data.quantity);
            if (qty > 0) {
              this.store.updateItemQuantity(item.id, qty);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async removeItem(item: any) {
    const alert = await this.alertCtrl.create({
      header: 'Potvrda',
      message: `Ukloniti "${item.naziv}" sa liste?`,
      buttons: [
        { text: 'Ne', role: 'cancel' },
        { text: 'Da', handler: () => this.store.removeItem(item.id) },
      ],
    });
    await alert.present();
  }

  async finishList() {
    const alert = await this.alertCtrl.create({
      header: 'Završi listu',
      message: 'Lista će biti označena kao spremna za nabavku. Nakon toga više neće moći da se menja.',
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Završi',
          handler: async () => {
            await this.store.finishList();
          },
        },
      ],
    });
    await alert.present();
  }

  async addNote() {
    const alert = await this.alertCtrl.create({
      header: 'Napomena',
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: 'Napomena za listu...',
          value: this.store.activeList()?.note || '',
        },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Sačuvaj',
          handler: (data) => {
            this.store.updateListNote(data.note || '');
          },
        },
      ],
    });
    await alert.present();
  }

  async searchAndAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Pretraži artikal',
      inputs: [
        { name: 'query', type: 'text', placeholder: 'Naziv, šifra ili barkod' },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Pretraži',
          handler: async (data) => {
            if (data.query?.trim()) {
              const q = data.query.trim();
              const product = await this.productStore.findProductByAnyCode(q);

              if (product) {
                await this.store.addItemToActiveList(product.id);
              } else {
                const toast = await this.toastCtrl.create({
                  message: 'Artikal nije pronađen',
                  duration: 2000,
                  color: 'warning',
                });
                await toast.present();
              }
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async exportPDF() {
    const items = this.store.items();
    const list = this.store.activeList();
    if (!list) return;

    const data = items.map(i => ({
      sifra: i.sifra,
      naziv: i.naziv,
      kolicina: i.quantity,
      cena: i.cena ? `${i.cena} RSD` : '-',
    }));

    await this.exportService.generatePDF(
      list.naziv,
      data,
      [
        { key: 'sifra', label: 'Šifra' },
        { key: 'naziv', label: 'Naziv' },
        { key: 'kolicina', label: 'Količina' },
        { key: 'cena', label: 'Cena' },
      ],
      `Lista_${list.naziv.replace(/\s+/g, '_')}`
    );
  }

  exportCSV() {
    const items = this.store.items();
    const list = this.store.activeList();
    if (!list) return;

    const data = items.map(i => ({
      sifra: i.sifra,
      naziv: i.naziv,
      kolicina: i.quantity,
      cena: i.cena ?? '',
    }));

    this.exportService.generateCSV(data, ['sifra', 'naziv', 'kolicina', 'cena'], list.naziv.replace(/\s+/g, '_'));
  }
}
