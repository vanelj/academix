/**
 * Reglas puras de «Duplicar curso». Se descartan identificadores, fechas de
 * auditoría, estado y portada; nada de historial pasa a la copia.
 */
import { CURSO_NOMBRE_MAX } from "@/lib/validations/curso"

const DESCARTAR = new Set(["id", "curso_id", "institucion_id", "estado", "portada_url", "created_at", "updated_at", "creado_en", "actualizado_en", "publicado_en", "archivado_en", "eliminado_en"])

export function sinCamposDeHistorial(fila: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fila).filter(([k]) => !DESCARTAR.has(k)))
}

export function nombreCopiaCurso(nombre: string): string {
  const base = nombre.replace(/\s+/g, " ").trim()
  return `${base} (copia)`.length <= CURSO_NOMBRE_MAX ? `${base} (copia)` : `${base.slice(0, CURSO_NOMBRE_MAX - 8).trimEnd()} (copia)`
}
