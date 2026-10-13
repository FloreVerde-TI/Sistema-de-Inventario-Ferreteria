"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product } from '@/types';
import { ScanLine, Package, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function BarcodePage() {
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 150 } },
        false
      );

      scanner.render(async (decodedText) => {
        setScanResult(null);
        await lookupProduct(decodedText);
        scanner.clear();
        setIsScanning(false);
      }, (error) => {
        // Silent error for scanning
      });

      return () => scanner.clear();
    }
  }, [isScanning]);

  async function lookupProduct(code: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .or(`barcode.eq.${code},sku.eq.${code}`)
        .single();

      if (error || !data) {
        alert('Producto no encontrado con el código: ' + code);
      } else {
        setScanResult(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    lookupProduct(manualCode);
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <h2 className="text-3xl font-bold text-slate-900">Consulta por Código de Barras</h2>
          <p className="text-slate-500">Usa la cámara para escanear o ingresa el código manualmente para obtener la información instantánea del producto.</p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center space-y-6">
            {!isScanning ? (
              <div className="space-y-6">
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <ScanLine size={40} />
                </div>
                <button
                  onClick={() => setIsScanning(true)}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-3 text-lg"
                >
                  <ScanLine size={24} /> Abrir Escáner de Cámara
                </button>

                <div className="relative pt-6 border-t border-slate-100">
                  <form onSubmit={handleManualSearch} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ingresa código de barras o SKU..."
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-all disabled:opacity-50"
                    >
                      {loading ? '...' : 'Buscar'}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div id="reader" className="overflow-hidden rounded-xl border-2 border-blue-500"></div>
                <button
                  onClick={() => setIsScanning(false)}
                  className="px-6 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition-colors"
                >
                  Cancelar Escaneo
                </button>
              </div>
            )}
          </div>
        </div>

        {scanResult && (
          <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
              <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">{scanResult.nombre}</h3>
                  <p className="text-blue-100 text-sm">Código: {scanResult.sku} · {scanResult.barcode}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase opacity-80">Stock Actual</p>
                  <p className="text-3xl font-black">{scanResult.stock ?? 0}</p>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <InfoItem label="Categoría" value={scanResult.categoria_id} />
                <InfoItem label="Ubicación" value={scanResult.ubicacion} />
                <InfoItem label="Precio" value={`S/ ${scanResult.precio}`} />

                <div className="md:col-span-3 pt-6 border-t border-slate-100 flex gap-3">
                  <button className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all flex items-center justify-center gap-2">
                    <ArrowDownCircle size={18} /> Registrar Entrada
                  </button>
                  <button className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                    <ArrowUpCircle size={18} /> Registrar Salida
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function InfoItem({ label, value }: { label: string, value: any }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
      <p className="text-sm font-semibold text-slate-700">{value || '—'}</p>
    </div>
  );
}

// Dummy icons for the demo
function ArrowDownCircle({size}: {size: number}) { return <div style={{width: size, height: size, background: 'currentColor', borderRadius: '50%'}} />; }
function ArrowUpCircle({size}: {size: number}) { return <div style={{width: size, height: size, background: 'currentColor', borderRadius: '50%'}} />; }
