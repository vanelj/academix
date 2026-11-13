import { createClient } from "@/lib/supabase/server"

/**
 * ¿La institución autoriza a sus docentes a gestionar los enlaces de clase?
 * null = la opción aún no existe (sin administracion_v5). Lectura con la
 * sesión: «ver mi institucion» solo devuelve la propia.
 */
export async function docentesGestionanEnlaces(institucionId: string): Promise<boolean | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("instituciones").select("docentes_gestionan_enlaces").eq("id", institucionId).maybeSingle()
  if (error) {
    if (error.code !== "42703") console.error("[enlaces] configuración", error.code, error.message)
    return null
  }
  return Boolean((data as { docentes_gestionan_enlaces?: boolean } | null)?.docentes_gestionan_enlaces)
}
