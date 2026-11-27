// Tipos de la base de datos (actualizados con roles, configuración y proveedores)

/** Nombre del rol. Ya no es una lista fija: los roles se crean desde Usuarios. */
export type Role = string;

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  email: string;
  activo: boolean;
  updated_at: string;
}

export interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  es_super: boolean;
  es_sistema: boolean;
  permisos: string[];
  created_at: string;
}

export interface Category {
  id: string;
  nombre: string;
  descripcion?: string;
  created_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  activo: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  categoria_id: string | null;
  proveedor_id: string | null;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen_principal: string;
  /** false = deshabilitado (no se usa en Entradas ni Salidas) */
  habilitado: boolean;
  sku?: string | null;
  codigo_barras?: string | null;
  stock?: number | null;
  stock_minimo?: number | null;
  ubicacion?: string | null;
  created_at: string;
  updated_at: string;
}

// Tabla "movimientos": entradas y salidas de inventario
export interface Movimiento {
  id: string;
  producto_id: string;
  tipo: 'entrada' | 'salida';
  cantidad: number;
  motivo: string | null;
  proveedor?: string | null;
  referencia?: string | null;
  /** "Nombre — Rol" */
  usuario: string | null;
  /** Nota opcional del movimiento */
  observaciones?: string | null;
  created_at: string;
}

export interface Setting {
  id: number;
  business_name: string;
  nombre_comercial: string | null;
  cedula_juridica: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  sitio_web: string | null;
  address: string | null;
  horario: string | null;
  stock_minimo_defecto: number;
  logo_url: string | null;
  pie_reportes: string | null;
  updated_at: string;
}
