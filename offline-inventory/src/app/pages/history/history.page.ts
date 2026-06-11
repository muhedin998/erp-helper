import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ShoppingListStore } from '../../stores/shopping-list.store';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: false,
})
export class HistoryPage implements OnInit {
  store = inject(ShoppingListStore);
  router = inject(Router);

  ngOnInit() {
    this.store.loadHistory();
  }

  openList(list: any) {
    this.router.navigate(['/list-detail', list.id]);
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
