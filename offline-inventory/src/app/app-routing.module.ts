import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then(m => m.HomePageModule),
  },
  {
    path: 'catalog',
    loadChildren: () => import('./pages/catalog/catalog.module').then(m => m.CatalogPageModule),
  },
  {
    path: 'shopping-list',
    loadChildren: () => import('./pages/shopping-list/shopping-list.module').then(m => m.ShoppingListPageModule),
  },
  {
    path: 'shopping-list-detail/:id',
    loadChildren: () => import('./pages/shopping-list-detail/shopping-list-detail.module').then(m => m.ShoppingListDetailPageModule),
  },
  {
    path: 'purchase-mode/:id',
    loadChildren: () => import('./pages/purchase-mode/purchase-mode.module').then(m => m.PurchaseModePageModule),
  },
  {
    path: 'list-detail/:id',
    loadChildren: () => import('./pages/list-detail/list-detail.module').then(m => m.ListDetailPageModule),
  },
  {
    path: 'history',
    loadChildren: () => import('./pages/history/history.module').then(m => m.HistoryPageModule),
  },
  {
    path: 'import',
    loadChildren: () => import('./pages/import/import.module').then(m => m.ImportPageModule),
  },
  {
    path: 'settings',
    loadChildren: () => import('./pages/settings/settings.module').then(m => m.SettingsPageModule),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
