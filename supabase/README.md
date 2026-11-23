# Scripts de la base de datos (Supabase)

Copia de respaldo de los scripts SQL del inventario, **en orden**, para correrlos
en Supabase → SQL Editor. No se ejecutan solos: es solo historial y respaldo.

- Cada uno va dentro de `begin/commit` y trae una verificación al final.
- Los que dicen `SOLO_LECTURA` no cambian nada (son consultas de revisión).
- Aquí **nunca** se guardan claves (service role ni contraseñas).

| # | Script | Qué hace |
|---|---|---|
| 01 | roles_permisos | Roles con nivel y permisos, perfiles y configuración |
| 02 | ajuste_categorias_jefe | Ajuste de categorías y permiso del Jefe |
| 03 | proveedores | Tabla de proveedores |
| 04 | limpieza | Borra columnas duplicadas y la tabla "usuarios" vacía |
| 05 | observaciones | Observaciones en movimientos |
| 06 | seguridad | Políticas reales por permiso en productos y movimientos (quita las abiertas) |
| 07 | storage | Imágenes de productos (Storage) |
| 08 | codigos_barras | Varios códigos de barras por producto |
| 09 | revision_seguridad | Revisión de seguridad (solo lectura) |
| 10 | catalogos | Deshabilitar o borrar categorías |
| 11 | marca_del_producto | Marca opcional del producto |
