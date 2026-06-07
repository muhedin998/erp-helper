import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseService } from '../database/database.service';
import { ShoppingListStore } from '../stores/shopping-list.store';
import { ProductStore } from '../stores/product.store';
import { MockDataService } from '../services/mock-data.service';
import { AlertController } from '@ionic/angular';

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
  productStore = inject(ProductStore);
  mockData = inject(MockDataService);

  constructor(private alertCtrl: AlertController) {}

  async ngOnInit() {
    await this.db.init();
    await this.mockData.seedProducts();
    await this.productStore.loadProducts();
    await this.listStore.loadAllLists();
  }

  async createNewList() {
    const alert = await this.alertCtrl.create({
      header: 'Nova lista',
      message: 'Unesite naziv nove liste za dopunu.',
      inputs: [
        { name: 'naziv', type: 'text', placeholder: 'Naziv liste' },
      ],
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Kreiraj',
          handler: async (data) => {
            if (data.naziv?.trim()) {
              const list = await this.listStore.createList(data.naziv.trim());
              this.router.navigate(['/shopping-list-detail', list.id]);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  get recentLists() {
    return this.listStore.allLists().slice(0, 5);
  }
}
