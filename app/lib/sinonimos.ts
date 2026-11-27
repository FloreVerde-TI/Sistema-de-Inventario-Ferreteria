// =====================================================================
// SINÓNIMOS PARA EL BUSCADOR DE PRODUCTOS
// Cada grupo son palabras que en la ferretería significan lo mismo
// (como se habla en Costa Rica). Si alguien busca "cubeta", también
// encuentra los productos que dicen "balde" o "tobo".
// Para agregar más: sumar una palabra a un grupo o crear un grupo nuevo.
// Se escriben en minúscula y sin tildes.
// =====================================================================

const GRUPOS: string[][] = [
  // Plomería y baño
  ['balde', 'cubeta', 'tobo'],
  ['grifo', 'paja', 'llave de agua', 'llave de chorro'],
  ['tubo', 'tuberia', 'cano'],
  ['inodoro', 'servicio sanitario', 'taza sanitaria'],
  ['lavatorio', 'lavamanos'],
  ['ducha', 'regadera'],
  ['tanque', 'tinaco'],
  ['sellador', 'silicon', 'silicona'],

  // Herramientas
  ['desatornillador', 'destornillador'],
  ['llave ajustable', 'perica', 'llave inglesa'],
  ['cinta metrica', 'flexometro'],
  ['taladro', 'barreno'],
  ['broca', 'mecha'],
  ['serrucho', 'sierra'],
  ['machete', 'cutacha'],
  ['pala', 'palin'],
  ['carretillo', 'carretilla'],
  ['escoba', 'escobon'],
  ['alicate', 'pinza', 'tenaza'],

  // Electricidad
  ['bombillo', 'bombilla', 'foco', 'ampolleta'],
  ['breaker', 'disyuntor', 'pastilla'],
  ['tomacorriente', 'enchufe'],
  ['apagador', 'interruptor', 'switch'],
  ['regleta', 'multitoma', 'extension'],
  ['cinta aislante', 'teipe', 'tape', 'cinta electrica'],

  // Fijación y ferretería general
  ['clavo', 'puntilla'],
  ['arandela', 'golilla', 'rondana'],
  ['pegamento', 'goma', 'cola', 'adhesivo'],
  ['cerradura', 'llavin'],
  ['bisagra', 'gozne'],
  ['manija', 'perilla', 'picaporte'],

  // Construcción y pintura
  ['block', 'bloque'],
  ['varilla', 'hierro'],
  ['brocha', 'pincel'],
  ['lija', 'papel de lija'],

  // Seguridad
  ['lentes', 'gafas', 'anteojos'],
  ['mascarilla', 'cubrebocas', 'tapabocas'],
  ['guante', 'guantes'],
];

/** Pasa a minúscula y quita tildes, para comparar sin importar cómo se escribió. */
export function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Formas en que se puede buscar una palabra: ella misma y sus sinónimos.
 * Ej. "cubeta" → ["cubeta", "balde", "tobo"].
 * También sirve a medio escribir ("cube" ya trae los sinónimos de "cubeta").
 */
export function variantes(palabra: string): string[] {
  const p = normalizar(palabra);
  const salida = new Set([p]);
  if (p.length < 3) return [...salida];
  for (const grupo of GRUPOS) {
    const coincide = grupo.some((t) => t === p || (p.length >= 4 && t.startsWith(p)));
    if (coincide) grupo.forEach((t) => salida.add(t));
  }
  return [...salida];
}
