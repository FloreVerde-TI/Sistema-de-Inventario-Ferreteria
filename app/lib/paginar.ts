// Supabase devuelve como máximo 1000 filas por consulta.
// traerTodo pide de 1000 en 1000 hasta tener todo, y responde igual que Supabase: { data, error }.
const LOTE = 1000;

type Respuesta = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => Respuesta
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await consulta(desde, desde + LOTE - 1);
    if (error) return { data: null, error };
    const filas = (data ?? []) as T[];
    todo.push(...filas);
    if (filas.length < LOTE) break;
  }
  return { data: todo, error: null };
}
