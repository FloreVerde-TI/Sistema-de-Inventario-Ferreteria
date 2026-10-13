import { createClient } from '@supabase/supabase-js';

// Las variables viven en .env.local (no se sube a Git).
// Deben escribirse así, completas, para que Next.js las incluya en el navegador.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);