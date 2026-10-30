import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { boton, cargarEmpresa, conSaltos, enlaceTel, enlaceWhatsApp, enviarCorreo, escapar, filaDato, pieTexto, plantillaBase, VERDE } from '@/lib/correo';

// =====================================================================
// AVISO DE COTIZACIÓN NUEVA (web → correo de la empresa)
// La llama Supabase (Database Webhook) cada vez que entra una cotización.
// Solo responde si trae la clave secreta AVISO_SECRETO en el encabezado.
// Usa la clave de servicio (solo servidor) porque no hay usuario con sesión.
// =====================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AVISO_SECRETO = process.env.AVISO_SECRETO;

function claveValida(recibida: string | null): boolean {
  if (!AVISO_SECRETO || !recibida) return false;
  const a = Buffer.from(recibida);
  const b = Buffer.from(AVISO_SECRETO);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    if (!claveValida(req.headers.get('x-aviso-secreto'))) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    if (!SUPABASE_URL || !SECRET_KEY) return NextResponse.json({ error: 'Falta configuración.' }, { status: 500 });

    const body = (await req.json()) as { type?: string; table?: string; record?: { id?: string } };
    if (body.type !== 'INSERT' || body.table !== 'cotizaciones' || !body.record?.id) {
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    // Se lee de la base (no se confía en lo que trae el aviso)
    const { data: cot } = await db
      .from('cotizaciones')
      .select('id, nombre, correo, telefono, mensaje, fecha, tienda_id')
      .eq('id', body.record.id)
      .maybeSingle();
    if (!cot) return NextResponse.json({ ok: true, ignorado: true });

    // Solo cotizaciones recientes (evita reenvíos viejos)
    if (cot.fecha && Date.now() - new Date(cot.fecha).getTime() > 15 * 60 * 1000) {
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const origen = new URL(req.url).origin;
    const empresa = await cargarEmpresa(db, origen, process.env.SMTP_USER ?? '', cot.tienda_id ?? undefined);
    const para = empresa.correo || process.env.SMTP_USER;
    if (!para) return NextResponse.json({ error: 'No hay correo de la empresa.' }, { status: 500 });

    const nombre = (cot.nombre ?? '').trim() || 'Cliente';
    const correoCliente = (cot.correo ?? '').trim();
    const tel = (cot.telefono ?? '').trim();
    const fecha = new Date(cot.fecha ?? Date.now()).toLocaleString('es-CR', {
      timeZone: 'America/Costa_Rica',
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const primerNombre = nombre.split(' ')[0];

    const botones = [
      boton('Abrir en FerreStock', `${origen}/cotizaciones`),
      correoCliente &&
        boton('Responder por correo', `mailto:${correoCliente}?subject=${encodeURIComponent(`Respuesta a su cotización — ${empresa.nombre}`)}`, false),
      tel && boton('WhatsApp', enlaceWhatsApp(tel, `Hola ${primerNombre}, le escribimos de ${empresa.nombre} sobre su cotización.`), false),
    ]
      .filter(Boolean)
      .join('&nbsp;&nbsp;');

    const contenido = `
  <tr><td style="padding:26px 28px 6px">
    <div style="display:inline-block;background:#e0f2fe;color:#075985;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;padding:4px 10px;border-radius:999px">Nueva cotización</div>
    <div style="font-size:20px;font-weight:bold;color:#111827;margin-top:10px">${escapar(nombre)} solicita una cotización</div>
    <div style="font-size:13px;color:#6b7280;margin-top:2px">Recibida el ${escapar(fecha)} desde la página web</div>
  </td></tr>
  <tr><td style="padding:14px 28px 4px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;width:100%"><tr><td style="padding:12px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0">
        ${filaDato('Cliente', nombre, undefined, 13)}
        ${filaDato('Correo', correoCliente, correoCliente ? `mailto:${correoCliente}` : undefined, 13)}
        ${filaDato('Teléfono', tel, tel ? enlaceTel(tel) : undefined, 13)}
      </table>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 28px 4px">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Mensaje del cliente</div>
    <div style="background:#f0f9ff;border-left:3px solid #0284c7;border-radius:6px;padding:12px 14px;color:#1f2937;font-size:14px;line-height:1.6">${conSaltos(cot.mensaje || '(sin mensaje)')}</div>
  </td></tr>
  <tr><td style="padding:20px 28px 4px">${botones}</td></tr>
  <tr><td style="padding:10px 28px 0;color:#6b7280;font-size:12px;line-height:1.5">
    Respóndala desde <strong style="color:${VERDE}">FerreStock → Cotizaciones</strong> para que quede registrado quién la atendió.
  </td></tr>`;

    const html = plantillaBase(empresa, {
      subtitulo: 'Aviso interno · Cotizaciones web',
      preencabezado: `${nombre}: ${(cot.mensaje ?? '').slice(0, 100)}`,
      contenido,
      nota: 'Aviso automático de FerreStock. Si responde a este correo, la respuesta le llega directamente al cliente.',
    });
    const texto = [
      `Nueva cotización desde la página web (${fecha})`,
      '',
      `Cliente: ${nombre}`,
      correoCliente && `Correo: ${correoCliente}`,
      tel && `Teléfono: ${tel}`,
      '',
      'Mensaje:',
      cot.mensaje || '(sin mensaje)',
      '',
      `Abrir en FerreStock: ${origen}/cotizaciones`,
      pieTexto(empresa),
    ]
      .filter((l) => l !== false && l !== null && l !== undefined)
      .join('\n');

    await enviarCorreo({
      para,
      asunto: `Nueva cotización: ${nombre}`,
      texto,
      html,
      responderA: correoCliente || undefined,
      nombreRemitente: `FerreStock · ${empresa.nombre}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Error en /api/cotizaciones/aviso:', e);
    return NextResponse.json({ error: 'No se pudo enviar el aviso.' }, { status: 500 });
  }
}
