import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Injectable({ providedIn: 'root' })
export class ExportService {
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

    doc.setFontSize(16);
    doc.text(title, 14, 20);

    doc.setFontSize(10);
    doc.text(`Datum: ${now.toLocaleDateString('sr-RS')}`, 14, 28);

    const tableData = data.map(row => columns.map(col => row[col.key] ?? ''));

    autoTable(doc, {
      head: [columns.map(c => c.label)],
      body: tableData,
      startY: 34,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 133, 244] },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 34;

    const totalItems = data.length;
    const totalQty = data.reduce((sum, r) => sum + (r.quantity || 0), 0);
    doc.setFontSize(10);
    doc.text(`Ukupno artikala: ${totalItems} | Ukupna količina: ${totalQty}`, 14, finalY + 10);

    doc.save(`${filename}.pdf`);
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
