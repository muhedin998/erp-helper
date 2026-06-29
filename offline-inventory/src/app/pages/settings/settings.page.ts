import { Component, inject } from '@angular/core';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { DatabaseService } from '../../database/database.service';
import { ProductStore } from '../../stores/product.store';
import { SeedDataService } from '../../services/seed-data.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage {
  db = inject(DatabaseService);
  productStore = inject(ProductStore);
  seedData = inject(SeedDataService);
  productCount = 0;

  constructor(private alertCtrl: AlertController, private toastCtrl: ToastController, private loadingCtrl: LoadingController) {}

  async ionViewWillEnter() {
    await this.refreshStats();
  }

  async refreshStats() {
    try {
      const countResult = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM products');
      this.productCount = countResult[0]?.count ?? 0;
    } catch {}
  }

  async reSeedCatalog() {
    const alert = await this.alertCtrl.create({
      header: 'Ponovo učitaj katalog',
      message: 'Obrisati sve ACIS artikle i ponovo ih učitati? Ručno dodati artikli ostaju.',
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Učitaj',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Učitavanje kataloga...' });
            await loading.present();
            try {
              // Force a full re-seed: clear the schema_version marker so
              // seedIfEmpty() doesn't short-circuit, and wipe ACIS so we don't
              // carry over stale rows that might have wrong barcodes.
              await this.db.clearSeedMarker();
              await this.db.deleteAllAcProducts();
              const result = await this.seedData.seedIfEmpty((done, total) => {
                loading.message = `Učitavanje kataloga... ${done}/${total}`;
              });
              await this.refreshStats();
              if (result.success && result.productCount > 0) {
                const toast = await this.toastCtrl.create({
                  message: `Katalog osvežen: ${result.productCount} artikala`,
                  duration: 3000,
                  color: 'success',
                });
                await toast.present();
              } else {
                const toast = await this.toastCtrl.create({
                  message: `Greška: ${result.error || 'Katalog nije učitan.'}`,
                  duration: 5000,
                  color: 'danger',
                  buttons: [{ text: 'Detalji', handler: () => {
                    this.alertCtrl.create({
                      header: 'Detalji greške',
                      message: result.errorDetails || 'Nema dodatnih informacija.',
                      buttons: ['OK']
                    }).then(a => a.present());
                  }}],
                });
                await toast.present();
              }
            } catch (e: any) {
              const toast = await this.toastCtrl.create({
                message: `Greška: ${e?.message || 'Nepoznata'}`,
                duration: 4000,
                color: 'danger',
              });
              await toast.present();
            } finally {
              await loading.dismiss();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async clearHistory() {
    const alert = await this.alertCtrl.create({
      header: 'Potvrda',
      message: 'Obrisati celu istoriju listi? Ova akcija je nepovratna.',
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Obriši',
          handler: async () => {
            await this.db.executeSQL('DELETE FROM shopping_list_items');
            await this.db.executeSQL('DELETE FROM shopping_lists');
          },
        },
      ],
    });
    await alert.present();
  }

  async about() {
    const alert = await this.alertCtrl.create({
      header: 'O aplikaciji',
      message: 'Market Latko\n\nVerzija 1.0\n\nOffline aplikacija za upravljanje dopunom polica i nabavkom.',
      buttons: ['Zatvori'],
    });
    await alert.present();
  }
}
