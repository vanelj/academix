import { z } from "zod"

/**
 * Evaluaciones (public.evaluaciones, V4/V5): nombre (no vacío), descripcion,
 * peso numeric(5,2) entre 0 (excl.) y 100 (porcentaje), fecha (date, opcional).
 * La suma de pesos por grupo ≤ 100 la controla la BD con la migración
 * evaluaciones_admin_v5; aquí se valida también para avisar antes.
 */

export const EVALUACION_NOMBRE_MAX = 120
export const EVALUACION_DESCRIPCION_MAX = 500

export const evaluacionSchema = z.object({
  nombre: z.string().trim().min(1, "Introduce el nombre de la evaluación.").max(EVALUACION_NOMBRE_MAX, `Máximo ${EVALUACION_NOMBRE_MAX} caracteres.`),
  descripcion: z.string().trim().max(EVALUACION_DESCRIPCION_MAX, `Máximo ${EVALUACION_DESCRIPCION_MAX} caracteres.`),
  peso: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Introduce un porcentaje, por ejemplo 25 o 12.5.")
    .refine((v) => Number(v) > 0 && Number(v) <= 100, "El peso debe ser mayor que 0 y como máximo 100."),
  fecha: z.union([z.literal(""), z.iso.date("Fecha no válida.")]),
})

export type EvaluacionValues = z.input<typeof evaluacionSchema>

export function evaluacionParaGuardar(v: z.output<typeof evaluacionSchema>) {
  return {
    nombre: v.nombre.replace(/\s+/g, " "),
    descripcion: v.descripcion === "" ? null : v.descripcion,
    peso: Number(v.peso),
    fecha: v.fecha === "" ? null : v.fecha,
  }
}

export const motivoReaperturaSchema = z.string().trim().min(10, "Indica el motivo (mínimo 10 caracteres).").max(500, "Máximo 500 caracteres.")
