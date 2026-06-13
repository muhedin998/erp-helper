import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { ShoppingListStore } from '../../stores/shopping-list.store';
import { ExportService } from '../../services/export.service';

@Component({
  selector: 'app-list-detail',
  templateUrl: './list-detail.page.html',
  styleUrls: ['./list-detail.page.scss'],
  standalone: false,
})
export class ListDetailPage implements OnInit {
  route = inject(ActivatedRoute);
  router = inject(Router);
  store = inject(ShoppingListStore);
  exportService = inject(ExportService);
  alertCtrl = inject(AlertController);
  loadingCtrl = inject(LoadingController);
  toastCtrl = inject(ToastController);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    await this.store.setActiveList(id);
  }

  async exportPDF() {
    const items = this.store.items();
    const list = this.store.activeList();
    if (!list) return;

    if (list.status === 'PURCHASED') {
      // Completed list — detailed report with purchase info
      const data = items.map(i => ({
        sifra: i.sifra,
        naziv: i.naziv,
        kolicina: i.quantity,
        kupljeno: i.purchasedQuantity,
        cena: i.cena ? `${i.cena} RSD` : '-',
      }));

      await this.exportService.generatePDF(
        list.naziv,
        data,
        [
          { key: 'sifra', label: 'Šifra' },
          { key: 'naziv', label: 'Naziv' },
          { key: 'kolicina', label: 'Količina' },
          { key: 'kupljeno', label: 'Kupljeno' },
          { key: 'cena', label: 'Cena' },
        ],
        `Lista_${list.naziv.replace(/\s+/g, '_')}`
      );
    } else {
      // Ready list — shopping printout with checkboxes
      await this.exportService.generateShoppingPrintout(
        list.naziv,
        items.map(i => ({ naziv: i.naziv, sifra: i.sifra, quantity: i.quantity, barcode: i.barcode })),
        list.note || undefined
      );
    }
  }

  exportCSV() {
    const items = this.store.items();
    const list = this.store.activeList();
    if (!list) return;

    const data = items.map(i => ({
      sifra: i.sifra,
      naziv: i.naziv,
      kolicina: i.quantity,
      kupljeno: i.purchasedQuantity,
      cena: i.cena ?? '',
    }));

    this.exportService.generateCSV(
      data,
      ['sifra', 'naziv', 'kolicina', 'kupljeno', 'cena'],
      list.naziv.replace(/\s+/g, '_')
    );
  }

  async reuseList() {
    const list = this.store.activeList();
    if (!list) return;

    const alert = await this.alertCtrl.create({
      header: 'Ponovo koristi listu',
      message: `Kreiraće se nova skica sa ${this.store.itemCount()} artikala iz ove liste.`,
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
