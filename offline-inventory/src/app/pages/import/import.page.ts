import { Component, inject } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { ProductStore } from '../../stores/product.store';
import { DatabaseService } from '../../database/database.service';
import Papa from 'papaparse';

interface CsvRow {
  sifra: string;
  naziv: string;
  barcode?: string;
  cena?: string;
  grupa?: string;
  jedinicaMere?: string;
}

@Component({
  selector: 'app-import',
  templateUrl: './import.page.html',
  styleUrls: ['./import.page.scss'],
  standalone: false,
})
export class ImportPage {
  productStore = inject(ProductStore);
  db = inject(DatabaseService);

  previewRows: CsvRow[] = [];
  fileName = '';
  showPreview = false;
  fileContent = '';

  constructor(
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
  ) {}

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.fileName = file.name;
    this.fileContent = await file.text();

    Papa.parse(this.fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (result: Papa.ParseResult<any>) => {
        this.previewRows = result.data as CsvRow[];
        this.showPreview = true;
      },
      error: () => {
        this.toastCtrl.create({
          message: 'Greška pri parsiranju CSV fajla.',
          duration: 3000,
          color: 'danger',
        }).then(t => t.present());
      },
    });
  }

  async confirmImport() {
    if (this.previewRows.length === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Potvrda uvoza',
      message: `Uvesti ${this.previewRows.length} artikala? ACIS artikli će biti zamenjeni, MANUAL ostaju.`,
      buttons: [
        { text: 'Odustani', role: 'cancel' },
        {
          text: 'Uvezi',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Uvoz artikala...' });
            await loading.present();

            try {
              // Delete existing ACIS products
              await this.db.deleteAllAcProducts();

              // Import new ones
              for (const row of this.previewRows) {
                if (row.sifra && row.naziv) {
                  await this.db.insertProduct({
                    sifra: row.sifra,
                    naziv: row.naziv,
                    barcode: row.barcode || '',
                    cena: row.cena ? Number(row.cena) : undefined,
                    grupa: row.grupa || undefined,
                    jedinicaMere: row.jedinicaMere || undefined,
                    source: 'ACIS',
                    active: true,
                  });
                }
              }

              await this.db.rebuildFtsIfAvailable();
              await this.productStore.searchProducts('');

              const toast = await this.toastCtrl.create({
                message: `Uvezeno ${this.previewRows.length} artikala.`,
                duration: 2000,
                color: 'success',
              });
              await toast.present();

              this.showPreview = false;
              this.previewRows = [];
              this.fileName = '';
            } catch (e) {
              console.error('Import error:', e);
              const toast = await this.toastCtrl.create({
                message: 'Greška pri uvozu artikala.',
                duration: 3000,
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

  cancelImport() {
    this.showPreview = false;
    this.previewRows = [];
    this.fileName = '';
  }
}
