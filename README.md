# FerreStock · Sistema de Inventario Flore Verde SRL

Sistema web de inventario para **Flore Verde SRL** (ferretería y materiales de construcción).
Controla productos, stock, entradas y salidas y los pedidos de la web promocional, y registra quién hizo cada cosa.

> Proyecto de práctica profesional · Desarrollo de Software · Costa Rica

---

## Funcionalidades

| Módulo | Qué hace |
|---|---|
| **Login** | Inicio de sesión con la marca de la empresa y recuperación de contraseña por correo (`/restablecer`). |
| **Dashboard** | Resumen del día: stock bajo, agotados, pedidos pendientes y gráficos por rango de fechas. |
| **Productos** | Crear, editar, deshabilitar y eliminar productos. Cada producto tiene imagen (Storage, comprimida a WebP), proveedor, ubicación y la marca "En web". Admite **varios códigos de barras**. |
| **Importar Excel** | Carga masiva desde una plantilla con revisión fila por fila y 3 confirmaciones. Detecta duplicados. |
| **Entradas / Salidas** | Movimientos de stock con motivo, número de documento y observaciones. No permite sacar más de lo que hay. |
| **Movimientos** | Historial unificado del panel y de la web, con búsqueda por documento. |
| **Pedidos Web** | Pedidos de la web con código `#XXXXXXXX`. Se aprueban, rechazan o reabren; al rechazar un pedido, el stock vuelve solo. |
| **Código de barras** | Búsqueda con lector o con la cámara del celular, por código principal, código adicional o SKU. |
| **Reportes** | Exportación a Excel y PDF con el logo y los datos de la empresa (inventario, stock bajo por proveedor, movimientos). |
| **Proveedores** | Catálogo de proveedores ligado a los productos. |
| **Usuarios** | Crear, editar, activar/desactivar y eliminar usuarios desde una ruta segura del servidor. |
| **Roles y permisos** | Roles con nivel jerárquico y permisos editables. Se pueden crear roles a la medida. Antes de borrar un rol con usuarios, esos usuarios se pasan a otro rol. |
| **Configuración** | Datos de la empresa (salen en los reportes) y stock mínimo por defecto. |
| **Bitácora** | Registro de quién creó, editó, borró, aprobó o rechazó cada cosa. |
| **Buscador rápido** | `Ctrl + K` para encontrar un producto al instante (stock y ubicación). |

### Roles predeterminados

| Rol | Uso |
|---|---|
| Super Administrador | Desarrolladores. Acceso total. |
| Administrador | Dueño de la empresa. |
| Jefe | Encargado: productos, movimientos, pedidos y reportes. |
| Empleado | Operación diaria con permisos limitados. |

**Permisos disponibles:**
- **Productos:** `productos_crear`, `productos_editar`, `productos_deshabilitar`, `productos_eliminar`
- **Stock y reportes:** `entradas`, `salidas`, `reportes`
- **Pedidos:** `pedidos_revisar`, `pedidos_reabrir`
- **Administración:** `usuarios_gestionar`, `roles_gestionar`, `config_editar`, `bitacora_ver`

Los botones y menús se ocultan según los permisos de cada rol. La base de datos también los valida con RLS.

---

## Tecnologías

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase**: base de datos PostgreSQL, Auth, Storage y Row Level Security
- **Vercel** para el despliegue
- Librerías:
  - `html5-qrcode` (escáner con cámara)
  - `xlsx` / SheetJS (importar y exportar Excel)
  - `jspdf` + `jspdf-autotable` (PDF)
  - `recharts` (gráficos)
  - `lucide-react` (íconos)

---

## Estructura del proyecto

```
app/
├── app/
│   ├── (admin)/            # Pantallas del panel (comparten menú y permisos)
│   │   ├── dashboard/
│   │   ├── productos/      # lista, nuevo, [id]/editar
│   │   ├── entradas/
│   │   ├── salidas/
│   │   ├── movimientos/
│   │   ├── pedidos/
│   │   ├── barcode/
│   │   ├── reportes/
│   │   ├── usuarios/
│   │   ├── config/
│   │   └── bitacora/
│   ├── api/usuarios/       # Ruta del servidor (usa la service role key)
│   ├── login/
│   └── restablecer/
├── components/             # AdminLayout, SiPuede, SubirImagen, ImportarProductos, CodigosAdicionales…
├── lib/                    # supabase, actividad, paginar, imagenes, exportar
└── types/
```

---

## Instalación local

**Requisitos:** Node.js 20 o superior y una cuenta de Supabase.

```bash
git clone https://github.com/FloreVerde-TI/Sistema-de-Inventario-Ferreteria.git
cd Sistema-de-Inventario-Ferreteria/app
npm install
```

Crea el archivo `app/.env.local` con estas variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

> ⚠️ **`.env.local` nunca se sube a GitHub.** La `SUPABASE_SERVICE_ROLE_KEY` es secreta: solo la usa el servidor y nunca lleva el prefijo `NEXT_PUBLIC_`.

```bash
npm run dev      # desarrollo en http://localhost:3000
npm run build    # compilar (correrlo siempre antes de subir cambios)
```

---

## Base de datos (Supabase)

Los scripts SQL se ejecutan en orden en el **SQL Editor** de Supabase. Cada uno va dentro de `begin/commit` y trae una verificación al final.

| # | Script | Contenido |
|---|---|---|
| 01 | Roles y permisos | Tabla `roles` y las funciones `tiene_permiso()` y `mi_nivel()` |
| 02 | Ajuste categorías | Permisos del Jefe sobre categorías |
| 03 | Proveedores | Tabla `proveedores` |
| 04 | Limpieza | Quita columnas viejas |
| 05 | Observaciones | Observaciones en los movimientos |
| 06 | Seguridad | Políticas RLS definitivas |
| 07 | Código de pedido | Columna `pedidos.codigo` |
| 08 | Storage | Bucket `productos` y sus políticas |
| 09 | Códigos de barras | Tabla `codigos_barras` y validación de códigos únicos |

**Tablas principales:**
- Inventario: `productos`, `codigos_barras`, `categorias`, `proveedores`, `movimientos`, `movements`
- Pedidos web: `pedidos`, `detalle_pedido`, `cotizaciones`
- Administración: `profiles`, `roles`, `settings`, `actividad`

**Triggers clave** (todas sus funciones son `SECURITY DEFINER`):
- **Pedido web:** descuenta el stock y lo registra en `movimientos`.
- **Rechazo de pedido:** devuelve el stock.
- **Movimientos del panel:** suman o restan stock.
- **Bitácora:** completa el usuario como "Nombre — Rol".
- **Usuario nuevo:** se le crea su perfil.
- **Códigos de barras:** se valida que un mismo código no pertenezca a dos productos.

**Web promocional (sin sesión):**
- Solo puede ver los productos publicados y las categorías.
- Solo puede crear pedidos, su detalle y cotizaciones.
- Los clientes **no** crean cuenta.

---

## Despliegue (Vercel)

1. Importar el repositorio en Vercel con **Root Directory = `app`**.
2. Agregar las 3 variables de entorno. Marcar `SUPABASE_SERVICE_ROLE_KEY` como **Sensitive**.
3. En Supabase → Authentication → URL Configuration, poner el dominio en **Site URL** y agregar `https://TU-DOMINIO/restablecer` en **Redirect URLs**.
4. Cada merge a `main` se publica automáticamente.

---

## Flujo de trabajo con Git

1. Trabajar en la rama personal (no directo en `main`).
2. Correr `npm run build` sin errores.
3. Commit → Push → Pull Request a `main` → Merge.
4. Actualizar la rama personal desde `main`.

---

## Equipo

- **Adrian**: sistema de inventario
- **Alejandro**: página web promocional

Desarrollado para **Flore Verde SRL**.
