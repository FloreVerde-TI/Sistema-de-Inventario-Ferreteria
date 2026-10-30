# Scripts de la base de datos (Supabase)

Copia de respaldo de los scripts SQL del inventario, **en el orden en que se corrieron**
en Supabase → SQL Editor. No se ejecutan solos: es solo historial y respaldo.

- Los que dicen `SOLO_LECTURA` no cambian nada (son consultas de revisión).
- Los scripts de la página web (de Alejandro) se numeran 2.1, 2.2, … y viven en su repo.
- Aquí **nunca** se guardan claves (service role, SMTP, secreto del webhook).

| # | Script | Qué hace |
|---|---|---|
| 01 | roles_permisos | Roles, permisos, perfiles, bitácora y configuración |
| 02 | ajuste_categorias_jefe | Ajuste de categorías y permiso del Jefe |
| 03 | proveedores | Tabla de proveedores |
| 04 | limpieza | Borra columnas duplicadas y la tabla "usuarios" vacía |
| 05 | observaciones | Observaciones en movimientos |
| 06 | seguridad | Políticas reales por permiso (quita las abiertas) |
| 07 | codigo_pedido | Código corto de pedido (#0413332D) |
| 08 | storage | Imágenes de productos (Storage) |
| 09 | codigos_barras | Varios códigos de barras por producto |
| 10 / 10b | revisiones | Revisión de seguridad y del pedido web (solo lectura) |
| 11 | tiempo_real_pedidos | Pedidos en tiempo real |
| 12 | cotizaciones_documentos_precios | Cotizaciones, fotos de comprobantes, precios en masa |
| 13 | reabrir_cotizacion_y_catalogos | Reabrir cotizaciones y catálogos |
| 14 | evitar_cotizaciones_duplicadas | Evita cotizaciones repetidas |
| 15 | limite_cotizaciones | Máximo 3 cotizaciones cada 5 minutos |
| 16 | seguridad_pedidos_web | Protección de pedidos de la web |
| 17 | historial_precios | Historial de cambios de precio |
| 18 / 18a | multi_tienda_ferrefuerte | Dos ferreterías en el mismo sistema (18a: esquema, solo lectura) |
| 19 | datos_prueba_ferrefuerte | Datos de prueba de Ferre Fuerte |
| 20 | arreglo_web_tiendas | La web vuelve a ver productos tras el 18 |
