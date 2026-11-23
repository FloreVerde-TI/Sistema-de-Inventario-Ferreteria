# FerreStock · Sistema de Inventario Flore Verde SRL

Sistema web de inventario para **Flore Verde SRL** (ferretería y materiales de construcción).
Controla los productos, el stock, las entradas y salidas de mercadería, los usuarios con sus roles y los reportes del inventario.

> Proyecto de práctica profesional · Desarrollo de Software · Costa Rica

---

## Funcionalidades

| Módulo | Qué hace |
|---|---|
| **Login** | Inicio de sesión con correo y contraseña, y recuperación de contraseña por correo (`/restablecer`). |
| **Dashboard** | Resumen del inventario: stock bajo, agotados, entradas y salidas, con gráficos por rango de fechas. Modo claro y oscuro. |
| **Productos** | Crear, editar, deshabilitar, rehabilitar y eliminar (con exportación previa en Excel o PDF). Imagen (Storage, comprimida a WebP, o foto desde el celular), proveedor, **marca** (opcional), ubicación en bodega y **varios códigos de barras**. Se actualiza en tiempo real. |
| **Plantillas de imagen** | Iconos por categoría para los productos sin foto. Si se guarda sin imagen, se pone un icono de su categoría o el logo de la empresa. |
| **Importar Excel** | Carga masiva desde una plantilla con revisión fila por fila, detección de duplicados y 3 confirmaciones. |
| **Entradas / Salidas** | Movimientos de stock con motivo, documento de referencia y observaciones. Guardan el usuario, la fecha y la hora. No permite sacar más de lo que hay. |
| **Movimientos** | Historial de entradas y salidas con filtros por fecha, tipo, producto o usuario, exportable a Excel o PDF. |
| **Código de barras** | Búsqueda con la pistola o con la cámara del celular, por código principal, código adicional o SKU. Un código nuevo se puede registrar como producto. |
| **Reportes** | Excel y PDF con el logo y los datos de la empresa: inventario completo, stock bajo, agotados y movimientos. |
| **Usuarios** | Crear, editar, activar o desactivar y eliminar usuarios desde una ruta segura del servidor. Los roles superiores pueden cambiar la contraseña de los usuarios a su cargo. |
| **Roles y permisos** | Roles con nivel jerárquico y permisos editables. Antes de borrar un rol con usuarios, esos usuarios se pasan a otro rol. |
| **Configuración** | Datos de la empresa (salen en los reportes), logo y pie de los reportes, stock mínimo por defecto y **catálogos** de categorías y proveedores (deshabilitar o borrar). |
| **Buscador rápido** | `Ctrl + K` para encontrar un producto al instante (stock y ubicación). |
| **Versión celular** | Menú ☰ y pantallas adaptadas para usar el sistema desde el teléfono. |

### Roles predeterminados

| Rol | Uso |
|---|---|
| Super Administrador | Desarrollador: soporte técnico y pruebas. Acceso total. |
| Administrador | Dueño y alta gerencia. |
| Jefe | Encargado: productos, movimientos y reportes. |
| Empleado | Operación diaria con permisos limitados. |

**Permisos disponibles:**
- **Productos:** `productos_crear`, `productos_editar`, `productos_deshabilitar`, `productos_eliminar`
- **Stock y reportes:** `entradas`, `salidas`, `reportes`
- **Administración:** `usuarios_gestionar`, `roles_gestionar`, `config_editar`

Los botones y menús se ocultan según los permisos de cada rol. La base de datos también los valida con RLS.

---

## Tecnologías

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase**: PostgreSQL, Auth, Storage, Realtime y Row Level Security
- **Vercel** para el despliegue
- Librerías:
  - `html5-qrcode` (escáner con cámara)
  - `xlsx` / SheetJS 0.20.3 (importar y exportar Excel; se instala desde `vendor/`)
  - `jspdf` + `jspdf-autotable` (PDF)
  - `recharts` (gráficos)
  - `lucide-react` (íconos)

---

## Estructura del proyecto

```
app/
├── app/
│   ├── (admin)/            # Pantallas del sistema (comparten menú y permisos)
│   │   ├── dashboard/      # page.tsx (servidor) + DashboardCliente.tsx
│   │   ├── productos/      # lista, nuevo, [id]/editar
│   │   ├── entradas/  salidas/  movimientos/
│   │   ├── barcode/  reportes/
│   │   └── usuarios/  config/
│   ├── api/usuarios/       # Gestión de usuarios (clave de servicio, solo servidor)
│   ├── login/  restablecer/
│   └── robots.ts           # Que los buscadores no indexen el sistema
├── components/   # Menú, permisos, imágenes, importación de Excel, catálogos…
├── lib/          # Conexión a Supabase, exportar, imágenes, plantillas, paginación…
├── types/
└── vendor/       # xlsx-0.20.3.tgz (SheetJS)

supabase/         # Copia de respaldo de los scripts SQL, en orden (ver su README)
```

---

## Instalación local

**Requisitos:** Node.js 20 o superior y una cuenta de Supabase.

```bash
git clone https://github.com/FloreVerde-TI/Sistema-de-Inventario-Ferreteria.git
cd Sistema-de-Inventario-Ferreteria/app
npm install
```

Crea el archivo `app/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

> ⚠️ **`.env.local` nunca se sube a GitHub.** `SUPABASE_SERVICE_ROLE_KEY` es secreta: solo la usa el servidor y nunca lleva el prefijo `NEXT_PUBLIC_`.

```bash
npm run dev      # desarrollo en http://localhost:3000
npm run build    # compilar (correrlo siempre antes de subir cambios)
```

---

## Base de datos (Supabase)

Los scripts SQL se corren en orden en el **SQL Editor**. Cada uno va dentro de `begin/commit` y trae una verificación al final.
Están guardados en la carpeta [`supabase/`](supabase/).

**Tablas principales:** `productos`, `codigos_barras`, `categorias`, `proveedores`, `movimientos`, `profiles`, `roles` y `settings`.

**Reglas clave en la base:**
- **Movimientos:** cada entrada suma y cada salida resta stock automáticamente (trigger `SECURITY DEFINER`).
- **Stock:** nunca puede quedar en negativo (`stock >= 0`).
- **Códigos de barras:** un mismo código no puede pertenecer a dos productos.
- **Usuario nuevo:** se le crea su perfil automáticamente.
- **RLS:** cada tabla valida el permiso del rol antes de leer o modificar datos.

**Auth:** el registro público ("Allow new users to sign up") está **desactivado**; los usuarios se crean desde la pantalla Usuarios.

---

## Despliegue (Vercel)

1. Importar el repositorio con **Root Directory = `app`**.
2. Agregar las 3 variables de entorno; marcar `SUPABASE_SERVICE_ROLE_KEY` como **Secret/Sensitive**.
3. En Supabase → Authentication → URL Configuration: **Site URL** con el dominio y `https://TU-DOMINIO/restablecer` en **Redirect URLs** (para la recuperación de contraseña).
4. Cada merge a `main` se publica automáticamente.

**Seguridad incluida:** cabeceras de seguridad (`next.config.ts`), `robots.txt` y `X-Robots-Tag` para que el sistema no aparezca en buscadores.

---

## Flujo de trabajo con Git

1. Trabajar en la rama personal (no directo en `main`).
2. Correr `npm run build` sin errores.
3. Commit → Push → Pull Request a `main` → Merge.
4. Actualizar la rama personal desde `main`.

---

Desarrollado por **Adrian** para **Flore Verde SRL**.
