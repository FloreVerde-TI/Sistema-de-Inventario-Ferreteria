"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout, { usePerfil, Permiso, PerfilSesion } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { registrarActividad } from '@/lib/actividad';
import {
  UserPlus,
  Edit,
  Trash2,
  Loader2,
  X,
  Power,
  Shield,
  Users,
  Plus,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';

// ---------------------------------------------------------------------
// Tipos y constantes
// ---------------------------------------------------------------------
type Usuario = { id: string; full_name: string; email: string; role: string; activo: boolean };
type Rol = {
  id: string;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  es_super: boolean;
  es_sistema: boolean;
  permisos: string[];
};
type Tab = 'usuarios' | 'roles';
type Aviso = { tipo: 'error' | 'exito'; texto: string } | null;

type AccionApi =
  | { accion: 'crear'; nombre: string; email: string; password: string; rol: string }
  | { accion: 'editar'; id: string; nombre: string; rol: string; password?: string }
  | { accion: 'activar' | 'desactivar' | 'eliminar'; id: string };

const GRUPOS_PERMISOS: { grupo: string; items: { key: Permiso; label: string }[] }[] = [
  {
    grupo: 'Productos',
    items: [
      { key: 'productos_crear', label: 'Crear productos' },
      { key: 'productos_editar', label: 'Editar productos' },
      { key: 'productos_deshabilitar', label: 'Habilitar / deshabilitar' },
      { key: 'productos_eliminar', label: 'Eliminar productos' },
    ],
  },
  {
    grupo: 'Inventario',
    items: [
      { key: 'entradas', label: 'Registrar entradas' },
      { key: 'salidas', label: 'Registrar salidas' },
      { key: 'reportes', label: 'Ver y exportar reportes' },
    ],
  },
  {
    grupo: 'Pedidos web',
    items: [
      { key: 'pedidos_revisar', label: 'Aprobar o rechazar' },
      { key: 'pedidos_reabrir', label: 'Reabrir pedidos' },
    ],
  },
  {
    grupo: 'Administración',
    items: [
      { key: 'usuarios_gestionar', label: 'Gestionar usuarios' },
      { key: 'roles_gestionar', label: 'Gestionar roles' },
      { key: 'config_editar', label: 'Editar configuración' },
      { key: 'bitacora_ver', label: 'Ver bitácora' },
    ],
  },
];

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-light transition-all disabled:opacity-50';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';
const ICON_BTN = 'p-2 rounded-lg text-text-soft hover:bg-bg hover:text-text transition-colors';
const BTN =
  'card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors disabled:opacity-50';
const BTN_PRIMARY =
  'px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50';

// ---------------------------------------------------------------------
// Funciones auxiliares
// ---------------------------------------------------------------------
function iniciales(nombre: string): string {
  return (nombre.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2) || '?').toUpperCase();
}

function passwordValida(p: string): boolean {
  return p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

function errorDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return 'Error desconocido';
}

// Llama a la ruta del servidor con el token de la sesión
async function llamarApi(body: AccionApi): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'No se pudo completar la acción.');
}

// Puede gestionar a ese usuario: nunca a sí mismo para acciones delicadas,
// y solo de nivel igual o menor (un Super Administrador puede a todos)
function puedeGestionar(yo: PerfilSesion, u: Usuario, rolDe: Map<string, Rol>): boolean {
  if (u.id === yo.id) return false;
  if (yo.esSuper) return true;
  const r = rolDe.get(u.role);
  if (!r || r.es_super) return false;
  return r.nivel <= yo.nivel;
}

// ---------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------
export default function UsuariosPage() {
  return (
    <AdminLayout>
      <UsuariosContenido />
    </AdminLayout>
  );
}

function UsuariosContenido() {
  const { perfil, puede } = usePerfil();
  const [tab, setTab] = useState<Tab>('usuarios');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [eliminando, setEliminando] = useState<Usuario | null>(null);
  const [rolEditando, setRolEditando] = useState<Rol | 'nuevo' | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [uRes, rRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, activo').order('full_name'),
      supabase.from('roles').select('id, nombre, descripcion, nivel, es_super, es_sistema, permisos').order('nivel', { ascending: false }),
    ]);
    const fallo = uRes.error ?? rRes.error;
    if (fallo) setAviso({ tipo: 'error', texto: `No se pudieron cargar los datos: ${fallo.message}` });
    else {
      setUsuarios((uRes.data ?? []) as Usuario[]);
      setRoles((rRes.data ?? []) as Rol[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const rolDe = useMemo(() => new Map(roles.map((r) => [r.nombre, r])), [roles]);
  const usuariosPorRol = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of usuarios) m.set(u.role, (m.get(u.role) ?? 0) + 1);
    return m;
  }, [usuarios]);

  if (!perfil) return null;

  // Roles que este usuario puede asignar
  const rolesAsignables = roles.filter((r) => perfil.esSuper || (!r.es_super && r.nivel <= perfil.nivel));

  async function cambiarEstado(u: Usuario) {
    setAviso(null);
    setOcupado(u.id);
    try {
      await llamarApi({ accion: u.activo ? 'desactivar' : 'activar', id: u.id });
      setAviso({ tipo: 'exito', texto: `${u.full_name} quedó ${u.activo ? 'desactivado' : 'activo'}.` });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: errorDe(e) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Gestión de usuarios</h2>
          <p className="text-text-muted text-sm">Administra los accesos al sistema, los roles y sus permisos</p>
        </div>
        {tab === 'usuarios' ? (
          <button type="button" onClick={() => setCreando(true)} className={BTN_PRIMARY}>
            <UserPlus size={16} /> Crear usuario
          </button>
        ) : (
          <button type="button" onClick={() => setRolEditando('nuevo')} className={BTN_PRIMARY}>
            <Plus size={16} /> Crear rol
          </button>
        )}
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-border">
        {(
          [
            { id: 'usuarios', label: 'Usuarios', icon: Users, visible: true },
            { id: 'roles', label: 'Roles y permisos', icon: Shield, visible: puede('roles_gestionar') },
          ] as const
        )
          .filter((t) => t.visible)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setAviso(null);
              }}
              className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-primary text-primary-ink' : 'border-transparent text-text-soft hover:text-text'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
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
        <div className={`${CARD} p-20 text-center text-text-muted italic`}>Cargando...</div>
      ) : tab === 'usuarios' ? (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-alt border-b border-border">
                <tr>
                  <th className={TH}>Nombre</th>
                  <th className={TH}>Correo</th>
                  <th className={TH}>Rol</th>
                  <th className={TH}>Estado</th>
                  <th className={`${TH} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-text-muted italic">
                      No hay usuarios.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((u) => {
                    const yo = u.id === perfil.id;
                    const gestionable = puedeGestionar(perfil, u, rolDe);
                    return (
                      <tr key={u.id} className={`hover:bg-surface-alt transition-colors ${u.activo ? '' : 'opacity-60'}`}>
                        <td className={TD}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary-soft text-primary-ink flex items-center justify-center text-xs font-bold">
                              {iniciales(u.full_name)}
                            </div>
                            <span className="font-medium text-text">
                              {u.full_name}
                              {yo && <span className="ml-2 text-[11px] text-text-muted">(tú)</span>}
                            </span>
                          </div>
                        </td>
                        <td className={`${TD} text-text-soft`}>{u.email}</td>
                        <td className={TD}>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              rolDe.get(u.role)?.es_super ? 'bg-primary text-white' : 'bg-primary-soft text-primary-ink'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className={TD}>
                          {u.activo ? (
                            <span className="flex items-center gap-1.5 text-success text-xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-current" /> Activo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-danger text-xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-current" /> Desactivado
                            </span>
                          )}
                        </td>
                        <td className={TD}>
                          <div className="flex justify-end gap-1">
                            {(yo || gestionable) && (
                              <button type="button" title="Editar" onClick={() => setEditando(u)} className={ICON_BTN}>
                                <Edit size={16} />
                              </button>
                            )}
                            {gestionable && (
                              <>
                                <button
                                  type="button"
                                  title={u.activo ? 'Desactivar' : 'Activar'}
                                  disabled={ocupado === u.id}
                                  onClick={() => cambiarEstado(u)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    u.activo ? 'text-amber-600 hover:bg-warning-soft' : 'text-success hover:bg-success-soft'
                                  }`}
                                >
                                  {ocupado === u.id ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar"
                                  onClick={() => setEliminando(u)}
                                  className="p-2 rounded-lg text-danger hover:bg-danger-soft transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {roles.map((r) => {
            const editable = !r.es_super && r.nivel < perfil.nivel;
            const total = usuariosPorRol.get(r.nombre) ?? 0;
            return (
              <div key={r.id} className={`${CARD} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-text flex items-center gap-2">
                      <Shield size={16} className="text-primary" /> {r.nombre}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {r.descripcion || 'Sin descripción'} · Nivel {r.nivel} · {total} usuario{total === 1 ? '' : 's'}
                    </p>
                  </div>
                  {editable && (
                    <button type="button" title="Editar rol" onClick={() => setRolEditando(r)} className={ICON_BTN}>
                      <Edit size={16} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {r.es_super ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary text-white">
                      Todos los permisos
                    </span>
                  ) : r.permisos.length === 0 ? (
                    <span className="text-xs text-text-muted italic">Sin permisos (solo consulta)</span>
                  ) : (
                    GRUPOS_PERMISOS.flatMap((g) => g.items)
                      .filter((p) => r.permisos.includes(p.key))
                      .map((p) => (
                        <span key={p.key} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-soft text-primary-ink">
                          {p.label}
                        </span>
                      ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creando && (
        <UsuarioModal
          roles={rolesAsignables}
          onClose={() => setCreando(false)}
          onGuardado={async (msg) => {
            setCreando(false);
            setAviso({ tipo: 'exito', texto: msg });
            await cargar();
          }}
        />
      )}

      {editando && (
        <UsuarioModal
          usuario={editando}
          esYo={editando.id === perfil.id}
          roles={rolesAsignables}
          onClose={() => setEditando(null)}
          onGuardado={async (msg) => {
            setEditando(null);
            setAviso({ tipo: 'exito', texto: msg });
            await cargar();
          }}
        />
      )}

      {eliminando && (
        <EliminarModal
          usuario={eliminando}
          onClose={() => setEliminando(null)}
          onEliminado={async () => {
            setAviso({ tipo: 'exito', texto: `Se eliminó el usuario ${eliminando.full_name}.` });
            setEliminando(null);
            await cargar();
          }}
        />
      )}

      {rolEditando && (
        <RolModal
          rol={rolEditando === 'nuevo' ? null : rolEditando}
          perfil={perfil}
          enUso={rolEditando === 'nuevo' ? 0 : usuariosPorRol.get(rolEditando.nombre) ?? 0}
          onClose={() => setRolEditando(null)}
          onGuardado={async (msg) => {
            setRolEditando(null);
            setAviso({ tipo: 'exito', texto: msg });
            await cargar();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Ventanas
// ---------------------------------------------------------------------
function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`${CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-lg font-bold text-text">{titulo}</h3>
          <button type="button" onClick={onClose} title="Cerrar" className={ICON_BTN}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">{texto}</div>;
}

function UsuarioModal({
  usuario,
  esYo = false,
  roles,
  onClose,
  onGuardado,
}: {
  usuario?: Usuario;
  esYo?: boolean;
  roles: Rol[];
  onClose: () => void;
  onGuardado: (msg: string) => void;
}) {
  const editando = !!usuario;
  const [nombre, setNombre] = useState(usuario?.full_name ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [rol, setRol] = useState(usuario?.role ?? roles.find((r) => r.nombre === 'Empleado')?.nombre ?? roles[roles.length - 1]?.nombre ?? '');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Si edita a alguien con un rol que no puede asignar, igual se muestra
  const opciones = usuario && !roles.some((r) => r.nombre === usuario.role) ? [{ nombre: usuario.role } as Rol, ...roles] : roles;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Escribe el nombre.');
    if (!editando && !email.trim()) return setError('Escribe el correo.');
    if (!rol) return setError('Elige un rol.');
    if ((!editando || password) && !passwordValida(password)) {
      return setError('La contraseña debe tener al menos 8 caracteres, con letras y números.');
    }
    setGuardando(true);
    try {
      if (editando && usuario) {
        await llamarApi({ accion: 'editar', id: usuario.id, nombre: nombre.trim(), rol, password: password || undefined });
        onGuardado(`Se actualizó a ${nombre.trim()}.`);
      } else {
        await llamarApi({ accion: 'crear', nombre: nombre.trim(), email: email.trim(), password, rol });
        onGuardado(`Se creó el usuario ${nombre.trim()}. Ya puede iniciar sesión con su correo y la contraseña asignada.`);
      }
    } catch (err) {
      setError(errorDe(err));
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={editando ? 'Editar usuario' : 'Crear usuario'} onClose={onClose}>
      <form onSubmit={guardar} className="p-5 space-y-4">
        <div>
          <label className={LABEL}>Nombre completo *</label>
          <input className={FIELD} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. María Rodríguez" />
        </div>
        <div>
          <label className={LABEL}>Correo *</label>
          <input
            type="email"
            className={FIELD}
            value={email}
            disabled={editando}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@empresa.com"
          />
          <p className="text-xs text-text-muted mt-1">
            {editando ? 'El correo no se puede cambiar.' : 'A este correo le llegará el enlace si olvida su contraseña.'}
          </p>
        </div>
        <div>
          <label className={LABEL}>Rol *</label>
          <select className={FIELD} value={rol} disabled={esYo} onChange={(e) => setRol(e.target.value)}>
            {opciones.map((r) => (
              <option key={r.nombre} value={r.nombre}>
                {r.nombre}
              </option>
            ))}
          </select>
          {esYo && <p className="text-xs text-text-muted mt-1">No puedes cambiar tu propio rol.</p>}
        </div>
        <div>
          <label className={LABEL}>{editando ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type={verPass ? 'text' : 'password'}
              autoComplete="new-password"
              className={`${FIELD} pl-9 pr-10`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editando ? 'Déjala vacía para no cambiarla' : 'Mínimo 8, con letras y números'}
            />
            <button
              type="button"
              onClick={() => setVerPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
              title={verPass ? 'Ocultar' : 'Mostrar'}
            >
              {verPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <ErrorBox texto={error} />

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={guardando} className={BTN}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={BTN_PRIMARY}>
            {guardando && <Loader2 size={16} className="animate-spin" />}
            {editando ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EliminarModal({
  usuario,
  onClose,
  onEliminado,
}: {
  usuario: Usuario;
  onClose: () => void;
  onEliminado: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function eliminar() {
    setError(null);
    setBorrando(true);
    try {
      await llamarApi({ accion: 'eliminar', id: usuario.id });
      onEliminado();
    } catch (e) {
      setError(errorDe(e));
      setBorrando(false);
    }
  }

  return (
    <Modal titulo="Eliminar usuario" onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-text-soft">
          Se eliminará la cuenta de <strong className="text-text">{usuario.full_name}</strong> ({usuario.email}). Su historial
          (movimientos, pedidos y bitácora) se conserva con su nombre.
        </p>
        <p className="text-sm text-text-soft">
          Si solo se ausentará un tiempo, es mejor <strong className="text-text">desactivarlo</strong> con el botón de encendido.
        </p>
        <ErrorBox texto={error} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={borrando} className={BTN}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={eliminar}
            disabled={borrando}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {borrando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Eliminar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RolModal({
  rol,
  perfil,
  enUso,
  onClose,
  onGuardado,
}: {
  rol: Rol | null;
  perfil: PerfilSesion;
  enUso: number;
  onClose: () => void;
  onGuardado: (msg: string) => void;
}) {
  const nivelMax = perfil.nivel - 1;
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '');
  const [nivel, setNivel] = useState(String(rol?.nivel ?? Math.min(30, nivelMax)));
  const [permisos, setPermisos] = useState<string[]>(rol?.permisos ?? []);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<'guardar' | 'borrar' | null>(null);

  // Solo se pueden dar permisos que uno mismo tiene
  const puedeDar = (p: Permiso) => perfil.esSuper || perfil.permisos.includes(p);

  function alternar(p: Permiso) {
    setPermisos((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(nivel);
    const limpio = nombre.trim();
    if (!limpio) return setError('Escribe el nombre del rol.');
    if (!Number.isInteger(n) || n < 1 || n > nivelMax) return setError(`El nivel debe ser un entero entre 1 y ${nivelMax}.`);

    setGuardando('guardar');
    const datos = { nombre: limpio, descripcion: descripcion.trim() || null, nivel: n, permisos };
    const { data, error: err } = rol
      ? await supabase.from('roles').update(datos).eq('id', rol.id).select('id')
      : await supabase.from('roles').insert(datos).select('id');

    if (err || !data || data.length === 0) {
      setError(
        err?.code === '23505' ? 'Ya existe un rol con ese nombre.' : err ? errorDe(err) : 'No tienes permiso para guardar este rol.'
      );
      setGuardando(null);
      return;
    }
    await registrarActividad({
      accion: rol ? 'editar' : 'crear',
      entidad: 'rol',
      entidad_id: data[0].id as string,
      detalle: `${rol ? 'Editó' : 'Creó'} el rol ${limpio} (nivel ${n}, ${permisos.length} permisos)`,
    });
    onGuardado(rol ? `Se actualizó el rol ${limpio}.` : `Se creó el rol ${limpio}.`);
  }

  async function borrar() {
    if (!rol) return;
    setError(null);
    setGuardando('borrar');
    const { data, error: err } = await supabase.from('roles').delete().eq('id', rol.id).select('id');
    if (err || !data || data.length === 0) {
      setError(err?.code === '23503' ? 'Hay usuarios con este rol. Cámbiales el rol antes de borrarlo.' : err ? errorDe(err) : 'No se pudo borrar el rol.');
      setGuardando(null);
      return;
    }
    await registrarActividad({ accion: 'eliminar', entidad: 'rol', entidad_id: rol.id, detalle: `Eliminó el rol ${rol.nombre}` });
    onGuardado(`Se eliminó el rol ${rol.nombre}.`);
  }

  return (
    <Modal titulo={rol ? `Editar rol: ${rol.nombre}` : 'Crear rol'} onClose={onClose}>
      <form onSubmit={guardar} className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={LABEL}>Nombre *</label>
            <input
              className={FIELD}
              value={nombre}
              disabled={rol?.es_sistema}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Bodeguero"
            />
          </div>
          <div>
            <label className={LABEL}>Nivel *</label>
            <input type="number" min={1} max={nivelMax} className={FIELD} value={nivel} onChange={(e) => setNivel(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-text-muted -mt-2">
          El nivel define la jerarquía: solo puedes gestionar roles por debajo del tuyo ({perfil.nivel}). Referencia: Jefe 60,
          Empleado 20.
        </p>
        <div>
          <label className={LABEL}>Descripción</label>
          <input className={FIELD} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
        </div>

        <div className="space-y-3">
          <p className={LABEL}>Permisos</p>
          {GRUPOS_PERMISOS.map((g) => (
            <div key={g.grupo} className="border border-border rounded-lg p-3">
              <p className="text-xs font-semibold text-text mb-2">{g.grupo}</p>
              <div className="grid grid-cols-2 gap-2">
                {g.items.map((p) => (
                  <label
                    key={p.key}
                    className={`flex items-center gap-2 text-sm ${puedeDar(p.key) ? 'text-text cursor-pointer' : 'text-text-muted opacity-50'}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={permisos.includes(p.key)}
                      disabled={!puedeDar(p.key)}
                      onChange={() => alternar(p.key)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-text-muted">Todos pueden ver Dashboard, Productos, Movimientos, Pedidos y Código de barras.</p>
        </div>

        <ErrorBox texto={error} />

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            {rol && !rol.es_sistema && (
              <button
                type="button"
                onClick={borrar}
                disabled={guardando !== null || enUso > 0}
                title={enUso > 0 ? 'Hay usuarios con este rol' : 'Borrar rol'}
                className="px-3 py-2 text-sm font-medium text-danger rounded-lg hover:bg-danger-soft transition-colors flex items-center gap-2 disabled:opacity-40"
              >
                <Trash2 size={16} /> Borrar rol
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={guardando !== null} className={BTN}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando !== null} className={BTN_PRIMARY}>
              {guardando === 'guardar' && <Loader2 size={16} className="animate-spin" />}
              {rol ? 'Guardar cambios' : 'Crear rol'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
