import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cargarEmpresa, conSaltos, enviarCorreo, escapar, pieTexto, plantillaBase, VERDE } from '@/lib/correo';

// =====================================================================
// RUTA DEL SERVIDOR: responder una cotización por correo (empresa → cliente).
// Sale de la cuenta de la empresa (SMTP). La base revisa el permiso:
// se usa la sesión de quien llama (RLS), sin el permiso "cotizaciones"
// no puede leer ni responder.
// =====================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const COLUMNS =
  'id, nombre, correo, telefono, mensaje, estado, fecha, respuesta, respondido_nombre, respondido_en, reabierto_nombre, reabierto_en';

class ErrorRuta extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !ANON_KEY) throw new ErrorRuta('Falta la configuración de Supabase.', 500);

    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new ErrorRuta('No hay sesión iniciada.', 401);

    // Cliente con la sesión del usuario: aplica sus permisos (RLS)
    const db = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: auth, error: authErr } = await db.auth.getUser(token);
    if (authErr || !auth.user) throw new ErrorRuta('Tu sesión venció. Vuelve a iniciar sesión.', 401);

    const body = (await req.json()) as { id?: string; asunto?: string; respuesta?: string };
    const asunto = (body.asunto ?? '').trim().slice(0, 150);
    const respuesta = (body.respuesta ?? '').trim().slice(0, 5000);
    if (!body.id) throw new ErrorRuta('Falta la cotización.');
    if (!asunto) throw new ErrorRuta('Escribe el asunto.');
    if (respuesta.length < 10) throw new ErrorRuta('Escribe la respuesta.');

    // 1. La cotización (si no tiene permiso, la base no la devuelve)
    const { data: cot } = await db.from('cotizaciones').select(COLUMNS).eq('id', body.id).maybeSingle();
    if (!cot) throw new ErrorRuta('No tienes permiso para responder cotizaciones, o ya no existe.', 403);
    const correo = (cot.correo ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorRuta('El correo del cliente no es válido.');
    if ((cot.estado ?? 'nueva').toLowerCase() !== 'nueva') throw new ErrorRuta('Esta cotización ya fue atendida.');

    // 2. Quién responde y datos de la empresa
    const { data: perfil } = await db.from('profiles').select('full_name, role').eq('id', auth.user.id).maybeSingle();
    const quien = perfil ? `${perfil.full_name} — ${perfil.role}` : auth.user.email ?? 'Usuario';
    const atiende = perfil?.full_name || '';
    const empresa = await cargarEmpresa(db, new URL(req.url).origin, process.env.SMTP_USER ?? '');

    // 3. Correo con la marca
    const contenido = `
  <tr><td style="padding:28px 28px 8px;color:#1f2937;font-size:14px;line-height:1.6">${conSaltos(respuesta)}</td></tr>
  ${
    atiende
      ? `<tr><td style="padding:4px 28px 0;color:#6b7280;font-size:12px">Le atendió: <strong style="color:#374151">${escapar(atiende)}</strong></td></tr>`
      : ''
  }
  ${
    cot.mensaje
      ? `<tr><td style="padding:16px 28px 4px">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Su consulta</div>
    <div style="background:#f9fafb;border-left:3px solid ${VERDE};border-radius:6px;padding:12px 14px;color:#4b5563;font-size:13px;line-height:1.5">${conSaltos(cot.mensaje)}</div>
  </td></tr>`
      : ''
  }`;
    const html = plantillaBase(empresa, {
      subtitulo: 'Respuesta a su solicitud de cotización',
      preencabezado: respuesta.slice(0, 120),
      contenido,
      nota: 'Recibe este correo porque envió una solicitud de cotización en nuestra página web. Puede responder directamente a este mensaje.',
    });
    const texto =
      respuesta +
      (atiende ? `\n\nLe atendió: ${atiende}` : '') +
      (cot.mensaje ? `\n\n----- Su consulta -----\n${cot.mensaje}` : '') +
      '\n' +
      pieTexto(empresa);

    await enviarCorreo({ para: correo, asunto, texto, html, responderA: empresa.correo, nombreRemitente: empresa.nombre });

    // 4. Marcar como respondida
    const { data: actualizada, error: updErr } = await db
      .from('cotizaciones')
      .update({
        estado: 'respondida',
        respuesta,
        respondido_por: auth.user.id,
        respondido_nombre: quien,
        respondido_en: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select(COLUMNS)
      .maybeSingle();
    if (updErr || !actualizada) {
      throw new ErrorRuta('El correo se envió, pero no se pudo marcar como respondida. Márcala a mano.', 500);
    }

    await db.from('actividad').insert({
      accion: 'responder',
      entidad: 'cotizacion',
      entidad_id: body.id,
      detalle: `Respondió por correo la cotización de ${cot.nombre || 'cliente'} (${correo})`,
    });

    return NextResponse.json({ ok: true, cotizacion: actualizada });
  } catch (e) {
    if (e instanceof ErrorRuta) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message === 'FALTA_SMTP') {
      return NextResponse.json({ error: 'Falta configurar SMTP_USER y SMTP_PASS (correo de la empresa) en el servidor.' }, { status: 500 });
    }
    console.error('Error en /api/cotizaciones:', e);
    // Mensaje claro según lo que respondió Gmail (nunca incluye la clave)
    const m = e instanceof Error ? e.message : '';
    const cod = (e as { responseCode?: number } | null)?.responseCode;
    let msg = 'No se pudo enviar el correo.';
    if (m.startsWith('CLAVE_MAL_LARGO:'))
      msg = `SMTP_PASS tiene ${m.split(':')[1]} caracteres; la contraseña de aplicación de Google tiene 16. Revísala.`;
    else if (cod === 534 || /5\.7\.9/.test(m))
      msg = 'Gmail pide una CONTRASEÑA DE APLICACIÓN (no la contraseña normal de la cuenta). (Código 534)';
    else if (cod === 535 || /5\.7\.8/.test(m))
      msg = 'Gmail rechazó el usuario o la clave: revisa que SMTP_USER sea la misma cuenta donde creaste la contraseña de aplicación. (Código 535)';
    else if (/auth|login|credential/i.test(m)) msg = `El correo de la empresa rechazó el acceso. (${m.slice(0, 120)})`;
    else if (m) msg = `No se pudo enviar el correo. (${m.slice(0, 120)})`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
