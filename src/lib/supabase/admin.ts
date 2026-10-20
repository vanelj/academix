import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Cliente ADMINISTRATIVO de Supabase (SOLO servidor).
 *
 * Usa la clave secreta del proyecto, que omite RLS. Por eso:
 * - Se lee de SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY, nombre heredado):
 *   variables SIN prefijo NEXT_PUBLIC_, que Next.js nunca envía al navegador.
 * - Solo lo importan acciones y lecturas de servidor del módulo Docentes, y
 *   SIEMPRE después de verificar con la sesión del usuario que es administrador
 *   activo de la institución (institucionDelAdmin).
 * - Se limita a lo que la clave pública no puede hacer: crear o eliminar cuentas
 *   de Auth, enviar invitaciones, leer el correo de una cuenta y crear el perfil
 *   inicial (public.perfiles no tiene política INSERT en V5).
 *
 * Si la clave no está configurada devuelve null y la interfaz lo explica.
 */
export function clienteAdministrativo(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("El cliente administrativo de Supabase solo puede usarse en el servidor.")
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) return null
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function cuentasConfiguradas(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)
}
