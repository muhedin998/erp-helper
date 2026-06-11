import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ShoppingListStore } from '../../stores/shopping-list.store';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-shopping-list',
  templateUrl: './shopping-list.page.html',
  styleUrls: ['./shopping-list.page.scss'],
  standalone: false,
})
export class ShoppingListPage {
  router = inject(Router);
  store = inject(ShoppingListStore);

  constructor(private alertCtrl: AlertController) {
    this.store.loadAllLists();
  }

  async createNewList() {
    const alert = await this.alertCtrl.create({
      header: 'Nova lista',
      message: 'Unesite naziv nove liste za dopunu.',
      inputs: [
        {
          name: 'naziv',
          type: 'text',
          placeholder: 'Naziv liste',
        },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Kreiraj',
          handler: async (data) => {
            if (data.naziv?.trim()) {
              await this.store.createList(data.naziv.trim());
            }
          },
        },
      ],
    });
    await alert.present();
  }

  openList(list: any) {
    if (list.status === 'DRAFT' || list.status === 'READY_FOR_PURCHASE') {
      this.router.navigate(['/shopping-list-detail', list.id]);
    } else {
      this.router.navigate(['/list-detail', list.id]);
    }
  }

  async cloneList(list: any) {
    await this.store.cloneList(list.id);
  }

  async deleteList(list: any) {
    const alert = await this.alertCtrl.create({
      header: 'Potvrda',
      message: `Obrisati listu "${list.naziv}"?`,
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Da',
          handler: () => this.store.deleteList(list.id),
        },
      ],
    });
    await alert.present();
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'DRAFT': return 'Skica';
      case 'READY_FOR_PURCHASE': return 'Spremna';
      case 'PURCHASED': return 'Kupljena';
      default: return status;
    }
  }

  statusColor(status: string): string {
    switch (status) {
      case 'DRAFT': return 'warning';
      case 'READY_FOR_PURCHASE': return 'primary';
      case 'PURCHASED': return 'success';
      default: return 'medium';
    }
  }
}
