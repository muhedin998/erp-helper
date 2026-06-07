import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { BrowserMultiFormatReader } from '@zxing/browser';

@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  private listenerAttached = false;
  private scanning = false;

  async startScan(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) return this.nativeScan();
    return this.webScan();
  }

  private async nativeScan(): Promise<string | null> {
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== 'granted') return null;
    if (!this.listenerAttached) {
      await BarcodeScanner.addListener('barcodesScanned', async () => {});
      this.listenerAttached = true;
    }
    document.querySelector('body')?.classList.add('barcode-scanner-active');
    const { barcodes } = await BarcodeScanner.scan();
    document.querySelector('body')?.classList.remove('barcode-scanner-active');
    return barcodes.length > 0 ? (barcodes[0].displayValue ?? barcodes[0].rawValue) : null;
  }

  private webScan(): Promise<string | null> {
    return new Promise(async (resolve) => {
      if (this.scanning) { resolve(null); return; }
      this.scanning = true;

      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 300 });
      const fw = innerWidth;
      const fh = innerHeight;
      const fs = Math.min(fw, fh) * 0.6;

      // ── overlay ──
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;';

      // ── video ──
      const vid = document.createElement('video');
      vid.setAttribute('playsinline', '');
      vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';

      // ── scan frame ──
      const top = fh * 0.12;
      const left = (fw - fs) / 2;
      const fr = document.createElement('div');
      fr.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${fs}px;height:${fs}px;border:3px solid #0f0;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);pointer-events:none;`;

      // ── hint ──
      const hint = document.createElement('div');
      hint.style.cssText = `position:absolute;top:${top + fs + 14}px;left:0;width:100%;text-align:center;color:#fff;font:15px/1.4 system-ui,-apple-system,sans-serif;`;
      hint.textContent = 'Postavite barkod u zeleni okvir';

      // ── close button (bottom, outside frame) ──
      const close = document.createElement('button');
      close.textContent = '✕ Zatvori';
      close.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:24px;padding:14px 48px;font:16px system-ui,-apple-system,sans-serif;cursor:pointer;z-index:100001;';

      ov.append(vid, fr, hint, close);
      document.body.appendChild(ov);

      let done = false;
      let animId = 0;
      let stream: MediaStream | null = null;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const finish = (val: string | null) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(animId);
        stream?.getTracks().forEach(t => t.stop());
        this.scanning = false;
        ov.remove();
        resolve(val);
      };
      close.onclick = () => finish(null);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        vid.srcObject = stream;
        await vid.play();

        let lastCode = '';
        let lastTime = 0;

        const scan = () => {
          if (done) return;
          animId = requestAnimationFrame(scan);

          const vw = vid.videoWidth || 1280;
          const vh = vid.videoHeight || 720;
          const scaleX = vw / fw;
          const scaleY = vh / fh;
          const scale = Math.max(scaleX, scaleY);

          const sx = left * scale;
          const sy = top * scale;
          const ss = fs * scale;
          const cx = Math.max(0, Math.floor(sx));
          const cy = Math.max(0, Math.floor(sy));
          const cw = Math.min(Math.floor(ss), vw - cx);
          const ch = Math.min(Math.floor(ss), vh - cy);

          if (cw < 30 || ch < 30) return;

          canvas.width = cw;
          canvas.height = ch;
          ctx.drawImage(vid, cx, cy, cw, ch, 0, 0, cw, ch);

          try {
            const result = reader.decodeFromCanvas(canvas);
            if (result) {
              const code = result.getText();
              if (code === lastCode && Date.now() - lastTime < 2000) return;
              lastCode = code;
              lastTime = Date.now();
              finish(code);
            }
          } catch { /* no barcode in crop */ }
        };

        setTimeout(scan, 600);
      } catch {
        finish(null);
      }
    });
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
    try {
      document.querySelector('body')?.classList.remove('barcode-scanner-active');
      await BarcodeScanner.stopScan();
      await BarcodeScanner.removeAllListeners();
      this.listenerAttached = false;
    } catch {}
  }
}
