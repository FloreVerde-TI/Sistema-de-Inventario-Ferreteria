// Exportación compartida a Excel y PDF (Reportes, Movimientos y Productos)
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Cell = string | number;
export type Column<T> = {
  key: string;
  label: string;
  get: (r: T) => Cell;
  right?: boolean; // alinear a la derecha
  money?: boolean; // agrega (₡) al título de la columna
  maxChars?: number; // recorta textos largos solo en el PDF
};
export type Format = 'excel' | 'pdf';
export type ExportSpec<T> = {
  title: string;
  file: string; // nombre base del archivo (sin fecha ni extensión)
  columns: Column<T>[];
  rows: T[];
  summary: string[]; // líneas de resumen bajo el título
  totals?: Record<string, Cell>; // fila final opcional (por key de columna)
};

const COMPANY = 'Flore Verde SRL';
const LOGO_URL = '/logo.png';
const LOGO_H = 16; // alto del logo en el PDF (mm)

let logoCache: Promise<string | null> | null = null;

// Carga el logo una sola vez como dataURL (si falla, el PDF sale sin logo)
function loadLogo(): Promise<string | null> {
  if (!logoCache) {
    logoCache = fetch(LOGO_URL)
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            if (!blob) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          })
      )
      .catch(() => null);
  }
  return logoCache;
}

// La fuente del PDF no tiene "₡" ni los espacios especiales que usa es-CR
function pdfText(s: string): string {
  return s.replace(/₡/g, '¢').replace(/[  ]/g, ' ');
}

export function formatMoney(n: number): string {
  return `₡${n.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
}

export function fileStamp(): string {
  return new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD local
}

function colLabel<T>(c: Column<T>): string {
  return c.money ? `${c.label} (₡)` : c.label;
}

export async function exportReport<T>(spec: ExportSpec<T>, format: Format): Promise<void> {
  const { columns, rows, totals } = spec;
  const generated = `Generado: ${new Date().toLocaleString('es-CR')}`;
  const file = `${spec.file}_${fileStamp()}`;

  if (format === 'excel') {
    const data: Record<string, Cell>[] = rows.map((r) => Object.fromEntries(columns.map((c) => [colLabel(c), c.get(r)])));
    if (totals) data.push(Object.fromEntries(columns.map((c) => [colLabel(c), totals[c.key] ?? ''])));

    // Excel no admite logo: título y resumen en las primeras filas
    const sheet = XLSX.utils.aoa_to_sheet([
      [`${spec.title} - ${COMPANY}`],
      [[generated, ...spec.summary].join('   |   ')],
      [],
    ]);
    XLSX.utils.sheet_add_json(sheet, data, { origin: 'A4' });
    sheet['!cols'] = columns.map((c) => {
      const sample = rows.slice(0, 200).map((r) => String(c.get(r)).length);
      return { wch: Math.min(50, Math.max(colLabel(c).length, ...sample) + 2) };
    });

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, spec.title.slice(0, 31));
    XLSX.writeFile(book, `${file}.xlsx`);
    return;
  }

  const show = (c: Column<T>, v: Cell | undefined): string => {
    if (v === undefined || v === '') return '';
    if (typeof v === 'number') return pdfText(v.toLocaleString('es-CR', { maximumFractionDigits: 2 }));
    const text = c.maxChars && v.length > c.maxChars ? `${v.slice(0, c.maxChars).trimEnd()}...` : v;
    return pdfText(text);
  };

  const logo = await loadLogo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let logoW = 0;
  if (logo) {
    const props = doc.getImageProperties(logo);
    logoW = (LOGO_H * props.width) / props.height;
  }
  const textX = 14 + (logo ? logoW + 4 : 0);
  const summaryLine = pdfText([generated, ...spec.summary].join('   |   '));

  const columnStyles: Record<number, { halign: 'right' }> = {};
  columns.forEach((c, i) => {
    if (c.right) columnStyles[i] = { halign: 'right' };
  });

  autoTable(doc, {
    head: [columns.map((c) => pdfText(colLabel(c)))],
    body: rows.map((r) => columns.map((c) => show(c, c.get(r)))),
    foot: totals ? [columns.map((c) => show(c, totals[c.key]))] : undefined,
    showFoot: 'lastPage',
    margin: { top: 28, left: 14, right: 14, bottom: 14 },
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [31, 122, 58] },
    footStyles: { fillColor: [227, 243, 230], textColor: [16, 32, 24], fontStyle: 'bold' },
    columnStyles,
    // Encabezado en cada página: logo + título (+ resumen en la primera)
    didDrawPage: (data) => {
      if (logo) doc.addImage(logo, 'PNG', 14, 6, logoW, LOGO_H);
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(pdfText(`${spec.title} - ${COMPANY}`), textX, 12);
      if (data.pageNumber === 1) {
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(summaryLine, textX, 18, { maxWidth: pageW - textX - 14 });
      }
    },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Página ${i} de ${pages}`, pageW - 14, pageH - 8, { align: 'right' });
  }
  doc.save(`${file}.pdf`);
}
