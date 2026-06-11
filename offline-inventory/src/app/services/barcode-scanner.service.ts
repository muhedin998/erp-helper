import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  private listenerAttached = false;
  private scanning = false;

  /** Restrict ZXing to retail 1D formats we actually use. This both speeds
   * decoding up and stops false positives from QR / DataMatrix / Aztec readers
   * grabbing partial frames and returning the wrong text. */
  private zxingHints(): Map<DecodeHintType, unknown> {
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    return hints;
  }

  async startScan(): Promise<string | null> {
    console.log('[SCAN] startScan called, platform:', Capacitor.getPlatform());
    if (Capacitor.isNativePlatform()) {
      console.log('[SCAN] Using native scan');
      return this.nativeScan();
    }
    console.log('[SCAN] Using web scan');
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

  private async webScan(): Promise<string | null> {
    console.log('[SCAN] webScan started');
    console.log('[SCAN] location:', location.protocol, location.hostname, location.port);
    console.log('[SCAN] navigator.mediaDevices exists:', !!navigator.mediaDevices);
    console.log('[SCAN] navigator.mediaDevices.getUserMedia exists:', !!navigator.mediaDevices?.getUserMedia);

    // iOS Safari blocks camera on HTTP. Detect early and bail without overlay.
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      console.warn('[SCAN] Camera requires HTTPS — not available on HTTP. Protocol:', location.protocol);
      return null;
    }

    // Test getUserMedia permission state if available
    if (navigator.permissions?.query) {
      try {
        const permStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        console.log('[SCAN] Camera permission state:', permStatus.state);
        if (permStatus.state === 'denied') {
          console.warn('[SCAN] Camera permission was previously denied by user');
        }
      } catch (permErr) {
        console.log('[SCAN] Could not query camera permission:', permErr);
      }
    } else {
      console.log('[SCAN] navigator.permissions not available');
    }

    if (this.scanning) {
      console.log('[SCAN] Already scanning, bailing');
      return null;
    }
    this.scanning = true;

    const fw = innerWidth;
    const fh = innerHeight;
    const fs = Math.min(fw, fh) * 0.6;
    const top = fh * 0.12;
    const left = (fw - fs) / 2;

    // ── overlay ──
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;';

    // ── video ──
    const vid = document.createElement('video');
    vid.setAttribute('playsinline', '');
    vid.muted = true;
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';

    // ── scan frame ──
    const fr = document.createElement('div');
    fr.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${fs}px;height:${fs}px;border:3px solid #0f0;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);pointer-events:none;display:none;`;

    // ── status text ──
    const statusText = document.createElement('div');
    statusText.id = 'scan-status-text';
    statusText.style.cssText = `position:absolute;top:50%;left:0;width:100%;text-align:center;color:#fff;font:17px/1.4 system-ui,-apple-system,sans-serif;padding:0 24px;`;

    // ── debug info (hidden, shows on tap of status) ──
    const debugInfo = document.createElement('div');
    debugInfo.id = 'scan-debug-info';
    debugInfo.style.cssText = 'position:absolute;top:60%;left:0;width:100%;text-align:center;color:#aaa;font:12px monospace;padding:0 24px;display:none;word-break:break-all;';

    // ── close button ──
    const close = document.createElement('button');
    close.textContent = '✕ Zatvori';
    close.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:24px;padding:14px 48px;font:16px system-ui,-apple-system,sans-serif;cursor:pointer;z-index:100001;';

    ov.append(vid, fr, statusText, debugInfo, close);
    document.body.appendChild(ov);
    console.log('[SCAN] Overlay created and appended to body');

    // ── Returns a promise that resolves when user taps close or a barcode is found ──
    return new Promise<string | null>((resolve) => {
      let done = false;
      let animId = 0;
      let stream: MediaStream | null = null;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const cleanup = (val: string | null) => {
        if (done) return;
        console.log('[SCAN] Cleanup with value:', val);
        done = true;
        cancelAnimationFrame(animId);
        stream?.getTracks().forEach(t => {
          console.log('[SCAN] Stopping track:', t.kind, t.label);
          t.stop();
        });
        this.scanning = false;
        ov.remove();
        resolve(val);
      };

      close.onclick = () => cleanup(null);

      // Tap status text to show debug details
      statusText.onclick = () => {
        const info = debugInfo.style.display === 'block' ? 'none' : 'block';
        debugInfo.style.display = info;
      };

      // Try to open camera
      (async () => {
        console.log('[SCAN] Requesting camera via getUserMedia...');
        try {
          const constraints = {
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          };
          console.log('[SCAN] Constraints:', JSON.stringify(constraints));
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log('[SCAN] Camera stream obtained, tracks:', stream.getTracks().length);
          stream.getTracks().forEach(t => {
            console.log('[SCAN] Track:', t.kind, t.label, 'enabled:', t.enabled, 'readyState:', t.readyState);
          });

          vid.srcObject = stream;
          console.log('[SCAN] Playing video...');
          await vid.play();
          console.log('[SCAN] Video playing, readyState:', vid.readyState, 'videoWidth:', vid.videoWidth, 'videoHeight:', vid.videoHeight);

          fr.style.display = 'block';
          statusText.style.display = 'none';

          const reader = new BrowserMultiFormatReader(this.zxingHints(), { delayBetweenScanAttempts: 200 });
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
                console.log('[SCAN] Barcode found:', code);
                lastCode = code;
                lastTime = Date.now();
                cleanup(code);
              }
            } catch { /* no barcode in crop */ }
          };

          setTimeout(() => {
            console.log('[SCAN] Starting scan loop');
            scan();
          }, 600);
        } catch (err: any) {
          // Camera unavailable — show user-friendly message on overlay with tech details
          vid.style.display = 'none';
          statusText.style.display = 'block';
          statusText.style.color = '#ff6b6b';

          const errName = err?.name || 'Unknown';
          const errMsg = err?.message || String(err);
          console.error('[SCAN] getUserMedia failed:', errName, errMsg);

          if (errName === 'NotAllowedError' || errMsg.includes('Permission')) {
            statusText.textContent = 'Nema dozvole za kameru. Proverite podešavanja u Safariju.';
          } else if (errName === 'NotFoundError') {
            statusText.textContent = 'Kamera nije pronađena na ovom uređaju.';
          } else if (errName === 'NotReadableError') {
            statusText.textContent = 'Kamera je zauzeta od strane druge aplikacije.';
          } else if (errName === 'OverconstrainedError') {
            statusText.textContent = 'Kamera ne podržava tražene parametre.';
          } else {
            statusText.textContent = 'Kamera nije dostupna. Dodajte barkod ručno.';
          }

          // Show technical details in debug area
          debugInfo.style.display = 'block';
          debugInfo.textContent = [
            `Protocol: ${location.protocol}`,
            `Host: ${location.hostname}:${location.port}`,
            `Error: ${errName}`,
            `Message: ${errMsg}`,
            `UserAgent: ${navigator.userAgent}`,
          ].join('\n');
          debugInfo.style.whiteSpace = 'pre-wrap';
          console.log('[SCAN] shown error on overlay');

          // Don't resolve here — user taps close to dismiss
          this.scanning = false;
        }
      })();
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
