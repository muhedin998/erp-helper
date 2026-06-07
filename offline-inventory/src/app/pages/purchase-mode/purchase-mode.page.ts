import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { ShoppingListStore } from '../../stores/shopping-list.store';

@Component({
  selector: 'app-purchase-mode',
  templateUrl: './purchase-mode.page.html',
  standalone: false,
})
export class PurchaseModePage implements OnInit {
  route = inject(ActivatedRoute);
  store = inject(ShoppingListStore);
  listId = '';

  constructor(private alertCtrl: AlertController) {}

  async ngOnInit() {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    await this.store.setActiveList(this.listId);
  }

  async toggleItem(item: any) {
    if (!item.checked) {
      const alert = await this.alertCtrl.create({
        header: 'Količina',
        message: `Koliko komada od "${item.naziv}" ste kupili? (Ukupno: ${item.quantity})`,
        inputs: [
          {
            name: 'purchased',
            type: 'number',
            placeholder: 'Kupljeno',
            value: item.quantity,
            min: 0,
            max: item.quantity,
          },
        ],
        buttons: [
          { text: 'Odustani', role: 'cancel' },
          {
            text: 'Potvrdi',
            handler: async (data) => {
              const qty = Number(data.purchased) || 0;
              await this.store.updatePurchasedQuantity(item.id, qty);
              await this.store.toggleChecked(item.id, true);
            },
          },
        ],
      });
      await alert.present();
    } else {
      await this.store.toggleChecked(item.id, false);
      await this.store.updatePurchasedQuantity(item.id, 0);
    }
  }

  async finishPurchase() {
    const alert = await this.alertCtrl.create({
      header: 'Završi kupovinu',
      message: 'Lista će biti označena kao kupljena.',
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Završi',
          handler: async () => {
            await this.store.markAsPurchased();
          },
        },
      ],
    });
    await alert.present();
  }
}
