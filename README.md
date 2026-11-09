# FerreStock · Sistema de Inventario Flore Verde SRL

Sistema web de inventario para **Flore Verde SRL** (ferretería y materiales de construcción).
Controla productos, stock, entradas y salidas, los pedidos y cotizaciones de la web promocional, y registra quién hizo cada cosa.
Es **multi-tienda**: el mismo sistema maneja también **Ferre Fuerte**, con su inventario totalmente separado.

> Proyecto de práctica profesional · Desarrollo de Software · Costa Rica

---

## Funcionalidades

| Módulo | Qué hace |
|---|---|
| **Login** | Inicio de sesión con los logos de las dos ferreterías y recuperación de contraseña por correo (`/restablecer`). |
| **Multi-tienda** | Flore Verde y Ferre Fuerte con inventarios, usuarios y configuración separados. Botón para cambiar de ferretería; cada una con su logo, colores e ícono de pestaña. |
| **Dashboard** | Resumen: stock bajo, agotados, entradas, salidas, pedidos y cotizaciones por responder, con gráficos por rango de fechas. |
| **Productos** | Crear, editar, deshabilitar y eliminar. Imagen (Storage, comprimida a WebP), proveedor, **marca** (opcional), ubicación, indicador "En web", **varios códigos de barras** e **historial de precios**. Precio normal tachado y precio con promoción, etiquetas DESCUENTO/OFERTA/PAQUETE y filtro de promociones. Se actualiza en tiempo real. |
| **Plantillas de imagen** | 35 iconos por categoría para elegir si no hay foto. Si se guarda sin imagen, se pone un icono de su categoría o el logo de la ferretería. |
| **Ofertas y descuentos** | En Editar producto (interruptor apagado de base): descuento en % u oferta de precio fijo, con fechas y comparativa. Descuentos temporales por categoría, proveedor o toda la tienda desde Actualizar precios. El precio normal no cambia; si hay varias promociones, se usa la mejor. |
| **Paquetes** | 2 o más productos con un solo precio: "Descontar de los existentes" (sin stock propio) o "Producto propio" (con stock). Productos de **regalía** a ₡0, comparativa de cuánto baja cada producto, lista, detalle y edición. |
| **Actualizar precios** | Cambio masivo por categoría, proveedor o búsqueda (% o monto, con redondeo), con vista previa antes/después. Modo **"Descuento temporal"** para promociones con fecha de fin. |
| **Importar Excel** | Carga masiva desde una plantilla (incluye Marca) con revisión fila por fila y 3 confirmaciones. Detecta duplicados. |
| **Entradas / Salidas** | Movimientos de stock con motivo, documento, observaciones y **foto o PDF del comprobante** (guardado en privado). No permite sacar más de lo que hay. |
| **Movimientos** | Historial unificado del panel y de la web, con búsqueda por documento y acceso al comprobante adjunto. |
| **Pedidos Web** | Pedidos de la web con código `#XXXXXXXX`, en **tiempo real** y con contador en el menú. Se aprueban, rechazan o reabren; al rechazar, el stock vuelve solo. Muestran el precio normal tachado y las líneas de cada paquete agrupadas. |
| **Cotizaciones** | Consultas del formulario web, en tiempo real y con contador. Se responden **desde el sistema** (correo con la plantilla de la empresa), por Gmail o por WhatsApp; se pueden cerrar y reabrir. Exportables a Excel/PDF. |
| **Aviso por correo** | Cada cotización nueva llega al correo de la empresa con diseño y botones (abrir, responder, WhatsApp). |
| **Código de barras** | Búsqueda con lector o con la cámara del celular, por código principal, código adicional o SKU. |
| **Reportes** | Excel y PDF con el logo y los datos de la empresa: inventario, stock bajo, agotados, movimientos, pedidos, **productos sin movimiento** (dinero detenido) y reporte personalizado. Usan el precio real de venta (con promoción) y conservan el precio normal. |
| **Usuarios** | Crear, editar, activar/desactivar y eliminar usuarios desde una ruta segura del servidor. Se marca a qué ferreterías entra cada uno (mismo rol en todas). |
| **Roles y permisos** | Roles con nivel jerárquico y permisos editables. Antes de borrar un rol con usuarios, esos usuarios se pasan a otro rol. |
| **Configuración** | Datos de la empresa (salen en reportes y correos), stock mínimo por defecto, **catálogos** (deshabilitar o borrar categorías y proveedores) y **tarjetas por promociones**: textos y colores de los sellos de la web, plantillas festivas, cambio automático en fechas festivas e interruptor para mostrar u ocultar las promociones en la web. El Jefe solo ve esta última parte. |
| **Bitácora** | Registro de quién creó, editó, borró, aprobó, rechazó o respondió cada cosa. |
| **Buscador rápido** | `Ctrl + K` para encontrar un producto al instante (stock y ubicación). |
| **Temáticas de temporada** | Colores y adornos animados según la fecha: Navidad, Halloween, Independencia, Día del Amor y la Amistad, Día de la Madre y Semana Santa. Cada usuario las apaga con el botón ✨. Fuera de temporada, cada ferretería tiene su animación suave (hojas o engranajes) y el botón ⏸ las pausa en computadoras lentas. |
| **Modo presentación** | Muestra solo el inventario, sin nada de la web (atajo discreto, solo Super Administrador). Siempre activo en tiendas sin página web. |
| **Versión celular** | Menú ☰ y pantallas adaptadas para usar el sistema desde el teléfono. |

### Roles predeterminados

| Rol | Uso |
|---|---|
| Super Administrador | Desarrolladores. Acceso total. |
| Administrador | Dueño de la empresa. |
| Jefe | Encargado: productos, promociones, movimientos, pedidos y reportes. |
| Empleado | Operación diaria con permisos limitados. |

**Permisos disponibles:**
- **Productos:** `productos_crear`, `productos_editar`, `productos_deshabilitar`, `productos_eliminar`, `promociones`
- **Stock y reportes:** `entradas`, `salidas`, `reportes`
- **Pedidos y cotizaciones:** `pedidos_revisar`, `pedidos_reabrir`, `cotizaciones`
- **Administración:** `usuarios_gestionar`, `roles_gestionar`, `config_editar`, `bitacora_ver`

Los botones y menús se ocultan según los permisos de cada rol. La base de datos también los valida con RLS.

---

## Tecnologías

- **Next.js 16** (App Router, Turbopack, Cache Components) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase**: PostgreSQL, Auth, Storage, Realtime, Database Webhooks y Row Level Security
- **Vercel** para el despliegue
- Librerías:
  - `html5-qrcode` (escáner con cámara)
  - `xlsx` / SheetJS 0.20.3 (importar y exportar Excel; se instala desde `vendor/`)
  - `jspdf` + `jspdf-autotable` (PDF)
  - `recharts` (gráficos)
  - `nodemailer` (correos desde la cuenta de la empresa)
  - `lucide-react` (íconos)

---

## Estructura del proyecto

```
app/
├── app/
│   ├── (admin)/            # Pantallas del panel (comparten menú y permisos)
│   │   ├── dashboard/      # page.tsx (servidor) + DashboardCliente.tsx
│   │   ├── productos/      # lista, nuevo, [id]/editar, precios, paquetes
│   │   ├── entradas/  salidas/  movimientos/
│   │   ├── pedidos/  cotizaciones/
│   │   ├── barcode/  reportes/
│   │   └── usuarios/  config/  bitacora/
│   ├── api/
│   │   ├── usuarios/              # Gestión de usuarios (service role)
│   │   ├── cotizaciones/          # Responder por correo (SMTP)
│   │   └── cotizaciones/aviso/    # Aviso de cotización nueva (webhook)
│   ├── login/  restablecer/
│   └── robots.ts                  # Que los buscadores no indexen el sistema
├── components/   # AdminLayout, Tematica, SiPuede, SubirImagen, Documento, ImportarProductos, PromoProducto, PromoMasiva, TarjetasPromo, ElegirPlantilla…
├── lib/          # supabase, actividad, paginar, imagenes, documentos, exportar, correo, temas, defensa, promos, plantillas, sellos, limpiarAlSalir
├── types/
└── vendor/       # xlsx-0.20.3.tgz (SheetJS)

supabase/         # Copia de respaldo de todos los scripts SQL, en orden (ver su README)
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
SMTP_USER=correo-de-la-empresa@gmail.com
SMTP_PASS=contraseña_de_aplicacion_de_google
AVISO_SECRETO=clave_larga_aleatoria
```

> ⚠️ **`.env.local` nunca se sube a GitHub.** `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS` y `AVISO_SECRETO` son secretas: solo las usa el servidor y nunca llevan el prefijo `NEXT_PUBLIC_`.
> `SMTP_PASS` es una **contraseña de aplicación** de Google (requiere verificación en 2 pasos activa).

```bash
npm run dev      # desarrollo en http://localhost:3000
npm run build    # compilar (correrlo siempre antes de subir cambios)
```

---

## Base de datos (Supabase)

Los scripts SQL se ejecutan en orden en el **SQL Editor**. Cada uno va dentro de `begin/commit` y trae una verificación al final.
Todos están guardados en la carpeta [`supabase/`](supabase/).

| # | Script | Contenido |
|---|---|---|
| 01 | Roles y permisos | Tabla `roles` y funciones `tiene_permiso()` y `mi_nivel()` |
| 02 | Ajuste categorías | Permisos del Jefe sobre categorías |
| 03 | Proveedores | Tabla `proveedores` |
| 04 | Limpieza | Quita columnas viejas |
| 05 | Observaciones | Observaciones en los movimientos |
| 06 | Seguridad | Políticas RLS definitivas |
| 07 | Código de pedido | Columna `pedidos.codigo` |
| 08 | Storage | Bucket `productos` y sus políticas |
| 09 | Códigos de barras | Tabla `codigos_barras` y validación de códigos únicos |
| 10 | Revisión de seguridad | **Solo lectura** (auditoría de políticas y funciones) |
| 11 | Tiempo real pedidos | `pedidos` en Supabase Realtime |
| 12 | Cotizaciones, documentos y precios | Respuesta y permiso `cotizaciones`, bucket privado `documentos`, función `actualizar_precios_lote` |
| 13 | Reabrir y catálogos | Quién reabrió una cotización; `categorias.activa` |
| 14 | Cotizaciones duplicadas | Ignora la misma cotización repetida en menos de 2 minutos |
| 15 | Límite de cotizaciones | Máximo 3 por persona (correo, teléfono o IP) cada 10 minutos |
| 16 | Seguridad pedidos web | Rechaza pedidos duplicados y limita pedidos por conexión |
| 17 | Historial de precios | Tabla `historial_precios` con trigger |
| 18 | Multi-tienda | Tablas `tiendas` y `usuario_tiendas`, columna `tienda_id` en todas las tablas de datos, funciones `mi_tienda()` y `cambiar_tienda()`, políticas por tienda |
| 19 | Datos de prueba Ferre Fuerte | Productos, categorías, proveedores y movimientos de ejemplo (trae el bloque para borrarlos) |
| 20 | Arreglo web tiendas | Función `tienda_tiene_web()`: la web solo ve tiendas con página web |
| 21 | Demo Flore Verde | Catálogo de demostración: 35 productos con historial |
| 22 / 22a | Promociones y paquetes | Tablas `promociones`, `paquetes`, `paquete_items`; `productos.reingreso_at`; funciones `promo_de_producto()` y `promos_vigentes()`; permiso `promociones` (22a: revisión, solo lectura) |
| 23 | Marca y regalía | `productos.marca` (opcional) y `paquete_items.regalia` |
| 24 | Tarjetas para el Jefe | Función `guardar_sellos_promo()` |
| 25 | Limpieza para datos oficiales | ⚠️ Borra todos los datos de una ferretería para cargar el Excel oficial (hacer respaldo antes) |

**Tablas principales:**
- Inventario: `productos`, `codigos_barras`, `historial_precios`, `categorias`, `proveedores`, `movimientos`, `movements`
- Promociones: `promociones`, `paquetes`, `paquete_items`
- Web: `pedidos`, `detalle_pedido`, `cotizaciones`
- Administración: `profiles`, `roles`, `settings` (una fila por tienda), `actividad`
- Tiendas: `tiendas`, `usuario_tiendas`

**Triggers clave** (funciones `SECURITY DEFINER`):
- **Pedido web:** descuenta el stock y lo registra en `movimientos`; rechaza duplicados.
- **Rechazo de pedido:** devuelve el stock.
- **Movimientos del panel:** suman o restan stock.
- **Precio:** guarda el cambio en `historial_precios`.
- **Reingreso:** cuando un producto agotado vuelve a tener stock, guarda la fecha (`reingreso_at`).
- **Cotizaciones:** ignoran duplicadas y limitan el spam.
- **Bitácora:** completa el usuario como "Nombre — Rol".
- **Usuario nuevo:** se le crea su perfil.
- **Códigos de barras:** un mismo código no puede pertenecer a dos productos de la misma tienda.
- **Tienda:** movimientos, códigos, historial, imágenes y detalle de pedido copian la tienda de su producto.

**Multi-tienda:** cada usuario solo ve y modifica los datos de su tienda actual (políticas RLS restrictivas). Lo que se crea queda en esa tienda automáticamente.

**Web promocional (sin sesión):** crea pedidos solo con la función `crear_pedido_web` (precios tomados de la base) y cotizaciones nuevas. Puede ver productos publicados y categorías, solo de tiendas con página web (Flore Verde). Los clientes **no** crean cuenta.

**Webhook:** Database → Webhooks → `aviso_cotizacion` (INSERT en `cotizaciones`) → `POST https://TU-DOMINIO/api/cotizaciones/aviso` con el encabezado `x-aviso-secreto`.

**Auth:** el registro público ("Allow new users to sign up") está **desactivado**; los usuarios se crean desde la pantalla Usuarios.

---

## Despliegue (Vercel)

1. Importar el repositorio con **Root Directory = `app`**.
2. Agregar las 6 variables de entorno; marcar como **Secret/Sensitive** `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS` y `AVISO_SECRETO`.
3. En Supabase → Authentication → URL Configuration: **Site URL** con el dominio y `https://TU-DOMINIO/restablecer` en **Redirect URLs**.
4. Crear el webhook de cotizaciones (ver arriba).
5. Cada merge a `main` se publica automáticamente.

**Seguridad incluida:** cabeceras de seguridad (`next.config.ts`), `robots.txt` y `X-Robots-Tag` para que el sistema no aparezca en buscadores.

---

## Flujo de trabajo con Git

1. Trabajar en la rama personal (no directo en `main`).
2. Correr `npm run build` sin errores.
3. Commit → Push → Pull Request a `main` → Merge.
4. Actualizar la rama personal desde `main`.

---

## Equipo

- **Adrian** — Sistema de inventario
- **Alejandro** — Página web promocional

Desarrollado para **Flore Verde SRL**.
