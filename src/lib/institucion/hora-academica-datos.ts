import { createClient } from "@/lib/supabase/server"

/**
 * Equivalencia de la HORA ACADÉMICA de la institución (minutos), columna
 * instituciones.minutos_hora_academica (revision_funcional_v5). Academix no
 * asume ninguna equivalencia: sin configurarla solo se muestran horas reloj.
 *   - null           → la institución aún no la definió.
 *   - "sin_migracion"→ la columna no existe todavía.
 */
export async function leerMinutosHoraAcademica(institucionId: string): Promise<number | null | "sin_migracion"> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("instituciones").select("minutos_hora_academica").eq("id", institucionId).maybeSingle()
  if (error) {
    if (error.code === "42703") return "sin_migracion"
    console.error("[institucion] hora académica", error.code, error.message)
    return null
  }
  const v = (data as { minutos_hora_academica?: number | null } | null)?.minutos_hora_academica
  return typeof v === "number" ? v : null
}
