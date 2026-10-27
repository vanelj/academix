import { z } from "zod"

/**
 * Plan de cuotas de un curso (public.plan_cuotas, V5):
 *   id, curso_id, institucion_id, numero (> 0, único por curso), concepto
 *   (default 'Mensualidad'), importe numeric(12,2) >= 0, dias_desde_inicio
 *   (>= 0; NULL permitido por la BD), descripcion_vencimiento.
 *
 * Al confirmar una matrícula, V5 copia cada fila a public.cuotas con
 * vencimiento = fecha_inicio del grupo + dias_desde_inicio. Por eso aquí los
 * días son OBLIGATORIOS (crear_solicitud_inscripcion rechaza planes con días
 * NULL) y el importe debe ser mayor que 0. Cambiar el plan NO modifica las
 * cuotas de matrículas ya confirmadas: quedan congeladas.
 */

export const CONCEPTO_MAX = 100
export const DESCRIPCION_VENCIMIENTO_MAX = 200
export const DIAS_MAX = 3650

const IMPORTE_MAX = 9_999_999_999.99

/** Un campo vacío es "no indicado" (z.coerce lo convertiría en 0). */
const entero = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema)

export const cuotaPlanSchema = z.object({
  numero: entero(z.coerce.number({ error: "Introduce el número de cuota." }).int("Debe ser un número entero.").min(1, "Debe ser 1 o mayor.").max(999, "Máximo 999.")),
  concepto: z.string().trim().min(1, "Introduce el concepto.").max(CONCEPTO_MAX, `Máximo ${CONCEPTO_MAX} caracteres.`),
  importe: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Introduce un importe válido, por ejemplo 150 o 150.50.")
    .refine((v) => Number(v) > 0, "El importe debe ser mayor que 0.")
    .refine((v) => Number(v) <= IMPORTE_MAX, "Importe demasiado alto."),
  dias_desde_inicio: entero(
    z.coerce
      .number({ error: "Introduce los días desde el inicio." })
      .int("Debe ser un número entero de días.")
      .min(0, "No puede ser negativo.")
      .max(DIAS_MAX, `Máximo ${DIAS_MAX} días.`)
  ),
  descripcion_vencimiento: z.string().trim().max(DESCRIPCION_VENCIMIENTO_MAX, `Máximo ${DESCRIPCION_VENCIMIENTO_MAX} caracteres.`),
})

export type CuotaPlanValues = z.input<typeof cuotaPlanSchema>

export function cuotaPlanParaGuardar(v: z.output<typeof cuotaPlanSchema>) {
  return {
    numero: v.numero,
    concepto: v.concepto.replace(/\s+/g, " "),
    importe: Number(v.importe),
    dias_desde_inicio: v.dias_desde_inicio,
    descripcion_vencimiento: v.descripcion_vencimiento === "" ? null : v.descripcion_vencimiento,
  }
}

/** Texto legible del vencimiento relativo. */
export function textoVencimiento(dias: number | null): string {
  if (dias === null) return "Sin fecha definida"
  if (dias === 0) return "El día de inicio del grupo"
  return `${dias} ${dias === 1 ? "día" : "días"} después del inicio`
}
