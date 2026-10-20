import { createClient } from "@/lib/supabase/server"
import {
  COLUMNAS_POLITICAS,
  politicasDesdeFila,
  type CampoPolitica,
  type PoliticasValues,
} from "@/lib/validations/politicas"

/**
 * Lectura de las políticas de la institución del administrador (SOLO servidor).
 * El id sale del perfil autenticado y RLS ("admin lee politicas") solo devuelve
 * la fila de la propia institución con rol admin activo.
 */

export type PoliticasInstitucion = {
  valores: PoliticasValues
  actualizadoEn: string
}

type FilaPoliticas = Record<CampoPolitica, string | null> & { actualizado_en: string }

/** null = la institución aún no ha configurado sus políticas. */
export async function obtenerPoliticas(institucionId: string): Promise<PoliticasInstitucion | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("politicas_institucion")
    .select(COLUMNAS_POLITICAS)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<FilaPoliticas, { merge: false }>()

  if (error) {
    console.error("[politicas] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar las políticas de la institución.")
  }
  if (!data) return null
  return { valores: politicasDesdeFila(data), actualizadoEn: data.actualizado_en }
}
