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
        this.catalogEmpty = true;
        this.catalogError = result.error || 'Katalog nije učitan.';
        this.catalogErrorDetails = result.errorDetails || '';
        console.error('Catalog seeding failed:', result.error, result.errorDetails);
      }
    } catch (e: any) {
      console.error('Seed failed:', e);
      this.catalogEmpty = true;
      this.catalogError = 'Greška pri pripremi kataloga.';
      this.catalogErrorDetails = e?.message || String(e);
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
      const alert = await this.alertCtrl.create({
        header: 'Nova lista',
        message: 'Unesite naziv nove liste za dopunu.',
        inputs: [
          { name: 'naziv', type: 'text', placeholder: 'Naziv liste' },
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
}
