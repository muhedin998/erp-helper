import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Injectable({ providedIn: 'root' })
export class ExportService {
  /** Transliterate Serbian/Croatian special chars for jsPDF (no UTF-8 font) */
  private lat(text: string): string {
    const map: Record<string, string> = {
      'č': 'c', 'Č': 'C', 'ć': 'c', 'Ć': 'C',
      'š': 's', 'Š': 'S', 'ž': 'z', 'Ž': 'Z',
      'đ': 'dj', 'Đ': 'Dj',
    };
    return text.replace(/[čČćĆšŠžŽđĐ]/g, ch => map[ch] || ch);
  }
  generateCSV(data: any[], columns: string[], filename: string): void {
    const header = columns.join(',');
    const rows = data.map(row =>
      columns.map(col => {
        const val = row[col];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val ?? '';
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    this.download(csv, `${filename}.csv`, 'text/csv');
  }

  async generatePDF(title: string, data: any[], columns: { key: string; label: string }[], filename: string): Promise<void> {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('sr-Latn', { day: 'numeric', month: 'long', year: 'numeric' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(109, 40, 217);
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(this.lat(title), 14, 15);
    doc.setFontSize(10);
    doc.text(this.lat(dateStr), 14, 24);

    const totalItems = data.length;
    const totalQty = data.reduce((sum, r) => sum + (Number(r.kolicina) || 0), 0);
    doc.setFontSize(9);
    doc.text(`${totalItems} artikala | ${totalQty} komada`, pageWidth - 14, 24, { align: 'right' });

    doc.setTextColor(0, 0, 0);

    const tableData = data.map((row, i) => [
      i + 1,
      ...columns.map(col => this.lat(String(row[col.key] ?? ''))),
    ]);

    autoTable(doc, {
      head: [['#', ...columns.map(c => this.lat(c.label))]],
      body: tableData,
      startY: 38,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      columnStyles: { 0: { halign: 'center', cellWidth: 12 } },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 38;
    doc.setDrawColor(109, 40, 217);
    doc.setLineWidth(0.5);
    doc.line(14, finalY + 6, pageWidth - 14, finalY + 6);
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`Ukupno: ${totalItems} artikala, ${totalQty} komada`, 14, finalY + 12);
    doc.text('Market Latko', pageWidth - 14, finalY + 12, { align: 'right' });

    await this.outputPDF(doc, filename);
  }

  async generateShoppingPrintout(
    title: string,
    items: { naziv: string; sifra: string; quantity: number; barcode?: string; cena?: number }[],
    note?: string
  ): Promise<void> {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('sr-Latn', { day: 'numeric', month: 'long', year: 'numeric' });
    const pageWidth  = doc.internal.pageSize.getWidth();

    const totalItems = items.length;
    const totalQty   = items.reduce((s, i) => s + i.quantity, 0);

    const tableStyles: any  = { fontSize: 7, cellPadding: 1.5, lineColor: [229, 231, 235] };
    const headStyles: any   = { fillColor: [109, 40, 217] as [number,number,number], textColor: [255,255,255] as [number,number,number], fontStyle: 'bold', fontSize: 7 };
    const altRowStyles: any = { fillColor: [245, 243, 255] as [number,number,number] };

    const makeCheckbox = (d: any) => {
      // Draw checkboxes for columns 0 (left) and 5 (right)
      if (d.section === 'body' && (d.column.index === 0 || d.column.index === 5)) {
        const size = 3.5;
        const cx = d.cell.x + (d.cell.width - size) / 2;
        const cy = d.cell.y + (d.cell.height - size) / 2;
        d.doc.setDrawColor(109, 40, 217);
        d.doc.setLineWidth(0.3);
        d.doc.rect(cx, cy, size, size);
      }
    };

    // ── Split items into left and right halves ──────────────────────
    const mid = Math.ceil(items.length / 2);
    const leftItems  = items.slice(0, mid);
    const rightItems = items.slice(mid);
    const maxRows = Math.max(leftItems.length, rightItems.length);

    // ── Build combined rows (left cols | right cols) ────────────────
    const combinedBody: any[][] = [];
    for (let r = 0; r < maxRows; r++) {
      const li = leftItems[r];
      const ri = rightItems[r];
      const leftPart = li ? [
        '',
        String(li.quantity),
        this.lat(li.naziv),
        li.sifra,
        li.cena != null ? this.lat(`${li.cena.toFixed(2)} RSD`) : '',
      ] : ['', '', '', '', ''];
      const rightPart = ri ? [
        '',
        String(ri.quantity),
        this.lat(ri.naziv),
        ri.sifra,
        ri.cena != null ? this.lat(`${ri.cena.toFixed(2)} RSD`) : '',
      ] : ['', '', '', '', ''];
      combinedBody.push([...leftPart, ...rightPart]);
    }

    const columnStyles: any = {
      0:  { halign: 'center' as const, cellWidth: 6 },
      1:  { halign: 'center' as const, cellWidth: 10, fontStyle: 'bold' as const },
      2:  { cellWidth: 'auto' as const },
      3:  { cellWidth: 18, fontSize: 6, textColor: [156, 163, 175] as [number,number,number] },
      4:  { halign: 'right' as const, cellWidth: 28, fontSize: 6 },
      5:  { halign: 'center' as const, cellWidth: 6 },
      6:  { halign: 'center' as const, cellWidth: 10, fontStyle: 'bold' as const },
      7:  { cellWidth: 'auto' as const },
      8:  { cellWidth: 18, fontSize: 6, textColor: [156, 163, 175] as [number,number,number] },
      9:  { halign: 'right' as const, cellWidth: 28, fontSize: 6 },
    };

    // ── Draw header ─────────────────────────────────────────────────
    const HEADER_H = 24;
    const NOTE_H = note ? 10 : 0;
    const startY = HEADER_H + 5 + NOTE_H;

    doc.setFillColor(109, 40, 217);
    doc.rect(0, 0, pageWidth, HEADER_H, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(this.lat(title), 14, 12);
    doc.setFontSize(8);
    doc.text(this.lat(dateStr), 14, 19);
    doc.text(`${totalItems} artikala | ${totalQty} komada`, pageWidth - 14, 19, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    if (note) {
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      const lines = doc.splitTextToSize(this.lat(note), pageWidth - 28);
      doc.text(lines, 14, HEADER_H + 4);
      doc.setTextColor(0, 0, 0);
    }

    // ── Single autoTable with both columns ──────────────────────────
    autoTable(doc, {
      head: [[
        '', 'K', 'Naziv', 'Sifra', 'Cena',
        '', 'K', 'Naziv', 'Sifra', 'Cena',
      ]],
      body: combinedBody,
      startY,
      margin: { left: 10, right: 10, top: startY, bottom: 10 },
      styles: tableStyles,
      headStyles,
      alternateRowStyles: altRowStyles,
      columnStyles,
      didDrawCell: makeCheckbox,
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? startY;

    // ── Footer ──────────────────────────────────────────────────────
    doc.setDrawColor(109, 40, 217);
    doc.setLineWidth(0.5);
    doc.line(14, finalY + 4, pageWidth - 14, finalY + 4);
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Ukupno: ${totalItems} artikala, ${totalQty} komada`, 14, finalY + 9);
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text('Market Latko', pageWidth - 14, finalY + 9, { align: 'right' });

    await this.outputPDF(doc, `Spisak_${title.replace(/\s+/g, '_')}`);
  }

  private async outputPDF(doc: jsPDF, filename: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const savedFile = await Filesystem.writeFile({
        path: `${filename}.pdf`,
        data: pdfBase64,
        directory: Directory.Cache,
      });

      await Share.share({
        title: filename,
        url: savedFile.uri,
      });
    } else {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const win = window.open(url);
      if (win) {
        win.onload = () => win.print();
      } else {
        doc.save(`${filename}.pdf`);
      }
    }
  }

  private download(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
