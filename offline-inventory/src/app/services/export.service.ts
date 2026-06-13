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
    doc.text('Offline Inventory', pageWidth - 14, finalY + 12, { align: 'right' });

    await this.outputPDF(doc, filename);
  }

  async generateShoppingPrintout(
    title: string,
    items: { naziv: string; sifra: string; quantity: number; barcode?: string }[],
    note?: string
  ): Promise<void> {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString('sr-Latn', { day: 'numeric', month: 'long', year: 'numeric' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Purple header
    doc.setFillColor(109, 40, 217);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(this.lat(title), 14, 14);
    doc.setFontSize(9);
    doc.text(this.lat(dateStr), 14, 22);

    const totalItems = items.length;
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    doc.text(`${totalItems} artikala | ${totalQty} komada`, pageWidth - 14, 22, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    let y = 34;

    if (note) {
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      const lines = doc.splitTextToSize(this.lat(note), pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 4;
      doc.setTextColor(0, 0, 0);
    }

    // Shopping list with checkbox column
    const tableData = items.map(item => [
      '',
      String(item.quantity),
      this.lat(item.naziv),
      item.sifra,
    ]);

    autoTable(doc, {
      head: [['', 'Kom', 'Naziv artikla', 'Sifra']],
      body: tableData,
      startY: y,
      styles: { fontSize: 10, cellPadding: 4, lineColor: [229, 231, 235] },
      headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 30, fontSize: 8, textColor: [156, 163, 175] },
      },
      didDrawCell: (data: any) => {
        // Draw checkbox squares in column 0 for body rows
        if (data.section === 'body' && data.column.index === 0) {
          const size = 5;
          const cx = data.cell.x + (data.cell.width - size) / 2;
          const cy = data.cell.y + (data.cell.height - size) / 2;
          doc.setDrawColor(109, 40, 217);
          doc.setLineWidth(0.4);
          doc.rect(cx, cy, size, size);
        }
      },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable?.finalY ?? y;
    doc.setDrawColor(109, 40, 217);
    doc.setLineWidth(0.5);
    doc.line(14, finalY + 6, pageWidth - 14, finalY + 6);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('Offline Inventory', pageWidth - 14, finalY + 11, { align: 'right' });

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
