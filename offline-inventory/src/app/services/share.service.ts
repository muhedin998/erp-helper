import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';

@Injectable({ providedIn: 'root' })
export class ShareService {
  async shareText(text: string, title: string): Promise<void> {
    await Share.share({ text, title, dialogTitle: title });
  }

  async shareFile(base64Data: string, filename: string, mimeType: string): Promise<void> {
    await Share.share({
      title: `Podeli ${filename}`,
      files: [base64Data],
      dialogTitle: `Podeli ${filename}`,
    });
  }
}
