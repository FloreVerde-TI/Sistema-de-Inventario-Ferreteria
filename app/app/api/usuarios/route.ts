import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// =====================================================================
// RUTA DEL SERVIDOR: crear, editar, activar/desactivar y eliminar usuarios.
// Usa la clave SECRETA (solo existe aquí, nunca en el navegador).
// Antes de hacer algo revisa quién la llama y si tiene permiso.
// =====================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type RolFila = { nombre: string; nivel: number; es_super: boolean; permisos: string[] };
type PerfilFila = { full_name: string; role: string; activo: boolean; roles: RolFila | null };
type Quien = { id: string; etiqueta: string; nivel: number; esSuper: boolean; permisos: string[] };

type Accion =
  | { accion: 'crear'; nombre: string; email: string; password: string; rol: string }
  | { accion: 'editar'; id: string; nombre: string; rol: string; password?: string }
  | { accion: 'activar' | 'desactivar' | 'eliminar'; id: string };

class ErrorUsuario extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function clienteAdmin(): SupabaseClient {
  if (!SUPABASE_URL || !SECRET_KEY) {
    throw new ErrorUsuario('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (reinicia "npm run dev").', 500);
  }
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function leerPerfil(db: SupabaseClient, id: string): Promise<PerfilFila | null> {
  const { data } = await db
    .from('profiles')
    .select('full_name, role, activo, roles(nombre, nivel, es_super, permisos)')
    .eq('id', id)
    .maybeSingle();
  return data as unknown as PerfilFila | null;
}

// Identifica a quien llama con el token de su sesión
async function quienLlama(db: SupabaseClient, req: Request): Promise<Quien> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ErrorUsuario('No hay sesión iniciada.', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ErrorUsuario('Tu sesión venció. Vuelve a iniciar sesión.', 401);

  const p = await leerPerfil(db, data.user.id);
  if (!p || !p.activo || !p.roles) throw new ErrorUsuario('Tu usuario no está activo.', 403);

  const q: Quien = {
    id: data.user.id,
    etiqueta: `${p.full_name} — ${p.role}`,
    nivel: p.roles.nivel,
    esSuper: p.roles.es_super,
    permisos: p.roles.permisos,
  };
  if (!q.esSuper && !q.permisos.includes('usuarios_gestionar')) {
    throw new ErrorUsuario('No tienes permiso para gestionar usuarios.', 403);
  }
  return q;
}

async function rolValido(db: SupabaseClient, q: Quien, nombre: string): Promise<RolFila> {
  const { data } = await db.from('roles').select('nombre, nivel, es_super, permisos').eq('nombre', nombre).maybeSingle();
  const rol = data as RolFila | null;
  if (!rol) throw new ErrorUsuario('El rol elegido no existe.');
  // Solo se asignan roles de nivel igual o menor al propio (un Super Administrador puede todos)
  if (!q.esSuper && rol.nivel > q.nivel) throw new ErrorUsuario('No puedes asignar un rol mayor al tuyo.', 403);
  return rol;
}

// Revisa que pueda tocar a ese usuario (nunca a sí mismo para acciones delicadas)
async function objetivo(db: SupabaseClient, q: Quien, id: string, permitirseASiMismo = false): Promise<PerfilFila> {
  const p = await leerPerfil(db, id);
  if (!p) throw new ErrorUsuario('El usuario no existe.', 404);
  if (id === q.id) {
    if (!permitirseASiMismo) throw new ErrorUsuario('No puedes hacer esto con tu propio usuario.', 403);
    return p;
  }
  const nivel = p.roles?.nivel ?? 0;
  if (!q.esSuper && nivel > q.nivel) throw new ErrorUsuario('No puedes modificar a un usuario de mayor rango.', 403);
  if (!q.esSuper && p.roles?.es_super) throw new ErrorUsuario('No puedes modificar a un Super Administrador.', 403);
  return p;
}

function validarPassword(p: string) {
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) {
    throw new ErrorUsuario('La contraseña debe tener al menos 8 caracteres, con letras y números.');
  }
}

async function bitacora(db: SupabaseClient, q: Quien, accion: string, id: string, detalle: string) {
  await db.from('actividad').insert({
    usuario_id: q.id,
    usuario: q.etiqueta,
    accion,
    entidad: 'usuario',
    entidad_id: id,
    detalle,
  });
}

function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already') && (m.includes('registered') || m.includes('exists'))) return 'Ya existe un usuario con ese correo.';
  if (m.includes('invalid') && m.includes('email')) return 'El correo no es válido.';
  if (m.includes('password')) return 'La contraseña no es válida (mínimo 8 caracteres, letras y números).';
  return msg;
}

export async function POST(req: Request) {
  try {
    const db = clienteAdmin();
    const q = await quienLlama(db, req);
    const body = (await req.json()) as Accion;

    switch (body.accion) {
      case 'crear': {
        const nombre = body.nombre?.trim() ?? '';
        const email = body.email?.trim().toLowerCase() ?? '';
        if (!nombre) throw new ErrorUsuario('Escribe el nombre.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorUsuario('El correo no es válido.');
        validarPassword(body.password ?? '');
        const rol = await rolValido(db, q, body.rol);

        // El trigger de la base crea el perfil con este nombre y rol
        const { data, error } = await db.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: nombre },
          app_metadata: { role: rol.nombre },
        });
        if (error || !data.user) throw new ErrorUsuario(traducir(error?.message ?? 'No se pudo crear.'));
        await bitacora(db, q, 'crear', data.user.id, `Creó el usuario ${nombre} (${email}) como ${rol.nombre}`);
        return NextResponse.json({ ok: true });
      }

      case 'editar': {
        const yoMismo = body.id === q.id;
        const p = await objetivo(db, q, body.id, true);
        const nombre = body.nombre?.trim() ?? '';
        if (!nombre) throw new ErrorUsuario('Escribe el nombre.');
        if (yoMismo && body.rol !== p.role) throw new ErrorUsuario('No puedes cambiar tu propio rol.', 403);
        const rol = yoMismo ? null : await rolValido(db, q, body.rol);

        const { error: perfErr } = await db
          .from('profiles')
          .update({ full_name: nombre, role: rol?.nombre ?? p.role, updated_at: new Date().toISOString() })
          .eq('id', body.id);
        if (perfErr) throw new ErrorUsuario(perfErr.message);

        const cambios: { user_metadata: { full_name: string }; app_metadata?: { role: string }; password?: string } = {
          user_metadata: { full_name: nombre },
        };
        if (rol) cambios.app_metadata = { role: rol.nombre };
        if (body.password) {
          validarPassword(body.password);
          cambios.password = body.password;
        }
        const { error } = await db.auth.admin.updateUserById(body.id, cambios);
        if (error) throw new ErrorUsuario(traducir(error.message));

        const partes = [`Editó a ${nombre}`];
        if (rol && rol.nombre !== p.role) partes.push(`rol ${p.role} → ${rol.nombre}`);
        if (body.password) partes.push('cambió la contraseña');
        await bitacora(db, q, 'editar', body.id, partes.join(' · '));
        return NextResponse.json({ ok: true });
      }

      case 'activar':
      case 'desactivar': {
        const p = await objetivo(db, q, body.id);
        const activo = body.accion === 'activar';
        const { error: perfErr } = await db.from('profiles').update({ activo }).eq('id', body.id);
        if (perfErr) throw new ErrorUsuario(perfErr.message);
        // Bloquea (o desbloquea) el inicio de sesión en Auth
        const { error } = await db.auth.admin.updateUserById(body.id, { ban_duration: activo ? 'none' : '876000h' });
        if (error) throw new ErrorUsuario(error.message);
        await bitacora(db, q, body.accion, body.id, `${activo ? 'Activó' : 'Desactivó'} a ${p.full_name}`);
        return NextResponse.json({ ok: true });
      }

      case 'eliminar': {
        const p = await objetivo(db, q, body.id);
        const { error } = await db.auth.admin.deleteUser(body.id);
        if (error) throw new ErrorUsuario(error.message);
        await bitacora(db, q, 'eliminar', body.id, `Eliminó el usuario ${p.full_name} (${p.role})`);
        return NextResponse.json({ ok: true });
      }

      default:
        throw new ErrorUsuario('Acción no válida.');
    }
  } catch (e) {
    if (e instanceof ErrorUsuario) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('Error en /api/usuarios:', e);
    return NextResponse.json({ error: 'Error inesperado en el servidor.' }, { status: 500 });
  }
}
