import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ShoppingListDetailPage } from './shopping-list-detail.page';

const routes: Routes = [{ path: '', component: ShoppingListDetailPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [ShoppingListDetailPage],
})
export class ShoppingListDetailPageModule {}
