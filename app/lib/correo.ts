import nodemailer from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';

// =====================================================================
// CORREOS DE LA EMPRESA (solo se usa en el SERVIDOR)
// Una sola plantilla con la marca: encabezado verde con logo, contenido
// y pie con datos de contacto + derechos reservados. La usan:
//  - la respuesta de una cotización (empresa → cliente)
//  - el aviso de cotización nueva (web → empresa)
// Tablas y estilos en línea: así se ve bien en Gmail, Outlook y celular.
// =====================================================================

export const VERDE = '#1f6f3f';

export type Empresa = {
  nombre: string; // nombre comercial
  razon: string; // razón social
  cedula: string;
  telefono: string;
  whatsapp: string;
  correo: string;
  direccion: string;
  horario: string;
  web: string;
  logo: string;
};

export function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export const conSaltos = (t: string) => escapar(t).replace(/\n/g, '<br>');
export const enlaceTel = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`;
export function enlaceWhatsApp(t: string, texto?: string): string {
  const d = t.replace(/\D/g, '');
  const num = d.length === 8 ? `506${d}` : d;
  return `https://wa.me/${num}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

/** Datos de la empresa desde Configuración (settings). */
export async function cargarEmpresa(db: SupabaseClient, origen: string, correoRespaldo: string, tiendaId?: string): Promise<Empresa> {
  // Con la sesión del usuario la base ya filtra su ferretería; con la clave de servicio
  // (aviso automático) hay que indicar de qué tienda es.
  let consulta = db
    .from('settings')
    .select('business_name, nombre_comercial, cedula_juridica, phone, whatsapp, email, address, horario, sitio_web, logo_url');
  if (tiendaId) consulta = consulta.eq('tienda_id', tiendaId);
  const { data: cfg } = await consulta.limit(1).maybeSingle();
  return {
    nombre: cfg?.nombre_comercial || cfg?.business_name || 'Ferretería',
    razon: cfg?.business_name || '',
    cedula: cfg?.cedula_juridica || '',
    telefono: cfg?.phone || '',
    whatsapp: cfg?.whatsapp || '',
    correo: cfg?.email || correoRespaldo,
    direccion: cfg?.address || '',
    horario: cfg?.horario || '',
    web: cfg?.sitio_web || '',
    logo: cfg?.logo_url || `${origen}/logo.png`,
  };
}

/** Fila "Etiqueta: valor" (con enlace opcional), para tablas de datos. */
export function filaDato(etiqueta: string, valor: string, href?: string, tam = 12): string {
  if (!valor) return '';
  const v = href ? `<a href="${escapar(href)}" style="color:${VERDE};text-decoration:none">${escapar(valor)}</a>` : escapar(valor);
  return `<tr><td style="padding:3px 14px 3px 0;color:#6b7280;font-size:${tam}px;white-space:nowrap;vertical-align:top">${etiqueta}</td>
    <td style="padding:3px 0;color:#374151;font-size:${tam}px">${v}</td></tr>`;
}

/** Botón verde (o con borde) que se ve bien en todos los correos. */
export function boton(texto: string, href: string, relleno = true): string {
  return `<a href="${escapar(href)}" style="display:inline-block;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:bold;text-decoration:none;${
    relleno ? `background:${VERDE};color:#ffffff;` : `background:#ffffff;color:${VERDE};border:1px solid ${VERDE};`
  }">${escapar(texto)}</a>`;
}

/** Pie fijo: logo, datos de contacto y derechos reservados. */
function pie(e: Empresa, nota: string): string {
  const anio = new Date().getFullYear();
  const web = e.web.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `
  <tr><td style="padding:24px 28px 8px"><div style="border-top:1px solid #e5e7eb"></div></td></tr>
  <tr><td style="padding:8px 28px 22px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top;padding-right:16px"><img src="${escapar(e.logo)}" alt="" width="72" style="display:block;max-width:72px;height:auto"></td>
      <td style="vertical-align:top">
        <div style="font-size:14px;font-weight:bold;color:#111827">${escapar(e.nombre)}</div>
        ${e.razon && e.razon !== e.nombre ? `<div style="font-size:12px;color:#6b7280;margin-bottom:6px">${escapar(e.razon)}</div>` : '<div style="height:6px"></div>'}
        <table role="presentation" cellpadding="0" cellspacing="0">
          ${filaDato('Teléfono', e.telefono, e.telefono ? enlaceTel(e.telefono) : undefined)}
          ${filaDato('WhatsApp', e.whatsapp, e.whatsapp ? enlaceWhatsApp(e.whatsapp) : undefined)}
          ${filaDato('Correo', e.correo, e.correo ? `mailto:${e.correo}` : undefined)}
          ${filaDato('Dirección', e.direccion)}
          ${filaDato('Horario', e.horario)}
          ${filaDato('Sitio web', web, e.web || undefined)}
        </table>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:14px 28px;color:#9ca3af;font-size:11px;line-height:1.6">
    ${nota}<br>
    © ${anio} ${escapar(e.razon || e.nombre)}${e.cedula ? ` · Cédula jurídica ${escapar(e.cedula)}` : ''}. Todos los derechos reservados.
  </td></tr>`;
}

/** Correo completo con la marca. "contenido" son filas <tr> ya armadas. */
export function plantillaBase(e: Empresa, opciones: { subtitulo: string; contenido: string; nota: string; preencabezado?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f3f4f6">
${opciones.preencabezado ? `<div style="display:none;max-height:0;overflow:hidden">${escapar(opciones.preencabezado)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
  <tr><td style="background:${VERDE};padding:22px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="64" style="vertical-align:middle">
        <div style="background:#ffffff;border-radius:10px;width:56px;height:56px;text-align:center">
          <img src="${escapar(e.logo)}" alt="${escapar(e.nombre)}" width="52" height="52" style="display:block;margin:0 auto;padding-top:2px;object-fit:contain">
        </div>
      </td>
      <td style="vertical-align:middle;padding-left:14px">
        <div style="color:#ffffff;font-size:18px;font-weight:bold">${escapar(e.nombre)}</div>
        <div style="color:#d1fae5;font-size:13px;margin-top:2px">${escapar(opciones.subtitulo)}</div>
      </td>
    </tr></table>
  </td></tr>
  ${opciones.contenido}
  ${pie(e, opciones.nota)}
</table>
</td></tr></table>
</body></html>`;
}

/** Versión de texto simple del pie (para clientes de correo sin HTML). */
export function pieTexto(e: Empresa): string {
  return [
    '',
    '--',
    e.nombre + (e.razon && e.razon !== e.nombre ? ` (${e.razon})` : ''),
    e.telefono && `Teléfono: ${e.telefono}`,
    e.whatsapp && `WhatsApp: ${e.whatsapp}`,
    e.correo && `Correo: ${e.correo}`,
    e.direccion && `Dirección: ${e.direccion}`,
    e.horario && `Horario: ${e.horario}`,
    e.web && `Sitio web: ${e.web}`,
    `© ${new Date().getFullYear()} ${e.razon || e.nombre}. Todos los derechos reservados.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Envía con la cuenta de Gmail de la empresa (SMTP_USER / SMTP_PASS). */
export async function enviarCorreo(m: { para: string; asunto: string; texto: string; html: string; responderA?: string; nombreRemitente: string }) {
  // Se limpian espacios y saltos de línea (Google muestra la clave en grupos de 4)
  const user = (process.env.SMTP_USER ?? '').trim();
  const pass = (process.env.SMTP_PASS ?? '').replace(/\s+/g, '');
  if (!user || !pass) throw new Error('FALTA_SMTP');
  if (pass.length !== 16) throw new Error(`CLAVE_MAL_LARGO:${pass.length}`);
  const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  await transporte.sendMail({
    from: `"${m.nombreRemitente.replace(/"/g, '')}" <${user}>`,
    to: m.para,
    replyTo: m.responderA,
    subject: m.asunto,
    text: m.texto,
    html: m.html,
  });
}
