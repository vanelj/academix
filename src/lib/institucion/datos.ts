import { createClient } from "@/lib/supabase/server"

/**
 * Lectura de la institución del administrador (SOLO servidor).
 * El id sale del perfil autenticado (contexto del servidor) y RLS
 * ("ver mi institucion") solo devuelve la institución propia.
 */

export type Institucion = {
  id: string
  nombre: string
  ruc: string | null
  correo: string | null
  telefono: string | null
  direccion: string | null
  logo_url: string | null
  activo: boolean
  created_at: string
}

export const COLUMNAS_INSTITUCION =
  "id, nombre, ruc, correo, telefono, direccion, logo_url, activo, created_at"

export async function obtenerInstitucion(institucionId: string): Promise<Institucion | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("instituciones")
    .select(COLUMNAS_INSTITUCION)
    .eq("id", institucionId)
    .maybeSingle()
    .overrideTypes<Institucion, { merge: false }>()

  if (error) {
    console.error("[institucion] lectura", error.code, error.message)
    throw new Error("No se pudo cargar la información de la institución.")
  }
  return data
}
