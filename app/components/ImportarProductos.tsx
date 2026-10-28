"use client";

import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { traerTodo } from '@/lib/paginar';
import { etiquetaUsuario, registrarActividad } from '@/lib/actividad';
import { X, Download, FileUp, Loader2, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet } from 'lucide-react';

// =====================================================================
// IMPORTAR PRODUCTOS DESDE EXCEL (.xlsx, .xls o .csv)
// 1. Lee el archivo y busca la fila de títulos (Nombre, Precio, ...).
// 2. Revisa cada fila: errores (no se importa) y avisos (se importa igual).
// 3. Muestra una vista previa; solo al confirmar se guarda.
// 4. Crea categorías y proveedores que falten y registra el stock inicial
//    como Entrada en Movimientos (motivo "Stock inicial").
// =====================================================================

type Campo =
  | 'nombre' | 'sku' | 'barras' | 'categoria' | 'proveedor' | 'precio'
  | 'stock' | 'minimo' | 'ubicacion' | 'descripcion' | 'web' | 'imagen';

const CAMPOS: { campo: Campo; titulo: string; alias: string[]; obligatorio?: boolean }[] = [
  { campo: 'nombre', titulo: 'Nombre', obligatorio: true, alias: ['nombre', 'producto', 'nombredelproducto', 'nombreproducto', 'articulo'] },
  { campo: 'sku', titulo: 'Código (SKU)', alias: ['sku', 'codigo', 'codigointerno', 'cod', 'codigoproducto', 'referencia'] },
  { campo: 'barras', titulo: 'Código de barras', alias: ['codigodebarras', 'codigobarras', 'codbarras', 'barras', 'ean', 'upc', 'barcode'] },
  { campo: 'categoria', titulo: 'Categoría', alias: ['categoria', 'familia', 'linea', 'departamento'] },
  { campo: 'proveedor', titulo: 'Proveedor', alias: ['proveedor', 'suplidor', 'distribuidor'] },
  { campo: 'precio', titulo: 'Precio', obligatorio: true, alias: ['precio', 'precioventa', 'preciodeventa', 'pvp', 'preciounitario'] },
  { campo: 'stock', titulo: 'Stock inicial', alias: ['stock', 'stockinicial', 'cantidad', 'existencias', 'existencia', 'inventario', 'unidades'] },
  { campo: 'minimo', titulo: 'Stock mínimo', alias: ['stockminimo', 'minimo', 'stockmin', 'puntodereorden'] },
  { campo: 'ubicacion', titulo: 'Ubicación', alias: ['ubicacion', 'estante', 'pasillo', 'localizacion'] },
  { campo: 'descripcion', titulo: 'Descripción', alias: ['descripcion', 'detalle', 'detalles'] },
  { campo: 'web', titulo: 'En web (Sí/No)', alias: ['enweb', 'web', 'disponibleenweb', 'publicado', 'visibleenweb'] },
  { campo: 'imagen', titulo: 'Imagen (URL)', alias: ['imagen', 'foto', 'urlimagen', 'urldelaimagen', 'imagenurl', 'fotourl'] },
];

const MAX_FILAS = 5000;
const LOTE = 200;

type Datos = {
  nombre: string;
  sku: string | null;
  barras: string | null;
  categoria: string | null;
  proveedor: string | null;
  precio: number;
  stock: number;
  minimo: number;
  ubicacion: string | null;
  descripcion: string;
  web: boolean;
  imagen: string | null;
};
type Fila = { n: number; datos: Datos; errores: string[]; avisos: string[] };
type Encabezado = { letra: string; titulo: string; campo: Campo | null };
type Analisis = {
  hoja: string;
  columnas: Campo[];
  encabezados: Encabezado[];
  filas: Fila[];
  categoriasExistentes: Set<string>;
  proveedoresExistentes: Set<string>;
};
// elegir → confirmarArchivo (¿es el archivo correcto?) → revisar (fila por fila)
// → confirmarImport (resumen final) → importando → listo
type Etapa = 'elegir' | 'confirmarArchivo' | 'revisar' | 'confirmarImport' | 'importando' | 'listo';

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const BTN =
  'card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-50';
const BTN_PRIMARY =
  'px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50';

// ---------------------------------------------------------------------
// Funciones auxiliares
// ---------------------------------------------------------------------
const normalizar = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const texto = (v: unknown): string => String(v ?? '').trim();

// Acepta 1500 · "1 500,50" · "₡1,500.50" · "1.500,50"
function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = texto(v).replace(/[₡¢$\s ]/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma > -1) {
    s = /,\d{3}$/.test(s) && s.split(',').length > 1 && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function siNo(v: unknown): boolean | null {
  const s = normalizar(v);
  if (!s) return false;
  if (['si', 's', 'yes', 'x', '1', 'true', 'verdadero'].includes(s)) return true;
  if (['no', 'n', '0', 'false', 'falso'].includes(s)) return false;
  return null;
}

// Busca la fila de títulos en las primeras 15 filas de cada hoja
function detectarTitulos(filas: unknown[][]): { fila: number; mapa: Map<number, Campo> } | null {
  let mejor: { fila: number; mapa: Map<number, Campo> } | null = null;
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const mapa = new Map<number, Campo>();
    const usados = new Set<Campo>();
    (filas[i] ?? []).forEach((celda, col) => {
      // Se prueba el título completo y sin lo que va entre paréntesis o el "*"
      // (así "Código (SKU)" o "En web (Sí/No) *" también se reconocen)
      const completo = normalizar(celda);
      const sinExtras = normalizar(String(celda ?? '').replace(/\([^)]*\)/g, '').replace(/\*/g, ''));
      const dentro = normalizar((String(celda ?? '').match(/\(([^)]*)\)/) ?? [])[1] ?? '');
      const def = CAMPOS.find(
        (c) => !usados.has(c.campo) && [completo, sinExtras, dentro].some((t) => t !== '' && c.alias.includes(t))
      );
      if (def) {
        mapa.set(col, def.campo);
        usados.add(def.campo);
      }
    });
    if (usados.has('nombre') && usados.has('precio') && (!mejor || mapa.size > mejor.mapa.size)) {
      mejor = { fila: i, mapa };
    }
  }
  return mejor;
}

type Existentes = {
  nombres: Set<string>;
  skus: Set<string>;
  barras: Set<string>;
  minimoDefecto: number;
};

function revisarFila(n: number, celdas: unknown[], mapa: Map<number, Campo>, ex: Existentes): Fila | null {
  const v = (campo: Campo): unknown => {
    for (const [col, c] of mapa) if (c === campo) return celdas[col];
    return undefined;
  };
  // Filas totalmente vacías se ignoran
  if (celdas.every((c) => texto(c) === '')) return null;

  const errores: string[] = [];
  const avisos: string[] = [];

  const nombre = texto(v('nombre'));
  if (!nombre) errores.push('Falta el nombre');
  else if (ex.nombres.has(nombre.toLowerCase())) errores.push('Ya existe un producto con ese nombre');

  const precioRaw = v('precio');
  const precio = numero(precioRaw);
  if (texto(precioRaw) === '') errores.push('Falta el precio');
  else if (precio === null || precio < 0) errores.push(`Precio inválido: "${texto(precioRaw)}"`);

  const stockRaw = v('stock');
  let stock = 0;
  if (texto(stockRaw) !== '') {
    const s = numero(stockRaw);
    if (s === null || s < 0 || !Number.isInteger(s)) errores.push(`Stock inválido: "${texto(stockRaw)}"`);
    else stock = s;
  } else if (mapa.size && [...mapa.values()].includes('stock')) avisos.push('Sin stock: queda en 0');

  const minRaw = v('minimo');
  let minimo = ex.minimoDefecto;
  if (texto(minRaw) !== '') {
    const m = numero(minRaw);
    if (m === null || m < 0 || !Number.isInteger(m)) errores.push(`Stock mínimo inválido: "${texto(minRaw)}"`);
    else minimo = m;
  }

  const sku = texto(v('sku')) || null;
  if (sku && ex.skus.has(sku.toLowerCase())) errores.push(`El código ${sku} ya existe`);

  const barras = texto(v('barras')) || null;
  if (barras && ex.barras.has(barras)) errores.push(`El código de barras ${barras} ya existe`);

  const categoria = texto(v('categoria')) || null;
  if (!categoria) avisos.push('Sin categoría');

  const webRaw = v('web');
  const web = siNo(webRaw);
  if (web === null) avisos.push(`"En web" no reconocido ("${texto(webRaw)}"): queda en No`);

  const imagen = texto(v('imagen')) || null;
  if (imagen && !/^https?:\/\//i.test(imagen)) {
    avisos.push('La imagen no es un enlace (https://…): se ignora');
  }

  return {
    n,
    datos: {
      nombre,
      sku,
      barras,
      categoria,
      proveedor: texto(v('proveedor')) || null,
      precio: precio ?? 0,
      stock,
      minimo,
      ubicacion: texto(v('ubicacion')) || null,
      descripcion: texto(v('descripcion')),
      web: web ?? false,
      imagen: imagen && /^https?:\/\//i.test(imagen) ? imagen : null,
    },
    errores,
    avisos,
  };
}

function descargarPlantilla() {
  const titulos = CAMPOS.map((c) => (c.obligatorio ? `${c.titulo} *` : c.titulo));
  const ejemplo = ['Martillo de uña 16oz', 'MART-016', '7501234567890', 'Herramientas manuales', 'El Tornillo', 4500, 20, 5, 'Pasillo A, Estante 3', 'Mango de fibra', 'Sí', ''];
  const hoja = XLSX.utils.aoa_to_sheet([titulos, ejemplo]);
  hoja['!cols'] = titulos.map((t) => ({ wch: Math.max(14, t.length + 2) }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
  XLSX.writeFile(libro, 'plantilla_productos.xlsx');
}

function descargarErrores(filas: Fila[]) {
  const datos = filas
    .filter((f) => f.errores.length > 0)
    .map((f) => ({
      'Fila en el Excel': f.n,
      Nombre: f.datos.nombre,
      'Código (SKU)': f.datos.sku ?? '',
      'Código de barras': f.datos.barras ?? '',
      Problema: f.errores.join('; '),
    }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Filas con error');
  XLSX.writeFile(libro, 'productos_con_error.xlsx');
}

// Letra de columna como en Excel (0 → A, 26 → AA)
function letraColumna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function trozos<T>(lista: T[], tam: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}

// ---------------------------------------------------------------------
// Ventana
// ---------------------------------------------------------------------
export default function ImportarProductos({ onClose, onImportado }: { onClose: () => void; onImportado: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>('elegir');
  const [archivo, setArchivo] = useState('');
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });
  const [resultado, setResultado] = useState<string | null>(null);
  const [aceptado, setAceptado] = useState(false);

  const filas = analisis?.filas ?? [];
  const validas = useMemo(() => filas.filter((f) => f.errores.length === 0), [filas]);
  const conError = filas.length - validas.length;
  const conAviso = validas.filter((f) => f.avisos.length > 0).length;
  // Resumen para la confirmación final
  const resumen = useMemo(() => {
    if (!analisis) return null;
    const cats = new Set<string>();
    const provs = new Set<string>();
    validas.forEach(({ datos: d }) => {
      if (d.categoria && !analisis.categoriasExistentes.has(d.categoria.toLowerCase())) cats.add(d.categoria.toLowerCase());
      if (d.proveedor && !analisis.proveedoresExistentes.has(d.proveedor.toLowerCase())) provs.add(d.proveedor.toLowerCase());
    });
    return {
      categoriasNuevas: cats.size,
      proveedoresNuevos: provs.size,
      unidades: validas.reduce((t, f) => t + f.datos.stock, 0),
      enWeb: validas.filter((f) => f.datos.web).length,
    };
  }, [analisis, validas]);

  const visibles = (soloProblemas ? filas.filter((f) => f.errores.length || f.avisos.length) : filas).slice(0, 300);

  async function leerArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setLeyendo(true);
    setArchivo(file.name);
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('El archivo debe ser Excel (.xlsx o .xls) o .csv.');
      const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' });

      // Busca la primera hoja que parezca una lista de productos
      let encontrado: { hoja: string; filas: unknown[][]; titulos: NonNullable<ReturnType<typeof detectarTitulos>> } | null = null;
      const titulosVistos: string[] = [];
      for (const nombreHoja of libro.SheetNames) {
        const filasHoja = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombreHoja], { header: 1, defval: '', raw: true });
        const t = detectarTitulos(filasHoja);
        if (t) {
          encontrado = { hoja: nombreHoja, filas: filasHoja, titulos: t };
          break;
        }
        const primera = (filasHoja.find((f) => f.some((c) => texto(c) !== '')) ?? []).map(texto).filter(Boolean);
        if (primera.length) titulosVistos.push(`"${nombreHoja}": ${primera.slice(0, 6).join(', ')}`);
      }
      if (!encontrado) {
        throw new Error(
          `Este archivo no parece una lista de productos: no se encontraron las columnas "Nombre" y "Precio". ` +
            (titulosVistos.length ? `Se encontró: ${titulosVistos.join(' · ')}. ` : 'El archivo está vacío. ') +
            'Descarga la plantilla para ver el formato.'
        );
      }

      const datosFilas = encontrado.filas.slice(encontrado.titulos.fila + 1);
      if (datosFilas.length > MAX_FILAS) throw new Error(`El archivo tiene más de ${MAX_FILAS} filas. Divídelo en partes.`);

      // Lo que ya existe en el sistema (para no duplicar)
      const [prodRes, cfgRes, catRes, provRes] = await Promise.all([
        traerTodo<{ nombre: string; sku: string | null; codigo_barras: string | null }>((a, b) =>
          supabase.from('productos').select('nombre, sku, codigo_barras').order('id').range(a, b)
        ),
        supabase.from('settings').select('stock_minimo_defecto').eq('id', 1).maybeSingle(),
        supabase.from('categorias').select('nombre'),
        supabase.from('proveedores').select('nombre'),
      ]);
      if (prodRes.error) throw new Error(prodRes.error.message);
      const ex: Existentes = {
        nombres: new Set((prodRes.data ?? []).map((p) => p.nombre.trim().toLowerCase())),
        skus: new Set((prodRes.data ?? []).filter((p) => p.sku).map((p) => (p.sku as string).trim().toLowerCase())),
        barras: new Set((prodRes.data ?? []).filter((p) => p.codigo_barras).map((p) => (p.codigo_barras as string).trim())),
        minimoDefecto: (cfgRes.data as { stock_minimo_defecto: number } | null)?.stock_minimo_defecto ?? 5,
      };

      // Revisión fila por fila (también detecta repetidos dentro del mismo archivo)
      const resultadoFilas: Fila[] = [];
      datosFilas.forEach((celdas, i) => {
        const n = encontrado!.titulos.fila + i + 2; // número de fila como lo ve Excel
        const f = revisarFila(n, celdas, encontrado!.titulos.mapa, ex);
        if (!f) return;
        if (f.errores.length === 0) {
          ex.nombres.add(f.datos.nombre.toLowerCase());
          if (f.datos.sku) ex.skus.add(f.datos.sku.toLowerCase());
          if (f.datos.barras) ex.barras.add(f.datos.barras);
        }
        resultadoFilas.push(f);
      });
      if (resultadoFilas.length === 0) throw new Error('El archivo tiene los títulos correctos pero no tiene productos debajo.');

      const titulosExcel = encontrado.filas[encontrado.titulos.fila] ?? [];
      const encabezados: Encabezado[] = titulosExcel
        .map((t, i) => ({ letra: letraColumna(i), titulo: texto(t), campo: encontrado!.titulos.mapa.get(i) ?? null }))
        .filter((e) => e.titulo !== '');

      setAnalisis({
        hoja: encontrado.hoja,
        columnas: [...encontrado.titulos.mapa.values()],
        encabezados,
        filas: resultadoFilas,
        categoriasExistentes: new Set(((catRes.data ?? []) as { nombre: string }[]).map((c) => c.nombre.trim().toLowerCase())),
        proveedoresExistentes: new Set(((provRes.data ?? []) as { nombre: string }[]).map((c) => c.nombre.trim().toLowerCase())),
      });
      setAceptado(false);
      setEtapa('confirmarArchivo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setLeyendo(false);
    }
  }

  async function importar() {
    if (validas.length === 0) return;
    setEtapa('importando');
    setError(null);
    let creados = 0;
    try {
      // 1. Categorías y proveedores que falten
      const [catRes, provRes] = await Promise.all([
        supabase.from('categorias').select('id, nombre'),
        supabase.from('proveedores').select('id, nombre'),
      ]);
      const catId = new Map(((catRes.data ?? []) as { id: string; nombre: string }[]).map((c) => [c.nombre.trim().toLowerCase(), c.id]));
      const provId = new Map(((provRes.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.nombre.trim().toLowerCase(), p.id]));

      const nuevasCat = [...new Set(validas.map((f) => f.datos.categoria).filter((c): c is string => !!c))].filter(
        (c) => !catId.has(c.toLowerCase())
      );
      if (nuevasCat.length) {
        const { data, error: e } = await supabase.from('categorias').insert(nuevasCat.map((nombre) => ({ nombre }))).select('id, nombre');
        if (e) throw new Error(`No se pudieron crear las categorías: ${e.message}`);
        (data as { id: string; nombre: string }[]).forEach((c) => catId.set(c.nombre.trim().toLowerCase(), c.id));
      }
      const nuevosProv = [...new Set(validas.map((f) => f.datos.proveedor).filter((p): p is string => !!p))].filter(
        (p) => !provId.has(p.toLowerCase())
      );
      if (nuevosProv.length) {
        const { data, error: e } = await supabase.from('proveedores').insert(nuevosProv.map((nombre) => ({ nombre }))).select('id, nombre');
        if (e) throw new Error(`No se pudieron crear los proveedores: ${e.message}`);
        (data as { id: string; nombre: string }[]).forEach((p) => provId.set(p.nombre.trim().toLowerCase(), p.id));
      }

      // 2. Productos (en lotes) y su stock inicial como Entrada
      const usuario = await etiquetaUsuario();
      setProgreso({ hecho: 0, total: validas.length });
      for (const lote of trozos(validas, LOTE)) {
        const { data, error: e } = await supabase
          .from('productos')
          .insert(
            lote.map(({ datos: d }) => ({
              nombre: d.nombre,
              sku: d.sku,
              codigo_barras: d.barras,
              categoria_id: d.categoria ? catId.get(d.categoria.toLowerCase()) ?? null : null,
              proveedor_id: d.proveedor ? provId.get(d.proveedor.toLowerCase()) ?? null : null,
              precio: d.precio,
              stock: 0,
              stock_minimo: d.minimo,
              ubicacion: d.ubicacion,
              descripcion: d.descripcion,
              activo: d.web,
              imagen_principal: d.imagen,
            }))
          )
          .select('id, nombre');
        if (e) throw new Error(`Error en las filas ${lote[0].n}–${lote[lote.length - 1].n}: ${e.message}`);
        const idPorNombre = new Map((data as { id: string; nombre: string }[]).map((p) => [p.nombre.trim().toLowerCase(), p.id]));

        const entradas = lote
          .filter((f) => f.datos.stock > 0 && idPorNombre.has(f.datos.nombre.toLowerCase()))
          .map((f) => ({
            producto_id: idPorNombre.get(f.datos.nombre.toLowerCase()),
            tipo: 'entrada',
            cantidad: f.datos.stock,
            motivo: 'Stock inicial',
            observaciones: `Importado desde Excel (${archivo})`,
            proveedor: f.datos.proveedor,
            usuario,
            origen: 'panel',
          }));
        if (entradas.length) {
          const { error: e2 } = await supabase.from('movimientos').insert(entradas);
          if (e2) throw new Error(`Los productos se crearon, pero falló el stock inicial (filas ${lote[0].n}–${lote[lote.length - 1].n}): ${e2.message}`);
        }
        creados += lote.length;
        setProgreso({ hecho: creados, total: validas.length });
      }

      await registrarActividad({
        accion: 'crear',
        entidad: 'producto',
        detalle: `Importó ${creados} productos desde Excel (${archivo})`,
      });
      setResultado(
        `Se importaron ${creados} productos.` +
          (nuevasCat.length ? ` Categorías nuevas: ${nuevasCat.length}.` : '') +
          (nuevosProv.length ? ` Proveedores nuevos: ${nuevosProv.length}.` : '') +
          (conError ? ` ${conError} filas con error no se importaron.` : '')
      );
      setEtapa('listo');
      onImportado();
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : 'Error al importar.') +
          (creados ? ` (Ya se habían importado ${creados}; si vuelves a importar el archivo, esos se detectan como existentes).` : '')
      );
      setEtapa('confirmarImport');
      setAceptado(false);
      if (creados) onImportado();
    }
  }

  const cerrar = () => {
    if (etapa !== 'importando') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={cerrar} role="dialog" aria-modal="true">
      <div className={`${CARD} w-full max-w-5xl max-h-[92vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-lg font-bold text-text flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-primary" /> Importar productos desde Excel
            </h3>
            {archivo && etapa !== 'elegir' && (
              <p className="text-xs text-text-muted mt-0.5">
                {archivo}
                {analisis ? ` · hoja "${analisis.hoja}"` : ''}
              </p>
            )}
          </div>
          <button type="button" onClick={cerrar} title="Cerrar" className="p-2 rounded-lg text-text-soft hover:bg-bg">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm flex items-start gap-2">
              <XCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          {etapa === 'elegir' && (
            <div className="space-y-4">
              <ol className="text-sm text-text-soft list-decimal pl-5 space-y-1">
                <li>
                  El Excel debe tener una fila de títulos con al menos <strong>Nombre</strong> y <strong>Precio</strong>.
                </li>
                <li>
                  Opcionales: Código (SKU), Código de barras, Categoría, Proveedor, Stock inicial, Stock mínimo, Ubicación,
                  Descripción, En web (Sí/No) e Imagen (URL).
                </li>
                <li>Categorías y proveedores que no existan se crean solos. El stock inicial queda registrado en Movimientos.</li>
                <li>Antes de guardar verás una vista previa. Los productos que ya existen no se duplican.</li>
              </ol>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={descargarPlantilla} className={BTN}>
                  <Download size={16} /> Descargar plantilla
                </button>
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={leerArchivo} />
                <button type="button" disabled={leyendo} onClick={() => inputRef.current?.click()} className={BTN_PRIMARY}>
                  {leyendo ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                  {leyendo ? 'Leyendo archivo...' : 'Elegir archivo Excel'}
                </button>
              </div>
            </div>
          )}

          {etapa === 'confirmarArchivo' && analisis && (
            <div className="space-y-4">
              <div className="bg-info-soft text-sky-900 border border-sky-200 rounded-lg p-4 text-sm">
                <p className="font-semibold">Paso 1 de 3 · ¿Es este el archivo correcto?</p>
                <p className="mt-1">
                  Se leyó la hoja <strong>&quot;{analisis.hoja}&quot;</strong> con <strong>{filas.length}</strong>{' '}
                  {filas.length === 1 ? 'fila' : 'filas'} de productos. Revisa cómo se entendió cada columna y los primeros productos.
                  Todavía no se ha guardado nada.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-surface-alt border-b border-border">
                      <tr>
                        <th className="px-3 py-2 text-xs font-semibold uppercase text-text-soft">Columna en tu Excel</th>
                        <th className="px-3 py-2 text-xs font-semibold uppercase text-text-soft">Se usará como</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {analisis.encabezados.map((e) => (
                        <tr key={e.letra}>
                          <td className="px-3 py-2 text-text">
                            <span className="text-text-muted mr-2">{e.letra}</span>
                            {e.titulo}
                          </td>
                          <td className="px-3 py-2">
                            {e.campo ? (
                              <span className="text-success font-medium">{CAMPOS.find((c) => c.campo === e.campo)?.titulo}</span>
                            ) : (
                              <span className="text-text-muted italic">Se ignora</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3">
                  {CAMPOS.filter((c) => !analisis.columnas.includes(c.campo)).length > 0 && (
                    <div className="bg-warning-soft text-amber-900 border border-amber-200 rounded-lg p-3 text-sm">
                      <p className="font-semibold">Datos que no vienen en el Excel (quedarán vacíos):</p>
                      <p className="mt-1">
                        {CAMPOS.filter((c) => !analisis.columnas.includes(c.campo))
                          .map((c) => c.titulo)
                          .join(', ')}
                      </p>
                    </div>
                  )}
                  <div className="border border-border rounded-lg p-3">
                    <p className="text-xs font-semibold uppercase text-text-soft mb-2">Primeros productos leídos</p>
                    <ul className="space-y-1.5 text-sm">
                      {filas.slice(0, 5).map((f) => (
                        <li key={f.n} className="flex justify-between gap-3">
                          <span className="text-text truncate">{f.datos.nombre || <em className="text-danger">(sin nombre)</em>}</span>
                          <span className="text-text-soft whitespace-nowrap">
                            ₡{f.datos.precio.toLocaleString('es-CR')} · {f.datos.stock} u.
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {etapa === 'confirmarImport' && resumen && (
            <div className="space-y-4">
              <div className="bg-info-soft text-sky-900 border border-sky-200 rounded-lg p-4 text-sm">
                <p className="font-semibold">Paso 3 de 3 · ¿Confirmas la importación?</p>
                <p className="mt-1">Esto es exactamente lo que se guardará en el sistema:</p>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Dato valor={validas.length} texto="productos nuevos" />
                <Dato valor={resumen.unidades} texto="unidades de stock inicial (como Entradas en Movimientos)" />
                <Dato valor={resumen.categoriasNuevas} texto="categorías nuevas" />
                <Dato valor={resumen.proveedoresNuevos} texto="proveedores nuevos" />
                <Dato valor={resumen.enWeb} texto="productos se publicarán en la web" />
                <Dato valor={conError} texto="filas con error que NO se importarán" peligro={conError > 0} />
              </ul>
              <label className="flex items-start gap-3 text-sm text-text cursor-pointer border border-border rounded-lg p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={aceptado}
                  onChange={(e) => setAceptado(e.target.checked)}
                />
                Revisé la información y quiero importar estos {validas.length} productos.
              </label>
            </div>
          )}

          {(etapa === 'revisar' || etapa === 'importando') && analisis && (
            <>
              {etapa === 'revisar' && (
                <p className="text-sm font-semibold text-text">Paso 2 de 3 · Revisión de cada fila</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Resumen icono={<CheckCircle2 size={18} />} clase="bg-success-soft text-green-800" valor={validas.length - conAviso} texto="Listas para importar" />
                <Resumen icono={<AlertTriangle size={18} />} clase="bg-warning-soft text-amber-800" valor={conAviso} texto="Se importan con aviso" />
                <Resumen icono={<XCircle size={18} />} clase="bg-danger-soft text-red-800" valor={conError} texto="Con error (no se importan)" />
              </div>

              <p className="text-xs text-text-muted">
                Columnas reconocidas:{' '}
                {CAMPOS.filter((c) => analisis.columnas.includes(c.campo)).map((c) => c.titulo).join(', ')}.
                {CAMPOS.filter((c) => !analisis.columnas.includes(c.campo)).length > 0 &&
                  ` No encontradas (quedan vacías): ${CAMPOS.filter((c) => !analisis.columnas.includes(c.campo))
                    .map((c) => c.titulo)
                    .join(', ')}.`}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} />
                  Ver solo filas con error o aviso
                </label>
                {conError > 0 && (
                  <button type="button" onClick={() => descargarErrores(filas)} className={BTN}>
                    <Download size={16} /> Descargar filas con error
                  </button>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-surface-alt border-b border-border">
                    <tr>
                      {['Fila', 'Nombre', 'Categoría', 'Proveedor', 'Precio', 'Stock', 'Estado'].map((t) => (
                        <th key={t} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-soft whitespace-nowrap">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibles.map((f) => (
                      <tr key={f.n} className={f.errores.length ? 'bg-danger-soft/40' : ''}>
                        <td className="px-3 py-2 text-text-muted">{f.n}</td>
                        <td className="px-3 py-2 font-medium text-text">{f.datos.nombre || '—'}</td>
                        <td className="px-3 py-2 text-text-soft">{f.datos.categoria ?? '—'}</td>
                        <td className="px-3 py-2 text-text-soft">{f.datos.proveedor ?? '—'}</td>
                        <td className="px-3 py-2 text-text-soft whitespace-nowrap">₡{f.datos.precio.toLocaleString('es-CR')}</td>
                        <td className="px-3 py-2 text-text-soft">{f.datos.stock}</td>
                        <td className="px-3 py-2 text-xs">
                          {f.errores.length > 0 ? (
                            <span className="text-danger font-medium">{f.errores.join('; ')}</span>
                          ) : f.avisos.length > 0 ? (
                            <span className="text-amber-700">{f.avisos.join('; ')}</span>
                          ) : (
                            <span className="text-success font-medium">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filas.length > 300 && <p className="text-xs text-text-muted">Se muestran las primeras 300 filas de la vista previa.</p>}

              {etapa === 'importando' && (
                <div>
                  <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progreso.total ? (progreso.hecho / progreso.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    Importando {progreso.hecho} de {progreso.total}... no cierres esta ventana.
                  </p>
                </div>
              )}
            </>
          )}

          {etapa === 'listo' && (
            <div className="text-center py-8">
              <CheckCircle2 size={44} className="mx-auto text-success mb-3" />
              <p className="text-lg font-bold text-text">Importación terminada</p>
              <p className="text-sm text-text-soft mt-1">{resultado}</p>
              <p className="text-xs text-text-muted mt-3">
                Los productos con &quot;En web: No&quot; no aparecen en la página hasta que los publiques desde Editar producto.
              </p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex justify-between gap-3">
          {etapa === 'confirmarArchivo' || etapa === 'revisar' ? (
            <button
              type="button"
              onClick={() => {
                setEtapa('elegir');
                setAnalisis(null);
                setError(null);
              }}
              className={BTN}
            >
              {etapa === 'confirmarArchivo' ? 'No, elegir otro archivo' : 'Elegir otro archivo'}
            </button>
          ) : etapa === 'confirmarImport' ? (
            <button type="button" onClick={() => setEtapa('revisar')} className={BTN}>
              Volver a la revisión
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            {etapa !== 'importando' && (
              <button type="button" onClick={onClose} className={BTN}>
                {etapa === 'listo' ? 'Cerrar' : 'Cancelar'}
              </button>
            )}
            {etapa === 'confirmarArchivo' && (
              <button type="button" onClick={() => setEtapa('revisar')} className={BTN_PRIMARY}>
                Sí, es el archivo correcto
              </button>
            )}
            {etapa === 'revisar' && (
              <button
                type="button"
                disabled={validas.length === 0}
                onClick={() => {
                  setAceptado(false);
                  setEtapa('confirmarImport');
                }}
                className={BTN_PRIMARY}
              >
                {validas.length === 0 ? 'No hay filas válidas' : `Continuar con ${validas.length} productos`}
              </button>
            )}
            {(etapa === 'confirmarImport' || etapa === 'importando') && (
              <button type="button" disabled={etapa === 'importando' || !aceptado} onClick={importar} className={BTN_PRIMARY}>
                {etapa === 'importando' ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                {etapa === 'importando' ? 'Importando...' : 'Sí, importar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Resumen({ icono, clase, valor, texto: t }: { icono: React.ReactNode; clase: string; valor: number; texto: string }) {
  return (
    <div className={`rounded-lg p-3 flex items-center gap-3 ${clase}`}>
      {icono}
      <div>
        <p className="text-xl font-bold leading-none">{valor}</p>
        <p className="text-xs mt-1">{t}</p>
      </div>
    </div>
  );
}

function Dato({ valor, texto: t, peligro = false }: { valor: number; texto: string; peligro?: boolean }) {
  return (
    <li className={`border rounded-lg p-3 flex items-center gap-3 ${peligro ? 'border-danger/30 bg-danger-soft' : 'border-border'}`}>
      <span className={`text-2xl font-bold ${peligro ? 'text-danger' : 'text-text'}`}>{valor.toLocaleString('es-CR')}</span>
      <span className="text-text-soft">{t}</span>
    </li>
  );
}
