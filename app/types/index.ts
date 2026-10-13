export type Role = 'Administrador' | 'Empleado';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  email: string;
  updated_at: string;
}

export interface Category {
  id: string;
  nombre: string;
  descripcion?: string;
  created_at: string;
}

export interface Product {
  id: string;
  categoria_id: string | null;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen_principal: string;
  activo: boolean;
  sku?: string | null;
  codigo_barras?: string | null;
  stock?: number | null;
  stock_minimo?: number | null;
  ubicacion?: string | null;
  /** @deprecated Duplicada en la base de datos. Usar codigo_barras. */
  barcode?: string | null;
  /** @deprecated Duplicada en la base de datos. Usar stock_minimo. */
  stock_min?: number | null;
  created_at: string;
  updated_at: string;
}

// Tabla "movements": solo recibe los movimientos de pedidos web
export interface Movement {
  id: string;
  product_id: string;
  user_id: string;
  type: 'Entrada' | 'Salida' | 'Ajuste';
  quantity: number;
  reference: string;
  observations: string;
  created_at: string;
}

// Tabla "movimientos": registro unificado (panel + pedidos web)
export interface Movimiento {
  id: string;
  producto_id: string;
  tipo: 'entrada' | 'salida';
  cantidad: number;
  motivo: string | null;
  proveedor?: string | null;
  referencia?: string | null;
  usuario: string | null;
  origen: 'panel' | 'web';
  created_at: string;
}

export interface Setting {
  id: number;
  business_name: string;
  ruc: string;
  phone: string;
  email: string;
  address: string;
  updated_at: string;
}
