"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { registrarActividad } from '@/lib/actividad';
import { borrarImagenSiEsNuestra } from '@/lib/imagenes';
import SubirImagen from '@/components/SubirImagen';
import { Building2, Package, FileText, Image as ImageIcon, Save, Loader2, X } from 'lucide-react';

type Config = {
  business_name: string;
  nombre_comercial: string;
  cedula_juridica: string;
  phone: string;
  whatsapp: string;
  email: string;
  sitio_web: string;
  address: string;
  horario: string;
  stock_minimo_defecto: string;
  pie_reportes: string;
  logo_url: string;
};
type Fila = { [K in keyof Config]: string | number | null } & { updated_at: string | null };
type Aviso = { tipo: 'error' | 'exito'; texto: string } | null;

const VACIO: Config = {
  business_name: '',
  nombre_comercial: '',
  cedula_juridica: '',
  phone: '',
  whatsapp: '',
  email: '',
  sitio_web: '',
  address: '',
  horario: '',
  stock_minimo_defecto: '5',
  pie_reportes: '',
  logo_url: '',
};

const COLUMNAS = `${Object.keys(VACIO).join(', ')}, updated_at`;

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-light transition-all';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';

function aConfig(f: Fila): Config {
  const c = { ...VACIO };
  (Object.keys(VACIO) as (keyof Config)[]).forEach((k) => {
    const v = f[k];
    c[k] = v === null || v === undefined ? '' : String(v);
  });
  return c;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}

function Seccion({
  icon: Icon,
  titulo,
  sub,
  children,
}: {
  icon: React.ComponentType<{ size?: number }>;
  titulo: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${CARD} p-6`}>
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
        <div className="w-10 h-10 bg-primary-soft text-primary-ink rounded-lg flex items-center justify-center">
          <Icon size={20} />
        </div>
        <div>
          <h3 className="font-semibold text-text">{titulo}</h3>
          <p className="text-xs text-text-muted">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ConfigPage() {
  const [form, setForm] = useState<Config>(VACIO);
  const [original, setOriginal] = useState<Config>(VACIO);
  const [actualizado, setActualizado] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [logoFallo, setLogoFallo] = useState(false);

  useEffect(() => {
    async function cargar() {
      const { data, error } = await supabase.from('settings').select(COLUMNAS).eq('id', 1).maybeSingle();
      if (error) setAviso({ tipo: 'error', texto: `No se pudo cargar la configuración: ${error.message}` });
      else if (data) {
        const fila = data as unknown as Fila;
        const c = aConfig(fila);
        setForm(c);
        setOriginal(c);
        setActualizado(fila.updated_at);
      }
      setLoading(false);
    }
    cargar();
  }, []);

  function set(k: keyof Config, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const cambios = (Object.keys(VACIO) as (keyof Config)[]).filter((k) => form[k].trim() !== original[k].trim());

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    const minimo = Number(form.stock_minimo_defecto);
    if (!form.business_name.trim()) return setAviso({ tipo: 'error', texto: 'La razón social es obligatoria.' });
    if (!Number.isInteger(minimo) || minimo < 0)
      return setAviso({ tipo: 'error', texto: 'El stock mínimo por defecto debe ser un entero igual o mayor a 0.' });
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return setAviso({ tipo: 'error', texto: 'El correo no es válido.' });
    for (const k of ['sitio_web', 'logo_url'] as const) {
      if (form[k].trim() && !/^https?:\/\//i.test(form[k].trim()) && !form[k].trim().startsWith('/'))
        return setAviso({ tipo: 'error', texto: 'Las direcciones web deben empezar con https://' });
    }
    if (cambios.length === 0) return setAviso({ tipo: 'exito', texto: 'No hay cambios por guardar.' });

    setSaving(true);
    const texto = (k: keyof Config) => form[k].trim() || null;
    const ahora = new Date().toISOString();
    const { data, error } = await supabase
      .from('settings')
      .update({
        business_name: form.business_name.trim(),
        nombre_comercial: texto('nombre_comercial'),
        cedula_juridica: texto('cedula_juridica'),
        phone: texto('phone'),
        whatsapp: texto('whatsapp'),
        email: texto('email'),
        sitio_web: texto('sitio_web'),
        address: texto('address'),
        horario: texto('horario'),
        stock_minimo_defecto: minimo,
        pie_reportes: texto('pie_reportes'),
        logo_url: texto('logo_url'),
        updated_at: ahora,
      })
      .eq('id', 1)
      .select('id');
    setSaving(false);

    if (error || !data || data.length === 0) {
      setAviso({ tipo: 'error', texto: error ? error.message : 'No tienes permiso para guardar la configuración.' });
      return;
    }
    await registrarActividad({
      accion: 'editar',
      entidad: 'configuracion',
      entidad_id: '1',
      detalle: `Cambió: ${cambios.join(', ')}`,
    });
    // Logo reemplazado o quitado: se borra el anterior de nuestro Storage
    if (original.logo_url.trim() && original.logo_url.trim() !== form.logo_url.trim()) {
      await borrarImagenSiEsNuestra(original.logo_url.trim());
    }
    setOriginal(form);
    setActualizado(ahora);
    setAviso({ tipo: 'exito', texto: 'Configuración guardada. Los reportes nuevos ya usan estos datos.' });
  }

  const logoUrl = form.logo_url.trim() || '/logo.png';

  return (
    <AdminLayout>
      <form onSubmit={guardar} className="space-y-6 max-w-5xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Configuración</h2>
            <p className="text-text-muted text-sm">
              Datos de la empresa y ajustes generales · Última actualización: {formatDate(actualizado)}
            </p>
          </div>
          <button
            type="submit"
            disabled={saving || loading}
            className="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cambios{cambios.length > 0 ? ` (${cambios.length})` : ''}
          </button>
        </div>

        {aviso && (
          <div
            className={`rounded-lg p-4 text-sm flex items-start justify-between gap-3 border ${
              aviso.tipo === 'error'
                ? 'bg-danger-soft text-danger border-danger/30'
                : 'bg-success-soft text-success border-success/30'
            }`}
          >
            <span>{aviso.texto}</span>
            <button type="button" title="Cerrar aviso" onClick={() => setAviso(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {loading ? (
          <div className={`${CARD} p-20 text-center text-text-muted italic`}>Cargando configuración...</div>
        ) : (
          <>
            <Seccion icon={Building2} titulo="Datos de la empresa" sub="Salen en el encabezado de los reportes PDF y Excel">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Razón social *</label>
                  <input className={FIELD} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Nombre comercial</label>
                  <input
                    className={FIELD}
                    value={form.nombre_comercial}
                    onChange={(e) => set('nombre_comercial', e.target.value)}
                    placeholder="Ej. Flore Verde Ferretería"
                  />
                </div>
                <div>
                  <label className={LABEL}>Cédula jurídica</label>
                  <input
                    className={FIELD}
                    value={form.cedula_juridica}
                    onChange={(e) => set('cedula_juridica', e.target.value)}
                    placeholder="3-102-000000"
                  />
                </div>
                <div>
                  <label className={LABEL}>Correo</label>
                  <input type="email" className={FIELD} value={form.email} onChange={(e) => set('email', e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Teléfono</label>
                  <input className={FIELD} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="2102 0013" />
                </div>
                <div>
                  <label className={LABEL}>WhatsApp</label>
                  <input
                    className={FIELD}
                    value={form.whatsapp}
                    onChange={(e) => set('whatsapp', e.target.value)}
                    placeholder="(506) 6440-3646"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL}>Dirección</label>
                  <input className={FIELD} value={form.address} onChange={(e) => set('address', e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Sitio web</label>
                  <input
                    className={FIELD}
                    value={form.sitio_web}
                    onChange={(e) => set('sitio_web', e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className={LABEL}>Horario de atención</label>
                  <input
                    className={FIELD}
                    value={form.horario}
                    onChange={(e) => set('horario', e.target.value)}
                    placeholder="Ej. L-V 7:00-17:00, S 7:00-12:00"
                  />
                </div>
              </div>
            </Seccion>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Seccion icon={Package} titulo="Inventario" sub="Valores por defecto al crear productos">
                <label className={LABEL}>Stock mínimo por defecto</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={FIELD}
                  value={form.stock_minimo_defecto}
                  onChange={(e) => set('stock_minimo_defecto', e.target.value)}
                />
                <p className="text-xs text-text-muted mt-2">
                  Se llena solo en &quot;Nuevo producto&quot;. Cada producto puede cambiarlo después.
                </p>
              </Seccion>

              <Seccion icon={FileText} titulo="Reportes" sub="Texto al pie de cada página del PDF y al final del Excel">
                <label className={LABEL}>Pie de los reportes</label>
                <input
                  className={FIELD}
                  maxLength={150}
                  value={form.pie_reportes}
                  onChange={(e) => set('pie_reportes', e.target.value)}
                  placeholder="Ej. Documento interno · Flore Verde SRL"
                />
                <p className="text-xs text-text-muted mt-2">{form.pie_reportes.length}/150 caracteres</p>
              </Seccion>
            </div>

            <Seccion icon={ImageIcon} titulo="Logo de los reportes" sub="Si lo dejas vacío se usa el logo actual del sistema">
              <div className="flex gap-6 items-start">
                <div className="w-32 h-32 shrink-0 bg-white border border-border rounded-xl flex items-center justify-center overflow-hidden">
                  {logoFallo ? (
                    <span className="text-xs text-danger text-center px-2">No se pudo cargar</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" onError={() => setLogoFallo(true)} />
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <SubirImagen
                    carpeta="empresa"
                    texto="Subir logo"
                    onSubida={(url) => {
                      set('logo_url', url);
                      setLogoFallo(false);
                    }}
                  />
                  <label className={LABEL}>O pega el enlace del logo</label>
                  <input
                    className={FIELD}
                    value={form.logo_url}
                    onChange={(e) => {
                      set('logo_url', e.target.value);
                      setLogoFallo(false);
                    }}
                    placeholder="https://... (opcional)"
                  />
                  <p className="text-xs text-text-muted">
                    Se usa en los reportes PDF. Recuerda presionar &quot;Guardar cambios&quot;. Si lo dejas vacío, se usa el logo del sistema.
                  </p>
                </div>
              </div>
            </Seccion>
          </>
        )}
      </form>
    </AdminLayout>
  );
}
