"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product } from '@/types';
import { FileSpreadsheet, FileText, Printer, Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function ReportesPage() {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase.from('productos').select('*, categorias(name)');
      setProducts(data || []);
    }
    loadProducts();
  }, []);

  const exportToExcel = (type: 'all' | 'low' | 'out') => {
    let filtered = products;
    let fileName = 'Inventario_Completo.xlsx';

    if (type === 'low') {
      filtered = products.filter(p => (p.stock ?? 0) <= (p.stock_min ?? 0) && (p.stock ?? 0) > 0);
      fileName = 'Stock_Bajo.xlsx';
    } else if (type === 'out') {
      filtered = products.filter(p => (p.stock ?? 0) <= 0);
      fileName = 'Productos_Agotados.xlsx';
    }

    const data = filtered.map(p => ({
      Código: p.sku,
      Nombre: p.nombre,
      Categoría: (p as any).categorias?.name || 'N/A',
      Stock: p.stock,
      Mínimo: p.stock_min,
      Ubicación: p.ubicacion
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, fileName);
  };

  const exportToPDF = (type: 'all' | 'low' | 'out') => {
    const doc = new jsPDF();
    let filtered = products;
    let title = 'Reporte de Inventario Completo';

    if (type === 'low') {
      filtered = products.filter(p => (p.stock ?? 0) <= (p.stock_min ?? 0) && (p.stock ?? 0) > 0);
      title = 'Reporte de Stock Bajo';
    } else if (type === 'out') {
      filtered = products.filter(p => (p.stock ?? 0) <= 0);
      title = 'Reporte de Productos Agotados';
    }

    doc.setFontSize(18);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 28);

    const tableData = filtered.map(p => [
      p.sku,
      p.nombre,
      (p as any).categorias?.name || 'N/A',
      p.stock ?? 0,
      p.stock_min ?? 0,
      p.ubicacion || '—'
    ]);

    (doc as any).autoTable({
      startY: 35,
      head: [['SKU', 'Nombre', 'Categoría', 'Stock', 'Mín', 'Ubicación']],
      body: tableData,
    });

    doc.save(`${title}.pdf`);
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Generación de Reportes</h2>
            <p className="text-slate-500 text-sm">Exporta la información del inventario en formatos profesionales</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ReportCard
            title="Inventario Completo"
            desc="Listado total de productos con stock, precio y ubicación."
            onExcel={() => exportToExcel('all')}
            onPDF={() => exportToPDF('all')}
            icon="📦"
          />
          <ReportCard
            title="Productos Stock Bajo"
            desc="Artículos que requieren reposición inmediata."
            onExcel={() => exportToExcel('low')}
            onPDF={() => exportToPDF('low')}
            icon="⚠"
            color="amber"
          />
          <ReportCard
            title="Productos Agotados"
            desc="Artículos sin existencia disponible para la venta."
            onExcel={() => exportToExcel('out')}
            onPDF={() => exportToPDF('out')}
            icon="⛔"
            color="red"
          />
        </div>
      </div>
    </AdminLayout>
  );
}

function ReportCard({ title, desc, onExcel, onPDF, icon, color = 'blue' }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <h4 className="font-bold text-slate-900 leading-tight">{title}</h4>
          <p className="text-xs text-slate-500 mt-1">{desc}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-auto pt-4 border-t border-slate-50">
        <button
          onClick={onExcel}
          className="flex-1 py-2 text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
        >
          <FileSpreadsheet size={14} /> Excel
        </button>
        <button
          onClick={onPDF}
          className="flex-1 py-2 text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
        >
          <FileText size={14} /> PDF
        </button>
      </div>
    </div>
  );
}
