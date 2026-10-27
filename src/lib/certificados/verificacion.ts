import { createClient } from "@/lib/supabase/server"

/**
 * Verificación PÚBLICA de un certificado por su código (RPC verificar_certificado,
 * ejecutable por anon). Devuelve solo lo necesario para confirmar la
 * autenticidad: titular, curso, institución, fecha y horas. Sin DNI, contacto,
 * pagos ni notas.
 */

export type Verificacion =
  | { estado: "valido"; codigo: string; estudiante: string; curso: string; institucion: string; fecha_emision: string; horas: number | null }
  | { estado: "no_encontrado" }
  | { estado: "no_disponible" }
  | { estado: "codigo_invalido" }

export const normalizarCodigo = (c: string) => c.trim().toUpperCase()
export const codigoValido = (c: string) => /^[A-Z0-9-]{8,32}$/.test(normalizarCodigo(c))

export async function verificarCertificado(codigo: string): Promise<Verificacion> {
  if (!codigoValido(codigo)) return { estado: "codigo_invalido" }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("verificar_certificado", { p_codigo: normalizarCodigo(codigo) })
  if (error) {
    if (error.code !== "PGRST202") console.error("[verificar]", error.code, error.message)
    return { estado: "no_disponible" }
  }
  const fila = (Array.isArray(data) ? data[0] : data) as
    | { codigo: string; estudiante: string; curso: string; institucion: string; fecha_emision: string; horas: number | null }
    | undefined
  if (!fila) return { estado: "no_encontrado" }
  return { estado: "valido", ...fila }
}
