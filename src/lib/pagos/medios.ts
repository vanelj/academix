import { createClient } from "@/lib/supabase/server"
import type { TipoMedio } from "@/lib/validations/medio-cobro"

/**
 * Lectura de los medios de cobro (SOLO servidor). RLS decide qué filas ve cada
 * sesión: el administrador, las de su institución; el estudiante, solo las
 * ACTIVAS de una institución con la que tiene una obligación abierta.
 *
 * Mientras no se aplique docs/migraciones/medios_cobro_v5.sql la tabla no
 * existe: se devuelve { disponible: false } y la interfaz lo explica (el
 * estudiante ve entonces el texto de pagos de las políticas de la institución).
 */

export type MedioCobro = {
  id: string
  tipo: TipoMedio
  titular: string
  celular: string | null
  banco: string | null
  numero_cuenta: string | null
  cci: string | null
  instrucciones: string | null
  activo: boolean
  orden: number
  actualizado_en: string
}

export type LecturaMedios = { disponible: true; medios: MedioCobro[] } | { disponible: false }

const COLUMNAS = "id, tipo, titular, celular, banco, numero_cuenta, cci, instrucciones, activo, orden, actualizado_en"

/** PostgREST responde PGRST205 (o 42P01) si la tabla aún no existe. */
export const tablaInexistente = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01"

export async function obtenerMediosCobro(institucionId: string, soloActivos = false): Promise<LecturaMedios> {
  const supabase = await createClient()
  let consulta = supabase.from("medios_cobro_institucion").select(COLUMNAS).eq("institucion_id", institucionId)
  if (soloActivos) consulta = consulta.eq("activo", true)
  const { data, error } = await consulta
    .order("orden")
    .order("creado_en")
    .overrideTypes<MedioCobro[], { merge: false }>()
  if (error) {
    if (tablaInexistente(error)) return { disponible: false }
    console.error("[medios] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar los medios de cobro.")
  }
  return { disponible: true, medios: data ?? [] }
}
