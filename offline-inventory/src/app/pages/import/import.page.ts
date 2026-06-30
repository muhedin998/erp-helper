import { Component, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { DatabaseService } from '../../database/database.service';
import { SyncService } from '../../services/sync.service';

@Component({
  selector: 'app-import',
  templateUrl: './import.page.html',
  styleUrls: ['./import.page.scss'],
  standalone: false,
})
export class ImportPage {
  db = inject(DatabaseService);
  syncService = inject(SyncService);

  // IP octets — only 3rd and 4th change
  octet3 = '';
  octet4 = '';

  testingConnection = false;
  connectionStatus: { ok: boolean; productCount?: number; error?: string } | null = null;
  syncing = false;
  syncProgress = 0;
  syncTotal = 0;
  syncStage = '';

  constructor(private alertCtrl: AlertController, private toastCtrl: ToastController) {}

  async ionViewWillEnter() {
    const saved = await this.syncService.getLastIpOctets();
    if (saved) {
      this.octet3 = saved[0];
      this.octet4 = saved[1];
    }
  }

  get fullUrl(): string {
    return `http://192.168.${this.octet3}.${this.octet4}:8765`;
  }

  get isValidIp(): boolean {
    const a = Number(this.octet3);
    const b = Number(this.octet4);
    return Number.isInteger(a) && a >= 0 && a <= 255 &&
           Number.isInteger(b) && b >= 0 && b <= 255;
  }

  async testConnection() {
    if (!this.isValidIp) return;
    this.testingConnection = true;
    this.connectionStatus = null;
    this.connectionStatus = await this.syncService.checkServer(this.fullUrl);
    this.testingConnection = false;
    // Auto-save on success
    if (this.connectionStatus?.ok) {
      await this.syncService.setLastIpOctets(this.octet3, this.octet4);
      await this.syncService.setServerUrl(this.fullUrl);
    }
  }

  async startSync() {
    if (!this.isValidIp) return;
    const url = this.fullUrl;
    this.syncing = true;
    this.syncProgress = 0;
    this.syncTotal = 0;

    try {
      // Save IP for next time
      await this.syncService.setLastIpOctets(this.octet3, this.octet4);
      await this.syncService.setServerUrl(url);

      // Clear seed marker to avoid conflicts
      await this.db.clearSeedMarker();

      const result = await this.syncService.syncProducts(
        url,
        (done, total, stage) => {
          this.syncProgress = done;
          this.syncTotal = total;
          this.syncStage = stage || '';
        },
      );

      if (result.success) {
        let msg = '';
        if (result.isDelta) {
          msg = `Ažurirano ${result.productCount} artikala`;
          if (result.deactivatedCount && result.deactivatedCount > 0) {
            msg += ` (${result.deactivatedCount} uklonjeno)`;
          }
        } else {
          msg = `Sinhronizovano ${result.productCount} artikala`;
        }
        const toast = await this.toastCtrl.create({
          message: msg,
          duration: 3000,
          color: 'success',
        });
        await toast.present();
      } else {
        const toast = await this.toastCtrl.create({
          message: `Greška: ${result.error || 'Sinhronizacija nije uspela.'}`,
          duration: 5000,
          color: 'danger',
          buttons: result.errorDetails ? [{
            text: 'Detalji',
            handler: () => {
              this.alertCtrl.create({
                header: 'Detalji greške',
                message: result.errorDetails || 'Nema dodatnih informacija.',
                buttons: ['OK'],
              }).then(a => a.present());
            },
          }] : [],
        });
        await toast.present();
      }
    } catch (e: any) {
      const toast = await this.toastCtrl.create({
        message: `Greška: ${e?.message || 'Nepoznata'}`,
        duration: 4000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.syncing = false;
    }
  }
}
