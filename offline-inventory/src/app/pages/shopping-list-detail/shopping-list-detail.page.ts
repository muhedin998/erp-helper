import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { ShoppingListStore } from '../../stores/shopping-list.store';
import { ProductStore } from '../../stores/product.store';
import { Product } from '../../models/product.model';
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
  router = inject(Router);
  store = inject(ShoppingListStore);
  productStore = inject(ProductStore);
  scanner = inject(BarcodeScannerService);
  exportService = inject(ExportService);
  loadingCtrl = inject(LoadingController);

  showManualEntry = false;
  showSearch = false;
  manualCode = '';
  searchQuery = '';
  searchResults: Product[] = [];
  listId = '';

  private searchTimeout: any = null;

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
    console.log('[PAGE] scanBarcode result:', code, 'length:', code?.length, 'type:', typeof code);
    if (code) {
      const trimmed = code.trim();
      console.log('[PAGE] processing barcode:', trimmed, 'len:', trimmed.length);
      await this.processBarcode(trimmed);
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

  private async askQuantity(productName: string): Promise<number | null> {
    const alert = await this.alertCtrl.create({
      header: 'Količina',
      message: productName,
      inputs: [
        {
          name: 'quantity',
          type: 'number',
          placeholder: 'Količina',
          value: 1,
          min: 1,
        },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        { text: 'Dodaj', role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result?.role !== 'confirm') return null;
    const qty = Number(result?.data?.values?.quantity);
    return qty > 0 ? qty : 1;
  }

  private async processCode(code: string) {
    const scannedCode = code;
    const product = await this.productStore.findProductByAnyCode(scannedCode);

    if (!product) {
      console.log('[PAGE] Product not found for code:', scannedCode);
      const toast = await this.toastCtrl.create({
        message: `Artikal nije pronađen za: ${scannedCode}`,
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const qty = await this.askQuantity(product.naziv);
    if (qty === null) return;

    await this.store.addItemToActiveList(product.id, qty, scannedCode);
    const toast = await this.toastCtrl.create({
      message: `Dodato: ${product.naziv} (${qty})`,
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

  toggleSearch() {
    this.showSearch = !this.showSearch;
    if (this.showSearch) {
      this.showManualEntry = false;
    } else {
      this.searchQuery = '';
      this.searchResults = [];
    }
  }

  toggleManualEntry() {
    this.showManualEntry = !this.showManualEntry;
    if (this.showManualEntry) {
      this.showSearch = false;
      this.searchQuery = '';
      this.searchResults = [];
    }
  }

  async onSearchInput(query: string) {
    this.searchQuery = query;
    clearTimeout(this.searchTimeout);

    const q = query.trim();
    if (!q) {
      this.searchResults = [];
      return;
    }

    this.searchTimeout = setTimeout(async () => {
      this.searchResults = await this.productStore.searchProductsResult(q);
    }, 200);
  }

  async selectProduct(product: Product) {
    const qty = await this.askQuantity(product.naziv);
    if (qty === null) return;

    await this.store.addItemToActiveList(product.id, qty, '');
    const toast = await this.toastCtrl.create({
      message: `Dodato: ${product.naziv} (${qty})`,
      duration: 1500,
      color: 'success',
    });
    await toast.present();
    this.searchQuery = '';
    this.searchResults = [];
  }

  async exportPDF() {
    const items = this.store.items();
    const list = this.store.activeList();
    if (!list) return;

    await this.exportService.generateShoppingPrintout(
      list.naziv,
      items.map(i => ({ naziv: i.naziv, sifra: i.sifra, quantity: i.quantity, barcode: i.barcode })),
      list.note || undefined
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

  async reuseList() {
    const list = this.store.activeList();
    if (!list) return;

    const alert = await this.alertCtrl.create({
      header: 'Ponovo koristi listu',
      message: `Kreiraće se nova skica sa ${this.store.itemCount()} artikala.`,
      inputs: [
        {
          name: 'naziv',
          type: 'text',
          placeholder: 'Naziv nove liste',
          value: list.naziv,
        },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        { text: 'Kreiraj', role: 'confirm' },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    const naziv = result?.data?.values?.naziv?.trim();

    if (result?.role === 'confirm' && naziv) {
      const loading = await this.loadingCtrl.create({ message: 'Kopiranje liste...' });
      await loading.present();
      try {
        const newList = await this.store.cloneList(list.id, naziv);
        await loading.dismiss();

        const toast = await this.toastCtrl.create({
          message: `Lista "${naziv}" kreirana`,
          duration: 2000,
          color: 'success',
          position: 'bottom',
        });
        await toast.present();

        this.router.navigate(['/shopping-list-detail', newList.id], { replaceUrl: true });
      } catch (e) {
        console.error('Clone failed:', e);
        await loading.dismiss();
        const toast = await this.toastCtrl.create({
          message: 'Greška pri kopiranju liste',
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      }
    }
  }
}
