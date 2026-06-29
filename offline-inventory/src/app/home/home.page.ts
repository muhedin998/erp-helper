import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseService } from '../database/database.service';
import { ShoppingListStore } from '../stores/shopping-list.store';
import { SeedDataService } from '../services/seed-data.service';
import { LoadingController, AlertController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  router = inject(Router);
  db = inject(DatabaseService);
  listStore = inject(ShoppingListStore);
  seedData = inject(SeedDataService);

  constructor(
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  catalogEmpty = false;
  catalogError = '';
  catalogErrorDetails = '';
  catalogProductCount = 0;

  async ngOnInit() {
    await this.db.init();
    await this.seedCatalog();
    await this.listStore.loadAllLists();
  }

  async seedCatalog() {
    const loading = await this.loadingCtrl.create({ message: 'Priprema kataloga...' });
    await loading.present();
    try {
      const result = await this.seedData.seedIfEmpty((done, total) => {
        loading.message = `Priprema kataloga... ${done}/${total}`;
      });
      if (result.success && result.productCount > 0) {
        this.catalogEmpty = false;
        this.catalogProductCount = result.productCount;
      } else if (result.success && result.productCount === 0) {
        this.catalogEmpty = true;
        this.catalogError = 'Katalog je prazan — nijedan artikal nije učitan.';
        this.catalogErrorDetails = '';
      } else {
        // Seed reported failure, but check if products exist anyway
        let existingCount = 0;
        try {
          const countResult = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM products');
          existingCount = countResult[0]?.count ?? 0;
        } catch {}

        if (existingCount > 0) {
          this.catalogEmpty = false;
          this.catalogProductCount = existingCount;
          console.warn('Seed reported failure but', existingCount, 'products exist in DB');
        } else {
          this.catalogEmpty = true;
          this.catalogError = result.error || 'Katalog nije učitan.';
          this.catalogErrorDetails = result.errorDetails || '';
          console.error('Catalog seeding failed:', result.error, result.errorDetails);
        }
      }
    } catch (e: any) {
      console.error('Seed failed:', e);
      // Check if products exist despite the error
      let existingCount = 0;
      try {
        const countResult = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM products');
        existingCount = countResult[0]?.count ?? 0;
      } catch {}

      if (existingCount > 0) {
        this.catalogEmpty = false;
        this.catalogProductCount = existingCount;
      } else {
        this.catalogEmpty = true;
        this.catalogError = 'Greška pri pripremi kataloga.';
        this.catalogErrorDetails = e?.message || String(e);
      }
    } finally {
      await loading.dismiss();
    }
  }

  async retrySeed() {
    this.catalogEmpty = false;
    this.catalogError = '';
    await this.seedCatalog();
  }

  async createNewList() {
    try {
      const now = new Date();
      const defaultName = now.toLocaleDateString('sr-Latn', { day: 'numeric', month: 'long', year: 'numeric' });

      const alert = await this.alertCtrl.create({
        header: 'Nova lista',
        message: 'Unesite naziv nove liste za dopunu.',
        inputs: [
          { name: 'naziv', type: 'text', placeholder: 'Naziv liste', value: defaultName },
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
        const loading = await this.loadingCtrl.create({ message: 'Kreiranje liste...' });
        await loading.present();
        try {
          const list = await this.listStore.createList(naziv);
          await loading.dismiss();
          this.router.navigate(['/shopping-list-detail', list.id]);
        } catch (e) {
          console.error('createList failed:', e);
          await loading.dismiss();
        }
      }
    } catch (e) {
      console.error('createNewList error:', e);
    }
  }

  get recentLists() {
    return this.listStore.allLists().slice(0, 5);
  }

  async createTestList() {
    const loading = await this.loadingCtrl.create({ message: 'Kreiranje test liste...' });
    await loading.present();
    try {
      // Get first 100 products from the catalog
      const products = await this.db.query<{ id: number }>(
        'SELECT id FROM products WHERE active = 1 ORDER BY id LIMIT 100'
      );
      if (products.length === 0) {
        await loading.dismiss();
        const toast = await this.toastCtrl.create({
          message: 'Nema artikala u katalogu.',
          duration: 2000,
          color: 'warning',
        });
        await toast.present();
        return;
      }

      const list = await this.listStore.createList('Test lista — 100 artikala');
      for (const p of products) {
        await this.db.addItemToList(list.id, p.id, 1);
      }

      await loading.dismiss();
      this.router.navigate(['/shopping-list-detail', list.id]);
    } catch (e: any) {
      console.error('createTestList error:', e);
      await loading.dismiss();
      const toast = await this.toastCtrl.create({
        message: `Greška: ${e?.message || 'Nepoznata'}`,
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    }
  }
}
