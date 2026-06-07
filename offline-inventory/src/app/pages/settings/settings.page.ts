import { Component, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { DatabaseService } from '../../database/database.service';
import { ProductStore } from '../../stores/product.store';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  standalone: false,
})
export class SettingsPage {
  db = inject(DatabaseService);
  productStore = inject(ProductStore);

  constructor(private alertCtrl: AlertController) {}

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
      message: 'Offline Inventory Replenishment & Purchasing Assistant\n\nVerzija 1.0\n\nOffline aplikacija za upravljanje dopunom polica i nabavkom.',
      buttons: ['Zatvori'],
    });
    await alert.present();
  }
}
