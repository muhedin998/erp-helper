import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
  store = inject(ShoppingListStore);
  exportService = inject(ExportService);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    await this.store.setActiveList(id);
  }

  async exportPDF() {
    const items = this.store.items();
    const list = this.store.activeList();
    if (!list) return;

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
}
